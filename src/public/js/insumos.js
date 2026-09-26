/**
 * insumos.js — ABM de insumos. Requiere common.js y auth.js.
 */

let _user   = null;
let _mats   = [];
let _editId = null;

document.addEventListener('DOMContentLoaded', async () => {
  bindForm();
  bindFiltro();
  bindModal();
  _user = await window.authReady;
  await cargar();
  document.addEventListener('materials:merged', cargar);
});

async function cargar() {
  const tbody = document.querySelector('#materialsTable tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="empty-msg"><i class="fa-solid fa-spinner fa-spin"></i> Cargando…</td></tr>';
  try {
    _mats = _user ? (await api('/materials')).materials || [] : loadLocal();
  } catch (err) {
    _mats = [];
    toast('No se pudieron cargar los insumos: ' + err.message, true);
  }
  renderTabla(_mats);
  const el = document.getElementById('contadorInsumos');
  if (el) el.textContent = _mats.length ? `${_mats.length} insumo${_mats.length !== 1 ? 's' : ''}` : '';
  document.getElementById('avisoLocal').hidden = !!_user || !_mats.length;
}

function renderTabla(mats) {
  const tbody = document.querySelector('#materialsTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!mats.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-msg">No hay insumos cargados. ¡Agregá el primero!</td></tr>';
    return;
  }

  const frag = document.createDocumentFragment();
  mats.forEach(m => {
    const id = m._id || m.id;
    const tr = document.createElement('tr');
    tr.dataset.name = m.name.toLowerCase();
    tr.innerHTML = `
      <td data-label="Nombre"><strong>${escHtml(m.name)}</strong></td>
      <td data-label="Costo pack">${fmt(m.totalCost)}</td>
      <td data-label="Unidades">${m.qty}</td>
      <td data-label="Costo/u" class="td-unit">${fmtU(m.unitPrice)}</td>
      <td class="acciones">
        ${_user ? `<button class="btn-icon" data-action="editar" title="Editar" aria-label="Editar ${escHtml(m.name)}"><i class="fa-solid fa-pen"></i></button>` : ''}
        <button class="btn-icon btn-icon--danger" data-action="eliminar" title="Eliminar" aria-label="Eliminar ${escHtml(m.name)}"><i class="fa-solid fa-trash"></i></button>
      </td>`;
    tr.querySelector('[data-action="editar"]')?.addEventListener('click', () => abrirEdicion(id));
    tr.querySelector('[data-action="eliminar"]').addEventListener('click', () => eliminar(id));
    frag.appendChild(tr);
  });
  tbody.appendChild(frag);
  filtrar();
}

// ── Filtro ────────────────────────────────────────────────────────────────────
function filtrar() {
  const q = document.getElementById('filtroTabla').value.toLowerCase().trim();
  document.querySelectorAll('#materialsTable tbody tr[data-name]').forEach(tr => {
    tr.hidden = !!q && !tr.dataset.name.includes(q);
  });
}

function bindFiltro() {
  document.getElementById('filtroTabla')?.addEventListener('input', debounce(filtrar, 80));
}

// ── Form agregar ──────────────────────────────────────────────────────────────
function bindForm() {
  const form    = document.getElementById('materialForm');
  const costIn  = document.getElementById('matTotalCost');
  const qtyIn   = document.getElementById('matQty');
  const preview = document.getElementById('matUnitPrice');

  const upd = () => {
    const c = parseFloat(costIn.value) || 0;
    const q = parseFloat(qtyIn.value)  || 0;
    preview.textContent = q > 0 && c > 0 ? fmtU(c / q) : '-';
  };
  costIn.addEventListener('input', upd);
  qtyIn.addEventListener('input', upd);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const nameIn    = document.getElementById('matName');
    const name      = nameIn.value.trim();
    const totalCost = parseFloat(costIn.value);
    const qty       = Number(qtyIn.value);
    if (!name) { nameIn.focus(); return toast('Escribí el nombre del insumo', true); }
    if (!(totalCost > 0)) { costIn.focus(); return toast('El costo debe ser mayor a 0', true); }
    if (!(Number.isInteger(qty) && qty > 0)) { qtyIn.focus(); return toast('Las unidades deben ser un número entero mayor a 0', true); }
    if (_mats.some(m => m.name.toLowerCase() === name.toLowerCase())) {
      nameIn.focus();
      return toast('Ya tenés un insumo con ese nombre. Editalo desde la tabla.', true);
    }

    const btn = document.getElementById('addMatBtn');
    btn.disabled = true;
    try {
      if (_user) {
        await api('/materials', { method: 'POST', body: { name, totalCost, qty } });
      } else {
        const l = loadLocal();
        l.push({ id: Date.now().toString(), name, totalCost, qty, unitPrice: parseFloat((totalCost / qty).toFixed(4)) });
        saveLocal(l);
      }
      form.reset();
      preview.textContent = '-';
      await cargar();
      nameIn.focus();
      toast('Insumo agregado ✓');
    } catch (err) {
      toast('Error: ' + err.message, true);
    } finally {
      btn.disabled = false;
    }
  });
}

