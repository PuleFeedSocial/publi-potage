const CACHE = 'potage-v84';
const STATIC = [
  "/assets/css/pages/account-settings.css",
  "/assets/js/pages/account-settings-events.js",
  "/assets/js/pages/ayuda.js",
  "/assets/css/pages/ayuda.css",
  "/assets/js/pages/ayuda-events.js",
  "/assets/js/pages/calendario.js",
  "/assets/css/pages/calendario.css",
  "/assets/js/pages/calendario-events.js",
  "/assets/js/pages/dashboard.js",
  "/assets/css/pages/dashboard.css",
  "/assets/js/pages/dashboard-events.js",
  "/assets/css/pages/generador-imagenes.css",
  "/assets/js/pages/generador-imagenes-events.js",
  "/assets/js/pages/grupos.js",
  "/assets/css/pages/grupos.css",
  "/assets/js/pages/grupos-events.js",
  "/assets/js/pages/index.js",
  "/assets/css/pages/index.css",
  "/assets/js/pages/index-events.js",
  "/assets/js/pages/informes.js",
  "/assets/css/pages/informes.css",
  "/assets/js/pages/informes-events.js",
  "/assets/js/pages/login.js",
  "/assets/css/pages/login.css",
  "/assets/js/pages/login-events.js",
  "/assets/js/pages/logs.js",
  "/assets/css/pages/logs.css",
  "/assets/js/pages/logs-events.js",
  "/assets/css/pages/productos.css",
  "/assets/js/pages/productos-events.js",
  "/assets/css/pages/regiones.css",
  "/assets/js/pages/regiones-events.js",
  "/assets/js/pages/register.js",
  "/assets/css/pages/register.css",
  "/assets/js/pages/register-events.js",
  "/assets/js/pages/sucursales.js",
  "/assets/css/pages/sucursales.css",
  "/assets/js/pages/sucursales-events.js",
  '/dashboard.html', '/index.html', '/login.html', '/register.html',
  '/grupos.html', '/informes.html', '/logs.html', '/account-settings.html',
  '/sucursales.html', '/ayuda.html', '/calendario.html',
  '/productos.html', '/productos.js', '/productos.css', '/egg-prices.js', '/regiones.html', '/regiones.js',
  '/price-artwork.js', '/price-artwork-ui.js', '/social-artwork.js', '/img/icon-512.png', '/price-text.js', '/chicken-catalog.js', '/img/precios/pollos.png', '/img/precios/amba.jpg', '/img/precios/costa.jpg',
  '/app.js', '/marketing-analysis.js', '/account.js', '/theme.js', '/style.css', '/manifest.json', '/sw.js'
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

/* ---------- Web Push ---------- */
function absoluteUrl(value) {
  try {
    const url = new URL(value || '/dashboard.html', self.location.origin);
    return url.origin === self.location.origin && /^https?:$/.test(url.protocol) ? url.href : self.location.origin + '/dashboard.html';
  } catch (e) {
    return self.location.origin + '/dashboard.html';
  }
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Publi Potage', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Publi Potage';
  const options = {
    body: data.body || '',
    icon: data.icon || '/img/icon-192.png',
    badge: data.badge || '/img/icon-192.png',
    tag: data.tag || undefined,
    data: { url: absoluteUrl(data.url) }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = absoluteUrl(event.notification.data && event.notification.data.url);
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      if ('focus' in client) {
        try { await client.focus(); } catch (e) {}
        if ('navigate' in client && client.url !== target) {
          try { await client.navigate(target); } catch (e) {}
        }
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
