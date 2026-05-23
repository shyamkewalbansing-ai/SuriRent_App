import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle2, Wallet, Home as HomeIcon, FileText, Wifi,
  CreditCard, Banknote, Smartphone, Loader2,
} from 'lucide-react';
import { api, fmtMoney, MONTHS_NL } from '../../lib/api';
import {
  detectCompanySlug, fetchBrandingByHost, applyBranding, resolveLogoUrl,
} from '../../lib/branding';

const POLL_MS = 1500;

// =====================================================================
// Idle / welkom-scherm
// =====================================================================
function IdleScreen({ branding }) {
  return (
    <motion.div key="idle"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="absolute inset-0 flex flex-col items-center justify-center text-white"
      data-testid="cd-idle">
      <motion.div
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        className="w-36 h-36 sm:w-44 sm:h-44 rounded-3xl bg-white/95 shadow-2xl flex items-center justify-center p-4 mb-8">
        {branding?.logo_url ? (
          <img src={resolveLogoUrl(branding.logo_url)} alt="logo" className="w-full h-full object-contain" />
        ) : (
          <HomeIcon className="w-20 h-20" style={{ color: branding?.primary_color || '#FF5C00' }} strokeWidth={2.4} />
        )}
      </motion.div>
      <p className="text-[11px] sm:text-sm font-black uppercase tracking-[0.32em] text-white/85">
        WELKOM BIJ
      </p>
      <h1 className="text-5xl sm:text-7xl font-black tracking-tight mt-2 text-center px-4">
        {branding?.app_name || branding?.name || 'Vastgoed Kiosk'}
      </h1>
      {branding?.tagline && (
        <p className="text-base sm:text-lg text-white/85 mt-4 text-center max-w-2xl px-4">
          {branding.tagline}
        </p>
      )}
      <p className="text-xs sm:text-sm text-white/70 mt-10 font-bold uppercase tracking-widest">
        Een medewerker helpt u zo
      </p>
    </motion.div>
  );
}

// =====================================================================
// Hero-stijl welkom voor geselecteerde huurder
// =====================================================================
function GreetScreen({ state, branding }) {
  const apt = state.apartment;
  const tenant = state.tenant;
  return (
    <motion.div key="greet"
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
      className="absolute inset-0 flex flex-col items-center justify-center text-white p-8"
      data-testid="cd-greet">
      <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-white/95 shadow-2xl flex items-center justify-center p-3 mb-6">
        {branding?.logo_url ? (
          <img src={resolveLogoUrl(branding.logo_url)} alt="logo" className="w-full h-full object-contain" />
        ) : (
          <HomeIcon className="w-14 h-14" style={{ color: branding?.primary_color || '#FF5C00' }} strokeWidth={2.4} />
        )}
      </div>
      <p className="text-[10px] sm:text-sm font-black uppercase tracking-[0.32em] text-white/85">WELKOM</p>
      <h1 className="text-5xl sm:text-7xl font-black tracking-tight mt-2 text-center">
        {tenant?.name || 'Gewaardeerde huurder'}
      </h1>
      {apt?.number && (
        <p className="mt-5 text-2xl sm:text-3xl font-bold text-white/95 px-5 py-2 rounded-2xl bg-white/15">
          Appartement {apt.number}
        </p>
      )}
      {apt?.address && (
        <p className="mt-3 text-sm sm:text-base text-white/80">{apt.address}</p>
      )}
    </motion.div>
  );
}

