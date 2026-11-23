const CACHE = 'potage-v106';
const STATIC = [
  "/styles/404.css",
  "/scripts/404.js",
  "/scripts/404-events.js",
  "/pages/404.html",
  "/styles/account-settings.css",
  "/scripts/account-settings-events.js",
  "/scripts/ayuda.js",
  "/styles/ayuda.css",
  "/scripts/ayuda-events.js",
  "/scripts/calendario.js",
  "/styles/calendario.css",
  "/scripts/calendario-events.js",
  "/scripts/dashboard.js",
  "/styles/dashboard.css",
  "/scripts/dashboard-events.js",
  "/styles/generador-imagenes.css",
  "/scripts/generador-imagenes-events.js",
  "/scripts/grupos.js",
  "/styles/grupos.css",
  "/scripts/grupos-events.js",
  "/scripts/index.js",
  "/styles/index.css",
  "/scripts/index-events.js",
  "/scripts/informes.js",
  "/styles/informes.css",
  "/scripts/informes-events.js",
  "/scripts/login.js",
  "/styles/login.css",
  "/scripts/login-events.js",
  "/scripts/logs.js",
  "/styles/logs.css",
  "/scripts/logs-events.js",
  "/styles/productos.css",
  "/scripts/productos-events.js",
  "/styles/regiones.css",
  "/scripts/regiones-events.js",
  "/scripts/register.js",
  "/styles/register.css",
  "/scripts/register-events.js",
  "/scripts/sucursales.js",
  "/styles/sucursales.css",
  "/scripts/sucursales-events.js",
  '/pages/dashboard.html', '/pages/index.html', '/pages/login.html', '/pages/register.html',
  '/pages/grupos.html', '/pages/informes.html', '/pages/logs.html', '/pages/account-settings.html',
  '/pages/sucursales.html', '/pages/ayuda.html', '/pages/calendario.html', '/pages/generador-imagenes.html',
  '/pages/productos.html', '/scripts/productos.js', '/styles/productos.css', '/scripts/egg-prices.js', '/pages/regiones.html', '/scripts/regiones.js',
  '/scripts/price-artwork.js', '/scripts/price-artwork-ui.js', '/scripts/social-artwork.js', '/scripts/company-templates.js', '/img/icon-512.png', '/scripts/price-text.js', '/scripts/chicken-catalog.js', '/img/precios/pollos.png', '/img/precios/amba.jpg', '/img/precios/costa.jpg', '/img/precios/logo-potage.png', '/img/plantillas/potage/logo.png', '/img/plantillas/el-triangulo/huevos.png',
  '/scripts/app.js', '/scripts/marketing-analysis.js', '/scripts/account.js', '/scripts/theme.js', '/styles/style.css', '/manifest.json', '/scripts/sw.js'
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
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

/* ---------- Web Push ---------- */
function absoluteUrl(value) {
  try {
    const url = new URL(value || '/pages/dashboard.html', self.location.origin);
    return url.origin === self.location.origin && /^https?:$/.test(url.protocol) ? url.href : self.location.origin + '/pages/dashboard.html';
  } catch (e) {
    return self.location.origin + '/pages/dashboard.html';
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
