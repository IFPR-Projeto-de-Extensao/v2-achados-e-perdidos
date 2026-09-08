import { LostFoundItem } from "../types";

/**
 * Service for caching and retrieving recently searched items for offline preview.
 * Integrates with Service Worker (sw-custom.js) via postMessage / MessageChannel
 * and maintains a robust localStorage fallback.
 */

const STORAGE_KEY_RECENT_ITEMS = "localiza_recent_searched_items";
const MAX_CACHED_ITEMS = 30;

export interface OfflineRecentItemsResult {
  items: LostFoundItem[];
  count: number;
  source: "service-worker" | "local-storage" | "memory";
  cachedAt: number;
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
 * Saves recently searched or viewed items to local cache and posts to Service Worker
 */
export async function cacheSearchedItems(
  newItems: LostFoundItem[],
  searchQuery?: string
): Promise<void> {
  if (!newItems || newItems.length === 0) return;

  try {
    // 1. Load existing items from localStorage
    const existing = getLocalCachedRecentItems();

    // 2. Merge items by ID, placing the newest items first
    const itemMap = new Map<string, LostFoundItem>();

    // Add new items first
    newItems.forEach((item) => {
      if (item && item.id) {
        itemMap.set(item.id, item);
      }
    });

    // Add previous items
    existing.forEach((item) => {
      if (item && item.id && !itemMap.has(item.id)) {
        itemMap.set(item.id, item);
      }
    });

    const mergedList = Array.from(itemMap.values()).slice(0, MAX_CACHED_ITEMS);

    // 3. Save to localStorage
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(
        STORAGE_KEY_RECENT_ITEMS,
        JSON.stringify({
          items: mergedList,
          timestamp: Date.now(),
          query: searchQuery || "",
        })
      );
    }

    // 4. Send to Service Worker if supported and active
    if (
      typeof navigator !== "undefined" &&
      "serviceWorker" in navigator &&
      navigator.serviceWorker.controller
    ) {
      navigator.serviceWorker.controller.postMessage({
        type: "CACHE_RECENT_SEARCH_ITEMS",
        items: mergedList,
        query: searchQuery || "",
        timestamp: Date.now(),
      });
    }
  } catch (err) {
    console.warn("[RecentItemsOfflineService] Error caching searched items:", err);
  }
}

/**
 * Synchronously retrieves cached items from localStorage
 */
export function getLocalCachedRecentItems(): LostFoundItem[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RECENT_ITEMS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed && Array.isArray(parsed.items)) {
      return parsed.items;
    }
    return [];
  } catch (err) {
    console.warn("[RecentItemsOfflineService] Error reading localStorage recent items:", err);
    return [];
  }
}

/**
 * Retrieves offline items prioritizing Service Worker Cache with localStorage fallback
 */
export async function getOfflineRecentItems(): Promise<OfflineRecentItemsResult> {
  const localItems = getLocalCachedRecentItems();

  // Try querying the Service Worker via MessageChannel
  if (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    navigator.serviceWorker.controller
  ) {
    try {
      const swItems = await new Promise<OfflineRecentItemsResult | null>((resolve) => {
        const timeout = setTimeout(() => {
          resolve(null);
        }, 1200);

        const channel = new MessageChannel();
        channel.port1.onmessage = (event) => {
          clearTimeout(timeout);
          if (event.data && event.data.type === "OFFLINE_RECENT_ITEMS_RESPONSE") {
            const data = event.data.data;
            if (data && Array.isArray(data.items)) {
              resolve({
                items: data.items,
                count: data.items.length,
                source: "service-worker",
                cachedAt: data.cachedAt || Date.now(),
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

      if (swItems && swItems.items.length > 0) {
        return swItems;
      }
    } catch (swErr) {
      console.warn("[RecentItemsOfflineService] SW channel query failed:", swErr);
    }
  }

  // Fallback to localStorage
  return {
    items: localItems,
    count: localItems.length,
    source: "local-storage",
    cachedAt: Date.now(),
  };
}

/**
 * Caches a single item for offline preview
 */
export function cacheSingleItemPreview(item: LostFoundItem): void {
  if (!item || !item.id) return;
  cacheSearchedItems([item]);

  if (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    navigator.serviceWorker.controller
  ) {
    navigator.serviceWorker.controller.postMessage({
      type: "CACHE_SINGLE_ITEM_PREVIEW",
      item,
      timestamp: Date.now(),
    });
  }
}
