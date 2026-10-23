const API_BASE = window.location.origin.startsWith('http') ? window.location.origin : 'http://localhost:3000';

/* ---------- MODO OSCURO / CLARO ---------- */
function getTheme() {
  const saved = localStorage.getItem('potageTheme');
  if (saved === 'dark' || saved === 'light') return saved;
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

function syncThemeToggle() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const icon = document.querySelector('.theme-toggle-icon');
  const label = document.querySelector('.theme-toggle-label');
  if (icon) icon.className = 'bi ' + (isDark ? 'bi-sun-fill' : 'bi-moon-stars-fill') + ' theme-toggle-icon';
  if (label) label.textContent = isDark ? 'Modo claro' : 'Modo oscuro';
  const thumb = document.querySelector('.theme-switch-thumb');
  if (thumb) thumb.style.transform = isDark ? 'translateX(20px)' : '';
}

function applyTheme(theme, persist = true) {
  if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  document.documentElement.setAttribute('data-bs-theme', theme);
  if (persist) localStorage.setItem('potageTheme', theme);
  syncThemeToggle();
  refreshChartTheme();
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  applyTheme(isDark ? 'light' : 'dark');
}

document.addEventListener('DOMContentLoaded', () => {
  applyTheme(getTheme(), false);
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (!localStorage.getItem('potageTheme')) applyTheme(getTheme(), false);
});

function getCurrentSession() {
  try {
    const data = localStorage.getItem('user');
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

function getToken() {
  return localStorage.getItem('token') || '';
}

function getRefreshToken() {
  return localStorage.getItem('refreshToken') || '';
}

function setSession(token, user, refreshToken) {
  localStorage.setItem('token', token);
  if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
  localStorage.setItem('user', JSON.stringify({ id: user.id, name: user.name, email: user.email, role: user.role }));
}

function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
}

/* ---------- RENOVACIÓN DE SESIÓN (evita cerrar sesión al vencer el token) ---------- */
function tokenExpMs(token) {
  try {
    const b64 = String(token).split('.')[1] || '';
    const payload = JSON.parse(BufferFromBase64Url(b64));
    return payload && payload.exp ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

function BufferFromBase64Url(b64) {
  // atob no acepta base64url; normalizamos y usamos decodeURIComponent(escape(...))
  // como fallback universal (funciona sin Buffer en el navegador).
  const normalized = b64.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  try {
    const bin = atob(padded);
    let out = '';
    for (let i = 0; i < bin.length; i++) out += '%' + ('00' + bin.charCodeAt(i).toString(16)).slice(-2);
    return decodeURIComponent(out);
  } catch {
    return '{}';
  }
}

function isTokenExpiringSoon(token, marginMs) {
  const exp = tokenExpMs(token);
  if (!exp) return true;
  return (exp - Date.now()) < (marginMs == null ? 10 * 60 * 1000 : marginMs);
}

let _refreshPromise = null;
function refreshSession() {
  const rt = getRefreshToken();
  const at = getToken();
  if (!rt && !at) return Promise.resolve(false);
  if (!_refreshPromise) {
    _refreshPromise = fetch(API_BASE + '/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt || '', token: at || '' })
    })
      .then(r => r.json().then(b => ({ status: r.status, body: b })))
      .then(({ status, body }) => {
        if (status === 200 && body && body.token) {
          setSession(body.token, body.user, body.refreshToken);
          return true;
        }
        return status === 401 || status === 403 ? false : null;
      })
      .catch(() => null)
      .finally(() => { _refreshPromise = null; });
  }
  return _refreshPromise;
}

function ensureFreshToken() {
  const t = getToken();
  if (!t) return Promise.resolve(false);
  if (!isTokenExpiringSoon(t)) return Promise.resolve(true);
  return refreshSession();
}

let _sessionExpiredHandled = false;
function onSessionExpired() {
  if (_sessionExpiredHandled) return;
  _sessionExpiredHandled = true;
  clearSession();
  const page = (window.location.pathname.split('/').pop() || '').toLowerCase();
  const isAuthPage = page === '' || page === 'index.html' || page === 'login.html' || page === 'register.html';
  if (isAuthPage) return;
  showToast('Tu sesión expiró. Volvé a iniciar sesión.', 'error');
  setTimeout(() => { window.location.href = 'index.html'; }, 1400);
}

async function authFetch(url, options = {}) {
  await ensureFreshToken();
  const opts = { ...options };
  const headers = { ...(opts.headers || {}) };
  if (typeof opts.body === 'string' && !Object.keys(headers).some(k => k.toLowerCase() === 'content-type')) {
    headers['Content-Type'] = 'application/json';
  }
  headers['Authorization'] = 'Bearer ' + getToken();
  opts.headers = headers;
  let res = await fetch(url, opts);
  if (res.status === 401 && getToken()) {
    const renewed = await refreshSession();
    if (renewed) {
      headers['Authorization'] = 'Bearer ' + getToken();
      res = await fetch(url, opts);
    } else if (renewed === false) {
      onSessionExpired();
    }
  }
  return res;
}

let _tokenRefreshTimer = null;
function scheduleTokenRefresh() {
  if (_tokenRefreshTimer) { clearInterval(_tokenRefreshTimer); _tokenRefreshTimer = null; }
  if (!getToken()) return;
  _tokenRefreshTimer = setInterval(() => {
    if (document.hidden) return;
    ensureFreshToken();
  }, 30 * 60 * 1000);
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && getToken()) ensureFreshToken();
});

function apiFetch(path, options = {}) {
  return authFetch(API_BASE + path, options)
    .then(res => res.text().then(text => {
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = { error: String(text).substring(0, 200) }; }
      return { status: res.status, body: data };
    }));
}

/* ---------- PERMISOS ---------- */
let currentPermissions = null;

function sessionRole() {
  const s = getCurrentSession();
  return s && s.role ? String(s.role).toLowerCase() : '';
}

function loadMyPermissions() {
  if (!getToken()) return Promise.resolve(null);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  return authFetch(API_BASE + '/api/auth/permissions', { signal: ctrl.signal })
    .then(r => r.json())
    .then(body => {
      clearTimeout(timer);
      if (body && body.permissions) {
        currentPermissions = body.permissions;
        applyNavPermissions();
        refreshZonasEditControls();
      }
      return currentPermissions;
    })
    .catch(() => { clearTimeout(timer); return currentPermissions; });
}

function hasPermission(key) {
  if (!key) return true;
  if (sessionRole() === 'admin') return true;
  if (!currentPermissions) return true;
  return currentPermissions[key] !== false;
}

function applyNavPermissions() {
  const map = {
    view_dashboard: 'btn-nav-dashboard',
    view_informes: 'btn-nav-informes',
    view_grupos: 'btn-nav-grupos',
    view_zonas: 'btn-nav-zonas',
    view_sucursales: 'btn-nav-sucursales'
  };
  Object.keys(map).forEach(perm => {
    const el = document.getElementById(map[perm]);
    if (el) el.style.display = hasPermission(perm) ? '' : 'none';
  });
}

function guardPage(perm) {
  if (!getCurrentSession()) { window.location.href = 'index.html'; return; }
  ensureFreshToken().then(ok => {
    if (ok === false) { onSessionExpired(); return; }
    if (ok === null) return;
    loadMyPermissions().then(() => {
      if (!hasPermission(perm)) {
        showToast('No tenés permiso para acceder a esa sección.', 'error');
        window.location.href = 'dashboard.html';
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (getCurrentSession()) {
    ensureFreshToken().then(ok => {
      if (ok) loadMyPermissions();
      else if (ok === false) onSessionExpired();
    });
    scheduleTokenRefresh();
  }
});

/* ---------- CENTRO DE NOTIFICACIONES ---------- */
let notifItems = [];
let notifUnread = 0;
let notifLoading = false;
let notifPanelOpen = false;
let notifMutation = false;
let notifRevision = 0;
let notifLoaded = false;

const NOTIF_ICON_FALLBACK = 'bi-bell';
const NOTIF_ICONS = {
  calendario_asignacion: 'bi-calendar-check',
  calendario_general: 'bi-calendar-plus',
  calendario_recordatorio: 'bi-alarm',
  calendario_realizada: 'bi-check2-circle',
  usuario_registro: 'bi-person-plus',
  sistema: 'bi-info-circle'
};

function notifIconFor(type) {
  return Object.hasOwn(NOTIF_ICONS, type) ? NOTIF_ICONS[type] : NOTIF_ICON_FALLBACK;
}

function notifTimeAgo(value) {
  const date = new Date(value);
  if (isNaN(date.getTime())) return '';
  const diff = Math.max(0, Date.now() - date.getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Ahora';
  if (min < 60) return 'Hace ' + min + ' min';
  const hours = Math.floor(min / 60);
  if (hours < 24) return 'Hace ' + hours + ' h';
  const days = Math.floor(hours / 24);
  if (days < 7) return 'Hace ' + days + ' d';
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

function notifItemEl(item) {
  const el = document.createElement('button');
  el.type = 'button';
  el.disabled = notifMutation;
  el.dataset.notificationId = String(item.id);
  el.className = 'notif-item' + (item.is_read ? '' : ' is-unread');

  const icon = document.createElement('span');
  icon.className = 'notif-item-icon';
  icon.innerHTML = '<i class="bi ' + notifIconFor(item.type) + '"></i>';

  const body = document.createElement('span');
  body.className = 'notif-item-body';
  const title = document.createElement('span');
  title.className = 'notif-item-title';
  title.textContent = item.title || 'Notificación';
  const message = document.createElement('span');
  message.className = 'notif-item-msg';
  message.textContent = item.message || '';
  const time = document.createElement('span');
  time.className = 'notif-item-time';
  time.textContent = notifTimeAgo(item.created_at);
  body.append(title, message, time);

  const dot = document.createElement('span');
  dot.className = 'notif-dot';

  el.append(icon, body, dot);
  el.addEventListener('click', () => handleNotifClick(item));
  return el;
}

function renderNotifications(unread) {
  const badge = document.getElementById('notif-badge');
  const label = document.getElementById('notif-unread-label');
  const list = document.getElementById('notif-list');
  if (!badge || !list) return;

  if (unread > 0) {
    badge.hidden = false;
    badge.textContent = unread > 9 ? '9+' : String(unread);
  } else {
    badge.hidden = true;
    badge.textContent = '0';
  }
  if (label) label.textContent = unread > 0 ? unread + ' sin leer' : 'Todo al día';
  const mark = document.getElementById('notif-mark-all');
  if (mark) mark.disabled = notifMutation || unread === 0;
  const clear = document.getElementById('notif-clear');
  if (clear) clear.disabled = notifMutation || (!notifItems.length && unread === 0);
  document.getElementById('notif-bell')?.setAttribute('aria-label', unread > 0 ? 'Notificaciones: ' + unread + ' sin leer' : 'Notificaciones');

  const scrollTop = list.scrollTop;
  const focusedId = list.contains(document.activeElement) ? document.activeElement.dataset.notificationId : null;
  list.innerHTML = '';
  if (!notifItems.length) {
    const empty = document.createElement('div');
    empty.className = 'notif-empty';
    empty.innerHTML = '<i class="bi bi-bell-slash"></i><span>No tenés notificaciones por ahora.</span>';
    list.appendChild(empty);
    return;
  }
  notifItems.forEach(item => list.appendChild(notifItemEl(item)));
  list.scrollTop = scrollTop;
  if (focusedId) [...list.children].find(el => el.dataset.notificationId === focusedId)?.focus({ preventScroll: true });
}

function notifStatus(message, retry = false) {
  const status = document.getElementById('notif-status');
  if (!status) return;
  status.replaceChildren();
  status.hidden = !message;
  const text = document.createElement('span');
  text.textContent = message;
  status.append(text);
  if (retry) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = 'Reintentar';
    button.addEventListener('click', loadNotifications);
    status.append(button);
  }
}

async function loadNotifications() {
  if (!getToken() || notifLoading || notifMutation) return;
  const revision = notifRevision;
  const userId = getCurrentSession()?.id;
  notifLoading = true;
  if (!notifLoaded) notifStatus('Cargando notificaciones…');
  try {
    const res = await apiFetch('/api/notificaciones', { signal: AbortSignal.timeout(15000) });
    if (revision !== notifRevision || userId !== getCurrentSession()?.id) return;
    if (res.status !== 200 || !Array.isArray(res.body?.data)) throw new Error('load');
    notifItems = res.body.data;
    notifUnread = Math.max(0, Number(res.body.unread) || 0);
    notifLoaded = true;
    notifStatus('');
    renderNotifications(notifUnread);
  } catch {
    if (revision === notifRevision) notifStatus('No pudimos actualizar los avisos. Revisá tu conexión.', true);
  } finally {
    notifLoading = false;
  }
}

function safeNotifLink(value) {
  if (!value) return '';
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin && /^https?:$/.test(url.protocol) ? url.href : '';
  } catch { return ''; }
}

async function handleNotifClick(item) {
  if (notifMutation) return;
  if (!item.is_read) {
    notifMutation = true; notifRevision++;
    renderNotifications(notifUnread);
    try {
      const res = await apiFetch('/api/notificaciones/' + item.id + '/read', { method: 'POST', body: '{}', signal: AbortSignal.timeout(15000) });
      if (res.status !== 200) throw new Error('read');
      item.is_read = true;
      notifUnread = Math.max(0, notifUnread - 1);
      notifStatus('');
    } catch {
      notifStatus('No pudimos marcar el aviso como leído. Intentá nuevamente.');
      return;
    } finally {
      notifMutation = false;
      renderNotifications(notifUnread);
    }
  }
  const link = safeNotifLink(item.link);
  if (link) window.location.href = link;
}

async function markAllNotificationsRead() {
  if (notifMutation || !notifUnread) return;
  notifMutation = true; notifRevision++;
  renderNotifications(notifUnread);
  try {
    const res = await apiFetch('/api/notificaciones/read-all', { method: 'POST', body: '{}', signal: AbortSignal.timeout(15000) });
    if (res.status !== 200) throw new Error('read');
    notifItems.forEach(item => { item.is_read = true; });
    notifUnread = 0;
    notifStatus('');
  } catch {
    notifStatus('No pudimos marcar los avisos como leídos. Intentá nuevamente.');
  } finally {
    notifMutation = false;
    renderNotifications(notifUnread);
  }
}

async function clearNotifications() {
  if (notifMutation || (!notifItems.length && !notifUnread)) return;
  if (!confirm('¿Limpiar todas tus notificaciones, incluidas las no leídas? Se quitarán de la lista.')) return;
  notifMutation = true; notifRevision++;
  renderNotifications(notifUnread);
  try {
    const res = await apiFetch('/api/notificaciones', { method: 'DELETE', signal: AbortSignal.timeout(15000) });
    if (res.status !== 200) throw new Error('clear');
    notifItems = []; notifUnread = 0;
    notifStatus('');
    showToast('Notificaciones limpiadas.', 'success');
  } catch {
    notifStatus('No pudimos limpiar las notificaciones. Intentá nuevamente.');
  } finally {
    notifMutation = false;
    renderNotifications(notifUnread);
  }
}

/* ---------- AVISOS PUSH EN EL DISPOSITIVO ---------- */
let pushSubscribed = false;
let pushBusy = false;

function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function isIosNonStandalone() {
  const ua = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!ios) return false;
  const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    navigator.standalone === true;
  return !standalone;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

function sameApplicationServerKey(current, publicKey) {
  try {
    const a = new Uint8Array(current);
    const b = urlBase64ToUint8Array(publicKey);
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function swReady(timeoutMs) {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => setTimeout(() => reject(new Error('service worker timeout')), timeoutMs || 6000))
  ]);
}

function updatePushUI() {
  const row = document.getElementById('notif-push-row');
  const text = document.getElementById('notif-push-text');
  const btn = document.getElementById('notif-push-btn');
  const test = document.getElementById('notif-push-test');
  if (!row || !text || !btn || !test) return;

  row.classList.toggle('is-active', pushSubscribed);
  test.hidden = !pushSubscribed;
  test.disabled = pushBusy;
  btn.disabled = pushBusy;

  if (!pushSupported()) {
    text.textContent = 'Este navegador no admite avisos push.';
    btn.hidden = true;
    test.hidden = true;
    return;
  }
  if (isIosNonStandalone()) {
    text.textContent = 'En iPhone/iPad, agregá la app a la pantalla de inicio para recibir avisos.';
    btn.hidden = true;
    test.hidden = true;
    return;
  }
  if (Notification.permission === 'denied') {
    text.textContent = 'Bloqueaste los avisos. Habilitalos desde los ajustes del navegador.';
    btn.hidden = true;
    test.hidden = true;
    return;
  }
  btn.hidden = false;
  if (pushSubscribed) {
    text.textContent = 'Avisos activados en este dispositivo.';
    btn.textContent = 'Desactivar';
  } else {
    text.textContent = 'Recibí los avisos también en tu celular.';
    btn.textContent = 'Activar';
  }
}

async function refreshPushState() {
  if (!pushSupported()) {
    updatePushUI();
    return;
  }
  try {
    const reg = await swReady();
    const sub = await reg.pushManager.getSubscription();
    if (!sub) {
      pushSubscribed = false;
      updatePushUI();
      return;
    }
    const keyRes = await apiFetch('/api/push/public-key');
    const publicKey = keyRes.status === 200 && keyRes.body ? keyRes.body.publicKey : '';
    const current = sub.options && sub.options.applicationServerKey;
    if (publicKey && current && !sameApplicationServerKey(current, publicKey)) {
      await sub.unsubscribe();
      pushSubscribed = false;
      updatePushUI();
      return;
    }
    const saved = await apiFetch('/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ subscription: sub.toJSON() })
    });
    if (saved.status !== 201) throw new Error('No se pudo confirmar la suscripción');
    pushSubscribed = true;
    updatePushUI();
  } catch {
    pushSubscribed = false;
    updatePushUI();
  }
}

async function togglePushNotifications() {
  if (pushBusy || !pushSupported()) {
    updatePushUI();
    return;
  }
  pushBusy = true;
  updatePushUI();

  let permission = Notification.permission;
  if (!pushSubscribed && permission === 'default') {
    try {
      permission = await Notification.requestPermission();
    } catch {
      permission = 'denied';
    }
  }

  try {
    const reg = await swReady();

    if (pushSubscribed) {
      const sub = await reg.pushManager.getSubscription();
      const endpoint = sub ? sub.endpoint : '';
      if (sub) await sub.unsubscribe();
      pushSubscribed = false;
      if (endpoint) {
        await apiFetch('/api/push/unsubscribe', {
          method: 'POST',
          body: JSON.stringify({ endpoint })
        }).catch(() => {});
      }
      showToast('Avisos desactivados en este dispositivo.', 'info');
      return;
    }

    if (permission !== 'granted') {
      showToast('No se concedió permiso para mostrar avisos.', 'error');
      return;
    }

    const keyRes = await apiFetch('/api/push/public-key');
    if (keyRes.status !== 200 || !keyRes.body || !keyRes.body.publicKey) {
      throw new Error('No se pudo obtener la clave de avisos.');
    }

    let sub = await reg.pushManager.getSubscription();
    const current = sub && sub.options && sub.options.applicationServerKey;
    if (sub && current && !sameApplicationServerKey(current, keyRes.body.publicKey)) {
      await sub.unsubscribe();
      sub = null;
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyRes.body.publicKey)
      });
    }

    const saved = await apiFetch('/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ subscription: sub.toJSON() })
    });
    if (saved.status >= 400) throw new Error('No se pudo guardar la suscripción.');

    pushSubscribed = true;
    showToast('Avisos activados en este dispositivo.', 'success');
  } catch (err) {
    showToast(err && err.message ? err.message : 'No se pudieron actualizar los avisos.', 'error');
  } finally {
    pushBusy = false;
    updatePushUI();
  }
}

