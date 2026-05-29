import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Users, Loader2, TrendingUp, Clock, AlertCircle, CheckCircle, XCircle,
  Banknote, Receipt, Search, Mail, Phone, MoreVertical, Plus, X, Check, Calendar,
  Pencil, ArrowRight, Crown, LogIn, Landmark, CreditCard, ScanLine, FileImage,
} from 'lucide-react';
import { api, formatError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';

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
    <div className="fixed inset-0 z-50 bg-white/30 backdrop-blur-md flex items-center justify-center p-4">
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

function PaymentRegistrationModal({ companies, defaultCompanyId, onClose, onSaved }) {
  const [companyId, setCompanyId] = useState(defaultCompanyId || (companies[0]?.id || ''));
  const selectedCompany = companies.find((c) => c.id === companyId);
  const [amount, setAmount] = useState(selectedCompany?.monthly_amount || 0);
  const [currency, setCurrency] = useState(selectedCompany?.currency || 'SRD');
  const [method, setMethod] = useState('bank');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (selectedCompany) {
      setAmount(selectedCompany.monthly_amount || 0);
      setCurrency(selectedCompany.currency || 'SRD');
    }
  }, [selectedCompany]);

  const submit = async () => {
    setLoading(true); setErr('');
    try {
      await api.post('/superadmin/subscription-payments', {
        company_id: companyId,
        amount: Number(amount) || 0,
        currency, method, reference, note,
        paid_at: new Date(paidAt).toISOString(),
      });
      onSaved();
    } catch (e) { setErr(formatError(e)); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-white/30 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 sm:p-8 max-h-[90vh] overflow-y-auto" data-testid="register-payment-modal">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <Banknote className="w-5 h-5 text-emerald-600" />
            </div>
            <h3 className="text-xl font-extrabold text-slate-900">Betaling registreren</h3>
          </div>
          <button onClick={onClose} data-testid="reg-pay-close"
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Bedrijf</label>
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} data-testid="reg-pay-company"
              className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-orange-500 outline-none bg-white">
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name} · {c.plan}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Bedrag</label>
              <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
                data-testid="reg-pay-amount"
                className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-orange-500 outline-none font-mono" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Valuta</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} data-testid="reg-pay-currency"
                className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-orange-500 outline-none bg-white">
                <option value="SRD">SRD</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Betaalmethode</label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { v: 'bank', l: 'Bank', icon: Landmark },
                { v: 'mope', l: 'Mope', icon: CreditCard },
                { v: 'contant', l: 'Contant', icon: Banknote },
                { v: 'overig', l: 'Overig', icon: MoreVertical },
              ].map((m) => {
                const Icon = m.icon;
                const sel = method === m.v;
                return (
                  <button key={m.v} type="button" onClick={() => setMethod(m.v)} data-testid={`reg-pay-method-${m.v}`}
                    className={`flex flex-col items-center gap-1 py-2 rounded-xl border-2 transition ${
                      sel ? 'border-orange-500 bg-orange-50' : 'border-slate-200 hover:border-slate-300'
                    }`}>
                    <Icon className={`w-4 h-4 ${sel ? 'text-orange-600' : 'text-slate-500'}`} />
                    <span className={`text-xs font-bold ${sel ? 'text-orange-700' : 'text-slate-700'}`}>{m.l}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Referentie / Mededeling</label>
            <input type="text" value={reference} onChange={(e) => setReference(e.target.value)}
              placeholder="bv. ABONNEMENT — mei 2026" data-testid="reg-pay-reference"
              className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-orange-500 outline-none font-mono text-sm" />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Datum ontvangen</label>
            <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} data-testid="reg-pay-date"
              className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-orange-500 outline-none" />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Notitie (intern)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              data-testid="reg-pay-note"
              className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-orange-500 outline-none text-sm" />
          </div>
        </div>

        {err && <p className="text-sm text-red-600 mt-3" data-testid="reg-pay-error">{err}</p>}

        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 mt-4 text-xs text-slate-600">
          Bij registreren wordt automatisch een factuur aangemaakt en het bedrijf op <strong>actief</strong> gezet (30 dagen verlenging).
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} disabled={loading}
            className="flex-1 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">Annuleer</button>
          <button onClick={submit} disabled={loading || !companyId || amount <= 0} data-testid="reg-pay-submit"
            className="flex-1 h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold flex items-center justify-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Registreer
          </button>
        </div>
      </div>
    </div>
  );
}

