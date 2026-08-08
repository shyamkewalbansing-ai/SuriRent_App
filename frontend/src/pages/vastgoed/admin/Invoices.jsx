import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, X, Check, Loader2, FileText, Wand2, Mail, Search,
  SlidersHorizontal, CalendarDays, CheckCircle2, Info, ChevronRight,
  ChevronDown, MessageCircle, Send, SkipForward, Users, Calendar, Trash2,
} from 'lucide-react';
import { api, formatError, fmtMoney, MONTHS_NL } from '../../../lib/api';
import { useAutoRefresh } from '../../../lib/auto-refresh';
import { openWhatsApp } from '../../../lib/external-link';

// =====================================================================
// Helpers
// =====================================================================
const UNPAID = ['open', 'sent', 'pending', 'overdue'];
const isUnpaid = (inv) => UNPAID.includes((inv.status || '').toLowerCase());

const ORANGE = '#FF5C00';

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return { bg: `hsl(${h}, 65%, 92%)`, fg: `hsl(${h}, 45%, 35%)` };
}

function fmtAmount(value, currency) {
  // Toon alleen het getal (currency wordt los gerenderd).
  return fmtMoney(value, currency).replace(currency, '').trim();
}
// Variant zonder cent-decimalen voor compacte weergaves (POS-stijl op mobile).
function fmtAmountWhole(value) {
  return Number(value || 0).toLocaleString('nl-NL', { maximumFractionDigits: 0 });
}

function groupByTenant(invoices) {
  const map = new Map();
  for (const inv of invoices) {
    const key = inv.tenant_id;
    if (!map.has(key)) {
      map.set(key, {
        tenant_id: inv.tenant_id,
        tenant_name: inv.tenant_name || 'Onbekend',
        apartment_number: inv.apartment_number,
        location_name: inv.location_name,
        currency: inv.currency,
        all: [], open: [],
      });
    }
    const g = map.get(key);
    g.all.push(inv);
    if (isUnpaid(inv)) g.open.push(inv);
    if (inv.apartment_number) g.apartment_number = inv.apartment_number;
    if (inv.location_name) g.location_name = inv.location_name;
  }
  // Bucket-classificatie komt RECHTSTREEKS van de backend (`inv.bucket`):
  //   "overdue"  → Achterstallige huur (vervaltermijn + grace verstreken)
  //   "current"  → Openstaande huidige maand (binnen grace-window)
  //   "future"   → Vooruit gefactureerd
  // Fallback (oude clients zonder backend-bucket): periode < huidige maand
  //   = overdue, == huidige = current, > huidige = future.
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;
  const fallbackBucket = (inv) => {
    if (inv.period_year > curY || (inv.period_year === curY && inv.period_month > curM)) return 'future';
    if (inv.period_year === curY && inv.period_month === curM) return 'current';
    return 'overdue';
  };
  const bucketOf = (inv) => inv.bucket || fallbackBucket(inv);
  for (const g of map.values()) {
    g.open.sort((a, b) => (a.period_year - b.period_year) || (a.period_month - b.period_month));
    g.all.sort((a, b) => (a.period_year - b.period_year) || (a.period_month - b.period_month));
    g.overdue = g.open.filter((i) => bucketOf(i) === 'overdue');
    g.current = g.open.filter((i) => bucketOf(i) === 'current');
    g.upcoming = g.open.filter((i) => bucketOf(i) === 'future');
    g.openCount = g.open.length;
    g.overdueCount = g.overdue.length;
    g.currentCount = g.current.length;
    g.upcomingCount = g.upcoming.length;
    const sumOf = (arr) => arr.reduce((s, i) => s + Number(i.remaining_amount != null ? i.remaining_amount : i.amount || 0), 0);
    g.totalOpen = sumOf(g.open);
    g.totalOverdue = sumOf(g.overdue);
    g.totalCurrent = sumOf(g.current);
    g.totalUpcoming = sumOf(g.upcoming);
    // "Echt openstaand" = achterstand + huidige maand. Vooruit gefactureerd
    // is toekomst en hoort NIET in dit bedrag of in de telling.
    g.totalDue = g.totalOverdue + g.totalCurrent;
    g.dueCount = g.overdueCount + g.currentCount;
    g.dueMonths = [...g.overdue, ...g.current]
      .sort((a, b) => (a.period_year - b.period_year) || (a.period_month - b.period_month));
    g.lastDue = g.dueMonths[g.dueMonths.length - 1];  // mei in plaats van apr
    // Severity baseert op échte achterstand. Huidige maand telt NIET als
    // achterstand zolang de grace-window niet verstreken is.
    g.severity = g.overdueCount >= 2 ? 'critical' : g.overdueCount === 1 ? 'late' : 'ok';
    g.lastOpen = g.open[g.open.length - 1];
    g.lastOverdue = g.overdue[g.overdue.length - 1];
    g.periodLabel = g.overdue
      .map((i) => `${MONTHS_NL[i.period_month - 1]}`)
      .join(', ');
    if (g.overdue.length > 0) {
      const lastYear = g.overdue[g.overdue.length - 1].period_year;
      g.periodLabel += ` ${lastYear}`;
    }
  }
  return [...map.values()];
}

