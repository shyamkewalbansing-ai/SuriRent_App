// Detecteert of het huidige viewport "mobile" is (<640px breed).
// Reageert op resize zodat een gebruiker die rotateert of zijn venster
// versleept de juiste UI ziet.
import { useEffect, useState } from 'react';

export function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < breakpoint;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e) => setIsMobile(e.matches);
    // Initial sync (in case SSR mismatch).
    setIsMobile(mq.matches);
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else mq.addListener(handler);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler);
      else mq.removeListener(handler);
    };
  }, [breakpoint]);

  return isMobile;
}
