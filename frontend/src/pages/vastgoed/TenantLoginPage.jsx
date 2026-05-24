import { useState, useEffect } from 'react';
import { useBrandedNavigate } from '../../lib/branded-nav';
import { Loader2, Delete, ArrowLeft, Mail, Phone, Home } from 'lucide-react';
import { api, formatError } from '../../lib/api';
import { setPreferredRole } from '../../lib/pwaRole';

export default function TenantLoginPage() {
  const navigate = useBrandedNavigate();
  const [identifier, setIdentifier] = useState('');
  const [step, setStep] = useState('identifier'); // identifier | pin
  const [pin, setPin] = useState(['', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Mijn huurportaal - inloggen';
    if (localStorage.getItem('tenant_token')) {
      navigate('/huurder/portaal', { replace: true });
    }
  }, [navigate]);

  // Edge-to-edge brand achtergrond + body class zodat iOS PWA standalone
  // geen witte strook onderaan of bij de notch toont (zelfde patroon als
  // de Beheerder Login en de Kiosk).
  useEffect(() => {
    const BRAND_CREAM = '#FFF7F0';
    document.body.classList.add('tenant-mode');
    const prevHtmlBg = document.documentElement.style.backgroundColor;
    const prevBodyBg = document.body.style.backgroundColor;
    document.documentElement.style.backgroundColor = BRAND_CREAM;
    document.body.style.backgroundColor = BRAND_CREAM;
    return () => {
      document.body.classList.remove('tenant-mode');
      document.documentElement.style.backgroundColor = prevHtmlBg;
      document.body.style.backgroundColor = prevBodyBg;
    };
  }, []);

  const verify = async (code) => {
    setLoading(true); setError('');
    try {
      const { data } = await api.post('/tenant-portal/login', { identifier, pin: code });
      if (data?.token) localStorage.setItem('tenant_token', data.token);
      setPreferredRole('tenant');
      navigate('/huurder/portaal', { replace: true });
    } catch (e) {
      setError(formatError(e, 'Onjuiste PIN'));
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
    <div
      className="flex flex-col"
      style={{
        position: 'fixed', inset: 0,
        background: 'linear-gradient(135deg, #FFF7F0 0%, #FFEAD3 100%)',
        overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
    >
      <header className="px-5 py-4 flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#FF8A3D] to-[#C74600] p-2 shadow-lg">
          <img src="/kiosk-icons/kiosk-512.png" alt="SuriRent" className="w-full h-full object-contain" />
        </div>
        <div>
          <p className="text-base font-black text-slate-900">SuriRent N.V.</p>
          <p className="text-xs text-[#FF5C00] font-bold uppercase tracking-widest">Mijn Huurportaal</p>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-5">
        <div className="bg-white rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.12)] w-full max-w-md p-6 sm:p-8" data-testid="tenant-login-card">

          {step === 'identifier' && (
            <>
              <div className="text-center mb-6">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#FF8A3D] to-[#C74600] flex items-center justify-center mx-auto mb-4 shadow-xl shadow-orange-500/30">
                  <Home className="w-10 h-10 text-white" />
                </div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">Welkom thuis</h1>
                <p className="text-sm text-slate-500 mt-1">Log in om uw huurgegevens te bekijken</p>
              </div>

              {error && (
                <div className="mb-4 p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm text-center" data-testid="tenant-login-error">
                  {error}
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-slate-500">E-mail of telefoonnummer</label>
                  <div className="relative mt-1">
                    <input value={identifier} onChange={(e) => setIdentifier(e.target.value)}
                      data-testid="tenant-identifier"
                      type="text" inputMode="email"
                      onKeyDown={(e) => e.key === 'Enter' && identifier && setStep('pin')}
                      placeholder="jan@example.sr of +597 8001234"
                      className="w-full h-14 pl-12 pr-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none text-base" />
                    <Mail className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                <button onClick={() => { setError(''); identifier ? setStep('pin') : setError('Vul uw e-mail of telefoon in'); }}
                  data-testid="tenant-next"
                  className="w-full h-12 bg-[#FF5C00] hover:bg-[#E05200] text-white rounded-xl font-bold flex items-center justify-center gap-2">
                  Verder
                </button>

                <div className="text-center pt-4 border-t border-slate-100">
                  <p className="text-xs text-slate-400">Nog geen PIN? Vraag uw verhuurder om er een in te stellen.</p>
                </div>
              </div>
            </>
          )}

          {step === 'pin' && (
            <>
              <button onClick={() => { setStep('identifier'); setPin(['', '', '', '']); setError(''); }}
                data-testid="tenant-back-to-id"
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-3 font-bold">
                <ArrowLeft className="w-4 h-4" /> {identifier}
              </button>

              <div className="text-center mb-5">
                <h2 className="text-2xl font-black text-slate-900">Voer uw PIN in</h2>
                <p className="text-sm text-slate-400 mt-1">4-cijferige PIN code</p>
              </div>

              {error && (
                <div className="mb-4 p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-center text-sm font-medium" data-testid="tenant-pin-error">
                  {error}
                </div>
              )}

              <div className="flex justify-center gap-3 mb-6">
                {pin.map((digit, i) => (
                  <div key={`tenant-pin-slot-${i}`} data-testid={`tenant-pin-input-${i}`}
                    className={`text-center font-bold rounded-xl border-2 transition-all w-14 h-16 text-2xl flex items-center justify-center ${
                      error ? 'border-red-400 bg-red-50 text-red-600'
                        : digit ? 'border-[#FF5C00] bg-orange-50 text-[#FF5C00]'
                        : 'border-slate-200 bg-[#F9FAFB] text-slate-300'
                    }`}>
                    {digit ? '●' : ''}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2 max-w-[300px] mx-auto">
                {['1','2','3','4','5','6','7','8','9','_e','0','DEL'].map((k) => (
                  k === '_e' ? <div key="e" /> : (
                    <button key={k} type="button" onClick={() => handleKey(k)} disabled={loading}
                      data-testid={`tenant-keypad-${k}`}
                      className={`h-14 text-xl font-bold rounded-xl transition-all active:scale-90 disabled:opacity-50 flex items-center justify-center ${
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
            </>
          )}
        </div>
      </main>
    </div>
  );
}
