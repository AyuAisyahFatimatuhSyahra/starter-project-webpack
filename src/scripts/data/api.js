// src/scripts/data/api.js
import { CONFIG } from '../config.js';

const API_BASE = CONFIG.API_BASE; // supaya baris di bawah tetap ringkas

const authHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const AuthAPI = {
  async register({ name, email, password }) {
    const r = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    return r.json();
  },
  async login({ email, password }) {
    const r = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return r.json();
  },
};

export const StoryAPI = {
  async list({ page = 1, size = 20, withLocation = true } = {}) {
    const url = new URL(`${API_BASE}/stories`);
    url.searchParams.set('page', page);
    url.searchParams.set('size', size);
    url.searchParams.set('location', withLocation ? 1 : 0);
    const r = await fetch(url, { headers: { ...authHeader() } });
    return r.json();
  },
  async create({ description, photoFile, lat, lon, guest = false }) {
    const fd = new FormData();
    fd.append('description', description);
    fd.append('photo', photoFile);
    if (lat != null) fd.append('lat', lat);
    if (lon != null) fd.append('lon', lon);
    const endpoint = guest ? `${API_BASE}/stories/guest` : `${API_BASE}/stories`;
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: guest ? {} : { ...authHeader() },
      body: fd,
    });
    return r.json();
  },
};