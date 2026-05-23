import { useEffect, useState } from 'react';

/**
 * LiveIndicator — kleine "Live" badge die korte tijd "pulst" na iedere
 * geslaagde stille auto-refresh. Luistert naar het `surirent:refresh`
 * window-event dat `useAutoRefresh` uitzendt.
 *
 * Visueel:
 *  • Klein groen bolletje met zachte pulse-ring (animatie ~1.2s)
 *  • Tekst "Live"
 *  • Onopvallend / tone-down kleuren zodat het niet afleidt
 */
export default function LiveIndicator({ className = '', compact = false }) {
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    let timer = null;
    const onRefresh = () => {
      setPulsing(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setPulsing(false), 1200);
    };
    window.addEventListener('surirent:refresh', onRefresh);
    return () => {
      window.removeEventListener('surirent:refresh', onRefresh);
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <div
      className={`inline-flex items-center gap-1.5 select-none ${className}`}
      data-testid="live-indicator"
      data-pulsing={pulsing ? 'true' : 'false'}
      title="Verbonden — data wordt automatisch ververst"
    >
      <span className="relative flex h-2 w-2">
        {pulsing && (
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
        )}
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
      </span>
      {!compact && (
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-600/80">
          Live
        </span>
      )}
    </div>
  );
}
