// src/public/sw.js
const VERSION = 'v2';
const APP_SHELL = [
  '/',                // untuk devServer root
  '/index.html',      // di-copy HtmlWebpackPlugin
  '/main.js',         // bundle hasil webpack
  // eksternal CSS/JS boleh di-cache runtime (lihat fetch handler)
];

const SHELL_CACHE = `shell-${VERSION}`;
const DATA_CACHE  = `data-${VERSION}`;

// ========= Install: cache app shell =========
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

// ========= Activate: cleanup cache lama =========
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => {
        if (![SHELL_CACHE, DATA_CACHE].includes(k)) return caches.delete(k);
      }))
    )
  );
  self.clients.claim();
});

// ========= Fetch: offline-first untuk navigasi; network-first untuk API =========
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1) Navigasi dokumen → Offline first (app shell)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // 2) Asset dari origin (bundle, css hasil loader, ikon dst) → Cache-first
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(req).then((cached) =>
        cached ||
        fetch(req).then((resp) => {
          // simpan ke shell cache
          const copy = resp.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
          return resp;
        })
      )
    );
    return;
  }

  // 3) API Dicoding (stories) → Network-first dengan fallback cache (agar konten masih muncul saat offline)
  // Ubah base berikut agar cocok dengan CONFIG.API_BASE kamu
  const API_HOST = 'story-api.dicoding.dev';
  if (url.hostname === API_HOST) {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(DATA_CACHE).then((c) => c.put(req, copy));
          return resp;
        })
        .catch(() => caches.match(req)) // fallback ke data terakhir
    );
    return;
  }

  // 4) Sumber eksternal (mis. Leaflet CSS/tiles) → Stale-While-Revalidate ringan
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req).then((resp) => {
        const copy = resp.clone();
        caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
        return resp;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// ========= Push: payload dinamis + fallback =========
self.addEventListener('push', (event) => {
  let title = 'Story';
  let options = {
    body: 'Notifikasi baru',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge.png',
    data: { go: '#/home' }
  };
  try {
    const data = event.data.json();
    title   = data.title   || title;
    options = { ...options, ...(data.options || {}) };
    // pastikan selalu ada data.go supaya klik notif bisa arahkan
    options.data = options.data || {};
    options.data.go = options.data.go || '#/home';
  } catch {}
  event.waitUntil(self.registration.showNotification(title, options));
});

// ========= Klik notifikasi → fokus / buka lalu minta app navigasi =========
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const dest = event.notification.data?.go || '#/home';
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (all.length) {
      all[0].focus();
      // NOTE: selaraskan ke lowercase 'navigate' karena app.js mendengarkan itu
      all[0].postMessage({ type: 'navigate', url: dest });
    } else {
      clients.openWindow(dest);
    }
  })());
});

// ========= Background Sync (opsional) =========
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-outbox') {
    event.waitUntil((async () => {
      const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      all.forEach(c => c.postMessage({ type: 'FLUSH_OUTBOX' }));
    })());
  }
});

// ========= Re-subscribe jika VAPID berubah (opsional) =========
self.addEventListener('pushsubscriptionchange', (event) => {
  // Biarkan halaman yang mengurus; di sini cukup informasikan
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    all.forEach(c => c.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED' }));
  })());
});