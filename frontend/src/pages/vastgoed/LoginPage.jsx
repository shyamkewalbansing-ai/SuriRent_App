import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBrandedNavigate } from '../../lib/branded-nav';
import { useAuth } from '../../lib/auth';
import {
  setPreferredRole, isStandalonePWA, getPreferredRole, routeForRole,
} from '../../lib/pwaRole';
import {
  detectCompanySlug, fetchBranding, fetchBrandingByHost, applyBranding,
  resolveLogoUrl, readCachedBranding, clearBrandingCache,
} from '../../lib/branding';
import PinLanding from './auth/PinLogin';
import PasswordView from './auth/EmailLogin';


// =============================================================================
// LoginPage — orchestreert branding-detection en kiest welke auth-view (PIN of
// e-mail/wachtwoord) wordt getoond. Alle deel-componenten zijn opgesplitst in
// /app/frontend/src/pages/vastgoed/auth/ voor onderhoudbaarheid.
// =============================================================================
export default function LoginPage() {
  const navigate = useBrandedNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading, refresh } = useAuth();
  // Initial view from ?view=admin or ?view=register query string (e.g. when arriving
  // from the Kiosk "Beheerder" button or a marketing CTA). Defaults to PIN keypad.
  const initialView = (() => {
    const v = (searchParams.get('view') || '').toLowerCase();
    if (v === 'admin' || v === 'login' || v === 'password') return 'login';
    if (v === 'register' || v === 'signup') return 'register';
    if (v === 'pin') return 'pin';   // explicit PIN view (for testing / branded entry)
    // Shortcut: ?register=1 from marketing topbar
    if (searchParams.get('register') === '1') return 'register';
    // Desktop default: skip PIN keypad and show email login form directly.
    // Mobile keeps PIN-first flow (more tactile + branded). We detect via
    // viewport width on initial render — a no-op on SSR (window check).
    try {
      if (typeof window !== 'undefined' && window.innerWidth >= 1024) return 'login';
    } catch { /* noop */ }
    return 'pin';
  })();
  const [view, setView] = useState(initialView);
  const [skipRedirect, setSkipRedirect] = useState(false);

  // ────────────────────────────────────────────────────────────────────
  // Registratie modal-redirect — wanneer iemand op /login?register=1 of
  // /login?view=register komt (bookmark, oude links, marketing CTA),
  // sturen we hem terug naar de landing met de popup direct open.
  // De register-pagina bestaat namelijk niet meer als losse view.
  //
  // BELANGRIJK: alleen op de GENERIEKE /login route. Op een branded
  // /<slug>/login is registreren niet relevant — klanten loggen daar
  // alleen in, er wordt geen nieuw bedrijf aangemaakt.
  // ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (initialView !== 'register') return;
    try {
      const path = window.location.pathname || '';
      // Plain /login → redirect. Branded /<slug>/login → laat zoals het is
      // (de register view zal daar zelf de "alleen inloggen" mode forceren).
      if (/^\/login(\/|$)/i.test(path)) {
        window.location.replace('/?register=1');
      }
    } catch { /* ignore */ }
  }, [initialView]);

  // Branding state — start from cache for instant render, then fetch fresh.
  const [branding, setBranding] = useState(() => {
    const cached = readCachedBranding();
    if (cached) {
      return { ...cached, _logoResolved: resolveLogoUrl(cached.logo_url) };
    }
    return null;
  });

  useEffect(() => {
    // document.title wordt centraal beheerd door usePwaManifest()
  }, []);

  // Login is volledig brand-oranje. We zetten body+#root in PWA standalone
  // op oranje (via body class) zodat het home-indicator gebied en eventuele
  // 1px doorlek aan de notch dezelfde kleur tonen. Ook updaten we de
  // theme-color meta zodat de Android-statusbalk oranje wordt. Unmount
  // (bv. navigatie naar /admin of /kiosk) herstelt automatisch.
  useEffect(() => {
    const primary = (branding?.primary_color || '#FF5C00');
    document.body.classList.add('login-mode');
    document.documentElement.classList.add('login-mode-html');
    document.body.style.setProperty('--login-bg', primary);
    document.documentElement.style.setProperty('--login-bg', primary);
    const meta = document.querySelector('meta[name="theme-color"]:not([media])')
      || document.querySelector('meta[name="theme-color"]');
    const prev = meta?.getAttribute('content');
    if (meta) meta.setAttribute('content', primary);
    return () => {
      document.body.classList.remove('login-mode');
      document.documentElement.classList.remove('login-mode-html');
      document.body.style.removeProperty('--login-bg');
      document.documentElement.style.removeProperty('--login-bg');
      if (meta && prev) meta.setAttribute('content', prev);
    };
  }, [branding]);

  // PWA bedrijfs-context fallback. Wanneer iOS Safari de oude (verkeerde)
  // start_url heeft gecaptured (`/login` zonder slug) maar de gebruiker
  // eerder een bedrijfs-tenant heeft bezocht, redirecten we automatisch
  // naar `/<slug>/login` zodat de PIN-flow en branding correct laden.
  //
  // Dit is een vangnet voor het iOS PWA install-cache probleem waar de
  // start_url is geboekt vóór onze slug-aware manifest fix. Een normale
  // hard refresh kan iOS niet zomaar overrulen — vandaar deze in-app redir.
  useEffect(() => {
    try {
      const path = (window.location.pathname || '').toLowerCase();
      // Alleen op de generieke /login (niet al binnen een /<slug>/login).
      const onPlainLogin = path === '/login' || path === '/login/';
      if (!onPlainLogin) return;
      // Alleen wanneer er ECHT geen slug in de URL zit (geen ?c=, geen /c/<slug>).
      const params = new URLSearchParams(window.location.search);
      if (params.get('c')) return;
      // We vertrouwen op de eerder opgeslagen slug uit localStorage. Die
      // wordt gezet door BrandedShell bij elk bezoek aan /<slug>/...
      const stored = (typeof window !== 'undefined' && window.localStorage)
        ? (window.localStorage.getItem('pwa_company_slug') || '').trim().toLowerCase()
        : '';
      if (!stored) return;
      // Slug-shape sanity check (a-z, 0-9, dashes).
      if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(stored)) return;
      // Bouw target met behoud van bestaande query params (source=pwa, view=admin etc.)
      const qs = window.location.search || '';
      const next = `/${stored}/login${qs}`;
      window.location.replace(next);
    } catch { /* noop */ }
  }, []);

  // Resolve and apply company branding on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const slug = detectCompanySlug();
      let data = slug ? await fetchBranding(slug) : null;
      // Last resort: ask the backend based on the Host header (works for wildcard DNS
      // setups where the slug detector couldn't read window.location.hostname reliably).
      if (!data) {
        data = await fetchBrandingByHost();
      }
      if (cancelled) return;
      if (!data) {
        clearBrandingCache();
        setBranding(null);
        return;
      }
      const enriched = { ...data, _logoResolved: resolveLogoUrl(data.logo_url) };
      applyBranding(data);
      setBranding(enriched);
      // document.title wordt centraal beheerd door usePwaManifest()
    })();
    return () => { cancelled = true; };
  }, []);

  // PWA shortcut target. Two PWA app icons:
  //   /login?source=pwa&target=kiosk → after PIN, go to /kiosk
  //   /login?source=pwa&target=admin → after PIN, go to /admin (PIN gives both tokens)
  // Defaults to 'kiosk' (the original Kiosk-first PWA experience).
  const pwaTarget = (() => {
    const t = (searchParams.get('target') || '').toLowerCase();
    return t === 'admin' ? 'admin' : 'kiosk';
  })();

  // PWA: if user has a stored preferred role AND a still-valid token for that role,
  // jump directly to that surface (kiosk / admin / tenant). The token-check prevents
  // redirect loops when a token has expired or been revoked.
  // If the URL contains an explicit `target`, prefer that over the stored role so
  // the Beheer-shortcut always lands on /admin (or its PIN-gate) and not on /kiosk.
  useEffect(() => {
    if (!isStandalonePWA()) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('pick') === '1') return; // explicit override: show login picker
    if (params.get('view')) return; // explicit view override → respect it
    const targetParam = (params.get('target') || '').toLowerCase();
    const role = targetParam === 'admin' ? 'admin'
      : targetParam === 'kiosk' ? 'kiosk'
      : getPreferredRole();
    if (!role) return;
    const tokenKey = role === 'admin' ? 'admin_token'
      : role === 'tenant' ? 'tenant_token'
      : 'kiosk_token';
    let hasToken = false;
    try { hasToken = !!localStorage.getItem(tokenKey); } catch { /* ignore */ }
    if (!hasToken) return;
    navigate(routeForRole(role), { replace: true });
  }, [navigate]);

  // Auto-redirect if already logged (but not when we're showing the success screen
  // OR wanneer er een pending QR claim is — de submit-handler zelf navigeert dan
  // naar /qr-link?token=... en deze useEffect zou dat anders overschrijven met
  // /admin (race-conditie).
  useEffect(() => {
    if (!loading && user && !skipRedirect) {
      let hasPendingQr = false;
      try { hasPendingQr = !!sessionStorage.getItem('pending_qr_token'); } catch { /* ignore */ }
      if (hasPendingQr) return;
      navigate('/admin', { replace: true });
    }
  }, [user, loading, navigate, skipRedirect]);

  if (view === 'login' || view === 'register') {
    return (
      <PasswordView initialMode={view} onBack={() => setView('pin')}
        onRegistered={() => setSkipRedirect(true)} branding={branding} />
    );
  }

  // Geen bedrijfs-context (gebruiker is op generieke `/login`, niet op
  // `/<slug>/login`)? → PIN-login is hier zinloos en zou onveilig zijn
  // (kruis-bedrijf matching). Toon direct het e-mail+wachtwoord formulier.
  // Klanten openen de PIN-flow alleen via hun branded URL.
  if (!branding?.slug) {
    return (
      <PasswordView initialMode="login" onBack={() => {}}
        onRegistered={() => setSkipRedirect(true)} branding={null} />
    );
  }

  // After PIN-success, navigate to the target surface. Both shortcuts require
  // PIN entry; the difference is only where the user lands afterwards.
  // BELANGRIJK: medewerker-PIN logins krijgen GEEN admin_token, dus we sturen
  // ze altijd naar /kiosk — ook als ze de "Beheer"-shortcut hebben gebruikt.
  //
  // SOFT NAVIGATIE: vroeger deden we `window.location.assign('/admin')` zodat
  // AuthProvider /auth/me opnieuw uitvoerde. Dat veroorzaakte echter een
  // full page reload + spinner flash. We doen nu refresh() (vernieuw /auth/me
  // in dezelfde React tree) en daarna een soft navigate. Geen flash, instant.
  const onPinSuccess = async () => {
    let hasAdmin = false;
    try { hasAdmin = !!localStorage.getItem('admin_token'); } catch { /* ignore */ }
    if (pwaTarget === 'admin' && hasAdmin) {
      setPreferredRole('admin');
      // Refresh AuthProvider zodat de nieuwe admin_token meteen actief is.
      // Soft navigate naar /admin nadat user state is bijgewerkt.
      try { await refresh(); } catch { /* niet-fataal */ }
      navigate('/admin', { replace: true });
    } else {
      navigate('/kiosk', { replace: true });
    }
  };

  return (
    <PinLanding
      branding={branding}
      pwaTarget={pwaTarget}
      onSuccess={onPinSuccess}
      onPassword={() => setView('login')}
      onRegister={() => setView('register')}
    />
  );
}
