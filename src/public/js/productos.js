/**
 * productos.js — Catálogo: listado con fotos, filtros, editor y exportación.
 * Requiere common.js y auth.js.
 */

const LS_STORE_URL = 'catalog_store_url';
const MAX_FOTOS = 8;

let _productos = [];
let _editando  = null; // producto abierto en el editor

const $ = id => document.getElementById(id);

document.addEventListener('DOMContentLoaded', async () => {
  bindFiltros();
  bindEditor();
  bindExport();
  const user = await window.authReady;
  if (!user) return renderSinSesion();
  await cargar();
  enfocarDesdeHash();
});

// ── Datos ─────────────────────────────────────────────────────────────────────
async function cargar() {
  try {
    _productos = (await api('/products')).products || [];
  } catch (err) {
    $('productosLista').innerHTML = `<div class="empty-msg">No se pudo cargar el catálogo: ${escHtml(err.message)}</div>`;
    return;
  }
  renderCategorias();
  renderEstadisticas();
  aplicarFiltros();
}

function reemplazar(product) {
  const i = _productos.findIndex(p => p._id === product._id);
  if (i >= 0) _productos[i] = product;
  renderCategorias();
  renderEstadisticas();
  aplicarFiltros();
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderSinSesion() {
  $('productosLista').innerHTML = `
    <div class="empty-state empty-state--lg">
      <i class="fa-solid fa-lock" aria-hidden="true"></i>
      <p>Iniciá sesión para ver y armar tu catálogo.</p>
      <button type="button" class="btn btn--primary" id="irLogin">Iniciar sesión</button>
    </div>`;
  $('irLogin').addEventListener('click', goToLogin);
}

function renderCategorias() {
  const cats = [...new Set(_productos.map(p => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const sel = $('filtroCategoria');
  const actual = sel.value;
  sel.innerHTML = '<option value="">Todas las categorías</option>' +
    cats.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
  sel.value = cats.includes(actual) ? actual : '';
  sel.hidden = cats.length === 0;
  $('edCategoryList').innerHTML = cats.map(c => `<option value="${escHtml(c)}">`).join('');
}

function renderEstadisticas() {
  const n = _productos.length;
  $('statsBar').hidden = n === 0;
  $('toolbar').hidden = n === 0;
  if (!n) return;
  const sinFoto = _productos.filter(p => !p.images?.length).length;
  const margenes = _productos.filter(p => p.costoTotal > 0).map(p => (p.precioVenta - p.costoTotal) / p.costoTotal * 100);
  $('statTotal').textContent = n;
  $('statPublicados').textContent = _productos.filter(p => p.published).length;
  $('statSinFoto').textContent = sinFoto;
  $('statSinFotoCard').hidden = sinFoto === 0;
  $('statMargen').textContent = margenes.length
    ? Math.round(margenes.reduce((a, b) => a + b, 0) / margenes.length) + '%'
    : '-';
}

function productoCoincide(p, q, cat, estado) {
  if (cat && p.category !== cat) return false;
  if (estado === 'publicados' && !p.published) return false;
  if (estado === 'ocultos' && p.published) return false;
  if (estado === 'sinfoto' && p.images?.length) return false;
  if (!q) return true;
  return [p.name, p.sku, p.category, ...(p.tags || [])].some(v => v && v.toLowerCase().includes(q));
}

function aplicarFiltros() {
  const q = $('filtroTexto').value.trim().toLowerCase();
  const cat = $('filtroCategoria').value;
  const estado = $('filtroEstado').value;
  const visibles = _productos.filter(p => productoCoincide(p, q, cat, estado));
  const filtrando = q || cat || estado;
  $('resultCount').textContent = filtrando && _productos.length
    ? `${visibles.length} de ${_productos.length} productos` : '';
  renderProductos(visibles, filtrando);
}

function renderProductos(prods, filtrando) {
  const lista = $('productosLista');
  lista.innerHTML = '';

  if (!prods.length) {
    lista.innerHTML = filtrando
      ? '<div class="empty-msg">Ningún producto coincide con los filtros.</div>'
      : `<div class="empty-state empty-state--lg">
           <i class="fa-solid fa-store" aria-hidden="true"></i>
           <p>Tu catálogo está vacío. Calculá el precio de un producto y guardalo: aparece acá automáticamente.</p>
           <a href="/" class="btn btn--primary"><i class="fa-solid fa-calculator" aria-hidden="true"></i> Calcular mi primer producto</a>
         </div>`;
    return;
  }

  const frag = document.createDocumentFragment();
  prods.forEach(p => {
    const promo = p.pctDescuento > 0 && p.precioFinal < p.precioVenta;
    const cover = p.images?.[0];
    const margen = p.costoTotal > 0 ? Math.round((p.precioVenta - p.costoTotal) / p.costoTotal * 100) : 0;
    const pendientes = [!cover && 'foto', !p.description && 'descripción'].filter(Boolean);

    const card = document.createElement('article');
    card.className = 'catalog-card' + (p.published ? '' : ' is-hidden');
    card.id = `p-${p._id}`;
    card.innerHTML = `
      <button type="button" class="catalog-card-img" aria-label="Editar ${escHtml(p.name)}">
        ${cover
          ? `<img src="${escHtml(cover.thumbUrl)}" alt="${escHtml(cover.alt || p.name)}" loading="lazy" width="400" height="400">`
          : '<span class="img-placeholder"><i class="fa-solid fa-camera" aria-hidden="true"></i>Agregar foto</span>'}
        <span class="pill ${p.published ? 'pill--ok' : 'pill--muted'}">${p.published ? 'Visible' : 'Oculto'}</span>
        ${p.images?.length > 1 ? `<span class="pill pill--dark pill--br"><i class="fa-solid fa-images" aria-hidden="true"></i> ${p.images.length}</span>` : ''}
      </button>
      <div class="catalog-card-body">
        ${p.category ? `<span class="catalog-card-cat">${escHtml(p.category)}</span>` : ''}
        <h3 class="catalog-card-name">${escHtml(p.name)}</h3>
        <div class="catalog-card-price">
          ${promo
            ? `<span class="price-now">${fmt(p.precioFinal)}</span> <s class="price-old">${fmt(p.precioVenta)}</s>`
            : `<span class="price-now">${fmt(p.precioVenta)}</span>`}
        </div>
        <div class="catalog-card-meta">
          Costo ${fmt(p.costoTotal)} · <span class="margen">${margen}% margen</span>
          ${p.stock !== null && p.stock !== undefined ? ` · Stock ${p.stock}` : ''}
        </div>
        ${pendientes.length ? `<div class="catalog-card-todo"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> Falta ${pendientes.join(' y ')}</div>` : ''}
      </div>
      <div class="catalog-card-actions">
        <button type="button" class="btn btn--secondary btn--sm btn-editar"><i class="fa-solid fa-pen" aria-hidden="true"></i> Editar</button>
        <a class="btn btn--ghost btn--sm" href="/?editar=${p._id}" title="Editar costos e insumos"><i class="fa-solid fa-calculator" aria-hidden="true"></i> Costos</a>
      </div>`;
    card.querySelector('.catalog-card-img').addEventListener('click', () => abrirEditor(p._id));
    card.querySelector('.btn-editar').addEventListener('click', () => abrirEditor(p._id));
    frag.appendChild(card);
  });
  lista.appendChild(frag);
}

function enfocarDesdeHash() {
  const m = location.hash.match(/^#p-([a-f0-9]{24})$/);
  const card = m && $(`p-${m[1]}`);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.add('is-highlight');
  setTimeout(() => card.classList.remove('is-highlight'), 2500);
}

// ── Filtros ───────────────────────────────────────────────────────────────────
function bindFiltros() {
  $('filtroTexto').addEventListener('input', debounce(aplicarFiltros, 120));
  $('filtroCategoria').addEventListener('change', aplicarFiltros);
  $('filtroEstado').addEventListener('change', aplicarFiltros);
  $('statSinFotoCard').addEventListener('click', () => {
    $('filtroEstado').value = 'sinfoto';
    aplicarFiltros();
  });
}

// ── Editor ────────────────────────────────────────────────────────────────────
const numOrNull = v => (v === '' || v === null ? null : Number(v));

function abrirEditor(id) {
  const p = _productos.find(x => x._id === id);
  if (!p) return;
  _editando = p;
  $('editorTitulo').textContent = p.name;
  $('edName').value = p.name;
  $('edDescription').value = p.description || '';
  $('edCategory').value = p.category || '';
  $('edBrand').value = p.brand || '';
  $('edTags').value = (p.tags || []).join(', ');
  $('edSku').value = p.sku || '';
  $('edStock').value = p.stock ?? '';
  $('edWeight').value = p.weightKg ?? '';
  $('edHeight').value = p.dimensionsCm?.height ?? '';
  $('edWidth').value = p.dimensionsCm?.width ?? '';
  $('edDepth').value = p.dimensionsCm?.depth ?? '';
  $('edPublished').checked = !!p.published;
  $('editorRecalcular').href = `/?editar=${p._id}`;
  renderEditorPrecio(p);
  renderEditorFotos(p);
  openModal($('editorModal'));
}

function renderEditorPrecio(p) {
  const promo = p.pctDescuento > 0;
  $('editorPrecio').innerHTML = `
    <div class="res-row"><span>Costo total</span><span class="res-val">${fmt(p.costoTotal)}</span></div>
    <div class="res-row"><span>Precio de venta</span><span class="res-val res-val--big">${fmt(p.precioVenta)}</span></div>
    ${promo ? `<div class="res-row"><span>Precio promocional (${p.pctDescuento}% off)</span><span class="res-val res-val--descuento">${fmt(p.precioFinal)}</span></div>` : ''}
    <div class="res-row"><span>Ganancia</span><span class="res-val res-val--ok">${fmt(p.ganancia)}</span></div>`;
}

function renderEditorFotos(p) {
  const cont = $('editorFotos');
  cont.innerHTML = p.images.length ? '' : '<p class="hint">Todavía no tiene fotos. Los productos con foto venden mucho más.</p>';
  p.images.forEach((img, i) => {
    const fig = document.createElement('figure');
    fig.className = 'foto-thumb';
    fig.innerHTML = `
      <img src="${escHtml(img.thumbUrl)}" alt="${escHtml(img.alt || p.name)}" loading="lazy">
      ${i === 0
        ? '<span class="foto-cover">Portada</span>'
        : `<button type="button" class="foto-setcover">Hacer portada</button>`}
      <button type="button" class="foto-remove" aria-label="Eliminar foto ${i + 1}"><i class="fa-solid fa-trash"></i></button>`;
    fig.querySelector('.foto-setcover')?.addEventListener('click', () =>
      accionFoto(() => api(`/products/${p._id}/images/${img._id}/cover`, { method: 'PATCH' })));
    fig.querySelector('.foto-remove').addEventListener('click', () => {
      if (!confirm('¿Eliminar esta foto?')) return;
      accionFoto(() => api(`/products/${p._id}/images/${img._id}`, { method: 'DELETE' }));
    });
    cont.appendChild(fig);
  });
  const lleno = p.images.length >= MAX_FOTOS;
  $('editorDropzone').hidden = lleno;
}

async function accionFoto(fn) {
  $('editorFotos').classList.add('is-busy');
  try {
    const { product } = await fn();
    _editando = product;
    reemplazar(product);
    renderEditorFotos(product);
  } catch (err) {
    toast(err.message, true);
  } finally {
    $('editorFotos').classList.remove('is-busy');
  }
}

function subirFotos(files) {
  const p = _editando;
  const validas = [...files].filter(f => /^image\/(jpeg|png|webp)$/.test(f.type));
  if (!validas.length) return toast('Elegí fotos JPG, PNG o WebP', true);
  const libres = MAX_FOTOS - p.images.length;
  if (validas.length > libres) toast(`Se suben solo ${libres} (máximo ${MAX_FOTOS} por producto)`, true);
  const fd = new FormData();
  validas.slice(0, libres).forEach(f => fd.append('images', f));
  toast('Subiendo fotos…');
  accionFoto(() => api(`/products/${p._id}/images`, { method: 'POST', body: fd }));
}

function bindEditor() {
  const modal = $('editorModal');
  modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeModal(modal)));
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(modal); });

  $('editorFotosInput').addEventListener('change', e => { subirFotos(e.target.files); e.target.value = ''; });
  const dz = $('editorDropzone');
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('is-over'); }));
  dz.addEventListener('drop', e => subirFotos(e.dataTransfer.files));

  $('editorForm').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('edName').value.trim();
    if (!name) { $('edName').focus(); return toast('El nombre es obligatorio', true); }
    const stock = $('edStock').value;
    if (stock !== '' && !(Number.isInteger(Number(stock)) && Number(stock) >= 0)) {
      $('edStock').focus();
      return toast('El stock debe ser un número entero (o vacío para ilimitado)', true);
    }

    const body = {
      name,
      description: $('edDescription').value.trim(),
      category: $('edCategory').value.trim(),
      brand: $('edBrand').value.trim(),
      tags: $('edTags').value.split(',').map(t => t.trim()).filter(Boolean),
      sku: $('edSku').value.trim(),
      stock: numOrNull(stock),
      weightKg: numOrNull($('edWeight').value),
      dimensionsCm: {
        height: numOrNull($('edHeight').value),
        width: numOrNull($('edWidth').value),
        depth: numOrNull($('edDepth').value),
      },
      published: $('edPublished').checked,
    };

    const btn = $('editorGuardar');
    btn.disabled = true;
    try {
      const { product } = await api(`/products/${_editando._id}`, { method: 'PATCH', body });
      reemplazar(product);
      closeModal(modal);
      toast('Producto actualizado ✓');
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false;
    }
  });

  $('editorEliminar').addEventListener('click', async () => {
    const p = _editando;
    if (!confirm(`¿Eliminar "${p.name}" del catálogo? También se borran sus fotos. No se puede deshacer.`)) return;
    try {
      await api(`/products/${p._id}`, { method: 'DELETE' });
      _productos = _productos.filter(x => x._id !== p._id);
      closeModal(modal);
      renderCategorias();
      renderEstadisticas();
      aplicarFiltros();
      toast('Producto eliminado');
    } catch (err) { toast(err.message, true); }
  });
}

