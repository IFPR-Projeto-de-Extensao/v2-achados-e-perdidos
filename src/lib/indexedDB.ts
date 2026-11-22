// IndexedDB Persistence Layer for RNF02 (Fast system & Offline capability)
// Includes dedicated sync-queue for offline user registration requests
// and persistent deletion tombstones to prevent offline-queue resurrection.
//
// HARDENING (ACHADO-02, ACHADO-06, ACHADO-07):
// - Tombstone persistence errors (QuotaExceededError, AbortError, open failure) are propagated explicitly.
// - Cross-tab localStorage mirror is sharded per itemId (`localiza_tombstone_v2:${itemId}`) so
//   concurrent writes from different tabs NEVER overwrite each other.
// - Single-item tombstone checks avoid unnecessary full sync_queue_store scans.
// - Tombstones with status PENDING_DELETE or REMOTE_UNKNOWN (or with pending queue entries) are NEVER pruned.
// - Authoritative empty catalog updates preserve legitimate offline-queued items not protected by tombstones.
import { LostFoundItem, SyncQueueEntry } from "../types";
import { calculatePayloadSizeBytes } from "./payloadSizeGuard";
import { sanitizePublicItemProjection } from "./itemPrivacyUtils";

const DB_NAME = "IFPRAchadosPerdidosDB";
const DB_VERSION = 3;
const STORE_ITEMS = "items_store";
const STORE_ERRORS = "errors_offline_store";
const STORE_SYNC_QUEUE = "sync_queue_store";
const STORE_DELETED_TOMBSTONES = "deleted_item_tombstones";

// Default retention window for deletion tombstones: 30 days.
// Expired tombstones are NEVER pruned while a pending sync_queue entry exists OR while status is PENDING_DELETE / REMOTE_UNKNOWN.
export const DEFAULT_TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type DeletionTombstoneReason =
  | "LOCAL_DELETE"
  | "BULK_DELETE"
  | "OFFLINE_DELETE"
  | "REMOTE_DELETE"
  | "SYSTEM_RESET";

export type DeletionTombstoneStatus =
  | "PENDING_DELETE"
  | "CONFIRMED_DELETED"
  | "REMOTE_UNKNOWN";

export interface DeletedItemTombstone {
  itemId: string;
  deletedAt: string;
  expiresAt: number;
  reason: DeletionTombstoneReason;
  deletedByUserId?: string;
  status?: DeletionTombstoneStatus;
  operationId?: string;
  updatedAt?: number;
}

export class TombstonePersistenceError extends Error {
  readonly code: string;
  readonly causeError?: unknown;

  constructor(message: string, code = "TOMBSTONE_PERSISTENCE_FAILED", causeError?: unknown) {
    super(message);
    this.name = "TombstonePersistenceError";
    this.code = code;
    this.causeError = causeError;
  }
}

// Per-item sharded localStorage mirror eliminates cross-tab read-modify-write overwrites
const TOMBSTONE_LS_ITEM_PREFIX = "localiza_tombstone_v2:";
// Legacy array key retained only for backward-compatible reading & migration
const TOMBSTONE_LS_LEGACY_KEY = "localiza_deleted_item_tombstones_v1";

function getStatusPrecedence(status?: DeletionTombstoneStatus): number {
  if (status === "CONFIRMED_DELETED") return 3;
  if (status === "REMOTE_UNKNOWN") return 2;
  if (status === "PENDING_DELETE") return 1;
  // Legacy records without explicit status were written post-confirmation
  return 3;
}

function mergeTombstoneRecords(
  existing: DeletedItemTombstone | undefined,
  incoming: DeletedItemTombstone,
  options?: { preserveExplicitExpiry?: boolean }
): DeletedItemTombstone {
  if (!existing) return incoming;
  const existingUpdated = existing.updatedAt ?? Date.parse(existing.deletedAt || "") ?? 0;
  const incomingUpdated = incoming.updatedAt ?? Date.parse(incoming.deletedAt || "") ?? 0;

  // Never downgrade an already CONFIRMED_DELETED record back to PENDING_DELETE
  if (
    getStatusPrecedence(existing.status) === 3 &&
    getStatusPrecedence(incoming.status) < 3
  ) {
    return existing;
  }

  if (incomingUpdated >= existingUpdated) {
    return {
      ...existing,
      ...incoming,
      expiresAt: options?.preserveExplicitExpiry
        ? incoming.expiresAt
        : Math.max(existing.expiresAt, incoming.expiresAt),
    };
  }
  return existing;
}

