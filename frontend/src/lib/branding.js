// Per-company branding helpers.
// Identification strategy (in priority order):
//   1. URL: ?c=<slug> or /c/<slug> in pathname  → highest priority (a direct link)
//   2. Backend host-based lookup via /public/branding-by-host (custom domain)
//   3. localStorage `pwa_company_slug` from previous visit
// Branding is fetched from /api/public/companies/{slug}/branding (no auth).

import { api } from './api';
import { RESERVED_SLUGS } from './branded-nav';

const STORAGE_KEY = 'pwa_company_slug';
const PRIMARY_KEY = 'pwa_company_primary';
const APP_NAME_KEY = 'pwa_company_app_name';
const LOGO_KEY = 'pwa_company_logo';

export function getStoredSlug() {
  try { return localStorage.getItem(STORAGE_KEY) || ''; }
  catch { return ''; }
}

export function setStoredSlug(slug) {
  try {
    if (slug) localStorage.setItem(STORAGE_KEY, slug);
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

function readFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = (params.get('c') || '').trim().toLowerCase();
    if (fromQuery) return fromQuery;
    // Legacy /c/<slug>/... pad
    const mLegacy = window.location.pathname.match(/^\/c\/([a-z0-9-]+)/i);
    if (mLegacy) return mLegacy[1].toLowerCase();
    // Nieuw /<slug>/... pad — eerste segment, mits geen gereserveerde route.
    const mNew = window.location.pathname.match(/^\/([a-z0-9-]+)(?=\/|$)/i);
    if (mNew) {
      const slug = mNew[1].toLowerCase();
      if (!RESERVED_SLUGS.has(slug)) return slug;
    }
  } catch { /* ignore */ }
  return '';
}

/** Detect candidate company slug from URL → localStorage.
 *  (Custom-domain branding is resolved server-side via fetchBrandingByHost.) */
export function detectCompanySlug() {
  return readFromUrl() || getStoredSlug();
}

/** Ask the backend who we are based on the Host header (useful when
 *  CORS proxy strips the hostname or when running on wildcard DNS).
 *  Returns branding object or null. */
export async function fetchBrandingByHost() {
  try {
    const { data } = await api.get('/public/branding-by-host');
    if (data && data.found) return data;
    return null;
  } catch {
    return null;
  }
}

/** Fetch branding for a slug. Returns null on 404 (unknown company) → falls back to SuriRent defaults. */
export async function fetchBranding(slug) {
  if (!slug) return null;
  try {
    const { data } = await api.get(`/public/companies/${encodeURIComponent(slug)}/branding`);
    return data;
  } catch {
    return null;
  }
}

/** Apply primary color + cache to localStorage for instant render on next load. */
export function applyBranding(branding) {
  if (!branding) {
    clearBrandingCache();
    return;
  }
  const color = branding.primary_color || '#FF5C00';
  try {
    document.documentElement.style.setProperty('--brand-primary', color);
    document.documentElement.style.setProperty('--brand-primary-soft', hexToSoft(color, 0.15));
  } catch { /* ignore */ }
  try {
    localStorage.setItem(PRIMARY_KEY, color);
    if (branding.app_name) localStorage.setItem(APP_NAME_KEY, branding.app_name);
    if (branding.logo_url) localStorage.setItem(LOGO_KEY, branding.logo_url);
    if (branding.slug) setStoredSlug(branding.slug);
  } catch { /* ignore */ }
}

export function clearBrandingCache() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PRIMARY_KEY);
    localStorage.removeItem(APP_NAME_KEY);
    localStorage.removeItem(LOGO_KEY);
    document.documentElement.style.removeProperty('--brand-primary');
    document.documentElement.style.removeProperty('--brand-primary-soft');
  } catch { /* ignore */ }
}

export function readCachedBranding() {
  try {
    const color = localStorage.getItem(PRIMARY_KEY);
    if (!color) return null;
    return {
      slug: getStoredSlug(),
      primary_color: color,
      app_name: localStorage.getItem(APP_NAME_KEY) || '',
      logo_url: localStorage.getItem(LOGO_KEY) || '',
    };
  } catch { return null; }
}

// Convert "#RRGGBB" to a transparent rgba() string used for hover/accent shading.
function hexToSoft(hex, alpha = 0.15) {
  try {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  } catch { return 'rgba(255,92,0,0.15)'; }
}

/** Resolve a logo URL — adds REACT_APP_BACKEND_URL prefix to /api/... paths. */
export function resolveLogoUrl(url) {
  if (!url) return '';
  if (url.startsWith('/api/')) {
    const base = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/$/, '');
    return `${base}${url}`;
  }
  return url;
}
