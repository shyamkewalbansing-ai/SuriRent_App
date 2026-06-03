// Per-bedrijf publieke landing — appartement-verhuur showcase template.
//
// Activatie: deze pagina wordt automatisch gerenderd door App.js wanneer het
// huidige Host header overeenkomt met een company.custom_domain in /api/public/company-landing.
//
// Edit-modus: ?edit=1 wordt door TenantLandingEditor (admin) gezet via iframe.
// Alle teksten/afbeeldingen zijn inline-editable via <EditableText> / <EditableImage>.
//
// Data:
//   - company: {id, name, slug, branding{logo_url, primary_color}, address, contact_email,
//                contact_phone, whatsapp_phone}
//   - apartments: lijst van vacant units (auto-gevuld door backend)
//   - content: door admin bewerkbare overrides (hero, sections, footer, etc.)
//
// Design: warm-modern, mobiel-first, appartement-cards prominent.

import { useEffect, useState, useCallback } from 'react';
import {
  MapPin, Phone, Mail, MessageCircle, ArrowRight, CheckCircle2, Send,
  Home, Bed, Bath, Square, Wifi, Car, Loader2, Building2, ChevronRight,
} from 'lucide-react';
import {
  EditableProvider, EditableText, EditableImage,
} from '../../lib/landing-editable';

const fmtMoney = (n, c = 'SRD') => {
  try {
    return `${c} ${new Intl.NumberFormat('nl-NL').format(Math.round(Number(n) || 0))}`;
  } catch {
    return `${c} ${n}`;
  }
};

function Header({ company }) {
  const logo = company?.branding?.logo_url || '';
  const primary = company?.branding?.primary_color || '#FF5C00';
  return (
    <header className="bg-white border-b border-slate-100 sticky top-0 z-30 backdrop-blur-md bg-white/95">
      <div className="max-w-[1280px] mx-auto px-5 lg:px-10 h-20 flex items-center justify-between">
        <div className="flex items-center gap-3" data-testid="tenant-landing-logo">
          {logo ? (
            <EditableImage path="logo_url" fallback={logo} alt={company.name}
              className="w-11 h-11 rounded-lg object-cover" />
          ) : (
            <span className="w-11 h-11 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: primary }}>
              <Building2 className="w-5 h-5 text-white" />
            </span>
          )}
          <EditableText path="brand_name" fallback={company?.name || 'Vastgoed'}
            as="span" className="text-xl md:text-2xl font-black tracking-tight text-slate-900" />
        </div>
        <nav className="hidden md:flex items-center gap-6">
          <a href="#aanbod" className="text-sm font-bold text-slate-700 hover:text-slate-900">Aanbod</a>
          <a href="#over" className="text-sm font-bold text-slate-700 hover:text-slate-900">Over ons</a>
          <a href="#contact" className="text-sm font-bold text-slate-700 hover:text-slate-900">Contact</a>
        </nav>
        <a href="#contact"
          className="h-11 px-4 md:px-5 rounded-md text-white text-sm font-bold flex items-center gap-2 shadow-sm"
          style={{ backgroundColor: primary }}>
          <Phone className="w-4 h-4" /> <EditableText path="header_cta" fallback="Bel ons" as="span" />
        </a>
      </div>
    </header>
  );
}

