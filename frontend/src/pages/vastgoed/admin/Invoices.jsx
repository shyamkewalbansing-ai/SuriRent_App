import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, X, Check, Loader2, FileText, Wand2, Mail, Search,
  SlidersHorizontal, CalendarDays, CheckCircle2, Info, ChevronRight,
  ChevronDown, MessageCircle,
} from 'lucide-react';
import { api, formatError, fmtMoney, MONTHS_NL } from '../../../lib/api';

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

function groupByTenant(invoices) {
  const map = new Map();
  for (const inv of invoices) {
    const key = inv.tenant_id;
    if (!map.has(key)) {
      map.set(key, {
        tenant_id: inv.tenant_id,
        tenant_name: inv.tenant_name || 'Onbekend',
        apartment_number: inv.apartment_number,
        currency: inv.currency,
        all: [], open: [],
      });
    }
    const g = map.get(key);
    g.all.push(inv);
    if (isUnpaid(inv)) g.open.push(inv);
  }
  for (const g of map.values()) {
    g.open.sort((a, b) => (a.period_year - b.period_year) || (a.period_month - b.period_month));
    g.all.sort((a, b) => (a.period_year - b.period_year) || (a.period_month - b.period_month));
    g.openCount = g.open.length;
    g.totalOpen = g.open.reduce((s, i) => s + Number(i.amount || 0), 0);
    g.severity = g.openCount >= 2 ? 'critical' : g.openCount === 1 ? 'late' : 'ok';
    g.lastOpen = g.open[g.open.length - 1];
    g.periodLabel = g.open
      .map((i) => `${MONTHS_NL[i.period_month - 1]}`)
      .join(', ');
    if (g.open.length > 0) {
      const lastYear = g.open[g.open.length - 1].period_year;
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
    <div className="fixed inset-0 z-50 bg-white/30 backdrop-blur-md flex items-center justify-center p-4 modal-open"
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
// Tenant row
// =====================================================================
function StatusPill({ severity, openCount }) {
  if (severity === 'ok') return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Op tijd
    </span>
  );
  const t = severity === 'critical'
    ? { bg: 'bg-red-50', fg: 'text-red-700', dot: 'bg-red-500', label: `${openCount} maanden achter` }
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

function TenantRow({ group, expanded, onToggle, onReminder }) {
  const sev = group.severity;
  const left = sev === 'critical' ? 'border-l-red-500'
    : sev === 'late' ? 'border-l-orange-500'
    : 'border-l-emerald-500';
  const amtCls = sev === 'critical' ? 'text-red-600'
    : sev === 'late' ? 'text-orange-600'
    : 'text-slate-900';
  const avatar = avatarColor(group.tenant_name);
  const last = group.lastOpen;

  return (
    <div className={`bg-white rounded-2xl border border-orange-100 border-l-4 ${left} overflow-hidden transition`}
      data-testid={`tenant-row-${group.tenant_id}`}>
      <button onClick={onToggle} className="w-full text-left p-3 sm:p-4 hover:bg-orange-50/30 transition">
        {/* ROW 1 — desktop has all in one line; mobile wraps onto multiple */}
        <div className="grid grid-cols-[auto_1fr_auto] md:grid-cols-[auto_minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_auto_16px] items-center gap-3">
          {/* Avatar */}
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-black text-base shrink-0"
            style={{ background: avatar.bg, color: avatar.fg }}>
            {initials(group.tenant_name)}
          </div>

          {/* Huurder name + sublabel */}
          <div className="min-w-0">
            <p className="font-bold text-slate-900 text-sm sm:text-base truncate">{group.tenant_name}</p>
            <div className="mt-0.5 md:hidden">
              <StatusPill severity={sev} openCount={group.openCount} />
            </div>
            <div className="hidden md:block mt-0.5">
              <StatusPill severity={sev} openCount={group.openCount} />
            </div>
          </div>

          {/* Periode — desktop only (comma list of unpaid months) */}
          <div className="hidden md:block text-sm text-slate-600 truncate">
            {group.periodLabel || '—'}
          </div>

          {/* Status pill — desktop only (duplicate of name pill, but in own column for table align) */}
          <div className="hidden md:flex justify-center">
            {sev !== 'ok' ? (
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-md ${
                sev === 'critical' ? 'bg-red-50 text-red-700' : 'bg-orange-50 text-orange-700'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${sev === 'critical' ? 'bg-red-500' : 'bg-orange-500'}`} />
                {sev === 'critical' ? `${group.openCount} maanden achter` : '1 maand achter'}
              </span>
            ) : <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
          </div>

          {/* Open maanden — desktop only */}
          <div className="hidden md:flex flex-col items-center">
            {group.openCount > 0 ? (
              <>
                <div className="flex gap-1.5 flex-wrap justify-center">
                  {group.open.slice(-3).map((inv) => (
                    <MonthChip key={inv.id} month={MONTHS_NL[inv.period_month - 1].slice(0, 3).toLowerCase()} severity={sev} />
                  ))}
                </div>
                <p className={`text-[10px] font-bold mt-1 ${sev === 'critical' ? 'text-red-500' : 'text-orange-500'}`}>
                  {group.openCount} openstaand
                </p>
              </>
            ) : (
              <span className="text-emerald-600 font-semibold text-xs">—</span>
            )}
          </div>

          {/* Laatste periode — desktop only */}
          <div className="hidden md:block text-right text-xs whitespace-nowrap">
            {last ? (
              <>
                <p className="text-slate-700 font-semibold capitalize">{MONTHS_NL[last.period_month - 1]} {last.period_year}</p>
                <p className={`font-bold ${sev === 'critical' ? 'text-red-500' : 'text-orange-500'}`}>Niet betaald</p>
              </>
            ) : (
              <p className="text-emerald-600 font-semibold">Geen</p>
            )}
          </div>

          {/* Bedrag */}
          <div className="text-right shrink-0 whitespace-nowrap">
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">{group.currency}</p>
            <p className={`text-base sm:text-lg font-black tracking-tight ${amtCls}`}
              data-testid={`tenant-total-${group.tenant_id}`}>
              {fmtAmount(group.totalOpen, group.currency)}
            </p>
            {group.openCount > 0 && (
              <p className="text-[10px] text-slate-400 mt-0.5">
                ({group.openCount} × {fmtAmount(group.totalOpen / group.openCount, group.currency)})
              </p>
            )}
          </div>

          {/* Chevron */}
          {expanded
            ? <ChevronDown className="w-4 h-4 text-slate-400" />
            : <ChevronRight className="w-4 h-4 text-slate-400" />}
        </div>

        {/* MOBILE row 2 — periode (comma list) */}
        {group.openCount > 0 && (
          <p className="md:hidden text-xs text-slate-500 mt-2.5 pl-14">{group.periodLabel}</p>
        )}
      </button>

      {/* Uitgeklapte details */}
      {expanded && group.openCount > 0 && (
        <div className="px-3 sm:px-4 pb-4 -mt-1" data-testid={`tenant-detail-${group.tenant_id}`}>
          <div className={`rounded-2xl p-4 ${sev === 'critical' ? 'bg-red-50' : 'bg-orange-50'}`}>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
              {/* LEFT — list of open months */}
              <div>
                <p className={`text-sm font-bold mb-3 ${sev === 'critical' ? 'text-red-700' : 'text-orange-700'}`}>
                  Openstaande maanden ({group.openCount})
                </p>
                <div className="space-y-1.5">
                  {group.open.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between text-sm"
                      data-testid={`invoice-row-${inv.id}`}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sev === 'critical' ? 'bg-red-500' : 'bg-orange-500'}`} />
                        <span className="text-slate-700 capitalize">{MONTHS_NL[inv.period_month - 1]} {inv.period_year}</span>
                      </div>
                      <span className="text-slate-700 font-semibold whitespace-nowrap">{fmtMoney(inv.amount, inv.currency)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* RIGHT — totaal (apart blok met dunne separator op desktop) */}
              <div className="md:border-l md:border-orange-200 md:pl-4 md:min-w-[160px] flex md:flex-col justify-between md:justify-center items-end md:items-end">
                <p className="text-xs font-bold text-slate-500">Totaal openstaand</p>
                <p className={`text-xl sm:text-2xl font-black tracking-tight ${sev === 'critical' ? 'text-red-600' : 'text-orange-600'}`}>
                  {fmtMoney(group.totalOpen, group.currency)}
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-2 mt-4">
              <button onClick={(e) => { e.stopPropagation(); onReminder(group, 'whatsapp'); }}
                data-testid={`reminder-whatsapp-${group.tenant_id}`}
                className="inline-flex items-center justify-center gap-2 px-3 py-3 bg-white border-2 border-emerald-300 hover:bg-emerald-50 text-emerald-700 font-bold rounded-xl text-sm">
                <MessageCircle className="w-4 h-4" />
                <span className="hidden sm:inline">Stuur herinnering</span>
                <span className="sm:hidden">Herinnering</span>
              </button>
              <button onClick={(e) => { e.stopPropagation(); onReminder(group, 'email'); }}
                data-testid={`reminder-email-${group.tenant_id}`}
                className="inline-flex items-center justify-center gap-2 px-3 py-3 bg-white border-2 border-orange-300 hover:bg-orange-50 text-[#FF5C00] font-bold rounded-xl text-sm">
                <Mail className="w-4 h-4" />
                <span>Herinnering e-mail</span>
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
    <div className="fixed inset-0 z-50 bg-white/30 backdrop-blur-md flex items-center justify-center p-4 modal-open"
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
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');  // 'all' | 'open' | 'paid'
  const [filterSeverity, setFilterSeverity] = useState('all'); // all|critical|late|ok
  const [filterOpen, setFilterOpen] = useState(false);
  const [expanded, setExpanded] = useState(new Set());
  const [toast, setToast] = useState(null);
  const today = new Date();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [i, t] = await Promise.all([api.get('/invoices'), api.get('/tenants')]);
      setItems(i.data); setTenants(t.data);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

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
  const openCount = useMemo(() => groups.filter((g) => g.openCount > 0).length, [groups]);
  const paidCount = useMemo(() => groups.filter((g) => g.openCount === 0).length, [groups]);

  const totalOpenAmount = useMemo(() => groups.reduce((s, g) => s + g.totalOpen, 0), [groups]);
  const totalOpenCurrency = groups[0]?.currency || 'SRD';
  const totalOpenMonths = useMemo(
    () => new Set(items.filter(isUnpaid).map((i) => `${i.period_year}-${i.period_month}`)).size,
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
      if (tab === 'open' && g.openCount === 0) return false;
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
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const openReminder = (group, channel) => {
    setReminderChannel(channel);
    setReminding(group);
  };

  return (
    <div className="space-y-4 sm:space-y-5" data-testid="invoices-page">
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
      <div className="hidden md:grid grid-cols-[auto_minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_auto_16px] gap-3 px-4 text-[10px] font-black uppercase tracking-widest text-slate-400 items-center">
        <span style={{ width: '44px' }} />
        <span>Huurder</span>
        <span>Periode</span>
        <span className="text-center">Status</span>
        <span className="text-center">Open maanden</span>
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
              expanded={expanded.has(g.tenant_id)}
              onToggle={() => toggleExpand(g.tenant_id)}
              onReminder={openReminder} />
          ))}
        </div>
      )}

      {/* LEGEND */}
      <div className="bg-white rounded-2xl border border-orange-100 p-4 sm:p-5" data-testid="invoices-legend">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: ORANGE }}>
            <Info className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-900 mb-2">Wat betekent dit?</p>
            <div className="space-y-1.5 text-sm">
              {[
                { dot: 'bg-red-500', l: '2+ maanden achter', r: 'Kritiek', rCls: 'text-red-500' },
                { dot: 'bg-orange-500', l: '1 maand achter', r: 'Te laat', rCls: 'text-orange-500' },
                { dot: 'bg-emerald-500', l: 'Geen achterstand', r: 'Op tijd', rCls: 'text-emerald-500' },
              ].map((row) => (
                <div key={row.l} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`w-2.5 h-2.5 rounded-full ${row.dot}`} />
                    <span className="text-slate-600 text-sm">{row.l}</span>
                  </div>
                  <span className={`text-sm font-bold ${row.rCls}`}>{row.r}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
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
