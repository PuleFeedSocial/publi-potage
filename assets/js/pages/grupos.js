        let gruposPageData = [];

        function populateZonas() {
            const zonas = [...new Set([...gruposPageData.map(g => g.zona).filter(Boolean), ...(window.zonasData || []).map(z => z.nombre).filter(Boolean)])];
            const sel = document.getElementById('grupo-page-zona');
            const current = sel.value;
            sel.innerHTML = '<option value="">Seleccionar...</option><option value="Todos">Todos</option>';
            zonas.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v; opt.textContent = v;
                sel.appendChild(opt);
            });
            sel.value = current;
        }

        function getZonaValue() {
            return document.getElementById('grupo-page-zona').value;
        }

        function saveGruposFilters() {
            localStorage.setItem('gruposFilterZona', document.getElementById('grupos-filter-zona').value);
            localStorage.setItem('gruposSort', document.getElementById('grupos-sort').value);
            localStorage.setItem('gruposSoloProblemas', document.getElementById('grupos-solo-problemas').checked ? '1' : '0');
        }

        function restoreGruposFilters() {
            const savedZona = localStorage.getItem('gruposFilterZona');
            const savedSort = localStorage.getItem('gruposSort');
            const savedSolo = localStorage.getItem('gruposSoloProblemas');
            const selZona = document.getElementById('grupos-filter-zona');
            const selSort = document.getElementById('grupos-sort');
            const chkSolo = document.getElementById('grupos-solo-problemas');
            if (selZona && savedZona) selZona.value = savedZona;
            if (selSort && savedSort) selSort.value = savedSort;
            if (chkSolo && savedSolo === '1') chkSolo.checked = true;
        }

        let _lastGruposSnapshot = '';
        function loadGruposPage(silent) {
            restoreGruposFilters();
            const tbody = document.getElementById('grupos-page-table-body');
            if (!silent) tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted">Cargando...</td></tr>';
            Promise.all([
                authFetch(API_BASE + '/api/grupos'),
                authFetch(API_BASE + '/api/marketing'),
                authFetch(API_BASE + '/api/zonas')
            ])
                .then(([rGrupos, rMarketing, rZonas]) => Promise.all([
                    rGrupos.json().then(b => ({ status: rGrupos.status, body: b })),
                    rMarketing.json().then(b => ({ status: rMarketing.status, body: b })),
                    rZonas.json().then(b => ({ status: rZonas.status, body: b }))
                ]))
                .then(([gruposRes, marketingRes, zonasRes]) => {
                    if (gruposRes.status !== 200) {
                        if (!silent) tbody.innerHTML = '<tr><td colspan="11" class="text-center text-danger">' + (gruposRes.body.error || 'Error') + '</td></tr>';
                        return;
                    }
                    const newGrupos = gruposRes.body.data || [];
                    const newZonas = zonasRes.status === 200 ? (zonasRes.body.data || []) : (window.zonasData || []);
                    const newMarketing = marketingRes.body.data || [];
                    const snap = JSON.stringify([newGrupos, newZonas, newMarketing]);
                    if (silent && snap === _lastGruposSnapshot) return;
                    _lastGruposSnapshot = snap;
                    gruposPageData = newGrupos;
                    if (zonasRes.status === 200) window.zonasData = newZonas;
                    const marketingData = newMarketing;
                    // Compute pubs per group
                    window._gruposPubs = {};
                    window._gruposEstatus = {};
                    marketingData.forEach(r => {
                        const g = r.grupo ? groupMetricKey(r.grupo,r.zona) : null;
                        if (g) {
                            if (isEstatusActivo(r.estatus)) {
                                window._gruposPubs[g] = (window._gruposPubs[g] || 0) + MarketingAnalysis.number(r.publicaciones);
                            }
                            if (!window._gruposEstatus[g]) window._gruposEstatus[g] = { PUBLICADA: 0, ELIMINADA: 0, SUPRIMIDA: 0, 'EN REVISION': 0, 'SIN DEFINIR': 0 };
                            const est = normFilterVal(r.estatus||'SIN DEFINIR').toUpperCase();
                            if (window._gruposEstatus[g][est] !== undefined) window._gruposEstatus[g][est]+=MarketingAnalysis.number(r.publicaciones);
                        }
                    });
                    // Populate zone filter
                    const zonas = [...new Set([...gruposPageData.map(g => g.zona).filter(Boolean), ...(window.zonasData || []).map(z => z.nombre).filter(Boolean)])].sort();
                    const selZona = document.getElementById('grupos-filter-zona');
                    const currentZona = selZona.value;
                    selZona.innerHTML = '<option value="">Todas las sucursales</option>';
                    zonas.forEach(z => { const o = document.createElement('option'); o.value = z; o.textContent = z; selZona.appendChild(o); });
                    selZona.value = currentZona;
                    renderGruposPage();

                })
                .catch(() => {
                    if (!silent) tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted">Error de conexión</td></tr>';
                });
        }

        function groupMetricKey(name,zone){return normFilterVal(name)+'|'+normFilterVal(zone);}
        function renderGruposPage() {
            const tbody = document.getElementById('grupos-page-table-body');
            const zonaFilter = document.getElementById('grupos-filter-zona').value;
            const sortMode = document.getElementById('grupos-sort').value;
            const soloProblemas = document.getElementById('grupos-solo-problemas').checked;
            const search = normFilterVal(document.getElementById('grupos-search').value);
            let filtered = gruposPageData;
            if (zonaFilter) filtered = filtered.filter(g => normFilterVal(g.zona) === normFilterVal(zonaFilter));
            if (search) {
                filtered = filtered.filter(g =>
                    normFilterVal(g.nombre).includes(search) ||
                    normFilterVal(g.zona).includes(search)
                );
            }
            if (soloProblemas) {
                filtered = filtered.filter(g => {
                    const e = window._gruposEstatus[groupMetricKey(g.nombre,g.zona)] || {};
                    return (e.SUPRIMIDA || 0) + (e.ELIMINADA || 0) + (e['EN REVISION'] || 0) > 0;
                });
            }
            if (sortMode) {
                filtered = [...filtered].sort((a, b) => {
                    const ea = window._gruposEstatus[groupMetricKey(a.nombre,a.zona)] || {};
                    const eb = window._gruposEstatus[groupMetricKey(b.nombre,b.zona)] || {};
                    if (sortMode === 'peores') {
                        const scoreA = (ea.SUPRIMIDA || 0) + (ea.ELIMINADA || 0) + (ea['EN REVISION'] || 0);
                        const scoreB = (eb.SUPRIMIDA || 0) + (eb.ELIMINADA || 0) + (eb['EN REVISION'] || 0);
                        return scoreB - scoreA;
                    }
                    if (sortMode === 'mejores') {
                        return (eb.PUBLICADA || 0) - (ea.PUBLICADA || 0);
                    }
                    return 0;
                });
            }
            tbody.innerHTML = '';
            filtered.forEach((g, i) => {
                const tr = document.createElement('tr');
                tr.style.animation = 'fadeSlideUp 0.3s ease-out forwards';
                tr.style.animationDelay = (i * 0.04) + 's';
                const pubs = window._gruposPubs[groupMetricKey(g.nombre,g.zona)] || 0;
                const est = window._gruposEstatus[groupMetricKey(g.nombre,g.zona)] || {};
                const enlaceSafe = g.enlace && /^https?:\/\//i.test(g.enlace) ? g.enlace : null;
                const enlaceDisplay = enlaceSafe
                    ? '<a href="' + escHtml(enlaceSafe) + '" target="_blank" rel="noopener noreferrer" class="small text-muted">' + escHtml(enlaceSafe.substring(0, 45)) + '...</a>'
                    : '<span class="text-muted small">—</span>';
                const fechaDisplay = g.fechaIngreso || '—';
                const malas = (est.SUPRIMIDA || 0) + (est.ELIMINADA || 0) + (est['EN REVISION'] || 0);
                const buenas = (est.PUBLICADA || 0);
                let rendBadge = '<span class="text-muted small">—</span>';
                if (buenas > 0 || malas > 0) {
                    const score = Math.round((buenas / (buenas + malas)) * 100);
                    const cls = score >= 70 ? 'est-publicada' : (score >= 40 ? 'est-suprimida' : 'est-eliminada');
                    rendBadge = '<span class="badge-estatus ' + cls + '">' + score + '%</span>';
                }
                const activoBadge = g.activo !== false
                    ? '<span class="badge-estatus est-publicada">Activo</span>'
                    : '<span class="badge-estatus est-eliminada">Inactivo</span>';
                tr.innerHTML = `
                    <td class="fw-medium">
                        <a href="#" class="text-decoration-none text-dark" onclick="editGrupoPage(${g.rowIndex});return false" title="Editar grupo">${escHtml(g.nombre)}</a>
                        <button class="btn btn-sm btn-link text-primary p-0 ms-1" onclick="editGrupoPage(${g.rowIndex})" title="Editar"><i class="bi bi-pencil-fill"></i></button>
                        <button class="btn btn-sm btn-link text-danger p-0 ms-1" onclick="deleteGrupoPage(${g.rowIndex})" title="Eliminar"><i class="bi bi-trash3-fill"></i></button>
                    </td>
                    <td class="small">${enlaceDisplay}</td>
                    <td><span class="badge-zone zone-${escHtml((g.zona || '').toLowerCase().replace(/ /g, '-'))}">${escHtml(g.zona || '—')}</span></td>
                    <td class="text-center small text-muted">${escHtml(fechaDisplay)}</td>
                    <td class="text-center fw-semibold text-primary">${pubs}</td>
                    <td class="text-center">${activoBadge}</td>
                    <td class="text-center">${rendBadge}</td>
                    <td class="text-center"><button class="btn btn-sm btn-outline-secondary" onclick="openGrupoDetailModal(decodeURIComponent('${encArg(g.nombre)}'))"><i class="bi bi-eye" aria-hidden="true"></i><span class="visually-hidden">Ver detalle del grupo</span></button></td>
                `;
                tbody.appendChild(tr);
            });
            if (!filtered.length) {
                tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Sin resultados</td></tr>';
            }
            // Update total pubs
            const totalPubs = filtered.reduce((s, g) => s + (window._gruposPubs[groupMetricKey(g.nombre,g.zona)] || 0), 0);
            document.getElementById('grupos-pubs-total').innerText = totalPubs;document.getElementById('grupos-count').innerText=filtered.length+' de '+gruposPageData.length;
        }

        function openAddGrupo() {
            document.getElementById('grupo-page-modal-title').innerHTML = '<i class="bi bi-plus-circle-fill me-2"></i>Agregar Grupo';
            document.getElementById('grupo-page-row-index').value = '';
            document.getElementById('grupo-page-nombre').value = '';
            document.getElementById('grupo-page-enlace').value = '';
            document.getElementById('grupo-page-zona').value = '';
            document.getElementById('grupo-page-fecha').value = '';
            document.getElementById('grupo-page-activo').value = 'true';
            populateZonas();
            new bootstrap.Modal(document.getElementById('grupoPageModal')).show();
        }

        function saveGrupoPage(e) {
            e.preventDefault();
            const nombre = document.getElementById('grupo-page-nombre').value.trim();
            const enlace = document.getElementById('grupo-page-enlace').value.trim();
            const zona = getZonaValue();
            const fechaIngreso = document.getElementById('grupo-page-fecha').value.trim();
            const activo = document.getElementById('grupo-page-activo').value === 'true';
            if (!nombre) return alert('El nombre del grupo es obligatorio.');

            const rowIndex = document.getElementById('grupo-page-row-index').value;
            const method = rowIndex ? 'PUT' : 'POST';
            const url = rowIndex ? '/api/grupos/' + rowIndex : '/api/grupos';

            authFetch(API_BASE + url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre, enlace, zona, fechaIngreso, activo })
            })
                .then(r => r.json())
                .then(res => {
                    if (res.error) return alert(res.error);
                    bootstrap.Modal.getInstance(document.getElementById('grupoPageModal')).hide();
                    loadGruposPage();
                    showToast(res.message || 'Grupo guardado', 'success');
                });
        }

        function editGrupoPage(rowIndex) {
            const g = gruposPageData.find(x => x.rowIndex === rowIndex);
            if (!g) return;
            document.getElementById('grupo-page-modal-title').innerHTML = '<i class="bi bi-pencil-fill me-2"></i>Editar Grupo';
            document.getElementById('grupo-page-row-index').value = rowIndex;
            document.getElementById('grupo-page-nombre').value = g.nombre;
            document.getElementById('grupo-page-enlace').value = g.enlace || '';
            document.getElementById('grupo-page-fecha').value = g.fechaIngreso || '';
            populateZonas();
            document.getElementById('grupo-page-zona').value = g.zona || '';
            document.getElementById('grupo-page-activo').value = g.activo !== false ? 'true' : 'false';
            new bootstrap.Modal(document.getElementById('grupoPageModal')).show();
        }

        function deleteGrupoPage(rowIndex) {
            if (!confirm('¿Eliminar este grupo permanentemente?')) return;
            authFetch(API_BASE + '/api/grupos/' + rowIndex, {
                method: 'DELETE'
            })
                .then(r => r.json())
                .then(res => {
                    if (res.error) return alert(res.error);
                    loadGruposPage();
                    showToast(res.message || 'Grupo eliminado', 'success');
                });
        }

        function openGrupoDetailModal(nombre) {
            const g = gruposPageData.find(x => x.nombre === nombre);
            if (!g) return;
            const pubs = window._gruposPubs[groupMetricKey(g.nombre,g.zona)] || 0;
            const est = window._gruposEstatus[groupMetricKey(g.nombre,g.zona)] || {};
            const malas = (est.SUPRIMIDA || 0) + (est.ELIMINADA || 0) + (est['EN REVISION'] || 0);
            const buenas = (est.PUBLICADA || 0);
            let rendicion = '—';
            if (buenas > 0 || malas > 0) {
                rendicion = Math.round((buenas / (buenas + malas)) * 100) + '%';
            }

            document.getElementById('detail-grupo-nombre').innerText = g.nombre;
            const enlaceEl = document.getElementById('detail-grupo-enlace');
            if (g.enlace && /^https?:\/\//i.test(g.enlace)) {
                enlaceEl.innerHTML = '<a href="' + g.enlace + '" target="_blank" rel="noopener noreferrer" rel="noopener">' + g.enlace + '</a>';
            } else {
                enlaceEl.innerText = g.enlace || '—';
            }
            document.getElementById('detail-grupo-pubs').innerText = pubs;
            document.getElementById('detail-grupo-publicada').innerText = est.PUBLICADA || 0;
            document.getElementById('detail-grupo-eliminada').innerText = est.ELIMINADA || 0;
            document.getElementById('detail-grupo-suprimida').innerText = est.SUPRIMIDA || 0;
            document.getElementById('detail-grupo-revision').innerText = est['EN REVISION'] || 0;
            document.getElementById('detail-grupo-sdef').innerText = est['SIN DEFINIR'] || 0;
            document.getElementById('detail-grupo-rendimiento').innerText = rendicion;

            new bootstrap.Modal(document.getElementById('grupoDetailModal')).show();
        }

        document.addEventListener('DOMContentLoaded', () => {
            const session = getCurrentSession();
            if (!session) {
                window.location.href = 'index.html';
                return;
            }
            guardPage('view_grupos');
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
            loadGruposPage();
            setInterval(() => loadGruposPage(true), 60000);
        });
    
