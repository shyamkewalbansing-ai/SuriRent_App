/**
 * useAutoRefresh — automatisch refresh-gedrag voor admin pagina's.
 *
 * Strategie:
 *  • Polling op interval (default 10s) zolang het tabblad zichtbaar is.
 *  • Onmiddellijke refresh bij window-focus / tab-zichtbaar (Visibility API)
 *    zodat zodra de gebruiker terugkomt in de app, alle data direct vers is.
 *  • Pauzeert wanneer het tabblad verborgen is (geen onnodige requests).
 *  • Geen overlap: nieuwe refresh start pas als de vorige klaar is.
 *
 * Gebruik:
 *   useAutoRefresh(load);              // 10s interval
 *   useAutoRefresh(load, 5000);        // 5s interval
 *   useAutoRefresh(load, { interval: 5000, enabled: !modalOpen });
 */
import { useEffect, useRef } from 'react';

export function useAutoRefresh(loadFn, opts = {}) {
  const interval = typeof opts === 'number' ? opts : (opts.interval || 10000);
  const enabled = typeof opts === 'object' ? (opts.enabled ?? true) : true;

  // Bewaar de meest recente loadFn in een ref zodat we hem niet steeds opnieuw
  // hoeven door te geven en de polling-loop niet onnodig herstart.
  const loadRef = useRef(loadFn);
  useEffect(() => { loadRef.current = loadFn; }, [loadFn]);

  useEffect(() => {
    if (!enabled) return undefined;
    let inflight = false;
    let timer = null;

    const tick = async () => {
      if (inflight) return;
      if (document.hidden) return;
      inflight = true;
      try {
        await Promise.resolve(loadRef.current && loadRef.current());
        // Stille "Live" puls naar de UI — alleen wanneer de refresh
        // succesvol was. De LiveIndicator-component vangt dit event op.
        try {
          window.dispatchEvent(new CustomEvent('surirent:refresh'));
        } catch { /* noop */ }
      } catch {
        // Mislukt — meld dat de backend onbereikbaar lijkt zodat
        // LiveIndicator van groen → amber/rood kan schakelen.
        try {
          window.dispatchEvent(new CustomEvent('surirent:refresh-failed'));
        } catch { /* noop */ }
      }
      finally { inflight = false; }
    };

    const start = () => {
      stop();
      timer = setInterval(tick, interval);
    };
    const stop = () => {
      if (timer) { clearInterval(timer); timer = null; }
    };

    const onVisibility = () => {
      if (document.hidden) { stop(); }
      else { tick(); start(); }
    };
    const onFocus = () => { tick(); };

    start();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [interval, enabled]);
}
