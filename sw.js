const CACHE_NAME = 'app-shell-v1';
const DYNAMIC_CACHE = 'dynamic-v1';
const ASSETS = [
  '/', '/index.html', '/app.js', '/manifest.json',
  '/content/home.html', '/content/about.html',
  '/icons/favicon-128x128.png', '/icons/favicon-192x192.png', '/icons/favicon-512x512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME && k !== DYNAMIC_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  // App Shell: Cache First для статики, Network First для контента
  if (url.pathname.startsWith('/content/') || url.pathname === '/') {
    e.respondWith(
      fetch(e.request)
        .then(res => { const clone = res.clone(); caches.open(DYNAMIC_CACHE).then(c => c.put(e.request, clone)); return res; })
        .catch(() => caches.match(e.request).then(cached => cached || caches.match('/content/home.html')))
    );
  } else {
    e.respondWith(caches.match(e.request).then(res => res || fetch(e.request)));
  }
});

self.addEventListener('push', e => {
  let data = { title: 'Уведомление', body: '', reminderId: null };
  if (e.data) data = e.data.json();
  const options = { body: data.body, icon: '/icons/favicon-128x128.png', data: { reminderId: data.reminderId } };
  if (data.reminderId) options.actions = [{ action: 'snooze', title: 'Отложить на 5 минут' }];
  e.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', e => {
  const n = e.notification;
  if (e.action === 'snooze') {
    e.waitUntil(fetch(`/snooze?reminderId=${n.data.reminderId}`, { method: 'POST' }).then(() => n.close()));
  } else { n.close(); }
});