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
            const headers = Object.keys(data[0]);
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

            new bootstrap.Modal(document.getElementById('previewModal')).show();
        }

        function confirmImport() {
            if (!pendingImport || !pendingImport.length) return;
            const btn = document.querySelector('#previewModal .btn-action-primary');
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Importando...';

            authFetch(API_BASE + '/api/informes/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: pendingImport })
            })
                .then(r => r.json())
                .then(res => {
                    if (res.error) return alert(res.error);
                    bootstrap.Modal.getInstance(document.getElementById('previewModal')).hide();
                    pendingImport = null;
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

        function openSyncModal() {
            if (!informesData || !informesData.length) {
                alert('No hay datos importados para sincronizar.');
                return;
            }
            const columns = Object.keys(informesData[0]).filter(k => k !== 'rowIndex');

            const autoDetect = {
                grupo: columns.find(c => /(nombre.*p[áa]gina|grupo|page.*name)/i.test(c)) || '',
                fecha: columns.find(c => /(fecha|date|d[íi]a|post.*date|publicaci[óo]n.*fecha)/i.test(c)) || '',
                visualizaciones: columns.find(c => /(visualizaciones|views|alcance|reach)/i.test(c)) || '',
                interacciones: columns.find(c => /(interacciones|interactions|reacciones|engagement)/i.test(c)) || '',
                comentarios: columns.find(c => /(comentarios|comments)/i.test(c)) || ''
            };

            const fields = [
                { key: 'grupo', label: 'Grupo / Página *', required: true },
                { key: 'fecha', label: 'Fecha *', required: true },
                { key: 'visualizaciones', label: 'Visualizaciones' },
                { key: 'interacciones', label: 'Interacciones' },
                { key: 'comentarios', label: 'Comentarios' }
            ];

            const form = document.getElementById('sync-mapping-form');
            form.innerHTML = fields.map(f => {
                const opts = '<option value="">— No mapear —</option>' +
                    columns.map(c =>
                        '<option value="' + esc(c) + '"' +
                        (c === autoDetect[f.key] ? ' selected' : '') +
                        '>' + esc(c) + '</option>'
                    ).join('');
                return '<div class="mb-3"><label class="form-label small fw-medium">' + f.label +
                    '</label><select class="form-select form-select-sm" id="sync-map-' + f.key + '">' +
                    opts + '</select></div>';
            }).join('');

            new bootstrap.Modal(document.getElementById('syncModal')).show();
        }

        function confirmSync() {
            const columnMapping = {};
            ['grupo', 'fecha', 'visualizaciones', 'interacciones', 'comentarios'].forEach(f => {
                const val = document.getElementById('sync-map-' + f).value;
                if (val) columnMapping[f] = val;
            });

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
                body: JSON.stringify({ columnMapping })
            })
                .then(r => r.json())
                .then(res => {
                    if (res.error) return alert(res.error);
                    bootstrap.Modal.getInstance(document.getElementById('syncModal')).hide();
                    let msg = 'Sincronización completada.\n\n' +
                        'Total filas en Informes: ' + res.total + '\n' +
                        'Actualizadas: ' + res.actualizados + '\n' +
                        'Sin coincidencia: ' + res.sinMatch + '\n' +
                        'Ya actualizadas: ' + (res.yaActualizados || 0) + '\n' +
                        'Fuera de rango (>7 días): ' + (res.fueraRango || 0);
                    if (res.sinMatch > 0 && res.sinMatchEjemplos && res.sinMatchEjemplos.length) {
                        msg += '\n\nEjemplos sin match:\n' +
                            res.sinMatchEjemplos.map(e => '  • ' + e.grupo + ' — ' + e.fecha).join('\n');
                    }
                    if (res.metricasKeysMuestra && res.metricasKeysMuestra.length) {
                        msg += '\n\nClaves en Métricas (muestra):\n' +
                            res.metricasKeysMuestra.map(k => '  • ' + k).join('\n');
                    }
                    alert(msg);
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
    
