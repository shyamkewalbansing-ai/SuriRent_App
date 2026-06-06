// =============================================================================
// LoginHeader — top-bar van de login flow.
// Toont logo + app-naam links en de Klok (Suriname tijdzone) rechts.
// =============================================================================
import { useState, useEffect } from 'react';

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


export { Header as default, Clock };
