/**
 * script.js — Calculadora: selección de insumos, cálculo en vivo y guardado
 * en el catálogo (con fotos). Requiere common.js, auth.js y /shared/pricing.js.
 */

const DRAFT_KEY = 'calc_draft';
const MAX_FOTOS = 8;

let _user   = null;
let _mats   = [];            // insumos disponibles
let _sel    = new Map();     // Map<id, {mat, qty}>
let _calc   = null;          // último resultado
let _fotos  = [];            // File[] a subir
let _editId = new URLSearchParams(location.search).get('editar');
let _summaryVisible = false;

const $ = id => document.getElementById(id);

document.addEventListener('DOMContentLoaded', async () => {
  bindUI();
  _user = await window.authReady;
  await cargarInsumos();

  if (_editId && _user) await cargarProductoParaEditar(_editId);
  else restaurarBorrador();

  if (_user && !_editId) cargarCategorias();
  document.addEventListener('materials:merged', cargarInsumos);
  recalcular();
});

// ── Datos ─────────────────────────────────────────────────────────────────────
async function cargarInsumos() {
  try {
    _mats = _user ? (await api('/materials')).materials || [] : loadLocal();
  } catch (err) {
    _mats = [];
    toast('No se pudieron cargar los insumos: ' + err.message, true);
  }
  renderBuscador();
}

async function cargarCategorias() {
  try {
    const { products } = await api('/products');
    const cats = [...new Set(products.map(p => p.category).filter(Boolean))].sort();
    $('categoriasList').innerHTML = cats.map(c => `<option value="${escHtml(c)}">`).join('');
  } catch { /* opcional */ }
}

async function cargarProductoParaEditar(id) {
  try {
    const { product: p } = await api(`/products/${id}`);
    $('nombreProducto').value = p.name;
    $('otrosGastos').value = p.pctOtros;
    $('margenGanancia').value = p.pctGanancia;
    $('redondeo').value = String(p.redondeo || 0);
    setDescuento(p.pctDescuento > 0, p.pctDescuento || 10);
    p.insumos.forEach(ins => {
      const mat = ins.materialId && _mats.find(m => m._id === String(ins.materialId));
      // Si el insumo fue borrado se conserva con su último precio
      const m = mat || { _id: `snap-${ins.name}`, name: ins.name, unitPrice: ins.unitPrice, snapshot: true };
      _sel.set(m._id, { mat: m, qty: ins.qty });
    });
    $('editBannerName').textContent = p.name;
    $('editBanner').hidden = false;
    document.title = `Editar ${p.name} — Calculadora de Costos`;
    renderSeleccion();
  } catch (err) {
    _editId = null;
    toast('No se pudo abrir el producto: ' + err.message, true);
  }
}

