import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, Loader2, FileText, Wand2, Search,
  SlidersHorizontal, CalendarDays, CheckCircle2,
} from 'lucide-react';
import { api, formatError, MONTHS_NL } from '../../../lib/api';
import { useAutoRefresh } from '../../../lib/auto-refresh';

import { fmtAmount, fmtAmountWhole, groupByTenant, isUnpaid } from './invoices/helpers';
import { Tab, MobileFilterPill, KpiCard, FilterMenu, Toast } from './invoices/kpi';
import { TenantRow, MobileTenantCard, MobileTenantExpand } from './invoices/TenantRow';
import PaidHistorySection from './invoices/PaidHistorySection';
import InvoiceForm from './invoices/InvoiceForm';
import ReminderModal from './invoices/ReminderModal';
import InvoiceDetailPage from './invoices/InvoiceDetailPage';
import CreditSourcesPopover from './invoices/CreditSourcesPopover';

// =====================================================================
// Facturen — hoofdpagina. Toont KPI's, filter/tabs, mobiele en desktop
// lijsten en de dedicated detail-pagina. Alle sub-componenten leven in
// `./invoices/` (helpers.js, InvoiceRow.jsx, TenantRow.jsx, ...).
// =====================================================================
export default function Invoices() {
  const [items, setItems] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [credits, setCredits] = useState({}); // { tenant_id: { SRD: 2000, ... } }
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [reminding, setReminding] = useState(null);
  const [reminderChannel, setReminderChannel] = useState('whatsapp');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');            // 'all' | 'open' | 'paid'
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [expanded, setExpanded] = useState(null);   // mobile expand (single tenant_id)
  const [userToggled, setUserToggled] = useState(false);
  const [detail, setDetail] = useState(null);       // desktop dedicated detail page
  const [creditSourcesFor, setCreditSourcesFor] = useState(null); // {tenant_id, tenant_name} — popover trigger
  const [toast, setToast] = useState(null);
  const today = new Date();

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [i, t, c] = await Promise.all([
        api.get('/invoices'),
        api.get('/tenants'),
        api.get('/tenants/credits').catch(() => ({ data: {} })),
      ]);
      setItems(i.data); setTenants(t.data); setCredits(c.data || {});
    } finally { if (!silent) setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(() => load({ silent: true }), { interval: 10000, enabled: !creating && !reminding });

  // Luister naar `invoice-delete` event vanaf <InvoiceRow> en voer DELETE uit.
  useEffect(() => {
    const handler = async (ev) => {
      const inv = ev.detail?.invoice;
      if (!inv?.id) return;
      try {
        await api.delete(`/invoices/${inv.id}`);
        setToast({ type: 'success', text: `Factuur ${inv.invoice_number} verwijderd` });
        load({ silent: true });
      } catch (e) {
        setToast({ type: 'err', text: formatError(e) || 'Kon factuur niet verwijderen' });
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

  const groups = useMemo(() => {
    const g = groupByTenant(items, MONTHS_NL);
    const order = { critical: 0, late: 1, ok: 2 };
    g.sort((a, b) => (order[a.severity] - order[b.severity])
      || (b.totalOpen - a.totalOpen)
      || a.tenant_name.localeCompare(b.tenant_name));
    return g;
  }, [items]);

  const allCount = groups.length;
  const openCount = useMemo(() => groups.filter((g) => (g.overdueCount || 0) > 0).length, [groups]);
  const paidCount = useMemo(() => groups.filter((g) => g.openCount === 0).length, [groups]);
  const totalOpenAmount = useMemo(
    () => groups.reduce((s, g) => s + (g.totalOverdue || 0) + (g.totalCurrent || 0), 0),
    [groups]
  );
  const totalOpenCurrency = groups[0]?.currency || 'SRD';
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

  // Default: eerste huurder in filter altijd open op mobile. Zodra de
  // gebruiker zelf iets aanklikt, respecteren we die keuze.
  useEffect(() => {
    if (userToggled) return;
    const firstId = filteredGroups[0]?.tenant_id || null;
    if (firstId && expanded !== firstId) setExpanded(firstId);
  }, [filteredGroups, expanded, userToggled]);

  const openReminder = (group, channel) => {
    setReminderChannel(channel);
    setReminding(group);
  };

  const openCreditSources = (group) => {
    setCreditSourcesFor({ tenant_id: group.tenant_id, tenant_name: group.tenant_name });
  };

  // ---------------- DETAIL-PAGINA (desktop) ----------------
  if (detail) {
    const g = filteredGroups.find((x) => x.tenant_id === detail.tenant_id) || detail;
    return (
      <>
        <InvoiceDetailPage
          group={g}
          credits={credits[g.tenant_id]}
          onBack={() => { setDetail(null); load({ silent: true }); }}
          onReminder={openReminder}
          onCreditClick={() => openCreditSources(g)}
          onPaid={(payment) => {
            const msg = payment?._credit_applied
              ? payment._message
              : `Kwitantie ${payment.receipt_number} — ${payment.currency} ${Number(payment.amount).toLocaleString('nl-NL', { minimumFractionDigits: 2 })}`;
            setToast({ type: 'ok', text: msg });
            load({ silent: true });
          }}
        />
        {reminding && (
          <ReminderModal group={reminding} initialChannel={reminderChannel}
            onClose={() => setReminding(null)}
            onSent={(ch) => {
              setReminding(null);
              setToast({ type: 'ok', text: `Herinnering via ${ch === 'email' ? 'e-mail' : ch === 'whatsapp' ? 'WhatsApp' : 'SMS'} verzonden` });
            }} />
        )}
        {creditSourcesFor && (
          <CreditSourcesPopover
            tenantId={creditSourcesFor.tenant_id}
            tenantName={creditSourcesFor.tenant_name}
            onClose={() => setCreditSourcesFor(null)} />
        )}
        {toast && <Toast toast={toast} onDone={() => setToast(null)} />}
      </>
    );
  }

  // ---------------- LIJST-WEERGAVE ----------------
  return (
    <div data-testid="invoices-page">
      {/* ============= MOBILE (< md) — POS-stijl ============= */}
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
            {filteredGroups.map((g) => {
              const paidInvoices = (g.all || []).filter((i) => (i.status || '') === 'paid');
              return (
                <div key={g.tenant_id} data-testid={`mi-row-${g.tenant_id}`}>
                  <MobileTenantCard group={g} credits={credits[g.tenant_id]} onClick={() => toggleExpand(g.tenant_id)} onCreditClick={() => openCreditSources(g)} />
                  {expanded === g.tenant_id && g.openCount > 0 && (
                    <MobileTenantExpand g={g} tenants={tenants} onReminder={openReminder} />
                  )}
                  {expanded === g.tenant_id && g.openCount === 0 && paidInvoices.length > 0 && (
                    <div className="mt-2 mx-1" data-testid={`mi-paid-detail-${g.tenant_id}`}>
                      <PaidHistorySection paidInvoices={paidInvoices} currency={g.currency} variant="inline" testidPrefix={`mi-paid-${g.tenant_id}`} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ============= DESKTOP (>= md) ============= */}
      <div className="hidden md:block space-y-4 sm:space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Facturen</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {allCount} huurder{allCount !== 1 ? 's' : ''}
              {openCount > 0 && <> · <span className="text-red-500 font-bold">{openCount} met achterstand</span></>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={generateMonth} disabled={generating} data-testid="invoice-generate-btn"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white border-2 border-orange-200 hover:border-[#FF5C00] text-[#FF5C00] font-bold rounded-xl text-sm">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              Genereer maand
            </button>
            <button onClick={() => setCreating(true)} data-testid="invoice-new-btn"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold rounded-xl text-sm shadow-[0_10px_25px_-5px_rgba(255,92,0,0.5)]">
              <Plus className="w-4 h-4" /> Nieuwe factuur
            </button>
          </div>
        </div>

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

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoek huurder, factuur..."
            data-testid="invoice-search"
            className="w-full h-12 pl-11 pr-4 rounded-2xl bg-white border border-orange-100 text-sm focus:border-[#FF5C00] outline-none" />
        </div>

        <div className="hidden md:grid grid-cols-[auto_minmax(0,1.8fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.1fr)_16px] gap-3 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400 items-center">
          <span style={{ width: '40px' }} />
          <span>Huurder</span>
          <span>Open maanden</span>
          <span className="text-right">Laatste</span>
          <span className="text-right">Totaal openstaand</span>
          <span />
        </div>

        <div className="md:hidden flex justify-between px-4 text-[10px] font-black uppercase tracking-widest text-slate-400">
          <span>Huurder</span>
          <span>Bedrag</span>
        </div>

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
                credits={credits[g.tenant_id]}
                expanded={false}
                onToggle={() => setDetail(g)}
                onReminder={openReminder}
                onCreditClick={() => openCreditSources(g)}
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

      {/* CREDIT SOURCES POPOVER — trigger vanaf badge in lijst */}
      {creditSourcesFor && (
        <CreditSourcesPopover
          tenantId={creditSourcesFor.tenant_id}
          tenantName={creditSourcesFor.tenant_name}
          onClose={() => setCreditSourcesFor(null)} />
      )}

      {/* TOAST */}
      {toast && <Toast toast={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
