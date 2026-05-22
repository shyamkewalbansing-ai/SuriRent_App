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
    <div className="flex items-center gap-1.5 md:hidden">
      {onExit && (
        <button onClick={onExit} data-testid="kiosk-lock-btn"
          className="flex items-center gap-1.5 text-white font-bold bg-white/20 backdrop-blur-sm rounded-lg px-3 py-1.5">
          <LogOut className="w-3.5 h-3.5" /> <span className="text-xs">Uit</span>
        </button>
      )}
      {onAdmin && (
        <button onClick={onAdmin} data-testid="kiosk-admin-btn"
          className="flex items-center gap-1.5 text-orange-600 font-bold bg-white rounded-lg px-3 py-1.5">
          <SettingsIcon className="w-3.5 h-3.5" /> <span className="text-xs">Beheerder</span>
        </button>
      )}
    </div>
  );
}

// =====================================================================
// Welcome
// =====================================================================
function Welcome({ company, onStart, onAdmin, onExit }) {
  return (
    <div className="h-full bg-orange-500 flex flex-col" style={{ padding: '1.5vh 1.5vw 0' }}>
      <div className="flex items-center justify-between" style={{ height: '7vh' }}>
        <div className="flex items-center gap-2 text-white">
          <Building2 className="w-5 h-5" />
          <span className="text-sm sm:text-base font-semibold">{company?.name || 'Kiosk'}</span>
        </div>
        <div className="flex items-center gap-2">
          {onAdmin && (
            <button onClick={onAdmin} data-testid="welcome-admin-btn"
              className="flex items-center gap-1 text-white/90 bg-white/15 hover:bg-white/25 rounded-lg px-3 py-1.5">
              <SettingsIcon className="w-4 h-4" />
              <span className="text-xs hidden sm:inline font-bold">Beheerder</span>
            </button>
          )}
          <button onClick={onExit} data-testid="welcome-exit-btn"
            className="flex items-center gap-1 text-white/90 bg-white/15 hover:bg-white/25 rounded-lg px-3 py-1.5">
            <LogOut className="w-4 h-4" />
            <span className="text-xs hidden sm:inline font-bold">Uit</span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0" style={{ paddingBottom: '1.5vh' }}>
        <div className="flex-1 bg-white rounded-2xl flex flex-col items-center justify-center text-center px-6 py-10">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-xl shadow-orange-500/40 p-4 mb-5">
            <img src="/kiosk-icons/kiosk-512.png" alt="Kiosk" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight mb-2">Welkom</h1>
          <p className="text-base text-slate-400 mb-8">Betaal uw huur, servicekosten en meer</p>
          <button onClick={onStart} data-testid="kiosk-start-btn"
            className="bg-orange-500 hover:bg-orange-600 text-white text-lg sm:text-xl font-bold rounded-xl flex items-center gap-3 active:scale-[0.98] transition px-12 py-4 mb-10">
            Start <ArrowRight className="w-6 h-6" />
          </button>
          <p className="text-xs uppercase tracking-widest font-bold text-slate-400 mb-3">Beschikbare diensten</p>
          <div className="flex gap-3 sm:gap-5 justify-center flex-wrap">
            {[
              { icon: Banknote, label: 'Maandhuur' },
              { icon: Droplets, label: 'Servicekosten' },
              { icon: Wifi, label: 'Internet' },
              { icon: Receipt, label: 'Boetes' },
            ].map((s) => (
              <div key={s.label} className="bg-slate-50 rounded-xl px-4 py-3 flex flex-col items-center">
                <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center mb-1.5">
                  <s.icon className="w-4 h-4 text-orange-500" />
                </div>
                <p className="text-xs font-bold text-slate-700">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
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
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 md:p-6"
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px), 1rem)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 1rem)',
      }}
      data-testid="kiosk-history-modal">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl h-full md:h-auto md:max-h-[85vh] overflow-hidden flex flex-col">
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
      <div className="flex-1 min-h-0 flex items-center justify-center pb-6">
        <div className="grid sm:grid-cols-3 gap-4 max-w-4xl w-full px-2">
          {methods.map((m) => {
            const Icon = m.icon;
            return (
              <button key={m.v} onClick={() => onConfirm({ ...payload, method: m.v })} data-testid={`method-${m.v}`}
                className="bg-white rounded-3xl p-8 text-center hover:scale-[1.03] active:scale-[0.98] transition aspect-[3/4] flex flex-col items-center justify-center shadow-2xl">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${
                  m.accent === 'red' ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-500'
                }`}>
                  <Icon className="w-10 h-10" />
                </div>
                <p className="text-2xl font-extrabold text-slate-900">{m.l}</p>
                <p className="text-sm text-slate-500 mt-1">{m.sub}</p>
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

function ReceiptScreen({ payment, onDone }) {
  return (
    <div className="h-full bg-orange-500 flex flex-col items-center justify-center p-4 sm:p-8">
      <div className="bg-white rounded-3xl w-full max-w-md p-6 sm:p-8 text-center shadow-2xl">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
          <Check className="w-10 h-10 text-emerald-600" strokeWidth={3} />
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Bedankt!</h2>
        <p className="text-sm text-slate-500 mb-5">Uw betaling is succesvol verwerkt</p>
        <div className="bg-slate-50 rounded-2xl p-5 mb-5 text-left border-2 border-dashed border-slate-200">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Kwitantie</p>
              <p className="font-mono text-base font-extrabold text-slate-900">{payment.receipt_number}</p>
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
              <span className="text-slate-500 font-bold">Totaal</span>
              <span className="font-extrabold text-slate-900 text-lg">{fmtMoney(payment.amount, payment.currency)}</span>
            </div>
          </div>
        </div>
        <button onClick={onDone} data-testid="receipt-done"
          className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white text-base font-extrabold rounded-xl">
          Klaar
        </button>
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
    setStep('welcome');
  }, [navigate]);

  const exit = useCallback(() => {
    localStorage.removeItem('kiosk_token');
    localStorage.removeItem('kiosk_company');
    navigate('/login', { replace: true });
  }, [navigate]);

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
    setStep('welcome');
  };

  const showDesktopBar = step !== 'check' && step !== 'welcome';

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
          {step === 'welcome' && (
            <Welcome company={company} onStart={() => setStep('select')} onAdmin={adminMode} onExit={exit} />
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
            <ReceiptScreen payment={paymentResult} onDone={reset} />
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