// ── Borrador (para no perder el cálculo al ir a iniciar sesión) ──────────────
function guardarBorrador() {
  const draft = {
    nombre: $('nombreProducto').value,
    pctOtros: $('otrosGastos').value, pctGanancia: $('margenGanancia').value,
    redondeo: $('redondeo').value,
    descuento: $('descuento').checked, pctDesc: $('porcentajeDescuento').value,
    sel: [..._sel.values()].map(({ mat, qty }) => ({ name: mat.name, unitPrice: mat.unitPrice, qty })),
  };
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

function restaurarBorrador() {
  let d;
  try { d = JSON.parse(sessionStorage.getItem(DRAFT_KEY)); } catch { return; }
  if (!d) return;
  sessionStorage.removeItem(DRAFT_KEY);
  $('nombreProducto').value = d.nombre || '';
  $('otrosGastos').value = d.pctOtros;
  $('margenGanancia').value = d.pctGanancia;
  $('redondeo').value = d.redondeo;
  setDescuento(d.descuento, d.pctDesc);
  // Tras iniciar sesión los insumos locales tienen otro id: se buscan por nombre
  (d.sel || []).forEach(s => {
    const mat = _mats.find(m => m.name.toLowerCase() === s.name.toLowerCase());
    if (mat) _sel.set(mat._id || mat.id, { mat, qty: s.qty });
  });
  renderSeleccion();
  if (_sel.size) toast('Recuperamos tu cálculo. Ya podés guardarlo.');
}

// ── UI ────────────────────────────────────────────────────────────────────────
function bindUI() {
  $('buscarInsumo').addEventListener('input', debounce(filtrarInsumos, 80));
  $('buscarInsumo').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const first = document.querySelector('.insumo-row:not(.hidden-row):not(.is-selected)');
    if (first) agregarASeleccion(first.dataset.id);
  });

  ['otrosGastos', 'margenGanancia', 'porcentajeDescuento', 'redondeo', 'nombreProducto']
    .forEach(id => $(id).addEventListener('input', recalcular));
  $('descuento').addEventListener('change', e => {
    setDescuento(e.target.checked);
    if (e.target.checked) $('porcentajeDescuento').focus();
  });

  $('guardarBtn').addEventListener('click', guardarProducto);
  $('copiarBtn').addEventListener('click', copiarResultado);
  $('limpiarBtn').addEventListener('click', limpiar);
  $('otroBtn').addEventListener('click', limpiar);
  $('loginToSaveBtn').addEventListener('click', () => { guardarBorrador(); goToLogin(); });

  // Fotos
  $('fotosInput').addEventListener('change', e => { agregarFotos(e.target.files); e.target.value = ''; });
  const dz = $('dropzone');
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('is-over'); }));
  dz.addEventListener('drop', e => agregarFotos(e.dataTransfer.files));

  // Barra de precio en móvil: visible mientras el resumen está fuera de pantalla
  const summary = document.querySelector('.calc-summary');
  new IntersectionObserver(([e]) => { _summaryVisible = e.isIntersecting; actualizarPriceBar(); }, { threshold: 0.1 })
    .observe(summary);
  $('priceBar').addEventListener('click', () => summary.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

function actualizarPriceBar() {
  const show = !!_calc && !_summaryVisible && $('guardadoOk').hidden;
  $('priceBar').hidden = !show;
  document.body.classList.toggle('has-price-bar', show);
  if (_calc) $('priceBarVal').textContent = fmt(_calc.pctDescuento > 0 ? _calc.precioFinal : _calc.precioVenta);
}

function setDescuento(on, pct) {
  $('descuento').checked = !!on;
  $('porcentajeDescuento').disabled = !on;
  if (pct !== undefined) $('porcentajeDescuento').value = pct;
  recalcular();
}

function filtrarInsumos() {
  const q = $('buscarInsumo').value.toLowerCase().trim();
  let visibles = 0;
  document.querySelectorAll('.insumo-row').forEach(row => {
    const hide = q && !row.dataset.name.includes(q);
    row.classList.toggle('hidden-row', hide);
    if (!hide) visibles++;
  });
  const empty = $('insumosEmpty');
  if (_mats.length) {
    empty.hidden = visibles > 0;
    empty.textContent = 'Ningún insumo coincide con la búsqueda.';
  }
}

function renderBuscador() {
  const scroll = $('insumosScroll');
  const empty  = $('insumosEmpty');
  scroll.querySelectorAll('.insumo-row').forEach(el => el.remove());

  if (!_mats.length) {
    empty.hidden = false;
    empty.innerHTML = 'Todavía no cargaste insumos. <a href="/insumos.html">Cargá el primero →</a>';
    return;
  }
  empty.hidden = true;

  const frag = document.createDocumentFragment();
  _mats.forEach(m => {
    const id  = m._id || m.id;
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'insumo-row';
    row.setAttribute('role', 'listitem');
    row.dataset.id   = id;
    row.dataset.name = m.name.toLowerCase();
    row.innerHTML = `
      <span class="insumo-info">
        <span class="insumo-nombre">${escHtml(m.name)}</span>
        <span class="insumo-precio">${fmtU(m.unitPrice)} por unidad</span>
      </span>
      <span class="insumo-add" aria-hidden="true"><i class="fa-solid fa-plus"></i></span>`;
    row.addEventListener('click', () => agregarASeleccion(id));
    frag.appendChild(row);
  });
  scroll.appendChild(frag);
  marcarSeleccionados();
  filtrarInsumos();
}

function marcarSeleccionados() {
  document.querySelectorAll('.insumo-row').forEach(row => {
    const sel = _sel.has(row.dataset.id);
    row.classList.toggle('is-selected', sel);
    row.setAttribute('aria-pressed', sel);
    row.querySelector('.insumo-add').innerHTML = `<i class="fa-solid ${sel ? 'fa-check' : 'fa-plus'}"></i>`;
  });
}

// ── Selección ─────────────────────────────────────────────────────────────────
function agregarASeleccion(id) {
  if (_sel.has(id)) {
    document.querySelector(`.qty-input[data-id="${CSS.escape(id)}"]`)?.focus();
    return;
  }
  const mat = _mats.find(m => (m._id || m.id) === id);
  if (!mat) return;
  _sel.set(id, { mat, qty: 1 });
  renderSeleccion();
  const input = document.querySelector(`.qty-input[data-id="${CSS.escape(id)}"]`);
  input?.focus();
  input?.select();
}

function renderSeleccion() {
  const lista = $('seleccionLista');
  lista.innerHTML = '';
  $('seleccionWrapper').hidden = _sel.size === 0;

  _sel.forEach(({ mat, qty }, id) => {
    const item = document.createElement('div');
    item.className = 'seleccion-item';
    item.innerHTML = `
      <span class="seleccion-nombre">${escHtml(mat.name)}
        ${mat.snapshot ? '<span class="badge badge--warn" title="Este insumo fue eliminado; se usa su último precio">eliminado</span>' : ''}
      </span>
      <span class="seleccion-precio">${fmtU(mat.unitPrice)}/u</span>
      <span class="seleccion-qty-wrapper">
        <input type="number" class="qty-input" data-id="${escHtml(id)}" value="${qty}" min="0.01" step="any"
          inputmode="decimal" aria-label="Cantidad de ${escHtml(mat.name)}">
        <span class="seleccion-qty-label">u</span>
      </span>
      <span class="seleccion-sub"></span>
      <button type="button" class="btn-quitar" aria-label="Quitar ${escHtml(mat.name)}">
        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>`;
    item.querySelector('.qty-input').addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      _sel.get(id).qty = v > 0 ? v : 0;
      e.target.classList.toggle('is-invalid', !(v > 0));
      recalcular();
    });
    item.querySelector('.btn-quitar').addEventListener('click', () => {
      _sel.delete(id);
      renderSeleccion();
    });
    lista.appendChild(item);
  });

  marcarSeleccionados();
  recalcular();
}

