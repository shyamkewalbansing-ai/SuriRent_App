import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Plus, X, Check, Loader2, Search, FileText, Mail, ShieldCheck, ChevronRight,
  ChevronDown, SlidersHorizontal, CalendarDays, Banknote, CheckCircle2,
  TrendingUp, Receipt, Wallet, Home as HomeIcon,
} from 'lucide-react';
import { api, formatError, fmtMoney, MONTHS_NL } from '../../../lib/api';
import { useAutoRefresh } from '../../../lib/auto-refresh';
import { SendDialog } from '../../../components/EmailDialog';

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
function startOfDayUTC(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

const METHOD_LABELS = {
  contant: 'Contant',
  bank: 'Bank',
  mope: 'Mope',
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
  return (
    <button onClick={onClick} type="button"
      data-testid={`mp-card-${p.id}`}
      className="w-full text-left bg-gradient-to-br from-[#FFFBF2] via-[#FFF6E4] to-[#FFF0D2] rounded-3xl shadow-[0_3px_10px_-6px_rgba(220,150,60,0.18)] active:scale-[0.99] transition-transform"
      style={{
        padding: 'clamp(14px, 4vw, 20px) clamp(14px, 4vw, 20px)',
      }}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="rounded-full flex items-center justify-center font-black shrink-0 shadow-[0_2px_6px_-2px_rgba(0,0,0,0.12)]"
          style={{
            background: avatar.bg, color: avatar.fg,
            width: 'clamp(48px, 13vw, 60px)', height: 'clamp(48px, 13vw, 60px)',
            fontSize: 'clamp(16px, 4.4vw, 20px)',
          }}>
          {initials(p.tenant_name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-extrabold text-slate-900 leading-tight truncate"
            style={{ fontSize: 'clamp(16px, 4.4vw, 20px)' }}>
            {p.tenant_name || '—'}
          </p>
          <p className="text-slate-600/85 font-semibold truncate mt-0.5"
            style={{ fontSize: 'clamp(11px, 3vw, 13px)' }}>
            {sub}
          </p>
          <div className="mt-1.5">
            <span className="inline-block font-bold uppercase tracking-wider rounded-md bg-emerald-50 text-emerald-700"
              style={{
                fontSize: 'clamp(10px, 2.8vw, 12px)',
                padding: 'clamp(2px, 0.8vw, 4px) clamp(7px, 2vw, 10px)',
              }}>
              {METHOD_LABELS[p.method] || p.method}
            </span>
          </div>
        </div>
        <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
          <p className="font-black text-emerald-600 tracking-tight whitespace-nowrap"
            data-testid={`mp-amount-${p.id}`}
            style={{ fontSize: 'clamp(15px, 4.2vw, 19px)' }}>
            {p.currency} {fmtAmount(p.amount, p.currency)}
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

function MobileTabPill({ active, onClick, label, count, testid }) {
  return (
    <button onClick={onClick} type="button" data-testid={testid}
      className={`shrink-0 relative px-3 pb-2 pt-1 inline-flex flex-col items-center justify-end font-extrabold transition ${
        active ? 'text-[#FF8A3D]' : 'text-slate-500'
      }`}
      style={{ fontSize: 'clamp(15px, 4.2vw, 18px)' }}>
      <span className="leading-tight">{label}</span>
      <span className={`leading-tight mt-0.5 font-bold ${active ? 'text-[#FF8A3D]/85' : 'text-slate-400'}`}
        style={{ fontSize: 'clamp(11px, 3vw, 13px)' }}>
        ({count})
      </span>
      {active && <span className="absolute bottom-0 left-2 right-2 h-[3px] rounded-full bg-[#FF8A3D]" />}
    </button>
  );
}

// =====================================================================
// Payment row
// =====================================================================
function PaymentRow({ p, expanded, onToggle, onEmail, apiBase }) {
  const avatar = avatarColor(p.tenant_name);
  const tenantSub = (() => {
    if (p.location_name && p.apartment_number) return `${p.location_name} · ${p.apartment_number}`;
    if (p.apartment_number) return p.apartment_number;
    return '—';
  })();
  const date = new Date(p.paid_at);
  return (
    <div className="bg-white rounded-2xl border border-orange-100 border-l-4 border-l-emerald-400 overflow-hidden"
      data-testid={`payment-row-${p.id}`}>
      <button onClick={onToggle} className="w-full text-left p-3 sm:p-3 hover:bg-orange-50/30 transition">
        <div className="grid grid-cols-[auto_1fr_auto] md:grid-cols-[auto_minmax(0,1.6fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.1fr)_16px] items-center gap-3">
          {/* Avatar */}
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center font-black text-sm shrink-0"
            style={{ background: avatar.bg, color: avatar.fg }}>
            {initials(p.tenant_name)}
          </div>

          {/* Huurder + locatie · appartement */}
          <div className="min-w-0">
            <p className="font-bold text-slate-900 text-sm sm:text-[15px] truncate">{p.tenant_name || '—'}</p>
            <p className="text-[11px] sm:text-xs text-slate-500 font-medium truncate">{tenantSub}</p>
            {/* Mobiel: methode pill onder de naam */}
            <div className="mt-1 md:hidden">
              <MethodPill method={p.method} />
            </div>
          </div>

          {/* Desktop: receipt number + datum + methode */}
          <div className="hidden md:flex flex-col">
            <p className="font-mono text-xs font-bold text-slate-700">{p.receipt_number}</p>
            <p className="text-[11px] text-slate-500">
              {date.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>

          {/* Desktop: categorie */}
          <div className="hidden md:flex">
            <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-orange-50 text-[#FF5C00]">
              {CATEGORY_LABELS[p.category] || p.category}
            </span>
          </div>

          {/* Desktop: methode pill */}
          <div className="hidden md:flex">
            <MethodPill method={p.method} />
          </div>

          {/* Bedrag */}
          <div className="text-right shrink-0 whitespace-nowrap">
            <p className="text-base sm:text-lg font-black tracking-tight text-emerald-600"
              data-testid={`payment-amount-${p.id}`}>
              {p.currency} {fmtAmount(p.amount, p.currency)}
            </p>
            {p.period_month && (
              <p className="text-[10px] text-slate-400 mt-0.5 capitalize">
                {MONTHS_NL[p.period_month - 1].slice(0, 3)} {p.period_year}
              </p>
            )}
          </div>

          {expanded
            ? <ChevronDown className="w-4 h-4 text-slate-400" />
            : <ChevronRight className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-3 sm:px-4 pb-4 -mt-1" data-testid={`payment-detail-${p.id}`}>
          <div className="bg-emerald-50/60 rounded-2xl p-4">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
              <div className="space-y-1.5 text-sm">
                <DetailRow label="Kwitantienummer" value={<span className="font-mono font-bold text-slate-900">{p.receipt_number}</span>} />
                {p.invoice_number && (
                  <DetailRow label="Factuur" value={
                    <span className="font-mono font-bold text-[#FF5C00]">{p.invoice_number}</span>
                  } />
                )}
                <DetailRow label="Datum" value={date.toLocaleString('nl-NL')} />
                <DetailRow label="Categorie" value={CATEGORY_LABELS[p.category] || p.category} />
                <DetailRow label="Methode" value={METHOD_LABELS[p.method] || p.method} />
                {p.period_month && <DetailRow label="Periode" value={`${MONTHS_NL[p.period_month - 1]} ${p.period_year}`} />}
                {p.approved_by && <DetailRow label="Goedgekeurd door" value={p.approved_by} />}
                {p.note && <DetailRow label="Notitie" value={p.note} />}
              </div>
              <div className="md:border-l md:border-emerald-200 md:pl-4 md:min-w-[160px] flex md:flex-col justify-between md:justify-center items-end md:items-end">
                <p className="text-xs font-bold text-slate-500">Betaald bedrag</p>
                <p className="text-xl sm:text-2xl font-black tracking-tight text-emerald-600">
                  {fmtMoney(p.amount, p.currency)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-4">
              <a href={`${apiBase}/payments/${p.id}/pdf`} target="_blank" rel="noreferrer"
                data-testid={`payment-pdf-${p.id}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center justify-center gap-2 px-2 py-2.5 bg-white border-2 border-slate-200 hover:border-slate-400 text-slate-700 font-bold rounded-xl text-xs sm:text-sm">
                <FileText className="w-4 h-4" /> PDF
              </a>
              <button onClick={(e) => { e.stopPropagation(); onEmail(p); }}
                data-testid={`payment-email-${p.id}`}
                className="inline-flex items-center justify-center gap-2 px-2 py-2.5 bg-white border-2 border-blue-300 hover:bg-blue-50 text-blue-700 font-bold rounded-xl text-xs sm:text-sm">
                <Mail className="w-4 h-4" /> Verstuur
              </button>
              <a href={`${apiBase}/payments/${p.id}/secure-pdf`} target="_blank" rel="noreferrer"
                data-testid={`payment-secure-pdf-${p.id}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center justify-center gap-2 px-2 py-2.5 bg-white border-2 border-orange-300 hover:bg-orange-50 text-[#FF5C00] font-bold rounded-xl text-xs sm:text-sm">
                <ShieldCheck className="w-4 h-4" /> <span className="hidden sm:inline">Beveiligd</span><span className="sm:hidden">QR</span>
              </a>
            </div>
          </div>
        </div>
      )}
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
    <div className="fixed inset-0 z-50 bg-white/30 backdrop-blur-md flex items-center justify-center p-4 modal-open"
      data-testid="payment-modal" onClick={onCancel}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 sm:p-8 animate-slide-up max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}>
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
                <option value="mope">Mope</option>
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
// Filter dropdown
// =====================================================================
function FilterMenu({ method, setMethod, onClose }) {
  const opts = [
    { v: 'all', l: 'Alle methodes' },
    { v: 'contant', l: 'Contant' },
    { v: 'bank', l: 'Bank' },
    { v: 'mope', l: 'Mope' },
    { v: 'sumup', l: 'SumUp' },
    { v: 'uni5pay', l: 'Uni5Pay' },
  ];
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-12 z-50 bg-white rounded-xl shadow-2xl border border-orange-100 py-1 min-w-[200px]"
        data-testid="filter-menu">
        {opts.map((o) => (
          <button key={o.v} onClick={() => { setMethod(o.v); onClose(); }}
            data-testid={`filter-${o.v}`}
            className={`w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-orange-50 transition ${
              method === o.v ? 'text-[#FF5C00] font-bold' : 'text-slate-700'
            }`}>{o.l}</button>
        ))}
      </div>
    </>
  );
}

function Tab({ v, tab, setTab, label, testid }) {
  const active = tab === v;
  return (
    <button onClick={() => setTab(v)} data-testid={testid}
      className={`relative px-3 sm:px-4 h-9 sm:h-10 rounded-xl font-bold text-xs sm:text-sm inline-flex items-center gap-1.5 transition ${
        active ? 'text-[#FF5C00]' : 'text-slate-500 hover:text-slate-700'
      }`}>
      {label}
      {active && <span className="absolute -bottom-2 left-3 right-3 h-0.5 bg-[#FF5C00] rounded-full" />}
    </button>
  );
}

// =====================================================================
// Main page
// =====================================================================
export default function Payments() {
  const [items, setItems] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [emailing, setEmailing] = useState(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all'); // all | today | week | month
  const [methodFilter, setMethodFilter] = useState('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [expanded, setExpanded] = useState(null);
  // Track de meest recent gezien betaling-id zodat we de "nieuwste" rij
  // automatisch kunnen open klappen wanneer er een binnenkomt via auto-refresh.
  const lastNewestRef = useRef(null);
  const today = useMemo(() => new Date(), []);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [p, t] = await Promise.all([api.get('/payments'), api.get('/tenants')]);
      setItems(p.data); setTenants(t.data);
    } finally { if (!silent) setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
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
  // Stille polling — geen spinner / scroll-reset tijdens auto-refresh.
  useAutoRefresh(() => load({ silent: true }), { interval: 8000, enabled: !creating && !emailing });

  const apiBase = `${process.env.REACT_APP_BACKEND_URL}/api`;

  // Sorteer: nieuwste eerst
  const sorted = useMemo(() => {
    return [...items].sort((a, b) => new Date(b.paid_at) - new Date(a.paid_at));
  }, [items]);

  // KPI metrics
  const totalAmount = useMemo(() => sorted.reduce((s, p) => s + Number(p.amount || 0), 0), [sorted]);
  const currency = sorted[0]?.currency || 'SRD';
  const startOfToday = startOfDayUTC(today);
  const startOfWeek = new Date(startOfToday); startOfWeek.setDate(startOfWeek.getDate() - 7);
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const todayItems = useMemo(() => sorted.filter((p) => new Date(p.paid_at) >= startOfToday), [sorted, startOfToday]);
  const weekItems = useMemo(() => sorted.filter((p) => new Date(p.paid_at) >= startOfWeek), [sorted, startOfWeek]);
  const monthItems = useMemo(() => sorted.filter((p) => new Date(p.paid_at) >= startOfMonth), [sorted, startOfMonth]);

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
      if (methodFilter !== 'all' && p.method !== methodFilter) return false;
      if (q) {
        const hay = `${p.tenant_name || ''} ${p.receipt_number || ''} ${p.apartment_number || ''} ${p.location_name || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sorted, tab, methodFilter, search, todayItems, weekItems, monthItems]);

  const toggleExpand = (id) => setExpanded((cur) => (cur === id ? null : id));

  // Auto-open gedrag voor Betalingen:
  //  • Bij eerste render: de bovenste (nieuwste) betaling staat open.
  //  • Wanneer een NIEUWE betaling binnenkomt via auto-refresh, sluiten we de
  //    eerder open rij en zetten de nieuwe betaling open. Zo ziet de
  //    beheerder direct welke kassa-betaling/admin-betaling zojuist is
  //    geregistreerd.
  //  • Een door de gebruiker handmatig open/gesloten rij wordt gerespecteerd
  //    totdat er een nieuwe betaling binnenkomt — dan klapt die nieuwe open.
  useEffect(() => {
    if (sorted.length === 0) return;
    const newestId = sorted[0].id;
    if (lastNewestRef.current === null) {
      // First load — open de nieuwste betaling.
      lastNewestRef.current = newestId;
      setExpanded(newestId);
      return;
    }
    if (newestId !== lastNewestRef.current) {
      // Een nieuwe betaling is binnengekomen → klap deze open.
      lastNewestRef.current = newestId;
      setExpanded(newestId);
    }
  }, [sorted]);

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
            <p className="font-black text-emerald-600 tracking-tight whitespace-nowrap leading-tight mt-0.5"
              style={{ fontSize: 'clamp(14px, 4vw, 19px)' }}>
              {currency} {fmtAmount(todaySum, currency)}
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

        <div className="flex items-end gap-2 pt-1">
          <div className="flex-1 min-w-0 flex items-end gap-0.5 overflow-x-auto no-scrollbar pb-1">
            <MobileTabPill active={tab === 'all'}    onClick={() => setTab('all')}    label="Alle"     count={sorted.length}     testid="mp-tab-all" />
            <MobileTabPill active={tab === 'today'}  onClick={() => setTab('today')}  label="Vandaag"  count={todayItems.length} testid="mp-tab-today" />
            <MobileTabPill active={tab === 'week'}   onClick={() => setTab('week')}   label="Week"     count={weekItems.length}  testid="mp-tab-week" />
            <MobileTabPill active={tab === 'month'}  onClick={() => setTab('month')}  label="Maand"    count={monthItems.length} testid="mp-tab-month" />
          </div>
          <div className="relative shrink-0">
            <button onClick={() => setFilterOpen(!filterOpen)} data-testid="mp-filter-btn" type="button"
              className={`rounded-2xl border bg-white inline-flex items-center justify-center shadow-sm transition ${
                methodFilter !== 'all' ? 'border-[#FF8A3D] text-[#FF8A3D]' : 'border-orange-100 text-slate-600'
              }`}
              style={{ height: 'clamp(40px, 11vw, 48px)', width: 'clamp(40px, 11vw, 48px)' }}>
              <SlidersHorizontal style={{ width: 'clamp(16px, 4.4vw, 18px)', height: 'clamp(16px, 4.4vw, 18px)' }} />
              {methodFilter !== 'all' && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#FF8A3D] ring-2 ring-white" />}
            </button>
            {filterOpen && <FilterMenu method={methodFilter} setMethod={setMethodFilter} onClose={() => setFilterOpen(false)} />}
          </div>
        </div>

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
          <div className="space-y-3">
            {filteredItems.map((p) => (
              <div key={p.id} data-testid={`mp-row-${p.id}`}>
                <MobilePaymentCard p={p} onClick={() => toggleExpand(p.id)} />
                {expanded === p.id && (
                  <div className="mt-1.5 mb-1 px-1.5" data-testid={`mp-detail-${p.id}`}>
                    <div className="bg-emerald-50/70 border border-emerald-100 rounded-2xl p-3.5 space-y-2 text-[12px]">
                      <DetailRow label="Kwitantie" value={<span className="font-mono font-bold">{p.receipt_number}</span>} />
                      {p.invoice_number && (
                        <DetailRow label="Factuur" value={<span className="font-mono font-bold text-[#FF5C00]">{p.invoice_number}</span>} />
                      )}
                      <DetailRow label="Datum" value={new Date(p.paid_at).toLocaleString('nl-NL')} />
                      <DetailRow label="Categorie" value={CATEGORY_LABELS[p.category] || p.category} />
                      {p.note && <DetailRow label="Notitie" value={p.note} />}
                      <div className="grid grid-cols-3 gap-1.5 pt-2">
                        <a href={`${apiBase}/payments/${p.id}/pdf`} target="_blank" rel="noreferrer"
                          data-testid={`mp-pdf-${p.id}`}
                          className="inline-flex items-center justify-center gap-1 px-2 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl text-[11px]">
                          <FileText className="w-3.5 h-3.5" /> PDF
                        </a>
                        <button onClick={() => setEmailing(p)} type="button"
                          data-testid={`mp-email-${p.id}`}
                          className="inline-flex items-center justify-center gap-1 px-2 py-2 bg-white border border-blue-200 text-blue-700 font-bold rounded-xl text-[11px]">
                          <Mail className="w-3.5 h-3.5" /> Verstuur
                        </button>
                        <a href={`${apiBase}/payments/${p.id}/secure-pdf`} target="_blank" rel="noreferrer"
                          data-testid={`mp-secure-${p.id}`}
                          className="inline-flex items-center justify-center gap-1 px-2 py-2 bg-white border border-orange-200 text-[#FF5C00] font-bold rounded-xl text-[11px]">
                          <ShieldCheck className="w-3.5 h-3.5" /> QR
                        </a>
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
      {/* HEADER + Mobile KPI */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">Betalingen</h1>
          <p className="text-sm text-slate-500 mt-1">
            <span className="md:hidden">{items.length} kwitanties</span>
            <span className="hidden md:inline">{items.length} kwitanties geregistreerd</span>
          </p>
        </div>
        <div className="md:hidden bg-white rounded-2xl border border-orange-100 px-4 py-3 shadow-sm shrink-0 max-w-[60%]" data-testid="kpi-mobile-card">
          <p className="text-[11px] font-semibold text-slate-500 mb-0.5">Vandaag</p>
          <p className="text-base font-black text-slate-900 tracking-tight whitespace-nowrap">
            {currency} <span className="text-emerald-600">{fmtAmount(todaySum, currency)}</span>
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">{todayItems.length} betaling{todayItems.length !== 1 ? 'en' : ''}</p>
        </div>
      </div>

      {/* DESKTOP KPI CARDS */}
      <div className="hidden md:flex bg-white rounded-2xl border border-orange-100 divide-x divide-orange-100 overflow-hidden">
        <KpiCard icon={Wallet} label="Vandaag"
          value={`${currency} ${fmtAmount(todaySum, currency)}`}
          hint={`${todayItems.length} betaling${todayItems.length !== 1 ? 'en' : ''}`}
          tone="green" testid="kpi-today" />
        <KpiCard icon={TrendingUp} label="Deze maand"
          value={`${currency} ${fmtAmount(monthSum, currency)}`}
          hint={`${monthItems.length} betaling${monthItems.length !== 1 ? 'en' : ''}`}
          tone="blue" testid="kpi-month" />
        <KpiCard icon={Receipt} label="Totaal ontvangen"
          value={`${currency} ${fmtAmount(totalAmount, currency)}`}
          hint={`gemiddeld ${fmtAmount(avgPerPayment, currency)}/betaling`}
          tone="orange" testid="kpi-total" />
      </div>

      {/* ACTION */}
      <div>
        <button onClick={() => setCreating(true)} data-testid="payment-new-btn"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 sm:py-3.5 bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold rounded-2xl text-sm sm:text-base shadow-[0_10px_25px_-5px_rgba(255,92,0,0.5)]">
          <Plus className="w-4 h-4 sm:w-5 sm:h-5" /> Nieuwe betaling
        </button>
      </div>

      {/* TAB BAR */}
      <div className="bg-white rounded-2xl border border-orange-100 px-2 sm:px-3 py-2 flex items-center gap-1 sm:gap-2" data-testid="payment-tabs">
        <Tab v="all" tab={tab} setTab={setTab} label={`Alle (${sorted.length})`} testid="tab-all" />
        <Tab v="today" tab={tab} setTab={setTab} label={`Vandaag (${todayItems.length})`} testid="tab-today" />
        <Tab v="week" tab={tab} setTab={setTab} label={`Week (${weekItems.length})`} testid="tab-week" />
        <Tab v="month" tab={tab} setTab={setTab} label={`Maand (${monthItems.length})`} testid="tab-month" />
        <div className="flex-1" />
        <div className="relative">
          <button onClick={() => setFilterOpen(!filterOpen)} data-testid="payment-filter-btn"
            className={`h-9 sm:h-10 px-3 sm:px-4 rounded-xl border bg-white inline-flex items-center gap-1.5 sm:gap-2 font-bold text-sm transition ${
              methodFilter !== 'all' ? 'border-[#FF5C00] text-[#FF5C00]' : 'border-slate-200 text-slate-700 hover:border-orange-300'
            }`}>
            <SlidersHorizontal className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Filter</span>
            {methodFilter !== 'all' && <span className="w-1.5 h-1.5 rounded-full bg-[#FF5C00]" />}
          </button>
          {filterOpen && <FilterMenu method={methodFilter} setMethod={setMethodFilter} onClose={() => setFilterOpen(false)} />}
        </div>
      </div>

      {/* SEARCH */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Zoek huurder, kwitantienummer, appartement..."
          data-testid="payment-search"
          className="w-full h-12 pl-11 pr-4 rounded-2xl bg-white border border-orange-100 text-sm focus:border-[#FF5C00] outline-none" />
      </div>

      {/* COLUMN HEADERS — desktop only */}
      <div className="hidden md:grid grid-cols-[auto_minmax(0,1.6fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.1fr)_16px] gap-3 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400 items-center">
        <span style={{ width: '40px' }} />
        <span>Huurder</span>
        <span>Kwitantie</span>
        <span>Categorie</span>
        <span>Methode</span>
        <span className="text-right">Bedrag</span>
        <span />
      </div>

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
            <PaymentRow key={p.id} p={p}
              expanded={expanded === p.id}
              onToggle={() => toggleExpand(p.id)}
              onEmail={(item) => setEmailing(item)}
              apiBase={apiBase} />
          ))}
        </div>
      )}
      </div>

      {/* MODALS */}
      {creating && <PaymentForm tenants={tenants} initialInvoice={prefillInvoice}
        onCancel={() => { setCreating(false); setPrefillInvoice(null); }}
        onSaved={() => { setCreating(false); setPrefillInvoice(null); load(); }} />}
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
    </div>
  );
}

/* eslint-disable no-unused-vars */
// Houd CalendarDays + CheckCircle2 imports voor toekomstige uitbreidingen.
const _unused = [CalendarDays, CheckCircle2];
