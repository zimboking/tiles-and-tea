// Service worker: shows turn and nudge notifications. It caches nothing.

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || 'Tiles & Tea', {
    body: data.body || "It's your turn.",
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: data.tag || 'tiles-and-tea',
    renotify: true,
    data: { url: data.url || './' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || './', self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((w) => w.url === url);
    if (open) return open.focus();
    return self.clients.openWindow(url);
  })());
});
