/**
 * Cross-Tab Coordination & Per-Item Mutual Exclusion for Catalog Operations
 *
 * Guarantees that syncOfflineQueue() and executeUnifiedItemDeletion() NEVER
 * operate concurrently on the same itemId across browser tabs or instances.
 *
 * Locking Strategy:
 * 1. Primary: Web Locks API (`navigator.locks.request`) scoped per itemId
 *    (`localiza_item_op_v1:${itemId}`). Automatically released by the browser
 *    on tab crash/close; bounded via AbortController timeout to avoid deadlocks.
 * 2. Fallback: Lease-based lock in `localStorage` (`localiza_item_lock_v1:${itemId}`)
 *    with unique owner token, verify-after-write ownership confirmation, lease TTL
 *    heartbeat renewal, and automatic abandoned-lock takeover after lease expiry.
 *
 * Lifecycle Events (BroadcastChannel + localStorage `storage` event fallback):
 * - ITEM_DELETION_STARTED
 * - ITEM_DELETION_CONFIRMED
 * - ITEM_DELETION_REJECTED
 * - OFFLINE_CACHE_UPDATED
 */

export const ITEM_LOCK_PREFIX = "localiza_item_op_v1:";
export const LS_LOCK_PREFIX = "localiza_item_lock_v1:";
export const CATALOG_SYNC_CHANNEL_NAME = "localiza_catalog_sync_v1";
export const CATALOG_SYNC_LS_EVENT_KEY = "localiza_catalog_sync_event_v1";

export type CatalogCrossTabEvent =
  | {
      type: "ITEM_DELETION_STARTED";
      itemIds: string[];
      operationId: string;
      tabId: string;
      timestamp: number;
    }
  | {
      type: "ITEM_DELETION_CONFIRMED";
      itemIds: string[];
      operationId: string;
      tabId: string;
      timestamp: number;
    }
  | {
      type: "ITEM_DELETION_REJECTED";
      itemIds: string[];
      operationId: string;
      definitive: boolean;
      tabId: string;
      timestamp: number;
    }
  | {
      type: "ITEMS_DELETED";
      itemIds: string[];
      operationId?: string;
      tabId: string;
      timestamp: number;
    }
  | {
      type: "OFFLINE_CACHE_UPDATED";
      updatedAt: number;
      count: number;
      cleared?: boolean;
      tabId: string;
      timestamp: number;
    };

export interface ItemLockOptions {
  /** Maximum time to wait to acquire the lock before failing (prevents deadlocks). Default: 12000ms. */
  timeoutMs?: number;
  /** Lease TTL for localStorage fallback (abandoned lock recovery). Default: 8000ms. */
  leaseTtlMs?: number;
  /** Retry interval while waiting for fallback lease. Default: 35ms. */
  retryIntervalMs?: number;
  /** Optional explicit owner/tab identifier (useful for multi-instance testing). */
  ownerId?: string;
  /** Force localStorage fallback even if navigator.locks exists (useful for testing fallback). */
  forceStorageFallback?: boolean;
}

export class CrossTabLockTimeoutError extends Error {
  readonly code = "CROSS_TAB_LOCK_TIMEOUT";
  readonly itemId: string;

  constructor(itemId: string, timeoutMs: number) {
    super(
      `Tempo esgotado (${timeoutMs}ms) aguardando bloqueio exclusivo entre abas para o objeto #${itemId}.`
    );
    this.name = "CrossTabLockTimeoutError";
    this.itemId = itemId;
  }
}

interface StoredLease {
  ownerId: string;
  token: string;
  acquiredAt: number;
  expiresAt: number;
}

function generateUniqueId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

let cachedDefaultTabId: string | null = null;
export function getTabInstanceId(): string {
  if (!cachedDefaultTabId) {
    cachedDefaultTabId = generateUniqueId("tab");
  }
  return cachedDefaultTabId;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readLease(storageKey: string): StoredLease | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.ownerId === "string" &&
      typeof parsed.token === "string" &&
      typeof parsed.expiresAt === "number"
    ) {
      return parsed as StoredLease;
    }
    return null;
  } catch {
    return null;
  }
}

function writeLease(storageKey: string, lease: StoredLease): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    localStorage.setItem(storageKey, JSON.stringify(lease));
    return true;
  } catch {
    return false;
  }
}

function releaseLease(storageKey: string, ownerId: string, token: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    const current = readLease(storageKey);
    if (current && current.ownerId === ownerId && current.token === token) {
      localStorage.removeItem(storageKey);
    }
  } catch {
    // Best-effort cleanup
  }
}

// Per-process in-memory queue as a final safety belt (and deterministic ordering within the same JS context)
const inProcessMutexChains = new Map<string, Promise<void>>();

