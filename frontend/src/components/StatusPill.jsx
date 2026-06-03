// Status Pill — toont real-time status van alle systeem-componenten.
// Polls /api/system/status elke 60s. Klikbaar voor detail-paneel.
//
// Variants:
//   - operational : groene puls + "Alle systemen operationeel"
//   - degraded    : amber + "Verminderde prestaties"
//   - down        : rood + "Onderhoud / storing"
//
// Detail-paneel toont per-component status + latency.

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Loader2, ChevronDown } from 'lucide-react';

const STATUS_THEME = {
  operational: {
    label: 'Alle systemen operationeel',
    short: 'Operationeel',
    dot: 'bg-emerald-500',
    pulse: 'bg-emerald-400',
    text: 'text-emerald-700',
    bg: 'hover:bg-emerald-50',
    Icon: CheckCircle2,
  },
  degraded: {
    label: 'Verminderde prestaties',
    short: 'Verminderd',
    dot: 'bg-amber-500',
    pulse: 'bg-amber-400',
    text: 'text-amber-700',
    bg: 'hover:bg-amber-50',
    Icon: AlertTriangle,
  },
  down: {
    label: 'Storing — onderzoek loopt',
    short: 'Storing',
    dot: 'bg-red-500',
    pulse: 'bg-red-400',
    text: 'text-red-700',
    bg: 'hover:bg-red-50',
    Icon: XCircle,
  },
};

const COMP_LABEL = {
  operational: 'Operationeel',
  degraded: 'Verminderd',
  down: 'Storing',
};

const COMP_PILL = {
  operational: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  degraded: 'bg-amber-50 text-amber-700 ring-amber-200',
  down: 'bg-red-50 text-red-700 ring-red-200',
};

export default function StatusPill() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const wrapRef = useRef(null);

  // Poll status — meteen + elke 60s.
  useEffect(() => {
    let cancel = false;
    const fetchStatus = async () => {
      try {
        const backend = process.env.REACT_APP_BACKEND_URL || '';
        const res = await fetch(`${backend}/api/system/status`, { credentials: 'omit' });
        const j = await res.json();
        if (!cancel) setData(j);
      } catch {
        if (!cancel) setData({ status: 'down', components: [], checked_at: new Date().toISOString() });
      } finally {
        if (!cancel) setLoading(false);
      }
    };
    fetchStatus();
    const t = setInterval(fetchStatus, 60_000);
    return () => { cancel = true; clearInterval(t); };
  }, []);

  // Sluit detail-paneel bij klikken buiten.
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (loading || !data) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded text-xs font-bold text-slate-500" data-testid="status-pill-loading">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span className="hidden sm:inline">Status checken…</span>
      </div>
    );
  }

  const theme = STATUS_THEME[data.status] || STATUS_THEME.operational;
  const Icon = theme.Icon;

  return (
    <div className="relative" ref={wrapRef} data-testid="status-pill">
      <button onClick={() => setOpen((v) => !v)}
        data-testid="status-pill-toggle"
        className={`flex items-center gap-2 px-3 py-2 rounded transition-colors ${theme.bg}`}
        aria-expanded={open}
        title={theme.label}>
        {/* Pulse dot */}
        <span className="relative flex h-2.5 w-2.5">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${theme.pulse} opacity-60`} />
          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${theme.dot}`} />
        </span>
        <span className={`text-[11px] lg:text-xs font-bold ${theme.text} whitespace-nowrap`}>
          <span className="hidden md:inline">{theme.label}</span>
          <span className="md:hidden">{theme.short}</span>
        </span>
        <ChevronDown className={`w-3.5 h-3.5 ${theme.text} transition-transform ${open ? 'rotate-180' : ''} hidden md:inline`} />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-[320px] bg-white rounded-xl shadow-2xl border border-slate-100 overflow-hidden z-50"
          data-testid="status-pill-panel">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2.5">
            <Icon className={`w-5 h-5 ${theme.text}`} />
            <div>
              <p className={`text-sm font-extrabold ${theme.text}`}>{theme.label}</p>
              <p className="text-[10px] text-slate-400 font-mono">
                Laatste check · {new Date(data.checked_at).toLocaleTimeString('nl-NL')}
              </p>
            </div>
          </div>
          <ul className="divide-y divide-slate-100" data-testid="status-components">
            {(data.components || []).map((c) => (
              <li key={c.id}
                data-testid={`status-component-${c.id}`}
                className="px-4 py-2.5 flex items-center justify-between text-sm">
                <span className="font-bold text-slate-700">{c.label}</span>
                <span className="flex items-center gap-2">
                  {typeof c.latency_ms === 'number' && c.latency_ms > 0 && (
                    <span className="text-[10px] text-slate-400 font-mono">{c.latency_ms}ms</span>
                  )}
                  <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ring-1 ring-inset ${COMP_PILL[c.status] || COMP_PILL.operational}`}>
                    {COMP_LABEL[c.status] || c.status}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <div className="px-4 py-2.5 bg-slate-50 text-[10px] text-slate-400 text-center font-mono">
            Auto-refresh elke 60s
          </div>
        </div>
      )}
    </div>
  );
}
