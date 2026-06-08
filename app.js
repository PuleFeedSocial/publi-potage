const API_BASE = window.location.origin.startsWith('http') ? window.location.origin : 'http://localhost:3000';

function getCurrentSession() {
  const data = localStorage.getItem('user');
  return data ? JSON.parse(data) : null;
}

function getToken() {
  return localStorage.getItem('token') || '';
}

function setSession(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify({ id: user.id, name: user.name, email: user.email, role: user.role }));
}

function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  headers['Authorization'] = 'Bearer ' + getToken();
  return fetch(API_BASE + path, { ...options, headers })
    .then(res => res.json().then(data => ({ status: res.status, body: data })));
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
      setSession(body.token, body.user);
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
      setSession(body.token, body.user);
      alert('Cuenta creada exitosamente.');
      window.location.href = 'dashboard.html';
    })
    .catch(() => alert('Error de conexión con el servidor.'));
}

function logout() {
  if (!confirm('¿Cerrar sesión?')) return;
  clearSession();
  window.location.href = 'index.html';
}

let currentRole = '';
let chartsInstances = {};

const localMarketingData = {
  timeline: [
    { fecha: '01/06/2026', publicaciones: 3, visualizaciones: 79, interacciones: 17, mensajes: 0 },
    { fecha: '02/06/2026', publicaciones: 1, visualizaciones: 582, interacciones: 175, mensajes: 22 },
    { fecha: '03/06/2026', publicaciones: 5, visualizaciones: 419, interacciones: 17, mensajes: 0 },
    { fecha: '04/06/2026', publicaciones: 2, visualizaciones: 0, interacciones: 29, mensajes: 0 },
    { fecha: '05/06/2026', publicaciones: 1, visualizaciones: 0, interacciones: 0, mensajes: 0 },
    { fecha: '06/06/2026', publicaciones: 3, visualizaciones: 0, interacciones: 0, mensajes: 0 },
    { fecha: '08/06/2026', publicaciones: 1, visualizaciones: 0, interacciones: 0, mensajes: 0 }
  ],
  tableRows: [
    { fecha: '02/06/2026', grupo: 'Marketplace', pub: 1, vis: 582, int: 175, com: 0, msj: 22, zona: 'Todos' },
    { fecha: '03/06/2026', grupo: 'Perfil Estandar', pub: 5, vis: 419, int: 17, com: 0, msj: 0, zona: 'Todos' },
    { fecha: '04/06/2026', grupo: 'Compra y vende San Miguel', pub: 1, vis: 0, int: 29, com: 2, msj: 0, zona: 'San Miguel' },
    { fecha: '06/06/2026', grupo: 'clasificados moreno,paso del rey, merlo,p', pub: 1, vis: 0, int: 0, com: 0, msj: 0, zona: 'San Miguel' },
    { fecha: '06/06/2026', grupo: 'Clasificados de merlo', pub: 1, vis: 0, int: 0, com: 0, msj: 0, zona: 'Merlo' },
    { fecha: '05/06/2026', grupo: 'MERLO NORTE CLASIFICADOS', pub: 1, vis: 0, int: 0, com: 0, msj: 0, zona: 'Merlo' },
    { fecha: '03/06/2026', grupo: 'COMPRA Y VENTA SAN MIGUEL BS AS', pub: 2, vis: 0, int: 0, com: 0, msj: 0, zona: 'San Miguel' },
    { fecha: '01/06/2026', grupo: 'Perfil Estandar', pub: 3, vis: 79, int: 17, com: 0, msj: 0, zona: 'Todos' },
    { fecha: '04/06/2026', grupo: 'VENTAS Y CAMBIOS LAFERRERE', pub: 1, vis: 0, int: 0, com: 0, msj: 0, zona: 'Laferrere' },
    { fecha: '08/06/2026', grupo: 'Cambios Merlo (zona oeste)', pub: 1, vis: 0, int: 0, com: 0, msj: 0, zona: 'Merlo' }
  ]
};

function switchView(viewName) {
  if (viewName === 'users' && currentRole !== 'admin') {
    alert('Acceso denegado: Solo los administradores pueden gestionar usuarios.');
    return;
  }
  document.getElementById('btn-nav-dashboard').classList.toggle('active', viewName === 'dashboard');
  document.getElementById('btn-nav-users').classList.toggle('active', viewName === 'users');
  document.getElementById('view-dashboard').classList.toggle('d-none', viewName !== 'dashboard');
  document.getElementById('view-users').classList.toggle('d-none', viewName !== 'users');
  const title = document.getElementById('current-page-title');
  const subtitle = document.getElementById('current-page-subtitle');
  if (viewName === 'dashboard') {
    title.innerText = 'Dashboard de Marketing';
    subtitle.innerText = 'Rendimiento en tiempo real de cuentas de Facebook';
  } else {
    title.innerText = 'Gestión de Usuarios y Códigos';
    subtitle.innerText = 'Administra los permisos y códigos de activación de tu equipo';
    loadUsers();
    loadCodes();
  }
}

