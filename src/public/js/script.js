/**
 * script.js — Lógica principal de la calculadora de costos
 * Integra los materiales guardados en el backend como insumos para el cálculo.
 */

document.addEventListener('DOMContentLoaded', () => {
  bindToggles();
  document.getElementById('calcBtn')?.addEventListener('click', calcularCostos);
  document.getElementById('copiarTotales')?.addEventListener('click', copiarTotales);
  initMaterialsUI();
});

// ─── Constantes ──────────────────────────────────────────────────────────────

const MATERIALS_KEY = 'materials_v1';
const API_BASE = '/api';

// ─── Toggles de UI ───────────────────────────────────────────────────────────

function bindToggles() {
  const pairs = [
    ['anillado',       'tipoAnillado'],
    ['polipropileno',  'cantidadPolipropileno'],
    ['stickers',       'cantidadStickers'],
    ['descuento',      'porcentajeDescuento'],
  ];
  pairs.forEach(([checkId, targetId]) => {
    const chk = document.getElementById(checkId);
    const tgt = document.getElementById(targetId);
    if (chk && tgt) {
      chk.addEventListener('change', () => {
        tgt.style.display = chk.checked ? 'inline-block' : 'none';
        if (!chk.checked) tgt.value = tgt.type === 'number' ? '0' : '';
      });
    }
  });
}

// ─── Token helper ────────────────────────────────────────────────────────────

function getAccessToken() {
  return localStorage.getItem('accessToken') || null;
}

// ─── API calls ───────────────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const token = getAccessToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(API_BASE + path, { ...options, headers });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = data.message || (Array.isArray(data.errors) ? data.errors.join(', ') : 'Error de red');
    throw new Error(msg);
  }
  return res.json();
}

async function fetchMaterialsRemote() {
  try {
    if (!getAccessToken()) return null;
    const data = await apiFetch('/materials');
    return data.materials || [];
  } catch {
    return null;
  }
}

async function addMaterialRemote(payload) {
  const data = await apiFetch('/materials', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.material;
}

async function updateMaterialRemote(id, payload) {
  const data = await apiFetch(`/materials/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return data.material;
}

async function deleteMaterialRemote(id) {
  await apiFetch(`/materials/${id}`, { method: 'DELETE' });
  return true;
}

// ─── localStorage fallback ───────────────────────────────────────────────────

function loadMaterials() {
  try { return JSON.parse(localStorage.getItem(MATERIALS_KEY) || '[]'); }
  catch { return []; }
}
function saveMaterials(list) {
  localStorage.setItem(MATERIALS_KEY, JSON.stringify(list));
}
function clearMaterialsUI() {
  const tbody = document.querySelector('#materialsTable tbody');
  if (tbody) tbody.innerHTML = '';
}
window.clearMaterialsUI = clearMaterialsUI;

// ─── Merge al autenticarse ───────────────────────────────────────────────────

async function mergeLocalMaterials() {
  try {
    const local = loadMaterials();
    if (!Array.isArray(local) || local.length === 0) return;
    await apiFetch('/materials/merge', {
      method: 'POST',
      body: JSON.stringify({ materials: local }),
    });
    saveMaterials([]);
  } catch (e) {
    console.warn('Merge error:', e.message);
  }
}
window.mergeLocalMaterials = mergeLocalMaterials;

// ─── Render de materiales ────────────────────────────────────────────────────

let _cachedMaterials = []; // caché local para cálculos

async function renderMaterials() {
  const tbody = document.querySelector('#materialsTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="color:#999;text-align:center">Cargando…</td></tr>';

  const token = getAccessToken();
  if (token) {
    const remote = await fetchMaterialsRemote();
    _cachedMaterials = Array.isArray(remote) ? remote : [];
  } else {
    _cachedMaterials = loadMaterials();
  }

  buildTable(tbody, _cachedMaterials, !!token);
  populateMaterialSelector(_cachedMaterials);
}

function buildTable(tbody, materials, isAuth) {
  tbody.innerHTML = '';
  if (materials.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="color:#999;text-align:center">Sin materiales</td></tr>';
    return;
  }
  materials.forEach((m) => {
    const id = m._id || m.id;
    const tr = document.createElement('tr');
    tr.dataset.id = id;
    tr.innerHTML = `
      <td class="mat-name">${escapeHtml(m.name)}</td>
      <td>$${Number(m.totalCost).toFixed(2)}</td>
      <td>${m.qty}</td>
      <td>$${Number(m.unitPrice).toFixed(4)}</td>
      <td>
        ${isAuth ? `<button class="smallBtn editBtn" data-id="${id}" title="Editar">✏️</button> ` : ''}
        <button class="smallBtn delBtn" data-id="${id}" title="Eliminar">🗑</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Handlers eliminar
  tbody.querySelectorAll('.delBtn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (!confirm('¿Eliminar este material?')) return;
      try {
        if (getAccessToken()) {
          await deleteMaterialRemote(id);
        } else {
          saveMaterials(loadMaterials().filter((x) => (x.id || x._id) !== id));
        }
        await renderMaterials();
      } catch (err) {
        alert('Error: ' + err.message);
      }
    });
  });

  // Handlers editar (solo autenticado)
  tbody.querySelectorAll('.editBtn').forEach((btn) => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.id));
  });
}