// ── Eliminar ──────────────────────────────────────────────────────────────────
async function eliminar(id) {
  if (!confirm('¿Eliminar este insumo? Los productos que lo usan conservan su último precio.')) return;
  try {
    if (_user) await api(`/materials/${id}`, { method: 'DELETE' });
    else saveLocal(loadLocal().filter(m => (m.id || m._id) !== id));
    await cargar();
    toast('Insumo eliminado');
  } catch (err) { toast('Error: ' + err.message, true); }
}

// ── Modal edición ─────────────────────────────────────────────────────────────
function abrirEdicion(id) {
  const mat = _mats.find(m => (m._id || m.id) === id);
  if (!mat) return;
  _editId = id;
  document.getElementById('editName').value = mat.name;
  document.getElementById('editCost').value = mat.totalCost;
  document.getElementById('editQty').value  = mat.qty;
  document.getElementById('editPreview').textContent = fmtU(mat.unitPrice);
  openModal(document.getElementById('editModal'));
}

function bindModal() {
  const modal    = document.getElementById('editModal');
  const editCost = document.getElementById('editCost');
  const editQty  = document.getElementById('editQty');
  const prev     = document.getElementById('editPreview');

  const upd = () => {
    const c = parseFloat(editCost.value) || 0;
    const q = parseFloat(editQty.value)  || 0;
    prev.textContent = q > 0 ? fmtU(c / q) : '-';
  };
  editCost.addEventListener('input', upd);
  editQty.addEventListener('input', upd);

  const cerrar = () => closeModal(modal);
  document.getElementById('editClose').addEventListener('click', cerrar);
  document.getElementById('editCancel').addEventListener('click', cerrar);
  modal.addEventListener('click', e => { if (e.target === modal) cerrar(); });

  document.getElementById('editForm').addEventListener('submit', async e => {
    e.preventDefault();
    const name      = document.getElementById('editName').value.trim();
    const totalCost = parseFloat(editCost.value);
    const qty       = Number(editQty.value);
    if (!name || !(totalCost > 0) || !(Number.isInteger(qty) && qty > 0)) {
      return toast('Revisá los datos: nombre, costo mayor a 0 y unidades enteras', true);
    }
    const btn = document.getElementById('editSave');
    btn.disabled = true;
    try {
      const { cascade } = await api(`/materials/${_editId}`, { method: 'PUT', body: { name, totalCost, qty } });
      cerrar();
      await cargar();
      const n = cascade?.productosActualizados || 0;
      toast(n
        ? `Insumo actualizado ✓ · ${n} producto${n > 1 ? 's' : ''} del catálogo con precio nuevo`
        : 'Insumo actualizado ✓');
    } catch (err) {
      toast('Error: ' + err.message, true);
    } finally {
      btn.disabled = false;
    }
  });
}
