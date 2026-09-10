// aether-fluid :: sw.js
// Network-first with a cache fallback. Network-first keeps development honest
// (a deploy is never masked by a stale cache) while the fallback keeps the app
// fully usable offline once it has been opened at least once.

const CACHE = 'aether-fluid-v3';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/style.css',
  './src/main.js',
  './src/core/glx.js',
  './src/core/program.js',
  './src/core/target.js',
  './src/core/quad.js',
  './src/core/clock.js',
  './src/glsl/common.js',
  './src/glsl/fluid.js',
  './src/glsl/display.js',
  './src/glsl/particles.js',
  './src/sim/fluid.js',
  './src/sim/particles.js',
  './src/sim/presets.js',
  './src/input/pointer.js',
  './src/input/motion.js',
  './src/ui/dom.js',
  './src/ui/hud.js',
  './src/ui/panel.js',
  './icons/favicon-64.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map(async (url) => {
      try {
        const response = await fetch(new Request(url, { cache: 'reload' }));
        if (response && response.ok) await cache.put(url, response.clone());
      } catch (err) {
        /* a single missing asset must not abort the whole install */
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => (key === CACHE ? null : caches.delete(key))));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const fresh = await fetch(request);
      if (fresh && fresh.ok && fresh.type === 'basic') {
        const cache = await caches.open(CACHE);
        cache.put(request, fresh.clone()).catch(() => {});
      }
      return fresh;
    } catch (err) {
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const fallback = await caches.match('./index.html');
        if (fallback) return fallback;
      }
      throw err;
    }
  })());
});
