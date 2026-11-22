        let gruposPageData = [];
        let gruposMarketingRows = [];
        let grupoStatsChart = null;
        let grupoStatsMonthly = null;
        const grupoNumberFormat = new Intl.NumberFormat('es-AR');
        const grupoPercentFormat = new Intl.NumberFormat('es-AR', { style: 'percent', maximumFractionDigits: 1 });
        const pageLoad = (task, message) => (typeof PageLoader !== 'undefined' ? PageLoader.track(task, message) : Promise.resolve().then(task));

        function statsNumber(value) {
            if (value == null || value === '') return 0;
            try { return MarketingAnalysis.number(value); } catch {}
            const text = String(value).replace(/[^\d.,-]/g, '').replace(/,/g, '.');
            const number = Number(text);
            return Number.isFinite(number) && number >= 0 ? number : 0;
        }

        function setSafeGroupLink(container, value, options = {}) {
            container.replaceChildren();
            const text = String(value || '').trim();
            if (!text) {
                container.textContent = '—';
                return;
            }

            let url;
            try {
                url = new URL(text);
            } catch {
                container.textContent = options.showInvalidText ? text : '—';
                return;
            }
            if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
                container.textContent = options.showInvalidText ? text : '—';
                return;
            }

            const link = document.createElement('a');
            link.href = url.href;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            if (options.compact) link.className = 'small text-muted';
            link.textContent = options.compact ? text.substring(0, 45) + '...' : text;
            container.appendChild(link);
        }

        function setSafeGroupLink(container, value, options = {}) {
            container.replaceChildren();
            const text = String(value || '').trim();
            if (!text) {
                container.textContent = '—';
                return;
            }

            let url;
            try {
                url = new URL(text);
            } catch {
                container.textContent = options.showInvalidText ? text : '—';
                return;
            }
            if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
                container.textContent = options.showInvalidText ? text : '—';
                return;
            }

            const link = document.createElement('a');
            link.href = url.href;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            if (options.compact) link.className = 'small text-muted';
            link.textContent = options.compact ? text.substring(0, 45) + '...' : text;
            container.appendChild(link);
        }

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
            localStorage.setItem('gruposFilterStatus', document.getElementById('grupos-filter-status').value);
            localStorage.setItem('gruposSoloProblemas', document.getElementById('grupos-solo-problemas').checked ? '1' : '0');
        }

        function restoreGruposFilters() {
            const savedZona = localStorage.getItem('gruposFilterZona');
            const savedSort = localStorage.getItem('gruposSort');
            const savedStatus = localStorage.getItem('gruposFilterStatus');
            const savedSolo = localStorage.getItem('gruposSoloProblemas');
            const selZona = document.getElementById('grupos-filter-zona');
            const selSort = document.getElementById('grupos-sort');
            const selStatus = document.getElementById('grupos-filter-status');
            const chkSolo = document.getElementById('grupos-solo-problemas');
            if (selZona && savedZona) selZona.value = savedZona;
            if (selSort && savedSort) selSort.value = savedSort;
            if (selStatus && savedStatus !== null) selStatus.value = savedStatus;
            if (chkSolo && savedSolo === '1') chkSolo.checked = true;
        }

        let _lastGruposSnapshot = '';
        function loadGruposPage(silent) {
            restoreGruposFilters();
            const tbody = document.getElementById('grupos-page-table-body');
            if (!silent) tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Cargando...</td></tr>';
            const load = () => Promise.all([
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
                        if (!silent) tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">' + (gruposRes.body.error || 'Error') + '</td></tr>';
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
                    if (marketingData.length || !gruposMarketingRows.length) gruposMarketingRows = marketingData;
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
                    // Populate zone filter (only active zones)
                    let zonas = [...new Set([...gruposPageData.map(g => g.zona).filter(Boolean), ...(window.zonasData || []).map(z => z.nombre).filter(Boolean)])];
                    zonas = zonas.filter(z => window.zonaActiva(z));
                    zonas.sort();
                    const selZona = document.getElementById('grupos-filter-zona');
                    const currentZona = selZona.value;
                    selZona.innerHTML = '<option value="">Todas las sucursales</option>';
                    zonas.forEach(z => { const o = document.createElement('option'); o.value = z; o.textContent = z; selZona.appendChild(o); });
                    selZona.value = currentZona;
                    renderGruposPage();

                })
                .catch(() => {
                    if (!silent) tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Error de conexión</td></tr>';
                });
            return silent ? load() : pageLoad(load, 'Cargando grupos…');
        }

        function groupMetricKey(name,zone){return normFilterVal(name)+'|'+normFilterVal(zone);}
        function renderGruposPage() {
            const zonaFilter = document.getElementById('grupos-filter-zona').value;
            const sortMode = document.getElementById('grupos-sort').value;
            const statusFilter = document.getElementById('grupos-filter-status').value;
            const soloProblemas = document.getElementById('grupos-solo-problemas').checked;
            const search = normFilterVal(document.getElementById('grupos-search').value);
            let filtered = gruposPageData;
            if (zonaFilter) filtered = filtered.filter(g => normFilterVal(g.zona) === normFilterVal(zonaFilter));
            if (statusFilter === 'true') filtered = filtered.filter(g => g.activo !== false);
            else if (statusFilter === 'false') filtered = filtered.filter(g => g.activo === false);
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
            const paginator = window._gruposPaginator || (window._gruposPaginator = createTablePaginator('grupos-page-table-body', {
                filterIds: ['grupos-filter-zona', 'grupos-filter-status', 'grupos-sort', 'grupos-solo-problemas', 'grupos-search']
            }));
            paginator.render(filtered, (g, i) => {
                const tr = document.createElement('tr');
                tr.style.animation = 'fadeSlideUp 0.3s ease-out forwards';
                tr.style.animationDelay = (i * 0.04) + 's';
                const pubs = window._gruposPubs[groupMetricKey(g.nombre,g.zona)] || 0;
                const fechaDisplay = g.fechaIngreso || '—';
                const activoBadge = g.activo !== false
                    ? '<span class="badge-estatus est-publicada">Activo</span>'
                    : '<span class="badge-estatus est-eliminada">Inactivo</span>';
                tr.innerHTML = `
                    <td class="fw-medium">${escHtml(g.nombre)}</td>
                    <td class="small grupo-enlace"></td>
                    <td><span class="badge-zone zone-${escHtml((g.zona || '').toLowerCase().replace(/ /g, '-'))}">${escHtml(g.zona || '—')}</span></td>
                    <td class="text-center small text-muted">${escHtml(fechaDisplay)}</td>
                    <td class="text-center fw-semibold text-primary">${pubs}</td>
                    <td class="text-center">${activoBadge}</td>
                `;
                setSafeGroupLink(tr.querySelector('.grupo-enlace'), g.enlace, { compact: true });
                makeTableRowInteractive(tr, () => openGrupoDetailModal(g.rowIndex), 'Ver detalle del grupo ' + g.nombre);
                return tr;
            }, '<tr><td colspan="6" class="text-center text-muted">Sin resultados</td></tr>');
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

        function getGrupoMarketingRows() {
            if (gruposMarketingRows.length) return Promise.resolve(gruposMarketingRows);
            return authFetch(API_BASE + '/api/marketing')
                .then(res => res.status === 200 ? res.json() : { data: [] })
                .then(body => { gruposMarketingRows = (body && body.data) || []; return gruposMarketingRows; })
                .catch(() => []);
        }

        function statsDateKey(value) {
            const text = String(value || '').trim();
            let match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (match) return Number(match[3]) * 10000 + Number(match[2]) * 100 + Number(match[1]);
            match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
            return match ? Number(match[1]) * 10000 + Number(match[2]) * 100 + Number(match[3]) : 0;
        }

        function buildGrupoStatsData(grupo, rows) {
            const key = groupMetricKey(grupo.nombre, grupo.zona);
            const metrics = ['publicaciones', 'visualizaciones', 'interacciones', 'comentarios', 'mensajes'];
            const matched = (rows || []).filter(r => r.grupo && groupMetricKey(r.grupo, r.zona) === key);
            const totals = { publicaciones: 0, visualizaciones: 0, interacciones: 0, comentarios: 0, mensajes: 0 };
            const cleanRows = matched.map(r => {
                const item = { fecha: r.fecha };
                metrics.forEach(metric => {
                    item[metric] = statsNumber(r[metric]);
                    totals[metric] += item[metric];
                });
                return item;
            });
            const statuses = { PUBLICADA: 0, ELIMINADA: 0, SUPRIMIDA: 0, 'EN REVISION': 0, 'SIN DEFINIR': 0 };
            matched.forEach(r => {
                const status = normFilterVal(r.estatus || 'SIN DEFINIR').toUpperCase();
                if (statuses[status] !== undefined) statuses[status] += statsNumber(r.publicaciones);
            });
            const statusTotal = Object.keys(statuses).reduce((sum, name) => sum + statuses[name], 0);
            if (statusTotal) totals.publicaciones = statusTotal;
            const dated = cleanRows.map(row => ({ row, order: statsDateKey(row.fecha) })).filter(x => x.order).sort((a, b) => a.order - b.order);
            let best = null;
            cleanRows.forEach(row => { if (!best || row.visualizaciones > best.visualizaciones) best = row; });
            let monthly;
            try { monthly = MarketingAnalysis.monthly(cleanRows); }
            catch { monthly = { keys: [], labels: [], series: {} }; }
            return {
                totals, statuses, statusTotal, cleanRows, monthly,
                first: dated.length ? dated[0].row.fecha : '',
                last: dated.length ? dated[dated.length - 1].row.fecha : '',
                bestFecha: best ? best.fecha : '',
                bestVis: best ? best.visualizaciones : 0
            };
        }

        function destroyGrupoStatsChart() {
            if (!grupoStatsChart) return;
            try { grupoStatsChart.destroy(); } catch {}
            grupoStatsChart = null;
        }

        function drawGrupoStatsChart() {
            destroyGrupoStatsChart();
            const canvas = document.getElementById('grupo-stats-chart');
            const wrapper = document.getElementById('grupo-stats-chart-wrapper');
            const modalEl = document.getElementById('grupoStatsModal');
            if (!canvas || !wrapper || wrapper.hidden || (modalEl && !modalEl.classList.contains('show')) || !grupoStatsMonthly || !grupoStatsMonthly.keys || !grupoStatsMonthly.keys.length || typeof Chart === 'undefined') return;
            applyChartThemeDefaults();
            const palette = chartPalette();
            try {
                grupoStatsChart = new Chart(canvas, {
                    type: 'bar',
                    data: {
                        labels: grupoStatsMonthly.labels,
                        datasets: [
                            { type: 'bar', label: 'Visualizaciones', data: grupoStatsMonthly.series.visualizaciones, backgroundColor: palette.vis + 'c0', borderRadius: 5, maxBarThickness: 38 },
                            { type: 'line', label: 'Interacciones', data: grupoStatsMonthly.series.interacciones, borderColor: palette.ints, backgroundColor: palette.ints + '18', borderWidth: 2, tension: .25, pointRadius: 3 }
                        ]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false, animation: false,
                        interaction: { mode: 'index', intersect: false },
                        plugins: { legend: { display: true, labels: { color: palette.tick } }, tooltip: { callbacks: { label: context => context.dataset.label + ': ' + grupoNumberFormat.format(context.parsed.y) } } },
                        scales: {
                            y: { beginAtZero: true, grid: { color: palette.grid }, ticks: { color: palette.tick, precision: 0, maxTicksLimit: 5 } },
                            x: { grid: { display: false }, ticks: { color: palette.tick, maxRotation: 30 } }
                        }
                    }
                });
            } catch {}
        }

        function fillGrupoStatsModal(grupo, rows) {
            const stats = buildGrupoStatsData(grupo, rows);
            const totals = stats.totals;
            const hasData = stats.cleanRows.length > 0 || stats.statusTotal > 0;
            const set = (id, value) => { const element = document.getElementById(id); if (element) element.textContent = value; };
            set('grupo-stats-vis', grupoNumberFormat.format(totals.visualizaciones));
            set('grupo-stats-int', grupoNumberFormat.format(totals.interacciones));
            set('grupo-stats-com', grupoNumberFormat.format(totals.comentarios));
            set('grupo-stats-msj', grupoNumberFormat.format(totals.mensajes));
            set('grupo-stats-pubs', grupoNumberFormat.format(totals.publicaciones));
            set('grupo-stats-rate', totals.visualizaciones ? grupoPercentFormat.format(totals.interacciones / totals.visualizaciones) : '—');
            const divisor = totals.publicaciones || 1;
            set('grupo-stats-averages', 'Promedio por publicación: ' + grupoNumberFormat.format(Math.round(totals.visualizaciones / divisor)) + ' visualizaciones · ' + grupoNumberFormat.format(Math.round(totals.interacciones / divisor)) + ' interacciones · ' + grupoNumberFormat.format(Math.round(totals.mensajes / divisor)) + ' mensajes');
            const statusIds = { PUBLICADA: 'publicada', ELIMINADA: 'eliminada', SUPRIMIDA: 'suprimida', 'EN REVISION': 'revision', 'SIN DEFINIR': 'sdef' };
            Object.keys(statusIds).forEach(name => set('grupo-stats-status-' + statusIds[name], grupoNumberFormat.format(stats.statuses[name])));
            set('grupo-stats-best', 'Mejor publicación: ' + (stats.bestFecha || '—') + ' · ' + grupoNumberFormat.format(stats.bestVis) + ' visualizaciones');
            set('grupo-stats-range', 'Rango de fechas: ' + (stats.first || '—') + ' — ' + (stats.last || '—'));
            document.getElementById('grupo-stats-loading').hidden = true;
            document.getElementById('grupo-stats-content').hidden = !hasData;
            document.getElementById('grupo-stats-empty').hidden = hasData;
            document.getElementById('grupo-stats-chart-wrapper').hidden = !hasData || !stats.monthly.keys.length;
            grupoStatsMonthly = stats.monthly;
            requestAnimationFrame(drawGrupoStatsChart);
        }

        function openGrupoStatsModal(grupo) {
            const modalEl = document.getElementById('grupoStatsModal');
            document.getElementById('grupo-stats-nombre').textContent = grupo.nombre;
            document.getElementById('grupo-stats-loading').hidden = false;
            document.getElementById('grupo-stats-content').hidden = true;
            document.getElementById('grupo-stats-empty').hidden = true;
            grupoStatsMonthly = null;
            destroyGrupoStatsChart();
            bootstrap.Modal.getOrCreateInstance(modalEl).show();
            getGrupoMarketingRows().then(rows => fillGrupoStatsModal(grupo, rows));
        }

        function openGrupoDetailModal(rowIndexOrNombre) {
            const g = gruposPageData.find(x => String(x.rowIndex) === String(rowIndexOrNombre)) ||
                gruposPageData.find(x => x.nombre === rowIndexOrNombre);
            if (!g) return;
            const est = window._gruposEstatus[groupMetricKey(g.nombre,g.zona)] || {};
            const pubs = (est.PUBLICADA || 0) + (est.ELIMINADA || 0) + (est.SUPRIMIDA || 0) + (est['EN REVISION'] || 0) + (est['SIN DEFINIR'] || 0);

            document.getElementById('detail-grupo-nombre').innerText = g.nombre;
            const enlaceEl = document.getElementById('detail-grupo-enlace');
            setSafeGroupLink(enlaceEl, g.enlace, { showInvalidText: true });
            document.getElementById('detail-grupo-pubs').innerText = pubs;
            document.getElementById('detail-grupo-publicada').innerText = est.PUBLICADA || 0;
            document.getElementById('detail-grupo-eliminada').innerText = est.ELIMINADA || 0;
            document.getElementById('detail-grupo-suprimida').innerText = est.SUPRIMIDA || 0;
            document.getElementById('detail-grupo-revision').innerText = est['EN REVISION'] || 0;
            document.getElementById('detail-grupo-sdef').innerText = est['SIN DEFINIR'] || 0;

            const modalEl = document.getElementById('grupoDetailModal');
            const footer = modalEl.querySelector('.modal-footer');
            const canEdit = hasPermission('edit_grupos');
            footer.innerHTML = '<button type="button" class="btn btn-sm btn-light-muted" data-bs-dismiss="modal">Cerrar</button>' +
                '<button type="button" class="btn btn-sm btn-light-muted" id="grupo-detail-stats"><i class="bi bi-bar-chart-line me-1"></i>Estadísticas</button>' +
                (canEdit ? '<button type="button" class="btn btn-sm btn-action-primary" id="grupo-detail-edit"><i class="bi bi-pencil-fill me-1"></i>Editar</button>' +
                    '<button type="button" class="btn btn-sm btn-outline-danger" id="grupo-detail-delete"><i class="bi bi-trash3-fill me-1"></i>Eliminar</button>' : '');
            const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            footer.querySelector('#grupo-detail-stats').onclick = () => openGrupoStatsModal(g);
            if (canEdit) {
                footer.querySelector('#grupo-detail-edit').onclick = () => { modal.hide(); editGrupoPage(g.rowIndex); };
                footer.querySelector('#grupo-detail-delete').onclick = () => { modal.hide(); deleteGrupoPage(g.rowIndex); };
            }
            modal.show();
        }

        document.addEventListener('DOMContentLoaded', () => {
            const session = getCurrentSession();
            if (!session) {
                window.location.href = '/pages/index.html';
                return;
            }
            guardPage('view_grupos');
            const statsModalEl = document.getElementById('grupoStatsModal');
            statsModalEl.addEventListener('shown.bs.modal', drawGrupoStatsChart);
            statsModalEl.addEventListener('hidden.bs.modal', () => { destroyGrupoStatsChart(); grupoStatsMonthly = null; });
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
    
