import { useState, useEffect, useCallback } from 'react';
import { Plus, X, Check, Loader2, ShieldCheck, FileText, Trash2 } from 'lucide-react';
import { api, formatError, fmtMoney } from '../../../lib/api';

function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function DepositForm({ tenants, onCancel, onSaved }) {
  const [data, setData] = useState({ tenant_id: '', amount: 0, currency: 'SRD', note: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setLoading(true); setError('');
    try {
      const { data: r } = await api.post('/deposits', { ...data, amount: parseFloat(data.amount) || 0 });
      onSaved(r);
    } catch (e) { setError(formatError(e)); }
    finally { setLoading(false); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4" data-testid="deposit-modal">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-8 animate-slide-up">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xl font-black text-slate-900">Nieuwe borg</h3>
          <button onClick={onCancel} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        {error && <div className="mb-4 p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Huurder *</label>
            <select value={data.tenant_id} onChange={(e) => setData({ ...data, tenant_id: e.target.value })}
              data-testid="dep-tenant" required
              className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none bg-white">
              <option value="">— Kies huurder —</option>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Bedrag *</label>
              <input type="number" step="0.01" value={data.amount} onChange={(e) => setData({ ...data, amount: e.target.value })}
                data-testid="dep-amount" required
                className="w-full mt-1 h-12 px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Valuta</label>
              <select value={data.currency} onChange={(e) => setData({ ...data, currency: e.target.value })} data-testid="dep-currency"
                className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none bg-white">
                <option value="SRD">SRD</option><option value="USD">USD</option><option value="EUR">EUR</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Notitie</label>
            <input value={data.note} onChange={(e) => setData({ ...data, note: e.target.value })} data-testid="dep-note"
              className="w-full mt-1 h-12 px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onCancel} className="flex-1 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">Annuleren</button>
          <button onClick={save} disabled={loading || !data.tenant_id || !data.amount} data-testid="dep-save"
            className="flex-1 h-12 rounded-xl bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Registreer
          </button>
        </div>
      </div>
    </div>
  );
}

function RefundForm({ deposit, onCancel, onSaved }) {
  const [deduction, setDeduction] = useState(0);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const refund = Math.max(deposit.amount - (parseFloat(deduction) || 0), 0);
  const submit = async () => {
    setLoading(true); setError('');
    try {
      const { data } = await api.post(`/deposits/${deposit.id}/refund`, {
        deduction: parseFloat(deduction) || 0, refund_note: note,
      });
      onSaved(data);
    } catch (e) { setError(formatError(e)); }
    finally { setLoading(false); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4" data-testid="refund-modal">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-8 animate-slide-up">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xl font-black text-slate-900">Borg restitueren</h3>
          <button onClick={onCancel} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-sm text-slate-500 mb-4">{deposit.tenant_name} — borg {fmtMoney(deposit.amount, deposit.currency)}</p>
        {error && <div className="mb-4 p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Aftrek (schade etc.)</label>
            <input type="number" step="0.01" value={deduction} onChange={(e) => setDeduction(e.target.value)} data-testid="refund-deduction"
              className="w-full mt-1 h-12 px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Toelichting</label>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} data-testid="refund-note"
              className="w-full mt-1 px-4 py-2 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none resize-none" />
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-700">Terugbetaling</span>
            <span className="text-2xl font-black text-slate-900">{fmtMoney(refund, deposit.currency)}</span>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onCancel} className="flex-1 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">Annuleren</button>
          <button onClick={submit} disabled={loading} data-testid="refund-submit"
            className="flex-1 h-12 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Restitueer
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Deposits() {
  const [items, setItems] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [creating, setCreating] = useState(false);
  const [refunding, setRefunding] = useState(null);
  const load = useCallback(async () => {
    const [d, t] = await Promise.all([api.get('/deposits'), api.get('/tenants')]);
    setItems(d.data); setTenants(t.data);
  }, []);
  useEffect(() => { load(); }, [load]);
  const del = async (id) => {
    if (!window.confirm('Borg verwijderen?')) return;
    await api.delete(`/deposits/${id}`); load();
  };
  const apiBase = `${process.env.REACT_APP_BACKEND_URL}/api`;

  return (
    <div>
      <PageHeader title="Borg / Deposits" subtitle={`${items.filter((d) => d.status === 'held').length} actief, ${items.filter((d) => d.status === 'refunded').length} gerestitueerd`}
        action={
          <button onClick={() => setCreating(true)} data-testid="dep-new-btn"
            className="inline-flex items-center gap-2 px-5 py-3 bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold rounded-xl shadow-[0_10px_25px_-5px_rgba(255,92,0,0.5)]">
            <Plus className="w-4 h-4" /> Nieuwe borg
          </button>
        }
      />
      <div className="bg-white rounded-2xl border border-orange-100 overflow-hidden">
        {items.length === 0 ? (
          <div className="p-10 text-center"><ShieldCheck className="w-10 h-10 text-orange-300 mx-auto mb-3" />
            <p className="text-slate-500 font-semibold">Geen borgen.</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-orange-50/50 text-left">
              <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                <th className="px-5 py-3">Huurder</th>
                <th className="px-5 py-3 hidden md:table-cell">Appartement</th>
                <th className="px-5 py-3 text-right">Bedrag</th>
                <th className="px-5 py-3 hidden md:table-cell text-right">Terugbetaald</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Acties</th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id} data-testid={`dep-row-${d.id}`} className="border-t border-orange-50 hover:bg-orange-50/30">
                  <td className="px-5 py-3 font-bold text-slate-900">{d.tenant_name}</td>
                  <td className="px-5 py-3 hidden md:table-cell text-slate-600">{d.apartment_number ? `Appt. ${d.apartment_number}` : '—'}</td>
                  <td className="px-5 py-3 text-right font-black text-slate-900">{fmtMoney(d.amount, d.currency)}</td>
                  <td className="px-5 py-3 hidden md:table-cell text-right text-slate-600">{d.status === 'refunded' ? fmtMoney(d.refund_amount, d.currency) : '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${d.status === 'held' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {d.status === 'held' ? 'In bewaring' : 'Gerestitueerd'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right space-x-1">
                    {d.status === 'held' ? (
                      <button onClick={() => setRefunding(d)} data-testid={`dep-refund-${d.id}`}
                        className="inline-flex items-center gap-1 px-3 h-8 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold">
                        Restitueer
                      </button>
                    ) : (
                      <a href={`${apiBase}/deposits/${d.id}/refund-pdf`} target="_blank" rel="noreferrer"
                        data-testid={`dep-pdf-${d.id}`}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600">
                        <FileText className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button onClick={() => del(d.id)} data-testid={`dep-delete-${d.id}`}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {creating && <DepositForm tenants={tenants}
        onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
      {refunding && <RefundForm deposit={refunding}
        onCancel={() => setRefunding(null)} onSaved={() => { setRefunding(null); load(); }} />}
    </div>
  );
}
