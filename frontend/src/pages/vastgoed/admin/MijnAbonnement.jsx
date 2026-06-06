import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Crown, Clock, CheckCircle, AlertCircle, ArrowUp, ArrowDown, Loader2,
  Receipt, Landmark, CreditCard, Banknote, Copy, Check, X, Zap, Euro,
  Upload, FileCheck2, ScanLine,
} from 'lucide-react';
import { api, formatError } from '../../../lib/api';

const fmt = (n, c = 'SRD') => {
  const cur = (c || 'SRD').toUpperCase();
  if (cur === 'EUR') {
    return `€${Number(n || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${cur} ${Number(n || 0).toLocaleString('nl-NL')}`;
};
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
        {(plan.currency || 'SRD').toUpperCase() === 'EUR'
          ? `€${Number(plan.amount).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : `${plan.currency} ${Number(plan.amount).toLocaleString('nl-NL')}`}
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

function OnlinePayBox({ options, openInvoice, onErr }) {
  const [busy, setBusy] = useState('');
  if (!options) return null;
  const mopeEnabled = options.mope?.enabled;
  const sumupEnabled = options.sumup?.enabled;
  if (!mopeEnabled && !sumupEnabled) return null;

  const pay = async (provider) => {
    setBusy(provider);
    try {
      const payload = openInvoice?.id ? { provider, invoice_id: openInvoice.id } : { provider };
      const { data } = await api.post('/billing/me/checkout', payload);
      if (data?.url) {
        window.location.href = data.url;
      } else {
        onErr('Geen betaal-URL ontvangen van de gateway.');
        setBusy('');
      }
    } catch (e) {
      onErr(formatError(e));
      setBusy('');
    }
  };

  // Layout: 1 button = full width, 2 = grid
  const single = (mopeEnabled && !sumupEnabled) || (!mopeEnabled && sumupEnabled);

  return (
    <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white p-5" data-testid="online-pay-box">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="w-5 h-5 text-yellow-300" />
        <h4 className="font-extrabold">Direct online betalen</h4>
      </div>
      <p className="text-xs text-white/70 mb-4">
        Geen wachtkamer, abonnement is direct geactiveerd na betaling.
      </p>
      <div className={single ? '' : 'grid sm:grid-cols-2 gap-3'}>
        {mopeEnabled && (
          <button onClick={() => pay('mope')} disabled={!!busy} data-testid="pay-with-mope"
            className="w-full h-14 rounded-xl bg-emerald-500 hover:bg-emerald-400 transition text-white font-extrabold flex items-center justify-center gap-2 disabled:opacity-50">
            {busy === 'mope' ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
            <span>Betaal met Uni5Pay</span>
            <span className="text-xs opacity-80">· SRD {Number(options.amount).toLocaleString('nl-NL')}</span>
          </button>
        )}
        {sumupEnabled && (
          <button onClick={() => pay('sumup')} disabled={!!busy} data-testid="pay-with-sumup"
            className="w-full h-14 rounded-xl bg-sky-500 hover:bg-sky-400 transition text-white font-extrabold flex items-center justify-center gap-2 disabled:opacity-50">
            {busy === 'sumup' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Euro className="w-5 h-5" />}
            <span>Betaal met SumUp</span>
            <span className="text-xs opacity-80">· €{Number(options.sumup.eur_amount).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </button>
        )}
      </div>
      {sumupEnabled && options.display_currency === 'EUR' && options.currency !== 'EUR' && options.eur_per_srd > 0 && (
        <p className="text-[11px] text-white/50 mt-3">
          Wisselkoers: 1 SRD = €{Number(options.eur_per_srd).toFixed(4)} ({options.fx_source})
        </p>
      )}
    </div>
  );
}

function BankProofUploader({ invoice, onSuccess, onErr }) {
  const fileInput = useRef(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);  // {status, ocr, mismatch_reasons?}

  if (!invoice) {
    return (
      <p className="text-[11px] text-slate-400 mt-3">
        Wacht op een nieuwe factuur om bewijs te kunnen uploaden.
      </p>
    );
  }

  const onPick = () => fileInput.current?.click();

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { onErr('Bestand groter dan 5 MB'); return; }
    setBusy(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('invoice_id', invoice.id);
      const { data } = await api.post('/billing/me/bank-confirm', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(data);
      if (data.status === 'paid') onSuccess?.();
    } catch (err) {
      onErr(formatError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-slate-200" data-testid="saas-bank-proof-uploader">
      <div className="flex items-center gap-2 mb-2">
        <ScanLine className="w-4 h-4 text-orange-600" />
        <h5 className="font-extrabold text-sm text-slate-900">Upload bankafschrift voor automatische controle</h5>
      </div>
      <p className="text-[11px] text-slate-500 mb-3 leading-snug">
        Screenshot of PDF van uw bankoverschrijving. Wij scannen automatisch het bedrag, de datum en de omschrijving
        — als alles matcht, wordt uw abonnement direct geactiveerd. Geen wachten op handmatige controle.
      </p>

      <input
        ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={onFile} className="hidden" data-testid="saas-bank-proof-input"
      />

      {!result && (
        <button onClick={onPick} disabled={busy}
          data-testid="saas-bank-proof-upload-btn"
          className="w-full h-12 rounded-xl bg-slate-900 hover:bg-slate-700 text-white font-extrabold flex items-center justify-center gap-2 disabled:opacity-50 transition">
          {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Scannen…</> : <><Upload className="w-4 h-4" /> Upload betaalbewijs</>}
        </button>
      )}

      {result?.status === 'paid' && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 flex items-start gap-2" data-testid="saas-bank-proof-result-paid">
          <FileCheck2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-xs text-emerald-900 font-bold leading-snug">
            ✓ Betaling automatisch goedgekeurd. Uw abonnement is direct geactiveerd!
            <p className="font-normal text-emerald-700 mt-1">
              Herkend: {result.ocr?.currency || ''} {result.ocr?.amount?.toFixed(2) || '?'}
              {result.ocr?.date_iso && ` · ${result.ocr.date_iso}`}
              {result.ocr?.payer_name && ` · ${result.ocr.payer_name}`}
            </p>
          </div>
        </div>
      )}

      {result?.status === 'pending_approval' && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2" data-testid="saas-bank-proof-result-pending">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 leading-snug">
            <p className="font-bold">Wacht op handmatige goedkeuring.</p>
            <p className="font-normal text-amber-800 mt-1">
              De automatische controle kon de gegevens niet 100% bevestigen:
            </p>
            <ul className="font-normal text-amber-800 mt-1 ml-4 list-disc">
              {(result.mismatch_reasons || []).slice(0, 3).map((r, i) => <li key={i}>{r}</li>)}
            </ul>
            <p className="font-normal text-amber-700 mt-2">
              Een medewerker controleert binnenkort uw afschrift.
            </p>
          </div>
        </div>
      )}

      {result && (
        <button onClick={() => setResult(null)}
          className="mt-2 text-xs text-slate-500 hover:text-slate-700 font-medium"
          data-testid="saas-bank-proof-retry">
          Opnieuw uploaden
        </button>
      )}
    </div>
  );
}

function BankBox({ details, invoice, company, onSuccess, onErr }) {
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

      {/* Auto-OCR upload-flow — alleen tonen wanneer er een open factuur is */}
      <BankProofUploader invoice={invoice} onSuccess={onSuccess} onErr={onErr} />
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
  const [checkoutOptions, setCheckoutOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, p, b, inv, pay, opt] = await Promise.all([
        api.get('/billing/me'),
        api.get('/billing/me/plans'),
        api.get('/billing/bank-details'),
        api.get('/billing/me/invoices'),
        api.get('/billing/me/payments'),
        api.get('/billing/me/checkout-options').catch(() => ({ data: null })),
      ]);
      setMe(m.data); setPlans(p.data); setBank(b.data); setInvoices(inv.data); setPayments(pay.data);
      setCheckoutOptions(opt.data);
    } catch (e) { setErr(formatError(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Detect return from gateway (?checkout=done) and surface a success-pending message
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'done') {
      setMsg('Betaling ontvangen — uw abonnement wordt verwerkt. Dit kan een minuut duren.');
      setTimeout(() => setMsg(''), 8000);
      // Clean URL to avoid re-trigger on refresh
      const url = new URL(window.location.href);
      url.searchParams.delete('checkout');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

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

      {(me.status === 'trial' || me.status === 'expired' || openInvoices.length > 0) && (
        <>
          <OnlinePayBox options={checkoutOptions} openInvoice={openInvoices[0]} onErr={setErr} />
          {bank && (me.currency || 'SRD') === 'SRD' && (
            <BankBox details={bank} invoice={openInvoices[0]} company={me.company_name || 'UW BEDRIJF'}
              onSuccess={() => { setMsg('Betaling automatisch goedgekeurd — abonnement is geactiveerd!'); load(); }}
              onErr={setErr} />
          )}
        </>
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

      {/* Abonnement opzeggen — alleen zichtbaar voor actieve / trial abonnementen */}
      {(me.status === 'trial' || me.status === 'active') && (
        <div className="mt-8 pt-6 border-t border-slate-200">
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-500 mb-3">Gevarenzone</h3>
          <div className="bg-red-50/50 border border-red-200 rounded-2xl p-5">
            <h4 className="font-extrabold text-red-900">Abonnement opzeggen</h4>
            <p className="text-sm text-red-700 mt-1 leading-relaxed">
              Uw abonnement wordt direct opgezegd en toegang tot de admin omgeving wordt
              onmiddellijk geblokkeerd. Uw data blijft 90 dagen bewaard zodat u kunt heractiveren.
            </p>
            <button onClick={async () => {
                if (!window.confirm('Weet u het zeker? Uw abonnement wordt direct opgezegd en u verliest toegang tot uw omgeving.')) return;
                try {
                  await api.post('/companies/me/cancel-subscription');
                  // Backend zet billing_status='cancelled' en de volgende API call
                  // krijgt 402 → BillingBlockedScreen verschijnt.
                  window.location.reload();
                } catch (e) {
                  setErr(formatError(e, 'Opzeggen mislukt'));
                }
              }}
              data-testid="cancel-subscription-btn"
              className="mt-4 px-5 h-11 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-colors">
              Abonnement opzeggen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
