import { FileText, ChevronRight, ChevronDown, MessageCircle, Mail } from 'lucide-react';
import { fmtMoney, MONTHS_NL } from '../../../../lib/api';
import { openWhatsApp } from '../../../../lib/external-link';
import { fmtAmount, fmtAmountWhole } from './helpers';
import { StatusPill, InvoiceRow, MobileInvoiceLine } from './InvoiceRow';
import PaidHistorySection from './PaidHistorySection';
import CreditBadge from './CreditBadge';

// =====================================================================
// MOBIELE POS-card — compacte rij per huurder voor telefoon-weergave
// =====================================================================
export function MobileTenantCard({ group, credits, onClick, onCreditClick }) {
  const sev = group.severity;
  const sub = group.location_name && group.apartment_number
    ? `${group.location_name} · ${group.apartment_number}`
    : group.apartment_number || 'Geen appartement';
  const amtCls = sev === 'critical' ? 'text-red-600'
    : sev === 'late' ? 'text-orange-600'
    : 'text-slate-900';
  return (
    <button onClick={onClick} type="button"
      data-testid={`mi-card-${group.tenant_id}`}
      className="w-full text-left bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_-2px_rgba(15,23,42,0.06)] active:scale-[0.99] transition-transform"
      style={{ padding: 'clamp(11px, 3.4vw, 16px) clamp(13px, 3.8vw, 18px)' }}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="rounded-2xl flex items-center justify-center shrink-0 bg-gradient-to-br from-[#FFB770] to-[#FF8A3D] text-white shadow-[0_2px_5px_-1px_rgba(255,140,40,0.35)]"
          style={{ width: 'clamp(42px, 11vw, 52px)', height: 'clamp(42px, 11vw, 52px)' }}>
          <FileText style={{ width: 'clamp(18px, 5vw, 22px)', height: 'clamp(18px, 5vw, 22px)' }} strokeWidth={2.4} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="font-extrabold text-slate-900 leading-tight truncate"
              style={{ fontSize: 'clamp(15px, 4.2vw, 18px)' }}>
              {group.tenant_name}
            </p>
            <CreditBadge credits={credits} variant="compact" onClick={onCreditClick} testid={`mi-credit-${group.tenant_id}`} />
          </div>
          <p className="text-slate-500 font-semibold truncate mt-0.5"
            style={{ fontSize: 'clamp(11px, 3vw, 13px)' }}>
            {sub}
          </p>
          <div className="mt-1.5">
            <StatusPill severity={sev} overdueCount={group.overdueCount} currentCount={group.currentCount} upcomingCount={group.upcomingCount} />
          </div>
        </div>
        <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
          <p className={`font-black tracking-tight whitespace-nowrap ${amtCls}`}
            data-testid={`mi-amount-${group.tenant_id}`}
            style={{ fontSize: 'clamp(15px, 4.2vw, 19px)' }}>
            {group.currency} {fmtAmountWhole(group.totalDue || group.totalOpen)}
          </p>
          {(group.dueCount || group.openCount) > 0 && (
            <p className="text-slate-500 font-bold"
              style={{ fontSize: 'clamp(10px, 2.8vw, 12px)' }}>
              {group.dueCount || group.openCount}× open
            </p>
          )}
          <ChevronRight className="text-slate-400/80 mt-0.5"
            style={{ width: 'clamp(14px, 3.8vw, 18px)', height: 'clamp(14px, 3.8vw, 18px)' }} />
        </div>
      </div>
    </button>
  );
}

