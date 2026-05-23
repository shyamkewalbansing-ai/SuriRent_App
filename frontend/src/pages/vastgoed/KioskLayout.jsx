import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Building2, ArrowRight, ArrowLeft, Banknote, Receipt, LogOut, MapPin,
  Check, Loader2, Home, X, Wallet, FileText, Wifi, AlertCircle,
  Smartphone, QrCode, ShieldCheck, Clock as ClockIcon, Printer, Download,
  Droplets, User, Settings as SettingsIcon, Hash, CheckCircle,
} from 'lucide-react';
import { api, formatError, fmtMoney, MONTHS_NL } from '../../lib/api';

const variants = {
  enter: { opacity: 0, x: 60 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -60 },
};

function getKioskCompany() {
  try {
    const raw = localStorage.getItem('kiosk_company');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// Sort apartments by alphabetic prefix + numeric suffix ("A1" < "A2" < "HUIS 7A")
function sortApartments(a, b) {
  const numA = (a.number || '').replace(/[^0-9]/g, '');
  const numB = (b.number || '').replace(/[^0-9]/g, '');
  const prefA = (a.number || '').replace(/[0-9]/g, '');
  const prefB = (b.number || '').replace(/[0-9]/g, '');
  if (prefA !== prefB) return prefA.localeCompare(prefB);
  return (parseInt(numA) || 0) - (parseInt(numB) || 0);
}

// =====================================================================
// Mobile header buttons (Beheerder + Uit) — shown inline on mobile only
// =====================================================================
function MobileHeaderButtons({ onAdmin, onExit }) {
  return (
    <div className="flex items-center gap-2 md:hidden">
      {onExit && (
        <button onClick={onExit} data-testid="kiosk-lock-btn"
          className="flex items-center gap-2 text-white font-bold bg-white/20 active:bg-white/30 backdrop-blur-sm rounded-xl px-4 py-2.5 min-h-[44px]">
          <LogOut className="w-4 h-4" /> <span className="text-sm">Uit</span>
        </button>
      )}
      {onAdmin && (
        <button onClick={onAdmin} data-testid="kiosk-admin-btn"
          className="flex items-center gap-2 text-orange-600 font-bold bg-white active:bg-orange-50 rounded-xl px-4 py-2.5 min-h-[44px] shadow-sm">
          <SettingsIcon className="w-4 h-4" /> <span className="text-sm">Beheerder</span>
        </button>
      )}
    </div>
  );
}

// =====================================================================
// Apartment select (with optional inline location picker when ≥2 locations)
// =====================================================================
function ApartmentSelect({ onSelect, onAdmin, onExit }) {
  const [apartments, setApartments] = useState([]);
  const [locations, setLocations] = useState([]);
  const [selectedLocationId, setSelectedLocationId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/kiosk/apartments'),
      api.get('/kiosk/locations'),
    ]).then(([aRes, lRes]) => {
      setApartments(aRes.data);
      setLocations((lRes.data || []).filter((l) => l.id !== '_none'));
    }).catch((e) => setError(formatError(e)))
      .finally(() => setLoading(false));
  }, []);

  const unassignedCount = useMemo(
    () => apartments.filter((a) => !a.location_id && a.status === 'occupied').length,
    [apartments]
  );
  const totalGroups = locations.length + (unassignedCount > 0 ? 1 : 0);
  const showLocationPicker = totalGroups > 1 && selectedLocationId === null;

  // Auto-skip when there's only one (or zero) groups.
  useEffect(() => {
    if (loading || selectedLocationId !== null) return;
    if (totalGroups <= 1) {
      setSelectedLocationId(locations[0]?.id || '__any__');
    }
  }, [loading, selectedLocationId, totalGroups, locations]);

  if (loading) {
    return (
      <div className="h-full bg-orange-500 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-white animate-spin" />
      </div>
    );
  }

  const currentLocation = selectedLocationId === '__none__'
    ? { name: 'Overige' }
    : selectedLocationId === '__any__'
      ? null
      : locations.find((l) => l.id === selectedLocationId);

  const visible = (showLocationPicker ? [] :
    selectedLocationId === '__none__' ? apartments.filter((a) => !a.location_id) :
    selectedLocationId === '__any__' ? apartments :
    apartments.filter((a) => a.location_id === selectedLocationId)
  ).filter((a) => a.status === 'occupied' && a.tenant_id).sort(sortApartments);

  // ----- Location picker view -----
  if (showLocationPicker) {
    return (
      <div className="h-full bg-orange-500 flex flex-col" style={{ padding: '1.5vh 1.5vw 0' }}>
        <div className="flex items-center justify-between flex-wrap gap-2 px-1 sm:px-2 py-2" style={{ minHeight: '7vh' }}>
          <MobileHeaderButtons onAdmin={onAdmin} onExit={onExit} />
          <span className="text-sm sm:text-base font-semibold text-white">Kies een locatie</span>
          <div className="w-16" />
        </div>
        <div className="flex-1 min-h-0 overflow-auto pb-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 px-1 sm:px-2 max-w-5xl mx-auto pt-2">
            {locations.map((loc) => {
              const count = apartments.filter((a) => a.location_id === loc.id && a.status === 'occupied').length;
              return (
                <button key={loc.id} onClick={() => setSelectedLocationId(loc.id)}
                  data-testid={`location-${loc.id}`}
                  className="bg-white/90 backdrop-blur-sm flex flex-col items-center text-center rounded-2xl p-6 sm:p-8 hover:-translate-y-1 hover:bg-white transition shadow-lg border-2 border-transparent hover:border-orange-500">
                  {loc.photo_url ? (
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden mb-3 bg-slate-100">
                      <img src={loc.photo_url} alt={loc.name} className="w-full h-full object-cover"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    </div>
                  ) : (
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-orange-100 flex items-center justify-center mb-3">
                      <MapPin className="w-7 h-7 sm:w-8 sm:h-8 text-orange-600" />
                    </div>
                  )}
                  <span className="text-lg sm:text-xl font-extrabold text-slate-900 mb-1">{loc.name}</span>
                  {loc.address && <span className="text-xs text-slate-500 mb-2">{loc.address}</span>}
                  <span className="text-xs font-bold text-orange-600 bg-orange-50 rounded-full px-3 py-1">
                    {count} {count === 1 ? 'appartement' : 'appartementen'}
                  </span>
                </button>
              );
            })}
            {unassignedCount > 0 && (
              <button onClick={() => setSelectedLocationId('__none__')}
                data-testid="location-unassigned"
                className="bg-white/80 backdrop-blur-sm flex flex-col items-center text-center rounded-2xl p-6 sm:p-8 hover:-translate-y-1 hover:bg-white transition shadow-lg border-2 border-dashed border-white/40">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                  <Building2 className="w-7 h-7 sm:w-8 sm:h-8 text-slate-500" />
                </div>
                <span className="text-lg sm:text-xl font-extrabold text-slate-700 mb-1">Overige</span>
                <span className="text-xs text-slate-500 mb-2">Zonder locatie</span>
                <span className="text-xs font-bold text-slate-600 bg-slate-50 rounded-full px-3 py-1">
                  {unassignedCount} {unassignedCount === 1 ? 'appartement' : 'appartementen'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ----- Apartment grid view -----
  return (
    <div className="h-full bg-orange-500 flex flex-col" style={{ padding: '1.5vh 1.5vw 0' }}>
      <div className="flex items-center justify-between flex-wrap gap-2 px-1 sm:px-2 py-2" style={{ minHeight: '7vh' }}>
        <div className="flex items-center gap-2">
          {totalGroups > 1 && (
            <button onClick={() => setSelectedLocationId(null)} data-testid="back-to-locations"
              className="flex items-center gap-1.5 text-white font-bold bg-white/20 backdrop-blur-sm rounded-lg px-3 py-1.5">
              <ArrowLeft className="w-3.5 h-3.5" /> <span className="text-xs">Locaties</span>
            </button>
          )}
          <MobileHeaderButtons onAdmin={onAdmin} onExit={onExit} />
        </div>
        <span className="text-sm sm:text-base font-semibold text-white">
          {currentLocation ? `${currentLocation.name} · Kies uw appartement` : 'Kies uw appartement'}
        </span>
        <div className="w-16" />
      </div>

      {error && (
        <div className="bg-white/95 text-red-600 rounded-lg text-center text-sm font-semibold mx-1 mb-2 py-2 px-3">{error}</div>
      )}

      <div className="flex-1 min-h-0 overflow-auto pb-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3 px-1 sm:px-2">
          {visible.map((a) => (
            <button key={a.id} onClick={() => onSelect(a)} data-testid={`apt-${a.number}`}
              className="group bg-white/85 backdrop-blur-sm flex flex-col items-center justify-center text-center rounded-xl sm:rounded-2xl p-3 sm:p-4 hover:-translate-y-1 hover:bg-white/95 transition border-2 border-transparent hover:border-orange-500 shadow"
              style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
              <div className="rounded-full flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 mb-2 bg-orange-50 group-hover:bg-orange-100">
                <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-orange-500" />
              </div>
              <span className="text-base sm:text-lg font-extrabold text-slate-900 mb-0.5">{a.number}</span>
              <div className="flex items-center gap-1 text-slate-400 mb-1">
                <User className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span className="text-xs sm:text-sm truncate text-slate-700 font-medium max-w-[100px] sm:max-w-[120px]">{a.tenant_name}</span>
              </div>
              <span className="text-xs font-bold text-green-600 bg-green-50 rounded-full px-2.5 py-0.5">Bezet</span>
            </button>
          ))}
          {visible.length === 0 && (
            <div className="col-span-full bg-white/90 rounded-2xl p-10 text-center">
              <Home className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-semibold">Geen bezette appartementen op deze locatie.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Tenant overview — split-screen
// =====================================================================
function TenantOverview({ apartment, onBack, onPay }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!apartment?.tenant_id) return;
    api.get(`/kiosk/tenants/${apartment.tenant_id}/overview`)
      .then((r) => setData(r.data))
      .catch((e) => setErr(formatError(e)))
      .finally(() => setLoading(false));
  }, [apartment]);

  if (loading) return <div className="h-full bg-orange-500 flex items-center justify-center"><Loader2 className="w-10 h-10 text-white animate-spin" /></div>;
  if (err || !data) return <div className="h-full bg-orange-500 flex items-center justify-center text-white p-8">{err || 'Geen data'}</div>;

  const { tenant, apartment: apt, balance } = data;
  const internet = Number(tenant.internet_amount || 0);
  const openRent = balance.balance > 0 ? balance.balance : 0;
  const totalDue = openRent + internet;
  const cur = balance.currency || apt.currency || 'SRD';

  const items = [
    { key: 'rent', label: 'Maandhuur', value: apt.rent_amount, icon: Home },
    ...(openRent > 0 ? [{ key: 'open', label: 'Openstaande huur', value: openRent, icon: Wallet, highlight: true,
        sub: balance.next_period ? `${MONTHS_NL[balance.next_period.month - 1]} ${balance.next_period.year}` : '' }] : []),
    { key: 'svc', label: 'Servicekosten', value: 0, icon: FileText, muted: true },
    { key: 'fines', label: 'Boetes', value: 0, icon: FileText, muted: true },
    { key: 'internet', label: 'Internet', value: internet, icon: Wifi, muted: internet === 0 },
  ];

  return (
    <div className="h-full bg-orange-500 flex flex-col" style={{ padding: '1.5vh 1.5vw 0' }}>
      <div className="flex items-center justify-between flex-wrap gap-2 px-1 sm:px-2 py-2">
        <button onClick={onBack} data-testid="overview-back"
          className="flex items-center gap-1.5 text-white font-bold bg-white/20 backdrop-blur-sm rounded-lg px-3 py-1.5 sm:px-4 sm:py-2">
          <ArrowLeft className="w-4 h-4" /> <span className="text-xs sm:text-sm">Terug</span>
        </button>
        <div className="text-right text-white">
          <p className="text-xs sm:text-sm font-semibold">{tenant.name}</p>
          <p className="text-[10px] sm:text-xs opacity-70">Appt. {apt.number}</p>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-2 sm:gap-3 pb-3">
        <div className="bg-white rounded-2xl flex-1 md:flex-[3] flex flex-col p-4 sm:p-5 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base sm:text-lg font-bold text-slate-900">Financieel overzicht</h3>
            <button data-testid="overview-pdf" disabled
              className="px-3 h-8 rounded-lg bg-orange-100 text-orange-700 font-bold text-xs flex items-center gap-1.5 disabled:opacity-60 cursor-not-allowed">
              <Download className="w-3.5 h-3.5" /> PDF
            </button>
          </div>
          <div className="flex-1 divide-y divide-slate-100">
            {items.map((it) => {
              const Icon = it.icon;
              const klass = it.highlight ? 'text-orange-600' : it.muted ? 'text-slate-400' : 'text-slate-900';
              return (
                <div key={it.key} className={`flex items-center justify-between py-2.5 px-1 ${klass}`}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                      it.highlight ? 'bg-orange-100 text-orange-500' : it.muted ? 'bg-slate-50 text-slate-300' : 'bg-slate-100 text-slate-500'
                    }`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm ${it.highlight ? 'font-extrabold' : 'font-semibold'}`}>{it.label}</p>
                      {it.sub && <p className="text-[10px] mt-0.5">{it.sub}</p>}
                    </div>
                  </div>
                  <p className={`font-bold text-sm sm:text-base ${it.highlight ? 'font-extrabold' : ''}`}>{fmtMoney(it.value, cur)}</p>
                </div>
              );
            })}
          </div>
          <div className="border-t-2 border-slate-200 mt-2 pt-2 flex items-center justify-between">
            <p className="font-bold text-slate-900 text-sm sm:text-base">Totaal openstaand</p>
            <p className="text-lg sm:text-xl font-extrabold text-slate-900" data-testid="overview-total">{fmtMoney(totalDue, cur)}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl md:flex-[2] flex flex-col items-center justify-center text-center p-6 sm:p-8 min-h-[260px]">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-orange-100 flex items-center justify-center mb-3">
            <Wallet className="w-7 h-7 sm:w-9 sm:h-9 text-orange-500" />
          </div>
          <p className="text-xs sm:text-sm font-bold uppercase tracking-widest text-slate-400">Te betalen</p>
          <p className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight mt-1 mb-6">{fmtMoney(totalDue, cur)}</p>
          <button onClick={() => onPay({ ...data, internet, total_due: totalDue })}
            data-testid="overview-pay-btn"
            className="w-full max-w-xs bg-orange-500 hover:bg-orange-600 text-white text-base sm:text-lg font-bold rounded-xl flex items-center justify-center gap-2 transition py-3 sm:py-3.5 active:scale-[0.98]">
            Volgende <ArrowRight className="w-5 h-5" />
          </button>
          <button onClick={() => setShowHistory(true)} data-testid="overview-history-btn"
            className="mt-2 w-full max-w-xs bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold rounded-xl flex items-center justify-center gap-2 py-2.5 text-sm">
            <ClockIcon className="w-4 h-4" /> Betalingsgeschiedenis
          </button>
        </div>
      </div>

      {showHistory && <PaymentHistoryModal tenant={tenant} apartment={apt} onClose={() => setShowHistory(false)} />}
    </div>
  );
}

// =====================================================================
// Payment history modal
// =====================================================================
function PaymentHistoryModal({ tenant, apartment, onClose }) {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.get(`/kiosk/tenants/${tenant.id}/payments`)
      .then((r) => setItems(r.data)).catch((e) => setErr(formatError(e)));
  }, [tenant.id]);

  return (
    <div className="fixed inset-0 z-50 backdrop-blur-md flex items-center justify-center p-4 md:p-6"
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px), 1rem)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 1rem)',
        /* Brand-georiënteerde overlay zodat in PWA-kiosk de home-indicator
           gebied dezelfde oranje kleur houdt als de rest van de kiosk,
           in plaats van een zwarte band. */
        backgroundColor: 'rgba(199, 70, 0, 0.55)',
      }}
      data-testid="kiosk-history-modal">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] my-auto overflow-hidden flex flex-col">
        <div className="px-5 sm:px-6 py-3.5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
              <ClockIcon className="w-4 h-4 text-orange-500" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900">Betalingsgeschiedenis</h3>
              <p className="text-xs text-slate-500 truncate">Appt. {apartment?.number}</p>
            </div>
          </div>
          <button onClick={onClose} data-testid="history-close"
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-3"
          style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
          {err && <p className="text-red-500 text-sm py-4">{err}</p>}
          {!items && !err && <div className="py-10 flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-orange-500" /></div>}
          {items && items.length === 0 && (
            <div className="py-10 text-center text-slate-400">
              <Receipt className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p>Nog geen betalingen voor deze huurder.</p>
            </div>
          )}
          {items && items.map((p) => (
            <div key={p.id} className="py-3 border-b border-slate-100 last:border-0 flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-extrabold text-slate-900">{fmtMoney(p.amount, p.currency)}</p>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-orange-100 text-orange-700">{p.category}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-600">{p.method}</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {new Date(p.paid_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {' · '}{p.receipt_number}
                  {p.period_month ? ` · Periode: ${MONTHS_NL[p.period_month - 1]} ${p.period_year}` : ''}
                </p>
                {(p.received_by || p.approved_by) && (
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {p.received_by ? <>Ontvangen door <b className="text-slate-600">{p.received_by}</b></> : null}
                    {p.received_by && p.approved_by ? ' · ' : ''}
                    {p.approved_by ? <>Goedgekeurd door <b className="text-slate-600">{p.approved_by}</b></> : null}
                  </p>
                )}
              </div>
              <button data-testid={`history-print-${p.id}`}
                onClick={() => window.open(`/api/payments/${p.id}/pdf`, '_blank')}
                className="px-2.5 h-8 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs flex items-center gap-1 shrink-0">
                <Printer className="w-3 h-3" /> Afdruk
              </button>
            </div>
          ))}
        </div>
        <div className="px-5 sm:px-6 py-3 border-t border-slate-100 shrink-0">
          <button onClick={onClose}
            className="w-full h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm">Sluiten</button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Pay select — checklist + keypad (old-ERP style)
// =====================================================================
const PAY_ITEMS_TEMPLATE = [
  { id: 'huur', label: 'Huur', icon: Banknote, desc: 'Openstaand huurbedrag' },
  { id: 'servicekosten', label: 'Servicekosten', icon: Droplets, desc: 'Water, stroom en overige' },
  { id: 'boete', label: 'Boetes', icon: AlertCircle, desc: 'Openstaande boetes' },
  { id: 'internet', label: 'Internet', icon: Wifi, desc: 'Internetaansluiting' },
];

function PaySelect({ overview, onBack, onConfirm }) {
  const { tenant, apartment: apt, balance, internet, total_due } = overview;
  const cur = (balance.currency || apt.currency || 'SRD').toUpperCase();
  const fmt = (v) => fmtMoney(v, cur);
  const openRent = balance.balance > 0 ? balance.balance : 0;

  const amounts = {
    huur: openRent > 0 ? openRent : apt.rent_amount,
    servicekosten: 0,
    boete: 0,
    internet: Number(internet || 0),
  };

  const [selected, setSelected] = useState(new Set());
  const [custom, setCustom] = useState('');
  const [showMobileKeypad, setShowMobileKeypad] = useState(false);

  const toggle = (id) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setCustom('');
  };

  const isDisabled = (id) => (amounts[id] || 0) <= 0;
  const enabled = PAY_ITEMS_TEMPLATE.filter((t) => !isDisabled(t.id));
  const allSelected = enabled.length > 0 && enabled.every((t) => selected.has(t.id));
  const selectAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(enabled.map((t) => t.id)));
    setCustom('');
  };

  const selectedTotal = [...selected].reduce((s, id) => s + (amounts[id] || 0), 0);
  const hasCustom = custom && parseFloat(custom) > 0;
  const activeAmount = hasCustom ? parseFloat(custom) : selectedTotal;
  const canProceed = activeAmount > 0;

  const buildDescription = () => {
    const labels = [];
    if (selected.has('huur')) labels.push('Huur');
    if (selected.has('servicekosten')) labels.push('Servicekosten');
    if (selected.has('boete')) labels.push('Boetes');
    if (selected.has('internet')) labels.push('Internet');
    return labels.join(' + ');
  };

  const press = (k) => {
    if (k === 'DEL') setCustom((c) => c.slice(0, -1));
    else if (k === '.') setCustom((c) => c.includes('.') ? c : c + '.');
    else setCustom((c) => c + k);
    setSelected(new Set());
  };

  const handleNext = () => {
    if (!canProceed) return;
    let amount, category, note;
    if (hasCustom) {
      amount = parseFloat(custom);
      category = 'huur';  // partial -> general bucket
      note = `Gedeeltelijke betaling — ${fmt(amount)}`;
    } else {
      amount = selectedTotal;
      category = selected.size === 1 ? [...selected][0] : 'huur';
      note = buildDescription();
    }
    onConfirm({
      tenant_id: tenant.id, apartment_id: apt.id,
      amount, currency: cur, category, method: 'contant',
      period_month: category === 'huur' && balance.next_period ? balance.next_period.month : null,
      period_year: category === 'huur' && balance.next_period ? balance.next_period.year : null,
      note,
    });
  };

  return (
    <div className="h-full bg-orange-500 flex flex-col px-3 sm:px-6 pt-2">
      <div className="flex items-center justify-between flex-wrap gap-2 py-2">
        <button onClick={onBack} data-testid="payselect-back-btn"
          className="flex items-center gap-1.5 text-white font-bold bg-white/20 backdrop-blur-sm rounded-lg px-3 py-1.5 sm:px-4 sm:py-2">
          <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" /> <span className="text-xs sm:text-sm">Terug</span>
        </button>
        <span className="text-sm sm:text-base font-semibold text-white">Wat wilt u betalen?</span>
        <div className="text-right text-white hidden sm:block">
          <p className="text-xs sm:text-sm font-semibold">{tenant.name}</p>
          <p className="text-[10px] sm:text-xs opacity-70">Appt. {apt.number}</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row gap-2 sm:gap-3 min-h-0 pb-2">
        {/* LEFT — Payment items */}
        <div className="bg-white rounded-2xl flex-1 md:flex-[3] flex flex-col min-w-0 p-2 sm:p-3">
          {enabled.length > 1 && (
            <button onClick={selectAll} data-testid="pay-select-all"
              className={`w-full flex items-center justify-between rounded-lg border-2 transition px-2.5 py-2 sm:px-3 sm:py-2.5 mb-1.5 ${
                allSelected ? 'bg-orange-50 border-orange-400' : 'bg-white border-slate-200 hover:border-orange-300'
              }`}>
              <div className="flex items-center gap-2">
                <div className={`flex items-center justify-center rounded border-2 w-5 h-5 ${allSelected ? 'bg-orange-500 border-orange-500' : 'border-slate-300'}`}>
                  {allSelected && <Check className="text-white w-3.5 h-3.5" strokeWidth={3} />}
                </div>
                <span className="text-sm font-bold text-slate-900">Alles betalen</span>
              </div>
              <span className="text-sm sm:text-base font-semibold text-orange-600 whitespace-nowrap">
                {fmt(enabled.reduce((s, t) => s + (amounts[t.id] || 0), 0))}
              </span>
            </button>
          )}

          <div className="flex flex-col gap-1 sm:gap-1.5 flex-1">
            {PAY_ITEMS_TEMPLATE.map((t) => {
              const disabled = isDisabled(t.id);
              const sel = selected.has(t.id);
              const Icon = t.icon;
              return (
                <button key={t.id} disabled={disabled} onClick={() => toggle(t.id)} data-testid={`pay-type-${t.id}`}
                  className={`flex items-center justify-between w-full rounded-lg border-2 transition px-2.5 py-2 sm:px-3 sm:py-2.5 ${
                    disabled ? 'bg-slate-50 border-slate-100 opacity-40 cursor-not-allowed' :
                    sel ? 'bg-orange-50 border-orange-400' : 'bg-white border-slate-200 hover:border-orange-300'
                  }`}>
                  <div className="flex items-center gap-2">
                    <div className={`flex items-center justify-center rounded border-2 flex-shrink-0 w-5 h-5 ${sel ? 'bg-orange-500 border-orange-500' : 'border-slate-300'}`}>
                      {sel && <Check className="text-white w-3.5 h-3.5" strokeWidth={3} />}
                    </div>
                    <div className={`rounded-lg flex items-center justify-center flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 ${sel ? 'bg-orange-100' : 'bg-slate-50'}`}>
                      <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${sel ? 'text-orange-500' : 'text-slate-400'}`} />
                    </div>
                    <span className="text-sm font-bold text-slate-900">{t.label}</span>
                  </div>
                  <p className={`text-sm sm:text-base flex-shrink-0 ml-2 whitespace-nowrap font-semibold ${disabled ? 'text-slate-300' : sel ? 'text-orange-600' : 'text-slate-900'}`}>
                    {fmt(amounts[t.id] || 0)}
                  </p>
                </button>
              );
            })}
          </div>

          {selected.size > 0 && (
            <div className="bg-slate-900 rounded-lg flex items-center justify-between px-3 py-2 sm:py-2.5 mt-1.5">
              <div className="min-w-0">
                <p className="text-xs text-slate-400">{selected.size} item{selected.size > 1 ? 's' : ''}</p>
                <p className="text-xs text-white truncate">{buildDescription()}</p>
              </div>
              <p className="text-base sm:text-lg font-bold text-white whitespace-nowrap ml-2">{fmt(selectedTotal)}</p>
            </div>
          )}

          <button onClick={handleNext} disabled={!canProceed} data-testid="payment-next-btn"
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl flex items-center justify-center gap-2 transition active:scale-[0.98] py-3 sm:py-3.5 mt-1.5 text-sm sm:text-base font-bold">
            <span>Volgende — {fmt(activeAmount)}</span> <ArrowRight className="w-5 h-5" />
          </button>

          {/* Mobile keypad toggle */}
          <div className="md:hidden mt-1.5">
            {!showMobileKeypad ? (
              <button onClick={() => setShowMobileKeypad(true)} data-testid="mobile-custom-toggle"
                className="w-full flex items-center justify-center gap-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-500 hover:bg-slate-100 transition">
                <Hash className="w-4 h-4" /> Ander bedrag invoeren
              </button>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl p-2.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-medium">Ander bedrag ({cur})</span>
                  <button onClick={() => { setShowMobileKeypad(false); setCustom(''); }} className="text-xs text-slate-400">Sluiten</button>
                </div>
                <div className={`border-2 rounded-lg text-center py-2 mb-2 ${hasCustom ? 'bg-orange-50 border-orange-300' : 'bg-slate-50 border-slate-200'}`}>
                  <span className={`font-mono font-extrabold text-xl ${hasCustom ? 'text-orange-600' : 'text-slate-300'}`}>{cur} {custom || '0.00'}</span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {['1','2','3','DEL','4','5','6','.','7','8','9','0'].map((k) => (
                    <button key={k} onClick={() => press(k)} data-testid={`mobile-key-${k}`}
                      className={`rounded-lg font-bold transition active:scale-95 h-10 text-base ${
                        k === 'DEL' ? 'bg-red-50 text-red-500 text-xs' : 'bg-slate-50 text-slate-900 hover:bg-orange-50 hover:text-orange-600 border border-slate-100'
                      }`}>{k}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — Desktop keypad */}
        <div className="bg-white rounded-2xl hidden md:flex flex-none md:flex-[2] flex-col min-w-0 p-4 sm:p-5">
          <h4 className="text-sm sm:text-base font-bold text-slate-900 mb-0.5">Bedrag invoeren</h4>
          <p className="text-xs text-slate-400 mb-3">Totaal openstaand: {fmt(total_due)}</p>
          <div className={`border-2 rounded-lg transition px-3 py-3 mb-3 ${hasCustom ? 'bg-orange-50 border-orange-300' : 'bg-slate-50 border-slate-200'}`}>
            <p className="text-xs text-slate-400 mb-0.5">{cur}</p>
            <p className={`font-extrabold font-mono text-2xl sm:text-3xl ${hasCustom ? 'text-orange-600' : 'text-slate-900'}`} data-testid="pay-amount-display">
              {custom || '0.00'}
            </p>
          </div>
          <div className="grid grid-cols-3 flex-1 gap-1.5">
            {['1','2','3','4','5','6','7','8','9','.','0','DEL'].map((k) => (
              <button key={k} onClick={() => press(k)} data-testid={`keypad-${k}`}
                className={`rounded-lg font-bold transition active:scale-95 flex items-center justify-center text-base sm:text-lg ${
                  k === 'DEL' ? 'bg-slate-100 text-red-500 hover:bg-red-50 border border-slate-100' :
                  'bg-slate-50 text-slate-900 hover:bg-orange-50 hover:text-orange-600 border border-slate-100'
                }`}>{k}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Method select — Contant / Mope / Uni5Pay
// =====================================================================
function MethodSelect({ payload, overview, onBack, onConfirm }) {
  const { tenant, apartment: apt } = overview;
  const cur = payload.currency || 'SRD';
  const methods = [
    { v: 'contant', l: 'Contant', sub: 'Betaal met contant geld', icon: Banknote, accent: 'emerald' },
    { v: 'mope', l: 'Mope', sub: 'Scan QR-code', icon: QrCode, accent: 'emerald' },
    { v: 'uni5pay', l: 'Uni5Pay', sub: 'Scan QR-code', icon: Smartphone, accent: 'red' },
  ];
  // Poll het klantenscherm: zodra de klant zelf een methode kiest, gaan we
  // automatisch door naar het bevestig-scherm. De company-slug komt uit
  // localStorage (gezet bij PIN-login of via branding).
  const slug = (() => {
    try { return localStorage.getItem('pwa_company_slug') || ''; } catch { return ''; }
  })();
  const [customerPicked, setCustomerPicked] = useState(null);
  useEffect(() => {
    if (!slug) return undefined;
    let stopped = false;
    let timer;
    const tick = async () => {
      try {
        const { data } = await api.get(`/public/customer-display/${slug}?t=${Date.now()}`);
        const m = data?.state?.payload?.method;
        if (m && !stopped) setCustomerPicked(m);
      } catch { /* ignore */ }
      if (!stopped) timer = setTimeout(tick, 800);
    };
    tick();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [slug]);
  useEffect(() => {
    if (customerPicked) onConfirm({ ...payload, method: customerPicked });
  }, [customerPicked, onConfirm, payload]);

  return (
    <div className="h-full bg-orange-500 flex flex-col" style={{ padding: '1.5vh 1.5vw 0' }}>
      <div className="flex items-center justify-between flex-wrap gap-2 px-1 sm:px-2 py-2">
        <button onClick={onBack} data-testid="method-back"
          className="flex items-center gap-1.5 text-white font-bold bg-white/20 backdrop-blur-sm rounded-lg px-3 py-1.5 sm:px-4 sm:py-2">
          <ArrowLeft className="w-4 h-4" /> <span className="text-xs sm:text-sm">Terug</span>
        </button>
        <span className="text-sm sm:text-base font-semibold text-white">
          Hoe wilt u betalen? <span className="ml-2 opacity-80">{fmtMoney(payload.amount, cur)}</span>
        </span>
        <div className="text-right text-white">
          <p className="text-xs sm:text-sm font-semibold">{tenant.name}</p>
          <p className="text-[10px] sm:text-xs opacity-70">Appt. {apt.number}</p>
        </div>
      </div>
      {slug && (
        <div className="px-2 sm:px-4 mb-1">
          <div className="bg-white/20 backdrop-blur-sm rounded-xl px-4 py-2 text-white text-center text-sm font-bold"
            data-testid="method-waiting-customer">
            <Loader2 className="inline-block w-4 h-4 mr-2 animate-spin" />
            Wacht op klant: laat hen op het klantenscherm de betaalmethode kiezen — of tik hieronder voor handmatige invoer.
          </div>
        </div>
      )}
      <div className="flex-1 min-h-0 flex items-center justify-center pb-6 overflow-auto">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 max-w-4xl w-full px-2">
          {methods.map((m) => {
            const Icon = m.icon;
            return (
              <button key={m.v} onClick={() => onConfirm({ ...payload, method: m.v })} data-testid={`method-${m.v}`}
                className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-8 flex sm:flex-col items-center sm:justify-center text-left sm:text-center gap-4 sm:gap-0 hover:scale-[1.02] sm:hover:scale-[1.03] active:scale-[0.98] transition sm:aspect-[3/4] shadow-2xl">
                <div className={`w-14 h-14 sm:w-20 sm:h-20 rounded-full flex items-center justify-center shrink-0 sm:mb-4 ${
                  m.accent === 'red' ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-500'
                }`}>
                  <Icon className="w-7 h-7 sm:w-10 sm:h-10" />
                </div>
                <div className="min-w-0 flex-1 sm:flex-none">
                  <p className="text-lg sm:text-2xl font-extrabold text-slate-900">{m.l}</p>
                  <p className="text-xs sm:text-sm text-slate-500 mt-0.5 sm:mt-1">{m.sub}</p>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-300 sm:hidden ml-auto shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Confirm + Receipt
// =====================================================================
function PaymentConfirm({ payload, overview, onBack, onSuccess }) {
  const { tenant, apartment: apt } = overview;
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    setLoading(true); setErr('');
    try {
      const { data } = await api.post('/kiosk/payments', payload);
      onSuccess(data);
    } catch (e) { setErr(formatError(e)); }
    finally { setLoading(false); }
  };
  return (
    <div className="h-full bg-orange-500 flex flex-col" style={{ padding: '1.5vh 1.5vw 0' }}>
      <div className="flex items-center justify-between flex-wrap gap-2 px-1 sm:px-2 py-2">
        <button onClick={onBack} data-testid="confirm-back"
          className="flex items-center gap-1.5 text-white font-bold bg-white/20 backdrop-blur-sm rounded-lg px-3 py-1.5 sm:px-4 sm:py-2">
          <ArrowLeft className="w-4 h-4" /> <span className="text-xs sm:text-sm">Terug</span>
        </button>
        <span className="text-sm sm:text-base font-semibold text-white">Bevestig betaling</span>
        <div className="text-right text-white">
          <p className="text-xs sm:text-sm font-semibold">{tenant.name}</p>
          <p className="text-[10px] sm:text-xs opacity-70">Appt. {apt.number}</p>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center pb-6">
        <div className="bg-white rounded-3xl w-full max-w-xl p-6 sm:p-8 shadow-2xl">
          <div className="bg-slate-900 rounded-2xl p-6 mb-5 text-white text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-white/60">Te betalen</p>
            <p className="text-5xl font-extrabold tracking-tight mt-2 text-orange-400">{fmtMoney(payload.amount, payload.currency)}</p>
            <p className="text-sm text-white/80 mt-2 capitalize">
              {payload.note || payload.category}
              {payload.period_month ? ` · ${MONTHS_NL[payload.period_month - 1]} ${payload.period_year}` : ''}
            </p>
          </div>
          <div className="space-y-2 mb-5">
            <Row label="Huurder" value={tenant.name} />
            <Row label="Appartement" value={`Appt. ${apt.number}`} />
            <Row label="Betaalwijze" value={String(payload.method || '').toUpperCase()} />
          </div>
          {err && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm">{err}</div>}
          <button onClick={submit} disabled={loading} data-testid="confirm-submit"
            className="w-full h-14 bg-emerald-500 hover:bg-emerald-600 text-white text-lg font-extrabold rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
            Bevestig betaling
          </button>
        </div>
      </div>
    </div>
  );
}
function Row({ label, value }) {
  return (
    <div className="flex justify-between items-center bg-slate-50 rounded-lg p-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-bold text-slate-900">{value}</span>
    </div>
  );
}

function ReceiptScreen({ payment, overview, onDone }) {
  // Bereken openstaand saldo NA deze betaling — refetch van backend voor
  // de echte stand (rekening houdend met openstaande maanden + nieuwe
  // huurperiode). Fallback: vorige overview min betaald bedrag.
  const cur = payment.currency || overview?.balance?.currency || 'SRD';
  const [remaining, setRemaining] = useState(() => {
    const prevDue = Number(overview?.total_due || 0);
    return Math.max(0, prevDue - Number(payment.amount || 0));
  });
  const [remainingLoading, setRemainingLoading] = useState(true);
  // E-mail status — null = bezig, {sent:true,to} = verstuurd, {sent:false} = overgeslagen/mislukt.
  const [emailStatus, setEmailStatus] = useState(null);

  useEffect(() => {
    const tid = payment.tenant_id || overview?.tenant?.id;
    if (!tid) { setRemainingLoading(false); return; }
    api.get(`/kiosk/tenants/${tid}/overview`)
      .then((r) => {
        const data = r.data || {};
        const bal = Number(data?.balance?.balance || 0);
        const open = bal > 0 ? bal : 0;
        const internet = Number(data?.tenant?.internet_amount || 0);
        setRemaining(open + internet);
      })
      .catch(() => { /* val terug op lokale schatting */ })
      .finally(() => setRemainingLoading(false));
  }, [payment.tenant_id, overview]);

  // Digitale kopie verzenden — e-mail (PDF-bijlage) + WhatsApp/SMS (PDF-link)
  // tegelijk, getriggerd op het tear-moment. Beide endpoints zijn best-effort
  // en faken nooit een fout; UX blijft soepel.
  useEffect(() => {
    const t = setTimeout(() => {
      Promise.all([
        api.post(`/kiosk/payments/${payment.id}/email`).then((r) => r.data).catch(() => ({ sent: false })),
        api.post(`/kiosk/payments/${payment.id}/whatsapp`).then((r) => r.data).catch(() => ({ sent: false })),
      ]).then(([email, msg]) => {
        setEmailStatus({ email, msg });
      });
    }, 2900);  // direct na de tear-snap
    return () => clearTimeout(t);
  }, [payment.id]);

  // Bon-printer geluid — gesynthetiseerd via Web Audio API.
  // Imiteert een thermische kassa-printer: continue mechanische "zip" met
  // ritmische clicks (paper feed), gevolgd door een tear-cut en chime.
  useEffect(() => {
    let ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      const t0 = ctx.currentTime;
      const PRINT_DUR = 2.6;    // hoofd "zip" 2.6s
      const TEAR_AT = t0 + 2.65; // korte tear-snap
      const CHIME_AT = t0 + 2.9; // chime na tear

      // --- 1) Hoofdgeluid: gefilterde ruis met snelle aan/uit modulatie
      //     (= karakteristiek zoemend papier-voer geluid van een bonprinter)
      const sr = ctx.sampleRate;
      const buf = ctx.createBuffer(1, Math.floor(sr * PRINT_DUR), sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        const tt = i / sr;
        // 95Hz buzz (= papier door rollers) gecombineerd met 14Hz pulse
        // (= dot-matrix head per regel) en wat ruis voor textuur.
        const buzz = (Math.sin(tt * 2 * Math.PI * 95) > 0 ? 1 : -1) * 0.55;
        const headPulse = Math.sin(tt * 2 * Math.PI * 14) * 0.5 + 0.5; // 0..1
        const noise = (Math.random() * 2 - 1) * 0.45;
        d[i] = (buzz * 0.55 + noise * 0.7) * (0.35 + headPulse * 0.65);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2200;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 220;
      const mainGain = ctx.createGain();
      mainGain.gain.setValueAtTime(0.0001, t0);
      mainGain.gain.exponentialRampToValueAtTime(0.32, t0 + 0.08);
      mainGain.gain.setValueAtTime(0.32, t0 + PRINT_DUR - 0.15);
      mainGain.gain.exponentialRampToValueAtTime(0.0001, t0 + PRINT_DUR);
      src.connect(hp).connect(lp).connect(mainGain).connect(ctx.destination);
      src.start(t0);
      src.stop(t0 + PRINT_DUR);

      // --- 2) Mechanische clicks bovenop (papier-tand / step motor)
      const click = (when, vol = 0.18) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'square';
        o.frequency.value = 1800;
        g.gain.setValueAtTime(0.0001, when);
        g.gain.exponentialRampToValueAtTime(vol, when + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0001, when + 0.025);
        o.connect(g).connect(ctx.destination);
        o.start(when); o.stop(when + 0.03);
      };
      for (let i = 0; i < 18; i++) click(t0 + 0.1 + i * 0.14);

      // --- 3) Tear-snap (paper cut)
      const tearLen = Math.floor(sr * 0.18);
      const tearBuf = ctx.createBuffer(1, tearLen, sr);
      const td = tearBuf.getChannelData(0);
      for (let i = 0; i < tearLen; i++) {
        const env = 1 - i / tearLen;
        td[i] = (Math.random() * 2 - 1) * env * env;
      }
      const tear = ctx.createBufferSource();
      tear.buffer = tearBuf;
      const tearHp = ctx.createBiquadFilter();
      tearHp.type = 'highpass';
      tearHp.frequency.value = 2500;
      const tearGain = ctx.createGain();
      tearGain.gain.value = 0.5;
      tear.connect(tearHp).connect(tearGain).connect(ctx.destination);
      tear.start(TEAR_AT);

      // --- 4) Chime (success ding-ding)
      const tone = (freq, start, dur, vol = 0.22) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(vol, start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        o.connect(g).connect(ctx.destination);
        o.start(start); o.stop(start + dur);
      };
      tone(880, CHIME_AT, 0.22);
      tone(1318, CHIME_AT + 0.22, 0.32);
    } catch { /* audio kan geweigerd zijn — niet kritiek */ }

    return () => { try { ctx && ctx.close(); } catch { /* noop */ } };
  }, []);

  // Auto-terug naar beginscherm na 10 seconden.
  useEffect(() => {
    const t = setTimeout(onDone, 10000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="h-full bg-orange-500 flex flex-col items-center justify-start sm:justify-center p-4 sm:p-8 overflow-hidden">
      <div className="text-center mb-3 mt-2 sm:mt-0" data-testid="receipt-thanks">
        <div className="w-16 h-16 rounded-full bg-white/95 flex items-center justify-center mx-auto mb-2 shadow-lg">
          <Check className="w-10 h-10 text-emerald-600" strokeWidth={3} />
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white">Bedankt!</h2>
        <p className="text-sm text-white/90">Uw betaling is succesvol verwerkt</p>
      </div>

      <div className="bg-white rounded-3xl w-full max-w-md p-6 sm:p-8 shadow-2xl" data-testid="receipt-card">
        {/* Printer-koplabel — blijft vast staan */}
        <div className="flex items-center justify-center gap-2 mb-2 text-slate-400">
          <Printer className="w-4 h-4" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Bon Printer</span>
        </div>
        {/* Statische printer-gleuf waar het papier "uit komt" */}
        <div className="relative h-2 mb-0">
          <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-[3px] bg-slate-900 rounded-full" />
          <div className="absolute left-1/2 -translate-x-1/2 -top-1 w-12 h-1 bg-slate-700 rounded-full" />
        </div>

        {/* Papier-uitvoer — overflow geclipt, papier schuift van bovenaf "uit" */}
        <div className="overflow-hidden mb-4 mt-2">
          <motion.div
            initial={{ y: '-100%', rotate: 0 }}
            animate={{
              y: ['-100%', '0%', '0%', '0%'],
              rotate: [0, 0, 0, 1.4],
            }}
            transition={{
              duration: 2.95,
              times: [0, 0.88, 0.93, 1],
              ease: 'easeOut',
            }}
            style={{ transformOrigin: 'top center' }}
            data-testid="receipt-paper">
            <div className="bg-slate-50 rounded-b-2xl rounded-t-md p-5 text-left border-2 border-dashed border-slate-200 border-t-0">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Kwitantie</p>
                  <p className="font-mono text-base font-extrabold text-slate-900" data-testid="receipt-number">{payment.receipt_number}</p>
                </div>
                <div className="w-9 h-9 rounded-lg bg-orange-500 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-white" />
                </div>
              </div>
              <div className="space-y-1.5 text-sm">
                <RowSlim label="Huurder" value={payment.tenant_name} />
                <RowSlim label="Appartement" value={payment.apartment_number || '—'} />
                <RowSlim label="Categorie" value={payment.category} />
                {payment.period_month && <RowSlim label="Periode" value={`${MONTHS_NL[payment.period_month - 1]} ${payment.period_year}`} />}
                <RowSlim label="Methode" value={payment.method} />
                <RowSlim label="Datum" value={new Date(payment.paid_at).toLocaleString('nl-NL')} />
                {payment.approved_by && <RowSlim label="Goedgekeurd door" value={payment.approved_by} />}
                <div className="flex justify-between pt-2 border-t border-dashed border-slate-200 mt-2">
                  <span className="text-slate-500 font-bold">Betaald</span>
                  <span className="font-extrabold text-slate-900 text-lg" data-testid="receipt-paid">{fmtMoney(payment.amount, payment.currency)}</span>
                </div>
                <div className={`flex justify-between items-center pt-2 mt-1 rounded-lg px-2 py-1.5 ${
                  remaining > 0 ? 'bg-orange-50' : 'bg-emerald-50'
                }`} data-testid="receipt-remaining-row">
                  <span className={`text-sm font-bold ${remaining > 0 ? 'text-orange-700' : 'text-emerald-700'}`}>
                    Openstaand saldo
                  </span>
                  <span className={`font-extrabold text-base ${remaining > 0 ? 'text-orange-700' : 'text-emerald-700'}`} data-testid="receipt-remaining">
                    {remainingLoading ? '…' : fmtMoney(remaining, cur)}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        <motion.button onClick={onDone} data-testid="receipt-done"
          initial={{ scale: 1, boxShadow: '0 0 0 0 rgba(255,92,0,0)' }}
          animate={{
            scale: [1, 1.035, 1],
            boxShadow: [
              '0 0 0 0 rgba(255,92,0,0.55)',
              '0 0 0 14px rgba(255,92,0,0)',
              '0 0 0 0 rgba(255,92,0,0)',
            ],
          }}
          transition={{ delay: 3.1, duration: 1.7, repeat: Infinity, ease: 'easeInOut' }}
          className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white text-base font-extrabold rounded-xl">
          Klaar
        </motion.button>
        <p className="text-center text-xs text-slate-400 mt-2" data-testid="receipt-autoreturn">
          Automatisch terug naar startscherm in 10 seconden
        </p>
        {emailStatus !== null && (
          <div className="text-center text-[11px] mt-1 font-medium space-y-0.5" data-testid="receipt-delivery-status">
            {emailStatus.email?.sent && (
              <p className="text-emerald-600" data-testid="receipt-email-status">
                E-mail verzonden naar {emailStatus.email.to}
              </p>
            )}
            {emailStatus.msg?.sent && (
              <p className="text-emerald-600" data-testid="receipt-whatsapp-status">
                {emailStatus.msg.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} verzonden naar {emailStatus.msg.to}
              </p>
            )}
            {!emailStatus.email?.sent && !emailStatus.msg?.sent && (
              <p className="text-slate-300">Geen digitale kopie verzonden</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
function RowSlim({ label, value }) {
  return <div className="flex justify-between"><span className="text-slate-500">{label}</span><span className="font-bold text-slate-900 capitalize">{value}</span></div>;
}

// =====================================================================
// Main
// =====================================================================
export default function KioskLayout() {
  const navigate = useNavigate();
  const [step, setStep] = useState('check');
  const [apartment, setApartment] = useState(null);
  const [overview, setOverview] = useState(null);
  const [paymentPayload, setPaymentPayload] = useState(null);
  const [paymentResult, setPaymentResult] = useState(null);
  const [company, setCompany] = useState(getKioskCompany());

  useEffect(() => {
    document.title = 'Vastgoed Kiosk';
    const tok = localStorage.getItem('kiosk_token');
    if (!tok) { navigate('/login', { replace: true }); return; }
    setCompany(getKioskCompany());
    setStep('select');
  }, [navigate]);

  // Tijdens kiosk-modus moet body/root in PWA standalone ORANJE zijn (zodat
  // het iPhone-home-indicator gebied en eventuele 1px doorlek aan de notch
  // de huisstijl-kleur tonen, niet wit). De Admin gebruikt wit. We schakelen
  // door middel van een body-class die alleen in standalone PWA effect heeft,
  // EN we zetten body/html bg direct in style (forceer ook in non-standalone
  // én tijdens SPA-route transitions zodat /admin → /kiosk geen witte flits
  // of witte band onderaan toont).
  useEffect(() => {
    const BRAND = '#FF5C00';
    document.body.classList.add('kiosk-mode');
    const prevHtmlBg = document.documentElement.style.backgroundColor;
    const prevBodyBg = document.body.style.backgroundColor;
    document.documentElement.style.backgroundColor = BRAND;
    document.body.style.backgroundColor = BRAND;
    const meta = document.querySelector('meta[name="theme-color"]:not([media])')
      || document.querySelector('meta[name="theme-color"]');
    const prevColor = meta?.getAttribute('content');
    if (meta) meta.setAttribute('content', BRAND);
    return () => {
      document.body.classList.remove('kiosk-mode');
      document.documentElement.style.backgroundColor = prevHtmlBg;
      document.body.style.backgroundColor = prevBodyBg;
      if (meta && prevColor) meta.setAttribute('content', prevColor);
    };
  }, []);

  const exit = useCallback(() => {
    // Reset customer-display naar idle bij uitloggen.
    api.delete('/kiosk/customer-display').catch(() => {});
    localStorage.removeItem('kiosk_token');
    localStorage.removeItem('kiosk_company');
    navigate('/login', { replace: true });
  }, [navigate]);

  // Push huidige state naar het klantenscherm. Idempotent — we sturen
  // alleen waarden die de klant ook mag zien (geen pin_hash, geen company_id).
  // Combinatie van 3 transports:
  //  1) BroadcastChannel — instant same-browser sync (2e tab / 2e monitor)
  //  2) Backend PUT — robuust voor cross-device (klant tablet in andere ruimte)
  //  3) Heartbeat elke 3s — overwrite stale state in DB, voorkomt vastlopen
  useEffect(() => {
    if (step === 'check') return undefined;
    const buildBody = () => {
      const apt = apartment ? {
        id: apartment.id, number: apartment.number, address: apartment.address || '',
        rent_amount: apartment.rent_amount, currency: apartment.currency,
        tenant_name: apartment.tenant_name,
      } : null;
      const tenant = overview?.tenant ? {
        name: overview.tenant.name,
        internet_amount: overview.tenant.internet_amount || 0,
      } : (apartment?.tenant_name ? { name: apartment.tenant_name } : null);
      const ovw = overview ? {
        balance: overview.balance, apartment: overview.apartment,
        internet: overview.internet || 0, total_due: overview.total_due || 0,
      } : null;
      const payload = paymentPayload ? {
        amount: paymentPayload.amount, currency: paymentPayload.currency,
        categories: paymentPayload.categories || [], method: paymentPayload.method,
      } : null;
      const payment = paymentResult ? {
        amount: paymentResult.amount, currency: paymentResult.currency,
        receipt_number: paymentResult.receipt_number, method: paymentResult.method,
        paid_at: paymentResult.paid_at,
      } : null;
      return { step, apartment: apt, tenant, overview: ovw, payload, payment };
    };
    const push = () => {
      const body = buildBody();
      try {
        if (typeof BroadcastChannel !== 'undefined') {
          const bc = new BroadcastChannel('surirent-customer-display');
          bc.postMessage({ state: { ...body, updated_at: new Date().toISOString() } });
          bc.close();
        }
      } catch { /* ignore */ }
      api.put('/kiosk/customer-display', body).catch(() => {});
    };
    push();
    const hb = setInterval(push, 3000);
    return () => clearInterval(hb);
  }, [step, apartment, overview, paymentPayload, paymentResult]);

  // "Beheerder" knop in de kiosk: als de PIN-login een admin-token heeft
  // afgegeven (PIN is shared secret van het bedrijf), spring direct naar
  // /admin. We doen een hard navigation zodat AuthProvider zijn /auth/me
  // opnieuw uitvoert met het nieuwe admin_token (en niet de oude user=null
  // state uit de cache van vóór de PIN-login). Anders terug naar /login in
  // admin-modus zodat de gebruiker met wachtwoord kan inloggen.
  const adminMode = useCallback(() => {
    let hasAdminToken = false;
    try { hasAdminToken = !!localStorage.getItem('admin_token'); } catch { /* ignore */ }
    if (hasAdminToken) {
      window.location.assign('/admin');
    } else {
      navigate('/login?view=admin', { replace: true });
    }
  }, [navigate]);

  const reset = () => {
    setApartment(null); setOverview(null); setPaymentPayload(null); setPaymentResult(null);
    setStep('select');
  };

  const showDesktopBar = step !== 'check';

  return (
    <div className="kiosk-fullscreen bg-orange-500" data-testid="kiosk-root">
      <AnimatePresence mode="wait">
        <motion.div key={step} variants={variants}
          initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          className="absolute inset-0 overflow-y-auto overflow-x-hidden md:pb-16 mobile-safe-bottom"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
          {step === 'check' && (
            <div className="h-full bg-orange-500 flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-white animate-spin" />
            </div>
          )}
          {step === 'select' && (
            <ApartmentSelect onSelect={(a) => { setApartment(a); setStep('overview'); }}
              onAdmin={adminMode} onExit={exit} />
          )}
          {step === 'overview' && apartment && (
            <TenantOverview apartment={apartment} onBack={() => setStep('select')}
              onPay={(d) => { setOverview(d); setStep('pay'); }} />
          )}
          {step === 'pay' && overview && (
            <PaySelect overview={overview} onBack={() => setStep('overview')}
              onConfirm={(p) => { setPaymentPayload(p); setStep('method'); }} />
          )}
          {step === 'method' && paymentPayload && overview && (
            <MethodSelect payload={paymentPayload} overview={overview} onBack={() => setStep('pay')}
              onConfirm={(p) => { setPaymentPayload(p); setStep('confirm'); }} />
          )}
          {step === 'confirm' && paymentPayload && overview && (
            <PaymentConfirm payload={paymentPayload} overview={overview} onBack={() => setStep('method')}
              onSuccess={(r) => { setPaymentResult(r); setStep('receipt'); }} />
          )}
          {step === 'receipt' && paymentResult && (
            <ReceiptScreen payment={paymentResult} overview={overview} onDone={reset} />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Desktop floating bottom bar */}
      {showDesktopBar && (
        <div className="hidden md:flex fixed bottom-0 left-0 right-0 z-40 bg-white items-center justify-between px-4 sm:px-6"
          style={{ height: 'clamp(48px, 7vh, 64px)' }}
          data-testid="kiosk-bottom-bar">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="rounded-lg bg-orange-500 flex items-center justify-center w-9 h-9 shrink-0">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <span className="text-sm sm:text-base font-bold text-slate-800 truncate" data-testid="kiosk-footer-company">
              {company?.name || 'Kiosk'}
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            {apartment && step !== 'select' && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-400 font-medium hidden sm:inline">{apartment.tenant_name}</span>
                <span className="text-sm font-bold text-slate-800">Appt. {apartment.number}</span>
              </div>
            )}
            <button onClick={adminMode} data-testid="kiosk-admin-btn-desktop"
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg px-5 py-2 text-sm">Beheerder</button>
            <button onClick={exit} data-testid="kiosk-lock-btn-desktop"
              className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg px-5 py-2 text-sm">Uit</button>
          </div>
        </div>
      )}
    </div>
  );
}
