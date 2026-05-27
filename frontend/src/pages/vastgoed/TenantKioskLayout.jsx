import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBrandedNavigate } from '../../lib/branded-nav';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Lock, Loader2, LogOut, CreditCard, Wrench, User, Phone,
  CheckCircle2, ChevronRight, Calendar, ArrowLeft, Building2, Delete,
  Home as HomeIcon, Mail, Wallet, FileText, Wifi,
  HelpCircle, Send, Check, ArrowRight, Banknote, Droplets, AlertCircle,
  QrCode, Smartphone, Clock as ClockIcon, Receipt, Hash, X, Printer,
} from 'lucide-react';
import { api, formatError, fmtMoney, MONTHS_NL } from '../../lib/api';
import {
  detectCompanySlug, fetchBranding, fetchBrandingByHost,
  readCachedBranding, applyBranding, resolveLogoUrl,
} from '../../lib/branding';

const TENANT_TOKEN_KEY = 'tenant_token';
const PIN_LENGTH = 4;

const slideVariants = {
  enter: { opacity: 0, x: 60 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -60 },
};

// =====================================================================
// PIN-pad — groot, branded, met haptische feedback
// =====================================================================
function PinPad({ value, onDigit, onBack, busy }) {
  const press = (d) => {
    if (busy || value.length >= PIN_LENGTH) return;
    try { if (navigator.vibrate) navigator.vibrate(10); } catch { /* ignore */ }
    onDigit(d);
  };
  const back = () => {
    if (busy) return;
    try { if (navigator.vibrate) navigator.vibrate(8); } catch { /* ignore */ }
    onBack();
  };
  return (
    <div className="grid grid-cols-3 gap-3 sm:gap-4 w-full max-w-sm" data-testid="tk-pinpad">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
        <button key={d} onClick={() => press(String(d))} disabled={busy}
          data-testid={`tk-key-${d}`}
          className="h-16 sm:h-20 rounded-2xl bg-white text-3xl font-black text-slate-900 shadow-[0_6px_0_rgba(0,0,0,0.08)] active:translate-y-[2px] active:shadow-[0_2px_0_rgba(0,0,0,0.08)] transition disabled:opacity-50">
          {d}
        </button>
      ))}
      <span />
      <button onClick={() => press('0')} disabled={busy} data-testid="tk-key-0"
        className="h-16 sm:h-20 rounded-2xl bg-white text-3xl font-black text-slate-900 shadow-[0_6px_0_rgba(0,0,0,0.08)] active:translate-y-[2px] active:shadow-[0_2px_0_rgba(0,0,0,0.08)] transition disabled:opacity-50">
        0
      </button>
      <button onClick={back} disabled={busy} data-testid="tk-key-back"
        className="h-16 sm:h-20 rounded-2xl bg-white/85 text-slate-600 shadow-[0_6px_0_rgba(0,0,0,0.08)] active:translate-y-[2px] active:shadow-[0_2px_0_rgba(0,0,0,0.08)] transition flex items-center justify-center disabled:opacity-50">
        <Delete className="w-6 h-6" />
      </button>
    </div>
  );
}

function PinDots({ value, error }) {
  return (
    <div className="flex items-center gap-3 sm:gap-4" data-testid="tk-pin-dots">
      {Array.from({ length: PIN_LENGTH }).map((_, i) => {
        const filled = i < value.length;
        return (
          <motion.span
            key={i}
            animate={{
              scale: filled ? 1.0 : 0.9,
              backgroundColor: error
                ? '#dc2626'
                : filled ? '#0f172a' : '#ffffff',
              borderColor: error ? '#fecaca' : '#ffffff',
            }}
            transition={{ duration: 0.15 }}
            className="w-5 h-5 sm:w-6 sm:h-6 rounded-full border-[3px] shadow-[0_4px_10px_rgba(0,0,0,0.18)]"
            style={{ borderColor: '#ffffff' }}
          />
        );
      })}
    </div>
  );
}