async function withInProcessItemMutex<T>(
  lockKey: string,
  timeoutMs: number,
  fn: () => Promise<T>
): Promise<T> {
  const prevChain = inProcessMutexChains.get(lockKey) ?? Promise.resolve();
  let releaseCurrent!: () => void;
  const currentGate = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });

  const nextChain = prevChain.catch(() => {}).then(() => currentGate);
  inProcessMutexChains.set(lockKey, nextChain);

  let timedOut = false;
  const waitPromise = prevChain.catch(() => {});
  const timeoutPromise = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      timedOut = true;
      reject(new CrossTabLockTimeoutError(lockKey, timeoutMs));
    }, timeoutMs);
    waitPromise.finally(() => clearTimeout(timer));
  });

  try {
    await Promise.race([waitPromise, timeoutPromise]);
  } catch (err) {
    // Release our turn in the chain immediately so we never block subsequent waiters
    releaseCurrent();
    if (inProcessMutexChains.get(lockKey) === nextChain) {
      inProcessMutexChains.delete(lockKey);
    }
    throw err;
  }

  if (timedOut) {
    releaseCurrent();
    throw new CrossTabLockTimeoutError(lockKey, timeoutMs);
  }

  try {
    return await fn();
  } finally {
    releaseCurrent();
    if (inProcessMutexChains.get(lockKey) === nextChain) {
      inProcessMutexChains.delete(lockKey);
    }
  }
}

/**
 * Acquires a lease-based lock in localStorage with verify-after-write confirmation,
 * automatic lease renewal while executing, and abandoned-lock recovery after lease expiry.
 */
async function runWithLocalStorageLeaseLock<T>(
  itemId: string,
  options: Required<
    Pick<ItemLockOptions, "timeoutMs" | "leaseTtlMs" | "retryIntervalMs" | "ownerId">
  >,
  fn: () => Promise<T>
): Promise<T> {
  const storageKey = `${LS_LOCK_PREFIX}${itemId}`;
  const deadline = Date.now() + options.timeoutMs;
  const token = generateUniqueId("tok");

  let acquired = false;
  while (Date.now() <= deadline) {
    const now = Date.now();
    const existing = readLease(storageKey);

    if (!existing || existing.expiresAt <= now) {
      const candidate: StoredLease = {
        ownerId: options.ownerId,
        token,
        acquiredAt: now,
        expiresAt: now + options.leaseTtlMs,
      };
      if (writeLease(storageKey, candidate)) {
        // Brief verification delay to catch simultaneous cross-tab writes
        await sleep(Math.min(12, Math.max(4, Math.floor(options.retryIntervalMs / 3))));
        const verified = readLease(storageKey);
        if (verified && verified.ownerId === options.ownerId && verified.token === token) {
          acquired = true;
          break;
        }
      }
    }

    const jitter = Math.floor(Math.random() * 15);
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(options.retryIntervalMs + jitter, remaining));
  }

  if (!acquired) {
    throw new CrossTabLockTimeoutError(itemId, options.timeoutMs);
  }

  // Heartbeat lease renewal while operation runs (prevents premature takeover on slow networks)
  const renewIntervalMs = Math.max(1000, Math.floor(options.leaseTtlMs / 2));
  const renewTimer = setInterval(() => {
    const current = readLease(storageKey);
    if (current && current.ownerId === options.ownerId && current.token === token) {
      writeLease(storageKey, {
        ...current,
        expiresAt: Date.now() + options.leaseTtlMs,
      });
    }
  }, renewIntervalMs);

  try {
    return await fn();
  } finally {
    clearInterval(renewTimer);
    releaseLease(storageKey, options.ownerId, token);
  }
}

/**
 * Executes `fn` while holding an exclusive cross-tab lock scoped to `itemId`.
 * Prefers `navigator.locks` when available; transparently falls back to a
 * lease-based `localStorage` mutex with abandoned-lock recovery and an in-process queue.
 */