async function sendPushTest() {
  if (pushBusy) return;
  pushBusy = true; updatePushUI();
  try {
    const res = await apiFetch('/api/push/test', { method: 'POST', body: '{}' });
    if (res.status === 200) showToast('Aviso de prueba enviado.', 'success');
    else showToast(res.body && res.body.error ? res.body.error : 'No se pudo enviar el aviso de prueba.', 'error');
  } catch {
    showToast('No se pudo enviar el aviso de prueba.', 'error');
  } finally { pushBusy = false; updatePushUI(); }
}

function positionNotifPanel() {
  const panel = document.getElementById('notif-panel');
  const bell = document.getElementById('notif-bell');
  if (!panel || !bell || panel.hidden) return;
  const rect = bell.getBoundingClientRect();
  const width = Math.min(420, window.innerWidth - 24);
  const top = Math.max(12, Math.min(rect.bottom + 10, window.innerHeight - 240));
  panel.style.width = width + 'px';
  panel.style.left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)) + 'px';
  panel.style.top = top + 'px';
  panel.style.maxHeight = Math.min(620, Math.max(120, window.innerHeight - top - 12)) + 'px';
}

function setNotifPanel(open) {
  const panel = document.getElementById('notif-panel');
  const bell = document.getElementById('notif-bell');
  const center = document.getElementById('notif-center');
  if (!panel || !bell) return;
  notifPanelOpen = open;
  panel.hidden = !open;
  bell.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (center) center.classList.toggle('open', open);
  if (open) {
    positionNotifPanel();
    document.getElementById('notif-close')?.focus();
    loadNotifications();
  } else if (panel.contains(document.activeElement)) bell.focus();
}

function initNotificationCenter() {
  if (document.getElementById('notif-center')) return;
  if (!getCurrentSession() || !getToken()) return;
  const actions = document.querySelector('.top-navbar-actions');
  if (!actions) return;

  const center = document.createElement('div');
  center.className = 'notif-center';
  center.id = 'notif-center';
  center.innerHTML = `
    <button class="notif-bell" id="notif-bell" type="button" aria-label="Notificaciones" aria-controls="notif-panel" aria-expanded="false">
      <i class="bi bi-bell"></i>
      <span class="notif-badge" id="notif-badge" hidden>0</span>
    </button>
    <section class="notif-panel" id="notif-panel" role="region" aria-labelledby="notif-title" hidden>
      <div class="notif-panel-head">
        <div class="notif-panel-heading">
          <span class="notif-panel-title" id="notif-title">Notificaciones</span>
          <span class="notif-panel-subtitle" id="notif-unread-label">Sin novedades</span>
        </div>
        <div class="notif-head-actions"><button class="notif-mark-all" id="notif-mark-all" type="button" disabled>Marcar leídas</button><button class="notif-close" id="notif-close" type="button" aria-label="Cerrar notificaciones"><i class="bi bi-x-lg" aria-hidden="true"></i></button></div>
      </div>
      <div class="notif-status" id="notif-status" role="status" hidden></div><div class="notif-list" id="notif-list" tabindex="0" aria-label="Lista de notificaciones"></div>
      <div class="notif-push-row" id="notif-push-row">
        <div class="notif-push-info">
          <i class="bi bi-phone"></i>
          <span id="notif-push-text">Recibí los avisos también en tu celular.</span>
        </div>
        <div class="notif-push-actions">
          <button class="notif-push-btn" id="notif-push-btn" type="button">Activar</button>
          <button class="notif-push-test" id="notif-push-test" type="button" hidden>Probar</button>
        </div>
      </div>
      <div class="notif-panel-foot">
        <button id="notif-clear" class="notif-clear" type="button" disabled><i class="bi bi-trash3" aria-hidden="true"></i> Limpiar notificaciones</button>
        <a href="calendario.html"><i class="bi bi-calendar3"></i> Ir al calendario</a>
      </div>
    </section>`;
  actions.prepend(center);
  document.body.appendChild(document.getElementById('notif-panel'));
  document.getElementById('notif-close').addEventListener('click', () => setNotifPanel(false));
  window.addEventListener('resize', positionNotifPanel);
  window.addEventListener('scroll', positionNotifPanel, { passive: true });
  actions.classList.add('has-notif');

  document.getElementById('notif-bell').addEventListener('click', (e) => {
    e.stopPropagation();
    setNotifPanel(!notifPanelOpen);
  });
  document.getElementById('notif-clear').addEventListener('click', clearNotifications);
  document.getElementById('notif-mark-all').addEventListener('click', (e) => {
    e.stopPropagation();
    markAllNotificationsRead();
  });
  document.getElementById('notif-push-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    togglePushNotifications();
  });
  document.getElementById('notif-push-test').addEventListener('click', (e) => {
    e.stopPropagation();
    sendPushTest();
  });
  document.addEventListener('click', (e) => {
    if (!notifPanelOpen) return;
    const el = document.getElementById('notif-center');
    if (el && !el.contains(e.target) && !document.getElementById('notif-panel')?.contains(e.target)) setNotifPanel(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && notifPanelOpen) setNotifPanel(false);
  });

  loadNotifications();
  updatePushUI();
  refreshPushState();
  if (!window._notifPollTimer) {
    window._notifPollTimer = setInterval(() => {
      if (!document.hidden) loadNotifications();
    }, 60000);
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) loadNotifications();
  });
}

document.addEventListener('DOMContentLoaded', initNotificationCenter);

function showToast(mensaje, tipo) {
  tipo = tipo || 'info';
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
  const color = tipo === 'success' ? '#16a34a' : (tipo === 'error' ? '#dc2626' : '#0f172a');
  toast.style.cssText = 'background:' + color + ';color:#fff;padding:10px 16px;border-radius:8px;font-size:0.85rem;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,0.2);max-width:320px;';
  toast.innerText = mensaje;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2600);
}

function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if (!email || !password) {
    alert('Completá todos los campos.');
    return;
  }

  fetch(API_BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
    .then(res => res.json().then(data => ({ status: res.status, body: data })))
    .then(({ status, body }) => {
      if (status !== 200) {
        alert(body.error || 'Error al iniciar sesión.');
        return;
      }
      setSession(body.token, body.user, body.refreshToken);
      window.location.href = 'dashboard.html';
    })
    .catch(() => alert('Error de conexión con el servidor.'));
}

function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const activationCode = document.getElementById('reg-code').value.trim();

  if (!name || !email || !password || !activationCode) {
    alert('Completá todos los campos.');
    return;
  }

  if (!/^[0-9]{6}$/.test(activationCode)) {
    alert('El código de activación debe tener exactamente 6 dígitos numéricos.');
    return;
  }

  fetch(API_BASE + '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password, activationCode })
  })
    .then(res => res.json().then(data => ({ status: res.status, body: data })))
    .then(({ status, body }) => {
      if (status !== 201) {
        alert(body.error || 'Error al registrarse.');
        return;
      }
      setSession(body.token, body.user, body.refreshToken);
      alert('Cuenta creada exitosamente.');
      window.location.href = 'dashboard.html';
    })
    .catch(() => alert('Error de conexión con el servidor.'));
}

async function logout() {
  if (!confirm('¿Cerrar sesión?')) return;
  try {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      const reg = await swReady(1500);
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await apiFetch('/api/push/unsubscribe', {
          method: 'POST',
          body: JSON.stringify({ endpoint: sub.endpoint })
        }).catch(() => {});
        await sub.unsubscribe();
      }
    }
  } catch {
    /* el cierre de sesión no depende de los avisos push */
  }
  clearSession();
  window.location.href = 'index.html';
}

let currentRole = '';
let chartsInstances = {};
let marketingData = [];
let gruposData = [];
let zonasData = [];
let historialData = [];
let filterPeriod = 'all';
let filterPeriodZonas = 'all';
let pageActual = 1;
const PAGE_SIZE = 10;

function isEstatusActivo(estatus) {
  return estatus === 'PUBLICADA' || estatus === 'SIN DEFINIR' || !estatus;
}

// Una zona es activa por defecto; solo se la considera inactiva si figura
// explícitamente en la lista de zonas con activo=false.
function zonaActiva(nombre) {
  if (!nombre) return true;
  const n = normFilterVal(nombre);
  const z = (zonasData || []).find(x => normFilterVal(x.nombre) === n);
  if (!z) return true;
  return z.activo !== false;
}

function canEditZonas() {
  return hasPermission('edit_zonas');
}

function switchView(viewName) {
  if (viewName === 'users' && currentRole !== 'admin') {
    alert('Acceso denegado: Solo los administradores pueden gestionar usuarios.');
    return;
  }
  document.getElementById('btn-nav-dashboard').classList.toggle('active', viewName === 'dashboard');
  document.getElementById('btn-nav-users').classList.toggle('active', viewName === 'users');
  document.getElementById('btn-nav-zonas').classList.toggle('active', viewName === 'zonas');
  document.getElementById('view-dashboard').classList.toggle('d-none', viewName !== 'dashboard');
  document.getElementById('view-users').classList.toggle('d-none', viewName !== 'users');
  document.getElementById('view-zonas').classList.toggle('d-none', viewName !== 'zonas');
  const title = document.getElementById('current-page-title');
  const subtitle = document.getElementById('current-page-subtitle');
  if (viewName === 'dashboard') {
    title.innerText = 'Dashboard Publicaciones';
    subtitle.innerText = 'Rendimiento en tiempo real de cuentas de Facebook';
  } else if (viewName === 'zonas') {
    title.innerText = 'Dashboard Zonas';
    subtitle.innerText = 'Métricas agrupadas por zona geográfica';
    loadZonas();
    renderZonasDashboard();
    } else {
      title.innerText = 'Gestión de Usuarios y Códigos';
      subtitle.innerText = 'Administra los permisos y códigos de activación de tu equipo';
      loadUsers();
      loadCodes();
      loadZonas();
      loadRolesTable();
    }
}

let _appLastMarketingSnapshot = '';
function loadMarketingData(silent) {
  const tbody = document.getElementById('marketing-table-body');
  if (!silent) tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Cargando...</td></tr>';

  authFetch(API_BASE + '/api/marketing')
    .then(r => r.text().then(text => ({ status: r.status, text })))
    .then(({ status, text }) => {
      let body;
      try { body = JSON.parse(text); } catch { body = { error: text.substring(0, 200) }; }

      if (status !== 200) {
        if (silent) return;
        const msg = body.error || 'Error ' + status;
        document.getElementById('data-source-badge').innerHTML = '<i class="bi bi-exclamation-triangle text-danger"></i> ' + escHtml(msg);
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">' + escHtml(msg) + '</td></tr>';
        return;
      }
      const newData = body.data || [];
      const snap = JSON.stringify(newData);
      document.getElementById('data-source-badge').innerHTML = body.stale
        ? '<i class="bi bi-exclamation-triangle text-warning"></i> Datos guardados · no se pudo actualizar Google Sheets'
        : '<i class="bi bi-database"></i> Google Sheets';
      if (silent && snap === _appLastMarketingSnapshot) return;
      _appLastMarketingSnapshot = snap;
      marketingData = newData;
      if (!silent) document.getElementById('filter-fecha').value = '';
      populateFilterDropdowns();
    })
    .catch((err) => {
      if (!silent) tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Error de red: ' + escHtml(err.message || 'desconocido') + '</td></tr>';
    });
}

function refreshMarketingData() {
  authFetch(API_BASE + '/api/marketing/refresh')
    .then(() => loadMarketingData()).catch(() => loadMarketingData());
}

function saludDiv(rows) {
  if (!rows.length) return '<span class="health-dot health-dot-medio"></span>';
  const total = rows.length;
  const malas = rows.filter(r => ['ELIMINADA', 'SUPRIMIDA', 'EN REVISION'].includes(r.estatus)).length;
  const ratio = malas / total;
  let cls;
  if (ratio >= 0.5) cls = 'health-dot-malo';
  else if (ratio >= 0.25) cls = 'health-dot-medio';
  else cls = 'health-dot-bueno';
  return '<span class="health-dot ' + cls + '" title="' + malas + ' filas con problemas de ' + total + '"></span>';
}

function saludZonaClass(rows) {
  if (!rows.length) return 'zone-health-medio';
  const total = rows.length;
  const malas = rows.filter(r => ['ELIMINADA', 'SUPRIMIDA', 'EN REVISION'].includes(r.estatus)).length;
  const ratio = malas / total;
  if (ratio >= 0.5) return 'zone-health-malo';
  if (ratio >= 0.25) return 'zone-health-medio';
  return 'zone-health-bueno';
}

