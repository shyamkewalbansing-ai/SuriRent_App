import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useBrandedNavigate } from '../../lib/branded-nav';
import { AnimatePresence, motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import {
  Building2, ArrowRight, ArrowLeft, Banknote, Receipt, LogOut, MapPin,
  Check, Loader2, Home, X, Wallet, FileText, Wifi, AlertCircle,
  Smartphone, QrCode, ShieldCheck, Clock as ClockIcon, Printer, Download,
  User, Settings as SettingsIcon, Hash, CheckCircle, Calendar,
} from 'lucide-react';
import { api, formatError, fmtMoney, MONTHS_NL } from '../../lib/api';
import { playSuccessPing, playErrorBuzz } from '../../lib/tap-sounds';
import {
  KioskEmployeeBar, KioskEmployeeLoginSheet,
  getKioskEmployee, withKioskEmployee,
} from '../../components/KioskEmployee';

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
  const navigate = useBrandedNavigate();
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
    }).catch((e) => {
      // 401 = token ongeldig / verlopen → wis token en stuur terug naar
      // PIN-login. Voorheen bleef de melding "Ongeldig kiosk token" inline
      // staan en kon de gebruiker niet verder.
      const status = e?.response?.status;
      if (status === 401) {
        try {
          localStorage.removeItem('kiosk_token');
          localStorage.removeItem('kiosk_company');
        } catch { /* noop */ }
        navigate('/login?target=kiosk', { replace: true });
        return;
      }
      setError(formatError(e));
    }).finally(() => setLoading(false));
  }, [navigate]);

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

  const { tenant, apartment: apt, balance, credit_balance: credit = 0 } = data;
  const internet = Number(tenant.internet_amount || 0);
  // Backend levert 3 buckets:
  //   open_invoices      → Achterstallige huur (vervaltermijn + grace verstreken)
  //   current_invoices   → Openstaande huidige maand (lopende periode of nog in grace)
  //   future_invoices    → Vooruit gefactureerd (toekomst, NIET in totaal)
  const openInvoices = Array.isArray(data.open_invoices) ? data.open_invoices : [];
  const openInvoicesTotal = Number(data.open_invoices_total || 0);
  const currentInvoices = Array.isArray(data.current_invoices) ? data.current_invoices : [];
  const currentInvoicesTotal = Number(data.current_invoices_total || 0);
  const futureInvoices = Array.isArray(data.future_invoices) ? data.future_invoices : [];
  const futureInvoicesTotal = Number(data.future_invoices_total || 0);
  // Eerste current factuur voor legacy-display (backwards compat).
  const currentInvoice = data.current_month_invoice || currentInvoices[0] || null;
  const openRentLegacy = balance.balance > 0 ? balance.balance : 0;
  const openRent = openInvoices.length > 0 ? openInvoicesTotal : openRentLegacy;
  // Huidige maand: som van alle current_invoices, met fallback op
  // apartment.rent_amount wanneer er nog géén factuur is voor deze maand.
  const currentMonthAmount = currentInvoices.length > 0
    ? currentInvoicesTotal
    : (currentInvoice ? Number(currentInvoice.outstanding || 0) : Number(apt.rent_amount || 0));
  const currentMonthLabel = currentInvoice && currentInvoice.period_month
    ? `Huidige maandhuur · ${MONTHS_NL[currentInvoice.period_month - 1]} ${currentInvoice.period_year}`
    : 'Maandhuur';
  // Totaal openstaand = achterstand + huidige maand + internet
  // (vooruit gefactureerd NIET meegerekend — dat is toekomst, geen schuld nu)
  const totalDue = currentMonthAmount + openRent + internet;
  const allPaid = totalDue <= 0;
  const cur = balance.currency || apt.currency || 'SRD';

  // Subtitel onder "Achterstallige huur" — toont de maanden compact.
  const monthsCovered = openInvoices.length;
  const openLabel = monthsCovered > 0
    ? `Achterstallige huur (${monthsCovered} maand${monthsCovered === 1 ? '' : 'en'})`
    : 'Achterstallige huur';
  const openSub = openInvoices.length > 0
    ? (() => {
        const months = openInvoices
          .map((inv) => inv.period_month
            ? `${MONTHS_NL[inv.period_month - 1].slice(0, 3)}`
            : null)
          .filter(Boolean);
        const years = [...new Set(openInvoices.map((i) => i.period_year).filter(Boolean))];
        return months.length > 0
          ? `${months.join(', ')}${years.length === 1 ? ` ${years[0]}` : ''}`
          : (balance.next_period
              ? `${MONTHS_NL[balance.next_period.month - 1]} ${balance.next_period.year}`
              : '');
      })()
    : (balance.next_period ? `${MONTHS_NL[balance.next_period.month - 1]} ${balance.next_period.year}` : '');

  // Subtitel onder "Vooruit gefactureerd" — toont toekomstige periodes.
  const futureSub = futureInvoices.length > 0
    ? futureInvoices
        .map((inv) => inv.period_month
          ? `${MONTHS_NL[inv.period_month - 1].slice(0, 3)} ${inv.period_year}`
          : null)
        .filter(Boolean)
        .join(', ')
    : '';

  const items = [
    ...(openRent > 0 ? [{
      key: 'open',
      label: openLabel,
      value: openRent,
      icon: Wallet,
      highlight: true,
      sub: openSub,
    }] : []),
    { key: 'rent', label: currentMonthLabel, value: currentMonthAmount, icon: Home,
      sub: currentInvoice && currentInvoice.due_date
        ? `Vervalt ${new Date(currentInvoice.due_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}`
        : '' },
    { key: 'fines', label: 'Boetes', value: 0, icon: FileText, muted: true },
    { key: 'internet', label: 'Internet', value: internet, icon: Wifi, muted: internet === 0 },
    ...(futureInvoicesTotal > 0 ? [{
      key: 'future',
      label: `Vooruit gefactureerd (${futureInvoices.length} maand${futureInvoices.length === 1 ? '' : 'en'})`,
      value: futureInvoicesTotal,
      icon: Calendar,
      info: true,  // alleen-informatief — telt NIET mee in totaal
      sub: futureSub,
    }] : []),
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
              const klass = it.highlight ? 'text-orange-600'
                : it.info ? 'text-blue-500'
                : it.muted ? 'text-slate-400'
                : 'text-slate-900';
              return (
                <div key={it.key} className={`py-2.5 px-1 ${klass}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                        it.highlight ? 'bg-orange-100 text-orange-500'
                          : it.info ? 'bg-blue-50 text-blue-500'
                          : it.muted ? 'bg-slate-50 text-slate-300'
                          : 'bg-slate-100 text-slate-500'
                      }`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm ${it.highlight ? 'font-extrabold' : 'font-semibold'}`}>{it.label}</p>
                        {it.sub && <p className="text-[10px] mt-0.5">{it.sub}</p>}
                        {it.info && <p className="text-[9px] mt-0.5 italic text-blue-400">informatief — telt niet mee</p>}
                      </div>
                    </div>
                    <p className={`font-bold text-sm sm:text-base ${it.highlight ? 'font-extrabold' : ''}`}>{fmtMoney(it.value, cur)}</p>
                  </div>
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
          {allPaid ? (
            <>
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mb-3">
                <Check className="w-8 h-8 sm:w-10 sm:h-10 text-emerald-600" />
              </div>
              <p className="text-xs sm:text-sm font-bold uppercase tracking-widest text-emerald-700">Alles voldaan</p>
              <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
                Geen openstaande facturen
              </p>
              {credit > 0 && (
                <div className="mt-3 mb-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Positief saldo</p>
                  <p className="text-xl font-extrabold text-emerald-700">{fmtMoney(credit, cur)}</p>
                  <p className="text-[10px] text-emerald-600 mt-0.5">Wordt verrekend met volgende factuur</p>
                </div>
              )}
              {!credit && <div className="h-3" />}
              <button onClick={() => onPay({ ...data, internet, total_due: 0, isAdvance: true,
                open_invoices: openInvoices, open_invoices_total: openInvoicesTotal,
                current_invoices: currentInvoices, current_invoices_total: currentInvoicesTotal,
                future_invoices: futureInvoices, future_invoices_total: futureInvoicesTotal,
                current_month_invoice: currentInvoice })}
                data-testid="overview-advance-pay-btn"
                className="mt-2 w-full max-w-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl flex items-center justify-center gap-2 transition py-2.5 text-sm active:scale-[0.98]">
                Vooruitbetaling registreren
              </button>
              <button onClick={() => setShowHistory(true)} data-testid="overview-history-btn"
                className="mt-2 w-full max-w-xs bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold rounded-xl flex items-center justify-center gap-2 py-2.5 text-sm">
                <ClockIcon className="w-4 h-4" /> Betalingsgeschiedenis
              </button>
            </>
          ) : (
            <>
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-orange-100 flex items-center justify-center mb-3">
                <Wallet className="w-7 h-7 sm:w-9 sm:h-9 text-orange-500" />
              </div>
              <p className="text-xs sm:text-sm font-bold uppercase tracking-widest text-slate-400">Te betalen</p>
              <p className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight mt-1 mb-6">{fmtMoney(totalDue, cur)}</p>
              <button onClick={() => onPay({ ...data, internet, total_due: totalDue,
                open_invoices: openInvoices, open_invoices_total: openInvoicesTotal,
                current_invoices: currentInvoices, current_invoices_total: currentInvoicesTotal,
                future_invoices: futureInvoices, future_invoices_total: futureInvoicesTotal,
                current_month_invoice: currentInvoice })}
                data-testid="overview-pay-btn"
                className="w-full max-w-xs bg-orange-500 hover:bg-orange-600 text-white text-base sm:text-lg font-bold rounded-xl flex items-center justify-center gap-2 transition py-3 sm:py-3.5 active:scale-[0.98]">
                Volgende <ArrowRight className="w-5 h-5" />
              </button>
              <button onClick={() => setShowHistory(true)} data-testid="overview-history-btn"
                className="mt-2 w-full max-w-xs bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold rounded-xl flex items-center justify-center gap-2 py-2.5 text-sm">
                <ClockIcon className="w-4 h-4" /> Betalingsgeschiedenis
              </button>
            </>
          )}
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
// Boete + Internet zijn de enige template-items. Huur wordt per factuur als
// individuele rij getoond (achterstand + huidige maand + vooruit), zodat de
// huurder/medewerker precies kan kiezen wat ze willen voldoen.
const PAY_ITEMS_TEMPLATE = [
  { id: 'boete', label: 'Boetes', icon: AlertCircle, desc: 'Openstaande boetes' },
  { id: 'internet', label: 'Internet', icon: Wifi, desc: 'Internetaansluiting' },
];

function PaySelect({ overview, onBack, onConfirm, onLiveChange }) {
  const { tenant, apartment: apt, balance, internet, total_due, isAdvance = false,
    open_invoices: openInvoices = [], open_invoices_total: openInvoicesTotal = 0,
    current_invoices: currentInvoicesRaw = [],
    future_invoices: futureInvoicesRaw = [],
    current_month_invoice: currentInvoice = null } = overview;
  const cur = (balance.currency || apt.currency || 'SRD').toUpperCase();
  const fmt = (v) => fmtMoney(v, cur);
  const openRentFromInvoices = Number(openInvoicesTotal || 0);
  const openRentLegacy = balance.balance > 0 ? balance.balance : 0;
  const openRent = openInvoices.length > 0 ? openRentFromInvoices : openRentLegacy;
  // Huidige maand: array van facturen (kan 1 of 2 zijn — mei in grace + juni
  // bijvoorbeeld). Fallback: 1 synthetische rij met apt.rent_amount wanneer
  // er nog géén factuur is voor huidige maand.
  const currentInvoices = Array.isArray(currentInvoicesRaw) && currentInvoicesRaw.length > 0
    ? currentInvoicesRaw
    : (currentInvoice ? [currentInvoice] : []);
  const futureInvoices = Array.isArray(futureInvoicesRaw) ? futureInvoicesRaw : [];
  // Synthetische huidige-maand-rij wanneer er HELEMAAL geen factuur is
  // (huurder is gloednieuw). Gebruikt apt.rent_amount.
  const syntheticCurrent = currentInvoices.length === 0
    ? { id: '__syn_current__', synthetic: true, outstanding: Number(apt.rent_amount || 0),
        period_month: null, period_year: null }
    : null;

  const amounts = {
    boete: 0,
    internet: Number(internet || 0),
  };

  const [selected, setSelected] = useState(new Set());
  const [custom, setCustom] = useState('');
  const [showMobileKeypad, setShowMobileKeypad] = useState(false);
  const [planInstallments, setPlanInstallments] = useState([]);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [planSuccess, setPlanSuccess] = useState(null);  // {id, num_installments, total_amount}

  useEffect(() => {
    api.get(`/kiosk/tenants/${tenant.id}/payment-plans`)
      .then((r) => {
        const out = [];
        for (const p of r.data || []) {
          for (const inst of p.installments || []) {
            if (inst.status !== 'pending') continue;
            out.push({
              planId: p.id, seq: inst.sequence,
              due_date: inst.due_date, amount: Number(inst.amount || 0),
            });
          }
        }
        out.sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
        setPlanInstallments(out);
      })
      .catch(() => setPlanInstallments([]));
  }, [tenant.id]);

  const planItemKey = (it) => `plan:${it.planId}:${it.seq}`;
  const invItemKey = (inv) => `inv:${inv.id}`;
  const synItemKey = () => 'syn:current';
  const hasOpenInvoices = openInvoices.length >= 1;
  const hasCurrentInvoices = currentInvoices.length >= 1 || !!syntheticCurrent;
  const hasFutureInvoices = futureInvoices.length >= 1;

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
  // "Alles betalen" includeert: achterstand + huidige maand + boete + internet + plan-termijnen.
  // Vooruit gefactureerd is OPT-IN (niet standaard mee-geselecteerd, want het is toekomst).
  const allSelectableKeys = [
    ...enabled.map((t) => t.id),
    ...(hasOpenInvoices ? openInvoices.map(invItemKey) : []),
    ...(currentInvoices.length > 0 ? currentInvoices.map(invItemKey) : (syntheticCurrent ? [synItemKey()] : [])),
    ...planInstallments.map(planItemKey),
  ];
  const allSelected = allSelectableKeys.length > 0
    && allSelectableKeys.every((k) => selected.has(k));
  const selectAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allSelectableKeys));
    setCustom('');
  };

  // Lookup: gebruik openInvoices + currentInvoices + futureInvoices (alle factuur-rijen)
  const allInvoicesLookup = [...openInvoices, ...currentInvoices, ...futureInvoices];
  const selectedPlanItems = [...selected].filter((k) => k.startsWith('plan:'))
    .map((k) => planInstallments.find((x) => planItemKey(x) === k))
    .filter(Boolean);
  const selectedInvItems = [...selected].filter((k) => k.startsWith('inv:'))
    .map((k) => allInvoicesLookup.find((x) => invItemKey(x) === k))
    .filter(Boolean);
  const selectedSynCurrent = syntheticCurrent && selected.has(synItemKey())
    ? syntheticCurrent.outstanding : 0;
  const selectedPlainKeys = [...selected].filter((k) =>
    !k.startsWith('plan:') && !k.startsWith('inv:') && !k.startsWith('syn:'));
  const selectedPlainTotal = selectedPlainKeys.reduce((s, id) => s + (amounts[id] || 0), 0);
  const selectedPlanTotal = selectedPlanItems.reduce((s, x) => s + x.amount, 0);
  const selectedInvTotal = selectedInvItems.reduce((s, x) => s + (x.outstanding || 0), 0);
  const selectedTotal = selectedPlainTotal + selectedPlanTotal + selectedInvTotal + selectedSynCurrent;
  const hasCustom = custom && parseFloat(custom) > 0;
  const activeAmount = hasCustom ? parseFloat(custom) : selectedTotal;
  const canProceed = activeAmount > 0;

  const buildDescription = () => {
    const labels = [];
    if (selectedInvItems.length > 0) {
      const months = selectedInvItems
        .map((inv) => inv.period_month ? MONTHS_NL[inv.period_month - 1].slice(0, 3) : null)
        .filter(Boolean);
      labels.push(`Huur ${months.join(', ')}`);
    } else if (selectedSynCurrent > 0) {
      labels.push('Huur (huidige maand)');
    }
    if (selected.has('boete')) labels.push('Boetes');
    if (selected.has('internet')) labels.push('Internet');
    if (selectedPlanItems.length > 0) labels.push(`Regeling (${selectedPlanItems.length}× termijn)`);
    return labels.join(' + ');
  };

  // Live-sync naar het klantenscherm: zodra de operator iets aanvinkt of
  // een bedrag intikt, sturen we het lopende totaal + de geselecteerde
  // onderdelen door naar KioskLayout. KioskLayout broadcast dit dan
  // (via BroadcastChannel + PUT) naar het klantenscherm zodat de klant
  // realtime ziet wat er gebeurt. Dedup wordt door KioskLayout's push-hash
  // afgehandeld.
  // Content-hash ref voor live preview — voorkomt dat we onLiveChange
  // meermaals per render afvuren wanneer de selectie qua INHOUD identiek
  // is (selectedInvItems/PlanItems zijn nieuwe arrays elke render). Zonder
  // deze guard zou de parent voor elke re-render setLivePreview triggeren
  // en zo dubbele renders + onnodige PUTs veroorzaken.
  const lastLivePreviewKeyRef = useRef('');
  useEffect(() => {
    if (typeof onLiveChange !== 'function') return;
    if (activeAmount <= 0) {
      if (lastLivePreviewKeyRef.current !== '__null__') {
        lastLivePreviewKeyRef.current = '__null__';
        onLiveChange(null);
      }
      return;
    }
    const cats = [];
    selectedInvItems.forEach((inv) => {
      const label = inv.period_month
        ? `Huur ${MONTHS_NL[inv.period_month - 1]} ${inv.period_year || ''}`.trim()
        : 'Huur';
      cats.push({ key: 'huur', label, value: Number(inv.outstanding || 0) });
    });
    if (selectedSynCurrent > 0) {
      cats.push({ key: 'huur', label: 'Huur (huidige maand)', value: selectedSynCurrent });
    }
    if (selected.has('boete')) cats.push({ key: 'boete', label: 'Boetes', value: amounts.boete || 0 });
    if (selected.has('internet')) cats.push({ key: 'internet', label: 'Internet', value: amounts.internet || 0 });
    selectedPlanItems.forEach((it, i) => {
      cats.push({ key: 'overig', label: `Regeling termijn ${i + 1}`, value: it.amount });
    });
    if (hasCustom) {
      cats.push({ key: 'overig', label: isAdvance ? 'Vooruitbetaling' : 'Gedeeltelijke betaling', value: parseFloat(custom) });
    }
    const key = JSON.stringify({ a: activeAmount, c: cur, cs: cats.map((x) => `${x.key}:${x.label}:${x.value}`) });
    if (key !== lastLivePreviewKeyRef.current) {
      lastLivePreviewKeyRef.current = key;
      onLiveChange({ amount: activeAmount, currency: cur, categories: cats });
    }
  }, [activeAmount, hasCustom, custom, cur, isAdvance, selected, selectedInvItems, selectedPlanItems, selectedSynCurrent, amounts.boete, amounts.internet, onLiveChange]);


  const press = (k) => {
    if (k === 'DEL') setCustom((c) => c.slice(0, -1));
    else if (k === '.') setCustom((c) => c.includes('.') ? c : c + '.');
    else setCustom((c) => c + k);
    setSelected(new Set());
  };

  const handleNext = () => {
    if (!canProceed) return;
    // Vooruitbetaling: huurder heeft niets openstaand maar betaalt vooruit.
    // Wordt opgeslagen met category=vooruitbetaling zodat het als krediet
    // bewaard wordt voor de volgende factuur (auto-generatie verrekent het
    // automatisch FIFO).
    if (isAdvance && hasCustom) {
      onConfirm({
        tenant_id: tenant.id, apartment_id: apt.id,
        amount: parseFloat(custom), currency: cur,
        category: 'vooruitbetaling', method: 'contant',
        period_month: null, period_year: null,
        note: `Vooruitbetaling — wordt verrekend met volgende factuur`,
        plan_items: [], plain_amount: parseFloat(custom),
      });
      return;
    }
    if (hasCustom) {
      onConfirm({
        tenant_id: tenant.id, apartment_id: apt.id,
        amount: parseFloat(custom), currency: cur, category: 'huur', method: 'contant',
        period_month: balance.next_period ? balance.next_period.month : null,
        period_year: balance.next_period ? balance.next_period.year : null,
        note: `Gedeeltelijke betaling — ${fmt(parseFloat(custom))}`,
        plan_items: [], plain_amount: parseFloat(custom),
      });
      return;
    }
    const plainCategory = selectedPlainKeys.length === 1 ? selectedPlainKeys[0]
      : selectedPlainKeys.length === 0 ? 'betalingsregeling' : 'huur';
    // Bepaal de category op basis van wat er geselecteerd is. Als ALLEEN
    // invoice-items zijn geselecteerd, label de betaling als "huur" met
    // expliciete invoice_ids zodat backend FIFO naar die exacte facturen
    // alloceert (i.p.v. oudste eerst).
    const category = (selectedInvItems.length > 0 || selectedSynCurrent > 0) && selectedPlainKeys.length === 0
      ? 'huur' : plainCategory;
    onConfirm({
      tenant_id: tenant.id, apartment_id: apt.id,
      amount: selectedTotal,  // totaal incl. plan items (voor display + Uni5Pay QR)
      plain_amount: selectedPlainTotal + selectedInvTotal + selectedSynCurrent,  // alleen plain + invoice + synth current
      currency: cur, category, method: 'contant',
      period_month: category === 'huur' && balance.next_period ? balance.next_period.month : null,
      period_year: category === 'huur' && balance.next_period ? balance.next_period.year : null,
      note: buildDescription(),
      plan_items: selectedPlanItems.map((x) => ({
        plan_id: x.planId, seq: x.seq, amount: x.amount,
      })),
      // Doorgeven aan backend zodat _allocate_payment_to_invoices op deze
      // specifieke factuur-IDs werkt (FIFO BINNEN selectie). Backend gebruikt
      // dit veld om de partial-betaling correct toe te wijzen.
      invoice_ids: selectedInvItems.map((x) => x.id),
    });
  };

  return (
    <div className="h-full bg-orange-500 flex flex-col px-3 sm:px-6 pt-2">
      <div className="flex items-center justify-between flex-wrap gap-2 py-2">
        <button onClick={onBack} data-testid="payselect-back-btn"
          className="flex items-center gap-1.5 text-white font-bold bg-white/20 backdrop-blur-sm rounded-lg px-3 py-1.5 sm:px-4 sm:py-2">
          <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" /> <span className="text-xs sm:text-sm">Terug</span>
        </button>
        <span className="text-sm sm:text-base font-semibold text-white">{isAdvance ? 'Vooruitbetaling registreren' : 'Wat wilt u betalen?'}</span>
        <div className="text-right text-white hidden sm:block">
          <p className="text-xs sm:text-sm font-semibold">{tenant.name}</p>
          <p className="text-[10px] sm:text-xs opacity-70">Appt. {apt.number}</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row gap-2 sm:gap-3 min-h-0 pb-2">
        {/* LEFT — Payment items */}
        <div className="bg-white rounded-2xl flex-1 md:flex-[3] flex flex-col min-w-0 p-2 sm:p-3">
          {(enabled.length > 1 || planInstallments.length > 0) && (
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
                {fmt(enabled.reduce((s, t) => s + (amounts[t.id] || 0), 0)
                  + openInvoices.reduce((s, x) => s + Number(x.outstanding || 0), 0)
                  + currentInvoices.reduce((s, x) => s + Number(x.outstanding || 0), 0)
                  + (syntheticCurrent ? Number(syntheticCurrent.outstanding || 0) : 0)
                  + planInstallments.reduce((s, p) => s + p.amount, 0))}
              </span>
            </button>
          )}

          <div className="flex flex-col gap-1 sm:gap-1.5 flex-1">
            {/* Achterstallige huur — één regel per maand */}
            {hasOpenInvoices && (
              <>
                <div className="flex items-center gap-2 mt-1 mb-0.5 px-1">
                  <div className="h-px flex-1 bg-red-200" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-red-600">
                    Achterstallige huur · {openInvoices.length} {openInvoices.length === 1 ? 'maand' : 'maanden'}
                  </span>
                  <div className="h-px flex-1 bg-red-200" />
                </div>
                {openInvoices.map((inv) => {
                  const key = invItemKey(inv);
                  const sel = selected.has(key);
                  return (
                    <button key={key} onClick={() => toggle(key)} data-testid={`pay-inv-${inv.id}`}
                      className={`flex items-center justify-between w-full rounded-lg border-2 transition px-2.5 py-2 sm:px-3 sm:py-2.5 ${
                        sel ? 'bg-red-50 border-red-400' : 'bg-white border-slate-200 hover:border-red-300'
                      }`}>
                      <div className="flex items-center gap-2">
                        <div className={`flex items-center justify-center rounded border-2 flex-shrink-0 w-5 h-5 ${sel ? 'bg-red-500 border-red-500' : 'border-slate-300'}`}>
                          {sel && <Check className="text-white w-3.5 h-3.5" strokeWidth={3} />}
                        </div>
                        <div className={`rounded-lg flex items-center justify-center flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 ${sel ? 'bg-red-100' : 'bg-slate-50'}`}>
                          <Banknote className={`w-4 h-4 sm:w-5 sm:h-5 ${sel ? 'text-red-500' : 'text-slate-400'}`} />
                        </div>
                        <div className="text-left">
                          <span className="text-sm font-bold text-slate-900 block">
                            Huur {inv.period_month && inv.period_year
                              ? `${MONTHS_NL[inv.period_month - 1]} ${inv.period_year}`
                              : ''}
                          </span>
                          {inv.is_partial ? (
                            <span className="text-[10px] text-amber-700 font-bold">
                              Deels betaald · nog {fmt(inv.outstanding)} open
                            </span>
                          ) : inv.due_date ? (
                            <span className="text-[10px] text-slate-400">
                              Vervalt {new Date(inv.due_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <p className={`text-sm sm:text-base flex-shrink-0 ml-2 whitespace-nowrap font-semibold ${sel ? 'text-red-600' : 'text-slate-900'}`}>
                        {fmt(inv.outstanding)}
                      </p>
                    </button>
                  );
                })}
              </>
            )}

            {/* Openstaande huidige maand — één regel per factuur (typisch 1, maar
                kan 2 zijn vroeg in een nieuwe maand met vorige maand nog in grace) */}
            {hasCurrentInvoices && (
              <>
                <div className="flex items-center gap-2 mt-2 mb-0.5 px-1">
                  <div className="h-px flex-1 bg-amber-200" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-600">
                    Openstaande huidige maand
                  </span>
                  <div className="h-px flex-1 bg-amber-200" />
                </div>
                {currentInvoices.map((inv) => {
                  const key = invItemKey(inv);
                  const sel = selected.has(key);
                  return (
                    <button key={key} onClick={() => toggle(key)} data-testid={`pay-current-${inv.id}`}
                      className={`flex items-center justify-between w-full rounded-lg border-2 transition px-2.5 py-2 sm:px-3 sm:py-2.5 ${
                        sel ? 'bg-amber-50 border-amber-400' : 'bg-white border-slate-200 hover:border-amber-300'
                      }`}>
                      <div className="flex items-center gap-2">
                        <div className={`flex items-center justify-center rounded border-2 flex-shrink-0 w-5 h-5 ${sel ? 'bg-amber-500 border-amber-500' : 'border-slate-300'}`}>
                          {sel && <Check className="text-white w-3.5 h-3.5" strokeWidth={3} />}
                        </div>
                        <div className={`rounded-lg flex items-center justify-center flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 ${sel ? 'bg-amber-100' : 'bg-slate-50'}`}>
                          <Home className={`w-4 h-4 sm:w-5 sm:h-5 ${sel ? 'text-amber-500' : 'text-slate-400'}`} />
                        </div>
                        <div className="text-left">
                          <span className="text-sm font-bold text-slate-900 block">
                            Huur {inv.period_month && inv.period_year
                              ? `${MONTHS_NL[inv.period_month - 1]} ${inv.period_year}`
                              : ''}
                          </span>
                          {inv.is_partial ? (
                            <span className="text-[10px] text-amber-700 font-bold">
                              Deels betaald · nog {fmt(inv.outstanding)} open
                            </span>
                          ) : inv.due_date ? (
                            <span className="text-[10px] text-slate-400">
                              Vervalt {new Date(inv.due_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                            </span>
                          ) : (
                            <span className="text-[10px] text-amber-600 font-semibold">Lopende maand</span>
                          )}
                        </div>
                      </div>
                      <p className={`text-sm sm:text-base flex-shrink-0 ml-2 whitespace-nowrap font-semibold ${sel ? 'text-amber-600' : 'text-slate-900'}`}>
                        {fmt(inv.outstanding)}
                      </p>
                    </button>
                  );
                })}
                {syntheticCurrent && (
                  <button onClick={() => toggle(synItemKey())} data-testid="pay-current-synth"
                    className={`flex items-center justify-between w-full rounded-lg border-2 transition px-2.5 py-2 sm:px-3 sm:py-2.5 ${
                      selected.has(synItemKey()) ? 'bg-amber-50 border-amber-400' : 'bg-white border-slate-200 hover:border-amber-300'
                    }`}>
                    <div className="flex items-center gap-2">
                      <div className={`flex items-center justify-center rounded border-2 flex-shrink-0 w-5 h-5 ${selected.has(synItemKey()) ? 'bg-amber-500 border-amber-500' : 'border-slate-300'}`}>
                        {selected.has(synItemKey()) && <Check className="text-white w-3.5 h-3.5" strokeWidth={3} />}
                      </div>
                      <div className="rounded-lg flex items-center justify-center flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 bg-slate-50">
                        <Home className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
                      </div>
                      <div className="text-left">
                        <span className="text-sm font-bold text-slate-900 block">Maandhuur</span>
                        <span className="text-[10px] text-amber-600 font-semibold">Lopende maand (geen factuur)</span>
                      </div>
                    </div>
                    <p className={`text-sm sm:text-base flex-shrink-0 ml-2 whitespace-nowrap font-semibold ${selected.has(synItemKey()) ? 'text-amber-600' : 'text-slate-900'}`}>
                      {fmt(syntheticCurrent.outstanding)}
                    </p>
                  </button>
                )}
              </>
            )}

            {/* Boetes + Internet — reguliere extras */}
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

            {/* Vooruit gefactureerd — opt-in (NIET standaard in Alles betalen) */}
            {hasFutureInvoices && (
              <>
                <div className="flex items-center gap-2 mt-2 mb-0.5 px-1">
                  <div className="h-px flex-1 bg-blue-200" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-blue-500">
                    Vooruit gefactureerd · optioneel
                  </span>
                  <div className="h-px flex-1 bg-blue-200" />
                </div>
                {futureInvoices.map((inv) => {
                  const key = invItemKey(inv);
                  const sel = selected.has(key);
                  return (
                    <button key={key} onClick={() => toggle(key)} data-testid={`pay-future-${inv.id}`}
                      className={`flex items-center justify-between w-full rounded-lg border-2 transition px-2.5 py-2 sm:px-3 sm:py-2.5 ${
                        sel ? 'bg-blue-50 border-blue-400' : 'bg-white border-slate-200 hover:border-blue-300'
                      }`}>
                      <div className="flex items-center gap-2">
                        <div className={`flex items-center justify-center rounded border-2 flex-shrink-0 w-5 h-5 ${sel ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>
                          {sel && <Check className="text-white w-3.5 h-3.5" strokeWidth={3} />}
                        </div>
                        <div className={`rounded-lg flex items-center justify-center flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 ${sel ? 'bg-blue-100' : 'bg-slate-50'}`}>
                          <Calendar className={`w-4 h-4 sm:w-5 sm:h-5 ${sel ? 'text-blue-500' : 'text-slate-400'}`} />
                        </div>
                        <div className="text-left">
                          <span className="text-sm font-bold text-slate-900 block">
                            Huur {inv.period_month && inv.period_year
                              ? `${MONTHS_NL[inv.period_month - 1]} ${inv.period_year}`
                              : ''}
                          </span>
                          <span className="text-[10px] text-blue-600 font-semibold">Vooruit gefactureerd</span>
                        </div>
                      </div>
                      <p className={`text-sm sm:text-base flex-shrink-0 ml-2 whitespace-nowrap font-semibold ${sel ? 'text-blue-600' : 'text-slate-900'}`}>
                        {fmt(inv.outstanding)}
                      </p>
                    </button>
                  );
                })}
              </>
            )}
            {planInstallments.length > 0 && (
              <div className="flex items-center gap-2 mt-1 mb-0.5 px-1">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Betalingsregeling
                </span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
            )}
            {planInstallments.map((it) => {
              const today = new Date().toISOString().slice(0, 10);
              const isOverdue = (it.due_date || '') < today;
              const key = planItemKey(it);
              const sel = selected.has(key);
              return (
                <button key={key} onClick={() => toggle(key)}
                  data-testid={`pay-plan-${it.planId}-${it.seq}`}
                  className={`flex items-center justify-between w-full rounded-lg border-2 transition px-2.5 py-2 sm:px-3 sm:py-2.5 ${
                    sel ? 'bg-orange-50 border-orange-400' : 'bg-white border-slate-200 hover:border-orange-300'
                  }`}>
                  <div className="flex items-center gap-2">
                    <div className={`flex items-center justify-center rounded border-2 flex-shrink-0 w-5 h-5 ${sel ? 'bg-orange-500 border-orange-500' : 'border-slate-300'}`}>
                      {sel && <Check className="text-white w-3.5 h-3.5" strokeWidth={3} />}
                    </div>
                    <div className={`rounded-lg flex items-center justify-center flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 ${
                      isOverdue ? 'bg-red-100' : sel ? 'bg-orange-100' : 'bg-slate-50'
                    }`}>
                      <Calendar className={`w-4 h-4 ${isOverdue ? 'text-red-500' : sel ? 'text-orange-500' : 'text-slate-400'}`} />
                    </div>
                    <div className="text-left min-w-0">
                      <p className="text-sm font-bold text-slate-900">
                        Termijn {it.seq}
                        {isOverdue && <span className="ml-1 text-[10px] uppercase tracking-widest text-red-600">achterstallig</span>}
                      </p>
                      <p className="text-[10px] text-slate-500">Vervalt {it.due_date}</p>
                    </div>
                  </div>
                  <p className={`text-sm sm:text-base font-semibold whitespace-nowrap ml-2 ${sel ? 'text-orange-600' : 'text-slate-900'}`}>
                    {fmt(it.amount)}
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
            <span>Direct betalen — {fmt(activeAmount)}</span> <ArrowRight className="w-5 h-5" />
          </button>

          {/* Regeling-afspraak knop: alleen tonen wanneer er échte facturen
              geselecteerd zijn (achterstand / huidige / vooruit). Werkt NIET
              voor vooruitbetaling-modus. */}
          {(selectedInvItems.length > 0 || selectedSynCurrent > 0) && !isAdvance && (
            <button onClick={() => setPlanModalOpen(true)}
              data-testid="payment-plan-arrange-btn"
              className="w-full bg-white border-2 border-orange-300 hover:border-orange-500 text-orange-600 hover:bg-orange-50 rounded-xl flex items-center justify-center gap-2 transition active:scale-[0.98] py-2.5 mt-1.5 text-sm font-bold">
              <Calendar className="w-4 h-4" /> <span>Regeling afspreken — {fmt(selectedInvTotal + selectedSynCurrent)}</span>
            </button>
          )}

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

      {planModalOpen && !planSuccess && (
        <ArrangePlanModal
          tenantId={tenant.id}
          currency={cur}
          totalAmount={selectedInvTotal + selectedSynCurrent}
          invoiceIds={selectedInvItems.map((x) => x.id).filter((id) => id && id !== '__syn_current__')}
          monthsLabel={selectedInvItems
            .map((inv) => inv.period_month ? `${MONTHS_NL[inv.period_month - 1]} ${inv.period_year}` : null)
            .filter(Boolean).join(', ') + (selectedSynCurrent > 0 ? ' (huidige maand)' : '')}
          onClose={() => setPlanModalOpen(false)}
          onArranged={(result) => {
            setPlanSuccess(result);
            setPlanModalOpen(false);
          }}
        />
      )}
      {planSuccess && (
        <PlanArrangedReceipt
          plan={planSuccess}
          currency={cur}
          tenant={tenant}
          onClose={() => { setPlanSuccess(null); onBack(); }}
        />
      )}
    </div>
  );
}

// =====================================================================
// Arrange Plan Modal — proactieve betalingsregeling vanuit PaySelect.
// Toont 2/3/4/6/8 termijn-opties met live "per maand"-bedrag en stuurt
// dit door naar POST /kiosk/payment-plans/quick met multi-invoice_ids.
// =====================================================================
function ArrangePlanModal({ tenantId, currency, totalAmount, invoiceIds, monthsLabel, onClose, onArranged }) {
  const [n, setN] = useState(3);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const per = totalAmount / n;
  const fmt = (v) => fmtMoney(v, currency);

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      const body = {
        tenant_id: tenantId,
        invoice_ids: invoiceIds,
        total_amount: Number(totalAmount.toFixed(2)),
        num_installments: n,
        currency,
        start_date: startDate,
        notes: `Regeling afgesproken voor: ${monthsLabel || 'huurfacturen'}`,
      };
      const { data } = await api.post('/kiosk/payment-plans/quick', body);
      onArranged(data);
    } catch (e) {
      setErr(formatError(e) || 'Kon regeling niet aanmaken');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      data-testid="arrange-plan-modal" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 bg-orange-500 text-white">
          <p className="text-xs uppercase tracking-widest font-bold opacity-80">Betalingsregeling afspreken</p>
          <p className="text-xl font-extrabold mt-1">{fmt(totalAmount)}</p>
          {monthsLabel && <p className="text-xs opacity-80 mt-0.5">Voor: {monthsLabel}</p>}
        </div>
        <div className="p-6">
          <p className="text-sm font-bold text-slate-700 mb-2">In hoeveel termijnen?</p>
          <div className="grid grid-cols-5 gap-2 mb-4">
            {[2, 3, 4, 6, 8].map((opt) => (
              <button key={opt} onClick={() => setN(opt)}
                data-testid={`arrange-plan-n-${opt}`}
                className={`rounded-lg py-3 font-bold text-sm transition ${
                  n === opt ? 'bg-orange-500 text-white ring-2 ring-orange-300'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}>
                {opt}×
              </button>
            ))}
          </div>

          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-700 font-semibold">Per maand</span>
              <span className="font-extrabold text-orange-600">{fmt(per)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 mt-1">
              <span>{n} termijnen, maandelijks</span>
              <span>Eerste op {startDate}</span>
            </div>
          </div>

          <label className="block">
            <span className="text-sm font-bold text-slate-700">Startdatum eerste termijn</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              data-testid="arrange-plan-start-date"
              className="mt-1 w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm font-medium" />
          </label>

          {err && <p className="text-xs text-red-600 mt-3 bg-red-50 border border-red-200 rounded-lg p-2">{err}</p>}
        </div>
        <div className="px-6 py-4 bg-slate-50 flex gap-2 border-t border-slate-100">
          <button onClick={onClose} disabled={busy}
            data-testid="arrange-plan-cancel"
            className="flex-1 py-2.5 rounded-lg bg-white border-2 border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-100 disabled:opacity-50">
            Annuleren
          </button>
          <button onClick={submit} disabled={busy}
            data-testid="arrange-plan-confirm"
            className="flex-[2] py-2.5 rounded-lg bg-orange-500 text-white font-bold text-sm hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Regeling bevestigen
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Plan Arranged Receipt — bevestiging na succesvolle regeling-creatie.
// =====================================================================
function PlanArrangedReceipt({ plan, currency, tenant, onClose }) {
  const fmt = (v) => fmtMoney(v, currency);
  const per = plan.installment_amount || plan.monthly_amount || (plan.total_amount / plan.num_installments);
  const pdfUrl = plan.pdf_url
    ? `${process.env.REACT_APP_BACKEND_URL}${plan.pdf_url}`
    : `${process.env.REACT_APP_BACKEND_URL}/api/kiosk/payment-plans/${plan.id}/pdf`;
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      data-testid="plan-arranged-receipt">
      <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
        <div className="px-6 py-5 bg-emerald-500 text-white text-center">
          <div className="w-14 h-14 rounded-full bg-white/20 mx-auto flex items-center justify-center mb-2">
            <Check className="w-8 h-8 text-white" strokeWidth={3} />
          </div>
          <p className="text-xs uppercase tracking-widest font-bold opacity-90">Regeling aangemaakt</p>
          <p className="text-2xl font-extrabold mt-1">{fmt(plan.total_amount)}</p>
        </div>
        <div className="p-6 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Huurder</span>
            <span className="font-bold">{tenant.name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Termijnen</span>
            <span className="font-bold">{plan.num_installments}× {fmt(per)}</span>
          </div>
          {plan.first_due_date && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Eerste vervaldatum</span>
              <span className="font-bold">{plan.first_due_date}</span>
            </div>
          )}
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-700">
            Beheer ontvangt een melding. Termijnen verschijnen automatisch bij het volgende kiosk-bezoek.
          </div>
        </div>
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 grid grid-cols-2 gap-2">
          <a href={pdfUrl} target="_blank" rel="noreferrer"
            data-testid="plan-arranged-pdf"
            className="py-3 rounded-lg bg-white border-2 border-orange-300 text-orange-600 font-bold text-sm hover:bg-orange-50 flex items-center justify-center gap-2">
            <Download className="w-4 h-4" /> PDF
          </a>
          <button onClick={onClose}
            data-testid="plan-arranged-close"
            className="py-3 rounded-lg bg-emerald-500 text-white font-bold text-sm hover:bg-emerald-600">
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Method select — Contant / Uni5Pay
// =====================================================================
function MethodSelect({ payload, overview, onBack, onConfirm }) {
  const { tenant, apartment: apt } = overview;
  const cur = payload.currency || 'SRD';
  const methods = [
    { v: 'contant', l: 'Contant', sub: 'Betaal met contant geld', icon: Banknote, accent: 'emerald' },
    // Uni5Pay is de primaire online-gateway. De methode-string blijft 'mope'
    // voor backward compat met bestaande DB records; de label en gateway-call
    // gaan via Uni5Pay (mock-modus tot echte API credentials beschikbaar zijn).
    { v: 'mope', l: 'Uni5Pay', sub: 'Scan QR-code om te betalen', icon: QrCode, accent: 'emerald' },
  ];
  // Poll het klantenscherm puur om te VISUALISEREN welke methode de klant
  // heeft aangeraakt — we navigeren GEEN automatisch door. De medewerker
  // moet altijd zelf bevestigen via de "Bevestig" knop. Dit voorkomt dat
  // een per ongeluk geraakte methode de betaling vastlegt.
  const [customerPicked, setCustomerPicked] = useState(null);
  useEffect(() => {
    let stopped = false;
    let timer;
    const tick = async () => {
      try {
        const { data } = await api.get(`/kiosk/customer-display?t=${Date.now()}`);
        const m = data?.state?.payload?.method;
        const at = data?.state?.payload?.method_chosen_at;
        if (at && m && !stopped) setCustomerPicked(m);
      } catch { /* ignore */ }
      if (!stopped) timer = setTimeout(tick, 600);
    };
    tick();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, []);
  // GEEN useEffect die automatisch onConfirm aanroept — medewerker bevestigt.

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
      <div className="px-2 sm:px-4 mb-1">
        <div className="bg-white/20 backdrop-blur-sm rounded-xl px-4 py-2 text-white text-center text-sm font-bold"
          data-testid="method-waiting-customer">
          <Loader2 className="inline-block w-4 h-4 mr-2 animate-spin" />
          Wacht op klant: laat hen op het klantenscherm de betaalmethode kiezen — of tik hieronder voor handmatige invoer.
        </div>
      </div>
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
  const isUni5Pay = (payload.method || '').toLowerCase() === 'mope';
  const [mope, setUni5Pay] = useState(null);  // { qr, ref, mode }
  const [waitingPaid, setWaitingPaid] = useState(false);

  const submit = async () => {
    setLoading(true); setErr('');
    try {
      const planItems = payload.plan_items || [];
      for (const pi of planItems) {
        await api.post(withKioskEmployee(`/kiosk/payment-plans/${pi.plan_id}/installments/${pi.seq}/pay`), {
          method: payload.method,
          amount: pi.amount,
          note: `Operator Kiosk — termijn ${pi.seq}`,
        });
      }
      let data;
      const plainAmount = payload.plain_amount != null ? payload.plain_amount : payload.amount;
      if (plainAmount && plainAmount > 0) {
        const plainPayload = { ...payload, amount: plainAmount };
        delete plainPayload.plan_items; delete plainPayload.plain_amount;
        const res = await api.post(withKioskEmployee('/kiosk/payments'), plainPayload);
        data = res.data;
      } else {
        data = { kind: 'plan_only', plan_items: planItems };
      }
      playSuccessPing();
      onSuccess(data);
    } catch (e) { setErr(formatError(e)); playErrorBuzz(); }
    finally { setLoading(false); }
  };

  // Uni5Pay: bij open van dit scherm meteen een QR-code laten genereren
  // (in mock-modus = lokale QR; in live-modus = echte Uni5Pay API call).
  useEffect(() => {
    if (!isUni5Pay || mope) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.post('/kiosk/mope/create-qr');
        if (!cancelled) {
          setUni5Pay({ qr: data.qr, ref: data.ref, mode: data.mode, api_error: data.api_error });
          setWaitingPaid(true);
        }
      } catch (e) {
        if (!cancelled) setErr(formatError(e));
      }
    })();
    return () => { cancelled = true; };
  }, [isUni5Pay, mope]);

  // Poll mope_paid_at — zodra de klant op "Ik heb betaald" tikt op het
  // klantenscherm (of de echte Uni5Pay webhook arriveert), maken we hier de
  // betaling automatisch aan in de DB en gaan naar het receipt-scherm.
  useEffect(() => {
    if (!waitingPaid) return undefined;
    let stopped = false;
    let timer;
    const tick = async () => {
      try {
        const { data } = await api.get(`/kiosk/customer-display?t=${Date.now()}`);
        const paidAt = data?.state?.payload?.mope_paid_at;
        const ref = data?.state?.payload?.mope_ref;
        if (paidAt && ref && !stopped) {
          setWaitingPaid(false);
          // Voeg de Uni5Pay-referentie als note toe en submit.
          const finalPayload = { ...payload, note: `${payload.note || 'Uni5Pay'} · Ref ${ref}`.trim() };
          setLoading(true);
          try {
            for (const pi of (finalPayload.plan_items || [])) {
              await api.post(withKioskEmployee(`/kiosk/payment-plans/${pi.plan_id}/installments/${pi.seq}/pay`), {
                method: finalPayload.method, amount: pi.amount,
                note: `Operator Kiosk Uni5Pay · termijn ${pi.seq} · Ref ${ref}`,
              });
            }
            let pay = null;
            const plainAmount = finalPayload.plain_amount != null ? finalPayload.plain_amount : finalPayload.amount;
            if (plainAmount && plainAmount > 0) {
              const pp = { ...finalPayload, amount: plainAmount };
              delete pp.plan_items; delete pp.plain_amount;
              const r = await api.post(withKioskEmployee('/kiosk/payments'), pp);
              pay = r.data;
            } else {
              pay = { kind: 'plan_only', plan_items: finalPayload.plan_items || [] };
            }
            playSuccessPing();
            onSuccess(pay);
          } catch (e) { setErr(formatError(e)); playErrorBuzz(); setLoading(false); }
          return;
        }
      } catch { /* ignore */ }
      if (!stopped) timer = setTimeout(tick, 700);
    };
    tick();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [waitingPaid, payload, onSuccess]);

  // Uni5Pay-scherm: toon QR + "Wacht op klant"-banner (admin Kiosk variant).
  if (isUni5Pay) {
    return (
      <div className="h-full bg-orange-500 flex flex-col" style={{ padding: '1.5vh 1.5vw 0' }}>
        <div className="flex items-center justify-between flex-wrap gap-2 px-1 sm:px-2 py-2">
          <button onClick={onBack} data-testid="confirm-back"
            className="flex items-center gap-1.5 text-white font-bold bg-white/20 backdrop-blur-sm rounded-lg px-3 py-1.5 sm:px-4 sm:py-2">
            <ArrowLeft className="w-4 h-4" /> <span className="text-xs sm:text-sm">Terug</span>
          </button>
          <span className="text-sm sm:text-base font-semibold text-white">Uni5Pay-betaling actief</span>
          <div className="text-right text-white">
            <p className="text-xs sm:text-sm font-semibold">{tenant.name}</p>
            <p className="text-[10px] sm:text-xs opacity-70">Appt. {apt.number}</p>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center pb-6">
          <div className="bg-white rounded-3xl w-full max-w-xl p-6 sm:p-8 shadow-2xl text-center">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">Uni5Pay-betaling</p>
            <p className="text-4xl sm:text-5xl font-black text-[#FF5C00] tracking-tight mt-1 mb-4">
              {fmtMoney(payload.amount, payload.currency)}
            </p>
            {!mope ? (
              <div className="py-4 flex flex-col items-center gap-2">
                {/* Optimistische QR — direct zichtbaar voor de operator
                    met de fallback mock-pay URL. Zodra de backend de
                    echte Uni5Pay QR retourneert (mope-state hieronder),
                    swappen we naar de officiële QR. */}
                <div className="mx-auto bg-white p-2 rounded-2xl ring-4 ring-orange-100 relative"
                  style={{ width: 220, height: 220 }}>
                  <QRCodeSVG
                    value={`${(typeof window !== 'undefined' ? window.location.origin : '')}/api/payments/mock-pay/preview?amount=${payload.amount}&currency=${payload.currency || 'SRD'}`}
                    size={256}
                    level="H"
                    bgColor="#FFFFFF"
                    fgColor="#0F0F0F"
                    style={{ width: '100%', height: '100%' }}
                  />
                  {/* Subtle "loading official QR" overlay */}
                  <div className="absolute inset-2 rounded-xl bg-white/85 backdrop-blur-sm flex flex-col items-center justify-center gap-2 pointer-events-none">
                    <Loader2 className="w-7 h-7 animate-spin text-[#FF5C00]" />
                    <p className="text-xs font-black uppercase tracking-widest text-slate-600">QR wordt opgehaald…</p>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-2">Uni5Pay genereert de officiële QR</p>
              </div>
            ) : (
              <>
                <div className="mx-auto bg-white p-2 rounded-2xl ring-4 ring-orange-100"
                  style={{ width: 220, height: 220 }}>
                  <img src={mope.qr} alt="Uni5Pay QR" className="w-full h-full object-contain" />
                </div>
                <p className="mt-4 text-sm font-bold text-slate-700">
                  Klant scant de QR-code op het klantenscherm
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Referentie: <span className="font-mono">{mope.ref}</span>
                  {mope.mode === 'mock' && (
                    <span className="ml-2 px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-bold uppercase tracking-wider text-[10px]">
                      Lokale mock
                    </span>
                  )}
                  {mope.mode === 'test' && (
                    <span className="ml-2 px-2 py-0.5 rounded bg-sky-100 text-sky-700 font-bold uppercase tracking-wider text-[10px]">
                      Uni5Pay test
                    </span>
                  )}
                  {mope.mode === 'live' && (
                    <span className="ml-2 px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold uppercase tracking-wider text-[10px]">
                      Live
                    </span>
                  )}
                </p>
                {mope.api_error && (
                  <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs">
                    <p className="font-bold">Uni5Pay-API niet bereikbaar — terug naar mock-modus.</p>
                    <p className="opacity-80 mt-1 break-all">{mope.api_error.slice(0, 180)}</p>
                    <p className="mt-1">Vraag een geldig token aan via <a href="mailto:info@mope.sr" className="underline font-bold">info@mope.sr</a> en plak het in Instellingen → Uni5Pay.</p>
                  </div>
                )}
                <div className="my-4 flex items-center gap-2 text-emerald-600 font-bold text-sm justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Wacht op bevestiging…
                </div>
                <p className="text-xs text-slate-400">
                  Zodra de betaling binnen is, wordt de kwitantie automatisch gemaakt.
                </p>
                {err && <div className="mt-3 p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-xs">{err}</div>}
              </>
            )}
            {loading && (
              <div className="mt-3 text-sm font-bold text-emerald-600 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Betaling registreren…
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

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

function PartialPlanSuggestion({ tenantId, partialInvoice, onClose, onPlanned }) {
  const cur = (partialInvoice?.currency || 'SRD').toUpperCase();
  const remaining = Number(partialInvoice?.outstanding || 0);
  const fmt = (v) => fmtMoney(v, cur);
  const [n, setN] = useState(2);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const monthly = useMemo(() => Math.round((remaining / n) * 100) / 100, [remaining, n]);

  if (!partialInvoice || remaining <= 0) return null;

  const monthName = partialInvoice.period_month
    ? `${MONTHS_NL[partialInvoice.period_month - 1]} ${partialInvoice.period_year}`
    : 'deze factuur';

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      const { data } = await api.post('/kiosk/payment-plans/quick', {
        tenant_id: tenantId,
        invoice_id: partialInvoice.id,
        total_amount: remaining,
        num_installments: n,
        currency: cur,
      });
      onPlanned?.(data);
    } catch (e) {
      setErr(formatError(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center"
      data-testid="partial-plan-suggestion"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0px)' }}>
        <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
          <span className="w-10 h-1.5 rounded-full bg-slate-200" />
        </div>
        <div className="px-5 pt-3 sm:pt-6 pb-2 text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-orange-500/25">
            <Calendar className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-xl font-extrabold text-slate-900">Resterend bedrag afspreken?</h3>
          <p className="text-sm text-slate-500 mt-1">
            Er staat nog <span className="font-extrabold text-orange-600">{fmt(remaining)}</span> open voor {monthName}.
          </p>
        </div>

        <div className="px-5 py-3 flex-1 overflow-y-auto">
          <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-2">In hoeveel termijnen?</p>
          <div className="grid grid-cols-3 gap-2">
            {[2, 3, 4].map((opt) => {
              const sel = n === opt;
              const per = Math.round((remaining / opt) * 100) / 100;
              return (
                <button key={opt} onClick={() => setN(opt)} data-testid={`partial-plan-n-${opt}`}
                  className={`rounded-xl border-2 p-3 text-center transition ${
                    sel ? 'border-orange-500 bg-orange-50 shadow-md shadow-orange-500/20'
                      : 'border-slate-200 bg-white hover:border-orange-300'
                  }`}>
                  <p className={`text-2xl font-extrabold ${sel ? 'text-orange-600' : 'text-slate-700'}`}>{opt}×</p>
                  <p className={`text-[10px] uppercase tracking-wider font-bold mt-0.5 ${sel ? 'text-orange-700' : 'text-slate-400'}`}>termijnen</p>
                  <p className={`text-xs font-mono font-extrabold mt-1.5 ${sel ? 'text-orange-700' : 'text-slate-500'}`}>{fmt(per)}</p>
                </button>
              );
            })}
          </div>

          <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="text-slate-500 font-bold">Per maand</span>
              <span className="font-extrabold text-slate-900 font-mono">{fmt(monthly)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-bold">Eerste vervaldatum</span>
              <span className="font-mono text-slate-700 font-semibold">~30 dagen vanaf vandaag</span>
            </div>
          </div>

          {err && (
            <div className="mt-3 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
              {err}
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 px-5 py-3 grid grid-cols-2 gap-2 shrink-0">
          <button onClick={onClose} disabled={busy} data-testid="partial-plan-skip"
            className="h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold disabled:opacity-50">
            Nee, later
          </button>
          <button onClick={submit} disabled={busy} data-testid="partial-plan-confirm"
            className="h-12 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-md shadow-orange-500/25">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Maak regeling
          </button>
        </div>
      </div>
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

  // Partial-betaling detectie: na de refetch checken we of er een factuur
  // is die zojuist gedeeltelijk betaald is en nog open staat. Zo ja, tonen
  // we de "regeling maken?"-suggestie BEFORE auto-done.
  const [partialInv, setPartialInv] = useState(null);
  const [planMade, setPlanMade] = useState(false);

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
        // Eerste partial-factuur uit de bijgewerkte overview pakken.
        const invs = Array.isArray(data?.open_invoices) ? data.open_invoices : [];
        const partial = invs.find((inv) => inv.is_partial && inv.outstanding > 0);
        if (partial) setPartialInv(partial);
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

  // Auto-terug naar beginscherm na 10 seconden. Pauzeer wanneer de partial-
  // suggestie open is — anders verdwijnt de modal achter het home-scherm voor
  // de huurder hem kan beantwoorden.
  useEffect(() => {
    if (partialInv && !planMade) return undefined;
    const t = setTimeout(onDone, 10000);
    return () => clearTimeout(t);
  }, [onDone, partialInv, planMade]);

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
              {/* Prominente medewerker-banner — direct boven het bedrag.
                  Geeft de huurder vertrouwen + helpt bij klachten. */}
              {payment.received_by && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 mb-3 flex items-center gap-2.5"
                  data-testid="receipt-received-by-banner">
                  <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs font-black shrink-0">
                    {(payment.received_by || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-orange-700">Ontvangen door</p>
                    <p className="text-sm font-extrabold text-slate-900 truncate" data-testid="receipt-received-by">{payment.received_by}</p>
                  </div>
                </div>
              )}
              <div className="space-y-1.5 text-sm">
                <RowSlim label="Huurder" value={payment.tenant_name} />
                <RowSlim label="Appartement" value={payment.apartment_number || '—'} />
                <RowSlim label="Categorie" value={payment.category} />
                {payment.period_month && <RowSlim label="Periode" value={`${MONTHS_NL[payment.period_month - 1]} ${payment.period_year}`} />}
                <RowSlim label="Methode" value={payment.method} />
                <RowSlim label="Datum" value={new Date(payment.paid_at).toLocaleString('nl-NL')} />
                {payment.approved_by && payment.approved_by !== payment.received_by && (
                  <RowSlim label="Goedgekeurd door" value={payment.approved_by} />
                )}
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

      {/* Partial-payment regeling suggestie — verschijnt na ~1.5s zodat de
          huurder eerst de bevestiging "Bedankt!" ziet, dan een keuze maakt. */}
      {partialInv && !planMade && (
        <PartialPlanSuggestion
          tenantId={payment.tenant_id || overview?.tenant?.id}
          partialInvoice={partialInv}
          onClose={() => setPartialInv(null)}
          onPlanned={() => { setPlanMade(true); setPartialInv(null); }}
        />
      )}
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
  const navigate = useBrandedNavigate();
  const [step, setStep] = useState('check');
  const [apartment, setApartment] = useState(null);
  const [overview, setOverview] = useState(null);
  const [paymentPayload, setPaymentPayload] = useState(null);
  // Live-preview voor het klantenscherm tijdens de "pay" stap. Wordt door
  // PaySelect realtime bijgewerkt naarmate de operator categorieën aanvinkt
  // of via het keypad een bedrag intikt — zodat de klant op zijn scherm
  // het lopend totaal en de geselecteerde onderdelen meteen ziet, vóórdat
  // de operator op "Verder" tikt.
  const [livePreview, setLivePreview] = useState(null);
  const [paymentResult, setPaymentResult] = useState(null);
  const [company, setCompany] = useState(getKioskCompany());

  useEffect(() => {
    // document.title wordt centraal beheerd door usePwaManifest() in App.js
    const tok = localStorage.getItem('kiosk_token');
    if (!tok) { navigate('/login?target=kiosk', { replace: true }); return; }
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
    // VOLLEDIGE reset zodat een volgende gebruiker (vooral een andere
    // medewerker op een gedeeld kiosk-toestel) cleanly bij de PIN-keypad
    // landt zonder oude tokens of role-voorkeur. Anders krijgt de PWA
    // een auto-redirect terug naar /kiosk of /admin met de stale tokens
    // van de vorige gebruiker.
    try {
      localStorage.removeItem('kiosk_token');
      localStorage.removeItem('kiosk_company');
      localStorage.removeItem('admin_token');
      localStorage.removeItem('pwa_preferred_role');
      localStorage.removeItem('active_company_id');
    } catch { /* ignore */ }
    try {
      sessionStorage.removeItem('kiosk_emp_id');
      sessionStorage.removeItem('kiosk_emp_name');
      sessionStorage.removeItem('kiosk_emp_pin');
    } catch { /* ignore */ }
    // Hard reload zodat AuthProvider zijn cached state óók kwijt is.
    window.location.assign('/login?pick=1');
  }, []);

  // Push huidige state naar het klantenscherm. Idempotent — we sturen
  // alleen waarden die de klant ook mag zien (geen pin_hash, geen company_id).
  // Combinatie van 3 transports:
  //  1) BroadcastChannel — instant same-browser sync (2e tab / 2e monitor)
  //  2) Backend PUT — robuust voor cross-device (klant tablet in andere ruimte)
  //  3) Heartbeat elke 3s — overwrite stale state in DB, voorkomt vastlopen
  useEffect(() => {
    if (step === 'check') return undefined;
    const pushKeyRef = { current: '' };
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
      // Tijdens 'pay' tonen we de live preview van de operator-selectie
      // (categorieën + lopend totaal) zodat het klantenscherm meteen
      // meebeweegt. Zodra de operator op "Verder" tikt wordt paymentPayload
      // gevuld en gebruikt — die heeft voorrang.
      const livePayload = (!paymentPayload && step === 'pay' && livePreview) ? {
        amount: livePreview.amount, currency: livePreview.currency,
        categories: livePreview.categories || [],
      } : null;
      const payload = paymentPayload ? {
        amount: paymentPayload.amount, currency: paymentPayload.currency,
        categories: paymentPayload.categories || [], method: paymentPayload.method,
      } : livePayload;
      const payment = paymentResult ? {
        amount: paymentResult.amount, currency: paymentResult.currency,
        receipt_number: paymentResult.receipt_number, method: paymentResult.method,
        paid_at: paymentResult.paid_at,
      } : null;
      return { step, apartment: apt, tenant, overview: ovw, payload, payment };
    };
    const push = () => {
      const body = buildBody();
      // CONTENT-HASH dedup: alleen pushen wanneer er ECHT iets is veranderd.
      // Anders zou de heartbeat elke 3s dezelfde receipt-state terug-pushen
      // naar de DB met een nieuwe timestamp, wat het klantenscherm zou laten
      // flikkeren tussen idle (na 12s TTL) en receipt (door nieuwe push).
      let contentKey = '';
      try {
        contentKey = JSON.stringify({
          s: body.step,
          a: body.apartment?.id, t: body.tenant?.name,
          amt: body.payload?.amount, cur: body.payload?.currency,
          m: body.payload?.method, mc: body.payload?.method_chosen_at,
          // Categorieën in de hash zodat live-preview wijzigingen
          // (b.v. operator vinkt "Internet" aan met €0) een push triggeren.
          cats: (body.payload?.categories || []).map((c) => `${c.key || c.label}:${c.value || 0}`).join('|'),
          r: body.payment?.receipt_number, pa: body.payment?.paid_at,
        });
      } catch { contentKey = String(Math.random()); }
      if (contentKey === pushKeyRef.current) return;
      pushKeyRef.current = contentKey;
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
    // Heartbeat: elke 1.5s een keepalive push. De content-hash dedup in
    // `push()` zorgt dat we GEEN onnodige PUTs doen — alleen wanneer de
    // state daadwerkelijk verandert. 1.5s ipv 3s zodat een stale state
    // sneller wordt opgemerkt en gecorrigeerd.
    const hb = setInterval(push, 1500);
    return () => clearInterval(hb);
  }, [step, apartment, overview, paymentPayload, paymentResult, livePreview]);

  // "Beheerder" knop in de kiosk: als de PIN-login een admin-token heeft
  // afgegeven (PIN is shared secret van het bedrijf), spring direct naar
  // /admin. We doen een hard navigation zodat AuthProvider zijn /auth/me
  // opnieuw uitvoert met het nieuwe admin_token (en niet de oude user=null
  // state uit de cache van vóór de PIN-login).
  // Voor MEDEWERKER-logins (employee-PIN, geen admin_token): verbergen we
  // de knop volledig — zij mogen niet bij de Beheer-omgeving. Daarom geven
  // we adminMode hieronder alleen door aan de buttons als er een token is.
  const adminMode = useCallback(() => {
    let hasAdminToken = false;
    try { hasAdminToken = !!localStorage.getItem('admin_token'); } catch { /* ignore */ }
    if (hasAdminToken) {
      window.location.assign('/admin');
    } else {
      navigate('/login?view=admin', { replace: true });
    }
  }, [navigate]);

  // Snapshot van admin_token aanwezigheid — wordt herberekend wanneer er
  // een medewerker (uit)logt zodat de Beheerder-knop direct verschijnt of
  // verdwijnt.
  const [hasAdminAccess, setHasAdminAccess] = useState(() => {
    try { return !!localStorage.getItem('admin_token'); } catch { return false; }
  });
  useEffect(() => {
    const refresh = () => {
      try { setHasAdminAccess(!!localStorage.getItem('admin_token')); } catch { /* ignore */ }
    };
    window.addEventListener('storage', refresh);
    window.addEventListener('kiosk-employee-changed', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('kiosk-employee-changed', refresh);
    };
  }, []);

  const reset = () => {
    // Wis ook DIRECT het klantenscherm zodat een volgende huurder niet de
    // oude data ziet (vooral belangrijk na een betaling — operator klikt
    // "Klaar" en de volgende klant moet meteen het welkom-scherm zien).
    api.delete('/kiosk/customer-display').catch(() => {});
    setApartment(null); setOverview(null); setPaymentPayload(null);
    setLivePreview(null); setPaymentResult(null);
    setStep('select');
  };

  // Klant initieert betaling vanaf het klantenscherm — we synchroniseren
  // hier de admin Kiosk zodat we direct naar de method-pick gaan.
  useEffect(() => {
    if (step !== 'overview' || !overview) return undefined;
    let stopped = false;
    let timer;
    const tick = async () => {
      try {
        // Geauthenticeerd endpoint — werkt altijd, ongeacht slug-staat.
        const { data } = await api.get(`/kiosk/customer-display?t=${Date.now()}`);
        const p = data?.state?.payload;
        if (!stopped && p?.customer_initiated && p?.amount > 0) {
          setPaymentPayload({
            amount: p.amount,
            currency: p.currency || 'SRD',
            categories: p.categories || [],
            tenant_id: overview.tenant?.id,
            apartment_id: overview.apartment?.id,
          });
          setStep('method');
          return;
        }
      } catch { /* ignore */ }
      if (!stopped) timer = setTimeout(tick, 600);
    };
    tick();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [step, overview]);

  const showDesktopBar = step !== 'check';
  const [showEmpLogin, setShowEmpLogin] = useState(false);
  // Bij stap 'pay' (eerste interactie waar een betaling wordt opgezet)
  // zorg dat een kiosk-medewerker is ingelogd. Zo nee → toon login sheet.
  // UITZONDERING: als de gebruiker een admin_token heeft (beheerder of
  // boekhouder werkt vanaf de Kiosk), GEEN sheet tonen — zijn betalingen
  // gaan via de legacy directe-goedkeuring flow (status=approved).
  useEffect(() => {
    if (step !== 'pay') return;
    let hasAdmin = false;
    try { hasAdmin = !!localStorage.getItem('admin_token'); } catch { /* ignore */ }
    if (hasAdmin) return;
    if (!getKioskEmployee()) setShowEmpLogin(true);
  }, [step]);

  return (
    <div className="kiosk-fullscreen bg-orange-500" data-testid="kiosk-root">
      <AnimatePresence mode="wait">
        <motion.div key={step} variants={variants}
          initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          className="absolute inset-0 overflow-y-auto overflow-x-hidden mobile-safe-bottom kiosk-content-scroll"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
          {step === 'check' && (
            <div className="h-full bg-orange-500 flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-white animate-spin" />
            </div>
          )}
          {step === 'select' && (
            <ApartmentSelect onSelect={(a) => { setApartment(a); setStep('overview'); }}
              onAdmin={hasAdminAccess ? adminMode : null} onExit={exit} />
          )}
          {step === 'overview' && apartment && (
            <TenantOverview apartment={apartment} onBack={() => setStep('select')}
              onPay={(d) => { setOverview(d); setStep('pay'); }} />
          )}
          {step === 'pay' && overview && (
            <PaySelect overview={overview} onBack={() => setStep('overview')}
              onLiveChange={setLivePreview}
              onConfirm={(p) => { setLivePreview(null); setPaymentPayload(p); setStep('method'); }} />
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

      {/* Bottom bar — absolute (binnen .kiosk-fullscreen) i.p.v. fixed.
          Voorkomt iOS quirk waarbij geneste fixed elementen op iPad ~20px
          boven de fysieke onderrand renderen. */}
      {showDesktopBar && (
        <div className="hidden md:block absolute bottom-0 left-0 right-0 z-40 bg-white"
          data-testid="kiosk-bottom-bar">
          <div className="flex items-center justify-between px-4 sm:px-6"
            style={{ height: 'clamp(48px, 7vh, 64px)' }}>
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="rounded-lg bg-orange-500 flex items-center justify-center w-9 h-9 shrink-0">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <span className="text-sm sm:text-base font-bold text-slate-800 truncate" data-testid="kiosk-footer-company">
                {company?.name || 'Kiosk'}
              </span>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              {/* Medewerker-bar alleen voor niet-admin gebruikers; admin/boekhouder
                  tikt direct via legacy flow zonder PIN-sessie. */}
              {!hasAdminAccess && <KioskEmployeeBar onLoginClick={() => setShowEmpLogin(true)} />}
              {apartment && step !== 'select' && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-400 font-medium hidden sm:inline">{apartment.tenant_name}</span>
                  <span className="text-sm font-bold text-slate-800">Appt. {apartment.number}</span>
                </div>
              )}
              <button onClick={adminMode} data-testid="kiosk-admin-btn-desktop"
                className={`bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg px-5 py-2 text-sm ${hasAdminAccess ? '' : 'hidden'}`}>Beheerder</button>
              <button onClick={exit} data-testid="kiosk-lock-btn-desktop"
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg px-5 py-2 text-sm">Uit</button>
            </div>
          </div>
        </div>
      )}
      {/* Mobile floating Medewerker-badge — bottom-left, niet in flow.
          Alleen tonen voor niet-admin gebruikers (admin tikt zonder PIN). */}
      {showDesktopBar && !hasAdminAccess && (
        <div className="md:hidden fixed left-3 z-40"
          style={{ bottom: 'max(env(safe-area-inset-bottom, 12px), 12px)' }}
          data-testid="kiosk-emp-bar-mobile">
          <KioskEmployeeBar onLoginClick={() => setShowEmpLogin(true)} />
        </div>
      )}
      {/* Kiosk-medewerker login sheet — verschijnt automatisch bij eerste
          betaling als er nog geen sessie is, of handmatig via banner. */}
      {showEmpLogin && (
        <KioskEmployeeLoginSheet
          onCancel={() => setShowEmpLogin(false)}
          onSuccess={() => setShowEmpLogin(false)}
        />
      )}
    </div>
  );
}