function readShardedLocalStorageTombstone(itemId: string): DeletedItemTombstone | null {
  if (typeof localStorage === "undefined" || !itemId) return null;
  try {
    const raw = localStorage.getItem(`${TOMBSTONE_LS_ITEM_PREFIX}${itemId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.itemId === itemId) {
        return parsed as DeletedItemTombstone;
      }
    }
    // Check legacy array mirror as fallback
    const legacyRaw = localStorage.getItem(TOMBSTONE_LS_LEGACY_KEY);
    if (legacyRaw) {
      const legacyArr = JSON.parse(legacyRaw);
      if (Array.isArray(legacyArr)) {
        const match = legacyArr.find((t: any) => t && t.itemId === itemId);
        if (match) return match as DeletedItemTombstone;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function readAllLocalStorageTombstonesMirror(): DeletedItemTombstone[] {
  if (typeof localStorage === "undefined") return [];
  const merged = new Map<string, DeletedItemTombstone>();

  try {
    // 1. Legacy array mirror (if present)
    const legacyRaw = localStorage.getItem(TOMBSTONE_LS_LEGACY_KEY);
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw);
      if (Array.isArray(parsed)) {
        for (const t of parsed) {
          if (t && t.itemId) {
            merged.set(t.itemId, mergeTombstoneRecords(merged.get(t.itemId), t));
          }
        }
      }
    }
  } catch {
    // Ignore malformed legacy entry
  }

  try {
    // 2. Per-item sharded keys (atomic per itemId across tabs)
    const keyCount = typeof localStorage.length === "number" ? localStorage.length : 0;
    for (let i = 0; i < keyCount; i++) {
      const key = typeof localStorage.key === "function" ? localStorage.key(i) : null;
      if (!key || !key.startsWith(TOMBSTONE_LS_ITEM_PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as DeletedItemTombstone;
        if (parsed && parsed.itemId) {
          merged.set(parsed.itemId, mergeTombstoneRecords(merged.get(parsed.itemId), parsed));
        }
      } catch {
        // Ignore corrupted single key
      }
    }
  } catch {
    // Some minimal mocks may not implement key()/length; ignore safely
  }

  return Array.from(merged.values());
}

function writeShardedLocalStorageTombstones(
  records: DeletedItemTombstone[],
  options?: { preserveExplicitExpiry?: boolean }
): {
  ok: boolean;
  error?: unknown;
} {
  if (typeof localStorage === "undefined") {
    return { ok: false, error: new Error("localStorage indisponível.") };
  }
  try {
    for (const rec of records) {
      const existing = readShardedLocalStorageTombstone(rec.itemId);
      const merged = mergeTombstoneRecords(existing || undefined, rec, options);
      localStorage.setItem(`${TOMBSTONE_LS_ITEM_PREFIX}${rec.itemId}`, JSON.stringify(merged));
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err };
  }
}

function removeShardedLocalStorageTombstones(
  targets: Array<{ itemId: string; operationId?: string }>
): void {
  if (typeof localStorage === "undefined") return;
  for (const target of targets) {
    if (!target.itemId) continue;
    try {
      const key = `${TOMBSTONE_LS_ITEM_PREFIX}${target.itemId}`;
      if (target.operationId) {
        const existing = readShardedLocalStorageTombstone(target.itemId);
        if (existing && existing.operationId && existing.operationId !== target.operationId) {
          continue; // Never remove a tombstone owned by a different/newer operation
        }
        if (existing && existing.status === "CONFIRMED_DELETED") {
          continue; // Never roll back a confirmed deletion tombstone
        }
      }
      localStorage.removeItem(key);
    } catch {
      // Best-effort cleanup
    }
  }

  // Also clean matching entries from legacy array key if present
  try {
    const legacyRaw = localStorage.getItem(TOMBSTONE_LS_LEGACY_KEY);
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw);
      if (Array.isArray(parsed)) {
        const removeIds = new Set(targets.map((t) => t.itemId));
        const remaining = parsed.filter((t: any) => t && t.itemId && !removeIds.has(t.itemId));
        if (remaining.length === 0) {
          localStorage.removeItem(TOMBSTONE_LS_LEGACY_KEY);
        } else {
          localStorage.setItem(TOMBSTONE_LS_LEGACY_KEY, JSON.stringify(remaining));
        }
      }
    }
  } catch {
    // Ignore legacy cleanup errors
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const idb =
      typeof indexedDB !== "undefined"
        ? indexedDB
        : typeof window !== "undefined" && "indexedDB" in window
        ? window.indexedDB
        : null;

    if (!idb) {
      reject(new Error("IndexedDB não disponível no navegador."));
      return;
    }

    try {
      const request = idb.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        try {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_ITEMS)) {
            db.createObjectStore(STORE_ITEMS, { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains(STORE_ERRORS)) {
            db.createObjectStore(STORE_ERRORS, { keyPath: "id", autoIncrement: true });
          }
          if (!db.objectStoreNames.contains(STORE_SYNC_QUEUE)) {
            const syncStore = db.createObjectStore(STORE_SYNC_QUEUE, { keyPath: "id" });
            syncStore.createIndex("status", "status", { unique: false });
            syncStore.createIndex("createdAt", "createdAt", { unique: false });
          }
          if (!db.objectStoreNames.contains(STORE_DELETED_TOMBSTONES)) {
            const tombStore = db.createObjectStore(STORE_DELETED_TOMBSTONES, { keyPath: "itemId" });
            tombStore.createIndex("expiresAt", "expiresAt", { unique: false });
          }
        } catch (upgradeErr) {
          reject(upgradeErr instanceof Error ? upgradeErr : new Error(String(upgradeErr)));
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Falha ao abrir IndexedDB."));
      request.onblocked = () => {
        console.warn("[IndexedDB] Abertura do banco bloqueada temporariamente.");
      };
    } catch (syncErr) {
      console.warn("[IndexedDB] Exceção síncrona ao acessar indexedDB.open (modo restrito/privado):", syncErr);
      reject(syncErr instanceof Error ? syncErr : new Error(String(syncErr)));
    }
  });
}

function classifyStorageErrorCode(err: unknown): string {
  const name = (err as any)?.name || "";
  const msg = String((err as any)?.message || err || "");
  if (name === "QuotaExceededError" || msg.includes("QuotaExceeded")) {
    return "QUOTA_EXCEEDED";
  }
  if (name === "AbortError" || msg.includes("Abort")) {
    return "TRANSACTION_ABORTED";
  }
  if (msg.includes("IndexedDB não disponível") || name === "SecurityError") {
    return "STORAGE_UNAVAILABLE";
  }
  return "TOMBSTONE_PERSISTENCE_FAILED";
}

// -------------------------------------------------------------
// ITEMS STORE (ETAPA 15: Strictly Sanitized Public Projections Only)
// -------------------------------------------------------------

export async function saveItemsToIndexedDB(items: LostFoundItem[]): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_ITEMS, "readwrite");
    const store = tx.objectStore(STORE_ITEMS);

    // Clear old records and save current sanitized public snapshot (supports empty array [])
    store.clear();
    for (const item of items) {
      if (item && item.id) {
        store.put(sanitizePublicItemProjection(item));
      }
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Erro na transação de items_store."));
      tx.onabort = () => reject(tx.error || new Error("Transação de items_store abortada."));
    });
  } catch (err) {
    console.warn("Aviso ao salvar itens no IndexedDB:", err);
  }
}

/**
 * Persists an authoritative catalog snapshot to IndexedDB while preserving any
 * legitimate pending offline-queued items that are NOT protected by tombstones or excludedIds.
 * Fixes ACHADO-07: prevents an empty remote snapshot from wiping pending offline registrations.
 */
export async function saveAuthoritativeItemsPreservingOfflineQueued(
  authoritativeItems: LostFoundItem[],
  excludedIds?: ReadonlySet<string>
): Promise<LostFoundItem[]> {
  const pendingEntries = await getPendingSyncQueue();
  const pendingItemIds = new Set(
    pendingEntries.map((e) => e.itemId || e.payload?.id).filter(Boolean) as string[]
  );
  const tombstones = await getActiveDeletedTombstoneIds(Date.now(), { pendingItemIds });

  const combinedMap = new Map<string, LostFoundItem>();
  for (const item of authoritativeItems || []) {
    if (!item || !item.id) continue;
    if (excludedIds?.has(item.id)) continue;
    combinedMap.set(item.id, sanitizePublicItemProjection(item));
  }

  for (const entry of pendingEntries) {
    if (entry.status === "ERRO_PERMANENTE") continue;
    const itemId = entry.itemId || entry.payload?.id;
    if (!itemId || combinedMap.has(itemId)) continue;
    if (tombstones.has(itemId) || excludedIds?.has(itemId)) continue;
    combinedMap.set(
      itemId,
      sanitizePublicItemProjection({
        ...entry.payload,
        id: itemId,
        isOfflineQueued: true,
      })
    );
  }

  const finalSnapshot = Array.from(combinedMap.values());
  await saveItemsToIndexedDB(finalSnapshot);
  return finalSnapshot;
}

export async function getItemsFromIndexedDB(): Promise<LostFoundItem[]> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_ITEMS, "readonly");
    const store = tx.objectStore(STORE_ITEMS);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () =>
        resolve(((request.result || []) as LostFoundItem[]).map((it) => sanitizePublicItemProjection(it)));
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn("Aviso ao carregar itens do IndexedDB:", err);
    return [];
  }
}

export async function saveSingleItemIndexedDB(item: LostFoundItem): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_ITEMS, "readwrite");
    const store = tx.objectStore(STORE_ITEMS);
    store.put(sanitizePublicItemProjection(item));

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Erro ao salvar item no IndexedDB."));
      tx.onabort = () => reject(tx.error || new Error("Transação de item individual abortada."));
    });
  } catch (err) {
    console.warn("Aviso ao salvar item individual no IndexedDB:", err);
  }
}

export async function deleteItemsFromIndexedDB(itemIds: string[]): Promise<void> {
  if (!itemIds || itemIds.length === 0) return;
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_ITEMS, "readwrite");
    const store = tx.objectStore(STORE_ITEMS);
    for (const id of itemIds) {
      if (id) {
        store.delete(id);
      }
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Erro ao remover itens do IndexedDB."));
      tx.onabort = () => reject(tx.error || new Error("Transação de remoção abortada."));
    });
  } catch (err) {
    console.warn("Aviso ao remover itens do IndexedDB:", err);
  }
}

export async function saveOfflineErrorLogIndexedDB(logData: any): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_ERRORS, "readwrite");
    const store = tx.objectStore(STORE_ERRORS);
    store.add({ ...logData, savedOfflineAt: new Date().toISOString() });
  } catch (err) {
    console.warn("Aviso ao salvar erro offline no IndexedDB:", err);
  }
}

// -------------------------------------------------------------
// DELETED ITEM TOMBSTONES STORE (Anti-Resurrection Guard)
// -------------------------------------------------------------

/**
 * Persists deletion tombstones durably into IndexedDB AND sharded per-item localStorage mirror.
 *
 * ACHADO-06 guarantee:
 * - Throws `TombstonePersistenceError` if IndexedDB persistence fails (QuotaExceededError,
 *   AbortError, open failure, etc.) so callers NEVER proceed believing protection was saved.
 * - Uses per-item localStorage keys (`localiza_tombstone_v2:${itemId}`) so concurrent tabs
 *   NEVER overwrite each other's tombstones.
 */
export async function saveDeletedItemTombstones(
  entries: Array<{
    itemId: string;
    reason: DeletionTombstoneReason;
    deletedByUserId?: string;
    ttlMs?: number;
    status?: DeletionTombstoneStatus;
    operationId?: string;
  }>
): Promise<DeletedItemTombstone[]> {
  if (!entries || entries.length === 0) return [];
  const now = Date.now();
  const isoNow = new Date(now).toISOString();

  const explicitExpiryIds = new Set<string>();
  const records: DeletedItemTombstone[] = entries
    .filter((e) => Boolean(e && e.itemId))
    .map((e) => {
      if (typeof e.ttlMs === "number") {
        explicitExpiryIds.add(e.itemId);
      }
      return {
        itemId: e.itemId,
        deletedAt: isoNow,
        expiresAt: now + (e.ttlMs ?? DEFAULT_TOMBSTONE_TTL_MS),
        reason: e.reason,
        deletedByUserId: e.deletedByUserId,
        status: e.status ?? "CONFIRMED_DELETED",
        operationId: e.operationId,
        updatedAt: now,
      };
    });

  if (records.length === 0) return [];

  // 1. Write to IndexedDB FIRST as primary durable store and propagate any real storage failure.
  let persistedRecords: DeletedItemTombstone[] = [];
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_DELETED_TOMBSTONES, "readwrite");
    const store = tx.objectStore(STORE_DELETED_TOMBSTONES);

    for (const rec of records) {
      const existingMirror = readShardedLocalStorageTombstone(rec.itemId);
      const merged = mergeTombstoneRecords(existingMirror || undefined, rec, {
        preserveExplicitExpiry: explicitExpiryIds.has(rec.itemId),
      });
      persistedRecords.push(merged);
      store.put(merged);
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error || new Error("Falha na transação de gravação de tombstones no IndexedDB."));
      tx.onabort = () =>
        reject(tx.error || new Error("Transação de gravação de tombstones no IndexedDB foi abortada."));
    });
  } catch (err) {
    const code = classifyStorageErrorCode(err);
    throw new TombstonePersistenceError(
      `Falha ao persistir proteção anti-ressurreição (tombstone) no armazenamento local (${code}): ${
        (err as any)?.message || String(err)
      }`,
      code,
      err
    );
  }

  // 2. Mirror atomically per itemId into localStorage for immediate cross-tab visibility.
  // If localStorage hits QuotaExceededError, surface explicit error if mirror is required for cross-tab consistency.
  const mirrorRes = writeShardedLocalStorageTombstones(persistedRecords, {
    preserveExplicitExpiry: explicitExpiryIds.size > 0,
  });
  if (!mirrorRes.ok && typeof localStorage !== "undefined") {
    const mirrorCode = classifyStorageErrorCode(mirrorRes.error);
    if (mirrorCode === "QUOTA_EXCEEDED") {
      throw new TombstonePersistenceError(
        `Espaço insuficiente no armazenamento local (localStorage) para espelhar proteção anti-ressurreição (${mirrorCode}).`,
        mirrorCode,
        mirrorRes.error
      );
    }
  }

  return persistedRecords;
}

/**
 * Removes tombstones ONLY when a deletion was definitively rejected (e.g. authorization denied)
 * AND the stored tombstone still belongs to the same operationId and is NOT CONFIRMED_DELETED.
 */
export async function removeDeletedItemTombstones(
  targets: Array<{ itemId: string; operationId?: string }>
): Promise<number> {
  const validTargets = (targets || []).filter((t) => Boolean(t && t.itemId));
  if (validTargets.length === 0) return 0;

  let removedCount = 0;

  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_DELETED_TOMBSTONES, "readwrite");
    const store = tx.objectStore(STORE_DELETED_TOMBSTONES);

    const existingReq = store.getAll();
    await new Promise<void>((resolve, reject) => {
      existingReq.onsuccess = () => {
        const all = (existingReq.result || []) as DeletedItemTombstone[];
        const byId = new Map<string, DeletedItemTombstone>();
        for (const rec of all) {
          if (rec && rec.itemId) byId.set(rec.itemId, rec);
        }

        for (const target of validTargets) {
          const existing = byId.get(target.itemId);
          if (!existing) continue;
          if (existing.status === "CONFIRMED_DELETED") continue;
          if (
            target.operationId &&
            existing.operationId &&
            existing.operationId !== target.operationId
          ) {
            continue;
          }
          store.delete(target.itemId);
          removedCount++;
        }
      };
      existingReq.onerror = () => reject(existingReq.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Erro ao remover tombstone."));
      tx.onabort = () => reject(tx.error || new Error("Remoção de tombstone abortada."));
    });
  } catch (err) {
    console.warn("Aviso ao reverter tombstone de exclusão rejeitada no IndexedDB:", err);
  }

  removeShardedLocalStorageTombstones(validTargets);
  return removedCount;
}

export async function getDeletedItemTombstones(): Promise<DeletedItemTombstone[]> {
  const mirrorList = readAllLocalStorageTombstonesMirror();
  const merged = new Map<string, DeletedItemTombstone>();
  for (const t of mirrorList) {
    if (t && t.itemId) {
      merged.set(t.itemId, mergeTombstoneRecords(merged.get(t.itemId), t));
    }
  }

  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_DELETED_TOMBSTONES, "readonly");
    const store = tx.objectStore(STORE_DELETED_TOMBSTONES);
    const req = store.getAll();

    const idbList = await new Promise<DeletedItemTombstone[]>((resolve, reject) => {
      req.onsuccess = () => resolve((req.result || []) as DeletedItemTombstone[]);
      req.onerror = () => reject(req.error);
    });

    for (const t of idbList) {
      if (t && t.itemId) {
        merged.set(t.itemId, mergeTombstoneRecords(merged.get(t.itemId), t));
      }
    }
  } catch (err) {
    console.warn("Aviso ao ler tombstones de exclusão do IndexedDB:", err);
  }

  return Array.from(merged.values());
}

export async function getDeletedItemTombstone(
  itemId: string
): Promise<DeletedItemTombstone | null> {
  if (!itemId) return null;
  const mirror = readShardedLocalStorageTombstone(itemId);
  let idbRecord: DeletedItemTombstone | null = null;

  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_DELETED_TOMBSTONES, "readonly");
    const store = tx.objectStore(STORE_DELETED_TOMBSTONES);
    const req = store.get(itemId);

    idbRecord = await new Promise<DeletedItemTombstone | null>((resolve, reject) => {
      req.onsuccess = () => resolve((req.result as DeletedItemTombstone | undefined) || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn(`Aviso ao consultar tombstone individual #${itemId} no IndexedDB:`, err);
  }

  if (mirror && idbRecord) {
    return mergeTombstoneRecords(mirror, idbRecord);
  }
  return idbRecord || mirror || null;
}

function isTombstoneProtectedRegardlessOfClock(t: DeletedItemTombstone): boolean {
  return t.status === "PENDING_DELETE" || t.status === "REMOTE_UNKNOWN";
}

export async function getActiveDeletedTombstoneIds(
  nowMs: number = Date.now(),
  options?: { pendingItemIds?: ReadonlySet<string> }
): Promise<Set<string>> {
  const all = await getDeletedItemTombstones();
  if (all.length === 0) return new Set();

  // Only scan sync_queue_store if there is at least one expired CONFIRMED_DELETED tombstone
  // AND the caller did not already provide pendingItemIds.
  const needsQueueScan =
    !options?.pendingItemIds &&
    all.some(
      (t) =>
        Boolean(t?.itemId) &&
        !isTombstoneProtectedRegardlessOfClock(t) &&
        t.expiresAt <= nowMs
    );

  let pendingItemIds: ReadonlySet<string> = options?.pendingItemIds ?? new Set<string>();
  if (needsQueueScan) {
    const pendingQueue = await getPendingSyncQueue();
    pendingItemIds = new Set(
      pendingQueue.map((e) => e.itemId || e.payload?.id).filter(Boolean) as string[]
    );
  }

  const active = new Set<string>();
  for (const t of all) {
    if (!t || !t.itemId) continue;
    if (
      t.expiresAt > nowMs ||
      isTombstoneProtectedRegardlessOfClock(t) ||
      pendingItemIds.has(t.itemId)
    ) {
      active.add(t.itemId);
    }
  }
  return active;
}

/**
 * Checks whether `itemId` currently has an active deletion tombstone.
 * Uses direct O(1) key lookup in IndexedDB + sharded localStorage mirror and avoids
 * scanning `sync_queue_store` unless the tombstone is expired on the wall clock.
 */
export async function hasActiveDeletedTombstone(
  itemId: string,
  nowMs: number = Date.now(),
  options?: { pendingItemIds?: ReadonlySet<string> }
): Promise<boolean> {
  if (!itemId) return false;
  const record = await getDeletedItemTombstone(itemId);
  if (!record) return false;

  if (record.expiresAt > nowMs || isTombstoneProtectedRegardlessOfClock(record)) {
    return true;
  }

  if (options?.pendingItemIds) {
    return options.pendingItemIds.has(itemId);
  }

  const queuedEntry = await getSyncQueueEntryByItemId(itemId);
  return Boolean(queuedEntry);
}

/**
 * Safely prunes expired CONFIRMED_DELETED tombstones ONLY when no pending sync_queue entry
 * exists for that itemId. Tombstones with status PENDING_DELETE or REMOTE_UNKNOWN are NEVER pruned.
 */
export async function pruneExpiredTombstones(nowMs: number = Date.now()): Promise<number> {
  const all = await getDeletedItemTombstones();
  if (all.length === 0) return 0;

  const hasExpiredCandidate = all.some(
    (t) =>
      Boolean(t?.itemId) &&
      !isTombstoneProtectedRegardlessOfClock(t) &&
      t.expiresAt <= nowMs
  );
  if (!hasExpiredCandidate) return 0;

  const pendingQueue = await getPendingSyncQueue();
  const pendingItemIds = new Set(
    pendingQueue.map((e) => e.itemId || e.payload?.id).filter(Boolean) as string[]
  );

  const toDeleteIds: string[] = [];

  for (const t of all) {
    if (!t || !t.itemId) continue;
    if (isTombstoneProtectedRegardlessOfClock(t)) continue;
    const isExpired = t.expiresAt <= nowMs;
    const hasPendingQueueOp = pendingItemIds.has(t.itemId);
    if (isExpired && !hasPendingQueueOp) {
      toDeleteIds.push(t.itemId);
    }
  }

  if (toDeleteIds.length === 0) return 0;

  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_DELETED_TOMBSTONES, "readwrite");
    const store = tx.objectStore(STORE_DELETED_TOMBSTONES);
    for (const id of toDeleteIds) {
      store.delete(id);
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Erro ao limpar tombstones expirados."));
      tx.onabort = () => reject(tx.error || new Error("Limpeza de tombstones abortada."));
    });
  } catch (err) {
    console.warn("Aviso ao limpar tombstones expirados do IndexedDB:", err);
    return 0;
  }

  // Only remove sharded localStorage mirrors for the exact pruned IDs (never clobbering other tabs)
  removeShardedLocalStorageTombstones(toDeleteIds.map((itemId) => ({ itemId })));
  return toDeleteIds.length;
}

