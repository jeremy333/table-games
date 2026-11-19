// sw.js — saves the app on the phone so it opens with no internet.
// Core files are saved automatically. Games are saved separately when someone
// opens or downloads them (see js/library.js), so adding a game never needs a
// change here. When you change a core file, bump VERSION.
const VERSION = 'v8';
const GAME_CACHE = 'tg-games'; // kept across versions
const CORE = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/net.js',
  'js/qr.js',
  'js/cards.js',
  'js/library.js',
  'games/catalog.js',
  'vendor/qrcode.mjs',
  'vendor/jsQR.js',
  'vendor/peerjs.min.js',
  'manifest.webmanifest',
  'icon.svg',
  'icon-180.png',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  // 'reload' skips the browser's own cache so a new version never saves old files.
  e.waitUntil(caches.open(VERSION)
    .then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== GAME_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first (so updates arrive), saved copy when offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith((async () => {
    try {
      // 'no-cache' checks with the site every time, so old and new files never mix.
      const res = await fetch(e.request, { cache: 'no-cache' });
      if (res.ok) {
        const copy = res.clone();
        const games = await caches.open(GAME_CACHE);
        // Keep downloaded games up to date; everything else goes in the app cache.
        const target = (await games.match(e.request)) ? games : await caches.open(VERSION);
        target.put(e.request, copy);
      }
      return res;
    } catch {
      const hit = await caches.match(e.request, { ignoreSearch: true });
      return hit || (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error());
    }
  })());
});
