import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import {
  CheckCircle2, Wallet, Home as HomeIcon, FileText, Wifi,
  CreditCard, Banknote, Loader2, ChevronRight, QrCode,
} from 'lucide-react';
import { api, fmtMoney, MONTHS_NL } from '../../lib/api';
import {
  detectCompanySlug, fetchBrandingByHost, applyBranding, resolveLogoUrl,
} from '../../lib/branding';

const POLL_MS = 500;
const BROADCAST_CHANNEL = 'surirent-customer-display';

// Tailwind-vrije fluid-clamp utility (px), responsive zonder breakpoint-explosies.
const clamp = (min, vw, max) => `clamp(${min}px, ${vw}vw, ${max}px)`;

// =====================================================================
// Idle / welkom-scherm — werkt op mobile portrait t/m 4K TV
// =====================================================================
function IdleScreen({ branding }) {
  return (
    <motion.div key="idle"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="absolute inset-0 flex flex-col items-center justify-center text-white text-center px-4"
      data-testid="cd-idle">
      <motion.div
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        className="rounded-3xl bg-white/95 shadow-2xl flex items-center justify-center p-4 mb-6"
        style={{ width: clamp(96, 18, 200), height: clamp(96, 18, 200) }}>
        {branding?.logo_url ? (
          <img src={resolveLogoUrl(branding.logo_url)} alt="logo" className="w-full h-full object-contain" />
        ) : (
          <HomeIcon style={{ width: '60%', height: '60%', color: branding?.primary_color || '#FF5C00' }} strokeWidth={2.4} />
        )}
      </motion.div>
      <p className="font-black uppercase tracking-[0.32em] text-white/85"
        style={{ fontSize: clamp(10, 1.2, 18) }}>WELKOM BIJ</p>
      <h1 className="font-black tracking-tight mt-2 px-2 leading-[1.05]"
        style={{ fontSize: clamp(34, 6.5, 110) }}>
        {branding?.app_name || branding?.name || 'Vastgoed Kiosk'}
      </h1>
      {branding?.tagline && (
        <p className="text-white/85 mt-3 max-w-3xl"
          style={{ fontSize: clamp(13, 1.6, 22) }}>{branding.tagline}</p>
      )}
      <p className="text-white/70 mt-8 font-bold uppercase tracking-widest"
        style={{ fontSize: clamp(10, 1.1, 16) }}>
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
      className="absolute inset-0 flex flex-col items-center justify-center text-white px-4 text-center"
      data-testid="cd-greet">
      <div className="rounded-2xl bg-white/95 shadow-2xl flex items-center justify-center p-3 mb-5"
        style={{ width: clamp(72, 12, 140), height: clamp(72, 12, 140) }}>
        {branding?.logo_url ? (
          <img src={resolveLogoUrl(branding.logo_url)} alt="logo" className="w-full h-full object-contain" />
        ) : (
          <HomeIcon style={{ width: '60%', height: '60%', color: branding?.primary_color || '#FF5C00' }} strokeWidth={2.4} />
        )}
      </div>
      <p className="font-black uppercase tracking-[0.32em] text-white/85"
        style={{ fontSize: clamp(10, 1.2, 18) }}>WELKOM</p>
      <h1 className="font-black tracking-tight mt-2 leading-[1.05] max-w-[95vw]"
        style={{ fontSize: clamp(30, 5.8, 100) }}>
        {tenant?.name || 'Gewaardeerde huurder'}
      </h1>
      {apt?.number && (
        <p className="mt-4 font-bold text-white/95 px-4 py-1.5 rounded-2xl bg-white/15"
          style={{ fontSize: clamp(16, 2.2, 38) }}>
          Appartement {apt.number}
        </p>
      )}
      {apt?.address && (
        <p className="mt-2 text-white/80" style={{ fontSize: clamp(12, 1.4, 20) }}>{apt.address}</p>
      )}
    </motion.div>
  );
}