// -------------------------------------------------------------
// SYNC QUEUE STORE (Offline User Registration Requests)
// -------------------------------------------------------------

export const getUploadTaskId = (itemId: string): string => `task-${itemId}`;

export async function queueOfflineItemRegistration(
  item: LostFoundItem,
  initialOptions?: Partial<Omit<SyncQueueEntry, "id" | "type" | "payload" | "createdAt">>
): Promise<SyncQueueEntry> {
  const byteSize = initialOptions?.payloadSizeBytes ?? calculatePayloadSizeBytes(item);
  const resolvedItemId = item.id;

  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_SYNC_QUEUE, "readwrite");
    const store = tx.objectStore(STORE_SYNC_QUEUE);

    // Check if an entry for the same itemId already exists in the queue to prevent duplicates
    const allEntriesReq = store.getAll();

    return new Promise((resolve, reject) => {
      allEntriesReq.onsuccess = () => {
        const existingEntries = (allEntriesReq.result || []) as SyncQueueEntry[];
        const existing = existingEntries.find(
          (e) => (e.itemId && e.itemId === resolvedItemId) || (e.payload && e.payload.id === resolvedItemId)
        );

        const entryId = existing?.id || `queue-${resolvedItemId}`;

        const queueEntry: SyncQueueEntry = {
          id: entryId,
          itemId: resolvedItemId,
          type: "REGISTER_ITEM",
          payload: {
            ...item,
            id: resolvedItemId,
            isOfflineQueued: true,
          },
          createdAt: existing?.createdAt || new Date().toISOString(),
          status: initialOptions?.status || existing?.status || "PENDENTE",
          attempts: initialOptions?.attempts ?? existing?.attempts ?? 0,
          lastAttempt: initialOptions?.lastAttempt || existing?.lastAttempt,
          error: initialOptions?.error ?? existing?.error,
          errorType: initialOptions?.errorType ?? existing?.errorType,
          payloadSizeBytes: byteSize,
        };

        store.put(queueEntry);

        // Only persist transient/pending items into local items_store so permanent/permission-denied failures never leak into the catalog on reload
        if (queueEntry.status !== "ERRO_PERMANENTE") {
          saveSingleItemIndexedDB(queueEntry.payload).catch(() => {});
        }

        tx.oncomplete = () => {
          console.log(
            `[Offline Sync] Cadastro de objeto "${item.title}" (${resolvedItemId}) salvo deterministicamente na fila IndexedDB (${byteSize} bytes):`,
            queueEntry.id
          );
          resolve(queueEntry);
        };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("Transação de fila offline abortada."));
      };
      allEntriesReq.onerror = () => reject(allEntriesReq.error);
    });
  } catch (err) {
    console.error("Erro ao salvar cadastro na fila IndexedDB:", err);
    const fallbackEntry: SyncQueueEntry = {
      id: `queue-${resolvedItemId}`,
      itemId: resolvedItemId,
      type: "REGISTER_ITEM",
      payload: { ...item, isOfflineQueued: true },
      createdAt: new Date().toISOString(),
      status: initialOptions?.status || "PENDENTE",
      attempts: 0,
      payloadSizeBytes: byteSize,
    };
    return fallbackEntry;
  }
}

