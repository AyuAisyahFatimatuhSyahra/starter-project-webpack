// src/scripts/libs/db.js
const DB_NAME = 'story-spa';
const DB_VER  = 2; // bump versi jika sebelumnya 1
let _db;

function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) return resolve(_db);
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('stories')) {
        db.createObjectStore('stories', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror   = () => reject(req.error);
  });
}

// ==== READ CACHE (Home) ====
export async function idbPutStories(stories) {
  const db = await openDB();
  const tx = db.transaction('stories', 'readwrite');
  const store = tx.objectStore('stories');
  for (const s of stories) await store.put(s);
  await tx.done?.catch?.(()=>{});
}
export async function idbGetStories() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('stories', 'readonly');
    const store = tx.objectStore('stories');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  });
}
export async function idbDeleteStory(id) {
  const db = await openDB();
  const tx = db.transaction('stories', 'readwrite');
  tx.objectStore('stories').delete(id);
  return tx.done?.catch?.(()=>{});
}

// ==== OUTBOX (Add Story offline) ====
export async function idbQueueStory(item) {
  const db = await openDB();
  const tx = db.transaction('outbox', 'readwrite');
  await tx.objectStore('outbox').add(item);
  await tx.done?.catch?.(()=>{});
}
export async function idbGetOutbox() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('outbox', 'readonly');
    const store = tx.objectStore('outbox');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  });
}
export async function idbDeleteOutbox(id) {
  const db = await openDB();
  const tx = db.transaction('outbox', 'readwrite');
  tx.objectStore('outbox').delete(id);
  return tx.done?.catch?.(()=>{});
}