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
let gruposData = [];
let historialData = [];
let filterPeriod = 'all';

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
    title.innerText = 'Dashboard Publicaciones';
    subtitle.innerText = 'Rendimiento en tiempo real de cuentas de Facebook';
    showAnnouncement();
  } else {
    title.innerText = 'Gestión de Usuarios y Códigos';
    subtitle.innerText = 'Administra los permisos y códigos de activación de tu equipo';
    loadUsers();
    loadCodes();
    loadAnnouncementForm();
  }
}

function loadMarketingData() {
  const tbody = document.getElementById('marketing-table-body');
  tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Cargando...</td></tr>';

  fetch(API_BASE + '/api/marketing', {
    headers: { 'Authorization': 'Bearer ' + getToken() }
  })
    .then(r => r.text().then(text => ({ status: r.status, text })))
    .then(({ status, text }) => {
      let body;
      try { body = JSON.parse(text); } catch { body = { error: text.substring(0, 200) }; }

      if (status !== 200) {
        const msg = body.error || 'Error ' + status;
        document.getElementById('data-source-badge').innerHTML = '<i class="bi bi-exclamation-triangle text-danger"></i> ' + msg;
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">' + msg + '</td></tr>';
        return;
      }
      marketingData = body.data || [];
      document.getElementById('data-source-badge').innerHTML = '<i class="bi bi-database"></i> Google Sheets';
      document.getElementById('filter-fecha').value = '';
      populateFilterDropdowns();
      applyFilters();
    })
    .catch((err) => {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Error de red: ' + (err.message || 'desconocido') + '</td></tr>';
    });
}

function refreshMarketingData() {
  fetch(API_BASE + '/api/marketing/refresh', {
    headers: { 'Authorization': 'Bearer ' + getToken() }
  }).then(() => loadMarketingData()).catch(() => loadMarketingData());
}

function renderDashboard(data, chartData) {
  data = data || marketingData;
  chartData = chartData || data;
  const kpiData = data.filter(r => r.grupo !== 'Perfil Estandar');
  const grupos = [...new Set(kpiData.map(r => r.grupo).filter(Boolean))];
  const totalPubs = kpiData.reduce((s, r) => s + r.publicaciones, 0);
  const totalVis = kpiData.reduce((s, r) => s + r.visualizaciones, 0);
  const totalInt = kpiData.reduce((s, r) => s + r.interacciones, 0);
  const totalMsj = kpiData.reduce((s, r) => s + r.mensajes, 0);
  document.getElementById('kpi-grupos').innerText = grupos.length;
  document.getElementById('kpi-publicaciones').innerText = totalPubs;
  document.getElementById('kpi-visualizaciones').innerText = totalVis;
  document.getElementById('kpi-interacciones').innerText = totalInt;
  document.getElementById('kpi-mensajes').innerText = totalMsj;

  const tbody = document.getElementById('marketing-table-body');
  tbody.innerHTML = '';
  data.forEach((row, idx) => {
    let zClass = (row.zona || '').toLowerCase().replace(/ /g, '-');
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.dataset.row = JSON.stringify(row);
    tr.addEventListener('click', function() {
      openDetailModal(JSON.parse(this.dataset.row));
    });
    tr.innerHTML = `
        <td class="fw-medium text-dark">${row.fecha || ''}</td>
        <td>${row.grupo || ''}</td>
        <td class="text-center">${row.publicaciones}</td>
        <td class="text-center fw-medium">${row.visualizaciones}</td>
        <td class="text-center text-success fw-medium">${row.interacciones}</td>
        <td class="text-center">${row.comentarios}</td>
        <td class="text-center text-indigo fw-medium">${row.mensajes}</td>
        <td><span class="badge-zone zone-${zClass}">${row.zona || ''}</span></td>`;
    tbody.appendChild(tr);
  });
  initCharts(chartData);
}