// =====================================================================
// Financieel overzicht — exact zoals admin kiosk
// =====================================================================
function OverviewScreen({ state }) {
  const overview = state.overview || {};
  const balance = overview.balance || {};
  const apt = overview.apartment || state.apartment || {};
  const tenant = state.tenant || {};
  const internet = Number(tenant.internet_amount || overview.internet || 0);
  const openRent = (balance.balance || 0) > 0 ? balance.balance : 0;
  const totalDue = Number(overview.total_due || (openRent + internet) || 0);
  const cur = balance.currency || apt.currency || 'SRD';

  const items = [
    { key: 'rent', label: 'Maandhuur', value: apt.rent_amount || 0, icon: HomeIcon },
    ...(openRent > 0 ? [{
      key: 'open', label: 'Openstaande huur', value: openRent, icon: Wallet, highlight: true,
      sub: balance.next_period ? `${MONTHS_NL[balance.next_period.month - 1]} ${balance.next_period.year}` : '',
    }] : []),
    { key: 'svc', label: 'Servicekosten', value: 0, icon: FileText, muted: true },
    { key: 'fines', label: 'Boetes', value: 0, icon: FileText, muted: true },
    { key: 'internet', label: 'Internet', value: internet, icon: Wifi, muted: internet === 0 },
  ];

  return (
    <motion.div key="overview"
      initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.35 }}
      className="absolute inset-0 flex flex-col p-6 sm:p-10"
      data-testid="cd-overview">
      <div className="text-white mb-4 sm:mb-6">
        <p className="text-[10px] sm:text-xs font-black uppercase tracking-[0.3em] text-white/85">
          Financieel overzicht voor
        </p>
        <h2 className="text-3xl sm:text-5xl font-black tracking-tight">{tenant.name || apt.tenant_name}</h2>
        {apt.number && <p className="text-base sm:text-lg text-white/85 mt-1">Appartement {apt.number}</p>}
      </div>
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-5">
        <div className="lg:col-span-3 bg-white rounded-3xl shadow-2xl p-5 sm:p-7 flex flex-col">
          <h3 className="text-lg sm:text-xl font-black text-slate-900 mb-3">Specificatie</h3>
          <div className="flex-1 divide-y divide-slate-100">
            {items.map((it) => {
              const Icon = it.icon;
              const cls = it.highlight ? 'text-[#FF5C00]' : it.muted ? 'text-slate-400' : 'text-slate-900';
              return (
                <div key={it.key} className={`flex items-center justify-between py-3 sm:py-4 ${cls}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      it.highlight ? 'bg-orange-100 text-[#FF5C00]'
                        : it.muted ? 'bg-slate-50 text-slate-300'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-base sm:text-lg ${it.highlight ? 'font-black' : 'font-bold'}`}>{it.label}</p>
                      {it.sub && <p className="text-xs sm:text-sm mt-0.5 text-slate-500">{it.sub}</p>}
                    </div>
                  </div>
                  <p className={`text-base sm:text-xl ${it.highlight ? 'font-black' : 'font-bold'}`}>
                    {fmtMoney(it.value, cur)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
        <div className={`lg:col-span-2 rounded-3xl shadow-2xl p-6 sm:p-8 flex flex-col items-center justify-center text-center ${
          totalDue > 0 ? 'bg-white' : 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white'
        }`}>
          <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center mb-4 ${
            totalDue > 0 ? 'bg-orange-100 text-[#FF5C00]' : 'bg-white/20 text-white'
          }`}>
            {totalDue > 0 ? <Wallet className="w-10 h-10" /> : <CheckCircle2 className="w-12 h-12" />}
          </div>
          <p className={`text-xs sm:text-sm font-black uppercase tracking-[0.25em] ${
            totalDue > 0 ? 'text-slate-400' : 'text-white/90'
          }`}>
            {totalDue > 0 ? 'Te betalen' : 'Volledig bij'}
          </p>
          <p className={`text-5xl sm:text-7xl font-black tracking-tight mt-2 mb-2 ${
            totalDue > 0 ? 'text-slate-900' : 'text-white'
          }`} data-testid="cd-total-due">
            {fmtMoney(totalDue, cur)}
          </p>
          <p className={`text-sm sm:text-base ${totalDue > 0 ? 'text-slate-500' : 'text-white/90'}`}>
            {totalDue > 0 ? 'De medewerker bereidt uw betaling voor…' : 'U heeft geen openstaand bedrag.'}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// =====================================================================
// PaySelect — checklist + lopend totaal
// =====================================================================
function PayScreen({ state }) {
  const payload = state.payload || {};
  const cats = payload.categories || [];
  const cur = payload.currency || 'SRD';
  const amt = Number(payload.amount || 0);

  const labels = {
    huur: 'Huur', servicekosten: 'Servicekosten',
    boete: 'Boetes', internet: 'Internet', overig: 'Overig',
  };

  return (
    <motion.div key="pay"
      initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.35 }}
      className="absolute inset-0 flex flex-col items-center justify-center p-6 sm:p-10 text-white"
      data-testid="cd-pay">
      <p className="text-[10px] sm:text-xs font-black uppercase tracking-[0.3em] text-white/85 mb-2">U betaalt zo</p>
      <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl p-6 sm:p-10">
        <p className="text-sm font-black uppercase tracking-widest text-slate-400">Onderdelen</p>
        <ul className="mt-3 space-y-2">
          {cats.length === 0 && <li className="text-slate-400 text-base">Nog geen onderdeel geselecteerd…</li>}
          {cats.map((c) => (
            <li key={c.key || c.label} className="flex items-center justify-between bg-slate-50 rounded-2xl px-4 py-3">
              <span className="text-lg sm:text-xl font-bold text-slate-800">{labels[c.key] || c.label || c.key}</span>
              <span className="text-lg sm:text-xl font-black text-slate-900">{fmtMoney(c.value || c.amount || 0, cur)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6 border-t-2 border-slate-200 pt-4 flex items-center justify-between">
          <p className="text-xl sm:text-2xl font-black text-slate-700">Totaal</p>
          <p className="text-4xl sm:text-6xl font-black text-[#FF5C00] tracking-tight" data-testid="cd-pay-total">
            {fmtMoney(amt, cur)}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// =====================================================================
// MethodSelect
// =====================================================================
function MethodScreen({ state }) {
  const payload = state.payload || {};
  const cur = payload.currency || 'SRD';
  const amt = Number(payload.amount || 0);
  const method = (payload.method || '').toLowerCase();
  const ICONS = { contant: Banknote, bank: CreditCard, mope: Smartphone, sumup: CreditCard, uni5pay: Smartphone };
  const LABELS = { contant: 'Contant', bank: 'Bankoverschrijving', mope: 'Mope', sumup: 'SumUp', uni5pay: 'Uni5Pay' };
  const Icon = ICONS[method] || CreditCard;

  return (
    <motion.div key="method"
      initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.35 }}
      className="absolute inset-0 flex flex-col items-center justify-center p-6 sm:p-10 text-white"
      data-testid="cd-method">
      <p className="text-[10px] sm:text-xs font-black uppercase tracking-[0.3em] text-white/85 mb-3">
        Bevestig uw betaling
      </p>
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl p-8 sm:p-12 text-center">
        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-orange-100 text-[#FF5C00] flex items-center justify-center mx-auto mb-5">
          <Icon className="w-12 h-12 sm:w-14 sm:h-14" strokeWidth={2.2} />
        </div>
        <p className="text-base sm:text-xl font-bold text-slate-500 uppercase tracking-widest">Betaalmethode</p>
        <p className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight mt-1">{LABELS[method] || method || '—'}</p>
        <div className="my-7 h-px bg-slate-100" />
        <p className="text-xs sm:text-sm font-black uppercase tracking-widest text-slate-400">Bedrag</p>
        <p className="text-5xl sm:text-7xl font-black text-[#FF5C00] tracking-tight mt-1" data-testid="cd-method-total">
          {fmtMoney(amt, cur)}
        </p>
      </div>
    </motion.div>
  );
}

// =====================================================================
// Receipt — succes-scherm
// =====================================================================
function ReceiptScreen({ state }) {
  const p = state.payment || {};
  const cur = p.currency || 'SRD';
  const amt = Number(p.amount || 0);
  return (
    <motion.div key="receipt"
      initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 180, damping: 20 }}
      className="absolute inset-0 flex flex-col items-center justify-center p-6 sm:p-10"
      data-testid="cd-receipt">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl p-8 sm:p-12 text-center">
        <motion.div
          initial={{ scale: 0 }} animate={{ scale: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 200, damping: 15 }}
          className="w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
          <CheckCircle2 className="w-16 h-16 sm:w-20 sm:h-20 text-emerald-500" strokeWidth={2.5} />
        </motion.div>
        <p className="text-base sm:text-xl font-bold text-emerald-600 uppercase tracking-widest">Betaling gelukt</p>
        <p className="text-5xl sm:text-7xl font-black text-slate-900 tracking-tight mt-3">{fmtMoney(amt, cur)}</p>
        {p.receipt_number && (
          <p className="text-sm sm:text-base text-slate-500 mt-4">
            Kwitantienummer <span className="font-black text-slate-700">{p.receipt_number}</span>
          </p>
        )}
        <p className="mt-7 text-sm sm:text-base text-slate-500">Bedankt voor uw betaling!</p>
      </div>
    </motion.div>
  );
}

// =====================================================================
// Container
// =====================================================================
export default function CustomerDisplay() {
  const [searchParams] = useSearchParams();
  const slugParam = (searchParams.get('c') || '').trim().toLowerCase();
  const [slug, setSlug] = useState(slugParam || detectCompanySlug() || '');
  const [data, setData] = useState(null);  // {branding, state}
  const [error, setError] = useState('');
  const [pickerSlug, setPickerSlug] = useState('');

  // Resolve slug via host if not known.
  useEffect(() => {
    if (slug) return;
    let alive = true;
    (async () => {
      const byHost = await fetchBrandingByHost();
      if (alive && byHost?.slug) setSlug(byHost.slug);
    })();
    return () => { alive = false; };
  }, [slug]);

  // Poll every POLL_MS.
  const stopped = useRef(false);
  useEffect(() => {
    stopped.current = false;
    if (!slug) return () => { stopped.current = true; };
    let timer;
    const tick = async () => {
      try {
        const { data: d } = await api.get(`/public/customer-display/${slug}`);
        if (stopped.current) return;
        setData(d);
        if (d?.branding) applyBranding(d.branding);
        setError('');
      } catch (e) {
        if (!stopped.current) {
          setError(e?.response?.status === 404 ? 'Onbekende bedrijfscode' : 'Verbindingsfout');
        }
      }
      if (!stopped.current) timer = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => { stopped.current = true; if (timer) clearTimeout(timer); };
  }, [slug]);

  // Full-screen background bound to brand primary.
  const primary = data?.branding?.primary_color || '#FF5C00';
  useEffect(() => {
    document.title = 'Klantenscherm';
    document.documentElement.style.backgroundColor = primary;
    document.body.style.backgroundColor = primary;
    return () => {
      document.documentElement.style.backgroundColor = '';
      document.body.style.backgroundColor = '';
    };
  }, [primary]);

  if (!slug) {
    // Slug picker — alleen bij eerste opstart op een nieuw klantenscherm.
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-orange-500 p-6">
        <form
          onSubmit={(e) => { e.preventDefault(); const s = pickerSlug.trim().toLowerCase(); if (s) setSlug(s); }}
          className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 text-center"
          data-testid="cd-picker">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Klantenscherm</p>
          <h2 className="text-2xl font-black text-slate-900 mt-2 mb-4">Welk bedrijf?</h2>
          <p className="text-sm text-slate-500 mb-4">
            Voer de bedrijfscode in (bv. <code className="bg-slate-100 px-1 rounded">surirent</code>).
          </p>
          <input value={pickerSlug} onChange={(e) => setPickerSlug(e.target.value)} autoFocus
            placeholder="bedrijfscode"
            data-testid="cd-picker-input"
            className="w-full h-14 px-4 rounded-2xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none text-center text-lg font-bold tracking-wider" />
          <button type="submit" data-testid="cd-picker-submit"
            className="mt-3 w-full h-14 rounded-2xl bg-[#FF5C00] hover:bg-[#E05200] text-white font-black text-base">
            Start klantenscherm
          </button>
        </form>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="fixed inset-0 flex items-center justify-center"
        style={{ background: primary }}>
        <Loader2 className="w-12 h-12 text-white animate-spin" />
        {error && <p className="absolute bottom-10 text-white/80 font-bold text-sm">{error}</p>}
      </div>
    );
  }

  const step = data?.state?.step || 'idle';
  const stateForRender = data?.state || {};

  return (
    <div className="fixed inset-0 overflow-hidden"
      style={{
        background: `linear-gradient(155deg, ${primary} 0%, ${primary} 55%, rgba(0,0,0,0.18) 100%), ${primary}`,
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
      data-testid="cd-root">
      <AnimatePresence mode="wait">
        {(step === 'idle' || step === 'check') && <IdleScreen branding={data.branding} />}
        {step === 'select' && <GreetScreen state={stateForRender} branding={data.branding} />}
        {step === 'overview' && <OverviewScreen state={stateForRender} />}
        {step === 'pay' && <PayScreen state={stateForRender} />}
        {(step === 'method' || step === 'confirm') && <MethodScreen state={stateForRender} />}
        {step === 'receipt' && <ReceiptScreen state={stateForRender} />}
      </AnimatePresence>

      {/* Tiny footer met bedrijfsnaam */}
      <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-white/70 text-xs font-bold pointer-events-none">
        <span data-testid="cd-footer-company">{data.branding?.name}</span>
        <span className="uppercase tracking-widest">Klantenscherm</span>
      </div>
    </div>
  );
}
