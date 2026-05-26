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

export function usePwaManifest() {
  const location = useLocation();
  useEffect(() => {
    const role = pickRole(location.pathname, location.search);
    const cfg = ROLE_CONFIG[role] || ROLE_CONFIG.beheer;

    // 1) <link rel="manifest"> — Android PWA install
    setLink('link[rel="manifest"]', { rel: 'manifest', href: `/manifest-${role}.json` });

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

function setLink(selector, attrs) {
  let el = document.querySelector(selector);
  if (!el) {
    el = document.createElement('link');
    document.head.appendChild(el);
  }
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
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
  if (p.startsWith('/admin')) return 'beheer';
  if (p === '/kiosk/klant' || p.startsWith('/kiosk/klant')) return 'klant';
  if (p === '/kiosk' || p.startsWith('/kiosk')) return 'kiosk';
  if (p.startsWith('/huurder')) return 'huurder';
  // /login → lees `?target=` query om af te leiden welke PWA-rol de gebruiker bezig is.
  if (p === '/login' || p.startsWith('/login')) {
    const q = (search || '').toLowerCase();
    if (q.includes('target=kiosk')) return 'kiosk';
    if (q.includes('target=huurder')) return 'huurder';
    if (q.includes('target=klant')) return 'klant';
    return 'beheer';
  }
  if (p.startsWith('/c/')) {
    const rest = p.split('/').slice(3).join('/');
    return pickRole('/' + rest, search);
  }
  return 'beheer';
}
