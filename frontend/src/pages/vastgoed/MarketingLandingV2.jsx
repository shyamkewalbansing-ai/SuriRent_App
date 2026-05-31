// Local Hero Premium SaaS — v10 redesign (2026-05-31).
// Warme aardetinten · Surinaams trots · goud + oranje · premium SaaS feel.
// Palette:
//   Cream surface:    #FDF6EC / #FAF1E1
//   Deep chocolate:   #1F1308 / #3D2817
//   Burnt orange:     #FF5C00 / #C74600
//   Gold:             #F8C260 / #D4A037 / #B8860B
//   Terracotta:       #C2410C / #A0522D
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { appLink } from '../../lib/env';
import {
  Menu, X, ArrowRight, ArrowUpRight, Check, Star, MessageCircle,
  Mail, Phone, MapPin, ChevronDown, ChevronUp,
} from 'lucide-react';

const SHOTS = {
  overzicht:     'https://customer-assets.emergentagent.com/job_vastgoed-app/artifacts/7sx9hgg7_1.png',
  locaties:      'https://customer-assets.emergentagent.com/job_vastgoed-app/artifacts/nlo3hnqf_2.png',
  appartementen: 'https://customer-assets.emergentagent.com/job_vastgoed-app/artifacts/sy8hpkqs_3.png',
  betalingen:    'https://customer-assets.emergentagent.com/job_vastgoed-app/artifacts/dwbjqd89_4.png',
  facturen:      'https://customer-assets.emergentagent.com/job_vastgoed-app/artifacts/mfvavq0r_5.png',
  kioskLoc:      'https://customer-assets.emergentagent.com/job_vastgoed-app/artifacts/7eebv0bd_11.png',
  kioskApt:      'https://customer-assets.emergentagent.com/job_vastgoed-app/artifacts/n7efnoh0_12.png',
  kioskOverview: 'https://customer-assets.emergentagent.com/job_vastgoed-app/artifacts/t334vu2t_13.png',
  kioskNumpad:   'https://customer-assets.emergentagent.com/job_vastgoed-app/artifacts/mjshklb8_14.png',
};

// =============================================================================
// Premium browser frame met warme cream tinten
// =============================================================================
function BrowserFrame({ src, alt, className = '' }) {
  return (
    <div className={`relative rounded-2xl overflow-hidden bg-[#FBF1E0] border border-[#E8D9BF]/60 shadow-[0_30px_80px_-20px_rgba(61,40,23,0.25)] ${className}`}>
      <div className="h-9 bg-gradient-to-b from-[#FAF1E1] to-[#F2E2C5] border-b border-[#E8D9BF]/60 flex items-center px-4 gap-3">
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#FF5F57]" />
          <span className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
          <span className="w-3 h-3 rounded-full bg-[#28C840]" />
        </div>
        <div className="flex-1 flex justify-center">
          <span className="text-[10px] font-semibold text-[#3D2817]/60 px-3 py-1 rounded-md bg-white/60 border border-[#E8D9BF]/60">
            app.surirent.sr
          </span>
        </div>
      </div>
      <img src={src} alt={alt} loading="lazy" className="w-full block bg-white" />
    </div>
  );
}

