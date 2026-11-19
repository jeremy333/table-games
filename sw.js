// sw.js — saves the app on the phone so it opens with no internet.
// When you change any file, bump VERSION so phones pick up the update.
const VERSION = 'v4';
const FILES = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/net.js',
  'js/qr.js',
  'js/cards.js',
  'games/index.js',
  'games/crazy-eights.js',
  'games/rook.js',
  'games/homestead.js',
  'vendor/qrcode.mjs',
  'vendor/jsQR.js',
  'manifest.webmanifest',
  'icon.svg',
  'icon-180.png',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Use the network when it's there (so updates arrive), fall back to the saved copy.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
