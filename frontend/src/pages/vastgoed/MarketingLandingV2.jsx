// Modern professional editorial-stijl landing — 2026-05-31 redesign.
// Geen video, geen kleine mockups die elkaar overlappen. In plaats daarvan:
// • Split-screen hero met grote app-screenshot
// • Editorial alterneren tekst↔screenshot per feature
// • Bento mosaic gallery van alle beheer schermen
// • Tablet-rij voor Kiosk PWA
// • Pricing / FAQ / CTA / Footer
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { appLink } from '../../lib/env';
import {
  Menu, X, ArrowRight, ArrowUpRight, Check, Building2, Receipt, Users, Wallet,
  Shield, Sparkles, ScanFace, ScanLine, QrCode, Calendar, FileText,
  MessageCircle, Globe, ChevronDown, ChevronUp, Mail, Phone, MapPin,
  Smartphone, Star,
} from 'lucide-react';

// User-uploaded app screenshots.
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
// macOS browser frame voor desktop screenshots
// =============================================================================
function BrowserFrame({ src, alt, dark = false, className = '' }) {
  return (
    <div className={`relative rounded-2xl overflow-hidden border shadow-[0_30px_80px_-20px_rgba(15,23,42,0.25)] ${
      dark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200/80'
    } ${className}`}>
      <div className={`h-9 border-b flex items-center px-4 gap-3 ${
        dark ? 'bg-slate-900 border-slate-800' : 'bg-gradient-to-b from-slate-50 to-slate-100/80 border-slate-200/80'
      }`}>
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#FF5F57]" />
          <span className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
          <span className="w-3 h-3 rounded-full bg-[#28C840]" />
        </div>
        <div className="flex-1 flex justify-center">
          <span className={`text-[10px] font-semibold px-3 py-1 rounded-md border ${
            dark ? 'bg-slate-800/70 text-slate-400 border-slate-700' : 'bg-white/70 text-slate-400 border-slate-200/60'
          }`}>
            app.surirent.sr
          </span>
        </div>
      </div>
      <img src={src} alt={alt} loading="lazy" className="w-full block" />
    </div>
  );
}

// =============================================================================
// Tablet landscape frame voor kiosk screenshots
// =============================================================================
function TabletFrame({ src, alt, className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <div className="relative rounded-[1.5rem] bg-slate-950 p-2 shadow-[0_24px_60px_-18px_rgba(15,23,42,0.4)]">
        <div className="relative rounded-[1rem] overflow-hidden bg-white aspect-[1920/950]">
          <img src={src} alt={alt} loading="lazy"
            className="w-full h-full object-cover object-top" />
        </div>
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-14 h-1 rounded-full bg-slate-700/60" />
      </div>
    </div>
  );
}

