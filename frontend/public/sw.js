/* eslint-disable no-restricted-globals */
/**
 * SuriRent PWA service worker.
 * - App shell caching (offline-tolerant)
 * - Network-first for HTML/JSON, cache-first for static assets
 * - Bypass /api/* (always go to network)
 * - Push notifications + click handler
 */
const CACHE_VERSION = 'surirent-v65';
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
  event.waitUntil((async () => {
    // Verwijder ALLE oude caches (zowel static als runtime van vorige versies).
    // Belangrijk: bij een nieuwe build krijgen chunks nieuwe hashed namen.
    // Als we de runtime cache van een vorige versie behouden, blijft een
    // oude bundle.js daarin staan die naar niet-meer-bestaande chunks vraagt
    // → "Script error" / ChunkLoadError. Door alles van vorige versie te
    // wissen forceren we een schone reload bij elke version bump.
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => !k.startsWith(CACHE_VERSION) && k !== 'surirent-state').map((k) => caches.delete(k))
    );
    await self.clients.claim();
    // Vertel alle open tabs dat ze 1x mogen herladen om de nieuwe chunks
    // te pakken — zonder dat de gebruiker zelf hoeft te refreshen.
    try {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of clients) c.postMessage({ type: 'SW_ACTIVATED', version: CACHE_VERSION });
    } catch { /* noop */ }
  })());
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

  // HTML navigation: STALE-WHILE-REVALIDATE — toon eerst de gecachete shell
  // (instant first paint op PWA), update tegelijk in achtergrond zodat
  // de volgende refresh up-to-date is. Op een cold start zonder cache
  // valt het terug op live network. Dit maakt PWA-openen ~500-1500ms
  // sneller op mobiel.
  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isHTML) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cached = await cache.match(req) || await cache.match('/');
        const networkPromise = fetch(req).then((res) => {
          if (res && res.status === 200) {
            cache.put(req, res.clone()).catch(() => {});
          }
          return res;
        }).catch(() => cached);
        return cached || networkPromise;
      })
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
  const requireApproval = !!(data.data && data.data.require_approval);
  const options = {
    body: data.body || '',
    icon: '/kiosk-icons/kiosk-192.png',
    badge: '/kiosk-icons/kiosk-72.png',
    data: data.data || {},
    vibrate: requireApproval ? [300, 100, 300, 100, 300, 100, 500] : [200, 100, 200, 100, 300],
    actions: requireApproval ? [
      { action: 'open', title: 'Bekijk + goedkeuren' },
      { action: 'dismiss', title: 'Later' },
    ] : [
      { action: 'open', title: 'Bekijk' },
      { action: 'dismiss', title: 'Sluiten' },
    ],
    // Unique tag per payment_id zodat meerdere notificaties van dezelfde
    // soort NIET elkaar overschrijven. Voorheen had alleen pending-approval
    // een unique tag; gewone betalingen deelden allemaal `surirent-payment`
    // waardoor iOS Safari ze één voor één verving en de admin het idee kreeg
    // dat ze niet aankomen. Nu: élke push met payment_id krijgt eigen tag.
    tag: data.data?.payment_id
      ? `surirent-${kind}-${data.data.payment_id}`
      : `surirent-${kind}-${Date.now()}`,
    renotify: true,
    // Pending approval blijft staan tot admin het bekeken heeft —
    // overdue ook. Reguliere betalingen op iOS PWA blijven nu ook
    // requireInteraction zodat ze in het Notification Center zichtbaar
    // blijven i.p.v. na 5s te verdwijnen.
    requireInteraction: kind === 'overdue' || requireApproval || kind === 'payment',
    silent: false,
    timestamp: Date.now(),
  };
  event.waitUntil((async () => {
    await _loadBadge();
    _badgeCount += inc;
    await _saveBadge();
    await _setAppBadge(_badgeCount);
    // Vertel evt. open tabs zodat React de badge ook in-app kan tonen
    // EN — bij pending-approval — een distinctive "ding-ding" kan spelen
    // (zie src/lib/notify-sound.js installPendingApprovalDingListener).
    try {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of clients) c.postMessage({
        type: 'BADGE_CHANGED',
        count: _badgeCount,
        require_approval: requireApproval,
        kind,
      });
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
      case 'payment_pending_approval': target = '/admin/payments?filter=pending'; break;
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