function tendenciaKpiHtml(rows, key) {
  const valid = rows.filter(r => r[key] !== undefined && r[key] !== null);
  if (valid.length < 4) return '';
  const sorted = [...valid].sort((a, b) => {
    const da = parseDate(a.fecha), db = parseDate(b.fecha);
    if (!da || !db) return 0;
    return da - db;
  });
  const mid = Math.floor(sorted.length / 2);
  const prev = sorted.slice(0, mid);
  const recent = sorted.slice(mid);
  const p = prev.reduce((s, r) => s + (r[key] || 0), 0);
  const n = recent.reduce((s, r) => s + (r[key] || 0), 0);
  if (p === 0 && n === 0) return '';
  if (p === 0) return '<span class="kpi-trend trend-up">nuevo</span>';
  const diff = ((n - p) / p) * 100;
  const rounded = Math.round(diff);
  if (Math.abs(diff) < 0.5) return '<span class="kpi-trend">estable</span>';
  const icono = rounded > 0 ? '↗' : '↘';
  const cls = rounded > 0 ? 'trend-up' : 'trend-down';
  return '<span class="kpi-trend ' + cls + '">' + icono + ' ' + Math.abs(rounded) + '%</span>';
}


function renderDashboard(data, chartData, periodLimit) {
  data = data || marketingData;
  chartData = chartData || data;

  // Ordenar: más reciente primero
  data = [...data].sort((a, b) => {
    const da = parseDate(a.fecha), db = parseDate(b.fecha);
    if (!da || !db) return 0;
    return db - da;
  });

  const kpiData = data.filter(r => r.grupo !== 'Perfil Estandar' && isEstatusActivo(r.estatus) && zonaActiva(r.zona));
  const grupos = [...new Set(kpiData.map(r => r.grupo).filter(Boolean))];
  const totalPubs = kpiData.reduce((s, r) => s + r.publicaciones, 0);
  const totalVis = kpiData.reduce((s, r) => s + r.visualizaciones, 0);
  const totalInt = kpiData.reduce((s, r) => s + r.interacciones, 0);
  const totalMsj = kpiData.reduce((s, r) => s + r.mensajes, 0);
  const numberFormat = new Intl.NumberFormat('es-AR');
  document.getElementById('kpi-grupos').innerText = numberFormat.format(grupos.length);
  document.getElementById('kpi-publicaciones').innerText = numberFormat.format(totalPubs);
  document.getElementById('kpi-visualizaciones').innerText = numberFormat.format(totalVis);
  document.getElementById('kpi-interacciones').innerText = numberFormat.format(totalInt);
  document.getElementById('kpi-mensajes').innerText = numberFormat.format(totalMsj);

  const trendEls = {
    'trend-publicaciones': 'publicaciones',
    'trend-visualizaciones': 'visualizaciones',
    'trend-interacciones': 'interacciones',
    'trend-mensajes': 'mensajes'
  };
  Object.keys(trendEls).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = tendenciaKpiHtml(kpiData, trendEls[id]);
  });

  // KPIs por zona
  const zonas = [...new Set(kpiData.map(r => r.zona).filter(Boolean))].sort();
  const zoneContainer = document.getElementById('zone-kpis-container');
  if (zoneContainer) {
    if (!zonas.length) { zoneContainer.innerHTML = ''; } else {
      zoneContainer.innerHTML = zonas.map(z => {
        const rows = kpiData.filter(r => r.zona === z);
        const zp = rows.reduce((s, r) => s + r.publicaciones, 0);
        const zv = rows.reduce((s, r) => s + r.visualizaciones, 0);
        const zi = rows.reduce((s, r) => s + r.interacciones, 0);
        const zm = rows.reduce((s, r) => s + r.mensajes, 0);
        return `<div class="col-6 col-md-4 col-lg">
          <div class="zone-kpi-card zone-health-${saludZonaClass(rows).split('-')[2]}">
            <div class="zone-kpi-name">${saludDiv(rows)}${escHtml(z)}</div>
            <div class="zone-kpi-stats">
              <span title="Pubs"><i class="bi bi-file-text"></i> ${zp}</span>
              <span title="Vis"><i class="bi bi-eye"></i> ${zv}</span>
              <span title="Int"><i class="bi bi-hand-thumbs-up"></i> ${zi}</span>
              <span title="Msj"><i class="bi bi-chat-dots"></i> ${zm}</span>
            </div>
          </div>
        </div>`;
      }).join('');
    }
  }

  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  if (pageActual > totalPages) pageActual = totalPages;
  const start = (pageActual - 1) * PAGE_SIZE;
  const pageData = data.slice(start, start + PAGE_SIZE);

  const pagInfo = document.getElementById('pag-info');
  if (pagInfo) pagInfo.innerText = totalPages > 1 ? `Página ${pageActual} de ${totalPages} (${data.length} registros)` : `${data.length} registros`;

  const tbody = document.getElementById('marketing-table-body');
  tbody.innerHTML = '';
  pageData.forEach(row => {
    let zClass = (row.zona || '').toLowerCase().replace(/ /g, '-');
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.dataset.row = JSON.stringify(row);
    tr.addEventListener('click', function() {
      openDetailModal(JSON.parse(this.dataset.row));
    });
    tr.innerHTML = `
        <td class="fw-medium text-dark">${escHtml(row.fecha || '')}</td>
        <td><button type="button" class="table-detail-link" title="Ver detalle de la publicación">${escHtml(row.grupo || 'Ver detalle')}</button></td>
        <td class="text-center">${row.publicaciones}</td>
        <td class="text-center fw-medium">${row.visualizaciones}</td>
        <td class="text-center text-success fw-medium">${row.interacciones}</td>
        <td class="text-center">${row.comentarios}</td>
        <td class="text-center text-indigo fw-medium">${row.mensajes}</td>
        <td><span class="badge-zone zone-${escHtml(zClass)}">${escHtml(row.zona || '')}</span></td>
        <td class="text-center"><span class="badge-estatus est-${escHtml((row.estatus||'SIN DEFINIR').toLowerCase().replace(/ /g,'-'))}">${escHtml(row.estatus || 'SIN DEFINIR')}</span></td>`;
    tbody.appendChild(tr);
  });

  const pagContainer = document.getElementById('pagination-controls');
  if (pagContainer) {
    let pagHtml = '';
    if (totalPages > 1) {
      pagHtml += `<li class="page-item ${pageActual <= 1 ? 'disabled' : ''}"><button class="pag-btn" data-page="${pageActual - 1}">&laquo;</button></li>`;
      for (let p = 1; p <= totalPages; p++) {
        if (p === 1 || p === totalPages || Math.abs(p - pageActual) <= 2) {
          pagHtml += `<li class="page-item ${p === pageActual ? 'active' : ''}"><button class="pag-btn" data-page="${p}">${p}</button></li>`;
        } else if (Math.abs(p - pageActual) === 3) {
          pagHtml += `<li class="page-item disabled"><span class="pag-dots">...</span></li>`;
        }
      }
      pagHtml += `<li class="page-item ${pageActual >= totalPages ? 'disabled' : ''}"><button class="pag-btn" data-page="${pageActual + 1}">&raquo;</button></li>`;
      pagHtml += `<li class="page-item ms-2"><input type="number" id="pag-goto" class="pag-input" min="1" max="${totalPages}" placeholder="#" title="Ir a página"><button class="pag-go-btn" id="pag-go" title="Ir"><i class="bi bi-arrow-right"></i></button></li>`;
    }
    pagContainer.innerHTML = pagHtml;
    if (!pagContainer._listener) {
      pagContainer._listener = true;
      pagContainer.addEventListener('click', function(e) {
        const btn = e.target.closest('.pag-btn');
        if (btn) { goToPage(parseInt(btn.dataset.page)); return; }
        const goBtn = e.target.closest('#pag-go');
        if (goBtn) {
          const input = document.getElementById('pag-goto');
          const p = parseInt(input.value);
          const max = parseInt(input.getAttribute('max'));
          if (p >= 1 && p <= max) goToPage(p);
        }
      });
      pagContainer.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          const input = e.target.closest('#pag-goto');
          if (input) {
            const p = parseInt(input.value);
            const max = parseInt(input.getAttribute('max'));
            if (p >= 1 && p <= max) goToPage(p);
          }
        }
      });
    }
  }

  initCharts(chartData, periodLimit);
}

function populateFilterDropdowns() {
  // Restaurar filtros guardados (si no se eligieron aún en esta sesión)
  if (!window._filtersRestored) {
    window._filtersRestored = true;
    restoreDashboardFilters();
  }

  let zonas = [...new Set(marketingData.map(r => r.zona).filter(Boolean))];
  zonasData.forEach(z => { if (z.nombre && !zonas.includes(z.nombre)) zonas.push(z.nombre); });
  zonas.sort();

  const selZona = document.getElementById('filter-zona');
  if (selZona) {
    const savedZona = localStorage.getItem('dashZona');
    const current = savedZona || selZona.value;
    selZona.innerHTML = '<option value="">Todas</option>';
    zonas.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v; opt.textContent = v;
      selZona.appendChild(opt);
    });
    if (current && [...selZona.options].some(o => o.value === current)) selZona.value = current;
  }

  refreshGruposByZona();

  const filterFecha = document.getElementById('filter-fecha');
  if (filterFecha) filterFecha.value = localStorage.getItem('dashFecha') || '';
}

function normFilterVal(v) { return String(v || '').trim().toLowerCase(); }

function refreshGruposByZona() {
  const zona = document.getElementById('filter-zona').value;
  const zonaNorm = normFilterVal(zona);
  const sel = document.getElementById('filter-grupo');
  if (!sel) return;
  let current = sel.value;
  if (!current) current = localStorage.getItem('dashGrupo') || '';

  let grupos;
  if (zonaNorm) {
    grupos = [...new Set(gruposData.filter(g => normFilterVal(g.zona) === zonaNorm).map(g => g.nombre).filter(Boolean))];
    grupos = [...new Set([...grupos, ...marketingData.filter(r => normFilterVal(r.zona) === zonaNorm && r.grupo !== 'Perfil Estandar').map(r => r.grupo).filter(Boolean)])];
  } else {
    grupos = [...new Set(gruposData.map(r => r.nombre).filter(Boolean))];
    grupos = [...new Set([...grupos, ...marketingData.filter(r => r.grupo !== 'Perfil Estandar').map(r => r.grupo).filter(Boolean)])];
  }

  // Eliminar duplicados que solo difieren en mayúsculas/espacios
  const seen = new Set();
  grupos = grupos.filter(v => {
    const k = normFilterVal(v);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  sel.innerHTML = '<option value="">Todos</option>';
  grupos.sort().forEach(v => {
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = v;
    sel.appendChild(opt);
  });
  if ([...sel.options].some(o => o.value === current)) sel.value = current;

  applyFilters();
}

function goToPage(p) {
  pageActual = Math.max(1, p);
  applyFilters(false);
}

function parseDate(str) {
  if (!str) return null;
  const parts = str.split('/');
  if (parts.length !== 3) return null;
  const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  return isNaN(d.getTime()) ? null : d;
}

function todayStr() {
  const d = new Date();
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}

function isoToDate(iso) {
  const p = iso.split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
}

function setPeriod(days) {
  filterPeriod = days;
  localStorage.setItem('dashPeriod', days);
  document.querySelectorAll('.filter-period').forEach(b => {
    b.classList.toggle('active', b.dataset.period === days);
  });
  applyFilters();
}

function saveDashboardFilters() {
  localStorage.setItem('dashGrupo', document.getElementById('filter-grupo').value);
  localStorage.setItem('dashZona', document.getElementById('filter-zona').value);
  localStorage.setItem('dashFecha', document.getElementById('filter-fecha').value);
  const searchEl = document.getElementById('filter-search');
  if (searchEl) localStorage.setItem('dashSearch', searchEl.value);
}

function restoreDashboardFilters() {
  const savedPeriod = localStorage.getItem('dashPeriod');
  if (['7', '15', '30'].includes(savedPeriod)) {
    filterPeriod = savedPeriod;
    document.querySelectorAll('.filter-period').forEach(b => {
      b.classList.toggle('active', b.dataset.period === savedPeriod);
    });
  }
  const savedGrupo = localStorage.getItem('dashGrupo');
  const savedZona = localStorage.getItem('dashZona');
  const savedFecha = localStorage.getItem('dashFecha');
  const savedSearch = localStorage.getItem('dashSearch');
  if (savedGrupo) document.getElementById('filter-grupo').value = savedGrupo;
  if (savedZona) document.getElementById('filter-zona').value = savedZona;
  if (savedFecha) document.getElementById('filter-fecha').value = savedFecha;
  const searchEl = document.getElementById('filter-search');
  if (searchEl && savedSearch) searchEl.value = savedSearch;
}

function setPeriodZonas(days) {
  filterPeriodZonas = days;
  localStorage.setItem('dashPeriodZonas', days);
  document.querySelectorAll('.filter-period-zonas').forEach(b => {
    b.classList.toggle('active', b.dataset.period === days);
  });
  renderZonasDashboard();
}

function restoreZonasPeriod() {
  const saved = localStorage.getItem('dashPeriodZonas');
  if (['7', '15', '30'].includes(saved)) {
    filterPeriodZonas = saved;
    document.querySelectorAll('.filter-period-zonas').forEach(b => {
      b.classList.toggle('active', b.dataset.period === saved);
    });
  }
}

function buildPeriodLimit() {
  const DEFAULT_PERIOD_DAYS = 60;
  const days = (!filterPeriod || filterPeriod === 'all') ? DEFAULT_PERIOD_DAYS : parseInt(filterPeriod);
  const now = new Date();
  const limit = new Date(now);
  limit.setDate(limit.getDate() - days);
  limit.setHours(0, 0, 0, 0);
  return limit;
}

function historialSetPeriodo(periodLimit) {
  const set = new Set();
  (historialData || []).forEach(h => {
    if (h && h.filaOrigen !== undefined && h.filaOrigen !== null) {
      const d = parseDate(h.fechaActualizacion);
      if (d && d >= periodLimit) set.add(String(h.filaOrigen));
    }
  });
  return set;
}

function applyFilters(resetPage) {
  if (resetPage !== false) pageActual = 1;
  const grupo = document.getElementById('filter-grupo').value;
  const zona = document.getElementById('filter-zona').value;
  const rawFecha = document.getElementById('filter-fecha').value;
  const fecha = rawFecha ? isoToDate(rawFecha) : '';
  const searchEl = document.getElementById('filter-search');
  const searchText = searchEl ? (searchEl.value || '').trim().toLowerCase() : '';

  const grupoNorm = normFilterVal(grupo);
  const zonaNorm = normFilterVal(zona);
  const hasSpecificFilter = grupoNorm || zonaNorm || fecha || searchText;

  // El cap de tiempo aplica solo a la vista general; al buscar algo
  // específico se muestran todos los resultados que matcheen.
  let periodLimit = buildPeriodLimit();
  if (hasSpecificFilter) periodLimit = null;

  let filtered = marketingData;
  if (grupoNorm) filtered = filtered.filter(r => normFilterVal(r.grupo) === grupoNorm);
  if (zonaNorm) filtered = filtered.filter(r => normFilterVal(r.zona) === zonaNorm);
  if (fecha) filtered = filtered.filter(r => r.fecha === fecha);
  if (searchText) {
    filtered = filtered.filter(r => {
      return (r.grupo || '').toLowerCase().includes(searchText) ||
             (r.zona || '').toLowerCase().includes(searchText) ||
             (r.estatus || '').toLowerCase().includes(searchText);
    });
  }
  if (periodLimit) {
    const actualizados = historialSetPeriodo(periodLimit);
    filtered = filtered.filter(r => {
      const d = parseDate(r.fecha);
      if (d && d >= periodLimit) return true;
      return actualizados.has(String(r.rowIndex));
    });
  }

  // chartData = todas las filas (sin filtro de periodo) para que initCharts
  // pueda matchear historial por fechaActualizacion
  let chartBase = marketingData.filter(r => r.grupo !== 'Perfil Estandar' && isEstatusActivo(r.estatus) && zonaActiva(r.zona));
  if (grupoNorm) chartBase = chartBase.filter(r => normFilterVal(r.grupo) === grupoNorm);
  if (zonaNorm) chartBase = chartBase.filter(r => normFilterVal(r.zona) === zonaNorm);
  if (fecha) chartBase = chartBase.filter(r => r.fecha === fecha);

  renderDashboard(filtered, chartBase, periodLimit);
  saveDashboardFilters();
  const countEl = document.getElementById('results-count');
  if (countEl) {
    const total = marketingData.length;
    const showing = filtered.length;
    countEl.innerText = showing === total ? total + ' resultados' : showing + ' de ' + total + ' resultados';
  }
}

function clearFilters() {
  document.getElementById('filter-grupo').value = '';
  document.getElementById('filter-zona').value = '';
  document.getElementById('filter-fecha').value = '';
  const searchEl = document.getElementById('filter-search');
  if (searchEl) searchEl.value = '';
  filterPeriod = 'all';
  localStorage.removeItem('dashPeriod');
  localStorage.setItem('dashGrupo', '');
  localStorage.setItem('dashZona', '');
  localStorage.setItem('dashFecha', '');
  localStorage.setItem('dashSearch', '');
  document.querySelectorAll('.filter-period').forEach(b => {
    b.classList.toggle('active', b.dataset.period === 'all');
  });
  refreshGruposByZona();
}

function fmtNum(n) {
  n = Number(n) || 0;
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function buildInformeTexto() {
  const DAYS = 30;
  const limit = new Date();
  limit.setDate(limit.getDate() - DAYS);
  limit.setHours(0, 0, 0, 0);

  const rows = (marketingData || []).filter(r => {
    const d = parseDate(r.fecha);
    return d && d >= limit;
  });
  if (!rows.length) return '';

  const activas = rows.filter(r => isEstatusActivo(r.estatus) && zonaActiva(r.zona));
  const sum = (arr, k) => arr.reduce((s, r) => s + (Number(r[k]) || 0), 0);

  const totalPubs = sum(activas, 'publicaciones');
  const totalVis = sum(activas, 'visualizaciones');
  const totalInt = sum(activas, 'interacciones');
  const totalCom = sum(activas, 'comentarios');
  const totalMsj = sum(activas, 'mensajes');
  const gruposCount = new Set(activas.map(r => normFilterVal(r.grupo)).filter(Boolean)).size;

  const groupRows = activas.filter(r => normFilterVal(r.grupo) !== 'marketplace' && r.zona && normFilterVal(r.zona) !== 'todos');
  const zonas = [...new Set(groupRows.map(r => r.zona))];
  const zonaStats = zonas.map(z => {
    const rz = groupRows.filter(r => r.zona === z);
    return {
      zona: z,
      pubs: sum(rz, 'publicaciones'),
      vis: sum(rz, 'visualizaciones'),
      int: sum(rz, 'interacciones'),
      com: sum(rz, 'comentarios'),
      msj: sum(rz, 'mensajes'),
      grupos: new Set(rz.map(r => normFilterVal(r.grupo)).filter(Boolean)).size
    };
  }).sort((a, b) => b.pubs - a.pubs);

  let msg = '';
  msg += 'En este período se gestionaron ' + fmtNum(totalPubs) + ' publicaciones a través de ' + fmtNum(gruposCount) + ' grupos activos, alcanzando un total de ' + fmtNum(totalVis) + ' visualizaciones, ' + fmtNum(totalInt) + ' interacciones, ' + fmtNum(totalCom) + ' comentarios y ' + fmtNum(totalMsj) + ' mensajes directos de potenciales clientes.\n\n';
  msg += 'Las publicaciones en los grupos, distribuidas por localidad, registraron el siguiente rendimiento:\n';
  zonaStats.forEach(z => {
    msg += '• ' + z.zona + ': ' + fmtNum(z.pubs) + ' publicaciones → ' + fmtNum(z.vis) + ' visualizaciones, ' + fmtNum(z.int) + ' interacciones, ' + fmtNum(z.com) + ' comentarios y ' + fmtNum(z.msj) + ' mensajes (distribuidas en ' + fmtNum(z.grupos) + ' grupos).\n';
  });
  return msg;
}

function copiarInforme() {
  const ta = document.getElementById('informe-texto');
  if (!ta || !ta.value) return;
  const done = () => {
    const btn = document.querySelector('#informeModal .btn-action-primary');
    if (btn) {
      const original = btn.innerHTML;
      btn.innerHTML = '<i class="bi bi-check2 me-1"></i> ¡Copiado!';
      setTimeout(() => { btn.innerHTML = original; }, 1600);
    }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(ta.value).then(done).catch(() => {
      ta.select();
      document.execCommand('copy');
      done();
    });
  } else {
    ta.select();
    document.execCommand('copy');
    done();
  }
}

function realizarInforme() {
  if (sessionRole() !== 'admin') return;
  if (!marketingData || !marketingData.length) {
    alert('Todavía no hay datos de publicaciones para generar el informe.');
    return;
  }
  const texto = buildInformeTexto();
  const ta = document.getElementById('informe-texto');
  if (!texto || !ta) return;
  ta.value = texto;
  const modalEl = document.getElementById('informeModal');
  if (modalEl && window.bootstrap) {
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
  }
}

function marketingFetch(method, body) {
  return authFetch(API_BASE + '/api/marketing', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  }).then(r => r.json());
}

function addMarketingRow(data, snapshot) {
  marketingFetch('POST', data).then(res => {
    if (res.error) return alert(res.error);
    if (snapshot && res.rowIndex) {
      snapshot.filaOrigen = res.rowIndex;
      postHistorial(snapshot);
    }
    loadMarketingData();
  });
}

function updateMarketingRow(rowIndex, data) {
  authFetch(API_BASE + '/api/marketing/' + rowIndex, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()).then(res => {
    if (res.error) return alert(res.error);
    loadMarketingData();
    showToast('Publicación actualizada', 'success');
  });
}

function postHistorial(snapshot) {
  authFetch(API_BASE + '/api/historial', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snapshot)
  }).then(r => r.json()).then(res => {
    if (res.error) return;
    loadHistorial();
  });
}

