import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, X, Check, Loader2, FileText, ExternalLink, Copy, Pencil, Mail } from 'lucide-react';
import { api, formatError, fmtMoney } from '../../../lib/api';
import { EmailDialog, SendDialog } from '../../../components/EmailDialog';
import { useAutoRefresh } from '../../../lib/auto-refresh';

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

function ContractForm({ tenants, apartments, onCancel, onSaved }) {
  const [data, setData] = useState({
    tenant_id: '', apartment_id: '', start_date: new Date().toISOString().split('T')[0],
    end_date: '', payment_day: 1, deposit_amount: 0, terms: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // When tenant changes, auto-suggest apartment if tenant has one
  useEffect(() => {
    if (data.tenant_id && !data.apartment_id) {
      const t = tenants.find((x) => x.id === data.tenant_id);
      if (t?.apartment_id) setData((d) => ({ ...d, apartment_id: t.apartment_id }));
    }
  }, [data.tenant_id, data.apartment_id, tenants]);

  const save = async () => {
    setLoading(true); setError('');
    try {
      const { data: r } = await api.post('/contracts', {
        ...data,
        deposit_amount: parseFloat(data.deposit_amount) || 0,
        payment_day: parseInt(data.payment_day) || 1,
      });
      onSaved(r);
    } catch (e) { setError(formatError(e)); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-white/30 backdrop-blur-md flex items-center justify-center p-4" data-testid="contract-modal">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl p-6 sm:p-8 animate-slide-up max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xl font-black text-slate-900">Nieuw contract</h3>
          <button onClick={onCancel} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        {error && <div className="mb-4 p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Huurder *</label>
            <select value={data.tenant_id} onChange={(e) => setData({ ...data, tenant_id: e.target.value })} data-testid="contract-tenant" required
              className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none bg-white">
              <option value="">— Kies huurder —</option>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Appartement *</label>
            <select value={data.apartment_id} onChange={(e) => setData({ ...data, apartment_id: e.target.value })} data-testid="contract-apt" required
              className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none bg-white">
              <option value="">— Kies appartement —</option>
              {apartments.map((a) => <option key={a.id} value={a.id}>{a.number} ({fmtMoney(a.rent_amount, a.currency)})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Startdatum *</label>
              <input type="date" value={data.start_date} onChange={(e) => setData({ ...data, start_date: e.target.value })}
                data-testid="contract-start" required
                className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Einddatum</label>
              <input type="date" value={data.end_date} onChange={(e) => setData({ ...data, end_date: e.target.value })}
                data-testid="contract-end"
                className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Betaaldag</label>
              <input type="number" min={1} max={28} value={data.payment_day} onChange={(e) => setData({ ...data, payment_day: e.target.value })}
                data-testid="contract-payday"
                className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Borg</label>
              <input type="number" step="0.01" value={data.deposit_amount} onChange={(e) => setData({ ...data, deposit_amount: e.target.value })}
                data-testid="contract-deposit"
                className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Eigen voorwaarden (optioneel)</label>
            <textarea value={data.terms} onChange={(e) => setData({ ...data, terms: e.target.value })} rows={3}
              data-testid="contract-terms" placeholder="Laat leeg voor standaard voorwaarden"
              className="w-full mt-1 px-3 py-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none resize-none" />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onCancel} className="flex-1 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">Annuleren</button>
          <button onClick={save} disabled={loading || !data.tenant_id || !data.apartment_id} data-testid="contract-save"
            className="flex-1 h-12 rounded-xl bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Aanmaken
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Contracts() {
  const [items, setItems] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [apartments, setApartments] = useState([]);
  const [creating, setCreating] = useState(false);
  const [emailing, setEmailing] = useState(null);

  const load = useCallback(async () => {
    const [c, t, a] = await Promise.all([api.get('/contracts'), api.get('/tenants'), api.get('/apartments')]);
    setItems(c.data); setTenants(t.data); setApartments(a.data);
  }, []);
  useEffect(() => { load(); }, [load]);
  // Stille polling (geen aparte loading-state nodig — items worden in place vervangen).
  useAutoRefresh(load, { interval: 15000, enabled: !creating && !emailing });

  const del = async (id) => {
    if (!window.confirm('Contract verwijderen?')) return;
    await api.delete(`/contracts/${id}`); load();
  };

  const apiBase = `${process.env.REACT_APP_BACKEND_URL}/api`;
  const signLink = (token) => `${window.location.origin}/onderteken/${token}`;
  const copyLink = async (token) => {
    try {
      await navigator.clipboard.writeText(signLink(token));
      alert('Link gekopieerd');
    } catch (err) {
      console.error('Clipboard copy failed:', err);
      alert('Kopieren mislukt — kopieer de link handmatig');
    }
  };

  return (
    <div>
      <PageHeader
        title="Contracten"
        subtitle={`${items.length} contracten, ${items.filter((c) => c.signed_at).length} ondertekend`}
        action={
          <button onClick={() => setCreating(true)} data-testid="contract-new-btn"
            className="inline-flex items-center gap-2 px-5 py-3 bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold rounded-xl shadow-[0_10px_25px_-5px_rgba(255,92,0,0.5)]">
            <Plus className="w-4 h-4" /> Nieuw contract
          </button>
        }
      />
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_-2px_rgba(15,23,42,0.06)] overflow-hidden">
        {items.length === 0 ? (
          <div className="p-10 text-center">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-semibold">Geen contracten.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50/70 text-left">
              <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                <th className="px-5 py-3">Nummer</th>
                <th className="px-5 py-3">Huurder</th>
                <th className="px-5 py-3 hidden md:table-cell">Appartement</th>
                <th className="px-5 py-3 hidden md:table-cell">Periode</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Acties</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} data-testid={`contract-row-${c.id}`} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-5 py-3 font-mono text-xs font-bold text-slate-900">{c.contract_number}</td>
                  <td className="px-5 py-3 font-semibold text-slate-900">{c.tenant_name}</td>
                  <td className="px-5 py-3 hidden md:table-cell text-slate-600">Appt. {c.apartment_number || '—'}</td>
                  <td className="px-5 py-3 hidden md:table-cell text-slate-500 text-xs">
                    {c.start_date}{c.end_date ? ` → ${c.end_date}` : ''}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${
                      c.signed_at ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {c.signed_at ? 'Ondertekend' : 'Concept'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right space-x-1">
                    <a href={`${apiBase}/contracts/${c.id}/pdf`} target="_blank" rel="noreferrer"
                      data-testid={`contract-pdf-${c.id}`}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600" title="PDF">
                      <FileText className="w-3.5 h-3.5" />
                    </a>
                    <button onClick={() => setEmailing(c)} data-testid={`contract-email-${c.id}`}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700" title="Verstuur via e-mail">
                      <Mail className="w-3.5 h-3.5" />
                    </button>
                    {!c.signed_at && (
                      <button onClick={() => copyLink(c.sign_token)} data-testid={`contract-link-${c.id}`}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-orange-50 hover:bg-orange-100 text-[#FF5C00]" title="Ondertekenlink kopiëren">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button onClick={() => del(c.id)} data-testid={`contract-delete-${c.id}`}
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
      {creating && <ContractForm tenants={tenants} apartments={apartments}
        onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
      {emailing && (
        <SendDialog
          documentType="contract"
          documentId={emailing.id}
          documentLabel="contract"
          title={`Contract ${emailing.contract_number} verzenden`}
          tenantEmail={tenants.find((t) => t.id === emailing.tenant_id)?.email || ''}
          tenantPhone={tenants.find((t) => t.id === emailing.tenant_id)?.phone || ''}
          tenantName={emailing.tenant_name}
          onClose={() => setEmailing(null)} />
      )}
    </div>
  );
}
