import { AuthAPI } from '../../data/api.js';

export function LoginPage() {
  const el = document.createElement('section');
  el.innerHTML = `
    <h1>Masuk</h1>
    <form class="form" id="login" novalidate>
      <label for="email">Email</label>
      <input id="email" type="email" autocomplete="email" required />

      <label for="password">Kata sandi</label>
      <input id="password" type="password" minlength="8" required />

      <button type="submit">Login</button>
      <p class="error" id="err" aria-live="polite"></p>
      <p class="success" id="success" aria-live="polite"></p>
    </form>
  `;

  const form = el.querySelector('#login');
  const err = el.querySelector('#err');
  const success = el.querySelector('#success');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    success.textContent = '';

    const email = el.querySelector('#email').value.trim();
    const password = el.querySelector('#password').value;

    try {
      const json = await AuthAPI.login({ email, password });

      if (json.error) {
        err.textContent = json.message || 'Login gagal. Periksa kembali email dan kata sandi.';
        return;
      }

      // simpan token + nama ke localStorage
      localStorage.setItem('token', json.loginResult.token);
      localStorage.setItem('name', json.loginResult.name);

      // tampilkan notifikasi sukses
      success.textContent = `Login berhasil! Selamat datang, ${json.loginResult.name}! 🎉`;

      // toggle UI auth (header)
      if (window.updateAuthUI) window.updateAuthUI();

      // arahkan ke home setelah jeda singkat (biar notifikasi sempat tampil)
      setTimeout(() => {
        if (location.hash !== '#/home') {
          location.hash = '#/home';
        } else {
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        }
      }, 1200);

    } catch (error) {
      err.textContent = 'Terjadi kesalahan jaringan. Coba lagi nanti.';
      console.error(error);
    }
  });

  return el;
}