function deleteMarketingRow(rowIndex) {
  if (!confirm('¿Eliminar esta fila permanentemente?')) return;
  authFetch(API_BASE + '/api/marketing/' + rowIndex, {
    method: 'DELETE'
  }).then(r => r.json()).then(res => {
    if (res.error) return alert(res.error);
    loadMarketingData();
    showToast('Publicación eliminada', 'success');
  });
}

// --- Carga Múltiple ---
function openBulkModal() {
  document.getElementById('bulk-fecha').value = new Date().toISOString().split('T')[0];
  document.getElementById('bulk-pubs').value = 0;
  document.getElementById('bulk-vis').value = 0;
  document.getElementById('bulk-int').value = 0;
  document.getElementById('bulk-com').value = 0;
  document.getElementById('bulk-msj').value = 0;
  document.getElementById('bulk-estatus').value = 'SIN DEFINIR';

  let zonas = [...new Set(zonasData.map(r => r.nombre).filter(Boolean)), ...new Set(marketingData.map(r => r.zona).filter(Boolean))];
  zonas = [...new Set(zonas)];
  const selZona = document.getElementById('bulk-zona');
  selZona.innerHTML = '<option value="">Seleccionar...</option>';
  zonas.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = v;
    selZona.appendChild(opt);
  });

  filterGruposBulk();
  new bootstrap.Modal(document.getElementById('bulkModal')).show();
}

function filterGruposBulk() {
  const zona = document.getElementById('bulk-zona').value;
  const container = document.getElementById('bulk-grupos-container');
  const checked = [...container.querySelectorAll('input[type=checkbox]:checked')].map(cb => cb.value);

  let grupos;
  if (zona) {
    grupos = [...new Set(gruposData.filter(g => g.zona === zona && g.activo !== false).map(g => g.nombre).filter(Boolean))];
    grupos = [...new Set([...grupos, ...marketingData.filter(r => r.zona === zona && r.grupo !== 'Perfil Estandar').map(r => r.grupo).filter(Boolean)])];
  } else {
    grupos = [...new Set(gruposData.filter(g => g.activo !== false).map(r => r.nombre).filter(Boolean))];
    grupos = [...new Set([...grupos, ...marketingData.filter(r => r.grupo !== 'Perfil Estandar').map(r => r.grupo).filter(Boolean)])];
  }

  container.innerHTML = '';
  grupos.sort().forEach(v => {
    const label = document.createElement('label');
    label.className = 'bulk-grupo-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = v;
    if (checked.includes(v)) cb.checked = true;
    cb.addEventListener('change', updateBulkButtonText);
    label.appendChild(cb);
    label.appendChild(document.createTextNode(' ' + v));
    container.appendChild(label);
  });

  updateBulkButtonText();
  filterGruposBulkSearch();
}

function filterGruposBulkSearch() {
  const search = (document.getElementById('bulk-grupo-search').value || '').toLowerCase().trim();
  const items = document.querySelectorAll('#bulk-grupos-container .bulk-grupo-item');
  items.forEach(label => {
    const text = label.textContent.toLowerCase();
    label.style.display = !search || text.includes(search) ? '' : 'none';
  });
}

function updateBulkButtonText() {
  const container = document.getElementById('bulk-grupos-container');
  if (!container) return;
  const count = container.querySelectorAll('input[type=checkbox]:checked').length;
  const btn = document.querySelector('#bulkModal .btn-action-primary');
  if (btn) btn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Publicar en ' + count + ' grupo' + (count !== 1 ? 's' : '');
}

function saveBulkMarketing() {
  const rawFecha = document.getElementById('bulk-fecha').value.trim();
  const container = document.getElementById('bulk-grupos-container');
  const selected = [...container.querySelectorAll('input[type=checkbox]:checked')].map(cb => cb.value);

  if (!rawFecha) return alert('La fecha es obligatoria.');
  if (!selected.length) return alert('Seleccioná al menos un grupo.');

  const fecha = isoToDate(rawFecha);
  const zona = document.getElementById('bulk-zona').value;
  if (!zona) return alert('Seleccioná una zona.');

  const baseData = {
    fecha,
    publicaciones: parseInt(document.getElementById('bulk-pubs').value) || 0,
    visualizaciones: parseInt(document.getElementById('bulk-vis').value) || 0,
    interacciones: parseInt(document.getElementById('bulk-int').value) || 0,
    comentarios: parseInt(document.getElementById('bulk-com').value) || 0,
    mensajes: parseInt(document.getElementById('bulk-msj').value) || 0,
    zona,
    estatus: document.getElementById('bulk-estatus').value
  };

  const fechaActualizacion = todayStr();

  try { bootstrap.Modal.getInstance(document.getElementById('bulkModal')).hide(); } catch {}

  let completed = 0;
  const total = selected.length;
  let hasError = false;

  selected.forEach(grupo => {
    const data = { ...baseData, grupo };
    const snapshot = {
      fechaActualizacion,
      filaOrigen: 0,
      grupo,
      fechaPublicacion: fecha,
      zona,
      publicaciones: baseData.publicaciones,
      visualizaciones: baseData.visualizaciones,
      interacciones: baseData.interacciones,
      comentarios: baseData.comentarios,
      mensajes: baseData.mensajes
    };

    marketingFetch('POST', data).then(res => {
      if (res.error) {
        if (!hasError) { hasError = true; alert('Error en ' + grupo + ': ' + res.error); }
        return;
      }
      if (res.rowIndex) {
        snapshot.filaOrigen = res.rowIndex;
        postHistorial(snapshot);
      }
    }).finally(() => {
      completed++;
      if (completed === total) {
        loadMarketingData();
        showToast(hasError ? 'Carga con errores' : (total + ' publicaciones agregadas'), hasError ? 'error' : 'success');
      }
    });
  });
}

let _appLastGruposSnapshot = '';
function loadGrupos(silent) {
  authFetch(API_BASE + '/api/grupos')
    .then(r => r.json().then(b => ({ status: r.status, body: b })))
    .then(({ status, body }) => {
      if (status === 200) {
        const newData = body.data || [];
        const snap = JSON.stringify(newData);
        if (silent && snap === _appLastGruposSnapshot) return;
        _appLastGruposSnapshot = snap;
        gruposData = newData;
        refreshGruposByZona();
      }
    })
    .catch(() => {});
}

let _appLastZonasSnapshot = '';
function loadZonas(silent) {
  apiFetch('/api/zonas').then(({ status, body }) => {
    if (status === 200) {
      const newData = body.data || [];
      const snap = JSON.stringify(newData);
      if (silent && snap === _appLastZonasSnapshot) return;
      _appLastZonasSnapshot = snap;
      zonasData = newData;
      renderZonas();
      // Poblar select de filtro en vista zonas
      const sel = document.getElementById('filter-zona-zonas');
      if (sel) {
        const current = sel.value;
        sel.innerHTML = '<option value="">Todas</option>';
        zonasData.forEach(z => {
          const opt = document.createElement('option');
          opt.value = z.nombre; opt.textContent = z.nombre;
          sel.appendChild(opt);
        });
        sel.value = current;
      }
      if (document.getElementById('zonas-table-body')) renderZonasDashboard();
    }
  });
}

let _appLastHistorialSnapshot = '';
function loadHistorial(silent) {
  authFetch(API_BASE + '/api/historial')
    .then(r => r.json().then(b => ({ status: r.status, body: b })))
    .then(({ status, body }) => {
      if (status === 200) {
        const newData = body.data || [];
        const snap = JSON.stringify(newData);
        if (silent && snap === _appLastHistorialSnapshot) return;
        _appLastHistorialSnapshot = snap;
        historialData = newData;
      }
    })
    .catch(() => {});
}

function populateSelects() {
  let zonas = [...new Set(zonasData.map(r => r.nombre).filter(Boolean)), ...new Set(marketingData.map(r => r.zona).filter(Boolean))];
  zonas = [...new Set(zonas)]; // dedup
  let grupos = [...new Set(gruposData.filter(g => g.activo !== false).map(r => r.nombre).filter(Boolean))];
  if (grupos.length === 0) {
    grupos = [...new Set(marketingData.map(r => r.grupo).filter(Boolean))];
  }

  const selGrupo = document.getElementById('mk-grupo');
  const currentGrupo = selGrupo.value;
  selGrupo.innerHTML = '<option value="">Seleccionar...</option>';
  grupos.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    selGrupo.appendChild(opt);
  });
  const otro = document.createElement('option');
  otro.value = '__otro__';
  otro.textContent = 'Otro...';
  selGrupo.appendChild(otro);
  selGrupo.value = currentGrupo;

  const selZona = document.getElementById('mk-zona');
  const currentZona = selZona.value;
  selZona.innerHTML = '<option value="">Seleccionar...</option>';
  zonas.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    selZona.appendChild(opt);
  });
  const otroZ = document.createElement('option');
  otroZ.value = '__otro__';
  otroZ.textContent = 'Otro...';
  selZona.appendChild(otroZ);
  selZona.value = currentZona;

  toggleCustomInputs();
}

function filterGruposByZona() {
  const zona = document.getElementById('mk-zona').value;
  const sel = document.getElementById('mk-grupo');
  const current = sel.value;

  let grupos;
  if (zona && zona !== '__otro__') {
    grupos = [...new Set(gruposData.filter(g => g.zona === zona && g.activo !== false).map(g => g.nombre).filter(Boolean))];
    if (grupos.length === 0) {
      grupos = [...new Set(marketingData.filter(r => r.zona === zona).map(r => r.grupo).filter(Boolean))];
    }
  } else {
    grupos = [...new Set(gruposData.filter(g => g.activo !== false).map(r => r.nombre).filter(Boolean))];
    if (grupos.length === 0) {
      grupos = [...new Set(marketingData.map(r => r.grupo).filter(Boolean))];
    }
  }

  sel.innerHTML = '<option value="">Seleccionar...</option>';
  grupos.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = v;
    sel.appendChild(opt);
  });
  const otro = document.createElement('option');
  otro.value = '__otro__'; otro.textContent = 'Otro...';
  sel.appendChild(otro);
  if ([...sel.options].some(o => o.value === current)) sel.value = current;
  toggleCustomInputs();
}

