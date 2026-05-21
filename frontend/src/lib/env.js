/**
 * Domain helpers for split deployment.
 *
 * Configure via frontend/.env on production:
 *   REACT_APP_MARKETING_HOST=surirent.sr
 *   REACT_APP_APP_URL=https://app.surirent.sr
 *
 * On preview / local dev both vars can stay empty — the app falls back to
 * "hybrid mode" where marketing + app routes share one origin.
 */

function _norm(host) {
  return (host || '').trim().toLowerCase().replace(/^www\./, '').replace(/:.*$/, '');
}

export function marketingHost() {
  return _norm(process.env.REACT_APP_MARKETING_HOST);
}

export function appUrl() {
  return (process.env.REACT_APP_APP_URL || '').replace(/\/$/, '');
}

export function isMarketingHost() {
  const expected = marketingHost();
  if (!expected) return false;
  const current = _norm(typeof window !== 'undefined' ? window.location.hostname : '');
  return current === expected;
}

/**
 * Returns the full URL for a path inside the app. On hybrid/preview returns
 * a relative path (so React Router handles navigation in-app). On the
 * marketing domain it returns the absolute URL to the configured app domain.
 */
export function buildAppUrl(path = '/') {
  const url = appUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (isMarketingHost() && url) {
    return `${url}${cleanPath}`;
  }
  return cleanPath;
}

/**
 * For marketing CTAs: always returns an absolute URL when configured,
 * suitable for `<a href>` (allows cross-domain redirect on production,
 * stays relative for preview).
 */
export function appLink(path = '/') {
  const url = appUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (url) return `${url}${cleanPath}`;
  return cleanPath;
}

export function publicMarketingUrl() {
  const host = marketingHost();
  if (host) return `https://${host}`;
  // Fallback to current origin
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}
