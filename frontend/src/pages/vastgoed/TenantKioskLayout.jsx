import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBrandedNavigate } from '../../lib/branded-nav';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Lock, Loader2, LogOut, CreditCard, Wrench, User, Phone,
  CheckCircle2, ChevronRight, Calendar, ArrowLeft, Building2, Delete,
  Home as HomeIcon, Mail, Wallet, FileText, Wifi,
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
        onLoggedIn();
      } catch (e) {
        if (!cancelled) {
          setError(formatError(e) || 'Onjuiste PIN');
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
      </motion.div>
    </div>
  );
}

// =====================================================================
// DASHBOARD — split-screen overzicht (admin-kiosk stijl)
// =====================================================================
function DashboardView({ overview, onAction }) {
  const tenant = overview?.tenant;
  const apartment = overview?.apartment;
  const balance = overview?.balance || {};
  const internet = Number(tenant?.internet_amount || 0);
  const openRent = (balance.balance || 0) > 0 ? balance.balance : 0;
  const totalDue = openRent + internet;
  const cur = balance.currency || apartment?.currency || 'SRD';
  const hasBalance = totalDue > 0;
  const items = [
    { key: 'rent', label: 'Maandhuur', value: apartment?.rent_amount || 0, icon: HomeIcon, muted: false },
    ...(openRent > 0 ? [{
      key: 'open', label: 'Openstaande huur', value: openRent, icon: Wallet, highlight: true,
      sub: balance.next_period ? `${MONTHS_NL[balance.next_period.month - 1]} ${balance.next_period.year}` : '',
    }] : []),
    { key: 'svc', label: 'Servicekosten', value: 0, icon: FileText, muted: true },
    { key: 'fines', label: 'Boetes', value: 0, icon: FileText, muted: true },
    { key: 'internet', label: 'Internet', value: internet, icon: Wifi, muted: internet === 0 },
  ];

  return (
    <div className="min-h-full w-full flex flex-col" data-testid="tk-dashboard"
      style={{ padding: '1.5vh 1.5vw 0' }}>
      <div className="flex items-center justify-between flex-wrap gap-2 px-1 sm:px-2 py-2">
        <div className="text-white">
          <p className="text-xs sm:text-sm font-bold">{tenant?.name}</p>
          {apartment && <p className="text-[10px] sm:text-xs opacity-75">Appt. {apartment.number}{apartment.address ? ' · ' + apartment.address : ''}</p>}
        </div>
        <p className="text-xs sm:text-sm font-semibold text-white/90 hidden sm:block">Welkom — kies een actie</p>
      </div>

      <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-2 sm:gap-3 pb-3">
        {/* LEFT — financial overview */}
        <div className="bg-white rounded-2xl flex-1 md:flex-[3] flex flex-col p-4 sm:p-5 min-w-0 shadow-xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base sm:text-lg font-black text-slate-900">Financieel overzicht</h3>
          </div>
          <div className="flex-1 divide-y divide-slate-100">
            {items.map((it) => {
              const Icon = it.icon;
              const cls = it.highlight ? 'text-[#FF5C00]' : it.muted ? 'text-slate-400' : 'text-slate-900';
              return (
                <div key={it.key} className={`flex items-center justify-between py-2.5 px-1 ${cls}`}
                  data-testid={`tk-fin-${it.key}`}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      it.highlight ? 'bg-orange-100 text-[#FF5C00]'
                        : it.muted ? 'bg-slate-50 text-slate-300'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm ${it.highlight ? 'font-black' : 'font-bold'}`}>{it.label}</p>
                      {it.sub && <p className="text-[10px] mt-0.5 text-slate-500">{it.sub}</p>}
                    </div>
                  </div>
                  <p className={`text-sm sm:text-base ${it.highlight ? 'font-black' : 'font-bold'}`}>{fmtMoney(it.value, cur)}</p>
                </div>
              );
            })}
          </div>
          <div className="border-t-2 border-slate-200 mt-2 pt-3 flex items-center justify-between">
            <p className="font-black text-slate-900 text-sm sm:text-base">Totaal openstaand</p>
            <p className={`text-xl sm:text-2xl font-black tracking-tight ${hasBalance ? 'text-[#FF5C00]' : 'text-emerald-600'}`}
              data-testid="tk-total-due">
              {fmtMoney(totalDue, cur)}
            </p>
          </div>
        </div>

        {/* RIGHT — primary CTA + secondary actions */}
        <div className="md:flex-[2] flex flex-col gap-2 sm:gap-3 min-w-0">
          <div className={`rounded-2xl flex-1 flex flex-col items-center justify-center text-center p-5 sm:p-7 shadow-xl ${
            hasBalance ? 'bg-white' : 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white'
          }`}>
            <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center mb-3 ${
              hasBalance ? 'bg-orange-100 text-[#FF5C00]' : 'bg-white/20 text-white'
            }`}>
              {hasBalance ? <Wallet className="w-7 h-7 sm:w-9 sm:h-9" /> : <CheckCircle2 className="w-9 h-9" />}
            </div>
            <p className={`text-[10px] sm:text-xs font-black uppercase tracking-[0.25em] ${
              hasBalance ? 'text-slate-400' : 'text-white/90'
            }`}>
              {hasBalance ? 'Te betalen' : 'Saldo'}
            </p>
            <p className={`text-3xl sm:text-4xl font-black tracking-tight mt-1 mb-1 ${
              hasBalance ? 'text-slate-900' : 'text-white'
            }`} data-testid="tk-balance">
              {fmtMoney(totalDue, cur)}
            </p>
            <p className={`text-xs sm:text-sm mb-5 ${hasBalance ? 'text-slate-500' : 'text-white/90'}`}>
              {hasBalance ? 'U heeft een openstaand bedrag.' : 'U bent volledig bij. Bedankt!'}
            </p>
            <button onClick={() => onAction('pay')} data-testid="tk-tile-pay"
              className={`w-full max-w-xs h-12 sm:h-14 rounded-xl font-black text-base sm:text-lg flex items-center justify-center gap-2 transition active:scale-[0.98] ${
                hasBalance
                  ? 'bg-gradient-to-r from-[#FF8A3D] to-[#FF5C00] text-white shadow-lg'
                  : 'bg-white text-emerald-600 shadow-md'
              }`}>
              {hasBalance ? 'Betalen' : 'Bekijk facturen'} <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Secondary action tiles — compact row */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <SecondaryTile icon={Wrench} label="Onderhoud" testId="tk-tile-maintenance"
              accent="bg-sky-50 text-sky-600" onClick={() => onAction('maintenance')} />
            <SecondaryTile icon={User} label="Gegevens" testId="tk-tile-me"
              accent="bg-emerald-50 text-emerald-600" onClick={() => onAction('me')} />
            <SecondaryTile icon={Phone} label="Contact" testId="tk-tile-contact"
              accent="bg-violet-50 text-violet-600" onClick={() => onAction('contact')} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SecondaryTile({ icon: Icon, label, accent, onClick, testId }) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }} whileHover={{ y: -2 }}
      onClick={onClick} data-testid={testId}
      className="bg-white rounded-2xl p-3 sm:p-4 shadow-md flex flex-col items-center gap-2 active:shadow-sm transition">
      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl ${accent} flex items-center justify-center`}>
        <Icon className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={2.4} />
      </div>
      <span className="text-xs sm:text-sm font-black text-slate-900 text-center leading-tight">{label}</span>
    </motion.button>
  );
}

// =====================================================================
// PAY view — kies factuur
// =====================================================================
function PayView({ onBack, onPaid }) {
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
      } catch (e) { if (alive) setError(formatError(e)); }
      finally { if (alive) setBusy(false); }
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

  return (
    <div className="min-h-full w-full px-4 sm:px-6 py-5 sm:py-8" data-testid="tk-pay">
      <div className="max-w-3xl mx-auto">
        <button onClick={onBack} data-testid="tk-pay-back"
          className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-widest text-white/85 hover:text-white mb-4">
          <ArrowLeft className="w-3.5 h-3.5" /> Terug
        </button>
        <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">Betalen</h2>
        <p className="text-sm text-white/85 mt-1 mb-5">Kies welke factuur u wilt betalen.</p>

        {busy && <Loader2 className="w-8 h-8 animate-spin text-white mx-auto my-10" />}
        {error && (
          <div className="bg-red-500/20 border border-red-300/40 text-white rounded-2xl px-4 py-3 text-sm font-bold mb-3">
            {error}
          </div>
        )}
        {!busy && invoices.length === 0 && (
          <div className="bg-white rounded-3xl p-8 text-center shadow-xl">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <p className="text-lg font-black text-slate-900">Geen openstaande facturen.</p>
            <p className="text-sm text-slate-500 mt-1">U bent volledig bij — bedankt!</p>
          </div>
        )}
        <div className="space-y-2.5">
          {invoices.map((inv) => (
            <motion.button
              key={inv.id} onClick={() => pay(inv)} disabled={submitting === inv.id}
              whileTap={{ scale: 0.99 }}
              data-testid={`tk-pay-${inv.id}`}
              className="w-full text-left bg-white rounded-2xl shadow-lg active:shadow-md p-4 flex items-center gap-4 disabled:opacity-50">
              <div className="w-12 h-12 rounded-xl bg-orange-50 text-[#FF5C00] flex items-center justify-center shrink-0">
                <Calendar className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-slate-900 capitalize">
                  {MONTHS_NL[inv.period_month - 1]} {inv.period_year}
                </p>
                <p className="text-[11px] text-slate-500">{inv.invoice_number || 'Huur'}</p>
              </div>
              <p className="text-lg sm:text-xl font-black text-slate-900 whitespace-nowrap">
                {fmtMoney(inv.amount, inv.currency)}
              </p>
              {submitting === inv.id
                ? <Loader2 className="w-5 h-5 animate-spin text-[#FF5C00]" />
                : <ChevronRight className="w-5 h-5 text-slate-300" />}
            </motion.button>
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
    <div className="min-h-full w-full flex items-center justify-center px-5 py-10" data-testid="tk-paid">
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
  const wrapper = {
    position: 'fixed', inset: 0,
    background: `linear-gradient(155deg, ${primary} 0%, ${primary} 55%, rgba(0,0,0,0.18) 100%), ${primary}`,
    overflowY: 'auto', WebkitOverflowScrolling: 'touch',
    paddingTop: 'env(safe-area-inset-top, 0px)',
    paddingLeft: 'env(safe-area-inset-left, 0px)',
    paddingRight: 'env(safe-area-inset-right, 0px)',
  };

  useEffect(() => {
    document.title = 'Huurder Kiosk';
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
    <div style={wrapper} className="flex flex-col">
      <div className="flex-1" style={{ paddingBottom: FOOTER_H + 16 }}>
        <AnimatePresence mode="wait">
          <motion.div key={view} variants={slideVariants}
            initial="enter" animate="center" exit="exit"
            transition={{ duration: 0.25 }}
            className="min-h-full w-full">
            {view === 'dashboard' && <DashboardView overview={overview} onAction={setView} />}
            {view === 'pay' && (
              <PayView onBack={() => setView('dashboard')}
                onPaid={() => { setView('paid'); loadOverview(); }} />
            )}
            {view === 'paid' && <PaidView onContinue={() => setView('dashboard')} />}
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
