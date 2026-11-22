import { LostFoundItem } from "../types";
import { sanitizePublicItemProjection } from "./itemPrivacyUtils";

/**
 * Service for caching and retrieving recently searched items for offline preview.
 * Integrates with Service Worker (sw-custom.js) via postMessage / MessageChannel ACKs
 * and maintains a timestamp-versioned (`updatedAt`) localStorage mirror.
 *
 * ETAPA 15: All cached items are strictly sanitized via sanitizePublicItemProjection
 * so personal return data, signatures, and validation codes are never stored in browser caches.
 *
 * ACHADO-05 HARDENING:
 * - Deterministic reconciliation between localStorage and Service Worker Cache using monotonic `updatedAt`.
 * - Explicit `cleared: true` marker stored with `updatedAt` so a stale/old Service Worker
 *   can NEVER override a more recent cleared localStorage state.
 * - Never assumes fire-and-forget postMessage succeeded: awaits MessageChannel ACK with timeout
 *   and degrades safely to legacy SW handlers (`CLEAR_OFFLINE_RECENT_ITEMS` / `CACHE_RECENT_SEARCH_ITEMS`)
 *   when communicating with an older SW version.
 * - Real consumer (`applyServiceWorkerRecentItemsBroadcast`) for `RECENT_ITEMS_CACHED_BROADCAST`
 *   messages dispatched by `public/sw-custom.js`, updating React state only if strictly newer.
 */

const STORAGE_KEY_RECENT_ITEMS = "localiza_recent_searched_items";
const MAX_CACHED_ITEMS = 30;
export const EXPECTED_SW_CUSTOM_VERSION = "v1.10.13-pwa";

export interface OfflineRecentCacheEnvelope {
  items: LostFoundItem[];
  updatedAt: number;
  timestamp: number;
  query?: string;
  cleared?: boolean;
  swVersion?: string;
}

export interface OfflineRecentItemsResult {
  items: LostFoundItem[];
  count: number;
  source: "service-worker" | "local-storage" | "memory";
  cachedAt: number;
  updatedAt: number;
  cleared?: boolean;
  swVersion?: string;
}

export interface SwPostAckResult {
  acknowledged: boolean;
  success: boolean;
  swVersion?: string;
  skippedStale?: boolean;
  fallbackUsed?: boolean;
}

export interface CacheSearchedItemsOptions {
  isFromOfflineFallback?: boolean;
  authoritativeItemIds?: ReadonlySet<string>;
}

type OfflineRecentItemsListener = (items: LostFoundItem[]) => void;
const recentItemsListeners = new Set<OfflineRecentItemsListener>();

let lastMonotonicTimestamp = 0;
function nextMonotonicTimestamp(): number {
  const now = Date.now();
  lastMonotonicTimestamp = now > lastMonotonicTimestamp ? now : lastMonotonicTimestamp + 1;
  return lastMonotonicTimestamp;
}

export function subscribeOfflineRecentItemsChange(
  listener: OfflineRecentItemsListener
): () => void {
  recentItemsListeners.add(listener);
  return () => {
    recentItemsListeners.delete(listener);
  };
}

function notifyRecentItemsListeners(items: LostFoundItem[]): void {
  for (const listener of recentItemsListeners) {
    try {
      listener(items);
    } catch (_) {}
  }
}

export function readLocalRecentItemsEnvelope(
  excludeIds?: ReadonlySet<string>
): OfflineRecentCacheEnvelope {
  if (typeof localStorage === "undefined") {
    return { items: [], updatedAt: 0, timestamp: 0, cleared: false };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RECENT_ITEMS);
    if (!raw) {
      return { items: [], updatedAt: 0, timestamp: 0, cleared: false };
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const items = parsed
        .filter((it) => Boolean(it && it.id) && (!excludeIds || !excludeIds.has(it.id)))
        .map((it) => sanitizePublicItemProjection(it));
      return { items, updatedAt: 1, timestamp: 1, cleared: items.length === 0 };
    }
    const updatedAt = Number(parsed?.updatedAt || parsed?.timestamp || parsed?.cachedAt || 0);
    const rawList: LostFoundItem[] = Array.isArray(parsed?.items) ? parsed.items : [];
    const items = rawList
      .filter((it) => Boolean(it && it.id) && (!excludeIds || !excludeIds.has(it.id)))
      .map((it) => sanitizePublicItemProjection(it));
    return {
      items,
      updatedAt,
      timestamp: updatedAt,
      query: typeof parsed?.query === "string" ? parsed.query : "",
      cleared: Boolean(parsed?.cleared) || (updatedAt > 0 && rawList.length === 0),
    };
  } catch (err) {
    console.warn("[RecentItemsOfflineService] Error reading localStorage recent items:", err);
    return { items: [], updatedAt: 0, timestamp: 0, cleared: false };
  }
}

