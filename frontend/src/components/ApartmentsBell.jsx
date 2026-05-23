import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Building2, X, Home, KeySquare, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, fmtMoney } from '../lib/api';

/**
 * ApartmentsBell — overzicht-icoon rechtsboven in de admin mobile header.
 *
 * Toont een Building-icoon met badge (aantal vacante appartementen).
 * Klik opent een paneel met:
 *   • Vacant   — appartementen die direct verhuurd kunnen worden + maandhuur
 *   • Bezet    — appartementen die verhuurd zijn + huurder + maandhuur
 *   • Footer met totaal-overzicht
 */
export default function ApartmentsBell() {
  const navigate = useNavigate();
  const [apartments, setApartments] = useState([]);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('vacant'); // 'vacant' | 'occupied'
  const panelRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/apartments');
      setApartments(data || []);
    } catch { /* stil falen */ }
  }, []);

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

  const { vacant, occupied, totalRentByCur } = useMemo(() => {
    const v = [];
    const o = [];
    const totals = {};
    for (const a of apartments) {
      const status = (a.status || '').toLowerCase();
      if (status === 'occupied' || a.tenant_id) o.push(a);
      else v.push(a);
      const cur = a.currency || 'SRD';
      totals[cur] = (totals[cur] || 0) + Number(a.rent_amount || 0);
    }
    // Vacant sort: locatie + nummer
    v.sort((a, b) => (a.location_name || '').localeCompare(b.location_name || '') || (a.number || '').localeCompare(b.number || ''));
    o.sort((a, b) => (a.location_name || '').localeCompare(b.location_name || '') || (a.number || '').localeCompare(b.number || ''));
    return { vacant: v, occupied: o, totalRentByCur: totals };
  }, [apartments]);

  const vacantCount = vacant.length;
  const occupiedCount = occupied.length;
  const totalCount = vacantCount + occupiedCount;

  const goToApartments = () => {
    setOpen(false);
    try { window.dispatchEvent(new CustomEvent('go-tab', { detail: 'apartments' })); } catch { /* noop */ }
    navigate('/admin/apartments');
  };

  const list = tab === 'vacant' ? vacant : occupied;

  return (
    <div className="relative" ref={panelRef} data-testid="apartments-bell-wrapper">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="apartments-bell-btn"
        aria-label={`${occupiedCount} bezet, ${vacantCount} vacant`}
        className="relative w-11 h-11 landscape:w-9 landscape:h-9 rounded-2xl landscape:rounded-xl flex items-center justify-center bg-white text-slate-600 hover:bg-orange-50 hover:text-[#FF5C00] border border-slate-200/70 transition active:scale-95"
      >
        <Building2 className="w-5 h-5 landscape:w-4 landscape:h-4" strokeWidth={2.2} />
        {vacantCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#FF5C00] text-white text-[10px] font-black flex items-center justify-center ring-2 ring-[#FFF7F0]"
            data-testid="apartments-bell-count">
            {vacantCount > 9 ? '9+' : vacantCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-x-3 z-50 sm:left-auto sm:right-3 sm:w-[380px]"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 68px)' }}
          data-testid="apartments-panel"
        >
          <div className="bg-white rounded-2xl border border-orange-100 shadow-[0_24px_48px_-12px_rgba(15,23,42,0.25)] overflow-hidden animate-slide-up">
            {/* HEADER met totalen */}
            <div className="px-4 py-3 bg-gradient-to-br from-[#FFF4EC] to-[#FFE6D3] border-b border-orange-100">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-black text-slate-900 truncate">Appartementen</p>
                <button onClick={() => setOpen(false)} className="w-7 h-7 rounded-full hover:bg-white/60 flex items-center justify-center" aria-label="Sluiten">
                  <X className="w-3.5 h-3.5 text-slate-500" />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div className="bg-white/70 rounded-lg px-2 py-1.5">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Totaal</p>
                  <p className="text-base font-black text-slate-900 leading-none mt-0.5">{totalCount}</p>
                </div>
                <div className="bg-white/70 rounded-lg px-2 py-1.5">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-600">Bezet</p>
                  <p className="text-base font-black text-emerald-600 leading-none mt-0.5">{occupiedCount}</p>
                </div>
                <div className="bg-white/70 rounded-lg px-2 py-1.5">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-[#FF5C00]">Vacant</p>
                  <p className="text-base font-black text-[#FF5C00] leading-none mt-0.5">{vacantCount}</p>
                </div>
              </div>
            </div>

            {/* TAB BAR */}
            <div className="flex border-b border-orange-100 bg-slate-50/50">
              <button
                onClick={() => setTab('vacant')}
                data-testid="apartments-tab-vacant"
                className={`flex-1 px-3 py-2.5 text-xs font-bold transition relative ${
                  tab === 'vacant' ? 'text-[#FF5C00]' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Vacant ({vacantCount})
                {tab === 'vacant' && <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-[#FF5C00] rounded-full" />}
              </button>
              <button
                onClick={() => setTab('occupied')}
                data-testid="apartments-tab-occupied"
                className={`flex-1 px-3 py-2.5 text-xs font-bold transition relative ${
                  tab === 'occupied' ? 'text-emerald-600' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Bezet ({occupiedCount})
                {tab === 'occupied' && <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-emerald-500 rounded-full" />}
              </button>
            </div>

            {/* LIJST */}
            <div className="max-h-[55vh] landscape:max-h-[40vh] overflow-y-auto">
              {list.length === 0 ? (
                <div className="px-4 py-8 text-center" data-testid={`apartments-empty-${tab}`}>
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2 ${
                    tab === 'vacant' ? 'bg-emerald-50' : 'bg-slate-50'
                  }`}>
                    {tab === 'vacant'
                      ? <KeySquare className="w-6 h-6 text-emerald-500" strokeWidth={2.4} />
                      : <Home className="w-6 h-6 text-slate-400" strokeWidth={2.4} />}
                  </div>
                  <p className="text-sm font-bold text-slate-900">
                    {tab === 'vacant' ? 'Alles is verhuurd!' : 'Nog niets verhuurd.'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {tab === 'vacant' ? 'Geen vacante appartementen.' : 'Geen bezette appartementen.'}
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-orange-50">
                  {list.map((a) => (
                    <li key={a.id}>
                      <div
                        data-testid={`apartments-item-${a.id}`}
                        className="px-3 py-3 flex items-center gap-3"
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          tab === 'vacant' ? 'bg-orange-50 text-[#FF5C00]' : 'bg-emerald-50 text-emerald-600'
                        }`}>
                          {tab === 'vacant' ? <KeySquare className="w-5 h-5" /> : <Home className="w-5 h-5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-slate-900 truncate">
                            {a.number || '—'}
                            {a.location_name && <span className="text-slate-400 font-medium"> · {a.location_name}</span>}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {tab === 'occupied'
                              ? (a.tenant_name || 'Huurder onbekend')
                              : (a.bedrooms ? `${a.bedrooms} slaapkamer${a.bedrooms !== 1 ? 's' : ''}` : 'Beschikbaar voor verhuur')}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-black tracking-tight text-slate-900 whitespace-nowrap">
                            {fmtMoney(a.rent_amount, a.currency || 'SRD')}
                          </p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">per maand</p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button
              onClick={goToApartments}
              data-testid="apartments-open-tab"
              className="w-full px-4 py-3 bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold text-sm transition active:scale-[0.98] flex items-center justify-center gap-2"
            >
              Open Appartementen <ChevronRight className="w-4 h-4" />
            </button>

            {Object.keys(totalRentByCur).length > 0 && (
              <div className="px-4 py-2 text-center bg-slate-50/60 border-t border-orange-50">
                <p className="text-[10px] text-slate-500 font-medium">
                  Potentiële maandhuur:{' '}
                  {Object.entries(totalRentByCur).map(([cur, amt], i) => (
                    <span key={cur} className="font-bold text-slate-700">
                      {i > 0 ? ' · ' : ''}{fmtMoney(amt, cur)}
                    </span>
                  ))}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
