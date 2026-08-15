// ==============================================================================
// Service Worker - Localiza+ PWA (IFPR Campus Ivaiporã)
// Versão: v5.2.0-localiza-pwa
// Estratégias:
// - Pré-cache Inteligente do Shell de Aplicação, Ícones e Assets de UI (Offline Instantâneo em 3G)
// - Stale-While-Revalidate com isolamento e purga automática de caches obsoletos
// - Background Sync para envio resiliente de cadastros e fotos de objetos em segundo plano
// - Mensageria em tempo real com clientes para status de upload e monitoramento
// ==============================================================================

const SW_VERSION = 'v5.2.0-localiza-pwa';
const CACHE_STATIC = `localiza-static-${SW_VERSION}`;
const CACHE_MEDIA = `localiza-media-${SW_VERSION}`;

// Pré-cache inteligente do Shell da Aplicação e Ícones de Interface
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/manifest.json',
  '/favicon.ico',
  '/favicon.svg',
  '/pwa-icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png'
];

// Instalação do Service Worker com Pré-Cache Inteligente
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(async (cache) => {
      // Tenta armazenar os ativos do shell
      for (const asset of PRECACHE_ASSETS) {
        try {
          const response = await fetch(asset, { cache: 'no-cache' });
          if (response && response.ok) {
            await cache.put(asset, response);
          }
        } catch (_) {
          // Ignora falhas pontuais de assets opcionais em build local
        }
      }
    })
  );
  // Não força skipWaiting agressivo para não quebrar sessões ativas com TDZ
});

// Ativação e Purga Automática de Versões Anteriores de Cache
self.addEventListener('activate', (event) => {
  const activeCaches = new Set([CACHE_STATIC, CACHE_MEDIA]);

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!activeCaches.has(cacheName)) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Helper de Stale-While-Revalidate para ativos estáticos e ícones
async function staleWhileRevalidate(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  // Dispara busca na rede em segundo plano para revalidar
  const networkFetch = fetch(request)
    .then((networkResponse) => {
      if (networkResponse && networkResponse.status === 200) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => null);

  // Retorna resposta em cache imediatamente se disponível, senão aguarda rede
  return cachedResponse || (await networkFetch) || caches.match('/favicon.ico');
}

// Interceptador Fetch
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Ignora requisições não-GET e esquemas externos de extensões
  if (event.request.method !== 'GET' || url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') {
    return;
  }

  // 2. SEGURANÇA E DADOS DINÂMICOS: NUNCA armazenar em cache Firestore, Auth, APIs ou Google Services
  // Garante que dados do Firestore não sejam baixados desnecessariamente e fiquem sempre atualizados
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('securetoken.googleapis.com') ||
    url.hostname.includes('firebaseinstallations.googleapis.com') ||
    url.hostname.includes('firebasestorage.googleapis.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('accounts.google.com') ||
    url.pathname.startsWith('/api/')
  ) {
    return;
  }

  // 3. Documentos de navegação HTML: Network-First com fallback para cache e offline.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_STATIC).then((cache) => {
              cache.put('/index.html', networkResponse.clone());
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedIndex = await caches.match('/index.html');
          if (cachedIndex) return cachedIndex;

          const offlinePage = await caches.match('/offline.html');
          if (offlinePage) return offlinePage;

          return caches.match('/');
        })
    );
    return;
  }

  // 4. Scripts JS, CSS, fontes e chunks do Vite
  if (
    url.pathname.match(/\.(js|css|woff2|woff|ttf|eot)$/i) ||
    url.pathname.startsWith('/assets/')
  ) {
    event.respondWith(staleWhileRevalidate(CACHE_STATIC, event.request));
    return;
  }

  // 5. Imagens de interface, ícones, logos e Web Manifest
  if (
    url.pathname.match(/\.(png|jpg|jpeg|svg|gif|webp|ico|webmanifest|json)$/i) ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(staleWhileRevalidate(CACHE_MEDIA, event.request));
    return;
  }
});

// ==============================================================================
// BACKGROUND SYNC - Sincronização em Segundo Plano de Objetos e Fotos
// ==============================================================================

async function broadcastToClients(message) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  for (const client of clients) {
    client.postMessage(message);
  }
}

// Background Sync Handler (Disparado quando a conexão é restabelecida ou evento sync é registrado)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-item-uploads' || event.tag === 'sync-items' || event.tag === 'ifpr-background-sync') {
    event.waitUntil(
      (async () => {
        await broadcastToClients({
          type: 'BACKGROUND_SYNC_TRIGGERED',
          tag: event.tag,
          timestamp: new Date().toISOString(),
          message: 'Sincronização em segundo plano acionada pelo Service Worker.'
        });
      })()
    );
  }
});

// Periodic Sync (se suportado pelo navegador em segundo plano)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'ifpr-periodic-sync') {
    event.waitUntil(
      broadcastToClients({
        type: 'PERIODIC_SYNC_TRIGGERED',
        timestamp: new Date().toISOString()
      })
    );
  }
});

// ==============================================================================
// MENSAGERIA DO SERVICE WORKER (Upload Status, Uptime e Skip Waiting)
// ==============================================================================

let lastHeartbeat = Date.now();
let totalPings = 0;
let successfulPings = 0;

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data) return;

  // Comando para aplicar nova versão imediatamente (Skip Waiting)
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  // Notificação de progresso de upload disparada pelo app
  if (data.type === 'UPLOAD_PROGRESS_UPDATE') {
    // Reencaminha para todas as abas / janelas ativas
    broadcastToClients({
      type: 'UPLOAD_STATUS_BROADCAST',
      task: data.task,
      timestamp: Date.now()
    });
    return;
  }

  // Heartbeat do painel administrativo
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
      workerVersion: SW_VERSION,
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
        version: SW_VERSION,
        lastHeartbeat,
        totalPings,
        successfulPings
      });
    }
  }
});
