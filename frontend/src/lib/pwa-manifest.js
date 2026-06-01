import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Per-rol PWA configuratie — naam, kleur en icoon-bestanden.
 * iOS/Android lezen op INSTALL-MOMENT alle metadata uit de DOM:
 *   - <link rel="manifest"> voor Android (naam, icon, theme).
 *   - <meta name="apple-mobile-web-app-title"> en <link rel="apple-touch-icon">
 *     voor iOS Safari "Toevoegen aan beginscherm".
 * Beide moeten dus dynamisch worden bijgewerkt zodat de gebruiker de juiste
 * naam/icon krijgt afhankelijk van welke pagina hij installeert.
 */
const ROLE_CONFIG = {
  beheer: {
    name: 'SuriRent Beheer', shortName: 'Beheer',
    theme: '#FF5C00', icon: 'beheer',
  },
  kiosk: {
    name: 'SuriRent Kiosk', shortName: 'Kiosk',
    theme: '#2563EB', icon: 'kioskpwa',
  },
  huurder: {
    name: 'SuriRent Huurder', shortName: 'Huurder',
    theme: '#10B981', icon: 'huurder',
  },
  klant: {
    name: 'SuriRent Klantenscherm', shortName: 'Klantenscherm',
    theme: '#9333EA', icon: 'klant',
  },
};

// Gereserveerde root-segmenten die geen bedrijfs-slug zijn.
const RESERVED_SLUGS = new Set([
  'admin', 'kiosk', 'login', 'demo', 'huurder', 'klant',
  'onderteken', 'qr-link', 'c', 'api', 'assets', 'static',
  'vastgoed',
]);

// Per-rol default in-slug route die als start_url gebruikt wordt wanneer
// de gebruiker een PWA installeert van een /<slug>/... pagina.
// (Reserve helper — backend `/api/pwa/manifest` doet de echte mutatie.)
// eslint-disable-next-line no-unused-vars
function inSlugStartUrl(role, slug) {
  switch (role) {
    case 'huurder': return `/${slug}/kiosk/huurder?source=pwa`;
    case 'klant':   return `/${slug}/kiosk/klant?source=pwa`;
    case 'kiosk':   return `/${slug}/kiosk?source=pwa`;
    case 'beheer':
    default:        return `/${slug}/login?source=pwa&view=admin`;
  }
}

function detectSlug(pathname) {
  const parts = (pathname || '').toLowerCase().split('/').filter(Boolean);
  if (parts.length === 0) return '';
  // Ondersteun zowel `/<slug>/...` als `/c/<slug>/...`.
  if (parts[0] === 'c' && parts.length >= 2 && !RESERVED_SLUGS.has(parts[1])) {
    return parts[1];
  }
  if (!RESERVED_SLUGS.has(parts[0])) return parts[0];
  return '';
}

/**
 * Bouw de slug-aware manifest URL. We gebruiken een stabiele HTTP URL
 * (backend endpoint `/api/pwa/manifest`) i.p.v. een blob: URL. Blob URLs
 * werken alleen tijdens de huidige document-sessie — een geïnstalleerde
 * PWA kan ze niet later herfetchen, waardoor Chrome de install-time
 * waarden moet onthouden. Met een stabiele URL kan het manifest bij
 * elke launch worden gerefresht.
 */
function buildManifestUrl(role, slug) {
  const params = new URLSearchParams({ role });
  if (slug) params.set('slug', slug);
  return `/api/pwa/manifest?${params.toString()}`;
}

