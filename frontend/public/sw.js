/* eslint-disable no-restricted-globals */
// PWA service worker for push notifications
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

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
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      const target = '/vastgoed/admin';
      const existing = clients.find((c) => c.url.includes('/vastgoed/admin'));
      if (existing) return existing.focus();
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