function populateFilterDropdowns() {
  const grupos = [...new Set(marketingData.map(r => r.grupo).filter(Boolean))].filter(g => g !== 'Perfil Estandar');
  const zonas = [...new Set(marketingData.map(r => r.zona).filter(Boolean))];

  const selGrupo = document.getElementById('filter-grupo');
  if (selGrupo) {
    const current = selGrupo.value;
    selGrupo.innerHTML = '<option value="">Todos</option>';
    grupos.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v; opt.textContent = v;
      selGrupo.appendChild(opt);
    });
    selGrupo.value = current;
  }

  const selZona = document.getElementById('filter-zona');
  if (selZona) {
    const current = selZona.value;
    selZona.innerHTML = '<option value="">Todas</option>';
    zonas.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v; opt.textContent = v;
      selZona.appendChild(opt);
    });
    selZona.value = current;
  }

  const filterFecha = document.getElementById('filter-fecha');
  if (filterFecha) filterFecha.value = '';
}

function parseDate(str) {
  if (!str) return null;
  const parts = str.split('/');
  if (parts.length !== 3) return null;
  const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  return isNaN(d.getTime()) ? null : d;
}

function setPeriod(days) {
  filterPeriod = days;
  document.querySelectorAll('.filter-period').forEach(b => {
    b.classList.toggle('active', b.dataset.period === days);
  });
  applyFilters();
}

function buildPeriodLimit() {
  if (!filterPeriod || filterPeriod === 'all') return null;
  const now = new Date();
  const limit = new Date(now);
  limit.setDate(limit.getDate() - parseInt(filterPeriod));
  limit.setHours(0, 0, 0, 0);
  return limit;
}

function applyFilters() {
  const grupo = document.getElementById('filter-grupo').value;
  const zona = document.getElementById('filter-zona').value;
  const rawFecha = document.getElementById('filter-fecha').value;
  const fecha = rawFecha ? (() => { const p = rawFecha.split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; })() : '';
  const periodLimit = buildPeriodLimit();

  let filtered = marketingData;
  if (grupo) filtered = filtered.filter(r => r.grupo === grupo);
  if (zona) filtered = filtered.filter(r => r.zona === zona);
  if (fecha) filtered = filtered.filter(r => r.fecha === fecha);
  if (periodLimit) {
    filtered = filtered.filter(r => {
      const d = parseDate(r.fecha);
      return d && d >= periodLimit;
    });
  }

  let chartData = [...filtered.filter(r => r.grupo !== 'Perfil Estandar')];

  renderDashboard(filtered, chartData);
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
  filterPeriod = 'all';
  document.querySelectorAll('.filter-period').forEach(b => {
    b.classList.toggle('active', b.dataset.period === 'all');
  });

  let chartData = [...marketingData.filter(r => r.grupo !== 'Perfil Estandar')];
  renderDashboard(marketingData, chartData);
  const countEl = document.getElementById('results-count');
  if (countEl) countEl.innerText = marketingData.length + ' resultados';
}

