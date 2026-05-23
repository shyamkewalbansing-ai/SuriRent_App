/* eslint-disable no-restricted-globals */
/**
 * SuriRent PWA service worker.
 * - App shell caching (offline-tolerant)
 * - Network-first for HTML/JSON, cache-first for static assets
 * - Bypass /api/* (always go to network)
 * - Push notifications + click handler
 */
const CACHE_VERSION = 'surirent-v21';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const PRECACHE = [
  '/',
  '/manifest.json',
  '/kiosk-icons/kiosk-72.png',
  '/kiosk-icons/kiosk-144.png',
  '/kiosk-icons/kiosk-192.png',
  '/kiosk-icons/kiosk-512.png',
  '/kiosk-icons/kiosk-favicon.ico',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)).catch(() => {})
  );
  self.skipWaiting();
});

// Listen for messages from the page (e.g. "activate me now, a new bundle
// shipped"). When the page calls reg.update() and sees a new worker waiting,
// it posts SKIP_WAITING — we activate immediately so klanten niet hoeven
// te herinstalleren.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never intercept API calls — always network, no caching.
  if (url.pathname.startsWith('/api/')) return;

  // Cross-origin (e.g. fonts.googleapis.com): cache-first opportunistic.
  if (url.origin !== self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) =>
        cached ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        }).catch(() => cached)
      )
    );
    return;
  }

  // HTML navigation: network-first, fallback to cached app shell.
  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isHTML) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match('/'))
        )
    );
    return;
  }

  // Static assets — use stale-while-revalidate so new builds load on next visit
  // without users getting permanently stuck on old JS bundles.
  if (url.pathname.startsWith('/static/') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const networkPromise = fetch(req).then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            cache.put(req, res.clone()).catch(() => {});
          }
          return res;
        }).catch(() => cached);
        return cached || networkPromise;
      })
    );
    return;
  }

  // Other static assets (images, fonts): cache-first then network.
  event.respondWith(
    caches.match(req).then((cached) =>
      cached ||
      fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
    )
  );
});

// ============== Push notifications ==============

// Globale badge teller — bewaard in IndexedDB-vrij geheugen via een eenvoudige
// counter in een SW-globale variabele + ook in caches (overleeft restart).
let _badgeCount = 0;

async function _loadBadge() {
  try {
    const cache = await caches.open('surirent-state');
    const r = await cache.match('badge-count');
    if (r) {
      const v = parseInt(await r.text(), 10);
      if (!isNaN(v)) _badgeCount = v;
    }
  } catch { /* noop */ }
}
async function _saveBadge() {
  try {
    const cache = await caches.open('surirent-state');
    await cache.put('badge-count', new Response(String(_badgeCount)));
  } catch { /* noop */ }
}
async function _setAppBadge(n) {
  // Badging API werkt op Chrome desktop, Edge, Safari iOS 16.4+ PWA.
  // Bij niet-ondersteunde browsers blijft het stil falen.
  try {
    if (n > 0) {
      if (self.navigator && self.navigator.setAppBadge) {
        await self.navigator.setAppBadge(n);
      }
    } else {
      if (self.navigator && self.navigator.clearAppBadge) {
        await self.navigator.clearAppBadge();
      }
    }
  } catch { /* noop */ }
}

self.addEventListener('push', (event) => {
  let data = { title: 'SuriRent', body: '' };
  if (event.data) {
    try { data = event.data.json(); } catch { data.body = event.data.text(); }
  }
  const kind = (data.data && data.data.kind) || 'info';
  const inc = (data.data && data.data.badge_inc) || 1;
  const options = {
    body: data.body || '',
    icon: '/kiosk-icons/kiosk-192.png',
    badge: '/kiosk-icons/kiosk-72.png',
    data: data.data || {},
    vibrate: [200, 100, 200, 100, 300],
    actions: [
      { action: 'open', title: 'Bekijk' },
      { action: 'dismiss', title: 'Sluiten' },
    ],
    tag: `surirent-${kind}`,
    renotify: true,
    requireInteraction: kind === 'overdue',
    silent: false,
    timestamp: Date.now(),
  };
  event.waitUntil((async () => {
    await _loadBadge();
    _badgeCount += inc;
    await _saveBadge();
    await _setAppBadge(_badgeCount);
    // Vertel evt. open tabs zodat React de badge ook in-app kan tonen
    try {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of clients) c.postMessage({ type: 'BADGE_CHANGED', count: _badgeCount });
    } catch { /* noop */ }
    await self.registration.showNotification(data.title, options);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const data = event.notification.data || {};
  let target = data.url;
  if (!target) {
    switch (data.kind) {
      case 'overdue': target = '/admin/invoices'; break;
      case 'payment': target = '/admin/payments'; break;
      case 'test':    target = '/admin/notifications'; break;
      default:        target = '/admin'; break;
    }
  }
  event.waitUntil((async () => {
    // Reset badge — gebruiker heeft de melding gezien
    _badgeCount = 0;
    await _saveBadge();
    await _setAppBadge(0);
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of clients) c.postMessage({ type: 'BADGE_CHANGED', count: 0 });
    for (const c of clients) {
      if ('focus' in c) {
        c.navigate(target).catch(() => {});
        return c.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  })());
});

// Bericht vanuit pagina: handmatig badge reset (bv. wanneer admin
// /admin/notifications opent).
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data && event.data.type === 'CLEAR_BADGE') {
    event.waitUntil((async () => {
      _badgeCount = 0;
      await _saveBadge();
      await _setAppBadge(0);
    })());
  }
});

