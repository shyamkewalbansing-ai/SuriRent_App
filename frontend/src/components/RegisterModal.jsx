// =====================================================================
// RegisterModal — popup-stijl registratie formulier voor landing page.
// Achtergrond wordt vervaagd (backdrop-blur), formulier verschijnt
// centraal als een modale dialog. Sluiten via X knop, ESC, of klik
// op de blur-overlay.
// =====================================================================
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  X, Loader2, Eye, EyeOff, Sparkles, ArrowRight, Globe,
  ShieldCheck, Zap, Star, Check, Download, Mail,
} from 'lucide-react';
import { api, formatError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { RESERVED_SLUGS } from '../lib/branded-nav';
import { useIsMobile } from '../lib/use-is-mobile';
import { MobileRegisterWizard } from './MobileAuthShell';

function Bank({ label, value, mono }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className={`text-slate-900 font-bold text-right break-all ${mono ? 'font-mono' : ''}`}>{value || '—'}</span>
    </div>
  );
}

export default function RegisterModal({ open, onClose }) {
  const { register } = useAuth();
  const isMobile = useIsMobile();

  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [telefoon, setTelefoon] = useState('');
  const [address, setAddress] = useState('');
  const [country, setCountry] = useState('SR');
  const [plan, setPlan] = useState('starter');
  const [showPw, setShowPw] = useState(false);
  const [plans, setPlans] = useState([]);
  const [bankDetails, setBankDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [registeredSlug, setRegisteredSlug] = useState('');
  // Onthoud email + password nadat registratie is gelukt, zodat we een
  // welkomstpakket-PDF kunnen genereren en (best-effort) per mail versturen.
  const [savedPassword, setSavedPassword] = useState('');
  const [savedEmail, setSavedEmail] = useState('');
  const [emailStatus, setEmailStatus] = useState('idle'); // 'idle' | 'sending' | 'sent' | 'error'
  const [pdfDownloaded, setPdfDownloaded] = useState(false);

  const modalRef = useRef(null);

  // ESC om te sluiten + body scroll lock
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  // Plans + bank details laden zodra modal opent
  const planQuery = country === 'NL' ? '?currency=EUR' : '?currency=SRD';
  useEffect(() => {
    if (!open) return;
    api.get(`/billing/plans${planQuery}`).then((r) => setPlans(r.data)).catch(() => setPlans([]));
    api.get('/billing/bank-details').then((r) => setBankDetails(r.data)).catch(() => setBankDetails(null));
  }, [open, planQuery]);

  // Slug wordt handmatig ingevoerd. Wanneer de gebruiker het slug-veld nog
  // NIET heeft aangeraakt, tonen we een suggestie op basis van de bedrijfsnaam
  // — zodra hij het slug-veld zelf bewerkt (`slugTouched=true`) laten we die
  // volledig met rust en gebruiken exact wat de gebruiker heeft ingetypt.
  const slugSuggestion = useMemo(() => {
    const raw = (companyName || '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    if (!raw) return '';
    return RESERVED_SLUGS.has(raw) ? `${raw}-bedrijf` : raw;
  }, [companyName]);

  const effectiveSlug = (slugTouched ? slug : (slug || slugSuggestion))
    .toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

  const portalPreview = useMemo(() => {
    if (!effectiveSlug) return { slug: '', host: '' };
    let host = '';
    try { host = (window.location.host || '').replace(/:.*$/, ''); } catch { /* ignore */ }
    return { slug: effectiveSlug, host };
  }, [effectiveSlug]);

  const [slugStatus, setSlugStatus] = useState('idle');
  useEffect(() => {
    if (!open) return undefined;
    const s = portalPreview.slug;
    if (!s) { setSlugStatus('idle'); return undefined; }
    setSlugStatus('checking');
    const handle = setTimeout(async () => {
      try {
        const { data } = await api.get(`/public/companies/${encodeURIComponent(s)}/available`);
        if (data?.available) setSlugStatus('available');
        else setSlugStatus(data?.reason || 'taken');
      } catch { setSlugStatus('idle'); }
    }, 350);
    return () => clearTimeout(handle);
  }, [portalPreview.slug, open]);

  const submit = async (e) => {
    e?.preventDefault();
    if (!companyName.trim()) { setError('Vul de bedrijfsnaam in.'); return; }
    if (!effectiveSlug) { setError('Kies een portal-URL (slug).'); return; }
    if (slugStatus === 'taken') { setError(`Portal-URL '${effectiveSlug}' is al in gebruik. Kies een andere.`); return; }
    if (slugStatus === 'format' || slugStatus === 'reserved') { setError('Ongeldige portal-URL — alleen letters, cijfers en koppelteken.'); return; }
    setLoading(true); setError('');
    try {
      const result = await register({
        name: name.trim(),
        email: email.trim(),
        password,
        company_name: companyName.trim(),
        slug: effectiveSlug,
        telefoon: telefoon.trim(),
        address: address.trim(),
        plan,
        country,
      });
      const newSlug = result?.company?.slug || '';
      if (newSlug) setRegisteredSlug(newSlug);
      // Bewaar credentials in memory (niet in localStorage!) — nodig om het
      // welkomstpakket te kunnen genereren + mailen. Wordt gewist bij close.
      setSavedEmail(email.trim());
      setSavedPassword(password);
      setSuccess(true);
    } catch (err) {
      setError(formatError(err, 'Registratie mislukt'));
    } finally { setLoading(false); }
  };

  const goToPortal = () => {
    if (registeredSlug) {
      window.location.assign(`/${registeredSlug}/admin`);
    } else {
      window.location.assign('/admin');
    }
  };

  // Helper: haal het welkomstpakket-PDF op (en verstuur optioneel per mail).
  const fetchWelcomePack = useCallback(async ({ sendEmail: sendMail = false, download = false }) => {
    if (!savedEmail || !savedPassword || !registeredSlug) return null;
    const url = `${process.env.REACT_APP_BACKEND_URL}/api/onboarding/welcome-pack`;
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: savedEmail,
        password: savedPassword,
        slug: registeredSlug,
        company_name: companyName,
        send_email: sendMail,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    if (download) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `surirent-welkom-${registeredSlug}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setPdfDownloaded(true);
    }
    return blob;
  }, [savedEmail, savedPassword, registeredSlug, companyName]);

  // Auto-verstuur de welkomst-mail zodra de success-view zichtbaar is.
  // Best-effort — faalt stil zodat de gebruiker altijd nog de PDF-knop heeft.
  useEffect(() => {
    if (!success || emailStatus !== 'idle') return;
    if (!savedEmail || !savedPassword || !registeredSlug) return;
    setEmailStatus('sending');
    fetchWelcomePack({ sendEmail: true, download: false })
      .then(() => setEmailStatus('sent'))
      .catch(() => setEmailStatus('error'));
  }, [success, emailStatus, savedEmail, savedPassword, registeredSlug, fetchWelcomePack]);

  const downloadWelcomePdf = async () => {
    try { await fetchWelcomePack({ sendEmail: false, download: true }); }
    catch { /* niet fataal — user kan altijd nog nogmaals klikken */ }
  };

  if (!open) return null;

  // Op mobiel: toon een full-screen step-wizard die voelt als een
  // native app (zelfde oranje stijl als de PIN-pad). Op desktop blijft
  // het split-panel modal met blur-overlay.
  if (isMobile) {
    return <MobileRegisterWizard onClose={onClose} />;
  }

  const selectedPlan = plans.find((p) => p.id === plan) || { name: plan, amount: 0, currency: 'SRD' };
  const refLabel = `ABONNEMENT — ${companyName || ''} — ${new Date().toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}`;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200"
      data-testid="register-modal"
      style={{ backgroundColor: 'rgba(15, 15, 15, 0.55)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        ref={modalRef}
        className="relative bg-white rounded-3xl shadow-[0_30px_120px_rgba(0,0,0,0.45)] w-full max-w-5xl max-h-[92vh] flex flex-col lg:flex-row overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sluit-knop */}
        <button
          type="button"
          onClick={onClose}
          data-testid="register-modal-close"
          className="absolute top-3 right-3 z-10 w-10 h-10 rounded-full bg-white/90 hover:bg-white border border-slate-200 shadow-md flex items-center justify-center text-slate-600 hover:text-slate-900 transition active:scale-95"
          aria-label="Sluiten"
        >
          <X className="w-5 h-5" />
        </button>

        {success ? (
          /* ================= SUCCESS VIEW ================= */
          <div className="w-full p-6 sm:p-10 overflow-y-auto" data-testid="register-success">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                <Check className="w-10 h-10 text-emerald-600" strokeWidth={3} />
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Welkom bij SuriRent!</h2>
              <p className="text-sm text-slate-500 mt-1">
                Uw eigen omgeving is aangemaakt voor <span className="font-bold text-slate-900">{companyName}</span>.
              </p>
            </div>

            <div className="rounded-2xl bg-gradient-to-br from-orange-50 to-orange-100 border-2 border-orange-200 p-4 mb-5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-orange-700">14 dagen proefperiode</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">Volledige toegang tot {selectedPlan.name}</p>
                </div>
                <p className="text-xl font-extrabold text-[#FF5C00] whitespace-nowrap">
                  {selectedPlan.currency} {Number(selectedPlan.amount).toLocaleString('nl-NL')}
                  <span className="text-[10px] font-medium text-slate-500 ml-1">/maand</span>
                </p>
              </div>
              <p className="text-xs text-slate-600">Na 14 dagen ontvangt u een factuur per e-mail.</p>
            </div>

            {bankDetails && (
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 mb-5">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-2">Bankoverschrijving</p>
                <div className="space-y-1.5 text-sm">
                  <Bank label="Bank" value={bankDetails.bank_name} />
                  <Bank label="Tenaamstelling" value={bankDetails.account_name} />
                  <Bank label="Rekeningnummer" value={bankDetails.account_number} mono />
                  {bankDetails.swift && <Bank label="SWIFT" value={bankDetails.swift} mono />}
                  <Bank label="Omschrijving" value={refLabel} mono />
                </div>
              </div>
            )}

            {/* Welkomstpakket — PDF download + auto-mail bevestiging */}
            <div className="rounded-2xl border-2 border-slate-200 p-4 mb-5" data-testid="welcome-pack-card">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Inloggegevens &amp; URL&apos;s</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">Bewaar of print uw welkomstpakket</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Bevat inlog + alle portal-URL&apos;s (admin, kiosk, huurder, landing).</p>
                </div>
                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md whitespace-nowrap ${
                  emailStatus === 'sent' ? 'bg-emerald-100 text-emerald-700'
                    : emailStatus === 'sending' ? 'bg-blue-100 text-blue-700'
                    : emailStatus === 'error' ? 'bg-amber-100 text-amber-700'
                    : 'bg-slate-100 text-slate-600'
                }`}
                  data-testid="welcome-pack-email-status">
                  {emailStatus === 'sent' && <><Check className="w-3 h-3 inline mr-0.5" /> E-mail verzonden</>}
                  {emailStatus === 'sending' && <><Loader2 className="w-3 h-3 inline mr-0.5 animate-spin" /> E-mail versturen…</>}
                  {emailStatus === 'error' && <>E-mail mislukt</>}
                  {emailStatus === 'idle' && <>Nog niet verstuurd</>}
                </span>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={downloadWelcomePdf}
                  data-testid="welcome-pack-download"
                  className="flex-1 h-11 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm inline-flex items-center justify-center gap-2 transition active:scale-95">
                  <Download className="w-4 h-4" />
                  {pdfDownloaded ? 'Nogmaals downloaden' : 'Download PDF met inlog'}
                </button>
                {emailStatus === 'error' && (
                  <button type="button" onClick={() => { setEmailStatus('idle'); }}
                    data-testid="welcome-pack-retry-email"
                    className="h-11 px-3 rounded-xl bg-white border-2 border-amber-300 hover:bg-amber-50 text-amber-700 font-bold text-xs inline-flex items-center justify-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" /> Opnieuw mailen
                  </button>
                )}
              </div>
              {emailStatus === 'sent' && (
                <p className="text-[11px] text-emerald-700 font-semibold mt-2 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Inloggegevens verstuurd naar <b className="font-mono">{savedEmail}</b>
                </p>
              )}
            </div>

            <button onClick={goToPortal} data-testid="register-success-continue"
              className="w-full h-14 bg-[#FF5C00] hover:bg-[#E05200] text-white rounded-xl text-lg font-extrabold transition shadow-lg shadow-orange-500/20">
              Naar mijn dashboard
            </button>
          </div>
        ) : (
          <>
            {/* ============= LINKER PANEEL — BRANDED ============= */}
            <div className="relative shrink-0 lg:w-[42%] flex flex-col text-white overflow-hidden"
              style={{ backgroundColor: '#FF5C00' }}>
              <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-white/10 blur-3xl pointer-events-none" />
              <div className="absolute -bottom-40 -right-24 w-[28rem] h-[28rem] rounded-full bg-black/15 blur-3xl pointer-events-none" />
              <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
                style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />

              <div className="relative flex flex-col h-full px-6 lg:px-9 py-6 lg:py-9">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 mb-5 w-fit">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-extrabold tracking-[0.18em] uppercase">14 dagen gratis proberen</span>
                </div>
                <h1 className="text-2xl lg:text-3xl xl:text-4xl font-black leading-[1.1] tracking-tight mb-3">
                  Start uw eigen<br/>vastgoed portaal
                </h1>
                <p className="text-white/85 text-sm lg:text-base leading-relaxed mb-6 max-w-md hidden lg:block">
                  Volledige beheeromgeving met kiosk, betalingen en huurder-portaal in minder dan 30 seconden klaar.
                </p>

                <ul className="space-y-3 max-w-md hidden lg:block">
                  {[
                    { icon: ShieldCheck, t: 'Geen creditcard nodig', s: 'Pas betalen wanneer u tevreden bent.' },
                    { icon: Zap, t: 'Direct online', s: 'Eigen subdomein binnen 30 seconden.' },
                    { icon: Star, t: 'Inclusief alle modules', s: 'OCR, WhatsApp, PDF facturen — vanaf dag 1.' },
                  ].map((b) => (
                    <li key={b.t} className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur-sm border border-white/15 flex items-center justify-center shrink-0">
                        <b.icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm leading-tight">{b.t}</p>
                        <p className="text-white/75 text-xs leading-tight mt-0.5">{b.s}</p>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="mt-auto pt-4 hidden lg:flex items-center gap-2 text-xs text-white/70">
                  <Check className="w-3.5 h-3.5" /> SSL beveiligd · Geen verborgen kosten
                </div>
              </div>
            </div>

            {/* ============= RECHTER PANEEL — FORMULIER ============= */}
            <div className="flex-1 flex flex-col min-h-0 bg-white">
              <div className="flex-1 min-h-0 overflow-y-auto" data-testid="register-modal-form" style={{ WebkitOverflowScrolling: 'touch' }}>
                <div className="max-w-md mx-auto px-5 sm:px-8 py-6">
                  <h2 className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight leading-tight">
                    Maak uw account aan
                  </h2>
                  <p className="text-xs lg:text-sm text-slate-500 mt-0.5 mb-4">Vul de gegevens in en u bent direct online.</p>

                  {error && (
                    <div className="mb-3 p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs font-medium" data-testid="register-modal-error">
                      {error}
                    </div>
                  )}

                  <form onSubmit={submit} className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Bedrijfsnaam *</label>
                      <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} data-testid="register-modal-company"
                        required minLength={2}
                        placeholder="Demo Vastgoed N.V."
                        className="w-full h-10 text-sm px-3 rounded-lg border-2 border-slate-200 focus:border-[#FF5C00] focus:ring-2 focus:ring-[#FF5C00]/10 bg-[#F9FAFB] outline-none transition" />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                        Portal-URL (slug) *
                        {!slugTouched && slugSuggestion && (
                          <span className="ml-1.5 font-normal normal-case text-[9px] text-slate-400 tracking-normal">
                            — voorstel: <span className="font-mono text-slate-500">{slugSuggestion}</span>
                          </span>
                        )}
                      </label>
                      <div className="flex items-stretch gap-0 rounded-lg border-2 border-slate-200 focus-within:border-[#FF5C00] focus-within:ring-2 focus-within:ring-[#FF5C00]/10 bg-[#F9FAFB] overflow-hidden">
                        <span className="hidden sm:inline-flex items-center px-2 text-[10px] font-mono text-slate-400 bg-slate-100 border-r border-slate-200">
                          {portalPreview.host || 'app.surirent.sr'}/
                        </span>
                        <input type="text" value={slugTouched ? slug : slugSuggestion}
                          onChange={(e) => {
                            setSlugTouched(true);
                            setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 40));
                          }}
                          onFocus={() => {
                            // Bij eerste focus: kopieer suggestie zodat gebruiker vandaaruit kan aanpassen
                            if (!slugTouched) { setSlug(slugSuggestion); setSlugTouched(true); }
                          }}
                          data-testid="register-modal-slug"
                          required minLength={2}
                          placeholder="uw-bedrijf-hier"
                          className="flex-1 h-10 text-sm px-3 bg-transparent outline-none font-mono" />
                      </div>
                      {effectiveSlug && (() => {
                        const errTone = slugStatus === 'taken' || slugStatus === 'format' || slugStatus === 'reserved';
                        const palette = errTone
                          ? 'bg-rose-50 border-rose-200 text-rose-700'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-700';
                        return (
                          <div className={`mt-1 flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] font-bold ${palette}`}>
                            <Globe className="w-3 h-3 shrink-0" />
                            <span className="font-mono truncate flex-1">{portalPreview.host || 'app.surirent.sr'}/{effectiveSlug}</span>
                            {slugStatus === 'checking' && <Loader2 className="w-3 h-3 animate-spin" />}
                            {slugStatus === 'available' && <span>✓ VRIJ</span>}
                            {slugStatus === 'taken' && <span>✗ BEZET</span>}
                            {slugStatus === 'reserved' && <span>✗ GERESERVEERD</span>}
                            {slugStatus === 'format' && <span>✗ FORMAT</span>}
                          </div>
                        );
                      })()}
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Adres</label>
                      <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} data-testid="register-modal-address"
                        placeholder="Straat, huisnummer, stad"
                        className="w-full h-10 text-sm px-3 rounded-lg border-2 border-slate-200 focus:border-[#FF5C00] focus:ring-2 focus:ring-[#FF5C00]/10 bg-[#F9FAFB] outline-none transition" />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Uw naam *</label>
                        <input type="text" value={name} onChange={(e) => setName(e.target.value)} data-testid="register-modal-name"
                          required minLength={2}
                          placeholder="Voor + Achternaam"
                          className="w-full h-10 text-sm px-3 rounded-lg border-2 border-slate-200 focus:border-[#FF5C00] focus:ring-2 focus:ring-[#FF5C00]/10 bg-[#F9FAFB] outline-none transition" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Telefoon</label>
                        <input type="tel" value={telefoon} onChange={(e) => setTelefoon(e.target.value)} data-testid="register-modal-phone"
                          placeholder="+597 ..."
                          className="w-full h-10 text-sm px-3 rounded-lg border-2 border-slate-200 focus:border-[#FF5C00] focus:ring-2 focus:ring-[#FF5C00]/10 bg-[#F9FAFB] outline-none transition" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">E-mailadres *</label>
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="register-modal-email"
                        required
                        placeholder="naam@bedrijf.sr"
                        className="w-full h-10 text-sm px-3 rounded-lg border-2 border-slate-200 focus:border-[#FF5C00] focus:ring-2 focus:ring-[#FF5C00]/10 bg-[#F9FAFB] outline-none transition" />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Wachtwoord *</label>
                      <div className="relative">
                        <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                          data-testid="register-modal-password" required minLength={6}
                          placeholder="Minimaal 6 tekens"
                          className="w-full h-10 text-sm px-3 pr-10 rounded-lg border-2 border-slate-200 focus:border-[#FF5C00] focus:ring-2 focus:ring-[#FF5C00]/10 bg-[#F9FAFB] outline-none transition" />
                        <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                          {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Land &amp; valuta</label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { code: 'SR', flag: '🇸🇷', label: 'Suriname', sub: 'SRD' },
                          { code: 'NL', flag: '🇳🇱', label: 'Nederland', sub: 'EUR' },
                        ].map((c) => {
                          const sel = country === c.code;
                          return (
                            <button key={c.code} type="button" onClick={() => setCountry(c.code)}
                              data-testid={`register-modal-country-${c.code.toLowerCase()}`}
                              className={`h-10 rounded-lg border-2 px-2 transition-all flex items-center justify-center gap-1.5 ${
                                sel ? 'border-[#FF5C00] bg-orange-50' : 'border-slate-200 bg-white hover:border-orange-300'
                              }`}>
                              <span className="text-base leading-none">{c.flag}</span>
                              <span className={`text-xs font-extrabold ${sel ? 'text-[#C74600]' : 'text-slate-700'}`}>{c.label}</span>
                              <span className="text-[9px] text-slate-400 font-bold">{c.sub}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {plans.length > 0 && (
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Kies uw pakket</label>
                        <div className="grid grid-cols-2 gap-2">
                          {plans.map((p) => {
                            const sel = plan === p.id;
                            return (
                              <button key={p.id} type="button" onClick={() => setPlan(p.id)}
                                data-testid={`register-modal-plan-${p.id}`}
                                className={`text-left rounded-lg border-2 p-2 transition-all ${
                                  sel ? 'border-[#FF5C00] bg-orange-50' : 'border-slate-200 bg-white hover:border-orange-300'
                                }`}>
                                <div className="flex items-center justify-between mb-0.5">
                                  <p className={`font-extrabold text-[11px] ${sel ? 'text-[#C74600]' : 'text-slate-900'}`}>{p.name}</p>
                                  <div className={`w-3 h-3 rounded-full border-2 flex items-center justify-center shrink-0 ${sel ? 'border-[#FF5C00] bg-[#FF5C00]' : 'border-slate-300'}`}>
                                    {sel && <div className="w-1 h-1 rounded-full bg-white" />}
                                  </div>
                                </div>
                                <p className={`text-sm font-extrabold ${sel ? 'text-[#FF5C00]' : 'text-slate-900'}`}>
                                  {(p.currency || 'SRD').toUpperCase() === 'EUR'
                                    ? `€${Number(p.amount).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                    : `${p.currency} ${Number(p.amount).toLocaleString('nl-NL')}`}
                                  <span className="text-[9px] font-medium text-slate-400 ml-1">/m</span>
                                </p>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <button type="submit" disabled={loading} data-testid="register-modal-submit"
                      className="w-full h-11 mt-1 bg-gradient-to-r from-[#FF5C00] to-[#FF8A3D] hover:from-[#C74600] hover:to-[#FF5C00] text-white font-extrabold text-sm rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-orange-500/25">
                      {loading ? (<><Loader2 className="w-4 h-4 animate-spin" /> Bezig…</>)
                        : (<>Start 14 dagen gratis <ArrowRight className="w-4 h-4" /></>)}
                    </button>

                    <p className="text-center text-[10px] text-slate-400 leading-tight pt-1">
                      Door te registreren accepteert u onze voorwaarden.
                    </p>
                  </form>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
