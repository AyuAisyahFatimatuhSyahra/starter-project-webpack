import { AuthAPI } from '../../data/api.js';
export function RegisterPage(){
  const el = document.createElement('section');
 
el.innerHTML = `
<h1>Daftar</h1>
<form class="form" id="reg" novalidate>
  <label for="name">Nama</label>
  <input id="name" required />

  <label for="email">Email</label>
  <input id="email" type="email" required />

  <label for="password">Kata sandi (≥8)</label>
  <input id="password" type="password" minlength="8" required />

  <button type="submit">Buat Akun</button>
  <p class="success" id="ok" aria-live="polite"></p>
  <p class="error" id="err" aria-live="polite"></p>
</form>
`;

  el.querySelector('#reg').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const name = el.querySelector('#name').value.trim();
    const email = el.querySelector('#email').value.trim();
    const password = el.querySelector('#password').value;
    const ok = el.querySelector('#ok'); const err = el.querySelector('#err');
    ok.textContent=''; err.textContent='';
    const json = await AuthAPI.register({ name, email, password });
    if (json.error) err.textContent = json.message || 'Gagal daftar';
    else ok.textContent = 'Akun dibuat. Silakan login.';
  });
  return el;
}