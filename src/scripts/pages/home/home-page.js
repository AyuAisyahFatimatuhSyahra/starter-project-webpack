// src/scripts/pages/home/home-page.js
import { StoryAPI } from '../../data/api.js';
import { idbPutStories, idbGetStories, idbDeleteStory } from '../../libs/db.js';

function tileLayers() {
  const osm = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { attribution: '© OpenStreetMap' },
  );
  const esri = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: '© Esri' },
  );
  return { osm, esri };
}

export async function HomePage() {
  const el = document.createElement('section');
  el.className = 'page-home';

  el.innerHTML = `
    <header class="home-header">
      <div>
        <p class="home-eyebrow">Cerita</p>
        <h1 class="home-title">Kumpulan Cerita</h1>
      </div>
      <div class="home-tabs">
        <button type="button" class="chip chip-primary" data-view="all" aria-pressed="true">
          Semua Cerita
        </button>
        <button type="button" class="chip" data-view="list" aria-pressed="false">
          Daftar
        </button>
        <button type="button" class="chip" data-view="map" aria-pressed="false">
          Lihat Peta
        </button>
      </div>
    </header>

    <!-- Banner offline -->
    <p id="offlineBanner" class="hint home-hint" style="display:none" aria-live="polite">
      Mode offline: menampilkan data lokal yang tersimpan.
    </p>

    <div class="layout-stories" aria-label="Cerita dan peta">
      <aside class="stories-list" aria-label="Daftar story">
        <form class="form" role="search" aria-label="Filter story" style="margin-bottom:12px">
          <label for="q">Cari story (nama/teks)</label>
          <input
            id="q"
            type="search"
            placeholder="Ketik untuk memfilter..."
            autocomplete="off"
          />
        </form>
        <div id="list" class="list list-vertical" aria-live="polite"></div>
      </aside>

      <section class="stories-map" aria-label="Peta lokasi story">
        <div id="map-home" class="map map-home"></div>
      </section>
    </div>

    <p class="guest-only home-hint">
      Untuk melihat data dari API, silakan <a href="#/login">login</a>.
    </p>
  `;

  const token = localStorage.getItem('token');
  const layout = el.querySelector('.layout-stories');

  // --- Inisialisasi peta ---
  const mapEl = el.querySelector('#map-home');
  const { osm, esri } = tileLayers();
  const map = L.map(mapEl, {
    center: [-2.5, 118],
    zoom: 4,
    layers: [osm],
  });
  L.control.layers({ OSM: osm, Satelit: esri }).addTo(map);

  requestAnimationFrame(() => map.invalidateSize());
  window.addEventListener('resize', () => map.invalidateSize(), { passive: true });

  // Kalau belum login → sembunyikan layout list + map (hanya info guest)
  if (!token) {
    layout.hidden = true;
    return el;
  }
  layout.hidden = false;

  // --- Ambil data (API → IDB; fallback offline dari IDB) ---
  let stories = [];
  const offlineBanner = el.querySelector('#offlineBanner');

  try {
    const { listStory = [] } = await StoryAPI.list({ withLocation: true });
    stories = listStory;
    if (stories.length) await idbPutStories(stories);
  } catch {
    stories = await idbGetStories();
    if (stories.length) offlineBanner.style.display = 'block';
  }

  const listEl = el.querySelector('#list');
  const group = L.featureGroup().addTo(map);
  const markersById = new Map();

  // Buat semua marker berdasar data
  stories.forEach((s) => {
    if (s.lat != null && s.lon != null) {
      const m = L
        .marker([s.lat, s.lon])
        .bindPopup(`
          <strong>${s.name || 'Tanpa nama'}</strong><br/>
          ${s.description || ''}
        `);

      m.addTo(group);
      markersById.set(s.id, m);

      // highlight kartu saat popup open/close (nanti kita cari kartunya by data-id)
      m.on('popupopen', () => {
        const card = listEl.querySelector(`[data-id="${s.id}"]`);
        if (card) card.classList.add('card-active');
      });
      m.on('popupclose', () => {
        const card = listEl.querySelector(`[data-id="${s.id}"]`);
        if (card) card.classList.remove('card-active');
      });
    }
  });

  if (group.getLayers().length) {
    map.fitBounds(group.getBounds().pad(0.2));
    setTimeout(() => map.invalidateSize(), 0);
  }

  // --- Render list (digunakan awal & saat filter) ---
  function renderList(items) {
    listEl.innerHTML = '';

    items.forEach((s) => {
      const created = s.createdAt
        ? new Date(s.createdAt).toLocaleString('id-ID')
        : '';

      const card = document.createElement('article');
      card.className = 'card card-compact';
      card.dataset.id = s.id;

      card.innerHTML = `
        <div class="card-thumb">
          <img src="${s.photoUrl}" alt="Foto story oleh ${s.name || 'Tanpa nama'}" loading="lazy" />
        </div>
        <div class="card-body">
          <h2 class="card-title">${s.name || 'Tanpa nama'}</h2>
          <p class="card-desc">${s.description || ''}</p>
          <small class="card-meta">${created}</small>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">
            <button class="btn" type="button" data-focus="${s.id}">Fokus peta</button>
            <button class="btn" type="button" data-open="${s.id}">Buka popup</button>
            <button class="btn" type="button" data-del="${s.id}"
              aria-label="Hapus dari penyimpanan lokal">
              Hapus Lokal
            </button>
          </div>
        </div>
      `;

      listEl.appendChild(card);

      // tombol fokus → zoom ke marker
      card.querySelector(`[data-focus="${s.id}"]`)?.addEventListener('click', () => {
        const m = markersById.get(s.id);
        if (m) {
          map.setView(m.getLatLng(), Math.max(map.getZoom(), 8));
          m.openPopup();
        }
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });

      // tombol buka popup saja
      card.querySelector(`[data-open="${s.id}"]`)?.addEventListener('click', () => {
        const m = markersById.get(s.id);
        if (m) m.openPopup();
      });

      // hapus hanya dari IndexedDB (bukan dari server)
      card.querySelector(`[data-del="${s.id}"]`)?.addEventListener('click', async () => {
        await idbDeleteStory(s.id);
        card.remove();
        const m = markersById.get(s.id);
        if (m) {
          group.removeLayer(m);
          markersById.delete(s.id);
        }
      });
    });
  }

  // render awal
  renderList(stories);

  // --- Filter/search: update list + marker di peta ---
  const q = el.querySelector('#q');
  q.addEventListener('input', () => {
    const term = q.value.trim().toLowerCase();
    const filtered = !term
      ? stories
      : stories.filter((s) =>
          (s.name || '').toLowerCase().includes(term) ||
          (s.description || '').toLowerCase().includes(term),
        );

    renderList(filtered);

    // tampilkan hanya marker yang ada di filtered
    group.clearLayers();
    filtered.forEach((s) => {
      const m = markersById.get(s.id);
      if (m) m.addTo(group);
    });

    if (group.getLayers().length) {
      map.fitBounds(group.getBounds().pad(0.2));
    } else {
      map.setView([-2.5, 118], 4);
    }
    requestAnimationFrame(() => map.invalidateSize());
  });

  // --- Logika tab (Semua / Daftar / Peta) ---
  const chips = el.querySelectorAll('.home-tabs .chip');
  const setView = (view) => {
    chips.forEach((c) => {
      const active = c.dataset.view === view || (view === 'all' && c.dataset.view === 'all');
      c.classList.toggle('chip-primary', active);
      c.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    const listWrap = el.querySelector('.stories-list');
    const mapWrap = el.querySelector('.stories-map');

    if (view === 'list') {
      listWrap.style.display = 'block';
      mapWrap.style.display = 'none';
    } else if (view === 'map') {
      listWrap.style.display = 'none';
      mapWrap.style.display = 'block';
      map.invalidateSize();
    } else {
      // all: dua kolom
      listWrap.style.display = '';
      mapWrap.style.display = '';
      map.invalidateSize();
    }
  };

  chips.forEach((chip) => {
    chip.addEventListener('click', () => setView(chip.dataset.view));
  });

  return el;
}