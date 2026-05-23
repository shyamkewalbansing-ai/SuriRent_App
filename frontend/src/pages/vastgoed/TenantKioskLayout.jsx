import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Lock, Loader2, LogOut, CreditCard, Wrench, User, Phone,
  CheckCircle2, X, ChevronRight, Calendar, ArrowLeft,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, formatError, fmtMoney, MONTHS_NL } from '../../lib/api';

const TENANT_TOKEN_KEY = 'tenant_token';
const PIN_LENGTH = 4;

/** Topbar — logo + bedrijfsnaam + logout / back */
function KioskHeader({ tenantName, onBack, onLogout }) {
  return (
    <div className="bg-gradient-to-r from-[#FF8A3D] via-[#FF5C00] to-[#C74600] text-white relative overflow-hidden">
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
      <div className="relative px-6 py-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <button onClick={onBack} className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center"
              data-testid="tk-back" aria-label="Terug">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="w-12 h-12 rounded-2xl bg-white/95 p-1.5 shadow-md shrink-0">
            <img src="/kiosk-icons/kiosk-512.png" alt="logo" className="w-full h-full object-contain" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/85 leading-tight">Huurder Kiosk</p>
            <p className="text-lg sm:text-xl font-black tracking-tight leading-tight truncate">
              {tenantName || 'Welkom'}
            </p>
          </div>
        </div>
        {onLogout && (
          <button onClick={onLogout} data-testid="tk-logout"
            className="p-3 rounded-xl bg-white/15 hover:bg-white/25 active:scale-95 transition shrink-0">
            <LogOut className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}

/** PIN-pad — herbruikt voor login */
function PinPad({ onComplete, busy, error }) {
  const [pin, setPin] = useState('');
  const handlePress = (digit) => {
    if (busy || pin.length >= PIN_LENGTH) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === PIN_LENGTH) onComplete(next);
  };
  const handleBack = () => { if (!busy) setPin((p) => p.slice(0, -1)); };
  useEffect(() => { if (error) setPin(''); }, [error]);

  return (
    <div className="flex flex-col items-center" data-testid="tk-pinpad">
      {/* dots */}
      <div className="flex items-center gap-3 mb-6">
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <span key={i} className={`w-4 h-4 rounded-full transition ${
            i < pin.length ? 'bg-[#FF5C00]' : 'bg-white border-2 border-orange-200'
          }`} />
        ))}
      </div>
      {error && <p className="text-xs font-bold text-red-600 mb-3" data-testid="tk-pin-error">{error}</p>}
      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <button key={d} onClick={() => handlePress(String(d))} disabled={busy}
            data-testid={`tk-key-${d}`}
            className="h-16 sm:h-20 rounded-2xl bg-white border-2 border-orange-100 hover:border-[#FF5C00] active:scale-95 text-2xl font-black text-slate-800 transition shadow-sm disabled:opacity-50">
            {d}
          </button>
        ))}
        <span />
        <button onClick={() => handlePress('0')} disabled={busy}
          data-testid="tk-key-0"
          className="h-16 sm:h-20 rounded-2xl bg-white border-2 border-orange-100 hover:border-[#FF5C00] active:scale-95 text-2xl font-black text-slate-800 transition shadow-sm disabled:opacity-50">
          0
        </button>
        <button onClick={handleBack} disabled={busy}
          data-testid="tk-key-back"
          className="h-16 sm:h-20 rounded-2xl bg-orange-50 hover:bg-orange-100 active:scale-95 text-sm font-bold text-[#FF5C00] transition disabled:opacity-50">
          ←
        </button>
      </div>
    </div>
  );
}

