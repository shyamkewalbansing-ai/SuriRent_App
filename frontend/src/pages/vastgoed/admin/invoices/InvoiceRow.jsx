import { Trash2, Calendar, Check } from 'lucide-react';
import { fmtMoney, MONTHS_NL } from '../../../../lib/api';
import { fmtAmountWhole } from './helpers';

// =====================================================================
// Status pill — kleine badge die de open-status van een huurder samenvat.
// Wordt hergebruikt in TenantRow (desktop) + MobileTenantCard.
// =====================================================================
export function StatusPill({ severity, overdueCount, currentCount, upcomingCount }) {
  if (severity === 'ok') {
    if (currentCount > 0) {
      return (
        <span className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          {currentCount === 1 ? 'Lopende maand open' : `${currentCount} lopende maanden`}
        </span>
      );
    }
    if (upcomingCount > 0) {
      return (
        <span className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-600">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          {upcomingCount === 1 ? '1 komende factuur' : `${upcomingCount} komende facturen`}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Op tijd
      </span>
    );
  }
  const t = severity === 'critical'
    ? { bg: 'bg-red-50', fg: 'text-red-700', dot: 'bg-red-500', label: `${overdueCount} maanden achter` }
    : { bg: 'bg-orange-50', fg: 'text-orange-700', dot: 'bg-orange-500', label: '1 maand achter' };
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-md ${t.bg} ${t.fg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />
      {t.label}
    </span>
  );
}

// =====================================================================
// Mobile invoice line — compact regel met bucket-badge + delete-knop voor
// huidige/vooruit facturen. Gebruikt in MobileTenantCard uitklap.
// =====================================================================
export function MobileInvoiceLine({ inv, bucket }) {
  const isPartial = inv.status === 'partial' || (Number(inv.paid_amount || 0) > 0 && Number(inv.paid_amount || 0) < Number(inv.amount || 0) * 0.95);
  const canDelete = (bucket === 'future' || bucket === 'current') && !isPartial;
  return (
    <div className="flex items-center justify-between gap-2 text-[12px]"
      data-testid={`mi-invoice-${inv.id}`}>
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <span className="text-slate-700 capitalize truncate">
          {MONTHS_NL[inv.period_month - 1]} {inv.period_year}
        </span>
        {bucket === 'future' && (
          <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-blue-100 text-blue-700 uppercase">Komt nog</span>
        )}
        {bucket === 'current' && (
          <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-700 uppercase">Lopend</span>
        )}
        {isPartial && (
          <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-700 uppercase">Deels</span>
        )}
      </div>
      <span className={`font-bold whitespace-nowrap ${bucket === 'future' ? 'text-slate-500' : 'text-slate-700'}`}>
        {inv.currency} {fmtAmountWhole(Number(inv.paid_amount) > 0 ? inv.remaining_amount : inv.amount)}
      </span>
      {canDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            const periodLabel = `${MONTHS_NL[inv.period_month - 1]} ${inv.period_year}`;
            if (!window.confirm(`Factuur ${inv.invoice_number} (${periodLabel}) verwijderen?`)) return;
            window.dispatchEvent(new CustomEvent('invoice-delete', { detail: { invoice: inv } }));
          }}
          data-testid={`mi-invoice-delete-${inv.id}`}
          className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-500 active:scale-95 transition">
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// =====================================================================
// Single invoice row used inside expanded TenantRow / DetailPage.
// `bucket`: 'overdue' | 'current' | 'future' — bepaalt de styling/badge.
// =====================================================================
export function InvoiceRow({ inv, bucket, severity }) {
  const isPartial = inv.status === 'partial' || (Number(inv.paid_amount || 0) > 0 && Number(inv.paid_amount || 0) < Number(inv.amount || 0) * 0.95);
  const dotCls = bucket === 'future' ? 'bg-blue-500'
    : bucket === 'current' ? 'bg-amber-500'
    : isPartial ? 'bg-amber-500'
    : severity === 'critical' ? 'bg-red-500'
    : 'bg-orange-500';
  return (
    <div className="flex items-center justify-between gap-2 text-sm"
      data-testid={`invoice-row-${inv.id}`}>
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotCls}`} />
        <span className="text-slate-700 capitalize truncate">{MONTHS_NL[inv.period_month - 1]} {inv.period_year}</span>
        {bucket === 'future' && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 uppercase tracking-wider">Komt nog</span>
        )}
        {bucket === 'current' && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 uppercase tracking-wider">Lopende maand</span>
        )}
        {isPartial && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 uppercase tracking-wider"
            title={`SRD ${Number(inv.paid_amount || 0).toLocaleString('nl-NL')} van SRD ${Number(inv.amount || 0).toLocaleString('nl-NL')} betaald`}>
            Deels betaald
          </span>
        )}
        {(inv.plans || []).map((pl) => {
          const isDone = pl.status === 'completed' || pl.paid_installments >= pl.total_installments;
          return (
            <button key={pl.id} type="button"
              onClick={(e) => {
                e.stopPropagation();
                // Trigger de navigatie eerst — AdminDashboard reageert op
                // 'go-tab' en roept navigate() aan (die kan onze eigen URL
                // veranderingen overschrijven).
                try { window.dispatchEvent(new CustomEvent('go-tab', { detail: 'payment_plans' })); } catch { /* noop */ }
                // Even wachten totdat die navigate klaar is, dan de query
                // param toevoegen en een popstate dispatchen zodat PaymentPlans'
                // mount-effect de planId leest. Óók een event dispatchen zodat
                // een al-gemounte PaymentPlans (bijv. door hot-reload) direct
                // reageert.
                setTimeout(() => {
                  try {
                    const url = new URL(window.location.href);
                    url.searchParams.set('planId', pl.id);
                    window.history.replaceState({}, '', url.toString());
                  } catch { /* noop */ }
                  try { window.dispatchEvent(new CustomEvent('open-plan-detail', { detail: { planId: pl.id } })); } catch { /* noop */ }
                }, 100);
              }}
              data-testid={`invoice-plan-badge-${inv.id}-${pl.id}`}
              title="Bekijk betalingsregeling"
              className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider transition hover:scale-105 ${
                isDone ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'
              }`}>
              <Calendar className="w-2.5 h-2.5" />
              Regeling {pl.paid_installments}/{pl.total_installments}
            </button>
          );
        })}
        <span className="text-[10px] text-slate-400 hidden sm:inline">· {inv.invoice_number}</span>
      </div>
      <div className="text-right shrink-0 whitespace-nowrap">
        <span className={bucket === 'future' ? 'text-slate-500 font-semibold' : 'text-slate-700 font-semibold'}>
          {fmtMoney(Number(inv.paid_amount) > 0 ? inv.remaining_amount : inv.amount, inv.currency)}
        </span>
      </div>
      {/* Snelbetaal-knop alleen voor achterstand + lopende maand, NIET voor vooruit gefactureerd */}
      {bucket !== 'future' && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            try { window.dispatchEvent(new CustomEvent('quick-pay-open', { detail: { invoice: inv } })); } catch { /* noop */ }
            try { window.dispatchEvent(new CustomEvent('go-tab', { detail: 'payments' })); } catch { /* noop */ }
          }}
          data-testid={`invoice-pay-btn-${inv.id}`}
          title="Registreer betaling"
          className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm active:scale-95 transition"
        >
          <Check className="w-3.5 h-3.5" strokeWidth={3} />
        </button>
      )}
      {/* Verwijder-knop: alleen voor onbetaalde HUIDIGE maand en VOORUIT gefactureerde
          facturen. Achterstand kan NIET verwijderd worden — moet eerst betaald
          of via een credit-actie afgeschreven worden. Partial-paid facturen
          ook niet (anders verlies van betaling-spoor). */}
      {(bucket === 'future' || bucket === 'current') && !isPartial && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            const periodLabel = `${MONTHS_NL[inv.period_month - 1]} ${inv.period_year}`;
            if (!window.confirm(`Factuur ${inv.invoice_number} (${periodLabel}) definitief verwijderen?\n\nDit kan niet ongedaan worden gemaakt.`)) return;
            window.dispatchEvent(new CustomEvent('invoice-delete', { detail: { invoice: inv } }));
          }}
          data-testid={`invoice-delete-btn-${inv.id}`}
          title="Factuur verwijderen"
          className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full bg-red-100 hover:bg-red-500 hover:text-white text-red-500 active:scale-95 transition"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