// =============================================================================
// Top Navigation
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
    { id: 'features',  label: 'Functies' },
    { id: 'gallery',   label: 'Beheer' },
    { id: 'kiosk',     label: 'Kiosk' },
    { id: 'pricing',   label: 'Prijzen' },
    { id: 'faq',       label: 'FAQ' },
  ];
  return (
    <header className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
      scrolled ? 'bg-white/85 backdrop-blur-xl border-b border-slate-200/60' : 'bg-transparent'
    }`} data-testid="marketing-topnav">
      <div className="max-w-7xl mx-auto px-5 lg:px-8 h-16 flex items-center justify-between">
        <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="flex items-center gap-2.5" data-testid="topnav-logo">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#FF8A3D] to-[#C74600] p-1.5 shadow-[0_8px_18px_-6px_rgba(255,92,0,0.45)]">
            <img src="/kiosk-icons/mark-white.png" alt="" className="w-full h-full object-contain" />
          </span>
          <span className="text-base font-black tracking-tight">
            <span className="text-slate-900">Suri</span><span className="text-[#FF5C00]">Rent</span>
          </span>
        </button>
        <nav className="hidden md:flex items-center gap-8">
          {items.map((n) => (
            <button key={n.id} onClick={() => goTo(n.id)}
              data-testid={`topnav-${n.id}`}
              className="text-sm font-semibold text-slate-700 hover:text-[#FF5C00] transition-colors">
              {n.label}
            </button>
          ))}
        </nav>
        <div className="hidden md:flex items-center gap-3">
          <button onClick={onLogin} data-testid="topnav-login"
            className="text-sm font-bold text-slate-700 hover:text-slate-900">
            Inloggen
          </button>
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
          {items.map((n) => (
            <button key={n.id} onClick={() => goTo(n.id)}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-bold text-slate-800 hover:bg-slate-50">
              {n.label}
            </button>
          ))}
          <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-2">
            <button onClick={onLogin} className="h-10 rounded-full border border-slate-300 text-sm font-bold text-slate-900">Inloggen</button>
            <button onClick={onDemo} className="h-10 rounded-full bg-slate-900 text-white text-sm font-bold">Demo</button>
          </div>
        </div>
      )}
    </header>
  );
}

// =============================================================================
// Hero — split editorial layout: text left, big tilted browser right
// =============================================================================
function Hero({ onDemo, onWhatsApp }) {
  return (
    <section className="relative pt-28 lg:pt-32 pb-20 lg:pb-28 overflow-hidden">
      {/* Soft warm background gradient (top), fades into white */}
      <div className="absolute inset-0 -z-10"
        style={{
          background: 'linear-gradient(180deg, #FFEFDD 0%, #FFF7F0 30%, #FAFAF7 60%, #FAFAF7 100%)',
        }} />
      {/* Decorative orange blob (top-right) */}
      <div className="absolute -top-32 -right-20 w-[640px] h-[640px] rounded-full opacity-50 blur-3xl pointer-events-none -z-10"
        style={{ background: 'radial-gradient(circle, #FFB074 0%, transparent 65%)' }} />

      <div className="max-w-7xl mx-auto px-5 lg:px-8">
        <div className="grid lg:grid-cols-[1.05fr,1fr] gap-12 lg:gap-16 items-center">
          {/* LEFT — copy */}
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 backdrop-blur-sm border border-orange-100 shadow-sm mb-7"
              data-testid="hero-badge">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF5C00] animate-pulse" />
              <span className="text-xs font-black text-slate-900 tracking-[0.22em] uppercase">
                Nieuw in Suriname
              </span>
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-[5.5rem] xl:text-[6rem] font-black tracking-[-0.04em] text-slate-900 leading-[0.95]"
              data-testid="hero-title">
              De complete{' '}
              <span className="relative inline-block">
                <span className="relative z-10 text-[#FF5C00] italic font-black">huurbeheer</span>
                <span className="absolute inset-x-0 bottom-1 h-3 bg-[#FFD1A8] -z-0" />
              </span>{' '}
              oplossing voor vastgoed.
            </h1>

            <p className="mt-7 text-base lg:text-lg text-slate-600 font-medium max-w-xl leading-relaxed"
              data-testid="hero-subtitle">
              Beheer appartementen, huurders en huurbetalingen. Met een selfservice Kiosk
              voor huurders — pixel-perfect, multi-currency, en speciaal voor de Surinaamse markt.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-start gap-3">
              <button onClick={onDemo} data-testid="hero-cta-demo"
                className="h-12 px-7 rounded-full text-white text-base font-black flex items-center gap-2 shadow-[0_18px_36px_-12px_rgba(255,92,0,0.55)] transition-all hover:scale-[1.02]"
                style={{ background: 'linear-gradient(135deg, #FF8A3D 0%, #FF5C00 60%, #C74600 100%)' }}>
                Demo proberen <ArrowRight className="w-5 h-5" />
              </button>
              <button onClick={onWhatsApp} data-testid="hero-cta-whatsapp"
                className="h-12 px-7 rounded-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-900 text-base font-bold flex items-center gap-2 transition-all shadow-sm">
                <MessageCircle className="w-5 h-5 text-emerald-600" /> WhatsApp ons
              </button>
            </div>

            {/* Trust badges */}
            <div className="mt-8 flex flex-wrap items-center gap-5 text-xs font-bold text-slate-700"
              data-testid="hero-trust">
              {['Geen creditcard', 'White-label', 'iOS · Android PWA'].map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-white" strokeWidth={4} />
                  </span>
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* RIGHT — tilted browser with floating accent screenshot */}
          <div className="relative">
            <div className="relative" style={{ transform: 'rotate(-3deg)' }}>
              <BrowserFrame src={SHOTS.overzicht} alt="Beheer Overzicht" />
            </div>
            {/* Floating second screenshot (Betalingen) — top-right corner, slight rotate */}
            <div className="hidden lg:block absolute -top-6 -right-4 w-[55%] z-10"
              style={{ transform: 'rotate(4deg)' }}
              data-testid="hero-float-screenshot">
              <BrowserFrame src={SHOTS.betalingen} alt="Betalingen overzicht" />
            </div>
            {/* Subtle drop shadow under both */}
            <div className="absolute -inset-x-6 -bottom-6 h-10 rounded-full blur-2xl opacity-30 pointer-events-none"
              style={{ background: '#C74600' }} />
          </div>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Stats — minimaal, met dividers
// =============================================================================
function StatsStrip() {
  const stats = [
    { v: '3',    l: 'Valuta',                      s: 'SRD · EUR · USD' },
    { v: '∞',    l: 'Bedrijven',                   s: 'Multi-tenant SaaS' },
    { v: '24/7', l: 'Selfservice',                 s: 'Kiosk PWA terminal' },
    { v: 'AI',   l: 'OCR betalingen',              s: 'Gemini 2.5 Flash' },
  ];
  return (
    <section className="py-16 lg:py-20 bg-white border-y border-slate-100">
      <div className="max-w-7xl mx-auto px-5 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-slate-100">
          {stats.map((s) => (
            <div key={s.l} className="px-6 lg:px-10 first:pl-0 last:pr-0 text-center">
              <p className="text-5xl lg:text-6xl font-black tracking-tighter text-slate-900">{s.v}</p>
              <p className="mt-3 text-sm font-black text-slate-900 uppercase tracking-wider">{s.l}</p>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">{s.s}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Editorial Features — alterneren tekst ↔ screenshot per rij
// =============================================================================
const EDITORIAL_FEATURES = [
  {
    eyebrow: 'Beheer Suite',
    title: 'Realtime KPI dashboard.',
    desc: 'Bekijk kas saldo, openstaande facturen, achterstand en activiteit in één oogopslag. Met multi-currency support voor SRD, EUR en USD parallel.',
    bullets: ['Live kas saldo per valuta', 'Achterstand & openstaand', 'Quick actions toegankelijk'],
    img: SHOTS.overzicht,
  },
  {
    eyebrow: 'Locaties',
    title: 'Groepeer per locatie.',
    desc: 'Beheer meerdere vestigingen of complexen. Elke locatie heeft eigen appartementen, huurders en facturen — perfect voor groeiende portfolio\'s.',
    bullets: ['Onbeperkt locaties per bedrijf', 'Foto + adres per locatie', 'Drill-down naar units'],
    img: SHOTS.locaties,
  },
  {
    eyebrow: 'Appartementen',
    title: 'Eenheidbeheer in detail.',
    desc: 'Per appartement: huurder, maandhuur, status, foto en QR code. Direct toegang tot facturen, contracten en onderhoudshistorie.',
    bullets: ['Foto upload + galerij', 'Smart breaker integratie', 'QR code per appartement'],
    img: SHOTS.appartementen,
  },
  {
    eyebrow: 'Betalingen',
    title: 'Volledige kwitantie-log.',
    desc: 'Elke betaling wordt automatisch geboekt met PDF-kwitantie, e-mail-bevestiging en audit log. Inclusief OCR via Gemini AI voor automatische import.',
    bullets: ['PDF kwitanties per betaling', 'E-mail / WhatsApp verzending', 'Gemini AI OCR upload'],
    img: SHOTS.betalingen,
  },
  {
    eyebrow: 'Facturen',
    title: '3-bucket factuur logica.',
    desc: 'Automatische scheiding van achterstand, lopende maand en vooruit gefactureerde periodes. Met betalingsregelingen en PDF kwitanties per termijn.',
    bullets: ['Achterstand · lopend · vooruit', 'Auto-generate maandelijks', 'Betalingsregelingen ondersteund'],
    img: SHOTS.facturen,
  },
];

function EditorialFeatures() {
  return (
    <section id="features" className="py-20 lg:py-32 bg-[#FAFAF7]">
      <div className="max-w-7xl mx-auto px-5 lg:px-8">
        <div className="max-w-3xl mb-16 lg:mb-24">
          <p className="text-xs font-black tracking-[0.3em] uppercase text-[#FF5C00] mb-3">Functies</p>
          <h2 className="text-3xl lg:text-5xl font-black tracking-tight text-slate-900 leading-tight">
            Eén systeem.
            <span className="text-slate-400 block">Alles wat uw vastgoed nodig heeft.</span>
          </h2>
        </div>

        <div className="space-y-20 lg:space-y-32">
          {EDITORIAL_FEATURES.map((f, i) => {
            const reverse = i % 2 === 1;
            return (
              <div key={f.title}
                data-testid={`editorial-feature-${i}`}
                className={`grid lg:grid-cols-2 gap-10 lg:gap-16 items-center ${reverse ? 'lg:grid-flow-dense' : ''}`}>
                <div className={reverse ? 'lg:col-start-2' : ''}>
                  <p className="text-xs font-black tracking-[0.3em] uppercase text-[#FF5C00] mb-3">
                    {f.eyebrow}
                  </p>
                  <h3 className="text-3xl lg:text-4xl font-black tracking-tight text-slate-900 leading-tight">
                    {f.title}
                  </h3>
                  <p className="mt-5 text-base lg:text-lg text-slate-600 leading-relaxed max-w-md">
                    {f.desc}
                  </p>
                  <ul className="mt-6 space-y-2.5">
                    {f.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2.5 text-sm text-slate-700 font-semibold">
                        <span className="w-5 h-5 rounded-md bg-orange-100 text-[#FF5C00] flex items-center justify-center shrink-0 mt-0.5">
                          <Check className="w-3 h-3" strokeWidth={3.5} />
                        </span>
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={reverse ? 'lg:col-start-1 lg:row-start-1' : ''}>
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
// Bento gallery — mosaic van ALLE beheer schermen
// =============================================================================
function BentoGallery() {
  return (
    <section id="gallery" className="py-20 lg:py-28 bg-slate-950 text-white relative overflow-hidden">
      {/* decorative glow */}
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full opacity-30 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, #FF5C00, transparent 70%)' }} />

      <div className="max-w-7xl mx-auto px-5 lg:px-8 relative">
        <div className="max-w-3xl mb-14">
          <p className="text-xs font-black tracking-[0.3em] uppercase mb-3"
            style={{ color: '#F8C260' }}>Beheer Suite</p>
          <h2 className="text-3xl lg:text-5xl font-black tracking-tight leading-tight">
            Alle vastgoed-data
            <span className="block"
              style={{
                background: 'linear-gradient(90deg, #F8C260, #FF8A3D, #FF5C00)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>op één plek.</span>
          </h2>
        </div>

        {/* Bento grid 12-col: 3 rows */}
        <div className="grid grid-cols-12 gap-4 lg:gap-5">
          {/* Big — Overzicht */}
          <div className="col-span-12 lg:col-span-8 row-span-2"
            data-testid="bento-overzicht">
            <div className="rounded-2xl overflow-hidden border border-slate-800 bg-slate-900/40">
              <img src={SHOTS.overzicht} alt="Overzicht" className="w-full block" />
            </div>
            <div className="mt-4">
              <p className="text-sm font-black text-white">Overzicht</p>
              <p className="text-xs text-slate-400 mt-1">Realtime KPI's, kas saldo en activiteit</p>
            </div>
          </div>

          {/* Medium — Locaties */}
          <div className="col-span-12 lg:col-span-4" data-testid="bento-locaties">
            <div className="rounded-2xl overflow-hidden border border-slate-800 bg-slate-900/40">
              <img src={SHOTS.locaties} alt="Locaties" className="w-full block" />
            </div>
            <div className="mt-4">
              <p className="text-sm font-black text-white">Locaties</p>
              <p className="text-xs text-slate-400 mt-1">Multi-vestiging support</p>
            </div>
          </div>

          {/* Medium — Appartementen */}
          <div className="col-span-12 lg:col-span-4" data-testid="bento-appartementen">
            <div className="rounded-2xl overflow-hidden border border-slate-800 bg-slate-900/40">
              <img src={SHOTS.appartementen} alt="Appartementen" className="w-full block" />
            </div>
            <div className="mt-4">
              <p className="text-sm font-black text-white">Appartementen</p>
              <p className="text-xs text-slate-400 mt-1">Per unit alles op één plek</p>
            </div>
          </div>

          {/* Medium — Betalingen */}
          <div className="col-span-12 lg:col-span-6" data-testid="bento-betalingen">
            <div className="rounded-2xl overflow-hidden border border-slate-800 bg-slate-900/40">
              <img src={SHOTS.betalingen} alt="Betalingen" className="w-full block" />
            </div>
            <div className="mt-4">
              <p className="text-sm font-black text-white">Betalingen</p>
              <p className="text-xs text-slate-400 mt-1">Kwitanties + AI OCR upload</p>
            </div>
          </div>

          {/* Medium — Facturen */}
          <div className="col-span-12 lg:col-span-6" data-testid="bento-facturen">
            <div className="rounded-2xl overflow-hidden border border-slate-800 bg-slate-900/40">
              <img src={SHOTS.facturen} alt="Facturen" className="w-full block" />
            </div>
            <div className="mt-4">
              <p className="text-sm font-black text-white">Facturen</p>
              <p className="text-xs text-slate-400 mt-1">3-bucket logica: achterstand · lopend · vooruit</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Kiosk PWA — 4 tablets in een rij
// =============================================================================
function KioskSection() {
  const tablets = [
    { src: SHOTS.kioskLoc,      label: '1. Locatie kiezen',     desc: 'Huurder tikt zijn complex aan op het startscherm.' },
    { src: SHOTS.kioskApt,      label: '2. Appartement kiezen', desc: 'Selecteer de juiste unit voor het bedrag.' },
    { src: SHOTS.kioskOverview, label: '3. Bedrag bekijken',    desc: 'Achterstand · lopende maand · vooruit overzicht.' },
    { src: SHOTS.kioskNumpad,   label: '4. Betalen',            desc: 'Touchscreen numpad voor cash of partial.' },
  ];
  return (
    <section id="kiosk" className="py-20 lg:py-28 bg-gradient-to-b from-[#FFF7F0] to-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-5 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <p className="text-xs font-black tracking-[0.3em] uppercase text-[#FF5C00] mb-3">Kiosk PWA</p>
          <h2 className="text-3xl lg:text-5xl font-black tracking-tight text-slate-900 leading-tight">
            Selfservice in 4 stappen.
            <span className="text-slate-400 block">Voor elke huurder.</span>
          </h2>
          <p className="mt-5 text-base lg:text-lg text-slate-600 font-medium max-w-2xl mx-auto">
            Werkt op tablet, telefoon én desktop. Installeer in 1 tik — geen App Store.
            Achterstand, lopende maand en boetes met groot lettertype.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-8 lg:gap-10">
          {tablets.map((t, i) => (
            <div key={t.label} className="space-y-4" data-testid={`kiosk-step-${i}`}>
              <TabletFrame src={t.src} alt={t.label} />
              <div>
                <p className="text-base font-black text-slate-900">{t.label}</p>
                <p className="text-sm text-slate-500 mt-1">{t.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-12 text-center">
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white border border-orange-100 shadow-sm">
            <Sparkles className="w-4 h-4 text-[#FF5C00]" />
            <span className="text-sm font-bold text-slate-800">
              Inclusief Gemini AI OCR voor automatische betaling vanaf bankafschriften
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Compact Features Strip — 8 icoon-features in een grid
// =============================================================================
const COMPACT_FEATURES = [
  { Icon: Building2,    title: 'Multi-bedrijf SaaS',     desc: 'White-label per bedrijf, eigen kleur en logo.' },
  { Icon: ScanLine,     title: 'Kiosk PWA',              desc: 'Selfservice terminal met PIN-login.' },
  { Icon: Calendar,     title: 'Betalingsregelingen',    desc: 'Afbetalingsregelingen met PDF-kwitanties.' },
  { Icon: MessageCircle,title: 'WhatsApp + SMS',         desc: 'Automatische herinneringen bij vervaldatum.' },
  { Icon: Globe,        title: 'Multi-currency',         desc: 'SRD, EUR en USD parallel.' },
  { Icon: ScanFace,     title: 'OCR met Gemini AI',      desc: 'Foto bankafschrift → automatisch geboekt.' },
  { Icon: Shield,       title: 'Werknemers + Approval',  desc: 'Dual approval met digitale handtekening.' },
  { Icon: QrCode,       title: 'QR codes per unit',      desc: 'Scan-and-pay flow per huurder.' },
];

function CompactFeatures() {
  return (
    <section className="py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-5 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-xs font-black tracking-[0.3em] uppercase text-[#FF5C00] mb-3">En meer</p>
          <h2 className="text-3xl lg:text-4xl font-black tracking-tight text-slate-900 leading-tight">
            Alles wat u nodig heeft.
            <span className="text-slate-400 block">In één platform.</span>
          </h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
          {COMPACT_FEATURES.map(({ Icon, title, desc }) => (
            <div key={title}
              data-testid={`compact-feature-${title.toLowerCase().replace(/\s+/g, '-')}`}
              className="group p-5 rounded-2xl bg-white border border-slate-200/70 hover:border-orange-200 hover:shadow-[0_18px_40px_-12px_rgba(255,92,0,0.12)] transition-all">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-50 to-orange-100/40 border border-orange-100 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                <Icon className="w-5 h-5 text-[#FF5C00]" strokeWidth={2.2} />
              </div>
              <h3 className="text-sm font-black text-slate-900 mb-1.5">{title}</h3>
              <p className="text-xs text-slate-600 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Pricing
// =============================================================================
const PLANS = [
  {
    name: 'Starter', price: '450', sub: 'SRD / maand',
    desc: 'Voor kleine vastgoedbedrijven met max. 25 huurders.',
    features: ['Tot 25 huurders', '1 locatie', 'Beheer + Kiosk PWA', 'WhatsApp herinneringen', 'PDF kwitanties'],
    cta: 'Start gratis trial',
  },
  {
    name: 'Pro', price: '950', sub: 'SRD / maand', highlight: true,
    desc: 'Voor groeiende vastgoedbedrijven die alles willen automatiseren.',
    features: ['Tot 100 huurders', 'Onbeperkt locaties', 'OCR via Gemini AI', 'Werknemers + goedkeuringen', 'Multi-currency', 'White-label branding'],
    cta: 'Demo aanvragen',
  },
  {
    name: 'Enterprise', price: 'Custom', sub: 'op aanvraag',
    desc: 'Voor grote portfolios met aangepaste integraties.',
    features: ['Onbeperkt huurders', 'Custom integraties', 'Shelly smart breakers', 'Dedicated server', 'SLA + 24/7 support'],
    cta: 'Neem contact op',
  },
];

function PricingSection({ onDemo, onWhatsApp }) {
  return (
    <section id="pricing" className="py-20 lg:py-28 bg-[#FAFAF7]">
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
                  ? 'bg-slate-950 border-slate-950 text-white shadow-[0_30px_60px_-20px_rgba(15,23,42,0.5)] md:-translate-y-3'
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
                  {p.price === 'Custom' ? 'Custom' : p.price}
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
              <button onClick={p.name === 'Enterprise' ? onWhatsApp : onDemo}
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
    a: 'Volledig white-label. Upload uw logo, kies uw kleur, en zowel Beheer als Kiosk dragen úw branding. Uw huurders zien geen "SuriRent" — alleen uw bedrijf.' },
  { q: 'Hoe veilig is mijn data?',
    a: 'Multi-tenant isolatie op database-niveau. Auth via bcrypt + JWT. Goedkeuringsworkflow met handtekening voor betalingen. Audit log van elke wijziging.' },
  { q: 'Kan ik later opzeggen?',
    a: 'Maandelijks opzegbaar. Geen lock-in. U kunt al uw data exporteren naar Excel/PDF wanneer u maar wilt.' },
];

function FAQSection() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="py-20 lg:py-28 bg-white">
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
                isOpen ? 'bg-white border-slate-300 shadow-[0_8px_24px_-12px_rgba(15,23,42,0.15)]' : 'bg-slate-50 border-slate-200/60'
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
// CTA Banner
// =============================================================================
function CTABanner({ onDemo, onWhatsApp }) {
  return (
    <section className="py-20 lg:py-28 bg-[#FAFAF7]">
      <div className="max-w-6xl mx-auto px-5 lg:px-8">
        <div className="relative rounded-3xl overflow-hidden p-10 lg:p-16 text-white"
          style={{ background: 'radial-gradient(circle at 0% 0%, #FF8A3D 0%, #FF5C00 40%, #C74600 80%, #5C2300 100%)' }}>
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
              <li><a href="#gallery" className="hover:text-white transition-colors">Beheer Suite</a></li>
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
    <div className="min-h-screen text-slate-900 antialiased selection:bg-[#FF5C00] selection:text-white"
      style={{ background: '#FAFAF7' }}>
      <TopNav onLogin={onLogin} onDemo={onDemo} />
      <Hero onDemo={onDemo} onWhatsApp={onWhatsApp} />
      <StatsStrip />
      <EditorialFeatures />
      <BentoGallery />
      <KioskSection />
      <CompactFeatures />
      <PricingSection onDemo={onDemo} onWhatsApp={onWhatsApp} />
      <FAQSection />
      <CTABanner onDemo={onDemo} onWhatsApp={onWhatsApp} />
      <Footer onLogin={onLogin} />
    </div>
  );
}
