/**
 * auth.js — Manejo de sesión en el frontend (requiere common.js).
 * Expone window.authReady: promesa que resuelve al usuario (o null) una vez
 * verificada la sesión, para que cada página cargue sus datos después.
 */

async function fetchMe() {
  if (!tok()) return null;
  try {
    const d = await api('/auth/me');
    return d.user || null;
  } catch {
    return null;
  }
}

function updateHeaderForAuth(user) {
  const isAuth = !!user;
  document.getElementById('loginLink')?.toggleAttribute('hidden', isAuth);
  document.getElementById('registerLink')?.toggleAttribute('hidden', isAuth);
  document.getElementById('logoutBtn')?.toggleAttribute('hidden', !isAuth);
  const greeting = document.getElementById('greeting');
  if (greeting) {
    greeting.textContent = isAuth ? (user.name ? `Hola, ${user.name}` : 'Hola') : '';
    greeting.toggleAttribute('hidden', !isAuth);
  }
}

async function checkAuth() {
  let user = await fetchMe();
  if (!user && await refreshSession()) user = await fetchMe();

  if (user) {
    // Insumos cargados sin cuenta → pasarlos a la cuenta
    try {
      if (await mergeLocalMaterials()) document.dispatchEvent(new Event('materials:merged'));
    } catch (e) { console.warn('Merge:', e.message); }
  }
  updateHeaderForAuth(user);
  return user;
}

async function logout() {
  try { await fetch(API + '/auth/logout', { method: 'POST', credentials: 'include' }); }
  catch { /* ignorar */ }
  localStorage.removeItem('accessToken');
  localStorage.removeItem(LS_MATERIALS);
  sessionStorage.clear();
  toast('Sesión cerrada');
  setTimeout(() => { window.location.href = '/'; }, 800);
}

/** Lleva al login y vuelve a la página actual al terminar. */
function goToLogin() {
  window.location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.search);
}

window.authReady = checkAuth().catch(e => { console.warn('checkAuth:', e); return null; });

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('logoutBtn')?.addEventListener('click', logout);
  window.authReady.then(updateHeaderForAuth);
});