function marketingFetch(method, body) {
  return fetch(API_BASE + '/api/marketing', {
    method, headers: { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' },
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
  fetch(API_BASE + '/api/marketing/' + rowIndex, {
    method: 'PUT',
    headers: { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()).then(res => {
    if (res.error) return;
    loadMarketingData();
  });
}

function postHistorial(snapshot) {
  fetch(API_BASE + '/api/historial', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' },
    body: JSON.stringify(snapshot)
  }).then(r => r.json()).then(res => {
    if (res.error) return;
    loadHistorial();
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

function loadGrupos() {
  fetch(API_BASE + '/api/grupos', {
    headers: { 'Authorization': 'Bearer ' + getToken() }
  })
    .then(r => r.json().then(b => ({ status: r.status, body: b })))
    .then(({ status, body }) => {
      if (status === 200) gruposData = body.data || [];
    })
    .catch(() => {});
}

function loadHistorial() {
  fetch(API_BASE + '/api/historial', {
    headers: { 'Authorization': 'Bearer ' + getToken() }
  })
    .then(r => r.json().then(b => ({ status: r.status, body: b })))
    .then(({ status, body }) => {
      if (status === 200) {
        historialData = body.data || [];
      }
    })
    .catch(() => {});
}

function populateSelects() {
  const zonas = [...new Set(marketingData.map(r => r.zona).filter(Boolean))];
  let grupos = [...new Set(gruposData.map(r => r.nombre).filter(Boolean))];
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
  document.getElementById('mk-fecha').value = new Date().toISOString().split('T')[0];
  document.getElementById('mk-fecha').disabled = false;
  document.getElementById('mk-grupo').value = '';
  document.getElementById('mk-grupo-custom').value = '';
  document.getElementById('mk-grupo-custom').classList.add('d-none');
  document.getElementById('mk-pubs').value = 0;
  document.getElementById('mk-vis').value = 0;
  document.getElementById('mk-int').value = 0;
  document.getElementById('mk-com').value = 0;
  document.getElementById('mk-msj').value = 0;
  document.getElementById('mk-zona').value = '';
  document.getElementById('mk-zona-custom').value = '';
  document.getElementById('mk-zona-custom').classList.add('d-none');
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

  const fecha = rowIndex
    ? (window._editOriginalFecha || '')
    : (() => { const p = rawFecha.split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : rawFecha; })();

  const data = {
    fecha,
    grupo: mkFieldValue('mk-grupo'),
    publicaciones: parseInt(document.getElementById('mk-pubs').value) || 0,
    visualizaciones: parseInt(document.getElementById('mk-vis').value) || 0,
    interacciones: parseInt(document.getElementById('mk-int').value) || 0,
    comentarios: parseInt(document.getElementById('mk-com').value) || 0,
    mensajes: parseInt(document.getElementById('mk-msj').value) || 0,
    zona: mkFieldValue('mk-zona')
  };
  if (!data.fecha || !data.grupo) return alert('Fecha y Grupo son obligatorios.');
  const isNewGrupo = document.getElementById('mk-grupo').value === '__otro__' && data.grupo;

  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yyyy = today.getFullYear();
  const fechaActualizacion = dd + '/' + mm + '/' + yyyy;

  const save = () => {
    try { bootstrap.Modal.getInstance(document.getElementById('mkModal')).hide(); } catch {}

    const snapshot = {
      fechaActualizacion: rowIndex ? fechaActualizacion : data.fecha,
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
      addMarketingRow(data, snapshot);
    }
  };

  let chain = Promise.resolve();
  if (isNewGrupo) {
    chain = chain.then(() =>
      fetch(API_BASE + '/api/grupos', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' },
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
                <td class="text-muted">${h.fechaActualizacion}</td>
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
    chartHtml = `
      <hr class="my-3">
      <h6 class="fw-semibold text-muted mb-2"><i class="bi bi-bar-chart-line me-1"></i>Métricas del grupo: ${row.grupo}</h6>
      <div class="btn-group btn-group-sm mb-2 w-100" role="group">
        <button type="button" class="btn btn-outline-secondary chart-grupo-metric active" data-metric="pubs" onclick="renderGrupoChart('${row.grupo}','pubs')">Publicaciones</button>
        <button type="button" class="btn btn-outline-secondary chart-grupo-metric" data-metric="vis" onclick="renderGrupoChart('${row.grupo}','vis')">Visualizaciones</button>
        <button type="button" class="btn btn-outline-secondary chart-grupo-metric" data-metric="ints" onclick="renderGrupoChart('${row.grupo}','ints')">Interacciones</button>
        <button type="button" class="btn btn-outline-secondary chart-grupo-metric" data-metric="msjs" onclick="renderGrupoChart('${row.grupo}','msjs')">Mensajes</button>
      </div>
      <div style="height:200px;">
        <canvas id="chartGrupo"></canvas>
      </div>`;
  }

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
    </div>
    ${histHtml}${chartHtml}`;

  const footer = `
    <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">Cerrar</button>
    <button type="button" class="btn btn-sm btn-outline-success" onclick="updateEntry(JSON.parse(decodeURIComponent('${encodeURIComponent(JSON.stringify(row))}')))">
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
    });
  }
  modal.show();
}

function updateEntry(rowData) {
  if (typeof rowData === 'string') rowData = JSON.parse(decodeURIComponent(rowData));
  const row = rowData;
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yyyy = today.getFullYear();

  const snapshot = {
    fechaActualizacion: dd + '/' + mm + '/' + yyyy,
    filaOrigen: row.rowIndex,
    grupo: row.grupo,
    fechaPublicacion: row.fecha,
    zona: row.zona,
    publicaciones: row.publicaciones,
    visualizaciones: row.visualizaciones,
    interacciones: row.interacciones,
    comentarios: row.comentarios,
    mensajes: row.mensajes
  };

  fetch(API_BASE + '/api/historial', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' },
    body: JSON.stringify(snapshot)
  }).then(r => r.json()).then(res => {
    if (res.error) return alert('Error al actualizar: ' + res.error);
    return fetch(API_BASE + '/api/historial', {
      headers: { 'Authorization': 'Bearer ' + getToken() }
    });
  }).then(r => {
    if (!r) return;
    return r.json().then(b => ({ status: r.status, body: b }));
  }).then(({ status, body }) => {
    if (status === 200) {
      historialData = body.data || [];
      openDetailModal(row);
    }
  }).catch(() => {});
}

function renderGrupoChart(grupo, metric) {
  metric = metric || 'pubs';
  document.querySelectorAll('.chart-grupo-metric').forEach(b => {
    b.classList.toggle('active', b.dataset.metric === metric);
  });

  if (window._grupoChart) { window._grupoChart.destroy(); window._grupoChart = null; }
  const canvas = document.getElementById('chartGrupo');
  if (!canvas) return;

  const METRIC_FIELD = { pubs: 'publicaciones', vis: 'visualizaciones', ints: 'interacciones', msjs: 'mensajes' };
  const METRIC_LABELS = { pubs: 'Publicaciones', vis: 'Visualizaciones', ints: 'Interacciones', msjs: 'Mensajes' };
  const METRIC_COLORS = { pubs: '#0f172a', vis: '#f59e0b', ints: '#10b981', msjs: '#6366f1' };
  const field = METRIC_FIELD[metric] || 'publicaciones';

  // Usar historial: filtrar por rowIndex del grupo (mas robusto que campo grupo)
  const groupRows = new Set(marketingData.filter(r => r.grupo === grupo).map(r => r.rowIndex));
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
  console.log('renderGrupoChart: grupo=' + grupo + ' metric=' + metric + ' field=' + field + ' labels=' + labels.join(', ') + ' values=' + values.join(','));

  if (labels.length === 1) {
    labels.unshift(''); labels.push('');
    values.unshift(null); values.push(null);
  }

  try {
    window._grupoChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: METRIC_LABELS[metric] || metric,
          data: values,
          borderColor: METRIC_COLORS[metric] || '#0f172a',
          backgroundColor: (METRIC_COLORS[metric] || '#0f172a') + '20',
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
        scales: { y: { ticks: { beginAtZero: true, precision: 0 } } }
      }
    });
  } catch (e) { console.warn('Grupo chart error:', e); }
}

function initCharts(chartData) {
  Object.values(chartsInstances).forEach(c => { try { c.destroy(); } catch {} });
  chartsInstances = {};

  console.log('initCharts: chartData rows=' + chartData.length + ' fechas=' + [...new Set(chartData.map(r => r.fecha))].join(', '));
  const latest = {};
  chartData.forEach(r => {
    const key = r.fecha + '|' + r.grupo;
    if (!latest[key] || r.rowIndex > latest[key].rowIndex) latest[key] = r;
  });
  const deduped = Object.values(latest);

  const fechas = [...new Set(deduped.map(r => r.fecha).filter(Boolean))].sort((a, b) => {
    const da = parseDate(a), db = parseDate(b);
    if (!da || !db) return 0;
    return da - db;
  });

  const labels = fechas.map(f => f.substring(0, 5));
  const pubs = fechas.map(f => deduped.filter(r => r.fecha === f).reduce((s, r) => s + (r.publicaciones || 0), 0));
  const ints = fechas.map(f => deduped.filter(r => r.fecha === f).reduce((s, r) => s + (r.interacciones || 0), 0));
  const msjs = fechas.map(f => deduped.filter(r => r.fecha === f).reduce((s, r) => s + (r.mensajes || 0), 0));

  console.log('initCharts: deduped=' + deduped.length + ' fechas_unicas=' + fechas.join(', ') + ' labels=' + labels.join(', ') + ' pubs=' + pubs.join(',') + ' ints=' + ints.join(',') + ' msjs=' + msjs.join(','));

  // Si hay una sola fecha, centrar el punto con padding de nulls a los costados
  if (labels.length === 1) {
    labels.unshift('');
    labels.push('');
    [pubs, ints, msjs].forEach(arr => { arr.unshift(null); arr.push(null); });
  }

  function makeChart(id, color, bg, dataArr, label) {
    const el = document.getElementById(id);
    if (!el) return;
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
          scales: { y: { ticks: { beginAtZero: true, precision: 0 } } }
        }
      });
    } catch (e) { console.warn('Chart error ' + id + ':', e); }
  }

  makeChart('chartPublicaciones', '#0f172a', null, pubs);
  makeChart('chartInteracciones', '#10b981', 'rgba(16, 185, 129, 0.1)', ints);
  makeChart('chartComparativo', '#6366f1', 'rgba(99, 102, 241, 0.1)', msjs, 'Msj');
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

