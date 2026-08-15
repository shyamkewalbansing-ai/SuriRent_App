import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Users, Loader2, TrendingUp, Clock, AlertCircle, CheckCircle, XCircle,
  Banknote, Receipt, Search, Mail, Phone, MoreVertical, Plus, X, Check, Calendar,
  Pencil, ArrowRight, Crown, LogIn, Landmark, CreditCard, ScanLine, FileImage, Download,
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
                { v: 'mope', l: 'Uni5Pay', icon: CreditCard },
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

// =====================================================================
// NewInvoiceModal — Handmatig een SaaS-factuur aanmaken voor een bedrijf
// =====================================================================
function NewInvoiceModal({ companies, defaultCompanyId, onClose, onSaved }) {
  const [companyId, setCompanyId] = useState(defaultCompanyId || (companies[0]?.id || ''));
  const selected = companies.find((c) => c.id === companyId);
  const [amount, setAmount] = useState(selected?.monthly_amount || 0);
  const [currency, setCurrency] = useState(selected?.currency || 'SRD');
  const [plan, setPlan] = useState(selected?.plan || 'starter');
  const [periodStart, setPeriodStart] = useState(new Date().toISOString().slice(0, 10));
  const [periodEnd, setPeriodEnd] = useState(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (selected) {
      setAmount(selected.monthly_amount || 0);
      setCurrency(selected.currency || 'SRD');
      setPlan(selected.plan || 'starter');
    }
  }, [selected]);

  const submit = async () => {
    if (!(Number(amount) > 0)) { setErr('Bedrag moet groter dan 0 zijn.'); return; }
    setLoading(true); setErr('');
    try {
      await api.post('/superadmin/subscription-invoices', {
        company_id: companyId,
        amount: Number(amount), currency, plan,
        period_start: new Date(periodStart).toISOString(),
        period_end: new Date(periodEnd).toISOString(),
        note: note.trim(),
      });
      onSaved();
    } catch (e) { setErr(formatError(e)); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-white/30 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 sm:p-8 max-h-[90vh] overflow-y-auto" data-testid="new-invoice-modal">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-orange-600" />
            </div>
            <h3 className="text-xl font-extrabold text-slate-900">Nieuwe factuur</h3>
          </div>
          <button onClick={onClose} data-testid="new-inv-close"
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Bedrijf</label>
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} data-testid="new-inv-company"
              className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-orange-500 outline-none bg-white">
              {companies.map((c) => (<option key={c.id} value={c.id}>{c.name} · {c.plan}</option>))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Bedrag</label>
              <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)}
                data-testid="new-inv-amount"
                className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-orange-500 outline-none font-mono" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Valuta</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-orange-500 outline-none bg-white">
                <option value="SRD">SRD</option><option value="USD">USD</option><option value="EUR">EUR</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Periode van</label>
              <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-orange-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">tot</label>
              <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-orange-500 outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Notitie (optioneel)</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Bv. Setup kosten, extra module, ..."
              className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-orange-500 outline-none text-sm" />
          </div>
        </div>

        {err && <p className="text-sm text-red-600 mt-3">{err}</p>}
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} disabled={loading} className="flex-1 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">Annuleer</button>
          <button onClick={submit} disabled={loading || !amount} data-testid="new-inv-submit"
            className="flex-1 h-11 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Aanmaken
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// NewPaymentPlanModal — Splits factuur / totaalbedrag in N termijnen
// =====================================================================
function NewPaymentPlanModal({ companies, invoices, prefillInvoiceId, onClose, onSaved }) {
  const openInvoices = invoices.filter((i) => i.status !== 'paid');
  const [invoiceId, setInvoiceId] = useState(prefillInvoiceId || (openInvoices[0]?.id || ''));
  const sourceInv = openInvoices.find((i) => i.id === invoiceId);
  const [companyId, setCompanyId] = useState(sourceInv?.company_id || companies[0]?.id || '');
  const [totalAmount, setTotalAmount] = useState(sourceInv?.amount || 0);
  const [currency, setCurrency] = useState(sourceInv?.currency || 'SRD');
  const [installments, setInstallments] = useState(3);
  const [intervalDays, setIntervalDays] = useState(30);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (sourceInv) {
      setCompanyId(sourceInv.company_id);
      setTotalAmount(sourceInv.amount);
      setCurrency(sourceInv.currency);
    }
  }, [sourceInv]);

  const perAmount = totalAmount > 0 && installments >= 2 ? (Number(totalAmount) / installments).toFixed(2) : '0.00';

  const submit = async () => {
    if (!(Number(totalAmount) > 0)) { setErr('Bedrag moet groter dan 0 zijn.'); return; }
    if (Number(installments) < 2) { setErr('Minimaal 2 termijnen.'); return; }
    setLoading(true); setErr('');
    try {
      await api.post('/superadmin/saas-payment-plans', {
        company_id: companyId,
        invoice_id: invoiceId || null,
        total_amount: Number(totalAmount),
        currency,
        installments: Number(installments),
        interval_days: Number(intervalDays),
        note: note.trim(),
      });
      onSaved();
    } catch (e) { setErr(formatError(e)); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-white/30 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 sm:p-8 max-h-[90vh] overflow-y-auto" data-testid="new-plan-modal">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-orange-600" />
            </div>
            <h3 className="text-xl font-extrabold text-slate-900">Nieuwe betalingsregeling</h3>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Bron-factuur (optioneel)</label>
            <select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-orange-500 outline-none bg-white text-sm">
              <option value="">— Geen bron, vrije regeling —</option>
              {openInvoices.map((i) => (
                <option key={i.id} value={i.id}>{i.company_name} · {fmt(i.amount, i.currency)} · {(i.created_at || '').slice(0, 10)}</option>
              ))}
            </select>
            {invoiceId && <p className="text-xs text-slate-500 mt-1">De bron-factuur wordt vervangen door de N termijnen.</p>}
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Bedrijf</label>
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} disabled={!!invoiceId}
              className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-orange-500 outline-none bg-white disabled:bg-slate-50">
              {companies.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Totaal bedrag</label>
              <input type="number" step="0.01" min="0" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)}
                disabled={!!invoiceId}
                className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-orange-500 outline-none font-mono disabled:bg-slate-50" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Valuta</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={!!invoiceId}
                className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-orange-500 outline-none bg-white disabled:bg-slate-50">
                <option value="SRD">SRD</option><option value="USD">USD</option><option value="EUR">EUR</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Aantal termijnen</label>
              <input type="number" min="2" max="24" value={installments} onChange={(e) => setInstallments(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-orange-500 outline-none font-mono" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Interval (dagen)</label>
              <input type="number" min="1" max="90" value={intervalDays} onChange={(e) => setIntervalDays(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-orange-500 outline-none font-mono" />
            </div>
          </div>
          <div className="rounded-xl bg-orange-50 border border-orange-200 p-3">
            <p className="text-xs text-orange-800 font-semibold">
              → {installments} termijnen van ± {fmt(Number(perAmount), currency)} per {intervalDays} dagen
            </p>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Notitie (optioneel)</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Reden of afspraak..."
              className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-orange-500 outline-none text-sm" />
          </div>
        </div>

        {err && <p className="text-sm text-red-600 mt-3">{err}</p>}
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} disabled={loading} className="flex-1 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">Annuleer</button>
          <button onClick={submit} disabled={loading || !totalAmount} data-testid="new-plan-submit"
            className="flex-1 h-11 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Maak regeling
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// KasMutationModal — Handmatige +/- boeking op het SaaS Kasgeld.
// Positief bedrag = ontvangst/correctie erbij, negatief = refund/uitbetaling.
// Refund pre-selecteert "-" en toont een aparte hint.
// =====================================================================
function KasMutationModal({ companies, onClose, onSaved }) {
  const [kind, setKind] = useState('adjustment');
  const [direction, setDirection] = useState('in'); // in = positief, out = negatief
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('SRD');
  const [companyId, setCompanyId] = useState('');
  const [reason, setReason] = useState('');
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    const amt = Math.abs(Number(amount) || 0);
    if (!amt) { setErr('Voer een bedrag in.'); return; }
    if (!reason.trim()) { setErr('Vul een reden in — verplicht voor audit-trail.'); return; }
    setLoading(true); setErr('');
    try {
      await api.post('/superadmin/kas-mutations', {
        company_id: companyId || null,
        amount: direction === 'out' ? -amt : amt,
        currency,
        kind,
        reason: reason.trim(),
        paid_at: new Date(paidAt).toISOString(),
      });
      onSaved();
    } catch (e) { setErr(formatError(e)); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-white/30 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 sm:p-8 max-h-[90vh] overflow-y-auto" data-testid="kas-mutation-modal">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
              <Pencil className="w-5 h-5 text-orange-600" />
            </div>
            <h3 className="text-xl font-extrabold text-slate-900">Handmatige kasmutatie</h3>
          </div>
          <button onClick={onClose} data-testid="kas-mut-close"
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          {/* Type mutatie */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Type</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { v: 'adjustment', l: 'Correctie' },
                { v: 'refund', l: 'Refund' },
                { v: 'correction', l: 'Herboeking' },
              ].map((k) => (
                <button key={k.v} type="button" onClick={() => {
                  setKind(k.v);
                  if (k.v === 'refund') setDirection('out');
                }} data-testid={`kas-mut-kind-${k.v}`}
                  className={`h-10 rounded-xl border-2 text-sm font-bold transition ${
                    kind === k.v ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 hover:border-slate-300 text-slate-700'
                  }`}>{k.l}</button>
              ))}
            </div>
          </div>

          {/* In / Uit */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Richting</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setDirection('in')} data-testid="kas-mut-dir-in"
                className={`h-11 rounded-xl border-2 text-sm font-bold transition ${
                  direction === 'in' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-700'
                }`}>+ Erbij (in)</button>
              <button type="button" onClick={() => setDirection('out')} data-testid="kas-mut-dir-out"
                className={`h-11 rounded-xl border-2 text-sm font-bold transition ${
                  direction === 'out' ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-200 text-slate-700'
                }`}>− Eraf (uit)</button>
            </div>
          </div>

          {/* Bedrag + valuta */}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Bedrag</label>
              <input type="number" step="0.01" min="0" value={amount}
                onChange={(e) => setAmount(e.target.value)} data-testid="kas-mut-amount"
                placeholder="0.00"
                className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-orange-500 outline-none font-mono" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Valuta</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} data-testid="kas-mut-currency"
                className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-orange-500 outline-none bg-white">
                <option value="SRD">SRD</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>

          {/* Bedrijf (optioneel) */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
              Bedrijf <span className="text-slate-400 font-medium normal-case">(optioneel — laat leeg voor algemene mutatie)</span>
            </label>
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} data-testid="kas-mut-company"
              className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-orange-500 outline-none bg-white">
              <option value="">— Geen bedrijf gekoppeld —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name} · {c.plan}</option>
              ))}
            </select>
          </div>

          {/* Reden (verplicht) */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Reden / Toelichting *</label>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
              data-testid="kas-mut-reason" required
              placeholder="bv. Refund overbetaling factuur INV-001"
              className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-orange-500 outline-none text-sm" />
          </div>

          {/* Datum */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Boekdatum</label>
            <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} data-testid="kas-mut-date"
              className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-orange-500 outline-none" />
          </div>
        </div>

        {err && <p className="text-sm text-red-600 mt-3" data-testid="kas-mut-error">{err}</p>}

        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 mt-4 text-xs text-slate-600">
          Deze boeking verschijnt direct in het SaaS-kasboek en beïnvloedt het saldo per valuta. Alle mutaties zijn traceerbaar via uw superadmin-email.
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} disabled={loading}
            className="flex-1 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">Annuleer</button>
          <button onClick={submit} disabled={loading || !amount || !reason.trim()} data-testid="kas-mut-submit"
            className={`flex-1 h-11 rounded-xl text-white font-extrabold flex items-center justify-center gap-2 disabled:opacity-50 ${
              direction === 'out' ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-500 hover:bg-emerald-600'
            }`}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Boek mutatie
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