function Hero({ company }) {
  const primary = company?.branding?.primary_color || '#FF5C00';
  return (
    <section className="relative bg-slate-900 text-white overflow-hidden" data-testid="tenant-hero">
      <div className="absolute inset-0">
        <EditableImage path="hero.bg_url" fallback="https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1600&q=80"
          alt="" className="w-full h-full object-cover opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/50 via-slate-900/70 to-slate-900" />
      </div>
      <div className="relative max-w-[1280px] mx-auto px-5 lg:px-10 py-20 lg:py-32">
        <EditableText path="hero.eyebrow" fallback="Beschikbare appartementen"
          as="p" className="text-xs font-black tracking-[0.32em] uppercase mb-5"
          style={{ color: primary }} />
        <h1 className="font-black tracking-tight leading-[1.02]"
          style={{ fontSize: 'clamp(2.5rem, 6vw, 5rem)' }}>
          <EditableText path="hero.title_line1" fallback={`Welkom bij ${company?.name || ''}`} as="span" />
          <br />
          <EditableText path="hero.title_line2" fallback="uw nieuwe thuis wacht."
            as="span" style={{ color: primary }} />
        </h1>
        <EditableText path="hero.subtitle"
          fallback="Moderne, comfortabele appartementen voor lange en korte huur. Direct beschikbaar in Suriname."
          as="p" multiline
          className="mt-6 text-lg lg:text-xl text-white/85 max-w-2xl leading-relaxed" />
        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <a href="#aanbod"
            className="inline-flex items-center justify-center gap-2 h-14 px-7 rounded-md text-white text-base font-black"
            style={{ backgroundColor: primary }}>
            <EditableText path="hero.cta_primary" fallback="Bekijk het aanbod" as="span" />
            <ArrowRight className="w-5 h-5" />
          </a>
          <a href="#contact"
            className="inline-flex items-center justify-center gap-2 h-14 px-7 rounded-md bg-white/10 hover:bg-white/20 border border-white/30 text-white text-base font-bold backdrop-blur-sm">
            <MessageCircle className="w-5 h-5" />
            <EditableText path="hero.cta_secondary" fallback="Neem contact op" as="span" />
          </a>
        </div>
      </div>
    </section>
  );
}

