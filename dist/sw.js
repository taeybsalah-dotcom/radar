// 🔔 Radar Loyalty Engine — Web Push & Background Notification Service Worker
const CACHE_NAME = 'radar-sw-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    clients.claim().then(() => {
      console.log('[Radar SW] Service Worker active and controlling clients');
    })
  );
});

// Handle Push Events (when browser/screen is closed)
self.addEventListener('push', (event) => {
  let data = {
    title: 'رادار | RADAR',
    body: 'لديك إشعار جديد من منصة رادار',
    icon: '/icon-192.png',
    badge: '/favicon-32.png',
    tag: 'radar-notification',
    url: '/',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    } catch (e) {
      data.body = event.data.text() || data.body;
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/favicon-32.png',
    vibrate: [200, 100, 200, 100, 200],
    tag: data.tag || 'radar-alert',
    renotify: true,
    data: {
      url: data.url || '/',
      dateOfArrival: Date.now(),
    },
    actions: [
      { action: 'open', title: 'عرض الآن 👁️' },
      { action: 'close', title: 'إغلاق ✕' },
    ],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Handle Notification Click (opens portal or focuses open tab)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
