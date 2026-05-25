import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Bell, X, AlertCircle, ChevronRight, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, fmtMoney, MONTHS_NL } from '../lib/api';

const UNPAID = ['open', 'sent', 'pending', 'overdue'];
const isUnpaid = (inv) => UNPAID.includes((inv.status || '').toLowerCase());

function groupOverdue(invoices) {
  const map = new Map();
  for (const inv of invoices) {
    if (!isUnpaid(inv)) continue;
    const key = inv.tenant_id;
    if (!map.has(key)) {
      map.set(key, {
        tenant_id: inv.tenant_id,
        tenant_name: inv.tenant_name || 'Onbekend',
        apartment_number: inv.apartment_number,
        location_name: inv.location_name,
        currency: inv.currency,
        open: [],
      });
    }
    const g = map.get(key);
    g.open.push(inv);
    if (inv.apartment_number) g.apartment_number = inv.apartment_number;
    if (inv.location_name) g.location_name = inv.location_name;
  }
  const arr = [...map.values()];
  for (const g of arr) {
    g.open.sort((a, b) => (a.period_year - b.period_year) || (a.period_month - b.period_month));
    g.openCount = g.open.length;
    g.totalOpen = g.open.reduce((s, i) => s + Number(i.amount || 0), 0);
    g.severity = g.openCount >= 2 ? 'critical' : 'late';
  }
  arr.sort((a, b) => (b.openCount - a.openCount) || (b.totalOpen - a.totalOpen));
  return arr;
}

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return { bg: `hsl(${h}, 65%, 92%)`, fg: `hsl(${h}, 45%, 35%)` };
}

/**
 * OverdueBell — notificatie-icoon rechtsboven in de admin mobile header.
 *
 * Toont een rood badge wanneer er huurders met achterstand zijn. Een klik
 * opent een slide-down paneel met alle huurders die achterstanden hebben,
 * gesorteerd op aantal openstaande maanden + totaal openstaand bedrag.
 * Een klik op een huurder navigeert naar de Facturen-tab waar de details
 * zichtbaar zijn.
 */
