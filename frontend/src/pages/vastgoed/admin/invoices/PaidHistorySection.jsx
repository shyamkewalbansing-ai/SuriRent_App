import { useState, useMemo } from 'react';
import { FileText, ChevronDown, ChevronRight } from 'lucide-react';
import { fmtMoney, MONTHS_NL } from '../../../../lib/api';
import { fmtAmountWhole } from './helpers';

// =====================================================================
// PaidHistorySection — herbruikbaar overzicht van reeds betaalde maanden
// voor 1 huurder. Toont datum, ontvangstnummer en methode zodra beschikbaar.
// Sorteert nieuwste-eerst, groepeert per jaar en biedt "Toon meer" wanneer
// er meer dan 12 items zijn zodat oude data niet direct de kaart vult.
// =====================================================================
const INITIAL_LIMIT = 12;

export default function PaidHistorySection({ paidInvoices, currency, testidPrefix = 'paid', variant = 'card' }) {
  const [expanded, setExpanded] = useState(false);

  // Sorteer nieuwste eerst (één keer) en houd ook een gelimiteerde variant klaar.
  const sortedAll = useMemo(
    () => [...paidInvoices].sort((a, b) =>
      (b.period_year - a.period_year) || (b.period_month - a.period_month)),
    [paidInvoices],
  );
  const shownFlat = useMemo(
    () => (expanded ? sortedAll : sortedAll.slice(0, INITIAL_LIMIT)),
    [sortedAll, expanded],
  );

  // Groepeer de zichtbare items per jaar zodat elk jaar een header krijgt.
  const shownGrouped = useMemo(() => {
    const map = new Map();
    for (const inv of shownFlat) {
      const y = inv.period_year;
      if (!map.has(y)) map.set(y, []);
      map.get(y).push(inv);
    }
    return [...map.entries()];
  }, [shownFlat]);

  // Volledige groepering (voor de "eerste — laatste jaar"-hint in de header).
  const grouped = useMemo(() => {
    const map = new Map();
    for (const inv of sortedAll) {
      const y = inv.period_year;
      if (!map.has(y)) map.set(y, []);
      map.get(y).push(inv);
    }
    return [...map.entries()];
  }, [sortedAll]);

  if (!paidInvoices.length) return null;

  const total = paidInvoices.reduce((s, i) => s + Number(i.amount || 0), 0);
  const shownCount = shownFlat.length;
  const hasMore = paidInvoices.length > INITIAL_LIMIT;

  const rows = (
    <div className="space-y-4">
      {shownGrouped.map(([year, invs]) => {
        const yearTotal = invs.reduce((s, i) => s + Number(i.amount || 0), 0);
        return (
          <div key={year} data-testid={`${testidPrefix}-year-${year}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{year}</p>
              <p className="text-[10px] font-bold text-emerald-700">
                {invs.length} maand{invs.length === 1 ? '' : 'en'} · {fmtMoney(yearTotal, currency)}
              </p>
            </div>
            <div className="space-y-1.5">
              {invs.map((inv) => (
                <PaidInvoiceRow key={inv.id} inv={inv} testid={`${testidPrefix}-row-${inv.id}`} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  if (variant === 'inline') {
    // Compacte variant voor gebruik binnen de expand van een tenant-row.
    return (
      <div className="rounded-2xl p-4 bg-emerald-50" data-testid={`${testidPrefix}-inline`}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-emerald-700">
            Betaalde maanden ({paidInvoices.length}) · {fmtMoney(total, currency)}
          </p>
          <span className="text-[10px] font-bold text-slate-400">
            {shownCount === paidInvoices.length ? 'Alles' : `${shownCount} van ${paidInvoices.length}`}
          </span>
        </div>
        {rows}
        {hasMore && (
          <button type="button" onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            data-testid={`${testidPrefix}-toggle`}
            className="mt-3 w-full h-9 rounded-xl bg-white border border-emerald-200 text-emerald-700 font-bold text-xs inline-flex items-center justify-center gap-1.5 hover:bg-emerald-50">
            {expanded ? <><ChevronDown className="w-3.5 h-3.5 rotate-180" /> Toon minder</> : <><ChevronDown className="w-3.5 h-3.5" /> Toon alle {paidInvoices.length} betaalde maanden</>}
          </button>
        )}
      </div>
    );
  }

  // Standaard card-variant (voor DetailPage).
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden" data-testid={`${testidPrefix}-card`}>
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Betalingsgeschiedenis</h2>
          <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
            {paidInvoices.length} maand{paidInvoices.length === 1 ? '' : 'en'} betaald · totaal {fmtMoney(total, currency)}
          </p>
        </div>
        {grouped.length > 1 && (
          <span className="text-[10px] font-bold text-slate-400">
            {grouped[grouped.length - 1][0]} — {grouped[0][0]}
          </span>
        )}
      </div>
      <div className="p-4">
        {rows}
        {hasMore && (
          <button type="button" onClick={() => setExpanded((v) => !v)}
            data-testid={`${testidPrefix}-toggle`}
            className="mt-4 w-full h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-sm inline-flex items-center justify-center gap-2 hover:bg-emerald-100">
            {expanded
              ? <><ChevronDown className="w-4 h-4 rotate-180" /> Toon minder</>
              : <><ChevronDown className="w-4 h-4" /> Toon alle {paidInvoices.length} betaalde maanden</>}
          </button>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// PaidInvoiceRow — één regel in de betalingsgeschiedenis met alle details.
// =====================================================================
function PaidInvoiceRow({ inv, testid }) {
  const paidDate = inv.paid_at
    ? new Date(inv.paid_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
  return (
    <div className="flex items-center justify-between gap-2 text-sm" data-testid={testid}>
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-emerald-500" />
        <span className="text-slate-700 capitalize truncate font-semibold">
          {MONTHS_NL[inv.period_month - 1]}
        </span>
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 uppercase tracking-wider">
          Betaald
        </span>
        {paidDate && (
          <span className="text-[10px] text-slate-500 hidden sm:inline whitespace-nowrap">
            op {paidDate}
          </span>
        )}
        {inv.paid_method && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 uppercase tracking-wider hidden md:inline">
            {inv.paid_method === 'cash' ? 'Contant' : inv.paid_method === 'bank' ? 'Bank' : inv.paid_method === 'card' ? 'Kaart' : inv.paid_method}
          </span>
        )}
        {inv.receipt_number && (
          <span className="text-[9px] font-mono text-slate-400 hidden lg:inline">
            #{inv.receipt_number}
          </span>
        )}
        <span className="text-[10px] text-slate-400 hidden xl:inline">· {inv.invoice_number}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-slate-700 font-bold whitespace-nowrap">
          {inv.currency} {fmtAmountWhole(inv.amount)}
        </span>
        <a href={`${process.env.REACT_APP_BACKEND_URL}/api/invoices/${inv.id}/pdf`}
          target="_blank" rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          data-testid={`${testid}-pdf`}
          title="Download factuur PDF"
          className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white hover:bg-emerald-100 text-emerald-700 border border-emerald-200 active:scale-95 transition">
          <FileText className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}
