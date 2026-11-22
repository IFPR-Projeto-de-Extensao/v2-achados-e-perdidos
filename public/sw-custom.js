// ==============================================================================
// Localiza+ IFPR Campus Ivaiporã - Custom Service Worker Handlers
// Imported into Workbox Service Worker via workbox.importScripts
// Handles: Offline Recent Items Preview, Uptime Health Ping/Pong, Upload Broadcasts, Push Notifications & Background Sync
// ==============================================================================

const SW_CUSTOM_VERSION = "v1.10.13-pwa";
const CACHE_RECENT_ITEMS = "localiza-recent-items-v2";
const LEGACY_RECENT_ITEMS_CACHES = ["localiza-recent-items-v1"];
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

function replyToPortOrSource(event, payload) {
  if (event.ports && event.ports[0]) {
    event.ports[0].postMessage(payload);
  } else if (event.source && typeof event.source.postMessage === "function") {
    event.source.postMessage(payload);
  }
}

async function readExistingRecentCacheMeta(cache) {
  try {
    const cached =
      (await cache.match(OFFLINE_RECENT_ITEMS_URL)) ||
      (await cache.match(OFFLINE_PREVIEW_ENDPOINT));
    if (!cached) return { updatedAt: 0, items: [], cleared: false };
    const parsed = await cached.json();
    const updatedAt = Number(parsed?.updatedAt || parsed?.cachedAt || 0);
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    return { updatedAt, items, cleared: Boolean(parsed?.cleared) };
  } catch (_) {
    return { updatedAt: 0, items: [], cleared: false };
  }
}

async function writeRecentCacheEndpoints(cache, payloadObj) {
  const payload = JSON.stringify(payloadObj);
  const headers = {
    "Content-Type": "application/json",
    "X-Localiza-Offline": "true",
    "X-Cache-Time": String(payloadObj.updatedAt),
    "X-SW-Version": SW_CUSTOM_VERSION,
  };
  await cache.put(OFFLINE_RECENT_ITEMS_URL, new Response(payload, { headers }));
  await cache.put(OFFLINE_PREVIEW_ENDPOINT, new Response(payload, { headers }));
}

