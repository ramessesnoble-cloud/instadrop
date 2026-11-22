// Instadrop service worker: the app shell opens instantly and works offline. API calls and live streams are never cached.
const V = 'instadrop-v5', SHELL = ['/', '/css/app.css', '/js/app.js', '/js/i18n.js', '/js/icons.js', '/js/i18n-auth.js', '/js/auth-ui.js', '/icon-192.png', '/icon.svg', '/manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return; // maps, fonts and the API go straight to the network
  e.respondWith(caches.open(V).then(async c => { // stale-while-revalidate: show the cached copy now, refresh it in the background
    const hit = await c.match(e.request), net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit || (e.request.mode === 'navigate' ? c.match('/') : undefined));
    return hit || net;
  }));
});