export function usePwaManifest() {
  const location = useLocation();
  useEffect(() => {
    const role = pickRole(location.pathname, location.search);
    const cfg = ROLE_CONFIG[role] || ROLE_CONFIG.beheer;
    const slug = detectSlug(location.pathname);

    // 1) <link rel="manifest"> — Android PWA install
    //    Slug-aware: backend `/api/pwa/manifest?role=X&slug=Y` returnt
    //    de juiste start_url/scope/id zodat de geïnstalleerde PWA in
    //    het bedrijfs-context opent (`/<slug>/login` ipv `/login`).
    let link = document.querySelector('link[rel="manifest"]');
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'manifest');
      document.head.appendChild(link);
    }
    link.setAttribute('href', buildManifestUrl(role, slug));

    // 2) theme-color meta — Android system UI tint
    setMetaContent('meta[name="theme-color"]:not([media])', cfg.theme);
    setMetaContent('meta[name="theme-color"]', cfg.theme); // fallback selector

    // 3) iOS Safari title — "Toevoegen aan beginscherm" gebruikt deze
    setMetaContent('meta[name="apple-mobile-web-app-title"]', cfg.shortName);
    setMetaContent('meta[name="application-name"]', cfg.shortName);

    // 4) iOS apple-touch-icon — icoon op het beginscherm na installatie
    //    iOS pakt de grootste beschikbare <link rel="apple-touch-icon"> die
    //    op dat moment in de DOM staat. We vervangen alle bestaande verwijzingen
    //    naar de standaard `kiosk-*.png` met de role-specifieke variant.
    document.querySelectorAll('link[rel="apple-touch-icon"]').forEach((el) => {
      const href = el.getAttribute('href') || '';
      // Match `/kiosk-icons/<naam>-<size>.png` en vervang `<naam>` met cfg.icon.
      const m = href.match(/^(\/kiosk-icons\/)([a-z]+)(-\d+\.png)$/i);
      if (m) el.setAttribute('href', `${m[1]}${cfg.icon}${m[3]}`);
    });

    // 5) Microsoft Tiles (Windows Edge "Pin tot start")
    setMetaContent('meta[name="msapplication-TileColor"]', cfg.theme);
    document.querySelectorAll('meta[name="msapplication-TileImage"]').forEach((el) => {
      const href = el.getAttribute('content') || '';
      const m = href.match(/^(\/kiosk-icons\/)([a-z]+)(-\d+\.png)$/i);
      if (m) el.setAttribute('content', `${m[1]}${cfg.icon}${m[3]}`);
    });

    // 6) Page title — schoon. iOS gebruikt deze als default in "Voeg toe
    //    aan beginscherm". We zetten precies cfg.shortName zodat
    //    "Beheer"/"Kiosk"/"Huurder"/"Klantenscherm" verschijnt.
    if (document.title !== cfg.shortName) {
      document.title = cfg.shortName;
    }
  }, [location.pathname, location.search]);
}

function setMetaContent(selector, content) {
  const els = document.querySelectorAll(selector);
  els.forEach((el) => el.setAttribute('content', content));
  if (els.length === 0) {
    const name = selector.match(/name="([^"]+)"/)?.[1];
    if (name) {
      const el = document.createElement('meta');
      el.setAttribute('name', name);
      el.setAttribute('content', content);
      document.head.appendChild(el);
    }
  }
}

function pickRole(path = '', search = '') {
  const p = (path || '').toLowerCase();
  // Strip optionele `/c/<slug>` of `/<slug>` prefix vóór role-detectie.
  let sub = p;
  const parts = p.split('/').filter(Boolean);
  if (parts.length > 0) {
    if (parts[0] === 'c' && parts.length >= 2 && !RESERVED_SLUGS.has(parts[1])) {
      sub = '/' + parts.slice(2).join('/');
    } else if (!RESERVED_SLUGS.has(parts[0])) {
      sub = '/' + parts.slice(1).join('/');
    }
  }
  if (!sub.startsWith('/')) sub = '/' + sub;

  if (sub.startsWith('/admin')) return 'beheer';
  if (sub === '/kiosk/klant' || sub.startsWith('/kiosk/klant')) return 'klant';
  if (sub === '/kiosk/huurder' || sub.startsWith('/kiosk/huurder')) return 'huurder';
  if (sub === '/kiosk' || sub.startsWith('/kiosk')) return 'kiosk';
  if (sub === '/login' || sub.startsWith('/login') || sub === '/' || sub === '') {
    const q = (search || '').toLowerCase();
    if (q.includes('target=kiosk')) return 'kiosk';
    if (q.includes('target=huurder')) return 'huurder';
    if (q.includes('target=klant')) return 'klant';
    return 'beheer';
  }
  return 'beheer';
}