// =====================================================================
// Overview screen — split-screen + responsive
// =====================================================================
function OverviewScreen({ state, slug }) {
  const overview = state.overview || {};
  const balance = overview.balance || {};
  const apt = overview.apartment || state.apartment || {};
  const tenant = state.tenant || {};
  const internet = Number(tenant.internet_amount || overview.internet || 0);
  const openRent = (balance.balance || 0) > 0 ? balance.balance : 0;
  const totalDue = Number(overview.total_due || (openRent + internet) || 0);
  const cur = balance.currency || apt.currency || 'SRD';
  const hasBalance = totalDue > 0;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const startPayment = async () => {
    if (busy || !slug) return;
    setBusy(true); setErr('');
    try {
      await api.post(`/public/customer-display/${slug}/start-payment`);
      // De polling/broadcast updates het scherm automatisch naar 'method'.
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Kon betaling niet starten');
      setBusy(false);
    }
  };

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
      initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 flex flex-col p-3 sm:p-6 lg:p-10"
      data-testid="cd-overview">
      <div className="text-white mb-3 sm:mb-5 px-1">
        <p className="font-black uppercase tracking-[0.3em] text-white/85"
          style={{ fontSize: clamp(9, 0.9, 14) }}>
          Financieel overzicht voor
        </p>
        <h2 className="font-black tracking-tight leading-tight"
          style={{ fontSize: clamp(22, 3.6, 56) }}>
          {tenant.name || apt.tenant_name}
        </h2>
        {apt.number && <p className="text-white/85 mt-0.5"
          style={{ fontSize: clamp(12, 1.3, 20) }}>Appartement {apt.number}</p>}
      </div>
      <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-5 gap-3 sm:gap-4 overflow-hidden">
        {/* LEFT — line items */}
        <div className="lg:col-span-3 bg-white rounded-2xl sm:rounded-3xl shadow-2xl p-3 sm:p-5 lg:p-7 flex flex-col min-h-0 overflow-hidden">
          <h3 className="font-black text-slate-900 mb-2 sm:mb-3"
            style={{ fontSize: clamp(14, 1.4, 22) }}>Specificatie</h3>
          <div className="flex-1 divide-y divide-slate-100 overflow-auto">
            {items.map((it) => {
              const Icon = it.icon;
              const cls = it.highlight ? 'text-[#FF5C00]' : it.muted ? 'text-slate-400' : 'text-slate-900';
              return (
                <div key={it.key} className={`flex items-center justify-between py-2 sm:py-3 ${cls}`}>
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <div className={`rounded-xl flex items-center justify-center shrink-0 ${
                      it.highlight ? 'bg-orange-100 text-[#FF5C00]'
                        : it.muted ? 'bg-slate-50 text-slate-300'
                        : 'bg-slate-100 text-slate-500'
                    }`} style={{ width: clamp(28, 3, 44), height: clamp(28, 3, 44) }}>
                      <Icon style={{ width: '55%', height: '55%' }} />
                    </div>
                    <div className="min-w-0">
                      <p className={`${it.highlight ? 'font-black' : 'font-bold'} truncate`}
                        style={{ fontSize: clamp(13, 1.3, 22) }}>{it.label}</p>
                      {it.sub && <p className="text-slate-500 truncate"
                        style={{ fontSize: clamp(10, 0.85, 14) }}>{it.sub}</p>}
                    </div>
                  </div>
                  <p className={`shrink-0 ${it.highlight ? 'font-black' : 'font-bold'} whitespace-nowrap`}
                    style={{ fontSize: clamp(13, 1.4, 24) }}>
                    {fmtMoney(it.value, cur)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT — Total */}
        <div className={`lg:col-span-2 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col items-center justify-center text-center p-4 sm:p-6 lg:p-8 ${
          hasBalance ? 'bg-white' : 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white'
        }`}>
          <div className={`rounded-2xl flex items-center justify-center mb-3 sm:mb-4 ${
            hasBalance ? 'bg-orange-100 text-[#FF5C00]' : 'bg-white/20 text-white'
          }`} style={{ width: clamp(48, 5.5, 96), height: clamp(48, 5.5, 96) }}>
            {hasBalance ? <Wallet style={{ width: '55%', height: '55%' }} />
              : <CheckCircle2 style={{ width: '60%', height: '60%' }} strokeWidth={2.4} />}
          </div>
          <p className={`font-black uppercase tracking-[0.25em] ${
            hasBalance ? 'text-slate-400' : 'text-white/90'
          }`} style={{ fontSize: clamp(9, 0.95, 16) }}>
            {hasBalance ? 'Te betalen' : 'Volledig bij'}
          </p>
          <p className={`font-black tracking-tight mt-1 mb-1 whitespace-nowrap ${
            hasBalance ? 'text-slate-900' : 'text-white'
          }`} style={{ fontSize: clamp(28, 5.4, 90) }} data-testid="cd-total-due">
            {fmtMoney(totalDue, cur)}
          </p>
          <p className={`mt-1 px-2 ${hasBalance ? 'text-slate-500' : 'text-white/90'}`}
            style={{ fontSize: clamp(11, 1.2, 16) }}>
            {hasBalance ? 'Tik hieronder om uw betaling te starten' : 'U heeft geen openstaand bedrag.'}
          </p>
          {hasBalance && (
            <>
              <motion.button
                whileTap={{ scale: 0.97 }} whileHover={{ scale: 1.02 }}
                onClick={startPayment} disabled={busy || !slug}
                data-testid="cd-start-payment"
                className="mt-4 sm:mt-5 w-full max-w-xs rounded-2xl bg-gradient-to-r from-[#FF8A3D] to-[#FF5C00] text-white font-black shadow-xl disabled:opacity-60 flex items-center justify-center gap-2 transition active:shadow-md"
                style={{ height: clamp(48, 6, 80), fontSize: clamp(14, 1.6, 24) }}>
                {busy ? <Loader2 className="animate-spin" style={{ width: clamp(18, 1.6, 26), height: clamp(18, 1.6, 26) }} />
                  : <>BETAAL NU <ChevronRight style={{ width: clamp(18, 1.8, 28), height: clamp(18, 1.8, 28) }} /></>}
              </motion.button>
              {err && <p className="mt-2 text-red-500 font-bold"
                style={{ fontSize: clamp(11, 1.0, 14) }}>{err}</p>}
            </>
          )}
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
      initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 flex flex-col items-center justify-center px-4 sm:px-8 text-white"
      data-testid="cd-pay">
      <p className="font-black uppercase tracking-[0.3em] text-white/85 mb-2 text-center"
        style={{ fontSize: clamp(10, 1.0, 16) }}>U betaalt zo</p>
      <div className="w-full max-w-3xl bg-white rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-8 lg:p-10">
        <p className="font-black uppercase tracking-widest text-slate-400"
          style={{ fontSize: clamp(10, 1.0, 16) }}>Onderdelen</p>
        <ul className="mt-2 sm:mt-3 space-y-2">
          {cats.length === 0 && (
            <li className="text-slate-400"
              style={{ fontSize: clamp(13, 1.3, 18) }}>Nog geen onderdeel geselecteerd…</li>
          )}
          {cats.map((c) => (
            <li key={c.key || c.label}
              className="flex items-center justify-between bg-slate-50 rounded-2xl px-3 sm:px-4 py-2 sm:py-3 gap-3">
              <span className="font-bold text-slate-800 truncate"
                style={{ fontSize: clamp(14, 1.5, 22) }}>{labels[c.key] || c.label || c.key}</span>
              <span className="font-black text-slate-900 whitespace-nowrap"
                style={{ fontSize: clamp(14, 1.5, 22) }}>{fmtMoney(c.value || c.amount || 0, cur)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 sm:mt-6 border-t-2 border-slate-200 pt-3 sm:pt-4 flex items-center justify-between gap-3">
          <p className="font-black text-slate-700" style={{ fontSize: clamp(16, 1.8, 30) }}>Totaal</p>
          <p className="font-black text-[#FF5C00] tracking-tight whitespace-nowrap"
            style={{ fontSize: clamp(28, 4.5, 80) }} data-testid="cd-pay-total">
            {fmtMoney(amt, cur)}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// =====================================================================
// Uni5PayQRScreen — toont QR-code zodat klant kan scannen + simulator-knop
// =====================================================================
function Uni5PayQRScreen({ state, slug }) {
  const payload = state.payload || {};
  const cur = payload.mope_currency || payload.currency || 'SRD';
  const amt = Number(payload.mope_amount || payload.amount || 0);
  const paid = !!payload.mope_paid_at;
  const isMock = payload.mope_mode === 'mock';
  const isTest = payload.mope_mode === 'test';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const confirmPaid = async () => {
    if (busy || paid) return;
    setBusy(true); setError('');
    try {
      await api.post(`/public/customer-display/${slug}/mope-confirm`);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Kon bevestiging niet versturen');
      setBusy(false);
    }
  };

  // Als al betaald: toon "Bezig met afronden..." (admin Kiosk maakt het receipt).
  return (
    <motion.div key="mope-qr"
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 flex flex-col items-center justify-center px-3 sm:px-6 lg:px-10 py-4 text-white"
      data-testid="cd-mope-qr">
      <div className="w-full max-w-xl bg-white rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-8 lg:p-10 text-center">
        <p className="font-black uppercase tracking-[0.25em] text-slate-400"
          style={{ fontSize: clamp(10, 1.0, 16) }}>Uni5Pay-betaling</p>
        <p className="font-black text-[#FF5C00] tracking-tight mt-1 mb-3 whitespace-nowrap"
          style={{ fontSize: clamp(28, 4.5, 80) }}>
          {fmtMoney(amt, cur)}
        </p>
        {!paid ? (
          <>
            <div className="mx-auto bg-white p-2 rounded-2xl ring-4 ring-orange-100"
              style={{ width: clamp(200, 32, 460), height: clamp(200, 32, 460) }}>
              <img src={payload.mope_qr} alt="Uni5Pay QR" className="w-full h-full object-contain" />
            </div>
            <p className="font-bold text-slate-700 mt-4"
              style={{ fontSize: clamp(13, 1.5, 22) }}>
              Scan met uw <span className="text-[#FF5C00]">Uni5Pay-app</span>
            </p>
            <p className="text-slate-500 mt-1"
              style={{ fontSize: clamp(11, 1.1, 16) }}>
              Open de Uni5Pay-app, scan deze QR en bevestig de betaling.
            </p>
            {payload.mope_qr_url && payload.mope_qr_url.startsWith('https://') && (
              <a href={payload.mope_qr_url} target="_blank" rel="noopener noreferrer"
                data-testid="cd-mope-open-link"
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FF5C00] text-white font-bold shadow-md hover:bg-[#E05200] transition"
                style={{ fontSize: clamp(11, 1.1, 16) }}>
                Open Uni5Pay-app op dit apparaat →
              </a>
            )}
            {(isMock || isTest) && (
              <>
                <div className="h-px bg-slate-200 my-4" />
                <p className="text-slate-400 font-bold uppercase tracking-widest mb-2"
                  style={{ fontSize: clamp(9, 0.85, 12) }}>
                  {isMock ? 'Test-modus (lokaal)' : 'Test-modus (Uni5Pay-API)'}
                </p>
                {isTest && (
                  <p className="text-slate-500 mb-3" style={{ fontSize: clamp(10, 0.95, 14) }}>
                    Tip: bedrag <b>1,00</b> = open · <b>2,00</b> = gescand · <b>3,00</b> = niet bevestigd · ander = direct betaald.
                  </p>
                )}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={confirmPaid} disabled={busy}
                  data-testid="cd-mope-mock-confirm"
                  className="rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black shadow-lg disabled:opacity-60 flex items-center justify-center gap-2 px-6 transition"
                  style={{ height: clamp(40, 5, 60), fontSize: clamp(12, 1.3, 18) }}>
                  {busy ? <Loader2 className="animate-spin w-5 h-5" /> : '✓ Ik heb betaald (test)'}
                </motion.button>
              </>
            )}
            {error && <p className="text-red-500 font-bold mt-2"
              style={{ fontSize: clamp(11, 1.0, 14) }}>{error}</p>}
          </>
        ) : (
          <>
            <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              className="rounded-full bg-emerald-100 flex items-center justify-center mx-auto my-4"
              style={{ width: clamp(80, 10, 160), height: clamp(80, 10, 160) }}>
              <CheckCircle2 className="text-emerald-500" strokeWidth={2.5}
                style={{ width: '60%', height: '60%' }} />
            </motion.div>
            <p className="font-black text-emerald-600 uppercase tracking-widest"
              style={{ fontSize: clamp(13, 1.4, 22) }}>Betaling ontvangen</p>
            <p className="text-slate-500 mt-2"
              style={{ fontSize: clamp(12, 1.2, 18) }}>
              <Loader2 className="inline-block mr-2 animate-spin text-[#FF5C00]"
                style={{ width: clamp(14, 1.4, 20), height: clamp(14, 1.4, 20) }} />
              Kwitantie wordt gemaakt…
            </p>
          </>
        )}
      </div>
    </motion.div>
  );
}

// =====================================================================
// MethodSelect — klant kiest zelf betaalmethode op het klantenscherm.
// Toont 5 grote tap-tegels; na tap wordt de keuze naar de backend
// gestuurd zodat de admin Kiosk automatisch verder kan.
// =====================================================================
function MethodScreen({ state, slug }) {
  const payload = state.payload || {};
  const cur = payload.currency || 'SRD';
  const amt = Number(payload.amount || 0);
  const chosen = (payload.method || '').toLowerCase();
  // Toon de "U heeft gekozen"-bevestiging ALLEEN wanneer de klant zélf
  // heeft getikt (method_chosen_at gezet). Als admin een methode pre-set
  // had, blijft de tap-grid actief zodat de klant zelf kan kiezen.
  const customerChose = !!payload.method_chosen_at;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ICONS = { contant: Banknote, bank: CreditCard, mope: QrCode, sumup: CreditCard };
  const LABELS = { contant: 'Contant', bank: 'Bankoverschrijving', mope: 'Uni5Pay', sumup: 'SumUp' };
  const SUBS = { contant: 'Betaal contant aan de balie', bank: 'Overschrijving naar bankrekening',
    mope: 'Scan QR-code om te betalen', sumup: 'Kaart of contactloos' };

  const METHODS = [
    { v: 'contant', accent: 'emerald' },
    { v: 'mope', accent: 'emerald' }, // Uni5Pay (label & gateway); 'mope' = legacy DB-string
    { v: 'sumup', accent: 'violet' },
    { v: 'bank', accent: 'amber' },
  ];

  const pick = async (m) => {
    if (busy || customerChose) return;
    setBusy(true); setError('');
    try {
      await api.post(`/public/customer-display/${slug}/select-method`, { method: m });
    } catch (e) {
      setError(e?.response?.data?.detail || 'Kon keuze niet doorgeven');
      setBusy(false);
    }
  };

  // BELANGRIJK: we tonen NIET meer een "U heeft gekozen" overlay wanneer
  // de klant tikt. De keuze wordt visueel gemarkeerd (geselecteerde methode
  // krijgt accent-rand), maar het scherm blijft hetzelfde — methodes links,
  // QR rechts. De medewerker bevestigt aan de kiosk-zijde. Hierdoor kan een
  // per ongeluk geraakte methode niet automatisch een betaling vastleggen.
  // (De oude "U heeft gekozen" flow is uitgeschakeld — operator beslist.)

  // accentMap moet boven de eerste branch staan zodat beide returns hem zien.
  const accentMap = {
    emerald: 'bg-emerald-50 text-emerald-600',
    sky: 'bg-sky-50 text-sky-600',
    violet: 'bg-violet-50 text-violet-600',
    red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-700',
  };

  // GEEN aparte Uni5PayQRScreen meer — de QR staat al permanent rechts in
  // het 2-koloms layout hieronder. Wanneer klant op de QR-card tikt, krijgt
  // hij een oranje ring als visuele feedback, maar het scherm blijft hetzelfde.
  // (Dit voorkomt dat klanten "vastlopen" op een wachtscherm.)

  return (
    <motion.div key="method-pick"
      initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 flex flex-col px-3 sm:px-6 lg:px-10 py-4 text-white"
      data-testid="cd-method-pick">

      {/* TOP: bedrag + status */}
      <div className="text-center mb-3 sm:mb-4">
        <p className="font-black uppercase tracking-[0.3em] text-white/85"
          style={{ fontSize: clamp(10, 1.0, 16) }}>Te betalen</p>
        <p className="font-black text-white tracking-tight whitespace-nowrap"
          style={{ fontSize: clamp(28, 4.4, 72) }} data-testid="cd-method-pick-amount">
          {fmtMoney(amt, cur)}
        </p>
      </div>

      {/* 2-KOLOMS LAYOUT: LINKS andere betaalmethodes, RECHTS Uni5Pay QR.
          Op mobiel stapelt het verticaal (QR boven, methodes onder). */}
      <div className="flex-1 min-h-0 w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 sm:gap-6 lg:gap-10 items-center justify-items-center">

        {/* ===== LINKER KOLOM — andere betaalmethodes ===== */}
        <div className="w-full max-w-md">
          <p className="font-black uppercase tracking-widest text-white/70 mb-3 text-center lg:text-left"
            style={{ fontSize: clamp(10, 1.0, 13) }}>Of kies een andere methode</p>
          <div className="space-y-2 sm:space-y-3">
            {METHODS.filter((m) => m.v !== 'mope').map((m) => {
              const Icon = ICONS[m.v];
              const selected = customerChose && chosen === m.v;
              return (
                <motion.button
                  key={m.v}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => pick(m.v)}
                  disabled={busy}
                  data-testid={`cd-method-${m.v}`}
                  className={`w-full bg-white rounded-2xl sm:rounded-3xl p-3 sm:p-4 lg:p-5 shadow-2xl flex items-center gap-3 sm:gap-4 transition disabled:opacity-50 ${
                    selected ? 'ring-4 ring-[#FF5C00]' : ''
                  }`}
                >
                  <div className={`rounded-2xl flex items-center justify-center shrink-0 ${accentMap[m.accent]}`}
                    style={{ width: clamp(48, 5.5, 72), height: clamp(48, 5.5, 72) }}>
                    <Icon style={{ width: '55%', height: '55%' }} strokeWidth={2.2} />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-black text-slate-900 tracking-tight leading-tight"
                      style={{ fontSize: clamp(16, 1.8, 26) }}>{LABELS[m.v]}</p>
                    <p className="text-slate-500 leading-tight mt-0.5"
                      style={{ fontSize: clamp(11, 1.05, 15) }}>{SUBS[m.v]}</p>
                  </div>
                  {selected && (
                    <span className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FF5C00] text-white text-[10px] font-black uppercase tracking-widest">
                      ✓ Gekozen
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* ===== RECHTER KOLOM — Uni5Pay QR ===== */}
        <button
          onClick={() => pick('mope')}
          disabled={busy}
          data-testid="cd-method-mope"
          className={`bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 lg:p-6 shadow-2xl flex flex-col items-center text-center transition disabled:opacity-60 ${
            customerChose && chosen === 'mope' ? 'ring-4 ring-[#FF5C00]' : ''
          }`}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 mb-2"
            style={{ fontSize: clamp(9, 0.85, 13) }}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-black uppercase tracking-widest">Uni5Pay actief</span>
          </div>
          <div className="bg-white rounded-xl p-2 sm:p-3"
            style={{ width: clamp(180, 22, 320), height: clamp(180, 22, 320) }}>
            <QRCodeSVG
              value={payload.mope_qr || `${(typeof window !== 'undefined' ? window.location.origin : '')}/api/payments/mock-pay/${payload.order_id || 'demo'}?amount=${amt}&currency=${cur}`}
              size="100%"
              level="M"
              bgColor="#FFFFFF"
              fgColor="#0F0F0F"
              style={{ width: '100%', height: '100%' }}
            />
          </div>
          <p className="font-black text-slate-900 tracking-tight mt-2 sm:mt-3"
            style={{ fontSize: clamp(16, 1.9, 26) }}>Scan om te betalen</p>
          <p className="text-slate-500 font-medium"
            style={{ fontSize: clamp(11, 1.0, 14) }}>met je telefoon-camera</p>
        </button>
      </div>

      {error && (
        <p className="text-white bg-red-500/30 px-3 py-1 rounded-full font-bold mt-2 mx-auto"
          style={{ fontSize: clamp(11, 1.0, 14) }}>{error}</p>
      )}
      <p className="text-white/70 mt-2 sm:mt-3 font-bold uppercase tracking-widest text-center px-4"
        style={{ fontSize: clamp(9, 0.95, 14) }}>
        {customerChose
          ? 'De medewerker bevestigt uw betaling…'
          : 'Scan de QR-code of tik op een methode'}
      </p>
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
      className="absolute inset-0 flex flex-col items-center justify-center px-4 sm:px-8"
      data-testid="cd-receipt">
      <div className="w-full max-w-2xl bg-white rounded-2xl sm:rounded-3xl shadow-2xl p-6 sm:p-10 lg:p-12 text-center">
        <motion.div
          initial={{ scale: 0 }} animate={{ scale: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 200, damping: 15 }}
          className="rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3 sm:mb-5"
          style={{ width: clamp(72, 9, 140), height: clamp(72, 9, 140) }}>
          <CheckCircle2 className="text-emerald-500" strokeWidth={2.5}
            style={{ width: '60%', height: '60%' }} />
        </motion.div>
        <p className="font-bold text-emerald-600 uppercase tracking-widest"
          style={{ fontSize: clamp(11, 1.2, 18) }}>Betaling gelukt</p>
        <p className="font-black text-slate-900 tracking-tight mt-2 sm:mt-3 whitespace-nowrap"
          style={{ fontSize: clamp(34, 6, 100) }}>{fmtMoney(amt, cur)}</p>
        {p.receipt_number && (
          <p className="text-slate-500 mt-3 sm:mt-4"
            style={{ fontSize: clamp(12, 1.3, 18) }}>
            Kwitantienummer <span className="font-black text-slate-700">{p.receipt_number}</span>
          </p>
        )}
        <p className="mt-5 text-slate-500"
          style={{ fontSize: clamp(12, 1.3, 18) }}>Bedankt voor uw betaling!</p>
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
  const [branding, setBranding] = useState(null);
  const [state, setState] = useState({ step: 'idle' });
  const [error, setError] = useState('');
  const [pickerSlug, setPickerSlug] = useState('');
  const lastUpdate = useRef(0);

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

  const applyState = useCallback((newState, source) => {
    // Negeer als de nieuwe update OUDER OF GELIJK is aan de huidige —
    // identieke timestamps (zelfde poll-resultaat) zouden anders elke
    // 500ms een re-render forceren en de receipt-animatie opnieuw
    // afspelen waardoor het lijkt of de popup steeds opnieuw verschijnt.
    try {
      const t = newState?.updated_at ? new Date(newState.updated_at).getTime() : Date.now();
      if (t <= lastUpdate.current) return;
      lastUpdate.current = t;
    } catch { /* ignore */ }
    setState(newState || { step: 'idle' });
    if (source) console.debug('[customer-display] update via', source);
  }, []);

  // 1) BroadcastChannel — instant lokale sync zelfde browser
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return undefined;
    const bc = new BroadcastChannel(BROADCAST_CHANNEL);
    const handler = (e) => { if (e.data?.state) applyState(e.data.state, 'broadcast'); };
    bc.addEventListener('message', handler);
    return () => { bc.removeEventListener('message', handler); bc.close(); };
  }, [applyState]);

  // 2) Backend polling — fallback voor cross-device + branding load
  const stopped = useRef(false);
  useEffect(() => {
    stopped.current = false;
    if (!slug) return () => { stopped.current = true; };
    let timer;
    const tick = async () => {
      try {
        const { data: d } = await api.get(`/public/customer-display/${slug}?t=${Date.now()}`);
        if (stopped.current) return;
        if (d?.branding) {
          applyBranding(d.branding);
          setBranding(d.branding);
        }
        if (d?.state) applyState(d.state, 'poll');
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
  }, [slug, applyState]);

  // Full-screen background bound to brand primary.
  const primary = branding?.primary_color || '#FF5C00';
  useEffect(() => {
    // document.title wordt centraal beheerd door usePwaManifest()
    document.documentElement.style.backgroundColor = primary;
    document.body.style.backgroundColor = primary;
    return () => {
      document.documentElement.style.backgroundColor = '';
      document.body.style.backgroundColor = '';
    };
  }, [primary]);

  if (!slug) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-orange-500 p-4">
        <form
          onSubmit={(e) => { e.preventDefault(); const s = pickerSlug.trim().toLowerCase(); if (s) setSlug(s); }}
          className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 sm:p-8 text-center"
          data-testid="cd-picker">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Klantenscherm</p>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mt-2 mb-4">Welk bedrijf?</h2>
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

  if (!branding && !state.step) {
    return (
      <div className="fixed inset-0 flex items-center justify-center"
        style={{ background: primary }}>
        <Loader2 className="w-12 h-12 text-white animate-spin" />
        {error && <p className="absolute bottom-10 text-white/80 font-bold text-sm">{error}</p>}
      </div>
    );
  }

  const step = state?.step || 'idle';

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
        {(step === 'idle' || step === 'check') && <IdleScreen branding={branding} />}
        {step === 'select' && <GreetScreen state={state} branding={branding} />}
        {step === 'overview' && <OverviewScreen state={state} slug={slug} />}
        {step === 'pay' && <PayScreen state={state} />}
        {(step === 'method' || step === 'confirm') && <MethodScreen state={state} slug={slug} />}
        {step === 'receipt' && <ReceiptScreen state={state} />}
      </AnimatePresence>

      {/* Tiny footer met bedrijfsnaam + live indicator */}
      <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-white/70 font-bold pointer-events-none"
        style={{ fontSize: clamp(9, 0.7, 12) }}>
        <span data-testid="cd-footer-company" className="truncate">{branding?.name}</span>
        <span className="flex items-center gap-2 shrink-0">
          <LiveDot lastUpdate={lastUpdate.current} />
          <span className="uppercase tracking-widest">Klantenscherm</span>
        </span>
      </div>
    </div>
  );
}

function LiveDot({ lastUpdate }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const stale = !lastUpdate || (now - lastUpdate) > 4000;
  return (
    <span title={lastUpdate ? new Date(lastUpdate).toLocaleTimeString('nl-NL') : 'geen update'}
      data-testid="cd-live-dot"
      className={`inline-block w-2 h-2 rounded-full ${
        stale ? 'bg-red-400/80' : 'bg-emerald-400 animate-pulse'
      }`} />
  );
}
