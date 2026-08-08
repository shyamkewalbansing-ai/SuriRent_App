import { useEffect } from 'react';

// =====================================================================
// Sub-componenten: Tab-bar, KPI-card, dollar-alert icoon, FilterMenu, Toast
// =====================================================================

export function Tab({ v, tab, setTab, label, dot, testid }) {
  const active = tab === v;
  return (
    <button onClick={() => setTab(v)} data-testid={testid}
      className={`relative px-3 sm:px-4 h-9 sm:h-10 rounded-xl font-bold text-xs sm:text-sm inline-flex items-center gap-1.5 transition ${
        active ? 'text-[#FF5C00]' : 'text-slate-500 hover:text-slate-700'
      }`}>
      {label}
      {dot === 'red' && <span className="w-2 h-2 rounded-full bg-red-500" />}
      {dot === 'green' && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
      {active && <span className="absolute -bottom-2 left-3 right-3 h-0.5 bg-[#FF5C00] rounded-full" />}
    </button>
  );
}

// Mobile filter pill — altijd zichtbaar in de balk (Alle/Achterstand/Betaald)
export function MobileFilterPill({ active, onClick, label, count, dot, testid }) {
  return (
    <button onClick={onClick} type="button" data-testid={testid}
      className={`shrink-0 h-10 px-3.5 rounded-2xl border inline-flex items-center gap-1.5 font-extrabold text-[13px] transition active:scale-95 ${
        active
          ? 'bg-[#FF6A1A] border-[#FF6A1A] text-white shadow-[0_8px_18px_-8px_rgba(255,92,0,0.55)]'
          : 'bg-white border-orange-100 text-slate-700'
      }`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-white' : dot}`} />}
      <span>{label}</span>
      <span className={`text-[11px] font-bold ${active ? 'text-white/85' : 'text-slate-400'}`}>
        ({count})
      </span>
    </button>
  );
}

export function KpiCard({ icon, label, value, hint, tone, testid }) {
  const tones = {
    red:    { iconBg: 'bg-red-100', iconFg: 'text-red-500', hint: 'text-red-500' },
    orange: { iconBg: 'bg-orange-100', iconFg: 'text-orange-500', hint: 'text-slate-400' },
    green:  { iconBg: 'bg-emerald-100', iconFg: 'text-emerald-500', hint: 'text-slate-400' },
  };
  const t = tones[tone] || tones.orange;
  const Icon = icon === 'alert' ? AlertCircleDollar : icon;
  return (
    <div className="flex-1 min-w-0 flex items-center gap-4 px-5 py-5" data-testid={testid}>
      <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${t.iconBg}`}>
        <Icon className={`w-5 h-5 ${t.iconFg}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-500 mb-1 leading-tight">{label}</p>
        <p className="text-xl font-black text-slate-900 tracking-tight whitespace-nowrap">{value}</p>
        {hint && <p className={`text-xs font-bold mt-0.5 ${t.hint} capitalize`}>{hint}</p>}
      </div>
    </div>
  );
}

// Dollar-sign-in-circle icon (red), gebruikt voor "Totaal openstaand"
export function AlertCircleDollar({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v10M14.5 9.5c0-1-.8-1.5-2.5-1.5s-2.5.5-2.5 1.5.8 1.5 2.5 1.5 2.5.5 2.5 1.5-.8 1.5-2.5 1.5-2.5-.5-2.5-1.5"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function FilterMenu({ filter, setFilter, onClose }) {
  const opts = [
    { v: 'all', l: 'Alle severities' },
    { v: 'critical', l: '2+ maanden (kritiek)' },
    { v: 'late', l: '1 maand achter' },
    { v: 'ok', l: 'Op tijd' },
  ];
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-12 z-50 bg-white rounded-xl shadow-2xl border border-orange-100 py-1 min-w-[220px]"
        data-testid="filter-menu">
        {opts.map((o) => (
          <button key={o.v} onClick={() => { setFilter(o.v); onClose(); }}
            data-testid={`filter-${o.v}`}
            className={`w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-orange-50 transition ${
              filter === o.v ? 'text-[#FF5C00] font-bold' : 'text-slate-700'
            }`}>{o.l}</button>
        ))}
      </div>
    </>
  );
}

export function Toast({ toast, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [onDone]);
  const cls = toast.type === 'err' || toast.type === 'error'
    ? 'bg-red-500 text-white'
    : 'bg-emerald-500 text-white';
  return (
    <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-xl shadow-2xl font-bold text-sm animate-slide-up" data-testid="invoices-toast">
      <div className={`${cls} rounded-xl px-5 py-3`}>{toast.text || toast.msg}</div>
    </div>
  );
}
