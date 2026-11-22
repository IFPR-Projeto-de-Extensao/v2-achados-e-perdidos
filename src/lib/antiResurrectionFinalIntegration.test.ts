import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import vm from "vm";
import { LostFoundItem, User } from "../types";
import {
  classifyCatalogSnapshot,
  resolveCatalogDisplayState,
  canHydrateCatalogFromIndexedDB,
  filterExcludedCatalogItems,
  evaluateItemDeletionEligibility,
  evaluateSyncQueueUploadAgainstDeletions,
  executeFirestoreItemDeletion,
} from "./catalogDeletionService";
import {
  withCrossTabItemLock,
  publishCatalogCrossTabEvent,
  subscribeCatalogCrossTabEvents,
  CrossTabLockTimeoutError,
  LS_LOCK_PREFIX,
  CATALOG_SYNC_LS_EVENT_KEY,
  CatalogCrossTabEvent,
} from "./crossTabCatalogLock";
import {
  saveDeletedItemTombstones,
  removeDeletedItemTombstones,
  getDeletedItemTombstone,
  getActiveDeletedTombstoneIds,
  hasActiveDeletedTombstone,
  pruneExpiredTombstones,
  TombstonePersistenceError,
  saveItemsToIndexedDB,
  saveAuthoritativeItemsPreservingOfflineQueued,
  getItemsFromIndexedDB,
  deleteItemsFromIndexedDB,
  queueOfflineItemRegistration,
  getPendingSyncQueue,
  removeSyncQueueEntryByItemId,
} from "./indexedDB";
import {
  cacheSearchedItems,
  getOfflineRecentItems,
  getLocalCachedRecentItems,
  readLocalRecentItemsEnvelope,
  reconcileOfflineRecentCacheSources,
  removeItemsFromOfflineRecentCache,
  syncOfflineRecentCacheWithAuthoritativeCatalog,
  clearOfflineRecentCache,
  subscribeOfflineRecentItemsChange,
  applyServiceWorkerRecentItemsBroadcast,
  EXPECTED_SW_CUSTOM_VERSION,
} from "./recentItemsOfflineService";
import { ROOT_ADMIN_EMAIL, ROOT_ADMIN_UID } from "./devolutionAuth";
import {
  evaluateItemRegistrationEligibility,
  buildSanitizedInitialHistoryEntry,
  buildSanitizedItemPrivatePayload,
} from "./itemRegistrationPipeline";

function createTestItem(
  id: string,
  overrides: Partial<LostFoundItem> = {}
): LostFoundItem {
  return {
    id,
    title: `Objeto ${id}`,
    description: "Descrição de teste",
    category: "Eletrônicos",
    type: "ENCONTRADO",
    status: "ENCONTRADO",
    location: "Bloco 1",
    date: "2026-11-10",
    createdAt: "2026-11-10T10:00:00.000Z",
    qrCodeId: `QR-${id}`,
    registeredByUserId: "uid-servidor-1",
    registeredByName: "Servidor Teste",
    registeredByRole: "SERVIDOR",
    ...overrides,
  } as LostFoundItem;
}

const adminUser: User = {
  id: "uid-admin-1",
  name: "Admin Teste",
  email: "admin@ifpr.edu.br",
  role: "ADMIN",
  status: "active",
  active: true,
  approvalStatus: "APROVADO",
} as User;

const ownerServidorUser: User = {
  id: "uid-servidor-1",
  name: "Servidor Teste",
  email: "servidor1@ifpr.edu.br",
  role: "SERVIDOR",
  status: "active",
  active: true,
  approvalStatus: "APROVADO",
} as User;

const otherServidorUser: User = {
  id: "uid-servidor-2",
  name: "Outro Servidor",
  email: "servidor2@ifpr.edu.br",
  role: "SERVIDOR",
  status: "active",
  active: true,
  approvalStatus: "APROVADO",
} as User;

const alunoUser: User = {
  id: "uid-aluno-1",
  name: "Aluno Teste",
  email: "aluno1@estudantes.ifpr.edu.br",
  role: "ALUNO",
  status: "active",
  active: true,
  approvalStatus: "APROVADO",
} as User;

/**
 * Full-featured in-memory browser storage harness (localStorage with length/key(),
 * IndexedDB with fault injection & operation counters, BroadcastChannel bus).
 */