function writeLocalRecentItemsEnvelope(
  items: LostFoundItem[],
  options?: { searchQuery?: string; updatedAt?: number; cleared?: boolean }
): number {
  const updatedAt = options?.updatedAt ?? nextMonotonicTimestamp();
  if (typeof localStorage === "undefined") return updatedAt;
  try {
    const existing = readLocalRecentItemsEnvelope();
    if (existing.updatedAt > updatedAt) {
      return existing.updatedAt;
    }

    const envelope: OfflineRecentCacheEnvelope = {
      items,
      updatedAt,
      timestamp: updatedAt,
      query: options?.searchQuery || "",
      cleared: options?.cleared ?? items.length === 0,
    };
    localStorage.setItem(STORAGE_KEY_RECENT_ITEMS, JSON.stringify(envelope));
  } catch (err) {
    console.warn("[RecentItemsOfflineService] Error writing localStorage recent items:", err);
  }
  return updatedAt;
}

/**
 * Posts a message to the active Service Worker with MessageChannel ACK support.
 * Never treats a fire-and-forget postMessage as confirmed completion: resolves with
 * `acknowledged: false` on timeout (e.g., older SW that does not understand the new message type).
 */
async function postMessageToServiceWorkerWithAck(
  message: Record<string, any>,
  timeoutMs = 250
): Promise<SwPostAckResult> {
  if (
    typeof navigator === "undefined" ||
    !("serviceWorker" in navigator) ||
    !navigator.serviceWorker.controller
  ) {
    return { acknowledged: false, success: false };
  }

  if (typeof MessageChannel === "undefined") {
    try {
      navigator.serviceWorker.controller.postMessage(message);
    } catch (err) {
      console.warn("[RecentItemsOfflineService] Error posting message to SW:", err);
    }
    return { acknowledged: false, success: false };
  }

  return new Promise<SwPostAckResult>((resolve) => {
    let settled = false;
    const finish = (res: SwPostAckResult) => {
      if (settled) return;
      settled = true;
      resolve(res);
    };

    const timer = setTimeout(() => {
      finish({ acknowledged: false, success: false });
    }, timeoutMs);

    try {
      const channel = new MessageChannel();
      channel.port1.onmessage = (event) => {
        clearTimeout(timer);
        const reply = event?.data;
        finish({
          acknowledged: true,
          success: reply?.success !== false,
          swVersion: reply?.swVersion || reply?.version,
          skippedStale: Boolean(reply?.skippedStale),
        });
      };
      navigator.serviceWorker.controller?.postMessage(message, [channel.port2]);
    } catch (err) {
      clearTimeout(timer);
      console.warn("[RecentItemsOfflineService] Error posting message with ACK to SW:", err);
      finish({ acknowledged: false, success: false });
    }
  });
}

function postMessageToServiceWorkerFireAndForget(message: Record<string, any>): void {
  if (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    navigator.serviceWorker.controller
  ) {
    try {
      navigator.serviceWorker.controller.postMessage(message);
    } catch (err) {
      console.warn("[RecentItemsOfflineService] Error posting message to SW:", err);
    }
  }
}

/**
 * Deterministic reconciler between localStorage and Service Worker cache envelopes.
 * Strictly picks the newer `updatedAt` source so a stale SW (including an outdated SW version)
 * NEVER overrides a fresher cleared or updated localStorage state, and vice-versa.
 */
