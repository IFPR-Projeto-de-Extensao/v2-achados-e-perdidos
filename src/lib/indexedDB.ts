// IndexedDB Persistence Layer for RNF02 (Fast system & Offline capability)
// Includes dedicated sync-queue for offline user registration requests
import { LostFoundItem, SyncQueueEntry } from "../types";

const DB_NAME = "IFPRAchadosPerdidosDB";
const DB_VERSION = 2;
const STORE_ITEMS = "items_store";
const STORE_ERRORS = "errors_offline_store";
const STORE_SYNC_QUEUE = "sync_queue_store";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("IndexedDB não disponível no navegador."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
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
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// -------------------------------------------------------------
// ITEMS STORE
// -------------------------------------------------------------

export async function saveItemsToIndexedDB(items: LostFoundItem[]): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_ITEMS, "readwrite");
    const store = tx.objectStore(STORE_ITEMS);
    
    // Clear old records and save current snapshot
    store.clear();
    for (const item of items) {
      store.put(item);
    }
    
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("Aviso ao salvar itens no IndexedDB:", err);
  }
}

export async function getItemsFromIndexedDB(): Promise<LostFoundItem[]> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_ITEMS, "readonly");
    const store = tx.objectStore(STORE_ITEMS);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
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
    store.put(item);
  } catch (err) {
    console.warn("Aviso ao salvar item individual no IndexedDB:", err);
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
// SYNC QUEUE STORE (Offline User Registration Requests)
// -------------------------------------------------------------

export async function queueOfflineItemRegistration(item: LostFoundItem): Promise<SyncQueueEntry> {
  const queueEntry: SyncQueueEntry = {
    id: `queue-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    type: "REGISTER_ITEM",
    payload: {
      ...item,
      isOfflineQueued: true,
    },
    createdAt: new Date().toISOString(),
    status: "PENDENTE",
    attempts: 0,
  };

  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_SYNC_QUEUE, "readwrite");
    const store = tx.objectStore(STORE_SYNC_QUEUE);
    store.put(queueEntry);

    // Also persist into local items store so user sees it in views immediately
    await saveSingleItemIndexedDB(queueEntry.payload);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        console.log(`[Offline Sync] Cadastro de objeto "${item.title}" armazenado na fila IndexedDB:`, queueEntry.id);
        resolve(queueEntry);
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error("Erro ao salvar cadastro na fila IndexedDB:", err);
    return queueEntry;
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
        // Return sorted by creation date
        all.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        resolve(all);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn("Aviso ao ler fila de sincronização IndexedDB:", err);
    return [];
  }
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
    });
  } catch (err) {
    console.warn("Aviso ao remover entrada da fila de sincronização:", err);
  }
}

export async function updateSyncQueueEntry(id: string, updates: Partial<SyncQueueEntry>): Promise<void> {
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
    });
  } catch (err) {
    console.warn("Aviso ao limpar fila de sincronização:", err);
  }
}
