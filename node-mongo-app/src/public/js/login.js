document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const msg = document.getElementById('message');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = '';
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // important to receive refreshToken cookie
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (!res.ok) {
        msg.textContent = data.message || 'Error en login';
        msg.classList.remove('success');
        return;
      }

      if (data.accessToken) {
        localStorage.setItem('accessToken', data.accessToken);
        // MERGE local -> remote after login
        if (typeof mergeLocalMaterials === 'function') {
          await mergeLocalMaterials();
        }
      }

      msg.textContent = 'Login correcto. Redirigiendo...';
      msg.classList.add('success');

      setTimeout(() => {
        window.location.href = '/';
      }, 800);
    } catch (err) {
      msg.textContent = 'Error de conexión';
      msg.classList.remove('success');
    }
  });
});