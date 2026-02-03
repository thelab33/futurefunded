const CACHE_NAME = 'fundchamps-shell-v1';
const SHELL_ASSETS = [
  '/',                       // or your campaign route
  '/static/css/app.css',     // whatever your main CSS bundle is
  '/static/js/app.js',       // whatever your main JS bundle is
  '/static/img/app-icon-192.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_ASSETS))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => (key === CACHE_NAME ? null : caches.delete(key)))
      )
    )
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;

  // App shell strategy for navigation requests
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match('/')
      )
    );
    return;
  }

  // Cache-first for static assets
  if (req.url.includes('/static/')) {
    event.respondWith(
      caches.match(req).then(cached =>
        cached || fetch(req).then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          return res;
        })
      )
    );
  }
});

