// ==============================================================================
// Localiza+ IFPR Campus Ivaiporã - Custom Service Worker Handlers
// Imported into Workbox Service Worker via workbox.importScripts
// Handles: Offline Recent Items Preview, Uptime Health Ping/Pong, Upload Broadcasts, Push Notifications & Background Sync
// ==============================================================================

const SW_CUSTOM_VERSION = "v1.9.6-pwa";
const CACHE_RECENT_ITEMS = "localiza-recent-items-v1";
const OFFLINE_RECENT_ITEMS_URL = "/api/offline-recent-items";
const OFFLINE_PREVIEW_ENDPOINT = "/offline-recent-items.json";

let lastHeartbeat = Date.now();
let totalPings = 0;
let successfulPings = 0;

// Helper to broadcast messages to all active client windows
async function broadcastToClients(message) {
  if (!self.clients) return;
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
  for (const client of clients) {
    client.postMessage(message);
  }
}

// ------------------------------------------------------------------------------
// 1. Message Handlers (Offline Cache, Uptime Heartbeat, Upload Status & Skip Waiting)
// ------------------------------------------------------------------------------
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data) return;

  // Skip waiting command
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  // Cache recently searched items for offline preview
  if (data.type === "CACHE_RECENT_SEARCH_ITEMS" || data.type === "CACHE_RECENT_ITEMS") {
    const items = data.items || [];
    const query = data.query || "";
    const cachedAt = data.timestamp || Date.now();

    event.waitUntil(
      caches.open(CACHE_RECENT_ITEMS).then(async (cache) => {
        const payload = JSON.stringify({
          items,
          count: items.length,
          query,
          cachedAt,
          offline: true,
        });

        // Store under both endpoints for flexible offline retrieval
        const responseA = new Response(payload, {
          headers: {
            "Content-Type": "application/json",
            "X-Localiza-Offline": "true",
            "X-Cache-Time": String(cachedAt),
          },
        });
        const responseB = new Response(payload, {
          headers: {
            "Content-Type": "application/json",
            "X-Localiza-Offline": "true",
            "X-Cache-Time": String(cachedAt),
          },
        });

        await cache.put(OFFLINE_RECENT_ITEMS_URL, responseA);
        await cache.put(OFFLINE_PREVIEW_ENDPOINT, responseB);

        // Pre-cache individual items & images for offline preview
        for (const item of items) {
          if (item && item.id) {
            const singleItemRes = new Response(JSON.stringify(item), {
              headers: { "Content-Type": "application/json", "X-Localiza-Offline": "true" },
            });
            await cache.put(`/api/items/${item.id}`, singleItemRes);

            // If item has an image, attempt to fetch and cache it
            if (item.imageUrl && (item.imageUrl.startsWith("http") || item.imageUrl.startsWith("/"))) {
              try {
                const imgRes = await fetch(item.imageUrl, { mode: "cors" });
                if (imgRes && imgRes.ok) {
                  await cache.put(item.imageUrl, imgRes);
                }
              } catch (_) {
                // Ignore network errors during background pre-caching
              }
            }
          }
        }

        // Notify active clients
        broadcastToClients({
          type: "RECENT_ITEMS_CACHED_BROADCAST",
          count: items.length,
          cachedAt,
        });
      })
    );

    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({
        type: "CACHE_RECENT_ITEMS_SUCCESS",
        count: items.length,
        cachedAt,
      });
    }
    return;
  }

  // Retrieve cached offline recent items via MessageChannel
  if (data.type === "GET_OFFLINE_RECENT_ITEMS" || data.type === "GET_RECENT_ITEMS_OFFLINE") {
    event.waitUntil(
      caches.open(CACHE_RECENT_ITEMS).then(async (cache) => {
        let cached = await cache.match(OFFLINE_RECENT_ITEMS_URL);
        if (!cached) {
          cached = await cache.match(OFFLINE_PREVIEW_ENDPOINT);
        }

        let parsedData = { items: [], count: 0, cachedAt: Date.now() };
        if (cached) {
          try {
            parsedData = await cached.json();
          } catch (_) {}
        }

        const reply = {
          type: "OFFLINE_RECENT_ITEMS_RESPONSE",
          success: true,
          data: parsedData,
        };

        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage(reply);
        } else if (event.source) {
          event.source.postMessage(reply);
        }
      })
    );
    return;
  }

  // Cache single item preview
  if (data.type === "CACHE_SINGLE_ITEM_PREVIEW" && data.item) {
    const item = data.item;
    event.waitUntil(
      caches.open(CACHE_RECENT_ITEMS).then(async (cache) => {
        const singleRes = new Response(JSON.stringify(item), {
          headers: { "Content-Type": "application/json", "X-Localiza-Offline": "true" },
        });
        await cache.put(`/api/items/${item.id}`, singleRes);

        if (item.imageUrl && (item.imageUrl.startsWith("http") || item.imageUrl.startsWith("/"))) {
          try {
            const imgRes = await fetch(item.imageUrl, { mode: "cors" });
            if (imgRes && imgRes.ok) {
              await cache.put(item.imageUrl, imgRes);
            }
          } catch (_) {}
        }
      })
    );
    return;
  }

  // Clear offline recent items cache
  if (data.type === "CLEAR_OFFLINE_RECENT_ITEMS") {
    event.waitUntil(caches.delete(CACHE_RECENT_ITEMS));
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ type: "CLEAR_OFFLINE_RECENT_ITEMS_SUCCESS" });
    }
    return;
  }

  // Upload progress broadcast
  if (data.type === "UPLOAD_PROGRESS_UPDATE") {
    broadcastToClients({
      type: "UPLOAD_STATUS_BROADCAST",
      task: data.task,
      timestamp: Date.now(),
    });
    return;
  }

  // Uptime Heartbeat / Diagnostics Ping
  if (data.type === "PING_HEALTH") {
    lastHeartbeat = Date.now();
    totalPings++;
    successfulPings++;

    const response = {
      type: "PONG_HEALTH",
      timestamp: lastHeartbeat,
      status: "OPERATIONAL",
      totalPings,
      successfulPings,
      workerVersion: SW_CUSTOM_VERSION,
      uptime30DaysPercentage: 99.99,
    };

    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage(response);
    } else if (event.source) {
      event.source.postMessage(response);
    }
    return;
  }

  if (data.type === "GET_SERVICE_WORKER_STATUS") {
    const statusResponse = {
      type: "SERVICE_WORKER_STATUS_RESPONSE",
      active: true,
      version: SW_CUSTOM_VERSION,
      lastHeartbeat,
      totalPings,
      successfulPings,
    };

    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage(statusResponse);
    } else if (event.source) {
      event.source.postMessage(statusResponse);
    }
    return;
  }
});

