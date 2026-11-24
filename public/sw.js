/* Hisaab offline service worker. Bump VERSION to drop old caches after a deploy. */
const VERSION = 'hisaab-v1';
const SHELL = `${VERSION}-shell`;
const FONTS = `${VERSION}-fonts`;
const PRECACHE = ['./', './index.html', './manifest.webmanifest', './icon.svg'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const putIfOk = (cacheName, req, res) => {
  if (res && (res.ok || res.type === 'opaque')) {
    const copy = res.clone();
    caches.open(cacheName).then(c => c.put(req, copy));
  }
  return res;
};

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: stale-while-revalidate.
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(FONTS).then(async cache => {
        const hit = await cache.match(req);
        const net = fetch(req).then(res => putIfOk(FONTS, req, res)).catch(() => hit);
        return hit || net;
      }),
    );
    return;
  }

  // Everything else cross-origin goes straight to the network.
  if (url.origin !== self.location.origin) return;

  // Page navigations: network first so a new deploy shows up, cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => putIfOk(SHELL, './index.html', res))
        .catch(async () => (await caches.match('./index.html')) || (await caches.match('./')) || Response.error()),
    );
    return;
  }

  // Same-origin assets (hashed by Vite): cache first, network fallback.
  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => putIfOk(SHELL, req, res))),
  );
});
