// Superadmin · SaaS Overzicht
// -----------------------------------------------------------------------------
// 1:1 spiegel van de beheerder-`Overview()` in AdminDashboard.jsx:
//   • Luxe goud/oranje hero met Kas saldo (3 valuta-tegels · SRD/EUR/USD)
//   • 4 KPI-tegels (Bedrijven · Klanten · Open lopende maand · Achterstand)
//   • 4 Snelle acties-knoppen
// Daaronder blijven de SaaS-specifieke live-widgets staan: Online bedrijven,
// Trial verloopt bijna, Recent gezien, Danger Zone.
// Refresht elke 15s zodat presence + KPI's actueel blijven.
// -----------------------------------------------------------------------------

import { useEffect, useState, useCallback } from 'react';
import {
  Crown, TrendingUp, Building2, Clock, AlertCircle, Wifi, WifiOff,
  ScanLine, Receipt, RefreshCw, Loader2, ArrowRight, ArrowUpRight,
  Trash2, Wallet, Users, UserPlus, FileText, Briefcase,
} from 'lucide-react';
import { api, formatError, fmtMoney } from '../../../lib/api';

const fmtRelative = (iso) => {
  if (!iso) return 'nooit ingelogd';
  try {
    const ts = new Date(iso).getTime();
    const diff = Math.max(0, (Date.now() - ts) / 1000);
    if (diff < 60) return `${Math.floor(diff)}s geleden`;
    if (diff < 3600) return `${Math.floor(diff / 60)} min geleden`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} u geleden`;
    return `${Math.floor(diff / 86400)} dgn geleden`;
  } catch {
    return '—';
  }
};

const STATUS_PILL = {
  trial: 'bg-orange-50 text-orange-700 ring-orange-200',
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  expired: 'bg-red-50 text-red-700 ring-red-200',
  cancelled: 'bg-slate-100 text-slate-600 ring-slate-200',
  past_due: 'bg-amber-50 text-amber-700 ring-amber-200',
};
const STATUS_LABEL = {
  trial: 'Proef', active: 'Actief', expired: 'Verlopen', cancelled: 'Opgezegd', past_due: 'Open',
};

// PageHeader — identieke opmaak als in AdminDashboard.jsx (regel 850).
function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export default function SaasOverview() {
  const [overview, setOverview] = useState(null);
  const [presence, setPresence] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    setErr('');
    try {
      const [o, p] = await Promise.all([
        api.get('/superadmin/overview'),
        api.get('/superadmin/online-status'),
      ]);
      setOverview(o.data);
      setPresence(p.data);
    } catch (e) {
      setErr(formatError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  if (loading || !overview || !presence) {
    return (
      <div className="py-20 flex items-center justify-center" data-testid="saas-overview-loading">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  const companies = presence.companies || [];
  const onlineCompanies = companies.filter((c) => c.online);
  const offlineCompanies = companies.filter((c) => !c.online);
  const trialActive = companies.filter((c) => c.billing_status === 'trial');
  const trialExpiring = trialActive.filter((c) => {
    if (!c.trial_ends_at) return false;
    const end = new Date(c.trial_ends_at).getTime();
    const days = (end - Date.now()) / 86400000;
    return days >= 0 && days <= 3;
  });

  // ===== Afgeleide metrics — spiegelen 1:1 de beheerder-Overzicht =====
  const receivedByCur = overview.total_received_by_currency || {};
  const openByCur = overview.current_month_open_by_currency || {};
  const primaryCur = Object.keys(openByCur)[0] || Object.keys(receivedByCur)[0] || 'SRD';
  const currentMonthOpenCount = overview.current_month_open_count || 0;
  const currentOpenTotal = openByCur[primaryCur] || 0;

  const companiesTotal = overview.companies_total || 0;
  const activeCount = overview.active || 0;
  const trialCount = overview.trial || 0;
  const overdueCount = overview.overdue_invoices || 0;
  const clientsTotal = companies.length; // 1 admin ≈ 1 klant per bedrijf
  const activePct = companiesTotal === 0 ? 0 : Math.round((activeCount / companiesTotal) * 100);

  return (
    <div data-testid="saas-overview-page">
      <PageHeader
        title="SaaS Overzicht"
        subtitle="Snelle blik op uw platform · bedrijven, abonnementen en inkomsten"
        action={
          <button onClick={load} disabled={refreshing} data-testid="saas-overview-refresh"
            className="h-10 px-4 rounded-xl bg-white border border-slate-200 hover:border-orange-300 text-sm font-bold text-slate-700 flex items-center gap-2 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Vernieuwen
          </button>
        }
      />

      {err && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{err}</div>
      )}

      {/* ===================================================================
          MOBIEL/TABLET — 4 mini-stats card (spiegel van beheerder mobiel)
          =================================================================== */}
      <div className="lg:hidden bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_-2px_rgba(15,23,42,0.06)] p-4 mb-4" data-testid="saas-portfolio-card-mobile">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Platform in één oogopslag</p>
        <div className="grid grid-cols-4 divide-x divide-slate-100">
          {[
            { label: 'Bedrijven', value: companiesTotal, icon: Building2, accent: 'bg-orange-50 text-[#FF5C00]' },
            { label: 'Actief', value: activeCount, icon: TrendingUp, accent: 'bg-emerald-50 text-emerald-600' },
            { label: 'Proef', value: trialCount, icon: Clock, accent: 'bg-amber-50 text-amber-600' },
            { label: 'Online', value: overview.online_now, icon: Wifi, accent: 'bg-sky-50 text-sky-600' },
          ].map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.label} className="px-1.5 first:pl-0 last:pr-0 text-center">
                <div className={`w-10 h-10 rounded-full ${c.accent} flex items-center justify-center mx-auto mb-2`}>
                  <Icon className="w-4 h-4" />
                </div>
                <p className="text-xl font-black text-slate-900 tracking-tight" data-testid={`saas-stat-m-${c.label.toLowerCase()}`}>{c.value}</p>
                <p className="text-[10px] text-slate-500 font-semibold mt-0.5">{c.label}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ===================================================================
          DESKTOP — Luxe hero + 4 KPI's + 4 Snelle acties
          Structuur identiek aan beheerder-Overzicht in AdminDashboard.jsx
          =================================================================== */}
      <div className="hidden lg:block">
        {/* ============ HERO · SaaS Kas Saldo Banking-stijl ============ */}
        <div
          className="relative overflow-hidden rounded-3xl mb-5 p-7 text-white shadow-[0_24px_60px_-24px_rgba(15,23,42,0.55)]"
          style={{
            background:
              'radial-gradient(circle at 0% 0%, #2A1A0A 0%, #1A1208 35%, #0B0805 100%)',
          }}
          data-testid="saas-hero-cash-balance"
        >
          {/* Luxe achtergrondaccenten — goud glow */}
          <div className="pointer-events-none absolute -top-32 -right-24 w-[28rem] h-[28rem] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(255,176,99,0.32) 0%, rgba(255,92,0,0.08) 40%, transparent 70%)' }} />
          <div className="pointer-events-none absolute -bottom-24 -left-24 w-[22rem] h-[22rem] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(212,160,55,0.18) 0%, transparent 65%)' }} />
          {/* Subtiele grid noise overlay */}
          <div className="pointer-events-none absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }} />

          <div className="relative flex items-start justify-between gap-6 mb-6">
            <div>
              <div className="flex items-center gap-2.5 mb-1.5">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #F8C260 0%, #D4A037 60%, #8B6914 100%)' }}>
                  <Crown className="w-4.5 h-4.5 text-[#1A1208]" />
                </span>
                <p className="text-[10px] font-black uppercase tracking-[0.22em]"
                  style={{ color: '#F0C97A' }}>
                  SaaS Kas saldo
                </p>
              </div>
              <h2 className="text-3xl font-black tracking-tight leading-tight"
                style={{
                  background: 'linear-gradient(90deg, #FFF6D6 0%, #F8C260 60%, #D4A037 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}>
                Totaal ontvangen
              </h2>
              <p className="text-xs text-white/50 font-semibold mt-1">
                Alle betaalde abonnementen · Bron: Subscription facturen
              </p>
            </div>
            <button onClick={() => window.dispatchEvent(new CustomEvent('saas-nav', { detail: 'saas_invoices' }))}
              data-testid="saas-hero-cash-cta"
              className="group inline-flex items-center gap-2 px-4 h-10 rounded-full text-xs font-black tracking-wider uppercase transition-all border"
              style={{
                background: 'linear-gradient(135deg, rgba(248,194,96,0.18) 0%, rgba(212,160,55,0.08) 100%)',
                borderColor: 'rgba(248,194,96,0.35)',
                color: '#F8C260',
              }}>
              Bekijk facturen
              <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </button>
          </div>

          {/* 3 Currency tiles — banking style */}
          <div className="relative grid grid-cols-3 gap-4">
            {[
              { cur: 'SRD', label: 'Surinaamse Dollar', symbol: 'SRD' },
              { cur: 'EUR', label: 'Euro', symbol: '€' },
              { cur: 'USD', label: 'US Dollar', symbol: '$' },
            ].map(({ cur, label, symbol }) => {
              const v = receivedByCur[cur] || 0;
              const positive = v >= 0;
              return (
                <div key={cur}
                  className="relative rounded-2xl p-4 overflow-hidden backdrop-blur-sm"
                  style={{
                    background: 'linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.015) 100%)',
                    border: '1px solid rgba(248,194,96,0.18)',
                  }}
                  data-testid={`saas-hero-cash-tile-${cur.toLowerCase()}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black tracking-[0.18em] uppercase"
                        style={{ color: '#F0C97A' }}>{cur}</span>
                      <span className="text-[10px] text-white/40 font-semibold">{label}</span>
                    </div>
                    <span className="inline-flex w-6 h-6 rounded-full items-center justify-center"
                      style={{ background: 'rgba(248,194,96,0.12)' }}>
                      <TrendingUp className="w-3 h-3" style={{ color: positive ? '#86EFAC' : '#FCA5A5' }} />
                    </span>
                  </div>
                  <p className="text-3xl font-black tracking-tight leading-none text-white"
                    data-testid={`saas-kpi-cash-${cur.toLowerCase()}`}>
                    <span className="text-base font-bold opacity-60 mr-1">{symbol === 'SRD' ? '' : symbol}</span>
                    {Math.round(v).toLocaleString('nl-NL')}
                  </p>
                  <div className="mt-3 h-px w-full"
                    style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(248,194,96,0.4) 50%, transparent 100%)' }} />
                  <p className="text-[10px] text-white/40 font-semibold mt-1.5">Ontvangen totaal</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ============ KPI rij — 4 tegels ============ */}
        <div className="grid grid-cols-4 gap-4 mb-5">
          {/* Bedrijven */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_-2px_rgba(15,23,42,0.06)] p-5 relative overflow-hidden hover:border-orange-200 transition-colors">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-orange-100/40 to-transparent rounded-full -translate-y-6 translate-x-6 pointer-events-none" />
            <div className="flex items-start gap-3 relative">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-100 to-orange-50 flex items-center justify-center shrink-0 shadow-inner">
                <Building2 className="w-5 h-5 text-[#FF5C00]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Bedrijven</p>
                <p className="text-3xl font-black text-slate-900 tracking-tight leading-none mt-1" data-testid="saas-kpi-companies">
                  {companiesTotal}
                </p>
                <p className="text-[11px] text-slate-500 font-semibold mt-1.5">
                  <span className="text-emerald-600">{activeCount} actief</span>
                  {trialCount > 0 && <span className="text-slate-400"> · {trialCount} proef</span>}
                </p>
              </div>
            </div>
            <div className="mt-3 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#F8C260] to-[#FF5C00] transition-all" style={{ width: `${activePct}%` }} />
            </div>
            <p className="text-[10px] text-slate-400 font-bold mt-1.5">{activePct}% actieve abonnementen</p>
          </div>

          {/* Klanten */}
          <button onClick={() => window.dispatchEvent(new CustomEvent('saas-nav', { detail: 'saas_clients' }))}
            data-testid="saas-kpi-clients-cta"
            className="text-left bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_-2px_rgba(15,23,42,0.06)] p-5 relative overflow-hidden hover:border-amber-200 transition-colors">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-amber-100/40 to-transparent rounded-full -translate-y-6 translate-x-6 pointer-events-none" />
            <div className="flex items-start gap-3 relative">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-100 to-amber-50 flex items-center justify-center shrink-0 shadow-inner">
                <Users className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Klanten</p>
                <p className="text-3xl font-black text-slate-900 tracking-tight leading-none mt-1" data-testid="saas-kpi-clients">
                  {clientsTotal}
                </p>
                <p className="text-[11px] text-slate-500 font-semibold mt-1.5">
                  {overview.online_now} nu online
                </p>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-[#FF5C00] font-bold">Bekijk alle klanten →</p>
          </button>

          {/* Open · lopende maand */}
          <button onClick={() => window.dispatchEvent(new CustomEvent('saas-nav', { detail: 'saas_invoices' }))}
            data-testid="saas-kpi-current-open"
            className="text-left bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_-2px_rgba(15,23,42,0.06)] p-5 relative overflow-hidden hover:border-orange-200 transition-colors">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-orange-100/40 to-transparent rounded-full -translate-y-6 translate-x-6 pointer-events-none" />
            <div className="flex items-start gap-3 relative">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-100 to-orange-50 flex items-center justify-center shrink-0 shadow-inner">
                <Receipt className="w-5 h-5 text-[#FF5C00]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Open · lopende maand</p>
                <p className="text-3xl font-black text-[#FF5C00] tracking-tight leading-none mt-1">
                  {currentMonthOpenCount}
                </p>
                <p className="text-[11px] text-slate-500 font-semibold mt-1.5 truncate">
                  {currentOpenTotal > 0 ? fmtMoney(currentOpenTotal, primaryCur) : 'Nog te innen'}
                </p>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-[#FF5C00] font-bold">Bekijk facturen →</p>
          </button>

          {/* Achterstand */}
          <button onClick={() => window.dispatchEvent(new CustomEvent('saas-nav', { detail: 'saas_invoices' }))}
            data-testid="saas-kpi-overdue"
            className={`text-left rounded-2xl p-5 relative overflow-hidden transition-shadow ${
              overdueCount > 0
                ? 'bg-gradient-to-br from-red-500 via-red-600 to-red-700 text-white border border-red-700 hover:shadow-[0_12px_28px_-8px_rgba(220,38,38,0.5)]'
                : 'bg-white border border-slate-100 shadow-[0_1px_4px_-2px_rgba(15,23,42,0.06)] hover:border-emerald-200'
            }`}>
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-white/10 to-transparent rounded-full -translate-y-6 translate-x-6 pointer-events-none" />
            <div className="flex items-start gap-3 relative">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-inner ${
                overdueCount > 0 ? 'bg-white/20' : 'bg-gradient-to-br from-emerald-100 to-emerald-50'
              }`}>
                <AlertCircle className={`w-5 h-5 ${overdueCount > 0 ? 'text-white' : 'text-emerald-600'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-[10px] font-black uppercase tracking-widest ${overdueCount > 0 ? 'text-white/80' : 'text-slate-400'}`}>
                  Achterstand
                </p>
                <p className={`text-3xl font-black tracking-tight leading-none mt-1 ${overdueCount > 0 ? 'text-white' : 'text-slate-900'}`}>
                  {overdueCount}
                </p>
                <p className={`text-[11px] font-semibold mt-1.5 ${overdueCount > 0 ? 'text-white/90' : 'text-emerald-600'}`}>
                  {overdueCount > 0
                    ? `Facturen te laat`
                    : 'Alles op tijd ✓'}
                </p>
              </div>
            </div>
            <p className={`mt-3 text-[11px] font-bold ${overdueCount > 0 ? 'text-white' : 'text-emerald-600'}`}>
              {overdueCount > 0 ? 'Direct opvolgen →' : 'Geen actie nodig'}
            </p>
          </button>
        </div>

        {/* ============ Snelle acties — 4 knoppen ============ */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_-2px_rgba(15,23,42,0.06)] p-3.5 mb-5">
          <div className="flex items-center justify-between mb-2.5 px-1.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Snelle acties</p>
            <span className="text-[10px] text-slate-400 font-semibold">Klik om naar de sectie te springen</span>
          </div>
          <div className="grid grid-cols-4 gap-2.5">
            <button onClick={() => window.dispatchEvent(new CustomEvent('saas-nav', { detail: 'saas_invoices' }))}
              data-testid="saas-quick-new-invoice"
              className="group flex items-center gap-3 p-3 rounded-xl bg-gradient-to-br from-orange-50 to-orange-100/40 hover:from-orange-100 hover:to-orange-200/60 border border-orange-100 hover:border-orange-300 transition-all">
              <div className="w-10 h-10 rounded-lg bg-white/80 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <FileText className="w-5 h-5 text-[#FF5C00]" />
              </div>
              <div className="text-left">
                <p className="text-sm font-black text-slate-900">Facturen</p>
                <p className="text-[10px] text-slate-500 font-semibold">Abonnementen beheren</p>
              </div>
            </button>
            <button onClick={() => window.dispatchEvent(new CustomEvent('saas-nav', { detail: 'companies' }))}
              data-testid="saas-quick-new-company"
              className="group flex items-center gap-3 p-3 rounded-xl bg-gradient-to-br from-amber-50 to-amber-100/40 hover:from-amber-100 hover:to-amber-200/60 border border-amber-100 hover:border-amber-300 transition-all">
              <div className="w-10 h-10 rounded-lg bg-white/80 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Briefcase className="w-5 h-5 text-amber-600" />
              </div>
              <div className="text-left">
                <p className="text-sm font-black text-slate-900">Bedrijven</p>
                <p className="text-[10px] text-slate-500 font-semibold">Nieuw bedrijf toevoegen</p>
              </div>
            </button>
            <button onClick={() => window.dispatchEvent(new CustomEvent('saas-nav', { detail: 'saas_clients' }))}
              data-testid="saas-quick-new-client"
              className="group flex items-center gap-3 p-3 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/40 hover:from-emerald-100 hover:to-emerald-200/60 border border-emerald-100 hover:border-emerald-300 transition-all">
              <div className="w-10 h-10 rounded-lg bg-white/80 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <UserPlus className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="text-left">
                <p className="text-sm font-black text-slate-900">Klanten</p>
                <p className="text-[10px] text-slate-500 font-semibold">Klantenbeheer openen</p>
              </div>
            </button>
            <button onClick={() => window.dispatchEvent(new CustomEvent('saas-nav', { detail: 'saas_pending' }))}
              data-testid="saas-quick-ocr"
              className={`group flex items-center gap-3 p-3 rounded-xl transition-shadow border ${
                overview.pending_ocr > 0
                  ? 'text-white hover:shadow-[0_10px_24px_-8px_rgba(255,92,0,0.5)] border-orange-600'
                  : 'bg-gradient-to-br from-slate-50 to-slate-100/40 hover:from-slate-100 hover:to-slate-200/60 border-slate-100 hover:border-slate-300'
              }`}
              style={overview.pending_ocr > 0 ? { background: 'linear-gradient(135deg, #FF8A3D 0%, #FF5C00 55%, #C74600 100%)' } : {}}>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform ${
                overview.pending_ocr > 0 ? 'bg-white/20' : 'bg-white/80'
              }`}>
                <ScanLine className={`w-5 h-5 ${overview.pending_ocr > 0 ? 'text-white' : 'text-slate-700'}`} />
              </div>
              <div className="text-left">
                <p className={`text-sm font-black ${overview.pending_ocr > 0 ? 'text-white' : 'text-slate-900'}`}>
                  OCR ({overview.pending_ocr || 0})
                </p>
                <p className={`text-[10px] font-semibold ${overview.pending_ocr > 0 ? 'text-white/80' : 'text-slate-500'}`}>
                  {overview.pending_ocr > 0 ? 'Wacht op keuring' : 'Alles goedgekeurd'}
                </p>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* ===================================================================
          SaaS-specifieke live-widgets (blijven onder de KPI-rij staan)
          =================================================================== */}

      {/* Online bedrijven — live presence */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_-2px_rgba(15,23,42,0.06)] mb-6" data-testid="online-section">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
            </span>
            <h2 className="font-extrabold text-slate-900">Nu online · {onlineCompanies.length}</h2>
          </div>
          <p className="text-[11px] text-slate-400 font-mono">Drempel: 5 min</p>
        </div>
        {onlineCompanies.length === 0 ? (
          <div className="px-5 py-10 text-center text-slate-400 text-sm" data-testid="no-online">
            <WifiOff className="w-8 h-8 mx-auto mb-2 opacity-50" />
            Op dit moment is niemand online.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {onlineCompanies.map((c) => (
              <div key={c.id} className="px-5 py-3 flex items-center gap-3" data-testid={`online-row-${c.id}`}>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900 truncate">{c.name}</p>
                  <p className="text-xs text-slate-500 font-mono truncate">/{c.slug}</p>
                </div>
                <div className="hidden sm:flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ring-1 ring-inset ${STATUS_PILL[c.billing_status] || STATUS_PILL.active}`}>
                    {STATUS_LABEL[c.billing_status] || c.billing_status}
                  </span>
                  {c.active_users > 0 && (
                    <span className="text-[10px] font-bold text-slate-500">{c.active_users} user{c.active_users === 1 ? '' : 's'}</span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 shrink-0 font-mono">{fmtRelative(c.last_seen_at)}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Trial verloopt bijna */}
      {trialExpiring.length > 0 && (
        <section className="bg-amber-50 rounded-2xl border-2 border-amber-200 mb-6 overflow-hidden" data-testid="trial-expiring-section">
          <div className="px-5 py-3 border-b border-amber-200 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-700" />
            <h2 className="font-extrabold text-amber-900">Proefperiode verloopt binnen 3 dagen · {trialExpiring.length}</h2>
          </div>
          <div className="divide-y divide-amber-100">
            {trialExpiring.map((c) => {
              const end = new Date(c.trial_ends_at);
              const days = Math.ceil((end.getTime() - Date.now()) / 86400000);
              return (
                <div key={c.id} className="px-5 py-3 flex items-center gap-3" data-testid={`trial-expiring-row-${c.id}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 truncate">{c.name}</p>
                    <p className="text-xs text-slate-500 font-mono truncate">/{c.slug}</p>
                  </div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">
                    {days === 0 ? 'Vandaag' : `${days}d`}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Recent gezien (offline) */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_-2px_rgba(15,23,42,0.06)]" data-testid="offline-section">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-extrabold text-slate-900">Recent gezien · {offlineCompanies.length}</h2>
          <p className="text-[11px] text-slate-400">gesorteerd op laatst actief</p>
        </div>
        <div className="divide-y divide-slate-100">
          {offlineCompanies.slice(0, 10).map((c) => (
            <div key={c.id} className="px-5 py-3 flex items-center gap-3" data-testid={`offline-row-${c.id}`}>
              <span className="w-2.5 h-2.5 rounded-full bg-slate-300 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-900 truncate">{c.name}</p>
                <p className="text-xs text-slate-500 font-mono truncate">/{c.slug}</p>
              </div>
              <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ring-1 ring-inset ${STATUS_PILL[c.billing_status] || STATUS_PILL.active}`}>
                {STATUS_LABEL[c.billing_status] || c.billing_status}
              </span>
              <p className="text-[11px] text-slate-500 shrink-0 font-mono w-24 text-right">{fmtRelative(c.last_seen_at)}</p>
            </div>
          ))}
          {offlineCompanies.length === 0 && (
            <div className="px-5 py-8 text-center text-slate-400 text-sm">Alle bedrijven zijn online! 🎉</div>
          )}
          {offlineCompanies.length > 10 && (
            <div className="px-5 py-3 text-center">
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('saas-nav', { detail: 'companies' }))}
                className="text-sm font-bold text-orange-600 hover:text-orange-700 inline-flex items-center gap-1"
                data-testid="see-all-companies">
                Bekijk alle {companies.length} bedrijven <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Danger Zone — volledige database reset (behoud alleen Demo + superadmins) */}
      <DangerZone onDone={load} />
    </div>
  );
}

// =====================================================================
// DangerZone — knop om ALLE bedrijven + hun data te wissen. Vereist een
// dubbele bevestiging: eerst een knop om het paneel open te klappen, dan
// exact intypen van "WIPE ALL COMPANIES" om te bevestigen.
// =====================================================================
function DangerZone({ onDone }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');

  const canSubmit = confirm.trim() === 'WIPE ALL COMPANIES';

  const submit = async () => {
    if (!canSubmit) return;
    setLoading(true); setErr(''); setResult(null);
    try {
      const { data } = await api.post('/superadmin/wipe-all-companies', {
        confirm: 'WIPE ALL COMPANIES',
      });
      setResult(data);
      setConfirm('');
      if (onDone) onDone();
    } catch (e) {
      setErr(formatError(e) || 'Kon niet wissen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mt-8" data-testid="danger-zone">
      <div className="rounded-2xl border-2 border-red-200 bg-red-50/50 overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center">
              <Trash2 className="w-4 h-4 text-red-600" />
            </div>
            <div>
              <h2 className="text-sm font-black text-red-700 uppercase tracking-widest">Danger Zone</h2>
              <p className="text-[11px] text-red-600/80 font-semibold">Onomkeerbare acties — pas op.</p>
            </div>
          </div>
          {!open && (
            <button onClick={() => setOpen(true)} data-testid="danger-open-btn"
              className="h-9 px-3 rounded-lg bg-white border border-red-200 hover:border-red-400 text-red-700 font-bold text-xs">
              Toon opties
            </button>
          )}
        </div>

        {open && (
          <div className="px-5 pb-5 border-t border-red-200 pt-4">
            <div className="bg-white rounded-xl p-4 border border-red-200">
              <h3 className="font-black text-slate-900 text-sm">Alle bedrijven + data wissen</h3>
              <p className="text-xs text-slate-600 mt-1">
                Verwijdert <b>alle</b> bedrijven, huurders, facturen, betalingen, plans en admins.
                Behoudt: <b>superadmin logins</b> en het <b>&ldquo;Demo Vastgoed N.V.&rdquo;</b> demo-bedrijf.
              </p>
              <div className="mt-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Typ ter bevestiging: <span className="text-red-600 font-mono">WIPE ALL COMPANIES</span>
                </label>
                <input type="text" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  data-testid="danger-confirm-input"
                  placeholder="WIPE ALL COMPANIES"
                  className="w-full mt-1 h-11 px-3 rounded-lg border-2 border-slate-200 focus:border-red-500 outline-none text-sm font-mono" />
              </div>

              {err && (
                <div className="mt-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-semibold" data-testid="danger-error">
                  {err}
                </div>
              )}
              {result && (
                <div className="mt-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800" data-testid="danger-result">
                  <p className="font-black mb-1">✓ Wipe voltooid</p>
                  <p>Behouden: {result.remaining_companies} bedrijf · {result.remaining_users} users (superadmin + demo).</p>
                  <p className="mt-1 text-[11px] opacity-80">
                    Verwijderd: {Object.entries(result.deleted || {})
                      .filter(([, v]) => v > 0)
                      .map(([k, v]) => `${v} ${k}`)
                      .join(', ')}
                  </p>
                </div>
              )}

              <div className="mt-4 flex gap-2 justify-end">
                <button onClick={() => { setOpen(false); setConfirm(''); setErr(''); }}
                  data-testid="danger-cancel-btn"
                  className="h-10 px-4 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm">
                  Annuleren
                </button>
                <button onClick={submit} disabled={!canSubmit || loading}
                  data-testid="danger-wipe-btn"
                  className="h-10 px-4 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white font-bold text-sm inline-flex items-center gap-2">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Definitief wissen
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
