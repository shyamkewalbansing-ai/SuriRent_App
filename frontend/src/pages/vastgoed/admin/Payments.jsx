import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, X, Check, Loader2, Search, FileText, Mail, ShieldCheck, ChevronRight, ChevronLeft,
  ChevronDown, CalendarDays, Banknote, CheckCircle2, Clock,
  TrendingUp, Receipt, Wallet, Home as HomeIcon, Trash2, AlertTriangle,
} from 'lucide-react';
import { api, formatError, fmtMoney, MONTHS_NL } from '../../../lib/api';
import { useAutoRefresh } from '../../../lib/auto-refresh';
import { useAdminEvents } from '../../../lib/admin-events';
import { SendDialog } from '../../../components/EmailDialog';
import SignaturePad from '../../../components/SignaturePad';
import { playApproveConfirm, playErrorBuzz, playSwoosh } from '../../../lib/tap-sounds';

// =====================================================================
// Helpers
// =====================================================================
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
  return fmtMoney(value, currency).replace(currency, '').trim();
}
// Versie zonder cent-decimalen — voor compacte stats (bv. "Vandaag" card).
function fmtAmountWhole(value) {
  return Number(value || 0).toLocaleString('nl-NL', { maximumFractionDigits: 0 });
}
function startOfDayUTC(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

const METHOD_LABELS = {
  contant: 'Contant',
  bank: 'Bank',
  mope: 'Uni5Pay',
  sumup: 'SumUp',
  uni5pay: 'Uni5Pay',
};

const CATEGORY_LABELS = {
  huur: 'Huur',
  servicekosten: 'Servicekosten',
  borg: 'Borg',
  boete: 'Boete',
  overig: 'Overig',
};

// =====================================================================
// KPI helpers
// =====================================================================
function KpiCard({ icon: Icon, label, value, hint, tone, testid }) {
  const tones = {
    orange: { iconBg: 'bg-orange-100', iconFg: 'text-[#FF5C00]' },
    green:  { iconBg: 'bg-emerald-100', iconFg: 'text-emerald-500' },
    blue:   { iconBg: 'bg-blue-100', iconFg: 'text-blue-600' },
  };
  const t = tones[tone] || tones.orange;
  return (
    <div className="flex-1 min-w-0 flex items-center gap-4 px-4 sm:px-5 py-4 sm:py-5" data-testid={testid}>
      <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center shrink-0 ${t.iconBg}`}>
        <Icon className={`w-5 h-5 ${t.iconFg}`} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] sm:text-xs font-semibold text-slate-500 mb-0.5 leading-tight">{label}</p>
        <p className="text-base sm:text-xl font-black text-slate-900 tracking-tight whitespace-nowrap">{value}</p>
        {hint && <p className="text-[10px] sm:text-xs text-slate-400 font-bold mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}

function MethodPill({ method }) {
  const tones = {
    contant: 'bg-emerald-50 text-emerald-700',
    bank: 'bg-blue-50 text-blue-700',
    mope: 'bg-orange-50 text-[#FF5C00]',
    sumup: 'bg-purple-50 text-purple-700',
    uni5pay: 'bg-indigo-50 text-indigo-700',
  };
  const cls = tones[method] || 'bg-slate-100 text-slate-700';
  return (
    <span className={`inline-block text-[10px] sm:text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${cls}`}>
      {METHOD_LABELS[method] || method}
    </span>
  );
}

// Brand-aware status colors per betaalmethode — voorkomt dat alles eenheidsworst
// (groen) is en geeft betere visuele scan-baarheid in de mobiele lijst.
const METHOD_PILL_CLASSES = {
  contant: 'bg-orange-50 text-[#C74600]',
  bank:    'bg-slate-100 text-slate-700',
  mope:    'bg-purple-50 text-purple-700',
  sumup:   'bg-pink-50 text-pink-700',
  uni5pay: 'bg-blue-50 text-blue-700',
};

// =====================================================================
// PendingPaymentCard — zelfde stijl als MobilePaymentCard, maar met
// "Goedkeuren" knop ipv expand. Bedrag in oranje (waarschuwing kleur).
// =====================================================================
function PendingPaymentCard({ p, onApprove }) {
  const avatar = avatarColor(p.tenant_name);
  return (
    <div data-testid={`pending-card-${p.id}`}
      className="bg-white rounded-2xl border border-amber-100 shadow-[0_1px_3px_-1px_rgba(245,158,11,0.15)] p-3 flex items-center gap-3 min-w-0">
      <div className="rounded-full flex items-center justify-center font-black shrink-0 shadow-[0_1px_3px_-1px_rgba(0,0,0,0.10)]"
        style={{ background: avatar.bg, color: avatar.fg, width: 42, height: 42, fontSize: 14 }}>
        {initials(p.tenant_name)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-extrabold text-slate-900 leading-tight truncate text-[15px]">
          {p.tenant_name || '—'}
        </p>
        <p className="text-slate-500 font-semibold truncate text-[11px] mt-0.5">
          Door <span className="text-slate-700 font-bold">{p.kiosk_employee_name || 'Kiosk'}</span> · {METHOD_LABELS[p.method] || p.method}
        </p>
        <p className="font-black text-amber-700 tracking-tight mt-0.5 text-[15px]">
          {p.currency} {fmtAmountWhole(p.amount)}
        </p>
      </div>
      <button onClick={onApprove} data-testid={`pending-approve-${p.id}`}
        className="shrink-0 h-10 px-3 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white font-bold text-xs flex items-center gap-1.5 active:scale-95 transition shadow-[0_2px_6px_-2px_rgba(16,185,129,0.45)]">
        <CheckCircle2 className="w-4 h-4" /> Goedkeuren
      </button>
    </div>
  );
}


// =====================================================================
// ApprovePaymentSheet — bottom sheet met handtekening canvas + bevestig
// =====================================================================
function ApprovePaymentSheet({ payment, onCancel, onApproved }) {
  const [sig, setSig] = useState('');
  const [hasSig, setHasSig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Bottom sheet opent → subtiele swoosh
  useEffect(() => { playSwoosh(); }, []);

  const submit = async () => {
    if (!hasSig) { setErr('Teken eerst uw handtekening'); playErrorBuzz(); return; }
    setErr(''); setSaving(true);
    try {
      await api.post(`/payments/${payment.id}/approve`, { signature_data_url: sig });
      playApproveConfirm();
      onApproved();
    } catch (e) { setErr(formatError(e)); playErrorBuzz(); }
    finally { setSaving(false); }
  };
  const reject = async () => {
    setErr(''); setSaving(true);
    try {
      await api.post(`/payments/${payment.id}/reject`, { reason: rejectReason });
      playApproveConfirm();
      onApproved();
    } catch (e) { setErr(formatError(e)); playErrorBuzz(); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm md:bg-white/30 md:backdrop-blur-md flex items-end md:items-center justify-center md:p-4 modal-open"
      data-testid="approve-modal" onClick={onCancel}>
      <div className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-3xl shadow-2xl pt-3 pb-6 px-5 md:p-8 animate-slide-up-sheet md:animate-slide-up max-h-[92vh] overflow-auto"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 24px), 24px)' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="md:hidden flex justify-center mb-3">
          <span className="w-10 h-1.5 rounded-full bg-slate-200" />
        </div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-black text-slate-900">Goedkeuren</h3>
          <button onClick={onCancel} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5 mb-4 space-y-1.5 text-[13px]">
          <DetailRow label="Huurder" value={<span className="font-bold text-slate-900">{payment.tenant_name}</span>} />
          <DetailRow label="Bedrag" value={<span className="font-bold text-slate-900">{payment.currency} {fmtAmountWhole(payment.amount)}</span>} />
          <DetailRow label="Methode" value={METHOD_LABELS[payment.method] || payment.method} />
          <DetailRow label="Ontvangen door" value={payment.kiosk_employee_name || '—'} />
          {payment.method === 'bank' && (
            <>
              <DetailRow label="Land"
                value={<span className="font-bold">{payment.bank_country === 'SR' ? '🇸🇷 Suriname' : payment.bank_country === 'NL' ? '🇳🇱 Nederland' : '—'}</span>} />
              {payment.bank_statement_id && (
                <div className="pt-1">
                  <a href={`${process.env.REACT_APP_BACKEND_URL}/api/bank-statements/${payment.bank_statement_id}`}
                    target="_blank" rel="noreferrer"
                    data-testid="approve-stmt-download"
                    onClick={async (e) => {
                      // Auth header is required — fallback: download via fetch with token
                      e.preventDefault();
                      try {
                        const tk = localStorage.getItem('admin_token') || localStorage.getItem('kiosk_token');
                        const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/bank-statements/${payment.bank_statement_id}`, {
                          headers: { Authorization: `Bearer ${tk}` },
                        });
                        if (!res.ok) throw new Error('Download mislukt');
                        const blob = await res.blob();
                        const url = URL.createObjectURL(blob);
                        window.open(url, '_blank');
                        setTimeout(() => URL.revokeObjectURL(url), 60000);
                      } catch (er) { alert(er.message || 'Bankafschrift kon niet geopend worden'); }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-50 border border-sky-200 text-sky-700 font-bold text-xs hover:bg-sky-100">
                    📎 {payment.bank_statement_filename || 'Bankafschrift'} bekijken
                  </a>
                </div>
              )}
            </>
          )}
        </div>
        {payment.method === 'bank' && payment.ocr_status && (
          <div className={`rounded-2xl p-3 mb-4 border ${
            payment.ocr_status === 'matched'
              ? 'bg-emerald-50 border-emerald-200'
              : payment.ocr_status === 'mismatch'
              ? 'bg-amber-50 border-amber-200'
              : 'bg-rose-50 border-rose-200'
          }`} data-testid="approve-ocr-block">
            <p className="text-[10px] font-black uppercase tracking-widest mb-1.5"
              style={{ color: payment.ocr_status === 'matched' ? '#047857' : payment.ocr_status === 'mismatch' ? '#92400e' : '#9f1239' }}>
              🤖 OCR-controle
              {payment.ocr_confidence != null && (
                <span className="ml-2 opacity-75">· confidence {Math.round(payment.ocr_confidence * 100)}%</span>
              )}
            </p>
            {payment.ocr_status === 'matched' && (
              <p className="text-xs font-bold text-emerald-800">
                ✅ Bedrag, valuta en datum kloppen. Veilig om goed te keuren.
              </p>
            )}
            {payment.ocr_status === 'mismatch' && payment.ocr_mismatch_reasons && (
              <ul className="text-xs font-semibold text-amber-800 space-y-0.5">
                {payment.ocr_mismatch_reasons.map((r, i) => (
                  <li key={`${payment.id}-mism-${i}-${String(r).slice(0, 24)}`}>⚠️ {r}</li>
                ))}
              </ul>
            )}
            {payment.ocr_status === 'failed' && (
              <p className="text-xs font-semibold text-rose-700">
                OCR is niet gelukt — beoordeel handmatig.
              </p>
            )}
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-2 text-[11px] text-slate-600">
              {payment.ocr_amount != null && <div><strong className="text-slate-800">Bedrag:</strong> {payment.ocr_currency || ''} {payment.ocr_amount}</div>}
              {payment.ocr_date_iso && <div><strong className="text-slate-800">Datum:</strong> {payment.ocr_date_iso}</div>}
              {payment.ocr_payer_name && <div className="col-span-2"><strong className="text-slate-800">Van:</strong> {payment.ocr_payer_name}</div>}
              {payment.ocr_beneficiary && <div className="col-span-2"><strong className="text-slate-800">Naar:</strong> {payment.ocr_beneficiary}</div>}
              {payment.ocr_reference && <div className="col-span-2"><strong className="text-slate-800">Kenmerk:</strong> {payment.ocr_reference}</div>}
            </div>
          </div>
        )}
        {!showReject ? (
          <>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Uw handtekening</p>
            <SignaturePad onChange={(url, has) => { setSig(url); setHasSig(has); }} height={170} />
            {err && <div className="mt-3 p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm">{err}</div>}
            <div className="mt-4 flex gap-2">
              <button onClick={() => setShowReject(true)} disabled={saving} data-testid="approve-reject-btn"
                className="px-3 h-12 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 font-bold text-sm">
                Afwijzen
              </button>
              <button onClick={submit} disabled={!hasSig || saving} data-testid="approve-confirm-btn"
                className="flex-1 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4" /> Goedkeuren</>}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Reden voor afwijzing (optioneel)</p>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
              data-testid="reject-reason" rows={3}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
              placeholder="Bv. bedrag klopt niet, contant geld niet ontvangen…" />
            {err && <div className="mt-3 p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm">{err}</div>}
            <div className="mt-4 flex gap-2">
              <button onClick={() => setShowReject(false)} disabled={saving}
                className="px-3 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm">
                Terug
              </button>
              <button onClick={reject} disabled={saving} data-testid="reject-confirm-btn"
                className="flex-1 h-12 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Definitief afwijzen</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


// =====================================================================
// Mobile-only (phone) views — geinspireerd op POS-terminal screenshot
// =====================================================================
function MobilePaymentCard({ p, onClick }) {
  const avatar = avatarColor(p.tenant_name);
  const sub = (() => {
    if (p.location_name && p.apartment_number) return `${p.location_name} · ${p.apartment_number}`;
    if (p.apartment_number) return p.apartment_number;
    return '—';
  })();
  const methodCls = METHOD_PILL_CLASSES[p.method] || 'bg-slate-100 text-slate-700';
  return (
    <button onClick={onClick} type="button"
      data-testid={`mp-card-${p.id}`}
      className="w-full text-left bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_-2px_rgba(15,23,42,0.06)] active:scale-[0.99] transition-transform"
      style={{
        padding: 'clamp(11px, 3.4vw, 16px) clamp(13px, 3.8vw, 18px)',
      }}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="rounded-full flex items-center justify-center font-black shrink-0 shadow-[0_1px_3px_-1px_rgba(0,0,0,0.10)]"
          style={{
            background: avatar.bg, color: avatar.fg,
            width: 'clamp(42px, 11vw, 52px)', height: 'clamp(42px, 11vw, 52px)',
            fontSize: 'clamp(14px, 3.8vw, 17px)',
          }}>
          {initials(p.tenant_name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-extrabold text-slate-900 leading-tight truncate"
            style={{ fontSize: 'clamp(15px, 4.2vw, 18px)' }}>
            {p.tenant_name || '—'}
          </p>
          <p className="text-slate-500 font-semibold truncate mt-0.5"
            style={{ fontSize: 'clamp(11px, 3vw, 13px)' }}>
            {sub}
          </p>
          <div className="mt-1.5">
            <span className={`inline-block font-bold uppercase tracking-wider rounded-md ${methodCls}`}
              style={{
                fontSize: 'clamp(10px, 2.6vw, 11px)',
                padding: 'clamp(2px, 0.6vw, 3px) clamp(6px, 1.8vw, 9px)',
              }}>
              {METHOD_LABELS[p.method] || p.method}
            </span>
          </div>
        </div>
        <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
          <p className="font-black text-slate-900 tracking-tight whitespace-nowrap"
            data-testid={`mp-amount-${p.id}`}
            style={{ fontSize: 'clamp(15px, 4.2vw, 19px)' }}>
            {p.currency} {fmtAmountWhole(p.amount)}
          </p>
          {p.period_month && (
            <p className="text-slate-500 font-bold capitalize"
              style={{ fontSize: 'clamp(10px, 2.8vw, 12px)' }}>
              {MONTHS_NL[p.period_month - 1].slice(0, 3)} {p.period_year}
            </p>
          )}
          <ChevronRight className="text-slate-400/80 mt-0.5"
            style={{ width: 'clamp(14px, 3.8vw, 18px)', height: 'clamp(14px, 3.8vw, 18px)' }} />
        </div>
      </div>
    </button>
  );
}

// MobileTabPill, FilterMenu, Tab componenten verwijderd — we tonen
// nu standaard alleen de huidige maand met een MonthStepper voor navigatie.

// =====================================================================
// Payment row
// =====================================================================
function PaymentRow({ p, onOpen }) {
  const tenantSub = (() => {
    if (p.location_name && p.apartment_number) return `${p.location_name} · ${p.apartment_number}`;
    if (p.apartment_number) return p.apartment_number;
    return '—';
  })();
  const date = new Date(p.paid_at);
  const dateShort = date.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric' });
  const statusBadge = (() => {
    const s = p.status || 'approved';
    if (s === 'pending_approval') return { l: 'Wacht op goedkeuring', cls: 'bg-amber-100 text-amber-700' };
    if (s === 'rejected') return { l: 'Afgekeurd', cls: 'bg-red-100 text-red-700' };
    return { l: 'Ontvangen', cls: 'bg-emerald-100 text-emerald-700' };
  })();
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden"
      data-testid={`payment-row-${p.id}`}>
      {/* Card is een grote klikbare rij die de detail-pagina opent —
          zelfde patroon als PlanRow → PlanDetail in Betalingsregelingen. */}
      <button onClick={() => onOpen(p)}
        className="w-full text-left hover:bg-slate-50 active:bg-slate-100 transition p-4 flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-orange-50 text-[#FF5C00] flex items-center justify-center shrink-0">
          <Receipt className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-black text-slate-900 truncate">{p.tenant_name || 'Onbekende huurder'}</p>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${statusBadge.cls}`}>
              {statusBadge.l}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-orange-50 text-[#FF5C00]">
              {CATEGORY_LABELS[p.category] || p.category}
            </span>
            <MethodPill method={p.method} />
          </div>
          <p className="text-xs text-slate-500 mt-0.5 truncate">
            <span className="font-mono font-bold text-slate-700">{p.receipt_number}</span>
            <span> · {tenantSub} · {dateShort}</span>
          </p>
        </div>

        <div className="text-right shrink-0">
          <p className="text-base font-black text-slate-900" data-testid={`payment-amount-${p.id}`}>
            {p.currency} {fmtAmountWhole(p.amount)}
          </p>
          {p.period_month && (
            <p className="text-[10px] text-slate-400 capitalize">
              {MONTHS_NL[p.period_month - 1].slice(0, 3)} {p.period_year}
            </p>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
      </button>
    </div>
  );
}

// =====================================================================
// PaymentDetail — full-page detail EXACT in de stijl van PlanDetail:
// grote "Terug"-pil, hoofdcard met naam + bedrag, sub-cards voor
// betaalgegevens en gekoppelde factuur. Sub-card "Acties" onderaan.
// =====================================================================
function PaymentDetail({ payment, onBack, onEmail, onDelete, apiBase }) {
  const p = payment;
  const [linkedInvoice, setLinkedInvoice] = useState(null);

  useEffect(() => {
    if (!p?.invoice_id) return;
    let alive = true;
    (async () => {
      try {
        const { data: allInvs } = await api.get('/invoices');
        if (!alive) return;
        setLinkedInvoice(allInvs.find((i) => i.id === p.invoice_id) || null);
      } catch (e) { console.warn('[Payments] linked invoice fetch:', e); }
    })();
    return () => { alive = false; };
  }, [p?.invoice_id]);

  const date = new Date(p.paid_at);
  const statusBadge = (() => {
    const s = p.status || 'approved';
    if (s === 'pending_approval') return { l: 'Wacht op goedkeuring', cls: 'bg-amber-100 text-amber-700' };
    if (s === 'rejected') return { l: 'Afgekeurd', cls: 'bg-red-100 text-red-700' };
    return { l: 'Ontvangen', cls: 'bg-emerald-100 text-emerald-700' };
  })();

  return (
    <div className="space-y-4 pb-24 sm:pb-6" data-testid={`payment-detail-page-${p.id}`}>
      {/* TERUG-PIL — zelfde stijl als in PlanDetail */}
      <div className="flex items-center gap-2">
        <button onClick={onBack} data-testid="payment-detail-back"
          className="flex items-center gap-1.5 text-slate-700 font-bold bg-white hover:bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm">
          <ChevronRight className="w-4 h-4 rotate-180" /> Terug
        </button>
      </div>

      {/* HOOFDCARD — naam + subtitle links, bedrag + label rechts */}
      <div className="bg-white rounded-2xl shadow-sm p-5 border border-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-black text-slate-900 truncate">{p.tenant_name || 'Onbekende huurder'}</h1>
            {p.apartment_number && (
              <p className="text-xs text-slate-500">
                {p.location_name ? `${p.location_name} · ` : ''}Appt. {p.apartment_number}
              </p>
            )}
            {p.note && <p className="text-sm text-slate-600 mt-2">{p.note}</p>}
            <div className="flex items-center gap-2 flex-wrap mt-3">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${statusBadge.cls}`}>{statusBadge.l}</span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-orange-50 text-[#FF5C00]">
                {CATEGORY_LABELS[p.category] || p.category}
              </span>
              <MethodPill method={p.method} />
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">Betaald</p>
            <p className="text-2xl font-black text-slate-900">{fmtMoney(p.amount, p.currency)}</p>
            <p className="text-[11px] text-slate-500">op {date.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
          </div>
        </div>
      </div>

      {/* SUB-CARD: BETAALGEGEVENS */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Betaalgegevens</h2>
        </div>
        <div className="p-4 space-y-1.5 text-sm">
          <DetailRow label="Kwitantienummer" value={<span className="font-mono font-bold text-slate-900">{p.receipt_number}</span>} />
          <DetailRow label="Datum" value={date.toLocaleString('nl-NL')} />
          <DetailRow label="Methode" value={METHOD_LABELS[p.method] || p.method} />
          {p.period_month && <DetailRow label="Periode" value={`${MONTHS_NL[p.period_month - 1]} ${p.period_year}`} />}
          {p.approved_by && <DetailRow label="Goedgekeurd door" value={p.approved_by} />}
        </div>
      </div>

      {/* SUB-CARD: GEKOPPELDE FACTUUR (indien aanwezig) */}
      {p.invoice_id && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden" data-testid="payment-linked-invoice">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Gekoppelde factuur</h2>
            <span className="text-[10px] font-bold text-slate-400">1 factuur</span>
          </div>
          <div className="px-4 py-3">
            {linkedInvoice ? (() => {
              const paid = Number(linkedInvoice.paid_amount || 0);
              const total = Number(linkedInvoice.amount || 0);
              const rem = Number(linkedInvoice.remaining_amount ?? Math.max(0, total - paid));
              const pct = total > 0 ? Math.round((paid / total) * 100) : 0;
              const closed = (linkedInvoice.status || '').toLowerCase() === 'paid';
              return (
                <div>
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      closed ? 'bg-emerald-100 text-emerald-600' : 'bg-orange-100 text-orange-600'
                    }`}>
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 text-sm truncate">
                        {linkedInvoice.invoice_number}
                        <span className="ml-2 text-xs font-normal text-slate-500 capitalize">
                          {MONTHS_NL[(linkedInvoice.period_month || 1) - 1]} {linkedInvoice.period_year}
                        </span>
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {fmtMoney(paid, linkedInvoice.currency)} van {fmtMoney(total, linkedInvoice.currency)} betaald
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-black text-slate-900 text-sm">{fmtMoney(rem, linkedInvoice.currency)}</p>
                      <p className="text-[10px] text-slate-400">{closed ? 'voldaan' : 'nog open'}</p>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${closed ? 'bg-emerald-500' : 'bg-gradient-to-r from-orange-400 to-orange-600'}`}
                      style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })() : (
              <p className="text-sm text-slate-500">
                <span className="font-mono font-bold text-[#FF5C00]">{p.invoice_number}</span>
                {' '}(details worden geladen…)
              </p>
            )}
          </div>
        </div>
      )}

      {/* SUB-CARD: ACTIES */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Acties</h2>
        </div>
        <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <a href={`${apiBase}/payments/${p.id}/pdf`} target="_blank" rel="noreferrer"
            data-testid={`payment-pdf-${p.id}`}
            className="inline-flex items-center justify-center gap-2 px-2 py-2.5 bg-white border-2 border-slate-200 hover:border-slate-400 text-slate-700 font-bold rounded-xl text-xs sm:text-sm">
            <FileText className="w-4 h-4" /> PDF
          </a>
          <button onClick={() => onEmail(p)}
            data-testid={`payment-email-${p.id}`}
            className="inline-flex items-center justify-center gap-2 px-2 py-2.5 bg-white border-2 border-blue-300 hover:bg-blue-50 text-blue-700 font-bold rounded-xl text-xs sm:text-sm">
            <Mail className="w-4 h-4" /> Verstuur
          </button>
          <a href={`${apiBase}/payments/${p.id}/secure-pdf`} target="_blank" rel="noreferrer"
            data-testid={`payment-secure-pdf-${p.id}`}
            className="inline-flex items-center justify-center gap-2 px-2 py-2.5 bg-white border-2 border-orange-300 hover:bg-orange-50 text-[#FF5C00] font-bold rounded-xl text-xs sm:text-sm">
            <ShieldCheck className="w-4 h-4" /> Beveiligd
          </a>
          <button onClick={() => { onDelete(p); onBack(); }}
            data-testid={`payment-delete-${p.id}`}
            className="inline-flex items-center justify-center gap-2 px-2 py-2.5 bg-white border-2 border-red-300 hover:bg-red-500 hover:text-white text-red-600 font-bold rounded-xl text-xs sm:text-sm transition">
            <Trash2 className="w-4 h-4" /> Verwijder
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-900 font-semibold text-right">{value}</span>
    </div>
  );
}

// =====================================================================
// Payment creation modal
// =====================================================================
function PaymentForm({ tenants, onCancel, onSaved, initialInvoice = null }) {
  const [data, setData] = useState(() => {
    const base = {
      tenant_id: '', amount: 0, currency: 'SRD', method: 'contant', category: 'huur',
      period_month: new Date().getMonth() + 1, period_year: new Date().getFullYear(), note: '',
    };
    if (initialInvoice) {
      return {
        ...base,
        tenant_id: initialInvoice.tenant_id,
        amount: initialInvoice.amount,
        currency: initialInvoice.currency || 'SRD',
        period_month: initialInvoice.period_month,
        period_year: initialInvoice.period_year,
        note: `Factuur ${initialInvoice.invoice_number}`,
      };
    }
    return base;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialInvoice) return; // bedrag al ingevuld vanuit factuur
    if (data.tenant_id) {
      const t = tenants.find((x) => x.id === data.tenant_id);
      if (t && t.rent_amount && data.category === 'huur') {
        setData((d) => ({ ...d, amount: t.rent_amount, currency: t.currency || 'SRD' }));
      }
    }
  }, [data.tenant_id, data.category, tenants, initialInvoice]);

  const save = async () => {
    setLoading(true); setError('');
    try {
      const payload = {
        ...data,
        amount: parseFloat(data.amount),
        period_month: data.category === 'huur' ? parseInt(data.period_month) : null,
        period_year: data.category === 'huur' ? parseInt(data.period_year) : null,
      };
      const { data: r } = await api.post('/payments', payload);
      onSaved(r);
    } catch (e) { setError(formatError(e)); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm md:bg-white/30 md:backdrop-blur-md flex items-end md:items-center justify-center md:p-4 modal-open animate-fade-in"
      data-testid="payment-modal" onClick={onCancel}>
      <div className="bg-white w-full md:max-w-lg rounded-t-3xl md:rounded-3xl shadow-2xl pt-3 pb-6 px-5 md:p-8 animate-slide-up-sheet md:animate-slide-up max-h-[92vh] overflow-auto"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 24px), 24px)' }}
        onClick={(e) => e.stopPropagation()}>
        {/* Drag-handle alleen op mobile, signaalt "swipe down to close" */}
        <div className="md:hidden flex justify-center mb-3">
          <span className="w-10 h-1.5 rounded-full bg-slate-200" />
        </div>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xl font-black text-slate-900">Nieuwe betaling</h3>
          <button onClick={onCancel} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        {error && <div className="mb-4 p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Huurder *</label>
            <select value={data.tenant_id} onChange={(e) => setData({ ...data, tenant_id: e.target.value })} data-testid="pay-tenant" required
              className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none bg-white">
              <option value="">— Kies huurder —</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name}{t.apartment_number ? ` (Appt. ${t.apartment_number})` : ''}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Categorie</label>
              <select value={data.category} onChange={(e) => setData({ ...data, category: e.target.value })} data-testid="pay-category"
                className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none bg-white">
                <option value="huur">Huur</option>
                <option value="servicekosten">Servicekosten</option>
                <option value="borg">Borg</option>
                <option value="boete">Boete</option>
                <option value="overig">Overig</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Betaalwijze</label>
              <select value={data.method} onChange={(e) => setData({ ...data, method: e.target.value })} data-testid="pay-method"
                className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none bg-white">
                <option value="contant">Contant</option>
                <option value="bank">Bank</option>
                <option value="mope">Uni5Pay</option>
                <option value="sumup">SumUp</option>
                <option value="uni5pay">Uni5Pay</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Bedrag *</label>
              <input type="number" step="0.01" value={data.amount} onChange={(e) => setData({ ...data, amount: e.target.value })} required
                data-testid="pay-amount"
                className="w-full mt-1 h-12 px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Valuta</label>
              <select value={data.currency} onChange={(e) => setData({ ...data, currency: e.target.value })} data-testid="pay-currency"
                className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none bg-white">
                <option value="SRD">SRD</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>
          {data.category === 'huur' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Maand</label>
                <select value={data.period_month} onChange={(e) => setData({ ...data, period_month: e.target.value })}
                  data-testid="pay-month"
                  className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none bg-white">
                  {MONTHS_NL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Jaar</label>
                <input type="number" value={data.period_year} onChange={(e) => setData({ ...data, period_year: e.target.value })}
                  data-testid="pay-year"
                  className="w-full mt-1 h-12 px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
              </div>
            </div>
          )}
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Notitie</label>
            <input value={data.note} onChange={(e) => setData({ ...data, note: e.target.value })} data-testid="pay-note"
              className="w-full mt-1 h-12 px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onCancel} className="flex-1 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">Annuleren</button>
          <button onClick={save} disabled={loading || !data.tenant_id || !data.amount}
            data-testid="pay-save"
            className="flex-1 h-12 rounded-xl bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
            Registreer betaling
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Maand-stepper — pijltjes om maand vooruit/terug te navigeren
// =====================================================================
function MonthStepper({ year, month, onPrev, onNext, isCurrent, count, sum, currency, compact = false }) {
  const label = `${MONTHS_NL[month]} ${year}`;
  return (
    <div className={`flex items-center justify-between gap-2 bg-white rounded-2xl border border-orange-100 ${compact ? 'px-2 py-1.5' : 'px-3 py-2'}`}
      data-testid="month-stepper">
      <button type="button" onClick={onPrev} data-testid="month-prev"
        className="w-9 h-9 rounded-xl bg-slate-50 hover:bg-orange-50 active:scale-95 transition flex items-center justify-center text-slate-700">
        <ChevronLeft className="w-4 h-4" strokeWidth={2.4} />
      </button>
      <div className="flex-1 min-w-0 text-center">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 leading-tight">
          {isCurrent ? 'Deze maand' : 'Maand'}
        </p>
        <p className="font-extrabold text-slate-900 capitalize tracking-tight leading-tight truncate"
          style={{ fontSize: 'clamp(14px, 4vw, 17px)' }} data-testid="month-stepper-label">
          {label}
        </p>
        {!compact && (
          <p className="text-[10px] text-slate-500 font-bold leading-tight mt-0.5">
            {count} betaling{count !== 1 ? 'en' : ''} · {currency} {fmtAmountWhole(sum)}
          </p>
        )}
      </div>
      <button type="button" onClick={onNext} data-testid="month-next"
        disabled={isCurrent}
        className="w-9 h-9 rounded-xl bg-slate-50 hover:bg-orange-50 disabled:opacity-40 disabled:hover:bg-slate-50 active:scale-95 transition flex items-center justify-center text-slate-700">
        <ChevronRight className="w-4 h-4" strokeWidth={2.4} />
      </button>
    </div>
  );
}

// FilterMenu en Tab componenten verwijderd — Payments toont nu altijd de
// huidige maand-filter; navigatie via MonthStepper.

// =====================================================================
// Main page
// =====================================================================
export default function Payments() {
  const [items, setItems] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [pending, setPending] = useState([]);
  const [approveFor, setApproveFor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [emailing, setEmailing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [tab] = useState('month'); // altijd op Maand; vandaag-tab/methodes verwijderd
  const [detailPayment, setDetailPayment] = useState(null);
  const [expanded, setExpanded] = useState(null); // Alleen voor MOBILE inline-expand
  const toggleExpandMobile = (id) => setExpanded((cur) => (cur === id ? null : id));
  const today = useMemo(() => new Date(), []);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [p, t, pend] = await Promise.all([
        api.get('/payments'),
        api.get('/tenants'),
        api.get('/payments?status=pending_approval'),
      ]);
      setItems(p.data); setTenants(t.data); setPending(pend.data || []);
    } finally { if (!silent) setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Wanneer een admin de push-notificatie van een pending betaling
  // aanklikt landt hij hier met ?filter=pending in de URL. We scrollen
  // dan automatisch naar de "Wacht op goedkeuring" sectie en geven
  // een korte pulse-highlight zodat hij direct ziet waar te tikken.
  // Refresht ook direct (in plaats van wachten op 30s-poll) want de
  // pending list is hoogstwaarschijnlijk net gemuteerd.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('filter') !== 'pending') return;
    load();
    const tryScroll = () => {
      const el = document.querySelector('[data-testid="pending-section-desktop"]')
        || document.querySelector('[data-testid="pending-section"]');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.classList.add('ring-4', 'ring-amber-400', 'ring-offset-2');
        setTimeout(() => el.classList.remove('ring-4', 'ring-amber-400', 'ring-offset-2'), 2400);
      }
    };
    // Wacht tot pending lijst is geladen + DOM gerendered.
    const t = setTimeout(tryScroll, 600);
    return () => clearTimeout(t);
  }, [load]);
  // Globale event-listener: andere componenten (zoals de QuickPay knop in
  // de top header, of de "Betaal"-knop op Facturen) kunnen `quick-pay-open`
  // dispatchen om de PaymentForm direct te openen. Werkt vanuit elke route.
  const [prefillInvoice, setPrefillInvoice] = useState(null);
  useEffect(() => {
    const onOpen = (e) => {
      setPrefillInvoice(e?.detail?.invoice || null);
      setCreating(true);
    };
    window.addEventListener('quick-pay-open', onOpen);
    return () => window.removeEventListener('quick-pay-open', onOpen);
  }, []);
  // Stille polling — snel (3s) zodat nieuwe pending betalingen vrijwel
  // realtime verschijnen ook als de SW push miss (bv. PWA in achtergrond
  // stond bij binnenkomst). Geen spinner / scroll-reset tijdens auto-refresh.
  useAutoRefresh(() => load({ silent: true }), { interval: 3000, enabled: !creating && !emailing });

  // Server-Sent Events — INSTANT push (~50ms latency) zodra de backend een
  // nieuwe pending betaling registreert. Veel sneller dan FCM/APNS WebPush.
  // Triggert direct een silent reload zodat de rij in UI verschijnt voordat
  // de notificatie pop-up ook maar half geanimeerd is.
  useAdminEvents((evt) => {
    if (evt?.type === 'notification') {
      load({ silent: true });
    }
  }, { enabled: !creating && !emailing });

  // Push-notificatie binnen → direct silent reload zodat de pending sectie
  // meteen up-to-date is (i.p.v. wachten op 3s poll). Triggert óók bij
  // window focus (zelfs zonder push) — perfect voor "PWA terug op de
  // voorgrond" scenario.
  useEffect(() => {
    const refresh = () => load({ silent: true });
    const onSwMsg = (ev) => {
      const t = ev?.data?.type;
      if (t === 'BADGE_CHANGED' || t === 'SW_ACTIVATED') refresh();
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', onSwMsg);
    }
    // Extra: dispatch ook bij elke focus/visibilitychange als safety net
    const onFocus = () => refresh();
    const onVis = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', onSwMsg);
      }
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  const apiBase = `${process.env.REACT_APP_BACKEND_URL}/api`;

  // Maand-picker — selectie van een specifieke (jaar, maand) waarop "Maand"
  // tab filtert. Default = huidige maand. Pijltjes stappen 1 maand terug/vooruit.
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth()); // 0-11
  const stepMonth = (delta) => {
    const d = new Date(selectedYear, selectedMonth + delta, 1);
    setSelectedYear(d.getFullYear());
    setSelectedMonth(d.getMonth());
  };
  const isCurrentMonth = selectedYear === today.getFullYear() && selectedMonth === today.getMonth();

  // Sorteer: nieuwste eerst
  const sorted = useMemo(() => {
    return [...items].sort((a, b) => new Date(b.paid_at) - new Date(a.paid_at));
  }, [items]);

  // KPI metrics
  const totalAmount = useMemo(() => sorted.reduce((s, p) => s + Number(p.amount || 0), 0), [sorted]);
  const currency = sorted[0]?.currency || 'SRD';
  const startOfToday = startOfDayUTC(today);
  const startOfWeek = new Date(startOfToday); startOfWeek.setDate(startOfWeek.getDate() - 7);
  const monthStart = new Date(selectedYear, selectedMonth, 1);
  const monthEnd = new Date(selectedYear, selectedMonth + 1, 1);

  const todayItems = useMemo(() => sorted.filter((p) => new Date(p.paid_at) >= startOfToday), [sorted, startOfToday]);
  const weekItems = useMemo(() => sorted.filter((p) => new Date(p.paid_at) >= startOfWeek), [sorted, startOfWeek]);
  const monthItems = useMemo(() => sorted.filter((p) => {
    const d = new Date(p.paid_at);
    return d >= monthStart && d < monthEnd;
  }), [sorted, monthStart, monthEnd]);

  const sumOf = (arr) => arr.reduce((s, p) => s + Number(p.amount || 0), 0);
  const todaySum = sumOf(todayItems);
  const monthSum = sumOf(monthItems);
  const avgPerPayment = sorted.length > 0 ? totalAmount / sorted.length : 0;

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    let base = sorted;
    if (tab === 'today') base = todayItems;
    if (tab === 'week') base = weekItems;
    if (tab === 'month') base = monthItems;
    return base.filter((p) => {
      if (q) {
        const hay = `${p.tenant_name || ''} ${p.receipt_number || ''} ${p.apartment_number || ''} ${p.location_name || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sorted, tab, search, todayItems, monthItems]);

  const toggleExpand = toggleExpandMobile;

  // Rijen starten altijd DICHT — de gebruiker klapt zelf open wanneer nodig.
  // (De eerdere "auto-open newest" gedraging is verwijderd op verzoek zodat
  //  de lijst rustig oogt en alle rijen consistent zijn.)

  // Detail-page routing: bij klik op een betaling openen we een aparte
  // pagina (analoog aan PlanDetail in Betalingsregelingen). Terug-knop
  // sluit en herlaadt.
  if (detailPayment) {
    return (
      <PaymentDetail
        payment={detailPayment}
        onBack={() => { setDetailPayment(null); load({ silent: true }); }}
        onEmail={(item) => setEmailing(item)}
        onDelete={(item) => setDeleting(item)}
        apiBase={apiBase}
      />
    );
  }

  return (
    <div data-testid="payments-page">
      {/* =================================================================
          MOBILE (phone) — POS-terminal stijl. Verborgen vanaf md (>=768px).
          ================================================================= */}
      <div className="md:hidden space-y-4" data-testid="payments-mobile">
        <div className="flex items-center justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            <h1 className="font-black text-slate-900 tracking-tight leading-[1.02]"
              style={{ fontSize: 'clamp(32px, 11vw, 56px)' }}>
              Betalingen
            </h1>
            <p className="text-slate-500 mt-1 font-bold"
              style={{ fontSize: 'clamp(12px, 3.4vw, 15px)' }}>
              {items.length} kwitanties
            </p>
          </div>
          <div className="bg-white rounded-2xl shadow-[0_8px_22px_-10px_rgba(0,0,0,0.18)] shrink-0"
            style={{ padding: 'clamp(8px, 2.4vw, 12px) clamp(10px, 3vw, 14px)' }}
            data-testid="mp-today-stat">
            <p className="font-bold uppercase tracking-wider text-slate-500"
              style={{ fontSize: 'clamp(9px, 2.4vw, 11px)' }}>
              Vandaag
            </p>
            <p className="font-black text-slate-900 tracking-tight whitespace-nowrap leading-tight mt-0.5"
              style={{ fontSize: 'clamp(14px, 4vw, 19px)' }}>
              {currency} {fmtAmountWhole(todaySum)}
            </p>
            <p className="text-slate-400 font-bold mt-0.5 text-center"
              style={{ fontSize: 'clamp(9px, 2.4vw, 11px)' }}>
              {todayItems.length} betaling{todayItems.length !== 1 ? 'en' : ''}
            </p>
          </div>
        </div>

        <button onClick={() => setCreating(true)} data-testid="mp-new-btn" type="button"
          className="w-full rounded-2xl bg-[#FF6A1A] hover:bg-[#F05C0E] text-white font-black inline-flex items-center justify-center gap-2 shadow-[0_14px_28px_-10px_rgba(255,92,0,0.55)] active:scale-[0.985] transition-transform tracking-tight"
          style={{ height: 'clamp(56px, 16vw, 72px)', fontSize: 'clamp(15px, 4.2vw, 19px)' }}>
          <Plus className="stroke-[2.5]" style={{ width: 'clamp(20px, 5.5vw, 26px)', height: 'clamp(20px, 5.5vw, 26px)' }} /> Nieuwe betaling
        </button>

        {tab === 'month' && (
          <MonthStepper year={selectedYear} month={selectedMonth}
            onPrev={() => stepMonth(-1)} onNext={() => stepMonth(1)}
            isCurrent={isCurrentMonth}
            count={monthItems.length} sum={sumOf(monthItems)} currency={currency} />
        )}

        {/* PENDING APPROVAL — sectie bovenaan, vóór de approved-lijst.
            Alleen zichtbaar als er pending betalingen wachten op goedkeuring.
            Bedragen tellen NIET mee in "Vandaag" / "Maand" totalen. */}
        {pending.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 shadow-[0_1px_4px_-2px_rgba(245,158,11,0.20)]" data-testid="pending-section">
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Wacht op goedkeuring · {pending.length}
              </p>
            </div>
            <div className="space-y-2">
              {pending.map((p) => (
                <PendingPaymentCard key={p.id} p={p} onApprove={() => setApproveFor(p)} />
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-2xl border border-orange-100 p-10 text-center">
            <Loader2 className="w-6 h-6 text-orange-400 animate-spin mx-auto" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="bg-white rounded-2xl border border-orange-100 p-8 text-center" data-testid="mp-empty">
            <Receipt className="w-9 h-9 text-orange-300 mx-auto mb-2" />
            <p className="text-[13px] text-slate-500 font-bold">
              {items.length === 0 ? 'Nog geen betalingen.' : 'Geen resultaten voor deze filter.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredItems.map((p) => (
              <div key={p.id} data-testid={`mp-row-${p.id}`}>
                <MobilePaymentCard p={p} onClick={() => toggleExpand(p.id)} />
                {expanded === p.id && (
                  <div className="mt-1.5 mb-1 px-1.5" data-testid={`mp-detail-${p.id}`}>
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5 space-y-2 text-[12px]">
                      <DetailRow label="Kwitantie" value={<span className="font-mono font-bold">{p.receipt_number}</span>} />
                      {p.invoice_number && (
                        <DetailRow label="Factuur" value={<span className="font-mono font-bold text-[#FF5C00]">{p.invoice_number}</span>} />
                      )}
                      <DetailRow label="Datum" value={new Date(p.paid_at).toLocaleString('nl-NL')} />
                      <DetailRow label="Categorie" value={CATEGORY_LABELS[p.category] || p.category} />
                      <DetailRow label="Methode" value={METHOD_LABELS[p.method] || p.method} />
                      {p.period_month && (
                        <DetailRow label="Periode" value={`${MONTHS_NL[p.period_month - 1]} ${p.period_year}`} />
                      )}
                      {p.approved_by && (
                        <DetailRow label="Goedgekeurd door" value={p.approved_by} />
                      )}
                      {p.note && <DetailRow label="Notitie" value={p.note} />}
                      <div className="grid grid-cols-4 gap-1.5 pt-2">
                        <a href={`${apiBase}/payments/${p.id}/pdf`} target="_blank" rel="noreferrer"
                          data-testid={`mp-pdf-${p.id}`}
                          className="inline-flex items-center justify-center gap-1 px-1.5 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl text-[11px]">
                          <FileText className="w-3.5 h-3.5" /> PDF
                        </a>
                        <button onClick={() => setEmailing(p)} type="button"
                          data-testid={`mp-email-${p.id}`}
                          className="inline-flex items-center justify-center gap-1 px-1.5 py-2 bg-white border border-blue-200 text-blue-700 font-bold rounded-xl text-[11px]">
                          <Mail className="w-3.5 h-3.5" /> Mail
                        </button>
                        <a href={`${apiBase}/payments/${p.id}/secure-pdf`} target="_blank" rel="noreferrer"
                          data-testid={`mp-secure-${p.id}`}
                          className="inline-flex items-center justify-center gap-1 px-1.5 py-2 bg-white border border-orange-200 text-[#FF5C00] font-bold rounded-xl text-[11px]">
                          <ShieldCheck className="w-3.5 h-3.5" /> QR
                        </a>
                        <button onClick={() => setDeleting(p)} type="button"
                          data-testid={`mp-delete-${p.id}`}
                          className="inline-flex items-center justify-center gap-1 px-1.5 py-2 bg-white border border-red-200 text-red-600 font-bold rounded-xl text-[11px]">
                          <Trash2 className="w-3.5 h-3.5" /> Wis
                        </button>
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
          TABLET + DESKTOP (>=768px) — ongewijzigde layout.
          ================================================================= */}
      <div className="hidden md:block space-y-4 sm:space-y-5">
      {/* HEADER — compact layout matching Betalingsregelingen: titel +
          subtitle + primaire knop op dezelfde rij. Vroeger stond er een
          3xl-4xl titel + de knop op een aparte rij, wat "gedrongen"
          aanvoelde. Nu is het rustiger en consistent met de rest van de
          admin-app. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Betalingen</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {items.length} kwitantie{items.length === 1 ? '' : 's'} geregistreerd — beoordeel pending en registreer nieuwe betalingen.
          </p>
        </div>
        <button onClick={() => setCreating(true)} data-testid="payment-new-btn"
          className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold rounded-2xl text-sm shadow-[0_10px_25px_-5px_rgba(255,92,0,0.5)]">
          <Plus className="w-4 h-4" /> Nieuwe betaling
        </button>
      </div>

      {/* KPI-kaarten op desktop bewust verwijderd op verzoek — pagina blijft
          strak. Mobile houdt zijn "Vandaag" mini-card wel (verderop). */}

      {/* PENDING APPROVAL — desktop variant. Tonen vóór de approved-lijst
          zodat beheerder direct ziet wat z'n medewerkers indienen. */}
      {pending.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-[0_1px_4px_-2px_rgba(245,158,11,0.20)]" data-testid="pending-section-desktop">
          <div className="flex items-center justify-between mb-3 px-1">
            <p className="text-[11px] font-black uppercase tracking-widest text-amber-700 inline-flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              Wacht op goedkeuring · {pending.length}
            </p>
          </div>
          <div className="space-y-2">
            {pending.map((p) => (
              <PendingPaymentCard key={p.id} p={p} onApprove={() => setApproveFor(p)} />
            ))}
          </div>
        </div>
      )}

      {/* TAB BAR — verborgen op mobiel/desktop; we tonen alleen de maand-stepper hieronder */}

      {tab === 'month' && (
        <MonthStepper year={selectedYear} month={selectedMonth}
          onPrev={() => stepMonth(-1)} onNext={() => stepMonth(1)}
          isCurrent={isCurrentMonth}
          count={monthItems.length} sum={sumOf(monthItems)} currency={currency} />
      )}

      {/* SEARCH */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Zoek huurder, kwitantienummer, appartement..."
          data-testid="payment-search"
          className="w-full h-12 pl-11 pr-4 rounded-2xl bg-white border border-orange-100 text-sm focus:border-[#FF5C00] outline-none" />
      </div>

      {/* Geen column-header meer — we gebruiken de card-lijst layout van
          Betalingsregelingen waar elke kaart z'n eigen labels/badges bevat. */}

      {/* ROWS */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-orange-100 p-10 text-center">
          <Loader2 className="w-7 h-7 text-orange-400 animate-spin mx-auto" />
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-white rounded-2xl border border-orange-100 p-10 text-center" data-testid="payments-empty">
          <Receipt className="w-10 h-10 text-orange-300 mx-auto mb-3" />
          <p className="text-slate-500 font-semibold">
            {items.length === 0 ? 'Nog geen betalingen.' : 'Geen resultaten voor deze filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2 sm:space-y-2.5">
          {filteredItems.map((p) => (
            <PaymentRow key={p.id} p={p} onOpen={setDetailPayment} />
          ))}
        </div>
      )}
      </div>

      {/* MODALS */}
      {creating && <PaymentForm tenants={tenants} initialInvoice={prefillInvoice}
        onCancel={() => { setCreating(false); setPrefillInvoice(null); }}
        onSaved={() => { setCreating(false); setPrefillInvoice(null); load(); }} />}
      {approveFor && (
        <ApprovePaymentSheet
          payment={approveFor}
          onCancel={() => setApproveFor(null)}
          onApproved={() => { setApproveFor(null); load(); }}
        />
      )}
      {emailing && (
        <SendDialog
          documentType="payment"
          documentId={emailing.id}
          documentLabel="kwitantie"
          title={`Kwitantie ${emailing.receipt_number} verzenden`}
          tenantEmail={tenants.find((t) => t.id === emailing.tenant_id)?.email || ''}
          tenantPhone={tenants.find((t) => t.id === emailing.tenant_id)?.phone || ''}
          tenantName={emailing.tenant_name}
          onClose={() => setEmailing(null)} />
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          data-testid="payment-delete-modal" onClick={() => !deleteBusy && setDeleting(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 bg-red-500 text-white">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-6 h-6" />
                <p className="text-lg font-extrabold">Betaling verwijderen?</p>
              </div>
            </div>
            <div className="p-6 space-y-3">
              <p className="text-sm text-slate-700">
                Je staat op het punt betaling <span className="font-mono font-bold">{deleting.receipt_number}</span> van
                <span className="font-bold"> {deleting.tenant_name}</span> ter waarde van
                <span className="font-bold"> {fmtMoney(deleting.amount, deleting.currency)}</span> permanent te verwijderen.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                <p className="font-bold mb-1">Belangrijk:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>De <b>gekoppelde factuur(en)</b> worden ook verwijderd (mits er geen andere betalingen aan hangen).</li>
                  <li>Indien meerdere betalingen aan dezelfde factuur hangen, wordt alleen het bedrag teruggedraaid.</li>
                  <li>Gekoppelde betalingsregeling-termijnen worden teruggezet naar "open".</li>
                </ul>
              </div>
              <p className="text-xs text-red-600 font-bold">
                Deze actie kan niet ongedaan gemaakt worden.
              </p>
            </div>
            <div className="px-6 py-4 bg-slate-50 flex gap-2 border-t border-slate-100">
              <button onClick={() => setDeleting(null)} disabled={deleteBusy}
                data-testid="payment-delete-cancel"
                className="flex-1 py-2.5 rounded-lg bg-white border-2 border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-100 disabled:opacity-50">
                Annuleren
              </button>
              <button onClick={async () => {
                setDeleteBusy(true);
                try {
                  await api.delete(`/payments/${deleting.id}`);
                  setDeleting(null);
                  load();
                } catch (e) {
                  alert(formatError(e) || 'Kon betaling niet verwijderen');
                } finally {
                  setDeleteBusy(false);
                }
              }} disabled={deleteBusy}
                data-testid="payment-delete-confirm"
                className="flex-[2] py-2.5 rounded-lg bg-red-500 text-white font-bold text-sm hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-2">
                {deleteBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Definitief verwijderen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* eslint-disable no-unused-vars */
// Houd CalendarDays + CheckCircle2 imports voor toekomstige uitbreidingen.
const _unused = [CalendarDays, CheckCircle2];
