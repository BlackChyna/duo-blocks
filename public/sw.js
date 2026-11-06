/**
 * DUO BLOCKS service worker — duo-blocks-v1.
 *
 * Strategies:
 *  - precache core shell (start_url, index.html, manifest, favicon) for the
 *    offline fallback;
 *  - STALE-WHILE-REVALIDATE for hashed build assets and icons;
 *  - NETWORK-FIRST for /duo-blocks/ navigations, falling back to the cached
 *    index.html offline;
 *  - NEVER cache non-GET requests or anything Supabase-related.
 *
 * APPLE TOUCH ICON NOTE: /duo-blocks/icons/apple-touch-icon.png ships with
 * the orchestrator's PNG drop and is referenced from index.html.
 */
const VERSION = 'duo-blocks-v1';
const INDEX_HTML = '/duo-blocks/index.html';
const CORE = [
  '/duo-blocks/',
  INDEX_HTML,
  '/duo-blocks/manifest.json',
  '/duo-blocks/icons/favicon.svg',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then(cache => cache.addAll(CORE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => key !== VERSION).map(key => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

// skipWaiting (+ clientsClaim via the activate handler) on message.
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;

  // NEVER cache POST / PUT / etc., and never touch cross-origin (Supabase).
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (/supabase/i.test(url.href)) return;

  // Navigations → network-first with offline fallback to the cached shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response && response.ok) {
            const cache = await caches.open(VERSION);
            cache.put(request, response.clone());
          }
          return response;
        } catch {
          const cache = await caches.open(VERSION);
          return (
            (await cache.match(request)) ||
            (await cache.match(INDEX_HTML)) ||
            (await cache.match('/duo-blocks/')) ||
            new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
          );
        }
      })(),
    );
    return;
  }

  // Hashed build assets + icons → stale-while-revalidate.
  const isHashedAsset = url.pathname.includes('/assets/') || /\-[0-9a-f]{8,}\.[a-z]+$/.test(url.pathname);
  const isIcon = url.pathname.startsWith('/duo-blocks/icons/');
  if (isHashedAsset || isIcon) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(VERSION);
        const cached = await cache.match(request);
        const network = fetch(request)
          .then(response => {
            if (response && response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })(),
    );
  }
  // Everything else: default (network) — never cached.
});