function toggleCustomInputs() {
  ['mk-grupo', 'mk-zona'].forEach(id => {
    const sel = document.getElementById(id);
    const custom = document.getElementById(id + '-custom');
    if (sel.value === '__otro__') {
      custom.classList.remove('d-none');
    } else {
      custom.classList.add('d-none');
    }
  });
}

function openAddModal() {
  document.getElementById('mk-modal-title').innerHTML = '<i class="bi bi-plus-circle-fill me-2"></i>Agregar Publicación';
  document.getElementById('mk-row-index').value = '';
  const lastData = (() => { try { return JSON.parse(localStorage.getItem('mkLast') || 'null'); } catch { return null; } })();
  document.getElementById('mk-fecha').value = (lastData && lastData.fecha) || new Date().toISOString().split('T')[0];
  document.getElementById('mk-fecha').disabled = false;
  document.getElementById('mk-grupo').value = '';
  document.getElementById('mk-grupo-custom').value = '';
  document.getElementById('mk-grupo-custom').classList.add('d-none');
  document.getElementById('mk-pubs').value = (lastData && lastData.publicaciones) || 0;
  document.getElementById('mk-vis').value = (lastData && lastData.visualizaciones) || 0;
  document.getElementById('mk-int').value = (lastData && lastData.interacciones) || 0;
  document.getElementById('mk-com').value = (lastData && lastData.comentarios) || 0;
  document.getElementById('mk-msj').value = (lastData && lastData.mensajes) || 0;
  document.getElementById('mk-zona').value = '';
  document.getElementById('mk-zona-custom').value = '';
  document.getElementById('mk-zona-custom').classList.add('d-none');
  document.getElementById('mk-estatus').value = (lastData && lastData.estatus) || 'SIN DEFINIR';
  document.getElementById('mk-delete-btn').classList.add('d-none');
  populateSelects();
  new bootstrap.Modal(document.getElementById('mkModal')).show();
}

function openEditModal(rowData) {
  if (typeof rowData === 'string') rowData = JSON.parse(decodeURIComponent(rowData));
  const row = rowData;
  document.getElementById('mk-modal-title').innerHTML = '<i class="bi bi-pencil-fill me-2"></i>Editar Publicación';
  document.getElementById('mk-row-index').value = row.rowIndex;
  window._editOriginalFecha = row.fecha || '';
  const parts = (row.fecha || '').split('/');
  document.getElementById('mk-fecha').value = parts.length === 3 ? parts[2] + '-' + parts[1] + '-' + parts[0] : '';
  document.getElementById('mk-fecha').disabled = true;
  document.getElementById('mk-pubs').value = row.publicaciones;
  document.getElementById('mk-vis').value = row.visualizaciones;
  document.getElementById('mk-int').value = row.interacciones;
  document.getElementById('mk-com').value = row.comentarios;
  document.getElementById('mk-msj').value = row.mensajes;
  document.getElementById('mk-delete-btn').classList.remove('d-none');
  document.getElementById('mk-delete-btn').onclick = () => {
    bootstrap.Modal.getInstance(document.getElementById('mkModal')).hide();
    deleteMarketingRow(row.rowIndex);
  };
  populateSelects();
  if (row.grupo && ![...document.getElementById('mk-grupo').options].some(o => o.value === row.grupo)) {
    document.getElementById('mk-grupo').value = '__otro__';
    document.getElementById('mk-grupo-custom').value = row.grupo;
  } else {
    document.getElementById('mk-grupo').value = row.grupo || '';
  }
  if (row.zona && ![...document.getElementById('mk-zona').options].some(o => o.value === row.zona)) {
    document.getElementById('mk-zona').value = '__otro__';
    document.getElementById('mk-zona-custom').value = row.zona;
  } else {
    document.getElementById('mk-zona').value = row.zona || '';
  }
  filterGruposByZona();
  document.getElementById('mk-estatus').value = row.estatus || 'SIN DEFINIR';
  toggleCustomInputs();
  new bootstrap.Modal(document.getElementById('mkModal')).show();
}

function mkFieldValue(id) {
  const sel = document.getElementById(id);
  const custom = document.getElementById(id + '-custom');
  if (sel.value === '__otro__') return custom.value.trim();
  return sel.value;
}

function saveMarketingRow() {
  const rawFecha = document.getElementById('mk-fecha').value.trim();
  const rowIndex = document.getElementById('mk-row-index').value;

  const fecha = rowIndex ? (window._editOriginalFecha || '') : isoToDate(rawFecha);

  const data = {
    fecha,
    grupo: mkFieldValue('mk-grupo'),
    publicaciones: parseInt(document.getElementById('mk-pubs').value) || 0,
    visualizaciones: parseInt(document.getElementById('mk-vis').value) || 0,
    interacciones: parseInt(document.getElementById('mk-int').value) || 0,
    comentarios: parseInt(document.getElementById('mk-com').value) || 0,
    mensajes: parseInt(document.getElementById('mk-msj').value) || 0,
    zona: mkFieldValue('mk-zona'),
    estatus: document.getElementById('mk-estatus').value
  };
  if (!data.fecha || !data.grupo) return alert('Fecha y Grupo son obligatorios.');
  if (document.getElementById('mk-zona').value === '__otro__' && !data.zona) return alert('Escribí el nombre de la zona.');
  const isNewGrupo = document.getElementById('mk-grupo').value === '__otro__' && data.grupo;

  const fechaActualizacion = todayStr();

  const save = () => {
    try { bootstrap.Modal.getInstance(document.getElementById('mkModal')).hide(); } catch {}

    const snapshot = {
      fechaActualizacion,
      filaOrigen: rowIndex ? parseInt(rowIndex) : 0,
      grupo: data.grupo,
      fechaPublicacion: data.fecha,
      zona: data.zona,
      publicaciones: data.publicaciones,
      visualizaciones: data.visualizaciones,
      interacciones: data.interacciones,
      comentarios: data.comentarios,
      mensajes: data.mensajes
    };

    if (rowIndex) {
      updateMarketingRow(rowIndex, data);
      postHistorial(snapshot);
    } else {
      try { localStorage.setItem('mkLast', JSON.stringify({ fecha: rawFecha, publicaciones: data.publicaciones, visualizaciones: data.visualizaciones, interacciones: data.interacciones, comentarios: data.comentarios, mensajes: data.mensajes, estatus: data.estatus })); } catch {}
      addMarketingRow(data, snapshot);
      showToast('Publicación agregada', 'success');
    }
  };

  let chain = Promise.resolve();
  if (isNewGrupo) {
      chain = chain.then(() =>
        authFetch(API_BASE + '/api/grupos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre: data.grupo, enlace: '', zona: data.zona })
        }).then(() => loadGrupos())
      );
  }
  chain.then(save);
}

function openDetailModal(rowData) {
  if (typeof rowData === 'string') rowData = JSON.parse(decodeURIComponent(rowData));
  const row = rowData;

  if (window._grupoChart) { window._grupoChart.destroy(); window._grupoChart = null; }
  if (window._zonaChart) { window._zonaChart.destroy(); window._zonaChart = null; }

  const grupoInfo = gruposData.find(g => g.nombre === row.grupo);
  const grupoLink = grupoInfo && grupoInfo.enlace && /^https?:\/\//i.test(grupoInfo.enlace) ? grupoInfo.enlace : null;

  const historiales = historialData.filter(h => h.filaOrigen === row.rowIndex);
  let histHtml = '';
  if (historiales.length) {
    histHtml = `
      <hr class="my-3">
      <h6 class="fw-semibold text-muted mb-2"><i class="bi bi-clock-history me-1"></i>Historial de actualizaciones</h6>
      <div class="table-responsive">
        <table class="table table-sm small mb-0">
          <thead><tr><th>Fecha</th><th>Pubs</th><th>Vis</th><th>Int</th><th>Com</th><th>Msj</th></tr></thead>
          <tbody>
            ${historiales.sort((a, b) => a.fechaActualizacion.localeCompare(b.fechaActualizacion)).map(h => `
              <tr>
                <td class="text-muted">${escHtml(h.fechaActualizacion)}</td>
                <td>${h.publicaciones}</td>
                <td>${h.visualizaciones}</td>
                <td>${h.interacciones}</td>
                <td>${h.comentarios}</td>
                <td>${h.mensajes}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  }

  let chartHtml = '';
  if (row.grupo && row.grupo !== 'Perfil Estandar') {
    const gArg = encArg(row.grupo);
    chartHtml = `
      <hr class="my-3">
      <h6 class="fw-semibold text-muted mb-2"><i class="bi bi-bar-chart-line me-1"></i>Métricas del grupo: ${escHtml(row.grupo)}</h6>
      <div class="btn-group btn-group-sm mb-2 w-100" role="group">
        <button type="button" class="btn btn-outline-secondary chart-grupo-metric active" data-metric="pubs" onclick="renderGrupoChart('${gArg}','pubs')">Publicaciones</button>
        <button type="button" class="btn btn-outline-secondary chart-grupo-metric" data-metric="vis" onclick="renderGrupoChart('${gArg}','vis')">Visualizaciones</button>
        <button type="button" class="btn btn-outline-secondary chart-grupo-metric" data-metric="ints" onclick="renderGrupoChart('${gArg}','ints')">Interacciones</button>
        <button type="button" class="btn btn-outline-secondary chart-grupo-metric" data-metric="msjs" onclick="renderGrupoChart('${gArg}','msjs')">Mensajes</button>
      </div>
      <div style="height:200px;">
        <canvas id="chartGrupo"></canvas>
      </div>`;
  }

  let zonaChartHtml = '';
  if (row.zona) {
    const zoneRows = marketingData.filter(r => r.zona === row.zona && r.grupo !== 'Perfil Estandar' && isEstatusActivo(r.estatus) && zonaActiva(r.zona));
    if (zoneRows.length) {
      const zArg = encArg(row.zona);
      zonaChartHtml = `
      <hr class="my-3">
      <h6 class="fw-semibold text-muted mb-2"><i class="bi bi-geo-alt me-1"></i>Métricas de zona: ${escHtml(row.zona)}</h6>
      <div class="btn-group btn-group-sm mb-2 w-100" role="group">
        <button type="button" class="btn btn-outline-secondary chart-zona-metric active" data-metric="pubs" onclick="renderZonaChart('${zArg}','pubs')">Publicaciones</button>
        <button type="button" class="btn btn-outline-secondary chart-zona-metric" data-metric="vis" onclick="renderZonaChart('${zArg}','vis')">Visualizaciones</button>
        <button type="button" class="btn btn-outline-secondary chart-zona-metric" data-metric="ints" onclick="renderZonaChart('${zArg}','ints')">Interacciones</button>
        <button type="button" class="btn btn-outline-secondary chart-zona-metric" data-metric="msjs" onclick="renderZonaChart('${zArg}','msjs')">Mensajes</button>
      </div>
      <div style="height:200px;">
        <canvas id="chartZona"></canvas>
      </div>`;
    }
  }

  const html = `
    <div class="row g-3">
      <div class="col-6 col-md-4"><div class="text-muted small">Fecha</div><div class="fw-medium">${escHtml(row.fecha || '—')}</div></div>
      <div class="col-6 col-md-4"><div class="text-muted small">Grupo</div><div class="fw-medium">${escHtml(row.grupo || '—')}${grupoLink ? ' <a href="' + escHtml(grupoLink) + '" target="_blank" rel="noopener noreferrer" class="text-decoration-none" title="Abrir grupo"><i class="bi bi-box-arrow-up-right ms-1 text-muted"></i></a>' : ''}</div></div>
      <div class="col-6 col-md-4"><div class="text-muted small">Publicaciones</div><div class="fw-medium">${row.publicaciones}</div></div>
      <div class="col-6 col-md-4"><div class="text-muted small">Visualizaciones</div><div class="fw-medium">${row.visualizaciones}</div></div>
      <div class="col-6 col-md-4"><div class="text-muted small">Interacciones</div><div class="fw-medium">${row.interacciones}</div></div>
      <div class="col-6 col-md-4"><div class="text-muted small">Comentarios</div><div class="fw-medium">${row.comentarios}</div></div>
      <div class="col-6 col-md-4"><div class="text-muted small">Mensajes</div><div class="fw-medium">${row.mensajes}</div></div>
      <div class="col-6 col-md-4"><div class="text-muted small">Zona</div><div class="fw-medium">${escHtml(row.zona || '—')}</div></div>
      <div class="col-6 col-md-4"><div class="text-muted small">Estatus</div><div class="fw-medium"><span class="badge-estatus est-${escHtml((row.estatus||'SIN DEFINIR').toLowerCase().replace(/ /g,'-'))}">${escHtml(row.estatus || 'SIN DEFINIR')}</span></div></div>
    </div>
    ${histHtml}${chartHtml}${zonaChartHtml}`;

  const footer = `
    <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">Cerrar</button>
    <button type="button" class="btn btn-sm btn-outline-success" onclick="openUpdateModal(JSON.parse(decodeURIComponent('${encArg(JSON.stringify(row))}')))">
      <i class="bi bi-arrow-repeat me-1"></i>Actualizar
    </button>
    <button type="button" class="btn btn-sm btn-action-primary" id="detail-edit-btn">
      <i class="bi bi-pencil-fill me-1"></i>Editar
    </button>
    <button type="button" class="btn btn-sm btn-outline-danger" onclick="if(confirm('¿Eliminar esta fila?')){bootstrap.Modal.getInstance(document.getElementById('detailModal')).hide();deleteMarketingRow(${row.rowIndex})}">
      <i class="bi bi-trash3-fill me-1"></i>Eliminar
    </button>`;

  document.getElementById('detailModalLabel').innerHTML = '<i class="bi bi-eye me-2"></i>Detalle de Publicación';
  document.getElementById('detailBody').innerHTML = html;
  document.getElementById('detailFooter').innerHTML = footer;
  document.getElementById('detail-edit-btn').onclick = function() {
    bootstrap.Modal.getInstance(document.getElementById('detailModal')).hide();
    openEditModal(row);
  };
  const modal = new bootstrap.Modal(document.getElementById('detailModal'));
  if (row.grupo && row.grupo !== 'Perfil Estandar') {
    const el = document.getElementById('detailModal');
    el.addEventListener('shown.bs.modal', function onShown() {
      el.removeEventListener('shown.bs.modal', onShown);
      renderGrupoChart(row.grupo, 'pubs');
      if (row.zona) renderZonaChart(row.zona, 'pubs');
    });
  } else if (row.zona) {
    const el = document.getElementById('detailModal');
    el.addEventListener('shown.bs.modal', function onShown() {
      el.removeEventListener('shown.bs.modal', onShown);
      renderZonaChart(row.zona, 'pubs');
    });
  }
  modal.show();
}

function openUpdateModal(rowData) {
  if (typeof rowData === 'string') rowData = JSON.parse(decodeURIComponent(rowData));
  const row = rowData;
  document.getElementById('upd-row-index').value = row.rowIndex;
  document.getElementById('upd-pubs').value = row.publicaciones;
  document.getElementById('upd-vis').value = row.visualizaciones;
  document.getElementById('upd-int').value = row.interacciones;
  document.getElementById('upd-com').value = row.comentarios;
  document.getElementById('upd-msj').value = row.mensajes;
  document.getElementById('upd-estatus').value = row.estatus || 'SIN DEFINIR';
  // Guardar referencia para el save
  document.getElementById('upd-row-index').dataset.fecha = row.fecha || '';
  document.getElementById('upd-row-index').dataset.grupo = row.grupo || '';
  document.getElementById('upd-row-index').dataset.zona = row.zona || '';
  new bootstrap.Modal(document.getElementById('updateModal')).show();
}

