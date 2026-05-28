// Morning briefing — toont éénmaal per dag (tussen 06:00-12:00) bij het
// openen van /admin een overzichts-modal met overdue + nieuwe activiteit.
// Werkt OOK op iOS Guided Access mode omdat het in-app is.

import { useEffect, useState } from 'react';
import { api } from './api';

const LS_KEY = 'last_morning_briefing_date';

export function useMorningBriefing({ enabled = true } = {}) {
  const [briefing, setBriefing] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const today = new Date().toISOString().slice(0, 10);
    const lastShown = (() => {
      try { return localStorage.getItem(LS_KEY); } catch { return null; }
    })();
    if (lastShown === today) return;
    // Alleen tonen 06:00-12:00 lokale tijd zodat we niet om middernacht popup'en
    const h = new Date().getHours();
    if (h < 6 || h > 12) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/admin/morning-briefing');
        if (cancelled) return;
        setBriefing(data);
      } catch { /* stilzwijgend */ }
    })();
    return () => { cancelled = true; };
  }, [enabled]);

  const dismiss = () => {
    try { localStorage.setItem(LS_KEY, new Date().toISOString().slice(0, 10)); } catch { /* ignore */ }
    setDismissed(true);
  };

  return { briefing: dismissed ? null : briefing, dismiss };
}
