/**
 * auth-page.js — Login y registro (reemplaza login.js / register.js).
 */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('authForm');
  const msg  = document.getElementById('message');
  const mode = form.dataset.mode;

  // Solo rutas internas, para no permitir redirecciones a otros sitios
  const rawNext = new URLSearchParams(location.search).get('next') || '/';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';
  if (next !== '/') {
    document.querySelectorAll('a[data-keep-next]').forEach(a => {
      a.href += '?next=' + encodeURIComponent(next);
    });
  }

  const showError = text => { msg.textContent = text; msg.hidden = false; };

  form.addEventListener('submit', async e => {
    e.preventDefault();
    msg.hidden = true;

    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    if (!email || !password) return showError('Completá email y contraseña.');
    if (mode === 'register' && !(password.length >= 8 && /\d/.test(password) && /[A-Za-z]/.test(password))) {
      return showError('La contraseña necesita 8 caracteres o más, con al menos una letra y un número.');
    }

    const body = { email, password };
    if (mode === 'register') body.name = document.getElementById('name').value.trim() || undefined;

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const d = await api(`/auth/${mode}`, { method: 'POST', body });
      localStorage.setItem('accessToken', d.accessToken);
      await mergeLocalMaterials().catch(err => console.warn('Merge:', err.message));
      window.location.href = next;
    } catch (err) {
      showError(err.status === 401 ? 'Email o contraseña incorrectos.' : err.message);
      btn.disabled = false;
    }
  });
});
