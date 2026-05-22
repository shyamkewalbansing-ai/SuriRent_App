import { useState, useEffect, useCallback } from 'react';
import {
  Crown, Clock, CheckCircle, AlertCircle, ArrowUp, ArrowDown, Loader2,
  Receipt, Landmark, CreditCard, Banknote, Copy, Check, X,
} from 'lucide-react';
import { api, formatError } from '../../../lib/api';

const fmt = (n, c = 'SRD') => `${c} ${Number(n || 0).toLocaleString('nl-NL')}`;
const fmtDate = (s) => s ? new Date(s).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const STATUS = {
  trial:     { label: 'Proefperiode', bg: 'bg-orange-100', text: 'text-orange-800', dot: 'bg-orange-500' },
  active:    { label: 'Actief',       bg: 'bg-emerald-100', text: 'text-emerald-800', dot: 'bg-emerald-500' },
  expired:   { label: 'Verlopen',     bg: 'bg-red-100',     text: 'text-red-800',     dot: 'bg-red-500' },
  cancelled: { label: 'Opgezegd',     bg: 'bg-slate-100',   text: 'text-slate-700',   dot: 'bg-slate-400' },
};

function PlanCard({ plan, currentPlanId, onSelect, busy }) {
  const isCurrent = plan.id === currentPlanId;
  return (
    <div className={`relative rounded-3xl p-6 border-2 transition flex flex-col ${
      isCurrent ? 'border-orange-500 bg-gradient-to-br from-orange-50 to-orange-100/50 shadow-lg shadow-orange-500/15' : 'border-slate-200 bg-white hover:border-orange-300'
    }`} data-testid={`plan-card-${plan.id}`}>
      {isCurrent && (
        <span className="absolute -top-3 left-6 px-3 py-1 rounded-full bg-orange-500 text-white text-[10px] font-extrabold uppercase tracking-widest">Huidig pakket</span>
      )}
      <h3 className="text-xl font-extrabold text-slate-900">{plan.name}</h3>
      <p className="text-sm text-slate-500 mt-0.5">{plan.description}</p>
      <p className="text-3xl font-extrabold text-slate-900 mt-4">
        {plan.currency} {Number(plan.amount).toLocaleString('nl-NL')}
        <span className="text-xs font-medium text-slate-400 ml-1">/maand</span>
      </p>
      <ul className="mt-4 space-y-1.5 flex-1">
        {(plan.features || []).map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
            <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />{f}
          </li>
        ))}
      </ul>
      {!isCurrent && (
        <button onClick={() => onSelect(plan)} disabled={busy} data-testid={`plan-select-${plan.id}`}
          className="mt-5 w-full h-11 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold flex items-center justify-center gap-2 disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> :
            plan.amount > 0 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
          Kies {plan.name}
        </button>
      )}
    </div>
  );
}

function BankBox({ details, invoice, company }) {
  const [copied, setCopied] = useState('');
  const refText = `ABONNEMENT — ${company} — ${invoice ? new Date(invoice.created_at).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' }) : 'huidige maand'}`;
  const copy = (label, value) => {
    navigator.clipboard.writeText(value || '');
    setCopied(label);
    setTimeout(() => setCopied(''), 1500);
  };
  if (!details) return null;
  return (
    <div className="rounded-2xl bg-slate-50 border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Landmark className="w-5 h-5 text-slate-600" />
        <h4 className="font-extrabold text-slate-900">Bankoverschrijving</h4>
      </div>
      <div className="space-y-2 text-sm">
        <KV label="Bank" value={details.bank_name} />
        <KV label="Tenaamstelling" value={details.account_name} onCopy={() => copy('account_name', details.account_name)} copied={copied === 'account_name'} />
        <KV label="Rekeningnummer" value={details.account_number} mono onCopy={() => copy('account_number', details.account_number)} copied={copied === 'account_number'} />
        {details.swift && <KV label="SWIFT" value={details.swift} mono onCopy={() => copy('swift', details.swift)} copied={copied === 'swift'} />}
        {invoice && <KV label="Bedrag" value={fmt(invoice.amount, invoice.currency)} mono />}
        <KV label="Omschrijving" value={refText} mono onCopy={() => copy('ref', refText)} copied={copied === 'ref'} />
      </div>
      <p className="text-[11px] text-slate-500 mt-3">
        Vragen? {details.whatsapp && <>WhatsApp <a href={`https://wa.me/${(details.whatsapp || '').replace(/\D/g, '')}`} className="text-orange-600 font-bold">{details.whatsapp}</a> · </>}
        {details.support_email && <>E-mail <a href={`mailto:${details.support_email}`} className="text-orange-600 font-bold">{details.support_email}</a></>}
      </p>
    </div>
  );
}