export async function getPendingSyncQueue(): Promise<SyncQueueEntry[]> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_SYNC_QUEUE, "readonly");
    const store = tx.objectStore(STORE_SYNC_QUEUE);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const all = (request.result || []) as SyncQueueEntry[];
        // Normalize legacy entries to ensure itemId is always populated
        const normalized = all.map((entry) => ({
          ...entry,
          itemId:
            entry.itemId ||
            entry.payload?.id ||
            (typeof entry.id === "string"
              ? entry.id.replace(/^queue-/, "")
              : String(entry.id || "legacy")),
        }));
        // Sort by creation date
        normalized.sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        resolve(normalized);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn("Aviso ao ler fila de sincronização IndexedDB:", err);
    return [];
  }
}

export async function getSyncQueueEntryByItemId(
  itemId: string
): Promise<SyncQueueEntry | null> {
  if (!itemId) return null;
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_SYNC_QUEUE, "readonly");
    const store = tx.objectStore(STORE_SYNC_QUEUE);
    // Fast direct lookup by canonical key `queue-${itemId}` first
    const directReq = store.get(`queue-${itemId}`);
    const directResult = await new Promise<SyncQueueEntry | undefined>((resolve, reject) => {
      directReq.onsuccess = () => resolve(directReq.result as SyncQueueEntry | undefined);
      directReq.onerror = () => reject(directReq.error);
    });
    if (directResult) {
      return {
        ...directResult,
        itemId: directResult.itemId || directResult.payload?.id || itemId,
      };
    }
  } catch {
    // Fall back to full scan below for legacy keys
  }

  const all = await getPendingSyncQueue();
  return (
    all.find(
      (entry) =>
        entry.itemId === itemId ||
        entry.payload?.id === itemId ||
        entry.id === `queue-${itemId}` ||
        entry.id === itemId
    ) || null
  );
}