export function reconcileOfflineRecentCacheSources(params: {
  local: OfflineRecentCacheEnvelope;
  sw: OfflineRecentCacheEnvelope | null;
  excludeIds?: ReadonlySet<string>;
}): OfflineRecentItemsResult {
  const filterSanitize = (list: LostFoundItem[]) =>
    (list || [])
      .filter((it) => Boolean(it && it.id) && (!params.excludeIds || !params.excludeIds.has(it.id)))
      .map((it) => sanitizePublicItemProjection(it));

  const localItems = filterSanitize(params.local.items);
  const localTs = Number(params.local.updatedAt || 0);

  if (!params.sw) {
    return {
      items: localItems,
      count: localItems.length,
      source: "local-storage",
      cachedAt: localTs,
      updatedAt: localTs,
      cleared: params.local.cleared,
    };
  }

  const swItems = filterSanitize(params.sw.items);
  const swTs = Number(params.sw.updatedAt || 0);
  const swIsLegacy = !params.sw.swVersion || params.sw.swVersion !== EXPECTED_SW_CUSTOM_VERSION;

  // 1. If localStorage has a strictly newer timestamp (including an explicit cleared marker!),
  //    localStorage ALWAYS wins (prevents stale/old SW from resurrecting deleted items).
  if (localTs > swTs) {
    return {
      items: localItems,
      count: localItems.length,
      source: "local-storage",
      cachedAt: localTs,
      updatedAt: localTs,
      cleared: params.local.cleared,
    };
  }

  // 2. If timestamps tie and SW is legacy (or localStorage explicitly marked cleared), prefer localStorage
  if (localTs === swTs && (swIsLegacy || params.local.cleared)) {
    return {
      items: localItems,
      count: localItems.length,
      source: "local-storage",
      cachedAt: localTs,
      updatedAt: localTs,
      cleared: params.local.cleared,
    };
  }

  // 3. If SW has strictly newer timestamp (or equal timestamp on current SW version):
  //    Honor SW state — including an explicit SW cleared state (`cleared: true`, `items: []`)!
  if (swTs > localTs || (swTs > 0 && !swIsLegacy)) {
    return {
      items: swItems,
      count: swItems.length,
      source: "service-worker",
      cachedAt: swTs,
      updatedAt: swTs,
      cleared: params.sw.cleared,
      swVersion: params.sw.swVersion,
    };
  }

  // 4. Both have timestamp 0 (legacy unversioned caches): prefer whichever has items, preferring local
  if (localItems.length > 0) {
    return {
      items: localItems,
      count: localItems.length,
      source: "local-storage",
      cachedAt: localTs,
      updatedAt: localTs,
      cleared: false,
    };
  }

  return {
    items: swItems,
    count: swItems.length,
    source: swItems.length > 0 ? "service-worker" : "local-storage",
    cachedAt: swTs,
    updatedAt: swTs,
    cleared: params.sw.cleared,
    swVersion: params.sw.swVersion,
  };
}

/**
 * Real consumer for `RECENT_ITEMS_CACHED_BROADCAST` messages received from `public/sw-custom.js`
 * (wired in AppContext.tsx `handleSwMessage`).
 * Only updates localStorage & subscribed React views if the broadcast is newer than current local state.
 */
export function applyServiceWorkerRecentItemsBroadcast(
  payload: {
    items?: LostFoundItem[];
    count?: number;
    updatedAt?: number;
    cachedAt?: number;
    cleared?: boolean;
    removedIds?: string[];
  },
  excludeIds?: ReadonlySet<string>
): boolean {
  if (!payload || typeof payload !== "object") return false;
  const incomingTs = Number(payload.updatedAt || payload.cachedAt || 0);
  const currentLocal = readLocalRecentItemsEnvelope();

  // Never let an older SW broadcast overwrite a fresher localStorage update
  if (incomingTs > 0 && currentLocal.updatedAt > incomingTs) {
    return false;
  }

  if (payload.cleared) {
    writeLocalRecentItemsEnvelope([], {
      updatedAt: incomingTs || nextMonotonicTimestamp(),
      cleared: true,
    });
    notifyRecentItemsListeners([]);
    return true;
  }

  if (Array.isArray(payload.items)) {
    const sanitized = payload.items
      .filter((it) => Boolean(it && it.id) && (!excludeIds || !excludeIds.has(it.id)))
      .map((it) => sanitizePublicItemProjection(it))
      .slice(0, MAX_CACHED_ITEMS);
    writeLocalRecentItemsEnvelope(sanitized, {
      updatedAt: incomingTs || nextMonotonicTimestamp(),
      cleared: sanitized.length === 0,
    });
    notifyRecentItemsListeners(sanitized);
    return true;
  }

  if (Array.isArray(payload.removedIds) && payload.removedIds.length > 0) {
    const removeSet = new Set(payload.removedIds.map(String));
    const remaining = currentLocal.items.filter(
      (it) => Boolean(it?.id) && !removeSet.has(it.id)
    );
    writeLocalRecentItemsEnvelope(remaining, {
      updatedAt: incomingTs || nextMonotonicTimestamp(),
      cleared: remaining.length === 0,
    });
    notifyRecentItemsListeners(remaining);
    return true;
  }

  return false;
}

