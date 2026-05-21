import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, X, Check, Loader2, FileText, Wand2, Trash2, Mail, CreditCard } from 'lucide-react';
import { api, formatError, fmtMoney, MONTHS_NL } from '../../../lib/api';
import { EmailDialog, SendDialog } from '../../../components/EmailDialog';
import { PaymentLinkDialog } from './PaymentRequests';

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

function InvoiceForm({ tenants, onCancel, onSaved }) {
  const today = new Date();
  const [data, setData] = useState({
    tenant_id: '',
    period_month: today.getMonth() + 1,
    period_year: today.getFullYear(),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const tenantsWithApt = useMemo(() => tenants.filter((t) => t.apartment_id), [tenants]);
  const save = async () => {
    setLoading(true); setError('');
    try {
      const { data: r } = await api.post('/invoices', {
        ...data,
        period_month: parseInt(data.period_month),
        period_year: parseInt(data.period_year),
      });
      onSaved(r);
    } catch (e) { setError(formatError(e)); }
    finally { setLoading(false); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" data-testid="invoice-modal">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-8 animate-slide-up">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xl font-black text-slate-900">Nieuwe factuur</h3>
          <button onClick={onCancel} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        {error && <div className="mb-4 p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Huurder *</label>
            <select value={data.tenant_id} onChange={(e) => setData({ ...data, tenant_id: e.target.value })}
              data-testid="invoice-tenant" required
              className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none bg-white">
              <option value="">— Kies huurder —</option>
              {tenants.filter((t) => t.apartment_id).map((t) => (
                <option key={t.id} value={t.id}>{t.name} (Appt. {t.apartment_number})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Maand</label>
              <select value={data.period_month} onChange={(e) => setData({ ...data, period_month: e.target.value })}
                data-testid="invoice-month"
                className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none bg-white">
                {MONTHS_NL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Jaar</label>
              <input type="number" value={data.period_year} onChange={(e) => setData({ ...data, period_year: e.target.value })}
                data-testid="invoice-year"
                className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onCancel} className="flex-1 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">Annuleren</button>
          <button onClick={save} disabled={loading || !data.tenant_id} data-testid="invoice-save"
            className="flex-1 h-12 rounded-xl bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Aanmaken
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Invoices() {
  const [items, setItems] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [emailing, setEmailing] = useState(null);
  const [payLink, setPayLink] = useState(null);
  const today = new Date();

  const load = useCallback(async () => {
    const [i, t] = await Promise.all([api.get('/invoices'), api.get('/tenants')]);
    setItems(i.data); setTenants(t.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const del = async (id) => {
    if (!window.confirm('Factuur verwijderen?')) return;
    await api.delete(`/invoices/${id}`); load();
  };

  const generateMonth = async () => {
    if (!window.confirm(`Maandfacturen voor ${MONTHS_NL[today.getMonth()]} ${today.getFullYear()} aanmaken voor alle bezette appartementen?`)) return;
    setGenerating(true);
    try {
      const { data } = await api.post('/invoices/generate-month', {
        period_month: today.getMonth() + 1,
        period_year: today.getFullYear(),
      });
      alert(`${data.created} aangemaakt, ${data.skipped} overgeslagen`);
      load();
    } catch (e) { alert(formatError(e)); }
    finally { setGenerating(false); }
  };

  const apiBase = `${process.env.REACT_APP_BACKEND_URL}/api`;

  return (
    <div>
      <PageHeader
        title="Facturen"
        subtitle={`${items.length} facturen`}
        action={
          <div className="flex gap-2">
            <button onClick={generateMonth} disabled={generating} data-testid="invoice-generate-btn"
              className="inline-flex items-center gap-2 px-5 py-3 bg-white border-2 border-orange-200 hover:border-[#FF5C00] text-[#FF5C00] font-bold rounded-xl">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              Genereer maand
            </button>
            <button onClick={() => setCreating(true)} data-testid="invoice-new-btn"
              className="inline-flex items-center gap-2 px-5 py-3 bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold rounded-xl shadow-[0_10px_25px_-5px_rgba(255,92,0,0.5)]">
              <Plus className="w-4 h-4" /> Nieuwe factuur
            </button>
          </div>
        }
      />
      <div className="bg-white rounded-2xl border border-orange-100 overflow-hidden">
        {items.length === 0 ? (
          <div className="p-10 text-center">
            <FileText className="w-10 h-10 text-orange-300 mx-auto mb-3" />
            <p className="text-slate-500 font-semibold">Geen facturen.</p>
            <p className="text-xs text-slate-400 mt-1">Klik op &quot;Genereer maand&quot; om automatisch facturen aan te maken.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-orange-50/50 text-left">
              <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                <th className="px-5 py-3">Factuur</th>
                <th className="px-5 py-3">Huurder</th>
                <th className="px-5 py-3 hidden md:table-cell">Appartement</th>
                <th className="px-5 py-3">Periode</th>
                <th className="px-5 py-3 text-right">Bedrag</th>
                <th className="px-5 py-3 text-right">Acties</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} data-testid={`invoice-row-${i.id}`} className="border-t border-orange-50 hover:bg-orange-50/30">
                  <td className="px-5 py-3 font-mono text-xs font-bold text-slate-900">{i.invoice_number}</td>
                  <td className="px-5 py-3 font-semibold text-slate-900">{i.tenant_name}</td>
                  <td className="px-5 py-3 hidden md:table-cell text-slate-600">Appt. {i.apartment_number || '—'}</td>
                  <td className="px-5 py-3 text-slate-500 text-xs capitalize">{MONTHS_NL[i.period_month - 1]} {i.period_year}</td>
                  <td className="px-5 py-3 text-right font-black text-slate-900">{fmtMoney(i.amount, i.currency)}</td>
                  <td className="px-5 py-3 text-right space-x-1">
                    <a href={`${apiBase}/invoices/${i.id}/pdf`} target="_blank" rel="noreferrer"
                      data-testid={`invoice-pdf-${i.id}`}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600" title="PDF">
                      <FileText className="w-3.5 h-3.5" />
                    </a>
                    <button onClick={() => setEmailing(i)} data-testid={`invoice-email-${i.id}`}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700" title="Verstuur via e-mail">
                      <Mail className="w-3.5 h-3.5" />
                    </button>
                    {i.status !== 'paid' && (
                      <button onClick={() => setPayLink(i)} data-testid={`invoice-paylink-${i.id}`}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700" title="Genereer betaallink (Mope/Uni5Pay)">
                        <CreditCard className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button onClick={() => del(i.id)} data-testid={`invoice-delete-${i.id}`}
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
      {creating && <InvoiceForm tenants={tenants}
        onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
      {emailing && (
        <SendDialog
          documentType="invoice"
          documentId={emailing.id}
          documentLabel="factuur"
          title={`Factuur ${emailing.invoice_number} verzenden`}
          tenantEmail={tenants.find((t) => t.id === emailing.tenant_id)?.email || ''}
          tenantPhone={tenants.find((t) => t.id === emailing.tenant_id)?.phone || ''}
          tenantName={emailing.tenant_name}
          onClose={() => setEmailing(null)} />
      )}
      {payLink && (
        <PaymentLinkDialog
          invoice={payLink}
          onClose={() => setPayLink(null)}
          onCreated={() => load()} />
      )}
    </div>
  );
}
