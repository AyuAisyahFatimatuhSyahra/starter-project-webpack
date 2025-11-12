// src/scripts/app.js
import { router } from './routes/routes.js';
import { CONFIG } from './config.js';
import { StoryAPI } from './data/api.js';

// ===== Jika kamu pakai libs/db.js seperti saran sebelumnya =====
import { idbGetOutbox, idbDeleteOutbox } from './libs/db.js';

// =========================
// Helper Service Worker / Push
// =========================
async function ensureSW() {
  if (!('serviceWorker' in navigator)) return null;
  // sw.js akan disalin ke root dist; path '/' benar untuk dev server
  const reg = await navigator.serviceWorker.register('/sw.js');
  return reg;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function getCurrentSubscription() {
  const reg = await ensureSW();
  return reg?.pushManager.getSubscription();
}

async function subscribePush() {
  if (!('Notification' in window)) throw new Error('Browser tidak mendukung notifikasi.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Izin notifikasi ditolak.');

  if (!CONFIG?.VAPID_PUBLIC_KEY) throw new Error('VAPID_PUBLIC_KEY belum diisi di config.js');

  const reg = await ensureSW();
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(CONFIG.VAPID_PUBLIC_KEY),
  });

  // opsional: kirim ke server
  try {
    await fetch(`${CONFIG.API_BASE}/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
      },
      body: JSON.stringify(await sub.toJSON()),
    });
  } catch {}

  return sub;
}

async function unsubscribePush() {
  const reg = await ensureSW();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;

  try {
    await fetch(`${CONFIG.API_BASE}/push/unsubscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
      },
      body: JSON.stringify(await sub.toJSON()),
    });
  } catch {}
  await sub.unsubscribe();
}

// =========================
// Install Prompt (PWA)
// =========================
let deferredPrompt = null;
function bindInstallButton() {
  const btn = document.getElementById('btn-install'); // opsional di header
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (btn) btn.hidden = false;
  });
  if (btn) {
    btn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      btn.hidden = true;
    });
  }
}

// =========================
// Navbar state + Push toggle
// =========================
async function refreshNav() {
  const hasToken = !!localStorage.getItem('token');
  document.body.classList.toggle('auth', hasToken);
  document.body.classList.toggle('guest', !hasToken);

  const guestNav = document.querySelector('[data-nav-guest]');
  const authNav  = document.querySelector('[data-nav-auth]');
  if (guestNav) guestNav.hidden = hasToken;
  if (authNav)  authNav.hidden  = !hasToken;

  // tombol push (opsional)
  const btnPush = document.getElementById('btn-push');
  if (btnPush) {
    const sub = await getCurrentSubscription();
    btnPush.textContent = sub ? 'Disable Push' : 'Enable Push';
    btnPush.disabled = !hasToken; // hanya aktif saat login (opsional)
  }

  // expose agar halaman login bisa memanggil
  window.updateAuthUI = refreshNav;
}

function bindPushToggle() {
  const btn = document.getElementById('btn-push'); // opsional di header
  if (!btn) return;
  btn.addEventListener('click', async () => {
    try {
      const sub = await getCurrentSubscription();
      if (sub) await unsubscribePush();
      else await subscribePush();
      refreshNav();
      alert('Pengaturan push diperbarui.');
    } catch (err) {
      alert(err?.message || 'Gagal mengatur push notification.');
    }
  });
}

// =========================
// Offline → Online Sync (IndexedDB queue)
// =========================
async function syncPendingWhenOnline() {
  try {
    const pending = await idbGetOutbox();
    if (!pending?.length) return;

    for (const p of pending) {
      try {
        // Sesuaikan payload untuk API create
        await StoryAPI.create({
          description: p.description,
          photoFile  : p.photoFile,
          lat        : p.lat,
          lon        : p.lon,
          guest      : p.guest,
        });
        await idbDeleteOutbox(p.id);
      } catch {
        // masih gagal → biarkan untuk percobaan berikutnya
      }
    }
  } catch {
    // jika libs/db.js belum ada / gagal, diamkan saja
  }
}

// =========================
// Boot
// =========================
export function boot() {
  // tahun footer
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // awal nav + tombol push + tombol install
  refreshNav();
  bindPushToggle();
  bindInstallButton();

  // routing
  window.addEventListener('hashchange', () => {
    router();
    refreshNav();
  });
  router();

  // skip to content
  const skip = document.querySelector('.skip-link');
  if (skip) {
    skip.addEventListener('click', (e) => {
      e.preventDefault();
      const main = document.getElementById('main-content');
      if (main) {
        main.setAttribute('tabindex', '-1');
        main.focus({ preventScroll: false });
      }
    });
  }

  // logout
  document.querySelector('[data-logout]')?.addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem('token');
    localStorage.removeItem('name');
    refreshNav();
    location.hash = '#/home';
  });

  // Service Worker (PWA + caching + push)
  ensureSW().catch(() => {});

  // Pesan dari SW: sesuaikan dengan sw.js (NAVIGATE & FLUSH_OUTBOX)
  navigator.serviceWorker?.addEventListener?.('message', (evt) => {
    if (evt.data?.type === 'NAVIGATE' && typeof evt.data.hash === 'string') {
      location.hash =  evt.data.url.replace(location.origin, '');
    }
    if (evt.data?.type === 'FLUSH_OUTBOX') {
      syncPendingWhenOnline();
    }
  });

  // ketika kembali online, coba sync antrean IDB
  window.addEventListener('online', syncPendingWhenOnline);
  // jalankan sekali saat boot (kalau user refresh ketika sudah online)
  syncPendingWhenOnline();
}