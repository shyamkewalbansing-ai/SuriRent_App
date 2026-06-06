import { useState, useEffect, useMemo } from 'react';
import {
  Loader2, KeyRound, ArrowLeft, ArrowRight, Eye, EyeOff, LogIn, Check,
  Globe, QrCode, Sparkles, Star, ShieldCheck, Zap, ChevronDown,
} from 'lucide-react';
import { api, formatError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { setPreferredRole } from '../../../lib/pwaRole';
import { useBrandedNavigate, RESERVED_SLUGS } from '../../../lib/branded-nav';
import { useIsMobile } from '../../../lib/use-is-mobile';
import { MobileEmailLogin } from '../../../components/MobileAuthShell';
import ForgotPasswordModal from './ForgotPasswordModal';
import RegisterSuccess from './RegisterSuccess';
import QrLoginTab from './QrLoginTab';
import Header from './LoginHeader';

function PasswordView({ initialMode = 'login', onBack, onRegistered, branding }) {
  const navigate = useBrandedNavigate();
  const { login, register } = useAuth();
  const isMobile = useIsMobile();
  const [mode, setMode] = useState(initialMode); // 'login' | 'register'
  const [email, setEmail] = useState(() => {
    try { return localStorage.getItem('saved_login_email') || ''; } catch { return ''; }
  });
  const [password, setPassword] = useState(() => {
    try { return localStorage.getItem('saved_login_password') || ''; } catch { return ''; }
  });
  const [remember, setRemember] = useState(() => {
    try { return localStorage.getItem('saved_login_email') !== null; } catch { return false; }
  });
  const [showForgot, setShowForgot] = useState(false);
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [telefoon, setTelefoon] = useState('');
  const [address, setAddress] = useState('');
  const [plan, setPlan] = useState('starter');
  const [kioskPin, setKioskPin] = useState('');
  // Country selection: '' (auto), 'SR', 'NL', 'OTHER'.
  // Initialized from localStorage.preferred_currency (set by landing page toggle).
  const [country, setCountry] = useState(() => {
    try {
      const pref = (localStorage.getItem('preferred_currency') || '').toUpperCase();
      if (pref === 'EUR') return 'NL';
      if (pref === 'SRD') return 'SR';
    } catch { /* localStorage unavailable */ }
    return '';
  });
  const [plans, setPlans] = useState([]);
  const [bankDetails, setBankDetails] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [registeredSlug, setRegisteredSlug] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // QR vs password login method (alleen relevant in mode === 'login').
  const [loginMethod, setLoginMethod] = useState('password');

  // Build the query that drives the plan-currency on the registration form.
  // Explicit country wins; otherwise the phone is used for auto-detect.
  const planQuery = (() => {
    if (country === 'NL') return '?currency=EUR';
    if (country === 'SR') return '?currency=SRD';
    return telefoon ? `?phone=${encodeURIComponent(telefoon)}` : '';
  })();

  useEffect(() => {
    if (mode !== 'register') return;
    api.get(`/billing/plans${planQuery}`).then((r) => setPlans(r.data)).catch(() => setPlans([]));
    api.get('/billing/bank-details').then((r) => setBankDetails(r.data)).catch(() => setBankDetails(null));
  }, [mode, planQuery]);

  // Live preview van de portal-URL die deze klant na registratie krijgt.
  // Gebruikt dezelfde slug-regels als de backend (`_slugify` + reserved suffix).
  const portalPreview = useMemo(() => {
    const raw = (companyName || '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || '';
    if (!raw) return { slug: '', host: '' };
    const slug = RESERVED_SLUGS.has(raw) ? `${raw}-bedrijf` : raw;
    let host = '';
    try { host = (window.location.host || '').replace(/:.*$/, ''); } catch { /* ignore */ }
    return { slug, host };
  }, [companyName]);

  // Debounced availability-check tegen `/api/public/companies/{slug}/available`.
  // 350ms na de laatste keystroke. State:
  //   - 'idle'      → geen check
  //   - 'checking'  → request loopt
  //   - 'available' → slug is vrij
  //   - 'taken'     → slug al in gebruik
  //   - 'reserved'  → gereserveerde platform-slug (krijgt sowieso `-bedrijf` suffix)
  //   - 'format'    → ongeldig formaat (zou niet moeten — wij hebben hem geslugified)
  const [slugStatus, setSlugStatus] = useState('idle');
  useEffect(() => {
    if (mode !== 'register') return undefined;
    const s = portalPreview.slug;
    if (!s) { setSlugStatus('idle'); return undefined; }
    setSlugStatus('checking');
    const handle = setTimeout(async () => {
      try {
        const { data } = await api.get(`/public/companies/${encodeURIComponent(s)}/available`);
        if (data?.available) setSlugStatus('available');
        else setSlugStatus(data?.reason || 'taken');
      } catch {
        setSlugStatus('idle');  // backend onbereikbaar — silence, niet blokkeren
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [portalPreview.slug, mode]);

  const submit = async (e) => {
    e?.preventDefault();
    if (mode === 'register' && !companyName.trim()) {
      setError('Vul de bedrijfsnaam in.');
      return;
    }
    if (mode === 'register' && kioskPin && !/^\d{4}$/.test(kioskPin)) {
      setError('Kiosk PIN moet uit precies 4 cijfers bestaan.');
      return;
    }
    setLoading(true); setError('');
    try {
      if (mode === 'login') {
        const loginResult = await login(email, password);
        // "Onthoud mij": sla email + wachtwoord lokaal op (alleen op apparaten
        // waar de gebruiker zelf toegang toe heeft — niet ideaal voor gedeelde
        // kiosks, daarom uitvink-baar).
        try {
          if (remember) {
            localStorage.setItem('saved_login_email', email);
            localStorage.setItem('saved_login_password', password);
          } else {
            localStorage.removeItem('saved_login_email');
            localStorage.removeItem('saved_login_password');
          }
        } catch { /* noop */ }
        setPreferredRole('admin');
        // Onthoud op dit device welke gebruiker hier het laatst inlogde. Zo
        // kunnen we bij volgende launch "Welkom [naam]" tonen en eventueel
        // de persoonlijke PIN-flow activeren (mobile-only, en alleen wanneer
        // de gebruiker een PIN heeft ingesteld).
        try {
          localStorage.setItem('device_user_email', email.trim());
          localStorage.setItem('device_user_name', name?.trim() || email.split('@')[0]);
        } catch { /* ignore */ }
        // Pending QR? Vorige sessie heeft ons hier naartoe gestuurd via /qr-link.
        // Claim de QR direct nu we ingelogd zijn.
        // BELANGRIJK: NIET sessionStorage hier removen — de parent useEffect
        // controleert ook op pending_qr_token om de auto-redirect naar /admin
        // te onderdrukken (race-conditie). QrLinkPage zelf removed het na claim.
        let pendingQr = null;
        try { pendingQr = sessionStorage.getItem('pending_qr_token'); } catch { /* ignore */ }
        if (pendingQr) {
          navigate(`/qr-link?token=${encodeURIComponent(pendingQr)}`);
        } else {
          // Bepaal het juiste admin-pad. Wanneer we op de generieke /login
          // (zonder slug) zitten en de gebruiker hoort bij een specifiek
          // bedrijf, sturen we hem naar `/<slug>/admin` zodat de branded
          // omgeving + storage-context geactiveerd wordt. KRITIEK voor PWA
          // gebruikers die zonder slug-context openen.
          const userSlug = loginResult?.company?.slug || loginResult?.user?.company_slug;
          const onPlainLogin = /^\/login(\/|$)/i.test(window.location.pathname);
          if (userSlug && onPlainLogin) {
            // Hard-navigate naar branded admin zodat BrandedShell mount +
            // branding kleuren + stored_slug worden geactiveerd in PWA storage.
            window.location.assign(`/${userSlug}/admin`);
          } else {
            navigate('/admin');
          }
        }
      } else {
        const result = await register({
          name: name.trim(),
          email: email.trim(),
          password,
          company_name: companyName.trim(),
          telefoon: telefoon.trim(),
          address: address.trim(),
          plan,
          kiosk_pin: kioskPin.trim() || null,
          ...(country ? { country } : {}),
        });
        setPreferredRole('admin');
        // Sla de slug op zodat de "doorgaan" knop direct naar het branded
        // portaal (`/<slug>/admin`) navigeert i.p.v. de generieke `/admin`.
        // Hierdoor leert de nieuwe admin meteen zijn eigen URL kennen.
        const newSlug = result?.company?.slug || '';
        if (newSlug) setRegisteredSlug(newSlug);
        if (onRegistered) onRegistered();
        setShowSuccess(true);
      }
    } catch (err) {
      setError(formatError(err, mode === 'login' ? 'Inloggen mislukt' : 'Registratie mislukt'));
    } finally { setLoading(false); }
  };

  if (showSuccess) {
    const selectedPlan = plans.find((p) => p.id === plan) || { name: plan, amount: 0, currency: 'SRD' };
    // Bij registratie altijd doorsturen naar het eigen branded portaal —
    // dit is "hun" omgeving. Gebruikt hard-navigate zodat BrandedShell
    // de branding/kleuren netjes opnieuw bootstrapt vóór /admin laadt.
    const goToOwnPortal = () => {
      if (registeredSlug) {
        window.location.assign(`/${registeredSlug}/admin`);
      } else {
        navigate('/admin');
      }
    };
    return <RegisterSuccess plan={selectedPlan} company={companyName} bankDetails={bankDetails}
      onContinue={goToOwnPortal} />;
  }

  // ────────────────────────────────────────────────────────────────────
  // MOBILE LOGIN — toon de "app-stijl" oranje full-screen e-mail/wachtwoord
  // login op telefoon + PWA. Dit voelt identiek aan de PIN-pad ervaring
  // (zelfde oranje canvas, logo-cirkel, welkom-header, witte input pillen).
  // Op desktop blijft het bestaande witte card-design behouden.
  // ────────────────────────────────────────────────────────────────────
  if (mode === 'login' && isMobile) {
    return (
      <>
        <MobileEmailLogin
          onBack={() => { try { onBack?.(); } catch { /* ignore */ } }}
          onForgot={() => setShowForgot(true)}
          branding={branding}
        />
        {showForgot && (
          <ForgotPasswordModal initialEmail={email} onClose={() => setShowForgot(false)} />
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col" style={{
      position: 'fixed', inset: 0,
      backgroundColor: branding?.primary_color || '#FF5C00',
      overflowY: 'auto', WebkitOverflowScrolling: 'touch',
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      paddingLeft: 'env(safe-area-inset-left, 0px)',
      paddingRight: 'env(safe-area-inset-right, 0px)',
    }}>
      <Header branding={branding} />
      <div className="flex-1 flex items-start sm:items-center justify-center p-3 sm:p-6">
        {/* REGISTER op desktop: 2-panel split (form links + voordelen rechts).
            LOGIN behoudt het bestaande compacte card design. */}
        {mode === 'register' ? (
      <div className="min-h-screen lg:grid lg:grid-cols-2" data-testid="auth-form">
        {/* LEFT: branded panel — vol oranje, marketing + stats */}
        <aside className="relative px-8 py-12 sm:px-12 sm:py-16 lg:p-16 xl:p-20 text-white overflow-hidden lg:min-h-screen flex flex-col"
          style={{ background: 'linear-gradient(160deg, #FF5C00 0%, #C74600 100%)' }}>
          <div className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full opacity-15 blur-3xl bg-white pointer-events-none" />
          <div className="absolute bottom-[-20%] left-[-20%] w-[500px] h-[500px] rounded-full opacity-10 blur-3xl bg-[#FFE0C2] pointer-events-none" />

          {/* Logo / merk */}
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-12 lg:mb-16">
              <span className="w-12 h-12 rounded-2xl bg-white p-2 shadow-lg">
                <img src="/kiosk-icons/mark-orange.png" alt="SuriRent" className="w-full h-full object-contain"
                  onError={(e) => { e.currentTarget.src = '/kiosk-icons/mark-white.png'; e.currentTarget.style.filter = 'brightness(0) invert(0.2)'; }} />
              </span>
              <span className="text-3xl lg:text-4xl font-black tracking-tight">SURIRENT</span>
            </div>

            <h2 className="font-black tracking-tight leading-[1.05]"
              style={{ fontSize: 'clamp(2.25rem, 4.5vw, 4rem)' }}>
              Start vandaag met <br />
              <span className="text-[#FFE0C2]">SuriRent N.V.</span>
            </h2>
            <p className="mt-6 text-base lg:text-lg text-white/85 leading-relaxed max-w-md">
              Maak gratis een account aan en ontdek het complete vastgoedplatform voor Suriname.
            </p>
          </div>

          {/* Glassy "14 Dagen Gratis" card */}
          <div className="relative z-10 mt-10 lg:mt-12">
            <div className="rounded-2xl border border-white/20 backdrop-blur-sm bg-white/[0.07] p-6">
              <div className="flex items-start gap-4 mb-5">
                <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center shrink-0">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-xl font-black">14 Dagen Gratis!</p>
                  <p className="text-sm text-white/75 mt-0.5">Geen creditcard nodig</p>
                </div>
              </div>
              <ul className="space-y-3 text-sm">
                {[
                  'Toegang tot alle modules',
                  'Onbeperkte gebruikers',
                  'Volledige functionaliteit',
                ].map((feat) => (
                  <li key={feat} className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                      <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                    </span>
                    <span className="font-semibold">{feat}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Trust signals */}
            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <span className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4 text-white" />
                </span>
                <span className="font-semibold text-white/90">SSL-encryptie &amp; privacy gegarandeerd</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                  <Zap className="w-4 h-4 text-white" />
                </span>
                <span className="font-semibold text-white/90">Snel en modern platform</span>
              </div>
            </div>
          </div>

          <div className="flex-1" />

          {/* Bottom stats */}
          <div className="relative z-10 mt-10 lg:mt-12 grid grid-cols-3 gap-4 lg:gap-8">
            {[
              { value: '500+',  label: 'Klanten' },
              { value: '99.9%', label: 'Uptime' },
              { value: '24/7',  label: 'Support' },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-3xl lg:text-4xl font-black">{s.value}</p>
                <p className="text-xs lg:text-sm text-white/70 font-semibold mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </aside>

        {/* RIGHT: schoon wit formulier */}
        <div className="bg-white px-6 py-10 sm:px-12 sm:py-14 lg:p-16 xl:px-20 lg:overflow-y-auto lg:max-h-screen">
          <div className="max-w-md mx-auto">
          {branding?.slug && (
            <button onClick={onBack} data-testid="auth-back" className="flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-slate-600 mb-6 transition active:scale-95">
              <ArrowLeft className="w-4 h-4" /> Terug naar PIN
            </button>
          )}

          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-50 border border-orange-100 mb-5">
            <Sparkles className="w-3.5 h-3.5 text-[#FF5C00]" />
            <span className="text-[11px] font-extrabold tracking-[0.18em] uppercase text-[#FF5C00]">14 Dagen Gratis</span>
          </div>

          <h1 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tight leading-tight">
            Account aanmaken
          </h1>
          <p className="text-base text-slate-500 mt-2 mb-8">Vul uw gegevens in om te beginnen</p>

          {error && (
            <div className="mb-5 p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm font-medium" data-testid="auth-error">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-5">
            {/* Volledige naam */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Volledige naam</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} data-testid="auth-name"
                required minLength={2}
                placeholder="Jan Jansen"
                className="w-full h-12 text-base px-4 rounded-xl border border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-white outline-none transition" />
            </div>

            {/* Bedrijfsnaam */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Bedrijfsnaam <span className="text-slate-400 font-medium">(optioneel)</span>
              </label>
              <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} data-testid="auth-company-name"
                placeholder="Uw bedrijfsnaam"
                className="w-full h-12 text-base px-4 rounded-xl border border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-white outline-none transition" />
              {portalPreview.slug && companyName.length > 1 && (() => {
                const okTone = slugStatus === 'available';
                const errTone = slugStatus === 'taken' || slugStatus === 'format';
                const palette = errTone
                  ? 'bg-rose-50 border-rose-200 text-rose-700'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700';
                return (
                  <div className={`mt-2 flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold ${palette}`} data-testid="auth-portal-preview">
                    <Globe className="w-3.5 h-3.5 shrink-0" />
                    <span className="font-mono truncate flex-1">{portalPreview.host || 'app.surirent.sr'}/{portalPreview.slug}</span>
                    {slugStatus === 'checking' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {okTone && <span className="font-extrabold">✓ VRIJ</span>}
                    {slugStatus === 'taken' && <span className="font-extrabold">✗ BEZET</span>}
                  </div>
                );
              })()}
            </div>

            {/* E-mailadres */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">E-mailadres</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="auth-email"
                required
                placeholder="naam@bedrijf.sr"
                className="w-full h-12 text-base px-4 rounded-xl border border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-slate-50 outline-none transition" />
            </div>

            {/* Wachtwoord */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Wachtwoord</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  data-testid="auth-password" required minLength={6}
                  placeholder="••••••••••"
                  className="w-full h-12 text-base px-4 pr-11 rounded-xl border border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-slate-50 outline-none transition" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Geavanceerde opties — Telefoon, Adres, Land, PIN, Pakket — verborgen onder een toggle */}
            <details className="group rounded-xl border border-slate-200 overflow-hidden">
              <summary className="flex items-center justify-between cursor-pointer px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors list-none">
                <span className="text-sm font-bold text-slate-700">Geavanceerde opties</span>
                <ChevronDown className="w-4 h-4 text-slate-500 transition-transform group-open:rotate-180" />
              </summary>
              <div className="p-4 space-y-4">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">Telefoon</label>
                    <input type="tel" value={telefoon} onChange={(e) => setTelefoon(e.target.value)} data-testid="auth-telefoon"
                      placeholder="+597 ..."
                      className="w-full h-11 text-sm px-3 rounded-lg border border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-white outline-none transition" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">Kiosk PIN</label>
                    <input type="text" inputMode="numeric" pattern="\d{4}" maxLength={4} autoComplete="off"
                      value={kioskPin}
                      onChange={(e) => setKioskPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      data-testid="auth-kiosk-pin"
                      placeholder="• • • •"
                      className="w-full h-11 text-sm px-3 rounded-lg border border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-white outline-none transition font-mono tracking-[0.4em] text-center" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Adres</label>
                  <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} data-testid="auth-address"
                    placeholder="Bedrijfsadres"
                    className="w-full h-11 text-sm px-3 rounded-lg border border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-white outline-none transition" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Land &amp; valuta</label>
                  <div className="grid grid-cols-2 gap-2" data-testid="country-picker">
                    {[
                      { code: 'SR', flag: '🇸🇷', label: 'Suriname', sub: 'SRD' },
                      { code: 'NL', flag: '🇳🇱', label: 'Nederland', sub: 'EUR' },
                    ].map((c) => {
                      const sel = country === c.code;
                      return (
                        <button key={c.code} type="button" onClick={() => setCountry(c.code)}
                          data-testid={`country-${c.code.toLowerCase()}`}
                          className={`rounded-lg border p-2 text-center transition-all ${
                            sel ? 'border-[#FF5C00] bg-orange-50' : 'border-slate-200 bg-white hover:border-orange-300'
                          }`}>
                          <span className="text-lg leading-none mr-1.5">{c.flag}</span>
                          <span className={`text-xs font-extrabold ${sel ? 'text-[#C74600]' : 'text-slate-700'}`}>{c.label}</span>
                          <span className="text-[10px] text-slate-400 font-bold ml-1">{c.sub}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Pakket</label>
                  <div className="grid grid-cols-2 gap-2">
                    {plans.map((p) => {
                      const sel = plan === p.id;
                      return (
                        <button key={p.id} type="button" onClick={() => setPlan(p.id)}
                          data-testid={`plan-${p.id}`}
                          className={`text-left rounded-lg border p-2.5 transition-all ${
                            sel ? 'border-[#FF5C00] bg-orange-50' : 'border-slate-200 bg-white hover:border-orange-300'
                          }`}>
                          <p className={`font-extrabold text-xs ${sel ? 'text-[#C74600]' : 'text-slate-900'}`}>{p.name}</p>
                          <p className={`text-base font-extrabold mt-0.5 ${sel ? 'text-[#FF5C00]' : 'text-slate-900'}`}>
                            {(p.currency || 'SRD').toUpperCase() === 'EUR'
                              ? `€${Number(p.amount).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : `${p.currency} ${Number(p.amount).toLocaleString('nl-NL')}`}
                            <span className="text-[10px] text-slate-400 ml-1">/m</span>
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </details>

            {/* Submit */}
            <button type="submit" disabled={loading} data-testid="auth-submit"
              className="w-full h-14 bg-[#FF5C00] hover:bg-[#C74600] text-white font-extrabold text-base rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-orange-500/30 mt-2">
              {loading ? (<><Loader2 className="w-5 h-5 animate-spin" /> Bezig…</>)
                : (<>Account aanmaken <ArrowRight className="w-5 h-5" /></>)}
            </button>

            {/* Social proof */}
            <div className="rounded-xl bg-emerald-50/70 border border-emerald-100 p-3 flex items-center gap-3">
              <div className="flex -space-x-2">
                {['JK', 'SM', 'RB'].map((init, i) => (
                  <span key={init} className={`w-8 h-8 rounded-full ring-2 ring-white flex items-center justify-center text-[10px] font-extrabold text-white shadow-sm ${
                    i === 0 ? 'bg-emerald-500' : i === 1 ? 'bg-emerald-600' : 'bg-emerald-700'
                  }`}>{init}</span>
                ))}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1">
                  {[0,1,2,3,4].map((i) => <Star key={i} className="w-3 h-3 fill-amber-400 text-amber-400" />)}
                </div>
                <p className="text-xs font-bold text-slate-700 mt-0.5">500+ tevreden klanten</p>
              </div>
            </div>

            <p className="text-center text-sm text-slate-500">
              Heeft u al een account?{' '}
              <button type="button" onClick={() => { setMode('login'); setError(''); }} className="font-bold text-[#FF5C00] hover:underline">
                Log hier in
              </button>
            </p>
          </form>
          </div>
        </div>
      </div>
      ) : (
        <div
          className="bg-white rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] w-full max-w-xl p-5 sm:p-8 md:p-10"
          data-testid="auth-form"
        >
          {branding?.slug && (
            <button onClick={onBack} data-testid="auth-back" className="flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-slate-600 mb-4 transition active:scale-95">
              <ArrowLeft className="w-4 h-4" /> Terug naar PIN
            </button>
          )}


          <div className="text-center mb-5">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#FF5C00] flex items-center justify-center mx-auto mb-3 shadow-lg shadow-orange-500/20">
              <KeyRound className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Beheerder Login</h2>
            <p className="text-sm text-slate-400 mt-1">Log in met uw e-mail en wachtwoord</p>
          </div>

          {error && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-center text-sm font-medium" data-testid="auth-error">
              {error}
            </div>
          )}

          {/* Tab toggle: e-mail/wachtwoord vs QR code */}
          <div className="mb-5 grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl"
            data-testid="login-method-tabs">
            <button type="button" onClick={() => setLoginMethod('password')}
              data-testid="tab-password"
              className={`h-10 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
                loginMethod === 'password'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}>
              <KeyRound className="w-4 h-4" /> Wachtwoord
            </button>
            <button type="button" onClick={() => setLoginMethod('qr')}
              data-testid="tab-qr"
              className={`h-10 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
                loginMethod === 'qr'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}>
              <QrCode className="w-4 h-4" /> QR code
            </button>
          </div>

          {loginMethod === 'qr' ? (
            <div className="py-6">
              <QrLoginTab
                primary={branding?.primary_color || '#FF5C00'}
                onSuccess={() => { window.location.assign('/admin'); }}
              />
              <p className="text-center text-xs text-slate-400 mt-5">
                Geen telefoon bij de hand?{' '}
                <button onClick={() => setLoginMethod('password')}
                  data-testid="qr-switch-password"
                  className="font-bold text-[#FF5C00] hover:underline">
                  Gebruik wachtwoord
                </button>
              </p>
            </div>
          ) : (

          <form onSubmit={submit} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">E-mailadres</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="auth-email"
                    required autoComplete="username" name="email" id="login-email"
                    className="w-full h-12 text-base px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-[#F9FAFB] outline-none transition"
                    placeholder="naam@bedrijf.sr" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Wachtwoord</label>
                  <div className="relative">
                    <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                      data-testid="auth-password" required minLength={6}
                      autoComplete="current-password" name="password" id="login-password"
                      className="w-full h-12 text-base px-4 pr-11 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-[#F9FAFB] outline-none transition" />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                    <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
                      data-testid="auth-remember"
                      className="w-4 h-4 rounded border-2 border-slate-300 text-[#FF5C00] focus:ring-[#FF5C00]/30 cursor-pointer" />
                    Onthoud mij
                  </label>
                  <button type="button" onClick={() => setShowForgot(true)}
                    data-testid="auth-forgot-link"
                    className="text-sm text-[#FF5C00] font-semibold hover:underline">
                    Wachtwoord vergeten?
                  </button>
                </div>

            <button type="submit" disabled={loading} data-testid="auth-submit"
              className="w-full h-14 mt-1 bg-[#FF5C00] hover:bg-[#E05200] text-white rounded-xl text-lg font-semibold transition-all active:scale-[0.97] shadow-lg shadow-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                <><LogIn className="w-5 h-5" /> Inloggen</>
              )}
            </button>
          </form>
          )}

          {/* Mode switcher — alleen op generieke /login. Op /<slug>/login is
              registratie niet relevant (klanten loggen in, ze maken geen
              nieuw bedrijf aan). */}
          {!branding?.slug && (
            <p className="text-center text-sm text-slate-400 mt-4">
              Nog geen account?{' '}
              <button onClick={() => { setMode('register'); setError(''); }}
                data-testid="auth-switch-mode"
                className="text-[#FF5C00] font-semibold hover:underline">
                Registreer hier
              </button>
            </p>
          )}
        </div>
        )}
      </div>

      {showForgot && (
        <ForgotPasswordModal initialEmail={email} onClose={() => setShowForgot(false)} />
      )}
    </div>
  );
}

// =====================================================================
// Forgot Password Modal — wachtwoord herstel via email + WhatsApp
// =====================================================================

export default PasswordView;
