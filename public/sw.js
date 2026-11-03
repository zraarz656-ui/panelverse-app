const SHELL_CACHE = 'panelverse-shell-v1';
const CHAPTER_CACHE = 'panelverse-chapter-assets-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== CHAPTER_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // 1. Cache-First for comic panel images, proxied images, and static Next.js bundles
  const isImageOrStatic =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/api/image-proxy') ||
    request.destination === 'image' ||
    /\.(?:png|jpg|jpeg|webp|gif|svg|woff2?)$/i.test(url.pathname);

  if (isImageOrStatic) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((response) => {
            if (response && (response.status === 200 || response.type === 'opaque')) {
              const clone = response.clone();
              const targetCache = url.pathname.startsWith('/_next/static/')
                ? SHELL_CACHE
                : CHAPTER_CACHE;
              caches
                .open(targetCache)
                .then((cache) => cache.put(request, clone))
                .catch(() => {});
            }
            return response;
          })
          .catch(() => cached || Response.error());
      })
    );
    return;
  }

  // 2. Network-First with Cache Fallback for Chapter/Series/Edits APIs
  const isChapterApi =
    url.pathname.startsWith('/api/chapters/') ||
    url.pathname.startsWith('/api/series') ||
    url.pathname.startsWith('/api/chapter-edits');

  if (isChapterApi) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches
              .open(CHAPTER_CACHE)
              .then((cache) => cache.put(request, clone))
              .catch(() => {});
            return response;
          }
          // If upstream returns 429 Rate exceeded or 503, fallback to cache
          if (response && (response.status === 429 || response.status >= 500)) {
            return caches.match(request).then((cached) => cached || response);
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then(
            (cached) =>
              cached ||
              new Response(JSON.stringify({ error: 'Offline and not in cache' }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' },
              })
          )
        )
    );
    return;
  }

  // 3. Network-First with Graceful Cache Fallback for Navigation / HTML pages (/read/*, /series/*, /me, /)
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches
              .open(SHELL_CACHE)
              .then((cache) => cache.put(request, clone))
              .catch(() => {});
            return response;
          }
          // If server / gateway returns 429 Rate exceeded, fallback to cached HTML rather than showing blank error
          if (response && (response.status === 429 || response.status >= 500)) {
            return caches.match(request).then(async (cached) => {
              if (cached) return cached;
              const homeFallback = await caches.match('/');
              return homeFallback || response;
            });
          }
          return response;
        })
        .catch(async () => {
          const exactMatch = await caches.match(request);
          if (exactMatch) return exactMatch;
          const homeFallback = await caches.match('/');
          return homeFallback || Response.error();
        })
    );
  }
});
