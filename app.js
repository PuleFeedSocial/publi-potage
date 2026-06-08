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
let marketingData = [];

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

function loadMarketingData() {
  fetch(API_BASE + '/api/marketing', {
    headers: { 'Authorization': 'Bearer ' + getToken() }
  })
    .then(r => r.json())
    .then(res => {
      marketingData = res.data || [];
      renderDashboard();
    })
    .catch(() => {
      document.getElementById('marketing-table-body').innerHTML =
        '<tr><td colspan="8" class="text-center text-muted">No se pudieron cargar los datos</td></tr>';
    });
}

function refreshMarketingData() {
  fetch(API_BASE + '/api/marketing/refresh', {
    headers: { 'Authorization': 'Bearer ' + getToken() }
  }).then(() => loadMarketingData()).catch(() => loadMarketingData());
}

function renderDashboard() {
  const data = marketingData;
  const grupos = [...new Set(data.map(r => r.grupo).filter(Boolean))];
  const totalPubs = data.reduce((s, r) => s + r.publicaciones, 0);
  const totalVis = data.reduce((s, r) => s + r.visualizaciones, 0);
  const totalInt = data.reduce((s, r) => s + r.interacciones, 0);
  const totalMsj = data.reduce((s, r) => s + r.mensajes, 0);
  document.getElementById('kpi-grupos').innerText = grupos.length;
  document.getElementById('kpi-publicaciones').innerText = totalPubs;
  document.getElementById('kpi-visualizaciones').innerText = totalVis;
  document.getElementById('kpi-interacciones').innerText = totalInt;
  document.getElementById('kpi-mensajes').innerText = totalMsj;

  const tbody = document.getElementById('marketing-table-body');
  tbody.innerHTML = '';
  data.forEach(row => {
    let zClass = (row.zona || '').toLowerCase().replace(/ /g, '-');
    tbody.innerHTML += `
      <tr onclick='openDetailModal(${encodeURIComponent(JSON.stringify(row))})' style="cursor:pointer;">
        <td class="fw-medium text-dark">${row.fecha || ''}</td>
        <td>${row.grupo || ''}</td>
        <td class="text-center">${row.publicaciones}</td>
        <td class="text-center fw-medium">${row.visualizaciones}</td>
        <td class="text-center text-success fw-medium">${row.interacciones}</td>
        <td class="text-center">${row.comentarios}</td>
        <td class="text-center text-indigo fw-medium">${row.mensajes}</td>
        <td><span class="badge-zone zone-${zClass}">${row.zona || ''}</span></td>
      </tr>`;
  });
  initCharts(data);
}