export default function Subscriptions({ viewMode = 'all' } = {}) {
  const [overview, setOverview] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [pending, setPending] = useState([]);   // OCR-mismatch wachtend op handmatige goedkeuring
  const initialTab = ['companies', 'invoices', 'payments', 'pending', 'payment_plans', 'kasgeld'].includes(viewMode) ? viewMode : 'companies';
  const [tab, setTab] = useState(initialTab);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  // Aparte filter-state voor de subviews. Elk tabblad heeft eigen filters.
  const [invFilter, setInvFilter] = useState('all'); // all | open | paid | overdue
  const [payFilter, setPayFilter] = useState('all'); // all | contant | bank | ocr
  const [kasFilter, setKasFilter] = useState('all'); // all | in (payments) | out (refunds/adjust)
  const [selected, setSelected] = useState(null);
  const [showPay, setShowPay] = useState(false);
  const [showKasMut, setShowKasMut] = useState(false);
  const [showNewInv, setShowNewInv] = useState(false);
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [planPrefillInvId, setPlanPrefillInvId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [previewStmt, setPreviewStmt] = useState(null);  // {url, contentType}
  const [busyRow, setBusyRow] = useState('');
  // Als viewMode een specifieke tab forceert, tonen we de tab-balk niet.
  const showTabBar = viewMode === 'all';

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

  // Prefill support — Kasregister stuurt bedrijf/factuur via URL query.
  // Bij landing op /admin/saas_payments?prefill_company=xxx opent de betaling-
  // modal automatisch met dat bedrijf en de eerst-openstaande factuur voorgevuld.
  const [prefillCompany, setPrefillCompany] = useState('');
  useEffect(() => {
    if (loading) return;
    if (companies.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const cid = params.get('prefill_company');
    if (cid && companies.some((c) => c.id === cid)) {
      setPrefillCompany(cid);
      setShowPay(true);
      // Clean URL zonder rerender-storm.
      const url = new URL(window.location.href);
      url.searchParams.delete('prefill_company');
      window.history.replaceState({}, '', url.toString());
    }
  }, [loading, companies]);

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
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
              {viewMode === 'companies' ? 'Bedrijven'
                : viewMode === 'pending' ? 'OCR-goedkeuring'
                : viewMode === 'invoices' ? 'SaaS Facturen'
                : viewMode === 'payments' ? 'SaaS Betalingen'
                : viewMode === 'payment_plans' ? 'SaaS Betalingsregelingen'
                : viewMode === 'kasgeld' ? 'SaaS Kasgeld'
                : 'SaaS Beheer'}
            </h1>
          </div>
          <p className="text-sm text-slate-500">
            {viewMode === 'companies' ? 'Alle klanten met hun abonnementsstatus en plan.'
              : viewMode === 'pending' ? 'Handmatig goedkeuren van OCR-mismatches bij SaaS-betalingen.'
              : viewMode === 'invoices' ? 'Facturen die SuriRent N.V. uitstuurt aan klanten.'
              : viewMode === 'payments' ? 'Ontvangen betalingen van klanten — handmatig of via OCR.'
              : viewMode === 'payment_plans' ? 'Bedrijven die hun SaaS abonnement in termijnen betalen.'
              : viewMode === 'kasgeld' ? 'Volledig kasboek van alle ontvangen SaaS-betalingen — cash flow overzicht.'
              : 'Alle bedrijven, abonnementen, facturen en betalingen op één plek.'}
          </p>
        </div>
        <button onClick={() => setShowPay(true)} data-testid="register-payment-btn"
          className="px-5 h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold flex items-center gap-2 shadow-lg shadow-emerald-500/25">
          <Banknote className="w-4 h-4" /> Betaling registreren
        </button>
      </div>

      {viewMode === 'all' && (
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
      )}

      {showTabBar && (
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
      )}

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
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <FilterPills value={invFilter} onChange={setInvFilter}
              options={[
                { v: 'all', l: 'Alles', c: invoices.length },
                { v: 'open', l: 'Open', c: invoices.filter((x) => x.status !== 'paid' && !isOverdue(x)).length },
                { v: 'paid', l: 'Betaald', c: invoices.filter((x) => x.status === 'paid').length },
                { v: 'overdue', l: 'Vervallen', c: invoices.filter(isOverdue).length },
              ]}
              testidPrefix="saas-inv-filter" />
            <button onClick={() => setShowNewInv(true)} data-testid="new-invoice-btn"
              className="h-10 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-sm flex items-center gap-2 shadow-md shadow-orange-500/25">
              <Plus className="w-4 h-4" /> Nieuwe factuur
            </button>
          </div>
          <SaasInvoiceList invoices={filterInvoices(invoices, invFilter)} onMarkPaid={markPaid} />
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
        <div className="space-y-3">
          <FilterPills value={payFilter} onChange={setPayFilter}
            options={[
              { v: 'all', l: 'Alles', c: payments.length },
              { v: 'contant', l: 'Contant', c: payments.filter((p) => (p.method || '').toLowerCase().includes('contant')).length },
              { v: 'bank', l: 'Bank', c: payments.filter((p) => (p.method || '').toLowerCase().includes('bank') || (p.method || '').toLowerCase().includes('overboek')).length },
              { v: 'ocr', l: 'OCR', c: payments.filter((p) => p.source === 'ocr' || (p.method || '').toLowerCase().includes('ocr')).length },
            ]}
            testidPrefix="saas-pay-filter" />
          <SaasPaymentList payments={filterPayments(payments, payFilter)} />
        </div>
      )}

      {tab === 'payment_plans' && (
        <SaasPaymentPlansView invoices={invoices} companies={companies}
          onNewPlan={(invId) => { setPlanPrefillInvId(invId || null); setShowNewPlan(true); }} />
      )}

      {tab === 'kasgeld' && (
        <SaasKasgeldView payments={payments} filter={kasFilter} onFilter={setKasFilter}
          onNewMutation={() => setShowKasMut(true)} />
      )}

      {selected && (
        <CompanyDetailDrawer company={selected} onClose={() => setSelected(null)}
          onChanged={() => { setSelected(null); load(); }} />
      )}

      {showPay && (
        <PaymentRegistrationModal companies={companies} defaultCompanyId={prefillCompany}
          onClose={() => { setShowPay(false); setPrefillCompany(''); }}
          onSaved={() => { setShowPay(false); setPrefillCompany(''); load(); }} />
      )}

      {showNewInv && (
        <NewInvoiceModal companies={companies} onClose={() => setShowNewInv(false)}
          onSaved={() => { setShowNewInv(false); load(); }} />
      )}

      {showNewPlan && (
        <NewPaymentPlanModal companies={companies} invoices={invoices} prefillInvoiceId={planPrefillInvId}
          onClose={() => { setShowNewPlan(false); setPlanPrefillInvId(null); }}
          onSaved={() => { setShowNewPlan(false); setPlanPrefillInvId(null); load(); }} />
      )}

      {showKasMut && (
        <KasMutationModal companies={companies} onClose={() => setShowKasMut(false)}
          onSaved={() => { setShowKasMut(false); load(); }} />
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

// =====================================================================
// Helper: is factuur vervallen? (open + due_date verstreken)
// =====================================================================
function isOverdue(inv) {
  if (inv.status === 'paid') return false;
  const due = inv.due_date || inv.period_end;
  if (!due) return false;
  try { return new Date(due) < new Date(); } catch { return false; }
}
function filterInvoices(list, f) {
  if (f === 'paid') return list.filter((x) => x.status === 'paid');
  if (f === 'overdue') return list.filter(isOverdue);
  if (f === 'open') return list.filter((x) => x.status !== 'paid' && !isOverdue(x));
  return list;
}
function filterPayments(list, f) {
  if (f === 'all') return list;
  const term = { contant: 'contant', bank: 'bank', ocr: 'ocr' }[f];
  return list.filter((p) => (p.method || '').toLowerCase().includes(term) || (f === 'bank' && (p.method || '').toLowerCase().includes('overboek')) || (f === 'ocr' && p.source === 'ocr'));
}

function FilterPills({ value, onChange, options, testidPrefix }) {
  return (
    <div className="flex items-center gap-2 flex-wrap" data-testid={`${testidPrefix}-bar`}>
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)}
          data-testid={`${testidPrefix}-${o.v}`}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
            value === o.v ? 'bg-[#FF5C00] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}>
          {o.l}
          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
            value === o.v ? 'bg-white/20 text-white' : 'bg-white text-slate-500'
          }`}>{o.c}</span>
        </button>
      ))}
    </div>
  );
}

// PDF-helpers voor SaaS-facturen — gebruikt door SaasInvoiceList en de
// Kasregister-drawer. Openen in nieuw tabblad met blob-URL (authenticated).
async function downloadInvoicePdf(inv) {
  try {
    const res = await api.get(`/superadmin/subscription-invoices/${inv.id}/pdf`, { responseType: 'blob' });
    const blob = new Blob([res.data], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    window.alert('Kon PDF niet ophalen: ' + formatError(e));
  }
}

async function emailInvoicePdf(inv) {
  const to = window.prompt(
    `Verstuur factuur naar welk e-mailadres?\n(Enter = eigenaar van ${inv.company_name})`,
    '',
  );
  if (to === null) return;
  try {
    await api.post(`/superadmin/subscription-invoices/${inv.id}/email`,
      to.trim() ? { to_email: to.trim() } : {});
    window.alert('✓ Factuur verstuurd.');
  } catch (e) {
    window.alert('E-mail versturen mislukt: ' + formatError(e));
  }
}

function SaasInvoiceList({ invoices, onMarkPaid }) {
  if (invoices.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-10 text-center shadow-sm">
        <Receipt className="w-12 h-12 mx-auto text-slate-300 mb-2" />
        <p className="text-slate-500 font-semibold">Geen facturen in deze filter.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {invoices.map((inv) => {
        const overdue = isOverdue(inv);
        const paid = inv.status === 'paid';
        return (
          <div key={inv.id} data-testid={`sub-invoice-${inv.id}`}
            className="w-full bg-white hover:bg-slate-50 rounded-2xl shadow-sm p-4 flex items-center gap-3 border border-slate-100 transition">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
              paid ? 'bg-emerald-50 text-emerald-600'
                : overdue ? 'bg-red-50 text-red-600'
                : 'bg-orange-50 text-[#FF5C00]'
            }`}>
              {paid ? <CheckCircle className="w-5 h-5" /> : <Receipt className="w-5 h-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-black text-slate-900 truncate">{inv.company_name}</p>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                  paid ? 'bg-emerald-100 text-emerald-700'
                    : overdue ? 'bg-red-100 text-red-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>{paid ? 'Betaald' : overdue ? 'Vervallen' : 'Open'}</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 font-mono truncate">
                {(inv.invoice_number || inv.id?.slice(-6) || '').toUpperCase()} · {inv.plan} · {fmtDate(inv.period_start)} → {fmtDate(inv.period_end)}
              </p>
            </div>
            <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
              <p className="text-base font-black text-slate-900 whitespace-nowrap">{fmt(inv.amount, inv.currency)}</p>
              <div className="flex gap-1.5">
                <button onClick={() => downloadInvoicePdf(inv)} data-testid={`inv-pdf-${inv.id}`}
                  title="Download PDF"
                  className="text-[10px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded inline-flex items-center gap-1">
                  <Download className="w-3 h-3" /> PDF
                </button>
                <button onClick={() => emailInvoicePdf(inv)} data-testid={`inv-email-${inv.id}`}
                  title="Verstuur per e-mail"
                  className="text-[10px] font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 px-2 py-1 rounded inline-flex items-center gap-1">
                  <Mail className="w-3 h-3" /> Mail
                </button>
                {!paid && (
                  <button onClick={() => onMarkPaid(inv)} data-testid={`mark-paid-${inv.id}`}
                    className="text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded">
                    ✓ Betaald
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SaasPaymentList({ payments }) {
  if (payments.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-10 text-center shadow-sm">
        <Banknote className="w-12 h-12 mx-auto text-slate-300 mb-2" />
        <p className="text-slate-500 font-semibold">Geen betalingen in deze filter.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {payments.map((p) => {
        const initials = (p.company_name || '?').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
        return (
          <div key={p.id} data-testid={`sub-payment-${p.id}`}
            className="w-full bg-white hover:bg-slate-50 rounded-2xl shadow-sm p-4 flex items-center gap-3 border border-slate-100 transition">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 font-black text-sm">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-black text-slate-900 truncate">{p.company_name}</p>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                  {p.method || '—'}
                </span>
                {p.source === 'ocr' && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-700">OCR</span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                {fmtDate(p.paid_at)}{p.reference ? ` · ${p.reference}` : ''}{p.note ? ` · ${p.note}` : ''}
              </p>
            </div>
            <p className={`text-base font-black text-right shrink-0 whitespace-nowrap ${
              Number(p.amount) < 0 ? 'text-red-600' : 'text-slate-900'
            }`}>
              {Number(p.amount) < 0 ? '− ' : ''}{fmt(Math.abs(p.amount), p.currency)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function SaasPaymentPlansView({ invoices, companies, onNewPlan }) {
  const [realPlans, setRealPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get('/superadmin/saas-payment-plans');
        if (alive) setRealPlans(data || []);
      } catch { /* leeg */ }
      finally { if (alive) setLoadingPlans(false); }
    })();
  }, [invoices]);

  // Bedrijven met minimaal 1 open factuur → mogelijk om te zetten naar regeling
  const openByCompany = {};
  for (const inv of invoices) {
    if (inv.status === 'paid') continue;
    if (inv.saas_plan_id) continue; // al onderdeel van een regeling
    const cid = inv.company_id;
    if (!openByCompany[cid]) {
      openByCompany[cid] = { company_id: cid, company_name: inv.company_name, invoices: [], total: 0, currency: inv.currency };
    }
    openByCompany[cid].invoices.push(inv);
    openByCompany[cid].total += Number(inv.amount || 0);
  }
  const openList = Object.values(openByCompany);

  return (
    <div className="space-y-6">
      {/* Actie: nieuwe regeling knop */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">Betalingsregelingen</p>
          <p className="text-sm text-slate-500 mt-0.5">Splits een groot bedrag in maandelijkse termijnen</p>
        </div>
        <button onClick={() => onNewPlan && onNewPlan(null)} data-testid="new-plan-btn"
          className="h-10 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-sm flex items-center gap-2 shadow-md shadow-orange-500/25">
          <Plus className="w-4 h-4" /> Nieuwe regeling
        </button>
      </div>

      {/* Sectie 1 · Actieve regelingen (formeel via API) */}
      <div>
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-2">
          Actieve regelingen ({realPlans.length})
        </p>
        {loadingPlans && (
          <div className="py-6 text-center text-slate-400 text-sm">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-1" />
            Laden…
          </div>
        )}
        {!loadingPlans && realPlans.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-dashed border-slate-200">
            <Calendar className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="text-slate-500 font-semibold">Nog geen actieve regelingen.</p>
            <p className="text-xs text-slate-400 mt-1">Klik op &quot;Nieuwe regeling&quot; hierboven om een factuur in termijnen te splitsen.</p>
          </div>
        )}
        <div className="space-y-2">
          {realPlans.map((p) => {
            const paid = p.paid || 0;
            const progress = p.total_amount > 0 ? Math.round((paid / p.total_amount) * 100) : 0;
            const openCount = (p.invoices || []).filter((i) => i.status !== 'paid').length;
            return (
              <div key={p.id} data-testid={`saas-plan-${p.id}`}
                className="bg-white rounded-2xl shadow-sm p-4 border border-slate-100">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-11 h-11 rounded-xl bg-orange-50 text-[#FF5C00] flex items-center justify-center shrink-0">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-slate-900 truncate">{p.company_name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {p.installments} termijnen · {openCount} open · {fmt(paid, p.currency)} betaald van {fmt(p.total_amount, p.currency)}
                    </p>
                  </div>
                  <span className={`text-lg font-black ${progress >= 100 ? 'text-emerald-600' : 'text-orange-600'}`}>{progress}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-full ${progress >= 100 ? 'bg-emerald-500' : 'bg-orange-500'} transition-all`} style={{ width: `${progress}%` }} />
                </div>
                {/* Termijnen tijdlijn */}
                <div className="grid grid-cols-6 md:grid-cols-12 gap-1 mt-3">
                  {(p.invoices || []).map((iv) => (
                    <div key={iv.id} title={`T${iv.installment_seq}: ${fmt(iv.amount, iv.currency)}`}
                      className={`h-6 rounded-md flex items-center justify-center text-[10px] font-black ${
                        iv.status === 'paid' ? 'bg-emerald-500 text-white'
                          : new Date(iv.period_end || 0) < new Date() ? 'bg-red-100 text-red-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}>
                      T{iv.installment_seq}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sectie 2 · Bedrijven met open facturen — kandidaat voor regeling */}
      {openList.length > 0 && (
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-2">
            Kandidaten ({openList.length}) — bedrijven met openstaande facturen
          </p>
          <div className="space-y-2">
            {openList.map((c) => (
              <div key={c.company_id} data-testid={`open-candidate-${c.company_id}`}
                className="bg-white rounded-2xl p-4 border border-slate-100 flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-slate-900 truncate">{c.company_name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {c.invoices.length} open · totaal <span className="font-mono">{fmt(c.total, c.currency)}</span>
                  </p>
                </div>
                <button onClick={() => onNewPlan && onNewPlan(c.invoices[0]?.id)}
                  data-testid={`make-plan-${c.company_id}`}
                  className="h-9 px-3 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" /> Maak regeling
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Silence unused-var warning: companies is prop met bedrijfslijst voor toekomstige filters */}
      {companies && companies.length === 0 && null}
    </div>
  );
}

function SaasKasgeldView({ payments, filter, onFilter, onNewMutation }) {
  const filtered = filter === 'all' ? payments
    : filter === 'ocr' ? payments.filter((p) => p.source === 'ocr')
    : filter === 'contant' ? payments.filter((p) => (p.method || '').toLowerCase().includes('contant'))
    : filter === 'manual' ? payments.filter((p) => p.is_manual || p.source === 'manual')
    : payments;
  const totals = {};
  for (const p of filtered) {
    const c = p.currency || 'SRD';
    totals[c] = (totals[c] || 0) + Number(p.amount || 0);
  }
  const counts = {
    all: payments.length,
    contant: payments.filter((p) => (p.method || '').toLowerCase().includes('contant')).length,
    ocr: payments.filter((p) => p.source === 'ocr').length,
    manual: payments.filter((p) => p.is_manual || p.source === 'manual').length,
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {['SRD', 'USD', 'EUR'].map((c) => {
          const v = totals[c] || 0;
          const negative = v < 0;
          return (
            <div key={c} className={`rounded-2xl p-4 ${negative ? 'bg-gradient-to-br from-red-50 to-red-100' : 'bg-gradient-to-br from-emerald-50 to-emerald-100'}`}
              data-testid={`saas-kas-saldo-${c}`}>
              <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${negative ? 'text-red-700' : 'text-emerald-700'}`}>Saldo {c}</p>
              <p className={`text-2xl font-black ${negative ? 'text-red-800' : 'text-emerald-800'}`}>{fmt(v, c)}</p>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <FilterPills value={filter} onChange={onFilter}
          options={[
            { v: 'all', l: 'Alles', c: counts.all },
            { v: 'contant', l: 'Contant', c: counts.contant },
            { v: 'ocr', l: 'OCR', c: counts.ocr },
            { v: 'manual', l: 'Handmatig', c: counts.manual },
          ]}
          testidPrefix="saas-kas-filter" />
        {onNewMutation && (
          <button onClick={onNewMutation} data-testid="new-kas-mutation-btn"
            className="h-10 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-sm flex items-center gap-2 shadow-md shadow-orange-500/25">
            <Plus className="w-4 h-4" /> Nieuwe mutatie
          </button>
        )}
      </div>

      <SaasPaymentList payments={filtered} />
    </div>
  );
}

