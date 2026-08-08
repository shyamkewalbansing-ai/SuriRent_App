import { useEffect, useState } from 'react';
import { X, Loader2, PiggyBank, Info } from 'lucide-react';
import { api, fmtMoney } from '../../../../lib/api';

// =====================================================================
// CreditSourcesPopover — modal die toont uit welke betaling(en) het krediet
// van deze huurder ontstaan is. Twee bronnen:
//   1. Expliciete "vooruitbetaling" — huurder betaalde bewust vooruit
//   2. "overflow" — een huur-betaling was groter dan de open factuur
//      op dat moment; het overschot bleef als krediet staan
//
// Popover fetcht bij openen, toont loading, en heeft een klik-buiten-sluiten
// gedrag. Ontwerp is portal-vrij (gewone fixed-positioned overlay) zodat het
// werkt vanuit lijsten waarin een tenant-row een `<button>` is.
// =====================================================================
export default function CreditSourcesPopover({ tenantId, tenantName, onClose }) {
  const [sources, setSources] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/tenants/${tenantId}/credit-sources`);
        if (!cancelled) setSources(data.sources || []);
      } catch (e) {
        if (!cancelled) setError(e?.response?.data?.detail || 'Kon bronnen niet ophalen');
      }
    })();
    return () => { cancelled = true; };
  }, [tenantId]);

  const totalByCurrency = (sources || []).reduce((acc, s) => {
    const cur = s.currency || 'SRD';
    acc[cur] = (acc[cur] || 0) + Number(s.credit_remaining || 0);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/25 backdrop-blur-sm flex items-center justify-center p-4 modal-open"
      onClick={onClose} data-testid="credit-sources-popover">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 flex items-center justify-center shrink-0">
              <PiggyBank className="w-5 h-5 text-emerald-600" strokeWidth={2.4} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-black text-slate-900 leading-tight truncate">
                {tenantName ? `Tegoed van ${tenantName}` : 'Beschikbaar tegoed'}
              </h3>
              <p className="text-[11px] text-slate-500 font-semibold">
                {Object.entries(totalByCurrency).map(([cur, v]) => fmtMoney(v, cur)).join(' + ') || '—'}
                {' · ontstaan uit onderstaande betalingen'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center shrink-0" data-testid="credit-sources-close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-auto px-6 py-4 flex-1">
          {sources === null && !error && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
            </div>
          )}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-semibold" data-testid="credit-sources-error">
              {error}
            </div>
          )}
          {sources !== null && !error && sources.length === 0 && (
            <div className="text-center py-8 text-slate-500 font-semibold" data-testid="credit-sources-empty">
              Geen actief tegoed meer.
            </div>
          )}
          {sources !== null && sources.length > 0 && (
            <div className="space-y-3">
              {sources.map((s) => <SourceCard key={s.id} src={s} />)}
              <div className="mt-4 p-3 rounded-xl bg-slate-50 flex items-start gap-2">
                <Info className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Dit tegoed wordt automatisch verrekend bij de eerstvolgende maandfactuur. Je kunt het ook direct verrekenen via de knop <b>Verreken tegoed</b> op de factuur-detail.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Één krediet-bron kaart met datum, methode, ontvangst en de oorzaak
// (vooruitbetaling of overflow van een grotere huur-betaling).
function SourceCard({ src }) {
  const paidDate = src.paid_at
    ? new Date(src.paid_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';
  const isOverflow = src.credit_origin === 'overflow';
  const originLabel = isOverflow
    ? 'Overschot van huur-betaling'
    : (src.category === 'vooruitbetaling' ? 'Expliciete vooruitbetaling' : 'Vooruitbetaling');
  const originCls = isOverflow
    ? 'bg-amber-100 text-amber-700'
    : 'bg-emerald-100 text-emerald-700';
  const methodLabel = ({
    contant: 'Contant', bank: 'Bank', card: 'Kaart',
    mope: 'MoPe', sumup: 'SumUp', uni5pay: 'Uni5Pay',
  })[src.method] || src.method || '—';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4" data-testid={`credit-source-${src.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs font-black text-slate-600 mb-0.5">{src.receipt_number || '—'}</p>
          <p className="text-sm font-bold text-slate-900">Betaald op {paidDate}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${originCls}`}>{originLabel}</span>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-600">{methodLabel}</span>
          </div>
          {src.note && (
            <p className="text-[11px] text-slate-500 italic mt-2 line-clamp-2">&ldquo;{src.note}&rdquo;</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Origineel</p>
          <p className="text-sm font-bold text-slate-700 whitespace-nowrap">
            {fmtMoney(src.amount, src.currency)}
          </p>
          <p className="text-[10px] uppercase tracking-widest text-emerald-600 font-black mt-1.5">Nog beschikbaar</p>
          <p className="text-lg font-black text-emerald-600 whitespace-nowrap">
            {fmtMoney(src.credit_remaining, src.currency)}
          </p>
        </div>
      </div>
    </div>
  );
}
