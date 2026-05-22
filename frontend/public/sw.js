/* eslint-disable no-restricted-globals */
/**
 * SuriRent PWA service worker.
 * - App shell caching (offline-tolerant)
 * - Network-first for HTML/JSON, cache-first for static assets
 * - Bypass /api/* (always go to network)
 * - Push notifications + click handler
 */
const CACHE_VERSION = 'surirent-v12';
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
self.addEventListener('push', (event) => {
  let data = { title: 'SuriRent', body: '' };
  if (event.data) {
    try { data = event.data.json(); } catch { data.body = event.data.text(); }
  }
  const options = {
    body: data.body || '',
    icon: '/kiosk-icons/kiosk-192.png',
    badge: '/kiosk-icons/kiosk-72.png',
    data: data.data || {},
    vibrate: [120, 60, 120],
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/admin';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(target));
      if (existing) return existing.focus();
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});

// Allow page to trigger SKIP_WAITING (used by update prompts)
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