/** PIN Login screen */
function LoginView({ onLoggedIn, prefill }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // We hebben e-mail + pincode nodig. Voor de kiosk vereenvoudigen we naar
  // alléén pincode-flow: backend verwacht email + pin, dus we vragen eerst
  // mailadres in een kleine input, daarna verschijnt de pin-pad. Wanneer de
  // QR-sticker `?apt=<id>` meegeeft, slaan we de email-stap over.
  const [email, setEmail] = useState(prefill?.email || '');
  const [step, setStep] = useState(prefill?.email ? 'pin' : 'email'); // 'email' | 'pin'

  // Wanneer prefill later binnenkomt (na lookup), spring direct naar PIN.
  useEffect(() => {
    if (prefill?.email && !email) {
      setEmail(prefill.email);
      setStep('pin');
    }
  }, [prefill?.email, email]);

  const submit = async (pin) => {
    setBusy(true); setError('');
    try {
      const { data } = await api.post('/tenant-portal/login', { identifier: email, pin });
      localStorage.setItem(TENANT_TOKEN_KEY, data.token);
      onLoggedIn();
    } catch (e) {
      setError(formatError(e) || 'Onjuiste e-mail of pincode');
    } finally { setBusy(false); }
  };

  const titleTop = prefill?.firstName ? `Welkom ${prefill.firstName}` : 'Welkom huurder';
  const titleSub = prefill?.apartmentNumber ? `Appartement ${prefill.apartmentNumber}` : null;

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-10" data-testid="tk-login">
      <div className="w-16 h-16 rounded-full bg-orange-50 flex items-center justify-center mb-4">
        <Lock className="w-7 h-7 text-[#FF5C00]" strokeWidth={2.4} />
      </div>
      <p className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">{titleTop}</p>
      {titleSub && (
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#FF5C00] mt-1"
          data-testid="tk-prefill-apt">{titleSub}</p>
      )}
      <p className="text-sm text-slate-500 mt-1 mb-6 text-center max-w-xs">
        {step === 'email' ? 'Voer uw e-mailadres in om door te gaan.' : 'Voer uw 4-cijferige pincode in.'}
      </p>

      {step === 'email' ? (
        <form
          onSubmit={(e) => { e.preventDefault(); if (email) setStep('pin'); }}
          className="w-full max-w-xs space-y-3"
        >
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus
            placeholder="naam@voorbeeld.sr"
            data-testid="tk-email-input"
            className="w-full h-14 px-4 rounded-2xl border-2 border-orange-100 focus:border-[#FF5C00] outline-none text-base bg-white"
          />
          <button type="submit"
            data-testid="tk-email-next"
            className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#FF8A3D] to-[#FF5C00] text-white font-bold text-base shadow-md active:scale-95 transition">
            Doorgaan
          </button>
        </form>
      ) : (
        <>
          <PinPad onComplete={submit} busy={busy} error={error} />
          {!prefill?.locked && (
            <button onClick={() => setStep('email')} disabled={busy}
              data-testid="tk-change-email"
              className="mt-5 text-xs text-slate-400 hover:text-slate-600 font-bold">
              ← Andere e-mail
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** Grote actie-kaart op het dashboard */
function ActionTile({ icon: Icon, title, subtitle, accent = 'orange', onClick, testId, badge }) {
  const palette = {
    orange: { from: 'from-[#FF8A3D]', to: 'to-[#FF5C00]', text: 'text-[#FF5C00]', bg: 'bg-orange-50' },
    blue:   { from: 'from-sky-400', to: 'to-sky-600', text: 'text-sky-600', bg: 'bg-sky-50' },
    emerald:{ from: 'from-emerald-400', to: 'to-emerald-600', text: 'text-emerald-600', bg: 'bg-emerald-50' },
  }[accent];
  return (
    <button onClick={onClick} data-testid={testId}
      className="group relative bg-white rounded-3xl p-6 sm:p-7 border border-orange-100 hover:border-transparent shadow-sm hover:shadow-xl active:scale-[0.98] transition-all text-left flex flex-col gap-4 overflow-hidden">
      <div aria-hidden className={`absolute -top-12 -right-12 w-40 h-40 rounded-full bg-gradient-to-br ${palette.from} ${palette.to} opacity-10 group-hover:opacity-20 transition`} />
      <div className={`relative w-14 h-14 rounded-2xl bg-gradient-to-br ${palette.from} ${palette.to} text-white flex items-center justify-center shadow-md`}>
        <Icon className="w-7 h-7" strokeWidth={2.4} />
      </div>
      <div className="relative">
        <p className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">{title}</p>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {badge && (
        <span className={`relative inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black ${palette.bg} ${palette.text} self-start`}>
          {badge}
        </span>
      )}
      <span className={`relative mt-auto inline-flex items-center gap-1 ${palette.text} font-bold text-sm`}>
        Open <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition" />
      </span>
    </button>
  );
}

/** Dashboard met grote kaarten */
function DashboardView({ overview, onAction }) {
  const balance = overview?.balance?.balance || 0;
  const currency = overview?.balance?.currency || 'SRD';
  const hasBalance = balance > 0;
  return (
    <div className="flex-1 px-5 py-6 max-w-3xl mx-auto w-full" data-testid="tk-dashboard">
      {/* Saldo-strook */}
      <div className={`rounded-3xl p-5 sm:p-6 mb-5 ${
        hasBalance ? 'bg-gradient-to-br from-red-50 to-orange-50 border border-red-100' : 'bg-gradient-to-br from-emerald-50 to-emerald-100/40 border border-emerald-100'
      }`}>
        <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-slate-500">
          {hasBalance ? 'Te betalen' : 'Saldo'}
        </p>
        <p className={`text-3xl sm:text-4xl font-black tracking-tight mt-1 ${
          hasBalance ? 'text-red-600' : 'text-emerald-600'
        }`} data-testid="tk-balance">
          {fmtMoney(balance, currency)}
        </p>
        {hasBalance ? (
          <p className="text-sm text-slate-600 mt-1">U heeft een openstaand bedrag.</p>
        ) : (
          <p className="text-sm text-slate-600 mt-1">U bent volledig bij. Bedankt!</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <ActionTile
          icon={CreditCard} title="Betalen" accent="orange"
          subtitle={hasBalance ? 'Betaal uw openstaande huur' : 'Geen openstaande facturen'}
          badge={hasBalance ? fmtMoney(balance, currency) : null}
          onClick={() => onAction('pay')} testId="tk-tile-pay"
        />
        <ActionTile
          icon={Wrench} title="Onderhoud" accent="blue"
          subtitle="Meld een probleem in uw woning"
          onClick={() => onAction('maintenance')} testId="tk-tile-maintenance"
        />
        <ActionTile
          icon={User} title="Mijn gegevens" accent="emerald"
          subtitle="Bekijk uw contract & info"
          onClick={() => onAction('me')} testId="tk-tile-me"
        />
        <ActionTile
          icon={Phone} title="Contact" accent="orange"
          subtitle="Bel of WhatsApp ons"
          onClick={() => onAction('contact')} testId="tk-tile-contact"
        />
      </div>
    </div>
  );
}

/** Onderhouds-melding form */
function MaintenanceView({ onBack, onDone }) {
  const [data, setData] = useState({ title: '', description: '', priority: 'medium' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (!data.title.trim()) { setError('Geef uw probleem een korte titel.'); return; }
    setBusy(true); setError('');
    try {
      await api.post('/tenant-portal/maintenance', data);
      onDone();
    } catch (e) { setError(formatError(e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="flex-1 px-5 py-6 max-w-2xl mx-auto w-full" data-testid="tk-maintenance">
      <button onClick={onBack} className="text-xs font-bold text-slate-500 hover:text-[#FF5C00] mb-3 inline-flex items-center gap-1">
        <ArrowLeft className="w-3.5 h-3.5" /> Terug
      </button>
      <p className="text-2xl font-black text-slate-900 mb-1">Onderhoud melden</p>
      <p className="text-sm text-slate-500 mb-5">De beheerder krijgt direct een melding van uw probleem.</p>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-slate-600">Wat is er aan de hand?</label>
          <input value={data.title} onChange={(e) => setData({ ...data, title: e.target.value })}
            placeholder="bv. Kraan lekt" data-testid="tk-mt-title"
            className="mt-1 w-full h-12 px-4 rounded-xl border-2 border-orange-100 focus:border-[#FF5C00] outline-none" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-slate-600">Details</label>
          <textarea value={data.description} onChange={(e) => setData({ ...data, description: e.target.value })}
            rows={4} placeholder="Beschrijf het probleem zo duidelijk mogelijk…"
            data-testid="tk-mt-desc"
            className="mt-1 w-full px-4 py-3 rounded-xl border-2 border-orange-100 focus:border-[#FF5C00] outline-none resize-none" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-slate-600">Urgentie</label>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {[
              { v: 'low', l: 'Laag' },
              { v: 'medium', l: 'Normaal' },
              { v: 'high', l: 'Dringend' },
            ].map((opt) => (
              <button key={opt.v} onClick={() => setData({ ...data, priority: opt.v })}
                data-testid={`tk-mt-prio-${opt.v}`}
                className={`h-12 rounded-xl font-bold text-sm transition active:scale-95 ${
                  data.priority === opt.v
                    ? 'bg-[#FF5C00] text-white shadow-md'
                    : 'bg-white border-2 border-orange-100 text-slate-700 hover:border-[#FF5C00]'
                }`}>
                {opt.l}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="text-xs font-bold text-red-600">{error}</p>}
        <button onClick={submit} disabled={busy}
          data-testid="tk-mt-submit"
          className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#FF8A3D] to-[#FF5C00] text-white font-bold text-base shadow-md active:scale-95 transition disabled:opacity-50">
          {busy ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Melding versturen'}
        </button>
      </div>
    </div>
  );
}

/** Mijn gegevens — contract + appartement info */
function MeView({ overview, onBack }) {
  if (!overview) return null;
  const { tenant, apartment, balance } = overview;
  return (
    <div className="flex-1 px-5 py-6 max-w-2xl mx-auto w-full" data-testid="tk-me">
      <button onClick={onBack} className="text-xs font-bold text-slate-500 hover:text-[#FF5C00] mb-3 inline-flex items-center gap-1">
        <ArrowLeft className="w-3.5 h-3.5" /> Terug
      </button>
      <p className="text-2xl font-black text-slate-900 mb-1">Mijn gegevens</p>
      <div className="space-y-3 mt-4">
        <Card label="Naam" value={tenant?.name || '—'} />
        <Card label="E-mail" value={tenant?.email || '—'} />
        <Card label="Telefoon" value={tenant?.phone || '—'} />
        <Card label="Appartement" value={apartment ? `${apartment.number}${apartment.location_name ? ' · ' + apartment.location_name : ''}` : '—'} />
        <Card label="Maandhuur" value={apartment ? fmtMoney(apartment.rent_amount, apartment.currency) : '—'} />
        <Card label="Saldo" value={fmtMoney(balance?.balance || 0, balance?.currency || 'SRD')}
          accent={(balance?.balance || 0) > 0 ? 'red' : 'emerald'} />
      </div>
    </div>
  );
}
function Card({ label, value, accent }) {
  const cls = accent === 'red' ? 'text-red-600' : accent === 'emerald' ? 'text-emerald-600' : 'text-slate-900';
  return (
    <div className="bg-white rounded-2xl border border-orange-100 p-4 flex items-center justify-between gap-3">
      <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`text-sm font-black ${cls} text-right truncate`}>{value}</p>
    </div>
  );
}

/** Betaal flow — kies openstaande factuur, ga naar receipt */
function PayView({ overview, onBack, onPaid }) {
  const [invoices, setInvoices] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get('/tenant-portal/invoices');
        if (!alive) return;
        setInvoices((data || []).filter((i) => i.status !== 'paid'));
      } catch (e) {
        if (alive) setError(formatError(e));
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const pay = async (inv) => {
    setSubmitting(inv.id); setError('');
    try {
      await api.post('/tenant-portal/payments', {
        amount: inv.amount,
        currency: inv.currency,
        method: 'contant',
        category: 'huur',
        period_month: inv.period_month,
        period_year: inv.period_year,
        invoice_id: inv.id,
        note: `Huurder Kiosk — factuur ${inv.invoice_number || ''}`.trim(),
      });
      onPaid();
    } catch (e) {
      setError(formatError(e));
    } finally { setSubmitting(null); }
  };

  // overview is used elsewhere; keep ref to silence lint without behaviour change.
  void overview;

  return (
    <div className="flex-1 px-5 py-6 max-w-2xl mx-auto w-full" data-testid="tk-pay">
      <button onClick={onBack} className="text-xs font-bold text-slate-500 hover:text-[#FF5C00] mb-3 inline-flex items-center gap-1">
        <ArrowLeft className="w-3.5 h-3.5" /> Terug
      </button>
      <p className="text-2xl font-black text-slate-900 mb-1">Betalen</p>
      <p className="text-sm text-slate-500 mb-5">Kies welke factuur u wilt betalen.</p>
      {busy && <Loader2 className="w-6 h-6 animate-spin text-[#FF5C00] mx-auto my-10" />}
      {error && <p className="text-xs font-bold text-red-600 mb-3">{error}</p>}
      {!busy && invoices.length === 0 && (
        <div className="bg-emerald-50 rounded-2xl p-6 text-center border border-emerald-100">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm font-bold text-slate-900">Geen openstaande facturen.</p>
        </div>
      )}
      <div className="space-y-2">
        {invoices.map((inv) => (
          <button key={inv.id} onClick={() => pay(inv)} disabled={submitting === inv.id}
            data-testid={`tk-pay-${inv.id}`}
            className="w-full text-left bg-white rounded-2xl border-2 border-orange-100 hover:border-[#FF5C00] active:scale-[0.99] transition p-4 flex items-center gap-4 disabled:opacity-50">
            <div className="w-12 h-12 rounded-xl bg-orange-50 text-[#FF5C00] flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-900 capitalize">
                {MONTHS_NL[inv.period_month - 1]} {inv.period_year}
              </p>
              <p className="text-[11px] text-slate-500">{inv.invoice_number || 'Huur'}</p>
            </div>
            <p className="text-lg font-black text-slate-900 whitespace-nowrap">
              {fmtMoney(inv.amount, inv.currency)}
            </p>
            {submitting === inv.id
              ? <Loader2 className="w-5 h-5 animate-spin text-[#FF5C00]" />
              : <ChevronRight className="w-5 h-5 text-slate-300" />}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Bevestigings-scherm na succesvolle betaling */
function PaidView({ onContinue }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-10" data-testid="tk-paid">
      <div className="w-24 h-24 rounded-full bg-emerald-100 flex items-center justify-center mb-4 animate-bounce">
        <CheckCircle2 className="w-14 h-14 text-emerald-500" strokeWidth={2.5} />
      </div>
      <p className="text-2xl sm:text-3xl font-black text-slate-900">Betaling gelukt</p>
      <p className="text-sm text-slate-500 mt-2 text-center max-w-xs">
        Bedankt voor uw betaling. De kwitantie wordt automatisch naar uw e-mail gestuurd.
      </p>
      <button onClick={onContinue} data-testid="tk-paid-continue"
        className="mt-6 h-14 px-8 rounded-2xl bg-gradient-to-r from-[#FF8A3D] to-[#FF5C00] text-white font-bold text-base shadow-md active:scale-95 transition">
        Klaar
      </button>
    </div>
  );
}

/** Contact / hulp */
function ContactView({ overview, onBack }) {
  const phone = overview?.company?.phone || overview?.tenant?.landlord_phone;
  return (
    <div className="flex-1 px-5 py-6 max-w-2xl mx-auto w-full" data-testid="tk-contact">
      <button onClick={onBack} className="text-xs font-bold text-slate-500 hover:text-[#FF5C00] mb-3 inline-flex items-center gap-1">
        <ArrowLeft className="w-3.5 h-3.5" /> Terug
      </button>
      <p className="text-2xl font-black text-slate-900 mb-1">Contact</p>
      <p className="text-sm text-slate-500 mb-5">Direct in contact met uw beheerder.</p>
      {phone ? (
        <div className="space-y-3">
          <a href={`tel:${phone}`} data-testid="tk-call"
            className="w-full bg-white rounded-2xl border-2 border-orange-100 hover:border-[#FF5C00] transition p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><Phone className="w-5 h-5" /></div>
            <div><p className="text-sm font-bold text-slate-900">Bel beheerder</p><p className="text-xs text-slate-500">{phone}</p></div>
          </a>
          <a href={`https://wa.me/${phone.replace(/[^\d]/g, '')}`} target="_blank" rel="noopener noreferrer"
            data-testid="tk-whatsapp"
            className="w-full bg-white rounded-2xl border-2 border-orange-100 hover:border-emerald-500 transition p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><Phone className="w-5 h-5" /></div>
            <div><p className="text-sm font-bold text-slate-900">WhatsApp beheerder</p><p className="text-xs text-slate-500">Open chat</p></div>
          </a>
        </div>
      ) : (
        <div className="bg-orange-50 rounded-2xl p-6 text-center">
          <p className="text-sm font-bold text-slate-900">Geen contactgegevens beschikbaar.</p>
          <p className="text-xs text-slate-500 mt-1">Vraag uw beheerder om zijn nummer in te stellen.</p>
        </div>
      )}
    </div>
  );
}

/** Container — beheert auth + view-state */
export default function TenantKioskLayout() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const aptId = searchParams.get('apt');
  const [authed, setAuthed] = useState(() => !!localStorage.getItem(TENANT_TOKEN_KEY));
  const [view, setView] = useState('dashboard');
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [prefill, setPrefill] = useState(null);
  const idleTimer = useRef(null);

  // QR-sticker bij voordeur: `?apt=<id>` → lookup → voorvullen + skip email step.
  useEffect(() => {
    if (!aptId || authed) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get(`/tenant-portal/lookup-apartment/${aptId}`);
        if (!alive) return;
        setPrefill({
          email: data.tenant?.email || '',
          firstName: data.tenant?.first_name || '',
          apartmentNumber: data.apartment?.number || '',
          locked: true, // verberg "andere e-mail" knop in QR-modus
        });
      } catch {
        // Onbekende of niet-toegewezen appartement → val terug op standaard login.
        if (alive) setPrefill(null);
      }
    })();
    return () => { alive = false; };
  }, [aptId, authed]);

  // Edge-to-edge cream achtergrond + body class.
  useEffect(() => {
    document.title = 'Huurder Kiosk';
    const BG = '#FFF7F0';
    document.body.classList.add('tenant-mode');
    const prevHtmlBg = document.documentElement.style.backgroundColor;
    const prevBodyBg = document.body.style.backgroundColor;
    document.documentElement.style.backgroundColor = BG;
    document.body.style.backgroundColor = BG;
    return () => {
      document.body.classList.remove('tenant-mode');
      document.documentElement.style.backgroundColor = prevHtmlBg;
      document.body.style.backgroundColor = prevBodyBg;
    };
  }, []);

  const loadOverview = useCallback(async () => {
    if (!authed) return;
    setLoading(true);
    try {
      const { data } = await api.get('/tenant-portal/overview');
      setOverview(data);
    } catch {
      // Token ongeldig -> uitloggen.
      localStorage.removeItem(TENANT_TOKEN_KEY);
      setAuthed(false);
    } finally { setLoading(false); }
  }, [authed]);

  useEffect(() => { if (authed) loadOverview(); }, [authed, loadOverview]);

  // Auto-logout na 90s inactiviteit (kiosk-modus).
  const resetIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      if (authed) {
        localStorage.removeItem(TENANT_TOKEN_KEY);
        setAuthed(false);
        setView('dashboard');
      }
    }, 90_000);
  }, [authed]);

  useEffect(() => {
    if (!authed) return undefined;
    resetIdle();
    const events = ['mousedown', 'touchstart', 'keydown'];
    events.forEach((e) => window.addEventListener(e, resetIdle));
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetIdle));
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [authed, resetIdle]);

  const logout = () => {
    api.post('/tenant-portal/logout').catch(() => {});
    localStorage.removeItem(TENANT_TOKEN_KEY);
    setAuthed(false);
    setView('dashboard');
  };

  const wrapper = {
    position: 'fixed', inset: 0, backgroundColor: '#FFF7F0',
    overflowY: 'auto', WebkitOverflowScrolling: 'touch',
    paddingTop: 'env(safe-area-inset-top, 0px)',
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    paddingLeft: 'env(safe-area-inset-left, 0px)',
    paddingRight: 'env(safe-area-inset-right, 0px)',
  };

  if (!authed) {
    return (
      <div style={wrapper} className="flex flex-col">
        <KioskHeader tenantName={null} onLogout={null} onBack={() => navigate('/')} />
        <LoginView onLoggedIn={() => setAuthed(true)} prefill={prefill} />
      </div>
    );
  }

  if (loading || !overview) {
    return (
      <div style={wrapper} className="flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-[#FF5C00]" />
      </div>
    );
  }

  const showBack = view !== 'dashboard' && view !== 'paid';

  return (
    <div style={wrapper} className="flex flex-col">
      <KioskHeader
        tenantName={overview.tenant?.name}
        onBack={showBack ? () => setView('dashboard') : null}
        onLogout={logout}
      />
      {view === 'dashboard' && <DashboardView overview={overview} onAction={setView} />}
      {view === 'pay' && <PayView overview={overview} onBack={() => setView('dashboard')}
        onPaid={() => { setView('paid'); loadOverview(); }} />}
      {view === 'paid' && <PaidView onContinue={() => setView('dashboard')} />}
      {view === 'maintenance' && <MaintenanceView onBack={() => setView('dashboard')}
        onDone={() => setView('dashboard')} />}
      {view === 'me' && <MeView overview={overview} onBack={() => setView('dashboard')} />}
      {view === 'contact' && <ContactView overview={overview} onBack={() => setView('dashboard')} />}
    </div>
  );
}
