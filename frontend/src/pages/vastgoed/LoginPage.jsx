import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Loader2, Lock, Delete, KeyRound, ArrowLeft, Eye, EyeOff, UserPlus, LogIn, Check } from 'lucide-react';
import { api, formatError } from '../../lib/api';
import { useAuth } from '../../lib/auth';

function Clock() {
  const [t, setT] = useState(new Date());
  useEffect(() => {
    const i = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(i);
  }, []);
  return (
    <div className="text-right" data-testid="kiosk-clock">
      <p className="text-base sm:text-2xl font-bold text-white tracking-tight leading-none">
        {t.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
      </p>
      <p className="text-[10px] sm:text-sm text-white/80 capitalize mt-0.5">
        {t.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })}
      </p>
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-center justify-between px-4 sm:px-8 py-4 sm:py-5 bg-orange-600/20 backdrop-blur-sm border-b border-white/20">
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white flex items-center justify-center shadow-lg overflow-hidden p-1">
          <img src="/kiosk-icons/kiosk-192.png" alt="Kiosk" className="w-full h-full object-contain" data-testid="login-header-logo" />
        </div>
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">Vastgoed Kiosk</h1>
          <p className="text-[11px] sm:text-xs text-white/80 font-medium">Beheer & Kiosk toegang</p>
        </div>
      </div>
      <Clock />
    </div>
  );
}

