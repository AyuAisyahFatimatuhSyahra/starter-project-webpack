// src/scripts/pages/home/home-page.js
import { StoryAPI } from '../../data/api.js';
import { idbPutStories, idbGetStories, idbDeleteStory } from '../../libs/db.js';

function tileLayers() {
  const osm  = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  });
  const esri = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: '© Esri' }
  );
  return { osm, esri };
}

export async function HomePage() {
  const el = document.createElement('section');
  el.innerHTML = `
    <h1>Daftar Story</h1>

    <!-- Banner offline muncul jika data di-load dari IndexedDB -->
    <p id="offlineBanner" class="hint" style="display:none" aria-live="polite">
      Mode offline: menampilkan data lokal yang tersimpan.
    </p>

    <!-- Search/filter -->
    <form class="form" role="search" aria-label="Filter story" style="margin-top:12px">
      <label for="q">Cari story (nama/teks)</label>
      <input id="q" type="search" placeholder="Ketik untuk memfilter..." autocomplete="off" />
    </form>

    <div id="map-home" class="map map-home" aria-label="Peta story"></div>

    <div class="list" id="list" aria-live="polite"></div>

    <p class="guest-only">
      Untuk melihat data dari API, silakan <a href="#/login">login</a>.
    </p>
  `;

  const token = localStorage.getItem('token');

  // --- Map init (buat setelah node ada di DOM) ---
  const mapEl = el.querySelector('#map-home');
  const { osm, esri } = tileLayers();
  const map = L.map(mapEl, {
    center: [-2.5, 118],
    zoom: 4,
    layers: [osm],
  });
  L.control.layers({ 'OSM': osm, 'Satelit': esri }).addTo(map);

  // Pastikan ukuran map benar setelah render & saat resize
  requestAnimationFrame(() => map.invalidateSize());
  window.addEventListener('resize', () => map.invalidateSize(), { passive: true });

  // Jika belum login, tampilkan peta kosong saja
  if (!token) return el;

  // --- Ambil data: API → simpan ke IDB; jika gagal → IDB (offline) ---
  let stories = [];
  const offlineBanner = el.querySelector('#offlineBanner');

  try {
    const { listStory = [] } = await StoryAPI.list({ withLocation: true });
    stories = listStory;
    // simpan ke IndexedDB (read cache)
    if (stories.length) await idbPutStories(stories);
  } catch {
    // offline fallback
    stories = await idbGetStories();
    if (stories.length) offlineBanner.style.display = 'block';
  }

  // --- Render list + marker sinkron ---
  const listEl = el.querySelector('#list');
  const group = L.featureGroup().addTo(map);
  const markersById = new Map();

  function renderList(items) {
    listEl.innerHTML = '';
    items.forEach((s) => {
      const card = document.createElement('article');
      card.className = 'card';
      const created = s.createdAt ? new Date(s.createdAt).toLocaleString('id-ID') : '';
      card.innerHTML = `
        <img src="${s.photoUrl}" alt="Foto story oleh ${s.name}" loading="lazy" />
        <h2>${s.name || 'Tanpa nama'}</h2>
        <p>${s.description || ''}</p>
        <small>${created}</small>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" type="button" data-focus="${s.id}">Fokus di peta</button>
          <button class="btn" type="button" data-open="${s.id}">Buka popup</button>
          <button class="btn" type="button" data-del="${s.id}" aria-label="Hapus dari penyimpanan lokal">Hapus Lokal</button>
        </div>
      `;
      listEl.appendChild(card);

      // Sinkronisasi klik kartu ↔ marker
      card.querySelector(`[data-focus="${s.id}"]`)?.addEventListener('click', () => {
        const m = markersById.get(s.id);
        if (m) { map.setView(m.getLatLng(), Math.max(map.getZoom(), 8)); m.openPopup(); }
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      card.querySelector(`[data-open="${s.id}"]`)?.addEventListener('click', () => {
        const m = markersById.get(s.id);
        if (m) m.openPopup();
      });

      // Delete dari IndexedDB saja (tidak menghapus di server)
      card.querySelector(`[data-del="${s.id}"]`)?.addEventListener('click', async () => {
        await idbDeleteStory(s.id);
        // hapus dari UI list
        card.remove();
        // hapus marker dari peta
        const m = markersById.get(s.id);
        if (m) { group.removeLayer(m); markersById.delete(s.id); }
      });
    });
  }

  // Buat markers dari data (lat/lon bisa null)
  stories.forEach((s) => {
    if (s.lat != null && s.lon != null) {
      const m = L.marker([s.lat, s.lon]).bindPopup(`
        <strong>${s.name || 'Tanpa nama'}</strong><br/>
        ${s.description || ''}
      `);
      m.addTo(group);
      markersById.set(s.id, m);
      // marker highlight ↔ kartu
      m.on('click', () => {
        const card = listEl.querySelector(`[data-open="${s.id}"]`)?.closest('.card');
        if (card) card.classList.add('active');
      });
      m.on('popupclose', () => {
        const card = listEl.querySelector(`[data-open="${s.id}"]`)?.closest('.card');
        if (card) card.classList.remove('active');
      });
    }
  });

  // Fit bounds jika ada marker; ukur ulang setelah fitBounds
  if (group.getLayers().length) {
    map.fitBounds(group.getBounds().pad(0.2));
    setTimeout(() => map.invalidateSize(), 0);
  }

  // Render awal (semua)
  renderList(stories);

  // --- Filter/Search (Skilled – IndexedDB) ---
  const q = el.querySelector('#q');
  q.addEventListener('input', () => {
    const term = q.value.trim().toLowerCase();
    const filtered = !term ? stories : stories.filter((s) => {
      return (s.name || '').toLowerCase().includes(term) ||
             (s.description || '').toLowerCase().includes(term);
    });

    // Render ulang list
    renderList(filtered);

    // Tampilkan/hilangkan marker sesuai filter
    // (cara cepat: sembunyikan semua lalu tampilkan marker milik filtered)
    group.clearLayers();
    filtered.forEach((s) => {
      const m = markersById.get(s.id);
      if (m) m.addTo(group);
    });

    // Refit jika ada hasil; jika tidak, kembali ke view default
    if (group.getLayers().length) {
      map.fitBounds(group.getBounds().pad(0.2));
    } else {
      map.setView([-2.5, 118], 4);
    }
    requestAnimationFrame(() => map.invalidateSize());
  });

  return el;
}