export async function getSyncQueueCount(): Promise<number> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_SYNC_QUEUE, "readonly");
    const store = tx.objectStore(STORE_SYNC_QUEUE);
    const countReq = store.count();

    return new Promise((resolve) => {
      countReq.onsuccess = () => resolve(countReq.result || 0);
      countReq.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}

export async function removeSyncQueueEntry(id: string): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_SYNC_QUEUE, "readwrite");
    const store = tx.objectStore(STORE_SYNC_QUEUE);
    store.delete(id);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Remoção da fila abortada."));
    });
  } catch (err) {
    console.warn("Aviso ao remover entrada da fila de sincronização:", err);
  }
}

export async function removeSyncQueueEntryByItemId(itemId: string): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_SYNC_QUEUE, "readwrite");
    const store = tx.objectStore(STORE_SYNC_QUEUE);
    const allReq = store.getAll();

    return new Promise((resolve, reject) => {
      allReq.onsuccess = () => {
        const all = (allReq.result || []) as SyncQueueEntry[];
        for (const entry of all) {
          if (
            entry.itemId === itemId ||
            entry.payload?.id === itemId ||
            entry.id === `queue-${itemId}` ||
            entry.id === itemId
          ) {
            store.delete(entry.id);
          }
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("Remoção por itemId abortada."));
      };
      allReq.onerror = () => reject(allReq.error);
    });
  } catch (err) {
    console.warn("Aviso ao remover entrada da fila por itemId:", err);
  }
}

export async function updateSyncQueueEntry(
  id: string,
  updates: Partial<SyncQueueEntry>
): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_SYNC_QUEUE, "readwrite");
    const store = tx.objectStore(STORE_SYNC_QUEUE);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const existing = getReq.result as SyncQueueEntry | undefined;
      if (existing) {
        store.put({ ...existing, ...updates, id });
      }
    };

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Atualização da fila abortada."));
    });
  } catch (err) {
    console.warn("Aviso ao atualizar entrada na fila de sincronização:", err);
  }
}

export async function clearSyncQueue(): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_SYNC_QUEUE, "readwrite");
    const store = tx.objectStore(STORE_SYNC_QUEUE);
    store.clear();

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Limpeza da fila abortada."));
    });
  } catch (err) {
    console.warn("Aviso ao limpar fila de sincronização:", err);
  }
}
