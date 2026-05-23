import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, X, Check, Loader2, FileText, Wand2, Trash2, Mail, Search,
  SlidersHorizontal, AlertCircle, CalendarDays, CheckCircle2, Info,
  ChevronRight, ChevronDown,
} from 'lucide-react';
import { api, formatError, fmtMoney, MONTHS_NL } from '../../../lib/api';
import { SendDialog } from '../../../components/EmailDialog';

// =====================================================================
// Helpers
// =====================================================================
const UNPAID = ['open', 'sent', 'pending', 'overdue'];
const isUnpaid = (inv) => UNPAID.includes((inv.status || '').toLowerCase());

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarColor(name) {
  // Deterministische pastel-achtige kleur per huurder (hash van naam).
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return { bg: `hsl(${h}, 65%, 92%)`, fg: `hsl(${h}, 45%, 35%)` };
}

// Groepeer facturen per huurder en bereken samenvatting.
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
  // Sorteer open maanden chronologisch
  for (const g of map.values()) {
    g.open.sort((a, b) =>
      (a.period_year - b.period_year) || (a.period_month - b.period_month)
    );
    g.openCount = g.open.length;
    g.totalOpen = g.open.reduce((s, i) => s + Number(i.amount || 0), 0);
    // Severity: 2+ achter = rood (kritiek), 1 = oranje (te laat), 0 = groen
    g.severity = g.openCount >= 2 ? 'critical' : g.openCount === 1 ? 'late' : 'ok';
    g.lastOpen = g.open[g.open.length - 1];
  }
  return [...map.values()];
}

// =====================================================================
// KPI Card
// =====================================================================
function KpiCard({ icon: Icon, label, value, hint, tone, testid }) {
  const tones = {
    red:    { iconBg: 'bg-red-100', iconFg: 'text-red-500', hint: 'text-red-500' },
    orange: { iconBg: 'bg-orange-100', iconFg: 'text-orange-500', hint: 'text-slate-400' },
    green:  { iconBg: 'bg-emerald-100', iconFg: 'text-emerald-500', hint: 'text-slate-400' },
  };
  const t = tones[tone] || tones.orange;
  return (
    <div className="flex-1 min-w-0 flex flex-col items-center text-center px-3 py-4" data-testid={testid}>
      <div className={`w-11 h-11 rounded-full flex items-center justify-center mb-2 ${t.iconBg}`}>
        <Icon className={`w-5 h-5 ${t.iconFg}`} />
      </div>
      <p className="text-[11px] sm:text-xs font-semibold text-slate-500 mb-1.5 leading-tight">{label}</p>
      <p className="text-lg sm:text-xl font-black text-slate-900 tracking-tight whitespace-nowrap">{value}</p>
      {hint && <p className={`text-[11px] sm:text-xs font-bold mt-1 ${t.hint}`}>{hint}</p>}
    </div>
  );
}

