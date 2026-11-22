        let gruposPageData = [];
        let grupoStatsChart = null;
        const grupoNum = value => {
            if (value == null || value === '') return 0;
            try { return MarketingAnalysis.number(value); } catch {}
            if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : 0;
            let text = String(value).trim().replace(/[^\d.,-]/g, '');
            if (!text) return 0;
            const lastDot = text.lastIndexOf('.'), lastComma = text.lastIndexOf(',');
            if (lastDot > -1 && lastComma > -1) {
                const decimal = lastDot > lastComma ? '.' : ',';
                const thousands = decimal === '.' ? ',' : '.';
                text = text.split(thousands).join('').replace(decimal, '.');
            } else if (lastComma > -1) {
                text = /,\d{3}(\D|$)/.test(text) ? text.replace(/,/g, '') : text.replace(',', '.');
            }
            const number = Number(text);
            return Number.isFinite(number) && number >= 0 ? number : 0;
        };
        const grupoNumberFormat = new Intl.NumberFormat('es-AR');
        const grupoPercentFormat = new Intl.NumberFormat('es-AR', { style: 'percent', maximumFractionDigits: 1 });
        const pageLoad = (task, message) => (typeof PageLoader !== 'undefined' ? PageLoader.track(task, message) : Promise.resolve().then(task));

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

        function computeGrupoMaps(marketingData) {
            window._gruposMarketing = marketingData || [];
            window._gruposPubs = {};
            window._gruposEstatus = {};
            window._gruposStats = {};
            (marketingData || []).forEach(r => {
                const g = r.grupo ? groupMetricKey(r.grupo, r.zona) : null;
                if (!g) return;
                const number = value => { try { return MarketingAnalysis.number(value); } catch { return 0; } };
                const pubs = number(r.publicaciones);
                if (isEstatusActivo(r.estatus)) window._gruposPubs[g] = (window._gruposPubs[g] || 0) + pubs;
                if (!window._gruposEstatus[g]) window._gruposEstatus[g] = { PUBLICADA: 0, ELIMINADA: 0, SUPRIMIDA: 0, 'EN REVISION': 0, 'SIN DEFINIR': 0 };
                const est = normFilterVal(r.estatus || 'SIN DEFINIR').toUpperCase();
                if (window._gruposEstatus[g][est] !== undefined) window._gruposEstatus[g][est] += pubs;
                if (!window._gruposStats[g]) window._gruposStats[g] = { publicaciones: 0, visualizaciones: 0, interacciones: 0, comentarios: 0, mensajes: 0, rows: [] };
                const totals = window._gruposStats[g];
                ['publicaciones', 'visualizaciones', 'interacciones', 'comentarios', 'mensajes'].forEach(field => { totals[field] += number(r[field]); });
                totals.rows.push({ fecha: r.fecha, publicaciones: pubs, visualizaciones: number(r.visualizaciones), interacciones: number(r.interacciones), comentarios: number(r.comentarios), mensajes: number(r.mensajes) });
            });
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
                    if (marketingData.length || !(window._gruposMarketing || []).length) computeGrupoMaps(marketingData);
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

        function grupoFechaKey(value) {
            const text = String(value || '').trim();
            let match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (match) return Number(match[3]) * 10000 + Number(match[2]) * 100 + Number(match[1]);
            match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
            return match ? Number(match[1]) * 10000 + Number(match[2]) * 100 + Number(match[3]) : 0;
        }

        function buildGrupoStats(grupo, estatus) {
            const key = groupMetricKey(grupo.nombre, grupo.zona);
            const est = estatus || {};
            const statuses = { PUBLICADA: 0, ELIMINADA: 0, SUPRIMIDA: 0, 'EN REVISION': 0, 'SIN DEFINIR': 0 };
            Object.keys(statuses).forEach(k => { statuses[k] = grupoNum(est[k]); });
            const pubsEstatus = Object.keys(statuses).reduce((sum, k) => sum + statuses[k], 0);
            const rawRows = (window._gruposMarketing || []).filter(r => r.grupo && groupMetricKey(r.grupo, r.zona) === key);
            const precomputed = (window._gruposStats || {})[key] || { publicaciones: 0, visualizaciones: 0, interacciones: 0, comentarios: 0, mensajes: 0, rows: [] };
            const source = rawRows.length ? rawRows : (precomputed.rows || []);
            const num = grupoNum;
            const totals = { publicaciones: 0, visualizaciones: 0, interacciones: 0, comentarios: 0, mensajes: 0 };
            const rows = source.map(r => ({
                fecha: r.fecha,
                publicaciones: num(r.publicaciones),
                visualizaciones: num(r.visualizaciones),
                interacciones: num(r.interacciones),
                comentarios: num(r.comentarios),
                mensajes: num(r.mensajes)
            }));
            rows.forEach(r => {
                ['publicaciones', 'visualizaciones', 'interacciones', 'comentarios', 'mensajes'].forEach(field => { totals[field] += r[field]; });
            });
            if (!rawRows.length) Object.keys(totals).forEach(field => { totals[field] += num(precomputed[field]); });
            if (pubsEstatus) totals.publicaciones = pubsEstatus;
            let best = null;
            const dated = [];
            rows.forEach(r => {
                if (!best || r.visualizaciones > best.visualizaciones) best = r;
                const fecha = grupoFechaKey(r.fecha);
                if (fecha) dated.push({ fecha, row: r });
            });
            dated.sort((a, b) => a.fecha - b.fecha);
            let monthly;
            try { monthly = MarketingAnalysis.monthly(rows); }
            catch { monthly = { keys: [], labels: [], invalidDates: 0, series: {} }; }
            return {
                rows, totals, statuses,
                bestFecha: best ? best.fecha : '',
                bestVis: best ? best.visualizaciones : 0,
                monthly,
                first: dated.length ? dated[0].row.fecha : '',
                last: dated.length ? dated[dated.length - 1].row.fecha : ''
            };
        }

        function destroyGrupoStatsChart() {
            if (!grupoStatsChart) return;
            try { grupoStatsChart.destroy(); } catch {}
            grupoStatsChart = null;
        }

        function getGrupoModalViews() {
            const modalEl = document.getElementById('grupoDetailModal');
            const body = modalEl.querySelector('.modal-body');
            let detail = document.getElementById('grupo-detail-view');
            let stats = document.getElementById('grupo-stats-view');
            if (!detail) {
                detail = document.createElement('div');
                detail.id = 'grupo-detail-view';
                while (body.firstChild) detail.appendChild(body.firstChild);
                stats = document.createElement('div');
                stats.id = 'grupo-stats-view';
                stats.hidden = true;
                stats.innerHTML = '<div id="grupo-stats-loading" class="small text-secondary" hidden>Cargando estadísticas…</div>' +
                    '<div id="grupo-stats-content">' +
                    '<h6 id="grupo-stats-nombre" class="fw-bold mb-3"></h6>' +
                    '<div id="grupo-stats-body">' +
                    '<div class="row g-2 grupo-stats-kpis mb-3">' +
                    '<div class="col"><div class="detail-kpi-box"><div class="fw-bold text-primary fs-5" id="grupo-stats-vis">0</div><div class="text-secondary small">Visualizaciones</div></div></div>' +
                    '<div class="col"><div class="detail-kpi-box"><div class="fw-bold text-success fs-5" id="grupo-stats-int">0</div><div class="text-secondary small">Interacciones</div></div></div>' +
                    '<div class="col"><div class="detail-kpi-box"><div class="fw-bold text-warning fs-5" id="grupo-stats-com">0</div><div class="text-secondary small">Comentarios</div></div></div>' +
                    '<div class="col"><div class="detail-kpi-box"><div class="fw-bold text-info fs-5" id="grupo-stats-msj">0</div><div class="text-secondary small">Mensajes</div></div></div>' +
                    '<div class="col"><div class="detail-kpi-box"><div class="fw-bold text-primary fs-5" id="grupo-stats-pubs">0</div><div class="text-secondary small">Publicaciones</div></div></div>' +
                    '<div class="col"><div class="detail-kpi-box"><div class="fw-bold text-success fs-5" id="grupo-stats-rate">—</div><div class="text-secondary small">Tasa de interacción</div></div></div>' +
                    '</div>' +
                    '<div class="grupo-stats-averages small text-secondary mb-3" id="grupo-stats-averages"></div>' +
                    '<div class="grupo-stats-chart-wrapper chart-wrapper mb-3" id="grupo-stats-chart-wrapper"><canvas id="grupo-stats-chart" role="img" aria-label="Visualizaciones e interacciones por mes"></canvas></div>' +
                    '<div class="row g-2 grupo-stats-statuses mb-3">' +
                    '<div class="col"><div class="detail-kpi-box"><div class="fw-bold text-success fs-5" id="grupo-stats-status-publicada">0</div><div class="text-secondary small">Publicada</div></div></div>' +
                    '<div class="col"><div class="detail-kpi-box"><div class="fw-bold text-danger fs-5" id="grupo-stats-status-eliminada">0</div><div class="text-secondary small">Eliminada</div></div></div>' +
                    '<div class="col"><div class="detail-kpi-box"><div class="fw-bold text-warning fs-5" id="grupo-stats-status-suprimida">0</div><div class="text-secondary small">Suprimida</div></div></div>' +
                    '<div class="col"><div class="detail-kpi-box"><div class="fw-bold text-info fs-5" id="grupo-stats-status-revision">0</div><div class="text-secondary small">Revisión</div></div></div>' +
                    '<div class="col"><div class="detail-kpi-box"><div class="fw-bold text-secondary fs-5" id="grupo-stats-status-sdef">0</div><div class="text-secondary small">S/Def</div></div></div>' +
                    '</div>' +
                    '<div class="small text-secondary mb-1 grupo-stats-detail-line" id="grupo-stats-best"></div>' +
                    '<div class="small text-secondary grupo-stats-detail-line" id="grupo-stats-range"></div>' +
                    '</div>' +
                    '<div id="grupo-stats-empty" class="small text-secondary" hidden>Este grupo aún no tiene publicaciones</div>' +
                    '</div>';
                body.appendChild(detail);
                body.appendChild(stats);
            }
            return { modalEl, detail, stats };
        }

        function resetGrupoModalView() {
            const views = getGrupoModalViews();
            destroyGrupoStatsChart();
            views.detail.hidden = false;
            views.stats.hidden = true;
            views.modalEl.classList.remove('is-stats');
        }

        function renderGrupoDetailFooter(grupo, inStats) {
            const modalEl = document.getElementById('grupoDetailModal');
            const footer = modalEl.querySelector('.modal-footer');
            const canEdit = hasPermission('edit_grupos');
            footer.innerHTML = inStats
                ? '<button type="button" class="btn btn-sm btn-light-muted" data-bs-dismiss="modal">Cerrar</button>' +
                  '<button type="button" class="btn btn-sm btn-light-muted" id="grupo-detail-back" aria-label="Volver al detalle del grupo"><i class="bi bi-arrow-left me-1"></i>Volver al detalle</button>'
                : '<button type="button" class="btn btn-sm btn-light-muted" data-bs-dismiss="modal">Cerrar</button>' +
                  '<button type="button" class="btn btn-sm btn-light-muted" id="grupo-detail-stats" aria-label="Ver estadísticas del grupo"><i class="bi bi-bar-chart-line me-1"></i>Estadísticas</button>' +
                  (canEdit ? '<button type="button" class="btn btn-sm btn-action-primary" id="grupo-detail-edit"><i class="bi bi-pencil-fill me-1"></i>Editar</button>' +
                    '<button type="button" class="btn btn-sm btn-outline-danger" id="grupo-detail-delete"><i class="bi bi-trash3-fill me-1"></i>Eliminar</button>' : '');
            const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            if (inStats) {
                footer.querySelector('#grupo-detail-back').onclick = () => { destroyGrupoStatsChart(); showGrupoDetailView(grupo); };
                return modal;
            }
            footer.querySelector('#grupo-detail-stats').onclick = () => showGrupoStatsView(grupo);
            if (canEdit) {
                footer.querySelector('#grupo-detail-edit').onclick = () => { modal.hide(); editGrupoPage(grupo.rowIndex); };
                footer.querySelector('#grupo-detail-delete').onclick = () => { modal.hide(); deleteGrupoPage(grupo.rowIndex); };
            }
            return modal;
        }

        function applyGrupoDetailValues(grupo, est) {
            const pubs = (est.PUBLICADA || 0) + (est.ELIMINADA || 0) + (est.SUPRIMIDA || 0) + (est['EN REVISION'] || 0) + (est['SIN DEFINIR'] || 0);
            document.getElementById('detail-grupo-nombre').innerText = grupo.nombre;
            setSafeGroupLink(document.getElementById('detail-grupo-enlace'), grupo.enlace, { showInvalidText: true });
            document.getElementById('detail-grupo-pubs').innerText = pubs;
            document.getElementById('detail-grupo-publicada').innerText = est.PUBLICADA || 0;
            document.getElementById('detail-grupo-eliminada').innerText = est.ELIMINADA || 0;
            document.getElementById('detail-grupo-suprimida').innerText = est.SUPRIMIDA || 0;
            document.getElementById('detail-grupo-revision').innerText = est['EN REVISION'] || 0;
            document.getElementById('detail-grupo-sdef').innerText = est['SIN DEFINIR'] || 0;
        }

        function showGrupoDetailView(grupo) {
            const views = getGrupoModalViews();
            destroyGrupoStatsChart();
            document.getElementById('detail-grupo-title').innerHTML = '<i class="bi bi-info-circle-fill me-2 text-primary"></i>Detalle del Grupo';
            views.detail.hidden = false;
            views.stats.hidden = true;
            views.modalEl.classList.remove('is-stats');
            renderGrupoDetailFooter(grupo, false).querySelector('#grupo-detail-stats').focus();
        }

        function drawGrupoStatsChart(monthly) {
            destroyGrupoStatsChart();
            const canvas = document.getElementById('grupo-stats-chart');
            if (!canvas || typeof Chart === 'undefined' || !monthly.keys.length) return;
            applyChartThemeDefaults();
            const palette = chartPalette();
            try {
                grupoStatsChart = new Chart(canvas, {
                    type: 'bar',
                    data: {
                        labels: monthly.labels,
                        datasets: [
                            { type: 'bar', label: 'Visualizaciones', data: monthly.series.visualizaciones, backgroundColor: palette.vis + 'c0', borderRadius: 5, maxBarThickness: 38 },
                            { type: 'line', label: 'Interacciones', data: monthly.series.interacciones, borderColor: palette.ints, backgroundColor: palette.ints + '18', borderWidth: 2, tension: .25, pointRadius: 3 }
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
            } catch (error) { console.warn('Grupos chart error:', error); }
        }

        function renderGrupoStats(grupo, estatus) {
            const stats = buildGrupoStats(grupo, estatus);
            const totals = stats.totals, statuses = stats.statuses;
            const pubs = statuses.PUBLICADA + statuses.ELIMINADA + statuses.SUPRIMIDA + statuses['EN REVISION'] + statuses['SIN DEFINIR'];
            if (pubs) totals.publicaciones = pubs;
            document.getElementById('grupo-stats-nombre').textContent = grupo.nombre;
            document.getElementById('grupo-stats-vis').textContent = grupoNumberFormat.format(totals.visualizaciones);
            document.getElementById('grupo-stats-int').textContent = grupoNumberFormat.format(totals.interacciones);
            document.getElementById('grupo-stats-com').textContent = grupoNumberFormat.format(totals.comentarios);
            document.getElementById('grupo-stats-msj').textContent = grupoNumberFormat.format(totals.mensajes);
            document.getElementById('grupo-stats-pubs').textContent = grupoNumberFormat.format(totals.publicaciones);
            document.getElementById('grupo-stats-rate').textContent = totals.visualizaciones ? grupoPercentFormat.format(totals.interacciones / totals.visualizaciones) : '—';
            const divisor = pubs || totals.publicaciones || 1;
            document.getElementById('grupo-stats-averages').textContent = 'Promedio por publicación: ' +
                grupoNumberFormat.format(Math.round(totals.visualizaciones / divisor)) + ' visualizaciones · ' +
                grupoNumberFormat.format(Math.round(totals.interacciones / divisor)) + ' interacciones · ' +
                grupoNumberFormat.format(Math.round(totals.mensajes / divisor)) + ' mensajes';
            document.getElementById('grupo-stats-status-publicada').textContent = grupoNumberFormat.format(statuses.PUBLICADA);
            document.getElementById('grupo-stats-status-eliminada').textContent = grupoNumberFormat.format(statuses.ELIMINADA);
            document.getElementById('grupo-stats-status-suprimida').textContent = grupoNumberFormat.format(statuses.SUPRIMIDA);
            document.getElementById('grupo-stats-status-revision').textContent = grupoNumberFormat.format(statuses['EN REVISION']);
            document.getElementById('grupo-stats-status-sdef').textContent = grupoNumberFormat.format(statuses['SIN DEFINIR']);
            document.getElementById('grupo-stats-best').textContent = 'Mejor publicación: ' + (stats.bestFecha || '—') + ' · ' + grupoNumberFormat.format(stats.bestVis) + ' visualizaciones';
            document.getElementById('grupo-stats-range').textContent = 'Rango de fechas: ' + (stats.first || '—') + ' — ' + (stats.last || '—');
            const empty = document.getElementById('grupo-stats-empty');
            const body = document.getElementById('grupo-stats-body');
            const chartWrapper = document.getElementById('grupo-stats-chart-wrapper');
            const hasData = stats.rows.length > 0 || pubs > 0;
            empty.hidden = hasData;
            body.hidden = !hasData;
            chartWrapper.hidden = !hasData || !stats.monthly.keys.length;
            if (!hasData) { destroyGrupoStatsChart(); return; }
            requestAnimationFrame(() => {
                if (!chartWrapper.hidden) drawGrupoStatsChart(stats.monthly);
            });
        }

        function showGrupoStatsView(grupo) {
            const views = getGrupoModalViews();
            const key = groupMetricKey(grupo.nombre, grupo.zona);
            document.getElementById('detail-grupo-title').innerHTML = '<i class="bi bi-bar-chart-line me-2 text-primary"></i>Estadísticas del Grupo';
            views.detail.hidden = true;
            views.stats.hidden = false;
            views.modalEl.classList.add('is-stats');
            renderGrupoDetailFooter(grupo, true).querySelector('#grupo-detail-back').focus();
            const render = () => {
                if (views.stats.hidden) return;
                const estatus = (window._gruposEstatus || {})[key] || {};
                document.getElementById('grupo-stats-loading').hidden = true;
                document.getElementById('grupo-stats-content').hidden = false;
                applyGrupoDetailValues(grupo, estatus);
                renderGrupoStats(grupo, estatus);
            };
            if (!(window._gruposMarketing || []).length) {
                document.getElementById('grupo-stats-loading').hidden = false;
                document.getElementById('grupo-stats-content').hidden = true;
                authFetch(API_BASE + '/api/marketing').then(res => res.json()).then(body => {
                    computeGrupoMaps((body && body.data) || []);
                    render();
                }).catch(render);
                return;
            }
            render();
        }

        function openGrupoDetailModal(rowIndexOrNombre) {
            const g = gruposPageData.find(x => String(x.rowIndex) === String(rowIndexOrNombre)) ||
                gruposPageData.find(x => x.nombre === rowIndexOrNombre);
            if (!g) return;
            const estatus = (window._gruposEstatus || {})[groupMetricKey(g.nombre, g.zona)] || {};
            applyGrupoDetailValues(g, estatus);
            const modalEl = document.getElementById('grupoDetailModal');
            resetGrupoModalView();
            document.getElementById('detail-grupo-title').innerHTML = '<i class="bi bi-info-circle-fill me-2 text-primary"></i>Detalle del Grupo';
            renderGrupoDetailFooter(g, false).show();
        }

        document.addEventListener('DOMContentLoaded', () => {
            const session = getCurrentSession();
            if (!session) {
                window.location.href = '/pages/index.html';
                return;
            }
            guardPage('view_grupos');
            document.getElementById('grupoDetailModal').addEventListener('hidden.bs.modal', () => {
                destroyGrupoStatsChart();
                resetGrupoModalView();
            });
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
    
