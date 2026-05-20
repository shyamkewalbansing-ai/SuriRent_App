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
  // Prefer kiosk token only for /kiosk/* endpoints that require it
  if (config.url && config.url.startsWith('/kiosk/payments') && kioskToken) {
    config.headers.Authorization = `Bearer ${kioskToken}`;
  } else if (adminToken) {
    config.headers.Authorization = `Bearer ${adminToken}`;
  } else if (kioskToken) {
    config.headers.Authorization = `Bearer ${kioskToken}`;
  }
  return config;
});

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

export const MONTHS_NL = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
];
