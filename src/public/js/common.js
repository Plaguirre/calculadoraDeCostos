/**
 * common.js — Helpers compartidos por todas las páginas.
 * Se carga antes que auth.js y que el script de cada página.
 */

const API = '/api';
const LS_MATERIALS = 'materials_v1';

function tok() { return localStorage.getItem('accessToken') || null; }

// Una sola renovación en curso: el refresh token rota en cada uso y dos
// renovaciones paralelas se detectan como robo de token (cierra la sesión).
let _refreshing = null;
function refreshSession() {
  if (!_refreshing) {
    _refreshing = fetch(API + '/auth/refresh-token', { method: 'POST', credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d?.accessToken) { localStorage.setItem('accessToken', d.accessToken); return true; }
        localStorage.removeItem('accessToken');
        return false;
      })
      .catch(() => false)
      .finally(() => { setTimeout(() => { _refreshing = null; }, 0); });
  }
  return _refreshing;
}

/**
 * fetch a la API con token y renovación automática si expiró.
 * Acepta body como objeto (se envía JSON) o FormData (multipart).
 */
async function api(path, opts = {}, retried = false) {
  const isForm = opts.body instanceof FormData;
  const headers = {
    ...(isForm || !opts.body ? {} : { 'Content-Type': 'application/json' }),
    ...(tok() ? { Authorization: `Bearer ${tok()}` } : {}),
    ...(opts.headers || {}),
  };
  const body = opts.body && !isForm && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body;
  const r = await fetch(API + path, { ...opts, headers, body, credentials: 'include' });

  if (r.status === 401 && !retried && tok() && await refreshSession()) {
    return api(path, opts, true);
  }
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    const err = new Error(d.message || (d.errors || [])[0] || 'Error de conexión');
    err.status = r.status;
    throw err;
  }
  if (opts.raw) return r;
  const type = r.headers.get('content-type') || '';
  return type.includes('application/json') ? r.json() : r;
}

// ── Insumos locales (usuario sin cuenta) ─────────────────────────────────────
function loadLocal()  { try { return JSON.parse(localStorage.getItem(LS_MATERIALS) || '[]'); } catch { return []; } }
function saveLocal(l) { localStorage.setItem(LS_MATERIALS, JSON.stringify(l)); }

async function mergeLocalMaterials() {
  const l = loadLocal();
  if (!l.length || !tok()) return 0;
  const d = await api('/materials/merge', { method: 'POST', body: { materials: l } });
  saveLocal([]);
  return d.added || 0;
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, isError = false) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.setAttribute('role', isError ? 'alert' : 'status');
  el.textContent = msg;
  el.classList.toggle('toast--error', isError);
  el.classList.add('toast--show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('toast--show'), isError ? 4000 : 2400);
}

// ── Modales: Esc para cerrar, foco inicial y devolución de foco ──────────────
let _modalReturnFocus = null;
function openModal(modal) {
  _modalReturnFocus = document.activeElement;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  const first = modal.querySelector('[autofocus], input, textarea, select, button:not(.modal-close)');
  first?.focus();
}
function closeModal(modal) {
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  if (!document.querySelector('.modal-overlay.open')) document.body.style.overflow = '';
  _modalReturnFocus?.focus?.();
}
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const open = [...document.querySelectorAll('.modal-overlay.open')].pop();
  if (open) closeModal(open);
});

// ── Formato ───────────────────────────────────────────────────────────────────
const _money = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmt(n)  { return '$' + _money.format(Number(n) || 0); }
function fmtU(n) { const v = Number(n) || 0; return v > 0 && v < 1 ? '$' + v.toFixed(4) : fmt(v); }
function escHtml(s) {
  return String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function debounce(fn, ms = 150) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });
});