// =====================================================================
// LOGIN view — PIN-only (geen email-stap meer)
// =====================================================================
function LoginView({ branding, onLoggedIn, prefill }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Aantal foute pogingen — na 3 tonen we de "Vergeten? Vraag nieuwe PIN" knop
  // zodat de huurder zelfstandig een nieuwe code kan aanvragen ipv naar de
  // receptie te moeten bellen.
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [showForgotSheet, setShowForgotSheet] = useState(false);

  const onDigit = (d) => setPin((p) => (p.length >= PIN_LENGTH ? p : p + d));
  const onBack = () => setPin((p) => p.slice(0, -1));

  useEffect(() => {
    if (pin.length !== PIN_LENGTH) return;
    let cancelled = false;
    (async () => {
      setBusy(true); setError('');
      try {
        let data;
        if (prefill?.email) {
          // QR-mode: we kennen de huurder al, normale identifier-login
          ({ data } = await api.post('/tenant-portal/login', { identifier: prefill.email, pin }));
        } else if (branding?.id) {
          // Standalone modus: alléén PIN + bedrijfscontext
          ({ data } = await api.post('/tenant-portal/pin-login', { pin, company_id: branding.id }));
        } else if (branding?.slug) {
          ({ data } = await api.post('/tenant-portal/pin-login', { pin, company_slug: branding.slug }));
        } else {
          throw new Error('Geen bedrijfscontext gevonden — open de Huurder Kiosk via de QR-code.');
        }
        if (cancelled) return;
        localStorage.setItem(TENANT_TOKEN_KEY, data.token);
        setFailedAttempts(0);
        onLoggedIn();
      } catch (e) {
        if (!cancelled) {
          setError(formatError(e) || 'Onjuiste PIN');
          setFailedAttempts((n) => n + 1);
          // Reset het invoerveld na een korte trillende animatie.
          setTimeout(() => { if (!cancelled) setPin(''); }, 350);
        }
      } finally { if (!cancelled) setBusy(false); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line
  }, [pin]);

  const welcome = prefill?.firstName
    ? `Welkom ${prefill.firstName}`
    : (branding?.app_name || branding?.name || 'Huurder Kiosk');
  const sub = prefill?.apartmentNumber
    ? `Appartement ${prefill.apartmentNumber}`
    : (branding?.tagline || 'Voer uw 4-cijferige PIN in om in te loggen');

  return (
    <div className="min-h-full w-full flex flex-col items-center justify-center px-5 py-8"
      data-testid="tk-login">
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-md flex flex-col items-center text-center">
        {/* Logo / huis-icoon */}
        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-white/95 shadow-2xl flex items-center justify-center p-3 mb-5">
          {branding?.logo_url ? (
            <img src={resolveLogoUrl(branding.logo_url)} alt="logo"
              className="w-full h-full object-contain" />
          ) : (
            <HomeIcon className="w-10 h-10 text-[color:var(--brand-primary,#FF5C00)]" strokeWidth={2.4} />
          )}
        </div>
        <p className="text-[11px] font-black uppercase tracking-[0.28em] text-white/80 mb-1">
          Huurder Kiosk
        </p>
        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight" data-testid="tk-welcome">
          {welcome}
        </h1>
        {prefill?.apartmentNumber && (
          <p className="text-sm font-bold text-white/90 mt-2 px-3 py-1 rounded-full bg-white/15"
            data-testid="tk-prefill-apt">
            {sub}
          </p>
        )}
        {!prefill?.apartmentNumber && (
          <p className="text-sm text-white/85 mt-2 max-w-xs">{sub}</p>
        )}

        {/* PIN dots */}
        <motion.div
          animate={error ? { x: [-8, 8, -6, 6, -3, 3, 0] } : { x: 0 }}
          transition={{ duration: 0.4 }}
          className="mt-7 mb-3">
          <PinDots value={pin} error={!!error} />
        </motion.div>
        {error && (
          <p className="text-xs font-bold text-white/95 bg-red-500/30 px-3 py-1 rounded-full mb-4"
            data-testid="tk-pin-error">{error}</p>
        )}

        <div className="mt-2">
          <PinPad value={pin} onDigit={onDigit} onBack={onBack} busy={busy} />
        </div>

        {busy && (
          <div className="mt-4 flex items-center gap-2 text-white/90 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Bezig met inloggen…
          </div>
        )}

        {/* Na 3 foute pogingen → tonen "Vergeten?" knop. Voorkomt receptie-bellen. */}
        {failedAttempts >= 3 && !busy && (
          <motion.button
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            onClick={() => setShowForgotSheet(true)}
            data-testid="tk-forgot-pin-btn"
            className="mt-5 inline-flex items-center gap-2 px-5 py-3 bg-white/15 hover:bg-white/25 active:bg-white/30 backdrop-blur-md text-white font-bold rounded-2xl border border-white/20 text-sm min-h-[48px]">
            <HelpCircle className="w-4 h-4" />
            PIN vergeten? Vraag nieuwe code
          </motion.button>
        )}
      </motion.div>

      {showForgotSheet && (
        <ForgotPinSheet
          branding={branding}
          onClose={() => setShowForgotSheet(false)}
          onSent={() => { setFailedAttempts(0); setError(''); setPin(''); }}
        />
      )}
    </div>
  );
}

// =====================================================================
// FORGOT PIN — bottom sheet om email/telefoonnr in te vullen.
// Backend stuurt PIN per Email + WhatsApp/SMS.
// =====================================================================
function ForgotPinSheet({ branding, onClose, onSent }) {
  const [identifier, setIdentifier] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(null); // { via: ['email','whatsapp'] }

  const submit = async (e) => {
    e?.preventDefault?.();
    const value = identifier.trim();
    if (!value) { setError('Vul uw email of telefoon in'); return; }
    setBusy(true); setError('');
    try {
      const payload = { identifier: value };
      if (branding?.id) payload.company_id = branding.id;
      else if (branding?.slug) payload.company_slug = branding.slug;
      const { data } = await api.post('/tenant-portal/forgot-pin', payload);
      setSent({ via: data?.via || [] });
      onSent?.();
    } catch (err) {
      setError(formatError(err, 'Verzenden mislukt. Probeer opnieuw of bel de receptie.'));
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center"
      data-testid="tk-forgot-sheet" onClick={onClose}>
      <motion.div
        initial={{ y: 400, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 400 }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 24px), 24px)' }}>
        <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto mb-4 sm:hidden" />
        {!sent ? (
          <>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-orange-100 text-[#FF5C00] flex items-center justify-center shrink-0">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-black text-slate-900">PIN vergeten?</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Vul uw email of telefoonnummer in. We sturen u direct een nieuwe PIN.
                </p>
              </div>
            </div>
            <form onSubmit={submit} className="space-y-3">
              <input value={identifier} onChange={(e) => setIdentifier(e.target.value)}
                autoFocus inputMode="email"
                placeholder="email@voorbeeld.com of +597 8123456"
                data-testid="tk-forgot-identifier"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FF5C00] text-sm" />
              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2" data-testid="tk-forgot-error">{error}</p>
              )}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={onClose} disabled={busy}
                  className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm">
                  Annuleren
                </button>
                <button type="submit" disabled={busy}
                  data-testid="tk-forgot-submit"
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold rounded-xl text-sm disabled:opacity-50">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Verstuur PIN
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="text-center py-2" data-testid="tk-forgot-success">
            <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
              <Check className="w-7 h-7" strokeWidth={3} />
            </div>
            <h2 className="text-lg font-black text-slate-900 mb-1">Verstuurd!</h2>
            <p className="text-sm text-slate-500 mb-4">
              {sent.via.length === 0
                ? 'We controleren uw gegevens. Komt er geen bericht binnen 2 minuten? Neem contact op met de receptie.'
                : `Uw nieuwe PIN is verstuurd via ${sent.via.map((v) => v === 'email' ? 'Email' : v === 'whatsapp' ? 'WhatsApp' : 'SMS').join(' + ')}.`}
            </p>
            <button onClick={onClose} data-testid="tk-forgot-close"
              className="px-6 py-3 bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold rounded-xl text-sm">
              Sluiten en PIN intikken
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// =====================================================================
// DASHBOARD — kiosk-look: financieel overzicht links, grote actie rechts
// =====================================================================
function DashboardView({ overview, onAction, onHistory }) {
  const tenant = overview?.tenant;
  const apartment = overview?.apartment;
  const balance = overview?.balance || {};
  const internet = Number(tenant?.internet_amount || 0);
  const openRent = (balance.balance || 0) > 0 ? balance.balance : 0;
  const totalDue = openRent + internet;
  const cur = (balance.currency || apartment?.currency || 'SRD').toUpperCase();
  const hasBalance = totalDue > 0;

  const items = [
    { key: 'rent', label: 'Maandhuur', value: apartment?.rent_amount || 0, icon: HomeIcon, muted: false },
    ...(openRent > 0 ? [{
      key: 'open', label: 'Openstaande huur', value: openRent, icon: Wallet, highlight: true,
      sub: balance.next_period ? `${MONTHS_NL[balance.next_period.month - 1]} ${balance.next_period.year}` : '',
    }] : []),
    { key: 'svc', label: 'Servicekosten', value: 0, icon: Droplets, muted: true },
    { key: 'fines', label: 'Boetes', value: 0, icon: AlertCircle, muted: true },
    { key: 'internet', label: 'Internet', value: internet, icon: Wifi, muted: internet === 0 },
  ];

  return (
    <div className="h-full w-full flex flex-col" data-testid="tk-dashboard"
      style={{ padding: '1.5vh 1.5vw 0' }}>
      <div className="flex items-center justify-between flex-wrap gap-2 px-1 sm:px-2 py-2">
        <div className="text-white">
          <p className="text-xs sm:text-sm font-bold">{tenant?.name}</p>
          {apartment && <p className="text-[10px] sm:text-xs opacity-75">Appt. {apartment.number}{apartment.address ? ' · ' + apartment.address : ''}</p>}
        </div>
        <p className="text-xs sm:text-sm font-semibold text-white/90 hidden sm:block">Welkom — kies een actie</p>
      </div>

      <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-2 sm:gap-3 pb-3">
        {/* LEFT — Financieel overzicht (kiosk-style) */}
        <div className="bg-white rounded-2xl flex-1 md:flex-[3] flex flex-col p-3 sm:p-4 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm sm:text-base font-bold text-slate-900">Financieel overzicht</h3>
          </div>
          <div className="flex-1 divide-y divide-slate-100">
            {items.map((it) => {
              const Icon = it.icon;
              const klass = it.highlight ? 'text-orange-600' : it.muted ? 'text-slate-400' : 'text-slate-900';
              return (
                <div key={it.key} className={`flex items-center justify-between py-2.5 px-1 ${klass}`}
                  data-testid={`tk-fin-${it.key}`}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                      it.highlight ? 'bg-orange-100 text-orange-500'
                        : it.muted ? 'bg-slate-50 text-slate-300'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm ${it.highlight ? 'font-extrabold' : 'font-semibold'}`}>{it.label}</p>
                      {it.sub && <p className="text-[10px] mt-0.5">{it.sub}</p>}
                    </div>
                  </div>
                  <p className={`font-bold text-sm sm:text-base ${it.highlight ? 'font-extrabold' : ''}`}>
                    {fmtMoney(it.value, cur)}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="border-t-2 border-slate-200 mt-2 pt-2 flex items-center justify-between">
            <p className="font-bold text-slate-900 text-sm sm:text-base">Totaal openstaand</p>
            <p className="text-lg sm:text-xl font-extrabold text-slate-900" data-testid="tk-total-due">
              {fmtMoney(totalDue, cur)}
            </p>
          </div>
        </div>

        {/* RIGHT — Te betalen + Volgende + Geschiedenis (kiosk-style) */}
        <div className="bg-white rounded-2xl md:flex-[2] flex flex-col items-center justify-center text-center p-5 sm:p-6 min-h-[260px]">
          <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center mb-3 ${
            hasBalance ? 'bg-orange-100' : 'bg-emerald-100'
          }`}>
            {hasBalance
              ? <Wallet className="w-7 h-7 sm:w-9 sm:h-9 text-orange-500" />
              : <CheckCircle2 className="w-7 h-7 sm:w-9 sm:h-9 text-emerald-500" />}
          </div>
          <p className="text-xs sm:text-sm font-bold uppercase tracking-widest text-slate-400">
            {hasBalance ? 'Te betalen' : 'Saldo'}
          </p>
          <p className={`text-4xl sm:text-5xl font-extrabold tracking-tight mt-1 mb-1 ${
            hasBalance ? 'text-slate-900' : 'text-emerald-600'
          }`} data-testid="tk-balance">{fmtMoney(totalDue, cur)}</p>
          <p className="text-xs sm:text-sm text-slate-500 mb-5">
            {hasBalance ? 'U heeft een openstaand bedrag.' : 'U bent volledig bij. Bedankt!'}
          </p>
          <button onClick={() => onAction('pay')} data-testid="tk-tile-pay"
            className="w-full max-w-xs bg-orange-500 hover:bg-orange-600 text-white text-base sm:text-lg font-bold rounded-xl flex items-center justify-center gap-2 transition py-3 sm:py-3.5 active:scale-[0.98]">
            Volgende <ArrowRight className="w-5 h-5" />
          </button>
          <button onClick={onHistory} data-testid="tk-tile-history"
            className="mt-2 w-full max-w-xs bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold rounded-xl flex items-center justify-center gap-2 py-2.5 text-sm">
            <ClockIcon className="w-4 h-4" /> Betalingsgeschiedenis
          </button>
        </div>
      </div>

      {/* Secondary tiles (kleiner, onderaan) */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 pb-3">
        <SecondaryTile icon={Wrench} label="Onderhoud" testId="tk-tile-maintenance"
          accent="bg-sky-50 text-sky-600" onClick={() => onAction('maintenance')} />
        <SecondaryTile icon={User} label="Gegevens" testId="tk-tile-me"
          accent="bg-emerald-50 text-emerald-600" onClick={() => onAction('me')} />
        <SecondaryTile icon={Phone} label="Contact" testId="tk-tile-contact"
          accent="bg-violet-50 text-violet-600" onClick={() => onAction('contact')} />
      </div>
    </div>
  );
}

function SecondaryTile({ icon: Icon, label, accent, onClick, testId }) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick} data-testid={testId}
      className="bg-white rounded-2xl py-2.5 sm:py-3 shadow-md flex flex-col items-center gap-1.5 active:shadow-sm transition">
      <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl ${accent} flex items-center justify-center`}>
        <Icon className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={2.4} />
      </div>
      <span className="text-xs sm:text-sm font-bold text-slate-900 text-center leading-tight">{label}</span>
    </motion.button>
  );
}

// =====================================================================
// PAY SELECT — checklist + custom keypad (kiosk-stijl)
// =====================================================================
const PAY_ITEMS_TEMPLATE = [
  { id: 'huur', label: 'Huur', icon: Banknote, desc: 'Openstaand huurbedrag' },
  { id: 'servicekosten', label: 'Servicekosten', icon: Droplets, desc: 'Water, stroom en overige' },
  { id: 'boete', label: 'Boetes', icon: AlertCircle, desc: 'Openstaande boetes' },
  { id: 'internet', label: 'Internet', icon: Wifi, desc: 'Internetaansluiting' },
];

function TenantPaySelect({ overview, onBack, onConfirm }) {
  const { tenant, apartment: apt, balance } = overview;
  const internet = Number(tenant?.internet_amount || 0);
  const cur = (balance.currency || apt?.currency || 'SRD').toUpperCase();
  const fmt = (v) => fmtMoney(v, cur);
  const openRent = balance.balance > 0 ? balance.balance : 0;
  const totalDue = openRent + internet;

  const amounts = {
    huur: openRent > 0 ? openRent : (apt?.rent_amount || 0),
    servicekosten: 0,
    boete: 0,
    internet,
  };

  const [selected, setSelected] = useState(new Set());
  const [custom, setCustom] = useState('');
  const [showMobileKeypad, setShowMobileKeypad] = useState(false);

  const toggle = (id) => {
    setSelected((cur2) => {
      const next = new Set(cur2);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setCustom('');
  };

  const isDisabled = (id) => (amounts[id] || 0) <= 0;
  const enabled = PAY_ITEMS_TEMPLATE.filter((t) => !isDisabled(t.id));
  const allSelected = enabled.length > 0 && enabled.every((t) => selected.has(t.id));
  const selectAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(enabled.map((t) => t.id)));
    setCustom('');
  };
  const selectedTotal = [...selected].reduce((s, id) => s + (amounts[id] || 0), 0);
  const hasCustom = custom && parseFloat(custom) > 0;
  const activeAmount = hasCustom ? parseFloat(custom) : selectedTotal;
  const canProceed = activeAmount > 0;

  const buildDescription = () => {
    const labels = [];
    if (selected.has('huur')) labels.push('Huur');
    if (selected.has('servicekosten')) labels.push('Servicekosten');
    if (selected.has('boete')) labels.push('Boetes');
    if (selected.has('internet')) labels.push('Internet');
    return labels.join(' + ');
  };

  const press = (k) => {
    if (k === 'DEL') setCustom((c) => c.slice(0, -1));
    else if (k === '.') setCustom((c) => c.includes('.') ? c : c + '.');
    else setCustom((c) => c + k);
    setSelected(new Set());
  };

  const handleNext = () => {
    if (!canProceed) return;
    let amount, category, note;
    if (hasCustom) {
      amount = parseFloat(custom);
      category = 'huur';
      note = `Huurder Kiosk — gedeeltelijke betaling — ${fmt(amount)}`;
    } else {
      amount = selectedTotal;
      category = selected.size === 1 ? [...selected][0] : 'huur';
      note = `Huurder Kiosk — ${buildDescription()}`;
    }
    onConfirm({
      amount, currency: cur, category, method: 'contant',
      period_month: category === 'huur' && balance.next_period ? balance.next_period.month : null,
      period_year: category === 'huur' && balance.next_period ? balance.next_period.year : null,
      note,
    });
  };

  return (
    <div className="h-full flex flex-col px-3 sm:px-6 pt-2" data-testid="tk-pay-select">
      <div className="flex items-center justify-between flex-wrap gap-2 py-2">
        <button onClick={onBack} data-testid="tk-payselect-back"
          className="flex items-center gap-1.5 text-white font-bold bg-white/20 backdrop-blur-sm rounded-lg px-3 py-1.5 sm:px-4 sm:py-2">
          <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" /> <span className="text-xs sm:text-sm">Terug</span>
        </button>
        <span className="text-sm sm:text-base font-semibold text-white">Wat wilt u betalen?</span>
        <div className="text-right text-white hidden sm:block">
          <p className="text-xs sm:text-sm font-semibold">{tenant.name}</p>
          {apt && <p className="text-[10px] sm:text-xs opacity-70">Appt. {apt.number}</p>}
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row gap-2 sm:gap-3 min-h-0 pb-2">
        {/* LEFT — items checklist */}
        <div className="bg-white rounded-2xl flex-1 md:flex-[3] flex flex-col min-w-0 p-2 sm:p-3">
          {enabled.length > 1 && (
            <button onClick={selectAll} data-testid="tk-pay-select-all"
              className={`w-full flex items-center justify-between rounded-lg border-2 transition px-2.5 py-2 sm:px-3 sm:py-2.5 mb-1.5 ${
                allSelected ? 'bg-orange-50 border-orange-400' : 'bg-white border-slate-200 hover:border-orange-300'
              }`}>
              <div className="flex items-center gap-2">
                <div className={`flex items-center justify-center rounded border-2 w-5 h-5 ${allSelected ? 'bg-orange-500 border-orange-500' : 'border-slate-300'}`}>
                  {allSelected && <Check className="text-white w-3.5 h-3.5" strokeWidth={3} />}
                </div>
                <span className="text-sm font-bold text-slate-900">Alles betalen</span>
              </div>
              <span className="text-sm sm:text-base font-semibold text-orange-600 whitespace-nowrap">
                {fmt(enabled.reduce((s, t) => s + (amounts[t.id] || 0), 0))}
              </span>
            </button>
          )}

          <div className="flex flex-col gap-1 sm:gap-1.5 flex-1">
            {PAY_ITEMS_TEMPLATE.map((t) => {
              const disabled = isDisabled(t.id);
              const sel = selected.has(t.id);
              const Icon = t.icon;
              return (
                <button key={t.id} disabled={disabled} onClick={() => toggle(t.id)}
                  data-testid={`tk-pay-type-${t.id}`}
                  className={`flex items-center justify-between w-full rounded-lg border-2 transition px-2.5 py-2 sm:px-3 sm:py-2.5 ${
                    disabled ? 'bg-slate-50 border-slate-100 opacity-40 cursor-not-allowed' :
                    sel ? 'bg-orange-50 border-orange-400' : 'bg-white border-slate-200 hover:border-orange-300'
                  }`}>
                  <div className="flex items-center gap-2">
                    <div className={`flex items-center justify-center rounded border-2 flex-shrink-0 w-5 h-5 ${sel ? 'bg-orange-500 border-orange-500' : 'border-slate-300'}`}>
                      {sel && <Check className="text-white w-3.5 h-3.5" strokeWidth={3} />}
                    </div>
                    <div className={`rounded-lg flex items-center justify-center flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 ${sel ? 'bg-orange-100' : 'bg-slate-50'}`}>
                      <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${sel ? 'text-orange-500' : 'text-slate-400'}`} />
                    </div>
                    <span className="text-sm font-bold text-slate-900">{t.label}</span>
                  </div>
                  <p className={`text-sm sm:text-base flex-shrink-0 ml-2 whitespace-nowrap font-semibold ${disabled ? 'text-slate-300' : sel ? 'text-orange-600' : 'text-slate-900'}`}>
                    {fmt(amounts[t.id] || 0)}
                  </p>
                </button>
              );
            })}
          </div>

          {selected.size > 0 && (
            <div className="bg-slate-900 rounded-lg flex items-center justify-between px-3 py-2 sm:py-2.5 mt-1.5">
              <div className="min-w-0">
                <p className="text-xs text-slate-400">{selected.size} item{selected.size > 1 ? 's' : ''}</p>
                <p className="text-xs text-white truncate">{buildDescription()}</p>
              </div>
              <p className="text-base sm:text-lg font-bold text-white whitespace-nowrap ml-2">{fmt(selectedTotal)}</p>
            </div>
          )}

          <button onClick={handleNext} disabled={!canProceed} data-testid="tk-payment-next-btn"
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl flex items-center justify-center gap-2 transition active:scale-[0.98] py-3 sm:py-3.5 mt-1.5 text-sm sm:text-base font-bold">
            <span>Volgende — {fmt(activeAmount)}</span> <ArrowRight className="w-5 h-5" />
          </button>

          {/* Mobile keypad toggle */}
          <div className="md:hidden mt-1.5">
            {!showMobileKeypad ? (
              <button onClick={() => setShowMobileKeypad(true)} data-testid="tk-mobile-custom-toggle"
                className="w-full flex items-center justify-center gap-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-500 hover:bg-slate-100 transition">
                <Hash className="w-4 h-4" /> Ander bedrag invoeren
              </button>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl p-2.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-medium">Ander bedrag ({cur})</span>
                  <button onClick={() => { setShowMobileKeypad(false); setCustom(''); }} className="text-xs text-slate-400">Sluiten</button>
                </div>
                <div className={`border-2 rounded-lg text-center py-2 mb-2 ${hasCustom ? 'bg-orange-50 border-orange-300' : 'bg-slate-50 border-slate-200'}`}>
                  <span className={`font-mono font-extrabold text-xl ${hasCustom ? 'text-orange-600' : 'text-slate-300'}`}>{cur} {custom || '0.00'}</span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {['1','2','3','DEL','4','5','6','.','7','8','9','0'].map((k) => (
                    <button key={k} onClick={() => press(k)} data-testid={`tk-mobile-key-${k}`}
                      className={`rounded-lg font-bold transition active:scale-95 h-10 text-base ${
                        k === 'DEL' ? 'bg-red-50 text-red-500 text-xs' : 'bg-slate-50 text-slate-900 hover:bg-orange-50 hover:text-orange-600 border border-slate-100'
                      }`}>{k}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — Desktop keypad */}
        <div className="bg-white rounded-2xl hidden md:flex flex-none md:flex-[2] flex-col min-w-0 p-4 sm:p-5">
          <h4 className="text-sm sm:text-base font-bold text-slate-900 mb-0.5">Bedrag invoeren</h4>
          <p className="text-xs text-slate-400 mb-3">Totaal openstaand: {fmt(totalDue)}</p>
          <div className={`border-2 rounded-lg transition px-3 py-3 mb-3 ${hasCustom ? 'bg-orange-50 border-orange-300' : 'bg-slate-50 border-slate-200'}`}>
            <p className="text-xs text-slate-400 mb-0.5">{cur}</p>
            <p className={`font-extrabold font-mono text-2xl sm:text-3xl ${hasCustom ? 'text-orange-600' : 'text-slate-900'}`} data-testid="tk-pay-amount-display">
              {custom || '0.00'}
            </p>
          </div>
          <div className="grid grid-cols-3 flex-1 gap-1.5">
            {['1','2','3','4','5','6','7','8','9','.','0','DEL'].map((k) => (
              <button key={k} onClick={() => press(k)} data-testid={`tk-keypad-${k}`}
                className={`rounded-lg font-bold transition active:scale-95 flex items-center justify-center text-base sm:text-lg ${
                  k === 'DEL' ? 'bg-slate-100 text-red-500 hover:bg-red-50 border border-slate-100' :
                  'bg-slate-50 text-slate-900 hover:bg-orange-50 hover:text-orange-600 border border-slate-100'
                }`}>{k}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// PAY METHOD — Contant / Mope
// =====================================================================
function TenantPayMethod({ payload, overview, onBack, onConfirm }) {
  const { tenant, apartment: apt } = overview;
  const cur = payload.currency || 'SRD';
  const methods = [
    { v: 'contant', l: 'Contant', sub: 'Betaal bij de receptie', icon: Banknote, accent: 'emerald' },
    { v: 'mope', l: 'Mope', sub: 'Scan QR-code', icon: QrCode, accent: 'emerald' },
    { v: 'uni5pay', l: 'Uni5Pay', sub: 'Scan QR-code', icon: Smartphone, accent: 'red' },
  ];
  return (
    <div className="h-full flex flex-col" style={{ padding: '1.5vh 1.5vw 0' }} data-testid="tk-pay-method">
      <div className="flex items-center justify-between flex-wrap gap-2 px-1 sm:px-2 py-2">
        <button onClick={onBack} data-testid="tk-method-back"
          className="flex items-center gap-1.5 text-white font-bold bg-white/20 backdrop-blur-sm rounded-lg px-3 py-1.5 sm:px-4 sm:py-2">
          <ArrowLeft className="w-4 h-4" /> <span className="text-xs sm:text-sm">Terug</span>
        </button>
        <span className="text-sm sm:text-base font-semibold text-white">
          Hoe wilt u betalen? <span className="ml-2 opacity-80">{fmtMoney(payload.amount, cur)}</span>
        </span>
        <div className="text-right text-white">
          <p className="text-xs sm:text-sm font-semibold">{tenant.name}</p>
          {apt && <p className="text-[10px] sm:text-xs opacity-70">Appt. {apt.number}</p>}
        </div>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center pb-6 overflow-auto">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 max-w-4xl w-full px-2">
          {methods.map((m) => {
            const Icon = m.icon;
            return (
              <button key={m.v} onClick={() => onConfirm({ ...payload, method: m.v })}
                data-testid={`tk-method-${m.v}`}
                className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-8 flex sm:flex-col items-center sm:justify-center text-left sm:text-center gap-4 sm:gap-0 hover:scale-[1.02] active:scale-[0.98] transition sm:aspect-[3/4] shadow-2xl">
                <div className={`w-14 h-14 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center mb-0 sm:mb-4 ${
                  m.accent === 'emerald' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
                }`}>
                  <Icon className="w-7 h-7 sm:w-10 sm:h-10" />
                </div>
                <div className="sm:text-center">
                  <p className="text-base sm:text-xl font-extrabold text-slate-900">{m.l}</p>
                  <p className="text-xs sm:text-sm text-slate-500 mt-0.5">{m.sub}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// PAY CONFIRM — overzicht + Bevestig
// =====================================================================
function TenantPayConfirm({ payload, overview, onBack, onPaid }) {
  const { tenant, apartment: apt } = overview;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      await api.post('/tenant-portal/payments', {
        amount: payload.amount,
        currency: payload.currency,
        method: payload.method,
        category: payload.category,
        period_month: payload.period_month || undefined,
        period_year: payload.period_year || undefined,
        note: payload.note || '',
      });
      onPaid();
    } catch (e) {
      setErr(formatError(e, 'Betaling mislukt'));
    } finally { setBusy(false); }
  };

  const methodLabel = {
    contant: 'Contant',
    mope: 'Mope (QR-code)',
    uni5pay: 'Uni5Pay (QR-code)',
  }[payload.method] || payload.method;

  return (
    <div className="h-full flex flex-col px-3 sm:px-6 pt-2 pb-3" data-testid="tk-pay-confirm">
      <div className="flex items-center justify-between flex-wrap gap-2 py-2">
        <button onClick={onBack} data-testid="tk-confirm-back" disabled={busy}
          className="flex items-center gap-1.5 text-white font-bold bg-white/20 backdrop-blur-sm rounded-lg px-3 py-1.5 sm:px-4 sm:py-2 disabled:opacity-50">
          <ArrowLeft className="w-4 h-4" /> <span className="text-xs sm:text-sm">Terug</span>
        </button>
        <span className="text-sm sm:text-base font-semibold text-white">Controleer & bevestig</span>
        <div className="text-right text-white">
          <p className="text-xs sm:text-sm font-semibold">{tenant.name}</p>
          {apt && <p className="text-[10px] sm:text-xs opacity-70">Appt. {apt.number}</p>}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-5 sm:p-7">
          <div className="text-center mb-5">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">Te betalen</p>
            <p className="text-4xl sm:text-5xl font-extrabold text-slate-900 mt-1" data-testid="tk-confirm-amount">
              {fmtMoney(payload.amount, payload.currency)}
            </p>
          </div>
          <div className="space-y-2 mb-5">
            <ConfirmRow label="Categorie" value={payload.note || payload.category} />
            <ConfirmRow label="Methode" value={methodLabel} />
            <ConfirmRow label="Huurder" value={tenant.name} />
            {apt && <ConfirmRow label="Appartement" value={apt.number} />}
            {payload.period_month && (
              <ConfirmRow label="Periode"
                value={`${MONTHS_NL[payload.period_month - 1]} ${payload.period_year}`} />
            )}
          </div>
          {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3" data-testid="tk-confirm-error">{err}</p>}
          <button onClick={submit} disabled={busy} data-testid="tk-confirm-submit"
            className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#FF8A3D] to-[#FF5C00] text-white font-black text-base shadow-lg active:scale-95 transition disabled:opacity-50 flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
            Bevestig betaling
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmRow({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-1.5 last:border-0">
      <span className="text-xs font-black uppercase tracking-widest text-slate-400">{label}</span>
      <span className="text-sm font-bold text-slate-900 text-right truncate ml-3 capitalize">{value}</span>
    </div>
  );
}

// =====================================================================
// HISTORY — alle betalingen van de huurder met PDF-download
// =====================================================================
function TenantHistoryView({ overview, onBack }) {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');
  const apt = overview?.apartment;

  useEffect(() => {
    api.get('/tenant-portal/payments')
      .then((r) => setItems(r.data || [])).catch((e) => setErr(formatError(e)));
  }, []);

  const openPdf = async (paymentId) => {
    // We hebben tenant_token — gebruik blob-fetch zodat de PDF met de
    // juiste Authorization-header wordt opgehaald.
    try {
      const r = await api.get(`/payments/${paymentId}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(r.data);
      window.open(url, '_blank');
      setTimeout(() => window.URL.revokeObjectURL(url), 30_000);
    } catch (e) { setErr(formatError(e, 'PDF download mislukt')); }
  };

  return (
    <div className="h-full flex flex-col px-3 sm:px-6 pt-2 pb-3" data-testid="tk-history">
      <div className="flex items-center justify-between flex-wrap gap-2 py-2">
        <button onClick={onBack} data-testid="tk-history-back"
          className="flex items-center gap-1.5 text-white font-bold bg-white/20 backdrop-blur-sm rounded-lg px-3 py-1.5 sm:px-4 sm:py-2">
          <ArrowLeft className="w-4 h-4" /> <span className="text-xs sm:text-sm">Terug</span>
        </button>
        <span className="text-sm sm:text-base font-semibold text-white">Betalingsgeschiedenis</span>
        <div className="text-right text-white hidden sm:block">
          {apt && <p className="text-[10px] sm:text-xs opacity-70">Appt. {apt.number}</p>}
        </div>
      </div>

      <div className="flex-1 bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col min-h-0">
        <div className="px-4 sm:px-6 py-3 border-b border-slate-100 flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
            <ClockIcon className="w-4 h-4 text-orange-500" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-900">Mijn betalingen</h3>
            <p className="text-xs text-slate-500 truncate">
              {items ? `${items.length} betaling${items.length === 1 ? '' : 'en'}` : 'Laden…'}
            </p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3"
          style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
          {err && <p className="text-red-500 text-sm py-4" data-testid="tk-history-error">{err}</p>}
          {!items && !err && (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="w-7 h-7 animate-spin text-orange-500" />
            </div>
          )}
          {items && items.length === 0 && (
            <div className="py-10 text-center text-slate-400" data-testid="tk-history-empty">
              <Receipt className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p>Nog geen betalingen.</p>
            </div>
          )}
          {items && items.map((p) => (
            <div key={p.id} className="py-3 border-b border-slate-100 last:border-0 flex items-start gap-3"
              data-testid={`tk-history-row-${p.id}`}>
              <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-extrabold text-slate-900">{fmtMoney(p.amount, p.currency)}</p>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-orange-100 text-orange-700">{p.category}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-600">{p.method}</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {new Date(p.paid_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {' · '}{p.receipt_number}
                  {p.period_month ? ` · ${MONTHS_NL[p.period_month - 1]} ${p.period_year}` : ''}
                </p>
                {(p.received_by || p.approved_by) && (
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {p.received_by ? <>Ontvangen door <b className="text-slate-600">{p.received_by}</b></> : null}
                    {p.received_by && p.approved_by && p.received_by !== p.approved_by ? ' · ' : ''}
                    {p.approved_by && p.approved_by !== p.received_by ? <>Goedgekeurd door <b className="text-slate-600">{p.approved_by}</b></> : null}
                  </p>
                )}
              </div>
              <button onClick={() => openPdf(p.id)} data-testid={`tk-history-pdf-${p.id}`}
                className="px-2.5 h-8 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs flex items-center gap-1 shrink-0">
                <Printer className="w-3 h-3" /> Afdruk
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// PAID — succes-scherm
// =====================================================================
function PaidView({ onContinue }) {
  return (
    <div className="h-full w-full flex items-center justify-center px-5 py-10" data-testid="tk-paid">
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 18 }}
        className="bg-white rounded-3xl shadow-2xl p-8 sm:p-10 text-center max-w-md w-full">
        <motion.div
          initial={{ scale: 0 }} animate={{ scale: 1 }}
          transition={{ delay: 0.15, type: 'spring', stiffness: 200 }}
          className="w-24 h-24 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-14 h-14 text-emerald-500" strokeWidth={2.5} />
        </motion.div>
        <h2 className="text-3xl font-black text-slate-900">Betaling gelukt</h2>
        <p className="text-sm text-slate-500 mt-2 max-w-xs mx-auto">
          Bedankt voor uw betaling. De kwitantie wordt automatisch naar uw e-mail gestuurd.
        </p>
        <button onClick={onContinue} data-testid="tk-paid-continue"
          className="mt-6 h-14 px-10 rounded-2xl bg-gradient-to-r from-[#FF8A3D] to-[#FF5C00] text-white font-black text-base shadow-lg active:scale-95 transition">
          Klaar
        </button>
      </motion.div>
    </div>
  );
}

// =====================================================================
// MAINTENANCE — form
// =====================================================================
function MaintenanceView({ onBack, onDone }) {
  const [data, setData] = useState({ title: '', description: '', priority: 'medium' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (!data.title.trim()) { setError('Geef uw probleem een korte titel.'); return; }
    setBusy(true); setError('');
    try { await api.post('/tenant-portal/maintenance', data); onDone(); }
    catch (e) { setError(formatError(e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="min-h-full w-full px-4 sm:px-6 py-5 sm:py-8" data-testid="tk-maintenance">
      <div className="max-w-2xl mx-auto">
        <button onClick={onBack} data-testid="tk-mt-back"
          className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-widest text-white/85 hover:text-white mb-4">
          <ArrowLeft className="w-3.5 h-3.5" /> Terug
        </button>
        <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">Onderhoud melden</h2>
        <p className="text-sm text-white/85 mt-1 mb-5">De beheerder krijgt direct een melding.</p>
        <div className="bg-white rounded-3xl shadow-xl p-5 sm:p-6 space-y-4">
          <div>
            <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">Wat is er aan de hand?</label>
            <input value={data.title} onChange={(e) => setData({ ...data, title: e.target.value })}
              placeholder="bv. Kraan lekt" data-testid="tk-mt-title"
              className="mt-1 w-full h-12 px-4 rounded-xl border-2 border-slate-100 focus:border-[#FF5C00] outline-none text-base" />
          </div>
          <div>
            <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">Details</label>
            <textarea value={data.description} onChange={(e) => setData({ ...data, description: e.target.value })}
              rows={4} placeholder="Beschrijf het probleem…" data-testid="tk-mt-desc"
              className="mt-1 w-full px-4 py-3 rounded-xl border-2 border-slate-100 focus:border-[#FF5C00] outline-none resize-none" />
          </div>
          <div>
            <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">Urgentie</label>
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
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}>
                  {opt.l}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-xs font-bold text-red-600">{error}</p>}
          <button onClick={submit} disabled={busy}
            data-testid="tk-mt-submit"
            className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#FF8A3D] to-[#FF5C00] text-white font-black text-base shadow-md active:scale-95 transition disabled:opacity-50">
            {busy ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Melding versturen'}
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// ME — Mijn gegevens
// =====================================================================
function InfoCard({ label, value, accent }) {
  const cls = accent === 'red' ? 'text-red-600' : accent === 'emerald' ? 'text-emerald-600' : 'text-slate-900';
  return (
    <div className="bg-white rounded-2xl shadow-md p-4 flex items-center justify-between gap-3">
      <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`text-sm font-black ${cls} text-right truncate`}>{value}</p>
    </div>
  );
}
function MeView({ overview, onBack }) {
  if (!overview) return null;
  const { tenant, apartment, balance } = overview;
  return (
    <div className="min-h-full w-full px-4 sm:px-6 py-5 sm:py-8" data-testid="tk-me">
      <div className="max-w-2xl mx-auto">
        <button onClick={onBack} data-testid="tk-me-back"
          className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-widest text-white/85 hover:text-white mb-4">
          <ArrowLeft className="w-3.5 h-3.5" /> Terug
        </button>
        <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">Mijn gegevens</h2>
        <p className="text-sm text-white/85 mt-1 mb-5">Uw contract & contactinfo.</p>
        <div className="space-y-2.5">
          <InfoCard label="Naam" value={tenant?.name || '—'} />
          <InfoCard label="E-mail" value={tenant?.email || '—'} />
          <InfoCard label="Telefoon" value={tenant?.phone || '—'} />
          <InfoCard label="Appartement"
            value={apartment ? `${apartment.number}${apartment.address ? ' · ' + apartment.address : ''}` : '—'} />
          <InfoCard label="Maandhuur"
            value={apartment ? fmtMoney(apartment.rent_amount, apartment.currency) : '—'} />
          <InfoCard label="Saldo"
            value={fmtMoney(balance?.balance || 0, balance?.currency || 'SRD')}
            accent={(balance?.balance || 0) > 0 ? 'red' : 'emerald'} />
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// CONTACT
// =====================================================================
function ContactView({ overview, branding, onBack }) {
  const phone = overview?.company?.phone || branding?.phone || '';
  const email = overview?.company?.email || branding?.email || '';
  return (
    <div className="min-h-full w-full px-4 sm:px-6 py-5 sm:py-8" data-testid="tk-contact">
      <div className="max-w-2xl mx-auto">
        <button onClick={onBack} data-testid="tk-contact-back"
          className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-widest text-white/85 hover:text-white mb-4">
          <ArrowLeft className="w-3.5 h-3.5" /> Terug
        </button>
        <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">Contact</h2>
        <p className="text-sm text-white/85 mt-1 mb-5">Direct in contact met uw beheerder.</p>
        <div className="space-y-2.5">
          {phone ? (
            <>
              <a href={`tel:${phone}`} data-testid="tk-call"
                className="block bg-white rounded-2xl shadow-lg active:shadow-md p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><Phone className="w-6 h-6" /></div>
                <div><p className="text-base font-black text-slate-900">Bel beheerder</p><p className="text-xs text-slate-500">{phone}</p></div>
              </a>
              <a href={`https://wa.me/${phone.replace(/[^\d]/g, '')}`} target="_blank" rel="noopener noreferrer"
                data-testid="tk-whatsapp"
                className="block bg-white rounded-2xl shadow-lg active:shadow-md p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><Phone className="w-6 h-6" /></div>
                <div><p className="text-base font-black text-slate-900">WhatsApp beheerder</p><p className="text-xs text-slate-500">Open chat</p></div>
              </a>
            </>
          ) : null}
          {email && (
            <a href={`mailto:${email}`} data-testid="tk-mail"
              className="block bg-white rounded-2xl shadow-lg active:shadow-md p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center"><Mail className="w-6 h-6" /></div>
              <div><p className="text-base font-black text-slate-900">E-mail beheerder</p><p className="text-xs text-slate-500">{email}</p></div>
            </a>
          )}
          {!phone && !email && (
            <div className="bg-white rounded-2xl p-6 text-center shadow-lg">
              <p className="text-sm font-black text-slate-900">Geen contactgegevens beschikbaar.</p>
              <p className="text-xs text-slate-500 mt-1">Vraag uw beheerder om deze in te stellen.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// COMPANY PICKER — fallback wanneer geen branding gedetecteerd is
// =====================================================================
function CompanyPicker({ onPicked }) {
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e?.preventDefault?.();
    const s = slug.trim().toLowerCase();
    if (!s) { setError('Vul een bedrijfscode in.'); return; }
    setBusy(true); setError('');
    try {
      const data = await fetchBranding(s);
      if (!data) {
        setError('Onbekende bedrijfscode — controleer de spelling.');
        return;
      }
      applyBranding(data);
      onPicked(data);
    } finally { setBusy(false); }
  };
  return (
    <div className="min-h-full w-full flex flex-col items-center justify-center px-5 py-10"
      data-testid="tk-company-picker">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 sm:p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-orange-50 mx-auto flex items-center justify-center mb-4">
          <Building2 className="w-8 h-8 text-[#FF5C00]" />
        </div>
        <h2 className="text-2xl font-black text-slate-900">Welk bedrijf?</h2>
        <p className="text-sm text-slate-500 mt-2 mb-5">
          Voer de bedrijfscode in (bv. <code className="bg-slate-100 px-1 rounded">surirent</code>) of
          scan de QR-sticker bij uw voordeur.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <input value={slug} onChange={(e) => setSlug(e.target.value)} autoFocus
            placeholder="bedrijfscode" data-testid="tk-slug-input"
            className="w-full h-14 px-4 rounded-2xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none text-center text-lg font-bold tracking-wider" />
          {error && <p className="text-sm font-bold text-red-600">{error}</p>}
          <button type="submit" disabled={busy} data-testid="tk-slug-submit"
            className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#FF8A3D] to-[#FF5C00] text-white font-black text-base shadow-lg active:scale-95 transition disabled:opacity-50">
            {busy ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Doorgaan'}
          </button>
        </form>
      </div>
    </div>
  );
}

// =====================================================================
// CONTAINER
// =====================================================================
export default function TenantKioskLayout() {
  const navigate = useBrandedNavigate();
  const [searchParams] = useSearchParams();
  const aptId = searchParams.get('apt');
  const [authed, setAuthed] = useState(() => !!localStorage.getItem(TENANT_TOKEN_KEY));
  const [view, setView] = useState('dashboard');
  const [payload, setPayload] = useState(null);  // payment-flow draft
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [prefill, setPrefill] = useState(null);
  const [branding, setBranding] = useState(() => readCachedBranding());
  const idleTimer = useRef(null);

  // 1) Branding laden — primary color toepassen voor de hele kiosk-achtergrond
  const [needsCompanyPick, setNeedsCompanyPick] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      const slug = detectCompanySlug();
      let data = slug ? await fetchBranding(slug) : null;
      if (!data) data = await fetchBrandingByHost();
      // Single-tenant fallback: als er maar één bedrijf is, gebruik dat automatisch.
      if (!data) {
        try {
          const { data: def } = await api.get('/public/branding-default');
          if (def) data = def;
        } catch { /* geen single-tenant — ga door naar picker */ }
      }
      if (!alive) return;
      if (data) {
        applyBranding(data);
        setBranding(data);
        setNeedsCompanyPick(false);
      } else if (!aptId) {
        // Geen context én geen QR — toon picker.
        setNeedsCompanyPick(true);
      }
    })();
    return () => { alive = false; };
  }, [aptId]);

  // 2) QR-mode prefill via ?apt=
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
        });
      } catch {
        if (alive) setPrefill(null);
      }
    })();
    return () => { alive = false; };
  }, [aptId, authed]);

  // 3) Overview laden na login
  const loadOverview = useCallback(async () => {
    if (!authed) return;
    setLoading(true);
    try {
      const { data } = await api.get('/tenant-portal/overview');
      setOverview(data);
    } catch {
      localStorage.removeItem(TENANT_TOKEN_KEY);
      setAuthed(false);
    } finally { setLoading(false); }
  }, [authed]);
  useEffect(() => { if (authed) loadOverview(); }, [authed, loadOverview]);

  // 4) Auto-logout na 90s inactiviteit
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
    const ev = ['mousedown', 'touchstart', 'keydown'];
    ev.forEach((e) => window.addEventListener(e, resetIdle));
    return () => {
      ev.forEach((e) => window.removeEventListener(e, resetIdle));
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [authed, resetIdle]);

  const logout = () => {
    api.post('/tenant-portal/logout').catch(() => {});
    localStorage.removeItem(TENANT_TOKEN_KEY);
    setAuthed(false);
    setView('dashboard');
  };

  // Branded background — gebruik primary color als orange-fallback.
  const primary = branding?.primary_color || '#FF5C00';
  // Voor de PIN-login en company-picker laten we scrollen toe (de keypad
  // kan op kleine viewports langer zijn dan het scherm). Voor de authed
  // kiosk-views willen we exact het volle viewport gebruiken zonder dat
  // er onderaan oranje leegte overblijft — daarom `overflow: hidden`.
  const wrapper = {
    position: 'fixed', inset: 0,
    background: `linear-gradient(155deg, ${primary} 0%, ${primary} 55%, rgba(0,0,0,0.18) 100%), ${primary}`,
    overflowY: 'auto', WebkitOverflowScrolling: 'touch',
    paddingTop: 'env(safe-area-inset-top, 0px)',
    paddingLeft: 'env(safe-area-inset-left, 0px)',
    paddingRight: 'env(safe-area-inset-right, 0px)',
  };
  const wrapperLocked = { ...wrapper, overflowY: 'hidden' };

  useEffect(() => {
    // document.title wordt centraal beheerd door usePwaManifest()
    document.documentElement.style.backgroundColor = primary;
    document.body.style.backgroundColor = primary;
    return () => {
      document.documentElement.style.backgroundColor = '';
      document.body.style.backgroundColor = '';
    };
  }, [primary]);

  const FOOTER_H = 64;
  const Footer = ({ withLogout = true }) => (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.25)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      data-testid="tk-footer">
      <div className="flex items-center justify-between px-4 sm:px-6 h-16">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-white"
            style={{ backgroundColor: primary }}>
            <Building2 className="w-5 h-5" />
          </div>
          <span className="text-sm font-black text-slate-800 truncate" data-testid="tk-footer-company">
            {branding?.app_name || branding?.name || 'Huurder Kiosk'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {authed && overview?.tenant?.name && (
            <span className="hidden sm:inline text-sm font-bold text-slate-500 truncate max-w-[180px]">
              {overview.tenant.name}
            </span>
          )}
          {withLogout && (
            <button onClick={authed ? logout : () => navigate('/')}
              data-testid="tk-logout"
              className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-black rounded-lg px-4 py-2 text-sm inline-flex items-center gap-1.5">
              <LogOut className="w-4 h-4" /> Uit
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // --- Not authed: show PIN-only login (or company picker if no context) ---
  if (!authed) {
    return (
      <div style={wrapper} className="flex flex-col">
        <div className="flex-1" style={{ paddingBottom: FOOTER_H + 16 }}>
          <AnimatePresence mode="wait">
            <motion.div key={needsCompanyPick ? 'picker' : 'login'} variants={slideVariants}
              initial="enter" animate="center" exit="exit"
              transition={{ duration: 0.25 }}
              className="min-h-full w-full">
              {needsCompanyPick && !prefill?.email ? (
                <CompanyPicker onPicked={(data) => { setBranding(data); setNeedsCompanyPick(false); }} />
              ) : (
                <LoginView branding={branding} prefill={prefill}
                  onLoggedIn={() => setAuthed(true)} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        <Footer />
      </div>
    );
  }

  // --- Loading overview ---
  if (loading || !overview) {
    return (
      <div style={wrapper} className="flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-white" />
      </div>
    );
  }

  // --- Authed views ---
  return (
    <div style={wrapperLocked} className="flex flex-col">
      <div className="flex-1 min-h-0 flex flex-col" style={{ paddingBottom: FOOTER_H + 16 }}>
        <AnimatePresence mode="wait">
          <motion.div key={view} variants={slideVariants}
            initial="enter" animate="center" exit="exit"
            transition={{ duration: 0.25 }}
            className="h-full w-full flex flex-col">
            {view === 'dashboard' && (
              <DashboardView overview={overview}
                onAction={setView}
                onHistory={() => setView('history')} />
            )}
            {view === 'pay' && (
              <TenantPaySelect overview={overview}
                onBack={() => setView('dashboard')}
                onConfirm={(p) => { setPayload(p); setView('pay-method'); }} />
            )}
            {view === 'pay-method' && payload && (
              <TenantPayMethod payload={payload} overview={overview}
                onBack={() => setView('pay')}
                onConfirm={(p) => { setPayload(p); setView('pay-confirm'); }} />
            )}
            {view === 'pay-confirm' && payload && (
              <TenantPayConfirm payload={payload} overview={overview}
                onBack={() => setView('pay-method')}
                onPaid={() => { setView('paid'); setPayload(null); loadOverview(); }} />
            )}
            {view === 'paid' && <PaidView onContinue={() => setView('dashboard')} />}
            {view === 'history' && (
              <TenantHistoryView overview={overview} onBack={() => setView('dashboard')} />
            )}
            {view === 'maintenance' && (
              <MaintenanceView onBack={() => setView('dashboard')}
                onDone={() => setView('dashboard')} />
            )}
            {view === 'me' && <MeView overview={overview} onBack={() => setView('dashboard')} />}
            {view === 'contact' && (
              <ContactView overview={overview} branding={branding}
                onBack={() => setView('dashboard')} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <Footer />
    </div>
  );
}
