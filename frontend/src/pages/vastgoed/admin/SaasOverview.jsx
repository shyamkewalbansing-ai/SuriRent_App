// Superadmin · SaaS Overzicht
// Live dashboard met MRR, online bedrijven, proefperiodes en openstaande facturen.
// Refreshet elke 15 sec om presence-data actueel te houden.

import { useEffect, useState, useCallback } from 'react';
import {
  Crown, TrendingUp, Building2, Clock, AlertCircle, Wifi, WifiOff,
  ScanLine, Receipt, RefreshCw, Loader2, ArrowRight, Banknote, CheckCircle2, Trash2,
  Wallet, Briefcase, Users,
} from 'lucide-react';
import { api, formatError } from '../../../lib/api';

const fmt = (n, c = 'SRD') => `${c} ${Number(n || 0).toLocaleString('nl-NL')}`;
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

function Kpi({ icon: Icon, label, value, sub, color = 'orange', testid }) {
  const tones = {
    orange: 'from-orange-50 to-orange-100 text-orange-700',
    emerald: 'from-emerald-50 to-emerald-100 text-emerald-700',
    red: 'from-red-50 to-red-100 text-red-700',
    slate: 'from-slate-50 to-slate-100 text-slate-700',
    blue: 'from-sky-50 to-sky-100 text-sky-700',
    amber: 'from-amber-50 to-amber-100 text-amber-700',
  };
  return (
    <div className={`bg-gradient-to-br ${tones[color]} rounded-2xl p-4`} data-testid={testid}>
      <div className="flex items-center justify-between mb-2">
        <Icon className="w-5 h-5 opacity-80" />
        <span className="text-[10px] font-extrabold uppercase tracking-widest opacity-70">{label}</span>
      </div>
      <p className="text-2xl font-extrabold">{value}</p>
      {sub && <p className="text-[11px] opacity-70 mt-0.5">{sub}</p>}
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
    const t = setInterval(load, 15000); // auto-refresh elke 15s
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

  return (
    <div data-testid="saas-overview-page">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Crown className="w-6 h-6 text-orange-500" />
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">SaaS Overzicht</h1>
          </div>
          <p className="text-sm text-slate-500">Live status van alle bedrijven, proefperiodes en betalingen.</p>
        </div>
        <button onClick={load} disabled={refreshing} data-testid="saas-overview-refresh"
          className="h-10 px-4 rounded-xl bg-white border border-slate-200 hover:border-orange-300 text-sm font-bold text-slate-700 flex items-center gap-2 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Vernieuwen
        </button>
      </div>

      {err && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{err}</div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Kpi icon={TrendingUp} label="MRR" value={fmt(overview.mrr, overview.currency)}
          sub={`${overview.active} actieve abonnement${overview.active === 1 ? '' : 'en'}`}
          color="emerald" testid="kpi-mrr" />
        <Kpi icon={Wifi} label="Online nu" value={overview.online_now}
          sub={`${overview.companies_total} bedrijven totaal`}
          color="blue" testid="kpi-online" />
        <Kpi icon={Clock} label="Proefperiode" value={overview.trial}
          sub={trialExpiring.length > 0 ? `${trialExpiring.length} verlopen binnen 3 dagen` : 'bedrijven testen nu'}
          color={trialExpiring.length > 0 ? 'amber' : 'orange'} testid="kpi-trial" />
        <Kpi icon={AlertCircle} label="Verlopen / Opgezegd" value={overview.expired + overview.cancelled}
          sub={`${overview.expired} verlopen · ${overview.cancelled} opgezegd`}
          color={overview.expired > 0 ? 'red' : 'slate'} testid="kpi-churn" />
      </div>

      {/* Action KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <Kpi icon={ScanLine} label="Wacht op OCR-keuring" value={overview.pending_ocr}
          sub={overview.pending_ocr > 0 ? 'Vereist jouw actie' : 'Alles goedgekeurd'}
          color={overview.pending_ocr > 0 ? 'amber' : 'emerald'} testid="kpi-ocr" />
        <Kpi icon={Receipt} label="Open facturen" value={overview.open_invoices}
          sub={`${overview.paid_invoices} betaalde facturen totaal`}
          color={overview.open_invoices > 0 ? 'orange' : 'emerald'} testid="kpi-open-invoices" />
        <Kpi icon={CheckCircle2} label="Betaalde facturen" value={overview.paid_invoices}
          sub="omgezette inkomsten" color="emerald" testid="kpi-paid-invoices" />
      </div>

      {/* Kas saldo card + Snelle acties — beheerder-stijl widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-6">
        {/* Kas saldo — totaal ontvangen SaaS-betalingen in SRD */}
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white rounded-2xl p-5 shadow-lg" data-testid="saas-kas-saldo-card">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-black uppercase tracking-widest opacity-80">Kas saldo (SRD)</p>
            <Wallet className="w-5 h-5 opacity-80" />
          </div>
          <p className="text-3xl font-black">{fmt(overview.total_received_srd || 0, 'SRD')}</p>
          <p className="text-xs opacity-80 mt-1">
            {overview.paid_invoices || 0} betaalde facturen totaal
          </p>
        </div>

        {/* Snelle acties — direct springen naar veelgebruikte SaaS-taken */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-5" data-testid="saas-quick-actions">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-3">Snelle acties</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <QuickAction icon={Briefcase} label="Bedrijven" onClick={() => window.dispatchEvent(new CustomEvent('saas-nav', { detail: 'companies' }))} />
            <QuickAction icon={Users} label="Klanten" onClick={() => window.dispatchEvent(new CustomEvent('saas-nav', { detail: 'saas_clients' }))} />
            <QuickAction icon={Receipt} label="Facturen" onClick={() => window.dispatchEvent(new CustomEvent('saas-nav', { detail: 'saas_invoices' }))} />
            <QuickAction icon={ScanLine} label={`OCR (${overview.pending_ocr || 0})`}
              onClick={() => window.dispatchEvent(new CustomEvent('saas-nav', { detail: 'saas_pending' }))}
              urgent={overview.pending_ocr > 0} />
          </div>
        </div>
      </div>

      {/* Online bedrijven — live presence */}
      <section className="bg-white rounded-2xl border border-slate-100 mb-6" data-testid="online-section">
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
      <section className="bg-white rounded-2xl border border-slate-100" data-testid="offline-section">
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
                onClick={() => window.dispatchEvent(new CustomEvent('go-tab', { detail: 'companies' }))}
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

function QuickAction({ icon: Icon, label, onClick, urgent }) {
  return (
    <button onClick={onClick} data-testid={`quick-${label.toLowerCase().replace(/[^a-z]/g, '-')}`}
      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition active:scale-95 ${
        urgent
          ? 'bg-amber-50 border-amber-200 hover:bg-amber-100'
          : 'bg-slate-50 border-slate-200 hover:bg-slate-100 hover:border-orange-200'
      }`}>
      <Icon className={`w-5 h-5 ${urgent ? 'text-amber-700' : 'text-slate-700'}`} />
      <span className={`text-[11px] font-black uppercase tracking-wider ${urgent ? 'text-amber-800' : 'text-slate-700'}`}>{label}</span>
    </button>
  );
}

