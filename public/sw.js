// PokéTCG · service worker básico (Fase 2 · E): la app abre más rápido y las imágenes de cartas,
// el catálogo y los archivos de la app se guardan en caché. Sin conexión se muestra un aviso.
const VERSION = 'poketcg-v2-2';
const CACHE_APP = VERSION + '-app';
const CACHE_IMG = VERSION + '-img';
const MAX_IMG = 1500;
const PRECARGA = ['/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/sin-conexion.html'];
const HOSTS_IMG = ['assets.tcgdex.net', 'images.pokemontcg.io', 'limitlesstcg.nyc3.cdn.digitaloceanspaces.com', 'r2.limitlesstcg.net', 's3.limitlesstcg.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_APP).then(c => c.addAll(PRECARGA).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE_APP && k !== CACHE_IMG).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function cacheFirst(req, nombre) {
  const c = await caches.open(nombre);
  const hit = await c.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok) c.put(req, r.clone());
  return r;
}
async function staleWhileRevalidate(req, nombre) {
  const c = await caches.open(nombre);
  const hit = await c.match(req);
  const red = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
  return hit || (await red) || new Response('', { status: 504 });
}
async function imagen(req) {
  const c = await caches.open(CACHE_IMG);
  const hit = await c.match(req);
  if (hit) return hit;
  try {
    const r = await fetch(req);
    if (r.ok || r.type === 'opaque') { c.put(req, r.clone()); recortar(c); }
    return r;
  } catch (e) { return new Response('', { status: 504 }); }
}
let recortando = false;
async function recortar(c) {
  if (recortando) return; recortando = true;
  try { const ks = await c.keys(); if (ks.length > MAX_IMG) for (const k of ks.slice(0, ks.length - MAX_IMG)) await c.delete(k); } finally { recortando = false; }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const propio = url.origin === self.location.origin;
  if (propio && url.pathname.startsWith('/_next/static/')) { e.respondWith(cacheFirst(req, CACHE_APP)); return; }
  if (propio && (url.pathname.startsWith('/data/') || url.pathname.startsWith('/lib/') || url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest')) { e.respondWith(staleWhileRevalidate(req, CACHE_APP)); return; }
  if (HOSTS_IMG.includes(url.hostname)) { e.respondWith(imagen(req)); return; }
  if (req.mode === 'navigate' && propio) {
    e.respondWith(fetch(req).catch(async () => (await caches.match('/sin-conexion.html')) || new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })));
    return;
  }
  // API, Supabase y todo lo demás: solo red
});
