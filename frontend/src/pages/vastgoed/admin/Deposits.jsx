import { useState, useEffect, useCallback } from 'react';
import { Plus, X, Check, Loader2, ShieldCheck, FileText, Trash2, ChevronRight } from 'lucide-react';
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
    <div className="fixed inset-0 z-50 bg-white/30 backdrop-blur-md flex items-center justify-center p-4 modal-sheet-auto" data-testid="deposit-modal">
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
    <div className="fixed inset-0 z-50 bg-white/30 backdrop-blur-md flex items-center justify-center p-4 modal-sheet-auto" data-testid="refund-modal">
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
  const [detail, setDetail] = useState(null);
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

  // Detail-pagina met terug-knop, analoog aan PlanDetail in Betalingsregelingen.
  if (detail) {
    const isHeld = detail.status === 'held';
    return (
      <div className="space-y-4 pb-24 sm:pb-6" data-testid={`deposit-detail-page-${detail.id}`}>
        {/* TERUG-PIL */}
        <div className="flex items-center gap-2">
          <button onClick={() => { setDetail(null); load(); }} data-testid="deposit-detail-back"
            className="flex items-center gap-1.5 text-slate-700 font-bold bg-white hover:bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm">
            <ChevronRight className="w-4 h-4 rotate-180" /> Terug
          </button>
        </div>

        {/* HOOFDCARD */}
        <div className="bg-white rounded-2xl shadow-sm p-5 border border-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-black text-slate-900 truncate">{detail.tenant_name || 'Borg'}</h1>
              {detail.apartment_number && <p className="text-xs text-slate-500">Appt. {detail.apartment_number}</p>}
              {detail.note && <p className="text-sm text-slate-600 mt-2">{detail.note}</p>}
              <div className="flex items-center gap-2 flex-wrap mt-3">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                  isHeld ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                }`}>{isHeld ? 'In bewaring' : 'Gerestitueerd'}</span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">Borg</p>
              <p className="text-2xl font-black text-slate-900">{fmtMoney(detail.amount, detail.currency)}</p>
              {!isHeld && detail.refund_amount !== undefined && detail.refund_amount !== null && (
                <p className="text-[11px] text-slate-500">terug: {fmtMoney(detail.refund_amount, detail.currency)}</p>
              )}
            </div>
          </div>
        </div>

        {/* SUB-CARD: DETAILS */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Borggegevens</h2>
          </div>
          <div className="p-4 space-y-1.5 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">Huurder</span>
              <span className="text-slate-900 font-semibold text-right">{detail.tenant_name || '—'}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">Appartement</span>
              <span className="text-slate-900 font-semibold text-right">{detail.apartment_number || '—'}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">Valuta</span>
              <span className="text-slate-900 font-semibold text-right">{detail.currency}</span>
            </div>
            {!isHeld && detail.refund_amount !== undefined && detail.refund_amount !== null && (
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Terugbetaald</span>
                <span className="text-slate-900 font-semibold text-right">{fmtMoney(detail.refund_amount, detail.currency)}</span>
              </div>
            )}
          </div>
        </div>

        {/* SUB-CARD: ACTIES */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Acties</h2>
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {isHeld ? (
              <button onClick={() => setRefunding(detail)} data-testid={`dep-refund-${detail.id}`}
                className="inline-flex items-center justify-center gap-2 px-3 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl text-xs sm:text-sm">
                <Check className="w-4 h-4" /> Restitueer
              </button>
            ) : (
              <a href={`${apiBase}/deposits/${detail.id}/refund-pdf`} target="_blank" rel="noreferrer"
                data-testid={`dep-pdf-${detail.id}`}
                className="inline-flex items-center justify-center gap-2 px-3 py-2.5 bg-white border-2 border-slate-200 hover:border-slate-400 text-slate-700 font-bold rounded-xl text-xs sm:text-sm">
                <FileText className="w-4 h-4" /> PDF bewijs
              </a>
            )}
            <button onClick={async () => { await del(detail.id); setDetail(null); }}
              data-testid={`dep-delete-${detail.id}`}
              className="inline-flex items-center justify-center gap-2 px-3 py-2.5 bg-white border-2 border-red-300 hover:bg-red-500 hover:text-white text-red-600 font-bold rounded-xl text-xs sm:text-sm transition">
              <Trash2 className="w-4 h-4" /> Verwijder
            </button>
          </div>
        </div>

        {refunding && <RefundForm deposit={refunding}
          onCancel={() => setRefunding(null)}
          onSaved={() => { setRefunding(null); setDetail(null); load(); }} />}
      </div>
    );
  }

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
      <div>
        {items.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center" data-testid="deposits-empty">
            <ShieldCheck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-semibold">Geen borgen.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((d) => {
              const isHeld = d.status === 'held';
              const iconTint = isHeld ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700';
              const statusCls = isHeld ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700';
              const statusLabel = isHeld ? 'In bewaring' : 'Gerestitueerd';
              return (
                <button key={d.id} data-testid={`dep-row-${d.id}`}
                  onClick={() => setDetail(d)}
                  type="button"
                  className="w-full text-left bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex items-center gap-3 hover:bg-slate-50 active:bg-slate-100 transition">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${iconTint}`}>
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-black text-slate-900 truncate">{d.tenant_name}</p>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${statusCls}`}>
                        {statusLabel}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      {d.apartment_number ? `Appt. ${d.apartment_number}` : 'Geen appartement'}
                      {!isHeld && d.refund_amount !== undefined && d.refund_amount !== null && (
                        <span> · terugbetaald: {fmtMoney(d.refund_amount, d.currency)}</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-black text-slate-900">{fmtMoney(d.amount, d.currency)}</p>
                    <p className="text-[10px] text-slate-400">borg</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>
      {creating && <DepositForm tenants={tenants}
        onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
      {refunding && <RefundForm deposit={refunding}
        onCancel={() => setRefunding(null)} onSaved={() => { setRefunding(null); load(); }} />}
    </div>
  );
}
