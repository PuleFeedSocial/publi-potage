document.addEventListener('DOMContentLoaded', () => {
    const templateUpload = document.getElementById('template-upload');
    const templateImg = document.getElementById('template-img');
    const genCanvas = document.getElementById('gen-canvas');
    const priceLayer = document.getElementById('price-layer');
    const priceList = document.getElementById('price-list');
    const regionSelect = document.getElementById('region-select');
    const sucursalSelect = document.getElementById('sucursal-select');
    const tipoSelect = document.getElementById('tipo-select');
    const btnLoadPrecios = document.getElementById('btn-load-precios');
    const btnClearLayout = document.getElementById('btn-clear-layout');
    const btnRemoveTemplate = document.getElementById('btn-remove-template');
    const btnDownloadPng = document.getElementById('btn-download-png');
    const btnDownloadJpg = document.getElementById('btn-download-jpg');

    let precios = [];
    let placedItems = [];

    function populateRegions() {
        if (typeof allRegions === 'undefined') {
            regionSelect.innerHTML = '<option value="">Sin regiones</option>';
            return;
        }
        regionSelect.innerHTML = allRegions.map(r => `<option value="${r.id}">${r.nombre || r.name || r.id}</option>`).join('');
        populateSucursales();
    }

    function populateSucursales() {
        if (typeof allSucursales === 'undefined') {
            sucursalSelect.innerHTML = '<option value="">Todas</option>';
            return;
        }
        const regionId = regionSelect.value;
        const list = allSucursales.filter(s => !regionId || s.regionId == regionId || s.region == regionId);
        sucursalSelect.innerHTML = '<option value="">Todas</option>' + list.map(s => `<option value="${s.id}">${s.nombre || s.name || s.id}</option>`).join('');
    }

    regionSelect.addEventListener('change', populateSucursales);

    templateUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            templateImg.src = ev.target.result;
            templateImg.style.display = 'block';
            templateImg.onload = () => {
                genCanvas.style.width = templateImg.naturalWidth + 'px';
                genCanvas.style.height = templateImg.naturalHeight + 'px';
            };
        };
        reader.readAsDataURL(file);
    });

    btnRemoveTemplate.addEventListener('click', () => {
        templateImg.src = '';
        templateImg.style.display = 'none';
        templateUpload.value = '';
        genCanvas.style.width = 'auto';
        genCanvas.style.height = 'auto';
    });

    btnLoadPrecios.addEventListener('click', async () => {
        if (typeof fetchPrecios === 'function') {
            try {
                const data = await fetchPrecios();
                precios = Array.isArray(data) ? data : (data?.precios || []);
            } catch (err) {
                precios = [];
            }
        } else if (typeof productosData !== 'undefined') {
            precios = productosData;
        }
        renderPriceList();
    });

    function renderPriceList() {
        priceList.innerHTML = '';
        const tipo = tipoSelect.value;
        let items = precios;
        if (tipo !== 'all') {
            items = items.filter(p => (p.tipo || p.type || '').toLowerCase().includes(tipo));
        }
        if (items.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'gen-empty';
            empty.textContent = 'Sin precios para este filtro';
            priceList.appendChild(empty);
            return;
        }
        items.forEach((p, idx) => {
            const item = document.createElement('div');
            item.className = 'gen-price-item';
            item.draggable = true;
            item.dataset.index = idx;
            const name = p.nombre || p.producto || p.descripcion || p.name || 'Producto';
            const value = p.precio || p.price || p.valor || p.importe || '';
            item.innerHTML = `<span class="gen-price-name" title="${name}">${name}</span><span class="gen-price-value">${value}</span>`;
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', JSON.stringify({ name, value, id: p.id || idx }));
            });
            priceList.appendChild(item);
        });
    }

    tipoSelect.addEventListener('change', renderPriceList);

    genCanvas.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    genCanvas.addEventListener('drop', (e) => {
        e.preventDefault();
        let data;
        try {
            data = JSON.parse(e.dataTransfer.getData('text/plain'));
        } catch {
            return;
        }
        const rect = genCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        addPriceLabel(data.name, data.value, x, y);
    });

    function addPriceLabel(name, value, x, y) {
        const label = document.createElement('div');
        label.className = 'gen-price-label';
        label.style.left = x + 'px';
        label.style.top = y + 'px';
        label.innerHTML = `<span class="label-name">${escapeHtml(name)}</span><span class="label-value">${escapeHtml(value)}</span><button class="label-remove" title="Eliminar"><i class="bi bi-x"></i></button>`;
        priceLayer.appendChild(label);
        placedItems.push(label);
        makeDraggable(label);
        label.querySelector('.label-remove').addEventListener('click', () => {
            label.remove();
            placedItems = placedItems.filter(l => l !== label);
        });
    }

    function makeDraggable(el) {
        let dragging = false;
        let offsetX = 0, offsetY = 0;
        el.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('label-remove')) return;
            dragging = true;
            el.classList.add('dragging');
            const rect = el.getBoundingClientRect();
            const parentRect = genCanvas.getBoundingClientRect();
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            const parentRect = genCanvas.getBoundingClientRect();
            const x = e.clientX - parentRect.left - offsetX;
            const y = e.clientY - parentRect.top - offsetY;
            el.style.left = x + 'px';
            el.style.top = y + 'px';
        });
        document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            el.classList.remove('dragging');
        });
    }

    btnClearLayout.addEventListener('click', () => {
        priceLayer.innerHTML = '';
        placedItems = [];
    });

    btnDownloadPng.addEventListener('click', async () => {
        await downloadImage('png');
    });

    btnDownloadJpg.addEventListener('click', async () => {
        await downloadImage('jpeg');
    });

    async function downloadImage(type) {
        if (typeof html2canvas === 'undefined') return;
        const canvasEl = document.getElementById('gen-canvas');
        const canvas = await html2canvas(canvasEl, { useCORS: true, backgroundColor: null, scale: 2 });
        const link = document.createElement('a');
        const ext = type === 'jpeg' ? 'jpg' : 'png';
        link.download = `precios-potage-${Date.now()}.${ext}`;
        link.href = canvas.toDataURL(type === 'jpeg' ? 'image/jpeg' : 'image/png');
        link.click();
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    if (typeof allRegions !== 'undefined' || typeof fetchRegiones === 'function') {
        if (typeof fetchRegiones === 'function') {
            fetchRegiones().then(populateRegions).catch(() => populateRegions());
        } else {
            populateRegions();
        }
    } else {
        populateRegions();
    }
});
