import { useEffect, useState, useRef } from 'react';

/**
 * LiveIndicator — slimme status-badge voor de admin app.
 *
 * Drie toestanden:
 *  • 🟢 LIVE        — backend bereikbaar, recente succesvolle refresh
 *                     (pulst kort na elke refresh)
 *  • 🟡 VERBINDEN   — geen succesvolle refresh in 30s, of laatste tick gefaald
 *  • 🔴 OFFLINE     — geen succes in 90s, of `navigator.onLine === false`
 *
 * Onopvallend, geen pop-ups. Tooltip toont meer info bij hover.
 */
export default function LiveIndicator({ className = '', compact = false }) {
  const [status, setStatus] = useState('live'); // 'live' | 'warn' | 'offline'
  const [pulsing, setPulsing] = useState(false);
  const lastOkRef = useRef(Date.now());
  const lastFailRef = useRef(0);
  const pulseTimerRef = useRef(null);

  useEffect(() => {
    const computeStatus = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return 'offline';
      }
      const sinceOk = Date.now() - lastOkRef.current;
      if (sinceOk > 90_000) return 'offline';
      if (sinceOk > 30_000 || lastFailRef.current > lastOkRef.current) return 'warn';
      return 'live';
    };

    const updateStatus = () => setStatus(computeStatus());

    const onOk = () => {
      lastOkRef.current = Date.now();
      lastFailRef.current = 0;
      setPulsing(true);
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
      pulseTimerRef.current = setTimeout(() => setPulsing(false), 1200);
      updateStatus();
    };
    const onFail = () => {
      lastFailRef.current = Date.now();
      updateStatus();
    };
    const onOnline = () => updateStatus();
    const onOffline = () => updateStatus();

    window.addEventListener('surirent:refresh', onOk);
    window.addEventListener('surirent:refresh-failed', onFail);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    // Re-evalueer iedere 10s zodat een stille periode zonder events
    // (bv. tab in standby) toch de juiste status laat zien.
    const interval = setInterval(updateStatus, 10_000);
    updateStatus();

    return () => {
      window.removeEventListener('surirent:refresh', onOk);
      window.removeEventListener('surirent:refresh-failed', onFail);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(interval);
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    };
  }, []);

  // Visuele tokens per status — bewust gedempt zodat het niet schreeuwt.
  const theme = {
    live:    { dot: 'bg-emerald-500', ring: 'bg-emerald-400', label: 'Live',     text: 'text-emerald-600/80', title: 'Verbonden — data wordt automatisch ververst' },
    warn:    { dot: 'bg-amber-500',   ring: 'bg-amber-400',   label: 'Verbinden', text: 'text-amber-600/90',   title: 'Even geduld — verbinding controleren…' },
    offline: { dot: 'bg-red-500',     ring: 'bg-red-400',     label: 'Offline',  text: 'text-red-600/90',     title: 'Geen verbinding — controleer uw netwerk' },
  }[status];

  return (
    <div
      className={`inline-flex items-center gap-1.5 select-none ${className}`}
      data-testid="live-indicator"
      data-status={status}
      data-pulsing={pulsing ? 'true' : 'false'}
      title={theme.title}
    >
      <span className="relative flex h-2 w-2">
        {pulsing && status === 'live' && (
          <span className={`absolute inline-flex h-full w-full rounded-full ${theme.ring} opacity-75 animate-ping`} />
        )}
        {status !== 'live' && (
          <span className={`absolute inline-flex h-full w-full rounded-full ${theme.ring} opacity-60 animate-pulse`} />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${theme.dot}`} />
      </span>
      {!compact && (
        <span className={`text-[10px] font-bold uppercase tracking-[0.18em] ${theme.text}`}>
          {theme.label}
        </span>
      )}
    </div>
  );
}
