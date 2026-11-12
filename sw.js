const CACHE = 'guitar-tabs-v3';
const SHELL = ['index.html', 'app.js', 'manifest.json', 'icon.svg', 'icon-180.png', 'icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(['./', './index.html', './app.js', './manifest.json', './icon.svg', './icon-180.png', './icon-512.png']))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.search) return;
  const file = url.pathname.endsWith('/') ? 'index.html' : url.pathname.split('/').pop();
  if (!SHELL.includes(file)) return;
  event.respondWith(
    fetch(req, { cache: 'reload' }).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      if (file === 'index.html') {
        const home = await caches.match(new URL('./index.html', self.location));
        if (home) return home;
      }
      return new Response('离线，而且这份文件还没缓存。', { status: 504 });
    })
  );
});
