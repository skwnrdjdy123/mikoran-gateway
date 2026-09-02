const CACHE_NAME = 'mikoran-pwa-v2';
const ASSETS_TO_CACHE = [
  '/browser',
  '/mikoran.png',
  '/manifest.json',
  '/style.css?v=6',
  '/browser.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || event.request.url.includes('/v1/')) {
    return; // Pass API calls through network directly
  }
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});

// 🔔 Mobile Background Notification Handler
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_AI_NOTIFICATION') {
    const title = event.data.title || '🤖 Mikoran AI 답변 완료';
    const options = {
      body: event.data.body || 'AI 답변 생성이 완료되었습니다.',
      icon: '/mikoran.png',
      badge: '/mikoran.png',
      vibrate: [200, 100, 200],
      tag: 'mikoran-ai-reply-' + Date.now(),
      renotify: true,
      data: { url: '/browser' }
    };
    self.registration.showNotification(title, options);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/browser') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/browser');
      }
    })
  );
});