export async function withCrossTabItemLock<T>(
  itemId: string,
  fn: () => Promise<T>,
  options: ItemLockOptions = {}
): Promise<T> {
  if (!itemId) {
    return fn();
  }

  const timeoutMs = options.timeoutMs ?? 12000;
  const leaseTtlMs = options.leaseTtlMs ?? 8000;
  const retryIntervalMs = options.retryIntervalMs ?? 35;
  const ownerId = options.ownerId || getTabInstanceId();
  const lockName = `${ITEM_LOCK_PREFIX}${itemId}`;

  const hasWebLocks =
    !options.forceStorageFallback &&
    typeof navigator !== "undefined" &&
    Boolean((navigator as any).locks) &&
    typeof (navigator as any).locks.request === "function";

  if (hasWebLocks) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (controller) {
      timer = setTimeout(() => {
        try {
          controller.abort();
        } catch (_) {}
      }, timeoutMs);
    }

    try {
      const lockRequestOpts: Record<string, any> = { mode: "exclusive" };
      if (controller) {
        lockRequestOpts.signal = controller.signal;
      }

      return await (navigator as any).locks.request(
        lockName,
        lockRequestOpts,
        async () => {
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          return await fn();
        }
      );
    } catch (err: any) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (err?.name === "AbortError" || controller?.signal?.aborted) {
        throw new CrossTabLockTimeoutError(itemId, timeoutMs);
      }
      // If Web Locks failed due to restricted iframe / security policy, fall through to storage lease
      const msg = String(err?.message || err);
      if (
        err?.name === "SecurityError" ||
        err?.name === "NotSupportedError" ||
        msg.includes("SecurityError") ||
        msg.includes("not supported")
      ) {
        // Fallback below
      } else {
        throw err;
      }
    }
  }

  // Fallback path: serialize within current JS context + coordinate across tabs via localStorage lease
  const hasStorage = typeof localStorage !== "undefined";
  if (hasStorage) {
    return withInProcessItemMutex(lockName, timeoutMs, () =>
      runWithLocalStorageLeaseLock(
        itemId,
        { timeoutMs, leaseTtlMs, retryIntervalMs, ownerId },
        fn
      )
    );
  }

  return withInProcessItemMutex(lockName, timeoutMs, fn);
}

/**
 * Cross-tab lifecycle event broadcaster & subscriber.
 * Uses BroadcastChannel when available and mirrors events to localStorage (`storage` event)
 * so sibling tabs receive deletion lifecycle signals even when BroadcastChannel is unavailable.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends any ? Omit<T, K> : never;

export type CatalogCrossTabEventInput = DistributiveOmit<
  CatalogCrossTabEvent,
  "tabId" | "timestamp"
> & {
  tabId?: string;
  timestamp?: number;
};

export function publishCatalogCrossTabEvent(
  event: CatalogCrossTabEventInput
): CatalogCrossTabEvent {
  const fullEvent = {
    ...event,
    tabId: event.tabId || getTabInstanceId(),
    timestamp: event.timestamp ?? Date.now(),
  } as CatalogCrossTabEvent;

  if (typeof BroadcastChannel !== "undefined") {
    try {
      const channel = new BroadcastChannel(CATALOG_SYNC_CHANNEL_NAME);
      channel.postMessage(fullEvent);
      channel.close();
    } catch (_) {}
  }

  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(
        CATALOG_SYNC_LS_EVENT_KEY,
        JSON.stringify({ ...fullEvent, _nonce: Math.random().toString(36).slice(2, 8) })
      );
    } catch (_) {}
  }

  return fullEvent;
}

export function subscribeCatalogCrossTabEvents(
  listener: (event: CatalogCrossTabEvent) => void,
  options?: { selfTabId?: string }
): () => void {
  const selfTabId = options?.selfTabId || getTabInstanceId();
  const seenEvents = new Set<string>();

  const dispatchOnce = (raw: any) => {
    if (!raw || typeof raw !== "object" || typeof raw.type !== "string") return;
    if (raw.tabId && raw.tabId === selfTabId) return;

    const dedupKey = `${raw.type}|${raw.operationId || ""}|${raw.timestamp || ""}|${Array.isArray(raw.itemIds) ? raw.itemIds.join(",") : ""}`;
    if (seenEvents.has(dedupKey)) return;
    seenEvents.add(dedupKey);
    if (seenEvents.size > 200) {
      const oldest = seenEvents.values().next().value;
      if (oldest) seenEvents.delete(oldest);
    }

    try {
      listener(raw as CatalogCrossTabEvent);
    } catch (_) {}
  };

  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== "undefined") {
    try {
      channel = new BroadcastChannel(CATALOG_SYNC_CHANNEL_NAME);
      channel.onmessage = (ev) => dispatchOnce(ev?.data);
    } catch (_) {}
  }

  const handleStorage = (ev: StorageEvent) => {
    if (ev.key !== CATALOG_SYNC_LS_EVENT_KEY || !ev.newValue) return;
    try {
      const parsed = JSON.parse(ev.newValue);
      dispatchOnce(parsed);
    } catch (_) {}
  };

  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("storage", handleStorage);
  }

  return () => {
    try {
      channel?.close();
    } catch (_) {}
    if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
      window.removeEventListener("storage", handleStorage);
    }
  };
}
