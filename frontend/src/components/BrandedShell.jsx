import { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { fetchBranding, applyBranding, setStoredSlug } from '../lib/branding';

/**
 * Top-level pad-segmenten die NIET als bedrijfscode mogen worden behandeld.
 * Voorbeelden: /login, /admin, /kiosk, /huurder — die hebben hun eigen route.
 */
export const RESERVED_TOP_PATHS = new Set([
  'login', 'admin', 'kiosk', 'huurder', 'onderteken', 'c', 'vastgoed',
  'api', 'static', 'assets', 'public', 'manifest.json', 'sw.js',
  'favicon.ico', 'robots.txt', 'sitemap.xml', 'index.html',
]);

/**
 * BrandedShell — wikkelt alle `/c/:slug/*` routes.
 * Detecteert de slug uit de URL, slaat hem op in localStorage, haalt branding
 * op en past de primary-color CSS-var toe vóórdat de children renderen.
 * Zo werkt elk bedrijf met zijn eigen visuele identiteit op zijn eigen pad.
 */
export default function BrandedShell({ children, requireKnownSlug = true }) {
  const { slug } = useParams();
  const [ready, setReady] = useState(false);
  const [valid, setValid] = useState(true);
  const reserved = slug && RESERVED_TOP_PATHS.has(String(slug).toLowerCase());

  useEffect(() => {
    if (!slug || reserved) { setReady(true); return; }
    let alive = true;
    (async () => {
      const data = await fetchBranding(slug);
      if (!alive) return;
      if (data) {
        applyBranding(data);
        setStoredSlug(slug);
        setValid(true);
      } else {
        setValid(false);
      }
      setReady(true);
    })();
    return () => { alive = false; };
  }, [slug, reserved]);

  if (reserved) {
    // /login of /admin etc. — laat React Router doorlopen naar de echte route.
    return <Navigate to={`/${slug}`} replace />;
  }
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-kiosk-cream">
        <div className="w-12 h-12 border-4 border-orange-200 border-t-kiosk-orange rounded-full animate-spin" />
      </div>
    );
  }
  if (!valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="bg-white rounded-3xl shadow-2xl p-8 text-center max-w-md">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">Onbekend bedrijf</p>
          <h2 className="text-2xl font-black text-slate-900 mt-1 mb-2">404 — Bedrijf niet gevonden</h2>
          <p className="text-sm text-slate-500">
            De bedrijfscode <code className="bg-slate-100 px-1 rounded">{slug}</code> bestaat niet.
            Controleer de URL of vraag uw beheerder om de juiste link.
          </p>
        </div>
      </div>
    );
  }
  return children;
}

// (BrandedRoutes wordt geconfigureerd in App.js; deze module exporteert
// alleen de Shell die slug → branding resolved + de RESERVED_TOP_PATHS set.)
