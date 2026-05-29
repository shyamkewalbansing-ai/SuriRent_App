import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBrandedNavigate } from '../../lib/branded-nav';
import { RESERVED_SLUGS } from '../../lib/branded-nav';
import { Loader2, Delete, KeyRound, ArrowLeft, Eye, EyeOff, UserPlus, LogIn, Check, Globe } from 'lucide-react';
import { api, formatError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { setPreferredRole, isStandalonePWA, getPreferredRole, routeForRole } from '../../lib/pwaRole';
import { setKioskEmployee, clearKioskEmployee } from '../../components/KioskEmployee';
import {
  detectCompanySlug, fetchBranding, fetchBrandingByHost, applyBranding,
  resolveLogoUrl, readCachedBranding, clearBrandingCache,
} from '../../lib/branding';

function Clock() {
  const [t, setT] = useState(new Date());
  useEffect(() => {
    const i = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(i);
  }, []);
  // Suriname tijdzone (America/Paramaribo, UTC-3) — overschrijft de
  // browser-locale zodat de klok altijd lokale Surinaamse tijd toont,
  // ook als de gebruiker reist of een internationaal apparaat gebruikt.
  const TZ = 'America/Paramaribo';
  return (
    <div className="text-right" data-testid="kiosk-clock">
      <p className="font-bold text-white tracking-tight leading-none" style={{ fontSize: 'clamp(13px, 1.8vh, 22px)' }}>
        {t.toLocaleTimeString('nl-NL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })}
      </p>
      <p className="text-white/80 capitalize" style={{ fontSize: 'clamp(9px, 1.2vh, 13px)', marginTop: '1px' }}>
        {t.toLocaleDateString('nl-NL', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' })}
      </p>
    </div>
  );
}

function Header({ branding }) {
  const appName = branding?.app_name || 'Vastgoed Kiosk';
  const tagline = branding?.tagline || 'Beheer & Kiosk toegang';
  const logo = branding?._logoResolved || '/kiosk-icons/kiosk-192.png';
  return (
    <div className="flex items-center justify-between shrink-0"
      style={{ padding: 'clamp(6px, 1.2vh, 16px) clamp(12px, 4vw, 32px)' }}>
      <div className="flex items-center" style={{ gap: 'clamp(8px, 2vw, 16px)' }}>
        <div className="rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center overflow-hidden"
          style={{ width: 'clamp(32px, 5vh, 56px)', height: 'clamp(32px, 5vh, 56px)', padding: '4px' }}>
          <img src={logo} alt={appName} className="w-full h-full object-contain" data-testid="login-header-logo" />
        </div>
        <div className="min-w-0">
          <h1 className="font-bold text-white tracking-tight leading-tight truncate" style={{ fontSize: 'clamp(13px, 2vh, 20px)' }} data-testid="login-header-name">{appName}</h1>
          <p className="text-white/80 font-medium leading-tight truncate" style={{ fontSize: 'clamp(9px, 1.2vh, 13px)' }}>{tagline}</p>
        </div>
      </div>
      <Clock />
    </div>
  );
}

function PinLanding({ onSuccess, onPassword, onRegister, branding, pwaTarget }) {
  const [pin, setPin] = useState(['', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const primary = branding?.primary_color || '#FF5C00';
  const appName = branding?.app_name || 'Kiosk';
  const tagline = branding?.tagline || '';
  const logoUrl = branding?.logo_url ? branding._logoResolved : '/kiosk-icons/kiosk-512.png';
  const isAdminTarget = pwaTarget === 'admin';

  const verify = async (code) => {
    setLoading(true); setError('');
    try {
      const { data } = await api.post('/auth/kiosk-pin', {
        pin: code,
        // company_slug komt uit het branded pad of de cached branding —
        // zonder bedrijfs-context weigert backend de PIN-login.
        company_slug: branding?.slug || undefined,
        company_id: branding?.company_id || undefined,
      });
      if (data?.token) localStorage.setItem('kiosk_token', data.token);
      if (data?.company) localStorage.setItem('kiosk_company', JSON.stringify(data.company));
      // Detecteer of dit een MEDEWERKER-PIN was (eigen PIN) of een bedrijfs-PIN.
      // Bij medewerker: GEEN admin_token (zij mogen niet bij Beheer), sla
      // employee-sessie op zodat alle betalingen automatisch pending_approval
      // krijgen met deze medewerker als ontvanger.
      if (data?.employee?.id) {
        // Eerst verzekerd verwijderen — een vorige admin-sessie mag geen
        // ongewenste toegang houden voor deze medewerker.
        try { localStorage.removeItem('admin_token'); } catch { /* ignore */ }
        setKioskEmployee({
          id: data.employee.id,
          name: data.employee.name || 'Medewerker',
          pin: data.employee.pin || code,
        });
        setPreferredRole('kiosk');
      } else {
        // Shared company-PIN: backend geeft ook een admin_token mee zodat
        // de "Beheerder" knop direct doorgaat naar /admin. Vorige employee-
        // sessie van een collega legen — anders blijft die meeknopen.
        try { clearKioskEmployee(); } catch { /* ignore */ }
        if (data?.admin_token) localStorage.setItem('admin_token', data.admin_token);
        setPreferredRole(isAdminTarget ? 'admin' : 'kiosk');
      }
      onSuccess();
    } catch (e) {
      setError(formatError(e, 'Ongeldige PIN code'));
      setPin(['', '', '', '']);
    } finally { setLoading(false); }
  };

  const handleKey = (k) => {
    if (loading) return;
    setError('');
    if (k === 'DEL') {
      for (let i = 3; i >= 0; i--) {
        if (pin[i]) { const np = [...pin]; np[i] = ''; setPin(np); return; }
      }
      return;
    }
    for (let i = 0; i < 4; i++) {
      if (!pin[i]) {
        const np = [...pin]; np[i] = k; setPin(np);
        if (i === 3) verify(np.join(''));
        return;
      }
    }
  };

  return (
    <div className="flex flex-col" style={{
      position: 'fixed', inset: 0,
      backgroundColor: primary,
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      paddingLeft: 'env(safe-area-inset-left, 0px)',
      paddingRight: 'env(safe-area-inset-right, 0px)',
    }}>
      <Header branding={branding} />
      <div className="flex-1 min-h-0 flex items-center justify-center px-2 py-2 sm:p-6 overflow-hidden">
        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] w-full max-w-md flex flex-col"
          style={{ maxHeight: '100%', padding: 'clamp(12px, 2.5vh, 32px) clamp(14px, 4vw, 32px)' }}
          data-testid="pin-card">
          <div className="text-center" style={{ marginBottom: 'clamp(6px, 1.5vh, 16px)' }}>
            <div className="rounded-2xl flex items-center justify-center mx-auto shadow-xl overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${primary}, ${primary}CC)`,
                width: 'clamp(40px, 7vh, 72px)',
                height: 'clamp(40px, 7vh, 72px)',
                padding: 'clamp(4px, 0.8vh, 10px)',
                marginBottom: 'clamp(4px, 1vh, 10px)',
              }}>
              <img src={logoUrl} alt="logo" className="w-full h-full object-contain drop-shadow-md" data-testid="pin-logo" />
            </div>
            <h2 className="font-bold text-slate-900 tracking-tight leading-tight"
              style={{ fontSize: 'clamp(15px, 2.4vh, 22px)' }}
              data-testid="pin-app-name">{isAdminTarget ? `Beheer · ${appName}` : `Welkom bij ${appName}`}</h2>
            {tagline && !isAdminTarget && <p className="text-slate-400 leading-tight" style={{ fontSize: 'clamp(11px, 1.5vh, 13px)', marginTop: '2px' }}>{tagline}</p>}
            {isAdminTarget && (
              <p className="font-bold leading-tight" style={{ fontSize: 'clamp(11px, 1.5vh, 13px)', marginTop: '2px', color: primary }}>
                Voer uw PIN in om naar het Beheer-dashboard te gaan
              </p>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl text-center font-medium"
              style={{ fontSize: 'clamp(11px, 1.5vh, 13px)', padding: 'clamp(6px, 1vh, 10px)', marginBottom: 'clamp(6px, 1vh, 12px)' }}
              data-testid="pin-error">
              {error}
            </div>
          )}

          <div className="flex justify-center" style={{ gap: 'clamp(6px, 1.5vw, 12px)', marginBottom: 'clamp(8px, 1.5vh, 16px)' }}>
            {pin.map((digit, i) => (
              <div key={`pin-slot-${i}`} data-testid={`pin-input-${i}`}
                style={{
                  width: 'clamp(36px, 9vw, 56px)',
                  height: 'clamp(40px, 6vh, 64px)',
                  fontSize: 'clamp(18px, 2.5vh, 24px)',
                  ...(digit && !error ? { borderColor: primary, color: primary, backgroundColor: `${primary}10` } : {}),
                }}
                className={`text-center font-bold rounded-xl border-2 transition-all flex items-center justify-center ${
                  error ? 'border-red-400 bg-red-50 text-red-600'
                    : digit ? ''
                    : 'border-slate-200 bg-[#F9FAFB] text-slate-300'
                }`}>
                {digit ? '●' : ''}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 mx-auto w-full"
            style={{ gap: 'clamp(4px, 1vh, 12px)', maxWidth: 'min(320px, 90%)' }}>
            {['1','2','3','4','5','6','7','8','9','_e','0','DEL'].map((k) => (
              k === '_e' ? <div key="e" /> : (
                <button key={k} type="button" onClick={() => handleKey(k)} disabled={loading}
                  data-testid={`keypad-${k}`}
                  style={{ height: 'clamp(36px, 6vh, 56px)', fontSize: 'clamp(16px, 2.4vh, 24px)' }}
                  className={`font-bold rounded-xl transition-all active:scale-90 disabled:opacity-50 flex items-center justify-center ${
                    k === 'DEL'
                      ? 'bg-red-50 text-red-500 hover:bg-red-100 border border-red-200'
                      : 'bg-[#F4F5F7] text-slate-800 hover:bg-orange-50 hover:text-orange-600 border border-slate-200'
                  }`}>
                  {k === 'DEL' ? <Delete style={{ width: 'clamp(16px, 2.2vh, 22px)', height: 'clamp(16px, 2.2vh, 22px)' }} /> : k}
                </button>
              )
            ))}
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 text-slate-400"
              style={{ marginTop: 'clamp(6px, 1vh, 12px)' }}>
              <Loader2 className="w-3 h-3 animate-spin" />
              <span style={{ fontSize: 'clamp(10px, 1.4vh, 12px)' }} className="font-medium">Verifiëren...</span>
            </div>
          )}

          <div className="border-t border-slate-100 flex items-center justify-center flex-wrap font-medium"
            style={{ gap: 'clamp(8px, 2vw, 16px)', fontSize: 'clamp(10px, 1.4vh, 12px)', marginTop: 'clamp(8px, 1.5vh, 16px)', paddingTop: 'clamp(6px, 1.2vh, 12px)' }}>
            <button onClick={onPassword} data-testid="login-password-btn" className="flex items-center gap-1 text-slate-500 hover:text-orange-500 transition">
              <KeyRound style={{ width: 'clamp(11px, 1.6vh, 14px)', height: 'clamp(11px, 1.6vh, 14px)' }} /> Beheerder
            </button>
            <span className="text-slate-200">•</span>
            <button onClick={onRegister} data-testid="login-register-btn" className="flex items-center gap-1 text-slate-500 hover:text-orange-500 transition">
              <UserPlus style={{ width: 'clamp(11px, 1.6vh, 14px)', height: 'clamp(11px, 1.6vh, 14px)' }} /> Nieuw account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PasswordView({ initialMode = 'login', onBack, onRegistered, branding }) {
  const navigate = useBrandedNavigate();
  const { login, register } = useAuth();
  const [mode, setMode] = useState(initialMode); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [telefoon, setTelefoon] = useState('');
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

  // Build the query that drives the plan-currency on the registration form.
  // Explicit country wins; otherwise the phone is used for auto-detect.
  const planQuery = (() => {
    if (country === 'NL') return '?currency=EUR';
    if (country === 'SR' || country === 'OTHER') return '?currency=SRD';
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
        await login(email, password);
        setPreferredRole('admin');
        navigate('/admin');
      } else {
        const result = await register({
          name: name.trim(),
          email: email.trim(),
          password,
          company_name: companyName.trim(),
          telefoon: telefoon.trim(),
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
        <div className="bg-white rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] w-full max-w-xl p-5 sm:p-8 md:p-10" data-testid="auth-form">
          {branding?.slug && (
            <button onClick={onBack} data-testid="auth-back" className="flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-slate-600 mb-4 transition active:scale-95">
              <ArrowLeft className="w-4 h-4" /> Terug naar PIN
            </button>
          )}

          <div className="text-center mb-5">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#FF5C00] flex items-center justify-center mx-auto mb-3 shadow-lg shadow-orange-500/20">
              {mode === 'login' ? <KeyRound className="w-6 h-6 sm:w-7 sm:h-7 text-white" /> : <UserPlus className="w-6 h-6 sm:w-7 sm:h-7 text-white" />}
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">{mode === 'login' ? 'Beheerder Login' : 'Nieuw account'}</h2>
            <p className="text-sm text-slate-400 mt-1">{mode === 'login' ? 'Log in met uw e-mail en wachtwoord' : 'Maak in 30 seconden uw eigen Vastgoed omgeving'}</p>
          </div>

          {error && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-center text-sm font-medium" data-testid="auth-error">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-3">
            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Land &amp; valuta</label>
                  <div className="grid grid-cols-3 gap-2" data-testid="country-picker">
                    {[
                      { code: 'SR', flag: '🇸🇷', label: 'Suriname', sub: 'SRD' },
                      { code: 'NL', flag: '🇳🇱', label: 'Nederland', sub: 'EUR' },
                      { code: 'OTHER', flag: '🌍', label: 'Anders', sub: 'SRD' },
                    ].map((c) => {
                      const sel = country === c.code;
                      return (
                        <button key={c.code} type="button" onClick={() => setCountry(c.code)}
                          data-testid={`country-${c.code.toLowerCase()}`}
                          className={`rounded-xl border-2 p-2 text-center transition-all ${
                            sel ? 'border-[#FF5C00] bg-orange-50 shadow-md shadow-orange-500/10' : 'border-slate-200 bg-white hover:border-orange-300'
                          }`}>
                          <div className="text-xl leading-none mb-0.5">{c.flag}</div>
                          <div className={`text-[11px] font-extrabold ${sel ? 'text-[#C74600]' : 'text-slate-700'}`}>{c.label}</div>
                          <div className="text-[10px] text-slate-400 font-bold">{c.sub}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Kies uw pakket</label>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {plans.map((p) => {
                      const sel = plan === p.id;
                      return (
                        <button key={p.id} type="button" onClick={() => setPlan(p.id)}
                          data-testid={`plan-${p.id}`}
                          className={`text-left rounded-xl border-2 p-3 transition-all ${
                            sel ? 'border-[#FF5C00] bg-orange-50 shadow-md shadow-orange-500/15' : 'border-slate-200 bg-white hover:border-orange-300'
                          }`}>
                          <div className="flex items-start justify-between mb-0.5">
                            <p className={`font-extrabold text-sm ${sel ? 'text-[#C74600]' : 'text-slate-900'}`}>{p.name}</p>
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${sel ? 'border-[#FF5C00] bg-[#FF5C00]' : 'border-slate-300'}`}>
                              {sel && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                          </div>
                          <p className={`text-lg font-extrabold ${sel ? 'text-[#FF5C00]' : 'text-slate-900'}`}>
                            {(p.currency || 'SRD').toUpperCase() === 'EUR'
                              ? `€${Number(p.amount).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : `${p.currency} ${Number(p.amount).toLocaleString('nl-NL')}`}
                            <span className="text-[11px] font-medium text-slate-400 ml-1">/m</span>
                          </p>
                          <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{p.description}</p>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">14 dagen gratis · daarna factureren via bankoverschrijving</p>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Bedrijfsnaam *</label>
                  <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} data-testid="auth-company-name"
                    required minLength={2}
                    placeholder="Demo Vastgoed N.V."
                    className="w-full h-12 text-base px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-[#F9FAFB] outline-none transition" />
                  {/* Live portal-URL preview */}
                  {portalPreview.slug && (
                    <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200" data-testid="auth-portal-preview">
                      <Globe className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-700">Uw portaal-URL</p>
                        <p className="text-xs sm:text-sm font-mono font-bold text-emerald-900 truncate">
                          {portalPreview.host || 'app.surirent.sr'}<span className="text-emerald-600">/</span>{portalPreview.slug}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Uw naam</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} data-testid="auth-name"
                      required minLength={2}
                      placeholder="Voornaam Achternaam"
                      className="w-full h-12 text-base px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-[#F9FAFB] outline-none transition" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Telefoon</label>
                    <input type="tel" value={telefoon} onChange={(e) => setTelefoon(e.target.value)} data-testid="auth-telefoon"
                      placeholder="+597 ..."
                      className="w-full h-12 text-base px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-[#F9FAFB] outline-none transition" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Kiosk PIN (4 cijfers, optioneel)</label>
                  <input type="text" inputMode="numeric" pattern="\d{4}" maxLength={4} autoComplete="off"
                    value={kioskPin}
                    onChange={(e) => setKioskPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    data-testid="auth-kiosk-pin"
                    placeholder="• • • •"
                    className="w-full h-12 text-base px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-[#F9FAFB] outline-none transition font-mono tracking-[0.5em] text-center" />
                </div>
              </>
            )}

            <div className={mode === 'register' ? 'grid sm:grid-cols-2 gap-3' : ''}>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">E-mailadres</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="auth-email"
                  required
                  className="w-full h-12 text-base px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-[#F9FAFB] outline-none transition"
                  placeholder={mode === 'register' ? 'naam@bedrijf.sr' : 'admin@vastgoed.sr'} />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Wachtwoord</label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                    data-testid="auth-password" required minLength={6}
                    className="w-full h-12 text-base px-4 pr-11 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-[#F9FAFB] outline-none transition" />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>

            <button type="submit" disabled={loading} data-testid="auth-submit"
              className="w-full h-14 mt-1 bg-[#FF5C00] hover:bg-[#E05200] text-white rounded-xl text-lg font-semibold transition-all active:scale-[0.97] shadow-lg shadow-orange-500/20 disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                <>{mode === 'login' ? <LogIn className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                {mode === 'login' ? 'Inloggen' : 'Account aanmaken'}</>
              )}
            </button>
          </form>

          <p className="text-center text-sm text-slate-400 mt-4">
            {mode === 'login' ? 'Nog geen account?' : 'Al een account?'}{' '}
            <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
              data-testid="auth-switch-mode"
              className="text-[#FF5C00] font-semibold hover:underline">
              {mode === 'login' ? 'Registreer hier' : 'Log hier in'}
            </button>
          </p>

          {mode === 'login' && (
            <p className="text-center text-xs text-slate-300 mt-3">
              Standaard: <span className="font-bold text-slate-400">admin@vastgoed.sr / admin123</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function RegisterSuccess({ plan, company, bankDetails, onContinue }) {
  const ref = `ABONNEMENT — ${company || ''} — ${new Date().toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}`;
  return (
    <div className="flex flex-col" style={{
      position: 'fixed', inset: 0, backgroundColor: '#F97316',
      overflowY: 'auto', WebkitOverflowScrolling: 'touch',
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      paddingLeft: 'env(safe-area-inset-left, 0px)',
      paddingRight: 'env(safe-area-inset-right, 0px)',
    }}>
      <Header />
      <div className="flex-1 flex items-start sm:items-center justify-center p-4 sm:p-6">
        <div className="bg-white rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] w-full max-w-2xl p-6 sm:p-10" data-testid="register-success">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
              <Check className="w-10 h-10 text-emerald-600" strokeWidth={3} />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Welkom bij SuriRent!</h2>
            <p className="text-sm text-slate-500 mt-1">Uw eigen omgeving is aangemaakt voor <span className="font-bold text-slate-900">{company}</span>.</p>
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-orange-50 to-orange-100 border-2 border-orange-200 p-4 mb-5">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-orange-700">14 dagen proefperiode</p>
                <p className="text-sm font-bold text-slate-900 mt-0.5">Volledige toegang tot {plan.name}</p>
              </div>
              <p className="text-xl font-extrabold text-[#FF5C00] whitespace-nowrap">
                {plan.currency} {Number(plan.amount).toLocaleString('nl-NL')}
                <span className="text-[10px] font-medium text-slate-500 ml-1">/maand</span>
              </p>
            </div>
            <p className="text-xs text-slate-600">Na 14 dagen ontvangt u een factuur per e-mail. Annuleer vrijblijvend via uw beheerder-dashboard.</p>
          </div>

          {bankDetails && (
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 mb-5" data-testid="success-bank-details">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-2">Bankoverschrijving</p>
              <div className="space-y-1.5 text-sm">
                <Bank label="Bank" value={bankDetails.bank_name} />
                <Bank label="Tenaamstelling" value={bankDetails.account_name} />
                <Bank label="Rekeningnummer" value={bankDetails.account_number} mono />
                {bankDetails.swift && <Bank label="SWIFT" value={bankDetails.swift} mono />}
                <Bank label="Omschrijving" value={ref} mono />
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                Vragen? {bankDetails.whatsapp && <>WhatsApp <a href={`https://wa.me/${bankDetails.whatsapp.replace(/\D/g, '')}`} className="text-orange-600 font-bold">{bankDetails.whatsapp}</a> · </>}
                {bankDetails.support_email && <>E-mail <a href={`mailto:${bankDetails.support_email}`} className="text-orange-600 font-bold">{bankDetails.support_email}</a></>}
              </p>
            </div>
          )}

          <button onClick={onContinue} data-testid="success-continue"
            className="w-full h-14 bg-[#FF5C00] hover:bg-[#E05200] text-white rounded-xl text-lg font-extrabold transition shadow-lg shadow-orange-500/20">
            Naar mijn dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

function Bank({ label, value, mono }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className={`font-bold text-slate-900 text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

export default function LoginPage() {
  const navigate = useBrandedNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading } = useAuth();
  // Initial view from ?view=admin or ?view=register query string (e.g. when arriving
  // from the Kiosk "Beheerder" button or a marketing CTA). Defaults to PIN keypad.
  const initialView = (() => {
    const v = (searchParams.get('view') || '').toLowerCase();
    if (v === 'admin' || v === 'login' || v === 'password') return 'login';
    if (v === 'register' || v === 'signup') return 'register';
    return 'pin';
  })();
  const [view, setView] = useState(initialView);
  const [skipRedirect, setSkipRedirect] = useState(false);

  // Branding state — start from cache for instant render, then fetch fresh.
  const [branding, setBranding] = useState(() => {
    const cached = readCachedBranding();
    if (cached) {
      return { ...cached, _logoResolved: resolveLogoUrl(cached.logo_url) };
    }
    return null;
  });

  useEffect(() => {
    // document.title wordt centraal beheerd door usePwaManifest()
  }, []);

  // Login is volledig brand-oranje. We zetten body+#root in PWA standalone
  // op oranje (via body class) zodat het home-indicator gebied en eventuele
  // 1px doorlek aan de notch dezelfde kleur tonen. Ook updaten we de
  // theme-color meta zodat de Android-statusbalk oranje wordt. Unmount
  // (bv. navigatie naar /admin of /kiosk) herstelt automatisch.
  useEffect(() => {
    const primary = (branding?.primary_color || '#FF5C00');
    document.body.classList.add('login-mode');
    document.documentElement.classList.add('login-mode-html');
    document.body.style.setProperty('--login-bg', primary);
    document.documentElement.style.setProperty('--login-bg', primary);
    const meta = document.querySelector('meta[name="theme-color"]:not([media])')
      || document.querySelector('meta[name="theme-color"]');
    const prev = meta?.getAttribute('content');
    if (meta) meta.setAttribute('content', primary);
    return () => {
      document.body.classList.remove('login-mode');
      document.documentElement.classList.remove('login-mode-html');
      document.body.style.removeProperty('--login-bg');
      document.documentElement.style.removeProperty('--login-bg');
      if (meta && prev) meta.setAttribute('content', prev);
    };
  }, [branding]);

  // Resolve and apply company branding on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const slug = detectCompanySlug();
      let data = slug ? await fetchBranding(slug) : null;
      // Last resort: ask the backend based on the Host header (works for wildcard DNS
      // setups where the slug detector couldn't read window.location.hostname reliably).
      if (!data) {
        data = await fetchBrandingByHost();
      }
      if (cancelled) return;
      if (!data) {
        clearBrandingCache();
        setBranding(null);
        return;
      }
      const enriched = { ...data, _logoResolved: resolveLogoUrl(data.logo_url) };
      applyBranding(data);
      setBranding(enriched);
      // document.title wordt centraal beheerd door usePwaManifest()
    })();
    return () => { cancelled = true; };
  }, []);

  // PWA shortcut target. Two PWA app icons:
  //   /login?source=pwa&target=kiosk → after PIN, go to /kiosk
  //   /login?source=pwa&target=admin → after PIN, go to /admin (PIN gives both tokens)
  // Defaults to 'kiosk' (the original Kiosk-first PWA experience).
  const pwaTarget = (() => {
    const t = (searchParams.get('target') || '').toLowerCase();
    return t === 'admin' ? 'admin' : 'kiosk';
  })();

  // PWA: if user has a stored preferred role AND a still-valid token for that role,
  // jump directly to that surface (kiosk / admin / tenant). The token-check prevents
  // redirect loops when a token has expired or been revoked.
  // If the URL contains an explicit `target`, prefer that over the stored role so
  // the Beheer-shortcut always lands on /admin (or its PIN-gate) and not on /kiosk.
  useEffect(() => {
    if (!isStandalonePWA()) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('pick') === '1') return; // explicit override: show login picker
    if (params.get('view')) return; // explicit view override → respect it
    const targetParam = (params.get('target') || '').toLowerCase();
    const role = targetParam === 'admin' ? 'admin'
      : targetParam === 'kiosk' ? 'kiosk'
      : getPreferredRole();
    if (!role) return;
    const tokenKey = role === 'admin' ? 'admin_token'
      : role === 'tenant' ? 'tenant_token'
      : 'kiosk_token';
    let hasToken = false;
    try { hasToken = !!localStorage.getItem(tokenKey); } catch { /* ignore */ }
    if (!hasToken) return;
    navigate(routeForRole(role), { replace: true });
  }, [navigate]);

  // Auto-redirect if already logged (but not when we're showing the success screen)
  useEffect(() => {
    if (!loading && user && !skipRedirect) {
      navigate('/admin', { replace: true });
    }
  }, [user, loading, navigate, skipRedirect]);

  if (view === 'login' || view === 'register') {
    return (
      <PasswordView initialMode={view} onBack={() => setView('pin')}
        onRegistered={() => setSkipRedirect(true)} branding={branding} />
    );
  }

  // Geen bedrijfs-context (gebruiker is op generieke `/login`, niet op
  // `/<slug>/login`)? → PIN-login is hier zinloos en zou onveilig zijn
  // (kruis-bedrijf matching). Toon direct het e-mail+wachtwoord formulier.
  // Klanten openen de PIN-flow alleen via hun branded URL.
  if (!branding?.slug) {
    return (
      <PasswordView initialMode="login" onBack={() => {}}
        onRegistered={() => setSkipRedirect(true)} branding={null} />
    );
  }

  // After PIN-success, navigate to the target surface. Both shortcuts require
  // PIN entry; the difference is only where the user lands afterwards.
  // BELANGRIJK: medewerker-PIN logins krijgen GEEN admin_token, dus we sturen
  // ze altijd naar /kiosk — ook als ze de "Beheer"-shortcut hebben gebruikt.
  const onPinSuccess = () => {
    let hasAdmin = false;
    try { hasAdmin = !!localStorage.getItem('admin_token'); } catch { /* ignore */ }
    if (pwaTarget === 'admin' && hasAdmin) {
      setPreferredRole('admin');
      // Hard-navigate so AuthProvider re-runs /auth/me with the new admin_token
      // that the kiosk-pin endpoint just returned.
      window.location.assign('/admin');
    } else {
      navigate('/kiosk');
    }
  };

  return (
    <PinLanding
      branding={branding}
      pwaTarget={pwaTarget}
      onSuccess={onPinSuccess}
      onPassword={() => setView('login')}
      onRegister={() => setView('register')}
    />
  );
}