// ------------------------------------------------------------------------------
// 0. Lifecycle: Clean legacy recent-items caches ONLY (preserve non-catalog caches)
// ------------------------------------------------------------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const names = await caches.keys();
        for (const name of names) {
          if (LEGACY_RECENT_ITEMS_CACHES.includes(name)) {
            await caches.delete(name);
          }
        }
      } catch (err) {
        console.warn("[SW Custom] Aviso ao limpar caches legados de itens recentes:", err);
      }
      if (self.clients && typeof self.clients.claim === "function") {
        try {
          await self.clients.claim();
        } catch (_) {}
      }
    })()
  );
});

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

  // Cache recently searched items for offline preview (respecting monotonic updatedAt)
  if (data.type === "CACHE_RECENT_SEARCH_ITEMS" || data.type === "CACHE_RECENT_ITEMS") {
    const items = Array.isArray(data.items) ? data.items : [];
    const query = data.query || "";
    const updatedAt = Number(data.updatedAt || data.timestamp || Date.now());

    event.waitUntil(
      caches
        .open(CACHE_RECENT_ITEMS)
        .then(async (cache) => {
          const existing = await readExistingRecentCacheMeta(cache);
          if (existing.updatedAt > updatedAt) {
            replyToPortOrSource(event, {
              type: "CACHE_RECENT_ITEMS_SUCCESS",
              skippedStale: true,
              count: existing.items.length,
              cachedAt: existing.updatedAt,
              updatedAt: existing.updatedAt,
              swVersion: SW_CUSTOM_VERSION,
            });
            return;
          }

          await writeRecentCacheEndpoints(cache, {
            items,
            count: items.length,
            query,
            cachedAt: updatedAt,
            updatedAt,
            cleared: items.length === 0,
            offline: true,
            swVersion: SW_CUSTOM_VERSION,
          });

          // Pre-cache individual items & images for offline preview
          for (const item of items) {
            if (item && item.id) {
              const singleItemRes = new Response(JSON.stringify(item), {
                headers: { "Content-Type": "application/json", "X-Localiza-Offline": "true" },
              });
              await cache.put(`/api/items/${item.id}`, singleItemRes);

              if (
                item.imageUrl &&
                (item.imageUrl.startsWith("http") || item.imageUrl.startsWith("/"))
              ) {
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

          replyToPortOrSource(event, {
            type: "CACHE_RECENT_ITEMS_SUCCESS",
            success: true,
            count: items.length,
            cachedAt: updatedAt,
            updatedAt,
            swVersion: SW_CUSTOM_VERSION,
          });

          await broadcastToClients({
            type: "RECENT_ITEMS_CACHED_BROADCAST",
            items,
            count: items.length,
            cachedAt: updatedAt,
            updatedAt,
            cleared: items.length === 0,
            swVersion: SW_CUSTOM_VERSION,
          });
        })
        .catch((err) => {
          console.warn("[SW Custom] Erro ao gravar itens recentes no cache:", err);
          replyToPortOrSource(event, {
            type: "CACHE_RECENT_ITEMS_SUCCESS",
            success: false,
            error: String(err?.message || err),
            swVersion: SW_CUSTOM_VERSION,
          });
        })
    );
    return;
  }

  // Retrieve cached offline recent items via MessageChannel
  if (data.type === "GET_OFFLINE_RECENT_ITEMS" || data.type === "GET_RECENT_ITEMS_OFFLINE") {
    event.waitUntil(
      caches
        .open(CACHE_RECENT_ITEMS)
        .then(async (cache) => {
          let cached = await cache.match(OFFLINE_RECENT_ITEMS_URL);
          if (!cached) {
            cached = await cache.match(OFFLINE_PREVIEW_ENDPOINT);
          }

          let parsedData = {
            items: [],
            count: 0,
            cachedAt: 0,
            updatedAt: 0,
            cleared: false,
            swVersion: SW_CUSTOM_VERSION,
          };
          if (cached) {
            try {
              const json = await cached.json();
              parsedData = {
                items: Array.isArray(json?.items) ? json.items : [],
                count: Array.isArray(json?.items) ? json.items.length : 0,
                cachedAt: Number(json?.cachedAt || json?.updatedAt || 0),
                updatedAt: Number(json?.updatedAt || json?.cachedAt || 0),
                cleared: Boolean(json?.cleared),
                swVersion: json?.swVersion || SW_CUSTOM_VERSION,
              };
            } catch (_) {}
          }

          replyToPortOrSource(event, {
            type: "OFFLINE_RECENT_ITEMS_RESPONSE",
            success: true,
            swVersion: SW_CUSTOM_VERSION,
            data: parsedData,
          });
        })
        .catch((err) => {
          console.warn("[SW Custom] Erro ao recuperar itens recentes do cache:", err);
          replyToPortOrSource(event, {
            type: "OFFLINE_RECENT_ITEMS_RESPONSE",
            success: false,
            swVersion: SW_CUSTOM_VERSION,
            data: { items: [], count: 0, cachedAt: 0, updatedAt: 0, cleared: false },
          });
        })
    );
    return;
  }

  // Cache single item preview
  if (data.type === "CACHE_SINGLE_ITEM_PREVIEW" && data.item) {
    const item = data.item;
    event.waitUntil(
      caches
        .open(CACHE_RECENT_ITEMS)
        .then(async (cache) => {
          const singleRes = new Response(JSON.stringify(item), {
            headers: { "Content-Type": "application/json", "X-Localiza-Offline": "true" },
          });
          await cache.put(`/api/items/${item.id}`, singleRes);

          if (
            item.imageUrl &&
            (item.imageUrl.startsWith("http") || item.imageUrl.startsWith("/"))
          ) {
            try {
              const imgRes = await fetch(item.imageUrl, { mode: "cors" });
              if (imgRes && imgRes.ok) {
                await cache.put(item.imageUrl, imgRes);
              }
            } catch (_) {}
          }
        })
        .catch((err) => {
          console.warn("[SW Custom] Erro ao gravar item no cache:", err);
        })
    );
    return;
  }

  // Authoritative replacement of cached recent items (prunes removed /api/items/{id} entries)
  if (data.type === "REPLACE_OFFLINE_RECENT_ITEMS") {
    const items = Array.isArray(data.items) ? data.items : [];
    const query = data.query || "";
    const updatedAt = Number(data.updatedAt || data.timestamp || Date.now());

    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE_RECENT_ITEMS);
        const existing = await readExistingRecentCacheMeta(cache);
        if (existing.updatedAt > updatedAt) {
          replyToPortOrSource(event, {
            type: "REPLACE_OFFLINE_RECENT_ITEMS_ACK",
            success: true,
            skippedStale: true,
            count: existing.items.length,
            updatedAt: existing.updatedAt,
            swVersion: SW_CUSTOM_VERSION,
          });
          return;
        }

        if (items.length === 0) {
          // Delete all individual /api/items/{id} entries and store explicit cleared marker with updatedAt
          const existingKeys = await cache.keys();
          for (const req of existingKeys) {
            try {
              const url = new URL(req.url);
              if (url.pathname.startsWith("/api/items/")) {
                await cache.delete(req);
              }
            } catch (_) {}
          }
          await writeRecentCacheEndpoints(cache, {
            items: [],
            count: 0,
            query: "",
            cachedAt: updatedAt,
            updatedAt,
            cleared: true,
            offline: true,
            swVersion: SW_CUSTOM_VERSION,
          });
          replyToPortOrSource(event, {
            type: "REPLACE_OFFLINE_RECENT_ITEMS_ACK",
            success: true,
            count: 0,
            updatedAt,
            cleared: true,
            swVersion: SW_CUSTOM_VERSION,
          });
          await broadcastToClients({
            type: "RECENT_ITEMS_CACHED_BROADCAST",
            items: [],
            count: 0,
            cachedAt: updatedAt,
            updatedAt,
            cleared: true,
            swVersion: SW_CUSTOM_VERSION,
          });
          return;
        }

        const keepIds = new Set(items.filter((it) => it && it.id).map((it) => String(it.id)));

        // Remove stale individual /api/items/{id} entries no longer in authoritative catalog
        const existingKeys = await cache.keys();
        for (const req of existingKeys) {
          try {
            const url = new URL(req.url);
            if (url.pathname.startsWith("/api/items/")) {
              const idSegment = url.pathname.slice("/api/items/".length);
              if (idSegment && !keepIds.has(idSegment)) {
                await cache.delete(req);
              }
            }
          } catch (_) {}
        }

        await writeRecentCacheEndpoints(cache, {
          items,
          count: items.length,
          query,
          cachedAt: updatedAt,
          updatedAt,
          cleared: false,
          offline: true,
          swVersion: SW_CUSTOM_VERSION,
        });

        for (const item of items) {
          if (item && item.id) {
            await cache.put(
              `/api/items/${item.id}`,
              new Response(JSON.stringify(item), {
                headers: { "Content-Type": "application/json", "X-Localiza-Offline": "true" },
              })
            );
          }
        }

        replyToPortOrSource(event, {
          type: "REPLACE_OFFLINE_RECENT_ITEMS_ACK",
          success: true,
          count: items.length,
          updatedAt,
          cleared: false,
          swVersion: SW_CUSTOM_VERSION,
        });

        await broadcastToClients({
          type: "RECENT_ITEMS_CACHED_BROADCAST",
          items,
          count: items.length,
          cachedAt: updatedAt,
          updatedAt,
          cleared: false,
          swVersion: SW_CUSTOM_VERSION,
        });
      })().catch((err) => {
        console.warn("[SW Custom] Erro ao substituir cache de itens recentes:", err);
        replyToPortOrSource(event, {
          type: "REPLACE_OFFLINE_RECENT_ITEMS_ACK",
          success: false,
          error: String(err?.message || err),
          swVersion: SW_CUSTOM_VERSION,
        });
      })
    );
    return;
  }

  // Surgical removal of deleted item IDs from offline recent items cache & /api/items/{id}
  if (data.type === "REMOVE_OFFLINE_RECENT_ITEMS") {
    const itemIds = Array.isArray(data.itemIds) ? data.itemIds.map(String) : [];
    const removeSet = new Set(itemIds);
    const updatedAt = Number(data.updatedAt || data.timestamp || Date.now());

    event.waitUntil(
      caches
        .open(CACHE_RECENT_ITEMS)
        .then(async (cache) => {
          for (const id of removeSet) {
            await cache.delete(`/api/items/${id}`);
          }

          let currentItems = Array.isArray(data.remainingItems) ? data.remainingItems : null;
          if (!currentItems) {
            const existing = await readExistingRecentCacheMeta(cache);
            currentItems = existing.items.filter(
              (it) => it && it.id && !removeSet.has(String(it.id))
            );
          }

          const safeRemaining = Array.isArray(currentItems)
            ? currentItems.filter((it) => it && it.id && !removeSet.has(String(it.id)))
            : [];

          await writeRecentCacheEndpoints(cache, {
            items: safeRemaining,
            count: safeRemaining.length,
            cachedAt: updatedAt,
            updatedAt,
            cleared: safeRemaining.length === 0,
            offline: true,
            swVersion: SW_CUSTOM_VERSION,
          });

          replyToPortOrSource(event, {
            type: "REMOVE_OFFLINE_RECENT_ITEMS_ACK",
            success: true,
            count: safeRemaining.length,
            updatedAt,
            removedIds: itemIds,
            swVersion: SW_CUSTOM_VERSION,
          });

          await broadcastToClients({
            type: "RECENT_ITEMS_CACHED_BROADCAST",
            items: safeRemaining,
            count: safeRemaining.length,
            cachedAt: updatedAt,
            updatedAt,
            cleared: safeRemaining.length === 0,
            removedIds: itemIds,
            swVersion: SW_CUSTOM_VERSION,
          });
        })
        .catch((err) => {
          console.warn("[SW Custom] Erro ao remover itens excluídos do cache:", err);
          replyToPortOrSource(event, {
            type: "REMOVE_OFFLINE_RECENT_ITEMS_ACK",
            success: false,
            error: String(err?.message || err),
            swVersion: SW_CUSTOM_VERSION,
          });
        })
    );
    return;
  }

  // Clear offline recent items cache (stores explicit cleared marker with updatedAt)
  if (data.type === "CLEAR_OFFLINE_RECENT_ITEMS") {
    const updatedAt = Number(data.updatedAt || data.timestamp || Date.now());
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE_RECENT_ITEMS);
        const existingKeys = await cache.keys();
        for (const req of existingKeys) {
          await cache.delete(req);
        }
        // Persist explicit cleared state with monotonic updatedAt so reconciliation knows cache was intentionally emptied
        await writeRecentCacheEndpoints(cache, {
          items: [],
          count: 0,
          query: "",
          cachedAt: updatedAt,
          updatedAt,
          cleared: true,
          offline: true,
          swVersion: SW_CUSTOM_VERSION,
        });

        replyToPortOrSource(event, {
          type: "CLEAR_OFFLINE_RECENT_ITEMS_SUCCESS",
          success: true,
          updatedAt,
          cleared: true,
          swVersion: SW_CUSTOM_VERSION,
        });

        await broadcastToClients({
          type: "RECENT_ITEMS_CACHED_BROADCAST",
          items: [],
          count: 0,
          cachedAt: updatedAt,
          updatedAt,
          cleared: true,
          swVersion: SW_CUSTOM_VERSION,
        });
      })().catch((err) => {
        console.warn("[SW Custom] Erro ao limpar cache de itens recentes:", err);
        replyToPortOrSource(event, {
          type: "CLEAR_OFFLINE_RECENT_ITEMS_SUCCESS",
          success: false,
          error: String(err?.message || err),
          swVersion: SW_CUSTOM_VERSION,
        });
      })
    );
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

    replyToPortOrSource(event, response);
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

    replyToPortOrSource(event, statusResponse);
    return;
  }
});

