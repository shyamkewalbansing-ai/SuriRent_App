import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Building2, ArrowRight, ArrowLeft, Banknote, Receipt, LogOut, MapPin,
  Check, Loader2, Home, X, Wallet, FileText, Wifi, AlertCircle,
  Smartphone, QrCode, ShieldCheck, Clock as ClockIcon, Printer, Download,
} from 'lucide-react';
import { api, formatError, fmtMoney, MONTHS_NL } from '../../lib/api';

const variants = {
  enter: { opacity: 0, x: 30 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -30 },
};

function getKioskCompany() {
  try {
    const raw = localStorage.getItem('kiosk_company');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// =====================================================================
// Footer — bedrijfsnaam links + appartement-info + Beheerder/Uit rechts
// =====================================================================
function KioskFooter({ company, apartment, onAdmin, onExit, showAdmin = true }) {
  return (
    <div className="bg-white border-t border-white/10 px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.2)]">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#FF8A3D] to-[#C74600] p-1 shrink-0">
          <img src="/kiosk-icons/kiosk-512.png" alt="" className="w-full h-full object-contain" />
        </div>
        <p className="font-black text-slate-900 text-sm sm:text-base truncate" data-testid="kiosk-footer-company">
          {company?.name || 'SuriRent'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {apartment && (
          <div className="hidden sm:block text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{apartment.number}</p>
            <p className="text-xs font-bold text-slate-600">Appt. {apartment.number}</p>
          </div>
        )}
        {showAdmin && (
          <button onClick={onAdmin} data-testid="kiosk-footer-admin"
            className="px-4 h-10 rounded-xl bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold text-sm shadow-[0_8px_20px_-5px_rgba(255,92,0,0.5)]">
            Beheerder
          </button>
        )}
        <button onClick={onExit} data-testid="kiosk-footer-exit"
          className="px-3 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm flex items-center gap-1.5">
          <LogOut className="w-3.5 h-3.5" /> Uit
        </button>
      </div>
    </div>
  );
}

// =====================================================================
// Welcome screen
// =====================================================================
function Welcome({ onStart }) {
  return (
    <div className="h-full flex items-center justify-center p-4 sm:p-8">
      <div className="bg-white rounded-3xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.25)] w-full max-w-2xl p-8 sm:p-12 text-center">
        <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-3xl bg-gradient-to-br from-[#FF8A3D] to-[#C74600] flex items-center justify-center mx-auto mb-6 shadow-xl shadow-orange-500/40 p-4">
          <img src="/kiosk-icons/kiosk-512.png" alt="Kiosk" className="w-full h-full object-contain" />
        </div>
        <h1 className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tighter mb-3">Welkom</h1>
        <p className="text-base sm:text-lg text-slate-500 mb-8">Betaal uw huur, servicekosten en meer</p>
        <button onClick={onStart} data-testid="kiosk-start-btn"
          className="inline-flex items-center gap-3 px-10 py-5 bg-[#FF5C00] hover:bg-[#E05200] text-white text-xl font-black rounded-2xl shadow-[0_20px_40px_-10px_rgba(255,92,0,0.6)] active:scale-[0.98] transition-all">
          Start <ArrowRight className="w-6 h-6" />
        </button>
        <div className="mt-10 pt-8 border-t border-slate-100">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">Beschikbare diensten</p>
          <div className="flex gap-3 sm:gap-6 justify-center flex-wrap">
            {[
              { icon: Banknote, label: 'Maandhuur' },
              { icon: Wallet, label: 'Servicekosten' },
              { icon: Wifi, label: 'Internet' },
              { icon: Receipt, label: 'Borg & Boetes' },
            ].map((s) => (
              <div key={s.label} className="bg-slate-50 rounded-2xl px-4 py-3 flex flex-col items-center">
                <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center mb-2">
                  <s.icon className="w-5 h-5 text-[#FF5C00]" />
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
// Location select — kies de locatie
// =====================================================================
function LocationSelect({ onBack, onSelect, onSkip }) {
  const [locs, setLocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.get('/kiosk/locations').then((r) => setLocs(r.data))
      .catch((e) => setErr(formatError(e)))
      .finally(() => setLoading(false));
  }, []);
  // Auto-skip naar appartement-keuze als er maar 1 (of 0) locatie is.
  useEffect(() => {
    if (!loading && locs.length <= 1) onSkip();
  }, [loading, locs, onSkip]);

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <button onClick={onBack} data-testid="loc-back"
            className="flex items-center gap-2 text-white/90 hover:text-white font-bold">
            <ArrowLeft className="w-5 h-5" /> Terug
          </button>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">Kies uw locatie</h2>
          <div className="w-20" />
        </div>

        {loading ? (
          <div className="py-16 flex items-center justify-center"><Loader2 className="w-10 h-10 text-white animate-spin" /></div>
        ) : err ? (
          <div className="bg-white rounded-2xl p-6 text-center text-red-500">{err}</div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {locs.map((loc) => (
              <button key={loc.id} onClick={() => onSelect(loc)}
                data-testid={`kiosk-loc-${loc.id}`}
                className="bg-white rounded-3xl shadow-[0_20px_50px_-15px_rgba(0,0,0,0.25)] overflow-hidden text-left hover:scale-[1.02] active:scale-[0.99] transition-transform">
                {loc.photo_url ? (
                  <div className="h-40 bg-slate-100 overflow-hidden">
                    <img src={loc.photo_url} alt={loc.name} className="w-full h-full object-cover"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  </div>
                ) : (
                  <div className="h-40 bg-gradient-to-br from-[#FFF4EC] to-[#FFE6D3] flex items-center justify-center">
                    <MapPin className="w-16 h-16 text-[#FF5C00]/40" />
                  </div>
                )}
                <div className="p-5">
                  <h3 className="text-xl font-black text-slate-900 truncate">{loc.name}</h3>
                  <p className="text-sm text-slate-500 truncate mt-0.5">{loc.address || '—'}</p>
                  <div className="flex items-center gap-2 mt-3">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-50 text-[#C74600] font-bold text-xs">
                      <Building2 className="w-3 h-3" /> {loc.apartments_total} appt.
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// Apartment select — grid in oude-ERP-stijl, header met locatie
// =====================================================================
function ApartmentSelect({ location, onSelect, onBack }) {
  const [apts, setApts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  useEffect(() => {
    const params = location?.id ? { params: { location_id: location.id } } : {};
    api.get('/kiosk/apartments', params).then((r) => setApts(r.data))
      .catch((e) => setErr(formatError(e)))
      .finally(() => setLoading(false));
  }, [location]);

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <button onClick={onBack} data-testid="apt-select-back"
            className="flex items-center gap-2 text-white/90 hover:text-white font-bold">
            <ArrowLeft className="w-5 h-5" /> Terug
          </button>
          <div className="text-center min-w-0">
            <h2 className="text-base sm:text-xl font-black text-white tracking-tight truncate">
              {location?.name ? `${location.name} · ` : ''}Kies uw appartement
            </h2>
          </div>
          <div className="w-20" />
        </div>

        {loading ? (
          <div className="py-16 flex items-center justify-center"><Loader2 className="w-10 h-10 text-white animate-spin" /></div>
        ) : err ? (
          <div className="bg-white rounded-2xl p-6 text-center text-red-500">{err}</div>
        ) : apts.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 text-center">
            <Home className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-semibold">Geen appartementen gevonden.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {apts.map((a) => {
              const isOccupied = a.status === 'occupied' && a.tenant_id;
              return (
                <button key={a.id} disabled={!isOccupied} onClick={() => onSelect(a)}
                  data-testid={`kiosk-apt-${a.id}`}
                  className={`relative aspect-[5/4] rounded-2xl p-4 text-center transition-all flex flex-col items-center justify-center gap-2 ${
                    isOccupied
                      ? 'bg-[#FFE6D3] hover:bg-white hover:scale-[1.03] active:scale-[0.98] shadow-[0_15px_35px_-10px_rgba(0,0,0,0.2)]'
                      : 'bg-white/40 cursor-not-allowed opacity-60'
                  }`}>
                  <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center shadow-inner">
                    <Building2 className="w-7 h-7 text-[#FF5C00]" />
                  </div>
                  <p className="text-xl font-black text-slate-900 tracking-tight">{a.number}</p>
                  {a.tenant_name && (
                    <p className="text-xs text-slate-500 truncate w-full px-1">{a.tenant_name}</p>
                  )}
                  <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                    isOccupied ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
                  }`}>
                    {isOccupied ? 'Bezet' : 'Vacant'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// Tenant overview — split-screen: financieel overzicht (L) + te betalen (R)
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

  if (loading) {
    return <div className="h-full flex items-center justify-center"><Loader2 className="w-10 h-10 text-white animate-spin" /></div>;
  }
  if (err || !data) {
    return <div className="h-full flex items-center justify-center text-white p-8">{err || 'Geen data'}</div>;
  }
  const { tenant, apartment: apt, balance } = data;
  const internet = Number(tenant.internet_amount || 0);
  const openRent = balance.balance > 0 ? balance.balance : 0;
  const totalDue = openRent + internet;  // servicekosten/boetes are extra on the pay step

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack} data-testid="overview-back"
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold backdrop-blur-sm">
            <ArrowLeft className="w-5 h-5" /> Terug
          </button>
          <div className="text-white text-center">
            <p className="text-xs font-bold tracking-wider uppercase text-white/70">{tenant.name}</p>
            <p className="text-sm font-black">Appt. {apt.number}</p>
          </div>
          <div className="w-20" />
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          {/* LEFT: Financieel overzicht */}
          <div className="bg-white rounded-3xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.25)] p-5 sm:p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-slate-900">Financieel overzicht</h3>
              <button data-testid="overview-pdf" disabled
                title="PDF binnenkort beschikbaar"
                className="px-3 h-9 rounded-lg bg-[#FF5C00]/10 text-[#C74600] font-bold text-xs flex items-center gap-1.5 disabled:opacity-50 cursor-not-allowed">
                <Download className="w-3.5 h-3.5" /> PDF
              </button>
            </div>

            <div className="flex-1 divide-y divide-slate-100">
              <OverviewRow icon={Home} label="Maandhuur" amount={apt.rent_amount} currency={apt.currency} />
              {openRent > 0 && (
                <OverviewRow icon={Wallet} label="Openstaande huur" amount={openRent} currency={balance.currency}
                  sub={balance.next_period ? `${MONTHS_NL[balance.next_period.month - 1]} ${balance.next_period.year}` : ''}
                  highlight />
              )}
              <OverviewRow icon={FileText} label="Servicekosten" amount={0} currency={apt.currency} muted />
              <OverviewRow icon={AlertCircle} label="Boetes" amount={0} currency={apt.currency} muted />
              <OverviewRow icon={Wifi} label="Internet" amount={internet} currency="SRD" muted={internet === 0} />
            </div>

            <div className="border-t-2 border-slate-200 mt-3 pt-3 flex items-center justify-between">
              <p className="font-bold text-slate-900">Totaal openstaand</p>
              <p className="text-xl font-black text-slate-900">{fmtMoney(totalDue, balance.currency)}</p>
            </div>
          </div>

          {/* RIGHT: Te betalen + Volgende + Geschiedenis */}
          <div className="bg-white rounded-3xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.25)] p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[380px]">
            <div className="w-20 h-20 rounded-2xl bg-orange-100 flex items-center justify-center mb-4">
              <Wallet className="w-10 h-10 text-[#FF5C00]" />
            </div>
            <p className="text-sm font-bold uppercase tracking-widest text-slate-500">Te betalen</p>
            <p className="text-5xl sm:text-6xl font-black text-slate-900 tracking-tighter mt-2 mb-8" data-testid="overview-total">
              {fmtMoney(totalDue, balance.currency)}
            </p>
            <button onClick={() => onPay({ ...data, internet, total_due: totalDue })}
              data-testid="overview-pay-btn"
              className="w-full max-w-md h-16 bg-[#FF5C00] hover:bg-[#E05200] text-white text-xl font-black rounded-2xl flex items-center justify-center gap-3 shadow-[0_20px_40px_-10px_rgba(255,92,0,0.6)] active:scale-[0.98]">
              Volgende <ArrowRight className="w-6 h-6" />
            </button>
            <button onClick={() => setShowHistory(true)} data-testid="overview-history-btn"
              className="mt-3 w-full max-w-md h-12 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold rounded-2xl flex items-center justify-center gap-2">
              <ClockIcon className="w-4 h-4" /> Betalingsgeschiedenis
            </button>
          </div>
        </div>
      </div>

      {showHistory && (
        <PaymentHistoryModal tenant={tenant} apartment={apt} onClose={() => setShowHistory(false)} />
      )}
    </div>
  );
}

function OverviewRow({ icon: Icon, label, amount, currency, sub, highlight, muted }) {
  return (
    <div className={`flex items-center justify-between py-3 px-1 ${highlight ? 'text-[#FF5C00]' : muted ? 'text-slate-400' : 'text-slate-900'}`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
          highlight ? 'bg-orange-100 text-[#FF5C00]' : muted ? 'bg-slate-50 text-slate-400' : 'bg-slate-100 text-slate-600'
        }`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className={`text-sm ${highlight ? 'font-black' : 'font-semibold'}`}>{label}</p>
          {sub && <p className="text-[11px] mt-0.5">{sub}</p>}
        </div>
      </div>
      <p className={`font-${highlight ? 'black' : 'bold'} text-sm sm:text-base`}>{fmtMoney(amount, currency)}</p>
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
      .then((r) => setItems(r.data))
      .catch((e) => setErr(formatError(e)));
  }, [tenant.id]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" data-testid="kiosk-history-modal">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col animate-slide-up">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
              <ClockIcon className="w-5 h-5 text-[#FF5C00]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-black text-slate-900">Betalingsgeschiedenis</h3>
              <p className="text-xs text-slate-500 truncate">Appt. {apartment?.number}</p>
            </div>
          </div>
          <button onClick={onClose} data-testid="history-close"
            className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {err && <p className="text-red-500 text-sm py-4">{err}</p>}
          {!items && !err && (
            <div className="py-10 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#FF5C00]" /></div>
          )}
          {items && items.length === 0 && (
            <div className="py-10 text-center text-slate-400">
              <Receipt className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p>Nog geen betalingen voor deze huurder.</p>
            </div>
          )}
          {items && items.map((p) => (
            <div key={p.id} className="py-3 border-b border-slate-100 last:border-0 flex items-start gap-3">
              <Check className="w-5 h-5 text-emerald-500 mt-1 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-black text-slate-900">{fmtMoney(p.amount, p.currency)}</p>
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-orange-100 text-[#C74600]">{p.category}</span>
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
                className="px-3 h-9 rounded-lg bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold text-xs flex items-center gap-1.5 shrink-0">
                <Printer className="w-3.5 h-3.5" /> Afdruk
              </button>
            </div>
          ))}
        </div>
        <div className="px-6 py-4 border-t border-slate-100">
          <button onClick={onClose}
            className="w-full h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Pay step — checklist + numeric keypad (old ERP style)
// =====================================================================
function PaySelect({ overview, onBack, onConfirm }) {
  const { tenant, apartment: apt, balance, internet, total_due } = overview;
  const openRent = balance.balance > 0 ? balance.balance : 0;

  const items = useMemo(() => [
    { key: 'huur', label: 'Huur', icon: Home, amount: openRent > 0 ? openRent : apt.rent_amount },
    { key: 'servicekosten', label: 'Servicekosten', icon: FileText, amount: 0 },
    { key: 'boete', label: 'Boetes', icon: AlertCircle, amount: 0 },
    { key: 'internet', label: 'Internet', icon: Wifi, amount: Number(internet || 0) },
  ], [apt.rent_amount, openRent, internet]);

  const [selected, setSelected] = useState(() => new Set(['huur']));
  const [amount, setAmount] = useState(items[0].amount.toFixed(2));
  const [typing, setTyping] = useState(false);  // true zodra gebruiker zelf op keypad drukt

  // Whenever selection changes, sync amount to selected total (user can override on keypad).
  const selectedTotal = useMemo(
    () => items.filter((i) => selected.has(i.key)).reduce((s, i) => s + (Number(i.amount) || 0), 0),
    [items, selected]
  );
  useEffect(() => { setAmount(selectedTotal.toFixed(2)); setTyping(false); }, [selectedTotal]);

  const toggle = (key) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const press = (k) => {
    setAmount((cur) => {
      // Eerste keypad-druk na auto-fill wist het bedrag.
      const base = typing ? cur : '0';
      if (k === 'DEL') return base.length <= 1 ? '0' : base.slice(0, -1);
      if (k === '.') return base.includes('.') ? base : base + '.';
      if (base === '0' || base === '0.00') return k;
      return base + k;
    });
    setTyping(true);
  };

  const amountNum = parseFloat(amount) || 0;
  const primaryCategory = selected.has('huur') ? 'huur'
    : selected.has('servicekosten') ? 'servicekosten'
    : selected.has('boete') ? 'boete'
    : selected.has('internet') ? 'internet' : 'overig';

  const canContinue = amountNum > 0 && selected.size > 0;

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack} data-testid="pay-back"
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold backdrop-blur-sm">
            <ArrowLeft className="w-5 h-5" /> Terug
          </button>
          <h2 className="text-base sm:text-xl font-black text-white tracking-tight">Wat wilt u betalen?</h2>
          <div className="w-20" />
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          {/* Checklist links */}
          <div className="bg-white rounded-3xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.25)] p-4 sm:p-6 space-y-2">
            {items.map((it) => {
              const isOn = selected.has(it.key);
              const Icon = it.icon;
              return (
                <button key={it.key} onClick={() => toggle(it.key)}
                  data-testid={`pay-item-${it.key}`}
                  className={`w-full flex items-center justify-between gap-3 p-4 rounded-2xl border-2 transition-all text-left ${
                    isOn
                      ? 'border-[#FF5C00] bg-orange-50'
                      : 'border-slate-100 hover:border-slate-300'
                  }`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 ${
                      isOn ? 'border-[#FF5C00] bg-[#FF5C00] text-white' : 'border-slate-300'
                    }`}>
                      {isOn && <Check className="w-4 h-4" strokeWidth={3} />}
                    </div>
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isOn ? 'bg-white text-[#FF5C00]' : 'bg-slate-50 text-slate-400'}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <p className={`font-bold ${isOn ? 'text-slate-900' : 'text-slate-500'}`}>{it.label}</p>
                  </div>
                  <p className={`font-black ${isOn ? 'text-slate-900' : 'text-slate-400'}`}>{fmtMoney(it.amount, apt.currency)}</p>
                </button>
              );
            })}

            <button onClick={() => onConfirm({
              tenant_id: tenant.id, apartment_id: apt.id,
              amount: amountNum, currency: apt.currency,
              category: primaryCategory, method: 'contant',
              period_month: primaryCategory === 'huur' && balance.next_period ? balance.next_period.month : null,
              period_year: primaryCategory === 'huur' && balance.next_period ? balance.next_period.year : null,
            })}
              disabled={!canContinue}
              data-testid="pay-continue"
              className="w-full mt-4 h-14 bg-[#FF5C00] hover:bg-[#E05200] text-white text-base sm:text-lg font-black rounded-2xl shadow-[0_15px_30px_-10px_rgba(255,92,0,0.5)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              Volgende — {fmtMoney(amountNum, apt.currency)} <ArrowRight className="w-5 h-5" />
            </button>
          </div>

          {/* Keypad rechts */}
          <div className="bg-white rounded-3xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.25)] p-4 sm:p-6 flex flex-col">
            <div className="mb-3">
              <p className="text-sm font-bold text-slate-900">Bedrag invoeren</p>
              <p className="text-xs text-slate-500">Totaal openstaand: {fmtMoney(total_due, balance.currency)}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-5 mb-3 text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{apt.currency}</p>
              <p className="text-4xl sm:text-5xl font-black text-slate-900 tabular-nums mt-1" data-testid="pay-amount-display">
                {amount}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 flex-1">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'DEL'].map((k) => (
                <button key={k} onClick={() => press(k)}
                  data-testid={`keypad-${k}`}
                  className={`aspect-square rounded-2xl text-2xl font-black flex items-center justify-center transition-all ${
                    k === 'DEL'
                      ? 'bg-red-50 hover:bg-red-100 text-red-600'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-900'
                  } active:scale-95`}>
                  {k}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Payment method select — Contant / Mope / Uni5Pay
// =====================================================================
function MethodSelect({ payload, onBack, onConfirm }) {
  const methods = [
    { v: 'contant', l: 'Contant', sub: 'Betaal met contant geld', icon: Banknote, accent: 'emerald' },
    { v: 'mope', l: 'Mope', sub: 'Scan QR-code', icon: QrCode, accent: 'emerald' },
    { v: 'uni5pay', l: 'Uni5Pay', sub: 'Scan QR-code', icon: Smartphone, accent: 'red' },
  ];
  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack} data-testid="method-back"
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold backdrop-blur-sm">
            <ArrowLeft className="w-5 h-5" /> Terug
          </button>
          <h2 className="text-base sm:text-xl font-black text-white tracking-tight">
            Hoe wilt u betalen? <span className="font-bold text-white/80 ml-2">{fmtMoney(payload.amount, payload.currency)}</span>
          </h2>
          <div className="w-20" />
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mt-10">
          {methods.map((m) => {
            const Icon = m.icon;
            return (
              <button key={m.v} onClick={() => onConfirm({ ...payload, method: m.v })}
                data-testid={`method-${m.v}`}
                className="bg-white rounded-3xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.25)] p-8 text-center hover:scale-[1.03] active:scale-[0.99] transition-transform aspect-[3/5] flex flex-col items-center justify-center">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-5 ${
                  m.accent === 'red' ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-500'
                }`}>
                  <Icon className="w-10 h-10" />
                </div>
                <p className="text-2xl font-black text-slate-900">{m.l}</p>
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
    <div className="h-full overflow-y-auto p-4 sm:p-8">
      <div className="max-w-xl mx-auto">
        <button onClick={onBack} data-testid="confirm-back"
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold backdrop-blur-sm mb-4">
          <ArrowLeft className="w-5 h-5" /> Terug
        </button>
        <div className="bg-white rounded-3xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.25)] p-6 sm:p-8">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-1">Bevestig betaling</h2>
          <p className="text-sm text-slate-500 mb-6">Controleer voordat u doorgaat</p>

          <div className="bg-gradient-to-br from-[#FF8A3D] via-[#FF5C00] to-[#C74600] rounded-3xl p-6 mb-5 text-white text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-white/80">Te betalen</p>
            <p className="text-5xl font-black tracking-tighter mt-2">{fmtMoney(payload.amount, payload.currency)}</p>
            <p className="text-sm text-white/90 mt-2 capitalize">{payload.category}{payload.period_month ? ` · ${MONTHS_NL[payload.period_month - 1]} ${payload.period_year}` : ''}</p>
          </div>

          <div className="space-y-2 mb-5">
            <Row label="Huurder" value={tenant.name} />
            <Row label="Appartement" value={`Appt. ${apt.number}`} />
            <Row label="Betaalwijze" value={String(payload.method || '').toUpperCase()} />
          </div>

          {err && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm">{err}</div>}

          <button onClick={submit} disabled={loading} data-testid="confirm-submit"
            className="w-full h-16 bg-emerald-500 hover:bg-emerald-600 text-white text-xl font-black rounded-2xl flex items-center justify-center gap-3 shadow-[0_20px_40px_-10px_rgba(16,185,129,0.5)] disabled:opacity-50">
            {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <ShieldCheck className="w-6 h-6" />}
            Bevestig betaling
          </button>
        </div>
      </div>
    </div>
  );
}
function Row({ label, value }) {
  return (
    <div className="flex justify-between items-center bg-slate-50 rounded-xl p-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-bold text-slate-900">{value}</span>
    </div>
  );
}

function ReceiptScreen({ payment, onDone }) {
  return (
    <div className="h-full overflow-y-auto p-4 sm:p-8">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-3xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.25)] p-6 sm:p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <Check className="w-12 h-12 text-emerald-600" strokeWidth={3} />
          </div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Bedankt!</h2>
          <p className="text-base text-slate-500 mb-6">Uw betaling is succesvol verwerkt</p>

          <div className="bg-slate-50 rounded-2xl p-5 mb-5 text-left border-2 border-dashed border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Kwitantie</p>
                <p className="font-mono text-base font-black text-slate-900">{payment.receipt_number}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF8A3D] to-[#C74600] p-1.5">
                <img src="/kiosk-icons/kiosk-512.png" alt="logo" className="w-full h-full object-contain" />
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Huurder</span><span className="font-bold text-slate-900">{payment.tenant_name}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Appartement</span><span className="font-bold text-slate-900">{payment.apartment_number || '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Categorie</span><span className="font-bold text-slate-900 capitalize">{payment.category}</span></div>
              {payment.period_month && (
                <div className="flex justify-between"><span className="text-slate-500">Periode</span><span className="font-bold text-slate-900 capitalize">{MONTHS_NL[payment.period_month - 1]} {payment.period_year}</span></div>
              )}
              <div className="flex justify-between"><span className="text-slate-500">Methode</span><span className="font-bold text-slate-900 capitalize">{payment.method}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Datum</span><span className="font-bold text-slate-900">{new Date(payment.paid_at).toLocaleString('nl-NL')}</span></div>
              {payment.approved_by && <div className="flex justify-between"><span className="text-slate-500">Goedgekeurd door</span><span className="font-bold text-slate-900">{payment.approved_by}</span></div>}
              <div className="flex justify-between pt-2 border-t border-dashed border-slate-200 mt-2">
                <span className="text-slate-500 font-bold">Totaal</span>
                <span className="font-black text-slate-900 text-lg">{fmtMoney(payment.amount, payment.currency)}</span>
              </div>
            </div>
          </div>

          <button onClick={onDone} data-testid="receipt-done"
            className="w-full h-14 bg-[#FF5C00] hover:bg-[#E05200] text-white text-lg font-black rounded-2xl shadow-[0_15px_30px_-10px_rgba(255,92,0,0.5)]">
            Klaar
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Main
// =====================================================================
export default function KioskLayout() {
  const navigate = useNavigate();
  const [step, setStep] = useState('check');
  const [location, setLocation] = useState(null);
  const [apartment, setApartment] = useState(null);
  const [overview, setOverview] = useState(null);
  const [paymentPayload, setPaymentPayload] = useState(null);
  const [paymentResult, setPaymentResult] = useState(null);
  const [company, setCompany] = useState(getKioskCompany());

  useEffect(() => {
    document.title = 'Vastgoed Kiosk';
    const tok = localStorage.getItem('kiosk_token');
    if (!tok) {
      navigate('/login', { replace: true });
      return;
    }
    setCompany(getKioskCompany());
    setStep('welcome');
  }, [navigate]);

  const exit = useCallback(() => {
    localStorage.removeItem('kiosk_token');
    localStorage.removeItem('kiosk_company');
    navigate('/login', { replace: true });
  }, [navigate]);

  const adminMode = useCallback(() => {
    // Switch to admin login (keep kiosk token though, in case user comes back).
    navigate('/login', { replace: true });
  }, [navigate]);

  const reset = () => {
    setLocation(null); setApartment(null); setOverview(null);
    setPaymentPayload(null); setPaymentResult(null);
    setStep('welcome');
  };

  const skipLocation = useCallback(() => {
    setLocation(null);
    setStep('select');
  }, []);

  return (
    <div className="kiosk-fullscreen flex flex-col bg-gradient-to-b from-[#FF5C00] to-[#C74600]" data-testid="kiosk-root">
      <div className="flex-1 min-h-0 relative">
        <AnimatePresence mode="wait">
          <motion.div key={step} variants={variants}
            initial="enter" animate="center" exit="exit"
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="absolute inset-0 overflow-hidden">
            {step === 'check' && (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-white animate-spin" />
              </div>
            )}
            {step === 'welcome' && <Welcome onStart={() => setStep('locations')} />}
            {step === 'locations' && (
              <LocationSelect onBack={() => setStep('welcome')}
                onSelect={(loc) => { setLocation(loc.id === '_none' ? { id: '_none', name: 'Overige' } : loc); setStep('select'); }}
                onSkip={skipLocation} />
            )}
            {step === 'select' && (
              <ApartmentSelect location={location}
                onBack={() => setStep(location ? 'locations' : 'welcome')}
                onSelect={(a) => { setApartment(a); setStep('overview'); }} />
            )}
            {step === 'overview' && apartment && (
              <TenantOverview apartment={apartment} onBack={() => setStep('select')}
                onPay={(d) => { setOverview(d); setStep('pay'); }} />
            )}
            {step === 'pay' && overview && (
              <PaySelect overview={overview} onBack={() => setStep('overview')}
                onConfirm={(p) => { setPaymentPayload(p); setStep('method'); }} />
            )}
            {step === 'method' && paymentPayload && (
              <MethodSelect payload={paymentPayload} onBack={() => setStep('pay')}
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
      </div>
      <KioskFooter company={company} apartment={apartment} onAdmin={adminMode} onExit={exit} />
    </div>
  );
}