function saveUpdate() {
  const rowIndex = parseInt(document.getElementById('upd-row-index').value);
  const fecha = document.getElementById('upd-row-index').dataset.fecha;
  const grupo = document.getElementById('upd-row-index').dataset.grupo;
  const zona = document.getElementById('upd-row-index').dataset.zona;

  const data = {
    fecha,
    grupo,
    zona,
    publicaciones: parseInt(document.getElementById('upd-pubs').value) || 0,
    visualizaciones: parseInt(document.getElementById('upd-vis').value) || 0,
    interacciones: parseInt(document.getElementById('upd-int').value) || 0,
    comentarios: parseInt(document.getElementById('upd-com').value) || 0,
    mensajes: parseInt(document.getElementById('upd-msj').value) || 0,
    estatus: document.getElementById('upd-estatus').value
  };

  const fechaActualizacion = todayStr();

  const snapshot = {
    fechaActualizacion,
    filaOrigen: rowIndex,
    grupo,
    fechaPublicacion: fecha,
    zona,
    publicaciones: data.publicaciones,
    visualizaciones: data.visualizaciones,
    interacciones: data.interacciones,
    comentarios: data.comentarios,
    mensajes: data.mensajes
  };

  try { bootstrap.Modal.getInstance(document.getElementById('updateModal')).hide(); } catch {}
  const detailEl = document.getElementById('detailModal');
  if (detailEl && bootstrap.Modal.getInstance(detailEl)) bootstrap.Modal.getInstance(detailEl).hide();

  updateMarketingRow(rowIndex, data);
  postHistorial(snapshot);
}

function isDarkTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

function chartPalette() {
  if (isDarkTheme()) {
    return {
      pubs: '#e2e8f0', vis: '#fbbf24', ints: '#34d399', msjs: '#a5b4fc',
      grid: 'rgba(226,232,240,0.15)', tick: '#94a3b8'
    };
  }
  return {
    pubs: '#0f172a', vis: '#f59e0b', ints: '#10b981', msjs: '#6366f1',
    grid: 'rgba(15,23,42,0.10)', tick: '#64748b'
  };
}

function applyChartThemeDefaults() {
  if (!window.Chart) return;
  const p = chartPalette();
  Chart.defaults.color = p.tick;
  Chart.defaults.borderColor = p.grid;
  Chart.defaults.animation = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 350 };
}

function refreshChartTheme() {
  if (!window.Chart) return;
  applyChartThemeDefaults();
  const palette = chartPalette();
  const colors = {
    '#e2e8f0': palette.pubs, '#0f172a': palette.pubs,
    '#fbbf24': palette.vis, '#f59e0b': palette.vis,
    '#34d399': palette.ints, '#10b981': palette.ints,
    '#a5b4fc': palette.msjs, '#6366f1': palette.msjs
  };
  Object.values(Chart.instances).forEach(chart => {
    Object.values(chart.options.scales || {}).forEach(scale => {
      scale.ticks.color = palette.tick;
      scale.grid.color = palette.grid;
    });
    chart.data.datasets.forEach(dataset => {
      ['borderColor', 'backgroundColor'].forEach(key => {
        const color = dataset[key];
        if (typeof color !== 'string') return;
        const base = color.slice(0, 7);
        if (colors[base]) dataset[key] = colors[base] + color.slice(7);
      });
    });
    chart.update('none');
  });
}

function encArg(s) { return encodeURIComponent(String(s == null ? '' : s)).replace(/'/g, '%27'); }

function renderGrupoChart(grupo, metric) {
  if (grupo != null) {
    try { grupo = decodeURIComponent(grupo); } catch { /* ya decodificado */ }
  }
  metric = metric || 'pubs';
  document.querySelectorAll('.chart-grupo-metric').forEach(b => {
    b.classList.toggle('active', b.dataset.metric === metric);
  });

  if (window._grupoChart) { window._grupoChart.destroy(); window._grupoChart = null; }
  const canvas = document.getElementById('chartGrupo');
  if (!canvas) return;

  const METRIC_FIELD = { pubs: 'publicaciones', vis: 'visualizaciones', ints: 'interacciones', msjs: 'mensajes' };
  const METRIC_LABELS = { pubs: 'Publicaciones', vis: 'Visualizaciones', ints: 'Interacciones', msjs: 'Mensajes' };
  const PAL = chartPalette();
  const METRIC_COLORS = { pubs: PAL.pubs, vis: PAL.vis, ints: PAL.ints, msjs: PAL.msjs };
  const field = METRIC_FIELD[metric] || 'publicaciones';

  // Usar historial: filtrar por rowIndex del grupo (mas robusto que campo grupo)
  const groupRows = new Set(marketingData.filter(r => r.grupo === grupo && isEstatusActivo(r.estatus) && zonaActiva(r.zona)).map(r => r.rowIndex));
  const hEntries = historialData.filter(r => groupRows.has(r.filaOrigen));

  // Solo la ultima entrada por fecha (no sumar)
  const latest = {};
  hEntries.forEach(r => { latest[r.fechaActualizacion] = r; });
  const dates = Object.keys(latest).filter(Boolean).sort((a, b) => {
    const da = parseDate(a), db = parseDate(b);
    if (!da || !db) return 0;
    return da - db;
  });

  const labels = dates.map(f => f.substring(0, 5));
  const values = dates.map(f => (latest[f][field] || 0));

  if (labels.length === 1) {
    labels.unshift(''); labels.push('');
    values.unshift(null); values.push(null);
  }

  applyChartThemeDefaults();
  try {
    window._grupoChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: METRIC_LABELS[metric] || metric,
          data: values,
          borderColor: METRIC_COLORS[metric] || PAL.pubs,
          backgroundColor: (METRIC_COLORS[metric] || PAL.pubs) + '20',
          borderWidth: 2,
          pointRadius: 4,
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: PAL.grid }, ticks: { color: PAL.tick, precision: 0 } },
          x: { grid: { color: PAL.grid }, ticks: { color: PAL.tick } }
        }
      }
    });
  } catch (e) { console.warn('Grupo chart error:', e); }
}

function renderZonaChart(zona, metric) {
  if (zona != null) {
    try { zona = decodeURIComponent(zona); } catch { /* ya decodificado */ }
  }
  metric = metric || 'pubs';
  document.querySelectorAll('.chart-zona-metric').forEach(b => {
    b.classList.toggle('active', b.dataset.metric === metric);
  });
  if (window._zonaChart) { window._zonaChart.destroy(); window._zonaChart = null; }
  const canvas = document.getElementById('chartZona');
  if (!canvas) return;

  const METRIC_FIELD = { pubs: 'publicaciones', vis: 'visualizaciones', ints: 'interacciones', msjs: 'mensajes' };
  const METRIC_LABELS = { pubs: 'Publicaciones', vis: 'Visualizaciones', ints: 'Interacciones', msjs: 'Mensajes' };
  const PAL = chartPalette();
  const METRIC_COLORS = { pubs: PAL.pubs, vis: PAL.vis, ints: PAL.ints, msjs: PAL.msjs };
  const field = METRIC_FIELD[metric] || 'publicaciones';

  // Todos los rowIndex de la zona
  const zoneRowIndexes = new Set(marketingData.filter(r => r.zona === zona && r.grupo !== 'Perfil Estandar' && isEstatusActivo(r.estatus) && zonaActiva(r.zona)).map(r => r.rowIndex));
  const hEntries = historialData.filter(r => zoneRowIndexes.has(r.filaOrigen));

  // Sumar por fecha (todos los grupos de la zona)
  const summed = {};
  hEntries.forEach(r => {
    if (!r.fechaActualizacion) return;
    if (!summed[r.fechaActualizacion]) summed[r.fechaActualizacion] = {};
    ['publicaciones', 'visualizaciones', 'interacciones', 'comentarios', 'mensajes'].forEach(f => {
      summed[r.fechaActualizacion][f] = (summed[r.fechaActualizacion][f] || 0) + (r[f] || 0);
    });
  });

  const dates = Object.keys(summed).filter(Boolean).sort((a, b) => {
    const da = parseDate(a), db = parseDate(b);
    if (!da || !db) return 0;
    return da - db;
  });

  const labels = dates.map(f => f.substring(0, 5));
  const values = dates.map(f => summed[f][field] || 0);

  if (labels.length === 1) {
    labels.unshift(''); labels.push('');
    values.unshift(null); values.push(null);
  }

  applyChartThemeDefaults();
  try {
    window._zonaChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: METRIC_LABELS[metric] || metric,
          data: values,
          borderColor: METRIC_COLORS[metric] || PAL.pubs,
          backgroundColor: (METRIC_COLORS[metric] || PAL.pubs) + '20',
          borderWidth: 2,
          pointRadius: 4,
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: PAL.grid }, ticks: { color: PAL.tick, precision: 0 } },
          x: { grid: { color: PAL.grid }, ticks: { color: PAL.tick } }
        }
      }
    });
  } catch (e) { console.warn('Zona chart error:', e); }
}

function renderZonasDashboard() {
  const requestId = (renderZonasDashboard.requestId || 0) + 1;
  renderZonasDashboard.requestId = requestId;
  // Destruir charts anteriores
  ['chartZonasPubs', 'chartZonasInts'].forEach(id => {
    if (chartsInstances[id]) { try { chartsInstances[id].destroy(); } catch {} delete chartsInstances[id]; }
  });

  const zonaFilter = document.getElementById('filter-zona-zonas')?.value || '';
  const periodoZonas = filterPeriodZonas;
  const periodLimit = (() => {
    if (!periodoZonas || periodoZonas === 'all') return null;
    const days = parseInt(periodoZonas, 10);
    const now = new Date();
    const limit = new Date(now);
    limit.setDate(limit.getDate() - days);
    limit.setHours(0, 0, 0, 0);
    return limit;
  })();

  // Cargar grupos fresco para el conteo
  authFetch(API_BASE + '/api/grupos')
    .then(r => { if (!r.ok) throw new Error('No se pudieron cargar los grupos'); return r.json(); })
    .then(body => {
      if (requestId !== renderZonasDashboard.requestId) return;
      const freshGrupos = body.data || [];
      gruposData = freshGrupos;
      renderZonasDashboardInner(freshGrupos, zonaFilter, periodLimit);
    })
    .catch(() => {
      if (requestId !== renderZonasDashboard.requestId) return;
      renderZonasDashboardInner(gruposData, zonaFilter, periodLimit);
    });
}

// The configured catalog is the base; Sheets can also contain legacy zones.
function zonaSummaryKey(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function buildZonaSummary(configured, rows, groups, filter) {
  const zones = new Map();
  const selected = zonaSummaryKey(filter);
  function ensure(name, active) {
    const label = String(name || '').trim() || 'Sin zona';
    const key = zonaSummaryKey(label);
    if (selected && key !== selected) return null;
    if (!zones.has(key)) zones.set(key, { zona: label, activo: active !== false,
      publicaciones: 0, visualizaciones: 0, interacciones: 0, comentarios: 0, mensajes: 0, grupos: new Set() });
    return zones.get(key);
  }
  configured.forEach(z => { if (z.nombre) ensure(z.nombre, z.activo); });
  rows.forEach(row => {
    const zone = ensure(row.zona);
    if (!zone) return;
    ['publicaciones', 'visualizaciones', 'interacciones', 'comentarios', 'mensajes'].forEach(metric => {
      const value = Number(row[metric]);
      if (Number.isFinite(value)) zone[metric] += value;
    });
  });
  groups.forEach(group => {
    const zone = ensure(group.zona);
    if (zone && group.nombre) zone.grupos.add(zonaSummaryKey(group.nombre));
  });
  const sortedZones = [...zones.values()].sort((a, b) => b.publicaciones - a.publicaciones || a.zona.localeCompare(b.zona, 'es'));
  const totalGruposUnicos = new Set(sortedZones.flatMap(z => [...z.grupos])).size;
  return { sortedZones, totalGruposUnicos };
}

function renderZonasDashboardInner(grupos, zonaFilter, periodLimit) {
  let data = marketingData.filter(r => r.grupo !== 'Perfil Estandar' && isEstatusActivo(r.estatus));
  const zonaNorm = zonaSummaryKey(zonaFilter);
  if (zonaNorm) data = data.filter(r => zonaSummaryKey(r.zona) === zonaNorm);
  if (periodLimit) {
    const actualizados = historialSetPeriodo(periodLimit);
    data = data.filter(r => {
      const d = parseDate(r.fecha);
      if (d && d >= periodLimit) return true;
      return actualizados.has(String(r.rowIndex));
    });
  }

  const { sortedZones, totalGruposUnicos } = buildZonaSummary(zonasData, data, grupos, zonaFilter);

  // KPIs por zona
  const kpiContainer = document.getElementById('zonas-kpi-container');
  if (kpiContainer) {
    if (!sortedZones.length) { kpiContainer.innerHTML = ''; } else {
      kpiContainer.innerHTML = sortedZones.map(z => {
        const rowsZona = data.filter(r => zonaSummaryKey(r.zona) === zonaSummaryKey(z.zona));
        const saludCls = saludZonaClass(rowsZona);
        return `
        <div class="col-6 col-md-4 col-lg">
          <div class="zone-kpi-card ${saludCls}">
            <div class="zone-kpi-name">${saludDiv(rowsZona)}${escHtml(z.zona)} <span class="text-muted small" style="font-weight:400">(${z.grupos.size})</span></div>
            <div class="zone-kpi-stats">
              <span title="Pubs"><i class="bi bi-file-text"></i> ${z.publicaciones}</span>
              <span title="Vis"><i class="bi bi-eye"></i> ${z.visualizaciones}</span>
              <span title="Int"><i class="bi bi-hand-thumbs-up"></i> ${z.interacciones}</span>
              <span title="Msj"><i class="bi bi-chat-dots"></i> ${z.mensajes}</span>
            </div>
          </div>
        </div>
      `;
      }).join('');
    }
  }

  // Tabla
  const tbody = document.getElementById('zonas-table-body');
  if (tbody) {
    tbody.innerHTML = sortedZones.map(z => `
      <tr>
        <td class="fw-medium">${escHtml(z.zona)}${z.activo ? '' : ' <span class="badge-estatus est-eliminada">Inactiva</span>'}</td>
        <td class="text-center">${z.publicaciones}</td>
        <td class="text-center fw-medium">${z.visualizaciones}</td>
        <td class="text-center text-success fw-medium">${z.interacciones}</td>
        <td class="text-center">${z.comentarios}</td>
        <td class="text-center text-indigo fw-medium">${z.mensajes}</td>
        <td class="text-center">${z.grupos.size}</td>
      </tr>
    `).join('') + (
      sortedZones.length > 1
        ? '<tr class="table-light fw-semibold"><td>Total</td><td class="text-center">' + sortedZones.reduce((s, z) => s + z.publicaciones, 0) + '</td><td class="text-center">' + sortedZones.reduce((s, z) => s + z.visualizaciones, 0) + '</td><td class="text-center">' + sortedZones.reduce((s, z) => s + z.interacciones, 0) + '</td><td class="text-center">' + sortedZones.reduce((s, z) => s + z.comentarios, 0) + '</td><td class="text-center">' + sortedZones.reduce((s, z) => s + z.mensajes, 0) + '</td><td class="text-center">' + totalGruposUnicos + '</td></tr>'
        : ''
    );
  }

  // Gráficos de barras por zona
  const labels = sortedZones.map(z => z.zona);
  const pubsData = sortedZones.map(z => z.publicaciones);
  const intsData = sortedZones.map(z => z.interacciones);

  function makeBar(id, color, dataArr) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!labels.length) return;
    const PAL = chartPalette();
    try {
      chartsInstances[id] = new Chart(el, {
        type: 'bar',
        data: {
          labels,
          datasets: [{ data: dataArr, backgroundColor: color, borderRadius: 4 }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, grid: { color: PAL.grid }, ticks: { color: PAL.tick, precision: 0 } },
            x: { ticks: { maxRotation: 30, color: PAL.tick }, grid: { color: PAL.grid } }
          }
        }
      });
    } catch (e) { console.warn('Zonas chart error:', e); }
  }

  const PALZ = chartPalette();
  makeBar('chartZonasPubs', PALZ.pubs, pubsData);
  makeBar('chartZonasInts', PALZ.ints, intsData);
}

