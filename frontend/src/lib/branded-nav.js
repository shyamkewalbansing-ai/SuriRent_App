// Helper voor branded routes (`/<slug>/*`, with legacy `/c/<slug>/*` fallback).
// Wanneer de gebruiker via `/<slug>/...` (of het oude `/c/<slug>/...`) binnenkomt,
// prefixen we alle interne `navigate('/login')`-achtige calls met `/<slug>` zodat
// hij in dezelfde bedrijfs-context blijft. Buiten branded context werkt het
// exact als de gewone `useNavigate()` van react-router.

import { useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// Synced with backend RESERVED_SLUGS — paden die NIET een bedrijfs-slug kunnen zijn.
export const RESERVED_SLUGS = new Set([
  'login', 'admin', 'kiosk', 'huurder', 'onderteken', 'c', 'vastgoed',
  'api', 'health', 'static', 'manifest', 'sw', 'favicon', 'assets',
  'www', 'app', 'mail', 'ftp', 'blog', 'support', 'docs', 'help',
  'register', 'settings', 'billing', 'checkout', 'auth', 'logout',
  'tenant', 'tenants', 'company', 'companies', 'superadmin',
  'qr-link', 'qr',
]);

/** Pak `<slug>` uit een pad. Ondersteunt zowel `/<slug>/...` (nieuw) als
 *  `/c/<slug>/...` (legacy). Returns null bij gereserveerde slugs of geen match. */
export function brandedSlugFromPath(pathname) {
  const p = pathname || '';
  // Legacy /c/<slug>
  const legacy = p.match(/^\/c\/([a-z0-9][a-z0-9-]*)(?=\/|$)/i);
  if (legacy) return legacy[1].toLowerCase();
  // Nieuw /<slug>/...
  const m = p.match(/^\/([a-z0-9][a-z0-9-]*)(?=\/|$)/i);
  if (!m) return null;
  const slug = m[1].toLowerCase();
  if (RESERVED_SLUGS.has(slug)) return null;
  return slug;
}

/** Bouw een pad in de huidige branded context. Absolute paden (`/login`) krijgen
 *  de `/<slug>`-prefix; relatieve paden blijven onveranderd. */
export function buildBrandedPath(target, slug) {
  if (!slug || !target) return target;
  if (typeof target !== 'string') return target;
  // Externe links / hash / queries zonder pad-wijziging laten we met rust.
  if (target.startsWith('http://') || target.startsWith('https://') || target.startsWith('mailto:')) return target;
  if (!target.startsWith('/')) return target;            // relatief — niet aanraken
  if (target.startsWith(`/${slug}/`) || target === `/${slug}`) return target; // al geprefixed
  if (target.startsWith('/c/')) return target;           // legacy branded pad — laat staan
  // Check: wijst de eerste segment naar een andere bedrijfsslug? Laat staan.
  const firstSeg = target.split('/')[1] || '';
  if (firstSeg && !RESERVED_SLUGS.has(firstSeg) && firstSeg !== slug) {
    // Het is een ander bedrijfspad — niet kapen.
    // (Dit gebeurt vrijwel nooit; defensieve check.)
    return target;
  }
  return `/${slug}${target}`;
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
