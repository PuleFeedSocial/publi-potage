        function badgeClass(accion) {
            const a = (accion || '').toLowerCase();
            if (a === 'registro') return 'accion-registro';
            if (a.includes('creaci')) return 'accion-creacion';
            if (a.includes('edici') || a.includes('cambio')) return 'accion-edicion';
            if (a.includes('elimin')) return 'accion-eliminacion';
            if (a.includes('sesi') || a.includes('inicio')) return 'accion-sesion';
            if (a.includes('import') || a.includes('csv')) return 'accion-csv';
            return '';
        }

        let _lastLogsSnapshot = '';
        let logsData = [];

        function fechaLocal(fechaStr) {
            if (!fechaStr) return '';
            try {
                return new Date(fechaStr).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
            } catch (e) {
                return '';
            }
        }

        function categoriaAccion(accion) {
            const a = (accion || '').toLowerCase();
            if (a === 'registro') return 'Registro';
            if (a.includes('visita')) return 'Visitas';
            if (a.includes('sesi') || a.includes('inicio')) return 'Sesión';
            if (a.includes('creaci')) return 'Creación';
            if (a.includes('edici') || a.includes('cambio') || a.includes('sincroniz')) {
                if (a.includes('publicaci')) return 'Edición Publicaciones';
                if (a.includes('grupo')) return 'Edición Grupos';
                if (a.includes('zona')) return 'Edición Zonas';
                if (a.includes('sucursal')) return 'Edición Sucursales';
                if (a.includes('informe')) return 'Edición Informes';
                if (a.includes('usuario') || a.includes('miembro')) return 'Edición Usuarios';
                if (a.includes('rol') || a.includes('permiso')) return 'Edición Roles/Permisos';
                if (a.includes('calendario') || a.includes('serie')) return 'Edición Calendario';
                return 'Edición / Cambios';
            }
            if (a.includes('elimin')) return 'Eliminación';
            if (a.includes('import')) return 'Importación';
            if (a.includes('sincroniz')) return 'Sincronización';
            if (a.includes('permisos')) return 'Permisos';
            return 'Otras';
        }

        function saveLogsFilters() {
            localStorage.setItem('logsFilterUsuario', document.getElementById('logs-filter-usuario').value);
            localStorage.setItem('logsFilterTipo', document.getElementById('logs-filter-tipo').value);
            localStorage.setItem('logsDesde', document.getElementById('logs-desde').value);
            localStorage.setItem('logsHasta', document.getElementById('logs-hasta').value);
        }

        function restoreLogsFilters() {
            const selU = document.getElementById('logs-filter-usuario');
            const selT = document.getElementById('logs-filter-tipo');
            const d = document.getElementById('logs-desde');
            const h = document.getElementById('logs-hasta');
            const vU = localStorage.getItem('logsFilterUsuario');
            const vT = localStorage.getItem('logsFilterTipo');
            if (selU && vU) selU.value = vU;
            if (selT && vT) selT.value = vT;
            if (d && localStorage.getItem('logsDesde')) d.value = localStorage.getItem('logsDesde');
            if (h && localStorage.getItem('logsHasta')) h.value = localStorage.getItem('logsHasta');
        }

        function clearLogsFilters() {
            document.getElementById('logs-filter-usuario').value = '';
            document.getElementById('logs-filter-tipo').value = '';
            document.getElementById('logs-desde').value = '';
            document.getElementById('logs-hasta').value = '';
            document.getElementById('logs-buscar').value = '';
            saveLogsFilters();
            renderLogs();
        }

        function setLogsUserOptions() {
            const sel = document.getElementById('logs-filter-usuario');
            const current = sel.value;
            const emails = [...new Set(logsData.map(l => l.email).filter(Boolean))].sort();
            sel.innerHTML = '<option value="">Todos los usuarios</option>';
            emails.forEach(e => {
                const o = document.createElement('option');
                o.value = e;
                o.textContent = e;
                sel.appendChild(o);
            });
            sel.value = current;
        }

        const pageLoad = (task, message) => (typeof PageLoader !== 'undefined' ? PageLoader.track(task, message) : Promise.resolve().then(task));
        function loadLogs(silent) {
            const tbody = document.getElementById('logs-tbody');
            if (!silent) tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Cargando...</td></tr>';
            const load = () => authFetch(API_BASE + '/api/logs', { signal: AbortSignal.timeout(20000) })
                .then(r => r.json().then(b => ({ status: r.status, body: b })))
                .then(({ status, body }) => {
                    if (status !== 200) {
                        if (!silent) tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">' + (body.error || 'Error') + '</td></tr>';
                        return;
                    }
                    const logs = Array.isArray(body) ? body : (body.data || body.logs || []);
                    const snap = JSON.stringify(logs);
                    if (silent && snap === _lastLogsSnapshot) return;
                    _lastLogsSnapshot = snap;
                    logsData = logs;
                    setLogsUserOptions();
                    document.getElementById('data-source-badge-logs').innerHTML = '<i class="bi bi-database"></i> Logs · ' + logs.length + ' registros';
                    renderLogs(silent);
                })
                .catch(() => {
                    if (!silent) tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Error de conexión</td></tr>';
                });
            return silent ? load() : pageLoad(load, 'Cargando registros…');
        }

        // El historial puede tener miles de filas: se renderiza por lotes para no
        // bloquear el navegador (el DOM completo con animaciones por fila lo congelaba).
        const LOGS_PAGE_SIZE = 200;
        let _logsFiltered = [];
        let _logsRendered = 0;

        function filterLogs() {
            const usuarioF = document.getElementById('logs-filter-usuario').value;
            const tipoF = document.getElementById('logs-filter-tipo').value;
            const desdeF = document.getElementById('logs-desde').value;
            const hastaF = document.getElementById('logs-hasta').value;
            const texto = (document.getElementById('logs-buscar').value || '').toLowerCase().trim();

            return logsData.filter(log => {
                if (usuarioF && (log.email || '') !== usuarioF) return false;
                if (tipoF && categoriaAccion(log.accion) !== tipoF) return false;
                const fd = fechaLocal(log.created_at);
                if (desdeF && fd < desdeF) return false;
                if (hastaF && fd > hastaF) return false;
                if (texto) {
                    const hay = (String(log.email || '') + ' ' + (log.accion || '') + ' ' + (log.detalle || '')).toLowerCase();
                    if (!hay.includes(texto)) return false;
                }
                return true;
            });
        }

        function updateLogsMoreButton() {
            const btn = document.getElementById('logs-load-more');
            if (!btn) return;
            const restantes = _logsFiltered.length - _logsRendered;
            btn.hidden = restantes <= 0;
            if (restantes > 0) btn.innerHTML = '<i class="bi bi-chevron-down me-1"></i>Mostrar más (' + restantes + ')';
        }

        function appendLogs(target) {
            const tbody = document.getElementById('logs-tbody');
            const end = Math.min(target, _logsFiltered.length);
            if (end <= _logsRendered) { updateLogsMoreButton(); return; }
            const frag = document.createDocumentFragment();
            for (let i = _logsRendered; i < end; i++) {
                const log = _logsFiltered[i];
                const tr = document.createElement('tr');
                tr.className = 'log-entry';
                // Solo las primeras filas se animan: animar miles a la vez congela el navegador.
                if (i < 20) {
                    tr.style.animation = 'fadeSlideUp 0.3s ease-out forwards';
                    tr.style.animationDelay = (i * 0.04) + 's';
                }
                const fecha = log.created_at ? new Date(log.created_at).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : '—';
                const badge = badgeClass(log.accion);
                tr.innerHTML = `
                    <td class="text-muted" style="white-space:nowrap">${fecha}</td>
                    <td class="fw-medium">${escHtml(log.email || '—')}</td>
                    <td><span class="badge-accion ${badge}">${escHtml(log.accion || '—')}</span></td>
                    <td class="text-muted">${escHtml(log.detalle || '')}</td>
                `;
                frag.appendChild(tr);
            }
            tbody.appendChild(frag);
            _logsRendered = end;
            updateLogsMoreButton();
        }

        function renderLogs(keepCount) {
            const tbody = document.getElementById('logs-tbody');
            _logsFiltered = filterLogs();

            document.getElementById('logs-count').innerText =
                _logsFiltered.length + (_logsFiltered.length !== logsData.length ? ' de ' + logsData.length : '') + ' registros';

            if (!logsData.length) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4">No hay registros de actividad.</td></tr>';
                _logsRendered = 0;
                updateLogsMoreButton();
                return;
            }
            if (!_logsFiltered.length) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4">Sin resultados para los filtros aplicados.</td></tr>';
                _logsRendered = 0;
                updateLogsMoreButton();
                return;
            }

            const objetivo = keepCount ? Math.max(_logsRendered, LOGS_PAGE_SIZE) : LOGS_PAGE_SIZE;
            tbody.innerHTML = '';
            _logsRendered = 0;
            appendLogs(objetivo);
        }

        function renderMoreLogs() {
            appendLogs(_logsRendered + LOGS_PAGE_SIZE);
        }

        document.addEventListener('DOMContentLoaded', () => {
            const session = getCurrentSession();
            if (!session) {
                window.location.href = 'index.html';
                return;
            }
            const isAdmin = session.role === 'admin' || session.role === 'Admin';
            if (!isAdmin) {
                window.location.href = 'dashboard.html';
                return;
            }
            const initials = session.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            document.getElementById('display-avatar').innerText = initials;
            document.getElementById('display-user-name').innerText = session.name;
            document.getElementById('nav-avatar').innerText = initials;
            document.getElementById('nav-user-name').innerText = session.name.split(' ')[0];
            restoreLogsFilters();
            loadLogs();
            setInterval(() => loadLogs(true), 30000);
        });
    
