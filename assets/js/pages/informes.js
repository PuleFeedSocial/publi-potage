        let informesData = [];
        let pendingImport = null;

        function loadInformes() {
            const tbody = document.getElementById('informes-tbody');
            tbody.innerHTML = '<tr><td colspan="99" class="text-center text-muted">Cargando...</td></tr>';
            authFetch(API_BASE + '/api/informes')
                .then(r => r.json().then(b => ({ status: r.status, body: b })))
                .then(({ status, body }) => {
                    if (status !== 200) {
                        tbody.innerHTML = '<tr><td colspan="99" class="text-center text-danger">' + esc(body.error || 'Error') + '</td></tr>';
                        return;
                    }
                    informesData = body.data || [];
                    const columns = body.columns || [];
                    renderInformes(columns);
                    document.getElementById('data-source-badge-informes').innerHTML = '<i class="bi bi-database"></i> Informes · ' + informesData.length + ' registros';
                    document.getElementById('informes-count').innerText = informesData.length + ' registros';
                })
                .catch(() => {
                    tbody.innerHTML = '<tr><td colspan="99" class="text-center text-muted">Error de conexión</td></tr>';
                });
        }

        function renderInformes(columns) {
            const thead = document.getElementById('informes-thead');
            const tbody = document.getElementById('informes-tbody');
            const showCols = columns.filter(c => c && c.trim());

            thead.innerHTML = '<tr><th class="text-end">#</th>' + showCols.map(c => '<th>' + esc(c) + '</th>').join('') + '<th class="text-end">Acciones</th></tr>';

            if (!informesData.length) {
                tbody.innerHTML = '<tr><td colspan="' + (showCols.length + 2) + '" class="text-center text-muted py-4">No hay datos importados. Hacé clic en "Importar CSV" para subir un informe.</td></tr>';
                return;
            }

            tbody.innerHTML = '';
            informesData.forEach((row, i) => {
                const tr = document.createElement('tr');
                tr.style.animation = 'fadeSlideUp 0.3s ease-out forwards';
                tr.style.animationDelay = (Math.min(i, 20) * 0.04) + 's';
                let cells = '<td class="text-end text-muted small">' + row.rowIndex + '</td>';
                showCols.forEach(c => {
                    let raw = row[c];
                    let val = (raw !== undefined && raw !== null && raw !== '') ? String(raw) : '';
                    if (c.toLowerCase().includes('enlace') || c.toLowerCase().includes('link') || c.toLowerCase().includes('url')) {
                        val = /^https?:\/\//i.test(val) ? '<a href="' + esc(val) + '" target="_blank" rel="noopener noreferrer" class="small">' + esc(val.substring(0, 40)) + '</a>' : esc(val || '—');
                        cells += '<td class="small">' + val + '</td>';
                    } else if (val.length > 60) {
                        cells += '<td class="small text-truncate-cell" title="' + esc(val) + '">' + esc(val) + '</td>';
                    } else {
                        cells += '<td class="small text-truncate-cell" title="' + esc(val) + '">' + esc(val || '—') + '</td>';
                    }
                });
                cells += '<td class="text-end"><button class="btn btn-sm btn-link text-danger p-0" onclick="deleteInformeRow(' + row.rowIndex + ')" title="Eliminar"><i class="bi bi-trash3-fill"></i></button></td>';
                tr.innerHTML = cells;
                tbody.appendChild(tr);
            });
        }

        function esc(s) {
            if (!s) return '';
            return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        }

        function importCSV() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.csv,text/csv';
            input.style.display = 'none';
            document.body.appendChild(input);
            input.addEventListener('change', function (e) {
                const file = e.target.files[0];
                if (!file) { document.body.removeChild(input); return; }
                try {
                    Papa.parse(file, {
                        header: true,
                        skipEmptyLines: true,
                        encoding: 'UTF-8',
                        complete: function (results) {
                            document.body.removeChild(input);
                            if (results.errors?.length || (results.meta?.renamedHeaders && Object.keys(results.meta.renamedHeaders).length)) {
                                alert('El CSV contiene columnas repetidas o filas con distinta cantidad de celdas. Revisá el archivo antes de importarlo.');
                                return;
                            }
                            if (!results.data || !results.data.length) {
                                alert('El archivo CSV no contiene datos o el formato no es reconocido.');
                                return;
                            }
                            pendingImport = results.data;
                            showPreview(results.data);
                        },
                        error: function (err) {
                            document.body.removeChild(input);
                            alert('Error al leer el CSV: ' + err.message);
                        }
                    });
                } catch (err) {
                    document.body.removeChild(input);
                    alert('Error al procesar el archivo: ' + err.message);
                }
            });
            input.click();
        }

        function showPreview(data) {
            const headers = [...new Set(data.flatMap(row => Object.keys(row)))];
            renderMapping(headers, 'import');
            const previewRows = data.slice(0, 10);
            const totalRows = data.length;

            document.getElementById('preview-info').innerText = totalRows + ' filas detectadas · ' + headers.length + ' columnas';

            const thead = document.getElementById('preview-thead');
            const tbody = document.getElementById('preview-tbody');
            thead.innerHTML = '<tr>' + headers.map(h => '<th>' + esc(h) + '</th>').join('') + '</tr>';
            tbody.innerHTML = previewRows.map(row =>
                '<tr>' + headers.map(h => '<td class="small">' + esc(row[h]) + '</td>').join('') + '</tr>'
            ).join('');

            if (totalRows > 10) {
                const extra = document.createElement('tr');
                extra.innerHTML = '<td colspan="' + headers.length + '" class="text-center text-muted small">... y ' + (totalRows - 10) + ' filas más</td>';
                tbody.appendChild(extra);
            }

            bootstrap.Modal.getOrCreateInstance(document.getElementById('previewModal')).show();
        }

        function confirmImport() {
            if (!pendingImport || !pendingImport.length) return;
            const btn = document.querySelector('#previewModal .btn-action-primary');
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Importando...';

            authFetch(API_BASE + '/api/informes/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: pendingImport, columnMapping: readMapping('import'), dateFormat: document.getElementById('import-date-format').value })
            })
                .then(r => r.json())
                .then(res => {
                    if (res.error) return alert(res.error);
                    bootstrap.Modal.getInstance(document.getElementById('previewModal')).hide();
                    pendingImport = null;
                    showSyncResult(res.sincronizacion, res.message);
                    loadInformes();
                })
                .catch(err => alert('Error: ' + err.message))
                .finally(() => {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="bi bi-check2 me-1"></i>Confirmar importación';
                });
        }

        function deleteInformeRow(rowIndex) {
            if (!confirm('¿Eliminar esta fila permanentemente?')) return;
            authFetch(API_BASE + '/api/informes/' + rowIndex, {
                method: 'DELETE'
            })
                .then(r => r.json())
                .then(res => {
                    if (res.error) return alert(res.error);
                    loadInformes();
                });
        }

        function renderMapping(columns, prefix) {
            const detected = InformesColumns.detect(columns);
            const labels = { grupo: 'Grupo', fecha: 'Fecha de publicación', visualizaciones: 'Visualizaciones', interacciones: 'Interacciones', comentarios: 'Comentarios' };
            document.getElementById(prefix === 'import' ? 'import-mapping-form' : 'sync-mapping-form').innerHTML =
                '<div class="row g-2 mb-3">' + Object.entries(labels).map(([field, label]) => {
                    const compatible = columns.filter(column => InformesColumns.matches(field, column));
                    const profileOption = field === 'grupo' ? '<option value="' + InformesColumns.PROFILE + '"' +
                        (detected.grupo === InformesColumns.PROFILE ? ' selected' : '') + '>Sin grupos: Perfil estándar</option>' : '';
                    return '<div class="col-12 col-md-6"><label class="form-label small" for="' + prefix + '-map-' + field + '">' + label +
                        '</label><select class="form-select form-select-sm" id="' + prefix + '-map-' + field + '"><option value="">No actualizar / sin columna</option>' +
                        profileOption +
                        compatible.map(column => '<option value="' + esc(column) + '"' + (detected[field] === column ? ' selected' : '') + '>' + esc(column) + '</option>').join('') + '</select></div>';
                }).join('') + '</div><p class="text-muted small">Las publicaciones de página sin grupo corresponden a Perfil estándar. Si el archivo mezcla grupos y perfil, elegí la columna Grupo: las filas sin grupo con datos de página se reconocerán automáticamente.</p><label class="form-label small" for="' + prefix + '-date-format">Formato de las fechas del CSV</label><select class="form-select form-select-sm mb-3" id="' + prefix + '-date-format"><option value="auto">Automático (solo fechas inequívocas)</option><option value="dmy">Día / Mes / Año</option><option value="mdy">Mes / Día / Año (exportación en inglés)</option></select>';
        }

        function readMapping(prefix) {
            return Object.fromEntries(['grupo', 'fecha', 'visualizaciones', 'interacciones', 'comentarios'].map(field => [field, document.getElementById(prefix + '-map-' + field).value]).filter(([, value]) => value));
        }

        function showSyncResult(result, message) {
            const box = document.getElementById('import-sync-result');
            box.hidden = false;
            box.className = 'alert ' + (result?.error || result?.omitida || result?.sinMatch || result?.datosInvalidos ? 'alert-warning' : 'alert-success');
            box.textContent = message + '\n' + (result?.motivo ||
                ('Publicaciones actualizadas: ' + (result?.actualizados || 0) + '. Celdas actualizadas: ' + (result?.celdasActualizadas || 0) +
                '. Filas sin aumentos: ' + (result?.yaActualizados || 0) + '. Sin coincidencia segura: ' + (result?.sinMatch || 0) +
                '. Valores vacíos o inválidos omitidos: ' + (result?.datosInvalidos || 0) + '.' +
                (result?.perfilEstandar ? ' Filas identificadas como Perfil estándar: ' + result.perfilEstandar + '.' : '')));
            if (result?.sinMatchEjemplos?.length) {
                const list = document.createElement('ul');
                list.className = 'mb-0 mt-2 small';
                result.sinMatchEjemplos.forEach(example => {
                    const item = document.createElement('li');
                    item.textContent = example.grupo + ' — ' + example.fecha + ': ' + example.motivo;
                    list.appendChild(item);
                });
                box.appendChild(list);
            }
        }

        function openSyncModal() {
            if (!informesData || !informesData.length) {
                alert('No hay datos importados para sincronizar.');
                return;
            }
            const columns = Object.keys(informesData[0]).filter(k => k !== 'rowIndex');

            renderMapping(columns, 'sync');

            bootstrap.Modal.getOrCreateInstance(document.getElementById('syncModal')).show();
        }

        function confirmSync() {
            const columnMapping = readMapping('sync');
            if (!columnMapping.grupo || !columnMapping.fecha) {
                alert('Grupo y Fecha son obligatorios.');
                return;
            }

            const btn = document.querySelector('#syncModal .btn-action-primary');
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Sincronizando...';

            authFetch(API_BASE + '/api/informes/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ columnMapping, dateFormat: document.getElementById('sync-date-format').value })
            })
                .then(r => r.json())
                .then(res => {
                    if (res.error) return alert(res.error);
                    bootstrap.Modal.getInstance(document.getElementById('syncModal')).hide();
                    showSyncResult(res, 'Revisión de informes completada.');
                    loadInformes();
                })
                .catch(err => alert('Error: ' + err.message))
                .finally(() => {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="bi bi-arrow-left-right me-1"></i>Sincronizar';
                });
        }

        document.addEventListener('DOMContentLoaded', () => {
            const session = getCurrentSession();
            if (!session) {
                window.location.href = 'index.html';
                return;
            }
            guardPage('view_informes');
            const initials = session.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            document.getElementById('display-avatar').innerText = initials;
            document.getElementById('display-user-name').innerText = session.name;
            document.getElementById('nav-avatar').innerText = initials;
            document.getElementById('nav-user-name').innerText = session.name.split(' ')[0];
            const isAdmin = (session.role || '').toLowerCase() === 'admin';
            const gestionLabel = document.getElementById('gestion-label');
            const gestionItems = document.getElementById('gestion-items');
            if (gestionLabel) gestionLabel.style.display = isAdmin ? '' : 'none';
            if (gestionItems) gestionItems.style.display = isAdmin ? '' : 'none';
            loadInformes();
        });
    
