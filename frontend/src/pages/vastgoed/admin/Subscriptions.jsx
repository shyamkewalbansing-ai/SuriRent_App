import { useState, useEffect, useCallback } from 'react';
import {
  Building2, Users, Loader2, TrendingUp, Clock, AlertCircle, CheckCircle, XCircle,
  Banknote, Receipt, Search, Mail, Phone, MoreVertical, Plus, X, Check, Calendar,
  Pencil, ArrowRight, Crown,
} from 'lucide-react';
import { api, formatError } from '../../../lib/api';

const fmt = (n, c = 'SRD') => `${c} ${Number(n || 0).toLocaleString('nl-NL')}`;
const fmtDate = (s) => s ? new Date(s).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const STATUS_STYLES = {
  trial: { label: 'Proefperiode', bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  active: { label: 'Actief', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  expired: { label: 'Verlopen', bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  cancelled: { label: 'Opgezegd', bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400' },
};

function StatCard({ icon: Icon, label, value, sub, color = 'orange' }) {
  const tones = {
    orange: 'from-orange-50 to-orange-100 text-orange-700',
    emerald: 'from-emerald-50 to-emerald-100 text-emerald-700',
    red: 'from-red-50 to-red-100 text-red-700',
    slate: 'from-slate-50 to-slate-100 text-slate-700',
  };
  return (
    <div className={`bg-gradient-to-br ${tones[color]} rounded-2xl p-4`}>
      <div className="flex items-center justify-between mb-2">
        <Icon className="w-5 h-5 opacity-80" />
        <span className="text-[10px] font-extrabold uppercase tracking-widest opacity-70">{label}</span>
      </div>
      <p className="text-2xl font-extrabold">{value}</p>
      {sub && <p className="text-[11px] opacity-70 mt-0.5">{sub}</p>}
    </div>
  );
}

function ExtendModal({ company, onClose, onDone }) {
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    setLoading(true); setErr('');
    try {
      await api.post(`/companies/${company.id}/extend-trial`, { days: Number(days) });
      onDone();
    } catch (e) { setErr(formatError(e)); }
    finally { setLoading(false); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-8" data-testid="extend-modal">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-extrabold text-slate-900">Proefperiode verlengen</h3>
          <button onClick={onClose} data-testid="extend-modal-close"
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-sm text-slate-500 mb-4">Voor <span className="font-bold text-slate-900">{company.name}</span></p>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">Aantal dagen</label>
        <div className="flex gap-2 mb-2">
          {[7, 14, 30, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)} data-testid={`extend-preset-${d}`}
              className={`flex-1 h-10 rounded-xl font-bold text-sm transition ${
                days === d ? 'bg-orange-500 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}>{d}d</button>
          ))}
        </div>
        <input type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)}
          data-testid="extend-days-input"
          className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-orange-500 outline-none" />
        {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">Annuleer</button>
          <button onClick={submit} disabled={loading} data-testid="extend-confirm"
            className="flex-1 h-11 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Verleng
          </button>
        </div>
      </div>
    </div>
  );
}

function CompanyDetailDrawer({ company, onClose, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [showExtend, setShowExtend] = useState(false);
  const status = STATUS_STYLES[company.billing_status] || STATUS_STYLES.active;

  const activate = async () => {
    if (!window.confirm(`Abonnement van "${company.name}" markeren als actief? Dit maakt een betaalde factuur aan.`)) return;
    setBusy(true); setErr('');
    try {
      await api.post(`/companies/${company.id}/activate-subscription`);
      onChanged();
    } catch (e) { setErr(formatError(e)); }
    finally { setBusy(false); }
  };
  const cancel = async () => {
    if (!window.confirm(`Abonnement van "${company.name}" opzeggen? Toegang blijft tot einde van de periode.`)) return;
    setBusy(true); setErr('');
    try {
      await api.post(`/companies/${company.id}/cancel-subscription`);
      onChanged();
    } catch (e) { setErr(formatError(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-stretch justify-end" data-testid="company-drawer">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md h-full overflow-y-auto shadow-2xl animate-slide-in flex flex-col">
        <div className="sticky top-0 bg-white border-b border-slate-100 p-5 flex items-center justify-between z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shrink-0">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-extrabold text-slate-900 truncate">{company.name}</h3>
              <p className="text-xs text-slate-400 font-mono truncate">/{company.slug}</p>
            </div>
          </div>
          <button onClick={onClose} data-testid="drawer-close"
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center shrink-0"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 p-5 space-y-4">
          <div className={`${status.bg} rounded-2xl p-4`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-2 h-2 rounded-full ${status.dot}`} />
              <span className={`text-xs font-extrabold uppercase tracking-widest ${status.text}`}>{status.label}</span>
            </div>
            {company.billing_status === 'trial' && (
              <p className="text-sm text-slate-700">
                Nog <span className="font-extrabold">{company.days_left} dagen</span> proefperiode, eindigt op {fmtDate(company.trial_ends_at)}.
              </p>
            )}
            {company.billing_status === 'active' && (
              <p className="text-sm text-slate-700">
                Volgende vernieuwing: <span className="font-extrabold">{fmtDate(company.subscription_renews_at)}</span>
              </p>
            )}
            {company.billing_status === 'expired' && (
              <p className="text-sm text-slate-700">Proefperiode is verlopen. Markeer als actief zodra betaling is ontvangen.</p>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-2">Abonnement</p>
            <Row label="Pakket" value={company.plan} bold />
            <Row label="Maandprijs" value={fmt(company.monthly_amount, company.currency)} />
            <Row label="Aangemaakt op" value={fmtDate(company.created_at)} />
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-2">Eigenaar</p>
            <Row label="E-mail" value={company.owner_email || '—'} mono />
            <Row label="Telefoon" value={company.telefoon || '—'} mono />
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-2">Statistieken</p>
            <Row label="Appartementen" value={company.stats?.apartments ?? 0} />
            <Row label="Huurders" value={company.stats?.tenants ?? 0} />
            <Row label="Beheerders" value={company.stats?.admins ?? 0} />
          </div>

          {err && <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 text-sm">{err}</div>}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-100 p-4 flex flex-col gap-2">
          {(company.billing_status === 'trial' || company.billing_status === 'expired') && (
            <button onClick={() => setShowExtend(true)} disabled={busy} data-testid="drawer-extend"
              className="w-full h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-sm flex items-center justify-center gap-2">
              <Calendar className="w-4 h-4" /> Proefperiode verlengen
            </button>
          )}
          {company.billing_status !== 'active' && (
            <button onClick={activate} disabled={busy} data-testid="drawer-activate"
              className="w-full h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Markeer als actief / Betaling ontvangen
            </button>
          )}
          {company.billing_status === 'active' && (
            <button onClick={cancel} disabled={busy} data-testid="drawer-cancel"
              className="w-full h-11 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 font-bold text-sm">
              Abonnement opzeggen
            </button>
          )}
        </div>

        {showExtend && (
          <ExtendModal company={company} onClose={() => setShowExtend(false)}
            onDone={() => { setShowExtend(false); onChanged(); }} />
        )}
      </div>
    </div>
  );
}

function Row({ label, value, mono, bold }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`${bold ? 'font-extrabold' : 'font-bold'} text-slate-900 text-right ${mono ? 'font-mono' : ''} capitalize`}>{value}</span>
    </div>
  );
}

export default function Subscriptions() {
  const [overview, setOverview] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [tab, setTab] = useState('companies');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, c, i] = await Promise.all([
        api.get('/superadmin/overview'),
        api.get('/companies'),
        api.get('/superadmin/subscription-invoices'),
      ]);
      setOverview(o.data); setCompanies(c.data); setInvoices(i.data);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const markPaid = async (inv) => {
    if (!window.confirm(`Factuur ${inv.id.slice(-6)} voor ${inv.company_name} markeren als betaald?`)) return;
    await api.post(`/superadmin/subscription-invoices/${inv.id}/mark-paid`);
    load();
  };

  if (loading || !overview) {
    return <div className="py-16 flex items-center justify-center"><Loader2 className="w-8 h-8 text-orange-500 animate-spin" /></div>;
  }

  const filtered = companies.filter((c) => {
    if (filter !== 'all' && c.billing_status !== filter) return false;
    if (search && !`${c.name} ${c.slug} ${c.owner_email || ''}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Crown className="w-6 h-6 text-orange-500" />
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">SaaS Beheer</h1>
      </div>
      <p className="text-sm text-slate-500 mb-6">Alle bedrijven, abonnementen en facturen op één plek.</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={TrendingUp} label="MRR" value={fmt(overview.mrr, overview.currency)}
          sub={`${overview.active} actief abonnement${overview.active === 1 ? '' : 'en'}`} color="emerald" />
        <StatCard icon={Building2} label="Totaal bedrijven" value={overview.companies_total}
          sub={`${overview.active} actief · ${overview.trial} trial`} color="orange" />
        <StatCard icon={Clock} label="Proefperiode" value={overview.trial}
          sub="bedrijven testen nu" color="orange" />
        <StatCard icon={AlertCircle} label="Verlopen / Opgezegd" value={overview.expired + overview.cancelled}
          sub={`${overview.expired} verlopen · ${overview.cancelled} opgezegd`} color={overview.expired > 0 ? 'red' : 'slate'} />
      </div>

      <div className="flex items-center gap-1.5 mb-4 border-b border-slate-100">
        {[
          { id: 'companies', label: `Bedrijven (${companies.length})`, icon: Building2 },
          { id: 'invoices', label: `Facturen (${invoices.length})`, icon: Receipt },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} data-testid={`sub-tab-${t.id}`}
              className={`px-4 py-2.5 rounded-t-lg text-sm font-bold flex items-center gap-2 transition ${
                tab === t.id ? 'bg-white text-orange-600 border-b-2 border-orange-500 -mb-px' : 'text-slate-500 hover:text-slate-700'
              }`}>
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'companies' && (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Zoek bedrijf, slug of e-mail..."
                data-testid="sub-search"
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 focus:border-orange-500 outline-none text-sm" />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {['all', 'trial', 'active', 'expired', 'cancelled'].map((f) => (
                <button key={f} onClick={() => setFilter(f)} data-testid={`sub-filter-${f}`}
                  className={`px-3 h-10 rounded-xl text-xs font-bold uppercase tracking-wider whitespace-nowrap ${
                    filter === f ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}>{f === 'all' ? 'Alle' : STATUS_STYLES[f]?.label || f}</button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {filtered.map((c) => {
              const st = STATUS_STYLES[c.billing_status] || STATUS_STYLES.active;
              return (
                <button key={c.id} onClick={() => setSelected(c)} data-testid={`sub-company-${c.id}`}
                  className="w-full bg-white rounded-2xl border border-slate-100 hover:border-orange-300 transition p-4 flex items-center gap-3 text-left">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-extrabold text-slate-900 truncate">{c.name}</p>
                      <span className={`inline-flex items-center gap-1 ${st.bg} ${st.text} text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{st.label}
                        {c.billing_status === 'trial' && c.days_left != null && <span className="ml-1 opacity-80">· {c.days_left}d</span>}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5 font-mono">/{c.slug} · {c.owner_email || c.contact_email || '—'}</p>
                  </div>
                  <div className="hidden sm:block text-right shrink-0">
                    <p className="text-sm font-extrabold text-slate-900">{fmt(c.monthly_amount, c.currency)}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider capitalize">{c.plan}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center text-slate-400">
                Geen bedrijven gevonden voor deze filter.
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'invoices' && (
        <div className="space-y-2">
          {invoices.map((inv) => (
            <div key={inv.id} data-testid={`sub-invoice-${inv.id}`}
              className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-3">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                inv.status === 'paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'
              }`}>
                {inv.status === 'paid' ? <CheckCircle className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-extrabold text-slate-900 truncate">{inv.company_name}</p>
                  <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    inv.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'
                  }`}>{inv.status === 'paid' ? 'Betaald' : 'Open'}</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {fmtDate(inv.created_at)} · {inv.plan} · {fmtDate(inv.period_start)} → {fmtDate(inv.period_end)}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-extrabold text-slate-900">{fmt(inv.amount, inv.currency)}</p>
                {inv.status !== 'paid' && (
                  <button onClick={() => markPaid(inv)} data-testid={`mark-paid-${inv.id}`}
                    className="text-xs font-bold text-orange-600 hover:text-orange-700 mt-1">Markeer betaald</button>
                )}
              </div>
            </div>
          ))}
          {invoices.length === 0 && (
            <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center text-slate-400">
              Nog geen SaaS-facturen aangemaakt. Markeer een trial als actief om de eerste factuur te genereren.
            </div>
          )}
        </div>
      )}

      {selected && (
        <CompanyDetailDrawer company={selected} onClose={() => setSelected(null)}
          onChanged={() => { setSelected(null); load(); }} />
      )}
    </div>
  );
}
