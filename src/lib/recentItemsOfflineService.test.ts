import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  cacheSearchedItems,
  getLocalCachedRecentItems,
  getOfflineRecentItems,
  cacheSingleItemPreview,
  isUserOffline,
} from "./recentItemsOfflineService";
import { LostFoundItem } from "../types";

// In-memory Storage polyfill for node test environment
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] || null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
}

if (typeof globalThis.localStorage === "undefined") {
  (globalThis as any).localStorage = new MemoryStorage();
}

if (typeof (globalThis as any).window === "undefined") {
  (globalThis as any).window = globalThis;
}

if (typeof (globalThis as any).navigator === "undefined") {
  (globalThis as any).navigator = { onLine: true };
}

describe("recentItemsOfflineService", () => {
  const sampleItemA: LostFoundItem = {
    id: "item_test_1",
    title: "Mochila Preta IFPR",
    description: "Mochila escolar preta encontrada no Bloco Didático",
    category: "Material Escolar & Livros",
    type: "ENCONTRADO",
    status: "DISPONIVEL",
    color: "Preto",
    brand: "IFPR",
    location: "Bloco Didático (Salas 01 a 12)",
    date: "2026-03-15",
    registeredByUserId: "user_servidor",
    registeredByName: "Servidor Teste",
    registeredByRole: "SERVIDOR",
    contactInfo: "servidor@ifpr.edu.br",
    qrCodeId: "QR-TEST-01",
    imageUrl: "https://images.unsplash.com/photo-test-1",
    createdAt: "2026-03-15T10:00:00Z",
  };

  const sampleItemB: LostFoundItem = {
    id: "item_test_2",
    title: "Chaveiro com Chaves",
    description: "Chaveiro com 3 chaves encontrado na Biblioteca",
    category: "Chaves",
    type: "PERDIDO",
    status: "DISPONIVEL",
    color: "Prata",
    brand: "Papaiz",
    location: "Biblioteca Campus Ivaiporã",
    date: "2026-03-16",
    registeredByUserId: "user_aluno",
    registeredByName: "Aluno Teste",
    registeredByRole: "ALUNO",
    contactInfo: "aluno@estudante.ifpr.edu.br",
    qrCodeId: "QR-TEST-02",
    imageUrl: "https://images.unsplash.com/photo-test-2",
    createdAt: "2026-03-16T11:00:00Z",
  };

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("correctly checks offline status based on navigator.onLine", () => {
    expect(typeof isUserOffline()).toBe("boolean");
  });

  it("caches searched items into localStorage and reads them back", async () => {
    await cacheSearchedItems([sampleItemA, sampleItemB], "mochila");
    const cached = getLocalCachedRecentItems();

    expect(cached).toHaveLength(2);
    expect(cached[0].id).toBe("item_test_1");
    expect(cached[1].id).toBe("item_test_2");
  });

  it("deduplicates items when caching subsequent search results", async () => {
    await cacheSearchedItems([sampleItemA], "mochila");

    const updatedItemA: LostFoundItem = {
      ...sampleItemA,
      title: "Mochila Preta IFPR Atualizada",
    };

    await cacheSearchedItems([updatedItemA, sampleItemB], "geral");
    const cached = getLocalCachedRecentItems();

    expect(cached).toHaveLength(2);
    expect(cached[0].id).toBe("item_test_1");
    expect(cached[0].title).toBe("Mochila Preta IFPR Atualizada");
    expect(cached[1].id).toBe("item_test_2");
  });

  it("retrieves offline recent items with fallback to localStorage", async () => {
    await cacheSearchedItems([sampleItemA]);
    const result = await getOfflineRecentItems();

    expect(result.items).toHaveLength(1);
    expect(result.count).toBe(1);
    expect(result.items[0].id).toBe("item_test_1");
    expect(["local-storage", "service-worker"]).toContain(result.source);
  });

  it("caches single item preview", () => {
    cacheSingleItemPreview(sampleItemB);
    const cached = getLocalCachedRecentItems();

    expect(cached).toHaveLength(1);
    expect(cached[0].id).toBe("item_test_2");
    expect(cached[0].title).toBe("Chaveiro com Chaves");
  });
});
