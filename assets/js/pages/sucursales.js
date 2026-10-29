        const EMPRESAS = ['Pluma Blanca SRL', 'Potage SRL', 'El Triángulo S.A', 'La Sorpresa SRL'];
let sucursalesData = [];
        let sucursalesZonasData = [];
        const ZONA_OTRO = '__OTRO__';

        function fillEmpresaSelects() {
            const formSel = document.getElementById('sucursal-empresa');
            const current = formSel.value;
            formSel.innerHTML = '<option value="">Seleccionar...</option>';
            EMPRESAS.forEach(e => {
                const o = document.createElement('option');
                o.value = e; o.textContent = e;
                formSel.appendChild(o);
            });
            formSel.value = current;

            const filterSel = document.getElementById('sucursales-filter-empresa');
            const curFilter = filterSel.value;
            filterSel.innerHTML = '<option value="">Todas las empresas</option>';
            EMPRESAS.forEach(e => {
                const o = document.createElement('option');
                o.value = e; o.textContent = e;
                filterSel.appendChild(o);
            });
            filterSel.value = curFilter;
        }

function fillZonaSelects() {
            const zonas = [...new Set([
                ...sucursalesData.map(s => s.zona).filter(Boolean),
                ...(sucursalesZonasData || []).map(z => z.nombre).filter(Boolean)
            ])].sort();
            const formSel = document.getElementById('sucursal-zona');
            const current = formSel.value;
            formSel.innerHTML = '<option value="">Sin zona (OTRO)</option>';
            zonas.forEach(z => {
                const o = document.createElement('option');
                o.value = z; o.textContent = z;
                formSel.appendChild(o);
            });
            formSel.value = current;

            const filterSel = document.getElementById('sucursales-filter-zona');
            const curFilter = filterSel.value;
            filterSel.innerHTML = '<option value="">Todas las zonas</option>';
            zonas.forEach(z => {
                const o = document.createElement('option');
                o.value = z; o.textContent = z;
                filterSel.appendChild(o);
            });
            const otroOpt = document.createElement('option');
            otroOpt.value = ZONA_OTRO; otroOpt.textContent = 'OTRO';
            filterSel.appendChild(otroOpt);
            filterSel.value = curFilter;
        }

