const CACHE_NAME = 'busca-pecas-avenorte-v12';
const ASSETS = [
  './',
  './index.html',
  './busca.html',
  './manifest.webmanifest',
  './icon.svg',
  './dados-iniciais-v3.js',
  './lista_busca_google_sheets.csv',
  './lista_portas_google_sheets.csv',
  './styles.css',
  './app.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const acceptsHtml = event.request.headers.get('accept')?.includes('text/html');
  if (acceptsHtml) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