export default function OverdueBell() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/invoices');
      setInvoices(data || []);
    } catch { /* stil falen — geen badge bij netwerkfout */ }
  }, []);

  // Initial load + polling (elke 30s) + bij focus / visibility-change.
  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [load]);

  // Sluit paneel bij klik buiten of Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('touchstart', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('touchstart', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const overdue = useMemo(() => groupOverdue(invoices), [invoices]);
  const count = overdue.length;

  const goToInvoices = (tenantId) => {
    setOpen(false);
    // Triggert het `go-tab` event dat AdminDashboard luistert. Geen hard
    // navigate zodat overige state behouden blijft.
    try {
      window.dispatchEvent(new CustomEvent('go-tab', { detail: 'invoices' }));
    } catch { /* noop */ }
    navigate('/admin/invoices');
    void tenantId; // tenant_id niet gebruikt voor scroll-to (toekomstige verbetering)
  };

  return (
    <div className="relative" ref={panelRef} data-testid="overdue-bell-wrapper">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="overdue-bell-btn"
        aria-label={count > 0 ? `${count} huurders met achterstand` : 'Geen achterstanden'}
        className={`relative w-14 h-14 landscape:w-10 landscape:h-10 rounded-2xl landscape:rounded-xl flex items-center justify-center transition active:scale-95 ${
          count > 0
            ? 'bg-red-50 text-red-600 hover:bg-red-100 shadow-[0_6px_16px_-6px_rgba(239,68,68,0.45)]'
            : 'bg-white text-slate-500 hover:bg-orange-50 hover:text-[#FF5C00] border border-slate-200/70'
        }`}
      >
        <Bell className="w-7 h-7 landscape:w-5 landscape:h-5" strokeWidth={count > 0 ? 2.4 : 2} />
        {count > 0 && (
          <>
            <span className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-500 text-white text-[11px] font-black flex items-center justify-center ring-2 ring-[#FFF7F0]"
              data-testid="overdue-bell-count">
              {count > 9 ? '9+' : count}
            </span>
            <span className="absolute -top-1 -right-1 w-[22px] h-[22px] rounded-full bg-red-400 opacity-60 animate-ping" />
          </>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-x-3 z-50 sm:left-auto sm:right-3 sm:w-[360px]"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 68px)' }}
          data-testid="overdue-panel"
        >
          <div className="bg-white rounded-2xl border border-orange-100 shadow-[0_24px_48px_-12px_rgba(15,23,42,0.25)] overflow-hidden animate-slide-up">
            <div className="px-4 py-3 bg-gradient-to-br from-[#FFF4EC] to-[#FFE6D3] border-b border-orange-100">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertCircle className={`w-4 h-4 ${count > 0 ? 'text-red-500' : 'text-emerald-500'}`} />
                  <p className="text-sm font-black text-slate-900 truncate">
                    Achterstanden {count > 0 && <span className="text-red-500">({count})</span>}
                  </p>
                </div>
                <button onClick={() => setOpen(false)} className="w-7 h-7 rounded-full hover:bg-white/60 flex items-center justify-center" aria-label="Sluiten">
                  <X className="w-3.5 h-3.5 text-slate-500" />
                </button>
              </div>
            </div>

            <div className="max-h-[60vh] landscape:max-h-[40vh] overflow-y-auto">
              {count === 0 ? (
                <div className="px-4 py-8 text-center" data-testid="overdue-empty">
                  <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-2">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" strokeWidth={2.4} />
                  </div>
                  <p className="text-sm font-bold text-slate-900">Alles op tijd!</p>
                  <p className="text-xs text-slate-500 mt-1">Geen huurders met achterstand.</p>
                </div>
              ) : (
                <ul className="divide-y divide-orange-50">
                  {overdue.map((g) => {
                    const av = avatarColor(g.tenant_name);
                    const last = g.open[g.open.length - 1];
                    const sev = g.severity;
                    return (
                      <li key={g.tenant_id}>
                        <button
                          onClick={() => goToInvoices(g.tenant_id)}
                          data-testid={`overdue-item-${g.tenant_id}`}
                          className="w-full text-left px-3 py-3 hover:bg-orange-50/60 active:bg-orange-50 transition flex items-center gap-3"
                        >
                          <div className="w-10 h-10 rounded-full flex items-center justify-center font-black text-sm shrink-0"
                            style={{ background: av.bg, color: av.fg }}>
                            {initials(g.tenant_name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-slate-900 truncate">{g.tenant_name}</p>
                            <p className="text-[11px] text-slate-500 truncate">
                              {g.location_name && g.apartment_number
                                ? `${g.location_name} · ${g.apartment_number}`
                                : g.apartment_number || '—'}
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                                sev === 'critical' ? 'bg-red-50 text-red-700' : 'bg-orange-50 text-orange-700'
                              }`}>
                                {g.openCount} {g.openCount === 1 ? 'maand' : 'maanden'} achter
                              </span>
                              {last && (
                                <span className="text-[10px] text-slate-400 capitalize">
                                  sinds {MONTHS_NL[g.open[0].period_month - 1].slice(0, 3)} {g.open[0].period_year}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`text-sm font-black tracking-tight whitespace-nowrap ${
                              sev === 'critical' ? 'text-red-600' : 'text-orange-600'
                            }`}>
                              {g.currency} {Number(g.totalOpen).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                            <ChevronRight className="w-4 h-4 text-slate-300 ml-auto mt-0.5" />
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {count > 0 && (
              <button
                onClick={() => goToInvoices(null)}
                data-testid="overdue-open-invoices"
                className="w-full px-4 py-3 bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold text-sm transition active:scale-[0.98] flex items-center justify-center gap-2"
              >
                Open Facturen <ChevronRight className="w-4 h-4" />
              </button>
            )}

            <div className="px-4 py-2 text-center bg-slate-50/60 border-t border-orange-50">
              <p className="text-[10px] text-slate-400 font-medium">
                {fmtMoney(overdue.reduce((s, g) => s + g.totalOpen, 0), overdue[0]?.currency || 'SRD')}
                {' · totaal openstaand'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
