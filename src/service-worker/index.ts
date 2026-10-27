import { immutable, assets as staticAssets } from '$app/manifest';
import { version } from '$app/env';
import { self as worker } from '$app/service-worker';

const CACHE = `paczkometeo-${version}`;
const assets = new Set([...immutable, ...staticAssets].map(({ path }) => `/${path.replace(/^\//, '')}`));

worker.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll([...assets, '/']);
    await worker.skipWaiting();
  })());
});

worker.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if ((key.startsWith('paczkometeo-') || key.startsWith('pogodynka-')) && key !== CACHE) await caches.delete(key);
    await worker.clients.claim();
  })());
});

worker.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // API failures reach the UI, which labels its last-successful data as saved.
  if (request.method !== 'GET' || url.origin !== worker.location.origin || (url.pathname.startsWith('/api/') || url.pathname === '/weather')) return;
  if (assets.has(url.pathname)) {
    // Immutable same-origin assets are identical regardless of request Origin headers.
    event.respondWith((async () => (await caches.open(CACHE)).match(request, { ignoreVary: true }).then((cached) => cached ?? fetch(request)))());
  } else if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try { return await fetch(request); }
      catch { return (await (await caches.open(CACHE)).match('/')) ?? new Response('Połącz się z internetem, aby otworzyć PaczkoMeteo.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }); }
    })());
  }
});
