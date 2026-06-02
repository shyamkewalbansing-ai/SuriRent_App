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
  // Token-keuze op basis van endpoint, NIET op basis van wat als eerste in
  // localStorage staat. Anders zou een stale admin_token de voorkeur krijgen
  // op kiosk-endpoints en alles met 401 falen (klassieke bug na fresh PIN
  // entry waarbij oude admin sessie nog blijft hangen).
  if (url.startsWith('/tenant-portal/') && tenantToken) {
    config.headers.Authorization = `Bearer ${tenantToken}`;
  } else if (url.startsWith('/kiosk/') && kioskToken) {
    // Élke /kiosk/* endpoint gebruikt PRIMAIR het kiosk_token.
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
// op iOS PWA na een verlopen admin_token). De hard-redirect doen we
// ALLEEN voor admin-routes; tenant + kiosk + customer pagina's hebben
// hun eigen lokale login-UI en moeten niet naar /login?stale=1 worden
// gestuurd (dat is de ADMIN-login route).
const PUBLIC_401_PATHS = [
  '/auth/login', '/auth/register', '/auth/kiosk-pin',
  '/tenant-portal/login', '/tenant-portal/pin-login',
];
api.interceptors.response.use(
  (r) => r,
  (err) => {
    // 402 Payment Required — billing blocked (cancelled/expired/past_due).
    // Markeer in localStorage zodat AdminDashboard de BillingBlockedScreen toont.
    if (err?.response?.status === 402) {
      const detail = err?.response?.data?.detail;
      if (detail && detail.code === 'billing_blocked') {
        try {
          localStorage.setItem('billing_blocked_status', detail.billing_status || 'cancelled');
          localStorage.setItem('billing_blocked_message', detail.message || '');
          // Broadcast event zodat React components direct re-renderen.
          window.dispatchEvent(new CustomEvent('billing-blocked', { detail }));
        } catch { /* ignore */ }
      }
    }
    if (err?.response?.status === 401) {
      const url = (err.config?.url || '');
      const isPublic = PUBLIC_401_PATHS.some((p) => url.startsWith(p));
      if (!isPublic) {
        const path = (typeof window !== 'undefined' && window.location?.pathname) || '';
        const isTenantContext = url.startsWith('/tenant-portal/')
          || path.includes('/kiosk/huurder')
          || path.includes('/kiosk/klant')
          || path.startsWith('/huurder');
        const isKioskContext = url.startsWith('/kiosk/') || path === '/kiosk' || path.startsWith('/kiosk/');
        try {
          if (isTenantContext) {
            localStorage.removeItem('tenant_token');
            try {
              sessionStorage.removeItem('tenant_session');
            } catch { /* ignore */ }
          } else if (isKioskContext) {
            localStorage.removeItem('kiosk_token');
            try {
              sessionStorage.removeItem('kiosk_emp_id');
              sessionStorage.removeItem('kiosk_emp_name');
              sessionStorage.removeItem('kiosk_emp_pin');
            } catch { /* ignore */ }
          } else {
            // Admin context — token verlopen of foutief.
            localStorage.removeItem('admin_token');
          }
        } catch { /* ignore */ }
        // Hard redirect ALLEEN voor admin-pagina's (/admin/* of /<slug>/admin/*)
        // en alleen wanneer we niet al op /login of een tenant/kiosk route zitten.
        // Tenant/kiosk/customer pagina's tonen zelf hun lokale login-UI.
        try {
          const segs = path.split('/').filter(Boolean);
          // Detecteer branded slug + admin route binnen die slug.
          // Sync met RESERVED_SLUGS in lib/branded-nav.js.
          const RESERVED = new Set(['login','admin','kiosk','huurder','onderteken','c','vastgoed','api','health','static','manifest','sw','favicon','assets','qr-link','qr','tenant','tenants','company','companies','superadmin']);
          let isAdminRoute = false;
          let brandedSlug = '';
          if (segs[0] === 'admin') {
            isAdminRoute = true;
          } else if (segs[0] && !RESERVED.has(segs[0]) && segs[1] === 'admin') {
            isAdminRoute = true;
            brandedSlug = segs[0];
          } else if (segs[0] === 'c' && segs[1] && segs[2] === 'admin') {
            isAdminRoute = true;
            brandedSlug = segs[1];
          }
          const onLogin = path === '/login' || path.endsWith('/login');
          if (isAdminRoute && !onLogin) {
            const loginPath = brandedSlug ? `/${brandedSlug}/login?stale=1` : '/login?stale=1';
            window.location.assign(loginPath);
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
