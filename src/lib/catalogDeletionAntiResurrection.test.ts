import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LostFoundItem, User } from "../types";
import {
  resolveCatalogDisplayState,
  canHydrateCatalogFromIndexedDB,
  filterExcludedCatalogItems,
  evaluateItemDeletionEligibility,
  evaluateSyncQueueUploadAgainstDeletions,
} from "./catalogDeletionService";
import {
  cacheSearchedItems,
  getOfflineRecentItems,
  getLocalCachedRecentItems,
  removeItemsFromOfflineRecentCache,
  syncOfflineRecentCacheWithAuthoritativeCatalog,
  clearOfflineRecentCache,
  subscribeOfflineRecentItemsChange,
  cacheSingleItemPreview,
} from "./recentItemsOfflineService";
import {
  saveDeletedItemTombstones,
  getActiveDeletedTombstoneIds,
  hasActiveDeletedTombstone,
  pruneExpiredTombstones,
  saveItemsToIndexedDB,
  getItemsFromIndexedDB,
  deleteItemsFromIndexedDB,
  queueOfflineItemRegistration,
  getPendingSyncQueue,
  removeSyncQueueEntryByItemId,
} from "./indexedDB";

function createTestItem(
  id: string,
  overrides: Partial<LostFoundItem> = {}
): LostFoundItem {
  return {
    id,
    title: `Objeto Teste ${id}`,
    description: "Descrição de teste isolado",
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
  approvalStatus: "APROVADO",
} as User;

const ownerServidorUser: User = {
  id: "uid-servidor-1",
  name: "Servidor Teste",
  email: "servidor1@ifpr.edu.br",
  role: "SERVIDOR",
  status: "active",
  approvalStatus: "APROVADO",
} as User;

const otherServidorUser: User = {
  id: "uid-servidor-2",
  name: "Outro Servidor",
  email: "servidor2@ifpr.edu.br",
  role: "SERVIDOR",
  status: "active",
  approvalStatus: "APROVADO",
} as User;

// Lightweight in-memory browser harness (localStorage + SW Cache + IndexedDB mock)
function setupBrowserEnvironment() {
  const lsStore = new Map<string, string>();
  const swCache = new Map<string, any>();

  const localStorageMock = {
    getItem: (key: string) => (lsStore.has(key) ? lsStore.get(key)! : null),
    setItem: (key: string, value: string) => {
      lsStore.set(key, String(value));
    },
    removeItem: (key: string) => {
      lsStore.delete(key);
    },
    clear: () => {
      lsStore.clear();
    },
  };

  // Mirrors public/sw-custom.js handlers (CACHE_RECENT_SEARCH_ITEMS, REPLACE_OFFLINE_RECENT_ITEMS, REMOVE_OFFLINE_RECENT_ITEMS, CLEAR_OFFLINE_RECENT_ITEMS, GET_OFFLINE_RECENT_ITEMS)
  const swController = {
    postMessage: (msg: any, ports?: any[]) => {
      if (msg.type === "CACHE_RECENT_SEARCH_ITEMS" && Array.isArray(msg.items)) {
        const payload = { items: msg.items, count: msg.items.length, cachedAt: msg.timestamp || Date.now() };
        swCache.set("/api/offline-recent-items", payload);
        swCache.set("/offline-recent-items.json", payload);
        for (const it of msg.items) {
          if (it?.id) swCache.set(`/api/items/${it.id}`, it);
        }
      } else if (msg.type === "REPLACE_OFFLINE_RECENT_ITEMS") {
        const items = Array.isArray(msg.items) ? msg.items : [];
        if (items.length === 0) {
          swCache.clear();
          return;
        }
        const keepIds = new Set(items.map((it: any) => String(it.id)));
        for (const key of Array.from(swCache.keys())) {
          if (key.startsWith("/api/items/")) {
            const id = key.slice("/api/items/".length);
            if (!keepIds.has(id)) swCache.delete(key);
          }
        }
        const payload = { items, count: items.length, cachedAt: msg.timestamp || Date.now() };
        swCache.set("/api/offline-recent-items", payload);
        swCache.set("/offline-recent-items.json", payload);
        for (const it of items) {
          if (it?.id) swCache.set(`/api/items/${it.id}`, it);
        }
      } else if (msg.type === "REMOVE_OFFLINE_RECENT_ITEMS") {
        const removeSet = new Set((msg.itemIds || []).map(String));
        for (const id of removeSet) {
          swCache.delete(`/api/items/${id}`);
        }
        const remaining = Array.isArray(msg.remainingItems) ? msg.remainingItems : [];
        if (remaining.length === 0) {
          swCache.clear();
        } else {
          const payload = { items: remaining, count: remaining.length, cachedAt: msg.timestamp || Date.now() };
          swCache.set("/api/offline-recent-items", payload);
          swCache.set("/offline-recent-items.json", payload);
        }
      } else if (msg.type === "CLEAR_OFFLINE_RECENT_ITEMS") {
        swCache.clear();
      } else if (msg.type === "CACHE_SINGLE_ITEM_PREVIEW" && msg.item?.id) {
        swCache.set(`/api/items/${msg.item.id}`, msg.item);
      } else if (msg.type === "GET_OFFLINE_RECENT_ITEMS" && ports && ports[0]) {
        const payload = swCache.get("/api/offline-recent-items") || {
          items: [],
          count: 0,
          cachedAt: Date.now(),
        };
        ports[0].postMessage({ type: "OFFLINE_RECENT_ITEMS_RESPONSE", data: payload });
      }
    },
  };

  class MockMessageChannel {
    port1: any = { onmessage: null };
    port2: any = {
      postMessage: (data: any) => {
        if (this.port1.onmessage) this.port1.onmessage({ data });
      },
    };
  }

  // Lightweight in-memory IndexedDB mock supporting stores used by src/lib/indexedDB.ts
  const idbStores = new Map<string, Map<string, any>>();
  const keyPaths = new Map<string, string>();

  const mockDb = {
    objectStoreNames: {
      contains: (name: string) => idbStores.has(name),
    },
    createObjectStore: (name: string, opts?: { keyPath?: string }) => {
      if (!idbStores.has(name)) idbStores.set(name, new Map());
      keyPaths.set(name, opts?.keyPath || "id");
      return {
        createIndex: () => {},
      };
    },
    transaction: (storeName: string) => {
      if (!idbStores.has(storeName)) idbStores.set(storeName, new Map());
      const backing = idbStores.get(storeName)!;
      const kp = keyPaths.get(storeName) || "id";

      const tx: any = {
        oncomplete: null,
        onerror: null,
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
            const req: any = { onsuccess: null, onerror: null, result: undefined };
            queueMicrotask(() => {
              req.result = backing.has(String(key)) ? structuredClone(backing.get(String(key))) : undefined;
              req.onsuccess?.();
            });
            return req;
          },
          getAll: () => {
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
          tx.oncomplete?.();
        });
      });
      return tx;
    },
  };

  let initialized = false;
  const mockIndexedDB = {
    open: () => {
      const req: any = { onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null, result: mockDb };
      queueMicrotask(() => {
        if (!initialized) {
          initialized = true;
          req.onupgradeneeded?.({ target: { result: mockDb } });
        }
        req.onsuccess?.();
      });
      return req;
    },
  };

  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageMock,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "MessageChannel", {
    value: MockMessageChannel,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: true, serviceWorker: { controller: swController } },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "indexedDB", {
    value: mockIndexedDB,
    configurable: true,
    writable: true,
  });

  return { lsStore, swCache, idbStores };
}