// ── Cálculo en vivo ───────────────────────────────────────────────────────────
function recalcular() {
  const hayInsumos = _sel.size > 0;
  $('resultadoVacio').hidden = hayInsumos;
  $('resultado').hidden = !hayInsumos;
  $('guardadoOk').hidden = true;
  if (!hayInsumos) { _calc = null; actualizarPriceBar(); return; }

  const conDesc = $('descuento').checked;
  const entradas = [..._sel.entries()];
  _calc = Pricing.computeTotals({
    insumos: entradas.map(([id, { mat, qty }]) => ({
      materialId: mat.snapshot || !_user ? undefined : id,
      name: mat.name, unitPrice: mat.unitPrice, qty,
    })),
    pctOtros:     parseFloat($('otrosGastos').value) || 0,
    pctGanancia:  parseFloat($('margenGanancia').value) || 0,
    pctDescuento: conDesc ? parseFloat($('porcentajeDescuento').value) || 0 : 0,
    redondeo:     Number($('redondeo').value),
  });
  const c = _calc;

  // Subtotal por línea
  document.querySelectorAll('.seleccion-item .seleccion-sub').forEach((el, i) => {
    el.textContent = fmt(c.insumos[i].subtotal);
  });

  $('resPrecioVenta').textContent = fmt(c.precioVenta);
  const promo = $('resPrecioPromo');
  promo.hidden = !(c.pctDescuento > 0);
  promo.textContent = `${fmt(c.precioFinal)} con ${c.pctDescuento}% off`;

  $('resCostoInsumos').textContent = fmt(c.costoInsumos);
  $('rowOtrosGastos').hidden = !(c.pctOtros > 0);
  $('labelOtrosGastos').textContent = `Otros gastos (${c.pctOtros}%)`;
  $('resOtrosGastos').textContent = fmt(c.montOtros);
  $('resCostoTotal').textContent = fmt(c.costoTotal);
  const margenReal = c.costoTotal > 0 ? (c.ganancia / c.costoTotal) * 100 : 0;
  $('labelGanancia').textContent = `Ganancia (${margenReal.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%)`;
  $('resGanancia').textContent = fmt(c.ganancia);

  $('detalleInsumos').innerHTML = c.insumos.map(i => `
    <div class="detalle-row">
      <span class="detalle-nombre">${escHtml(i.name)}</span>
      <span>${i.qty} u × ${fmtU(i.unitPrice)} = <strong>${fmt(i.subtotal)}</strong></span>
    </div>`).join('');

  // Acciones según sesión / modo
  $('loginPrompt').hidden = !!_user;
  $('guardarBtn').hidden = !_user;
  $('catalogoBlock').hidden = !_user || !!_editId;
  $('guardarBtn').querySelector('span').textContent = _editId ? 'Guardar cambios' : 'Guardar en catálogo';
  actualizarPriceBar();
}

// ── Fotos ─────────────────────────────────────────────────────────────────────
function agregarFotos(files) {
  const validas = [...files].filter(f => /^image\/(jpeg|png|webp)$/.test(f.type));
  if (validas.length < files.length) toast('Algunos archivos no son JPG, PNG o WebP y se omitieron', true);
  const grandes = validas.filter(f => f.size > 8 * 1024 * 1024);
  if (grandes.length) toast('Cada foto puede pesar hasta 8 MB', true);
  _fotos = [..._fotos, ...validas.filter(f => f.size <= 8 * 1024 * 1024)];
  if (_fotos.length > MAX_FOTOS) {
    toast(`Máximo ${MAX_FOTOS} fotos por producto`, true);
    _fotos = _fotos.slice(0, MAX_FOTOS);
  }
  renderFotos();
}

