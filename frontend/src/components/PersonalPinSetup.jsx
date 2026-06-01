// PersonalPinSetup — eenmalige prompt na inloggen op een PWA-installatie.
// Vraagt de admin om een 4-cijferige persoonlijke PIN in te stellen voor
// snel re-loggen. Slaat een lokale flag op om de prompt niet opnieuw te
// tonen na succesvolle setup, of na "later" keuze (per device).
import { useState, useEffect } from 'react';
import { api, formatError } from '../lib/api';
import { isStandalonePWA } from '../lib/pwaRole';
import { Loader2, Check, X as XIcon, KeyRound } from 'lucide-react';

const SKIP_KEY = 'personal_pin_setup_skipped';

export default function PersonalPinSetup() {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState(['', '', '', '']);
  const [confirm, setConfirm] = useState(['', '', '', '']);
  const [step, setStep] = useState('enter'); // enter | confirm | saving | done
  const [error, setError] = useState('');

  useEffect(() => {
    // Toon alleen wanneer: (a) PWA standalone, (b) admin token aanwezig,
    // (c) gebruiker heeft nog geen PIN, (d) niet eerder geskipped op dit device.
    if (!isStandalonePWA()) return;
    let skipped = false;
    try { skipped = localStorage.getItem(SKIP_KEY) === '1'; } catch { /* ignore */ }
    if (skipped) return;
    if (!localStorage.getItem('admin_token')) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/auth/personal-pin/status');
        if (!cancelled && data && data.has_pin === false) setOpen(true);
      } catch { /* gracefully degrade */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const enterDigit = (val, slot, setter, arr) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...arr];
    next[slot] = val;
    setter(next);
    if (val && slot < 3) {
      const el = document.querySelector(`[data-pin-slot="${step}-${slot + 1}"]`);
      el && el.focus();
    }
  };

  const skipForNow = () => {
    try { localStorage.setItem(SKIP_KEY, '1'); } catch { /* ignore */ }
    setOpen(false);
  };

  const goConfirm = () => {
    if (pin.some((d) => d === '')) {
      setError('Vul alle 4 cijfers in.');
      return;
    }
    setError('');
    setStep('confirm');
    setTimeout(() => {
      const el = document.querySelector('[data-pin-slot="confirm-0"]');
      el && el.focus();
    }, 50);
  };

  const submit = async () => {
    if (confirm.some((d) => d === '')) {
      setError('Vul alle 4 cijfers in om te bevestigen.');
      return;
    }
    if (pin.join('') !== confirm.join('')) {
      setError('PINs komen niet overeen. Probeer opnieuw.');
      setConfirm(['', '', '', '']);
      return;
    }
    setStep('saving'); setError('');
    try {
      await api.post('/auth/personal-pin/setup', { pin: pin.join('') });
      setStep('done');
      setTimeout(() => setOpen(false), 1600);
    } catch (e) {
      setStep('confirm');
      setError(formatError(e, 'PIN kon niet worden opgeslagen.'));
    }
  };

  if (!open) return null;

  const activePin = step === 'confirm' ? confirm : pin;
  const setter = step === 'confirm' ? setConfirm : setPin;

  return (
    <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center"
      data-testid="personal-pin-setup-modal">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md p-6 lg:p-8 shadow-2xl">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-[#FF5C00]" />
            </span>
            <h3 className="text-lg font-black text-slate-900">Persoonlijke PIN instellen</h3>
          </div>
          <button onClick={skipForNow} data-testid="personal-pin-skip"
            className="w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {step === 'done' ? (
          <div className="py-10 text-center">
            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-emerald-100 flex items-center justify-center">
              <Check className="w-8 h-8 text-emerald-600" strokeWidth={3} />
            </div>
            <p className="text-base font-black text-slate-900">PIN opgeslagen!</p>
            <p className="text-sm text-slate-500 mt-1">Volgende keer kunt u snel inloggen met uw PIN.</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-600 leading-relaxed mb-5">
              {step === 'enter'
                ? 'Stel een 4-cijferige PIN in. Hiermee kunt u snel re-loggen zonder uw wachtwoord opnieuw te typen.'
                : 'Voer dezelfde PIN nog een keer in ter bevestiging.'}
            </p>
            <div className="flex items-center justify-center gap-3 mb-5">
              {activePin.map((d, i) => (
                <input
                  key={`${step}-${i}`}
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  data-pin-slot={`${step}-${i}`}
                  data-testid={`personal-pin-${step}-${i}`}
                  onChange={(e) => enterDigit(e.target.value, i, setter, activePin)}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace' && !activePin[i] && i > 0) {
                      const prev = document.querySelector(`[data-pin-slot="${step}-${i - 1}"]`);
                      prev && prev.focus();
                    }
                  }}
                  className="w-14 h-16 rounded-xl border-2 border-slate-200 text-center text-2xl font-black text-slate-900 focus:border-[#FF5C00] focus:ring-2 focus:ring-orange-100 outline-none"
                />
              ))}
            </div>
            {error && (
              <p className="text-sm font-bold text-red-600 text-center mb-3">{error}</p>
            )}
            {step === 'saving' ? (
              <div className="flex items-center justify-center gap-2 text-slate-700 py-3">
                <Loader2 className="w-4 h-4 animate-spin" /> <span className="text-sm font-bold">Opslaan…</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <button
                  onClick={step === 'enter' ? goConfirm : submit}
                  data-testid={step === 'enter' ? 'personal-pin-next' : 'personal-pin-save'}
                  className="w-full h-12 rounded-xl bg-[#FF5C00] hover:bg-[#C74600] text-white font-black text-sm transition-colors">
                  {step === 'enter' ? 'Volgende →' : 'PIN opslaan'}
                </button>
                <button onClick={skipForNow}
                  className="w-full h-10 text-sm font-bold text-slate-500 hover:text-slate-700">
                  Later instellen
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
