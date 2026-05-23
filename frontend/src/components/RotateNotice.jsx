import { useEffect, useState } from 'react';

/**
 * RotateNotice — toont een fullscreen "draai uw scherm" overlay zodra een
 * smal apparaat (telefoon — max 926px korte zijde, dekkend iPhone 15 Pro Max)
 * in landscape wordt gehouden. Werkt voor iPhone PWA en Android PWA (geen
 * native orientation-lock-API beschikbaar op iOS standalone).
 *
 * iPad blijft ongemoeid: de check op `max-device-width 926px` zorgt dat
 * tablets nooit deze overlay zien.
 *
 * Op Android (en Chrome desktop in mobile-emulation) proberen we ook nog
 * `screen.orientation.lock('portrait')` — werkt alleen in PWA standalone
 * en stil falen we wanneer niet ondersteund.
 */
export default function RotateNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Probeer hard te locken op Android PWA — best effort.
    const tryLock = async () => {
      try {
        if (window.screen?.orientation?.lock) {
          await window.screen.orientation.lock('portrait');
        }
      } catch { /* iOS / niet-standalone: niet beschikbaar */ }
    };
    tryLock();

    // Detectie via CSS-class op de body zodat we exact dezelfde breakpoint
    // gebruiken voor de overlay-zichtbaarheid (zie index.css).
    const mq = window.matchMedia('(orientation: landscape) and (max-device-width: 926px), (orientation: landscape) and (max-height: 500px) and (max-width: 926px)');
    const update = () => setShow(mq.matches);
    update();
    if (mq.addEventListener) mq.addEventListener('change', update);
    else mq.addListener(update);
    window.addEventListener('orientationchange', update);
    window.addEventListener('resize', update);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', update);
      else mq.removeListener(update);
      window.removeEventListener('orientationchange', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  if (!show) return null;
  return (
    <div
      className="fixed inset-0 z-[100] bg-[#FF5C00] text-white flex flex-col items-center justify-center px-8 text-center"
      data-testid="rotate-notice"
      role="alertdialog"
      aria-modal="true"
    >
      <div className="w-20 h-20 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center mb-4">
        {/* Eenvoudige SVG van een telefoon die draait */}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10 animate-pulse">
          <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
          <line x1="12" y1="18" x2="12.01" y2="18" />
          <path d="M21 12a9 9 0 0 1-9 9" opacity="0.6" />
        </svg>
      </div>
      <p className="text-base font-black tracking-tight">Draai uw telefoon</p>
      <p className="text-sm text-white/85 mt-1 max-w-xs">
        Voor de beste ervaring werkt SuriRent op uw telefoon alleen in staande
        modus. Draai uw scherm terug naar portret.
      </p>
    </div>
  );
}
