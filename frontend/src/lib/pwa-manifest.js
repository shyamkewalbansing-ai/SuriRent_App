import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Wissel de actieve PWA-manifest dynamisch op basis van de huidige route.
 * Hierdoor kan iemand op het Beheer-scherm een "SuriRent Beheer"-PWA
 * installeren, terwijl hetzelfde origin op het Kiosk-scherm een "SuriRent
 * Kiosk"-PWA aanbiedt. Elke variant heeft een eigen naam, kleur en icon.
 *
 * Mapping (eerste match wint):
 *   /admin*                         -> beheer
 *   /kiosk, /kiosk/huurder          -> kiosk
 *   /kiosk/klant                    -> klant
 *   /huurder*                       -> huurder
 *   alle overige paden              -> beheer (default — landing/login)
 *
 * iOS-/Android-installers kiezen de manifest van het tabblad op het moment
 * van installatie; daarna gebruikt de PWA `start_url` als entry-point.
 */
export function usePwaManifest() {
  const { pathname } = useLocation();
  useEffect(() => {
    const role = pickRole(pathname);
    const href = `/manifest-${role}.json`;
    const themeByRole = {
      beheer:  '#FF5C00',
      kiosk:   '#2563EB',
      huurder: '#10B981',
      klant:   '#9333EA',
    };
    let link = document.querySelector('link[rel="manifest"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      document.head.appendChild(link);
    }
    if (link.getAttribute('href') !== href) link.setAttribute('href', href);

    // Werk ook de theme-color meta tag bij voor de iOS status-bar tint
    // wanneer geïnstalleerd vanuit dit scherm.
    const meta = document.querySelector('meta[name="theme-color"]:not([media])')
      || document.querySelector('meta[name="theme-color"]');
    if (meta && themeByRole[role]) {
      meta.setAttribute('content', themeByRole[role]);
    }
  }, [pathname]);
}

function pickRole(path = '') {
  const p = (path || '').toLowerCase();
  if (p.startsWith('/admin')) return 'beheer';
  if (p === '/kiosk/klant' || p.startsWith('/kiosk/klant')) return 'klant';
  if (p === '/kiosk' || p.startsWith('/kiosk')) return 'kiosk';
  if (p.startsWith('/huurder')) return 'huurder';
  // Branded routes (/c/<slug>/...) — kijk naar het sub-pad
  if (p.startsWith('/c/')) {
    const rest = p.split('/').slice(3).join('/');
    return pickRole('/' + rest);
  }
  return 'beheer';
}
