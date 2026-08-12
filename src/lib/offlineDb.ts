import { LostFoundItem, ItemClaim } from "../types";

const DB_NAME = "IFPRAchadosPerdidosOfflineDB";
const DB_VERSION = 1;

export interface OfflineSyncQueueItem {
  id?: number;
  type: "CREATE_CLAIM" | "UPDATE_STATUS" | "REGISTER_ITEM";
  payload: any;
  timestamp: string;
}

export interface PerformanceMetricLog {
  id?: string;
  metricName: string;
  durationMs: number;
  timestamp: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB não é suportado neste navegador."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Store 1: Items
      if (!db.objectStoreNames.contains("items")) {
        db.createObjectStore("items", { keyPath: "id" });
      }

      // Store 2: Claims
      if (!db.objectStoreNames.contains("claims")) {
        db.createObjectStore("claims", { keyPath: "id" });
      }

      // Store 3: Sync Queue
      if (!db.objectStoreNames.contains("syncQueue")) {
        db.createObjectStore("syncQueue", { keyPath: "id", autoIncrement: true });
      }

      // Store 4: Performance Logs
      if (!db.objectStoreNames.contains("performanceLogs")) {
        db.createObjectStore("performanceLogs", { keyPath: "id", autoIncrement: true });
      }
    };
  });
}

/** Save items to IndexedDB for offline access */
export async function saveItemsOffline(items: LostFoundItem[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction("items", "readwrite");
    const store = tx.objectStore("items");
    for (const item of items) {
      store.put(item);
    }
  } catch (err) {
    console.warn("Erro ao salvar itens no IndexedDB:", err);
  }
}

/** Get items from IndexedDB when offline */
export async function getOfflineItems(): Promise<LostFoundItem[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("items", "readonly");
      const store = tx.objectStore("items");
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn("Erro ao ler itens do IndexedDB:", err);
    return [];
  }
}

/** Queue an action performed offline */
export async function queueOfflineAction(type: OfflineSyncQueueItem["type"], payload: any): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction("syncQueue", "readwrite");
    const store = tx.objectStore("syncQueue");
    store.add({
      type,
      payload,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("Erro ao enfileirar ação offline:", err);
  }
}

/** Get all pending offline actions */
export async function getPendingOfflineActions(): Promise<OfflineSyncQueueItem[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("syncQueue", "readonly");
      const store = tx.objectStore("syncQueue");
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn("Erro ao ler fila de sincronização offline:", err);
    return [];
  }
}

/** Save performance monitoring log offline */
export async function savePerformanceMetricLog(metricName: string, durationMs: number): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction("performanceLogs", "readwrite");
    const store = tx.objectStore("performanceLogs");
    store.add({
      metricName,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("Erro ao registrar métrica de performance offline:", err);
  }
}

/** Retrieve performance logs stored in IndexedDB */
export async function getOfflinePerformanceLogs(): Promise<PerformanceMetricLog[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("performanceLogs", "readonly");
      const store = tx.objectStore("performanceLogs");
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn("Erro ao buscar logs de performance do IndexedDB:", err);
    return [];
  }
}
