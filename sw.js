// Version: bei jeder Änderung hier, in app.js (APP_VERSION) und in version.json erhöhen.
const VERSION = '1.48';
const CACHE = 'seco-' + VERSION;
const FILES = ['./','index.html','style.css','app.js','scan.js','icons.js','analytics.js','manifest.webmanifest','icons/icon-180.png','icons/icon-192.png','icons/icon-512.png'];
// Beim Installieren frisch vom Server holen (HTTP-Cache umgehen)
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, {cache: 'reload'})))));
  self.skipWaiting();
});
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(k => Promise.all(k.filter(n => n !== CACHE).map(n => caches.delete(n)))).then(() => self.clients.claim())));
// Stale-while-revalidate: sofort aus dem Cache, im Hintergrund aktualisieren. version.json immer vom Netz.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.endsWith('/version.json')) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(e.request, {ignoreSearch: true});
    const network = fetch(e.request, {cache: 'no-cache'}).then(r => { if (r.ok) cache.put(e.request, r.clone()); return r; }).catch(() => cached);
    return cached || network;
  }));
});
