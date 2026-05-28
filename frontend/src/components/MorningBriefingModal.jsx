import { Sun, AlertTriangle, Bell, CheckCircle2, Clock, ArrowRight, X } from 'lucide-react';

function fmtMoney(amount, cur) {
  try {
    return new Intl.NumberFormat('nl-NL', {
      style: 'currency', currency: (cur || 'SRD').toUpperCase(), minimumFractionDigits: 2,
    }).format(Number(amount || 0));
  } catch { return `${cur || ''} ${amount}`; }
}

export default function MorningBriefingModal({ briefing, onClose }) {
  if (!briefing) return null;
  const totalCurrencies = Object.entries(briefing.overdue_total_by_currency || {});
  const hasOverdue = (briefing.overdue_invoice_count || 0) > 0 || (briefing.overdue_installment_count || 0) > 0;

  return (
    <div className="fixed inset-0 z-[200] bg-black/55 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      data-testid="morning-briefing-modal" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 24px), 24px)' }}>
        <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto mb-4 sm:hidden" />
        <div className="flex items-start gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shrink-0 shadow-lg">
            <Sun className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-black text-slate-900">Goedemorgen!</h2>
            <p className="text-xs text-slate-500 mt-0.5">Dagbriefing van vandaag</p>
          </div>
          <button onClick={onClose} data-testid="briefing-close"
            className="text-slate-400 hover:text-slate-700 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2.5 mb-5">
          <Row icon={AlertTriangle} accent="text-red-600 bg-red-50"
            label="Huurders met achterstand >7 dgn"
            value={briefing.overdue_tenant_count}
            sub={totalCurrencies.length > 0
              ? `Totaal: ${totalCurrencies.map(([c, a]) => fmtMoney(a, c)).join(' + ')}`
              : null} />
          <Row icon={Clock} accent="text-orange-600 bg-orange-50"
            label="Openstaande facturen >7 dgn"
            value={briefing.overdue_invoice_count} />
          <Row icon={Clock} accent="text-purple-600 bg-purple-50"
            label="Achterstallige termijnen (betalingsregelingen)"
            value={briefing.overdue_installment_count} />
          <Row icon={Bell} accent="text-amber-600 bg-amber-50"
            label="Wacht op goedkeuring (vandaag)"
            value={briefing.new_pending_today} />
          <Row icon={CheckCircle2} accent="text-emerald-600 bg-emerald-50"
            label="Betalingen vandaag"
            value={briefing.new_payments_today} />
        </div>

        <div className="flex gap-2">
          <button onClick={onClose}
            data-testid="briefing-dismiss"
            className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm">
            Begrepen
          </button>
          {hasOverdue && (
            <a href="/admin/invoices?filter=overdue" onClick={onClose}
              data-testid="briefing-view-overdue"
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold rounded-xl text-sm">
              Bekijk overdue <ArrowRight className="w-4 h-4" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ icon: Icon, accent, label, value, sub }) {
  const isZero = !value;
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border ${isZero ? 'bg-slate-50 border-slate-100' : 'bg-white border-slate-200'}`}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isZero ? 'bg-slate-100 text-slate-400' : accent}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-900 leading-tight">{label}</p>
        {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
      </div>
      <span className={`text-xl font-black tabular-nums ${isZero ? 'text-slate-300' : 'text-slate-900'}`}>
        {value || 0}
      </span>
    </div>
  );
}