function PinLanding({ onSuccess, onPassword, onRegister }) {
  const [pin, setPin] = useState(['', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const verify = async (code) => {
    setLoading(true); setError('');
    try {
      const { data } = await api.post('/auth/kiosk-pin', { pin: code });
      if (data?.token) localStorage.setItem('kiosk_token', data.token);
      if (data?.company) localStorage.setItem('kiosk_company', JSON.stringify(data.company));
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
    <div className="min-h-screen bg-orange-500 flex flex-col">
      <Header />
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="bg-white rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] w-full max-w-md p-6 sm:p-10" data-testid="pin-card">
          <div className="text-center mb-6">
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center mx-auto mb-4 shadow-xl shadow-orange-500/40 overflow-hidden p-3">
              <img src="/kiosk-icons/kiosk-512.png" alt="logo" className="w-full h-full object-contain drop-shadow-md" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Welkom bij Kiosk</h2>
            <p className="text-sm text-slate-400 mt-1">Voer uw PIN code in om te beginnen</p>
            <p className="text-xs text-slate-300 mt-2">Standaard PIN: <span className="font-bold text-slate-500">1234</span></p>
          </div>

          {error && (
            <div className="mb-4 p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-center text-sm font-medium" data-testid="pin-error">
              {error}
            </div>
          )}

          <div className="flex justify-center gap-3 sm:gap-4 mb-6">
            {pin.map((digit, i) => (
              <div key={`pin-slot-${i}`} data-testid={`pin-input-${i}`}
                className={`text-center font-bold rounded-xl border-2 transition-all w-14 h-16 sm:w-16 sm:h-18 text-2xl flex items-center justify-center ${
                  error ? 'border-red-400 bg-red-50 text-red-600'
                    : digit ? 'border-[#FF5C00] bg-orange-50 text-[#FF5C00]'
                    : 'border-slate-200 bg-[#F9FAFB] text-slate-300'
                }`}>
                {digit ? '●' : ''}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-3 max-w-[320px] mx-auto">
            {['1','2','3','4','5','6','7','8','9','_e','0','DEL'].map((k) => (
              k === '_e' ? <div key="e" /> : (
                <button key={k} type="button" onClick={() => handleKey(k)} disabled={loading}
                  data-testid={`keypad-${k}`}
                  className={`h-14 sm:h-16 text-xl sm:text-2xl font-bold rounded-xl transition-all active:scale-90 disabled:opacity-50 flex items-center justify-center ${
                    k === 'DEL'
                      ? 'bg-red-50 text-red-500 hover:bg-red-100 border border-red-200'
                      : 'bg-[#F4F5F7] text-slate-800 hover:bg-orange-50 hover:text-orange-600 border border-slate-200'
                  }`}>
                  {k === 'DEL' ? <Delete className="w-5 h-5" /> : k}
                </button>
              )
            ))}
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 mt-5 text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm font-medium">Verifiëren...</span>
            </div>
          )}

          <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-center gap-4 flex-wrap text-xs font-medium">
            <button onClick={onPassword} data-testid="login-password-btn" className="flex items-center gap-1 text-slate-500 hover:text-orange-500 transition">
              <KeyRound className="w-3.5 h-3.5" /> Beheerder Wachtwoord
            </button>
            <span className="text-slate-200">•</span>
            <button onClick={onRegister} data-testid="login-register-btn" className="flex items-center gap-1 text-slate-500 hover:text-orange-500 transition">
              <UserPlus className="w-3.5 h-3.5" /> Nieuw account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PasswordView({ initialMode = 'login', onBack, onRegistered }) {
  const navigate = useNavigate();
  const { login, register } = useAuth();
  const [mode, setMode] = useState(initialMode); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [telefoon, setTelefoon] = useState('');
  const [plan, setPlan] = useState('starter');
  const [kioskPin, setKioskPin] = useState('');
  const [plans, setPlans] = useState([]);
  const [bankDetails, setBankDetails] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (mode !== 'register') return;
    const params = telefoon ? `?phone=${encodeURIComponent(telefoon)}` : '';
    api.get(`/billing/plans${params}`).then((r) => setPlans(r.data)).catch(() => setPlans([]));
    api.get('/billing/bank-details').then((r) => setBankDetails(r.data)).catch(() => setBankDetails(null));
  }, [mode, telefoon]);

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
        navigate('/admin');
      } else {
        await register({
          name: name.trim(),
          email: email.trim(),
          password,
          company_name: companyName.trim(),
          telefoon: telefoon.trim(),
          plan,
          kiosk_pin: kioskPin.trim() || null,
        });
        if (onRegistered) onRegistered();
        setShowSuccess(true);
      }
    } catch (err) {
      setError(formatError(err, mode === 'login' ? 'Inloggen mislukt' : 'Registratie mislukt'));
    } finally { setLoading(false); }
  };

  if (showSuccess) {
    const selectedPlan = plans.find((p) => p.id === plan) || { name: plan, amount: 0, currency: 'SRD' };
    return <RegisterSuccess plan={selectedPlan} company={companyName} bankDetails={bankDetails}
      onContinue={() => navigate('/admin')} />;
  }

  return (
    <div className="min-h-screen bg-orange-500 flex flex-col">
      <Header />
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="bg-white rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] w-full max-w-xl p-8 md:p-12" data-testid="auth-form">
          <button onClick={onBack} data-testid="auth-back" className="flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-slate-600 mb-6 transition active:scale-95">
            <ArrowLeft className="w-4 h-4" /> Terug naar PIN
          </button>

          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-[#FF5C00] flex items-center justify-center mx-auto mb-4 shadow-lg shadow-orange-500/20">
              {mode === 'login' ? <KeyRound className="w-9 h-9 text-white" /> : <UserPlus className="w-9 h-9 text-white" />}
            </div>
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">{mode === 'login' ? 'Beheerder Login' : 'Nieuw account'}</h2>
            <p className="text-base text-slate-400 mt-1">{mode === 'login' ? 'Log in met uw e-mail en wachtwoord' : 'Maak uw eigen Vastgoed omgeving aan'}</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-center text-sm font-medium" data-testid="auth-error">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Kies uw pakket</label>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {plans.map((p) => {
                      const sel = plan === p.id;
                      return (
                        <button key={p.id} type="button" onClick={() => setPlan(p.id)}
                          data-testid={`plan-${p.id}`}
                          className={`text-left rounded-2xl border-2 p-4 transition-all ${
                            sel ? 'border-[#FF5C00] bg-orange-50 shadow-lg shadow-orange-500/15' : 'border-slate-200 bg-white hover:border-orange-300'
                          }`}>
                          <div className="flex items-start justify-between mb-1">
                            <p className={`font-extrabold ${sel ? 'text-[#C74600]' : 'text-slate-900'}`}>{p.name}</p>
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${sel ? 'border-[#FF5C00] bg-[#FF5C00]' : 'border-slate-300'}`}>
                              {sel && <div className="w-2 h-2 rounded-full bg-white" />}
                            </div>
                          </div>
                          <p className="text-xs text-slate-500 mb-2 leading-snug">{p.description}</p>
                          <p className={`text-xl font-extrabold ${sel ? 'text-[#FF5C00]' : 'text-slate-900'}`}>
                            {(p.currency || 'SRD').toUpperCase() === 'EUR'
                              ? `€${Number(p.amount).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : `${p.currency} ${Number(p.amount).toLocaleString('nl-NL')}`}
                            <span className="text-xs font-medium text-slate-400 ml-1">/maand</span>
                          </p>
                          <ul className="mt-2 space-y-0.5 text-[11px] text-slate-500">
                            {(p.features || []).slice(0, 3).map((f) => (
                              <li key={f} className="flex items-center gap-1.5">
                                <span className={`w-1 h-1 rounded-full ${sel ? 'bg-[#FF5C00]' : 'bg-slate-400'}`} />{f}
                              </li>
                            ))}
                          </ul>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2">U start met een gratis proefperiode van 14 dagen. Daarna factureren we per bankoverschrijving.</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Bedrijfsnaam <span className="text-red-500">*</span></label>
                  <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} data-testid="auth-company-name"
                    required minLength={2}
                    placeholder="Demo Vastgoed N.V."
                    className="w-full h-14 text-lg px-5 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-[#F9FAFB] outline-none transition" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Uw naam</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} data-testid="auth-name"
                    required minLength={2}
                    placeholder="Demo Beheerder"
                    className="w-full h-14 text-lg px-5 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-[#F9FAFB] outline-none transition" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Telefoon</label>
                  <input type="tel" value={telefoon} onChange={(e) => setTelefoon(e.target.value)} data-testid="auth-telefoon"
                    placeholder="+597 ..."
                    className="w-full h-14 text-lg px-5 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-[#F9FAFB] outline-none transition" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Kiosk PIN (4 cijfers)</label>
                  <input type="text" inputMode="numeric" pattern="\d{4}" maxLength={4} autoComplete="off"
                    value={kioskPin}
                    onChange={(e) => setKioskPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    data-testid="auth-kiosk-pin"
                    placeholder="bv. 1234"
                    className="w-full h-14 text-lg px-5 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-[#F9FAFB] outline-none transition font-mono tracking-[0.5em] text-center" />
                  <p className="text-[11px] text-slate-400 mt-1">Optioneel — wordt gebruikt om de Kiosk te ontgrendelen. U kunt dit later wijzigen onder Instellingen.</p>
                </div>
              </>
            )}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">E-mailadres</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="auth-email"
                required
                className="w-full h-14 text-lg px-5 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-[#F9FAFB] outline-none transition"
                placeholder={mode === 'register' ? 'naam@bedrijf.sr' : 'admin@vastgoed.sr'} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Wachtwoord</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  data-testid="auth-password" required minLength={6}
                  className="w-full h-14 text-lg px-5 pr-12 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-[#F9FAFB] outline-none transition" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} data-testid="auth-submit"
              className="w-full h-16 bg-[#FF5C00] hover:bg-[#E05200] text-white rounded-xl text-xl font-semibold transition-all active:scale-[0.97] shadow-lg shadow-orange-500/20 disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                <>{mode === 'login' ? <LogIn className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                {mode === 'login' ? 'Inloggen' : 'Account aanmaken'}</>
              )}
            </button>
          </form>

          <p className="text-center text-sm text-slate-400 mt-5">
            {mode === 'login' ? 'Nog geen account?' : 'Al een account?'}{' '}
            <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
              data-testid="auth-switch-mode"
              className="text-[#FF5C00] font-semibold hover:underline">
              {mode === 'login' ? 'Registreer hier' : 'Log hier in'}
            </button>
          </p>

          <p className="text-center text-xs text-slate-300 mt-4">
            {mode === 'login' ? <>Standaard: <span className="font-bold text-slate-400">admin@vastgoed.sr / admin123</span></> :
              <>14 dagen gratis · Annuleer wanneer u wilt</>}
          </p>
        </div>
      </div>
    </div>
  );
}

function RegisterSuccess({ plan, company, bankDetails, onContinue }) {
  const ref = `ABONNEMENT — ${company || ''} — ${new Date().toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}`;
  return (
    <div className="min-h-screen bg-orange-500 flex flex-col">
      <Header />
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
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
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [view, setView] = useState('pin'); // pin | login | register
  const [skipRedirect, setSkipRedirect] = useState(false);

  useEffect(() => {
    document.title = 'Vastgoed Kiosk - Login';
  }, []);

  // Auto-redirect if already logged (but not when we're showing the success screen)
  useEffect(() => {
    if (!loading && user && !skipRedirect) {
      navigate('/admin', { replace: true });
    }
  }, [user, loading, navigate, skipRedirect]);

  if (view === 'login' || view === 'register') {
    return <PasswordView initialMode={view} onBack={() => setView('pin')}
      onRegistered={() => setSkipRedirect(true)} />;
  }
  return (
    <PinLanding
      onSuccess={() => navigate('/kiosk')}
      onPassword={() => setView('login')}
      onRegister={() => setView('register')}
    />
  );
}