// ─── Modal de edición ────────────────────────────────────────────────────────

function openEditModal(id) {
  const mat = _cachedMaterials.find((m) => (m._id || m.id) === id);
  if (!mat) return;

  // Crear modal simple si no existe
  let modal = document.getElementById('editModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'editModal';
    modal.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.5);
      display:flex;align-items:center;justify-content:center;z-index:9999;
    `;
    modal.innerHTML = `
      <div style="background:#fff;color:#222;padding:24px;border-radius:12px;min-width:320px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.2)">
        <h3 style="margin:0 0 16px">Editar material</h3>
        <label style="display:block;margin-bottom:8px;font-size:.85rem">Nombre</label>
        <input id="editName" type="text" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;box-sizing:border-box;margin-bottom:12px" />
        <label style="display:block;margin-bottom:8px;font-size:.85rem">Costo total (ARS)</label>
        <input id="editCost" type="number" min="0.01" step="0.01" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;box-sizing:border-box;margin-bottom:12px" />
        <label style="display:block;margin-bottom:8px;font-size:.85rem">Cantidad</label>
        <input id="editQty" type="number" min="1" step="1" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;box-sizing:border-box;margin-bottom:16px" />
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button id="editCancel" class="smallBtn" style="background:#999">Cancelar</button>
          <button id="editSave" class="botonFinal">Guardar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  document.getElementById('editName').value = mat.name;
  document.getElementById('editCost').value = mat.totalCost;
  document.getElementById('editQty').value = mat.qty;
  modal.style.display = 'flex';

  document.getElementById('editCancel').onclick = () => { modal.style.display = 'none'; };
  modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };

  document.getElementById('editSave').onclick = async () => {
    const name = document.getElementById('editName').value.trim();
    const totalCost = parseFloat(document.getElementById('editCost').value);
    const qty = parseInt(document.getElementById('editQty').value, 10);
    if (!name || isNaN(totalCost) || totalCost <= 0 || isNaN(qty) || qty <= 0) {
      alert('Datos inválidos');
      return;
    }
    try {
      await updateMaterialRemote(id, { name, totalCost, qty });
      modal.style.display = 'none';
      await renderMaterials();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };
}

// ─── Selector de materiales para cálculo ─────────────────────────────────────