function KV({ label, value, mono, onCopy, copied }) {
  return (
    <div className="flex justify-between gap-3 items-center group">
      <span className="text-slate-500">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        <span className={`font-bold text-slate-900 text-right truncate ${mono ? 'font-mono' : ''}`}>{value}</span>
        {onCopy && (
          <button onClick={onCopy}
            className="opacity-0 group-hover:opacity-100 transition text-slate-400 hover:text-orange-500 shrink-0">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
    </div>
  );
}

export default function MijnAbonnement() {
  const [me, setMe] = useState(null);
  const [plans, setPlans] = useState([]);
  const [bank, setBank] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, p, b, inv, pay] = await Promise.all([
        api.get('/billing/me'),
        api.get('/billing/plans'),
        api.get('/billing/bank-details'),
        api.get('/billing/me/invoices'),
        api.get('/billing/me/payments'),
      ]);
      setMe(m.data); setPlans(p.data); setBank(b.data); setInvoices(inv.data); setPayments(pay.data);
    } catch (e) { setErr(formatError(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const changePlan = async (plan) => {
    const isUpgrade = plan.amount > (me?.monthly_amount || 0);
    const word = isUpgrade ? 'opwaarderen' : 'downgraden';
    if (!window.confirm(`Pakket ${word} naar ${plan.name} (${fmt(plan.amount, plan.currency)}/maand)?`)) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      const { data } = await api.put('/billing/me/plan', { plan: plan.id });
      setMsg(data.effective === 'immediately'
        ? `Pakket gewijzigd naar ${plan.name}.`
        : `Pakketwijziging gepland — gaat in bij volgende vernieuwing op ${fmtDate(data.renews_at)}.`);
      setTimeout(() => setMsg(''), 5000);
      await load();
    } catch (e) { setErr(formatError(e)); }
    finally { setBusy(false); }
  };

  if (loading || !me) {
    return <div className="py-16 flex items-center justify-center"><Loader2 className="w-8 h-8 text-orange-500 animate-spin" /></div>;
  }

  const st = STATUS[me.status] || STATUS.active;
  const openInvoices = invoices.filter((i) => i.status !== 'paid');

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 mb-1">
        <Crown className="w-6 h-6 text-orange-500" />
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">Mijn Abonnement</h1>
      </div>
      <p className="text-sm text-slate-500 -mt-3">Beheer uw pakket, betalingen en facturen.</p>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{err}</div>}
      {msg && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl p-3 text-sm">{msg}</div>}

      <div className={`rounded-3xl p-5 sm:p-6 ${st.bg}`} data-testid="my-sub-status">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2 h-2 rounded-full ${st.dot}`} />
              <span className={`text-[10px] font-extrabold uppercase tracking-widest ${st.text}`}>{st.label}</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              {me.plan?.name} <span className="text-base font-medium text-slate-500">· {fmt(me.monthly_amount, me.currency)}/maand</span>
            </h2>
          </div>
          {me.status === 'trial' && me.days_left != null && (
            <div className="bg-white/70 backdrop-blur-sm rounded-xl px-4 py-2 text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Nog over</p>
              <p className="text-2xl font-extrabold text-orange-600">{me.days_left} {me.days_left === 1 ? 'dag' : 'dagen'}</p>
            </div>
          )}
        </div>
        {me.status === 'trial' && (
          <p className="text-sm text-slate-700">
            Uw proefperiode eindigt op <strong>{fmtDate(me.trial_ends_at)}</strong>.
            Voltooi de eerste betaling om uw abonnement te activeren — zie bankgegevens hieronder.
          </p>
        )}
        {me.status === 'expired' && (
          <p className="text-sm text-slate-700">
            Uw proefperiode is verlopen. Maak de eerste betaling over volgens onderstaande gegevens om uw abonnement te activeren.
          </p>
        )}
        {me.status === 'active' && (
          <p className="text-sm text-slate-700">
            Volgende vernieuwing op <strong>{fmtDate(me.renews_at)}</strong>. U ontvangt een herinneringsmail vóór die datum.
          </p>
        )}
      </div>

      {(me.status === 'trial' || me.status === 'expired' || openInvoices.length > 0) && bank && (
        <BankBox details={bank} invoice={openInvoices[0]} company="UW BEDRIJF" />
      )}

      <div>
        <h3 className="text-lg font-extrabold text-slate-900 mb-3">Pakket wijzigen</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          {plans.map((p) => (
            <PlanCard key={p.id} plan={p} currentPlanId={me.plan_id} onSelect={changePlan} busy={busy} />
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-2">
          Tijdens de proefperiode treedt de wijziging direct in werking. Bij een actief abonnement geldt de nieuwe prijs vanaf de volgende vernieuwing.
        </p>
      </div>

      {invoices.length > 0 && (
        <div>
          <h3 className="text-lg font-extrabold text-slate-900 mb-3">Facturen</h3>
          <div className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-100">
            {invoices.map((inv) => (
              <div key={inv.id} className="p-4 flex items-center gap-3" data-testid={`my-invoice-${inv.id}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  inv.status === 'paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'
                }`}>
                  {inv.status === 'paid' ? <CheckCircle className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-extrabold text-slate-900">{inv.plan}</p>
                    <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      inv.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'
                    }`}>{inv.status === 'paid' ? 'Betaald' : 'Open'}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{fmtDate(inv.period_start)} → {fmtDate(inv.period_end)}</p>
                </div>
                <p className="font-extrabold text-slate-900 shrink-0">{fmt(inv.amount, inv.currency)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {payments.length > 0 && (
        <div>
          <h3 className="text-lg font-extrabold text-slate-900 mb-3">Betalingen</h3>
          <div className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-100">
            {payments.map((p) => (
              <div key={p.id} className="p-4 flex items-center gap-3" data-testid={`my-payment-${p.id}`}>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <Banknote className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-extrabold text-slate-900">{fmt(p.amount, p.currency)}</p>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{p.method}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {fmtDate(p.paid_at)}{p.reference ? ` · ${p.reference}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