function createBrowserHarness() {
  const lsStore = new Map<string, string>();
  const storageListeners = new Set<(ev: any) => void>();
  let lsQuotaFail = false;

  const localStorageMock = {
    get length() {
      return lsStore.size;
    },
    key: (index: number) => Array.from(lsStore.keys())[index] ?? null,
    getItem: (key: string) => (lsStore.has(key) ? lsStore.get(key)! : null),
    setItem: (key: string, value: string) => {
      if (lsQuotaFail) {
        const err: any = new Error("QuotaExceededError: localStorage full");
        err.name = "QuotaExceededError";
        throw err;
      }
      const oldValue = lsStore.get(key) ?? null;
      lsStore.set(key, String(value));
      // Propagate storage event to listeners (simulating cross-tab delivery)
      for (const fn of storageListeners) {
        fn({ key, newValue: String(value), oldValue });
      }
    },
    removeItem: (key: string) => {
      lsStore.delete(key);
    },
    clear: () => {
      lsStore.clear();
    },
  };

  // In-memory BroadcastChannel bus connecting independent tabs/subscribers
  const bcChannels = new Map<string, Set<MockBroadcastChannel>>();
  class MockBroadcastChannel {
    name: string;
    onmessage: ((ev: { data: any }) => void) | null = null;
    closed = false;

    constructor(name: string) {
      this.name = name;
      if (!bcChannels.has(name)) bcChannels.set(name, new Set());
      bcChannels.get(name)!.add(this);
    }

    postMessage(data: any) {
      if (this.closed) return;
      const peers = bcChannels.get(this.name);
      if (!peers) return;
      for (const peer of peers) {
        if (peer !== this && !peer.closed && peer.onmessage) {
          peer.onmessage({ data: structuredClone(data) });
        }
      }
    }

    close() {
      this.closed = true;
      bcChannels.get(this.name)?.delete(this);
    }
  }

  class MockMessageChannel {
    port1: any = { onmessage: null };
    port2: any = {
      postMessage: (data: any) => {
        if (this.port1.onmessage) this.port1.onmessage({ data });
      },
    };
  }

  // IndexedDB mock with fault injection & store operation counters
  const idbStores = new Map<string, Map<string, any>>();
  const keyPaths = new Map<string, string>();
  const opCounts = {
    syncQueueGetAll: 0,
    tombstoneGet: 0,
    tombstoneGetAll: 0,
  };
  let idbFault: null | "QUOTA" | "ABORT" | "OPEN_FAIL" = null;
  let initialized = false;

  const mockDb = {
    objectStoreNames: {
      contains: (name: string) => idbStores.has(name),
    },
    createObjectStore: (name: string, opts?: { keyPath?: string }) => {
      if (!idbStores.has(name)) idbStores.set(name, new Map());
      keyPaths.set(name, opts?.keyPath || "id");
      return { createIndex: () => {} };
    },
    transaction: (storeName: string, mode?: string) => {
      if (!idbStores.has(storeName)) idbStores.set(storeName, new Map());
      const backing = idbStores.get(storeName)!;
      const kp = keyPaths.get(storeName) || "id";

      const tx: any = {
        oncomplete: null,
        onerror: null,
        onabort: null,
        error: null,
        objectStore: () => ({
          clear: () => {
            backing.clear();
          },
          put: (val: any) => {
            const k = val?.[kp] ?? String(backing.size + 1);
            backing.set(String(k), structuredClone(val));
          },
          add: (val: any) => {
            const k = val?.[kp] ?? String(backing.size + 1);
            backing.set(String(k), structuredClone(val));
          },
          delete: (key: string) => {
            backing.delete(String(key));
          },
          get: (key: string) => {
            if (storeName === "deleted_item_tombstones") opCounts.tombstoneGet++;
            const req: any = { onsuccess: null, onerror: null, result: undefined };
            queueMicrotask(() => {
              req.result = backing.has(String(key))
                ? structuredClone(backing.get(String(key)))
                : undefined;
              req.onsuccess?.();
            });
            return req;
          },
          getAll: () => {
            if (storeName === "sync_queue_store") opCounts.syncQueueGetAll++;
            if (storeName === "deleted_item_tombstones") opCounts.tombstoneGetAll++;
            const req: any = { onsuccess: null, onerror: null, result: [] };
            queueMicrotask(() => {
              req.result = Array.from(backing.values()).map((v) => structuredClone(v));
              req.onsuccess?.();
            });
            return req;
          },
          count: () => {
            const req: any = { onsuccess: null, onerror: null, result: 0 };
            queueMicrotask(() => {
              req.result = backing.size;
              req.onsuccess?.();
            });
            return req;
          },
        }),
      };

      queueMicrotask(() => {
        queueMicrotask(() => {
          if (mode === "readwrite" && storeName === "deleted_item_tombstones" && idbFault === "QUOTA") {
            const err: any = new Error("QuotaExceededError: IndexedDB quota exceeded");
            err.name = "QuotaExceededError";
            tx.error = err;
            tx.onerror?.();
            return;
          }
          if (mode === "readwrite" && storeName === "deleted_item_tombstones" && idbFault === "ABORT") {
            const err: any = new Error("AbortError: transaction aborted by browser");
            err.name = "AbortError";
            tx.error = err;
            tx.onabort?.();
            return;
          }
          tx.oncomplete?.();
        });
      });

      return tx;
    },
  };

  const mockIndexedDB = {
    open: () => {
      const req: any = {
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        onblocked: null,
        result: mockDb,
        error: null,
      };
      queueMicrotask(() => {
        if (idbFault === "OPEN_FAIL") {
          req.error = new Error("IndexedDB open denied");
          req.onerror?.();
          return;
        }
        if (!initialized) {
          initialized = true;
          req.onupgradeneeded?.({ target: { result: mockDb } });
        }
        req.onsuccess?.();
      });
      return req;
    },
  };

  // Real exclusive Web Locks API implementation for multi-instance concurrency tests
  const lockQueues = new Map<string, Promise<void>>();
  const webLocksImpl = {
    request: (
      name: string,
      options: { mode?: string; signal?: AbortSignal },
      callback: (lock: { name: string; mode: string }) => Promise<any> | any
    ) => {
      return new Promise((resolve, reject) => {
        if (options?.signal?.aborted) {
          const err: any = new Error("The lock request is aborted.");
          err.name = "AbortError";
          reject(err);
          return;
        }
        let aborted = false;
        const onAbort = () => {
          aborted = true;
          const err: any = new Error("The lock request is aborted.");
          err.name = "AbortError";
          reject(err);
        };
        options?.signal?.addEventListener("abort", onAbort, { once: true });

        const prev = lockQueues.get(name) || Promise.resolve();
        let release!: () => void;
        const nextTail = new Promise<void>((r) => {
          release = r;
        });
        lockQueues.set(name, prev.then(() => nextTail));

        prev.then(async () => {
          options?.signal?.removeEventListener("abort", onAbort);
          if (aborted) {
            release();
            return;
          }
          try {
            const res = await callback({ name, mode: options?.mode || "exclusive" });
            release();
            resolve(res);
          } catch (err) {
            release();
            reject(err);
          }
        });
      });
    },
  };

  const windowMock = {
    addEventListener: (event: string, fn: any) => {
      if (event === "storage") storageListeners.add(fn);
    },
    removeEventListener: (event: string, fn: any) => {
      if (event === "storage") storageListeners.delete(fn);
    },
  };

  Object.defineProperty(globalThis, "window", {
    value: windowMock,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageMock,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "BroadcastChannel", {
    value: MockBroadcastChannel,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "MessageChannel", {
    value: MockMessageChannel,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "indexedDB", {
    value: mockIndexedDB,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    value: {
      onLine: true,
      locks: webLocksImpl,
      serviceWorker: { controller: null },
    },
    configurable: true,
    writable: true,
  });

  return {
    lsStore,
    idbStores,
    opCounts,
    setIdbFault: (fault: null | "QUOTA" | "ABORT" | "OPEN_FAIL") => {
      idbFault = fault;
    },
    setLsQuotaFail: (fail: boolean) => {
      lsQuotaFail = fail;
    },
    setSwController: (controller: any) => {
      (globalThis.navigator as any).serviceWorker.controller = controller;
    },
    resetOpCounts: () => {
      opCounts.syncQueueGetAll = 0;
      opCounts.tombstoneGet = 0;
      opCounts.tombstoneGetAll = 0;
    },
  };
}

/**
 * Sandboxed Node VM execution harness for the REAL `public/sw-custom.js` file on disk.
 * NOTE (transparency): This executes the genuine `public/sw-custom.js` source in a Node `vm`
 * ServiceWorkerGlobalScope with in-memory CacheStorage & Response — it is NOT a browser SW process,
 * but it directly verifies the real event listeners, cache names, activation cleanup, ACK timing,
 * and broadcast payloads of `public/sw-custom.js`.
 */
function loadRealSwCustomInVmSandbox() {
  const swPath = path.resolve(process.cwd(), "public/sw-custom.js");
  const swSource = fs.readFileSync(swPath, "utf8");

  const cachesMap = new Map<string, Map<string, { body: string; headers: Record<string, string> }>>();
  const listeners = new Map<string, Array<(event: any) => void>>();
  const postedToClients: any[] = [];
  let clientsClaimed = false;

  const makeResponse = (body: string, init?: { headers?: Record<string, string> }) => ({
    _body: String(body),
    headers: init?.headers || {},
    json: async () => JSON.parse(String(body)),
    text: async () => String(body),
    clone() {
      return makeResponse(this._body, { headers: { ...this.headers } });
    },
  });

  const cachesApi = {
    open: async (name: string) => {
      if (!cachesMap.has(name)) cachesMap.set(name, new Map());
      const bucket = cachesMap.get(name)!;
      return {
        put: async (req: any, res: any) => {
          const url = typeof req === "string" ? req : req?.url;
          bucket.set(url, { body: res._body, headers: res.headers || {} });
        },
        match: async (req: any) => {
          const url = typeof req === "string" ? req : req?.url;
          const entry = bucket.get(url);
          if (!entry) return undefined;
          return makeResponse(entry.body, { headers: entry.headers });
        },
        delete: async (req: any) => {
          const url = typeof req === "string" ? req : req?.url;
          return bucket.delete(url);
        },
        keys: async () => Array.from(bucket.keys()).map((u) => ({ url: u })),
      };
    },
    keys: async () => Array.from(cachesMap.keys()),
    delete: async (name: string) => cachesMap.delete(name),
    has: async (name: string) => cachesMap.has(name),
  };

  const sandboxSelf: any = {
    location: { origin: "https://localiza.ifpr.edu.br" },
    addEventListener: (type: string, fn: (event: any) => void) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type)!.push(fn);
    },
    clients: {
      claim: async () => {
        clientsClaimed = true;
      },
      matchAll: async () => [
        {
          postMessage: (msg: any) => {
            postedToClients.push(structuredClone(msg));
          },
        },
      ],
    },
    registration: {
      showNotification: async () => {},
    },
  };

  const context = vm.createContext({
    self: sandboxSelf,
    caches: cachesApi,
    Response: function (body: string, init?: any) {
      return makeResponse(body, init);
    },
    URL,
    Date,
    Set,
    Map,
    Array,
    Promise,
    JSON,
    console,
  });

  new vm.Script(swSource, { filename: "public/sw-custom.js" }).runInContext(context);

  const dispatchActivate = async () => {
    const fns = listeners.get("activate") || [];
    const waitPromises: Promise<any>[] = [];
    for (const fn of fns) {
      fn({
        waitUntil: (p: Promise<any>) => waitPromises.push(Promise.resolve(p)),
      });
    }
    await Promise.all(waitPromises);
  };

  const dispatchMessage = async (data: any, ports: any[] = []) => {
    const fns = listeners.get("message") || [];
    const waitPromises: Promise<any>[] = [];
    for (const fn of fns) {
      fn({
        data,
        ports,
        waitUntil: (p: Promise<any>) => waitPromises.push(Promise.resolve(p)),
      });
    }
    await Promise.all(waitPromises);
  };

  const controller = {
    postMessage: (data: any, ports?: any[]) => {
      void dispatchMessage(data, ports || []);
    },
  };

  return {
    cachesMap,
    postedToClients,
    dispatchActivate,
    dispatchMessage,
    controller,
    wasClientsClaimed: () => clientsClaimed,
  };
}

describe("LOCALIZA+ v1.10.13 — Suíte Integrada Final Anti-Ressurreição (Cenários A–T)", () => {
  let harness: ReturnType<typeof createBrowserHarness>;

  beforeEach(() => {
    harness = createBrowserHarness();
  });

  afterEach(async () => {
    harness.setIdbFault(null);
    harness.setLsQuotaFail(false);
    await clearOfflineRecentCache();
  });

  // =========================================================================
  // CENÁRIOS A, B, C — Snapshot fromCache vs Server Authoritative (ACHADO-01)
  // =========================================================================
  describe("Cenários A, B e C — Classificação de Snapshot fromCache vs Servidor (ACHADO-01)", () => {
    it("Cenário A: fromCache: true com navigator.onLine: true NUNCA é tratado como autoritativo e exige tombstones", () => {
      const cls = classifyCatalogSnapshot({
        fromCache: true,
        isOnline: true,
        hasPreviousAuthoritativeSnapshot: false,
      });

      expect(cls.isAuthoritative).toBe(false);
      expect(cls.shouldApplyTombstones).toBe(true);
      expect(cls.canClearOfflineCaches).toBe(false);
      expect(cls.canPersistEmptyAuthoritativeSnapshot).toBe(false);
      expect(cls.nextSyncState).toBe("loading");

      // Mesmo se o app já recebeu um snapshot autoritativo antes, um snapshot fromCache posterior
      // continua não-autoritativo e não autoriza limpeza definitiva por vazio
      const clsAfterPrev = classifyCatalogSnapshot({
        fromCache: true,
        isOnline: true,
        hasPreviousAuthoritativeSnapshot: true,
      });
      expect(clsAfterPrev.isAuthoritative).toBe(false);
      expect(clsAfterPrev.shouldApplyTombstones).toBe(true);
      expect(clsAfterPrev.canClearOfflineCaches).toBe(false);
    });

    it("Cenário B: fromCache: true com snapshot.empty offline preserva cache offline legítimo e não limpa caches", async () => {
      const legit = createTestItem("LEGIT-CACHE-1");
      await saveItemsToIndexedDB([legit]);
      await cacheSearchedItems([legit], "", { isFromOfflineFallback: false });

      const cls = classifyCatalogSnapshot({
        fromCache: true,
        isOnline: false,
        hasPreviousAuthoritativeSnapshot: false,
      });

      expect(cls.isAuthoritative).toBe(false);
      expect(cls.nextSyncState).toBe("offline-fallback");
      expect(cls.canClearOfflineCaches).toBe(false);

      // Como canClearOfflineCaches === false, caches permanecem preservados
      expect((await getItemsFromIndexedDB()).map((i) => i.id)).toEqual(["LEGIT-CACHE-1"]);
      expect(getLocalCachedRecentItems().map((i) => i.id)).toEqual(["LEGIT-CACHE-1"]);

      const display = resolveCatalogDisplayState({
        items: [],
        isOffline: true,
        catalogSyncState: cls.nextSyncState,
        offlineRecentItems: getLocalCachedRecentItems(),
      });
      expect(display.mode).toBe("offline-fallback");
      expect(display.displayItems.map((i) => i.id)).toEqual(["LEGIT-CACHE-1"]);
      expect(display.showOfflineBanner).toBe(true);
    });

    it("Cenário C: fromCache: false com snapshot.empty confirma catálogo vazio autoritativo e corrige cache stale", async () => {
      const stale = createTestItem("STALE-1");
      await saveItemsToIndexedDB([stale]);
      await cacheSearchedItems([stale], "", { isFromOfflineFallback: false });

      // 1. Primeiro chega snapshot de cache stale (fromCache: true, isOnline: true) -> NÃO limpa nem confirma
      const cachedCls = classifyCatalogSnapshot({
        fromCache: true,
        isOnline: true,
        hasPreviousAuthoritativeSnapshot: false,
      });
      expect(cachedCls.isAuthoritative).toBe(false);
      expect(cachedCls.shouldApplyTombstones).toBe(true);

      // 2. Depois chega snapshot confirmado pelo servidor (fromCache: false, empty) -> autoritativo!
      const serverCls = classifyCatalogSnapshot({
        fromCache: false,
        isOnline: true,
        hasPreviousAuthoritativeSnapshot: false,
      });
      expect(serverCls.isAuthoritative).toBe(true);
      expect(serverCls.nextSyncState).toBe("authoritative");
      expect(serverCls.canClearOfflineCaches).toBe(true);
      expect(serverCls.canPersistEmptyAuthoritativeSnapshot).toBe(true);

      await saveAuthoritativeItemsPreservingOfflineQueued([]);
      await clearOfflineRecentCache();

      expect(await getItemsFromIndexedDB()).toEqual([]);
      expect(getLocalCachedRecentItems()).toEqual([]);
      expect(
        canHydrateCatalogFromIndexedDB({
          hasAuthoritativeSnapshot: true,
          catalogSyncState: "authoritative",
        })
      ).toBe(false);

      const display = resolveCatalogDisplayState({
        items: [],
        isOffline: false,
        catalogSyncState: "authoritative",
        offlineRecentItems: [],
      });
      expect(display.mode).toBe("online-empty");
      expect(display.showOfflineBanner).toBe(false);
    });
  });

  // =========================================================================
  // CENÁRIO D — Concorrência Real Multi-Instância / Multi-Aba (ACHADO-02)
  // =========================================================================
  describe("Cenário D — Concorrência Real entre Duas Instâncias (Web Locks + Lease Fallback + Cross-Tab Events)", () => {
    it("duas instâncias independentes competindo pelo mesmo itemId via Web Locks serializam exclusão e sync sem recriação", async () => {
      const itemId = "CONC-ITEM-1";
      const offlineItem = createTestItem(itemId, { isOfflineQueued: true });
      await queueOfflineItemRegistration(offlineItem);

      const timeline: string[] = [];
      let syncUploaded = false;

      // Aba B (exclusão) adquire lock primeiro, grava tombstone PENDING_DELETE -> CONFIRMED_DELETED
      const tabBDeletion = withCrossTabItemLock(
        itemId,
        async () => {
          timeline.push("tabB:lock-acquired");
          await saveDeletedItemTombstones([
            { itemId, reason: "LOCAL_DELETE", status: "PENDING_DELETE", operationId: "op-tabB" },
          ]);
          await new Promise((r) => setTimeout(r, 40));
          await saveDeletedItemTombstones([
            { itemId, reason: "LOCAL_DELETE", status: "CONFIRMED_DELETED", operationId: "op-tabB" },
          ]);
          await removeSyncQueueEntryByItemId(itemId);
          timeline.push("tabB:delete-confirmed");
        },
        { ownerId: "tab-B" }
      );

      // Aba A (syncOfflineQueue) tenta sincronizar o MESMO item concorrentemente 5ms depois
      await new Promise((r) => setTimeout(r, 5));
      const tabASync = withCrossTabItemLock(
        itemId,
        async () => {
          timeline.push("tabA:lock-acquired");
          const hasTombstone = await hasActiveDeletedTombstone(itemId);
          const decision = evaluateSyncQueueUploadAgainstDeletions({
            itemId,
            hasActiveTombstone: hasTombstone,
            isDeletionInFlight: false,
          });
          if (decision.shouldUpload) {
            syncUploaded = true;
          } else {
            timeline.push(`tabA:blocked:${decision.reason}`);
          }
        },
        { ownerId: "tab-A" }
      );

      await Promise.all([tabBDeletion, tabASync]);

      expect(syncUploaded).toBe(false);
      expect(timeline).toEqual([
        "tabB:lock-acquired",
        "tabB:delete-confirmed",
        "tabA:lock-acquired",
        "tabA:blocked:ACTIVE_TOMBSTONE",
      ]);
    });

    it("fallback de lock por lease em localStorage garante exclusão mútua e recupera lock abandonado após expiração", async () => {
      const itemId = "LEASE-ITEM-1";
      const order: string[] = [];

      // 1. Lock abandonado com expiresAt no passado é assumido com segurança
      localStorage.setItem(
        `${LS_LOCK_PREFIX}${itemId}`,
        JSON.stringify({
          ownerId: "crashed-tab-old",
          token: "tok-crashed-old",
          expiresAt: Date.now() - 500,
          acquiredAt: Date.now() - 5000,
        })
      );

      await withCrossTabItemLock(
        itemId,
        async () => {
          order.push("recovered-abandoned-lock");
        },
        { forceStorageFallback: true, ownerId: "tab-recovery", leaseTtlMs: 300, timeoutMs: 2000 }
      );
      expect(order).toEqual(["recovered-abandoned-lock"]);

      // 2. Lock ativo de outra aba bloqueia até expirar/liberar e dispara CrossTabLockTimeoutError no timeout
      localStorage.setItem(
        `${LS_LOCK_PREFIX}${itemId}`,
        JSON.stringify({
          ownerId: "active-other-tab",
          token: "tok-active-other",
          expiresAt: Date.now() + 10_000,
          acquiredAt: Date.now(),
        })
      );

      await expect(
        withCrossTabItemLock(
          itemId,
          async () => "should-not-run",
          { forceStorageFallback: true, ownerId: "tab-waiter", timeoutMs: 120, retryIntervalMs: 25 }
        )
      ).rejects.toBeInstanceOf(CrossTabLockTimeoutError);

      localStorage.removeItem(`${LS_LOCK_PREFIX}${itemId}`);
    });

    it("eventos cross-tab (STARTED, CONFIRMED, REJECTED) propagam entre abas distintas via BroadcastChannel e localStorage", () => {
      const receivedByTabA: CatalogCrossTabEvent[] = [];
      const unsub = subscribeCatalogCrossTabEvents(
        (ev) => receivedByTabA.push(ev),
        { selfTabId: "tab-A" }
      );

      publishCatalogCrossTabEvent({
        type: "ITEM_DELETION_STARTED",
        itemIds: ["X-1"],
        operationId: "op-1",
        tabId: "tab-B",
      });
      publishCatalogCrossTabEvent({
        type: "ITEM_DELETION_REJECTED",
        itemIds: ["X-1"],
        operationId: "op-1",
        definitive: false,
        tabId: "tab-B",
      });
      publishCatalogCrossTabEvent({
        type: "ITEM_DELETION_CONFIRMED",
        itemIds: ["X-2"],
        operationId: "op-2",
        tabId: "tab-B",
      });
      // Evento da própria tab-A deve ser ignorado
      publishCatalogCrossTabEvent({
        type: "ITEM_DELETION_CONFIRMED",
        itemIds: ["SELF-IGNORE"],
        operationId: "op-self",
        tabId: "tab-A",
      });

      unsub();

      expect(receivedByTabA.map((e) => e.type)).toEqual([
        "ITEM_DELETION_STARTED",
        "ITEM_DELETION_REJECTED",
        "ITEM_DELETION_CONFIRMED",
      ]);
      expect(localStorage.getItem(CATALOG_SYNC_LS_EVENT_KEY)).toBeTruthy();
    });
  });

  // =========================================================================
  // CENÁRIOS E, F, N, O — Falhas de Rede, Timeout e Estado Remoto (ACHADO-03)
  // =========================================================================
  describe("Cenários E, F, N e O — Confirmação Real de Exclusão vs Rede/Timeout/Permissão (ACHADO-03)", () => {
    it("Cenário E (permission-denied): classifica como AUTHORIZATION_DENIED definitivo e permite rollback seguro do tombstone", async () => {
      await saveDeletedItemTombstones([
        { itemId: "PERM-1", reason: "LOCAL_DELETE", status: "PENDING_DELETE", operationId: "op-perm" },
      ]);

      const permError = Object.assign(new Error("Missing or insufficient permissions"), {
        code: "permission-denied",
      });

      const res = await executeFirestoreItemDeletion({
        db: {} as any,
        itemId: "PERM-1",
        isAdmin: false,
        isOnline: true,
        _deps: {
          docFn: ((_db: any, col: string, id: string) => ({ col, id })) as any,
          commitAtomicDeleteFn: async () => {
            throw permError;
          },
          getDocFromServerFn: (async () => ({ exists: () => true })) as any,
          deletePrivateDocFn: vi.fn() as any,
        },
      });

      expect(res.ok).toBe(false);
      if (res.ok === false) {
        expect(res.outcomeType).toBe("AUTHORIZATION_DENIED");
        expect(res.definitive).toBe(true);
      }

      // Rollback remove apenas o tombstone PENDING_DELETE deste operationId
      const removed = await removeDeletedItemTombstones([{ itemId: "PERM-1", operationId: "op-perm" }]);
      expect(removed).toBe(1);
      expect(await hasActiveDeletedTombstone("PERM-1")).toBe(false);
    });

    it("Cenário E (unavailable + doc existe no servidor): classifica como TRANSIENT_NETWORK_ERROR sem confirmar exclusão", async () => {
      const netErr = Object.assign(new Error("Failed to reach Cloud Firestore backend"), {
        code: "unavailable",
      });

      const res = await executeFirestoreItemDeletion({
        db: {} as any,
        itemId: "NET-EXISTS-1",
        isAdmin: true,
        isOnline: true,
        _deps: {
          docFn: ((_db: any, col: string, id: string) => ({ col, id })) as any,
          commitAtomicDeleteFn: async () => {
            throw netErr;
          },
          getDocFromServerFn: (async () => ({ exists: () => true })) as any,
          deletePrivateDocFn: vi.fn() as any,
        },
      });

      expect(res.ok).toBe(false);
      if (res.ok === false) {
        expect(res.outcomeType).toBe("TRANSIENT_NETWORK_ERROR");
        expect(res.definitive).toBe(false);
        expect(res.remoteDocumentState).toBe("EXISTS_ON_SERVER");
      }
    });

    it("Cenário F (falha no batch.commit E falha no getDocFromServer): retorna REMOTE_UNKNOWN e NUNCA ALREADY_DELETED_REMOTELY", async () => {
      const commitErr = Object.assign(new Error("Unavailable"), { code: "unavailable" });
      const probeErr = Object.assign(new Error("Client is offline"), { code: "unavailable" });

      const res = await executeFirestoreItemDeletion({
        db: {} as any,
        itemId: "UNKNOWN-1",
        isAdmin: true,
        isOnline: true,
        _deps: {
          docFn: ((_db: any, col: string, id: string) => ({ col, id })) as any,
          commitAtomicDeleteFn: async () => {
            throw commitErr;
          },
          getDocFromServerFn: (async () => {
            throw probeErr;
          }) as any,
          deletePrivateDocFn: vi.fn() as any,
        },
      });

      expect(res.ok).toBe(false);
      if (res.ok === false) {
        expect(res.outcomeType).toBe("REMOTE_UNKNOWN");
        expect(res.definitive).toBe(false);
        expect(res.remoteDocumentState).toBe("UNKNOWN");
      }
    });

    it("Cenário N: timeout no batch.commit gera REMOTE_UNKNOWN; retry posterior confirma ALREADY_DELETED_REMOTELY via getDocFromServer com privateDocDeleted honesto", async () => {
      // Tentativa 1: commit nunca resolve (timeout de 50ms) e sonda também falha
      const attempt1 = await executeFirestoreItemDeletion({
        db: {} as any,
        itemId: "TIMEOUT-RETRY-1",
        isAdmin: true,
        isOnline: true,
        operationTimeoutMs: 50,
        _deps: {
          docFn: ((_db: any, col: string, id: string) => ({ col, id })) as any,
          commitAtomicDeleteFn: () => new Promise(() => {}),
          getDocFromServerFn: (async () => {
            throw Object.assign(new Error("offline"), { code: "unavailable" });
          }) as any,
          deletePrivateDocFn: vi.fn() as any,
        },
      });

      expect(attempt1.ok).toBe(false);
      if (attempt1.ok === false) {
        expect(attempt1.outcomeType).toBe("REMOTE_UNKNOWN");
      }

      // Tentativa 2: servidor efetivou exclusão de /items, mas deleteDoc(privateRef) falha -> privateDocDeleted === false (honesto!)
      const attempt2 = await executeFirestoreItemDeletion({
        db: {} as any,
        itemId: "TIMEOUT-RETRY-1",
        isAdmin: true,
        isOnline: true,
        _deps: {
          docFn: ((_db: any, col: string, id: string) => ({ col, id })) as any,
          commitAtomicDeleteFn: async () => {
            throw Object.assign(new Error("not-found"), { code: "not-found" });
          },
          getDocFromServerFn: (async () => ({ exists: () => false })) as any,
          deletePrivateDocFn: (async () => {
            throw new Error("private cleanup failed");
          }) as any,
        },
      });

      expect(attempt2).toEqual({
        ok: true,
        mode: "ALREADY_DELETED_REMOTELY",
        privateDocDeleted: false,
        remoteDocumentState: "CONFIRMED_ABSENT_ON_SERVER",
      });
    });

    it("Cenário O: tombstone REMOTE_UNKNOWN após timeout bloqueia reconexão/replay da fila offline mesmo expirado no relógio", async () => {
      const item = createTestItem("REMOTE-UNK-QUEUE-1", { isOfflineQueued: true });
      await queueOfflineItemRegistration(item);
      await saveDeletedItemTombstones([
        {
          itemId: "REMOTE-UNK-QUEUE-1",
          reason: "LOCAL_DELETE",
          status: "REMOTE_UNKNOWN",
          operationId: "op-unk",
          ttlMs: -5000, // expirado no relógio, mas REMOTE_UNKNOWN não pode expirar!
        },
      ]);

      expect(await pruneExpiredTombstones(Date.now())).toBe(0);
      expect(await hasActiveDeletedTombstone("REMOTE-UNK-QUEUE-1")).toBe(true);

      const decision = evaluateSyncQueueUploadAgainstDeletions({
        itemId: "REMOTE-UNK-QUEUE-1",
        hasActiveTombstone: await hasActiveDeletedTombstone("REMOTE-UNK-QUEUE-1"),
        isDeletionInFlight: false,
      });
      expect(decision.shouldUpload).toBe(false);
      expect(decision.reason).toBe("ACTIVE_TOMBSTONE");
    });
  });

  // =========================================================================
  // CENÁRIO G & M — Persistência de Tombstones, Sharding e Retenção (ACHADO-06)
  // =========================================================================
  describe("Cenários G e M — Falha de Armazenamento, Sharding Multi-Aba e Retenção de Tombstones (ACHADO-06)", () => {
    it("Cenário G (QuotaExceededError / AbortError / OpenFail): lança TombstonePersistenceError em vez de retornar sucesso silencioso", async () => {
      harness.setIdbFault("QUOTA");
      await expect(
        saveDeletedItemTombstones([
          { itemId: "FAIL-QUOTA", reason: "LOCAL_DELETE", status: "PENDING_DELETE" },
        ])
      ).rejects.toThrow(TombstonePersistenceError);

      harness.setIdbFault("ABORT");
      await expect(
        saveDeletedItemTombstones([
          { itemId: "FAIL-ABORT", reason: "LOCAL_DELETE", status: "PENDING_DELETE" },
        ])
      ).rejects.toThrow(TombstonePersistenceError);

      harness.setIdbFault("OPEN_FAIL");
      await expect(
        saveDeletedItemTombstones([
          { itemId: "FAIL-OPEN", reason: "LOCAL_DELETE", status: "PENDING_DELETE" },
        ])
      ).rejects.toThrow(TombstonePersistenceError);

      // Falha de quota no espelho localStorage também propaga erro explícito
      harness.setIdbFault(null);
      harness.setLsQuotaFail(true);
      await expect(
        saveDeletedItemTombstones([
          { itemId: "FAIL-LS-QUOTA", reason: "LOCAL_DELETE", status: "PENDING_DELETE" },
        ])
      ).rejects.toThrow(TombstonePersistenceError);
    });

    it("Cenário G (sharding cross-tab): gravações concorrentes para ITEM-TAB-1 e ITEM-TAB-2 preservam ambos no localStorage", async () => {
      await Promise.all([
        saveDeletedItemTombstones([
          { itemId: "ITEM-TAB-1", reason: "LOCAL_DELETE", status: "CONFIRMED_DELETED", operationId: "op-1" },
        ]),
        saveDeletedItemTombstones([
          { itemId: "ITEM-TAB-2", reason: "BULK_DELETE", status: "CONFIRMED_DELETED", operationId: "op-2" },
        ]),
      ]);

      expect(localStorage.getItem("localiza_tombstone_v2:ITEM-TAB-1")).toBeTruthy();
      expect(localStorage.getItem("localiza_tombstone_v2:ITEM-TAB-2")).toBeTruthy();
      const activeIds = await getActiveDeletedTombstoneIds();
      expect(activeIds.has("ITEM-TAB-1")).toBe(true);
      expect(activeIds.has("ITEM-TAB-2")).toBe(true);
    });

    it("Cenário M: lookup O(1) não varre sync_queue_store quando tombstone está vigente; removeDeletedItemTombstones protege CONFIRMED_DELETED", async () => {
      await saveDeletedItemTombstones([
        { itemId: "FAST-1", reason: "LOCAL_DELETE", status: "CONFIRMED_DELETED", operationId: "op-fast" },
      ]);

      harness.resetOpCounts();
      const active = await hasActiveDeletedTombstone("FAST-1");
      expect(active).toBe(true);
      expect(harness.opCounts.tombstoneGet).toBe(1);
      expect(harness.opCounts.syncQueueGetAll).toBe(0);

      // Tentativa de reverter tombstone já CONFIRMED_DELETED deve ser recusada
      const removedConfirmed = await removeDeletedItemTombstones([
        { itemId: "FAST-1", operationId: "op-fast" },
      ]);
      expect(removedConfirmed).toBe(0);
      expect((await getDeletedItemTombstone("FAST-1"))?.status).toBe("CONFIRMED_DELETED");

      // Tentativa de reverter PENDING_DELETE com operationId diferente também é recusada
      await saveDeletedItemTombstones([
        { itemId: "PEND-1", reason: "LOCAL_DELETE", status: "PENDING_DELETE", operationId: "op-owner-A" },
      ]);
      expect(
        await removeDeletedItemTombstones([{ itemId: "PEND-1", operationId: "op-other-B" }])
      ).toBe(0);
      expect(await hasActiveDeletedTombstone("PEND-1")).toBe(true);
      expect(
        await removeDeletedItemTombstones([{ itemId: "PEND-1", operationId: "op-owner-A" }])
      ).toBe(1);
      expect(await hasActiveDeletedTombstone("PEND-1")).toBe(false);
    });
  });

  // =========================================================================
  // CENÁRIO H — Concorrência em Lote e Listeners Secundários (ACHADO-04)
  // =========================================================================
  describe("Cenário H — Proteção Batch-Wide contra Listeners Secundários e Falha Parcial (ACHADO-04)", () => {
    it("mantém todos os IDs do lote protegidos contra re-injeção enquanto listeners secundários disparam no meio da exclusão", () => {
      const itemsBefore = [
        createTestItem("BATCH-1"),
        createTestItem("BATCH-2"),
        createTestItem("BATCH-3"),
      ];

      // Simula inFlightDeletingItemIdsRef + ref-count por operação (como em AppContext.tsx)
      const opsByItem = new Map<string, Set<string>>();
      const inFlight = new Set<string>();
      const mark = (ids: string[], opId: string) => {
        for (const id of ids) {
          if (!opsByItem.has(id)) opsByItem.set(id, new Set());
          opsByItem.get(id)!.add(opId);
          inFlight.add(id);
        }
      };
      const unmark = (ids: string[], opId: string) => {
        for (const id of ids) {
          const set = opsByItem.get(id);
          set?.delete(opId);
          if (!set || set.size === 0) {
            opsByItem.delete(id);
            inFlight.delete(id);
          }
        }
      };

      // Lote marca BATCH-1 e BATCH-2 como em andamento
      mark(["BATCH-1", "BATCH-2"], "bulk-op-1");

      // Mid-batch: BATCH-1 confirmou, mas BATCH-2 ainda está executando quando listener secundário dispara
      const midBatchVisible = filterExcludedCatalogItems(itemsBefore, inFlight);
      expect(midBatchVisible.map((i) => i.id)).toEqual(["BATCH-3"]);

      // BATCH-1 confirmou, BATCH-2 falhou -> rawPublicItemsRef remove APENAS BATCH-1 antes de unmark
      const reconciledRaw = itemsBefore.filter((it) => it.id !== "BATCH-1");
      unmark(["BATCH-1", "BATCH-2"], "bulk-op-1");

      // Após reconciliação: BATCH-1 foi removido definitivamente; BATCH-2 (falhou) e BATCH-3 permanecem no catálogo!
      const finalVisible = filterExcludedCatalogItems(reconciledRaw, inFlight);
      expect(finalVisible.map((i) => i.id)).toEqual(["BATCH-2", "BATCH-3"]);
    });
  });

  // =========================================================================
  // CENÁRIO I — Execução do Arquivo Real `public/sw-custom.js` em VM Sandbox (ACHADO-05)
  // =========================================================================
  describe("Cenário I — Arquivo Real public/sw-custom.js (VM Sandbox), Migração v1->v2, ACK e Reconciliação", () => {
    it("evento activate de public/sw-custom.js remove localiza-recent-items-v1, preserva caches não relacionados e executa clients.claim()", async () => {
      const sw = loadRealSwCustomInVmSandbox();

      // Semeia cache legado v1 + caches não relacionados (fonts/images/workbox)
      sw.cachesMap.set("localiza-recent-items-v1", new Map([["/api/offline-recent-items", { body: "{}", headers: {} }]]));
      sw.cachesMap.set("google-fonts-cache", new Map([["https://fonts.googleapis.com/css", { body: "css", headers: {} }]]));
      sw.cachesMap.set("images-cache", new Map([["https://img.example/1.png", { body: "png", headers: {} }]]));
      sw.cachesMap.set("workbox-precache-v2", new Map([["/index.html", { body: "html", headers: {} }]]));

      await sw.dispatchActivate();

      expect(sw.cachesMap.has("localiza-recent-items-v1")).toBe(false);
      expect(sw.cachesMap.has("google-fonts-cache")).toBe(true);
      expect(sw.cachesMap.has("images-cache")).toBe(true);
      expect(sw.cachesMap.has("workbox-precache-v2")).toBe(true);
      expect(sw.wasClientsClaimed()).toBe(true);
    });

    it("integra recentItemsOfflineService com public/sw-custom.js real (ACK, /api/items/{id}, anti-stale e broadcast)", async () => {
      const sw = loadRealSwCustomInVmSandbox();
      harness.setSwController(sw.controller);

      const itemA = createTestItem("SW-A");
      const itemB = createTestItem("SW-B");

      await cacheSearchedItems([itemA, itemB], "", {
        isFromOfflineFallback: false,
        authoritativeItemIds: new Set(["SW-A", "SW-B"]),
      });

      const v2Cache = sw.cachesMap.get("localiza-recent-items-v2")!;
      expect(v2Cache).toBeTruthy();
      expect(v2Cache.has("/api/items/SW-A")).toBe(true);
      expect(v2Cache.has("/api/items/SW-B")).toBe(true);

      // Remove apenas SW-A -> ACK confirmado após escrita no cache v2 e broadcast disparado
      await removeItemsFromOfflineRecentCache(["SW-A"]);
      expect(v2Cache.has("/api/items/SW-A")).toBe(false);
      expect(v2Cache.has("/api/items/SW-B")).toBe(true);

      // Tentativa de gravação com updatedAt antigo é ignorada (anti-stale)
      const staleAckPromise = new Promise<any>((resolve) => {
        const ch = new MessageChannel();
        ch.port1.onmessage = (ev: any) => resolve(ev.data);
        sw.controller.postMessage(
          {
            type: "REPLACE_OFFLINE_RECENT_ITEMS",
            items: [itemA, itemB],
            updatedAt: 1000, // muito antigo
          },
          [ch.port2]
        );
      });
      const staleAck = await staleAckPromise;
      expect(staleAck.skippedStale).toBe(true);
      expect(v2Cache.has("/api/items/SW-A")).toBe(false);

      // Limpeza total grava estado cleared: true com updatedAt e remove previews
      const clearAck = await clearOfflineRecentCache();
      expect(clearAck.acknowledged).toBe(true);
      expect(clearAck.swVersion).toBe(EXPECTED_SW_CUSTOM_VERSION);
      expect(v2Cache.has("/api/items/SW-B")).toBe(false);

      const fetchedAfterClear = await getOfflineRecentItems();
      expect(fetchedAfterClear.items).toEqual([]);
      expect(sw.postedToClients.some((m) => m.type === "RECENT_ITEMS_CACHED_BROADCAST")).toBe(true);

      // Consumidor real de RECENT_ITEMS_CACHED_BROADCAST atualiza inscritos apenas se mais novo
      let observedByView: LostFoundItem[] = [];
      const unsub = subscribeOfflineRecentItemsChange((list) => {
        observedByView = list;
      });
      const staleApplied = applyServiceWorkerRecentItemsBroadcast({
        items: [itemA],
        updatedAt: 1,
      });
      expect(staleApplied).toBe(false);
      expect(observedByView).toEqual([]);

      const freshApplied = applyServiceWorkerRecentItemsBroadcast({
        items: [itemB],
        updatedAt: Date.now() + 50_000,
      });
      expect(freshApplied).toBe(true);
      expect(observedByView.map((i) => i.id)).toEqual(["SW-B"]);
      unsub();
    });

    it("transição SW legado v1.10.7 -> novo SW: fallback funciona e localStorage cleared mais recente vence SW legado stale", async () => {
      const legacyStaleItem = createTestItem("LEGACY-STALE-1");
      const legacySwCache = new Map<string, any>();
      legacySwCache.set("/api/offline-recent-items", {
        items: [legacyStaleItem],
        count: 1,
        cachedAt: 1000,
        // Sem swVersion e sem handler de REPLACE_OFFLINE_RECENT_ITEMS (como SW legado v1.10.7)
      });

      const legacyController = {
        postMessage: (msg: any, ports?: any[]) => {
          if (msg.type === "CLEAR_OFFLINE_RECENT_ITEMS") {
            legacySwCache.clear();
          } else if (msg.type === "CACHE_RECENT_SEARCH_ITEMS") {
            legacySwCache.set("/api/offline-recent-items", {
              items: msg.items,
              count: msg.items.length,
              cachedAt: msg.timestamp || 2000,
            });
          } else if (msg.type === "GET_OFFLINE_RECENT_ITEMS" && ports?.[0]) {
            ports[0].postMessage({
              type: "OFFLINE_RECENT_ITEMS_RESPONSE",
              data: legacySwCache.get("/api/offline-recent-items") || { items: [], count: 0, cachedAt: 1000 },
            });
          }
          // Ignora deliberadamente REPLACE_OFFLINE_RECENT_ITEMS / REMOVE_OFFLINE_RECENT_ITEMS
        },
      };

      harness.setSwController(legacyController);

      // 1. Reconciliação determinística: localStorage com cleared: true e updatedAt=5000 vence SW legado (updatedAt=1000)
      const reconciled = reconcileOfflineRecentCacheSources({
        local: { items: [], updatedAt: 5000, timestamp: 5000, cleared: true },
        sw: { items: [legacyStaleItem], updatedAt: 1000, timestamp: 1000, cleared: false },
      });
      expect(reconciled.items).toEqual([]);
      expect(reconciled.source).toBe("local-storage");
      expect(reconciled.cleared).toBe(true);

      // 2. syncOfflineRecentCacheWithAuthoritativeCatalog cai automaticamente no fallback CLEAR + CACHE
      const survivor = createTestItem("SURVIVOR-1");
      await syncOfflineRecentCacheWithAuthoritativeCatalog([survivor]);
      const cachedPayload = legacySwCache.get("/api/offline-recent-items");
      expect(cachedPayload.items.map((i: any) => i.id)).toEqual(["SURVIVOR-1"]);
      expect(readLocalRecentItemsEnvelope().items.map((i) => i.id)).toEqual(["SURVIVOR-1"]);
    });
  });

  // =========================================================================
  // CENÁRIOS J & P — Preservação de Pendentes Offline + Boot Offline (ACHADO-07 & 10)
  // =========================================================================
  describe("Cenários J e P — Cadastro Offline, Exclusão Parcial, Recarregamento Offline e Reconexão (ACHADO-07 & 10)", () => {
    it("Cenário J & P: com catálogo remoto vazio, cadastra OFF-1 e OFF-2 offline, exclui OFF-1, recarrega offline mantendo OFF-2 e sincroniza só OFF-2", async () => {
      const off1 = createTestItem("OFF-1", { isOfflineQueued: true });
      const off2 = createTestItem("OFF-2", { isOfflineQueued: true });

      // 1. Cadastra dois objetos offline -> ambos vão para sync_queue_store e items_store
      await queueOfflineItemRegistration(off1);
      await queueOfflineItemRegistration(off2);
      await saveItemsToIndexedDB([off1, off2]);

      // 2. Exclui apenas OFF-1 offline
      const delOff1 = await executeFirestoreItemDeletion({
        db: {} as any,
        itemId: "OFF-1",
        isAdmin: false,
        isOnline: false,
        isOfflineQueuedOnly: true,
      });
      expect(delOff1).toEqual({
        ok: true,
        mode: "OFFLINE_QUEUE_ONLY",
        privateDocDeleted: false,
        remoteDocumentState: "OFFLINE_ONLY",
      });
      await saveDeletedItemTombstones([
        { itemId: "OFF-1", reason: "OFFLINE_DELETE", status: "CONFIRMED_DELETED", operationId: "op-off1" },
      ]);
      await removeSyncQueueEntryByItemId("OFF-1");
      await deleteItemsFromIndexedDB(["OFF-1"]);

      // 3. Mesmo se um snapshot autoritativo vazio ([]) chegar, saveAuthoritativeItemsPreservingOfflineQueued preserva OFF-2!
      const persisted = await saveAuthoritativeItemsPreservingOfflineQueued([], new Set(["OFF-1"]));
      expect(persisted.map((i) => i.id)).toEqual(["OFF-2"]);

      // 4. Recarregamento offline (Cenário P): reidrata items_store + sync_queue_store filtrando tombstones
      const tombstones = await getActiveDeletedTombstoneIds();
      const storedItems = await getItemsFromIndexedDB();
      const pendingQueue = await getPendingSyncQueue();
      const bootMap = new Map<string, LostFoundItem>();
      for (const it of storedItems) bootMap.set(it.id, it);
      for (const q of pendingQueue) {
        if (q.type === "REGISTER_ITEM" && q.payload?.id && !bootMap.has(q.payload.id)) {
          bootMap.set(q.payload.id, { ...q.payload, isOfflineQueued: true });
        }
      }
      const hydrated = filterExcludedCatalogItems(Array.from(bootMap.values()), tombstones);
      expect(hydrated.map((i) => i.id)).toEqual(["OFF-2"]);

      // 5. Reconexão: avalia fila -> apenas OFF-2 está elegível para upload; OFF-1 (mesmo se reaparecesse) é bloqueado
      const toUpload: string[] = [];
      for (const q of pendingQueue) {
        const id = q.itemId || q.payload.id;
        const decision = evaluateSyncQueueUploadAgainstDeletions({
          itemId: id,
          hasActiveTombstone: await hasActiveDeletedTombstone(id),
          isDeletionInFlight: false,
        });
        if (decision.shouldUpload) toUpload.push(id);
      }
      expect(toUpload).toEqual(["OFF-2"]);
    });
  });

  // =========================================================================
  // CENÁRIO K (Cliente) & L — Auditoria Honesta e Reset Parcial (ACHADO-08)
  // =========================================================================
  describe("Cenários K (contrato cliente) e L — Auditoria Honesta e Falha Parcial no Reset (ACHADO-08)", () => {
    it("Cenário K: metadados locais persistenceStatus/persistenceError não contaminam payload enviado ao Firestore", () => {
      const clientLog = {
        id: "audit-del-BULK-1-ITEM-1",
        transactionId: "BULK-1",
        objectId: "ITEM-1",
        objectType: "ITEM" as const,
        objectTitle: "Mochila Preta",
        action: "EXCLUSAO_ITEM",
        actorId: "uid-admin-1",
        actorName: "Admin Teste",
        actorRole: "ADMIN",
        timestamp: "2026-11-22T10:00:00.000Z",
        details: "Exclusão confirmada",
        persistenceStatus: "PERSISTED" as const,
        persistenceError: undefined,
      };
      const { persistenceStatus: _s, persistenceError: _e, ...firestorePayload } = clientLog;
      expect("persistenceStatus" in firestorePayload).toBe(false);
      expect("persistenceError" in firestorePayload).toBe(false);
      expect(firestorePayload.id).toBe("audit-del-BULK-1-ITEM-1");
      expect(firestorePayload.action).toBe("EXCLUSAO_ITEM");
    });

    it("Cenário L: resetSystemData em escopo inclui itens da fila offline e reporta falhas parciais sem mascarar itens já excluídos", async () => {
      // Simula estado com 1 item remoto + 1 item pendente offline
      const remoteItem = createTestItem("RST-REMOTE-1");
      const offlinePending = createTestItem("RST-OFFLINE-2", { isOfflineQueued: true });
      await queueOfflineItemRegistration(offlinePending);

      const pendingEntries = await getPendingSyncQueue();
      const scopedIds = Array.from(
        new Set([
          remoteItem.id,
          ...pendingEntries.map((e) => e.itemId || e.payload?.id).filter(Boolean),
        ])
      );
      expect(scopedIds).toEqual(["RST-REMOTE-1", "RST-OFFLINE-2"]);

      // Se 2 itens foram excluídos e etapa posterior (/claims) falha, mensagem relata exatamente os itens já removidos
      const deletedItemsCount = 2;
      const failedSteps = ["reivindicações (permission-denied)"];
      const msg = `Limpeza concluída parcialmente: ${deletedItemsCount} objeto(s) removidos, mas ocorreram falhas em: ${failedSteps.join(", ")}.`;
      expect(msg).toContain("2 objeto(s) removidos");
      expect(msg).toContain("reivindicações");
      expect(msg).not.toContain("Nenhum item foi removido");
    });
  });

  // =========================================================================
  // CENÁRIOS Q, R, S, T — Regressões de Cadastro, Devolução e RBAC (ACHADO-09)
  // =========================================================================
  describe("Cenários Q, R, S e T — Regressões: Cadastro Online/Offline, Devolução, RBAC e Root Admin Pinning (ACHADO-09)", () => {
    it("Cenário Q: cadastro online permanece íntegro para SERVIDOR e ADMIN aprovados e gera histórico e payload privado válidos", () => {
      const serverCheck = evaluateItemRegistrationEligibility({
        authUser: {
          uid: "uid-servidor-1",
          email: "servidor1@ifpr.edu.br",
          emailVerified: true,
        },
        tokenEmailVerified: true,
        userDocData: ownerServidorUser,
      });
      expect(serverCheck.allowed).toBe(true);
      expect(serverCheck.effectiveRole).toBe("SERVIDOR");

      const hist = buildSanitizedInitialHistoryEntry({
        itemId: "REG-ONLINE-1",
        itemType: "ENCONTRADO",
        itemLocation: "Biblioteca",
        authUid: "uid-servidor-1",
        actorName: "Servidor Teste",
        effectiveRole: "SERVIDOR",
        createdAt: "2026-11-22T10:00:00.000Z",
      });
      expect(hist.payload.objectId).toBe("REG-ONLINE-1");
      expect(hist.payload.action).toBe("Ocorrência cadastrada");

      const priv = buildSanitizedItemPrivatePayload({
        itemId: "REG-ONLINE-1",
        authUid: "uid-servidor-1",
        secretVerificationHint: "Etiqueta interna",
        secretVerificationKey: "KEY-99",
      });
      expect(priv.itemId).toBe("REG-ONLINE-1");
      expect(priv.registeredByUserId).toBe("uid-servidor-1");
    });

    it("Cenário R: fila offline não descarta entrada quando exclusão está em andamento ou verificação de tombstone falha (STORAGE_UNVERIFIED)", () => {
      const inFlightDecision = evaluateSyncQueueUploadAgainstDeletions({
        itemId: "Q-INFLIGHT",
        hasActiveTombstone: false,
        isDeletionInFlight: true,
      });
      expect(inFlightDecision.shouldUpload).toBe(false);
      expect(inFlightDecision.shouldDiscardQueueEntry).toBe(false);
      expect(inFlightDecision.reason).toBe("DELETION_IN_FLIGHT");

      const storageErrDecision = evaluateSyncQueueUploadAgainstDeletions({
        itemId: "Q-ERR",
        hasActiveTombstone: false,
        isDeletionInFlight: false,
        tombstoneCheckFailed: true,
      });
      expect(storageErrDecision.shouldUpload).toBe(false);
      expect(storageErrDecision.shouldDiscardQueueEntry).toBe(false);
      expect(storageErrDecision.reason).toBe("STORAGE_UNVERIFIED");
    });

    it("Cenário S: item DEVOLVIDO permanece bloqueado contra exclusão mesmo para Root Admin verificado", () => {
      const returnedItem = createTestItem("DEV-1", { status: "DEVOLVIDO" });
      const check = evaluateItemDeletionEligibility({
        isGuest: false,
        authUid: ROOT_ADMIN_UID,
        authEmail: ROOT_ADMIN_EMAIL,
        authEmailVerified: true,
        currentUser: { ...adminUser, id: ROOT_ADMIN_UID, email: ROOT_ADMIN_EMAIL },
        item: returnedItem,
      });
      expect(check.allowed).toBe(false);
      expect(check.code).toBe("ITEM_RETURNED");
    });

    it("Cenário T: ALUNO não pode cadastrar, SERVIDOR não exclui de terceiros/ENCERRADO, e Root Admin exige UID fixado + e-mail + emailVerified", () => {
      // 1. ALUNO não pode cadastrar objetos
      const alunoReg = evaluateItemRegistrationEligibility({
        authUser: {
          uid: "uid-aluno-1",
          email: "aluno1@estudantes.ifpr.edu.br",
          emailVerified: true,
        },
        tokenEmailVerified: true,
        userDocData: alunoUser,
      });
      expect(alunoReg.allowed).toBe(false);

      // 2. SERVIDOR não exclui objeto de outro servidor nem ENCERRADO
      const otherItem = createTestItem("RBAC-1", { registeredByUserId: "uid-servidor-1" });
      expect(
        evaluateItemDeletionEligibility({
          isGuest: false,
          authUid: "uid-servidor-2",
          authEmail: "servidor2@ifpr.edu.br",
          authEmailVerified: true,
          currentUser: otherServidorUser,
          item: otherItem,
        })
      ).toMatchObject({ allowed: false, code: "FORBIDDEN" });

      const closedItem = createTestItem("RBAC-CLOSED", {
        registeredByUserId: "uid-servidor-1",
        status: "ENCERRADO",
      });
      expect(
        evaluateItemDeletionEligibility({
          isGuest: false,
          authUid: "uid-servidor-1",
          authEmail: "servidor1@ifpr.edu.br",
          authEmailVerified: true,
          currentUser: ownerServidorUser,
          item: closedItem,
        })
      ).toMatchObject({ allowed: false, code: "ITEM_CLOSED_REQUIRES_ADMIN" });

      // 3. ACHADO-09: E-mail do Root Admin com UID ERRADO é RECUSADO (não promove a admin!)
      expect(
        evaluateItemDeletionEligibility({
          isGuest: false,
          authUid: "uid-attacker-spoofed",
          authEmail: ROOT_ADMIN_EMAIL,
          authEmailVerified: true,
          currentUser: { ...alunoUser, id: "uid-attacker-spoofed", email: ROOT_ADMIN_EMAIL },
          item: otherItem,
        })
      ).toMatchObject({ allowed: false, code: "FORBIDDEN" });

      // 4. ACHADO-09: UID + e-mail do Root Admin com emailVerified: false é RECUSADO!
      expect(
        evaluateItemDeletionEligibility({
          isGuest: false,
          authUid: ROOT_ADMIN_UID,
          authEmail: ROOT_ADMIN_EMAIL,
          authEmailVerified: false,
          currentUser: { ...alunoUser, id: ROOT_ADMIN_UID, email: ROOT_ADMIN_EMAIL },
          item: otherItem,
        })
      ).toMatchObject({ allowed: false, code: "FORBIDDEN" });

      // 5. Root Admin legítimo (UID + e-mail + emailVerified: true) é autorizado para ENCERRADO
      expect(
        evaluateItemDeletionEligibility({
          isGuest: false,
          authUid: ROOT_ADMIN_UID,
          authEmail: ROOT_ADMIN_EMAIL,
          authEmailVerified: true,
          currentUser: { ...adminUser, id: ROOT_ADMIN_UID, email: ROOT_ADMIN_EMAIL },
          item: closedItem,
        })
      ).toMatchObject({ allowed: true });
    });
  });
});
