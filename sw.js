const CACHE = 'potage-v24';
const STATIC = [
  '/dashboard.html', '/index.html', '/login.html', '/register.html',
  '/grupos.html', '/informes.html', '/logs.html', '/account-settings.html',
  '/sucursales.html', '/ayuda.html',
  '/app.js', '/style.css', '/manifest.json', '/sw.js'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(STATIC).catch(() => {})
    )
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first: siempre intentamos el servidor (para nunca quedarnos con versiones viejas/rotas);
// si no hay red, servimos la copia cacheada.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/') || url.origin !== location.origin) return;
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE).then((cache) => cache.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