function renderFotos() {
  const cont = $('fotosPreview');
  cont.querySelectorAll('img').forEach(img => URL.revokeObjectURL(img.src));
  cont.innerHTML = '';
  _fotos.forEach((f, i) => {
    const fig = document.createElement('figure');
    fig.className = 'foto-thumb';
    const url = URL.createObjectURL(f);
    fig.innerHTML = `
      <img src="${url}" alt="Foto ${i + 1}">
      ${i === 0 ? '<span class="foto-cover">Portada</span>' : ''}
      <button type="button" class="foto-remove" aria-label="Quitar foto ${i + 1}"><i class="fa-solid fa-xmark"></i></button>`;
    fig.querySelector('.foto-remove').addEventListener('click', () => {
      _fotos.splice(i, 1);
      renderFotos();
    });
    cont.appendChild(fig);
  });
}

// ── Guardar ───────────────────────────────────────────────────────────────────
async function guardarProducto() {
  if (!_calc) return;
  const nombreIn = $('nombreProducto');
  const nombre = nombreIn.value.trim();
  if (!nombre) {
    toast('Poné un nombre al producto para guardarlo', true);
    nombreIn.classList.add('is-invalid');
    nombreIn.focus();
    nombreIn.addEventListener('input', () => nombreIn.classList.remove('is-invalid'), { once: true });
    return;
  }
  if (_calc.insumos.some(i => !(i.qty > 0))) {
    toast('Revisá las cantidades: todas deben ser mayores a 0', true);
    return;
  }

  const btn = $('guardarBtn');
  const label = btn.querySelector('span');
  btn.disabled = true;
  label.textContent = 'Guardando…';

  const payload = {
    name: nombre,
    insumos: _calc.insumos.map(({ materialId, name, unitPrice, qty }) => ({ materialId, name, unitPrice, qty })),
    pctOtros: _calc.pctOtros, pctGanancia: _calc.pctGanancia,
    pctDescuento: _calc.pctDescuento, redondeo: _calc.redondeo,
  };

  try {
    if (_editId) {
      await api(`/products/${_editId}`, { method: 'PUT', body: payload });
      toast('Cambios guardados ✓');
      window.location.href = `/productos.html#p-${_editId}`;
      return;
    }

    payload.category = $('categoria').value.trim();
    payload.description = $('descripcion').value.trim();
    const { product } = await api('/products', { method: 'POST', body: payload });

    if (_fotos.length) {
      label.textContent = 'Subiendo fotos…';
      const fd = new FormData();
      _fotos.forEach(f => fd.append('images', f));
      try {
        await api(`/products/${product._id}/images`, { method: 'POST', body: fd });
      } catch (err) {
        toast('El producto se guardó, pero las fotos no: ' + err.message + '. Podés subirlas desde el catálogo.', true);
      }
    }

    $('guardadoNombre').textContent = product.name;
    $('verCatalogoBtn').href = `/productos.html#p-${product._id}`;
    $('resultado').hidden = true;
    $('guardadoOk').hidden = false;
    actualizarPriceBar();
    $('verCatalogoBtn').focus();
  } catch (err) {
    toast('No se pudo guardar: ' + err.message, true);
  } finally {
    btn.disabled = false;
    label.textContent = _editId ? 'Guardar cambios' : 'Guardar en catálogo';
  }
}

// ── Copiar / limpiar ──────────────────────────────────────────────────────────
function copiarResultado() {
  if (!_calc) return;
  const c = _calc;
  const lines = [
    `Producto: ${$('nombreProducto').value.trim() || 'Sin nombre'}`,
    `Costo insumos: ${fmt(c.costoInsumos)}`,
    c.pctOtros > 0 ? `Otros gastos (${c.pctOtros}%): ${fmt(c.montOtros)}` : null,
    `Costo total: ${fmt(c.costoTotal)}`,
    `Ganancia: ${fmt(c.ganancia)}`,
    `Precio de venta: ${fmt(c.precioVenta)}`,
    c.pctDescuento > 0 ? `Con ${c.pctDescuento}% off: ${fmt(c.precioFinal)}` : null,
  ].filter(Boolean).join('\n');
  navigator.clipboard?.writeText(lines)
    .then(() => toast('Copiado al portapapeles'))
    .catch(() => toast('No se pudo copiar', true));
}

function limpiar() {
  if (_editId) { window.location.href = '/'; return; }
  _sel.clear();
  _fotos = [];
  renderFotos();
  $('nombreProducto').value = '';
  $('buscarInsumo').value = '';
  $('categoria').value = '';
  $('descripcion').value = '';
  renderSeleccion();
  filtrarInsumos();
  $('nombreProducto').focus();
}