function initCharts(chartData, periodLimit) {
  Object.values(chartsInstances).forEach(c => { try { c.destroy(); } catch {} });
  chartsInstances = {};

  const rowIndexes = new Set(chartData.map(r => r.rowIndex));
  let hEntries = historialData.filter(h => rowIndexes.has(h.filaOrigen));
  if (periodLimit) {
    hEntries = hEntries.filter(h => {
      const d = parseDate(h.fechaActualizacion);
      return d && d >= periodLimit;
    });
  }

  // --- Publicaciones: usa marketingData (filas agregadas, no actualizadas) ---
  let pubsData = chartData;
  if (periodLimit) pubsData = pubsData.filter(r => { const d = parseDate(r.fecha); return d && d >= periodLimit; });
  const pubsLatest = {};
  pubsData.forEach(r => {
    const key = r.fecha + '|' + r.grupo;
    if (!pubsLatest[key] || r.rowIndex > pubsLatest[key].rowIndex) pubsLatest[key] = r;
  });
  const pubsDeduped = Object.values(pubsLatest);
  const pubsFechas = [...new Set(pubsDeduped.map(r => r.fecha).filter(Boolean))].sort((a, b) => {
    const da = parseDate(a), db = parseDate(b); if (!da || !db) return 0; return da - db;
  });
  const pubsLabels = pubsFechas.map(f => f.substring(0, 5));
  const pubsVals = pubsFechas.map(f => pubsDeduped.filter(r => r.fecha === f).reduce((s, r) => s + (r.publicaciones || 0), 0));

  // --- Interacciones: usa historial (actualizaciones) ---
  function buildHistorialSeries(entries, field, periodLimit) {
    let data = entries;
    if (periodLimit) data = data.filter(h => { const d = parseDate(h.fechaActualizacion); return d && d >= periodLimit; });
    if (data.length === 0) return { labels: [], values: [] };
    const byDate = {};
    data.forEach(h => {
      if (!h.fechaActualizacion) return;
      byDate[h.fechaActualizacion] = (byDate[h.fechaActualizacion] || 0) + (h[field] || 0);
    });
    const dates = Object.keys(byDate).filter(Boolean).sort((a, b) => {
      const da = parseDate(a), db = parseDate(b); if (!da || !db) return 0; return da - db;
    });
    return { labels: dates.map(f => f.substring(0, 5)), values: dates.map(f => byDate[f]) };
  }

  const intsSeries = buildHistorialSeries(hEntries, 'interacciones');
  const msjsSeries = buildHistorialSeries(hEntries, 'mensajes');

  // Si no hay historial para interacciones/mensajes, caer a marketingData
  if (!intsSeries.labels.length) {
    const fb = periodLimit ? chartData.filter(r => { const d = parseDate(r.fecha); return d && d >= periodLimit; }) : chartData;
    const latest = {};
    fb.forEach(r => { const k = r.fecha + '|' + r.grupo; if (!latest[k] || r.rowIndex > latest[k].rowIndex) latest[k] = r; });
    const dedup = Object.values(latest);
    const fechas = [...new Set(dedup.map(r => r.fecha).filter(Boolean))].sort((a, b) => {
      const da = parseDate(a), db = parseDate(b); if (!da || !db) return 0; return da - db;
    });
    intsSeries.labels = fechas.map(f => f.substring(0, 5));
    intsSeries.values = fechas.map(f => dedup.filter(r => r.fecha === f).reduce((s, r) => s + (r.interacciones || 0), 0));
  }
  if (!msjsSeries.labels.length) {
    const fb = periodLimit ? chartData.filter(r => { const d = parseDate(r.fecha); return d && d >= periodLimit; }) : chartData;
    const latest = {};
    fb.forEach(r => { const k = r.fecha + '|' + r.grupo; if (!latest[k] || r.rowIndex > latest[k].rowIndex) latest[k] = r; });
    const dedup = Object.values(latest);
    const fechas = [...new Set(dedup.map(r => r.fecha).filter(Boolean))].sort((a, b) => {
      const da = parseDate(a), db = parseDate(b); if (!da || !db) return 0; return da - db;
    });
    msjsSeries.labels = fechas.map(f => f.substring(0, 5));
    msjsSeries.values = fechas.map(f => dedup.filter(r => r.fecha === f).reduce((s, r) => s + (r.mensajes || 0), 0));
  }

  // Padding para un solo punto
  if (pubsLabels.length === 1) { pubsLabels.unshift(''); pubsLabels.push(''); pubsVals.unshift(null); pubsVals.push(null); }
  if (intsSeries.labels.length === 1) { intsSeries.labels.unshift(''); intsSeries.labels.push(''); intsSeries.values.unshift(null); intsSeries.values.push(null); }
  if (msjsSeries.labels.length === 1) { msjsSeries.labels.unshift(''); msjsSeries.labels.push(''); msjsSeries.values.unshift(null); msjsSeries.values.push(null); }

  function makeChart(id, color, bg, dataArr, labels, label) {
    const el = document.getElementById(id);
    if (!el) return;
    const PAL = chartPalette();
    try {
      chartsInstances[id] = new Chart(el, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: label || undefined,
            data: dataArr,
            borderColor: color,
            backgroundColor: bg || 'transparent',
            borderWidth: 2,
            tension: 0.3,
            fill: !!bg,
            pointRadius: 4,
            pointHitRadius: 10
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, grid: { color: PAL.grid }, ticks: { color: PAL.tick, precision: 0 } },
            x: { grid: { color: PAL.grid }, ticks: { color: PAL.tick } }
          }
        }
      });
    } catch (e) { console.warn('Chart error ' + id + ':', e); }
  }

  applyChartThemeDefaults();
  const PALI = chartPalette();
  makeChart('chartPublicaciones', PALI.pubs, null, pubsVals, pubsLabels, 'Publicaciones');
  makeChart('chartInteracciones', PALI.ints, 'rgba(16, 185, 129, 0.1)', intsSeries.values, intsSeries.labels, 'Interacciones');
  makeChart('chartComparativo', PALI.msjs, 'rgba(99, 102, 241, 0.1)', msjsSeries.values, msjsSeries.labels, 'Mensajes');
}
function loadUsers() {
  apiFetch('/api/auth/users').then(({ status, body }) => {
    if (status !== 200) { alert(body.error || 'Error al cargar usuarios.'); return; }
    renderUsers(body);
  });
}

function renderUsers(users) {
  const tbody = document.getElementById('users-table-body');
  tbody.innerHTML = '';
  const session = getCurrentSession();
  users.forEach(u => {
    const isSelf = session && session.id === u.id;
    const roleNorm = (u.role || '').toLowerCase();
    const isAdmin = roleNorm === 'admin';
    const canDelete = !isSelf && !isAdmin;
    tbody.innerHTML += `
      <tr>
        <td class="fw-semibold text-dark">${escHtml(u.name)}</td>
        <td>${escHtml(u.email)}</td>
        <td>
          <select class="form-select form-select-sm role-select" data-user-id="${u.id}" ${isSelf || isAdmin ? 'disabled' : ''}
            onchange="updateUserRole(${u.id}, this.value)">
            <option value="colaborador" ${!isAdmin ? 'selected' : ''}>Colaborador</option>
            <option value="admin" ${isAdmin ? 'selected' : ''}>Admin</option>
          </select>
        </td>
        <td>${u.fecha ? escHtml(u.fecha).substring(0, 10) : '-'}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-link text-danger p-0" onclick="deleteUser(${u.id})" ${canDelete ? '' : 'disabled style="opacity:0.2;"'}>
            <i class="bi bi-trash3-fill"></i>
          </button>
        </td>
      </tr>`;
  });
}

let permissionDefaults = {};
let currentRolePerm = 'colaborador';
let currentRolePermLabel = 'Colaborador';

function loadRoles() {
  if (sessionRole() !== 'admin') return;
  apiFetch('/api/auth/roles').then(({ status, body }) => {
    if (status !== 200) return;
    const sel = document.getElementById('input-role');
    if (!sel) return;
    sel.innerHTML = '';
    body.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.label || r.name;
      opt.textContent = r.label || r.name;
      sel.appendChild(opt);
    });
    if (!sel.options.length) {
      const opt = document.createElement('option');
      opt.value = 'Colaborador';
      opt.textContent = 'Colaborador';
      sel.appendChild(opt);
    }
    loadRolesTable();
  });
}

function loadRolesTable() {
  if (sessionRole() !== 'admin') return;
  apiFetch('/api/auth/roles').then(({ status, body }) => {
    if (status !== 200) return;
    const tbody = document.getElementById('roles-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    body.forEach(r => {
      const name = r.name || '';
      const label = r.label || name;
      tbody.innerHTML += `
        <tr>
          <td class="fw-semibold text-dark">${escHtml(label)}</td>
          <td class="text-muted small">${escHtml(name)}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-secondary me-1" onclick="openRolePerms(decodeURIComponent('${encArg(name)}'), decodeURIComponent('${encArg(label)}'))"><i class="bi bi-sliders me-1"></i>Ajustes</button>
            <button class="btn btn-sm btn-link text-danger p-0" onclick="deleteRole(decodeURIComponent('${encArg(name)}'))"><i class="bi bi-trash3-fill"></i></button>
          </td>
        </tr>`;
    });
    const sel = document.getElementById('input-role');
    if (sel) {
      sel.innerHTML = '';
      body.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.label || r.name;
        opt.textContent = r.label || r.name;
        sel.appendChild(opt);
      });
      if (!sel.options.length) {
        const opt = document.createElement('option');
        opt.value = 'Colaborador';
        opt.textContent = 'Colaborador';
        sel.appendChild(opt);
      }
    }
  });
}

function openAddRoleModal() {
  document.getElementById('new-role-name').value = '';
  new bootstrap.Modal(document.getElementById('addRoleModal')).show();
}

function createRole() {
  const label = document.getElementById('new-role-name').value.trim();
  if (!label) { alert('Ingresá el nombre del rol.'); return; }
  apiFetch('/api/auth/roles', { method: 'POST', body: JSON.stringify({ label }) })
    .then(({ status, body }) => {
      if (status !== 201) { alert(body.error || 'Error al crear rol.'); return; }
      bootstrap.Modal.getInstance(document.getElementById('addRoleModal')).hide();
      loadRolesTable();
      loadRoles();
      showToast('Rol creado correctamente.', 'success');
    });
}

function deleteRole(name) {
  if (name === 'admin') { alert('No se puede eliminar el rol administrador.'); return; }
  if (!confirm('¿Eliminar este rol? Solo es posible si no hay usuarios asignados.')) return;
  apiFetch('/api/auth/roles/' + encodeURIComponent(name), { method: 'DELETE' })
    .then(({ status, body }) => {
      if (status !== 200) { alert(body.error || 'Error al eliminar rol.'); return; }
      loadRolesTable();
      loadRoles();
      showToast('Rol eliminado.', 'success');
    });
}

function openRolePerms(name, label) {
  currentRolePerm = name;
  currentRolePermLabel = label || name;
  document.getElementById('role-perms-title').textContent = label || name;
  const cont = document.getElementById('permissions-container');
  if (!cont) return;
  cont.innerHTML = '<div class="text-muted small py-3"><span class="spinner-border spinner-border-sm me-2"></span>Cargando permisos...</div>';
  apiFetch('/api/auth/permissions/' + encodeURIComponent(name)).then(({ status, body }) => {
    if (status !== 200) {
      cont.innerHTML = '<div class="text-danger small py-2">' + escHtml(body.error || 'Error al cargar permisos.') + '</div>';
      return;
    }
    permissionDefaults = body.defaults || {};
    renderPermissionsPanel(body.catalog || [], body.permissions || {});
    const m = new bootstrap.Modal(document.getElementById('rolePermsModal'));
    m.show();
  });
}

function loadPermissionsPanel() {
  if (sessionRole() !== 'admin') return;
  const cont = document.getElementById('permissions-container');
  if (!cont) return;
  cont.innerHTML = '<div class="text-muted small py-3"><span class="spinner-border spinner-border-sm me-2"></span>Cargando permisos...</div>';
  apiFetch('/api/auth/permissions/colaborador').then(({ status, body }) => {
    if (status !== 200) {
      cont.innerHTML = '<div class="text-danger small py-2">' + escHtml(body.error || 'Error al cargar permisos.') + '</div>';
      return;
    }
    permissionDefaults = body.defaults || {};
    renderPermissionsPanel(body.catalog || [], body.permissions || {});
  });
}

const permGroupMeta = {
  Secciones: { icon: 'bi-grid-1x2-fill', label: 'Acceso a Secciones' },
  Publicaciones: { icon: 'bi-megaphone-fill', label: 'Publicaciones' },
  'Grupos y Zonas': { icon: 'bi-diagram-3-fill', label: 'Grupos y Zonas' },
  Sucursales: { icon: 'bi-buildings-fill', label: 'Sucursales' },
  Informes: { icon: 'bi-file-earmark-bar-graph-fill', label: 'Informes' },
  Calendario: { icon: 'bi-calendar3-fill', label: 'Calendario' }
};

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function permissionsStatusText(inner) {
  const st = document.getElementById('permissions-status');
  if (st) st.innerHTML = inner;
}

function markPermissionsDirty() {
  permissionsStatusText('<i class="bi bi-exclamation-circle-fill me-1 text-warning"></i>Hay cambios sin guardar');
}

function renderPermissionsPanel(catalog, perms) {
  const cont = document.getElementById('permissions-container');
  if (!cont) return;
  const groups = {};
  catalog.forEach(item => { (groups[item.group] = groups[item.group] || []).push(item); });
  const groupNames = Object.keys(groups);
  let html = '';
  for (let i = 0; i < groupNames.length; i += 2) {
    const slice = groupNames.slice(i, i + 2);
    html += '<div class="row g-3 mb-2">';
    slice.forEach(g => {
      const meta = permGroupMeta[g] || { icon: 'bi-shield-fill', label: g };
      html += '<div class="col-md-6"><div class="perm-group-card">' +
        '<div class="perm-group-head"><i class="bi ' + meta.icon + ' me-2"></i>' + escHtml(meta.label) +
        '<span class="perm-count">' + groups[g].length + '</span></div>' +
        '<div class="perm-group-body">';
      groups[g].forEach(item => {
        html += '<label class="perm-item">' +
          '<span class="perm-info"><span class="perm-label">' + escHtml(item.label) + '</span>' +
          (item.desc ? '<span class="perm-desc">' + escHtml(item.desc) + '</span>' : '') +
          '</span>' +
          '<span class="tgl"><input type="checkbox" data-perm="' + item.key + '" onchange="markPermissionsDirty()"' + (perms[item.key] ? ' checked' : '') + '><span class="sl"></span></span>' +
          '</label>';
      });
      html += '</div></div></div>';
    });
    html += '</div>';
  }
  cont.innerHTML = html;
  permissionsStatusText('Los cambios se aplican al guardar.');
}

function savePermissions() {
  const cont = document.getElementById('permissions-container');
  if (!cont) return;
  const permissions = {};
  cont.querySelectorAll('input[data-perm]').forEach(i => { permissions[i.dataset.perm] = i.checked; });
  const btn = document.getElementById('save-permissions-btn');
  const original = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Guardando...'; }
  apiFetch('/api/auth/permissions/' + encodeURIComponent(currentRolePerm || 'colaborador'), { method: 'PUT', body: JSON.stringify({ permissions }) })
    .then(({ status, body }) => {
      if (btn) { btn.disabled = false; btn.innerHTML = original; }
      if (status !== 200) { showToast(body.error || 'Error al guardar permisos.', 'error'); return; }
      permissionsStatusText('Los cambios se aplican al guardar.');
      showToast('Permisos del rol ' + (currentRolePermLabel || currentRolePerm) + ' actualizados.', 'success');
    })
    .catch(() => {
      if (btn) { btn.disabled = false; btn.innerHTML = original; }
      showToast('Error de conexión.', 'error');
    });
}

function resetPermissions() {
  const cont = document.getElementById('permissions-container');
  if (!cont) return;
  if (!Object.keys(permissionDefaults).length) return;
  cont.querySelectorAll('input[data-perm]').forEach(i => {
    const def = permissionDefaults[i.dataset.perm];
    if (def !== undefined) i.checked = !!def;
  });
  markPermissionsDirty();
  showToast('Valores por defecto cargados. Presioná "Guardar cambios" para aplicarlos.');
}