// =====================================================================
// Reminder modal
// =====================================================================
function ReminderModal({ group, initialChannel = 'whatsapp', onClose, onSent }) {
  const [channel, setChannel] = useState(initialChannel);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    setLoading(true); setError('');
    try {
      await api.post(`/tenants/${group.tenant_id}/reminder`, { channel, message });
      onSent(channel);
    } catch (e) { setError(formatError(e)); }
    finally { setLoading(false); }
  };

  const channels = [
    { v: 'whatsapp', l: 'WhatsApp', icon: MessageCircle, color: 'emerald' },
    { v: 'sms', l: 'SMS', icon: MessageCircle, color: 'slate' },
    { v: 'email', l: 'E-mail', icon: Mail, color: 'orange' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-white/30 backdrop-blur-md flex items-center justify-center p-4 modal-open modal-sheet-auto"
      onClick={onClose} data-testid="reminder-modal">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-xl font-black text-slate-900">Betalingsherinnering</h3>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-slate-500 mb-5">Naar <b className="text-slate-900">{group.tenant_name}</b> · {group.openCount} openstaande maand{group.openCount !== 1 ? 'en' : ''} · {fmtMoney(group.totalOpen, group.currency)}</p>

        {error && <div className="mb-3 p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm">{error}</div>}

        <div className="space-y-3 mb-4">
          <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Kanaal</label>
          <div className="grid grid-cols-3 gap-2">
            {channels.map((c) => {
              const sel = channel === c.v;
              return (
                <button key={c.v} onClick={() => setChannel(c.v)}
                  data-testid={`reminder-channel-${c.v}`}
                  className={`py-3 rounded-xl border-2 font-bold text-sm flex flex-col items-center gap-1 transition ${
                    sel ? 'border-[#FF5C00] bg-orange-50 text-[#FF5C00]' : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300'
                  }`}>
                  <c.icon className="w-4 h-4" /> {c.l}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2 mb-5">
          <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Extra bericht (optioneel)</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)}
            data-testid="reminder-message"
            placeholder="Bijv. 'Heeft u de huur van vorige maand al overgemaakt?'"
            className="w-full h-24 px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none text-sm resize-none" />
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">Annuleren</button>
          <button onClick={send} disabled={loading} data-testid="reminder-send"
            className="flex-1 h-12 rounded-xl bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Versturen
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Mobile filter pill — altijd zichtbaar in de balk (Alle/Achterstand/Betaald)
// =====================================================================
function MobileFilterPill({ active, onClick, label, count, dot, testid }) {
  return (
    <button onClick={onClick} type="button" data-testid={testid}
      className={`shrink-0 h-10 px-3.5 rounded-2xl border inline-flex items-center gap-1.5 font-extrabold text-[13px] transition active:scale-95 ${
        active
          ? 'bg-[#FF6A1A] border-[#FF6A1A] text-white shadow-[0_8px_18px_-8px_rgba(255,92,0,0.55)]'
          : 'bg-white border-orange-100 text-slate-700'
      }`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-white' : dot}`} />}
      <span>{label}</span>
      <span className={`text-[11px] font-bold ${active ? 'text-white/85' : 'text-slate-400'}`}>
        ({count})
      </span>
    </button>
  );
}

// =====================================================================
// MOBIELE POS-card — compacte rij per huurder voor telefoon-weergave
// =====================================================================
function MobileTenantCard({ group, onClick }) {
  const sev = group.severity;
  const sub = group.location_name && group.apartment_number
    ? `${group.location_name} · ${group.apartment_number}`
    : group.apartment_number || 'Geen appartement';
  // Bedragen standaard donkerblauw (slate-900). Alleen rood/oranje bij echte
  // achterstand — dat zijn waarschuwingen, geen kleurkeuze. Status badge
  // toont 'Op tijd' / 'Achterstand' apart in eigen kleur.
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
          <p className="font-extrabold text-slate-900 leading-tight truncate"
            style={{ fontSize: 'clamp(15px, 4.2vw, 18px)' }}>
            {group.tenant_name}
          </p>
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
// Tenant row
// =====================================================================
function StatusPill({ severity, overdueCount, currentCount, upcomingCount }) {
  if (severity === 'ok') {
    if (currentCount > 0) {
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-md bg-amber-50 text-amber-700">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          {currentCount === 1 ? 'Lopende maand open' : `${currentCount} lopende maanden`}
        </span>
      );
    }
    if (upcomingCount > 0) {
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-md bg-blue-50 text-blue-700">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          {upcomingCount === 1 ? '1 komende factuur' : `${upcomingCount} komende facturen`}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Op tijd
      </span>
    );
  }
  const t = severity === 'critical'
    ? { bg: 'bg-red-50', fg: 'text-red-700', dot: 'bg-red-500', label: `${overdueCount} maanden achter` }
    : { bg: 'bg-orange-50', fg: 'text-orange-700', dot: 'bg-orange-500', label: '1 maand achter' };
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-md ${t.bg} ${t.fg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} /> {t.label}
    </span>
  );
}

function MonthChip({ month, severity }) {
  const t = severity === 'critical'
    ? { bg: 'bg-red-50', fg: 'text-red-700' }
    : { bg: 'bg-orange-50', fg: 'text-orange-700' };
  return (
    <span className={`text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-md ${t.bg} ${t.fg}`}>{month}</span>
  );
}

// =====================================================================
// Mobile invoice line — compact regel met bucket-badge + delete-knop voor
// huidige/vooruit facturen. Gebruikt in MobileTenantCard uitklap.
// =====================================================================
function MobileInvoiceLine({ inv, bucket, g }) {
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
// Single invoice row used inside expanded TenantRow
// `bucket`: 'overdue' | 'current' | 'future' — bepaalt de styling/badge.
// =====================================================================
function InvoiceRow({ inv, bucket, severity }) {
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
                try { window.dispatchEvent(new CustomEvent('go-tab', { detail: 'payment_plans' })); } catch { /* noop */ }
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

function TenantRow({ group, expanded, onToggle, onReminder, tenants }) {
  const sev = group.severity;
  const amtCls = sev === 'critical' ? 'text-red-600'
    : sev === 'late' ? 'text-orange-600'
    : group.currentCount > 0 ? 'text-amber-600'
    : group.upcomingCount > 0 ? 'text-blue-600'
    : 'text-slate-900';
  // Icon-kleur tint per severiteit — geeft visueel signaal zonder de
  // border-l-4 "strip" die niet past bij de PlanRow-stijl.
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
          {/* Icon-container matching PlanRow style */}
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${iconTint}`}>
            <FileText className="w-5 h-5" />
          </div>

          {/* Huurder name + locatie · appartement */}
          <div className="min-w-0">
            <p className="font-bold text-slate-900 text-sm sm:text-[15px] truncate">{group.tenant_name}</p>
            <p className="text-[11px] sm:text-xs text-slate-500 font-medium truncate" data-testid={`tenant-apt-${group.tenant_id}`}>
              {group.location_name && group.apartment_number
                ? `${group.location_name} · ${group.apartment_number}`
                : group.apartment_number
                  ? group.apartment_number
                  : 'Geen appartement'}
            </p>
            {/* Mobiel: status pill onder de naam (geen aparte Open maanden kolom op mobiel) */}
            <div className="mt-1 md:hidden">
              <StatusPill severity={sev} overdueCount={group.overdueCount} currentCount={group.currentCount} upcomingCount={group.upcomingCount} />
            </div>
          </div>

          {/* Open maanden kolom — alleen status pill, details verschijnen bij uitklappen */}
          <div className="hidden md:flex items-center">
            <StatusPill severity={sev} overdueCount={group.overdueCount} currentCount={group.currentCount} upcomingCount={group.upcomingCount} />
          </div>

          {/* Laatste periode — desktop only, compact. Toont voor 'paid'-
              huurders het laatst-betaalde maand-jaar i.p.v. "Geen". Het
              label onderaan beschrijft de bucket van die maand precies:
              - "Achterstand"  → overdue (vervaltermijn verstreken)
              - "Lopende maand" → current (binnen grace)
              - "Komt nog"     → future
              - "Laatst betaald" → geen open facturen meer */}
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

          {/* Bedrag */}
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

          {/* Chevron */}
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
              {/* LEFT — Drie buckets: Achterstand, Huidige maand, Vooruit gefactureerd */}
              <div>
                {/* SECTION 1 — Achterstallige huur */}
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

                {/* SECTION 2 — Openstaande huidige maand */}
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

                {/* SECTION 3 — Vooruit gefactureerd */}
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

              {/* RIGHT — totaal-stack: Achterstand (groot) + sub-totalen */}
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
                {/* Sub-totalen voor de andere buckets — alleen tonen wanneer relevant */}
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

            {/* Action buttons — 3 herinnerings-kanalen */}
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

            {/* Per-invoice PDF download links — compact strip */}
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
          </div>
        </div>
      )}

      {/* Uitgeklapte details — betaalde facturen (alleen wanneer er GEEN open
          facturen zijn, anders staan ze al in 'open' uitklap als referentie) */}
      {expanded && group.openCount === 0 && paidInvoices.length > 0 && (
        <div className="px-3 sm:px-4 pb-4 -mt-1" data-testid={`tenant-paid-detail-${group.tenant_id}`}>
          <div className="rounded-2xl p-4 bg-emerald-50">
            <p className="text-sm font-bold mb-3 text-emerald-700">
              Betaalde maanden ({paidInvoices.length}) · {fmtMoney(paidInvoices.reduce((s, i) => s + Number(i.amount || 0), 0), group.currency)}
            </p>
            <div className="space-y-1.5">
              {paidInvoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between gap-2 text-sm"
                  data-testid={`paid-invoice-row-${inv.id}`}>
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-emerald-500" />
                    <span className="text-slate-700 capitalize truncate">
                      {MONTHS_NL[inv.period_month - 1]} {inv.period_year}
                    </span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 uppercase tracking-wider">
                      Betaald
                    </span>
                    <span className="text-[10px] text-slate-400 hidden sm:inline">· {inv.invoice_number}</span>
                    {inv.paid_at && (
                      <span className="text-[10px] text-slate-500 hidden md:inline">
                        op {new Date(inv.paid_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                  <div className="text-right shrink-0 whitespace-nowrap">
                    <span className="text-slate-700 font-semibold">{fmtMoney(inv.amount, inv.currency)}</span>
                  </div>
                  <a href={`${process.env.REACT_APP_BACKEND_URL}/api/invoices/${inv.id}/pdf`}
                    target="_blank" rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    data-testid={`paid-invoice-pdf-${inv.id}`}
                    title="Download factuur PDF"
                    className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full bg-white hover:bg-emerald-100 text-emerald-700 border border-emerald-200 active:scale-95 transition">
                    <FileText className="w-3.5 h-3.5" />
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Invoice creation modal
// =====================================================================
function InvoiceForm({ tenants, onCancel, onSaved }) {
  const today = new Date();
  const [data, setData] = useState({
    tenant_id: '',
    period_month: today.getMonth() + 1,
    period_year: today.getFullYear(),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
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
    <div className="fixed inset-0 z-50 bg-white/30 backdrop-blur-md flex items-center justify-center p-4 modal-open modal-sheet-auto"
      data-testid="invoice-modal" onClick={onCancel}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-8" onClick={(e) => e.stopPropagation()}>
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

// =====================================================================
// Bulk WhatsApp herinneringen — wizard die door alle openstaande huurders
// heen loopt. Browser security staat geen "alles tegelijk" toe (popup-block);
// dus 1 tik per huurder, met progress-balk en skip-functie.
// =====================================================================
function BulkWhatsAppModal({ groups, tenants, onClose }) {
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState([]);   // tenant_ids die afgehandeld zijn
  const [skipped, setSkipped] = useState([]);

  // Filter groups: alleen openstaande huurders met telefoonnummer.
  const queue = useMemo(() => {
    return groups
      .filter((g) => g.openCount > 0)
      .map((g) => {
        const t = tenants.find((x) => x.id === g.tenant_id);
        return { ...g, phone: (t?.phone || '').replace(/\D/g, '') };
      });
  }, [groups, tenants]);

  const withPhone = queue.filter((g) => g.phone);
  const withoutPhone = queue.filter((g) => !g.phone);
  const cur = withPhone[idx];

  const buildMsg = (g) => {
    const list = g.open
      .map((i) => `• ${MONTHS_NL[i.period_month - 1]} ${i.period_year}: ${g.currency} ${Number(i.amount).toFixed(2)}`)
      .join('\n');
    return `Beste ${g.tenant_name},\n\nVriendelijke herinnering — u heeft ${g.openCount} openstaande factu${g.openCount > 1 ? 'ren' : 'ur'}:\n\n${list}\n\n*Totaal openstaand: ${g.currency} ${Number(g.totalOpen).toFixed(2)}*\n\nGelieve zo spoedig mogelijk te betalen.\n\n— SuriRent`;
  };

  const openWhatsAppAction = () => {
    if (!cur) return;
    openWhatsApp(cur.phone, buildMsg(cur));
    setDone((d) => [...d, cur.tenant_id]);
    // Verschuif naar volgende — kleine delay zodat WhatsApp tab opent voordat we doorgaan
    setTimeout(() => setIdx((i) => i + 1), 200);
  };

  const skipCurrent = () => {
    if (!cur) return;
    setSkipped((s) => [...s, cur.tenant_id]);
    setIdx((i) => i + 1);
  };

  const total = withPhone.length;
  const allDone = idx >= total;
  const progress = total > 0 ? Math.round(((done.length + skipped.length) / total) * 100) : 100;

  return (
    <div className="fixed inset-0 z-50 bg-white/30 backdrop-blur-md flex items-center justify-center p-4 modal-open modal-sheet-auto"
      onClick={onClose} data-testid="bulk-wa-modal">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 sm:p-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-black text-slate-900">WhatsApp herinneringen</h3>
            <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Progress */}
          <div className="mb-5">
            <div className="flex justify-between text-xs font-bold text-slate-500 mb-1.5">
              <span>{Math.min(idx, total)} / {total} huurders</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {withoutPhone.length > 0 && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800" data-testid="missing-phones-warning">
              <p className="font-bold mb-1">{withoutPhone.length} huurder{withoutPhone.length !== 1 ? 's' : ''} zonder telefoonnummer:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                {withoutPhone.slice(0, 5).map((g) => <li key={g.tenant_id}>{g.tenant_name}</li>)}
                {withoutPhone.length > 5 && <li>+{withoutPhone.length - 5} anderen</li>}
              </ul>
              <p className="mt-1 text-amber-700">Voeg toe via Huurders om mee te sturen.</p>
            </div>
          )}

          {!allDone && cur ? (
            <>
              {/* Current tenant */}
              <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-4 mb-4" data-testid="bulk-current-tenant">
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 mb-1">
                  Huurder {idx + 1} van {total}
                </p>
                <p className="text-lg font-black text-slate-900">{cur.tenant_name}</p>
                <p className="text-xs text-slate-500">+{cur.phone}</p>
                <p className="text-sm font-bold text-emerald-700 mt-2">
                  {cur.openCount} openstaande factu{cur.openCount > 1 ? 'ren' : 'ur'} · {cur.currency} {Number(cur.totalOpen).toFixed(2)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button onClick={skipCurrent} data-testid="bulk-skip"
                  className="h-11 rounded-xl border-2 border-slate-200 text-slate-700 font-bold inline-flex items-center justify-center gap-2 hover:bg-slate-50">
                  <SkipForward className="w-4 h-4" /> Sla over
                </button>
                <button onClick={openWhatsAppAction} data-testid="bulk-open-wa"
                  className="h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold inline-flex items-center justify-center gap-2 shadow-[0_8px_20px_-5px_rgba(16,185,129,0.5)]">
                  <Send className="w-4 h-4" /> Open
                </button>
              </div>
              <p className="text-[11px] text-slate-400 text-center mt-3 leading-snug">
                Tik <b>Open</b> → WhatsApp opent met {cur.tenant_name} → tik Send in WhatsApp → kom terug naar deze pagina voor de volgende huurder
              </p>
            </>
          ) : (
            <div className="text-center py-6" data-testid="bulk-complete">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                <Check className="w-8 h-8 text-emerald-600" strokeWidth={3} />
              </div>
              <p className="text-lg font-black text-slate-900 mb-1">Klaar!</p>
              <p className="text-sm text-slate-500 mb-4">
                {done.length} verzonden{skipped.length > 0 ? ` · ${skipped.length} overgeslagen` : ''}
              </p>
              <button onClick={onClose} data-testid="bulk-close"
                className="w-full h-11 rounded-xl bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold">
                Sluiten
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Main page
// =====================================================================
export default function Invoices() {
  const [items, setItems] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [reminding, setReminding] = useState(null);
  const [reminderChannel, setReminderChannel] = useState('whatsapp');
  const [bulkOpen] = useState(false); // legacy — Bulk WhatsApp button removed; kept as no-op
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');  // 'all' | 'open' | 'paid'
  const [filterSeverity, setFilterSeverity] = useState('all'); // all|critical|late|ok
  const [filterOpen, setFilterOpen] = useState(false);
  const [expanded, setExpanded] = useState(null);  // single tenant_id of currently expanded row (LEGACY, alleen mobile)
  const [userToggled, setUserToggled] = useState(false); // gebruiker heeft handmatig een rij geopend/gesloten
  const [detail, setDetail] = useState(null); // Volledige detail-pagina voor 1 huurder (desktop)
  const [toast, setToast] = useState(null);
  const today = new Date();

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [i, t] = await Promise.all([api.get('/invoices'), api.get('/tenants')]);
      setItems(i.data); setTenants(t.data);
    } finally { if (!silent) setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  // Stille polling — geen spinner / scroll-reset tijdens auto-refresh.
  useAutoRefresh(() => load({ silent: true }), { interval: 10000, enabled: !creating && !reminding && !bulkOpen });

  // Luister naar `invoice-delete` event vanaf <InvoiceRow> en voer DELETE uit.
  useEffect(() => {
    const handler = async (ev) => {
      const inv = ev.detail?.invoice;
      if (!inv?.id) return;
      try {
        await api.delete(`/invoices/${inv.id}`);
        setToast({ type: 'success', msg: `Factuur ${inv.invoice_number} verwijderd` });
        load({ silent: true });
      } catch (e) {
        setToast({ type: 'error', msg: formatError(e) || 'Kon factuur niet verwijderen' });
      }
    };
    window.addEventListener('invoice-delete', handler);
    return () => window.removeEventListener('invoice-delete', handler);
  }, [load]);

  const generateMonth = async () => {
    if (!window.confirm(`Maandfacturen voor ${MONTHS_NL[today.getMonth()]} ${today.getFullYear()} aanmaken voor alle bezette appartementen?`)) return;
    setGenerating(true);
    try {
      const { data } = await api.post('/invoices/generate-month', {
        period_month: today.getMonth() + 1,
        period_year: today.getFullYear(),
      });
      setToast({ type: 'ok', text: `${data.created} aangemaakt, ${data.skipped} overgeslagen` });
      load();
    } catch (e) { setToast({ type: 'err', text: formatError(e) }); }
    finally { setGenerating(false); }
  };

  // KPI metrics
  const groups = useMemo(() => {
    const g = groupByTenant(items);
    const order = { critical: 0, late: 1, ok: 2 };
    g.sort((a, b) => (order[a.severity] - order[b.severity])
      || (b.totalOpen - a.totalOpen)
      || a.tenant_name.localeCompare(b.tenant_name));
    return g;
  }, [items]);

  const allCount = groups.length;
  // "Achterstallige huurders" = huurders met ECHTE achterstand (niet huurders
  // die alleen de lopende maand of vooruit-facturen open hebben).
  const openCount = useMemo(() => groups.filter((g) => (g.overdueCount || 0) > 0).length, [groups]);
  const paidCount = useMemo(() => groups.filter((g) => g.openCount === 0).length, [groups]);

  // "Totaal openstaand" = achterstand + huidige maand. Vooruit gefactureerd
  // telt NIET mee — dat is toekomst en geen schuld nu.
  const totalOpenAmount = useMemo(
    () => groups.reduce((s, g) => s + (g.totalOverdue || 0) + (g.totalCurrent || 0), 0),
    [groups]
  );
  const totalOpenCurrency = groups[0]?.currency || 'SRD';
  // Aantal openstaande maanden = unieke periodes uit achterstand + huidige
  // maand (exclusief vooruit gefactureerd).
  const totalOpenMonths = useMemo(
    () => new Set(
      items
        .filter(isUnpaid)
        .filter((i) => (i.bucket || '') !== 'future')
        .map((i) => `${i.period_year}-${i.period_month}`)
    ).size,
    [items]
  );
  const thisMonthExpected = useMemo(() => {
    const m = today.getMonth() + 1, y = today.getFullYear();
    return items.filter((i) => i.period_month === m && i.period_year === y)
      .reduce((s, i) => s + Number(i.amount || 0), 0);
  }, [items, today]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter((g) => {
      // "Achterstand" tab toont ALLEEN huurders met echte achterstand.
      // Huurders met alleen lopende maand of vooruit-facturen verschijnen
      // niet in dit tabblad maar wel in "Alle".
      if (tab === 'open' && (g.overdueCount || 0) === 0) return false;
      if (tab === 'paid' && g.openCount > 0) return false;
      if (filterSeverity === 'critical' && g.severity !== 'critical') return false;
      if (filterSeverity === 'late' && g.severity !== 'late') return false;
      if (filterSeverity === 'ok' && g.severity !== 'ok') return false;
      if (q) {
        const hay = `${g.tenant_name} ${g.apartment_number || ''} ${g.open.map((i) => i.invoice_number).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [groups, tab, filterSeverity, search]);

  const toggleExpand = (id) => {
    setUserToggled(true);
    setExpanded((cur) => (cur === id ? null : id));
  };

  // Default: eerste huurder in de huidige filter staat altijd open.
  // Zodra de gebruiker zelf iets aanklikt (open óf sluiten), respecteren we
  // diens keuze en stoppen we met auto-openen. Zo blijft de bovenste rij
  // (meest urgente, want gesorteerd op severity + bedrag) standaard zichtbaar.
  useEffect(() => {
    if (userToggled) return;
    const firstId = filteredGroups[0]?.tenant_id || null;
    if (firstId && expanded !== firstId) setExpanded(firstId);
  }, [filteredGroups, expanded, userToggled]);

  const openReminder = (group, channel) => {
    setReminderChannel(channel);
    setReminding(group);
  };

  // Detail-pagina voor 1 huurder — echte losse pagina in PlanDetail-stijl
  // (hoofdcard + sub-cards). Geen hergebruik van de inline-expand markup.
  if (detail) {
    const g = filteredGroups.find((x) => x.tenant_id === detail.tenant_id) || detail;
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
          <button onClick={() => { setDetail(null); load({ silent: true }); }}
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

        {/* SUB-CARD: BETAALDE FACTUREN */}
        {paid.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Betaalde facturen</h2>
              <span className="text-[10px] font-bold text-slate-400">{paid.length} maand{paid.length === 1 ? '' : 'en'}</span>
            </div>
            <div className="p-4 space-y-2">
              {paid.slice(0, 24).map((inv) => (
                <div key={inv.id} className="flex items-center justify-between gap-2 text-sm" data-testid={`invoice-paid-row-${inv.id}`}>
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-emerald-500" />
                    <span className="text-slate-700 capitalize truncate">{MONTHS_NL[inv.period_month - 1]} {inv.period_year}</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 uppercase tracking-wider">Betaald</span>
                  </div>
                  <span className="text-slate-500 font-mono text-xs">{fmtMoney(inv.amount, inv.currency)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SUB-CARD: ACTIES */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Acties</h2>
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button type="button" onClick={() => openReminder(g, 'whatsapp')}
              data-testid={`reminder-btn-whatsapp-${g.tenant_id}`}
              className="inline-flex items-center justify-center gap-2 px-3 py-2.5 bg-white border-2 border-emerald-300 hover:bg-emerald-50 text-emerald-700 font-bold rounded-xl text-xs sm:text-sm">
              <Mail className="w-4 h-4" /> WhatsApp
            </button>
            <button type="button" onClick={() => openReminder(g, 'email')}
              data-testid={`reminder-btn-email-${g.tenant_id}`}
              className="inline-flex items-center justify-center gap-2 px-3 py-2.5 bg-white border-2 border-blue-300 hover:bg-blue-50 text-blue-700 font-bold rounded-xl text-xs sm:text-sm">
              <Mail className="w-4 h-4" /> E-mail
            </button>
            <button type="button" onClick={() => openReminder(g, 'sms')}
              data-testid={`reminder-btn-sms-${g.tenant_id}`}
              className="inline-flex items-center justify-center gap-2 px-3 py-2.5 bg-white border-2 border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs sm:text-sm">
              <Mail className="w-4 h-4" /> SMS
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="invoices-page">
      {/* =================================================================
          MOBILE (< md) — POS-stijl: titel + open totaal + grote knoppen +
          witte huurder-cards. Tab/filter/search verborgen voor focus.
          ================================================================= */}
      <div className="md:hidden space-y-4" data-testid="invoices-mobile">
        <div className="flex items-center justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            <h1 className="font-black text-slate-900 tracking-tight leading-[1.02]"
              style={{ fontSize: 'clamp(32px, 11vw, 56px)' }}>
              Facturen
            </h1>
            <p className="text-slate-500 mt-1 font-bold"
              style={{ fontSize: 'clamp(12px, 3.4vw, 15px)' }}>
              {allCount} huurder{allCount !== 1 ? 's' : ''}{openCount > 0 ? ` · ${openCount} open` : ''}
            </p>
          </div>
          <div className="bg-white rounded-2xl shadow-[0_8px_22px_-10px_rgba(0,0,0,0.18)] shrink-0"
            style={{ padding: 'clamp(8px, 2.4vw, 12px) clamp(10px, 3vw, 14px)' }}
            data-testid="mi-open-stat">
            <p className="font-bold uppercase tracking-wider text-slate-500"
              style={{ fontSize: 'clamp(9px, 2.4vw, 11px)' }}>
              Open
            </p>
            <p className={`font-black tracking-tight whitespace-nowrap leading-tight mt-0.5 ${totalOpenAmount > 0 ? 'text-red-500' : 'text-slate-900'}`}
              style={{ fontSize: 'clamp(14px, 4vw, 19px)' }}>
              {totalOpenCurrency} {fmtAmountWhole(totalOpenAmount)}
            </p>
            <p className="text-slate-400 font-bold mt-0.5 text-center"
              style={{ fontSize: 'clamp(9px, 2.4vw, 11px)' }}>
              {totalOpenMonths} maand{totalOpenMonths !== 1 ? 'en' : ''}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button onClick={generateMonth} disabled={generating} data-testid="mi-generate-btn" type="button"
            className="rounded-2xl bg-white border-2 border-orange-200 text-[#FF6A1A] font-black inline-flex items-center justify-center gap-2 shadow-sm active:scale-[0.985] transition-transform tracking-tight"
            style={{ height: 'clamp(56px, 16vw, 72px)', fontSize: 'clamp(13px, 3.6vw, 16px)' }}>
            {generating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wand2 style={{ width: 'clamp(18px, 5vw, 22px)', height: 'clamp(18px, 5vw, 22px)' }} />}
            Genereer
          </button>
          <button onClick={() => setCreating(true)} data-testid="mi-new-btn" type="button"
            className="rounded-2xl bg-[#FF6A1A] hover:bg-[#F05C0E] text-white font-black inline-flex items-center justify-center gap-2 shadow-[0_14px_28px_-10px_rgba(255,92,0,0.55)] active:scale-[0.985] transition-transform tracking-tight"
            style={{ height: 'clamp(56px, 16vw, 72px)', fontSize: 'clamp(15px, 4.2vw, 19px)' }}>
            <Plus className="stroke-[2.5]" style={{ width: 'clamp(20px, 5.5vw, 26px)', height: 'clamp(20px, 5.5vw, 26px)' }} /> Nieuwe
          </button>
        </div>

        {/* Filter pills — zichtbaar bovenaan, geen dropdown */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1" data-testid="mi-filter-bar">
          <MobileFilterPill active={tab === 'all'}   onClick={() => setTab('all')}
            label="Alle" count={allCount} testid="mi-pill-all" />
          <MobileFilterPill active={tab === 'open'}  onClick={() => setTab('open')}
            label="Achterstand" count={openCount} dot="bg-red-500" testid="mi-pill-open" />
          <MobileFilterPill active={tab === 'paid'}  onClick={() => setTab('paid')}
            label="Betaald" count={paidCount} dot="bg-emerald-500" testid="mi-pill-paid" />
        </div>

        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoek huurder, factuur..."
            data-testid="mi-search"
            className="w-full h-11 pl-10 pr-3.5 rounded-2xl bg-white border border-orange-100 text-[13px] font-semibold placeholder:text-slate-400 focus:border-[#FF5C00] outline-none" />
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-orange-100 p-10 text-center">
            <Loader2 className="w-6 h-6 text-orange-400 animate-spin mx-auto" />
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="bg-white rounded-2xl border border-orange-100 p-8 text-center" data-testid="mi-empty">
            <FileText className="w-9 h-9 text-orange-300 mx-auto mb-2" />
            <p className="text-[13px] text-slate-500 font-bold">
              {items.length === 0 ? 'Nog geen facturen.' : 'Geen resultaten.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredGroups.map((g) => (
              <div key={g.tenant_id} data-testid={`mi-row-${g.tenant_id}`}>
                <MobileTenantCard group={g} onClick={() => toggleExpand(g.tenant_id)} />
                {expanded === g.tenant_id && g.openCount > 0 && (
                  <div className="mt-2 mx-1" data-testid={`mi-detail-${g.tenant_id}`}>
                    <div className={`rounded-2xl p-3.5 ${
                      g.severity === 'critical' ? 'bg-red-50'
                        : g.severity === 'late' ? 'bg-orange-50'
                        : g.currentCount > 0 ? 'bg-amber-50'
                        : 'bg-blue-50'
                    }`}>
                      {/* SECTIE 1 — Achterstallige huur */}
                      {g.overdueCount > 0 && (
                        <>
                          <p className={`text-[12px] font-bold mb-2 ${
                            g.severity === 'critical' ? 'text-red-700' : 'text-orange-700'
                          }`}>
                            Achterstallige huur ({g.overdueCount}) · {g.currency} {fmtAmountWhole(g.totalOverdue)}
                          </p>
                          <div className="space-y-1.5">
                            {g.overdue.map((inv) => (
                              <MobileInvoiceLine key={inv.id} inv={inv} bucket="overdue" g={g} />
                            ))}
                          </div>
                        </>
                      )}

                      {/* SECTIE 2 — Openstaande huidige maand */}
                      {g.currentCount > 0 && (
                        <div className={g.overdueCount > 0 ? 'mt-3 pt-3 border-t border-slate-200/60' : ''}>
                          <p className="text-[12px] font-bold mb-2 text-amber-700">
                            Openstaande huidige maand ({g.currentCount}) · {g.currency} {fmtAmountWhole(g.totalCurrent)}
                          </p>
                          <div className="space-y-1.5">
                            {g.current.map((inv) => (
                              <MobileInvoiceLine key={inv.id} inv={inv} bucket="current" g={g} />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* SECTIE 3 — Vooruit gefactureerd */}
                      {g.upcomingCount > 0 && (
                        <div className={(g.overdueCount + g.currentCount) > 0 ? 'mt-3 pt-3 border-t border-slate-200/60' : ''}>
                          <p className="text-[12px] font-bold mb-2 text-blue-700">
                            Vooruit gefactureerd ({g.upcomingCount}) · {g.currency} {fmtAmountWhole(g.totalUpcoming)}
                          </p>
                          <div className="space-y-1.5">
                            {g.upcoming.map((inv) => (
                              <MobileInvoiceLine key={inv.id} inv={inv} bucket="future" g={g} />
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
                        <button onClick={(e) => { e.stopPropagation(); openReminder(g, 'email'); }}
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
                    </div>
                  </div>
                )}
                {/* Mobile: betaalde maanden uitklap voor groups zonder open */}
                {expanded === g.tenant_id && g.openCount === 0 && (g.all || []).some((i) => i.status === 'paid') && (
                  <div className="mt-2 mx-1" data-testid={`mi-paid-detail-${g.tenant_id}`}>
                    <div className="rounded-2xl p-3.5 bg-emerald-50">
                      <p className="text-[12px] font-bold mb-2 text-emerald-700">
                        Betaalde maanden ({(g.all || []).filter((i) => i.status === 'paid').length})
                      </p>
                      <div className="space-y-1.5">
                        {(g.all || []).filter((i) => i.status === 'paid').map((inv) => (
                          <div key={inv.id} className="flex items-center justify-between gap-2 text-[12px]"
                            data-testid={`mi-paid-invoice-${inv.id}`}>
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-emerald-500" />
                              <span className="text-slate-700 capitalize truncate">
                                {MONTHS_NL[inv.period_month - 1]} {inv.period_year}
                              </span>
                              <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 uppercase">Betaald</span>
                            </div>
                            <span className="text-slate-700 font-bold whitespace-nowrap">
                              {inv.currency} {fmtAmountWhole(Number(inv.amount))}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* =================================================================
          TABLET + DESKTOP (>= md) — bestaande layout ongewijzigd.
          ================================================================= */}
      <div className="hidden md:block space-y-4 sm:space-y-5">
      {/* HEADER — mobile shows compact KPI right of title */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">Facturen</h1>
          <p className="text-sm text-slate-500 mt-1">
            <span className="md:hidden">{items.length} {items.length === 1 ? 'factuur' : 'facturen'}</span>
            <span className="hidden md:inline">
              {allCount} huurder{allCount !== 1 ? 's' : ''}
              {openCount > 0 && <> · <span className="text-red-500 font-bold">{openCount} openstaand</span></>}
            </span>
          </p>
        </div>
        {/* Mobile-only compact KPI card */}
        <div className="md:hidden bg-white rounded-2xl border border-orange-100 px-4 py-3 shadow-sm shrink-0 max-w-[60%]" data-testid="kpi-mobile-card">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <p className="text-[11px] font-semibold text-slate-500">Openstaand totaal</p>
            <Info className="w-3.5 h-3.5 text-slate-300" />
          </div>
          <p className="text-base font-black text-slate-900 tracking-tight whitespace-nowrap">
            {totalOpenCurrency} <span className="text-red-500">{fmtAmount(totalOpenAmount, totalOpenCurrency)}</span>
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {allCount} huurder{allCount !== 1 ? 's' : ''} · {totalOpenMonths} maand{totalOpenMonths !== 1 ? 'en' : ''} open
          </p>
        </div>
      </div>

      {/* DESKTOP-ONLY 3 KPI CARDS */}
      <div className="hidden md:flex bg-white rounded-2xl border border-orange-100 divide-x divide-orange-100 overflow-hidden">
        <KpiCard icon="alert" label="Totaal openstaand"
          value={`${totalOpenCurrency} ${fmtAmount(totalOpenAmount, totalOpenCurrency)}`}
          hint={totalOpenMonths > 0 ? `${totalOpenMonths} maand${totalOpenMonths !== 1 ? 'en' : ''} open` : 'Geen achterstand'}
          tone={totalOpenAmount > 0 ? 'red' : 'green'} testid="kpi-total-open" />
        <KpiCard icon={CalendarDays} label="Achterstallige huurders"
          value={String(openCount)} hint={`van ${allCount} huurder${allCount !== 1 ? 's' : ''}`}
          tone="orange" testid="kpi-late-tenants" />
        <KpiCard icon={CheckCircle2} label="Deze maand verwacht"
          value={`${totalOpenCurrency} ${fmtAmount(thisMonthExpected, totalOpenCurrency)}`}
          hint={`${MONTHS_NL[today.getMonth()].toLowerCase()} ${today.getFullYear()}`}
          tone="green" testid="kpi-this-month" />
      </div>

      {/* ACTION BUTTONS */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <button onClick={generateMonth} disabled={generating} data-testid="invoice-generate-btn"
          className="inline-flex items-center justify-center gap-2 px-4 py-3 sm:py-3.5 bg-white border-2 border-orange-200 hover:border-[#FF5C00] text-[#FF5C00] font-bold rounded-2xl text-sm sm:text-base">
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4 sm:w-5 sm:h-5" />}
          Genereer maand
        </button>
        <button onClick={() => setCreating(true)} data-testid="invoice-new-btn"
          className="inline-flex items-center justify-center gap-2 px-4 py-3 sm:py-3.5 bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold rounded-2xl text-sm sm:text-base shadow-[0_10px_25px_-5px_rgba(255,92,0,0.5)]">
          <Plus className="w-4 h-4 sm:w-5 sm:h-5" /> Nieuwe factuur
        </button>
      </div>

      {/* TAB BAR */}
      <div className="bg-white rounded-2xl border border-orange-100 px-2 sm:px-3 py-2 flex items-center gap-1 sm:gap-2" data-testid="invoice-tabs">
        <Tab v="all" tab={tab} setTab={setTab} label={`Alle (${allCount})`} testid="tab-all" />
        <Tab v="open" tab={tab} setTab={setTab} label={`Achterstand (${openCount})`} dot="red" testid="tab-open" />
        <Tab v="paid" tab={tab} setTab={setTab} label={`Betaald (${paidCount})`} dot="green" testid="tab-paid" />
        <div className="flex-1" />
        <div className="relative">
          <button onClick={() => setFilterOpen(!filterOpen)} data-testid="invoice-filter-btn"
            className={`h-9 sm:h-10 px-3 sm:px-4 rounded-xl border bg-white inline-flex items-center gap-1.5 sm:gap-2 font-bold text-sm transition ${
              filterSeverity !== 'all' ? 'border-[#FF5C00] text-[#FF5C00]' : 'border-slate-200 text-slate-700 hover:border-orange-300'
            }`}>
            <SlidersHorizontal className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Filter{filterSeverity !== 'all' ? '' : 'en'}</span>
            {filterSeverity !== 'all' && <span className="w-1.5 h-1.5 rounded-full bg-[#FF5C00]" />}
          </button>
          {filterOpen && <FilterMenu filter={filterSeverity} setFilter={setFilterSeverity} onClose={() => setFilterOpen(false)} />}
        </div>
      </div>

      {/* SEARCH BAR */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Zoek huurder, factuur..."
          data-testid="invoice-search"
          className="w-full h-12 pl-11 pr-4 rounded-2xl bg-white border border-orange-100 text-sm focus:border-[#FF5C00] outline-none" />
      </div>

      {/* COLUMN HEADERS — desktop only */}
      <div className="hidden md:grid grid-cols-[auto_minmax(0,1.8fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.1fr)_16px] gap-3 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400 items-center">
        <span style={{ width: '40px' }} />
        <span>Huurder</span>
        <span>Open maanden</span>
        <span className="text-right">Laatste</span>
        <span className="text-right">Totaal openstaand</span>
        <span />
      </div>

      {/* MOBILE COLUMN HEADERS */}
      <div className="md:hidden flex justify-between px-4 text-[10px] font-black uppercase tracking-widest text-slate-400">
        <span>Huurder</span>
        <span>Bedrag</span>
      </div>

      {/* ROWS */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-orange-100 p-10 text-center">
          <Loader2 className="w-7 h-7 text-orange-400 animate-spin mx-auto" />
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="bg-white rounded-2xl border border-orange-100 p-10 text-center" data-testid="invoices-empty">
          <FileText className="w-10 h-10 text-orange-300 mx-auto mb-3" />
          <p className="text-slate-500 font-semibold">
            {items.length === 0 ? 'Geen facturen.' : 'Geen resultaten.'}
          </p>
          {items.length === 0 && (
            <p className="text-xs text-slate-400 mt-1">
              Klik op &quot;Genereer maand&quot; om automatisch facturen aan te maken.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2 sm:space-y-2.5">
          {filteredGroups.map((g) => (
            <TenantRow key={g.tenant_id} group={g}
              expanded={false}
              onToggle={() => setDetail(g)}
              onReminder={openReminder}
              tenants={tenants} />
          ))}
        </div>
      )}
      </div>

      {/* MODALS */}
      {creating && <InvoiceForm tenants={tenants}
        onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
      {reminding && (
        <ReminderModal group={reminding} initialChannel={reminderChannel}
          onClose={() => setReminding(null)}
          onSent={(ch) => {
            setReminding(null);
            setToast({ type: 'ok', text: `Herinnering via ${ch === 'email' ? 'e-mail' : ch === 'whatsapp' ? 'WhatsApp' : 'SMS'} verzonden` });
          }} />
      )}

      {/* TOAST */}
      {toast && <Toast toast={toast} onDone={() => setToast(null)} />}
    </div>
  );
}

// =====================================================================
// Small sub-components
// =====================================================================
function Tab({ v, tab, setTab, label, dot, testid }) {
  const active = tab === v;
  return (
    <button onClick={() => setTab(v)} data-testid={testid}
      className={`relative px-3 sm:px-4 h-9 sm:h-10 rounded-xl font-bold text-xs sm:text-sm inline-flex items-center gap-1.5 transition ${
        active ? 'text-[#FF5C00]' : 'text-slate-500 hover:text-slate-700'
      }`}>
      {label}
      {dot === 'red' && <span className="w-2 h-2 rounded-full bg-red-500" />}
      {dot === 'green' && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
      {active && <span className="absolute -bottom-2 left-3 right-3 h-0.5 bg-[#FF5C00] rounded-full" />}
    </button>
  );
}

function KpiCard({ icon, label, value, hint, tone, testid }) {
  const tones = {
    red:    { iconBg: 'bg-red-100', iconFg: 'text-red-500', hint: 'text-red-500' },
    orange: { iconBg: 'bg-orange-100', iconFg: 'text-orange-500', hint: 'text-slate-400' },
    green:  { iconBg: 'bg-emerald-100', iconFg: 'text-emerald-500', hint: 'text-slate-400' },
  };
  const t = tones[tone] || tones.orange;
  const Icon = icon === 'alert' ? AlertCircleDollar : icon;
  return (
    <div className="flex-1 min-w-0 flex items-center gap-4 px-5 py-5" data-testid={testid}>
      <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${t.iconBg}`}>
        <Icon className={`w-5 h-5 ${t.iconFg}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-500 mb-1 leading-tight">{label}</p>
        <p className="text-xl font-black text-slate-900 tracking-tight whitespace-nowrap">{value}</p>
        {hint && <p className={`text-xs font-bold mt-0.5 ${t.hint} capitalize`}>{hint}</p>}
      </div>
    </div>
  );
}

// Dollar-sign-in-circle icon (red), gebruikt voor "Totaal openstaand"
function AlertCircleDollar({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v10M14.5 9.5c0-1-.8-1.5-2.5-1.5s-2.5.5-2.5 1.5.8 1.5 2.5 1.5 2.5.5 2.5 1.5-.8 1.5-2.5 1.5-2.5-.5-2.5-1.5"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function FilterMenu({ filter, setFilter, onClose }) {
  const opts = [
    { v: 'all', l: 'Alle severities' },
    { v: 'critical', l: '2+ maanden (kritiek)' },
    { v: 'late', l: '1 maand achter' },
    { v: 'ok', l: 'Op tijd' },
  ];
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-12 z-50 bg-white rounded-xl shadow-2xl border border-orange-100 py-1 min-w-[220px]"
        data-testid="filter-menu">
        {opts.map((o) => (
          <button key={o.v} onClick={() => { setFilter(o.v); onClose(); }}
            data-testid={`filter-${o.v}`}
            className={`w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-orange-50 transition ${
              filter === o.v ? 'text-[#FF5C00] font-bold' : 'text-slate-700'
            }`}>{o.l}</button>
        ))}
      </div>
    </>
  );
}

function Toast({ toast, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [onDone]);
  const cls = toast.type === 'err'
    ? 'bg-red-500 text-white'
    : 'bg-emerald-500 text-white';
  return (
    <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-xl shadow-2xl font-bold text-sm animate-slide-up" data-testid="invoices-toast">
      <div className={`${cls} rounded-xl px-5 py-3`}>{toast.text}</div>
    </div>
  );
}
