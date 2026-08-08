import { useState } from 'react';
import { ChevronRight, Mail, Banknote, PiggyBank, Loader2 } from 'lucide-react';
import { api, formatError, fmtMoney } from '../../../../lib/api';
import { InvoiceRow } from './InvoiceRow';
import PaidHistorySection from './PaidHistorySection';
import QuickPayModal from './QuickPayModal';
import CreditBadge from './CreditBadge';

// =====================================================================
// InvoiceDetailPage — echte losse detail-pagina voor 1 huurder in
// PlanDetail-stijl (hoofdcard + sub-cards). Toont openstaand + volledige
// betalingsgeschiedenis (via PaidHistorySection).
// =====================================================================
export default function InvoiceDetailPage({ group, credits, onBack, onReminder, onPaid, onCreditClick }) {
  const g = group;
  const overdue = (g.overdue || []).filter((i) => (i.status || '') !== 'paid');
  const current = (g.current || []).filter((i) => (i.status || '') !== 'paid');
  const future = (g.upcoming || []).filter((i) => (i.status || '') !== 'paid');
  const paid = (g.all || []).filter((i) => (i.status || '') === 'paid');
  const sev = g.severity;
  const [quickPayInv, setQuickPayInv] = useState(null);
  const [applyingCredit, setApplyingCredit] = useState(false);

  // De "primaire" openstaande factuur (meest urgent):
  // - eerst de oudste achterstallige, dan de huidige maand, dan future.
  const primaryOpen = overdue[0] || current[0] || future[0] || null;

  // Beschikbaar krediet in de factuur-valuta (default SRD). We tonen de
  // "Verreken tegoed"-knop alleen als er zowel krediet ÁLS een open factuur is.
  const currency = g.currency || primaryOpen?.currency || 'SRD';
  const availableCredit = Number((credits && credits[currency]) || 0);
  const canApplyCredit = availableCredit > 0 && (overdue.length + current.length) > 0;

  const applyCredit = async () => {
    // Verreken FIFO tegen de meest urgente open factuur (backend handelt
    // meerdere krediet-betalingen automatisch af).
    const target = overdue[0] || current[0];
    if (!target || applyingCredit) return;
    setApplyingCredit(true);
    try {
      const { data } = await api.post(`/invoices/${target.id}/apply-credit`);
      if (onPaid) {
        onPaid({
          receipt_number: 'krediet-verrekening',
          amount: data.applied,
          currency,
          _credit_applied: true,
          _message: `${fmtMoney(data.applied, currency)} tegoed verrekend met ${target.invoice_number}`,
        });
      }
    } catch (e) {
      alert(formatError(e) || 'Kon tegoed niet verrekenen');
    } finally {
      setApplyingCredit(false);
    }
  };

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
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-black text-slate-900 truncate">{g.tenant_name}</h1>
              <CreditBadge credits={credits} onClick={onCreditClick} testid={`detail-credit-${g.tenant_id}`} />
            </div>
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
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Openstaande facturen</h2>
            <div className="flex items-center gap-1.5">
              {canApplyCredit && (
                <button type="button" onClick={applyCredit} disabled={applyingCredit}
                  data-testid="apply-credit-btn"
                  title={`Verreken ${fmtMoney(availableCredit, currency)} tegoed met openstaande facturen`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border-2 border-emerald-300 hover:bg-emerald-50 text-emerald-700 font-bold rounded-lg text-xs disabled:opacity-50 active:scale-95 transition">
                  {applyingCredit
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <PiggyBank className="w-3.5 h-3.5" />}
                  Verreken {fmtMoney(availableCredit, currency)} tegoed
                </button>
              )}
              {primaryOpen && (
                <button type="button" onClick={() => setQuickPayInv(primaryOpen)}
                  data-testid="quickpay-primary-btn"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg text-xs shadow-[0_6px_16px_-4px_rgba(16,185,129,0.5)] active:scale-95 transition">
                  <Banknote className="w-3.5 h-3.5" /> Registreer betaling
                </button>
              )}
            </div>
          </div>
          <div className="p-4 space-y-2">
            {[...overdue, ...current, ...future].map((inv) => {
              const bucket = overdue.includes(inv) ? 'overdue' : current.includes(inv) ? 'current' : 'future';
              return (
                <div key={inv.id} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <InvoiceRow inv={inv} bucket={bucket} severity={sev} />
                  </div>
                  {bucket !== 'future' && (
                    <button type="button" onClick={() => setQuickPayInv(inv)}
                      data-testid={`quickpay-btn-${inv.id}`}
                      title="Snelle betaling registreren"
                      className="shrink-0 hidden md:inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold rounded-lg text-[11px]">
                      <Banknote className="w-3 h-3" /> Betaal
                    </button>
                  )}
                </div>
              );
            })}
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

      {/* QuickPay modal — direct-betaal flow zonder navigatie naar Betalingen */}
      {quickPayInv && (
        <QuickPayModal
          invoice={quickPayInv}
          tenantName={g.tenant_name}
          otherOpenInvoices={[...overdue, ...current].filter((i) => i.id !== quickPayInv.id)}
          onClose={() => setQuickPayInv(null)}
          onSuccess={(payment) => {
            setQuickPayInv(null);
            if (onPaid) onPaid(payment);
          }}
        />
      )}
    </div>
  );
}
