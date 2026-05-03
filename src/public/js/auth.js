/**
 * auth.js — Manejo de sesión en el frontend.
 * Verifica accessToken, intenta refresh si expiró.
 * Llama mergeLocalMaterials() tras autenticación exitosa.
 */

function getAccessToken() {
  return localStorage.getItem('accessToken') || null;
}

async function tryRefresh() {
  try {
    const res = await fetch('/api/auth/refresh-token', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.accessToken) {
      localStorage.setItem('accessToken', data.accessToken);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function fetchMe() {
  const token = getAccessToken();
  if (!token) return null;
  try {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.user || null;
  } catch {
    return null;
  }
}

function updateHeaderForAuth(isAuth, user) {
  const loginLink    = document.getElementById('loginLink');
  const registerLink = document.getElementById('registerLink');
  const logoutBtn    = document.getElementById('logoutBtn');
  const greeting     = document.getElementById('greeting');

  if (isAuth) {
    loginLink?.setAttribute('hidden', '');
    registerLink?.setAttribute('hidden', '');
    logoutBtn?.removeAttribute('hidden');
    if (greeting) {
      greeting.textContent = user?.name ? `Hola, ${user.name}` : 'Hola';
      greeting.removeAttribute('hidden');
    }
  } else {
    loginLink?.removeAttribute('hidden');
    registerLink?.removeAttribute('hidden');
    logoutBtn?.setAttribute('hidden', '');
    if (greeting) {
      greeting.textContent = '';
      greeting.setAttribute('hidden', '');
    }
  }
}

async function checkAuth(redirect = false) {
  let user = null;

  const token = getAccessToken();
  if (token) {
    user = await fetchMe();
  }

  if (!user) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      user = await fetchMe();
      // Si acabamos de refreshear y hay materiales locales, mergear
      if (user && typeof mergeLocalMaterials === 'function') {
        mergeLocalMaterials().catch(console.warn);
      }
    }
  }

  if (user) {
    updateHeaderForAuth(true, user);
    return true;
  }

  updateHeaderForAuth(false);
  if (redirect) window.location.href = '/login.html';
  return false;
}

function showToast(message, duration = 1200) {
  const toast = document.createElement('div');
  toast.textContent = message;
  Object.assign(toast.style, {
    position: 'fixed', bottom: '20px', right: '20px',
    background: 'rgba(0,0,0,0.85)', color: '#fff',
    padding: '10px 14px', borderRadius: '8px',
    zIndex: 99999, transition: 'opacity 0.25s ease', opacity: '0',
  });
  document.body.appendChild(toast);
  void toast.offsetWidth;
  toast.style.opacity = '1';
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

async function logout() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch { /* ignorar */ }

  localStorage.removeItem('accessToken');
  localStorage.removeItem('materials_v1');

  if (typeof clearMaterialsUI === 'function') {
    try { clearMaterialsUI(); } catch { /* ignorar */ }
  }

  updateHeaderForAuth(false);
  showToast('Sesión cerrada');
  setTimeout(() => { window.location.href = '/'; }, 1200);
}

// ─── Login page helpers ───────────────────────────────────────────────────────

async function doLogin(email, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || (data.errors || ['Error'])[0]);
  localStorage.setItem('accessToken', data.accessToken);
  return data;
}

async function doRegister(name, email, password) {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || (data.errors || ['Error'])[0]);
  localStorage.setItem('accessToken', data.accessToken);
  return data;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', () => logout());

  try { await checkAuth(false); }
  catch (e) { console.warn('checkAuth error:', e); }
});

// Exportar para uso en scripts inline y en login/register pages
window.checkAuth    = checkAuth;
window.logout       = logout;
window.fetchMe      = fetchMe;
window.doLogin      = doLogin;
window.doRegister   = doRegister;
window.updateHeaderForAuth = updateHeaderForAuth;
