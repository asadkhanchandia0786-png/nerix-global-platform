/* Nerix Global service worker: makes the dashboard installable and shows a friendly page when offline.
   It never caches API calls, chat, or signed-in pages, so private data is never stored on the device. */
const VERSION = 'nerix-pwa-v1';
const SHELL = ['/offline.html', '/icons/icon-192.png', '/icons/icon-512.png', '/manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;                 // only plain same-origin GETs
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/chat-api/')) return;    // live data always goes straight to the network
  if (req.mode === 'navigate') {                                                           // pages: network first, offline page as the fallback
    event.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
    return;
  }
  if (SHELL.includes(url.pathname)) {                                                      // icons and manifest: cache first
    event.respondWith(caches.match(req).then(hit => hit || fetch(req)));
  }
});