function renderDashboard() {
  const tbody = document.getElementById('marketing-table-body');
  tbody.innerHTML = '';
  localMarketingData.tableRows.forEach(row => {
    let zClass = row.zona.toLowerCase().replace(/ /g, '-');
    tbody.innerHTML += `
      <tr>
        <td class="fw-medium text-dark">${row.fecha}</td>
        <td>${row.grupo}</td>
        <td class="text-center">${row.pub}</td>
        <td class="text-center fw-medium">${row.vis}</td>
        <td class="text-center text-success fw-medium">${row.int}</td>
        <td class="text-center">${row.com}</td>
        <td class="text-center text-indigo fw-medium">${row.msj}</td>
        <td><span class="badge-zone zone-${zClass}">${row.zona}</span></td>
      </tr>`;
  });
  initCharts(localMarketingData.timeline);
}

function initCharts(timeline) {
  const labels = timeline.map(t => t.fecha.substring(0, 5));

  chartsInstances.pubs = new Chart(document.getElementById('chartPublicaciones'), {
    type: 'line',
    data: { labels, datasets: [{ data: timeline.map(t => t.publicaciones), borderColor: '#0f172a', borderWidth: 2, tension: 0.3, pointRadius: 2, fill: false }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });

  chartsInstances.ints = new Chart(document.getElementById('chartInteracciones'), {
    type: 'line',
    data: { labels, datasets: [{ data: timeline.map(t => t.interacciones), borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.04)', borderWidth: 2, tension: 0.3, fill: true }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });

  chartsInstances.comp = new Chart(document.getElementById('chartComparativo'), {
    type: 'bar',
    data: {
      labels, datasets: [
        { label: 'Vis', data: timeline.map(t => t.visualizaciones), backgroundColor: '#93c5fd', borderRadius: 4 },
        { label: 'Msj', data: timeline.map(t => t.mensajes), backgroundColor: '#6366f1', borderRadius: 4 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { boxWidth: 10 } } } }
  });
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
    const isAdmin = u.role === 'admin';
    const canDelete = !isSelf && !isAdmin;
    tbody.innerHTML += `
      <tr>
        <td class="fw-semibold text-dark">${u.name}</td>
        <td>${u.email}</td>
        <td>
          <select class="form-select form-select-sm role-select" data-user-id="${u.id}" ${isSelf || isAdmin ? 'disabled' : ''}
            onchange="updateUserRole(${u.id}, this.value)">
            <option value="Colaborador" ${u.role === 'Colaborador' ? 'selected' : ''}>Colaborador</option>
            <option value="Admin" ${u.role === 'Admin' ? 'selected' : ''}>Admin</option>
          </select>
        </td>
        <td>${u.fecha ? u.fecha.substring(0, 10) : '-'}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-link text-danger p-0" onclick="deleteUser(${u.id})" ${canDelete ? '' : 'disabled style="opacity:0.2;"'}>
            <i class="bi bi-trash3-fill"></i>
          </button>
        </td>
      </tr>`;
  });
}

function updateUserRole(userId, newRole) {
  if (!confirm('¿Cambiar el rol de este usuario a ' + newRole + '?')) return;
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
        <td class="font-monospace fw-semibold">${c.code}</td>
        <td><span class="user-role-badge ${statusClass}">${statusText}</span></td>
        <td class="text-muted small">${usedBy}</td>
        <td class="text-muted small">${c.created_at ? c.created_at.substring(0, 10) : '-'}</td>
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

function enterApp(user) {
  const initials = user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  document.getElementById('display-avatar').innerText = initials;
  document.getElementById('display-user-name').innerText = user.name;
  document.getElementById('nav-avatar').innerText = initials;
  document.getElementById('nav-user-name').innerText = user.name.split(' ')[0];
  currentRole = user.role;
  const badge = document.getElementById('display-user-role');
  badge.className = 'user-role-badge ' + (user.role === 'admin' || user.role === 'Admin' ? 'badge-admin' : 'badge-colab');
  badge.innerText = user.role === 'admin' ? 'Admin' : user.role;
  const isAdmin = user.role === 'admin' || user.role === 'Admin';
  document.getElementById('btn-nav-users').style.display = isAdmin ? '' : 'none';
  renderDashboard();
  if (isAdmin) {
    loadUsers();
  }
  document.getElementById('current-page-title').innerText = 'Dashboard de Marketing';
  document.getElementById('current-page-subtitle').innerText = 'Rendimiento en tiempo real de cuentas de Facebook';
}