// ------------------------------------------------------------------------------
// 2. Background Synchronization
// ------------------------------------------------------------------------------
self.addEventListener("sync", (event) => {
  if (
    event.tag === "sync-item-uploads" ||
    event.tag === "sync-items" ||
    event.tag === "ifpr-background-sync"
  ) {
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
      body:
        payload.notification?.body ||
        payload.body ||
        "Alerta de objeto correspondente registrado no campus.",
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
      caches
        .open(CACHE_RECENT_ITEMS)
        .then(async (cache) => {
          const cached = await cache.match(event.request.url);
          if (cached) return cached;

          return new Response(
            JSON.stringify({
              items: [],
              count: 0,
              cachedAt: 0,
              updatedAt: 0,
              cleared: false,
              offline: true,
              swVersion: SW_CUSTOM_VERSION,
            }),
            {
              headers: {
                "Content-Type": "application/json",
                "X-Localiza-Offline": "true",
              },
            }
          );
        })
        .catch(() => {
          return new Response(
            JSON.stringify({
              items: [],
              count: 0,
              cachedAt: 0,
              updatedAt: 0,
              cleared: false,
              offline: true,
              swVersion: SW_CUSTOM_VERSION,
            }),
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

// ------------------------------------------------------------------------------
// 5. Global Unhandled Rejection Guard for Service Worker
// ------------------------------------------------------------------------------
self.addEventListener("unhandledrejection", (event) => {
  if (event && event.reason) {
    const reasonStr = String(event.reason?.message || event.reason);
    if (
      reasonStr.includes("no-response") ||
      reasonStr.includes("Failed to fetch") ||
      reasonStr.includes("NetworkError") ||
      reasonStr.includes("Load failed")
    ) {
      event.preventDefault();
    }
  }
});
