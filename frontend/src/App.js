import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { useRegisterServiceWorker, InstallPrompt } from './lib/pwa';
import PersonalPinSetup from './components/PersonalPinSetup';
import { usePwaManifest } from './lib/pwa-manifest';
import { useSheetSwipeToDismiss } from './lib/sheet-swipe';
import { useEffect, useState, lazy, Suspense } from 'react';
import { installGlobalTapSounds } from './lib/tap-sounds';
import RotateNotice from './components/RotateNotice';
import BrandedShell from './components/BrandedShell';
import { isMarketingHost, appUrl } from './lib/env';
import { brandedSlugFromPath } from './lib/branded-nav';

// LAZY LOADED ROUTES — Code-splitting per route zodat een kiosk-bezoeker
// NIET de admin-bundle hoeft te downloaden (en andersom). Initial paint
// is veel sneller: ~70-80% kleinere first bundle.
//
// Auto-recovery: als een chunk faalt (typisch na een SW-update waarbij oude
// hashed chunks vervangen zijn), herladen we 1x automatisch met een
// sessionStorage-flag zodat we geen reload-loop creëren.
function lazyWithRetry(importFn) {
  return lazy(async () => {
    try {
      return await importFn();
    } catch (err) {
      const RELOAD_KEY = 'sr_chunk_reload_attempted';
      const already = sessionStorage.getItem(RELOAD_KEY);
      if (!already) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        window.location.reload();
        // Return een lege component terwijl de reload begint
        return { default: () => null };
      }
      // Eén reload heeft niet geholpen — toon expliciete error
      throw err;
    }
  });
}
// Clear de retry-flag bij elke succesvolle volledige load (na 5s zonder error).
if (typeof window !== 'undefined') {
  setTimeout(() => { try { sessionStorage.removeItem('sr_chunk_reload_attempted'); } catch {} }, 5000);
}

const MarketingLanding = lazyWithRetry(() => import('./pages/vastgoed/MarketingLandingV2'));
const TenantPublicLanding = lazyWithRetry(() => import('./pages/vastgoed/TenantPublicLanding'));
const PublicLandingBySlug = lazyWithRetry(() => import('./pages/vastgoed/PublicLandingBySlug'));
const LoginPage = lazyWithRetry(() => import('./pages/vastgoed/LoginPage'));
const AdminDashboard = lazyWithRetry(() => import('./pages/vastgoed/AdminDashboard'));
const KioskLayout = lazyWithRetry(() => import('./pages/vastgoed/KioskLayout'));
const TenantKioskLayout = lazyWithRetry(() => import('./pages/vastgoed/TenantKioskLayout'));
const CustomerDisplay = lazyWithRetry(() => import('./pages/vastgoed/CustomerDisplay'));
const ContractSignPage = lazyWithRetry(() => import('./pages/vastgoed/ContractSignPage'));
const QrLinkPage = lazyWithRetry(() => import('./pages/vastgoed/QrLinkPage'));

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-kiosk-cream">
      <div className="w-10 h-10 border-4 border-orange-200 border-t-kiosk-orange rounded-full animate-spin" />
    </div>
  );
}

/* Per-company branded routes (path-based). Mounted under both AppRoutes and
   HybridRoutes so each bedrijf krijgt: `/c/<slug>/{login,kiosk,kiosk/huurder,kiosk/klant,admin,...}`
   met de eigen kleur + logo. Subdomain-based branding (klantnaam.surirent.sr) blijft
   ook werken via de bestaande `detectCompanySlug` + `fetchBrandingByHost`. */
