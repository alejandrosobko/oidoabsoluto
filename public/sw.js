// Service worker: guarda la app (código, modelo y muestras de piano) para que,
// una vez instalada, abra y funcione sin internet.
// VERSION y PRECACHE los completa el build (plugin `serviceWorker` en vite.config.ts);
// en `npm run dev` no se registra.
const VERSION = '__VERSION__';
const PRECACHE = [] /* __PRECACHE__ */;
const CACHE = `sound-2-sheet-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith('sound-2-sheet-') && key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // La página primero de la red, así cada deploy se ve enseguida; sin conexión, la guardada.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.open(CACHE).then((cache) => cache.match('./')).then((cached) => cached ?? Response.error()),
      ),
    );
    return;
  }

  // El resto (JS con hash, modelo, muestras, íconos) primero de la caché de esta versión.
  event.respondWith(
    caches
      .open(CACHE)
      .then((cache) => cache.match(request))
      .then((cached) => cached ?? fetch(request)),
  );
});
