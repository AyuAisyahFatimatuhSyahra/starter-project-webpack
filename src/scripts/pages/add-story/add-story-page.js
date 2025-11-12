// src/scripts/pages/add-story/add-story-page.js
import { StoryAPI } from '../../data/api.js';
import {
  idbQueueStory, idbGetOutbox, idbDeleteOutbox
} from '../../libs/db.js';

// util: tunggu element sudah benar2 masuk DOM agar Leaflet bisa ukur ukuran
function waitUntilInDom(el) {
  return new Promise((resolve) => {
    if (document.body.contains(el)) return resolve();
    const obs = new MutationObserver(() => {
      if (document.body.contains(el)) { obs.disconnect(); resolve(); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  });
}

// Flush antrian offline -> upload ke server
async function flushOutbox(showToast = true) {
  const outbox = await idbGetOutbox();
  if (!outbox.length) return;

  for (const item of outbox) {
    try {
      const res = await StoryAPI.create({
        description: item.description,
        photoFile  : item.photoFile,     // File/Blob tersimpan di IDB
        lat        : item.lat,
        lon        : item.lon,
        guest      : item.guest,
      });
      if (!res.error) {
        await idbDeleteOutbox(item.id);
        // Notifikasi lokal via SW (opsional untuk UX dan memenuhi “Skilled” Push)
        if (navigator.serviceWorker?.controller) {
          const reg = await navigator.serviceWorker.getRegistration();
          await reg?.showNotification('Story terkirim', {
            body: item.description?.slice(0, 90) || 'Berhasil mengirim story.',
            icon: '/icons/icon-192.png',
            badge: '/icons/badge.png',
            data: { go: '#/home' },
            actions: [{ action: 'open', title: 'Lihat di Home' }],
          });
        }
      }
    } catch (e) {
      // Jika masih gagal (tetap offline / server down), biarkan di queue
    }
  }
  if (showToast) {
    const toast = document.createElement('p');
    toast.className = 'success';
    toast.textContent = 'Sinkronisasi offline selesai (jika ada item).';
    document.getElementById('main-content')?.prepend(toast);
    setTimeout(()=>toast.remove(), 2500);
  }
}

export function AddStoryPage() {
  const el = document.createElement('section');
  el.innerHTML = `
    <h1>Tambah Story</h1>
    <p class="hint">Klik peta untuk mengisi koordinat. Bisa unggah foto atau ambil dari kamera.</p>

    <div id="map" class="map" aria-label="Pilih lokasi di peta"></div>

    <form class="form" id="form" novalidate>
      <label for="desc">Deskripsi</label>
      <textarea id="desc" required rows="3" placeholder="Tulis deskripsi..."></textarea>

      <label for="photo">Foto (≤1MB)</label>
      <input id="photo" type="file" accept="image/*" required />

      <div class="row-2">
        <div>
          <label for="lat">Latitude</label>
          <input id="lat" type="number" step="any" readonly />
        </div>
        <div>
          <label for="lon">Longitude</label>
          <input id="lon" type="number" step="any" readonly />
        </div>
      </div>

      <details>
        <summary>Ambil foto dari kamera</summary>
        <video id="cam" autoplay playsinline style="width:100%;max-height:240px;border-radius:8px"></video>
        <div style="display:flex;gap:8px;margin:8px 0;">
          <button id="startCam" type="button">Mulai Kamera</button>
          <button id="capture" type="button">Ambil Gambar</button>
          <button id="stopCam" type="button">Matikan Kamera</button>
        </div>
        <canvas id="canvas" width="640" height="480" hidden></canvas>
      </details>

      <label for="guest" style="display:inline-flex;align-items:center;gap:8px;">
        <input type="checkbox" id="guest" /> Kirim sebagai tamu (tanpa login)
      </label>

      <button type="submit" id="submitBtn">Kirim</button>
      <p class="success" id="ok" aria-live="polite"></p>
      <p class="error" id="err" aria-live="polite"></p>
    </form>
  `;

  // ====== PETA ======
  const map = L.map(el.querySelector('#map'), { center: [-2.5, 118], zoom: 4 });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { attribution: '© OpenStreetMap' }).addTo(map);

  waitUntilInDom(el).then(() => setTimeout(() => map.invalidateSize(), 0));
  window.addEventListener('resize', () => map.invalidateSize(), { passive: true });

  let marker;
  map.on('click', ({ latlng: { lat, lng } }) => {
    el.querySelector('#lat').value = Number(lat).toFixed(6);
    el.querySelector('#lon').value = Number(lng).toFixed(6);
    if (marker) marker.setLatLng([lat, lng]);
    else marker = L.marker([lat, lng]).addTo(map);
  });

  // ====== KAMERA ======
  let stream;
  const video = el.querySelector('#cam');
  const canvas = el.querySelector('#canvas');

  el.querySelector('#startCam').addEventListener('click', async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream;
    } catch { alert('Tidak bisa mengakses kamera.'); }
  });

  const stopCam = () => {
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; video.srcObject = null; }
  };
  el.querySelector('#stopCam').addEventListener('click', stopCam);
  // hentikan ketika halaman diganti
  window.addEventListener('hashchange', stopCam, { once: true });

  el.querySelector('#capture').addEventListener('click', () => {
    if (!video.srcObject) return;
    canvas.hidden = false;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      const file = new File([blob], 'camera.jpg', { type: blob.type || 'image/jpeg' });
      const dt = new DataTransfer(); dt.items.add(file);
      el.querySelector('#photo').files = dt.files;
    }, 'image/jpeg', 0.9);
  });

  // ====== SUBMIT ======
  el.querySelector('#form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const desc   = el.querySelector('#desc').value.trim();
    const photo  = el.querySelector('#photo').files[0];
    const latVal = el.querySelector('#lat').value;
    const lonVal = el.querySelector('#lon').value;
    const lat    = latVal ? parseFloat(latVal) : undefined;
    const lon    = lonVal ? parseFloat(lonVal) : undefined;
    const guest  = el.querySelector('#guest').checked;

    const err = el.querySelector('#err'); const ok = el.querySelector('#ok');
    const btn = el.querySelector('#submitBtn');
    err.textContent = ''; ok.textContent = '';

    if (!desc)  return (err.textContent = 'Deskripsi wajib.');
    if (!photo) return (err.textContent = 'Foto wajib.');
    if (photo.size > 1024 * 1024) return (err.textContent = 'Ukuran foto > 1MB.');

    btn.disabled = true;

    // Coba upload langsung
    try {
      const res = await StoryAPI.create({ description: desc, photoFile: photo, lat, lon, guest });
      if (res.error) throw new Error(res.message || 'Gagal membuat story');

      ok.textContent = 'Story berhasil dibuat!';
      // notif lokal (opsional)
      if (navigator.serviceWorker) {
        const reg = await navigator.serviceWorker.getRegistration();
        await reg?.showNotification('Story berhasil', {
          body: desc.slice(0, 90),
          icon: '/icons/icon-192.png',
          badge: '/icons/badge.png',
          data: { go: '#/home' },
          actions: [{ action: 'open', title: 'Lihat di Home' }],
        });
      }
      // ke Home
      location.hash = '#/home';
    } catch (e2) {
      // Offline / jaringan bermasalah → masukkan ke Queue (IndexedDB)
      try {
        await idbQueueStory({
          description: desc,
          photoFile  : photo,
          lat, lon,
          guest,
          createdAt  : Date.now(),
        });

        ok.textContent = 'Tidak ada koneksi. Story disimpan offline dan akan dikirim otomatis saat online.';
        // Coba jadwalkan background sync (jika tersedia)
        try {
          const reg = await navigator.serviceWorker?.getRegistration();
          await reg?.sync?.register('sync-outbox');
        } catch {/* ignore if not supported */}
      } catch {
        err.textContent = 'Gagal menyimpan ke penyimpanan offline.';
      }
    } finally {
      btn.disabled = false;
    }
  });

  // Flush outbox saat halaman ini dibuka (kalau kebetulan sedang online)
  if (navigator.onLine) flushOutbox(false);
  window.addEventListener('online', () => flushOutbox());

  return el;
}