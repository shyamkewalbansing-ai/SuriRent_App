// Foreground-notify hook — pollt /api/payments/pending-count elke 5s zolang
// de admin app open is. Bij detectie van een NIEUWE pending betaling
// (latest.id verschilt van de laatste keer) toont het een in-app banner
// + ding-ding-geluid.
//
// Use case: iPhone PWA in Guided Access mode. Apple blokkeert daar ALLE
// system-level push notifications op OS-niveau — we kunnen daar niets aan
// veranderen, óók native apps krijgen niets binnen. Onze workaround is
// een in-app notificatie die werkt ZOLANG de app op de voorgrond staat
// (wat in Guided Access altijd zo is).
//
// Werkt ook gewoon naast de bestaande Web Push notificaties — push voor
// achtergrond, foreground-poll voor open-app instant feedback.

import { useEffect, useRef } from 'react';
import { api } from './api';
import { playPendingApprovalDing } from './notify-sound';
import { isTapSoundsEnabled } from './tap-sounds';

const LS_KEY = 'last_pending_id_seen';
const POLL_MS = 5000;

function fmtMoney(amount, cur) {
  try {
    return new Intl.NumberFormat('nl-NL', {
      style: 'currency', currency: (cur || 'SRD').toUpperCase(),
      minimumFractionDigits: 2,
    }).format(Number(amount || 0));
  } catch { return `${cur || ''} ${amount}`; }
}

// =====================================================================
// In-app banner — vanilla DOM, geen extra dependency. Schuift in vanaf
// de bovenkant, blijft 8s zichtbaar, tap → navigeert naar action.href.
// Werkt op iOS PWA Guided Access mode (foreground = altijd zichtbaar).
// =====================================================================
let _bannerHost = null;
function _ensureHost() {
  if (_bannerHost && document.body.contains(_bannerHost)) return _bannerHost;
  const host = document.createElement('div');
  host.id = 'foreground-notify-host';
  Object.assign(host.style, {
    position: 'fixed', top: '0', left: '0', right: '0',
    zIndex: '99999', pointerEvents: 'none',
    paddingTop: 'env(safe-area-inset-top, 0px)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
  });
  document.body.appendChild(host);
  _bannerHost = host;
  return host;
}

function showInAppBanner({ title, body, action }) {
  const host = _ensureHost();
  const card = document.createElement('div');
  Object.assign(card.style, {
    pointerEvents: 'auto',
    margin: '12px',
    background: '#FFFFFF',
    border: '1px solid rgba(255,92,0,0.25)',
    borderLeft: '5px solid #FF5C00',
    borderRadius: '16px',
    boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
    padding: '12px 14px',
    maxWidth: '420px', width: 'calc(100% - 24px)',
    display: 'flex', alignItems: 'center', gap: '12px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    transform: 'translateY(-120%)',
    transition: 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms',
    opacity: '0',
  });
  card.setAttribute('role', 'alert');
  card.setAttribute('data-testid', 'foreground-pending-banner');

  // Icon
  const icon = document.createElement('div');
  Object.assign(icon.style, {
    width: '40px', height: '40px', borderRadius: '10px',
    background: '#FFF4ED', color: '#FF5C00',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0',
    fontSize: '22px', fontWeight: '900',
  });
  icon.textContent = '!';

  const text = document.createElement('div');
  text.style.flex = '1';
  text.style.minWidth = '0';
  const titleEl = document.createElement('div');
  Object.assign(titleEl.style, { fontWeight: '800', color: '#0F172A', fontSize: '14px', lineHeight: '1.2' });
  titleEl.textContent = title;
  const bodyEl = document.createElement('div');
  Object.assign(bodyEl.style, { color: '#64748B', fontSize: '12px', marginTop: '2px', lineHeight: '1.3' });
  bodyEl.textContent = body;
  text.appendChild(titleEl); text.appendChild(bodyEl);

  const btn = document.createElement('button');
  btn.textContent = (action && action.label) || 'Bekijk';
  Object.assign(btn.style, {
    background: '#FF5C00', color: '#FFFFFF', border: '0', borderRadius: '10px',
    padding: '8px 14px', fontWeight: '800', fontSize: '13px', cursor: 'pointer',
    flexShrink: '0',
  });

  card.appendChild(icon); card.appendChild(text); card.appendChild(btn);
  host.appendChild(card);

  // Animate in
  requestAnimationFrame(() => {
    card.style.transform = 'translateY(0)';
    card.style.opacity = '1';
  });

  const close = () => {
    card.style.transform = 'translateY(-120%)';
    card.style.opacity = '0';
    setTimeout(() => { try { card.remove(); } catch { /* ignore */ } }, 320);
  };

  btn.addEventListener('click', () => {
    close();
    try {
      if (action && action.href) window.location.assign(action.href);
    } catch { /* ignore */ }
  });
  card.addEventListener('click', (ev) => {
    if (ev.target === btn) return;
    close();
    try {
      if (action && action.href) window.location.assign(action.href);
    } catch { /* ignore */ }
  });

  setTimeout(close, 8000);
}

export function useForegroundPendingNotify({ enabled = true } = {}) {
  // Eerste tick = "warm-up", we tonen geen toast voor pendings die al
  // bestonden vóórdat de admin de app opende — alleen voor écht NIEUWE
  // pendings tijdens de sessie.
  const warmedUpRef = useRef(false);
  // We bewaren de last-seen id in localStorage zodat een page refresh
  // niet opnieuw een toast triggert voor een al-bekende pending.
  const lastIdRef = useRef(localStorage.getItem(LS_KEY) || '');

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer = null;

    const trigger = (latest) => {
      const amt = fmtMoney(latest.amount, latest.currency);
      const tenant = latest.tenant_name || 'Onbekende huurder';
      const apt = latest.apartment_number ? ` · Appt. ${latest.apartment_number}` : '';
      const by = latest.received_by ? ` · door ${latest.received_by}` : '';
      showInAppBanner({
        title: `Goedkeuring nodig · ${amt}`,
        body: `${tenant}${apt}${by}`,
        action: { label: 'Bekijk', href: '/admin/payments?filter=pending' },
      });
      // Distinctive ding-ding (zelfde als push-notificatie)
      if (isTapSoundsEnabled()) playPendingApprovalDing();
    };

    const poll = async () => {
      try {
        const { data } = await api.get('/payments/pending-count');
        if (cancelled) return;
        const latest = data?.latest;
        if (!latest) {
          // Geen pendings meer → reset zodat een nieuwe pending later weer
          // detecteerbaar is.
          warmedUpRef.current = true;
          return;
        }
        if (!warmedUpRef.current) {
          // Eerste tick: alleen unseen-state vastleggen, geen toast
          warmedUpRef.current = true;
          if (latest.id !== lastIdRef.current) {
            lastIdRef.current = latest.id;
            try { localStorage.setItem(LS_KEY, latest.id); } catch { /* ignore */ }
          }
          return;
        }
        if (latest.id && latest.id !== lastIdRef.current) {
          lastIdRef.current = latest.id;
          try { localStorage.setItem(LS_KEY, latest.id); } catch { /* ignore */ }
          trigger(latest);
        }
      } catch { /* stilzwijgend — 401/network failures niet spammen */ }
    };

    // Direct 1× pollen, daarna intervallen.
    poll();
    timer = setInterval(poll, POLL_MS);

    // Wanneer de tab weer focus krijgt (bv. na Guided Access switch tussen
    // apps die niet écht switcht maar wel een wake-event geeft), poll
    // direct zodat de admin niet 5s hoeft te wachten.
    const onFocus = () => poll();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [enabled]);
}
