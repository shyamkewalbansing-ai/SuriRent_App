// Premium SaaS landing — herontworpen 2026-05-31.
// Bevat: dual-device showcase (iPhone Kiosk + Desktop Beheer), 12-feature grid,
// pricing, FAQ, CTA banner. Volledig statisch met user screenshots — geen
// runtime CMS dependency zodat de pagina blixemsnel laadt.
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { appLink } from '../../lib/env';
import {
  Menu, X, ArrowRight, Check, Building2, Receipt, Users, Wallet,
  Shield, Zap, Sparkles, ScanFace, Smartphone, ScanLine, QrCode,
  Calendar, FileText, MessageCircle, Globe, ChevronRight, Star,
  ChevronDown, ChevronUp, Mail, Phone, MapPin, ArrowUpRight,
} from 'lucide-react';

// User-uploaded app screenshots — gehost op Emergent assets CDN.
const SHOTS = {
  overzicht: 'https://customer-assets.emergentagent.com/job_vastgoed-app/artifacts/7sx9hgg7_1.png',
  locaties: 'https://customer-assets.emergentagent.com/job_vastgoed-app/artifacts/nlo3hnqf_2.png',
  appartementen: 'https://customer-assets.emergentagent.com/job_vastgoed-app/artifacts/sy8hpkqs_3.png',
  betalingen: 'https://customer-assets.emergentagent.com/job_vastgoed-app/artifacts/dwbjqd89_4.png',
  facturen: 'https://customer-assets.emergentagent.com/job_vastgoed-app/artifacts/mfvavq0r_5.png',
  kioskLoc: 'https://customer-assets.emergentagent.com/job_vastgoed-app/artifacts/7eebv0bd_11.png',
  kioskApt: 'https://customer-assets.emergentagent.com/job_vastgoed-app/artifacts/n7efnoh0_12.png',
  kioskOverview: 'https://customer-assets.emergentagent.com/job_vastgoed-app/artifacts/t334vu2t_13.png',
  kioskNumpad: 'https://customer-assets.emergentagent.com/job_vastgoed-app/artifacts/mjshklb8_14.png',
};

const DEMO_VIDEO = '/landing/demo.mp4';
const DEMO_POSTER = '/landing/demo-poster.jpg';

// =============================================================================
// Reusable: macOS Browser frame for desktop screenshots
// =============================================================================
function BrowserFrame({ src, alt, className = '' }) {
  return (
    <div className={`relative rounded-2xl overflow-hidden bg-white border border-slate-200/80 shadow-[0_30px_80px_-20px_rgba(15,23,42,0.25)] ${className}`}>
      <div className="h-9 bg-gradient-to-b from-slate-50 to-slate-100/80 border-b border-slate-200/80 flex items-center px-4 gap-3">
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#FF5F57]" />
          <span className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
          <span className="w-3 h-3 rounded-full bg-[#28C840]" />
        </div>
        <div className="flex-1 flex justify-center">
          <span className="text-[10px] font-semibold text-slate-400 px-3 py-1 rounded-md bg-white/70 border border-slate-200/60">
            app.surirent.sr
          </span>
        </div>
      </div>
      <img src={src} alt={alt} loading="lazy"
        className="w-full block bg-slate-50" />
    </div>
  );
}

// =============================================================================
// Reusable: iPad/Tablet landscape frame for kiosk screenshots
// =============================================================================
function TabletFrame({ src, alt, className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <div className="relative rounded-[1.75rem] bg-slate-950 p-2.5 shadow-[0_30px_80px_-20px_rgba(15,23,42,0.4)]">
        <div className="relative rounded-[1.25rem] overflow-hidden bg-white aspect-[1920/950]">
          <img src={src} alt={alt} loading="lazy"
            className="w-full h-full object-cover object-top" />
        </div>
        {/* Home indicator */}
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-16 h-1 rounded-full bg-slate-700/60" />
      </div>
    </div>
  );
}

