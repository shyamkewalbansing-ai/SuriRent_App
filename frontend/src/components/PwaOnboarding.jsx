// =====================================================================
// PwaOnboarding — eerste-keer welkom-scherm na PWA installatie.
//
// Wordt alleen getoond op de generieke /login als:
//   1) De gebruiker komt vanaf de PWA (?source=pwa of standalone mode)
//   2) Er nog geen keuze is opgeslagen in localStorage
//
// Toont drie grote witte pill-knoppen die de gebruiker stuurt naar:
//   - Register wizard (nieuw bedrijf)
//   - Email/PIN login (bestaand account)
//   - Huurderportaal (huurder login)
//
// De keuze wordt onthouden zodat de PWA bij volgende opens direct
// naar de juiste flow gaat.
// =====================================================================
import { useEffect } from 'react';
import { Building2, KeyRound, User, ArrowRight, Sparkles, Lightbulb } from 'lucide-react';

export const PWA_ONBOARDING_KEY = 'pwa_onboarding_choice';

export default function PwaOnboarding({ onChoice, primary = '#FF5C00' }) {
  // Schilder html+body in primary kleur zodat de PWA notch + home-indicator
  // gebieden niet wit doorlekken (zelfde truc als PinLanding/OrangeShell).
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

  const select = (choice) => {
    try { localStorage.setItem(PWA_ONBOARDING_KEY, choice); } catch { /* ignore */ }
    onChoice?.(choice);
  };

  const choices = [
    {
      key: 'bedrijf',
      icon: Building2,
      title: 'Ik heb een bedrijf',
      sub: 'Maak een nieuw account aan en start in 30 seconden',
      cta: 'Account aanmaken',
      badge: '14 dagen gratis',
    },
    {
      key: 'login',
      icon: KeyRound,
      title: 'Ik heb al een account',
      sub: 'Log in met e-mail, wachtwoord of PIN',
      cta: 'Inloggen',
    },
    {
      key: 'huurder',
      icon: User,
      title: 'Ik ben huurder',
      sub: 'Bekijk uw saldo, betalingen en onderhoudsverzoeken',
      cta: 'Naar huurderportaal',
    },
  ];

  return (
    <div className="flex flex-col text-white relative overflow-hidden" style={{
      position: 'fixed', inset: 0, zIndex: 200,
      backgroundColor: primary,
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      paddingLeft: 'env(safe-area-inset-left, 0px)',
      paddingRight: 'env(safe-area-inset-right, 0px)',
    }} data-testid="pwa-onboarding">

      {/* Decoratieve blur-cirkels (gelijk aan PinLanding/OrangeShell) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden -z-0">
        <div className="absolute -top-32 -right-40 w-[600px] h-[600px] rounded-full opacity-20 blur-3xl"
          style={{ background: 'rgba(255,255,255,0.4)' }} />
        <div className="absolute top-[20%] -left-32 w-[400px] h-[400px] rounded-full opacity-15 blur-3xl"
          style={{ background: 'rgba(255,176,99,0.6)' }} />
        <svg className="absolute top-0 right-0 w-full h-full opacity-[0.08]" preserveAspectRatio="none" viewBox="0 0 400 800">
          <path d="M0,200 Q200,150 400,250 L400,300 Q200,200 0,250 Z" fill="white" />
          <path d="M0,360 Q200,310 400,410 L400,460 Q200,360 0,410 Z" fill="white" />
        </svg>
      </div>

      {/* CONTENT */}
      <div className="relative z-10 flex-1 min-h-0 overflow-y-auto flex flex-col items-center px-5 sm:px-8"
        style={{ paddingTop: 'clamp(20px, 4vh, 48px)', paddingBottom: 'clamp(20px, 4vh, 40px)' }}>

        {/* Logo cirkel — gelijk aan PIN-pad */}
        <div className="rounded-full bg-white p-1 shadow-[0_12px_28px_-8px_rgba(0,0,0,0.35)] mb-4"
          style={{
            width: 'clamp(76px, 11vh, 110px)',
            height: 'clamp(76px, 11vh, 110px)',
          }}>
          <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #FFF6D6 0%, #F8C260 60%, #D4A037 100%)' }}>
            <img src="/kiosk-icons/kiosk-512.png" alt="SuriRent"
              className="w-[70%] h-[70%] object-contain drop-shadow-md" />
          </div>
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          <span className="text-[10px] font-extrabold tracking-[0.18em] uppercase">Welkom bij SuriRent</span>
        </div>

        <h1 className="font-black tracking-tight text-white text-center mb-2"
          style={{ fontSize: 'clamp(26px, 4.5vh, 40px)', lineHeight: '1.05' }}>
          Wat brengt u<br />vandaag hier?
        </h1>
        <p className="text-white/80 text-center font-medium mb-6 max-w-sm"
          style={{ fontSize: 'clamp(13px, 1.7vh, 16px)' }}>
          Kies hieronder wat het beste bij u past — we onthouden uw keuze voor de volgende keer.
        </p>

        {/* 3 KEUZES */}
        <div className="w-full max-w-md space-y-3">
          {choices.map((c) => (
            <button key={c.key} type="button" onClick={() => select(c.key)}
              data-testid={`pwa-onboarding-${c.key}`}
              className="w-full bg-white text-[#0F0F0F] rounded-2xl p-4 sm:p-5 shadow-[0_8px_20px_-6px_rgba(0,0,0,0.35)] hover:shadow-[0_12px_28px_-6px_rgba(0,0,0,0.4)] active:scale-[0.98] transition-all flex items-center gap-4 text-left">
              <div className="shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #FFE3CC 0%, #FFB066 100%)' }}>
                <c.icon className="w-6 h-6 sm:w-7 sm:h-7 text-[#C74600]" strokeWidth={2.4} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <h3 className="font-black text-base sm:text-lg leading-tight">{c.title}</h3>
                  {c.badge && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-extrabold tracking-wider uppercase">
                      {c.badge}
                    </span>
                  )}
                </div>
                <p className="text-slate-500 text-xs sm:text-sm font-medium leading-snug">{c.sub}</p>
              </div>
              <ArrowRight className="shrink-0 w-5 h-5 text-slate-400" />
            </button>
          ))}
        </div>

        {/* "Wist je dat?" — uitleg over manifest shortcuts.
            Geconfigureerd in /app/frontend/public/manifest.json: Open Kiosk /
            Beheer / Mijn huurportaal. Gebruikers ontdekken deze via een
            long-press op het PWA icoon op hun home-screen (iOS én Android). */}
        <div className="w-full max-w-md mt-5 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 p-4"
          data-testid="pwa-onboarding-tip">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center">
              <Lightbulb className="w-4.5 h-4.5 text-white" strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <p className="text-white font-extrabold text-sm leading-tight">
                Snelkoppelingen direct vanaf je home-screen
              </p>
              <p className="text-white/75 text-xs leading-snug mt-1">
                Houd het SuriRent-icoon op je telefoon ingedrukt voor directe toegang tot
                <span className="font-bold text-white"> Kiosk</span>,
                <span className="font-bold text-white"> Beheer</span> of
                <span className="font-bold text-white"> Mijn Huurportaal</span> —
                zonder eerst dit scherm te zien.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-white/60 text-[11px] font-medium text-center mt-4">
          U kunt deze keuze later altijd wijzigen via uw profiel.
        </p>
      </div>
    </div>
  );
}
