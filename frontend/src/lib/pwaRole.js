// Remember which "role" (kiosk / admin / tenant) the user typically uses.
// When the PWA is launched in standalone mode and we have a stored preference,
// LoginPage auto-redirects there so the app feels like a dedicated role-app.

const KEY = 'pwa_preferred_role';

/** kiosk | admin | tenant | null */
export function getPreferredRole() {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'kiosk' || v === 'admin' || v === 'tenant') return v;
  } catch { /* localStorage unavailable */ }
  return null;
}

export function setPreferredRole(role) {
  if (role !== 'kiosk' && role !== 'admin' && role !== 'tenant') return;
  try { localStorage.setItem(KEY, role); } catch { /* ignore */ }
}

export function clearPreferredRole() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function isStandalonePWA() {
  try {
    return (
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.navigator.standalone === true ||
      new URLSearchParams(window.location.search).get('source') === 'pwa'
    );
  } catch {
    return false;
  }
}

export function routeForRole(role) {
  if (role === 'kiosk') return '/kiosk';
  if (role === 'admin') return '/admin';
  if (role === 'tenant') return '/huurder';
  return '/login';
}