// =============================================================================
// Reusable: iPhone mockup frame — supports both image (src) and video (videoSrc)
// =============================================================================
function PhoneFrame({ src, videoSrc, poster, alt, width = 280, className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <div className="relative mx-auto rounded-[2.5rem] bg-slate-950 p-2 shadow-[0_30px_80px_-20px_rgba(15,23,42,0.4)]"
        style={{ width }}>
        <div className="relative rounded-[2rem] overflow-hidden bg-white aspect-[9/19.5]">
          {/* Notch */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-6 rounded-full bg-slate-950 z-10" />
          {videoSrc ? (
            <video
              src={videoSrc}
              poster={poster}
              autoPlay loop muted playsInline preload="metadata"
              className="w-full h-full object-cover object-center"
            />
          ) : (
            <img src={src} alt={alt} loading="lazy"
              className="w-full h-full object-cover object-top" />
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// TopNav
// =============================================================================
function TopNav({ onLogin, onDemo }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const goTo = (id) => {
    setOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const navItems = [
    { label: 'Functies', id: 'features' },
    { label: 'Beheer', id: 'showcase' },
    { label: 'Kiosk', id: 'kiosk' },
    { label: 'Prijzen', id: 'pricing' },
    { label: 'FAQ', id: 'faq' },
  ];
  return (
    <header className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
      scrolled ? 'bg-white/85 backdrop-blur-xl border-b border-slate-200/60' : 'bg-transparent'
    }`} data-testid="marketing-topnav">
      <div className="max-w-7xl mx-auto px-5 lg:px-8 h-16 flex items-center justify-between">
        <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="flex items-center gap-2.5"
          data-testid="topnav-logo">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#FF8A3D] to-[#C74600] p-1.5 shadow-[0_8px_18px_-6px_rgba(255,92,0,0.45)]">
            <img src="/kiosk-icons/mark-white.png" alt="" className="w-full h-full object-contain" />
          </span>
          <span className="text-base font-black tracking-tight">
            <span className="text-slate-900">Suri</span><span className="text-[#FF5C00]">Rent</span>
          </span>
        </button>
        <nav className="hidden md:flex items-center gap-8">
          {navItems.map((n) => (
            <button key={n.id} onClick={() => goTo(n.id)}
              data-testid={`topnav-${n.id}`}
              className="text-sm font-semibold text-slate-700 hover:text-[#FF5C00] transition-colors">
              {n.label}
            </button>
          ))}
        </nav>
        <div className="hidden md:flex items-center gap-3">
          <button onClick={onLogin} data-testid="topnav-login"
            className="text-sm font-bold text-slate-700 hover:text-slate-900">Inloggen</button>
          <button onClick={onDemo} data-testid="topnav-demo"
            className="h-10 px-5 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold flex items-center gap-1.5 transition-colors">
            Demo proberen <ArrowRight className="w-4 h-4" />
          </button>
        </div>
        <button onClick={() => setOpen(!open)}
          data-testid="topnav-mobile-toggle"
          className="md:hidden w-10 h-10 rounded-lg hover:bg-slate-100 flex items-center justify-center">
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>
      {open && (
        <div className="md:hidden bg-white border-t border-slate-200/60 px-5 py-4 space-y-1">
          {navItems.map((n) => (
            <button key={n.id} onClick={() => goTo(n.id)}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-bold text-slate-800 hover:bg-slate-50">
              {n.label}
            </button>
          ))}
          <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-2">
            <button onClick={onLogin}
              className="h-10 rounded-full border border-slate-300 text-sm font-bold text-slate-900">Inloggen</button>
            <button onClick={onDemo}
              className="h-10 rounded-full bg-slate-900 text-white text-sm font-bold">Demo</button>
          </div>
        </div>
      )}
    </header>
  );
}

// =============================================================================
// Hero — big headline + dual device showcase + floating notifications
// =============================================================================
function Hero({ onDemo, onWhatsApp }) {
  return (
    <section className="relative pt-32 pb-24 lg:pt-40 lg:pb-32 overflow-hidden">
      {/* Background blobs + grid pattern */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-20 left-1/4 w-[520px] h-[520px] rounded-full opacity-30 blur-3xl"
          style={{ background: 'radial-gradient(circle, #FF8A3D, transparent 70%)' }} />
        <div className="absolute bottom-0 right-1/4 w-[420px] h-[420px] rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, #F8C260, transparent 70%)' }} />
        {/* Subtle dot grid */}
        <div className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: 'radial-gradient(circle, #0F172A 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }} />
      </div>

      <div className="max-w-7xl mx-auto px-5 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-orange-100 shadow-sm mb-6"
            data-testid="hero-badge">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FF5C00] animate-pulse" />
            <span className="text-xs font-bold text-[#C74600] tracking-wide uppercase">Vastgoed SaaS · Suriname</span>
            <span className="text-slate-300">·</span>
            <span className="text-xs font-bold text-slate-600">v2.5</span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-7xl font-black tracking-tighter text-slate-900 leading-[1.02]"
            data-testid="hero-title">
            Het volledige
            <br />
            vastgoedplatform.
            <br />
            <span className="bg-gradient-to-r from-[#FF8A3D] via-[#FF5C00] to-[#C74600] bg-clip-text text-transparent">
              Beheer & Kiosk.
            </span>
          </h1>
          <p className="mt-6 text-lg lg:text-xl text-slate-600 font-medium max-w-2xl mx-auto leading-relaxed"
            data-testid="hero-subtitle">
            Verhuur, factureren, betalen en huurderbeheer — alles in één pixel-perfect systeem
            dat werkt op desktop, iPad en telefoon. Multi-bedrijf SaaS met white-label branding.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button onClick={onDemo} data-testid="hero-cta-demo"
              className="h-12 px-7 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-base font-bold flex items-center gap-2 shadow-[0_20px_40px_-12px_rgba(15,23,42,0.4)] transition-all hover:scale-[1.02]">
              Demo proberen <ArrowRight className="w-5 h-5" />
            </button>
            <button onClick={onWhatsApp} data-testid="hero-cta-whatsapp"
              className="h-12 px-7 rounded-full bg-white hover:bg-slate-50 border border-slate-300 text-slate-900 text-base font-bold flex items-center gap-2 transition-all">
              <MessageCircle className="w-5 h-5 text-emerald-600" /> WhatsApp ons
            </button>
          </div>
          <p className="mt-5 text-xs text-slate-500 font-medium flex items-center justify-center gap-2 flex-wrap"
            data-testid="hero-trust">
            <Check className="w-3.5 h-3.5 text-emerald-600" />
            Geen creditcard nodig
            <span className="text-slate-300">·</span>
            <Check className="w-3.5 h-3.5 text-emerald-600" />
            30 minuten resetterende demo
            <span className="text-slate-300">·</span>
            <Check className="w-3.5 h-3.5 text-emerald-600" />
            White-label voor uw bedrijf
          </p>
        </div>

        {/* Dual device showcase — desktop browser + floating phone + notification cards */}
        <div className="mt-16 lg:mt-24 relative">
          <div className="relative">
            {/* Desktop browser (back layer) */}
            <BrowserFrame src={SHOTS.overzicht} alt="Beheer Overzicht"
              className="max-w-5xl mx-auto" />

            {/* Floating notification card — top-left */}
            <div className="hidden lg:flex absolute -top-4 -left-2 z-20 items-center gap-3 px-4 py-3 rounded-2xl bg-white shadow-[0_20px_50px_-15px_rgba(15,23,42,0.25)] border border-slate-100 animate-[float_6s_ease-in-out_infinite]"
              data-testid="hero-float-payment">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                <Check className="w-5 h-5 text-emerald-600" strokeWidth={3} />
              </div>
              <div>
                <p className="text-sm font-black text-slate-900">Betaling ontvangen</p>
                <p className="text-[11px] text-slate-500">+ SRD 5.000 · Bharat K.</p>
              </div>
            </div>

            {/* Floating notification card — top-right */}
            <div className="hidden lg:flex absolute top-12 -right-6 z-20 items-center gap-3 px-4 py-3 rounded-2xl bg-white shadow-[0_20px_50px_-15px_rgba(15,23,42,0.25)] border border-slate-100 animate-[float_7s_ease-in-out_infinite_0.5s]"
              data-testid="hero-float-tenant">
              <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-[#FF5C00]" />
              </div>
              <div>
                <p className="text-sm font-black text-slate-900">AI OCR voltooid</p>
                <p className="text-[11px] text-slate-500">3 betalingen verwerkt</p>
              </div>
            </div>

            {/* iPhone met live demo video (front layer, overlaps bottom-right) */}
            <div className="hidden md:block absolute -bottom-12 lg:-bottom-20 -right-2 lg:-right-8 z-10"
              data-testid="hero-demo-phone">
              <PhoneFrame videoSrc={DEMO_VIDEO} poster={DEMO_POSTER}
                alt="Demo van SuriRent" width={240} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Stats strip
// =============================================================================
function StatsStrip() {
  const stats = [
    { v: '3', l: 'Valuta (SRD · EUR · USD)' },
    { v: '∞', l: 'Bedrijven (multi-tenant)' },
    { v: '24/7', l: 'Selfservice Kiosk' },
    { v: 'PWA', l: 'iOS · Android · Desktop' },
  ];
  return (
    <section className="py-16 lg:py-20 border-y border-slate-200/60 bg-white">
      <div className="max-w-7xl mx-auto px-5 lg:px-8">
        <p className="text-center text-xs font-bold tracking-[0.3em] uppercase text-slate-400 mb-8">
          Eén platform · alle vastgoedwerkzaamheden
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {stats.map((s) => (
            <div key={s.l} className="text-center">
              <p className="text-4xl lg:text-5xl font-black tracking-tighter text-slate-900">
                {s.v}
              </p>
              <p className="text-xs lg:text-sm text-slate-500 font-semibold mt-2">{s.l}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Features grid — 12 features
// =============================================================================
const FEATURES = [
  { icon: Building2, title: 'Multi-bedrijf SaaS', desc: 'White-label per bedrijf met eigen kleur, logo en sub-URL. Volledige data-isolatie tussen tenants.' },
  { icon: ScanLine, title: 'Kiosk PWA', desc: 'Selfservice terminal voor huurders met PIN-login. Werkt offline-first op tablet of telefoon.' },
  { icon: Calendar, title: '3-Bucket Facturen', desc: 'Automatische scheiding van achterstand, lopende maand en vooruit gefactureerde periodes.' },
  { icon: FileText, title: 'Betalingsregelingen', desc: 'Maak in één klik een afbetalingsregeling met automatische PDF-kwitanties per termijn.' },
  { icon: MessageCircle, title: 'Automatische herinneringen', desc: 'WhatsApp, e-mail en SMS bij vervaldatum en achterstand — geen handwerk meer.' },
  { icon: Globe, title: 'Multi-currency', desc: 'SRD, EUR en USD parallel — perfect voor mixed-portfolio en internationale huurders.' },
  { icon: ScanFace, title: 'OCR met Gemini AI', desc: 'Foto van bankafschrift → AI extraheert betaling automatisch. Klaar in seconden.' },
  { icon: Wallet, title: 'Kasgeld beheer', desc: 'Live overzicht van bank- en kassaldo per valuta. Met audit log van elke transactie.' },
  { icon: Shield, title: 'Werknemers + Goedkeuring', desc: 'Iedere medewerker eigen PIN, dual approval voor betalingen met handtekening.' },
  { icon: Users, title: 'Huurderportaal', desc: 'Eigen login voor huurders om facturen, contracten en onderhoud te bekijken.' },
  { icon: Smartphone, title: 'iOS · Android PWA', desc: 'Installeerbaar op elke telefoon — voelt als een native app, geen App Store nodig.' },
  { icon: QrCode, title: 'QR codes per appartement', desc: 'Scan-and-pay flow per huurder. Fysieke QR plaques worden AI-gegenereerd.' },
];

function FeaturesSection() {
  // Bento grid: groot featured tile + medium + smaller tiles voor visual interest.
  // Eerste 2 zijn "hero features" (groter), rest is standaard.
  const HERO_FEATURES = FEATURES.slice(0, 2);
  const REST_FEATURES = FEATURES.slice(2);
  return (
    <section id="features" className="py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-5 lg:px-8">
        <div className="max-w-3xl mb-14">
          <p className="text-xs font-black tracking-[0.3em] uppercase text-[#FF5C00] mb-3">Functies</p>
          <h2 className="text-3xl lg:text-5xl font-black tracking-tight text-slate-900 leading-tight">
            Alles wat u nodig heeft.
            <span className="text-slate-400 block">Niets dat u niet nodig heeft.</span>
          </h2>
        </div>

        {/* Bento rij 1 — 2 grote hero tiles (Multi-bedrijf + Kiosk PWA) */}
        <div className="grid lg:grid-cols-2 gap-4 lg:gap-5 mb-4 lg:mb-5">
          {HERO_FEATURES.map((f, idx) => {
            const Icon = f.icon;
            const isDark = idx === 1;
            return (
              <div key={f.title}
                data-testid={`feature-hero-${f.title.toLowerCase().replace(/\s+/g, '-')}`}
                className={`group relative p-8 lg:p-10 rounded-3xl overflow-hidden transition-all ${
                  isDark
                    ? 'bg-slate-950 text-white border border-slate-900 hover:shadow-[0_30px_60px_-20px_rgba(15,23,42,0.5)]'
                    : 'bg-gradient-to-br from-orange-50 via-white to-white border border-orange-100 hover:shadow-[0_30px_60px_-20px_rgba(255,92,0,0.15)]'
                }`}>
                {/* Decorative gradient orb */}
                <div className={`absolute -top-20 -right-20 w-72 h-72 rounded-full blur-3xl pointer-events-none ${
                  isDark ? 'opacity-20' : 'opacity-50'
                }`}
                  style={{ background: isDark ? '#FF5C00' : '#FFD1A8' }} />

                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 ${
                  isDark ? 'bg-white/10 backdrop-blur-sm border border-white/20' : 'bg-white shadow-[0_8px_20px_-8px_rgba(255,92,0,0.4)]'
                }`}>
                  <Icon className={`w-7 h-7 ${isDark ? 'text-[#FF8A3D]' : 'text-[#FF5C00]'}`} strokeWidth={2.2} />
                </div>
                <h3 className={`text-2xl lg:text-3xl font-black tracking-tight leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {f.title}
                </h3>
                <p className={`mt-3 text-base leading-relaxed max-w-md ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  {f.desc}
                </p>
                <div className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold"
                  style={{ color: isDark ? '#F8C260' : '#FF5C00' }}>
                  Meer info <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Bento rij 2 — 5 reguliere features in 5-col grid (10 items / 2 rijen) */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 lg:gap-5">
          {REST_FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title}
                data-testid={`feature-${f.title.toLowerCase().replace(/\s+/g, '-')}`}
                className="group p-5 rounded-2xl bg-white border border-slate-200/70 hover:border-orange-200 hover:shadow-[0_18px_40px_-12px_rgba(255,92,0,0.12)] transition-all">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-50 to-orange-100/40 border border-orange-100 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <Icon className="w-5 h-5 text-[#FF5C00]" strokeWidth={2.2} />
                </div>
                <h3 className="text-sm font-black text-slate-900 mb-1">{f.title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Video showcase — live demo van de app in actie
// =============================================================================
function VideoShowcase() {
  return (
    <section className="py-20 lg:py-28 bg-gradient-to-b from-white to-orange-50/40 overflow-hidden">
      <div className="max-w-7xl mx-auto px-5 lg:px-8">
        <div className="grid lg:grid-cols-[1fr,440px] gap-12 lg:gap-16 items-center">
          <div>
            <p className="text-xs font-black tracking-[0.3em] uppercase text-[#FF5C00] mb-3">Live demo</p>
            <h2 className="text-3xl lg:text-5xl font-black tracking-tight text-slate-900 leading-tight">
              Zie SuriRent
              <span className="block text-slate-400">in actie.</span>
            </h2>
            <p className="mt-5 text-base lg:text-lg text-slate-600 font-medium leading-relaxed max-w-xl">
              Een echte opname van de app op een telefoon. Van overzicht tot factuur,
              van Kiosk tot betalingsregeling — alles wat uw vastgoedbedrijf nodig heeft,
              ontworpen voor één-hand bediening.
            </p>
            <ul className="mt-7 space-y-3 max-w-md">
              {[
                ['Real-time KPI dashboard', 'Zie kas, achterstand en activiteit live'],
                ['Multi-currency boekhouding', 'SRD, EUR en USD naast elkaar'],
                ['Touchscreen optimized', 'Bedien alles met één duim'],
              ].map(([t, d]) => (
                <li key={t} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-orange-100 text-[#FF5C00] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-4 h-4" strokeWidth={3} />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900">{t}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{d}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative flex justify-center">
            {/* Achtergrond glow */}
            <div className="absolute inset-0 -z-10 flex items-center justify-center">
              <div className="w-[420px] h-[420px] rounded-full opacity-50 blur-3xl"
                style={{ background: 'radial-gradient(circle, #FF8A3D, transparent 70%)' }} />
            </div>
            <PhoneFrame videoSrc={DEMO_VIDEO} poster={DEMO_POSTER}
              alt="SuriRent live demo" width={360} />
            {/* Live badge */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-full bg-slate-900 text-white text-[10px] font-black tracking-[0.18em] uppercase shadow-lg flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live opname
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Showcase — desktop screenshots carousel
// =============================================================================
const SHOWCASE_SLIDES = [
  { src: SHOTS.overzicht, title: 'Overzicht', desc: 'Realtime KPI\'s — kas saldo per valuta, openstaande facturen, achterstand en activiteit.' },
  { src: SHOTS.locaties, title: 'Locaties', desc: 'Groepeer appartementen per locatie. Perfect voor multi-vestiging vastgoed.' },
  { src: SHOTS.appartementen, title: 'Appartementen', desc: 'Per eenheid: huurder, maandhuur, status, smart breakers en QR code.' },
  { src: SHOTS.betalingen, title: 'Betalingen', desc: 'Volledige kwitantie-log met PDF, e-mail, beveiligings-stempel en verwijderen.' },
  { src: SHOTS.facturen, title: 'Facturen', desc: 'Automatische generatie per maand. Achterstand · lopend · betaald in één view.' },
];

function ShowcaseSection() {
  const [idx, setIdx] = useState(0);
  const slide = SHOWCASE_SLIDES[idx];
  return (
    <section id="showcase" className="py-20 lg:py-28 bg-gradient-to-b from-slate-50 via-orange-50/30 to-slate-50">
      <div className="max-w-7xl mx-auto px-5 lg:px-8">
        <div className="max-w-3xl mb-12">
          <p className="text-xs font-black tracking-[0.3em] uppercase text-[#FF5C00] mb-3">Beheer Suite</p>
          <h2 className="text-3xl lg:text-5xl font-black tracking-tight text-slate-900 leading-tight">
            Eén dashboard.
            <span className="text-slate-400 block">Alle vastgoed-data op één plek.</span>
          </h2>
        </div>
        <div className="grid lg:grid-cols-[280px,1fr] gap-8 lg:gap-12 items-start">
          {/* Tabs sidebar */}
          <div className="space-y-2" data-testid="showcase-tabs">
            {SHOWCASE_SLIDES.map((s, i) => (
              <button key={s.title} onClick={() => setIdx(i)}
                data-testid={`showcase-tab-${s.title.toLowerCase()}`}
                className={`w-full text-left p-4 rounded-xl border transition-all ${
                  i === idx
                    ? 'bg-white border-[#FF5C00] shadow-[0_8px_24px_-8px_rgba(255,92,0,0.25)]'
                    : 'bg-white/40 border-transparent hover:bg-white/70 hover:border-slate-200'
                }`}>
                <div className="flex items-center justify-between">
                  <p className={`text-sm font-black ${i === idx ? 'text-slate-900' : 'text-slate-600'}`}>
                    {s.title}
                  </p>
                  {i === idx && <ChevronRight className="w-4 h-4 text-[#FF5C00]" />}
                </div>
                <p className={`text-xs mt-1 leading-relaxed ${i === idx ? 'text-slate-600' : 'text-slate-400'}`}>
                  {s.desc}
                </p>
              </button>
            ))}
          </div>
          {/* Active screenshot */}
          <div className="relative">
            <BrowserFrame src={slide.src} alt={slide.title} />
          </div>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Kiosk section — iPhone mockups in a row
// =============================================================================
function KioskSection() {
  const tablets = [
    { src: SHOTS.kioskLoc, label: '1. Locatie kiezen', desc: 'Huurder tikt zijn complex aan op het startscherm.' },
    { src: SHOTS.kioskApt, label: '2. Appartement kiezen', desc: 'Selecteer de juiste unit voor het verschuldigde bedrag.' },
    { src: SHOTS.kioskOverview, label: '3. Bedrag bekijken', desc: 'Klaar overzicht: achterstand, lopende maand, vooruit.' },
    { src: SHOTS.kioskNumpad, label: '4. Betalen', desc: 'Touchscreen numpad voor cash of partial betalingen.' },
  ];
  return (
    <section id="kiosk" className="py-20 lg:py-28 bg-slate-950 text-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-5 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <p className="text-xs font-black tracking-[0.3em] uppercase mb-3"
            style={{ color: '#F8C260' }}>Kiosk PWA</p>
          <h2 className="text-3xl lg:text-5xl font-black tracking-tight leading-tight">
            Selfservice in 4 stappen.
            <span className="block mt-1"
              style={{
                background: 'linear-gradient(90deg, #F8C260, #FF8A3D, #FF5C00)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>Voor élke huurder.</span>
          </h2>
          <p className="mt-5 text-base lg:text-lg text-slate-400 font-medium">
            Werkt op tablet, telefoon én desktop. Geen App Store. Installeer in 1 tik.
            Achterstand, lopende maand en boetes — duidelijk en met groot lettertype.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-6 lg:gap-8">
          {tablets.map((t, i) => (
            <div key={t.label} className="space-y-4" data-testid={`kiosk-step-${i}`}>
              <TabletFrame src={t.src} alt={t.label} />
              <div>
                <p className="text-base font-black text-white">{t.label}</p>
                <p className="text-sm text-slate-400 mt-1">{t.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-12 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10">
            <Sparkles className="w-4 h-4" style={{ color: '#F8C260' }} />
            <span className="text-sm font-semibold text-white/80">
              Inclusief Gemini AI OCR voor automatische betaling vanaf bankafschriften
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Pricing — 3 tiers
// =============================================================================
const PLANS = [
  {
    name: 'Starter', price: '450', sub: 'SRD / maand',
    desc: 'Voor kleine vastgoedbedrijven met max. 25 huurders.',
    features: ['Tot 25 huurders', '1 locatie', 'Beheer + Kiosk PWA', 'WhatsApp herinneringen', 'PDF kwitanties', 'E-mail support'],
    cta: 'Start gratis trial',
  },
  {
    name: 'Pro', price: '950', sub: 'SRD / maand', highlight: true,
    desc: 'Voor groeiende vastgoedbedrijven die alles willen automatiseren.',
    features: ['Tot 100 huurders', 'Onbeperkt locaties', 'OCR via Gemini AI', 'Werknemers + goedkeuringen', 'Multi-currency', 'White-label branding', 'Telefonische support'],
    cta: 'Demo aanvragen',
  },
  {
    name: 'Enterprise', price: 'Custom', sub: 'op aanvraag',
    desc: 'Voor grote portfolios met aangepaste integraties.',
    features: ['Onbeperkt huurders', 'Custom integraties', 'Shelly smart breakers', 'Dedicated server', 'SLA + 24/7 support', 'Onboarding manager'],
    cta: 'Neem contact op',
  },
];

function PricingSection({ onDemo, onWhatsApp }) {
  return (
    <section id="pricing" className="py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-5 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <p className="text-xs font-black tracking-[0.3em] uppercase text-[#FF5C00] mb-3">Prijzen</p>
          <h2 className="text-3xl lg:text-5xl font-black tracking-tight text-slate-900 leading-tight">
            Transparant. Eerlijk.
            <span className="text-slate-400 block">Schaalt mee met uw bedrijf.</span>
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {PLANS.map((p) => (
            <div key={p.name}
              data-testid={`plan-${p.name.toLowerCase()}`}
              className={`relative rounded-3xl p-7 border transition-all ${
                p.highlight
                  ? 'bg-slate-900 border-slate-900 text-white shadow-[0_30px_60px_-20px_rgba(15,23,42,0.5)] md:-translate-y-3'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}>
              {p.highlight && (
                <div className="absolute top-0 right-7 -translate-y-1/2 px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase shadow-lg"
                  style={{ background: 'linear-gradient(135deg, #F8C260, #FF5C00)', color: '#1A1208' }}>
                  Meest gekozen
                </div>
              )}
              <p className={`text-sm font-black ${p.highlight ? 'text-orange-300' : 'text-[#FF5C00]'}`}>
                {p.name}
              </p>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className={`text-5xl font-black tracking-tighter ${p.highlight ? 'text-white' : 'text-slate-900'}`}>
                  {p.price === 'Custom' ? 'Custom' : `${p.price}`}
                </span>
                {p.price !== 'Custom' && (
                  <span className={`text-sm font-bold ${p.highlight ? 'text-slate-400' : 'text-slate-500'}`}>
                    {p.sub}
                  </span>
                )}
              </div>
              <p className={`mt-3 text-sm leading-relaxed ${p.highlight ? 'text-slate-400' : 'text-slate-600'}`}>
                {p.desc}
              </p>
              <button
                onClick={p.name === 'Enterprise' ? onWhatsApp : onDemo}
                data-testid={`plan-cta-${p.name.toLowerCase()}`}
                className={`mt-6 w-full h-11 rounded-full text-sm font-bold transition-colors ${
                  p.highlight
                    ? 'bg-white text-slate-900 hover:bg-slate-100'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}>
                {p.cta} →
              </button>
              <ul className="mt-7 space-y-2.5">
                {p.features.map((f) => (
                  <li key={f} className={`text-sm flex items-start gap-2 ${p.highlight ? 'text-slate-300' : 'text-slate-700'}`}>
                    <Check className={`w-4 h-4 mt-0.5 shrink-0 ${p.highlight ? 'text-orange-300' : 'text-emerald-600'}`} strokeWidth={3} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// FAQ
// =============================================================================
const FAQS = [
  { q: 'Hoe lang duurt het om mijn vastgoedbedrijf op te zetten?',
    a: 'Met onze Setup Wizard bent u binnen 30 minuten live: locaties, appartementen, huurders, eerste facturen — allemaal stap voor stap. We helpen bij OCR-import van uw huidige Excel-bestanden.' },
  { q: 'Werkt het systeem op iPhone en Android?',
    a: 'Ja. Het is een PWA — installeer hem direct via Safari (iOS) of Chrome (Android). U krijgt een echte app op uw startscherm zonder via de App Store te gaan.' },
  { q: 'Kan ik mijn eigen huisstijl gebruiken?',
    a: 'Volledig white-label. Upload uw logo, kies uw kleur, en zowel het Beheer als het Kiosk-scherm dragen uw branding. Uw huurders zien geen "SuriRent" — alleen úw bedrijf.' },
  { q: 'Hoe veilig is mijn data?',
    a: 'Multi-tenant isolatie op database-niveau. Auth via bcrypt + JWT. Goedkeuringsworkflow met handtekening voor betalingen. Audit log van elke wijziging.' },
  { q: 'Kan ik later opzeggen?',
    a: 'Maandelijks opzegbaar. Geen lock-in. U kunt al uw data exporteren naar Excel/PDF wanneer u maar wilt.' },
];

function FAQSection() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="py-20 lg:py-28 bg-orange-50/40">
      <div className="max-w-3xl mx-auto px-5 lg:px-8">
        <div className="text-center mb-12">
          <p className="text-xs font-black tracking-[0.3em] uppercase text-[#FF5C00] mb-3">Veelgestelde vragen</p>
          <h2 className="text-3xl lg:text-5xl font-black tracking-tight text-slate-900 leading-tight">
            Antwoorden op uw vragen.
          </h2>
        </div>
        <div className="space-y-3">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={i} className={`rounded-2xl border transition-all ${
                isOpen ? 'bg-white border-slate-300 shadow-[0_8px_24px_-12px_rgba(15,23,42,0.15)]' : 'bg-white/60 border-slate-200/60'
              }`}>
                <button onClick={() => setOpen(isOpen ? -1 : i)}
                  data-testid={`faq-${i}`}
                  className="w-full text-left p-5 flex items-center justify-between gap-4">
                  <p className="text-base font-black text-slate-900">{f.q}</p>
                  {isOpen
                    ? <ChevronUp className="w-5 h-5 text-[#FF5C00] shrink-0" />
                    : <ChevronDown className="w-5 h-5 text-slate-400 shrink-0" />}
                </button>
                {isOpen && (
                  <div className="px-5 pb-5">
                    <p className="text-sm text-slate-600 leading-relaxed">{f.a}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// CTA banner
// =============================================================================
function CTABanner({ onDemo, onWhatsApp }) {
  return (
    <section className="py-20 lg:py-28">
      <div className="max-w-6xl mx-auto px-5 lg:px-8">
        <div className="relative rounded-3xl overflow-hidden p-10 lg:p-16 text-white"
          style={{
            background: 'radial-gradient(circle at 0% 0%, #FF8A3D 0%, #FF5C00 40%, #C74600 80%, #5C2300 100%)',
          }}>
          {/* Grid overlay */}
          <div className="absolute inset-0 opacity-[0.08] pointer-events-none"
            style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }} />
          <div className="relative max-w-2xl">
            <p className="text-xs font-black tracking-[0.3em] uppercase text-white/80 mb-3">
              Klaar om te beginnen?
            </p>
            <h2 className="text-3xl lg:text-5xl font-black tracking-tight leading-tight">
              Digitaliseer uw vastgoed.
              <span className="block opacity-80">Vandaag nog.</span>
            </h2>
            <p className="mt-5 text-base lg:text-lg text-white/90 max-w-xl">
              Probeer SuriRent gratis in onze gedeelde demo-omgeving — geen registratie nodig.
              Of plan een persoonlijke demo via WhatsApp.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <button onClick={onDemo} data-testid="cta-banner-demo"
                className="h-12 px-7 rounded-full bg-white text-slate-900 text-base font-bold hover:bg-slate-100 transition-colors flex items-center justify-center gap-2">
                Demo proberen <ArrowRight className="w-5 h-5" />
              </button>
              <button onClick={onWhatsApp} data-testid="cta-banner-whatsapp"
                className="h-12 px-7 rounded-full bg-slate-900/20 hover:bg-slate-900/30 border border-white/30 text-white text-base font-bold transition-colors flex items-center justify-center gap-2 backdrop-blur-sm">
                <MessageCircle className="w-5 h-5" /> WhatsApp ons
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Footer
// =============================================================================
function Footer({ onLogin }) {
  return (
    <footer id="contact" className="bg-slate-950 text-slate-400">
      <div className="max-w-7xl mx-auto px-5 lg:px-8 py-14 lg:py-20">
        <div className="grid md:grid-cols-4 gap-10">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#FF8A3D] to-[#C74600] p-1.5">
                <img src="/kiosk-icons/mark-white.png" alt="" className="w-full h-full object-contain" />
              </span>
              <span className="text-base font-black tracking-tight text-white">
                <span>Suri</span><span className="text-[#FF8A3D]">Rent</span>
              </span>
            </div>
            <p className="text-sm leading-relaxed max-w-md">
              Het volledige vastgoedplatform voor Surinaamse verhuurders.
              White-label SaaS met Kiosk, automatische facturatie en AI-powered OCR.
            </p>
            <div className="mt-6 flex items-center gap-3">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span className="text-xs font-semibold tracking-widest uppercase">Paramaribo · Suriname</span>
            </div>
          </div>
          <div>
            <p className="text-xs font-black tracking-[0.22em] uppercase text-white mb-4">Product</p>
            <ul className="space-y-2.5 text-sm">
              <li><a href="#features" className="hover:text-white transition-colors">Functies</a></li>
              <li><a href="#showcase" className="hover:text-white transition-colors">Beheer Suite</a></li>
              <li><a href="#kiosk" className="hover:text-white transition-colors">Kiosk PWA</a></li>
              <li><a href="#pricing" className="hover:text-white transition-colors">Prijzen</a></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-black tracking-[0.22em] uppercase text-white mb-4">Contact</p>
            <ul className="space-y-2.5 text-sm">
              <li className="flex items-center gap-2"><Mail className="w-4 h-4" /> info@surirent.sr</li>
              <li className="flex items-center gap-2"><Phone className="w-4 h-4" /> +597 XXX XXX</li>
              <li className="flex items-center gap-2"><MapPin className="w-4 h-4" /> Paramaribo, SR</li>
              <li className="pt-2">
                <button onClick={onLogin} data-testid="footer-login"
                  className="text-[#FF8A3D] hover:text-orange-300 font-bold">
                  Beheerder inloggen →
                </button>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-12 pt-8 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-slate-500">
            © {new Date().getFullYear()} SuriRent. Alle rechten voorbehouden.
          </p>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-slate-500">Alle systemen operationeel</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

// =============================================================================
// Main export
// =============================================================================
export default function MarketingLandingV2() {
  const navigate = useNavigate();

  useEffect(() => {
    document.body.style.backgroundColor = '#FAFAF7';
    return () => { document.body.style.backgroundColor = ''; };
  }, []);

  // Auto-redirect to /login when launched as installed PWA.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('landing') === '1') return;
      const isStandalone =
        window.matchMedia?.('(display-mode: standalone)').matches
        || window.navigator.standalone === true
        || params.get('source') === 'pwa';
      if (isStandalone) {
        const target = appLink('/login');
        if (target.startsWith('http')) window.location.replace(target);
        else navigate(target, { replace: true });
      }
    } catch { /* ignore */ }
  }, [navigate]);

  const onLogin = () => {
    const t = appLink('/login');
    if (t.startsWith('http')) window.location.href = t;
    else navigate(t);
  };
  const onDemo = onLogin; // Login page heeft al een Demo knop
  const onWhatsApp = () => {
    // Vervang dit nummer met daadwerkelijk WhatsApp nummer
    window.open('https://wa.me/597XXXXXXX?text=Ik%20wil%20graag%20een%20demo%20van%20SuriRent', '_blank');
  };

  return (
    <div className="min-h-screen text-slate-900 antialiased selection:bg-[#FF5C00] selection:text-white"
      style={{ background: '#FAFAF7' }}>
      <TopNav onLogin={onLogin} onDemo={onDemo} />
      <Hero onDemo={onDemo} onWhatsApp={onWhatsApp} />
      <StatsStrip />
      <FeaturesSection />
      <VideoShowcase />
      <ShowcaseSection />
      <KioskSection />
      <PricingSection onDemo={onDemo} onWhatsApp={onWhatsApp} />
      <FAQSection />
      <CTABanner onDemo={onDemo} onWhatsApp={onWhatsApp} />
      <Footer onLogin={onLogin} />
    </div>
  );
}