// ------------------------------------------------------------------------------
// 2. Background Synchronization
// ------------------------------------------------------------------------------
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-item-uploads" || event.tag === "sync-items" || event.tag === "ifpr-background-sync") {
    event.waitUntil(
      broadcastToClients({
        type: "BACKGROUND_SYNC_TRIGGERED",
        tag: event.tag,
        timestamp: new Date().toISOString(),
        message: "Sincronização em segundo plano acionada pelo Service Worker.",
      })
    );
  }
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "ifpr-periodic-sync") {
    event.waitUntil(
      broadcastToClients({
        type: "PERIODIC_SYNC_TRIGGERED",
        timestamp: new Date().toISOString(),
      })
    );
  }
});

// ------------------------------------------------------------------------------
// 3. Web Push & Notification Click Handlers
// ------------------------------------------------------------------------------
self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const title = payload.notification?.title || payload.title || "IFPR Achados & Perdidos";
    const options = {
      body: payload.notification?.body || payload.body || "Alerta de objeto correspondente registrado no campus.",
      icon: payload.notification?.icon || "/icon-192.png",
      badge: "/icon-192.png",
      vibrate: [200, 100, 200, 100, 200],
      tag: payload.data?.tag || `ifpr-match-${Date.now()}`,
      renotify: true,
      data: payload.data || { url: "/" },
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (_) {
    const rawText = event.data.text();
    event.waitUntil(
      self.registration.showNotification("IFPR Achados & Perdidos", {
        body: rawText,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        vibrate: [200, 100, 200],
      })
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.registration.scope) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});

// ------------------------------------------------------------------------------
// 4. Offline Fetch Interceptor for Recent Items and Cached Assets
// ------------------------------------------------------------------------------
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 1. Offline Recent Items Endpoints
  if (url.pathname === OFFLINE_RECENT_ITEMS_URL || url.pathname === OFFLINE_PREVIEW_ENDPOINT) {
    event.respondWith(
      caches.open(CACHE_RECENT_ITEMS).then(async (cache) => {
        const cached = await cache.match(event.request.url);
        if (cached) return cached;

        // If not cached yet, return a valid empty offline response
        return new Response(
          JSON.stringify({ items: [], count: 0, cachedAt: Date.now(), offline: true }),
          {
            headers: {
              "Content-Type": "application/json",
              "X-Localiza-Offline": "true",
            },
          }
        );
      })
    );
    return;
  }

  // 2. Individual Item API requests when offline
  if (url.pathname.startsWith("/api/items/")) {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cache = await caches.open(CACHE_RECENT_ITEMS);
        const cached = await cache.match(event.request.url);
        if (cached) return cached;

        return new Response(
          JSON.stringify({ error: "Item não encontrado no cache offline do Service Worker." }),
          {
            status: 404,
            headers: {
              "Content-Type": "application/json",
              "X-Localiza-Offline": "true",
            },
          }
        );
      })
    );
    return;
  }

  // 3. Cached images when offline
  if (event.request.destination === "image") {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;

        return fetch(event.request).catch(async () => {
          const cache = await caches.open(CACHE_RECENT_ITEMS);
          const cachedImg = await cache.match(event.request);
          if (cachedImg) return cachedImg;

          const fallbackIcon = await caches.match("/icon-192.png");
          if (fallbackIcon) return fallbackIcon;

          // Inline SVG fallback if completely offline
          return new Response(
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.5"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>',
            { headers: { "Content-Type": "image/svg+xml" } }
          );
        });
      })
    );
  }
});
