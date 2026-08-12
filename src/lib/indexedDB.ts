// IndexedDB Persistence Layer for RNF02 (Fast system & Offline capability)
import { LostFoundItem } from "../types";

const DB_NAME = "IFPRAchadosPerdidosDB";
const DB_VERSION = 1;
const STORE_ITEMS = "items_store";
const STORE_ERRORS = "errors_offline_store";

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
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

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
