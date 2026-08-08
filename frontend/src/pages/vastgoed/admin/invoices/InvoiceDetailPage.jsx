import { ChevronRight, Mail } from 'lucide-react';
import { fmtMoney } from '../../../../lib/api';
import { InvoiceRow } from './InvoiceRow';
import PaidHistorySection from './PaidHistorySection';

// =====================================================================
// InvoiceDetailPage — echte losse detail-pagina voor 1 huurder in
// PlanDetail-stijl (hoofdcard + sub-cards). Toont openstaand + volledige
// betalingsgeschiedenis (via PaidHistorySection).
// =====================================================================
export default function InvoiceDetailPage({ group, onBack, onReminder }) {
  const g = group;
  const overdue = (g.overdue || []).filter((i) => (i.status || '') !== 'paid');
  const current = (g.current || []).filter((i) => (i.status || '') !== 'paid');
  const future = (g.upcoming || []).filter((i) => (i.status || '') !== 'paid');
  const paid = (g.all || []).filter((i) => (i.status || '') === 'paid');
  const sev = g.severity;

  const badgeCls = sev === 'critical' ? 'bg-red-100 text-red-700'
    : sev === 'late' ? 'bg-orange-100 text-orange-700'
    : g.currentCount > 0 ? 'bg-amber-100 text-amber-700'
    : 'bg-emerald-100 text-emerald-700';
  const badgeLabel = sev === 'critical' ? 'Kritiek achterstallig'
    : sev === 'late' ? 'Achterstallig'
    : g.currentCount > 0 ? 'Lopende maand open'
    : 'Bij';
  const amtCls = sev === 'critical' ? 'text-red-600'
    : sev === 'late' ? 'text-orange-600'
    : g.currentCount > 0 ? 'text-amber-600'
    : 'text-slate-900';

  return (
    <div className="space-y-4 pb-24 sm:pb-6" data-testid={`invoice-detail-page-${g.tenant_id}`}>
      {/* TERUG-PIL */}
      <div className="flex items-center gap-2">
        <button onClick={onBack}
          data-testid="invoice-detail-back"
          className="flex items-center gap-1.5 text-slate-700 font-bold bg-white hover:bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm">
          <ChevronRight className="w-4 h-4 rotate-180" /> Terug
        </button>
      </div>

      {/* HOOFDCARD */}
      <div className="bg-white rounded-2xl shadow-sm p-5 border border-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-black text-slate-900 truncate">{g.tenant_name}</h1>
            {g.apartment_number && (
              <p className="text-xs text-slate-500">Appt. {g.apartment_number}</p>
            )}
            <div className="flex items-center gap-2 flex-wrap mt-3">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${badgeCls}`}>{badgeLabel}</span>
              {g.dueCount > 0 && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                  {g.dueCount} open maand{g.dueCount === 1 ? '' : 'en'}
                </span>
              )}
              {paid.length > 0 && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
                  {paid.length} betaald
                </span>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">Totaal openstaand</p>
            <p className={`text-2xl font-black ${amtCls}`}>{fmtMoney(g.totalDue, g.currency || 'SRD')}</p>
          </div>
        </div>
      </div>

      {/* SUB-CARD: OPEN FACTUREN */}
      {(overdue.length + current.length + future.length) > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Openstaande facturen</h2>
          </div>
          <div className="p-4 space-y-2">
            {overdue.map((inv) => <InvoiceRow key={inv.id} inv={inv} bucket="overdue" severity={sev} />)}
            {current.map((inv) => <InvoiceRow key={inv.id} inv={inv} bucket="current" severity={sev} />)}
            {future.map((inv) => <InvoiceRow key={inv.id} inv={inv} bucket="future" severity={sev} />)}
          </div>
        </div>
      )}

      {/* SUB-CARD: BETALINGSGESCHIEDENIS — nieuw component met datum, methode,
          ontvangstnummer en jaargroepering. Toon volledig verleden voor
          context bij zowel op-tijd als achterstallige huurders. */}
      <PaidHistorySection paidInvoices={paid} currency={g.currency || 'SRD'} testidPrefix={`detail-paid-${g.tenant_id}`} />

      {/* SUB-CARD: ACTIES */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Acties</h2>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button type="button" onClick={() => onReminder(g, 'whatsapp')}
            data-testid={`reminder-btn-whatsapp-${g.tenant_id}`}
            className="inline-flex items-center justify-center gap-2 px-3 py-2.5 bg-white border-2 border-emerald-300 hover:bg-emerald-50 text-emerald-700 font-bold rounded-xl text-xs sm:text-sm">
            <Mail className="w-4 h-4" /> WhatsApp
          </button>
          <button type="button" onClick={() => onReminder(g, 'email')}
            data-testid={`reminder-btn-email-${g.tenant_id}`}
            className="inline-flex items-center justify-center gap-2 px-3 py-2.5 bg-white border-2 border-blue-300 hover:bg-blue-50 text-blue-700 font-bold rounded-xl text-xs sm:text-sm">
            <Mail className="w-4 h-4" /> E-mail
          </button>
          <button type="button" onClick={() => onReminder(g, 'sms')}
            data-testid={`reminder-btn-sms-${g.tenant_id}`}
            className="inline-flex items-center justify-center gap-2 px-3 py-2.5 bg-white border-2 border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs sm:text-sm">
            <Mail className="w-4 h-4" /> SMS
          </button>
        </div>
      </div>
    </div>
  );
}