function StatsBar({ company, apartments }) {
  const primary = company?.branding?.primary_color || '#FF5C00';
  const stats = [
    { value: apartments.length, label: 'Beschikbaar' },
    { value: '24/7', label: 'Bereikbaar' },
    { value: '100%', label: 'Suriname' },
    { value: 'NL/EN', label: 'Talen' },
  ];
  return (
    <section className="bg-white border-b border-slate-100 -mt-px">
      <div className="max-w-[1280px] mx-auto px-5 lg:px-10 grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 py-10">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <p className="text-3xl lg:text-4xl font-black" style={{ color: primary }}>{s.value}</p>
            <p className="text-xs lg:text-sm font-bold uppercase tracking-wider text-slate-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ApartmentsGrid({ company, apartments }) {
  const primary = company?.branding?.primary_color || '#FF5C00';
  return (
    <section id="aanbod" className="bg-slate-50 py-16 lg:py-24">
      <div className="max-w-[1280px] mx-auto px-5 lg:px-10">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <EditableText path="aanbod.eyebrow" fallback="Ons aanbod" as="p"
            className="text-xs font-black tracking-[0.32em] uppercase mb-3" style={{ color: primary }} />
          <EditableText path="aanbod.title" fallback="Direct beschikbare appartementen"
            as="h2" className="text-3xl lg:text-5xl font-black tracking-tight text-slate-900 leading-tight" />
          <EditableText path="aanbod.subtitle"
            fallback="Alle eenheden zijn klaar voor bewoning. Klik op een appartement voor meer details."
            as="p" multiline className="mt-4 text-base lg:text-lg text-slate-600 leading-relaxed" />
        </div>

        {apartments.length === 0 ? (
          <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-16 text-center">
            <Home className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="font-extrabold text-slate-700 text-lg">Geen appartementen beschikbaar</p>
            <p className="text-sm text-slate-500 mt-2">Neem contact op voor de wachtlijst.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
            {apartments.map((apt) => (
              <article key={apt.id} data-testid={`apt-card-${apt.id}`}
                className="bg-white rounded-2xl overflow-hidden border border-slate-100 hover:shadow-2xl hover:-translate-y-1 transition-all group">
                <div className="aspect-[4/3] bg-slate-100 overflow-hidden relative">
                  {apt.photo_url ? (
                    <img src={apt.photo_url} alt={apt.number}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Home className="w-16 h-16 text-slate-300" />
                    </div>
                  )}
                  <div className="absolute top-3 left-3 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider text-white shadow-md"
                    style={{ backgroundColor: primary }}>
                    Beschikbaar
                  </div>
                </div>
                <div className="p-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Eenheid</p>
                  <h3 className="text-xl font-extrabold text-slate-900 mt-1">{apt.number}</h3>
                  {apt.address && (
                    <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-1">
                      <MapPin className="w-3.5 h-3.5" /> {apt.address}
                    </p>
                  )}
                  {apt.description && (
                    <p className="text-sm text-slate-600 mt-3 line-clamp-2">{apt.description}</p>
                  )}
                  <div className="mt-4 pt-4 border-t border-slate-100 flex items-end justify-between">
                    <div>
                      <p className="text-2xl font-black text-slate-900">{fmtMoney(apt.rent_amount, apt.currency)}</p>
                      <p className="text-xs text-slate-500 font-bold">per maand</p>
                    </div>
                    <a href="#contact"
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
                        try {
                          window.dispatchEvent(new CustomEvent('tenant-landing-select-apt', { detail: apt }));
                        } catch { /* noop */ }
                      }}
                      className="text-xs font-extrabold flex items-center gap-1 group/btn"
                      style={{ color: primary }}>
                      Interesse <ChevronRight className="w-3.5 h-3.5 group-hover/btn:translate-x-0.5 transition-transform" />
                    </a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

const AMENITY_ICONS = { wifi: Wifi, parking: Car, beds: Bed, baths: Bath, size: Square };

function About({ company }) {
  const primary = company?.branding?.primary_color || '#FF5C00';
  const amenities = [
    { key: 'wifi',    fallback_label: 'Snel WiFi inbegrepen' },
    { key: 'parking', fallback_label: 'Eigen parkeerplaats' },
    { key: 'beds',    fallback_label: 'Volledig gemeubileerd' },
    { key: 'baths',   fallback_label: 'Privé badkamer' },
  ];
  return (
    <section id="over" className="bg-white py-16 lg:py-24">
      <div className="max-w-[1280px] mx-auto px-5 lg:px-10 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <div>
          <EditableText path="about.eyebrow" fallback="Over ons" as="p"
            className="text-xs font-black tracking-[0.32em] uppercase mb-3" style={{ color: primary }} />
          <EditableText path="about.title" fallback={`Waarom kiezen voor ${company?.name || ''}?`}
            as="h2" className="text-3xl lg:text-4xl font-black tracking-tight text-slate-900 leading-tight" />
          <EditableText path="about.body"
            fallback={`Wij verhuren al jaren kwaliteitsvol vastgoed in Suriname. Persoonlijke service, transparante prijzen en een snelle reactietijd staan bij ons centraal. Of u nu kort of lang wilt huren — wij helpen u graag.`}
            as="p" multiline className="mt-5 text-base lg:text-lg text-slate-600 leading-relaxed" />

          <ul className="mt-7 grid sm:grid-cols-2 gap-3">
            {amenities.map((a, i) => {
              const Icon = AMENITY_ICONS[a.key] || CheckCircle2;
              return (
                <li key={a.key} className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
                  <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${primary}1A`, color: primary }}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <EditableText path={`about.amenities.${i}.label`} fallback={a.fallback_label}
                    as="span" className="text-sm font-bold text-slate-700" />
                </li>
              );
            })}
          </ul>
        </div>
        <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-slate-100">
          <EditableImage path="about.image_url"
            fallback="https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80"
            alt="" className="w-full h-full object-cover" />
        </div>
      </div>
    </section>
  );
}

function ContactSection({ company }) {
  const primary = company?.branding?.primary_color || '#FF5C00';
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '', apartment_id: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const onSelect = (ev) => {
      const apt = ev?.detail;
      if (apt?.id) {
        setForm((f) => ({
          ...f,
          apartment_id: apt.id,
          message: f.message || `Ik heb interesse in eenheid ${apt.number || ''}`,
        }));
      }
    };
    window.addEventListener('tenant-landing-select-apt', onSelect);
    return () => window.removeEventListener('tenant-landing-select-apt', onSelect);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.phone) {
      setErr('Naam en telefoon zijn verplicht.');
      return;
    }
    setSending(true); setErr('');
    try {
      const backend = process.env.REACT_APP_BACKEND_URL || '';
      const res = await fetch(`${backend}/api/public/landing-lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: company?.id, ...form }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSent(true);
    } catch (e2) {
      setErr('Verzenden mislukt. Bel of WhatsApp ons direct.');
    } finally {
      setSending(false);
    }
  };

  const whatsapp = company?.whatsapp_phone || company?.contact_phone || '';
  const whatsappHref = whatsapp ? `https://wa.me/${whatsapp.replace(/[^0-9]/g, '')}?text=Hallo,%20ik%20heb%20interesse%20in%20een%20appartement` : '';
  return (
    <section id="contact" className="bg-slate-900 text-white py-16 lg:py-24" data-testid="tenant-contact-section">
      <div className="max-w-[1280px] mx-auto px-5 lg:px-10 grid lg:grid-cols-2 gap-12 items-start">
        <div>
          <EditableText path="contact.eyebrow" fallback="Contact" as="p"
            className="text-xs font-black tracking-[0.32em] uppercase mb-3" style={{ color: primary }} />
          <EditableText path="contact.title" fallback="Laten we kennismaken."
            as="h2" className="text-3xl lg:text-5xl font-black tracking-tight leading-tight" />
          <EditableText path="contact.subtitle"
            fallback="Laat uw gegevens achter — wij bellen u binnen 24 uur terug. Of bereik ons direct via WhatsApp."
            as="p" multiline className="mt-5 text-base lg:text-lg text-white/75 leading-relaxed max-w-lg" />

          <div className="mt-8 space-y-3">
            {company?.contact_phone && (
              <a href={`tel:${company.contact_phone}`} className="flex items-center gap-3 group">
                <span className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${primary}26`, color: primary }}>
                  <Phone className="w-5 h-5" />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Bel ons</p>
                  <p className="text-lg font-extrabold group-hover:underline">{company.contact_phone}</p>
                </div>
              </a>
            )}
            {whatsappHref && (
              <a href={whatsappHref} target="_blank" rel="noreferrer" className="flex items-center gap-3 group">
                <span className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <MessageCircle className="w-5 h-5" />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">WhatsApp</p>
                  <p className="text-lg font-extrabold group-hover:underline">{whatsapp}</p>
                </div>
              </a>
            )}
            {company?.contact_email && (
              <a href={`mailto:${company.contact_email}`} className="flex items-center gap-3 group">
                <span className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${primary}26`, color: primary }}>
                  <Mail className="w-5 h-5" />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">E-mail</p>
                  <p className="text-lg font-extrabold group-hover:underline">{company.contact_email}</p>
                </div>
              </a>
            )}
            {company?.address && (
              <div className="flex items-center gap-3">
                <span className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${primary}26`, color: primary }}>
                  <MapPin className="w-5 h-5" />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Adres</p>
                  <p className="text-lg font-extrabold">{company.address}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Lead form */}
        <div className="bg-white text-slate-900 rounded-2xl p-6 lg:p-8 shadow-2xl">
          {sent ? (
            <div className="text-center py-8" data-testid="lead-sent">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-black">Bedankt!</h3>
              <p className="text-slate-600 mt-2">Wij nemen zo snel mogelijk contact met u op.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3" data-testid="lead-form">
              <h3 className="text-xl font-extrabold mb-2">Stuur ons een bericht</h3>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                data-testid="lead-name"
                placeholder="Uw naam *" required
                className="w-full h-12 px-4 rounded-xl border-2 border-slate-200 focus:border-current outline-none"
                style={{ borderColor: form.name ? primary : undefined }} />
              <div className="grid sm:grid-cols-2 gap-3">
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  data-testid="lead-phone"
                  placeholder="Telefoon *" required type="tel"
                  className="h-12 px-4 rounded-xl border-2 border-slate-200 focus:border-current outline-none" />
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  data-testid="lead-email"
                  placeholder="E-mail" type="email"
                  className="h-12 px-4 rounded-xl border-2 border-slate-200 focus:border-current outline-none" />
              </div>
              <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })}
                data-testid="lead-message"
                placeholder="Uw bericht of vraag…" rows={4}
                className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-current outline-none resize-y" />
              {err && <p className="text-sm text-red-600">{err}</p>}
              <button type="submit" disabled={sending}
                data-testid="lead-submit"
                className="w-full h-13 px-6 rounded-xl text-white font-extrabold text-base flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ backgroundColor: primary }}>
                {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                Verstuur aanvraag
              </button>
              <p className="text-[11px] text-slate-400 text-center">Wij reageren binnen 24 uur op werkdagen.</p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

function TenantFooter({ company }) {
  return (
    <footer className="bg-slate-900 text-white/60 border-t border-white/10 py-8">
      <div className="max-w-[1280px] mx-auto px-5 lg:px-10 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs">© {new Date().getFullYear()} <span className="font-bold text-white">{company?.name}</span>. Alle rechten voorbehouden.</p>
        <p className="text-[10px] tracking-widest uppercase">
          Powered by <a href="https://surirent.sr" target="_blank" rel="noreferrer" className="text-[#FF8A3D] hover:text-orange-300 font-bold">SuriRent</a>
        </p>
      </div>
    </footer>
  );
}

/**
 * Main TenantPublicLanding component
 *
 * Props:
 *  - company / apartments / content can be passed directly (used by App.js after fetching)
 *  - Or it will fetch from /api/public/company-landing on mount (for ?edit=1 mode)
 */
export default function TenantPublicLanding({
  company: companyProp = null,
  apartments: apartmentsProp = null,
  content: contentProp = null,
  editMode: editModeProp = null,
} = {}) {
  const [company, setCompany] = useState(companyProp);
  const [apartments, setApartments] = useState(apartmentsProp || []);
  const [content, setContent] = useState(contentProp || {});
  const [loading, setLoading] = useState(!companyProp);

  const editMode = editModeProp ?? (() => {
    try {
      return new URLSearchParams(window.location.search).get('edit') === '1';
    } catch { return false; }
  })();

  // Lazy fetch — voor edit-mode of wanneer parent niets meegeeft.
  useEffect(() => {
    if (!editMode && companyProp) return;
    const backend = process.env.REACT_APP_BACKEND_URL || '';
    const fetchData = async () => {
      try {
        // Edit-mode: laad draft van de eigen company (admin auth) of opgegeven cid
        if (editMode) {
          const params = new URLSearchParams(window.location.search);
          const cid = params.get('cid');
          const url = cid
            ? `${backend}/api/superadmin/companies/${cid}/landing?mode=draft`
            : `${backend}/api/companies/me/landing?mode=draft`;
          const token = localStorage.getItem('admin_token') || '';
          const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
          const j = await r.json();
          setContent(j.content || {});
          // Company info + apartments uit aparte endpoint
          const aptUrl = `${backend}/api/companies/me/landing-apartments`;
          const ra = await fetch(aptUrl, { headers: { Authorization: `Bearer ${token}` } });
          if (ra.ok) setApartments(await ra.json());
          const meUrl = `${backend}/api/auth/me`;
          const rm = await fetch(meUrl, { headers: { Authorization: `Bearer ${token}` } });
          if (rm.ok) {
            const me = await rm.json();
            setCompany(me.active_company || me.company || null);
          }
        } else {
          const r = await fetch(`${backend}/api/public/company-landing`);
          const j = await r.json();
          if (j.found) {
            setCompany(j.company);
            setApartments(j.apartments || []);
            setContent(j.content || {});
          }
        }
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [editMode, companyProp]);

  // PostMessage patches naar parent (TenantLandingEditor iframe).
  const onPatch = useCallback((p) => {
    try { window.parent?.postMessage({ type: 'landing-edit-patch', ...p }, '*'); } catch { /* noop */ }
  }, []);

  useEffect(() => {
    if (!editMode) return;
    try { window.parent?.postMessage({ type: 'landing-edit-ready' }, '*'); } catch { /* noop */ }
  }, [editMode]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-5 text-center">
        <div>
          <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h1 className="text-2xl font-extrabold text-slate-700">Bedrijf niet gevonden</h1>
          <p className="text-sm text-slate-500 mt-2">Dit domein is nog niet gekoppeld aan een bedrijf.</p>
        </div>
      </div>
    );
  }

  return (
    <EditableProvider editMode={editMode} initialContent={content} onPatch={onPatch}>
      <div className="min-h-screen bg-white">
        {editMode && (
          <div className="bg-orange-500 text-white text-center py-1.5 text-xs font-extrabold tracking-wider uppercase sticky top-0 z-50"
            data-testid="edit-mode-banner">
            ✏️ Bewerk modus actief — klik op een tekst of afbeelding
          </div>
        )}
        <Header company={company} />
        <Hero company={company} />
        <StatsBar company={company} apartments={apartments} />
        <ApartmentsGrid company={company} apartments={apartments} />
        <About company={company} />
        <ContactSection company={company} />
        <TenantFooter company={company} />
      </div>
    </EditableProvider>
  );
}