function populateMaterialSelector(materials) {
  const container = document.getElementById('matInsumos');
  if (!container) return;
  container.innerHTML = '';

  if (materials.length === 0) {
    container.innerHTML = '<p class="muted" style="font-size:.85rem">Agregá materiales arriba para usarlos en el cálculo.</p>';
    return;
  }

  const label = document.createElement('p');
  label.style.cssText = 'font-size:.85rem;margin-bottom:8px;color:#333;font-weight:600';
  label.textContent = 'Seleccioná los materiales que usás en este producto y la cantidad por unidad:';
  container.appendChild(label);

  materials.forEach((m) => {
    const id = m._id || m.id;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap';
    row.innerHTML = `
      <input type="checkbox" id="chk_${id}" class="matCheck" data-id="${id}" style="width:auto">
      <label for="chk_${id}" style="flex:1;min-width:120px;color:#333;font-size:.9rem">${escapeHtml(m.name)} <span style="color:#888;font-size:.8rem">($${Number(m.unitPrice).toFixed(4)}/u)</span></label>
      <input type="number" id="qty_${id}" class="matQtyInput" data-id="${id}" value="1" min="1" step="1"
        style="width:70px;padding:6px;border:1px solid #ddd;border-radius:6px;display:none" placeholder="Cant.">
    `;
    container.appendChild(row);

    const chk = row.querySelector('.matCheck');
    const qtyInput = row.querySelector('.matQtyInput');
    chk.addEventListener('change', () => {
      qtyInput.style.display = chk.checked ? 'inline-block' : 'none';
    });
  });
}

// ─── Init form materiales ─────────────────────────────────────────────────────

function initMaterialsUI() {
  const matForm = document.getElementById('materialForm');
  const nameInput = document.getElementById('matName');
  const totalCostInput = document.getElementById('matTotalCost');
  const qtyInput = document.getElementById('matQty');
  const unitSpan = document.getElementById('matUnitPrice');

  function updateUnitDisplay() {
    const cost = parseFloat(totalCostInput?.value) || 0;
    const qty = parseFloat(qtyInput?.value) || 0;
    if (unitSpan) unitSpan.textContent = qty > 0 ? (cost / qty).toFixed(4) + ' ARS' : '-';
  }

  totalCostInput?.addEventListener('input', updateUnitDisplay);
  qtyInput?.addEventListener('input', updateUnitDisplay);

  matForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameInput?.value.trim();
    const totalCost = parseFloat(totalCostInput?.value);
    const qty = parseInt(qtyInput?.value, 10);

    if (!name || isNaN(totalCost) || totalCost <= 0 || isNaN(qty) || qty <= 0) {
      alert('Completá nombre, costo total y cantidad válida.');
      return;
    }

    const addBtn = document.getElementById('addMatBtn');
    if (addBtn) addBtn.disabled = true;

    try {
      if (getAccessToken()) {
        await addMaterialRemote({ name, totalCost, qty });
      } else {
        const materials = loadMaterials();
        materials.push({
          id: Date.now().toString(),
          name,
          totalCost: parseFloat(totalCost.toFixed(2)),
          qty,
          unitPrice: parseFloat((totalCost / qty).toFixed(4)),
        });
        saveMaterials(materials);
      }
      matForm.reset();
      if (unitSpan) unitSpan.textContent = '-';
      await renderMaterials();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      if (addBtn) addBtn.disabled = false;
    }
  });

  renderMaterials();
}

// ─── Calculadora principal ───────────────────────────────────────────────────

