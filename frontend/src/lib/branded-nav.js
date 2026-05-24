// Helper voor branded routes (/c/:slug/*).
// Wanneer de gebruiker via `/c/<slug>/...` binnenkomt, prefixen we alle
// interne `navigate('/login')`-achtige calls met `/c/<slug>` zodat hij in
// dezelfde bedrijfs-context blijft. Buiten branded context werkt het exact
// als de gewone `useNavigate()` van react-router.

import { useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

/** Pak `<slug>` uit een pad als het begint met `/c/<slug>/...`, anders null. */
export function brandedSlugFromPath(pathname) {
  const m = (pathname || '').match(/^\/c\/([a-z0-9][a-z0-9-]*)(?=\/|$)/i);
  return m ? m[1].toLowerCase() : null;
}

/** Bouw een pad in de huidige branded context. Absolute paden (`/login`) krijgen
 *  de `/c/<slug>`-prefix; relatieve paden blijven onveranderd. */
export function buildBrandedPath(target, slug) {
  if (!slug || !target) return target;
  if (typeof target !== 'string') return target;
  // Externe links / hash / queries zonder pad-wijziging laten we met rust.
  if (target.startsWith('http://') || target.startsWith('https://') || target.startsWith('mailto:')) return target;
  if (!target.startsWith('/')) return target;            // relatief — niet aanraken
  if (target.startsWith(`/c/${slug}`)) return target;    // al geprefixed
  if (target.startsWith('/c/')) return target;           // andere branded slug — laat staan
  return `/c/${slug}${target}`;
}

/** Drop-in replacement voor `useNavigate()` die branded context respecteert. */
export function useBrandedNavigate() {
  const navigate = useNavigate();
  const location = useLocation();
  const slug = useMemo(() => brandedSlugFromPath(location.pathname), [location.pathname]);
  return useCallback((to, opts) => {
    if (!slug) return navigate(to, opts);
    if (typeof to === 'number') return navigate(to);
    const next = buildBrandedPath(to, slug);
    return navigate(next, opts);
  }, [navigate, slug]);
}

/** Hook die de huidige branded slug teruggeeft (of null). */
export function useBrandedSlug() {
  const location = useLocation();
  return useMemo(() => brandedSlugFromPath(location.pathname), [location.pathname]);
}