function CompanyDetailDrawer({ company, onClose, onChanged }) {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [showExtend, setShowExtend] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const status = STATUS_STYLES[company.billing_status] || STATUS_STYLES.active;

  const impersonate = async () => {
    if (!window.confirm(`Inloggen als beheerder van "${company.name}"? U verlaat het SaaS dashboard en kunt diens omgeving zien.`)) return;
    setBusy(true); setErr('');
    try {
      const { data } = await api.post(`/superadmin/companies/${company.id}/impersonate`);
      if (data?.token) localStorage.setItem('admin_token', data.token);
      if (data?.company) localStorage.setItem('active_company', JSON.stringify(data.company));
      // Hard reload to guarantee a clean component tree for the impersonated context
      window.location.href = '/admin';
    } catch (e) { setErr(formatError(e)); setBusy(false); }
  };

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
    <div className="fixed inset-0 z-50 bg-white/30 backdrop-blur-md flex items-stretch justify-end" data-testid="company-drawer">
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
          <button onClick={impersonate} disabled={busy} data-testid="drawer-impersonate"
            className="w-full h-11 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            <LogIn className="w-4 h-4" /> Login als beheerder
          </button>
          <button onClick={() => setShowPay(true)} disabled={busy} data-testid="drawer-register-payment"
            className="w-full h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-sm flex items-center justify-center gap-2">
            <Banknote className="w-4 h-4" /> Betaling registreren
          </button>
          {(company.billing_status === 'trial' || company.billing_status === 'expired') && (
            <button onClick={() => setShowExtend(true)} disabled={busy} data-testid="drawer-extend"
              className="w-full h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-sm flex items-center justify-center gap-2">
              <Calendar className="w-4 h-4" /> Proefperiode verlengen
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
        {showPay && (
          <PaymentRegistrationModal companies={[company]} defaultCompanyId={company.id}
            onClose={() => setShowPay(false)}
            onSaved={() => { setShowPay(false); onChanged(); }} />
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
  const [payments, setPayments] = useState([]);
  const [pending, setPending] = useState([]);   // OCR-mismatch wachtend op handmatige goedkeuring
  const [tab, setTab] = useState('companies');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [showPay, setShowPay] = useState(false);
  const [loading, setLoading] = useState(true);
  const [previewStmt, setPreviewStmt] = useState(null);  // {url, contentType}
  const [busyRow, setBusyRow] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, c, i, p, pa] = await Promise.all([
        api.get('/superadmin/overview'),
        api.get('/companies'),
        api.get('/superadmin/subscription-invoices'),
        api.get('/superadmin/subscription-payments'),
        api.get('/superadmin/saas-pending-approvals'),
      ]);
      setOverview(o.data); setCompanies(c.data); setInvoices(i.data); setPayments(p.data);
      setPending(pa.data);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const markPaid = async (inv) => {
    if (!window.confirm(`Factuur ${inv.id.slice(-6)} voor ${inv.company_name} markeren als betaald?`)) return;
    await api.post(`/superadmin/subscription-invoices/${inv.id}/mark-paid`);
    load();
  };

  const approvePending = async (pr) => {
    if (!window.confirm(`OCR-betaling van ${pr.company_name} goedkeuren? Het abonnement wordt direct geactiveerd.`)) return;
    setBusyRow(pr.id);
    try {
      await api.post(`/superadmin/saas-payment-requests/${pr.id}/approve`);
      load();
    } catch (e) {
      window.alert(formatError(e));
    } finally { setBusyRow(''); }
  };

  const rejectPending = async (pr) => {
    const reason = window.prompt(`Reden van afwijzing voor ${pr.company_name}?`, '');
    if (reason === null) return;
    setBusyRow(pr.id);
    try {
      await api.post(`/superadmin/saas-payment-requests/${pr.id}/reject`, { reason });
      load();
    } catch (e) {
      window.alert(formatError(e));
    } finally { setBusyRow(''); }
  };

  // Bankafschrift previewen: download als blob (authenticated) en maak object-URL.
  const openStatementPreview = async (pr) => {
    if (!pr.bank_statement_id) return;
    setBusyRow(pr.id);
    try {
      const resp = await api.get(`/superadmin/saas-bank-statement/${pr.bank_statement_id}`, {
        responseType: 'blob',
      });
      const blob = resp.data;
      const url = URL.createObjectURL(blob);
      setPreviewStmt({ url, name: `Bankafschrift · ${pr.company_name}`, isPdf: (blob.type || '').includes('pdf') });
    } catch (e) {
      window.alert(formatError(e));
    } finally { setBusyRow(''); }
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
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Crown className="w-6 h-6 text-orange-500" />
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">SaaS Beheer</h1>
          </div>
          <p className="text-sm text-slate-500">Alle bedrijven, abonnementen, facturen en betalingen op één plek.</p>
        </div>
        <button onClick={() => setShowPay(true)} data-testid="register-payment-btn"
          className="px-5 h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold flex items-center gap-2 shadow-lg shadow-emerald-500/25">
          <Banknote className="w-4 h-4" /> Betaling registreren
        </button>
      </div>

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

      <div className="flex items-center gap-1.5 mb-4 border-b border-slate-100 overflow-x-auto">
        {[
          { id: 'companies', label: `Bedrijven (${companies.length})`, icon: Building2 },
          { id: 'pending',
            label: `OCR-goedkeuring${pending.length > 0 ? ` (${pending.length})` : ''}`,
            icon: ScanLine, highlight: pending.length > 0 },
          { id: 'invoices', label: `Facturen (${invoices.length})`, icon: Receipt },
          { id: 'payments', label: `Betalingen (${payments.length})`, icon: Banknote },
        ].map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} data-testid={`sub-tab-${t.id}`}
              className={`px-4 py-2.5 rounded-t-lg text-sm font-bold flex items-center gap-2 transition whitespace-nowrap ${
                active ? 'bg-white text-orange-600 border-b-2 border-orange-500 -mb-px'
                  : t.highlight ? 'text-amber-700 bg-amber-50 hover:bg-amber-100' : 'text-slate-500 hover:text-slate-700'
              }`}>
              <Icon className="w-4 h-4" /> {t.label}
              {t.id === 'pending' && pending.length > 0 && !active && (
                <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-extrabold">
                  {pending.length}
                </span>
              )}
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

      {tab === 'pending' && (
        <div className="space-y-3" data-testid="sub-pending-list">
          {pending.length === 0 && (
            <div className="bg-white rounded-2xl border-2 border-dashed border-emerald-200 p-10 text-center">
              <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
              <p className="font-extrabold text-slate-700">Alles netjes!</p>
              <p className="text-sm text-slate-500 mt-1">Geen OCR-mismatches die wachten op handmatige goedkeuring.</p>
            </div>
          )}
          {pending.map((pr) => {
            const ocr = pr.ocr || {};
            return (
              <div key={pr.id} data-testid={`pending-row-${pr.id}`}
                className="bg-white rounded-2xl border border-amber-200 p-4 sm:p-5">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                    <ScanLine className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-extrabold text-slate-900">{pr.company_name}</p>
                    <p className="text-xs text-slate-500 font-mono">/{pr.company_slug}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-extrabold text-slate-900">{fmt(pr.amount, pr.currency)}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">{pr.provider}</p>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3 mb-3">
                  <div className="bg-slate-50 rounded-xl p-3 text-xs">
                    <p className="text-[10px] uppercase tracking-wider font-extrabold text-slate-500 mb-1.5">Verwacht (factuur)</p>
                    <p className="font-bold text-slate-800">{fmt(pr.invoice_amount, pr.invoice_currency)}</p>
                    <p className="text-slate-500 mt-1">Plan: <span className="font-mono capitalize">{pr.invoice_plan}</span></p>
                    <p className="text-slate-500">Status: <span className="font-mono">{pr.invoice_status || 'open'}</span></p>
                  </div>
                  <div className="bg-amber-50 rounded-xl p-3 text-xs border border-amber-100">
                    <p className="text-[10px] uppercase tracking-wider font-extrabold text-amber-700 mb-1.5">OCR-resultaat</p>
                    <p className="font-bold text-slate-800">
                      {ocr.amount != null ? `${ocr.currency || pr.currency} ${Number(ocr.amount).toLocaleString('nl-NL')}` : '— niet herkend —'}
                    </p>
                    <p className="text-slate-600 mt-1">Datum: <span className="font-mono">{ocr.date_iso || '?'}</span></p>
                    <p className="text-slate-600">Betaler: <span className="font-mono">{ocr.payer_name || '?'}</span></p>
                    <p className="text-slate-600">Confidence: <span className="font-mono">{ocr.confidence != null ? `${Math.round(ocr.confidence * 100)}%` : '?'}</span></p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {pr.bank_statement_id && (
                    <button onClick={() => openStatementPreview(pr)} disabled={busyRow === pr.id}
                      data-testid={`pending-view-${pr.id}`}
                      className="px-3 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 disabled:opacity-50">
                      <FileImage className="w-3.5 h-3.5" /> Bekijk afschrift
                    </button>
                  )}
                  <div className="flex-1" />
                  <button onClick={() => rejectPending(pr)} disabled={busyRow === pr.id}
                    data-testid={`pending-reject-${pr.id}`}
                    className="px-4 h-10 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-extrabold text-sm flex items-center gap-1.5 disabled:opacity-50">
                    <XCircle className="w-4 h-4" /> Afwijzen
                  </button>
                  <button onClick={() => approvePending(pr)} disabled={busyRow === pr.id}
                    data-testid={`pending-approve-${pr.id}`}
                    className="px-4 h-10 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-sm flex items-center gap-1.5 disabled:opacity-50 shadow-md shadow-emerald-500/25">
                    {busyRow === pr.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Goedkeuren
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'payments' && (
        <div className="space-y-2">
          {payments.map((p) => (
            <div key={p.id} data-testid={`sub-payment-${p.id}`}
              className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <Banknote className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-extrabold text-slate-900 truncate">{p.company_name}</p>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{p.method}</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 truncate">
                  {fmtDate(p.paid_at)}{p.reference ? ` · ${p.reference}` : ''}{p.note ? ` · ${p.note}` : ''}
                </p>
                {p.created_by && <p className="text-[10px] text-slate-400 mt-0.5">Geregistreerd door {p.created_by}</p>}
              </div>
              <p className="font-extrabold text-slate-900 text-right shrink-0">{fmt(p.amount, p.currency)}</p>
            </div>
          ))}
          {payments.length === 0 && (
            <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center text-slate-400">
              Nog geen betalingen geregistreerd. Klik op "Betaling registreren" om de eerste in te voeren.
            </div>
          )}
        </div>
      )}

      {selected && (
        <CompanyDetailDrawer company={selected} onClose={() => setSelected(null)}
          onChanged={() => { setSelected(null); load(); }} />
      )}

      {showPay && (
        <PaymentRegistrationModal companies={companies} onClose={() => setShowPay(false)}
          onSaved={() => { setShowPay(false); load(); }} />
      )}

      {previewStmt && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4"
          data-testid="stmt-preview-modal"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              if (previewStmt?.url) try { URL.revokeObjectURL(previewStmt.url); } catch { /* ignore */ }
              setPreviewStmt(null);
            }
          }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 shrink-0">
              <h3 className="font-extrabold text-slate-900 truncate">{previewStmt.name}</h3>
              <button onClick={() => {
                if (previewStmt?.url) try { URL.revokeObjectURL(previewStmt.url); } catch { /* ignore */ }
                setPreviewStmt(null);
              }} data-testid="stmt-preview-close"
                className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-slate-50 p-4">
              {previewStmt.isPdf ? (
                <iframe src={previewStmt.url} title="Bankafschrift PDF"
                  className="w-full h-[80vh] rounded-lg bg-white border border-slate-200" />
              ) : (
                <img src={previewStmt.url} alt="Bankafschrift"
                  className="max-w-full mx-auto rounded-lg shadow-md" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