function updateUserRole(userId, newRole) {
  const label = newRole.charAt(0).toUpperCase() + newRole.slice(1);
  if (!confirm('¿Cambiar el rol de este usuario a ' + label + '?')) return;
  apiFetch('/api/auth/users/' + userId + '/role', {
    method: 'PUT',
    body: JSON.stringify({ role: newRole })
  }).then(({ status, body }) => {
    if (status !== 200) { alert(body.error || 'Error al actualizar rol.'); return; }
    loadUsers();
  });
}

function createNewUser(e) {
  e.preventDefault();
  const name = document.getElementById('input-name').value.trim();
  const email = document.getElementById('input-email').value.trim();
  const role = document.getElementById('input-role').value;
  if (!name || !email) return;

  apiFetch('/api/auth/users', {
    method: 'POST',
    body: JSON.stringify({ name, email, role })
  }).then(({ status, body }) => {
    if (status !== 201) { alert(body.error || 'Error al crear usuario.'); return; }
    if (body.tempPassword) {
      alert('Usuario creado. Contraseña temporal: ' + body.tempPassword);
    }
    bootstrap.Modal.getInstance(document.getElementById('addUserModal')).hide();
    document.getElementById('add-user-form').reset();
    loadUsers();
  });
}

function deleteUser(id) {
  if (!confirm('¿Eliminar acceso a este usuario?')) return;
  apiFetch('/api/auth/users/' + id, { method: 'DELETE' })
    .then(({ status, body }) => {
      if (status !== 200) { alert(body.error || 'Error al eliminar.'); return; }
      loadUsers();
    });
}

function loadCodes() {
  apiFetch('/api/auth/codes').then(({ status, body }) => {
    if (status !== 200) return;
    renderCodes(body);
  });
}

function renderCodes(codes) {
  const tbody = document.getElementById('codes-table-body');
  tbody.innerHTML = '';
  codes.forEach(c => {
    const statusText = c.used ? 'Usado' : 'Disponible';
    const statusClass = c.used ? 'badge-colab' : 'badge-admin';
    const usedBy = c.used_by_name || '-';
    tbody.innerHTML += `
      <tr>
        <td class="font-monospace fw-semibold">${escHtml(c.code)}</td>
        <td><span class="user-role-badge ${statusClass}">${statusText}</span></td>
        <td class="text-muted small">${escHtml(usedBy)}</td>
        <td class="text-muted small">${c.created_at ? escHtml(c.created_at).substring(0, 10) : '-'}</td>
        <td class="text-end">
          ${!c.used ? '<button class="btn btn-sm btn-link text-danger p-0" onclick="deleteCode(' + c.id + ')"><i class="bi bi-trash3-fill"></i></button>' : ''}
        </td>
      </tr>`;
  });
  document.getElementById('codes-count').innerText = codes.filter(c => !c.used).length;
}

function generateCodes() {
  const input = prompt('¿Cuántos códigos querés generar? (1-50)', '5');
  if (!input) return;
  const count = parseInt(input);
  if (isNaN(count) || count < 1 || count > 50) {
    alert('Ingresá un número entre 1 y 50.');
    return;
  }
  apiFetch('/api/auth/codes', {
    method: 'POST',
    body: JSON.stringify({ count })
  }).then(({ status, body }) => {
    if (status !== 201) { alert(body.error || 'Error al generar códigos.'); return; }
    alert(body.message + '\nCódigos: ' + body.codes.join(', '));
    loadCodes();
  });
}

function deleteCode(id) {
  if (!confirm('¿Eliminar este código de activación?')) return;
  apiFetch('/api/auth/codes/' + id, { method: 'DELETE' })
    .then(({ status, body }) => {
      if (status !== 200) { alert(body.error || 'Error al eliminar.'); return; }
      loadCodes();
    });
}

function inviteUser() {
  apiFetch('/api/auth/codes').then(({ status, body }) => {
    if (status !== 200) {
      alert(body.error || 'Error al obtener códigos.');
      return;
    }
    let codes = Array.isArray(body) ? body : [];
    const available = codes.find(c => !c.used);
    if (available) {
      const msg = `✨ ¡Te invito a unirte a Potage! ✨\n\nRegistrate desde este link: ${location.origin}/register.html\n\nCódigo de activación: ${available.code}\n\nUsalo al momento de crear tu cuenta. ¡Te espero! 🚀`;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(msg).then(() => showToast('Mensaje de invitación copiado al portapapeles.', 'success')).catch(() => { prompt('Copiá este mensaje:', msg); });
      } else {
        prompt('Copiá este mensaje:', msg);
      }
      loadCodes();
      return;
    }
    apiFetch('/api/auth/codes', { method: 'POST', body: JSON.stringify({ count: 1 }) })
      .then(({ status2, body2 }) => {
        if ((status2 || status) !== 201 && (status2 || status) !== 200) {
          alert(body2 && body2.error ? body2.error : 'Error al generar código.');
          return;
        }
        const code = (body2 && body2.codes && body2.codes[0]) ? body2.codes[0] : null;
        if (!code) { loadCodes(); return; }
        const msg = `✨ ¡Te invito a unirte a Potage! ✨\n\nRegistrate desde este link: ${location.origin}/register.html\n\nCódigo de activación: ${code}\n\nUsalo al momento de crear tu cuenta. ¡Te espero! 🚀`;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(msg).then(() => showToast('Mensaje de invitación copiado al portapapeles.', 'success')).catch(() => { prompt('Copiá este mensaje:', msg); });
        } else {
          prompt('Copiá este mensaje:', msg);
        }
        loadCodes();
      });
  });
}

function refreshZonasEditControls() {
  const can = canEditZonas();
  const addBox = document.getElementById('zona-add-box');
  if (addBox) addBox.style.display = can ? '' : 'none';
  const container = document.getElementById('zonas-list');
  if (container) container.querySelectorAll('[data-zona-control]').forEach(el => {
    el.style.display = can ? '' : 'none';
  });
}

function renderZonas() {
  const container = document.getElementById('zonas-list');
  if (!container) return;
  if (!zonasData.length) {
    container.innerHTML = '<div class="text-muted small py-2">No hay zonas configuradas.</div>';
    return;
  }
  const can = canEditZonas();
  container.innerHTML = zonasData.map(z => {
    const activo = z.activo !== false;
    const badge = activo
      ? '<span class="badge-estatus est-publicada">Activo</span>'
      : '<span class="badge-estatus est-eliminada">Inactivo</span>';
    return `
    <div class="d-flex justify-content-between align-items-center py-1 border-bottom border-light">
      <span class="small" ${activo ? '' : 'style="opacity:.55;text-decoration:line-through;"'}>${escHtml(z.nombre)}</span>
      <div class="d-flex gap-2 align-items-center">
        ${badge}
        <button class="btn btn-sm btn-link text-primary p-0" data-zona-control onclick="openZonaModal(${z.id})" style="${can ? '' : 'display:none'}" title="Cambiar estado de la zona">
          <i class="bi bi-pencil-fill"></i>
        </button>
        <button class="btn btn-sm btn-link text-danger p-0" data-zona-control onclick="deleteZona(${z.id})" style="${can ? '' : 'display:none'}" title="Eliminar zona">
          <i class="bi bi-x-circle"></i>
        </button>
      </div>
    </div>
  `;
  }).join('');
}

let zonaEditId = null;

function openZonaModal(id) {
  const z = (zonasData || []).find(x => Number(x.id) === Number(id));
  if (!z) return;
  zonaEditId = Number(id);
  document.getElementById('zona-modal-nombre').innerText = z.nombre;
  document.getElementById('zona-estado').value = (z.activo === false) ? 'inactivo' : 'activo';
  const modalEl = document.getElementById('zonaModal');
  if (!modalEl) return;
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
}

function saveZona() {
  if (zonaEditId === null) return;
  const activo = document.getElementById('zona-estado').value === 'activo';
  const zona = (zonasData || []).find(x => Number(x.id) === Number(zonaEditId));
  apiFetch('/api/zonas/' + zonaEditId, {
    method: 'PUT',
    body: JSON.stringify({ nombre: (zona && zona.nombre) || '', activo })
  }).then(({ status, body }) => {
    if (status !== 200) { showToast(body.error || 'Error al guardar la zona.', 'error'); return; }
    const modalEl = document.getElementById('zonaModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
    loadZonas();
    showToast('Zona actualizada correctamente.', 'success');
  });
}

function addZona() {
  const input = document.getElementById('zona-nombre-input');
  const nombre = input ? input.value.trim() : '';
  if (!nombre) return alert('Escribí el nombre de la zona.');
  apiFetch('/api/zonas', {
    method: 'POST',
    body: JSON.stringify({ nombre })
  }).then(({ status, body }) => {
    if (status !== 201) return alert(body.error || 'Error al crear zona.');
    input.value = '';
    loadZonas();
    showToast('Zona creada', 'success');
  });
}

function deleteZona(id) {
  if (!confirm('⚠️ ADVERTENCIA: Eliminar esta zona la quitará de la lista de zonas disponibles, pero NO eliminará los grupos ni publicaciones que la usan. Esos grupos seguirán mostrando esta zona en sus filas.\n\n¿Eliminar esta zona de la lista?')) return;
  apiFetch('/api/zonas/' + id, { method: 'DELETE' })
    .then(({ status, body }) => {
      if (status !== 200) { alert(body.error || 'Error al eliminar.'); return; }
      loadZonas();
      showToast('Zona eliminada', 'success');
    });
}

// Agrega a la lista de zonas configuradas las zonas que aparecen en los datos
// (publicaciones y grupos) y todavía no figuran en la tabla.
function syncZonas() {
  if (!canEditZonas()) return;
  const names = new Map();
  const add = (n) => {
    const s = String(n || '').trim();
    if (!s) return;
    const k = normFilterVal(s);
    if (k === 'todos') return;
    if (!names.has(k)) names.set(k, s);
  };
  marketingData.forEach(r => add(r.zona));
  gruposData.forEach(g => add(g.zona));

  const existing = new Set((zonasData || []).map(z => normFilterVal(z.nombre)));
  const missing = [...names.values()].filter(n => !existing.has(normFilterVal(n)));
  if (!missing.length) {
    showToast('Todas las zonas ya están sincronizadas.', 'success');
    return;
  }

  const btn = document.getElementById('btn-sync-zonas');
  const original = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Sincronizando...'; }

  let added = 0;
  let chain = Promise.resolve();
  missing.forEach(n => {
    chain = chain.then(() => apiFetch('/api/zonas', {
      method: 'POST',
      body: JSON.stringify({ nombre: n })
    }).then(({ status }) => { if (status === 201) added++; }));
  });
  chain.finally(() => {
    if (btn) { btn.disabled = false; btn.innerHTML = original; }
    loadZonas();
    showToast(added + ' zona(s) sincronizada(s).', added > 0 ? 'success' : 'error');
  });
}

function logVisit() {
  apiFetch('/api/logs/visit', { method: 'POST' }).catch(() => {});
}

function enterApp(user) {
  const initials = user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  document.getElementById('display-avatar').innerText = initials;
  document.getElementById('display-user-name').innerText = user.name;
  document.getElementById('nav-avatar').innerText = initials;
  document.getElementById('nav-user-name').innerText = user.name.split(' ')[0];
  currentRole = user.role;
  const badge = document.getElementById('display-user-role');
  badge.className = 'user-role-badge ' + (user.role === 'admin' ? 'badge-admin' : 'badge-colab');
  badge.innerText = user.role === 'admin' ? 'Admin' : user.role;
  const isAdmin = user.role === 'admin';
  const gestionLabel = document.getElementById('gestion-label');
  const gestionItems = document.getElementById('gestion-items');
  if (gestionLabel) gestionLabel.style.display = isAdmin ? '' : 'none';
  if (gestionItems) gestionItems.style.display = isAdmin ? '' : 'none';
  loadMarketingData();
  loadGrupos();
  loadHistorial();
  loadZonas();
  logVisit();
    if (isAdmin) {
      loadUsers();
      loadRoles();
    }
  document.getElementById('current-page-title').innerText = 'Dashboard Publicaciones';
  document.getElementById('current-page-subtitle').innerText = 'Rendimiento en tiempo real de cuentas de Facebook';

  setInterval(() => {
    loadMarketingData(true);
    loadGrupos(true);
    loadHistorial(true);
  }, 60000);
}

if ('serviceWorker' in navigator) {
  let swReloaded = false;
  navigator.serviceWorker.register('/sw.js').catch(() => {});
  navigator.serviceWorker.ready.then(() => {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!swReloaded) {
          swReloaded = true;
          window.location.reload();
        }
      });
    }
  });
}

/* Shared navigation: desktop preference and accessible mobile drawer. */
let sidebarTrigger = null;
function setSidebarOpen(open, remember = false) {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  const mobile = window.matchMedia('(max-width: 1024px)').matches;
  sidebar.classList.toggle('open', open);
  document.body.classList.toggle('sidebar-open', open);
  sidebar.inert = !open;
  sidebar.setAttribute('aria-hidden', String(!open));
  document.querySelectorAll('.sidebar-toggle').forEach(button => {
    button.setAttribute('aria-controls', sidebar.id);
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', button.closest('.sidebar') ? 'Cerrar menú' : 'Abrir menú');
  });
  const main = document.querySelector('.main-content');
  if (main) main.inert = mobile && open;
  if (remember && !mobile) localStorage.setItem('sidebarOpen', String(open));
}

function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  const open = !sidebar.classList.contains('open');
  if (open) sidebarTrigger = document.activeElement;
  setSidebarOpen(open, true);
  if (open && window.matchMedia('(max-width: 1024px)').matches) {
    sidebar.querySelector('.sidebar-toggle').focus();
  } else if (!open && sidebarTrigger && sidebarTrigger.isConnected) {
    sidebarTrigger.focus();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const main = document.querySelector('.main-content');
  const sidebar = document.querySelector('.sidebar');
  if (main) {
    main.id = main.id || 'main-content';
    main.tabIndex = -1;
    const skip = document.createElement('a');
    skip.className = 'skip-link';
    skip.href = '#' + main.id;
    skip.textContent = 'Saltar al contenido';
    document.body.prepend(skip);
  }
  if (sidebar) {
    sidebar.id = sidebar.id || 'main-navigation';
    sidebar.setAttribute('aria-label', 'Menú principal');
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    document.body.appendChild(overlay);
    const mobile = window.matchMedia('(max-width: 1024px)');
    const restore = () => setSidebarOpen(!mobile.matches && localStorage.getItem('sidebarOpen') === 'true');
    restore();
    mobile.addEventListener('change', restore);
    const close = () => {
      if (!mobile.matches || !sidebar.classList.contains('open')) return;
      setSidebarOpen(false);
      document.querySelector('.top-navbar .sidebar-toggle')?.focus();
    };
    overlay.addEventListener('click', close);
    sidebar.addEventListener('click', event => {
      if (event.target.closest('.menu-item')) close();
    });
    document.addEventListener('keydown', event => {
      if (!mobile.matches || !sidebar.classList.contains('open')) return;
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key !== 'Tab') return;
      const items = [...sidebar.querySelectorAll('a[href], button, [tabindex="0"]')]
        .filter(el => !el.disabled && el.getClientRects().length);
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    sidebar.querySelectorAll('div.menu-item[onclick]').forEach(item => {
      item.setAttribute('role', 'button');
      item.tabIndex = 0;
      item.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); item.click(); }
      });
    });
  }
  document.querySelectorAll('.table-responsive').forEach((region, index) => {
    region.tabIndex = 0;
    region.setAttribute('role', 'region');
    const title = region.closest('.data-table-card')?.querySelector('.table-card-title');
    region.setAttribute('aria-label', (title?.textContent.trim() || 'Tabla ' + (index + 1)) + '. Desplazamiento horizontal disponible.');
  });
  document.querySelectorAll('label:not([for])').forEach(label => {
    const control = label.parentElement.querySelector('input[id], select[id], textarea[id]');
    if (control) label.htmlFor = control.id;
  });
});