describe("Catalog Deletion, Cache Sync & Anti-Resurrection Suite (Cenários A–M)", () => {
  let env: ReturnType<typeof setupBrowserEnvironment>;

  beforeEach(() => {
    env = setupBrowserEnvironment();
  });

  afterEach(async () => {
    await clearOfflineRecentCache();
  });

  it("Cenário A: criar três objetos e excluir o primeiro purga somente o excluído de todos os caches", async () => {
    const itemA = createTestItem("ITEM-A");
    const itemB = createTestItem("ITEM-B");
    const itemC = createTestItem("ITEM-C");
    const all = [itemA, itemB, itemC];

    await saveItemsToIndexedDB(all);
    await cacheSearchedItems(all, "", {
      isFromOfflineFallback: false,
      authoritativeItemIds: new Set(["ITEM-A", "ITEM-B", "ITEM-C"]),
    });

    // Exclui ITEM-A
    await deleteItemsFromIndexedDB(["ITEM-A"]);
    await removeItemsFromOfflineRecentCache(["ITEM-A"]);
    await syncOfflineRecentCacheWithAuthoritativeCatalog([itemB, itemC]);

    const idbItems = await getItemsFromIndexedDB();
    const recent = await getOfflineRecentItems();
    const display = resolveCatalogDisplayState({
      items: [itemB, itemC],
      isOffline: false,
      catalogSyncState: "authoritative",
      offlineRecentItems: recent.items,
    });

    expect(idbItems.map((i) => i.id)).toEqual(["ITEM-B", "ITEM-C"]);
    expect(recent.items.map((i) => i.id)).toEqual(["ITEM-B", "ITEM-C"]);
    expect(env.swCache.has("/api/items/ITEM-A")).toBe(false);
    expect(env.swCache.has("/api/items/ITEM-B")).toBe(true);
    expect(display.mode).toBe("online-items");
    expect(display.displayItems.map((i) => i.id)).toEqual(["ITEM-B", "ITEM-C"]);
    expect(display.showOfflineBanner).toBe(false);
  });

  it("Cenário B: excluir dois objetos mantendo o terceiro preserva apenas o terceiro no catálogo e nos caches", async () => {
    const itemA = createTestItem("ITEM-A");
    const itemB = createTestItem("ITEM-B");
    const itemC = createTestItem("ITEM-C");

    await saveItemsToIndexedDB([itemA, itemB, itemC]);
    await cacheSearchedItems([itemA, itemB, itemC], "", {
      isFromOfflineFallback: false,
      authoritativeItemIds: new Set(["ITEM-A", "ITEM-B", "ITEM-C"]),
    });

    await deleteItemsFromIndexedDB(["ITEM-A", "ITEM-B"]);
    await removeItemsFromOfflineRecentCache(["ITEM-A", "ITEM-B"]);
    await syncOfflineRecentCacheWithAuthoritativeCatalog([itemC]);

    const idbItems = await getItemsFromIndexedDB();
    const recent = await getOfflineRecentItems();

    expect(idbItems.map((i) => i.id)).toEqual(["ITEM-C"]);
    expect(recent.items.map((i) => i.id)).toEqual(["ITEM-C"]);
    expect(env.swCache.has("/api/items/ITEM-A")).toBe(false);
    expect(env.swCache.has("/api/items/ITEM-B")).toBe(false);
    expect(env.swCache.has("/api/items/ITEM-C")).toBe(true);
  });

  it("Cenário C: excluir o último objeto confirma catálogo vazio sem ressurreição e limpa localStorage, SW e IndexedDB", async () => {
    const itemA = createTestItem("ITEM-A");
    const itemB = createTestItem("ITEM-B");
    const itemC = createTestItem("ITEM-C");

    let reactOfflineRecent: LostFoundItem[] = [];
    const unsub = subscribeOfflineRecentItemsChange((updated) => {
      reactOfflineRecent = updated;
    });

    await saveItemsToIndexedDB([itemA, itemB, itemC]);
    await cacheSearchedItems([itemA, itemB, itemC], "", {
      isFromOfflineFallback: false,
      authoritativeItemIds: new Set(["ITEM-A", "ITEM-B", "ITEM-C"]),
    });
    expect(reactOfflineRecent.length).toBe(3);

    // Exclui todos até o último
    await saveItemsToIndexedDB([]);
    await clearOfflineRecentCache();
    await saveDeletedItemTombstones([
      { itemId: "ITEM-A", reason: "BULK_DELETE" },
      { itemId: "ITEM-B", reason: "BULK_DELETE" },
      { itemId: "ITEM-C", reason: "BULK_DELETE" },
    ]);

    const idbItems = await getItemsFromIndexedDB();
    const recent = await getOfflineRecentItems();
    const display = resolveCatalogDisplayState({
      items: [],
      isOffline: false,
      catalogSyncState: "authoritative",
      offlineRecentItems: reactOfflineRecent,
    });

    unsub();

    expect(idbItems).toEqual([]);
    expect(recent.items).toEqual([]);
    expect(getLocalCachedRecentItems()).toEqual([]);
    expect(env.swCache.size).toBe(0);
    expect(reactOfflineRecent).toEqual([]);
    expect(display.mode).toBe("online-empty");
    expect(display.displayItems).toEqual([]);
    expect(display.showOfflineBanner).toBe(false);
    expect(display.canCacheDisplayedItems).toBe(false);
  });

  it("Cenário D: fechar e reabrir o aplicativo com catálogo vazio impede hidratação stale do IndexedDB e ressurreição", async () => {
    const staleItem = createTestItem("ITEM-STALE");
    // Simula race condition onde IndexedDB ainda tinha dado antigo mas snapshot autoritativo vazio já chegou
    await saveItemsToIndexedDB([staleItem]);
    await saveDeletedItemTombstones([{ itemId: "ITEM-STALE", reason: "LOCAL_DELETE" }]);

    // 1. Snapshot autoritativo vazio impede hidratação do IndexedDB
    expect(
      canHydrateCatalogFromIndexedDB({
        hasAuthoritativeSnapshot: true,
        catalogSyncState: "authoritative",
      })
    ).toBe(false);

    // 2. Mesmo ANTES do snapshot autoritativo chegar, tombstones bloqueiam hidratação de itens excluídos
    const tombstones = await getActiveDeletedTombstoneIds();
    const cached = await getItemsFromIndexedDB();
    const filteredOnBoot = filterExcludedCatalogItems(cached, tombstones);
    expect(filteredOnBoot).toEqual([]);

    // 3. Mesmo se offlineRecentItems tivesse algo por falha externa, online + authoritative retorna vazio
    const display = resolveCatalogDisplayState({
      items: [],
      isOffline: false,
      catalogSyncState: "authoritative",
      offlineRecentItems: [staleItem],
    });
    expect(display.mode).toBe("online-empty");
    expect(display.displayItems).toEqual([]);
    expect(display.showOfflineBanner).toBe(false);
  });

  it("Cenário E: excluir objeto criado offline antes da sincronização cancela fila, grava tombstone e impede recriação na reconexão", async () => {
    const offlineItem = createTestItem("ITEM-OFFLINE-1", { isOfflineQueued: true });

    // 1. Cadastra offline -> entra na fila sync_queue_store
    await queueOfflineItemRegistration(offlineItem);
    expect((await getPendingSyncQueue()).map((e) => e.itemId)).toEqual(["ITEM-OFFLINE-1"]);

    // 2. Exclui enquanto offline -> grava tombstone e remove da fila
    await saveDeletedItemTombstones([
      { itemId: "ITEM-OFFLINE-1", reason: "OFFLINE_DELETE", deletedByUserId: "uid-servidor-1" },
    ]);
    await removeSyncQueueEntryByItemId("ITEM-OFFLINE-1");
    await deleteItemsFromIndexedDB(["ITEM-OFFLINE-1"]);

    expect(await getPendingSyncQueue()).toEqual([]);
    expect(await hasActiveDeletedTombstone("ITEM-OFFLINE-1")).toBe(true);

    // 3. Simula atraso/concorrência de outra aba tentando sincronizar uma cópia antiga da entrada na fila
    const decision = evaluateSyncQueueUploadAgainstDeletions({
      itemId: "ITEM-OFFLINE-1",
      hasActiveTombstone: await hasActiveDeletedTombstone("ITEM-OFFLINE-1"),
      isDeletionInFlight: false,
    });
    expect(decision.shouldUpload).toBe(false);
    expect(decision.shouldDiscardQueueEntry).toBe(true);
    expect(decision.reason).toBe("ACTIVE_TOMBSTONE");

    // 4. Política de retenção de tombstone: NÃO expira enquanto existir entrada pendente para o mesmo itemId
    await queueOfflineItemRegistration(offlineItem);
    await saveDeletedItemTombstones([
      { itemId: "ITEM-OFFLINE-1", reason: "OFFLINE_DELETE", ttlMs: -1000 }, // já expirado no relógio
    ]);
    const prunedWhileQueued = await pruneExpiredTombstones(Date.now());
    expect(prunedWhileQueued).toBe(0);
    expect(await hasActiveDeletedTombstone("ITEM-OFFLINE-1")).toBe(true);

    // Após descartar a entrada pendente, o tombstone expirado pode ser limpo com segurança
    await removeSyncQueueEntryByItemId("ITEM-OFFLINE-1");
    const prunedAfterCleared = await pruneExpiredTombstones(Date.now());
    expect(prunedAfterCleared).toBe(1);
    expect(await hasActiveDeletedTombstone("ITEM-OFFLINE-1")).toBe(false);
  });

  it("Cenário F: dois dispositivos sincronizados — Dispositivo 1 exclui tudo e Dispositivo 2 reconcilia catálogo vazio sem ressurreição", async () => {
    const item1 = createTestItem("DEV-ITEM-1");
    const item2 = createTestItem("DEV-ITEM-2");

    // Dispositivo 2 visualiza catálogo com 2 itens e preenche caches locais
    let dev2OfflineRecent: LostFoundItem[] = [];
    const unsub = subscribeOfflineRecentItemsChange((updated) => {
      dev2OfflineRecent = updated;
    });

    await cacheSearchedItems([item1, item2], "", {
      isFromOfflineFallback: false,
      authoritativeItemIds: new Set(["DEV-ITEM-1", "DEV-ITEM-2"]),
    });
    expect(dev2OfflineRecent.map((i) => i.id)).toEqual(["DEV-ITEM-1", "DEV-ITEM-2"]);

    // Dispositivo 1 exclui DEV-ITEM-1 -> Dispositivo 2 recebe snapshot autoritativo [DEV-ITEM-2]
    await syncOfflineRecentCacheWithAuthoritativeCatalog([item2]);
    expect(dev2OfflineRecent.map((i) => i.id)).toEqual(["DEV-ITEM-2"]);
    expect(env.swCache.has("/api/items/DEV-ITEM-1")).toBe(false);

    // Dispositivo 1 exclui DEV-ITEM-2 (último) -> Dispositivo 2 recebe snapshot.empty -> reconcilia com []
    await syncOfflineRecentCacheWithAuthoritativeCatalog([]);
    const dev2Display = resolveCatalogDisplayState({
      items: [],
      isOffline: false,
      catalogSyncState: "authoritative",
      offlineRecentItems: dev2OfflineRecent,
    });

    unsub();

    expect(dev2OfflineRecent).toEqual([]);
    expect(dev2Display.mode).toBe("online-empty");
    expect(dev2Display.displayItems).toEqual([]);
    expect(dev2Display.showOfflineBanner).toBe(false);
  });

  it("Cenário G: listeners secundários (item_history/item_private) disparando durante exclusão não reinjetam item excluído", () => {
    const itemA = createTestItem("ITEM-A");
    const itemB = createTestItem("ITEM-B");

    // Simula rawPublicItemsRef durante exclusão em andamento de ITEM-A
    const inFlightDeleting = new Set(["ITEM-A"]);
    const safeRawDuringDelete = filterExcludedCatalogItems([itemA, itemB], inFlightDeleting);
    expect(safeRawDuringDelete.map((i) => i.id)).toEqual(["ITEM-B"]);

    // Após exclusão confirmada, rawPublicItemsRef é atualizado imediatamente para [ITEM-B]
    const updatedRawAfterDelete = [itemA, itemB].filter((i) => i.id !== "ITEM-A");
    expect(updatedRawAfterDelete.map((i) => i.id)).toEqual(["ITEM-B"]);
  });

  it("Cenário H: falha de permissão durante exclusão (convidado, não-dono, DEVOLVIDO, ENCERRADO por não-admin) bloqueia corretamente", () => {
    const normalItem = createTestItem("ITEM-1", { registeredByUserId: "uid-servidor-1" });
    const returnedItem = createTestItem("ITEM-2", { status: "DEVOLVIDO", registeredByUserId: "uid-servidor-1" });
    const closedItem = createTestItem("ITEM-3", { status: "ENCERRADO", registeredByUserId: "uid-servidor-1" });

    // Convidado
    expect(
      evaluateItemDeletionEligibility({ isGuest: true, authUid: null, item: normalItem })
    ).toMatchObject({ allowed: false, code: "UNAUTHENTICATED" });

    // Outro servidor (não-dono, não-admin)
    expect(
      evaluateItemDeletionEligibility({
        isGuest: false,
        authUid: "uid-servidor-2",
        currentUser: otherServidorUser,
        item: normalItem,
      })
    ).toMatchObject({ allowed: false, code: "FORBIDDEN" });

    // Item DEVOLVIDO bloqueado até para ADMIN
    expect(
      evaluateItemDeletionEligibility({
        isGuest: false,
        authUid: "uid-admin-1",
        currentUser: adminUser,
        item: returnedItem,
      })
    ).toMatchObject({ allowed: false, code: "ITEM_RETURNED" });

    // Item ENCERRADO bloqueado para autor não-admin, permitido para ADMIN
    expect(
      evaluateItemDeletionEligibility({
        isGuest: false,
        authUid: "uid-servidor-1",
        currentUser: ownerServidorUser,
        item: closedItem,
      })
    ).toMatchObject({ allowed: false, code: "ITEM_CLOSED_REQUIRES_ADMIN" });

    expect(
      evaluateItemDeletionEligibility({
        isGuest: false,
        authUid: "uid-admin-1",
        currentUser: adminUser,
        item: closedItem,
      })
    ).toMatchObject({ allowed: true });
  });

  it("Cenário I: falha parcial em exclusão em lote separa itens permitidos de bloqueados sem mascarar falhas", () => {
    const batchItems = [
      createTestItem("OK-1", { registeredByUserId: "uid-servidor-1", status: "ENCONTRADO" }),
      createTestItem("BLOCKED-RETURNED", { registeredByUserId: "uid-servidor-1", status: "DEVOLVIDO" }),
      createTestItem("BLOCKED-OTHER-OWNER", { registeredByUserId: "uid-servidor-2", status: "ENCONTRADO" }),
    ];

    const succeeded: string[] = [];
    const failed: Record<string, string> = {};

    for (const item of batchItems) {
      const check = evaluateItemDeletionEligibility({
        isGuest: false,
        authUid: "uid-servidor-1",
        currentUser: ownerServidorUser,
        item,
      });
      if (check.allowed) {
        succeeded.push(item.id);
      } else {
        failed[item.id] = check.reason || "Negado";
      }
    }

    expect(succeeded).toEqual(["OK-1"]);
    expect(Object.keys(failed)).toEqual(["BLOCKED-RETURNED", "BLOCKED-OTHER-OWNER"]);
    expect(failed["BLOCKED-RETURNED"]).toContain("devolvidos");
  });

  it("Cenário J: catálogo vazio com internet disponível exibe estado vazio sem banner offline e loading inicial antes do snapshot", () => {
    // Carregamento inicial online (sem snapshot autoritativo ainda)
    const loadingDisplay = resolveCatalogDisplayState({
      items: [],
      isOffline: false,
      catalogSyncState: "loading",
      offlineRecentItems: [createTestItem("OLD-CACHE")],
    });
    expect(loadingDisplay.mode).toBe("online-loading");
    expect(loadingDisplay.displayItems).toEqual([]);
    expect(loadingDisplay.showOfflineBanner).toBe(false);
    expect(loadingDisplay.canCacheDisplayedItems).toBe(false);

    // Catálogo vazio confirmado online
    const emptyOnlineDisplay = resolveCatalogDisplayState({
      items: [],
      isOffline: false,
      catalogSyncState: "authoritative",
      offlineRecentItems: [createTestItem("OLD-CACHE")],
    });
    expect(emptyOnlineDisplay.mode).toBe("online-empty");
    expect(emptyOnlineDisplay.displayItems).toEqual([]);
    expect(emptyOnlineDisplay.showOfflineBanner).toBe(false);
  });

  it("Cenário K: catálogo offline com dados legítimos exibe fallback offline sem regravar fallback no cache", async () => {
    const legitItem = createTestItem("LEGIT-OFFLINE-1");
    await cacheSearchedItems([legitItem], "", {
      isFromOfflineFallback: false,
      authoritativeItemIds: new Set(["LEGIT-OFFLINE-1"]),
    });

    const offlineDisplay = resolveCatalogDisplayState({
      items: [],
      isOffline: true,
      catalogSyncState: "offline-fallback",
      offlineRecentItems: [legitItem],
    });

    expect(offlineDisplay.mode).toBe("offline-fallback");
    expect(offlineDisplay.displayItems.map((i) => i.id)).toEqual(["LEGIT-OFFLINE-1"]);
    expect(offlineDisplay.showOfflineBanner).toBe(true);
    expect(offlineDisplay.canCacheDisplayedItems).toBe(false);

    // Tentativa de gravar resultado do próprio fallback no cache é bloqueada
    const phantomItem = createTestItem("PHANTOM-FALLBACK");
    await cacheSearchedItems([phantomItem], "", { isFromOfflineFallback: true });
    cacheSingleItemPreview(phantomItem, { isFromOfflineFallback: true });
    expect(getLocalCachedRecentItems().map((i) => i.id)).toEqual(["LEGIT-OFFLINE-1"]);

    // Offline sem nenhum dado local disponível
    const offlineEmptyDisplay = resolveCatalogDisplayState({
      items: [],
      isOffline: true,
      catalogSyncState: "offline-fallback",
      offlineRecentItems: [],
    });
    expect(offlineEmptyDisplay.mode).toBe("offline-empty");
    expect(offlineEmptyDisplay.displayItems).toEqual([]);
    expect(offlineEmptyDisplay.showOfflineBanner).toBe(true);
  });

  it("Cenário L: recuperação da conexão após operações offline sincroniza cadastros legítimos e descarta itens com tombstone", async () => {
    const deletedOfflineItem = createTestItem("OFFLINE-DEL", { isOfflineQueued: true });
    const keptOfflineItem = createTestItem("OFFLINE-KEEP", { isOfflineQueued: true });

    await queueOfflineItemRegistration(deletedOfflineItem);
    await queueOfflineItemRegistration(keptOfflineItem);

    // Usuário exclui OFFLINE-DEL enquanto offline, mantendo OFFLINE-KEEP
    await saveDeletedItemTombstones([{ itemId: "OFFLINE-DEL", reason: "OFFLINE_DELETE" }]);

    const queueOnReconnect = await getPendingSyncQueue();
    const toUpload: string[] = [];
    const discarded: string[] = [];

    for (const entry of queueOnReconnect) {
      const id = entry.itemId || entry.payload.id;
      const decision = evaluateSyncQueueUploadAgainstDeletions({
        itemId: id,
        hasActiveTombstone: await hasActiveDeletedTombstone(id),
        isDeletionInFlight: false,
      });
      if (decision.shouldUpload) {
        toUpload.push(id);
      } else {
        discarded.push(id);
        await removeSyncQueueEntryByItemId(id);
      }
    }

    expect(discarded).toEqual(["OFFLINE-DEL"]);
    expect(toUpload).toEqual(["OFFLINE-KEEP"]);
    // Cadastro legítimo foi preservado na fila
    expect((await getPendingSyncQueue()).map((e) => e.itemId)).toEqual(["OFFLINE-KEEP"]);
  });
});