let _lastSucursalesSnapshot = '';
        function loadSucursales(silent) {
            const tbody = document.getElementById('sucursales-table-body');
            const cols = 8;
            if (!silent) tbody.innerHTML = '<tr><td colspan="' + cols + '" class="text-center text-muted">Cargando...</td></tr>';
            Promise.all([
                authFetch(API_BASE + '/api/sucursales'),
                authFetch(API_BASE + '/api/zonas')
            ])
                .then(([rSuc, rZonas]) => Promise.all([
                    rSuc.json().then(b => ({ status: rSuc.status, body: b })),
                    rZonas.json().then(b => ({ status: rZonas.status, body: b }))
                ]))
                .then(([sucRes, zonasRes]) => {
                    if (sucRes.status !== 200) {
                        if (!silent) tbody.innerHTML = '<tr><td colspan="' + cols + '" class="text-center text-danger">' + escHtml(sucRes.body.error || 'Error') + '</td></tr>';
                        return;
                    }
                    const newData = sucRes.body.data || [];
                    const newZonas = zonasRes.status === 200 ? (zonasRes.body.data || []) : sucursalesZonasData;
                    const snap = JSON.stringify([newData, newZonas]);
                    if (silent && snap === _lastSucursalesSnapshot) return;
                    _lastSucursalesSnapshot = snap;
                    sucursalesData = newData;
                    sucursalesZonasData = newZonas;
                    fillEmpresaSelects();
                    fillZonaSelects();
                    renderSucursales();
                    document.getElementById('sucursales-count').innerText = sucursalesData.length;
    
                })
                .catch(() => {
                    if (!silent) tbody.innerHTML = '<tr><td colspan="' + cols + '" class="text-center text-muted">Error de conexión</td></tr>';
                });
        }

        function renderSucursales() {
            const tbody = document.getElementById('sucursales-table-body');
            const empresaFilter = document.getElementById('sucursales-filter-empresa').value;
            const zonaFilter = document.getElementById('sucursales-filter-zona').value;
            const search = (document.getElementById('sucursales-search').value || '').toLowerCase().trim();

            let filtered = sucursalesData;
            if (empresaFilter) filtered = filtered.filter(s => s.empresa === empresaFilter);
            if (zonaFilter) {
                filtered = zonaFilter === ZONA_OTRO
                    ? filtered.filter(s => !s.zona)
                    : filtered.filter(s => s.zona === zonaFilter);
            }
            if (search) {
                filtered = filtered.filter(s =>
                    (s.empresa || '').toLowerCase().includes(search) ||
                    (s.ubicacion || '').toLowerCase().includes(search) ||
                    (s.direccion || '').toLowerCase().includes(search) ||
                    (s.contacto || '').toLowerCase().includes(search) ||
                    (s.horario || '').toLowerCase().includes(search) ||
                    (s.zona || '').toLowerCase().includes(search)
                );
            }

            tbody.innerHTML = '';
            filtered.forEach((s, i) => {
                const tr = document.createElement('tr');
                tr.style.animation = 'fadeSlideUp 0.3s ease-out forwards';
                tr.style.animationDelay = (i * 0.03) + 's';
                const zonaDisplay = s.zona
                    ? '<span class="badge-zone zone-' + escHtml(s.zona.toLowerCase().replace(/ /g, '-')) + '">' + escHtml(s.zona) + '</span>'
                    : '<span class="badge-zone zone-otro">OTRO</span>';
                const activoBadge = s.activo !== false
                    ? '<span class="badge-estatus est-publicada">Activo</span>'
                    : '<span class="badge-estatus est-eliminada">Inactivo</span>';
                tr.innerHTML = `
                    <td class="small fw-medium">${escHtml(s.empresa || '—')}</td>
                    <td class="fw-semibold">${escHtml(s.ubicacion || '—')}</td>
                    <td class="small">${escHtml(s.direccion || '—')}</td>
                    <td class="small">${escHtml(s.contacto || '—')}</td>
                    <td class="small text-muted">${escHtml(s.horario || '—')}</td>
                    <td class="text-center">${zonaDisplay}</td>
                    <td class="text-center">${activoBadge}</td>
                    <td class="text-center">
                        <small class="d-block text-muted mb-2">${escHtml((()=>{const marketing=sucursalesZonasData.find(z=>z.sucursal_id===s.precio_id);return marketing?'Redes: '+marketing.nombre+' · '+(marketing.activo===false?'Inactivo':'Activo'):'Sin vínculo de redes';})())}</small>
                        ${s.precio_id && hasPermission('view_productos') ? '<a class="btn btn-sm btn-outline-primary me-2" href="productos.html?sucursal=' + encodeURIComponent(s.precio_id) + '">Ver precios</a>' : ''}
                        <button class="btn btn-link text-primary p-0 mx-1" onclick="editSucursal(${s.rowIndex})" title="Editar"><i class="bi bi-pencil-fill"></i></button>
                        <button class="btn btn-link text-danger p-0 mx-1" onclick="deleteSucursal(${s.rowIndex}, decodeURIComponent('${encArg(s.ubicacion)}'))" title="Eliminar"><i class="bi bi-trash3-fill"></i></button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
            if (!filtered.length) {
                tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Sin resultados</td></tr>';
            }
        }

        function openAddSucursal() {
            document.getElementById('sucursal-modal-title').innerHTML = '<i class="bi bi-plus-circle-fill me-2"></i>Agregar Sucursal';
            document.getElementById('sucursal-row-index').value = '';
            document.getElementById('sucursal-empresa').value = '';
            document.getElementById('sucursal-ubicacion').value = '';
            document.getElementById('sucursal-direccion').value = '';
            document.getElementById('sucursal-contacto').value = '';
            document.getElementById('sucursal-horario').value = '';
            document.getElementById('sucursal-zona').value = '';
            document.getElementById('sucursal-activo').value = 'true';
            fillEmpresaSelects();
            fillZonaSelects();
            new bootstrap.Modal(document.getElementById('sucursalModal')).show();
        }

        function saveSucursal(e) {
            e.preventDefault();
            const btn = document.getElementById('sucursal-save-btn');
            if (btn.disabled) return;
            const empresa = document.getElementById('sucursal-empresa').value;
            const ubicacion = document.getElementById('sucursal-ubicacion').value.trim();
            const direccion = document.getElementById('sucursal-direccion').value.trim();
            const contacto = document.getElementById('sucursal-contacto').value.trim();
            const horario = document.getElementById('sucursal-horario').value.trim();
            const zona = document.getElementById('sucursal-zona').value;
            const activo = document.getElementById('sucursal-activo').value === 'true';
            if (!empresa) return alert('Seleccioná la empresa.');
            if (!ubicacion) return alert('La ubicación es obligatoria.');

            const rowIndex = document.getElementById('sucursal-row-index').value;
            const method = rowIndex ? 'PUT' : 'POST';
            const url = rowIndex ? '/api/sucursales/' + rowIndex : '/api/sucursales';
            const existing = rowIndex ? sucursalesData.find(x => String(x.rowIndex) === String(rowIndex)) : null;
            const lat = existing ? (existing.lat || '') : '';
            const lng = existing ? (existing.lng || '') : '';

            const originalHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando...';

            authFetch(API_BASE + url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ empresa, ubicacion, direccion, contacto, horario, zona, activo, lat, lng })
            })
                .then(r => r.json())
                .then(res => {
                    btn.disabled = false;
                    btn.innerHTML = originalHtml;
                    if (res.error) return alert(res.error);
                    bootstrap.Modal.getInstance(document.getElementById('sucursalModal')).hide();
                    showToast(res.message || 'Sucursal guardada', 'success');
                    loadSucursales();
                })
                .catch(() => {
                    btn.disabled = false;
                    btn.innerHTML = originalHtml;
                    alert('Error de conexión con el servidor. Intentalo de nuevo.');
                });
        }

        function editSucursal(rowIndex) {
            const s = sucursalesData.find(x => x.rowIndex === rowIndex);
            if (!s) return;
            document.getElementById('sucursal-modal-title').innerHTML = '<i class="bi bi-pencil-fill me-2"></i>Editar Sucursal';
            document.getElementById('sucursal-row-index').value = rowIndex;
            fillEmpresaSelects();
            document.getElementById('sucursal-empresa').value = s.empresa || '';
            document.getElementById('sucursal-ubicacion').value = s.ubicacion || '';
            document.getElementById('sucursal-direccion').value = s.direccion || '';
            document.getElementById('sucursal-contacto').value = s.contacto || '';
            document.getElementById('sucursal-horario').value = s.horario || '';
            fillZonaSelects();
            document.getElementById('sucursal-zona').value = s.zona || '';
            document.getElementById('sucursal-activo').value = s.activo !== false ? 'true' : 'false';
            new bootstrap.Modal(document.getElementById('sucursalModal')).show();
        }

        function deleteSucursal(rowIndex, ubicacion) {
            if (!confirm('¿Eliminar esta sucursal permanentemente?\n\n' + (ubicacion || ''))) return;
            authFetch(API_BASE + '/api/sucursales/' + rowIndex, {
                method: 'DELETE'
            })
                .then(r => r.json())
                .then(res => {
                    if (res.error) return alert(res.error);
                    loadSucursales();
                    showToast(res.message || 'Sucursal eliminada', 'success');
                });
        }

        document.addEventListener('DOMContentLoaded', () => {
            const session = getCurrentSession();
            if (!session) {
                window.location.href = 'index.html';
                return;
            }
            guardPage('view_sucursales');
            const initials = session.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            document.getElementById('display-avatar').innerText = initials;
            document.getElementById('display-user-name').innerText = session.name;
            document.getElementById('nav-avatar').innerText = initials;
            document.getElementById('nav-user-name').innerText = session.name.split(' ')[0];
            const sessionRole = (session.role || '').toLowerCase();
            const isAdmin = sessionRole === 'admin';
            const gestionLabel = document.getElementById('gestion-label');
            const gestionItems = document.getElementById('gestion-items');
            if (gestionLabel) gestionLabel.style.display = isAdmin ? '' : 'none';
            if (gestionItems) gestionItems.style.display = isAdmin ? '' : 'none';
            loadSucursales();
            setInterval(() => loadSucursales(true), 60000);
        });
    
