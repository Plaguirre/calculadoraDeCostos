document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('registerForm');
  const msg = document.getElementById('message');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = '';

    const payload = {
      name: document.getElementById('name').value.trim() || undefined,
      email: document.getElementById('email').value.trim(),
      password: document.getElementById('password').value,
    };

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        msg.textContent = Array.isArray(data.errors) ? data.errors.join(', ') : data.message || 'Error en registro';
        msg.classList.remove('success');
        return;
      }

      if (data.accessToken) {
        localStorage.setItem('accessToken', data.accessToken);
        // MERGE local -> remote after register
        if (typeof mergeLocalMaterials === 'function') {
          await mergeLocalMaterials();
        }
      }

      msg.textContent = 'Registro correcto. Redirigiendo...';
      msg.classList.add('success');

      setTimeout(() => window.location.href = '/', 800);
    } catch (err) {
      msg.textContent = 'Error de conexión';
      msg.classList.remove('success');
    }
  });
});