/**
 * Helper to check online status safely in browser environments
 */
export function isUserOffline(): boolean {
  if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
    return !navigator.onLine;
  }
  return false;
}

/**
 * Syncs a list to Service Worker with ACK; falls back to legacy SW handlers
 * (`CLEAR_OFFLINE_RECENT_ITEMS` + `CACHE_RECENT_SEARCH_ITEMS`) if an older SW ignores `REPLACE_OFFLINE_RECENT_ITEMS`.
 */
async function syncListToServiceWorker(
  items: LostFoundItem[],
  updatedAt: number,
  searchQuery = ""
): Promise<SwPostAckResult> {
  const ack = await postMessageToServiceWorkerWithAck({
    type: "REPLACE_OFFLINE_RECENT_ITEMS",
    items,
    query: searchQuery,
    timestamp: updatedAt,
    updatedAt,
  });

  if (ack.acknowledged) {
    return ack;
  }

  // Legacy SW fallback (older v1.10.7 SW supports CLEAR_OFFLINE_RECENT_ITEMS & CACHE_RECENT_SEARCH_ITEMS)
  if (items.length === 0) {
    const clearAck = await postMessageToServiceWorkerWithAck(
      {
        type: "CLEAR_OFFLINE_RECENT_ITEMS",
        timestamp: updatedAt,
        updatedAt,
      },
      120
    );
    return { ...clearAck, fallbackUsed: true };
  }

  await postMessageToServiceWorkerWithAck(
    {
      type: "CLEAR_OFFLINE_RECENT_ITEMS",
      timestamp: updatedAt,
      updatedAt,
    },
    120
  );
  const cacheAck = await postMessageToServiceWorkerWithAck(
    {
      type: "CACHE_RECENT_SEARCH_ITEMS",
      items,
      query: searchQuery,
      timestamp: updatedAt,
      updatedAt,
    },
    120
  );
  return { ...cacheAck, fallbackUsed: true };
}

/**
 * Saves recently searched or viewed items to local cache and posts to Service Worker.
 * Never writes offline-fallback data back into cache, and prunes any stale items not present
 * in authoritativeItemIds when provided.
 */
export async function cacheSearchedItems(
  newItems: LostFoundItem[],
  searchQuery?: string,
  options?: CacheSearchedItemsOptions
): Promise<void> {
  if (options?.isFromOfflineFallback) {
    return;
  }

  // If caller passes an authoritative empty catalog set, clear both caches completely
  if (options?.authoritativeItemIds && options.authoritativeItemIds.size === 0) {
    await clearOfflineRecentCache();
    return;
  }

  if (!newItems || newItems.length === 0) {
    if (options?.authoritativeItemIds) {
      const existing = getLocalCachedRecentItems().filter(
        (it) => Boolean(it?.id) && options.authoritativeItemIds!.has(it.id)
      );
      const updatedAt = writeLocalRecentItemsEnvelope(existing, {
        searchQuery: searchQuery || "",
        cleared: existing.length === 0,
      });
      await syncListToServiceWorker(existing, updatedAt, searchQuery || "");
      notifyRecentItemsListeners(existing);
    }
    return;
  }

  try {
    const existing = getLocalCachedRecentItems();
    const itemMap = new Map<string, LostFoundItem>();

    newItems.forEach((item) => {
      if (!item || !item.id) return;
      if (options?.authoritativeItemIds && !options.authoritativeItemIds.has(item.id)) {
        return;
      }
      itemMap.set(item.id, sanitizePublicItemProjection(item));
    });

    existing.forEach((item) => {
      if (!item || !item.id || itemMap.has(item.id)) return;
      if (options?.authoritativeItemIds && !options.authoritativeItemIds.has(item.id)) {
        return;
      }
      itemMap.set(item.id, sanitizePublicItemProjection(item));
    });

    const mergedList = Array.from(itemMap.values()).slice(0, MAX_CACHED_ITEMS);
    const updatedAt = writeLocalRecentItemsEnvelope(mergedList, {
      searchQuery: searchQuery || "",
      cleared: mergedList.length === 0,
    });

    if (options?.authoritativeItemIds) {
      await syncListToServiceWorker(mergedList, updatedAt, searchQuery || "");
    } else {
      await postMessageToServiceWorkerWithAck({
        type: "CACHE_RECENT_SEARCH_ITEMS",
        items: mergedList,
        query: searchQuery || "",
        timestamp: updatedAt,
        updatedAt,
      });
    }

    notifyRecentItemsListeners(mergedList);
  } catch (err) {
    console.warn("[RecentItemsOfflineService] Error caching searched items:", err);
  }
}

