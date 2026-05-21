import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CreditCard, RefreshCw, ExternalLink, Copy, Check, Loader2, AlertCircle,
  ChevronDown,
} from 'lucide-react';
import { api, formatError, fmtMoney } from '../../../lib/api';

const STATUS_STYLES = {
  open: { label: 'Open', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  scanned: { label: 'Gescand', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  unconfirmed: { label: 'Niet bevestigd', bg: 'bg-orange-50', text: 'text-[#FF5C00]', border: 'border-orange-200' },
  paid: { label: 'Betaald', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || { label: status, bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' };
  return (
    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full ${s.bg} ${s.text} ${s.border} border`}>
      {s.label}
    </span>
  );
}

export default function PaymentRequests() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const { data } = await api.get('/payment-requests');
      setItems(data);
    } catch (e) { setErr(formatError(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const refreshOne = async (pr) => {
    setRefreshing(pr.id);
    try {
      const { data } = await api.post(`/payment-requests/${pr.id}/refresh`);
      setItems((arr) => arr.map((x) => (x.id === pr.id ? data : x)));
    } catch (e) { alert(formatError(e)); }
    finally { setRefreshing(null); }
  };

  const copyLink = async (pr) => {
    try {
      await navigator.clipboard.writeText(pr.payment_url);
      setCopiedId(pr.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (e) {
      console.warn('clipboard:', e);
      alert('Kopiëren mislukt — kopieer de link handmatig');
    }
  };

  const filtered = useMemo(() => (
    filter === 'all' ? items : items.filter((p) => p.status === filter)
  ), [items, filter]);

  const stats = useMemo(() => {
    const counters = { open: 0, scanned: 0, unconfirmed: 0, paid: 0 };
    items.forEach((p) => { counters[p.status] = (counters[p.status] || 0) + 1; });
    return counters;
  }, [items]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Online betalingen</h1>
          <p className="text-sm text-slate-500 mt-1">Genereer betaallinks via Mope/Uni5Pay en volg de status van inkomende betalingen.</p>
        </div>
        <button onClick={load} data-testid="pr-refresh-list"
          className="h-10 px-4 rounded-xl border-2 border-orange-100 hover:bg-orange-50 text-slate-700 font-bold text-sm flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Verversen
        </button>
      </div>

      {err && (
        <div className="flex gap-2 items-start text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-4">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {err}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { id: 'all', label: 'Alle', count: items.length },
          { id: 'open', label: 'Open', count: stats.open },
          { id: 'unconfirmed', label: 'Niet bevestigd', count: stats.unconfirmed },
          { id: 'paid', label: 'Betaald', count: stats.paid },
        ].map((s) => (
          <button key={s.id} onClick={() => setFilter(s.id)}
            data-testid={`pr-filter-${s.id}`}
            className={`p-4 rounded-2xl border-2 text-left transition-all ${
              filter === s.id ? 'border-[#FF5C00] bg-orange-50' : 'border-orange-100 bg-white hover:border-orange-200'
            }`}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{s.label}</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{s.count}</p>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-orange-100 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Laden...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-slate-500 text-sm">
            <CreditCard className="w-10 h-10 mx-auto text-slate-300 mb-3" />
            {filter === 'all'
              ? 'Nog geen online betaalverzoeken. Maak er één aan vanuit een factuur.'
              : `Geen verzoeken met status "${filter}".`}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-orange-50 text-left text-[11px] uppercase tracking-widest text-slate-500 font-bold">
              <tr>
                <th className="px-5 py-3">Gateway</th>
                <th className="px-5 py-3">Factuur</th>
                <th className="px-5 py-3">Huurder</th>
                <th className="px-5 py-3">Bedrag</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Aangemaakt</th>
                <th className="px-5 py-3 text-right">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((p) => (
                <tr key={p.id} data-testid={`pr-row-${p.id}`} className="hover:bg-orange-50/50">
                  <td className="px-5 py-3 font-bold text-slate-700 capitalize">{p.provider}</td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-600">{p.invoice_number || '-'}</td>
                  <td className="px-5 py-3">{p.tenant_name || '-'}</td>
                  <td className="px-5 py-3 font-bold">{fmtMoney(p.amount, p.currency)}</td>
                  <td className="px-5 py-3"><StatusBadge status={p.status} /></td>
                  <td className="px-5 py-3 text-xs text-slate-500">{(p.created_at || '').slice(0, 16).replace('T', ' ')}</td>
                  <td className="px-5 py-3 text-right space-x-1">
                    <a href={p.payment_url} target="_blank" rel="noreferrer"
                      data-testid={`pr-open-${p.id}`}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600" title="Open betaalpagina">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button onClick={() => copyLink(p)} data-testid={`pr-copy-${p.id}`}
                      className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${copiedId === p.id ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-50 hover:bg-orange-100 text-[#FF5C00]'}`}
                      title="Kopieer betaallink">
                      {copiedId === p.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    {p.status !== 'paid' && (
                      <button onClick={() => refreshOne(p)} disabled={refreshing === p.id}
                        data-testid={`pr-refresh-${p.id}`}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 disabled:opacity-50" title="Status verversen">
                        {refreshing === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ============== Modal for creating a payment link from an invoice ==============
export function PaymentLinkDialog({ invoice, onClose, onCreated }) {
  const [provider, setProvider] = useState('mope');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const create = async () => {
    setErr(''); setLoading(true);
    try {
      const { data } = await api.post(`/payment-requests/invoice/${invoice.id}`, { provider });
      setResult(data);
      if (onCreated) onCreated(data);
    } catch (e) { setErr(formatError(e)); }
    finally { setLoading(false); }
  };

  const copy = async () => {
    if (!result?.payment_url) return;
    try {
      await navigator.clipboard.writeText(result.payment_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.warn('clipboard:', e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" data-testid="paylink-dialog">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-auto">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#FF8A3D] to-[#C74600] flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 leading-tight">Betaallink genereren</h2>
              <p className="text-[11px] text-slate-500">Factuur {invoice.invoice_number} — {fmtMoney(invoice.amount, invoice.currency)}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center" data-testid="paylink-close">
            <ChevronDown className="w-5 h-5 text-slate-500 rotate-[-45deg]" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {!result ? (
            <>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Gateway</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {[{ id: 'mope', label: 'Mope' }, { id: 'uni5pay', label: 'Uni5Pay' }].map((g) => (
                    <button key={g.id} onClick={() => setProvider(g.id)}
                      data-testid={`paylink-provider-${g.id}`}
                      className={`h-11 rounded-xl border-2 font-bold text-sm transition-all ${
                        provider === g.id ? 'border-[#FF5C00] bg-orange-50 text-[#FF5C00]'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}>
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
              {err && (
                <div className="flex gap-2 items-start text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {err}
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 h-11 rounded-xl border-2 border-slate-200 text-slate-700 font-bold hover:bg-slate-50" data-testid="paylink-cancel">Annuleren</button>
                <button onClick={create} disabled={loading} data-testid="paylink-create"
                  className="flex-1 h-11 rounded-xl bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />} Genereer link
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700 flex gap-2 items-start">
                <Check className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  Betaallink aangemaakt. Status: <b className="capitalize">{result.status}</b>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Betaallink</label>
                <div className="flex gap-2">
                  <input readOnly value={result.payment_url}
                    className="flex-1 h-11 px-3 rounded-xl border-2 border-slate-200 bg-slate-50 font-mono text-xs"
                    data-testid="paylink-url" />
                  <button onClick={copy} data-testid="paylink-copy"
                    className={`h-11 px-3 rounded-xl font-bold text-sm ${copied ? 'bg-emerald-100 text-emerald-700' : 'bg-[#FF5C00] hover:bg-[#E05200] text-white'}`}>
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <a href={result.payment_url} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-[#FF5C00] hover:underline" data-testid="paylink-open">
                  Open betaalpagina <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <p className="text-[11px] text-slate-500">
                Tip: deel deze link via WhatsApp of e-mail. De huurder ziet hem in de Mope app of webbrowser.
                Zodra de betaling binnen is, wordt de factuur automatisch op "betaald" gezet.
              </p>
              <button onClick={onClose} className="w-full h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold" data-testid="paylink-done">Sluiten</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