function marketingFetch(method, body) {
  return fetch(API_BASE + '/api/marketing', {
    method, headers: { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  }).then(r => r.json());
}

function addMarketingRow(data) {
  marketingFetch('POST', data).then(res => {
    if (res.error) return alert(res.error);
    loadMarketingData();
  });
}

function updateMarketingRow(rowIndex, data) {
  fetch(API_BASE + '/api/marketing/' + rowIndex, {
    method: 'PUT',
    headers: { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()).then(res => {
    if (res.error) return alert(res.error);
    loadMarketingData();
  });
}

function deleteMarketingRow(rowIndex) {
  if (!confirm('¿Eliminar esta fila permanentemente?')) return;
  fetch(API_BASE + '/api/marketing/' + rowIndex, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + getToken() }
  }).then(r => r.json()).then(res => {
    if (res.error) return alert(res.error);
    loadMarketingData();
  });
}

function openAddModal() {
  document.getElementById('mk-modal-title').innerHTML = '<i class="bi bi-plus-circle-fill me-2"></i>Agregar Publicación';
  document.getElementById('mk-row-index').value = '';
  document.getElementById('mk-fecha').value = '';
  document.getElementById('mk-grupo').value = '';
  document.getElementById('mk-pubs').value = 0;
  document.getElementById('mk-vis').value = 0;
  document.getElementById('mk-int').value = 0;
  document.getElementById('mk-com').value = 0;
  document.getElementById('mk-msj').value = 0;
  document.getElementById('mk-zona').value = '';
  document.getElementById('mk-delete-btn').classList.add('d-none');
  new bootstrap.Modal(document.getElementById('mkModal')).show();
}

function openEditModal(rowData) {
  if (typeof rowData === 'string') rowData = JSON.parse(decodeURIComponent(rowData));
  const row = rowData;
  document.getElementById('mk-modal-title').innerHTML = '<i class="bi bi-pencil-fill me-2"></i>Editar Publicación';
  document.getElementById('mk-row-index').value = row.rowIndex;
  document.getElementById('mk-fecha').value = row.fecha || '';
  document.getElementById('mk-grupo').value = row.grupo || '';
  document.getElementById('mk-pubs').value = row.publicaciones;
  document.getElementById('mk-vis').value = row.visualizaciones;
  document.getElementById('mk-int').value = row.interacciones;
  document.getElementById('mk-com').value = row.comentarios;
  document.getElementById('mk-msj').value = row.mensajes;
  document.getElementById('mk-zona').value = row.zona || '';
  document.getElementById('mk-delete-btn').classList.remove('d-none');
  document.getElementById('mk-delete-btn').onclick = () => {
    bootstrap.Modal.getInstance(document.getElementById('mkModal')).hide();
    deleteMarketingRow(row.rowIndex);
  };
  new bootstrap.Modal(document.getElementById('mkModal')).show();
}

function saveMarketingRow() {
  const data = {
    fecha: document.getElementById('mk-fecha').value.trim(),
    grupo: document.getElementById('mk-grupo').value.trim(),
    publicaciones: parseInt(document.getElementById('mk-pubs').value) || 0,
    visualizaciones: parseInt(document.getElementById('mk-vis').value) || 0,
    interacciones: parseInt(document.getElementById('mk-int').value) || 0,
    comentarios: parseInt(document.getElementById('mk-com').value) || 0,
    mensajes: parseInt(document.getElementById('mk-msj').value) || 0,
    zona: document.getElementById('mk-zona').value.trim()
  };
  if (!data.fecha || !data.grupo) return alert('Fecha y Grupo son obligatorios.');

  const rowIndex = document.getElementById('mk-row-index').value;
  try { bootstrap.Modal.getInstance(document.getElementById('mkModal')).hide(); } catch {}

  if (rowIndex) {
    updateMarketingRow(rowIndex, data);
  } else {
    addMarketingRow(data);
  }
}

function openDetailModal(rowData) {
  if (typeof rowData === 'string') rowData = JSON.parse(decodeURIComponent(rowData));
  const row = rowData;
  const html = `
    <div class="row g-3">
      <div class="col-6 col-md-4"><div class="text-muted small">Fecha</div><div class="fw-medium">${row.fecha || '—'}</div></div>
      <div class="col-6 col-md-4"><div class="text-muted small">Grupo</div><div class="fw-medium">${row.grupo || '—'}</div></div>
      <div class="col-6 col-md-4"><div class="text-muted small">Publicaciones</div><div class="fw-medium">${row.publicaciones}</div></div>
      <div class="col-6 col-md-4"><div class="text-muted small">Visualizaciones</div><div class="fw-medium">${row.visualizaciones}</div></div>
      <div class="col-6 col-md-4"><div class="text-muted small">Interacciones</div><div class="fw-medium">${row.interacciones}</div></div>
      <div class="col-6 col-md-4"><div class="text-muted small">Comentarios</div><div class="fw-medium">${row.comentarios}</div></div>
      <div class="col-6 col-md-4"><div class="text-muted small">Mensajes</div><div class="fw-medium">${row.mensajes}</div></div>
      <div class="col-6 col-md-4"><div class="text-muted small">Zona</div><div class="fw-medium">${row.zona || '—'}</div></div>
    </div>`;

  const footer = `
    <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">Cerrar</button>
    <button type="button" class="btn btn-sm btn-action-primary" onclick="bootstrap.Modal.getInstance(document.getElementById('detailModal')).hide();openEditModal('${encodeURIComponent(JSON.stringify(row))}')">
      <i class="bi bi-pencil-fill me-1"></i>Editar
    </button>
    <button type="button" class="btn btn-sm btn-outline-danger" onclick="if(confirm('¿Eliminar esta fila?')){bootstrap.Modal.getInstance(document.getElementById('detailModal')).hide();deleteMarketingRow(${row.rowIndex})}">
      <i class="bi bi-trash3-fill me-1"></i>Eliminar
    </button>`;

  document.getElementById('detailModalLabel').innerHTML = '<i class="bi bi-eye me-2"></i>Detalle de Publicación';
  document.getElementById('detailBody').innerHTML = html;
  document.getElementById('detailFooter').innerHTML = footer;
  new bootstrap.Modal(document.getElementById('detailModal')).show();
}

function initCharts(data) {
  const fechas = [...new Set(data.map(r => r.fecha).filter(Boolean))].sort();
  const labels = fechas.map(f => f.substring(0, 5));
  const pubs = fechas.map(f => data.filter(r => r.fecha === f).reduce((s, r) => s + r.publicaciones, 0));
  const vis = fechas.map(f => data.filter(r => r.fecha === f).reduce((s, r) => s + r.visualizaciones, 0));
  const ints = fechas.map(f => data.filter(r => r.fecha === f).reduce((s, r) => s + r.interacciones, 0));
  const msjs = fechas.map(f => data.filter(r => r.fecha === f).reduce((s, r) => s + r.mensajes, 0));

  chartsInstances.pubs = new Chart(document.getElementById('chartPublicaciones'), {
    type: 'line',
    data: { labels, datasets: [{ data: pubs, borderColor: '#0f172a', borderWidth: 2, tension: 0.3, pointRadius: 2, fill: false }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });

  chartsInstances.ints = new Chart(document.getElementById('chartInteracciones'), {
    type: 'line',
    data: { labels, datasets: [{ data: ints, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.04)', borderWidth: 2, tension: 0.3, fill: true }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });

  chartsInstances.comp = new Chart(document.getElementById('chartComparativo'), {
    type: 'bar',
    data: {
      labels, datasets: [
        { label: 'Vis', data: vis, backgroundColor: '#93c5fd', borderRadius: 4 },
        { label: 'Msj', data: msjs, backgroundColor: '#6366f1', borderRadius: 4 }
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
  loadMarketingData();
  if (isAdmin) {
    loadUsers();
  }
  document.getElementById('current-page-title').innerText = 'Dashboard de Marketing';
  document.getElementById('current-page-subtitle').innerText = 'Rendimiento en tiempo real de cuentas de Facebook';
}