/**
 * Replaces and reconciles localStorage + Service Worker cache with the authoritative catalog
 * received from Firestore. If the authoritative catalog is empty, clears both caches completely.
 */
export async function syncOfflineRecentCacheWithAuthoritativeCatalog(
  authoritativeItems: LostFoundItem[]
): Promise<LostFoundItem[]> {
  try {
    const sanitizedAuth = (authoritativeItems || [])
      .filter((it) => Boolean(it && it.id))
      .map((it) => sanitizePublicItemProjection(it));

    if (sanitizedAuth.length === 0) {
      await clearOfflineRecentCache();
      return [];
    }

    const authById = new Map<string, LostFoundItem>();
    for (const item of sanitizedAuth) {
      authById.set(item.id, item);
    }

    const existing = getLocalCachedRecentItems();
    const reconciledMap = new Map<string, LostFoundItem>();

    for (const oldItem of existing) {
      if (oldItem?.id && authById.has(oldItem.id)) {
        reconciledMap.set(oldItem.id, authById.get(oldItem.id)!);
      }
    }

    for (const item of sanitizedAuth) {
      if (!reconciledMap.has(item.id)) {
        reconciledMap.set(item.id, item);
      }
      if (reconciledMap.size >= MAX_CACHED_ITEMS) break;
    }

    const reconciledList = Array.from(reconciledMap.values()).slice(0, MAX_CACHED_ITEMS);
    const updatedAt = writeLocalRecentItemsEnvelope(reconciledList, {
      searchQuery: "",
      cleared: false,
    });

    await syncListToServiceWorker(reconciledList, updatedAt, "");
    notifyRecentItemsListeners(reconciledList);
    return reconciledList;
  } catch (err) {
    console.warn(
      "[RecentItemsOfflineService] Error reconciling authoritative catalog cache:",
      err
    );
    return [];
  }
}

/**
 * Surgically removes specific deleted item IDs from localStorage, Service Worker Cache
 * (including /api/items/{id}), and active React listeners.
 * Uses ACK + legacy SW fallback so even outdated Service Workers cannot retain removed items.
 */
export async function removeItemsFromOfflineRecentCache(
  itemIds: string[]
): Promise<LostFoundItem[]> {
  if (!itemIds || itemIds.length === 0) {
    return getLocalCachedRecentItems();
  }

  const removeSet = new Set(itemIds.filter(Boolean));
  if (removeSet.size === 0) {
    return getLocalCachedRecentItems();
  }

  try {
    const existing = getLocalCachedRecentItems();
    const remaining = existing.filter((it) => Boolean(it?.id) && !removeSet.has(it.id));

    const updatedAt = writeLocalRecentItemsEnvelope(remaining, {
      searchQuery: "",
      cleared: remaining.length === 0,
    });

    if (remaining.length === 0) {
      await postMessageToServiceWorkerWithAck({
        type: "CLEAR_OFFLINE_RECENT_ITEMS",
        removedIds: Array.from(removeSet),
        timestamp: updatedAt,
        updatedAt,
      });
    } else {
      const ack = await postMessageToServiceWorkerWithAck({
        type: "REMOVE_OFFLINE_RECENT_ITEMS",
        itemIds: Array.from(removeSet),
        remainingItems: remaining,
        timestamp: updatedAt,
        updatedAt,
      });
      if (!ack.acknowledged) {
        // Direct legacy SW fallback: clear and repopulate remaining items (no double-retry of REPLACE)
        await postMessageToServiceWorkerWithAck(
          { type: "CLEAR_OFFLINE_RECENT_ITEMS", timestamp: updatedAt, updatedAt },
          120
        );
        await postMessageToServiceWorkerWithAck(
          {
            type: "CACHE_RECENT_SEARCH_ITEMS",
            items: remaining,
            query: "",
            timestamp: updatedAt,
            updatedAt,
          },
          120
        );
      }
    }

    notifyRecentItemsListeners(remaining);
    return remaining;
  } catch (err) {
    console.warn("[RecentItemsOfflineService] Error removing deleted items from cache:", err);
    return [];
  }
}