function calcularCostos() {
  const nombre = document.getElementById('nombreProducto')?.value.trim() || 'Producto';
  const tamano = document.getElementById('tamanoProducto')?.value || 'A5';
  const hojas = Number(document.getElementById('cantidadHojas')?.value) || 0;
  const tieneAnillado = document.getElementById('anillado')?.checked || false;
  const tipoAnillado = document.getElementById('tipoAnillado')?.value || 'plastico';
  const tipoTapa = document.getElementById('tipoTapas')?.value || 'blanda';
  const tienePoli = document.getElementById('polipropileno')?.checked || false;
  const cantidadPoli = Number(document.getElementById('cantidadPolipropileno')?.value) || 0;
  const tieneStickers = document.getElementById('stickers')?.checked || false;
  const cantidadStk = Number(document.getElementById('cantidadStickers')?.value) || 0;
  const tieneDescuento = document.getElementById('descuento')?.checked || false;
  const pctDescuento = Number(document.getElementById('porcentajeDescuento')?.value) || 0;

  // ── Calcular costo de materiales seleccionados del panel ──────────────────
  let costoInsumos = 0;
  const insumosUsados = [];
  document.querySelectorAll('.matCheck:checked').forEach((chk) => {
    const id = chk.dataset.id;
    const mat = _cachedMaterials.find((m) => (m._id || m.id) === id);
    const qtyInput = document.getElementById(`qty_${id}`);
    const cantUsada = parseInt(qtyInput?.value, 10) || 1;
    if (mat && cantUsada > 0) {
      const subtotal = mat.unitPrice * cantUsada;
      costoInsumos += subtotal;
      insumosUsados.push({ name: mat.name, qty: cantUsada, unit: mat.unitPrice, subtotal });
    }
  });

  // ── Precios fijos del producto ────────────────────────────────────────────
  const precioPorHoja  = { A5: 5, A6: 4, A7: 3 }[tamano] ?? 5;
  const precioTapa     = tipoTapa === 'dura' ? 20 : 10;
  const precioAnillado = tieneAnillado ? (tipoAnillado === 'metal' ? 10 : 5) : 0;
  const precioPoli     = tienePoli ? cantidadPoli * 2 : 0;
  const precioStk      = tieneStickers ? cantidadStk * 6 : 0;

  const costoFijo = hojas * precioPorHoja + precioTapa + precioAnillado + precioPoli + precioStk;
  const costoMateriales = costoFijo + costoInsumos;

  // Otros gastos 15%
  const otrosGastos = costoMateriales * 0.15;
  const costoTotal = costoMateriales + otrosGastos;

  // Ganancia 30%
  const ganancia = costoTotal * 0.30;
  const precioPublico = costoTotal + ganancia;
  const precioConDescuento = tieneDescuento && pctDescuento > 0
    ? precioPublico * (1 - pctDescuento / 100)
    : precioPublico;

  // ── Renderizar resultado ──────────────────────────────────────────────────
  const fmt = (n) => `$${Number(n).toFixed(2)}`;

  document.getElementById('producto').textContent = `Producto: ${nombre} (${tamano})`;
  document.getElementById('costos').textContent =
    `Costo total (materiales + otros 15%): ${fmt(costoTotal)}`;
  document.getElementById('ganancias').textContent =
    `Ganancia estimada (30%): ${fmt(ganancia)}`;
  document.getElementById('precioPublico').textContent =
    `Precio al público: ${fmt(precioPublico)}`;
  document.getElementById('precioConDescuento').textContent =
    tieneDescuento && pctDescuento > 0
      ? `Precio con ${pctDescuento}% de descuento: ${fmt(precioConDescuento)}`
      : '';

  // Detalle de insumos seleccionados
  let detalleEl = document.getElementById('detalleInsumos');
  if (!detalleEl) {
    detalleEl = document.createElement('div');
    detalleEl.id = 'detalleInsumos';
    detalleEl.style.cssText = 'margin-top:10px;font-size:.85rem;color:#555';
    document.getElementById('totalesFinales')?.appendChild(detalleEl);
  }
  if (insumosUsados.length > 0) {
    detalleEl.innerHTML = `
      <strong>Insumos incluidos:</strong><br>
      ${insumosUsados.map((i) =>
        `${escapeHtml(i.name)} × ${i.qty} = $${i.subtotal.toFixed(4)}`
      ).join('<br>')}
      <br><em>Subtotal insumos: $${costoInsumos.toFixed(2)}</em>
    `;
  } else {
    detalleEl.innerHTML = '';
  }
}

// ─── Copiar resultado ────────────────────────────────────────────────────────

function copiarTotales() {
  const ids = ['producto', 'costos', 'ganancias', 'precioPublico', 'precioConDescuento'];
  const lines = ids
    .map((id) => document.getElementById(id)?.textContent)
    .filter(Boolean)
    .join('\n');

  navigator.clipboard?.writeText(lines).then(() => {
    const toast = document.getElementById('toast');
    if (toast) {
      toast.style.opacity = '1';
      setTimeout(() => (toast.style.opacity = '0'), 1500);
    }
  }).catch(() => alert('No fue posible copiar al portapapeles'));
}

// ─── Utils ───────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