// ── Exportar ──────────────────────────────────────────────────────────────────
function bindExport() {
  const modal = $('exportModal');
  modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeModal(modal)));
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(modal); });

  try { $('storeUrl').value = localStorage.getItem(LS_STORE_URL) || ''; } catch { /* opcional */ }
  const formato = () => modal.querySelector('input[name="exportFormat"]:checked').value;
  modal.querySelectorAll('input[name="exportFormat"]').forEach(r =>
    r.addEventListener('change', () => { $('storeUrlGroup').hidden = formato() !== 'meta'; }));

  $('exportarBtn').addEventListener('click', () => openModal(modal));

  $('exportDescargar').addEventListener('click', async () => {
    const params = new URLSearchParams({ format: formato() });
    if ($('exportSoloPublicados').checked) params.set('onlyPublished', 'true');
    const storeUrl = $('storeUrl').value.trim();
    if (formato() === 'meta' && storeUrl) {
      params.set('storeUrl', storeUrl);
      try { localStorage.setItem(LS_STORE_URL, storeUrl); } catch { /* opcional */ }
    }

    const btn = $('exportDescargar');
    btn.disabled = true;
    try {
      const r = await api(`/products/export?${params}`, { raw: true });
      const blob = await r.blob();
      const name = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') || '')?.[1] || 'catalogo';
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      closeModal(modal);
      toast('Catálogo exportado ✓');
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false;
    }
  });
}
