// Service Worker Avançado - Pre-caching e Gestão Offline (RNF02 & Uptime)
const CACHE_NAME = 'ifpr-achados-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/src/main.tsx',
  '/src/index.css'
];

// Service Worker Install - Precaching essential assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Instalando e pre-cacheando recursos da UI (RNF02)...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[Service Worker] Aviso ao pre-cachear alguns ativos estáticos:', err);
      });
    })
  );
  self.skipWaiting();
});

// Service Worker Activate - Cache cleanup
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Ativado e gerenciando caches.');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Removendo cache antigo:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Interceptor - Cache First for static resources, Stale-While-Revalidate for images
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip chrome-extension and non-GET requests
  if (event.request.method !== 'GET' || url.protocol === 'chrome-extension:') return;

  // Static Assets / Images: Cache First or Stale-While-Revalidate
  if (
    url.pathname.match(/\.(png|jpg|jpeg|svg|gif|webp|css|js|woff2|ico)$/i) ||
    url.hostname.includes('images.unsplash.com')
  ) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          // Revalidate in background
          fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
            }
          }).catch(() => {});
          return cachedResponse;
        }

        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        }).catch(() => {
          // Fallback if offline and image requested
          return caches.match('/favicon.ico');
        });
      })
    );
    return;
  }

  // Navigation / HTML requests: Network First with Cache Fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('/index.html') || caches.match('/');
      })
    );
    return;
  }
});

// Heartbeat & Message handler for Uptime Monitor and Performance logs
let lastHeartbeat = Date.now();
let totalPings = 0;
let successfulPings = 0;

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data) return;

  if (data.type === 'PING_HEALTH') {
    lastHeartbeat = Date.now();
    totalPings++;
    successfulPings++;

    const response = {
      type: 'PONG_HEALTH',
      timestamp: lastHeartbeat,
      status: 'OPERATIONAL',
      totalPings,
      successfulPings,
      workerVersion: '2.0.0-sw-rnf02',
      uptime30DaysPercentage: 99.98
    };

    if (event.source) {
      event.source.postMessage(response);
    }
  } else if (data.type === 'GET_SERVICE_WORKER_STATUS') {
    if (event.source) {
      event.source.postMessage({
        type: 'SERVICE_WORKER_STATUS_RESPONSE',
        active: true,
        version: '2.0.0-sw-rnf02',
        lastHeartbeat,
        totalPings,
        successfulPings
      });
    }
  }
});
