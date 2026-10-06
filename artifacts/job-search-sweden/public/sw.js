const CACHE_PREFIX = 'jobmonitor-';
const SHELL_CACHE = `${CACHE_PREFIX}shell-v1`;
const ASSET_CACHE = `${CACHE_PREFIX}assets-v1`;
const scopeUrl = new URL(self.registration.scope);
const appRoot = new URL('./', scopeUrl).href;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shellCache = await caches.open(SHELL_CACHE);
    const requiredAssets = [
      new URL('manifest.webmanifest', scopeUrl).href,
      new URL('favicon.svg', scopeUrl).href,
      new URL('apple-touch-icon.png', scopeUrl).href,
      new URL('icons/jobmonitor-192.png', scopeUrl).href,
      new URL('icons/jobmonitor-512.png', scopeUrl).href,
    ];

    await shellCache.addAll([appRoot, ...requiredAssets]);

    const htmlResponse = await fetch(appRoot, { cache: 'reload' });
    if (htmlResponse.ok) {
      const html = await htmlResponse.text();
      const bundleUrls = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g)]
        .map(([, assetPath]) => new URL(assetPath, scopeUrl).href);
      const assetCache = await caches.open(ASSET_CACHE);
      await Promise.all(bundleUrls.map(async (assetUrl) => {
        try {
          const response = await fetch(assetUrl, { cache: 'reload' });
          if (response.ok) await assetCache.put(assetUrl, response);
        } catch {
          // The app shell remains usable if an optional bundle cannot be cached.
        }
      }));
    }

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith(CACHE_PREFIX) && ![SHELL_CACHE, ASSET_CACHE].includes(name))
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== scopeUrl.origin || !requestUrl.pathname.startsWith(scopeUrl.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const shellCache = await caches.open(SHELL_CACHE);
      try {
        const response = await fetch(request);
        if (response.ok) await shellCache.put(request, response.clone());
        return response;
      } catch {
        return await shellCache.match(request)
          ?? await shellCache.match(appRoot)
          ?? new Response('JobMonitor is unavailable offline.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
      }
    })());
    return;
  }

  if (['script', 'style', 'image', 'font'].includes(request.destination)) {
    event.respondWith((async () => {
      const assetCache = await caches.open(ASSET_CACHE);
      const cached = await caches.match(request);
      try {
        const response = await fetch(request);
        if (response.ok) await assetCache.put(request, response.clone());
        return response;
      } catch {
        return cached ?? Response.error();
      }
    })());
  }
});
