/**
 * useAdminEvents — Server-Sent Events stream voor instant admin updates.
 *
 * Verbindt met /api/admin/events en geeft elke binnenkomende event door aan
 * de meegegeven `onEvent` callback. Auto-reconnect bij verbroken connectie
 * (browser EventSource doet dit deels zelf, plus extra retry-backoff).
 *
 * Latency: ~50ms van backend broadcast tot React callback (geen FCM/APNS).
 */
import { useEffect, useRef } from 'react';

export function useAdminEvents(onEvent, { enabled = true } = {}) {
  const onEventRef = useRef(onEvent);
  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);

  useEffect(() => {
    if (!enabled) return undefined;
    let es = null;
    let closed = false;
    let retryTimer = null;
    let retryDelay = 1000; // start bij 1s, exp backoff tot 30s

    const connect = () => {
      if (closed) return;
      const apiBase = `${process.env.REACT_APP_BACKEND_URL}/api`;
      // Token komt uit httpOnly cookie OF localStorage (legacy). EventSource
      // ondersteunt geen custom headers → token in query-param (alleen voor
      // SSE endpoint; backend leest hem daar bewust uit).
      const token =
        localStorage.getItem('admin_token') ||
        localStorage.getItem('access_token') ||
        '';
      const url = token
        ? `${apiBase}/admin/events?token=${encodeURIComponent(token)}`
        : `${apiBase}/admin/events`;
      try {
        es = new EventSource(url, { withCredentials: true });
      } catch (err) {
        scheduleRetry();
        return;
      }
      es.onopen = () => { retryDelay = 1000; };
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          onEventRef.current && onEventRef.current(data);
        } catch { /* ignore parse errors */ }
      };
      es.addEventListener('ready', () => { /* server bevestigt connect */ });
      es.onerror = () => {
        if (es) { es.close(); es = null; }
        scheduleRetry();
      };
    };

    const scheduleRetry = () => {
      if (closed) return;
      retryTimer = setTimeout(connect, retryDelay);
      retryDelay = Math.min(retryDelay * 1.5, 30000);
    };

    connect();

    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (es) es.close();
    };
  }, [enabled]);
}
