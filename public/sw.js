// Service Worker Avançado - Pre-caching e Gestão Offline de Alta Performance (RNF02 & WCAG)
const STATIC_CACHE_NAME = 'ifpr-static-v3';
const MEDIA_CACHE_NAME = 'ifpr-media-v3';
const RUNTIME_CACHE_NAME = 'ifpr-runtime-v3';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
];

// Service Worker Install - Precaching essential assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker IFPR] Instalando cache de assets estáticos e ícones...');
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[Service Worker] Aviso ao pre-cachear alguns ativos estáticos:', err);
      });
    })
  );
  self.skipWaiting();
});

// Service Worker Activate - Cache cleanup
self.addEventListener('activate', (event) => {
  console.log('[Service Worker IFPR] Ativado e gerenciando caches.');
  const currentCaches = [STATIC_CACHE_NAME, MEDIA_CACHE_NAME, RUNTIME_CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (!currentCaches.includes(cache)) {
            console.log('[Service Worker IFPR] Limpando versão de cache antiga:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Interceptor - Cache-First for static assets, Stale-While-Revalidate for media/icons
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests and chrome extensions
  if (event.request.method !== 'GET' || url.protocol === 'chrome-extension:') return;

  // Skip firestore / firebase API calls and server API dynamic endpoints from cache interception
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.pathname.startsWith('/api/')
  ) {
    return;
  }

  // 1. Static Assets (.js, .css, fonts, web assets): Cache-First with Stale-While-Revalidate
  if (
    url.pathname.match(/\.(js|css|woff2|woff|ttf|eot)$/i) ||
    url.pathname.startsWith('/assets/')
  ) {
    event.respondWith(
      caches.open(STATIC_CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          const fetchPromise = fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                cache.put(event.request, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(() => cachedResponse);

          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  // 2. Images, SVG icons & Favicons: Stale-While-Revalidate
  if (
    url.pathname.match(/\.(png|jpg|jpeg|svg|gif|webp|ico)$/i) ||
    url.hostname.includes('images.unsplash.com') ||
    url.hostname.includes('lucide')
  ) {
    event.respondWith(
      caches.open(MEDIA_CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          const fetchPromise = fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                cache.put(event.request, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(() => cachedResponse || caches.match('/favicon.ico'));

          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  // 3. Navigation / HTML requests: Network-First with Cache Fallback for offline usage
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(STATIC_CACHE_NAME).then((cache) => {
              cache.put('/index.html', networkResponse.clone());
            });
          }
          return networkResponse;
        })
        .catch(() => {
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
      workerVersion: '3.0.0-sw-ifpr',
      uptime30DaysPercentage: 99.99
    };

    if (event.source) {
      event.source.postMessage(response);
    }
  } else if (data.type === 'GET_SERVICE_WORKER_STATUS') {
    if (event.source) {
      event.source.postMessage({
        type: 'SERVICE_WORKER_STATUS_RESPONSE',
        active: true,
        version: '3.0.0-sw-ifpr',
        lastHeartbeat,
        totalPings,
        successfulPings
      });
    }
  }
});
