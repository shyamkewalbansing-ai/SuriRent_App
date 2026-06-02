// ABN AMRO-stijl landing — v11 redesign (2026-05-31).
// Dubbele top nav, hero met grote visual + dark greeting card, 8 product cards
// in 4x2 grid. Kleurschema: zwart (#0F0F0F / #1F1F1F) + oranje (#FF5C00).
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { appLink } from '../../lib/env';
import {
  Menu, X, Search, Lock, ChevronRight, ChevronDown, ChevronUp,
  LayoutDashboard, MapPin, Home as HomeIcon, Receipt, FileText, Users,
  Wallet, ScanLine, Building2, MessageCircle, Mail, Phone,
  Star, ArrowRight,
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
// Search index — koppelt zoektermen aan secties + product cards
// =============================================================================
const SEARCH_INDEX = [
  { label: 'Beheer Suite · Overzicht', section: 'feature-0',
    terms: ['beheer', 'suite', 'overzicht', 'dashboard', 'kas', 'saldo', 'kpi'] },
  { label: 'Locaties · Multi-vestiging', section: 'feature-1',
    terms: ['locatie', 'locaties', 'vestiging', 'complex', 'groep'] },
  { label: 'Appartementen', section: 'feature-2',
    terms: ['appartement', 'appartementen', 'eenheid', 'unit', 'huis', 'woning', 'qr', 'shelly', 'smart breaker'] },
  { label: 'Betalingen · Kwitanties · OCR', section: 'feature-3',
    terms: ['betaling', 'betalingen', 'kwitantie', 'kwitanties', 'pdf', 'ocr', 'gemini', 'ai'] },
  { label: 'Facturen · 3-bucket logica', section: 'feature-4',
    terms: ['factuur', 'facturen', 'achterstand', 'lopende maand', 'vooruit', 'betalingsregeling', 'regeling'] },
  { label: 'Kiosk PWA · Selfservice', section: 'kiosk',
    terms: ['kiosk', 'pwa', 'selfservice', 'tablet', 'pin', 'huurder portal', 'huurderportaal'] },
  { label: 'Prijzen · Starter · Pro · Enterprise', section: 'pricing',
    terms: ['prijs', 'prijzen', 'kosten', 'tarief', 'starter', 'pro', 'enterprise', 'plan', 'plannen', 'abonnement'] },
  { label: 'Service & FAQ', section: 'faq',
    terms: ['faq', 'vraag', 'vragen', 'service', 'help', 'setup', 'veilig', 'security', 'opzeggen', 'opzegging', 'ios', 'android', 'white-label', 'whitelabel', 'branding'] },
];

function searchIndex(q) {
  const term = (q || '').toLowerCase().trim();
  if (term.length < 2) return [];
  return SEARCH_INDEX.filter((s) =>
    s.label.toLowerCase().includes(term)
    || s.terms.some((t) => t.includes(term) || term.includes(t)),
  ).slice(0, 6);
}

// =============================================================================
// Top header — tier 1 (thin): logo + segments + Inloggen button
// =============================================================================
function TopHeader({ segment, setSegment, onLogin }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navItems = [
    { id: 'home',     label: 'Home' },
    { id: 'features', label: 'Functies' },
    { id: 'kiosk',    label: 'Kiosk PWA' },
    { id: 'pricing',  label: 'Prijzen' },
    { id: 'faq',      label: 'Service & FAQ' },
  ];
  const goTo = (id) => {
    setMobileMenuOpen(false);
    if (id === 'home') { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="bg-white border-b border-slate-100">
      <div className="max-w-[1280px] mx-auto px-5 lg:px-10 h-20 flex items-center justify-between">
        <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="flex items-center gap-2.5 md:gap-3" data-testid="topheader-logo">
          <span className="w-11 h-11 md:w-12 md:h-12 rounded-lg bg-[#FF5C00] p-1.5 md:p-2 shrink-0">
            <img src="/kiosk-icons/mark-white.png" alt="" className="w-full h-full object-contain" />
          </span>
          <span className="text-xl md:text-2xl font-black tracking-tight text-[#0F0F0F]">
            Suri<span className="text-[#FF5C00]">Rent</span> <span className="text-slate-400 font-bold">N.V</span>
          </span>
        </button>

        <div className="flex items-center gap-3 md:gap-5 lg:gap-7">
          {/* Segment selector — like ABN's Privé/Zakelijk (desktop only) */}
          <div className="hidden md:flex items-center gap-2">
            {['Beheerder', 'Huurder', 'Demo'].map((s) => (
              <button key={s} onClick={() => setSegment(s)}
                data-testid={`segment-${s.toLowerCase()}`}
                className={`text-sm font-bold px-4 py-2 rounded transition-colors ${
                  segment === s
                    ? 'border border-[#0F0F0F] text-[#0F0F0F]'
                    : 'text-[#0F0F0F] hover:bg-slate-50'
                }`}>
                {s}
              </button>
            ))}
          </div>

          <button onClick={onLogin} data-testid="topheader-login"
            className="h-11 px-4 md:px-5 rounded-md bg-[#FF5C00] hover:bg-[#C74600] text-white text-sm font-bold flex items-center gap-2 transition-colors shadow-[0_2px_0_0_rgba(0,0,0,0.05)]">
            <Lock className="w-4 h-4" />
            Inloggen
          </button>

          {/* Mobile hamburger — NAAST de Inloggen knop. Op desktop verborgen
              omdat de SecondaryNav daar de navigatie biedt. */}
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            data-testid="topheader-mobile-menu"
            aria-label={mobileMenuOpen ? 'Sluit menu' : 'Open menu'}
            className="md:hidden w-11 h-11 rounded-md border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors">
            {mobileMenuOpen ? <X className="w-5 h-5 text-[#0F0F0F]" /> : <Menu className="w-5 h-5 text-[#0F0F0F]" />}
          </button>
        </div>
      </div>

      {/* Mobile menu drawer — uitvouwbaar onder de top bar.
          Toont nav links + segment selector. Geen zoekbalk (gebruiker
          kan via greeting card zoeken). */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-t border-slate-200" data-testid="topheader-mobile-drawer">
          <div className="px-5 py-4 space-y-1">
            {navItems.map((n) => (
              <button key={n.id} onClick={() => goTo(n.id)}
                data-testid={`mobile-nav-${n.id}`}
                className="w-full text-left px-3 py-3 text-base font-bold text-[#0F0F0F] hover:bg-slate-50 rounded-md transition-colors">
                {n.label}
              </button>
            ))}
            <div className="pt-3 mt-2 border-t border-slate-100 flex flex-wrap gap-2">
              {['Beheerder', 'Huurder', 'Demo'].map((s) => (
                <button key={s} onClick={() => { setSegment(s); setMobileMenuOpen(false); }}
                  data-testid={`mobile-segment-${s.toLowerCase()}`}
                  className={`text-xs font-bold px-3 py-1.5 rounded transition-colors ${
                    segment === s
                      ? 'border border-[#0F0F0F] text-[#0F0F0F]'
                      : 'border border-slate-200 text-slate-600 hover:border-[#FF5C00]'
                  }`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Secondary nav — Home / Producten / Je situatie / etc.
// =============================================================================
function SecondaryNav() {
  const items = [
    { id: 'home',     label: 'Home',                hasMenu: false },
    { id: 'features', label: 'Functies',            hasMenu: true },
    { id: 'kiosk',    label: 'Kiosk PWA',           hasMenu: false },
    { id: 'pricing',  label: 'Prijzen',             hasMenu: false },
    { id: 'faq',      label: 'Service & FAQ',       hasMenu: false },
  ];
  const goTo = (id) => {
    if (id === 'home') { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    // Desktop only — op mobile zit de nav in TopHeader's hamburger menu.
    <div className="hidden md:block bg-white border-b border-slate-200/80 sticky top-0 z-30">
      <div className="max-w-[1280px] mx-auto px-5 lg:px-10 h-14 flex items-center justify-between">
        <nav className="flex items-center gap-8">
          {items.map((n) => (
            <button key={n.id} onClick={() => goTo(n.id)}
              data-testid={`secnav-${n.id}`}
              className="text-sm font-bold text-[#0F0F0F] hover:text-[#FF5C00] transition-colors flex items-center gap-1">
              {n.label}
              {n.hasMenu && <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          ))}
        </nav>
        <button data-testid="secnav-search"
          className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-slate-50">
          <Search className="w-5 h-5 text-[#0F0F0F]" />
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// Hero — grote ABN-stijl foto banner (vol bleed, lange hoogte) + greeting card
// =============================================================================
function Hero({ onDemo, onWhatsApp }) {
  const [greeting, setGreeting] = useState('Goedenavond');
  const [query, setQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  useEffect(() => {
    const h = new Date().getHours();
    if (h < 6) setGreeting('Goedenacht');
    else if (h < 12) setGreeting('Goedemorgen');
    else if (h < 18) setGreeting('Goedemiddag');
    else setGreeting('Goedenavond');
  }, []);

  const results = searchIndex(query);
  const goToSection = (id) => {
    setQuery('');
    setShowResults(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const onKey = (e) => {
    if (e.key === 'Enter' && results.length > 0) goToSection(results[0].section);
    if (e.key === 'Escape') { setQuery(''); setShowResults(false); }
  };

  return (
    <section className="relative" id="home">
      {/* Compactere hero — kortere full-bleed visual zoals Centraal Beheer.
          De greeting card hangt over de onderrand en steekt uit in de content
          eronder via een negatieve bottom margin (zie LandingPage wrapper). */}
      <div className="relative w-full bg-[#0F0F0F] overflow-hidden"
        style={{ minHeight: 'clamp(440px, 56vh, 620px)' }}
        data-testid="hero-canvas">
        {/* Background screenshot — wide bleed met dark overlay */}
        <div className="absolute inset-0">
          <img src={SHOTS.overzicht} alt="" loading="eager"
            className="w-full h-full object-cover object-left-top opacity-55" />
          {/* Dark cinematic gradient (links donker → rechts deels zichtbaar) */}
          <div className="absolute inset-0"
            style={{
              background:
                'linear-gradient(95deg, rgba(15,15,15,0.95) 0%, rgba(15,15,15,0.82) 30%, rgba(15,15,15,0.55) 55%, rgba(15,15,15,0.65) 100%)',
            }} />
          {/* Warm orange glow accent */}
          <div className="absolute -top-40 -right-20 w-[720px] h-[720px] rounded-full opacity-35 blur-3xl pointer-events-none"
            style={{ background: 'radial-gradient(circle, #FF5C00, transparent 65%)' }} />
          <div className="absolute -bottom-60 -left-40 w-[600px] h-[600px] rounded-full opacity-20 blur-3xl pointer-events-none"
            style={{ background: 'radial-gradient(circle, #FF8A3D, transparent 70%)' }} />
        </div>

        {/* Centered max-width content — kortere padding voor compact gevoel */}
        <div className="relative max-w-[1280px] mx-auto px-5 lg:px-10 py-10 lg:py-14 grid lg:grid-cols-[1.15fr,1fr] gap-8 lg:gap-12 items-center"
          style={{ minHeight: 'clamp(440px, 56vh, 620px)' }}>
          {/* LEFT — massive headline */}
          <div className="text-white relative z-10">
            <p className="text-xs lg:text-sm font-black tracking-[0.32em] uppercase text-[#FF8A3D] mb-4 lg:mb-5">
              Vastgoed Suite · Suriname 2026
            </p>
            <h1 className="font-black tracking-[-0.035em] leading-[0.95] text-white"
              style={{ fontSize: 'clamp(2.25rem, 5.2vw, 4.5rem)' }}
              data-testid="hero-title">
              Voor als
              <br />Excel uw vastgoed
              <br /><span className="text-[#FF8A3D]">niet meer trekt.</span>
            </h1>
            <p className="mt-5 lg:mt-6 text-base lg:text-xl text-white/85 font-medium max-w-xl leading-relaxed">
              Nu <span className="font-black text-white">30% sneller</span> dan handmatig boekhouden — met Kiosk,
              automatische facturatie en AI-OCR voor betalingen.
            </p>
            <div className="mt-6 lg:mt-7 flex flex-col sm:flex-row gap-3">
              <button onClick={onDemo} data-testid="hero-cta-action"
                className="inline-flex items-center justify-center gap-2 h-12 lg:h-13 px-6 rounded-md bg-[#FF5C00] hover:bg-[#FF8A3D] text-white text-sm lg:text-base font-black transition-colors shadow-[0_4px_0_0_rgba(0,0,0,0.15)]">
                Bekijk de demo <ArrowRight className="w-4 h-4" />
              </button>
              <button onClick={onWhatsApp}
                className="inline-flex items-center justify-center gap-2 h-12 lg:h-13 px-6 rounded-md bg-white/10 hover:bg-white/15 border border-white/20 text-white text-sm lg:text-base font-bold backdrop-blur-sm transition-colors">
                <MessageCircle className="w-5 h-5" /> WhatsApp ons
              </button>
            </div>
          </div>

          {/* RIGHT — floating dark greeting card die UIT de hero steekt
              (negatieve bottom margin op desktop zodat hij over de content
              hangt zoals op de Centraal Beheer referentie). */}
          <div className="flex items-center justify-center lg:justify-end relative z-20 lg:mb-[-110px] xl:mb-[-130px]">
            <div className="relative w-full max-w-[420px]">
              <div className="rounded-2xl bg-[#0F0F0F]/95 border border-white/10 backdrop-blur-sm p-7 lg:p-8 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6)]"
                data-testid="greeting-card">
                <h2 className="text-2xl lg:text-[28px] font-black tracking-tight text-white leading-tight">
                  {greeting},
                </h2>
                <p className="mt-2 text-base lg:text-lg text-white/70 font-medium">
                  Waarmee kunnen we u vooruit helpen?
                </p>
                <div className="mt-6 relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setShowResults(true); }}
                    onFocus={() => setShowResults(true)}
                    onBlur={() => setTimeout(() => setShowResults(false), 180)}
                    onKeyDown={onKey}
                    placeholder="Zoek functies, prijzen, FAQ…"
                    data-testid="greeting-search"
                    className="w-full h-12 pl-11 pr-4 rounded-lg bg-white text-[#0F0F0F] text-sm font-medium placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[#FF5C00]"
                  />
                  {showResults && results.length > 0 && (
                    <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 bg-white rounded-lg shadow-[0_20px_40px_-12px_rgba(0,0,0,0.4)] border border-slate-200 overflow-hidden max-h-72 overflow-y-auto"
                      data-testid="greeting-search-results">
                      {results.map((r) => (
                        <button key={r.section}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => goToSection(r.section)}
                          data-testid={`search-result-${r.section}`}
                          className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-orange-50 border-b border-slate-100 last:border-b-0 transition-colors">
                          <span className="text-sm font-bold text-[#0F0F0F]">{r.label}</span>
                          <ChevronRight className="w-4 h-4 text-[#FF5C00] shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                  {showResults && query.length >= 2 && results.length === 0 && (
                    <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 bg-white rounded-lg shadow-lg border border-slate-200 px-4 py-3">
                      <p className="text-sm text-slate-500">
                        Geen resultaten voor "<span className="font-bold text-[#0F0F0F]">{query}</span>"
                      </p>
                    </div>
                  )}
                </div>
                <button onClick={onWhatsApp} data-testid="greeting-whatsapp"
                  className="mt-5 w-full text-left text-sm font-bold text-[#FF8A3D] hover:text-orange-300 flex items-center gap-2 transition-colors">
                  <MessageCircle className="w-4 h-4" /> Liever direct chatten? WhatsApp ons
                </button>
                {/* Quick-pill suggestions */}
                <div className="mt-5 pt-5 border-t border-white/10">
                  <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/40 mb-3">Veelgezocht</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: 'Prijzen', section: 'pricing' },
                      { label: 'Kiosk PWA', section: 'kiosk' },
                      { label: 'OCR / AI', section: 'feature-3' },
                      { label: 'FAQ', section: 'faq' },
                    ].map((p) => (
                      <button key={p.label} onClick={() => goToSection(p.section)}
                        data-testid={`quicksearch-${p.section}`}
                        className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-[#FF5C00] hover:text-white border border-white/20 text-xs font-bold text-white/80 transition-colors">
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Product cards — 4x2 grid van quick-access modules
// =============================================================================
function ProductGrid({ onDemo, onLogin }) {
  const items = [
    { Icon: Lock,             label: 'Inloggen',              desc: 'Beheer toegang',        action: onLogin },
    { Icon: Building2,        label: 'Demo proberen',         desc: 'Direct testen',         action: onDemo },
    { Icon: LayoutDashboard,  label: 'Beheer Suite',          desc: 'Volledig dashboard',    target: 'feature-0' },
    { Icon: ScanLine,         label: 'Kiosk PWA',             desc: 'Selfservice terminal',  target: 'kiosk' },
    { Icon: MapPin,           label: 'Locaties',              desc: 'Multi-vestiging',       target: 'feature-1' },
    { Icon: HomeIcon,         label: 'Appartementen',         desc: 'Eenheidbeheer',         target: 'feature-2' },
    { Icon: Receipt,          label: 'Betalingen',            desc: 'Kwitanties + OCR',      target: 'feature-3' },
    { Icon: FileText,         label: 'Facturen',              desc: '3-bucket logica',       target: 'feature-4' },
  ];
  const handle = (item) => {
    if (item.action) item.action();
    else if (item.target) document.getElementById(item.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <section className="bg-slate-50 py-10 lg:py-14 lg:pt-[170px] xl:pt-[190px]">
      <div className="max-w-[1280px] mx-auto px-5 lg:px-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-4">
          {items.map(({ Icon, label, desc, action, target }) => (
            <button key={label} onClick={() => handle({ action, target })}
              data-testid={`product-card-${label.toLowerCase().replace(/\s+/g, '-')}`}
              className="group relative bg-white rounded-xl p-5 lg:p-6 flex items-center gap-3 lg:gap-4 hover:shadow-[0_18px_36px_-15px_rgba(15,15,15,0.18)] hover:-translate-y-0.5 transition-all text-left">
              <span className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center shrink-0 group-hover:bg-[#FF5C00] transition-colors">
                <Icon className="w-6 h-6 text-[#FF5C00] group-hover:text-white transition-colors" strokeWidth={2} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-base lg:text-lg font-black text-[#0F0F0F] leading-tight">{label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-[#0F0F0F] group-hover:text-[#FF5C00] group-hover:translate-x-0.5 transition-all shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Features rows — alternerende editorial layout
// =============================================================================
const FEATURE_ROWS = [
  { id: 'feature-0', eyebrow: 'Beheer Suite',
    title: 'Eén dashboard. Alle vastgoed-data.',
    desc: 'Realtime kas saldo, openstaande facturen, achterstand en activiteit in één strak overzicht. Multi-currency voor SRD, EUR en USD.',
    bullets: ['Live kas saldo per valuta', 'Achterstand & openstaand overzicht', 'Quick actions binnen handbereik'],
    img: SHOTS.overzicht },
  { id: 'feature-1', eyebrow: 'Locaties',
    title: 'Groepeer per vestiging of complex.',
    desc: 'Beheer meerdere locaties tegelijkertijd. Foto en adres per vestiging, drill-down naar individuele units.',
    bullets: ['Onbeperkt locaties per bedrijf', 'Foto + adres per locatie', 'Drill-down naar units'],
    img: SHOTS.locaties },
  { id: 'feature-2', eyebrow: 'Appartementen',
    title: 'Eenheidbeheer in detail.',
    desc: 'Per appartement: huurder, maandhuur, status, foto en QR code. Smart breaker integratie via Shelly.',
    bullets: ['Huurder · huur · status per unit', 'QR code per appartement', 'Smart breaker integratie'],
    img: SHOTS.appartementen },
  { id: 'feature-3', eyebrow: 'Betalingen',
    title: 'Kwitanties · OCR · WhatsApp.',
    desc: 'Elke betaling automatisch geboekt met PDF, e-mail-bevestiging en audit log. Gemini AI OCR voor bankafschriften.',
    bullets: ['PDF kwitantie per betaling', 'Gemini AI OCR upload', 'WhatsApp + e-mail verzending'],
    img: SHOTS.betalingen },
  { id: 'feature-4', eyebrow: 'Facturen',
    title: '3-bucket factuur logica.',
    desc: 'Automatische scheiding van achterstand, lopende maand en vooruit. Met betalingsregelingen en PDF kwitanties per termijn.',
    bullets: ['Achterstand · lopend · vooruit', 'Auto-generate maandelijks', 'Betalingsregelingen ondersteund'],
    img: SHOTS.facturen },
];

function FeatureRows() {
  return (
    <section id="features" className="bg-white py-16 lg:py-24">
      <div className="max-w-[1280px] mx-auto px-5 lg:px-10">
        <div className="max-w-2xl mb-12 lg:mb-16">
          <p className="text-xs font-black tracking-[0.3em] uppercase text-[#FF5C00] mb-3">Functies</p>
          <h2 className="text-3xl lg:text-5xl font-black tracking-tight text-[#0F0F0F] leading-tight">
            Alles wat uw vastgoed nodig heeft.
          </h2>
        </div>
        <div className="space-y-16 lg:space-y-24">
          {FEATURE_ROWS.map((f, i) => {
            const reverse = i % 2 === 1;
            return (
              <div key={f.id} id={f.id}
                data-testid={`feature-row-${i}`}
                className={`grid lg:grid-cols-2 gap-10 lg:gap-14 items-center ${reverse ? 'lg:grid-flow-dense' : ''}`}>
                <div className={reverse ? 'lg:col-start-2' : ''}>
                  <p className="text-xs font-black tracking-[0.3em] uppercase text-[#FF5C00] mb-3">
                    {f.eyebrow}
                  </p>
                  <h3 className="text-2xl lg:text-4xl font-black tracking-tight text-[#0F0F0F] leading-tight">
                    {f.title}
                  </h3>
                  <p className="mt-4 text-base lg:text-lg text-slate-600 leading-relaxed max-w-lg">
                    {f.desc}
                  </p>
                  <ul className="mt-6 space-y-2.5">
                    {f.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-3 text-sm text-[#0F0F0F] font-semibold">
                        <span className="w-6 h-6 rounded-md bg-[#FF5C00] flex items-center justify-center shrink-0 mt-0.5">
                          <ChevronRight className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                        </span>
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={reverse ? 'lg:col-start-1 lg:row-start-1' : ''}>
                  <div className="rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-[0_30px_60px_-20px_rgba(15,15,15,0.18)]">
                    <div className="h-9 bg-slate-50 border-b border-slate-200 flex items-center px-4 gap-1.5">
                      <span className="w-3 h-3 rounded-full bg-[#FF5F57]" />
                      <span className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
                      <span className="w-3 h-3 rounded-full bg-[#28C840]" />
                    </div>
                    <img src={f.img} alt={f.title} loading="lazy" className="w-full block" />
                  </div>
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
// Kiosk PWA — donker met 4 tablet screenshots
// =============================================================================
function KioskSection() {
  const tablets = [
    { num: '01', src: SHOTS.kioskLoc,      label: 'Locatie kiezen',     desc: 'Tik uw complex aan.' },
    { num: '02', src: SHOTS.kioskApt,      label: 'Appartement kiezen', desc: 'Selecteer de juiste unit.' },
    { num: '03', src: SHOTS.kioskOverview, label: 'Bedrag bekijken',    desc: 'Overzicht van openstaand.' },
    { num: '04', src: SHOTS.kioskNumpad,   label: 'Betalen',            desc: 'Touchscreen numpad.' },
  ];
  return (
    <section id="kiosk" className="bg-[#0F0F0F] text-white py-16 lg:py-24">
      <div className="max-w-[1280px] mx-auto px-5 lg:px-10">
        <div className="grid lg:grid-cols-2 gap-8 mb-12 items-end">
          <div>
            <p className="text-xs font-black tracking-[0.3em] uppercase text-[#FF8A3D] mb-3">Kiosk PWA</p>
            <h2 className="text-3xl lg:text-5xl font-black tracking-tight leading-tight">
              Selfservice in
              <span className="block text-[#FF5C00]">vier tikken.</span>
            </h2>
          </div>
          <p className="text-base lg:text-lg text-white/70 leading-relaxed max-w-lg">
            Werkt op tablet, telefoon én desktop. Installeer in 1 tik — geen App Store nodig.
            Achterstand, lopende maand en boetes met groot lettertype voor elke huurder.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-6 lg:gap-8">
          {tablets.map((t, i) => (
            <div key={t.num} data-testid={`kiosk-step-${i}`} className="bg-[#1F1F1F] rounded-2xl p-5 lg:p-6">
              <div className="flex items-baseline gap-3 mb-4">
                <span className="text-2xl font-black tracking-tighter text-[#FF5C00]">{t.num}</span>
                <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-white/40">/ STEP</span>
              </div>
              <div className="rounded-xl overflow-hidden bg-black aspect-[1920/950]">
                <img src={t.src} alt={t.label} loading="lazy"
                  className="w-full h-full object-cover object-top" />
              </div>
              <div className="mt-4">
                <p className="text-lg font-black text-white">{t.label}</p>
                <p className="text-sm text-white/60 mt-1">{t.desc}</p>
              </div>
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
// =============================================================================
// Pricing — fetched dynamisch via /api/billing/plans (PLAN_PRICES in backend)
// =============================================================================

// Statische config voor enterprise (niet in PLAN_PRICES, blijft "Custom") + UI metadata
// die niet vanuit backend komt (highlight, cta, descriptions als backend ze niet geeft).
const PLAN_UI_META = {
  starter:      { highlight: false, cta: 'Start trial' },
  professional: { highlight: true,  cta: 'Demo aanvragen' },
  enterprise:   { highlight: false, cta: 'Contact',
    name: 'Enterprise', price: 'Custom', sub: 'op aanvraag',
    desc: 'Voor grote portfolios met aangepaste integraties.',
    features: ['Onbeperkt huurders', 'Custom integraties', 'Shelly smart breakers', 'Dedicated server', 'SLA + 24/7 support'],
  },
};

function formatAmount(n) {
  try {
    return new Intl.NumberFormat('nl-NL').format(Math.round(Number(n) || 0));
  } catch {
    return String(n);
  }
}

function PricingSection({ onDemo, onWhatsApp }) {
  const [plans, setPlans] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const backend = (typeof process !== 'undefined' && process.env?.REACT_APP_BACKEND_URL) || '';
        const res = await fetch(`${backend}/api/billing/plans`);
        if (!res.ok) throw new Error('bad status');
        const data = await res.json();
        if (cancelled) return;
        // Transform backend plans → UI shape. Enterprise wordt als laatste toegevoegd.
        const out = data.map((p) => {
          const ui = PLAN_UI_META[p.id] || {};
          return {
            id: p.id,
            name: p.name,
            price: formatAmount(p.amount),
            sub: `${p.currency} / maand`,
            desc: p.description || '',
            features: p.features || [],
            cta: ui.cta || 'Demo aanvragen',
            highlight: !!ui.highlight,
          };
        });
        // Voeg enterprise toe — niet in backend PLAN_PRICES.
        out.push(PLAN_UI_META.enterprise);
        setPlans(out);
      } catch {
        // Fallback op de oorspronkelijke hardcoded plans als de backend niet bereikbaar is.
        setPlans([
          { name: 'Starter', price: '3.000', sub: 'SRD / maand',
            desc: 'Voor kleinere vastgoedbeheerders.',
            features: ['Onbeperkt appartementen', 'Online betalen', 'WhatsApp & E-mail'],
            cta: 'Start trial' },
          { name: 'Professional', price: '5.000', sub: 'SRD / maand', highlight: true,
            desc: 'Met Kiosk terminal en alle functies.',
            features: ['Alles uit Starter', 'Kiosk terminal', 'Shelly stroombeheer', 'Prioriteit support'],
            cta: 'Demo aanvragen' },
          PLAN_UI_META.enterprise,
        ]);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!loaded) {
    return (
      <section id="pricing" className="bg-slate-50 py-16 lg:py-24">
        <div className="max-w-[1280px] mx-auto px-5 lg:px-10">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <p className="text-xs font-black tracking-[0.3em] uppercase text-[#FF5C00] mb-3">Prijzen</p>
            <h2 className="text-3xl lg:text-5xl font-black tracking-tight text-[#0F0F0F] leading-tight">
              Eerlijk geprijsd voor elk vastgoedbedrijf.
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-2xl bg-white border border-slate-200 p-7 h-[420px] animate-pulse">
                <div className="h-4 w-24 bg-slate-200 rounded mb-4" />
                <div className="h-12 w-32 bg-slate-200 rounded mb-3" />
                <div className="h-3 w-full bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="pricing" className="bg-slate-50 py-16 lg:py-24">
      <div className="max-w-[1280px] mx-auto px-5 lg:px-10">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-xs font-black tracking-[0.3em] uppercase text-[#FF5C00] mb-3">Prijzen</p>
          <h2 className="text-3xl lg:text-5xl font-black tracking-tight text-[#0F0F0F] leading-tight">
            Eerlijk geprijsd voor elk vastgoedbedrijf.
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {plans.map((p) => (
            <div key={p.name}
              data-testid={`plan-${p.name.toLowerCase()}`}
              className={`relative rounded-2xl p-7 transition-all ${
                p.highlight
                  ? 'bg-[#0F0F0F] text-white shadow-[0_30px_60px_-20px_rgba(15,15,15,0.4)] md:-translate-y-3'
                  : 'bg-white border border-slate-200 hover:border-[#FF5C00] hover:shadow-[0_18px_36px_-15px_rgba(255,92,0,0.2)]'
              }`}>
              {p.highlight && (
                <div className="absolute top-0 right-7 -translate-y-1/2 px-3 py-1 rounded-md text-[10px] font-black tracking-widest uppercase bg-[#FF5C00] text-white">
                  Aanbevolen
                </div>
              )}
              <p className={`text-sm font-black tracking-wider uppercase mb-4 ${p.highlight ? 'text-[#FF8A3D]' : 'text-[#FF5C00]'}`}>
                {p.name}
              </p>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-5xl lg:text-6xl font-black tracking-tighter ${p.highlight ? 'text-white' : 'text-[#0F0F0F]'}`}>
                  {p.price === 'Custom' ? 'Custom' : p.price}
                </span>
                {p.price !== 'Custom' && (
                  <span className={`text-sm font-bold ${p.highlight ? 'text-white/50' : 'text-slate-500'}`}>
                    {p.sub}
                  </span>
                )}
              </div>
              <p className={`mt-3 text-sm leading-relaxed ${p.highlight ? 'text-white/70' : 'text-slate-600'}`}>
                {p.desc}
              </p>
              <button onClick={p.name === 'Enterprise' ? onWhatsApp : onDemo}
                data-testid={`plan-cta-${p.name.toLowerCase()}`}
                className={`mt-6 w-full h-12 rounded-md text-sm font-black transition-colors flex items-center justify-center gap-2 ${
                  p.highlight
                    ? 'bg-[#FF5C00] hover:bg-[#FF8A3D] text-white'
                    : 'bg-[#0F0F0F] hover:bg-[#FF5C00] text-white'
                }`}>
                {p.cta} <ArrowRight className="w-4 h-4" />
              </button>
              <ul className={`mt-6 space-y-2.5 pt-6 border-t ${p.highlight ? 'border-white/10' : 'border-slate-100'}`}>
                {p.features.map((f) => (
                  <li key={f} className={`text-sm flex items-start gap-2.5 ${p.highlight ? 'text-white/85' : 'text-[#0F0F0F]'}`}>
                    <ChevronRight className={`w-4 h-4 mt-0.5 shrink-0 ${p.highlight ? 'text-[#FF8A3D]' : 'text-[#FF5C00]'}`} strokeWidth={3} />
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
    a: 'Met onze Setup Wizard bent u binnen 30 minuten live: locaties, appartementen, huurders en eerste facturen — allemaal stap voor stap.' },
  { q: 'Werkt het systeem op iPhone en Android?',
    a: 'Ja. Het is een PWA — installeer hem direct via Safari (iOS) of Chrome (Android). Geen App Store nodig.' },
  { q: 'Kan ik mijn eigen huisstijl gebruiken?',
    a: 'Volledig white-label. Upload uw logo en kies uw kleur — uw huurders zien alleen úw bedrijf.' },
  { q: 'Hoe veilig is mijn data?',
    a: 'Multi-tenant isolatie op database-niveau, bcrypt + JWT auth, goedkeuringsworkflow voor betalingen, audit log van elke wijziging.' },
  { q: 'Kan ik later opzeggen?',
    a: 'Maandelijks opzegbaar. Geen lock-in. U kunt al uw data exporteren wanneer u maar wilt.' },
];

function FAQSection() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="bg-white py-16 lg:py-24">
      <div className="max-w-3xl mx-auto px-5 lg:px-10">
        <div className="text-center mb-10">
          <p className="text-xs font-black tracking-[0.3em] uppercase text-[#FF5C00] mb-3">Service & FAQ</p>
          <h2 className="text-3xl lg:text-5xl font-black tracking-tight text-[#0F0F0F] leading-tight">
            Antwoorden op uw vragen.
          </h2>
        </div>
        <div className="border-t border-slate-200">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={i} className="border-b border-slate-200">
                <button onClick={() => setOpen(isOpen ? -1 : i)}
                  data-testid={`faq-${i}`}
                  className="w-full text-left py-5 flex items-start justify-between gap-4 hover:text-[#FF5C00] transition-colors">
                  <p className="text-base lg:text-lg font-black text-[#0F0F0F]">{f.q}</p>
                  {isOpen ? <ChevronUp className="w-5 h-5 text-[#FF5C00] shrink-0" />
                          : <ChevronDown className="w-5 h-5 text-[#0F0F0F] shrink-0" />}
                </button>
                {isOpen && <div className="pb-5"><p className="text-sm text-slate-600 leading-relaxed">{f.a}</p></div>}
              </div>
            );
          })}
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
    <footer className="bg-[#0F0F0F] text-white/60">
      <div className="max-w-[1280px] mx-auto px-5 lg:px-10 py-12 lg:py-16">
        <div className="grid md:grid-cols-4 gap-8 lg:gap-10">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-9 h-9 rounded-lg bg-[#FF5C00] p-1.5">
                <img src="/kiosk-icons/mark-white.png" alt="" className="w-full h-full object-contain" />
              </span>
              <span className="text-base font-black text-white">
                Suri<span className="text-[#FF5C00]">Rent</span> <span className="text-white/60">N.V</span>
              </span>
            </div>
            <p className="text-sm leading-relaxed max-w-md">
              Het volledige vastgoedplatform voor Surinaamse verhuurders.
              White-label SaaS met Kiosk, automatische facturatie en AI-OCR.
            </p>
            <div className="mt-5 flex items-center gap-1">
              {[0,1,2,3,4].map((i) => <Star key={i} className="w-4 h-4 fill-[#FF8A3D] text-[#FF8A3D]" />)}
              <span className="ml-2 text-xs font-bold text-white/70">5.0 · Surinaams gebouwd</span>
            </div>
          </div>
          <div>
            <p className="text-xs font-black tracking-[0.22em] uppercase text-white mb-4">Product</p>
            <ul className="space-y-2.5 text-sm">
              <li><a href="#features" className="hover:text-[#FF5C00] transition-colors">Functies</a></li>
              <li><a href="#kiosk" className="hover:text-[#FF5C00] transition-colors">Kiosk PWA</a></li>
              <li><a href="#pricing" className="hover:text-[#FF5C00] transition-colors">Prijzen</a></li>
              <li><a href="#faq" className="hover:text-[#FF5C00] transition-colors">FAQ</a></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-black tracking-[0.22em] uppercase text-white mb-4">Contact</p>
            <ul className="space-y-2.5 text-sm">
              <li className="flex items-center gap-2"><Mail className="w-4 h-4 text-[#FF8A3D]" /> info@surirent.sr</li>
              <li className="flex items-center gap-2"><Phone className="w-4 h-4 text-[#FF8A3D]" /> +597 XXX XXX</li>
              <li className="flex items-center gap-2"><Users className="w-4 h-4 text-[#FF8A3D]" /> Paramaribo, SR</li>
              <li className="pt-2">
                <button onClick={onLogin} data-testid="footer-login"
                  className="text-[#FF8A3D] hover:text-orange-300 font-bold">
                  Beheerder inloggen →
                </button>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-12 pt-8 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-white/40">© {new Date().getFullYear()} SuriRent N.V. Alle rechten voorbehouden.</p>
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
  const [segment, setSegment] = useState('Beheerder');

  useEffect(() => {
    document.body.style.backgroundColor = '#FFFFFF';
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
    <div className="min-h-screen bg-white text-[#0F0F0F] antialiased selection:bg-[#FF5C00] selection:text-white">
      <TopHeader segment={segment} setSegment={setSegment} onLogin={onLogin} />
      <SecondaryNav />
      <Hero onDemo={onDemo} onWhatsApp={onWhatsApp} />
      <ProductGrid onDemo={onDemo} onLogin={onLogin} />
      <FeatureRows />
      <KioskSection />
      <PricingSection onDemo={onDemo} onWhatsApp={onWhatsApp} />
      <FAQSection />
      <Footer onLogin={onLogin} />
    </div>
  );
}
