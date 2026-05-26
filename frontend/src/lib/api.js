import axios from 'axios';

const baseURL = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const api = axios.create({
  baseURL,
  withCredentials: false,
});

// Attach bearer token if present (fallback to cookie auth)
api.interceptors.request.use((config) => {
  const adminToken = localStorage.getItem('admin_token');
  const kioskToken = localStorage.getItem('kiosk_token');
  const tenantToken = localStorage.getItem('tenant_token');
  const activeCompanyId = localStorage.getItem('active_company_id');
  const url = config.url || '';
  if (url.startsWith('/tenant-portal/') && tenantToken) {
    config.headers.Authorization = `Bearer ${tenantToken}`;
  } else if ((url.startsWith('/kiosk/payments') || url.startsWith('/kiosk/customer-display')) && kioskToken) {
    config.headers.Authorization = `Bearer ${kioskToken}`;
  } else if (adminToken) {
    config.headers.Authorization = `Bearer ${adminToken}`;
  } else if (kioskToken) {
    config.headers.Authorization = `Bearer ${kioskToken}`;
  } else if (tenantToken) {
    config.headers.Authorization = `Bearer ${tenantToken}`;
  }
  // Superadmin company scope: only set for admin-authenticated calls
  if (activeCompanyId && adminToken) {
    config.headers['x-active-company'] = activeCompanyId;
  }
  return config;
});

// Response-interceptor: bij 401 op een protected endpoint → verwijder de
// stale token zodat de PWA niet vastloopt in een redirect-loop (zoals
// op iOS PWA na een verlopen admin_token). De gebruiker komt automatisch
// terug op /login en kan opnieuw inloggen of zijn PIN intikken.
const PUBLIC_401_PATHS = [
  '/auth/login', '/auth/register', '/auth/kiosk-pin',
  '/tenant-portal/login', '/tenant-portal/pin-login',
];
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      const url = (err.config?.url || '');
      const isPublic = PUBLIC_401_PATHS.some((p) => url.startsWith(p));
      if (!isPublic) {
        try {
          if (url.startsWith('/tenant-portal/')) {
            localStorage.removeItem('tenant_token');
          } else if (url.startsWith('/kiosk/')) {
            localStorage.removeItem('kiosk_token');
            // Employee-sessie meenemen — die hoort bij de kiosk-token.
            try {
              sessionStorage.removeItem('kiosk_emp_id');
              sessionStorage.removeItem('kiosk_emp_name');
              sessionStorage.removeItem('kiosk_emp_pin');
            } catch { /* ignore */ }
          } else {
            // Admin path 401 → admin_token verlopen.
            localStorage.removeItem('admin_token');
          }
        } catch { /* ignore */ }
        // Forceer naar login indien gebruiker niet al op een /login of /onderteken
        // pagina zit (waar 401 niet relevant is voor UX-redirect).
        try {
          const path = window.location.pathname || '';
          const safe = path === '/login' || path.startsWith('/onderteken') || path === '/' ||
            path.endsWith('/login') || path.endsWith('/c');
          if (!safe) {
            // Hard navigate met source=stale zodat /login expliciet weet dat
            // we van een stale-token-redirect komen (kan UI hints tonen).
            window.location.assign('/login?stale=1');
          }
        } catch { /* ignore */ }
      }
    }
    return Promise.reject(err);
  }
);

export function formatError(err, fallback = 'Er is iets misgegaan') {
  const detail = err?.response?.data?.detail;
  if (detail == null) return err?.message || fallback;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === 'string' ? e.msg : JSON.stringify(e))).join(' ');
  if (detail && typeof detail.msg === 'string') return detail.msg;
  return String(detail);
}

export function fmtMoney(amount, currency = 'SRD') {
  const n = Number(amount || 0);
  return `${currency} ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Open een PDF endpoint dat auth vereist in een nieuw tabblad.
 *  `window.open(url)` stuurt geen Authorization-header — als de huurder via
 *  Bearer-token is ingelogd (en niet via cookie) krijgt het backend "Niet
 *  ingelogd". Met `responseType:'blob'` haalt axios het PDF met juiste auth,
 *  en openen we de blob-URL in een nieuw tabblad. */
export async function openAuthedPdf(path, { filename } = {}) {
  const { data } = await api.get(path, { responseType: 'blob' });
  const blob = new Blob([data], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank', 'noopener');
  if (!w) {
    // Popup geblokkeerd → forceer download zodat de gebruiker iets krijgt.
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'document.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  // Revoke na 60s — genoeg tijd voor PDF te laden in nieuw tabblad.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export const MONTHS_NL = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
];