// =====================================================================
// Desktop tenant row + open/paid uitklap. Wordt in de lijstweergave gebruikt.
// =====================================================================
export function TenantRow({ group, credits, expanded, onToggle, onReminder, onCreditClick, tenants }) {
  const sev = group.severity;
  const amtCls = sev === 'critical' ? 'text-red-600'
    : sev === 'late' ? 'text-orange-600'
    : group.currentCount > 0 ? 'text-amber-600'
    : group.upcomingCount > 0 ? 'text-blue-600'
    : 'text-slate-900';
  const iconTint = sev === 'critical' ? 'bg-red-50 text-red-600'
    : sev === 'late' ? 'bg-orange-50 text-[#FF5C00]'
    : group.currentCount > 0 ? 'bg-amber-50 text-amber-700'
    : group.upcomingCount > 0 ? 'bg-blue-50 text-blue-600'
    : 'bg-emerald-50 text-emerald-700';
  const last = group.lastDue || group.lastOverdue || group.lastOpen
    || (group.all && group.all[group.all.length - 1]);
  const displayTotal = group.totalDue;
  const displayCount = group.dueCount;
  const paidInvoices = (group.all || []).filter((i) => (i.status || '') === 'paid');

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden transition"
      data-testid={`tenant-row-${group.tenant_id}`}>
      <button onClick={onToggle} className="w-full text-left p-4 hover:bg-slate-50 active:bg-slate-100 transition">
        <div className="grid grid-cols-[auto_1fr_auto] md:grid-cols-[auto_minmax(0,1.8fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.1fr)_16px] items-center gap-3">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${iconTint}`}>
            <FileText className="w-5 h-5" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="font-bold text-slate-900 text-sm sm:text-[15px] truncate">{group.tenant_name}</p>
              <CreditBadge credits={credits} onClick={onCreditClick} testid={`tenant-credit-${group.tenant_id}`} />
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 font-medium truncate" data-testid={`tenant-apt-${group.tenant_id}`}>
              {group.location_name && group.apartment_number
                ? `${group.location_name} · ${group.apartment_number}`
                : group.apartment_number
                  ? group.apartment_number
                  : 'Geen appartement'}
            </p>
            <div className="mt-1 md:hidden">
              <StatusPill severity={sev} overdueCount={group.overdueCount} currentCount={group.currentCount} upcomingCount={group.upcomingCount} />
            </div>
          </div>

          <div className="hidden md:flex items-center">
            <StatusPill severity={sev} overdueCount={group.overdueCount} currentCount={group.currentCount} upcomingCount={group.upcomingCount} />
          </div>

          <div className="hidden md:block text-right text-xs whitespace-nowrap min-w-0">
            {last ? (
              <>
                <p className="text-slate-700 font-semibold capitalize truncate">{MONTHS_NL[last.period_month - 1].slice(0, 3)} {last.period_year}</p>
                <p className={`font-bold ${
                  group.openCount === 0 ? 'text-emerald-600'
                    : (last.bucket || '') === 'future' ? 'text-blue-500'
                    : (last.bucket || '') === 'current' ? 'text-amber-600'
                    : sev === 'critical' ? 'text-red-500'
                    : 'text-orange-500'
                }`}>
                  {group.openCount === 0 ? 'Laatst betaald'
                    : (last.bucket || '') === 'future' ? 'Komt nog'
                    : (last.bucket || '') === 'current' ? 'Lopende maand'
                    : 'Achterstand'}
                </p>
              </>
            ) : (
              <p className="text-slate-400 font-semibold">Geen facturen</p>
            )}
          </div>

          <div className="text-right shrink-0 whitespace-nowrap">
            <p className={`text-base sm:text-lg font-black tracking-tight ${amtCls}`}
              data-testid={`tenant-total-${group.tenant_id}`}>
              {group.openCount === 0 && paidInvoices.length > 0
                ? `${group.currency} ${fmtAmount(paidInvoices.reduce((s, i) => s + Number(i.amount || 0), 0), group.currency)}`
                : `${group.currency} ${fmtAmount(displayTotal, group.currency)}`}
            </p>
            {group.openCount === 0 && paidInvoices.length > 0 && (
              <p className="text-[10px] text-emerald-600 font-bold mt-0.5">
                {paidInvoices.length} {paidInvoices.length === 1 ? 'maand' : 'maanden'} betaald
              </p>
            )}
            {displayCount > 1 && (
              <p className="text-[10px] text-slate-400 mt-0.5">
                {displayCount} × {fmtAmount(displayTotal / displayCount, group.currency)}
              </p>
            )}
          </div>

          {expanded
            ? <ChevronDown className="w-4 h-4 text-slate-400" />
            : <ChevronRight className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      {/* Uitgeklapte details — open facturen */}
      {expanded && group.openCount > 0 && (
        <div className="px-3 sm:px-4 pb-4 -mt-1" data-testid={`tenant-detail-${group.tenant_id}`}>
          <div className={`rounded-2xl p-4 ${
            sev === 'critical' ? 'bg-red-50'
              : sev === 'late' ? 'bg-orange-50'
              : 'bg-blue-50'
          }`}>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
              <div>
                {group.overdueCount > 0 && (
                  <>
                    <p className={`text-sm font-bold mb-3 ${
                      sev === 'critical' ? 'text-red-700' : 'text-orange-700'
                    }`}>
                      Achterstallige huur ({group.overdueCount}) · {fmtMoney(group.totalOverdue, group.currency)}
                    </p>
                    <div className="space-y-1.5">
                      {group.overdue.map((inv) => (
                        <InvoiceRow key={inv.id} inv={inv} bucket="overdue" severity={sev} />
                      ))}
                    </div>
                  </>
                )}

                {group.currentCount > 0 && (
                  <div className={group.overdueCount > 0 ? 'mt-4 pt-3 border-t border-slate-200/70' : ''}>
                    <p className="text-xs font-bold mb-2 text-amber-700">
                      Openstaande huidige maand ({group.currentCount}) · {fmtMoney(group.totalCurrent, group.currency)}
                    </p>
                    <div className="space-y-1.5">
                      {group.current.map((inv) => (
                        <InvoiceRow key={inv.id} inv={inv} bucket="current" severity={sev} />
                      ))}
                    </div>
                  </div>
                )}

                {group.upcomingCount > 0 && (
                  <div className={(group.overdueCount + group.currentCount) > 0 ? 'mt-4 pt-3 border-t border-slate-200/70' : ''}>
                    <p className="text-xs font-bold mb-2 text-blue-700">
                      Vooruit gefactureerd ({group.upcomingCount}) · {fmtMoney(group.totalUpcoming, group.currency)}
                    </p>
                    <div className="space-y-1.5">
                      {group.upcoming.map((inv) => (
                        <InvoiceRow key={inv.id} inv={inv} bucket="future" severity={sev} />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className={`md:pl-4 md:min-w-[180px] flex md:flex-col gap-3 justify-between md:justify-center items-end md:items-end md:border-l ${
                sev === 'critical' ? 'md:border-red-200'
                  : sev === 'late' ? 'md:border-orange-200'
                  : group.currentCount > 0 ? 'md:border-amber-200'
                  : 'md:border-blue-200'
              }`}>
                {group.overdueCount > 0 ? (
                  <div className="text-right">
                    <p className="text-xs font-bold text-slate-500">Totaal achterstand</p>
                    <p className={`text-xl sm:text-2xl font-black tracking-tight ${
                      sev === 'critical' ? 'text-red-600' : 'text-orange-600'
                    }`}>
                      {fmtMoney(group.totalOverdue, group.currency)}
                    </p>
                  </div>
                ) : group.currentCount > 0 ? (
                  <div className="text-right">
                    <p className="text-xs font-bold text-slate-500">Huidige maand open</p>
                    <p className="text-xl sm:text-2xl font-black tracking-tight text-amber-600">
                      {fmtMoney(group.totalCurrent, group.currency)}
                    </p>
                  </div>
                ) : (
                  <div className="text-right">
                    <p className="text-xs font-bold text-slate-500">Vooruit gefactureerd</p>
                    <p className="text-xl sm:text-2xl font-black tracking-tight text-blue-600">
                      {fmtMoney(group.totalUpcoming, group.currency)}
                    </p>
                  </div>
                )}
                {(group.overdueCount > 0 && group.currentCount > 0) && (
                  <p className="text-[10px] text-amber-600 font-semibold">
                    + huidige maand {fmtMoney(group.totalCurrent, group.currency)}
                  </p>
                )}
                {((group.overdueCount > 0 || group.currentCount > 0) && group.upcomingCount > 0) && (
                  <p className="text-[10px] text-blue-500 font-semibold">
                    + vooruit {fmtMoney(group.totalUpcoming, group.currency)}
                  </p>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-3 gap-2 mt-4">
              <button onClick={(e) => { e.stopPropagation(); onReminder(group, 'whatsapp'); }}
                data-testid={`reminder-whatsapp-${group.tenant_id}`}
                className="inline-flex items-center justify-center gap-1.5 px-2 py-3 bg-white border-2 border-emerald-300 hover:bg-emerald-50 text-emerald-700 font-bold rounded-xl text-xs sm:text-sm">
                <MessageCircle className="w-4 h-4" />
                <span className="hidden sm:inline">Twilio WA</span>
                <span className="sm:hidden">Twilio</span>
              </button>
              <button onClick={(e) => { e.stopPropagation(); onReminder(group, 'email'); }}
                data-testid={`reminder-email-${group.tenant_id}`}
                className="inline-flex items-center justify-center gap-1.5 px-2 py-3 bg-white border-2 border-orange-300 hover:bg-orange-50 text-[#FF5C00] font-bold rounded-xl text-xs sm:text-sm">
                <Mail className="w-4 h-4" />
                <span>E-mail</span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const t = tenants?.find((x) => x.id === group.tenant_id);
                  const phone = (t?.phone || '').replace(/\D/g, '');
                  if (!phone) {
                    alert(`${group.tenant_name} heeft geen telefoonnummer. Voeg toe via Huurders.`);
                    return;
                  }
                  const cur = group.currency;
                  const list = group.overdue
                    .map((i) => `• ${MONTHS_NL[i.period_month - 1]} ${i.period_year}: ${cur} ${Number(i.amount).toFixed(2)}`)
                    .join('\n');
                  const msg = `Beste ${group.tenant_name},\n\nVriendelijke herinnering — u heeft ${group.overdueCount} openstaande factu${group.overdueCount > 1 ? 'ren' : 'ur'}:\n\n${list}\n\n*Totaal openstaand: ${cur} ${Number(group.totalOverdue).toFixed(2)}*\n\nGelieve zo spoedig mogelijk te betalen.\n\n— SuriRent`;
                  openWhatsApp(phone, msg);
                }}
                data-testid={`reminder-wa-manual-${group.tenant_id}`}
                className="inline-flex items-center justify-center gap-1.5 px-2 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl text-xs sm:text-sm shadow-[0_6px_16px_-4px_rgba(16,185,129,0.5)]">
                <MessageCircle className="w-4 h-4" />
                <span className="hidden sm:inline">WhatsApp</span>
                <span className="sm:hidden">WA</span>
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {group.open.map((inv) => (
                <a key={inv.id} href={`${process.env.REACT_APP_BACKEND_URL}/api/invoices/${inv.id}/pdf`}
                  target="_blank" rel="noreferrer"
                  data-testid={`invoice-pdf-${inv.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[11px] font-mono font-bold text-slate-600 bg-white hover:bg-slate-50 px-2 py-1 rounded-md border border-slate-200 inline-flex items-center gap-1">
                  <FileText className="w-3 h-3" /> {inv.invoice_number}
                </a>
              ))}
            </div>

            {/* Betalingsgeschiedenis: NIEUW — ook zichtbaar bij achterstallige
                huurders zodat je meteen ziet welke maanden wél zijn betaald. */}
            {paidInvoices.length > 0 && (
              <div className="mt-4">
                <PaidHistorySection paidInvoices={paidInvoices} currency={group.currency} variant="inline" testidPrefix={`overdue-paid-${group.tenant_id}`} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Uitgeklapte details — alleen betaalde facturen (openCount === 0) */}
      {expanded && group.openCount === 0 && paidInvoices.length > 0 && (
        <div className="px-3 sm:px-4 pb-4 -mt-1" data-testid={`tenant-paid-detail-${group.tenant_id}`}>
          <PaidHistorySection paidInvoices={paidInvoices} currency={group.currency} variant="inline" testidPrefix={`paid-${group.tenant_id}`} />
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Mobile expand: bucket-secties + betalingsgeschiedenis van huurder.
// =====================================================================
export function MobileTenantExpand({ g, tenants, onReminder }) {
  const paidInvoices = (g.all || []).filter((i) => (i.status || '') === 'paid');
  return (
    <div className="mt-2 mx-1" data-testid={`mi-detail-${g.tenant_id}`}>
      <div className={`rounded-2xl p-3.5 ${
        g.severity === 'critical' ? 'bg-red-50'
          : g.severity === 'late' ? 'bg-orange-50'
          : g.currentCount > 0 ? 'bg-amber-50'
          : 'bg-blue-50'
      }`}>
        {g.overdueCount > 0 && (
          <>
            <p className={`text-[12px] font-bold mb-2 ${
              g.severity === 'critical' ? 'text-red-700' : 'text-orange-700'
            }`}>
              Achterstallige huur ({g.overdueCount}) · {g.currency} {fmtAmountWhole(g.totalOverdue)}
            </p>
            <div className="space-y-1.5">
              {g.overdue.map((inv) => (
                <MobileInvoiceLine key={inv.id} inv={inv} bucket="overdue" />
              ))}
            </div>
          </>
        )}
        {g.currentCount > 0 && (
          <div className={g.overdueCount > 0 ? 'mt-3 pt-3 border-t border-slate-200/60' : ''}>
            <p className="text-[12px] font-bold mb-2 text-amber-700">
              Openstaande huidige maand ({g.currentCount}) · {g.currency} {fmtAmountWhole(g.totalCurrent)}
            </p>
            <div className="space-y-1.5">
              {g.current.map((inv) => (
                <MobileInvoiceLine key={inv.id} inv={inv} bucket="current" />
              ))}
            </div>
          </div>
        )}
        {g.upcomingCount > 0 && (
          <div className={(g.overdueCount + g.currentCount) > 0 ? 'mt-3 pt-3 border-t border-slate-200/60' : ''}>
            <p className="text-[12px] font-bold mb-2 text-blue-700">
              Vooruit gefactureerd ({g.upcomingCount}) · {g.currency} {fmtAmountWhole(g.totalUpcoming)}
            </p>
            <div className="space-y-1.5">
              {g.upcoming.map((inv) => (
                <MobileInvoiceLine key={inv.id} inv={inv} bucket="future" />
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-slate-200/60 flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-500">
            {g.overdueCount > 0 ? 'Totaal achterstand' : g.currentCount > 0 ? 'Huidige maand' : 'Vooruit'}
          </span>
          <span className={`text-[15px] font-black tracking-tight ${
            g.severity === 'critical' ? 'text-red-600'
              : g.severity === 'late' ? 'text-orange-600'
              : g.currentCount > 0 ? 'text-amber-600'
              : 'text-blue-600'
          }`}>
            {g.currency} {fmtAmountWhole(g.totalDue)}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-3">
          <button onClick={(e) => { e.stopPropagation(); onReminder(g, 'email'); }}
            data-testid={`mi-email-${g.tenant_id}`}
            className="h-10 rounded-xl bg-white border border-orange-200 text-[#FF6A1A] font-bold text-[12px] inline-flex items-center justify-center gap-1.5">
            <Mail className="w-3.5 h-3.5" /> E-mail
          </button>
          <button onClick={(e) => {
            e.stopPropagation();
            const t = tenants?.find((x) => x.id === g.tenant_id);
            const phone = (t?.phone || '').replace(/\D/g, '');
            if (!phone) { alert(`${g.tenant_name} heeft geen telefoonnummer.`); return; }
            const list = g.overdue.map((i) => `• ${MONTHS_NL[i.period_month - 1]} ${i.period_year}: ${g.currency} ${Number(i.amount).toFixed(2)}`).join('\n');
            const msg = `Beste ${g.tenant_name},\n\nVriendelijke herinnering — u heeft ${g.overdueCount} openstaande factu${g.overdueCount > 1 ? 'ren' : 'ur'}:\n\n${list}\n\n*Totaal openstaand: ${g.currency} ${Number(g.totalOverdue).toFixed(2)}*\n\n— SuriRent`;
            openWhatsApp(phone, msg);
          }}
            data-testid={`mi-wa-${g.tenant_id}`}
            className="h-10 rounded-xl bg-emerald-500 text-white font-bold text-[12px] inline-flex items-center justify-center gap-1.5">
            <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
          </button>
        </div>

        {/* Betalingsgeschiedenis onderaan de expand — ook bij achterstand. */}
        {paidInvoices.length > 0 && (
          <div className="mt-3">
            <PaidHistorySection paidInvoices={paidInvoices} currency={g.currency} variant="inline" testidPrefix={`mi-overdue-paid-${g.tenant_id}`} />
          </div>
        )}
      </div>
    </div>
  );
}