// =====================================================================
// Month chip
// =====================================================================
function MonthChip({ month, severity }) {
  const tones = {
    critical: { bg: 'bg-red-50', fg: 'text-red-700', dot: 'bg-red-500' },
    late:     { bg: 'bg-orange-50', fg: 'text-orange-700', dot: 'bg-orange-500' },
  };
  const t = tones[severity] || tones.late;
  return (
    <div className={`inline-flex flex-col items-center gap-1`}>
      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-md ${t.bg} ${t.fg}`}>{month}</span>
      <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />
    </div>
  );
}

// =====================================================================
// Tenant card row
// =====================================================================
function TenantRow({ group, expanded, onToggle, apiBase, onEmail, onDelete }) {
  const sev = group.severity;
  const left = sev === 'critical' ? 'border-l-red-500'
    : sev === 'late' ? 'border-l-orange-500'
    : 'border-l-emerald-500';
  const labelTxt = sev === 'critical' ? `${group.openCount} maanden achter`
    : sev === 'late' ? '1 maand achter'
    : 'Op tijd';
  const labelCls = sev === 'critical' ? 'bg-red-50 text-red-700'
    : sev === 'late' ? 'bg-orange-50 text-orange-700'
    : 'bg-emerald-50 text-emerald-700';
  const amtCls = sev === 'critical' ? 'text-red-600'
    : sev === 'late' ? 'text-orange-600'
    : 'text-emerald-600';
  const avatar = avatarColor(group.tenant_name);
  const last = group.lastOpen;

  return (
    <div className={`bg-white rounded-2xl border border-orange-100 border-l-4 ${left} overflow-hidden transition`}
      data-testid={`tenant-row-${group.tenant_id}`}>
      <button onClick={onToggle} className="w-full text-left p-3 sm:p-4 hover:bg-orange-50/30 transition">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center shrink-0 font-black text-base"
            style={{ background: avatar.bg, color: avatar.fg }}>
            {initials(group.tenant_name)}
          </div>

          {/* Naam + badge */}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-900 text-sm sm:text-base truncate">{group.tenant_name}</p>
            <span className={`inline-block text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-md mt-0.5 ${labelCls}`}>
              {labelTxt}
            </span>
          </div>

          {/* Open maanden — alleen desktop, mobiel komt eronder */}
          <div className="hidden md:flex flex-col items-center min-w-[140px]">
            {group.openCount > 0 ? (
              <>
                <div className="flex gap-1.5">
                  {group.open.slice(-3).map((inv) => (
                    <MonthChip key={inv.id} month={MONTHS_NL[inv.period_month - 1].slice(0, 3)} severity={sev} />
                  ))}
                </div>
                <p className={`text-[10px] font-bold mt-1.5 ${sev === 'critical' ? 'text-red-500' : 'text-orange-500'}`}>
                  {group.openCount} openstaand
                </p>
              </>
            ) : (
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            )}
          </div>

          {/* Laatste periode — alleen desktop */}
          <div className="hidden lg:block text-right text-xs min-w-[100px]">
            {last ? (
              <>
                <p className="text-slate-700 font-semibold capitalize">{MONTHS_NL[last.period_month - 1]} {last.period_year}</p>
                <p className={`font-bold ${sev === 'critical' ? 'text-red-500' : 'text-orange-500'}`}>Niet betaald</p>
              </>
            ) : (
              <p className="text-emerald-600 font-semibold">Geen openstaand</p>
            )}
          </div>

          {/* Totaal */}
          <div className="text-right shrink-0">
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">{group.currency}</p>
            <p className={`text-base sm:text-lg font-black tracking-tight whitespace-nowrap ${amtCls}`}
              data-testid={`tenant-total-${group.tenant_id}`}>
              {fmtMoney(group.totalOpen, group.currency)}
            </p>
            {group.openCount > 0 && (
              <p className="text-[10px] text-slate-400 mt-0.5">
                ({group.openCount} × {fmtMoney(group.totalOpen / group.openCount, group.currency)})
              </p>
            )}
          </div>
          {expanded ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
        </div>

        {/* Mobiele variant van open maanden + laatste periode */}
        <div className="md:hidden mt-3 flex items-center justify-between gap-2 text-xs">
          {group.openCount > 0 ? (
            <div className="flex gap-1.5">
              {group.open.slice(-3).map((inv) => (
                <MonthChip key={inv.id} month={MONTHS_NL[inv.period_month - 1].slice(0, 3)} severity={sev} />
              ))}
            </div>
          ) : (
            <span className="text-emerald-600 font-bold text-xs">Op tijd</span>
          )}
          {last && (
            <div className="text-right text-[11px]">
              <p className="text-slate-500 capitalize">{MONTHS_NL[last.period_month - 1]} {last.period_year}</p>
              <p className={`font-bold ${sev === 'critical' ? 'text-red-500' : 'text-orange-500'}`}>Niet betaald</p>
            </div>
          )}
        </div>
      </button>

      {/* Uitgeklapte facturenlijst */}
      {expanded && (
        <div className="border-t border-orange-100 bg-orange-50/30 px-3 sm:px-4 py-3 space-y-2">
          {group.all.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-2">Geen facturen</p>
          ) : (
            group.all.map((inv) => {
              const paid = !isUnpaid(inv);
              return (
                <div key={inv.id} data-testid={`invoice-row-${inv.id}`}
                  className="bg-white rounded-xl px-3 py-2.5 flex items-center gap-2 sm:gap-3 border border-orange-100">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs font-bold text-slate-700">{inv.invoice_number}</p>
                    <p className="text-[11px] text-slate-500 capitalize">
                      {MONTHS_NL[inv.period_month - 1]} {inv.period_year}
                    </p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                    paid ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'
                  }`}>
                    {paid ? 'Betaald' : (inv.status || 'open')}
                  </span>
                  <span className="font-bold text-sm text-slate-900 whitespace-nowrap">{fmtMoney(inv.amount, inv.currency)}</span>
                  <a href={`${apiBase}/invoices/${inv.id}/pdf`} target="_blank" rel="noreferrer"
                    data-testid={`invoice-pdf-${inv.id}`}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600" title="PDF">
                    <FileText className="w-3.5 h-3.5" />
                  </a>
                  <button onClick={(e) => { e.stopPropagation(); onEmail(inv); }} data-testid={`invoice-email-${inv.id}`}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700" title="Verstuur">
                    <Mail className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onDelete(inv.id); }} data-testid={`invoice-delete-${inv.id}`}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-500" title="Verwijderen">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Invoice creation modal (kept compact)
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
    <div className="fixed inset-0 z-50 bg-white/30 backdrop-blur-md flex items-center justify-center p-4 modal-open" data-testid="invoice-modal">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-8">
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
// Filter dropdown
// =====================================================================
function FilterMenu({ filter, setFilter, onClose }) {
  const opts = [
    { v: 'all', l: 'Alle huurders' },
    { v: 'open', l: 'Met openstaand' },
    { v: 'critical', l: '2+ maanden achter (kritiek)' },
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

// =====================================================================
// Main page
// =====================================================================
export default function Invoices() {
  const [items, setItems] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [emailing, setEmailing] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [expanded, setExpanded] = useState(new Set());
  const today = new Date();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [i, t] = await Promise.all([api.get('/invoices'), api.get('/tenants')]);
      setItems(i.data); setTenants(t.data);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const del = async (id) => {
    if (!window.confirm('Factuur verwijderen?')) return;
    await api.delete(`/invoices/${id}`); load();
  };

  const generateMonth = async () => {
    if (!window.confirm(`Maandfacturen voor ${MONTHS_NL[today.getMonth()]} ${today.getFullYear()} aanmaken voor alle bezette appartementen?`)) return;
    setGenerating(true);
    try {
      const { data } = await api.post('/invoices/generate-month', {
        period_month: today.getMonth() + 1,
        period_year: today.getFullYear(),
      });
      alert(`${data.created} aangemaakt, ${data.skipped} overgeslagen`);
      load();
    } catch (e) { alert(formatError(e)); }
    finally { setGenerating(false); }
  };

  const apiBase = `${process.env.REACT_APP_BACKEND_URL}/api`;

  // Aggregaties
  const groups = useMemo(() => {
    const g = groupByTenant(items);
    // Sorteer: kritiek eerst, dan late, dan ok
    const order = { critical: 0, late: 1, ok: 2 };
    g.sort((a, b) => (order[a.severity] - order[b.severity])
      || (b.totalOpen - a.totalOpen)
      || a.tenant_name.localeCompare(b.tenant_name));
    return g;
  }, [items]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter((g) => {
      if (filter === 'open' && g.openCount === 0) return false;
      if (filter === 'critical' && g.severity !== 'critical') return false;
      if (filter === 'late' && g.severity !== 'late') return false;
      if (filter === 'ok' && g.severity !== 'ok') return false;
      if (q) {
        const hay = `${g.tenant_name} ${g.apartment_number || ''} ${g.open.map((i) => i.invoice_number).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [groups, search, filter]);

  // KPI metrics
  const totalOpenAmount = useMemo(() => groups.reduce((s, g) => s + g.totalOpen, 0), [groups]);
  const totalOpenCurrency = groups[0]?.currency || 'SRD';
  const totalOpenMonths = useMemo(
    () => new Set(items.filter(isUnpaid).map((i) => `${i.period_year}-${i.period_month}`)).size,
    [items]
  );
  const lateTenantsCount = useMemo(() => groups.filter((g) => g.openCount > 0).length, [groups]);
  const totalTenants = groups.length;
  const thisMonthExpected = useMemo(() => {
    const m = today.getMonth() + 1, y = today.getFullYear();
    return items.filter((i) => i.period_month === m && i.period_year === y)
      .reduce((s, i) => s + Number(i.amount || 0), 0);
  }, [items, today]);

  const toggleExpand = (id) => {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4 sm:space-y-5" data-testid="invoices-page">
      {/* Header */}
      <div>
        <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">Facturen</h1>
        <p className="text-sm text-slate-500 mt-1">
          {totalTenants} huurder{totalTenants !== 1 ? 's' : ''}
          {lateTenantsCount > 0 && (
            <> · <span className="text-red-500 font-bold" data-testid="header-late-count">{lateTenantsCount} openstaand</span></>
          )}
        </p>
      </div>

      {/* KPI cards */}
      <div className="bg-white rounded-2xl border border-orange-100 flex divide-x divide-orange-100 overflow-hidden">
        <KpiCard
          icon={AlertCircle}
          label="Totaal openstaand"
          value={`${totalOpenCurrency} ${fmtMoney(totalOpenAmount, totalOpenCurrency).replace(totalOpenCurrency, '').trim()}`}
          hint={totalOpenMonths > 0 ? `${totalOpenMonths} maand${totalOpenMonths !== 1 ? 'en' : ''} open` : 'Geen achterstand'}
          tone={totalOpenAmount > 0 ? 'red' : 'green'}
          testid="kpi-total-open"
        />
        <KpiCard
          icon={CalendarDays}
          label="Achterstallige huurders"
          value={String(lateTenantsCount)}
          hint={`van ${totalTenants} huurder${totalTenants !== 1 ? 's' : ''}`}
          tone="orange"
          testid="kpi-late-tenants"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Deze maand verwacht"
          value={`${totalOpenCurrency} ${fmtMoney(thisMonthExpected, totalOpenCurrency).replace(totalOpenCurrency, '').trim()}`}
          hint={`${MONTHS_NL[today.getMonth()]} ${today.getFullYear()}`}
          tone="green"
          testid="kpi-this-month"
        />
      </div>

      {/* Action buttons */}
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

      {/* Search + Filter */}
      <div className="relative flex items-center gap-2 sm:gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoek huurder, factuur..."
            data-testid="invoice-search"
            className="w-full h-12 pl-11 pr-4 rounded-2xl bg-white border border-orange-100 text-sm focus:border-[#FF5C00] outline-none" />
        </div>
        <div className="relative">
          <button onClick={() => setFilterOpen(!filterOpen)} data-testid="invoice-filter-btn"
            className={`h-12 px-4 sm:px-5 rounded-2xl border bg-white inline-flex items-center gap-2 font-bold text-sm transition ${
              filter !== 'all' ? 'border-[#FF5C00] text-[#FF5C00]' : 'border-orange-100 text-slate-700 hover:border-orange-300'
            }`}>
            <SlidersHorizontal className="w-4 h-4" />
            <span>Filteren</span>
            {filter !== 'all' && <span className="w-1.5 h-1.5 rounded-full bg-[#FF5C00]" />}
          </button>
          {filterOpen && <FilterMenu filter={filter} setFilter={setFilter} onClose={() => setFilterOpen(false)} />}
        </div>
      </div>

      {/* Column headers — desktop only */}
      <div className="hidden md:grid grid-cols-[1fr_140px_100px_140px_16px] gap-3 px-4 text-[10px] font-black uppercase tracking-widest text-slate-400">
        <span>Huurder</span>
        <span className="text-center">Open maanden</span>
        <span className="text-right hidden lg:block">Laatste periode</span>
        <span className="text-right">Totaal openstaand</span>
        <span />
      </div>

      {/* Rows */}
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
              apiBase={apiBase}
              onEmail={(inv) => setEmailing(inv)}
              onDelete={del} />
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="bg-white rounded-2xl border border-orange-100 p-4 sm:p-5" data-testid="invoices-legend">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-[#FF5C00] flex items-center justify-center shrink-0">
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

      {/* Modals */}
      {creating && <InvoiceForm tenants={tenants}
        onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
      {emailing && (
        <SendDialog
          documentType="invoice"
          documentId={emailing.id}
          documentLabel="factuur"
          title={`Factuur ${emailing.invoice_number} verzenden`}
          tenantEmail={tenants.find((t) => t.id === emailing.tenant_id)?.email || ''}
          tenantPhone={tenants.find((t) => t.id === emailing.tenant_id)?.phone || ''}
          tenantName={emailing.tenant_name}
          onClose={() => setEmailing(null)} />
      )}
    </div>
  );
}
