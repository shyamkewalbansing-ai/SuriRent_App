import { useEffect, useRef } from 'react';

/**
 * Auto-lock the admin session after a configurable period of inactivity.
 * On idle: removes the admin_token from localStorage and calls `onLock`,
 * which typically navigates the user back to /login so the PIN screen
 * appears. The kiosk_token (if any) is preserved so re-entering the same
 * PIN re-issues an admin token immediately.
 *
 * Activity is detected via mousemove / keydown / touchstart / scroll /
 * visibilitychange. The timer resets on each event (throttled to 1 reset
 * per second to avoid timer-thrash on continuous scrolling).
 */
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];

export function useIdleLock({ timeoutMs = 15 * 60 * 1000, onLock, enabled = true }) {
  const timerRef = useRef(null);
  const lastResetRef = useRef(0);

  useEffect(() => {
    if (!enabled) return undefined;

    const lock = () => {
      try { localStorage.removeItem('admin_token'); } catch { /* ignore */ }
      if (onLock) onLock();
    };

    const reset = () => {
      const now = Date.now();
      if (now - lastResetRef.current < 1000) return;
      lastResetRef.current = now;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(lock, timeoutMs);
    };

    // Start the timer immediately.
    reset();

    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    document.addEventListener('visibilitychange', reset);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, reset));
      document.removeEventListener('visibilitychange', reset);
    };
  }, [timeoutMs, onLock, enabled]);
}