function BrandedRouteTree() {
  return (
    <BrandedShell>
      <Routes>
        <Route path="" element={<LoginPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="admin/*" element={<Protected><AdminDashboard /></Protected>} />
        <Route path="kiosk" element={<KioskLayout />} />
        <Route path="kiosk/huurder" element={<TenantKioskLayout />} />
        <Route path="kiosk/klant" element={<CustomerDisplay />} />
        {/* Legacy /huurder paths → redirect naar Huurder Kiosk (PIN-only via QR). */}
        <Route path="huurder" element={<Navigate to="../kiosk/huurder" replace />} />
        <Route path="huurder/portaal" element={<Navigate to="../kiosk/huurder" replace />} />
        <Route path="*" element={<Navigate to="" replace />} />
      </Routes>
    </BrandedShell>
  );
}

function Protected({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-kiosk-cream">
        <div className="w-12 h-12 border-4 border-orange-200 border-t-kiosk-orange rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) {
    // Preserve branded slug context. Wanneer de admin afmeldt vanaf
    // `/<slug>/admin/...` sturen we hem naar `/<slug>/login` ipv de
    // generieke `/login` (anders verliest hij zijn bedrijfs-kleuren/PIN).
    const slug = brandedSlugFromPath(location.pathname);
    const target = slug ? `/${slug}/login` : '/login';
    return <Navigate to={target} replace />;
  }
  return children;
}

function MarketingRoutes() {
  // surirent.sr only serves the marketing landing.
  return (
    <Routes>
      <Route path="/" element={<MarketingLanding />} />
      <Route path="/site/:slug" element={<PublicLandingBySlug />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/**
 * useTenantLandingResolver — checkt of het huidige Host (window.location.hostname)
 * een custom_domain is van een bedrijf. Returns:
 *   - { status: 'checking' } initially
 *   - { status: 'tenant', company, apartments, content } als er een match is
 *   - { status: 'none' } anders (val terug op normal routing)
 *
 * Skip op bekende system hosts (surirent.sr, *.surirent.sr, emergent preview, localhost).
 */
function useTenantLandingResolver() {
  const [state, setState] = useState({ status: 'checking' });
  useEffect(() => {
    const host = (typeof window !== 'undefined' ? window.location.hostname : '').toLowerCase();
    // Skip system hosts om onnodige API call te besparen.
    const SYSTEM = ['surirent.sr', 'app.surirent.sr', 'localhost', '127.0.0.1'];
    const isSystem = SYSTEM.some((s) => host === s || host.endsWith('.' + s))
      || host.includes('emergentagent.com')
      || host.includes('.preview.');
    if (isSystem) { setState({ status: 'none' }); return; }
    let cancel = false;
    (async () => {
      try {
        const backend = process.env.REACT_APP_BACKEND_URL || '';
        // Prefer /company-landing (heeft ook apartments + landing content).
        // Als backend nog niet is uitgerold met custom_domain fallback,
        // val terug op /domain-resolve om ten minste de slug te vinden.
        let res = await fetch(`${backend}/api/public/company-landing`, {
          headers: { 'X-Forwarded-Host': host },
        });
        let data = res.ok ? await res.json() : { found: false };
        if (!data.found) {
          // Fallback: pak alleen de slug via de lichtgewicht resolver.
          const r2 = await fetch(`${backend}/api/public/domain-resolve?host=${encodeURIComponent(host)}`);
          const d2 = r2.ok ? await r2.json() : { found: false };
          if (d2.found && d2.slug) {
            data = {
              found: true,
              company: { slug: d2.slug, name: d2.name, branding: { primary_color: d2.primary_color, logo_url: d2.logo_url, app_name: d2.app_name } },
              apartments: [],
              content: null,
            };
          }
        }
        if (cancel) return;
        if (data.found) {
          setState({ status: 'tenant', ...data });
        } else {
          setState({ status: 'none' });
        }
      } catch {
        if (!cancel) setState({ status: 'none' });
      }
    })();
    return () => { cancel = true; };
  }, []);
  return state;
}

function AppRoutes() {
  // app.surirent.sr serves the kiosk + admin + tenant portal + contract sign.
  // On preview / local dev, all routes are reachable under the same domain.
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/landing-preview" element={<TenantPublicLanding />} />
      <Route path="/site/:slug" element={<PublicLandingBySlug />} />
      <Route path="/admin/*" element={<Protected><AdminDashboard /></Protected>} />
      <Route path="/kiosk" element={<KioskLayout />} />
      <Route path="/kiosk/huurder" element={<TenantKioskLayout />} />
      <Route path="/kiosk/klant" element={<CustomerDisplay />} />
      <Route path="/c/:slug/*" element={<BrandedRouteTree />} />
      <Route path="/onderteken/:token" element={<ContractSignPage />} />
      <Route path="/qr-link" element={<QrLinkPage />} />
      {/* Legacy /huurder paths → redirect naar Huurder Kiosk (PIN-only via QR). */}
      <Route path="/huurder" element={<Navigate to="/kiosk/huurder" replace />} />
      <Route path="/huurder/portaal" element={<Navigate to="/kiosk/huurder" replace />} />

      {/* Legacy /vastgoed/* redirects, so old bookmarks keep working during transition. */}
      <Route path="/vastgoed" element={<Navigate to="/" replace />} />
      <Route path="/vastgoed/login" element={<Navigate to="/login" replace />} />
      <Route path="/vastgoed/admin/*" element={<Navigate to="/admin" replace />} />
      <Route path="/vastgoed/kiosk" element={<Navigate to="/kiosk" replace />} />
      <Route path="/vastgoed/kiosk/huurder" element={<Navigate to="/kiosk/huurder" replace />} />
      <Route path="/vastgoed/kiosk/klant" element={<Navigate to="/kiosk/klant" replace />} />

      {/* Nieuw: branded routes als short-path `/<slug>/*`.
          MOET als laatste vóór de 404-catch staan zodat alle exacte paden
          (login, admin, kiosk, etc.) eerst matchen. Gereserveerde slugs
          worden in BrandedShell als 404 afgehandeld. */}
      <Route path="/:slug/*" element={<BrandedRouteTree />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function HybridRoutes() {
  // On a single-domain deployment (preview / local), we expose both worlds:
  // - `/` shows marketing landing
  // - All app paths reachable directly (/login, /admin, /kiosk, ...)
  return (
    <Routes>
      <Route path="/" element={<MarketingLanding />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/landing-preview" element={<TenantPublicLanding />} />
      <Route path="/site/:slug" element={<PublicLandingBySlug />} />
      <Route path="/admin/*" element={<Protected><AdminDashboard /></Protected>} />
      <Route path="/kiosk" element={<KioskLayout />} />
      <Route path="/kiosk/huurder" element={<TenantKioskLayout />} />
      <Route path="/kiosk/klant" element={<CustomerDisplay />} />
      <Route path="/c/:slug/*" element={<BrandedRouteTree />} />
      <Route path="/onderteken/:token" element={<ContractSignPage />} />
      <Route path="/qr-link" element={<QrLinkPage />} />
      {/* Legacy /huurder paths → redirect naar Huurder Kiosk (PIN-only via QR). */}
      <Route path="/huurder" element={<Navigate to="/kiosk/huurder" replace />} />
      <Route path="/huurder/portaal" element={<Navigate to="/kiosk/huurder" replace />} />

      {/* Legacy /vastgoed/* redirects */}
      <Route path="/vastgoed" element={<Navigate to="/" replace />} />
      <Route path="/vastgoed/login" element={<Navigate to="/login" replace />} />
      <Route path="/vastgoed/admin/*" element={<Navigate to="/admin" replace />} />
      <Route path="/vastgoed/kiosk" element={<Navigate to="/kiosk" replace />} />
      <Route path="/vastgoed/kiosk/huurder" element={<Navigate to="/kiosk/huurder" replace />} />
      <Route path="/vastgoed/kiosk/klant" element={<Navigate to="/kiosk/klant" replace />} />

      {/* Nieuw: branded routes als short-path `/<slug>/*` — moet als laatste. */}
      <Route path="/:slug/*" element={<BrandedRouteTree />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  useRegisterServiceWorker();
  usePwaManifest();
  useSheetSwipeToDismiss();
  // Globale tik-geluiden voor elke knop + keypad + text-input. Werkt
  // op iPhone PWA, Android PWA en desktop. Gebruiker kan uitschakelen
  // via /admin/notifications.
  useEffect(() => { installGlobalTapSounds(); }, []);
  const mode = isMarketingHost() ? 'marketing' : (appUrl() ? 'app' : 'hybrid');
  // Tenant custom-domain detectie — als de huidige hostname een geregistreerd
  // custom_domain is van een bedrijf, renderen we DIRECT TenantPublicLanding
  // ipv de standaard routes. Skipt zichzelf op system hosts.
  const tenant = useTenantLandingResolver();
  if (tenant.status === 'checking') {
    return <RouteFallback />;
  }
  if (tenant.status === 'tenant') {
    // Bij een custom-domain visit renderen we de volledige branded app zoals
    // wanneer je via `/{slug}/...` zou binnenkomen — landing, login, kiosk,
    // huurder-portal en admin werken allemaal onder het custom domein.
    // De resolved slug wordt uit `tenant.company.slug` gehaald.
    const slug = tenant.company?.slug || '';
    return (
      <AuthProvider>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* Root op custom domain = tenant landing page */}
            <Route path="/" element={
              <TenantPublicLanding
                company={tenant.company}
                apartments={tenant.apartments}
                content={tenant.content}
                editMode={false} />
            } />
            {/* Alle overige app-paden gaan door BrandedRouteTree met de
                pre-resolved slug — die zit in de path zodat useParams() nog
                gewoon werkt in BrandedShell. We prefix intern zonder URL wijziging. */}
            <Route path="/login" element={<Navigate to={`/${slug}/login`} replace />} />
            <Route path="/admin/*" element={<Navigate to={`/${slug}/admin`} replace />} />
            <Route path="/kiosk" element={<Navigate to={`/${slug}/kiosk`} replace />} />
            <Route path="/kiosk/huurder" element={<Navigate to={`/${slug}/kiosk/huurder`} replace />} />
            <Route path="/kiosk/klant" element={<Navigate to={`/${slug}/kiosk/klant`} replace />} />
            <Route path="/huurder" element={<Navigate to={`/${slug}/kiosk/huurder`} replace />} />
            <Route path="/onderteken/:token" element={<ContractSignPage />} />
            <Route path="/qr-link" element={<QrLinkPage />} />
            {/* Branded routes matchen door — zelfde als HybridRoutes */}
            <Route path="/:slug/*" element={<BrandedRouteTree />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <InstallPrompt />
        <PersonalPinSetup />
        <RotateNotice />
      </AuthProvider>
    );
  }
  return (
    <AuthProvider>
      <Suspense fallback={<RouteFallback />}>
        {mode === 'marketing' && <MarketingRoutes />}
        {mode === 'app' && <AppRoutes />}
        {mode === 'hybrid' && <HybridRoutes />}
      </Suspense>
      <InstallPrompt />
      <PersonalPinSetup />
      <RotateNotice />
    </AuthProvider>
  );
}
