import { useState, useEffect } from 'react';
import { Loader2, Delete, KeyRound, UserPlus, LogIn, HelpCircle } from 'lucide-react';
import { api, formatError } from '../../../lib/api';
import { setPreferredRole } from '../../../lib/pwaRole';
import { setKioskEmployee, clearKioskEmployee } from '../../../components/KioskEmployee';
import Header from './LoginHeader';
import HelpModal from './HelpModal';

function PinLanding({ onSuccess, onPassword, onRegister, branding, pwaTarget }) {
  const [pin, setPin] = useState(['', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  // Persoonlijke PIN-modus: als dit apparaat een onthouden gebruiker heeft,
  // gebruiken we PIN-by-email (in plaats van de gedeelde kiosk-PIN). Dit
  // activeert de "Welkom [naam]" ervaring zoals ABN AMRO.
  const [deviceUser, setDeviceUser] = useState(() => {
    try {
      const email = localStorage.getItem('device_user_email') || '';
      const name = localStorage.getItem('device_user_name') || '';
      return email ? { email, name: name || email.split('@')[0] } : null;
    } catch { return null; }
  });

  const primary = branding?.primary_color || '#FF5C00';
  const appName = branding?.app_name || 'SuriRent';
  const logoUrl = branding?.logo_url ? branding._logoResolved : '/kiosk-icons/kiosk-512.png';
  const isAdminTarget = pwaTarget === 'admin';

  // Fix witte strook onder home-indicator op iOS PWA: schilder html+body in
  // dezelfde brand-kleur als de PinLanding zelf. `position: fixed; inset: 0`
  // dekt niet altijd de gesture-zone onder de safe-area op standalone iOS,
  // dus we kleuren de onderliggende html/body ook. Cleanup on unmount.
  useEffect(() => {
    const prevHtml = document.documentElement.style.backgroundColor;
    const prevBody = document.body.style.backgroundColor;
    document.documentElement.style.backgroundColor = primary;
    document.body.style.backgroundColor = primary;
    return () => {
      document.documentElement.style.backgroundColor = prevHtml;
      document.body.style.backgroundColor = prevBody;
    };
  }, [primary]);

  const forgetDevice = () => {
    try {
      localStorage.removeItem('device_user_email');
      localStorage.removeItem('device_user_name');
    } catch { /* ignore */ }
    setDeviceUser(null);
  };

  const verify = async (code) => {
    setLoading(true); setError('');
    try {
      if (deviceUser) {
        // Persoonlijke PIN login — gebruikt user.personal_pin_hash op backend.
        const { data } = await api.post('/auth/personal-pin/login', {
          email: deviceUser.email, pin: code,
        });
        if (data?.access_token) localStorage.setItem('admin_token', data.access_token);
        setPreferredRole('admin');
        // Fire-and-forget: device_qr_token issuing in achtergrond zodat de
        // gebruiker er NIET op moet wachten. Dit voorkomt 200-500ms extra
        // latency bij elke PIN-login. AuthProvider.refresh() backfilt
        // sowieso bij volgende session-restore.
        api.post('/auth/device-qr-token/issue').then((r) => {
          if (r?.data?.device_qr_token) {
            try { localStorage.setItem('device_qr_token', r.data.device_qr_token); } catch { /* ignore */ }
          }
        }).catch(() => { /* niet-kritiek */ });
        onSuccess();
        return;
      }
      // Geen onthouden gebruiker → val terug op gedeelde kiosk PIN.
      const { data } = await api.post('/auth/kiosk-pin', {
        pin: code,
        company_slug: branding?.slug || undefined,
        company_id: branding?.company_id || undefined,
      });
      if (data?.token) localStorage.setItem('kiosk_token', data.token);
      if (data?.company) localStorage.setItem('kiosk_company', JSON.stringify(data.company));
      if (data?.employee?.id) {
        try { localStorage.removeItem('admin_token'); } catch { /* ignore */ }
        setKioskEmployee({
          id: data.employee.id,
          name: data.employee.name || 'Medewerker',
          pin: data.employee.pin || code,
        });
        setPreferredRole('kiosk');
      } else {
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

  // Numpad letters voor sub-labels (ABN AMRO stijl)
  const NUMPAD_LETTERS = {
    '2': 'ABC', '3': 'DEF', '4': 'GHI', '5': 'JKL',
    '6': 'MNO', '7': 'PQRS', '8': 'TUV', '9': 'WXYZ',
  };

  // Desktop variant — gestileerd EXACT zoals PasswordView (email login + register).
  // Oranje achtergrond, witte card met ronde hoeken, oranje icoon-square boven,
  // "Beheerder Login" titel, subtitel, dan PIN dots + numpad in een net rooster.
  // Klanten op telefoon zien NOG STEEDS de full-screen ABN-stijl ervaring.
  const isDesktop = (() => {
    try { return typeof window !== 'undefined' && window.innerWidth >= 1024; }
    catch { return false; }
  })();

  if (isDesktop) {
    return (
      <div className="flex flex-col" style={{
        position: 'fixed', inset: 0,
        backgroundColor: primary,
        overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}>
        <Header branding={branding} />
        <div className="flex-1 flex items-start sm:items-center justify-center p-3 sm:p-6">
          <div className="bg-white rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] w-full max-w-xl p-5 sm:p-8 md:p-10"
            data-testid="auth-form">
            {/* Top action bar: Help — rechtsboven */}
            <div className="flex items-center justify-end mb-4">
              <button onClick={() => setShowHelp(true)} data-testid="login-help-btn"
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors">
                <HelpCircle className="w-3.5 h-3.5" /> Help
              </button>
            </div>

            {/* Titel: zelfde structuur als PasswordView */}
            <div className="text-center mb-5">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-orange-500/20"
                style={{ backgroundColor: primary }}>
                <KeyRound className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight" data-testid="pin-welcome">
                {deviceUser ? `Welkom, ${deviceUser.name}` : 'PIN Login'}
              </h2>
              <p className="text-sm text-slate-400 mt-1" data-testid="pin-company-name">
                {deviceUser
                  ? 'Vul uw persoonlijke PIN in om verder te gaan'
                  : `Vul de 4-cijferige PIN in voor ${appName}`}
              </p>
            </div>

            {error && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-center text-sm font-medium" data-testid="pin-error">
                {error}
              </div>
            )}

            {/* PIN dots */}
            <div className="flex items-center justify-center gap-5 mb-6">
              {pin.map((digit, i) => (
                <div key={`pin-slot-${i}`} data-testid={`pin-input-${i}`}
                  className={`w-4 h-4 rounded-full transition-all ${
                    error ? 'bg-red-400 scale-110' : digit ? 'scale-110' : 'bg-slate-200'
                  }`}
                  style={digit && !error ? { backgroundColor: primary } : {}} />
              ))}
            </div>

            {/* Numpad */}
            <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
              {['1','2','3','4','5','6','7','8','9','_e','0','DEL'].map((k) => (
                k === '_e' ? <div key="e" /> : (
                  <button key={k} type="button" onClick={() => handleKey(k)} disabled={loading}
                    data-testid={`keypad-${k}`}
                    className="h-14 rounded-xl bg-slate-50 hover:bg-orange-50 active:bg-orange-100 active:scale-95 disabled:opacity-50 flex flex-col items-center justify-center transition-all border border-slate-100">
                    {k === 'DEL' ? (
                      <Delete className="w-5 h-5 text-slate-600" />
                    ) : (
                      <>
                        <span className="text-2xl font-black text-slate-900 leading-none">{k}</span>
                        {NUMPAD_LETTERS[k] && (
                          <span className="text-[9px] font-bold tracking-[0.18em] text-slate-400 mt-0.5">{NUMPAD_LETTERS[k]}</span>
                        )}
                      </>
                    )}
                  </button>
                )
              ))}
            </div>

            {loading && (
              <div className="flex items-center justify-center gap-2 text-slate-600 mt-3">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm font-bold">Verifiëren…</span>
              </div>
            )}

            {/* Footer links */}
            <div className="flex items-center justify-center gap-4 mt-6 pt-4 border-t border-slate-100 text-xs font-bold flex-wrap">
              {deviceUser ? (
                <>
                  <button onClick={forgetDevice} data-testid="login-switch-user-btn"
                    className="flex items-center gap-1.5 text-slate-500 hover:text-slate-900">
                    <KeyRound className="w-3.5 h-3.5" /> Andere gebruiker
                  </button>
                  <span className="text-slate-300">•</span>
                  <button onClick={onPassword} data-testid="login-password-btn"
                    className="flex items-center gap-1.5 text-slate-500 hover:text-slate-900">
                    <LogIn className="w-3.5 h-3.5" /> Inloggen met wachtwoord
                  </button>
                </>
              ) : (
                <>
                  <button onClick={onPassword} data-testid="login-password-btn"
                    className="flex items-center gap-1.5 text-slate-500 hover:text-slate-900">
                    <KeyRound className="w-3.5 h-3.5" /> Inloggen met e-mail
                  </button>
                  {!branding?.slug && (
                    <>
                      <span className="text-slate-300">•</span>
                      <button onClick={onRegister} data-testid="login-register-btn"
                        className="flex items-center gap-1.5 text-slate-500 hover:text-slate-900">
                        <UserPlus className="w-3.5 h-3.5" /> Nieuw account
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Modals */}
        {showHelp && <HelpModal onClose={() => setShowHelp(false)} primary={primary} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col text-white relative overflow-hidden" style={{
      position: 'fixed', inset: 0,
      backgroundColor: primary,
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      paddingLeft: 'env(safe-area-inset-left, 0px)',
      paddingRight: 'env(safe-area-inset-right, 0px)',
    }}>
      {/* Diagonal decorative background pattern — ABN AMRO inspired */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden -z-0">
        <div className="absolute -top-32 -right-40 w-[600px] h-[600px] rounded-full opacity-20 blur-3xl"
          style={{ background: 'rgba(255,255,255,0.4)' }} />
        <div className="absolute top-[20%] -left-32 w-[400px] h-[400px] rounded-full opacity-15 blur-3xl"
          style={{ background: 'rgba(255,176,99,0.6)' }} />
        {/* Diagonal layered curves */}
        <svg className="absolute top-0 right-0 w-full h-full opacity-[0.08]" preserveAspectRatio="none" viewBox="0 0 400 800">
          <path d="M0,200 Q200,150 400,250 L400,300 Q200,200 0,250 Z" fill="white" />
          <path d="M0,360 Q200,310 400,410 L400,460 Q200,360 0,410 Z" fill="white" />
        </svg>
      </div>

      {/* TOP ACTION BAR — Help rechtsboven */}
      <div className="relative z-10 flex items-center justify-between px-5"
        style={{ paddingTop: 'clamp(12px, 2vh, 24px)', paddingBottom: 'clamp(8px, 1.5vh, 16px)' }}>
        <button onClick={() => setShowHelp(true)} data-testid="login-help-btn"
          className="flex items-center gap-2 px-3 py-2 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-sm border border-white/20 transition-all text-white text-sm font-bold">
          <HelpCircle className="w-4 h-4" />
          Help
        </button>
      </div>

      {/* CENTER — Welkom + profielfoto + naam + PIN */}
      <div className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-start overflow-y-auto"
        style={{ paddingTop: 'clamp(8px, 2vh, 24px)', paddingBottom: 'clamp(16px, 3vh, 32px)' }}>

        <h1 className="font-black tracking-tight text-white text-center"
          style={{ fontSize: 'clamp(28px, 5vh, 44px)', lineHeight: '1.05' }}
          data-testid="pin-welcome">
          Welkom{deviceUser ? ',' : ''}
        </h1>

        {/* Profielfoto in cirkel */}
        <div className="relative mt-4 mb-3">
          <div className="rounded-full bg-white p-1 shadow-[0_12px_28px_-8px_rgba(0,0,0,0.35)]"
            style={{
              width: 'clamp(76px, 12vh, 110px)',
              height: 'clamp(76px, 12vh, 110px)',
            }}>
            <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, #FFF6D6 0%, #F8C260 60%, #D4A037 100%)`,
              }}>
              <img src={logoUrl} alt="logo"
                className="w-[70%] h-[70%] object-contain drop-shadow-md"
                data-testid="pin-profile-photo" />
            </div>
          </div>
          {/* Online dot indicator */}
          <span className="absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-white bg-emerald-400 shadow-md" />
        </div>

        <p className="text-white/90 font-black text-center uppercase tracking-wider"
          style={{ fontSize: 'clamp(13px, 1.8vh, 17px)' }}
          data-testid="pin-company-name">
          {deviceUser ? deviceUser.name : appName}
        </p>
        <p className="text-white/80 text-center font-medium mt-2 px-6"
          style={{ fontSize: 'clamp(12px, 1.6vh, 15px)', maxWidth: '340px' }}>
          {deviceUser
            ? 'Vul je persoonlijke PIN in om verder te gaan'
            : 'Vul je 4-cijferige PIN in om verder te gaan'}
        </p>

        {error && (
          <div className="mt-3 px-5 py-2 rounded-full bg-red-500/95 text-white text-xs font-bold shadow-lg"
            data-testid="pin-error">
            {error}
          </div>
        )}

        {/* PIN dots */}
        <div className="flex items-center mt-5" style={{ gap: 'clamp(14px, 3vw, 24px)' }}>
          {pin.map((digit, i) => (
            <div key={`pin-slot-${i}`} data-testid={`pin-input-${i}`}
              className={`rounded-full transition-all ${
                error ? 'bg-red-300 scale-110' : digit ? 'bg-white scale-110' : 'bg-white/35'
              }`}
              style={{
                width: 'clamp(14px, 1.8vh, 18px)',
                height: 'clamp(14px, 1.8vh, 18px)',
              }} />
          ))}
        </div>

        {/* Numpad — ABN-stijl met letters subscript */}
        <div className="grid grid-cols-3 mt-6"
          style={{
            gap: 'clamp(10px, 1.5vh, 16px) clamp(20px, 6vw, 40px)',
            width: 'min(340px, 88%)',
          }}>
          {['1','2','3','4','5','6','7','8','9','_e','0','DEL'].map((k) => (
            k === '_e' ? <div key="e" /> : (
              <button key={k} type="button" onClick={() => handleKey(k)} disabled={loading}
                data-testid={`keypad-${k}`}
                className="flex flex-col items-center justify-center text-white active:scale-95 disabled:opacity-50 transition-all"
                style={{ height: 'clamp(54px, 8vh, 70px)' }}>
                {k === 'DEL' ? (
                  <Delete style={{ width: 'clamp(22px, 3vh, 28px)', height: 'clamp(22px, 3vh, 28px)' }} />
                ) : (
                  <>
                    <span className="font-black leading-none"
                      style={{ fontSize: 'clamp(28px, 4.5vh, 38px)' }}>
                      {k}
                    </span>
                    {NUMPAD_LETTERS[k] && (
                      <span className="font-bold tracking-[0.18em] text-white/70 mt-0.5"
                        style={{ fontSize: 'clamp(9px, 1.2vh, 11px)' }}>
                        {NUMPAD_LETTERS[k]}
                      </span>
                    )}
                  </>
                )}
              </button>
            )
          ))}
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-white/80 mt-3">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm font-bold">Verifiëren…</span>
          </div>
        )}

        {/* Onderaan: Beheerder login + nieuw account */}
        <div className="flex items-center gap-4 mt-4 text-xs font-bold flex-wrap justify-center px-4">
          {deviceUser ? (
            <>
              <button onClick={forgetDevice} data-testid="login-switch-user-btn"
                className="flex items-center gap-1.5 text-white/80 hover:text-white">
                <KeyRound className="w-3.5 h-3.5" /> Andere gebruiker
              </button>
              <span className="text-white/40">•</span>
              <button onClick={onPassword} data-testid="login-password-btn"
                className="flex items-center gap-1.5 text-white/80 hover:text-white">
                <LogIn className="w-3.5 h-3.5" /> Inloggen met wachtwoord
              </button>
            </>
          ) : (
            <>
              <button onClick={onPassword} data-testid="login-password-btn"
                className="flex items-center gap-1.5 text-white/80 hover:text-white">
                <KeyRound className="w-3.5 h-3.5" /> Inloggen met e-mail
              </button>
              {!branding?.slug && (
                <>
                  <span className="text-white/40">•</span>
                  <button onClick={onRegister} data-testid="login-register-btn"
                    className="flex items-center gap-1.5 text-white/80 hover:text-white">
                    <UserPlus className="w-3.5 h-3.5" /> Nieuw account
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} primary={primary} />}
    </div>
  );
}

// =============================================================================
// HelpModal — uitleg over hoe PIN login werkt
// =============================================================================

export default PinLanding;