/**
 * Clears both localStorage (recording explicit cleared timestamp marker) and Service Worker Cache Storage,
 * notifying all subscribed React views immediately.
 */
export async function clearOfflineRecentCache(): Promise<SwPostAckResult> {
  try {
    const updatedAt = writeLocalRecentItemsEnvelope([], {
      searchQuery: "",
      cleared: true,
    });

    const ack = await postMessageToServiceWorkerWithAck({
      type: "CLEAR_OFFLINE_RECENT_ITEMS",
      timestamp: updatedAt,
      updatedAt,
    });

    notifyRecentItemsListeners([]);
    return ack;
  } catch (err) {
    console.warn("[RecentItemsOfflineService] Error clearing offline recent cache:", err);
    return { acknowledged: false, success: false };
  }
}

/**
 * Synchronously retrieves cached items from localStorage
 */
export function getLocalCachedRecentItems(excludeIds?: ReadonlySet<string>): LostFoundItem[] {
  return readLocalRecentItemsEnvelope(excludeIds).items;
}

/**
 * Retrieves offline items reconciling Service Worker Cache and localStorage deterministically
 * by monotonic `updatedAt` timestamp (never letting an outdated SW overwrite fresher local data).
 */
export async function getOfflineRecentItems(
  excludeIds?: ReadonlySet<string>
): Promise<OfflineRecentItemsResult> {
  const localEnvelope = readLocalRecentItemsEnvelope(excludeIds);
  let swEnvelope: OfflineRecentCacheEnvelope | null = null;

  if (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    navigator.serviceWorker.controller
  ) {
    try {
      swEnvelope = await new Promise<OfflineRecentCacheEnvelope | null>((resolve) => {
        const timeout = setTimeout(() => {
          resolve(null);
        }, 1200);

        const channel = new MessageChannel();
        channel.port1.onmessage = (event) => {
          clearTimeout(timeout);
          if (event.data && event.data.type === "OFFLINE_RECENT_ITEMS_RESPONSE") {
            const data = event.data.data;
            if (data && Array.isArray(data.items)) {
              const swUpdatedAt = Number(data.updatedAt || data.cachedAt || 0);
              resolve({
                items: data.items,
                updatedAt: swUpdatedAt,
                timestamp: swUpdatedAt,
                cleared: Boolean(data.cleared),
                swVersion: event.data.swVersion || data.swVersion,
              });
              return;
            }
          }
          resolve(null);
        };

        navigator.serviceWorker.controller?.postMessage(
          { type: "GET_OFFLINE_RECENT_ITEMS" },
          [channel.port2]
        );
      });
    } catch (swErr) {
      console.warn("[RecentItemsOfflineService] SW channel query failed:", swErr);
    }
  }

  return reconcileOfflineRecentCacheSources({
    local: localEnvelope,
    sw: swEnvelope,
    excludeIds,
  });
}

/**
 * Caches a single item for offline preview (only when online and authoritative)
 */
export function cacheSingleItemPreview(
  item: LostFoundItem,
  options?: { isFromOfflineFallback?: boolean; authoritativeItemIds?: ReadonlySet<string> }
): void {
  if (options?.isFromOfflineFallback) return;
  if (!item || !item.id) return;
  if (options?.authoritativeItemIds && !options.authoritativeItemIds.has(item.id)) return;

  const sanitized = sanitizePublicItemProjection(item);
  cacheSearchedItems([sanitized], undefined, options);

  postMessageToServiceWorkerFireAndForget({
    type: "CACHE_SINGLE_ITEM_PREVIEW",
    item: sanitized,
    timestamp: nextMonotonicTimestamp(),
  });
}