// =============================================================================
// Premium tablet frame
// =============================================================================
function TabletFrame({ src, alt, className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <div className="relative rounded-[1.75rem] bg-[#1F1308] p-2 shadow-[0_30px_60px_-15px_rgba(31,19,8,0.5)]">
        <div className="relative rounded-[1.25rem] overflow-hidden bg-white aspect-[1920/950]">
          <img src={src} alt={alt} loading="lazy"
            className="w-full h-full object-cover object-top" />
        </div>
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-14 h-1 rounded-full bg-[#D4A037]/40" />
      </div>
    </div>
  );
}

// =============================================================================
// Top Navigation — premium glass-blur cream
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
  const items = [
    { id: 'features', label: 'Functies' },
    { id: 'kiosk',    label: 'Kiosk' },
    { id: 'pricing',  label: 'Prijzen' },
    { id: 'faq',      label: 'FAQ' },
  ];
  return (
    <header className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
      scrolled ? 'bg-[#FDF6EC]/85 backdrop-blur-xl border-b border-[#E8D9BF]/60' : 'bg-transparent'
    }`} data-testid="marketing-topnav">
      <div className="max-w-7xl mx-auto px-5 lg:px-8 h-16 flex items-center justify-between">
        <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="flex items-center gap-2.5" data-testid="topnav-logo">
          <span className="w-9 h-9 rounded-xl p-1.5 shadow-[0_8px_18px_-6px_rgba(255,92,0,0.45)]"
            style={{ background: 'linear-gradient(135deg, #FF8A3D 0%, #C74600 100%)' }}>
            <img src="/kiosk-icons/mark-white.png" alt="" className="w-full h-full object-contain" />
          </span>
          <span className="text-base font-black tracking-tight text-[#1F1308]">
            Suri<span className="text-[#C74600]">Rent</span>
          </span>
        </button>
        <nav className="hidden md:flex items-center gap-8">
          {items.map((n) => (
            <button key={n.id} onClick={() => goTo(n.id)}
              data-testid={`topnav-${n.id}`}
              className="text-sm font-semibold text-[#3D2817] hover:text-[#C74600] transition-colors">
              {n.label}
            </button>
          ))}
        </nav>
        <div className="hidden md:flex items-center gap-3">
          <button onClick={onLogin} data-testid="topnav-login"
            className="text-sm font-bold text-[#3D2817] hover:text-[#1F1308]">
            Inloggen
          </button>
          <button onClick={onDemo} data-testid="topnav-demo"
            className="h-10 px-5 rounded-full text-white text-sm font-bold flex items-center gap-1.5 transition-all hover:scale-105 shadow-[0_10px_24px_-8px_rgba(255,92,0,0.45)]"
            style={{ background: 'linear-gradient(135deg, #FF8A3D 0%, #C74600 100%)' }}>
            Demo proberen <ArrowRight className="w-4 h-4" />
          </button>
        </div>
        <button onClick={() => setOpen(!open)}
          data-testid="topnav-mobile-toggle"
          className="md:hidden w-10 h-10 rounded-lg hover:bg-[#F5E6D3] flex items-center justify-center text-[#3D2817]">
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>
      {open && (
        <div className="md:hidden bg-[#FDF6EC] border-t border-[#E8D9BF]/60 px-5 py-4 space-y-1">
          {items.map((n) => (
            <button key={n.id} onClick={() => goTo(n.id)}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-bold text-[#3D2817] hover:bg-[#F5E6D3]">
              {n.label}
            </button>
          ))}
          <div className="pt-3 border-t border-[#E8D9BF]/60 grid grid-cols-2 gap-2">
            <button onClick={onLogin} className="h-10 rounded-full border border-[#3D2817] text-sm font-bold text-[#3D2817]">Inloggen</button>
            <button onClick={onDemo} className="h-10 rounded-full text-white text-sm font-bold"
              style={{ background: 'linear-gradient(135deg, #FF8A3D 0%, #C74600 100%)' }}>Demo</button>
          </div>
        </div>
      )}
    </header>
  );
}

// =============================================================================
// Hero — warme cream gradient, premium typo, gouden accent, hero mockup rechts
// =============================================================================
function Hero({ onDemo, onWhatsApp }) {
  return (
    <section className="relative pt-32 lg:pt-36 pb-20 lg:pb-28 overflow-hidden">
      {/* Warm gradient: cream → peach → ivory */}
      <div className="absolute inset-0 -z-10"
        style={{
          background: 'linear-gradient(165deg, #FDF6EC 0%, #FAEAD0 35%, #F5E6D3 65%, #FDF6EC 100%)',
        }} />
      {/* Decorative gold glow blobs */}
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-32 w-[700px] h-[700px] rounded-full opacity-50 blur-3xl"
          style={{ background: 'radial-gradient(circle, #F8C260 0%, transparent 65%)' }} />
        <div className="absolute -bottom-40 -left-32 w-[600px] h-[600px] rounded-full opacity-30 blur-3xl"
          style={{ background: 'radial-gradient(circle, #FF8A3D 0%, transparent 70%)' }} />
        {/* Tropical leaf SVG silhouette as subtle texture */}
        <svg className="absolute top-10 right-20 w-64 h-64 opacity-[0.08]" viewBox="0 0 100 100" fill="#3D2817">
          <path d="M50 5 Q30 20 25 50 Q20 75 50 95 Q80 75 75 50 Q70 20 50 5 Z M50 15 Q35 25 35 50 Q35 75 50 85 Q65 75 65 50 Q65 25 50 15 Z" />
        </svg>
      </div>

      <div className="max-w-7xl mx-auto px-5 lg:px-8">
        <div className="grid lg:grid-cols-[1.05fr,1fr] gap-12 lg:gap-16 items-center">
          {/* LEFT — copy */}
          <div className="relative z-10">
            {/* SR pride badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/70 backdrop-blur-sm border border-[#E8D9BF] shadow-sm mb-7"
              data-testid="hero-badge">
              <span className="text-base">🇸🇷</span>
              <span className="text-xs font-black text-[#1F1308] tracking-[0.22em] uppercase">
                Gemaakt in Suriname
              </span>
              <span className="w-1 h-1 rounded-full bg-[#D4A037]" />
              <span className="text-xs font-bold text-[#3D2817]/70">2026</span>
            </div>

            <h1 className="font-black tracking-[-0.04em] leading-[0.95] text-[#1F1308]"
              style={{
                fontSize: 'clamp(3rem, 7vw, 6.5rem)',
                fontFamily: "'Outfit', 'Inter', sans-serif",
              }}
              data-testid="hero-title">
              Vastgoed beheren,
              <br />
              <span className="relative inline-block">
                <span className="relative z-10 italic"
                  style={{
                    background: 'linear-gradient(135deg, #F8C260 0%, #D4A037 50%, #B8860B 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}>
                  zoals het hoort.
                </span>
              </span>
            </h1>

            <p className="mt-7 text-base lg:text-lg text-[#3D2817]/75 font-medium max-w-xl leading-relaxed"
              data-testid="hero-subtitle">
              Het volledige platform voor Surinaamse vastgoedbedrijven. Beheer, facturatie,
              kiosk en huurdersbetalingen — alles op één plek, ontworpen voor Paramaribo.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-start gap-3">
              <button onClick={onDemo} data-testid="hero-cta-demo"
                className="h-13 px-7 py-3.5 rounded-2xl text-white text-base font-black flex items-center gap-2 shadow-[0_20px_40px_-12px_rgba(199,70,0,0.5)] transition-all hover:scale-[1.02] hover:shadow-[0_24px_48px_-12px_rgba(199,70,0,0.65)]"
                style={{ background: 'linear-gradient(135deg, #FF8A3D 0%, #FF5C00 55%, #C74600 100%)' }}>
                Demo proberen <ArrowRight className="w-5 h-5" />
              </button>
              <button onClick={onWhatsApp} data-testid="hero-cta-whatsapp"
                className="h-13 px-7 py-3.5 rounded-2xl bg-white hover:bg-[#FBF1E0] border border-[#3D2817]/15 text-[#1F1308] text-base font-bold flex items-center gap-2 transition-all shadow-sm">
                <MessageCircle className="w-5 h-5 text-emerald-600" /> WhatsApp ons
              </button>
            </div>

            {/* Social proof */}
            <div className="mt-9 flex items-center gap-5" data-testid="hero-proof">
              <div className="flex items-center gap-1">
                {[0,1,2,3,4].map((i) => (
                  <Star key={i} className="w-4 h-4 fill-[#D4A037] text-[#D4A037]" />
                ))}
              </div>
              <div className="h-8 w-px bg-[#3D2817]/15" />
              <p className="text-xs font-bold text-[#3D2817]/70">
                <span className="text-[#1F1308] font-black">5.0</span> · Surinaams gebouwd, lokaal vertrouwd
              </p>
            </div>
          </div>

          {/* RIGHT — Hero mockup met decoratieve gouden lijst */}
          <div className="relative">
            {/* Gouden gradient border behind mockup */}
            <div className="absolute -inset-2 rounded-3xl opacity-30 blur-lg -z-10"
              style={{ background: 'linear-gradient(135deg, #F8C260 0%, #FF5C00 60%, #C74600 100%)' }} />
            <BrowserFrame src={SHOTS.overzicht} alt="Beheer Suite — Overzicht" />
            {/* Floating mini callout — bottom-left */}
            <div className="hidden md:flex absolute -bottom-6 -left-4 lg:-left-8 z-10 items-center gap-3 px-4 py-3 rounded-2xl bg-white border border-[#E8D9BF] shadow-[0_18px_40px_-12px_rgba(61,40,23,0.25)]">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'linear-gradient(135deg, #F8C260 0%, #D4A037 100%)' }}>
                <Check className="w-5 h-5 text-[#1F1308]" strokeWidth={3.5} />
              </div>
              <div>
                <p className="text-sm font-black text-[#1F1308]">Volledige Beheer</p>
                <p className="text-[11px] text-[#3D2817]/60 font-semibold">12+ modules · 1 platform</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Stats strip — premium minimal met dividers
// =============================================================================
function StatsStrip() {
  const stats = [
    { v: '∞',    l: 'Bedrijven',           s: 'Multi-tenant SaaS' },
    { v: '3',    l: 'Valuta',              s: 'SRD · EUR · USD' },
    { v: '24/7', l: 'Kiosk PWA',           s: 'Selfservice' },
    { v: 'AI',   l: 'OCR Betalingen',      s: 'Gemini 2.5 Flash' },
  ];
  return (
    <section className="py-14 lg:py-20 bg-white relative">
      <div className="absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, #D4A037, transparent)' }} />
      <div className="max-w-6xl mx-auto px-5 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-y-10">
          {stats.map((s, i) => (
            <div key={s.l} className={`text-center ${i < stats.length - 1 ? 'md:border-r md:border-[#E8D9BF]/60' : ''}`}>
              <p className="text-5xl lg:text-6xl font-black tracking-tighter"
                style={{
                  background: 'linear-gradient(180deg, #1F1308 0%, #3D2817 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}>
                {s.v}
              </p>
              <p className="mt-3 text-sm font-black text-[#1F1308] uppercase tracking-wider">{s.l}</p>
              <p className="text-xs text-[#3D2817]/60 font-semibold mt-0.5">{s.s}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Editorial Features — alterneren tekst ↔ screenshot per rij, warme cream tint
// =============================================================================
const EDITORIAL_FEATURES = [
  {
    eyebrow: 'Beheer Suite',
    title: 'Eén dashboard. Alle vastgoed-data.',
    desc: 'Bekijk realtime kas saldo, openstaande facturen, achterstand en activiteit in één strak overzicht. Multi-currency support voor SRD, EUR en USD parallel.',
    bullets: ['Live kas saldo per valuta', 'Achterstand & openstaand overzicht', 'Quick actions binnen handbereik'],
    img: SHOTS.overzicht,
    accentBg: '#FAEAD0',
  },
  {
    eyebrow: 'Locaties',
    title: 'Groepeer per vestiging of complex.',
    desc: 'Beheer meerdere locaties tegelijkertijd. Foto en adres per vestiging, drill-down naar individuele units. Perfect voor groeiende portfolios in Paramaribo.',
    bullets: ['Onbeperkt locaties per bedrijf', 'Foto + adres per locatie', 'Drill-down naar units'],
    img: SHOTS.locaties,
    accentBg: '#F5E6D3',
  },
  {
    eyebrow: 'Appartementen',
    title: 'Eenheidbeheer in detail.',
    desc: 'Per appartement: huurder, maandhuur, status, foto en QR code. Smart breaker integratie via Shelly voor remote toegang. Volledige onderhoudshistorie.',
    bullets: ['Huurder · huur · status per unit', 'QR code per appartement', 'Smart breaker integratie'],
    img: SHOTS.appartementen,
    accentBg: '#FAEAD0',
  },
  {
    eyebrow: 'Betalingen',
    title: 'Kwitanties · OCR · WhatsApp.',
    desc: 'Elke betaling automatisch geboekt met PDF-kwitantie, e-mail-bevestiging en audit log. Gemini AI OCR voor automatische import van bankafschriften.',
    bullets: ['PDF kwitantie per betaling', 'Gemini AI OCR upload', 'WhatsApp + e-mail verzending'],
    img: SHOTS.betalingen,
    accentBg: '#F5E6D3',
  },
  {
    eyebrow: 'Facturen',
    title: '3-bucket factuur logica.',
    desc: 'Automatische scheiding van achterstand, lopende maand en vooruit gefactureerde periodes. Met betalingsregelingen en PDF kwitanties per termijn.',
    bullets: ['Achterstand · lopend · vooruit', 'Auto-generate maandelijks', 'Betalingsregelingen ondersteund'],
    img: SHOTS.facturen,
    accentBg: '#FAEAD0',
  },
];

function EditorialFeatures() {
  return (
    <section id="features" className="py-20 lg:py-32 bg-[#FDF6EC] relative overflow-hidden">
      {/* subtle gold pattern */}
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none -z-10"
        style={{
          backgroundImage: 'radial-gradient(circle, #D4A037 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }} />

      <div className="max-w-7xl mx-auto px-5 lg:px-8">
        <div className="max-w-3xl mb-16 lg:mb-24">
          <p className="text-xs font-black tracking-[0.3em] uppercase text-[#C74600] mb-3">Functies</p>
          <h2 className="text-3xl lg:text-5xl font-black tracking-tight text-[#1F1308] leading-tight"
            style={{ fontFamily: "'Outfit', sans-serif" }}>
            Alles wat uw vastgoed nodig heeft.
            <span className="block mt-1"
              style={{
                background: 'linear-gradient(135deg, #F8C260 0%, #D4A037 60%, #B8860B 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>In één platform.</span>
          </h2>
        </div>

        <div className="space-y-20 lg:space-y-28">
          {EDITORIAL_FEATURES.map((f, i) => {
            const reverse = i % 2 === 1;
            return (
              <div key={f.title}
                data-testid={`editorial-feature-${i}`}
                className={`grid lg:grid-cols-2 gap-10 lg:gap-16 items-center ${reverse ? 'lg:grid-flow-dense' : ''}`}>
                <div className={reverse ? 'lg:col-start-2' : ''}>
                  <div className="inline-flex items-center gap-2 mb-4">
                    <span className="w-8 h-px bg-[#D4A037]" />
                    <p className="text-xs font-black tracking-[0.3em] uppercase text-[#C74600]">
                      {f.eyebrow}
                    </p>
                  </div>
                  <h3 className="text-3xl lg:text-4xl font-black tracking-tight text-[#1F1308] leading-tight"
                    style={{ fontFamily: "'Outfit', sans-serif" }}>
                    {f.title}
                  </h3>
                  <p className="mt-5 text-base lg:text-lg text-[#3D2817]/75 leading-relaxed max-w-lg">
                    {f.desc}
                  </p>
                  <ul className="mt-7 space-y-3">
                    {f.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-3 text-sm text-[#3D2817] font-semibold">
                        <span className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 shadow-[0_2px_6px_-2px_rgba(212,160,55,0.5)]"
                          style={{ background: 'linear-gradient(135deg, #F8C260 0%, #D4A037 100%)' }}>
                          <Check className="w-3.5 h-3.5 text-[#1F1308]" strokeWidth={3.5} />
                        </span>
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={`relative ${reverse ? 'lg:col-start-1 lg:row-start-1' : ''}`}>
                  {/* Decorative cream blob behind screenshot */}
                  <div className="absolute -inset-6 lg:-inset-10 rounded-[2rem] -z-10"
                    style={{ background: f.accentBg }} />
                  <BrowserFrame src={f.img} alt={f.title} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Kiosk PWA — donker chocolate met gouden accenten + 4 tablets
// =============================================================================
function KioskSection() {
  const tablets = [
    { num: '01', src: SHOTS.kioskLoc,      label: 'Locatie kiezen',     desc: 'Huurder tikt zijn complex aan op het startscherm.' },
    { num: '02', src: SHOTS.kioskApt,      label: 'Appartement kiezen', desc: 'Selecteer de juiste unit voor het bedrag.' },
    { num: '03', src: SHOTS.kioskOverview, label: 'Bedrag bekijken',    desc: 'Overzicht van achterstand · lopend · vooruit.' },
    { num: '04', src: SHOTS.kioskNumpad,   label: 'Betalen',            desc: 'Touchscreen numpad voor cash of partial.' },
  ];
  return (
    <section id="kiosk" className="relative py-20 lg:py-28 overflow-hidden"
      style={{
        background: 'radial-gradient(circle at 30% 10%, #3D2817 0%, #1F1308 40%, #0F0903 100%)',
      }}>
      {/* gold glow accent */}
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full opacity-30 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, #D4A037, transparent 70%)' }} />

      <div className="max-w-7xl mx-auto px-5 lg:px-8 relative">
        <div className="grid lg:grid-cols-2 gap-10 mb-14 items-end">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-sm border mb-5"
              style={{
                background: 'rgba(248,194,96,0.08)',
                borderColor: 'rgba(248,194,96,0.25)',
              }}>
              <span className="w-1.5 h-1.5 rounded-full bg-[#F8C260] animate-pulse" />
              <span className="text-xs font-black tracking-[0.22em] uppercase" style={{ color: '#F8C260' }}>
                Kiosk PWA · Selfservice
              </span>
            </div>
            <h2 className="text-3xl lg:text-5xl font-black tracking-tight text-white leading-tight"
              style={{ fontFamily: "'Outfit', sans-serif" }}>
              Selfservice in
              <span className="block"
                style={{
                  background: 'linear-gradient(135deg, #F8C260 0%, #FF8A3D 50%, #FF5C00 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}>vier tikken.</span>
            </h2>
          </div>
          <p className="text-base lg:text-lg text-white/70 leading-relaxed max-w-lg">
            Werkt op tablet, telefoon én desktop. Installeer in 1 tik — geen App Store.
            Achterstand, lopende maand en boetes met groot lettertype voor elke leeftijd.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-6 lg:gap-8">
          {tablets.map((t, i) => (
            <div key={t.num}
              data-testid={`kiosk-step-${i}`}
              className="group">
              <div className="flex items-baseline gap-3 mb-4">
                <span className="text-2xl font-black tracking-tighter"
                  style={{
                    background: 'linear-gradient(135deg, #F8C260, #D4A037)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}>
                  {t.num}
                </span>
                <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-white/40">/ STEP</span>
              </div>
              <TabletFrame src={t.src} alt={t.label} />
              <div className="mt-5">
                <p className="text-lg font-black text-white">{t.label}</p>
                <p className="text-sm text-white/60 mt-1">{t.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom feature pills */}
        <div className="mt-14 flex flex-wrap items-center justify-center gap-3">
          {['Offline-first PWA', 'Multi-currency', 'PIN beveiligd', 'Gemini AI OCR', 'WhatsApp bevestiging'].map((p) => (
            <span key={p} className="inline-flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-sm border text-xs font-bold text-white"
              style={{
                background: 'rgba(248,194,96,0.06)',
                borderColor: 'rgba(248,194,96,0.2)',
              }}>
              <span className="w-1.5 h-1.5 rounded-full bg-[#F8C260]" />
              {p}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Pricing — premium 3 tiers met gouden accenten
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
    <section id="pricing" className="py-20 lg:py-28 bg-gradient-to-b from-white to-[#FDF6EC] relative">
      <div className="max-w-7xl mx-auto px-5 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <p className="text-xs font-black tracking-[0.3em] uppercase text-[#C74600] mb-3">Prijzen</p>
          <h2 className="text-3xl lg:text-5xl font-black tracking-tight text-[#1F1308] leading-tight"
            style={{ fontFamily: "'Outfit', sans-serif" }}>
            Eerlijke prijzen.
            <span className="block"
              style={{
                background: 'linear-gradient(135deg, #F8C260 0%, #D4A037 60%, #B8860B 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>Voor elk vastgoedbedrijf.</span>
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {PLANS.map((p) => (
            <div key={p.name}
              data-testid={`plan-${p.name.toLowerCase()}`}
              className={`relative rounded-3xl p-7 lg:p-8 transition-all ${
                p.highlight
                  ? 'text-white shadow-[0_30px_60px_-20px_rgba(31,19,8,0.5)] md:-translate-y-3'
                  : 'bg-white border border-[#E8D9BF]/60 hover:border-[#D4A037] hover:shadow-[0_20px_40px_-15px_rgba(212,160,55,0.3)]'
              }`}
              style={p.highlight ? {
                background: 'radial-gradient(circle at 20% 0%, #3D2817 0%, #1F1308 60%, #0F0903 100%)',
              } : {}}>
              {p.highlight && (
                <div className="absolute top-0 right-7 -translate-y-1/2 px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase shadow-[0_8px_20px_-6px_rgba(212,160,55,0.5)]"
                  style={{ background: 'linear-gradient(135deg, #F8C260, #D4A037)', color: '#1F1308' }}>
                  ⭐ Aanbevolen
                </div>
              )}
              <p className={`text-sm font-black tracking-wider uppercase ${p.highlight ? '' : 'text-[#C74600]'}`}
                style={p.highlight ? {
                  background: 'linear-gradient(135deg, #F8C260, #D4A037)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                } : {}}>
                {p.name}
              </p>
              <div className="mt-4 flex items-baseline gap-1.5">
                <span className={`text-5xl lg:text-6xl font-black tracking-tighter ${p.highlight ? 'text-white' : 'text-[#1F1308]'}`}>
                  {p.price === 'Custom' ? 'Custom' : p.price}
                </span>
                {p.price !== 'Custom' && (
                  <span className={`text-sm font-bold ${p.highlight ? 'text-white/50' : 'text-[#3D2817]/50'}`}>
                    {p.sub}
                  </span>
                )}
              </div>
              <p className={`mt-3 text-sm leading-relaxed ${p.highlight ? 'text-white/70' : 'text-[#3D2817]/70'}`}>
                {p.desc}
              </p>
              <button onClick={p.name === 'Enterprise' ? onWhatsApp : onDemo}
                data-testid={`plan-cta-${p.name.toLowerCase()}`}
                className={`mt-6 w-full h-12 rounded-full text-sm font-black transition-all hover:scale-[1.02] ${
                  p.highlight
                    ? 'text-[#1F1308] shadow-[0_10px_24px_-8px_rgba(212,160,55,0.5)]'
                    : 'bg-[#1F1308] text-white hover:bg-[#3D2817]'
                }`}
                style={p.highlight ? { background: 'linear-gradient(135deg, #F8C260 0%, #D4A037 100%)' } : {}}>
                {p.cta} →
              </button>
              <ul className={`mt-7 space-y-2.5 pt-7 border-t ${p.highlight ? 'border-white/15' : 'border-[#E8D9BF]/60'}`}>
                {p.features.map((f) => (
                  <li key={f} className={`text-sm flex items-start gap-2.5 ${p.highlight ? 'text-white/85' : 'text-[#3D2817]'}`}>
                    <Check className={`w-4 h-4 mt-0.5 shrink-0 ${p.highlight ? 'text-[#F8C260]' : 'text-[#D4A037]'}`} strokeWidth={3} />
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
// FAQ — premium minimalist
// =============================================================================
const FAQS = [
  { q: 'Hoe lang duurt het om mijn vastgoedbedrijf op te zetten?',
    a: 'Met onze Setup Wizard bent u binnen 30 minuten live: locaties, appartementen, huurders, eerste facturen — allemaal stap voor stap. We helpen bij OCR-import van uw huidige Excel-bestanden.' },
  { q: 'Werkt het systeem op iPhone en Android?',
    a: 'Ja. Het is een PWA — installeer hem direct via Safari (iOS) of Chrome (Android). U krijgt een echte app op uw startscherm zonder via de App Store te gaan.' },
  { q: 'Kan ik mijn eigen huisstijl gebruiken?',
    a: 'Volledig white-label. Upload uw logo, kies uw kleur, en zowel Beheer als Kiosk dragen úw branding. Uw huurders zien geen "SuriRent" — alleen uw bedrijf.' },
  { q: 'Hoe veilig is mijn data?',
    a: 'Multi-tenant isolatie op database-niveau. Auth via bcrypt + JWT. Goedkeuringsworkflow met digitale handtekening voor betalingen. Audit log van elke wijziging.' },
  { q: 'Kan ik later opzeggen?',
    a: 'Maandelijks opzegbaar. Geen lock-in. U kunt al uw data exporteren naar Excel/PDF wanneer u maar wilt.' },
];

function FAQSection() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="py-20 lg:py-28 bg-[#FDF6EC]">
      <div className="max-w-3xl mx-auto px-5 lg:px-8">
        <div className="text-center mb-12">
          <p className="text-xs font-black tracking-[0.3em] uppercase text-[#C74600] mb-3">Veelgestelde vragen</p>
          <h2 className="text-3xl lg:text-5xl font-black tracking-tight text-[#1F1308] leading-tight"
            style={{ fontFamily: "'Outfit', sans-serif" }}>
            Antwoorden op uw vragen.
          </h2>
        </div>
        <div className="space-y-3">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={i} className={`rounded-2xl border transition-all ${
                isOpen
                  ? 'bg-white border-[#D4A037] shadow-[0_18px_40px_-15px_rgba(212,160,55,0.3)]'
                  : 'bg-white/60 border-[#E8D9BF]/60'
              }`}>
                <button onClick={() => setOpen(isOpen ? -1 : i)}
                  data-testid={`faq-${i}`}
                  className="w-full text-left p-5 flex items-center justify-between gap-4">
                  <p className="text-base font-black text-[#1F1308]">{f.q}</p>
                  {isOpen
                    ? <ChevronUp className="w-5 h-5 text-[#C74600] shrink-0" />
                    : <ChevronDown className="w-5 h-5 text-[#3D2817]/40 shrink-0" />}
                </button>
                {isOpen && (
                  <div className="px-5 pb-5">
                    <p className="text-sm text-[#3D2817]/75 leading-relaxed">{f.a}</p>
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
// Final CTA — massive warm gradient block
// =============================================================================
function CTABanner({ onDemo, onWhatsApp }) {
  return (
    <section className="py-20 lg:py-28 bg-[#FDF6EC]">
      <div className="max-w-6xl mx-auto px-5 lg:px-8">
        <div className="relative rounded-3xl overflow-hidden p-10 lg:p-16 text-white shadow-[0_40px_80px_-20px_rgba(199,70,0,0.4)]"
          style={{
            background: 'radial-gradient(circle at 0% 0%, #FF8A3D 0%, #FF5C00 30%, #C74600 60%, #5C2300 95%)',
          }}>
          {/* gold mesh overlay */}
          <div className="absolute inset-0 opacity-20 pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(circle at 20% 80%, #F8C260 0%, transparent 50%), radial-gradient(circle at 80% 20%, #D4A037 0%, transparent 40%)',
            }} />
          {/* grid texture */}
          <div className="absolute inset-0 opacity-[0.08] pointer-events-none"
            style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }} />
          <div className="relative max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 mb-5">
              <span>🇸🇷</span>
              <span className="text-xs font-black tracking-[0.22em] uppercase text-white">
                Speciaal voor Suriname
              </span>
            </div>
            <h2 className="text-3xl lg:text-5xl font-black tracking-tight leading-tight"
              style={{ fontFamily: "'Outfit', sans-serif" }}>
              Klaar voor het volgende
              <span className="block"
                style={{
                  background: 'linear-gradient(135deg, #FFF6D6 0%, #F8C260 60%, #FFE4B0 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}>hoofdstuk?</span>
            </h2>
            <p className="mt-5 text-base lg:text-lg text-white/90 max-w-xl">
              Probeer SuriRent gratis in onze gedeelde demo-omgeving — geen registratie nodig.
              Of plan een persoonlijke demo via WhatsApp.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <button onClick={onDemo} data-testid="cta-banner-demo"
                className="h-12 px-7 rounded-full bg-white text-[#1F1308] text-base font-black hover:bg-[#FDF6EC] transition-colors flex items-center justify-center gap-2 shadow-[0_18px_36px_-10px_rgba(31,19,8,0.5)]">
                Demo proberen <ArrowRight className="w-5 h-5" />
              </button>
              <button onClick={onWhatsApp} data-testid="cta-banner-whatsapp"
                className="h-12 px-7 rounded-full bg-[#1F1308]/40 hover:bg-[#1F1308]/60 border border-white/30 text-white text-base font-bold transition-colors flex items-center justify-center gap-2 backdrop-blur-sm">
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
// Footer — chocolate met gouden details
// =============================================================================
function Footer({ onLogin }) {
  return (
    <footer id="contact" className="text-[#FAEAD0]/70 relative overflow-hidden"
      style={{ background: 'radial-gradient(circle at 0% 0%, #3D2817 0%, #1F1308 50%, #0F0903 100%)' }}>
      {/* gold accent line top */}
      <div className="absolute top-0 inset-x-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, #D4A037, transparent)' }} />

      <div className="max-w-7xl mx-auto px-5 lg:px-8 py-14 lg:py-20 relative">
        <div className="grid md:grid-cols-4 gap-10">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-9 h-9 rounded-xl p-1.5"
                style={{ background: 'linear-gradient(135deg, #F8C260, #D4A037 60%, #B8860B 100%)' }}>
                <img src="/kiosk-icons/mark-white.png" alt="" className="w-full h-full object-contain" />
              </span>
              <span className="text-base font-black tracking-tight text-white">
                <span>Suri</span>
                <span style={{
                  background: 'linear-gradient(135deg, #F8C260, #D4A037)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}>Rent</span>
              </span>
            </div>
            <p className="text-sm leading-relaxed max-w-md">
              Het volledige vastgoedplatform voor Surinaamse verhuurders.
              White-label SaaS met Kiosk, automatische facturatie en AI-powered OCR.
            </p>
            <div className="mt-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-[#D4A037]/20">
              <span>🇸🇷</span>
              <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-[#F8C260]">
                Met trots gemaakt in Paramaribo
              </span>
            </div>
          </div>
          <div>
            <p className="text-xs font-black tracking-[0.22em] uppercase text-white mb-4">Product</p>
            <ul className="space-y-2.5 text-sm">
              <li><a href="#features" className="hover:text-[#F8C260] transition-colors">Functies</a></li>
              <li><a href="#kiosk" className="hover:text-[#F8C260] transition-colors">Kiosk PWA</a></li>
              <li><a href="#pricing" className="hover:text-[#F8C260] transition-colors">Prijzen</a></li>
              <li><a href="#faq" className="hover:text-[#F8C260] transition-colors">FAQ</a></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-black tracking-[0.22em] uppercase text-white mb-4">Contact</p>
            <ul className="space-y-2.5 text-sm">
              <li className="flex items-center gap-2"><Mail className="w-4 h-4 text-[#F8C260]" /> info@surirent.sr</li>
              <li className="flex items-center gap-2"><Phone className="w-4 h-4 text-[#F8C260]" /> +597 XXX XXX</li>
              <li className="flex items-center gap-2"><MapPin className="w-4 h-4 text-[#F8C260]" /> Paramaribo, SR</li>
              <li className="pt-2">
                <button onClick={onLogin} data-testid="footer-login"
                  className="text-[#F8C260] hover:text-[#FFD580] font-bold">
                  Beheerder inloggen →
                </button>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-12 pt-8 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-white/40">
            © {new Date().getFullYear()} SuriRent. Alle rechten voorbehouden.
          </p>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-semibold text-white/40">Alle systemen operationeel</span>
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
    document.body.style.backgroundColor = '#FDF6EC';
    return () => { document.body.style.backgroundColor = ''; };
  }, []);

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
  const onDemo = onLogin;
  const onWhatsApp = () => {
    window.open('https://wa.me/597XXXXXXX?text=Ik%20wil%20graag%20een%20demo%20van%20SuriRent', '_blank');
  };

  return (
    <div className="min-h-screen text-[#1F1308] antialiased selection:bg-[#C74600] selection:text-white"
      style={{
        background: '#FDF6EC',
        fontFamily: "'Outfit', 'Inter', sans-serif",
      }}>
      <TopNav onLogin={onLogin} onDemo={onDemo} />
      <Hero onDemo={onDemo} onWhatsApp={onWhatsApp} />
      <StatsStrip />
      <EditorialFeatures />
      <KioskSection />
      <PricingSection onDemo={onDemo} onWhatsApp={onWhatsApp} />
      <FAQSection />
      <CTABanner onDemo={onDemo} onWhatsApp={onWhatsApp} />
      <Footer onLogin={onLogin} />
    </div>
  );
}
