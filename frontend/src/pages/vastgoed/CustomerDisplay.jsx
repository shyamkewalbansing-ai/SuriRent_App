import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import {
  CheckCircle2, Wallet, Home as HomeIcon, FileText, Wifi,
  CreditCard, Banknote, Smartphone, Loader2, ChevronRight, QrCode, ShieldCheck,
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
// TenantBanner — toont huidige huurder + appartement op betaalschermen
// =====================================================================
// Compact, elegant banner dat altijd zichtbaar is tijdens PAY, METHOD en
// CONFIRM steps zodat de klant + omstanders duidelijk zien om welk
// appartement en welke huurder het gaat. Avatar = initiaal in branded
// cirkel; mooi met glasmorfisme bovenop het oranje achtergrond.
function TenantBanner({ state, dense = false }) {
  const apt = state?.apartment || {};
  const tenant = state?.tenant || {};
  const name = (tenant.name || apt.tenant_name || '').trim();
  const initial = (name[0] || '?').toUpperCase();
  if (!name && !apt.number) return null;
  const padding = dense ? 'px-3 py-2 sm:px-4 sm:py-2.5' : 'px-4 py-3 sm:px-5 sm:py-3.5';
  return (
    <div data-testid="cd-tenant-banner"
      className={`inline-flex items-center gap-3 sm:gap-4 bg-white/15 backdrop-blur-md border border-white/25 rounded-2xl shadow-lg ${padding}`}>
      {/* Avatar — initiaal in witte cirkel met brand-kleur tekst */}
      <div className="rounded-full bg-white text-[#FF5C00] flex items-center justify-center shrink-0 shadow-inner"
        style={{ width: clamp(36, 4, 56), height: clamp(36, 4, 56) }}>
        <span className="font-black tracking-tight" style={{ fontSize: clamp(16, 1.8, 26) }}>{initial}</span>
      </div>
      <div className="text-left min-w-0">
        {name && (
          <p className="font-black text-white tracking-tight leading-tight truncate"
            style={{ fontSize: clamp(15, 1.55, 26) }} data-testid="cd-tenant-name">{name}</p>
        )}
        <div className="flex items-center gap-2 mt-0.5 text-white/85"
          style={{ fontSize: clamp(11, 1.05, 16) }}>
          {apt.number && (
            <span className="inline-flex items-center gap-1 font-bold" data-testid="cd-apartment-number">
              <HomeIcon style={{ width: '0.9em', height: '0.9em' }} strokeWidth={2.4} />
              App. {apt.number}
            </span>
          )}
          {apt.address && (
            <>
              <span className="opacity-50">·</span>
              <span className="truncate font-medium" data-testid="cd-apartment-address">{apt.address}</span>
            </>
          )}
        </div>
      </div>
    </div>
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
  const apt = state.apartment || {};
  const tenant = state.tenant || {};
  const name = (tenant.name || apt.tenant_name || '').trim();
  const initial = (name[0] || '?').toUpperCase();
  const labels = {
    huur: 'Huur', servicekosten: 'Servicekosten',
    boete: 'Boetes', internet: 'Internet', overig: 'Overig',
  };
  const ICONS_BY_KEY = {
    huur: HomeIcon, servicekosten: FileText, boete: FileText,
    internet: Wifi, overig: Wallet,
  };
  const isEmpty = cats.length === 0;
  // Staggered reveal voor het hele scherm
  const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
  const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

  return (
    <motion.div key="pay"
      variants={container} initial="hidden" animate="show"
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="absolute inset-0 flex flex-col px-4 sm:px-8 lg:px-14 py-6 lg:py-10"
      data-testid="cd-pay">

      {/* GRID: links = huurder-identiteit, rechts = transactie */}
      <div className="flex-1 min-h-0 w-full max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-[minmax(300px,400px)_1fr] gap-5 lg:gap-10 items-stretch overflow-hidden">

        {/* ===== LINKS — Huurder identiteit kaart ===== */}
        <motion.div variants={item}
          className="relative bg-white/10 backdrop-blur-2xl border border-white/20 rounded-3xl shadow-2xl p-5 sm:p-6 lg:p-8 flex flex-col text-white overflow-hidden">

          {/* Subtle inner highlight */}
          <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent pointer-events-none rounded-t-3xl" />

          <p className="relative font-black uppercase tracking-[0.35em] text-white/70"
            style={{ fontSize: clamp(9, 0.85, 12) }}>Huurder</p>

          <div className="relative mt-3 sm:mt-4 flex items-center gap-3 sm:gap-4">
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.25, type: 'spring', stiffness: 220, damping: 16 }}
              className="rounded-2xl bg-gradient-to-br from-white to-white/85 text-[#FF5C00] flex items-center justify-center shrink-0 shadow-xl"
              style={{ width: clamp(60, 7, 92), height: clamp(60, 7, 92) }}>
              <span className="font-black tracking-tight"
                style={{ fontSize: clamp(28, 3.2, 44) }}>{initial}</span>
            </motion.div>
            <div className="min-w-0 flex-1">
              <p className="font-black tracking-tight leading-tight text-white break-words"
                style={{ fontSize: clamp(18, 1.85, 28) }} data-testid="cd-tenant-name">
                {name || 'Gewaardeerde huurder'}
              </p>
              {apt.number && (
                <p className="mt-1.5 font-bold text-white/80 inline-flex items-center gap-1"
                  style={{ fontSize: clamp(12, 1.2, 16) }} data-testid="cd-apartment-number">
                  <HomeIcon style={{ width: '0.9em', height: '0.9em' }} strokeWidth={2.4} />
                  Appartement {apt.number}
                </p>
              )}
            </div>
          </div>

          {apt.address && (
            <div className="relative mt-4 pt-4 border-t border-white/15">
              <p className="font-black uppercase tracking-[0.28em] text-white/55"
                style={{ fontSize: clamp(9, 0.8, 11) }}>Adres</p>
              <p className="mt-1 font-bold text-white/95 break-words leading-snug"
                style={{ fontSize: clamp(13, 1.3, 18) }} data-testid="cd-apartment-address">
                {apt.address}
              </p>
            </div>
          )}

          {/* Live status pill onderin */}
          <div className="relative mt-auto pt-4">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-400/20 border border-emerald-300/40 text-emerald-50"
              style={{ fontSize: clamp(10, 0.9, 13) }}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
              <span className="font-black uppercase tracking-widest">Live samenstellen</span>
            </span>
          </div>
        </motion.div>

        {/* ===== RECHTS — Transactie kaart ===== */}
        <motion.div variants={item}
          className="relative bg-white rounded-3xl shadow-2xl p-5 sm:p-7 lg:p-10 flex flex-col min-h-0 overflow-hidden">

          {/* Decoratieve gradient strip bovenin */}
          <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-orange-400 via-[#FF5C00] to-amber-500" />
          <div className="flex items-end justify-between mb-4 sm:mb-5">
            <div>
              <p className="font-black uppercase tracking-[0.32em] text-slate-400"
                style={{ fontSize: clamp(9, 0.9, 12) }}>Uw betaling</p>
              <h2 className="font-black text-slate-900 tracking-tight leading-tight mt-1"
                style={{ fontSize: clamp(22, 2.6, 38) }}>Onderdelen</h2>
            </div>
          </div>

          <ul className="space-y-2 sm:space-y-2.5 overflow-auto pr-1 -mr-1">
            {isEmpty && (
              <li className="flex items-center gap-3 text-slate-400 bg-slate-50 rounded-2xl px-4 py-3"
                style={{ fontSize: clamp(13, 1.3, 18) }}>
                <Loader2 className="animate-spin shrink-0" style={{ width: clamp(16, 1.6, 22), height: clamp(16, 1.6, 22) }} />
                <span>Een medewerker stelt uw betaling samen…</span>
              </li>
            )}
            <AnimatePresence initial={false}>
              {cats.map((c, idx) => {
                const Icon = ICONS_BY_KEY[c.key] || Wallet;
                return (
                  <motion.li
                    key={c.key + '|' + (c.label || '') + '|' + idx}
                    initial={{ opacity: 0, x: -18, scale: 0.97 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 18, scale: 0.97 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    className="flex items-center justify-between bg-gradient-to-r from-orange-50/60 via-white to-white border border-slate-100 rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 gap-3 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="rounded-xl bg-gradient-to-br from-orange-100 to-orange-50 text-[#FF5C00] flex items-center justify-center shrink-0 shadow-inner"
                        style={{ width: clamp(36, 4, 52), height: clamp(36, 4, 52) }}>
                        <Icon style={{ width: '55%', height: '55%' }} strokeWidth={2.2} />
                      </div>
                      <span className="font-bold text-slate-800 truncate"
                        style={{ fontSize: clamp(14, 1.5, 22) }}>{c.label || labels[c.key] || c.key}</span>
                    </div>
                    <span className="font-black text-slate-900 whitespace-nowrap tabular-nums"
                      style={{ fontSize: clamp(14, 1.5, 22) }}>{fmtMoney(c.value || c.amount || 0, cur)}</span>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>

          {/* Totaal — premium accent block onderin (mt-auto duwt naar onderkant) */}
          <div className="mt-auto pt-5 sm:pt-7 relative">
            <div className="relative rounded-2xl overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-[#FF5C00] via-[#FF7A2D] to-amber-500" />
            <div className="absolute inset-0 opacity-30 mix-blend-overlay"
              style={{ backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><filter id='n'><feTurbulence baseFrequency='1.4'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/></svg>")` }} />
            <div className="relative flex items-end justify-between px-4 sm:px-6 py-4 sm:py-5 text-white">
              <div>
                <p className="font-black uppercase tracking-[0.3em] text-white/85"
                  style={{ fontSize: clamp(9, 0.9, 12) }}>Totaal</p>
                <p className="font-bold text-white/90 mt-0.5"
                  style={{ fontSize: clamp(12, 1.2, 16) }}>te betalen</p>
              </div>
              <motion.p
                key={amt}
                initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 16 }}
                className="font-black tracking-tight whitespace-nowrap leading-none tabular-nums"
                style={{ fontSize: clamp(28, 5.2, 84) }} data-testid="cd-pay-total">
                {fmtMoney(amt, cur)}
              </motion.p>
            </div>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

// Toont 5 grote tap-tegels; na tap wordt de keuze naar de backend
// gestuurd zodat de admin Kiosk automatisch verder kan.
// =====================================================================
function MethodScreen({ state, slug, branding }) {
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

  // Bankoverschrijving gegevens — komen uit de branding (admin-instellingen).
  // We tonen ze altijd zichtbaar onder de bank-tegel en, als de klant/operator
  // bank kiest, groot rechts in beeld i.p.v. de Uni5Pay QR.
  const bankSR = (branding?.bank_account_sr || '').trim();
  const bankNL = (branding?.bank_account_nl || '').trim();
  const hasBankDetails = !!(bankSR || bankNL);
  const bankActive = chosen === 'bank';

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

      {/* TOP: huurder-banner + groot bedrag */}
      <div className="flex flex-col items-center text-center gap-3 mb-3 sm:mb-4">
        <TenantBanner state={state} dense />
        <div>
          <p className="font-black uppercase tracking-[0.3em] text-white/85"
            style={{ fontSize: clamp(10, 1.0, 16) }}>Te betalen</p>
          <p className="font-black text-white tracking-tight whitespace-nowrap leading-none mt-1"
            style={{ fontSize: clamp(32, 5.0, 80) }} data-testid="cd-method-pick-amount">
            {fmtMoney(amt, cur)}
          </p>
        </div>
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
                    {m.v === 'bank' && hasBankDetails ? (
                      <div className="mt-1 space-y-0.5">
                        {bankSR && (
                          <p className="text-slate-700 font-bold leading-tight truncate"
                            style={{ fontSize: clamp(11, 1.1, 15) }}>SR: {bankSR}</p>
                        )}
                        {bankNL && (
                          <p className="text-slate-700 font-bold leading-tight truncate"
                            style={{ fontSize: clamp(11, 1.1, 15) }}>NL: {bankNL}</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-slate-500 leading-tight mt-0.5"
                        style={{ fontSize: clamp(11, 1.05, 15) }}>{SUBS[m.v]}</p>
                    )}
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

        {/* ===== RECHTER KOLOM — Uni5Pay QR óf bank-details =====
            Wanneer 'bank' actief is (klant of operator gekozen) tonen we
            géén QR maar een prominente bank-details card zodat de klant
            direct ziet waar hij naar over moet maken. Anders: Uni5Pay QR
            met ROOD (niet klaar) / GROEN (klaar) border-indicator. */}
        {bankActive && hasBankDetails ? (
          <div
            data-testid="cd-bank-details-card"
            className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 lg:p-8 shadow-2xl flex flex-col text-center ring-4 ring-amber-400 w-full max-w-md"
          >
            <p className="font-black uppercase tracking-[0.3em] text-amber-700"
              style={{ fontSize: clamp(10, 1.0, 14) }}>Maak over naar</p>
            <div className="flex items-center justify-center gap-2 mt-2 mb-3">
              <CreditCard className="text-amber-700" style={{ width: clamp(20, 2.2, 32), height: clamp(20, 2.2, 32) }} strokeWidth={2.4} />
              <p className="font-black text-slate-900 tracking-tight"
                style={{ fontSize: clamp(18, 2.0, 28) }}>Bankrekening</p>
            </div>
            <div className="space-y-2 sm:space-y-3">
              {bankSR && (
                <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl px-3 py-2 sm:px-4 sm:py-3 text-left">
                  <p className="font-black uppercase tracking-widest text-amber-700"
                    style={{ fontSize: clamp(9, 0.85, 12) }}>Suriname</p>
                  <p className="font-black text-slate-900 break-words leading-tight mt-0.5"
                    style={{ fontSize: clamp(14, 1.5, 22) }}>{bankSR}</p>
                </div>
              )}
              {bankNL && (
                <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl px-3 py-2 sm:px-4 sm:py-3 text-left">
                  <p className="font-black uppercase tracking-widest text-amber-700"
                    style={{ fontSize: clamp(9, 0.85, 12) }}>Nederland</p>
                  <p className="font-black text-slate-900 break-words leading-tight mt-0.5"
                    style={{ fontSize: clamp(14, 1.5, 22) }}>{bankNL}</p>
                </div>
              )}
            </div>
            <p className="mt-4 text-slate-600 font-bold"
              style={{ fontSize: clamp(11, 1.1, 15) }}>
              Bedrag: <span className="text-amber-700 font-black">{fmtMoney(amt, cur)}</span>
            </p>
            <p className="mt-1 text-slate-500"
              style={{ fontSize: clamp(10, 0.95, 13) }}>
              Toon uw overschrijvingsbewijs bij de balie
            </p>
          </div>
        ) : (() => {
          const ready = Boolean(payload.mope_qr) || amt > 0;
          const statusBorder = ready ? 'ring-emerald-500' : 'ring-red-500';
          const statusBg = ready ? 'bg-emerald-500' : 'bg-red-500';
          const statusText = ready ? 'Klaar om te scannen' : 'Wacht op bedrag';
          return (
        <button
          onClick={() => pick('mope')}
          disabled={busy || !ready}
          data-testid="cd-method-mope"
          className={`bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 lg:p-6 shadow-2xl flex flex-col items-center text-center transition disabled:opacity-90 ring-4 ${statusBorder} ${
            customerChose && chosen === 'mope' ? 'ring-[#FF5C00]' : ''
          }`}
        >
          {/* "Betaal met UNI5PAY+" header — gebrand zoals Uni5Pay sticker */}
          <p className="font-black text-slate-900 tracking-tight"
            style={{ fontSize: clamp(13, 1.5, 22) }}>Betaal met</p>
          <p className="font-black tracking-tight flex items-baseline gap-1 leading-none"
            style={{ fontSize: clamp(22, 2.8, 38), color: '#E40521' }}>
            UNI5PAY
            <span className="inline-flex items-center justify-center rounded-full text-white"
              style={{ fontSize: '0.6em', width: '1em', height: '1em', background: '#E40521', marginLeft: '0.1em' }}>+</span>
          </p>

          {/* Status badge (ROOD/GROEN) */}
          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full mt-2 mb-2 text-white ${statusBg}`}
            style={{ fontSize: clamp(9, 0.85, 13) }}>
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span className="font-black uppercase tracking-widest">{statusText}</span>
          </div>

          {/* QR met "+" logo overlay in midden */}
          <div className="relative bg-white rounded-xl p-2"
            style={{ width: clamp(180, 22, 320), height: clamp(180, 22, 320) }}>
            {(() => {
              const fallbackUrl = `${(typeof window !== 'undefined' ? window.location.origin : '')}/api/payments/mock-pay/${payload.order_id || 'demo'}?amount=${amt}&currency=${cur}`;
              let qrValue = payload.mope_qr || fallbackUrl;
              if (typeof qrValue !== 'string') qrValue = String(qrValue || '');
              if (qrValue.length > 1000) qrValue = fallbackUrl;
              return (
                <QRCodeSVG
                  value={qrValue}
                  size={256}
                  level="H"
                  bgColor="#FFFFFF"
                  fgColor="#0F0F0F"
                  style={{ width: '100%', height: '100%' }}
                />
              );
            })()}
            {/* Center logo overlay — Uni5Pay "+" icoon (compacter zodat QR scanbaar blijft) */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center border-2 border-white bg-white shadow-lg"
              style={{ width: '18%', height: '18%' }}>
              <span className="font-black leading-none" style={{ fontSize: '1.4em', color: '#E40521' }}>+</span>
            </div>
            {/* ROOD overlay als niet ready — visueel signaal */}
            {!ready && (
              <div className="absolute inset-2 bg-red-500/55 rounded-lg flex items-center justify-center">
                <span className="bg-white text-red-700 font-black px-3 py-1.5 rounded-full shadow-lg"
                  style={{ fontSize: clamp(10, 1.0, 14) }}>Nog niet actief</span>
              </div>
            )}
          </div>

          {/* "scan QR code" pill */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 text-white mt-3"
            style={{ fontSize: clamp(12, 1.2, 16) }}>
            <Smartphone style={{ width: clamp(14, 1.4, 20), height: clamp(14, 1.4, 20) }} />
            <span className="font-bold">scan QR code</span>
          </div>
        </button>
          );
        })()}
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
  const tenantName = (state?.tenant?.name || state?.apartment?.tenant_name || '').trim();
  return (
    <motion.div key="receipt"
      initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 180, damping: 20 }}
      className="absolute inset-0 flex flex-col items-center justify-center px-4 sm:px-8"
      data-testid="cd-receipt">

      {/* Confetti-stijl mini-puntjes voor festive feedback */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="absolute inset-0 pointer-events-none overflow-hidden"
        aria-hidden>
        {[...Array(12)].map((_, i) => (
          <motion.span
            key={i}
            initial={{ y: '-10%', x: `${(i * 8.3) - 5}%`, opacity: 0 }}
            animate={{ y: '110%', opacity: [0, 1, 1, 0] }}
            transition={{ duration: 2.5 + (i % 3) * 0.4, delay: 0.3 + i * 0.05, ease: 'easeIn' }}
            className="absolute block w-2 h-2 rounded-full bg-white/80" />
        ))}
      </motion.div>

      <div className="relative w-full max-w-2xl bg-white rounded-2xl sm:rounded-3xl shadow-2xl p-6 sm:p-10 lg:p-12 text-center">
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
        {tenantName && (
          <p className="mt-2 text-slate-600 font-bold"
            style={{ fontSize: clamp(13, 1.4, 20) }}>Bedankt, {tenantName}!</p>
        )}
        {p.receipt_number && (
          <p className="text-slate-500 mt-3 sm:mt-4"
            style={{ fontSize: clamp(12, 1.3, 18) }}>
            Kwitantienummer <span className="font-black text-slate-700">{p.receipt_number}</span>
          </p>
        )}
        <p className="mt-5 text-slate-500"
          style={{ fontSize: clamp(12, 1.3, 18) }}>Een bewijs van uw betaling wordt afgedrukt.</p>
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
  const [shownReceipt, setShownReceipt] = useState('');

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

  const lastStateKey = useRef('');
  const applyState = useCallback((newState, source) => {
    // STAP 1 — Tijdstempel check: negeer oudere updates (out-of-order)
    try {
      const t = newState?.updated_at ? new Date(newState.updated_at).getTime() : Date.now();
      if (t < lastUpdate.current) return;
      lastUpdate.current = t;
    } catch { /* ignore */ }
    // STAP 2 — CONTENT-HASH dedup: ook al heeft de operator heartbeat een
    // nieuwe `updated_at` gezet, als de daadwerkelijke content (step + payload)
    // identiek is aan de vorige update, doen we NIETS. Voorkomt de constante
    // re-renders elke 3s door operator-heartbeats die het klantenscherm
    // anders zou laten flikkeren.
    try {
      const contentKey = JSON.stringify({
        step: newState?.step,
        // Belangrijke payload-velden voor herrendering:
        amount: newState?.payload?.amount,
        currency: newState?.payload?.currency,
        method: newState?.payload?.method,
        method_chosen_at: newState?.payload?.method_chosen_at,
        mope_qr: newState?.payload?.mope_qr,
        mope_paid_at: newState?.payload?.mope_paid_at,
        // Categorieën-lengte + labels meenemen zodat operator-aanvinkingen
        // (zelfs als ze het totaalbedrag onveranderd laten, bv. Internet=0)
        // het klantenscherm WEL re-renderen.
        cats: (newState?.payload?.categories || []).map((c) => `${c.key || c.label}:${c.value || 0}`).join('|'),
        tenant_id: newState?.tenant?.id,
        apartment_id: newState?.apartment?.id,
        receipt_number: newState?.payment?.receipt_number,
      });
      if (contentKey === lastStateKey.current) return;
      lastStateKey.current = contentKey;
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

  // 1b) Receipt-deduplicatie tracker — wanneer state.step naar receipt gaat,
  // onthoud de unieke receipt-key zodat we bij volgende polls niet opnieuw
  // de "Betaling ontvangen" popup tonen voor dezelfde transactie.
  // Hooks MOETEN voor early-returns staan (rules-of-hooks).
  useEffect(() => {
    const s = state?.step;
    const key = (state?.payment?.receipt_number || state?.payment?.paid_at || '');
    if (s === 'receipt' && key && key !== shownReceipt) {
      setShownReceipt(key);
    }
  }, [state, shownReceipt]);

  // 2) Backend polling — fallback voor cross-device + branding load
  const stopped = useRef(false);
  useEffect(() => {
    stopped.current = false;
    if (!slug) return () => { stopped.current = true; };
    let timer;
    // Track branding fingerprint zodat we alleen applyBranding aanroepen
    // wanneer er ECHT iets verandert — anders triggert elke poll (elke
    // 700ms) een CSS-variabelen reset + favicon re-write die het hele
    // klantenscherm doet flikkeren.
    let lastBrandKey = '';
    const tick = async () => {
      try {
        const { data: d } = await api.get(`/public/customer-display/${slug}?t=${Date.now()}`);
        if (stopped.current) return;
        if (d?.branding) {
          const b = d.branding;
          const key = JSON.stringify({
            p: b.primary_color, s: b.secondary_color, n: b.name,
            l: b.logo_url, a: b.app_name,
          });
          if (key !== lastBrandKey) {
            applyBranding(b);
            setBranding(b);
            lastBrandKey = key;
          }
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

  // Receipt deduplicatie — wanneer dezelfde betaling al getoond is (zelfde
  // receipt_number of payment.paid_at), forceer idle. Voorkomt dat het
  // klantenscherm telkens opnieuw "BETALING ONTVANGEN" herhaalt wanneer
  // de operator een nieuwe sessie start zonder de display expliciet te
  // resetten.
  const receiptKey = (state?.payment?.receipt_number || state?.payment?.paid_at || '');
  const alreadyShown = !!receiptKey && receiptKey === shownReceipt;
  // Wanneer step='select' (operator is een appartement aan het kiezen) maar
  // er nog géén apartment is doorgegeven, moet het klantenscherm gewoon het
  // welkom (idle) scherm tonen — niet de Greet met lege data. Greet is alleen
  // bedoeld als er actief een huurder geselecteerd is.
  const hasActiveTenant = !!(state?.apartment?.id || state?.tenant?.name);
  const effectiveStep = (step === 'receipt' && alreadyShown)
    ? 'idle'
    : (step === 'select' && !hasActiveTenant) ? 'idle' : step;

  return (
    <div className="fixed inset-0 overflow-hidden"
      style={{
        // Cinematische gelaagde achtergrond — combineert een diagonaal lineair
        // gradient (lichter linksboven → donkerder rechtsonder) met twee
        // radiale "ambient" lichtbronnen die het scherm meer diepte geven.
        background: `
          radial-gradient(ellipse at 12% 18%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 42%),
          radial-gradient(ellipse at 88% 82%, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0) 55%),
          linear-gradient(155deg, ${primary} 0%, ${primary} 55%, rgba(0,0,0,0.22) 100%),
          ${primary}
        `,
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
      data-testid="cd-root">

      {/* Subtiele ruis-textuur over het hele scherm — geeft een premium
          "film grain" gevoel dat platte digitale kleuren mist. SVG inline
          zodat er geen extra request nodig is. */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.18] mix-blend-overlay"
        aria-hidden
        style={{
          backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.55'/></svg>")`,
          backgroundSize: '180px 180px',
        }} />

      {/* Zachte glow-bollen die langzaam pulseren — geeft het scherm leven
          tijdens stille momenten. */}
      <motion.div
        aria-hidden
        animate={{ opacity: [0.35, 0.55, 0.35], scale: [1, 1.08, 1] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute pointer-events-none rounded-full blur-3xl"
        style={{ width: '40vmin', height: '40vmin', left: '-8vmin', top: '8vmin',
                 background: 'radial-gradient(circle, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0) 70%)' }} />
      <motion.div
        aria-hidden
        animate={{ opacity: [0.25, 0.4, 0.25], scale: [1, 1.1, 1] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
        className="absolute pointer-events-none rounded-full blur-3xl"
        style={{ width: '46vmin', height: '46vmin', right: '-10vmin', bottom: '6vmin',
                 background: 'radial-gradient(circle, rgba(255,200,140,0.35) 0%, rgba(0,0,0,0) 70%)' }} />

      <AnimatePresence mode="wait">
        {(effectiveStep === 'idle' || effectiveStep === 'check') && <IdleScreen branding={branding} />}
        {effectiveStep === 'select' && <GreetScreen state={state} branding={branding} />}
        {effectiveStep === 'overview' && <OverviewScreen state={state} slug={slug} />}
        {effectiveStep === 'pay' && <PayScreen state={state} />}
        {(effectiveStep === 'method' || effectiveStep === 'confirm') && <MethodScreen state={state} slug={slug} branding={branding} />}
        {effectiveStep === 'receipt' && <ReceiptScreen state={state} />}
      </AnimatePresence>

      {/* Tiny footer met bedrijfsnaam + live indicator */}
      <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-white/70 font-bold pointer-events-none"
        style={{ fontSize: clamp(9, 0.7, 12) }}>
        <span data-testid="cd-footer-company" className="truncate">{branding?.name}</span>

        {/* Veilig & betrouwbaar badge — slot icoon midden onderaan */}
        <span data-testid="cd-footer-trust"
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 text-white/85 shrink-0"
          style={{ fontSize: clamp(9, 0.75, 12) }}>
          <ShieldCheck style={{ width: clamp(10, 0.95, 14), height: clamp(10, 0.95, 14) }} strokeWidth={2.5} />
          <span className="font-black tracking-widest uppercase">Veilig &amp; betrouwbaar</span>
        </span>

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
