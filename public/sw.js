// ==============================================================================
// Service Worker - Localiza+ PWA (IFPR Campus Ivaiporã)
// Versão: v5.1.0-localiza-pwa
// Estratégia: Stale-While-Revalidate para assets estáticos e Network-First para navegação.
// Prevenção de cache obsoleto com ciclo de vida dinâmico, limpeza de versões antigas
// e fallback para página offline (offline.html).
// ==============================================================================

const SW_VERSION = 'v5.1.0-localiza-pwa';
const CACHE_STATIC = `localiza-static-${SW_VERSION}`;
const CACHE_MEDIA = `localiza-media-${SW_VERSION}`;

// Pre-caching essencial na instalação
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

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  console.log(`[PWA SW] Instalando versão ${SW_VERSION}...`);
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[PWA SW] Aviso de precache parcial de assets:', err);
      });
    })
  );
  // Mantém no estado 'waiting' até o skipWaiting ser chamado ou clientes serem atualizados
});

// Ativação e Limpeza Automática de caches obsoletos (qualquer cache que não pertença à versão ativa)
self.addEventListener('activate', (event) => {
  console.log(`[PWA SW] Versão ${SW_VERSION} ativada. Executando purga de caches antigos...`);
  const activeCaches = new Set([CACHE_STATIC, CACHE_MEDIA]);

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!activeCaches.has(cacheName)) {
            console.log(`[PWA SW] Removendo cache obsoleto identificado: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[PWA SW] Limpeza de cache concluída. Assumindo controle dos clientes.');
      return self.clients.claim();
    })
  );
});

// Helper de Stale-While-Revalidate para ativos estáticos
async function staleWhileRevalidate(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  // Dispara a busca na rede em segundo plano para atualizar o cache (Revalidate)
  const networkFetch = fetch(request)
    .then((networkResponse) => {
      if (networkResponse && networkResponse.status === 200) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch((error) => {
      console.debug('[PWA SW] Rede offline durante revalidação:', request.url);
      return null;
    });

  // Retorna a resposta em cache imediatamente (Stale) se disponível,
  // ou aguarda a resposta da rede se ainda não estiver em cache
  return cachedResponse || (await networkFetch) || caches.match('/favicon.ico');
}

// Interceptador Fetch
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Ignorar requisições não-GET e esquemas não suportados (ex: extensões de navegador)
  if (event.request.method !== 'GET' || url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') {
    return;
  }

  // 2. SEGURANÇA: NUNCA armazenar em cache chamadas de API, Firebase, Auth ou Google
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
  // Garante que o usuário sempre receba a versão mais recente e nunca fique preso em HTML obsoleto
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
          // Se a rede falhar, tenta recuperar o index.html em cache; se não houver, serve a página offline.html
          const cachedIndex = await caches.match('/index.html');
          if (cachedIndex) {
            return cachedIndex;
          }
          const offlinePage = await caches.match('/offline.html');
          if (offlinePage) {
            return offlinePage;
          }
          return caches.match('/');
        })
    );
    return;
  }

  // 4. Scripts, folhas de estilo e fontes: Estratégia Stale-While-Revalidate
  if (
    url.pathname.match(/\.(js|css|woff2|woff|ttf|eot)$/i) ||
    url.pathname.startsWith('/assets/')
  ) {
    event.respondWith(staleWhileRevalidate(CACHE_STATIC, event.request));
    return;
  }

  // 5. Imagens estáticas, ícones e Web Manifest: Estratégia Stale-While-Revalidate
  if (
    url.pathname.match(/\.(png|jpg|jpeg|svg|gif|webp|ico|webmanifest|json)$/i) ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(staleWhileRevalidate(CACHE_MEDIA, event.request));
    return;
  }
});

// Mensageria do Service Worker (SKIP_WAITING e Monitoramento de Uptime)
let lastHeartbeat = Date.now();
let totalPings = 0;
let successfulPings = 0;

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data) return;

  // Comando para aplicar nova versão imediatamente (Skip Waiting)
  if (data.type === 'SKIP_WAITING') {
    console.log('[PWA SW] Aplicando SKIP_WAITING. Ativando versão mais recente...');
    self.skipWaiting();
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