// Anuncio del sistema (localStorage)
function saveAnnouncement() {
  const title = document.getElementById('announcement-title-input').value.trim();
  const msg = document.getElementById('announcement-msg-input').value.trim();
  if (!title && !msg) return alert('Escribí al menos un título o mensaje.');
  localStorage.setItem('system-announcement', JSON.stringify({ title, msg }));
  localStorage.removeItem('announcement-dismissed');
  showAnnouncement();
}

function clearAnnouncement() {
  localStorage.removeItem('system-announcement');
  localStorage.removeItem('announcement-dismissed');
  document.getElementById('announcement-title-input').value = '';
  document.getElementById('announcement-msg-input').value = '';
  const banner = document.getElementById('announcement-banner');
  if (banner) banner.classList.add('d-none');
}

function showAnnouncement() {
  const raw = localStorage.getItem('system-announcement');
  const banner = document.getElementById('announcement-banner');
  if (!banner) return;
  if (!raw || localStorage.getItem('announcement-dismissed')) { banner.classList.add('d-none'); return; }
  try {
    const { title, msg } = JSON.parse(raw);
    if (!title && !msg) { banner.classList.add('d-none'); return; }
    document.getElementById('announcement-title').textContent = title || '';
    document.getElementById('announcement-message').textContent = msg || '';
    banner.classList.remove('d-none');
  } catch { banner.classList.add('d-none'); }
}

function dismissAnnouncement() {
  localStorage.setItem('announcement-dismissed', 'true');
  const banner = document.getElementById('announcement-banner');
  if (banner) banner.classList.add('d-none');
}

function loadAnnouncementForm() {
  const raw = localStorage.getItem('system-announcement');
  if (!raw) return;
  try {
    const { title, msg } = JSON.parse(raw);
    document.getElementById('announcement-title-input').value = title || '';
    document.getElementById('announcement-msg-input').value = msg || '';
  } catch {}
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
  showAnnouncement();
  if (isAdmin) {
    loadUsers();
  }
  document.getElementById('current-page-title').innerText = 'Dashboard Publicaciones';
  document.getElementById('current-page-subtitle').innerText = 'Rendimiento en tiempo real de cuentas de Facebook';

  setInterval(() => {
    loadMarketingData();
    loadGrupos();
    loadHistorial();
  }, 60000);
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
