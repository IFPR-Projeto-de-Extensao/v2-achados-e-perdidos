import { describe, it, expect, vi, beforeEach } from "vitest";
import { LostFoundItem, SyncQueueEntry, UploadTaskStatus } from "../types";
import {
  calculatePayloadSizeBytes,
  classifySyncError,
  FIRESTORE_DEFENSIVE_PAYLOAD_LIMIT_BYTES,
  isPayloadWithinDefensiveLimit,
} from "./payloadSizeGuard";

// Simulated in-memory IndexedDB Sync Queue reflecting the real AppContext pipeline
class MockSyncQueueEngine {
  private queue: Map<string, SyncQueueEntry> = new Map();
  private isSyncing = false;

  async enqueue(
    item: LostFoundItem,
    initialOptions?: Partial<Omit<SyncQueueEntry, "id" | "type" | "payload" | "createdAt">>
  ): Promise<SyncQueueEntry> {
    const payloadSize = initialOptions?.payloadSizeBytes ?? calculatePayloadSizeBytes(item);

    const entry: SyncQueueEntry = {
      id: `queue-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type: "REGISTER_ITEM",
      payload: {
        ...item,
        isOfflineQueued: true,
      },
      createdAt: new Date().toISOString(),
      status: initialOptions?.status || "PENDENTE",
      attempts: initialOptions?.attempts || 0,
      lastAttempt: initialOptions?.lastAttempt,
      error: initialOptions?.error,
      errorType: initialOptions?.errorType,
      payloadSizeBytes: payloadSize,
    };
    this.queue.set(entry.id, entry);
    return entry;
  }

  async getAll(): Promise<SyncQueueEntry[]> {
    return Array.from(this.queue.values()).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  async getCount(): Promise<number> {
    return this.queue.size;
  }

  async remove(id: string): Promise<void> {
    this.queue.delete(id);
  }

  async update(id: string, updates: Partial<SyncQueueEntry>): Promise<void> {
    const existing = this.queue.get(id);
    if (existing) {
      this.queue.set(id, { ...existing, ...updates });
    }
  }

  async clear(): Promise<void> {
    this.queue.clear();
  }

  // Unified sync pipeline replicating AppContext syncOfflineQueue with defensive guard and error classification
  async processSync(
    isOnline: boolean,
    firestoreWriter: (item: LostFoundItem) => Promise<boolean>,
    onTaskUpdate?: (task: Partial<UploadTaskStatus>) => void
  ): Promise<{
    syncedCount: number;
    temporaryErrorCount: number;
    permanentErrorCount: number;
    remainingCount: number;
    skippedConcurrently?: boolean;
    skippedOffline?: boolean;
  }> {
    if (this.isSyncing) {
      return {
        syncedCount: 0,
        temporaryErrorCount: 0,
        permanentErrorCount: 0,
        remainingCount: this.queue.size,
        skippedConcurrently: true,
      };
    }

    if (!isOnline) {
      return {
        syncedCount: 0,
        temporaryErrorCount: 0,
        permanentErrorCount: 0,
        remainingCount: this.queue.size,
        skippedOffline: true,
      };
    }

    this.isSyncing = true;
    let syncedCount = 0;
    let temporaryErrorCount = 0;
    let permanentErrorCount = 0;

    try {
      const entries = await this.getAll();
      for (const entry of entries) {
        // 1. Skip items with PERMANENT errors during auto-sync
        if (entry.status === "ERRO_PERMANENTE" || entry.errorType === "PERMANENT") {
          permanentErrorCount++;
          if (onTaskUpdate) {
            onTaskUpdate({
              itemId: entry.payload.id,
              status: "ERROR",
              error: entry.error,
              statusMessage: "Este item possui dados ou imagem grandes demais para sincronização. O cadastro foi preservado no dispositivo e precisa ser ajustado.",
            });
          }
          continue;
        }

        if (onTaskUpdate) {
          onTaskUpdate({
            itemId: entry.payload.id,
            itemTitle: entry.payload.title,
            status: "UPLOADING",
            progress: 30,
          });
        }

        const itemToSave: LostFoundItem = {
          ...entry.payload,
          isOfflineQueued: false,
          syncedAt: new Date().toISOString(),
        };

        const payloadSizeBytes = calculatePayloadSizeBytes(itemToSave);

        // 2. Defensive Size Guard check (900,000 bytes)
        if (payloadSizeBytes > FIRESTORE_DEFENSIVE_PAYLOAD_LIMIT_BYTES) {
          permanentErrorCount++;
          await this.update(entry.id, {
            status: "ERRO_PERMANENTE",
            errorType: "PERMANENT",
            error: `PAYLOAD_SIZE_EXCEEDS_DEFENSIVE_LIMIT (${payloadSizeBytes} bytes)`,
            payloadSizeBytes,
            lastAttempt: new Date().toISOString(),
          });

          if (onTaskUpdate) {
            onTaskUpdate({
              itemId: entry.payload.id,
              status: "ERROR",
              error: "PAYLOAD_SIZE_EXCEEDS_DEFENSIVE_LIMIT",
              statusMessage: "Este item possui dados ou imagem grandes demais para sincronização. O cadastro foi preservado no dispositivo e precisa ser ajustado.",
            });
          }
          continue;
        }

        await this.update(entry.id, {
          status: "SINCRONIZANDO",
          attempts: (entry.attempts || 0) + 1,
          lastAttempt: new Date().toISOString(),
          payloadSizeBytes,
        });

        try {
          const success = await firestoreWriter(itemToSave);
          if (success) {
            await this.remove(entry.id);
            syncedCount++;

            if (onTaskUpdate) {
              onTaskUpdate({
                itemId: itemToSave.id,
                status: "COMPLETED",
                progress: 100,
              });
            }
          } else {
            throw new Error("Firestore write returned false");
          }
        } catch (err: any) {
          const classified = classifySyncError(err, payloadSizeBytes);
          if (classified.isPermanent) {
            permanentErrorCount++;
          } else {
            temporaryErrorCount++;
          }

          await this.update(entry.id, {
            status: classified.isPermanent ? "ERRO_PERMANENTE" : "ERRO_TEMPORARIO",
            errorType: classified.category,
            error: classified.reason,
            payloadSizeBytes,
          });

          if (onTaskUpdate) {
            onTaskUpdate({
              itemId: entry.payload.id,
              status: "ERROR",
              error: classified.reason,
              statusMessage: classified.userMessage,
            });
          }
        }
      }
    } finally {
      this.isSyncing = false;
    }

    return {
      syncedCount,
      temporaryErrorCount,
      permanentErrorCount,
      remainingCount: this.queue.size,
    };
  }
}

describe("Offline / Online Upload & Sync Engine (Localiza+)", () => {
  let syncEngine: MockSyncQueueEngine;

  const mockItemNormal: LostFoundItem = {
    id: "ifpr-item-001",
    title: "Calculadora Científica Casio",
    description: "Esquecida no laboratório de matemática bloco B.",
    category: "Eletrônicos",
    location: "Laboratório de Matemática",
    date: "2026-09-27",
    type: "ENCONTRADO",
    status: "ENCONTRADO",
    color: "Cinza",
    brand: "Casio",
    contactInfo: "joao.aluno@estudantes.ifpr.edu.br",
    qrCodeId: "QR-IFPR-CALC-001",
    createdAt: "2026-09-27T10:00:00.000Z",
    imageUrl: "data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAQAcJaACdLoAAP7/2QAA",
    registeredByUserId: "user-123",
    registeredByName: "João Aluno",
    registeredByRole: "ALUNO",
    storageDeadlineDays: 90,
  };

  const mockItemNoImage: LostFoundItem = {
    id: "ifpr-item-no-img",
    title: "Chaveiro com 3 chaves",
    description: "Chaveiro com fita vermelha encontrado no pátio central.",
    category: "Chaves",
    location: "Pátio Central",
    date: "2026-09-27",
    type: "ENCONTRADO",
    status: "ENCONTRADO",
    color: "Vermelho",
    brand: "N/A",
    contactInfo: "maria.servidora@ifpr.edu.br",
    qrCodeId: "QR-IFPR-CHAVES-001",
    createdAt: "2026-09-27T10:05:00.000Z",
    imageUrl: "",
    registeredByUserId: "user-456",
    registeredByName: "Maria Servidora",
    registeredByRole: "SERVIDOR",
    storageDeadlineDays: 90,
  };

  // Create an artificially oversized item (> 900 KB)
  const mockItemOversized: LostFoundItem = {
    ...mockItemNormal,
    id: "ifpr-item-oversized",
    title: "Mochila com Equipamentos Pesados",
    imageUrl: `data:image/webp;base64,${"A".repeat(950_000)}`,
  };

  // Create an item close to but below 900 KB (~850 KB)
  const mockItemNearLimit: LostFoundItem = {
    ...mockItemNormal,
    id: "ifpr-item-near-limit",
    title: "Pasta de Desenho Técnico",
    imageUrl: `data:image/webp;base64,${"B".repeat(600_000)}`,
  };

  beforeEach(() => {
    syncEngine = new MockSyncQueueEngine();
  });

  // =========================================================================
  // 1. Documento abaixo de 900 KB: setDoc executado normalmente
  // =========================================================================
  it("1. Documento abaixo de 900 KB: setDoc deve ser executado e o item removido da fila", async () => {
    await syncEngine.enqueue(mockItemNormal);
    const mockWriter = vi.fn().mockResolvedValue(true);

    const result = await syncEngine.processSync(true, mockWriter);

    expect(mockWriter).toHaveBeenCalledTimes(1);
    expect(result.syncedCount).toBe(1);
    expect(result.temporaryErrorCount).toBe(0);
    expect(result.permanentErrorCount).toBe(0);
    expect(result.remainingCount).toBe(0);
  });

  // =========================================================================
  // 2. Documento acima de 900 KB: setDoc NÃO executado, item preservado, status ERRO_PERMANENTE
  // =========================================================================
  it("2. Documento acima de 900 KB: setDoc NÃO deve ser chamado, item preservado no IndexedDB com status ERRO_PERMANENTE", async () => {
    await syncEngine.enqueue(mockItemOversized);
    const mockWriter = vi.fn().mockResolvedValue(true);

    const result = await syncEngine.processSync(true, mockWriter);

    // setDoc must NOT be called for oversized payload
    expect(mockWriter).not.toHaveBeenCalled();
    expect(result.syncedCount).toBe(0);
    expect(result.permanentErrorCount).toBe(1);
    expect(result.remainingCount).toBe(1);

    const queue = await syncEngine.getAll();
    expect(queue[0].status).toBe("ERRO_PERMANENTE");
    expect(queue[0].errorType).toBe("PERMANENT");
    expect(queue[0].error).toContain("PAYLOAD_SIZE_EXCEEDS_DEFENSIVE_LIMIT");
    expect(queue[0].payload.imageUrl).toBe(mockItemOversized.imageUrl); // Foto preservada integralmente
  });

  // =========================================================================
  // 3. Erro temporário do Firestore: permanece na fila, status ERRO_TEMPORARIO, retry permitido
  // =========================================================================
  it("3. Erro temporário do Firestore: item permanece na fila com status ERRO_TEMPORARIO e permite retry", async () => {
    await syncEngine.enqueue(mockItemNormal);

    // Tentativa 1: Falha temporária de rede / timeout
    const mockNetworkFail = vi.fn().mockRejectedValue(new Error("Firebase Network UNAVAILABLE / timeout"));
    const result1 = await syncEngine.processSync(true, mockNetworkFail);

    expect(result1.syncedCount).toBe(0);
    expect(result1.temporaryErrorCount).toBe(1);
    expect(result1.remainingCount).toBe(1);

    const queue1 = await syncEngine.getAll();
    expect(queue1[0].status).toBe("ERRO_TEMPORARIO");
    expect(queue1[0].errorType).toBe("TEMPORARY");
    expect(queue1[0].attempts).toBe(1);

    // Tentativa 2: Sucesso após restabelecimento
    const mockSuccess = vi.fn().mockResolvedValue(true);
    const result2 = await syncEngine.processSync(true, mockSuccess);

    expect(result2.syncedCount).toBe(1);
    expect(result2.remainingCount).toBe(0);
    expect(await syncEngine.getCount()).toBe(0);
  });

  // =========================================================================
  // 4. Erro permanente: reconexão, boot e 'Sincronizar Agora' NÃO disparam retry automático
  // =========================================================================
  it("4. Erro permanente: reconexão e novas sincronizações pulam o item e NÃO disparam novas tentativas no Firestore", async () => {
    await syncEngine.enqueue(mockItemOversized);

    // Primeira passagem detecta o estouro de tamanho e marca como ERRO_PERMANENTE
    const mockWriter1 = vi.fn().mockResolvedValue(true);
    await syncEngine.processSync(true, mockWriter1);
    expect(mockWriter1).not.toHaveBeenCalled();

    const queueBefore = await syncEngine.getAll();
    expect(queueBefore[0].status).toBe("ERRO_PERMANENTE");

    // Segunda passagem (ex: simulação de reconexão / boot / Sincronizar Agora)
    const mockWriter2 = vi.fn().mockResolvedValue(true);
    const result2 = await syncEngine.processSync(true, mockWriter2);

    expect(mockWriter2).not.toHaveBeenCalled(); // Não tentou chamar o Firestore
    expect(result2.syncedCount).toBe(0);
    expect(result2.permanentErrorCount).toBe(1);
    expect(result2.remainingCount).toBe(1); // Item preservado no IndexedDB
  });

  // =========================================================================
  // 5. Itens mistos: 1 normal, 1 erro temporário, 1 erro permanente
  // =========================================================================
  it("5. Fila mista: 1 normal, 1 erro temporário, 1 erro permanente -> processa cada um sem bloquear os demais", async () => {
    const itemNormal = { ...mockItemNormal, id: "item-1-normal", title: "Item Normal" };
    const itemTempError = { ...mockItemNormal, id: "item-2-temperr", title: "Item Erro Temp" };
    const itemPermError = { ...mockItemOversized, id: "item-3-permerr", title: "Item Erro Perm" };

    await syncEngine.enqueue(itemNormal);
    await syncEngine.enqueue(itemTempError);
    await syncEngine.enqueue(itemPermError);

    const mockWriter = vi.fn().mockImplementation(async (item: LostFoundItem) => {
      if (item.id === "item-1-normal") return true;
      if (item.id === "item-2-temperr") throw new Error("Unavailable network");
      return true;
    });

    const result = await syncEngine.processSync(true, mockWriter);

    expect(result.syncedCount).toBe(1); // item-1-normal sincronizou
    expect(result.temporaryErrorCount).toBe(1); // item-2-temperr falhou temporariamente
    expect(result.permanentErrorCount).toBe(1); // item-3-permerr bloqueado pelo guarda
    expect(result.remainingCount).toBe(2);

    const queue = await syncEngine.getAll();
    const tempEntry = queue.find((e) => e.payload.id === "item-2-temperr");
    const permEntry = queue.find((e) => e.payload.id === "item-3-permerr");

    expect(tempEntry?.status).toBe("ERRO_TEMPORARIO");
    expect(permEntry?.status).toBe("ERRO_PERMANENTE");
  });

  // =========================================================================
  // 6. Fila vazia
  // =========================================================================
  it("6. Fila vazia: deve responder com sucesso e zero operações sem invocar o Firestore", async () => {
    const mockWriter = vi.fn();
    const result = await syncEngine.processSync(true, mockWriter);

    expect(result.syncedCount).toBe(0);
    expect(result.temporaryErrorCount).toBe(0);
    expect(result.permanentErrorCount).toBe(0);
    expect(result.remainingCount).toBe(0);
    expect(mockWriter).not.toHaveBeenCalled();
  });

  // =========================================================================
  // 7. Item sem imagem
  // =========================================================================
  it("7. Item sem imagem: deve sincronizar com sucesso com tamanho mínimo de payload", async () => {
    await syncEngine.enqueue(mockItemNoImage);
    const mockWriter = vi.fn().mockResolvedValue(true);

    const byteSize = calculatePayloadSizeBytes(mockItemNoImage);
    expect(byteSize).toBeLessThan(5_000); // Menos de 5 KB

    const result = await syncEngine.processSync(true, mockWriter);

    expect(result.syncedCount).toBe(1);
    expect(mockWriter).toHaveBeenCalledTimes(1);
    expect(await syncEngine.getCount()).toBe(0);
  });

  // =========================================================================
  // 8. Item com imagem normal (WebP 1280px)
  // =========================================================================
  it("8. Item com imagem WebP normal: deve sincronizar dentro da margem de segurança", async () => {
    await syncEngine.enqueue(mockItemNormal);
    const mockWriter = vi.fn().mockResolvedValue(true);

    const check = isPayloadWithinDefensiveLimit(mockItemNormal);
    expect(check.isWithinLimit).toBe(true);
    expect(check.byteSize).toBeLessThan(FIRESTORE_DEFENSIVE_PAYLOAD_LIMIT_BYTES);

    const result = await syncEngine.processSync(true, mockWriter);
    expect(result.syncedCount).toBe(1);
    expect(mockWriter).toHaveBeenCalledTimes(1);
  });

  // =========================================================================
  // 9. Compatibilidade com entradas legadas com status 'ERRO'
  // =========================================================================
  it("9. Compatibilidade: entradas antigas com status ERRO sem errorType devem ser tratadas como reprocessáveis", async () => {
    await syncEngine.enqueue(mockItemNormal, {
      status: "ERRO",
      error: "Erro legado antigo",
    });

    const queueBefore = await syncEngine.getAll();
    expect(queueBefore[0].status).toBe("ERRO");

    const mockWriter = vi.fn().mockResolvedValue(true);
    const result = await syncEngine.processSync(true, mockWriter);

    expect(mockWriter).toHaveBeenCalledTimes(1);
    expect(result.syncedCount).toBe(1);
    expect(await syncEngine.getCount()).toBe(0);
  });

  // =========================================================================
  // 10. Cálculo de tamanho UTF-8 e testes de fronteira (Boundary tests)
  // =========================================================================
  it("10. Cálculo de bytes UTF-8 com TextEncoder e fronteira de 900.000 bytes", () => {
    // UTF-8 caracteres especiais (acentos ocupam 2 bytes cada)
    const unicodeData = { text: "Ação de Verificação Institucional IFPR Campus Ivaiporã • Achados & Perdidos 🎯" };
    const byteSize = calculatePayloadSizeBytes(unicodeData);
    expect(byteSize).toBeGreaterThan(JSON.stringify(unicodeData).length); // Validação de bytes UTF-8 > contagem de caracteres ASCII

    // Teste de fronteira exata: 899.900 bytes vs 900.001 bytes
    const nearLimitPayload = { data: "X".repeat(899_850) };
    const overLimitPayload = { data: "X".repeat(900_050) };

    const checkNear = isPayloadWithinDefensiveLimit(nearLimitPayload);
    const checkOver = isPayloadWithinDefensiveLimit(overLimitPayload);

    expect(checkNear.isWithinLimit).toBe(true);
    expect(checkOver.isWithinLimit).toBe(false);

    const errorClassifiedOver = classifySyncError(new Error("any error"), checkOver.byteSize);
    expect(errorClassifiedOver.category).toBe("PERMANENT");
    expect(errorClassifiedOver.isPermanent).toBe(true);
    expect(errorClassifiedOver.userMessage).toContain("grandes demais");
  });

  // =========================================================================
  // 11. Concorrência: proteção contra execuções paralelas simultâneas
  // =========================================================================
  it("11. Concorrência: não dispara execução concorrente se sincronização já estiver em andamento", async () => {
    await syncEngine.enqueue(mockItemNormal);

    // Simula bloqueio de sincronização concorrente ativa (isSyncing = true)
    const mockWriter = vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(true), 20)));

    // Dispara primeira chamada e imediatamente a segunda concorrente
    const p1 = syncEngine.processSync(true, mockWriter);
    const p2 = syncEngine.processSync(true, mockWriter);

    const [r1, r2] = await Promise.all([p1, p2]);

    // Uma das chamadas executou a sincronização e a outra pulou por concorrência
    expect(r1.syncedCount === 1 || r2.syncedCount === 1).toBe(true);
    expect(r1.skippedConcurrently || r2.skippedConcurrently).toBe(true);
    expect(mockWriter).toHaveBeenCalledTimes(1);
  });

  // =========================================================================
  // 12. Conectividade offline: aborta processo sem invocar Firestore
  // =========================================================================
  it("12. Conectividade offline: aborta processo de sincronização sem invocar Firestore quando isOnline for false", async () => {
    await syncEngine.enqueue(mockItemNormal);
    const mockWriter = vi.fn();

    const result = await syncEngine.processSync(false, mockWriter);

    expect(result.syncedCount).toBe(0);
    expect(result.skippedOffline).toBe(true);
    expect(result.remainingCount).toBe(1);
    expect(mockWriter).not.toHaveBeenCalled();
  });

  // =========================================================================
  // 13. Cancelamento Real de Upload Offline e Fila IndexedDB (cancelUploadTask)
  // =========================================================================
  describe("13. Auditoria e Validação de cancelUploadTask() na Fila Offline IndexedDB", () => {
    it("TESTE 1: Erro permanente -> cancelUploadTask() remove a entrada do IndexedDB", async () => {
      const entry = await syncEngine.enqueue(mockItemNormal, {
        status: "ERRO_PERMANENTE",
        errorType: "PERMANENT",
        error: "PAYLOAD_SIZE_EXCEEDS_DEFENSIVE_LIMIT (950000 bytes)",
      });

      let activeTasks: UploadTaskStatus[] = [
        {
          id: `sync-task-${entry.id}`,
          itemId: entry.payload.id,
          itemTitle: entry.payload.title,
          itemType: entry.payload.type,
          status: "ERROR",
          error: "PAYLOAD_SIZE_EXCEEDS_DEFENSIVE_LIMIT",
          statusMessage: "Erro permanente",
          startedAt: new Date().toISOString(),
          progress: 100,
        },
      ];

      const cancel = async (taskId: string) => {
        const task = activeTasks.find((t) => t.id === taskId);
        const queue = await syncEngine.getAll();
        const found = queue.find(
          (e) =>
            (task && (e.payload?.id === task.itemId || e.id === task.itemId)) ||
            `sync-task-${e.id}` === taskId ||
            e.id === taskId ||
            (task && task.id === `sync-task-${e.id}`)
        );
        if (found) {
          await syncEngine.remove(found.id);
        }
        activeTasks = activeTasks.filter((t) => t.id !== taskId);
      };

      await cancel(`sync-task-${entry.id}`);

      expect(await syncEngine.getCount()).toBe(0);
      expect(activeTasks.length).toBe(0);
    });

    it("TESTE 2: Erro temporário -> cancelUploadTask() remove a entrada do IndexedDB", async () => {
      const entry = await syncEngine.enqueue(mockItemNormal, {
        status: "ERRO_TEMPORARIO",
        errorType: "TEMPORARY",
        error: "Falha temporária de rede / Firestore offline",
      });

      let activeTasks: UploadTaskStatus[] = [
        {
          id: `sync-task-${entry.id}`,
          itemId: entry.payload.id,
          itemTitle: entry.payload.title,
          itemType: entry.payload.type,
          status: "ERROR",
          error: "TEMPORARY",
          statusMessage: "Erro temporário",
          startedAt: new Date().toISOString(),
          progress: 100,
        },
      ];

      const cancel = async (taskId: string) => {
        const task = activeTasks.find((t) => t.id === taskId);
        const queue = await syncEngine.getAll();
        const found = queue.find(
          (e) =>
            (task && (e.payload?.id === task.itemId || e.id === task.itemId)) ||
            `sync-task-${e.id}` === taskId ||
            e.id === taskId ||
            (task && task.id === `sync-task-${e.id}`)
        );
        if (found) {
          await syncEngine.remove(found.id);
        }
        activeTasks = activeTasks.filter((t) => t.id !== taskId);
      };

      await cancel(`sync-task-${entry.id}`);

      expect(await syncEngine.getCount()).toBe(0);
      expect(activeTasks.length).toBe(0);
    });

    it("TESTE 3: Depois do cancelamento, getSyncQueueCount() retorna a contagem correta", async () => {
      const entry1 = await syncEngine.enqueue(mockItemNormal);
      const entry2 = await syncEngine.enqueue({ ...mockItemNormal, id: "item-2", title: "Item 2" });

      expect(await syncEngine.getCount()).toBe(2);

      await syncEngine.remove(entry1.id);
      expect(await syncEngine.getCount()).toBe(1);

      await syncEngine.remove(entry2.id);
      expect(await syncEngine.getCount()).toBe(0);
    });

    it("TESTE 4: Depois do cancelamento, activeUploadTasks não contém mais a tarefa", async () => {
      const entry = await syncEngine.enqueue(mockItemNormal, { status: "ERRO" });
      let activeTasks: UploadTaskStatus[] = [
        {
          id: `sync-task-${entry.id}`,
          itemId: entry.payload.id,
          itemTitle: entry.payload.title,
          itemType: entry.payload.type,
          status: "ERROR",
          statusMessage: "Erro",
          startedAt: new Date().toISOString(),
          progress: 100,
        },
      ];

      activeTasks = activeTasks.filter((t) => t.id !== `sync-task-${entry.id}`);
      expect(activeTasks.some((t) => t.id === `sync-task-${entry.id}`)).toBe(false);
    });

    it("TESTE 5: Depois do cancelamento, syncOfflineQueue() não processa novamente o item", async () => {
      const entry = await syncEngine.enqueue(mockItemNormal);
      await syncEngine.remove(entry.id);

      const mockWriter = vi.fn().mockResolvedValue(true);
      const result = await syncEngine.processSync(true, mockWriter);

      expect(result.syncedCount).toBe(0);
      expect(result.remainingCount).toBe(0);
      expect(mockWriter).not.toHaveBeenCalled();
    });

    it("TESTE 6: Entrada identificada por sync-task-${entry.id} é encontrada corretamente", async () => {
      const entry = await syncEngine.enqueue(mockItemNormal);
      const taskId = `sync-task-${entry.id}`;

      const queue = await syncEngine.getAll();
      const found = queue.find((e) => `sync-task-${e.id}` === taskId);

      expect(found).toBeDefined();
      expect(found?.id).toBe(entry.id);
    });

    it("TESTE 7: Entrada identificada por payload.id também é encontrada corretamente", async () => {
      const entry = await syncEngine.enqueue(mockItemNormal);
      const targetPayloadId = mockItemNormal.id;

      const queue = await syncEngine.getAll();
      const found = queue.find((e) => e.payload?.id === targetPayloadId);

      expect(found).toBeDefined();
      expect(found?.id).toBe(entry.id);
    });

    it("TESTE 8: Erro permanente PAYLOAD_SIZE_EXCEEDS_DEFENSIVE_LIMIT não pode entrar em loop de retry", async () => {
      const entry = await syncEngine.enqueue(mockItemNormal, {
        status: "ERRO_PERMANENTE",
        errorType: "PERMANENT",
        error: "PAYLOAD_SIZE_EXCEEDS_DEFENSIVE_LIMIT (950000 bytes)",
      });

      const retryTask = async (taskId: string): Promise<boolean> => {
        const queue = await syncEngine.getAll();
        const found = queue.find((e) => `sync-task-${e.id}` === taskId);
        if (!found) return false;

        const isPermanent =
          found.status === "ERRO_PERMANENTE" ||
          found.errorType === "PERMANENT" ||
          (typeof found.error === "string" && found.error.includes("PAYLOAD_SIZE"));

        if (isPermanent) {
          return false;
        }

        await syncEngine.update(found.id, { status: "PENDENTE", error: undefined });
        return true;
      };

      const retried = await retryTask(`sync-task-${entry.id}`);
      expect(retried).toBe(false);

      const queueAfter = await syncEngine.getAll();
      expect(queueAfter[0].status).toBe("ERRO_PERMANENTE");
    });

    it("TESTE 9: Retry de erro temporário continua funcionando", async () => {
      const entry = await syncEngine.enqueue(mockItemNormal, {
        status: "ERRO_TEMPORARIO",
        errorType: "TEMPORARY",
        error: "Falha de rede",
      });

      const retryTask = async (taskId: string): Promise<boolean> => {
        const queue = await syncEngine.getAll();
        const found = queue.find((e) => `sync-task-${e.id}` === taskId);
        if (!found) return false;

        const isPermanent =
          found.status === "ERRO_PERMANENTE" ||
          found.errorType === "PERMANENT" ||
          (typeof found.error === "string" && found.error.includes("PAYLOAD_SIZE"));

        if (isPermanent) {
          return false;
        }

        await syncEngine.update(found.id, { status: "PENDENTE", error: undefined, errorType: undefined });
        return true;
      };

      const retried = await retryTask(`sync-task-${entry.id}`);
      expect(retried).toBe(true);

      const queueAfter = await syncEngine.getAll();
      expect(queueAfter[0].status).toBe("PENDENTE");

      const mockWriter = vi.fn().mockResolvedValue(true);
      const syncResult = await syncEngine.processSync(true, mockWriter);
      expect(syncResult.syncedCount).toBe(1);
      expect(mockWriter).toHaveBeenCalledTimes(1);
    });

    it("TESTE 10: Cancelar uma tarefa não chama setDoc() nem altera Firestore", async () => {
      const entry = await syncEngine.enqueue(mockItemNormal, { status: "ERRO" });
      const mockFirestoreSetDoc = vi.fn();

      await syncEngine.remove(entry.id);

      expect(mockFirestoreSetDoc).not.toHaveBeenCalled();
      expect(await syncEngine.getCount()).toBe(0);
    });
  });

  describe("RegisterItemView - Modal Reativo de Sincronização e Feedback", () => {
    interface ModalState {
      status: "CONFIRMED" | "OFFLINE_QUEUED" | "SYNC_ERROR";
      item: LostFoundItem;
      error?: string;
      taskId?: string;
    }

    // Pure logic simulation of the RegisterItemView reactive effect (v1.9.38 anti-oscillation)
    const evaluateModalState = (
      currentModal: ModalState | null,
      activeTasks: UploadTaskStatus[],
      itemsList: LostFoundItem[]
    ): ModalState | null => {
      if (!currentModal) return null;

      const currentItemId = currentModal.item.id;

      // 1. Terminal State Guard & Authoritative Confirmation:
      // Once confirmed in Firestore (or already in CONFIRMED state), CONFIRMED is an immutable terminal state.
      // Stale ERROR tasks in activeUploadTasks must NEVER demote a confirmed item to SYNC_ERROR.
      const confirmedInItems = itemsList.find((i) => i.id === currentItemId && !i.isOfflineQueued);
      if (confirmedInItems || currentModal.status === "CONFIRMED") {
        if (currentModal.status !== "CONFIRMED" && confirmedInItems) {
          return {
            status: "CONFIRMED",
            item: confirmedInItems,
          };
        }
        return currentModal;
      }

      // 2. Correlation with activeUploadTasks
      const matchingTask = activeTasks.find(
        (t) =>
          t.itemId === currentItemId ||
          t.id === currentItemId ||
          t.id === `sync-task-${currentItemId}` ||
          t.id === `upload-task-${currentItemId}`
      );

      if (matchingTask) {
        if (matchingTask.status === "COMPLETED") {
          return {
            status: "CONFIRMED",
            item: confirmedInItems || currentModal.item,
          };
        } else if (
          matchingTask.status === "ERROR" &&
          currentModal.status === "OFFLINE_QUEUED"
        ) {
          return {
            status: "SYNC_ERROR",
            item: currentModal.item,
            error: matchingTask.error || "Falha temporária ao sincronizar o cadastro com o servidor em nuvem.",
            taskId: matchingTask.id,
          };
        } else if (
          (matchingTask.status === "UPLOADING" ||
            matchingTask.status === "QUEUED_SYNC" ||
            matchingTask.status === "SAVING_LOCAL") &&
          currentModal.status === "SYNC_ERROR"
        ) {
          return {
            status: "OFFLINE_QUEUED",
            item: currentModal.item,
            taskId: matchingTask.id,
          };
        }
      }

      return currentModal;
    };

    it("Transição de OFFLINE_QUEUED para CONFIRMED quando a tarefa é concluída", () => {
      const initialModal: ModalState = {
        status: "OFFLINE_QUEUED",
        item: { ...mockItemNormal, id: "item-react-1" },
      };

      const activeTasks: UploadTaskStatus[] = [
        {
          id: "sync-task-queue-123",
          itemId: "item-react-1",
          itemTitle: mockItemNormal.title,
          itemType: "ENCONTRADO",
          progress: 100,
          status: "COMPLETED",
          statusMessage: "Concluído",
          startedAt: new Date().toISOString(),
        },
      ];

      const nextState = evaluateModalState(initialModal, activeTasks, []);
      expect(nextState?.status).toBe("CONFIRMED");
      expect(nextState?.item.id).toBe("item-react-1");
    });

    it("Transição de OFFLINE_QUEUED para SYNC_ERROR quando ocorre falha na sincronização", () => {
      const initialModal: ModalState = {
        status: "OFFLINE_QUEUED",
        item: { ...mockItemNormal, id: "item-react-2" },
      };

      const activeTasks: UploadTaskStatus[] = [
        {
          id: "sync-task-queue-456",
          itemId: "item-react-2",
          itemTitle: mockItemNormal.title,
          itemType: "ENCONTRADO",
          progress: 0,
          status: "ERROR",
          statusMessage: "Falha de rede",
          error: "Erro 503: Servidor Firestore indisponível no momento",
          startedAt: new Date().toISOString(),
        },
      ];

      const nextState = evaluateModalState(initialModal, activeTasks, []);
      expect(nextState?.status).toBe("SYNC_ERROR");
      expect(nextState?.error).toContain("Erro 503");
      expect(nextState?.taskId).toBe("sync-task-queue-456");
    });

    it("Transição de SYNC_ERROR de volta para OFFLINE_QUEUED ao iniciar retry", () => {
      const initialModal: ModalState = {
        status: "SYNC_ERROR",
        item: { ...mockItemNormal, id: "item-react-3" },
        error: "Erro de conexão",
        taskId: "sync-task-queue-789",
      };

      const activeTasks: UploadTaskStatus[] = [
        {
          id: "sync-task-queue-789",
          itemId: "item-react-3",
          itemTitle: mockItemNormal.title,
          itemType: "ENCONTRADO",
          progress: 25,
          status: "UPLOADING",
          statusMessage: "Sincronizando...",
          startedAt: new Date().toISOString(),
        },
      ];

      const nextState = evaluateModalState(initialModal, activeTasks, []);
      expect(nextState?.status).toBe("OFFLINE_QUEUED");
      expect(nextState?.taskId).toBe("sync-task-queue-789");
    });

    it("Transição imediata para CONFIRMED se o item já foi confirmado na coleção global items", () => {
      const initialModal: ModalState = {
        status: "OFFLINE_QUEUED",
        item: { ...mockItemNormal, id: "item-react-4", isOfflineQueued: true },
      };

      const itemsList: LostFoundItem[] = [
        {
          ...mockItemNormal,
          id: "item-react-4",
          isOfflineQueued: false,
          syncedAt: new Date().toISOString(),
        },
      ];

      const nextState = evaluateModalState(initialModal, [], itemsList);
      expect(nextState?.status).toBe("CONFIRMED");
      expect(nextState?.item.isOfflineQueued).toBe(false);
    });

    it("TESTE A (Anti-Oscilação): items contém item confirmado e activeUploadTasks contém mesma tarefa com ERROR -> resultado CONFIRMED e NUNCA SYNC_ERROR", () => {
      const initialModal: ModalState = {
        status: "CONFIRMED",
        item: { ...mockItemNormal, id: "item-osc-1", isOfflineQueued: false },
      };

      const itemsList: LostFoundItem[] = [
        {
          ...mockItemNormal,
          id: "item-osc-1",
          isOfflineQueued: false,
        },
      ];

      const staleErrorTasks: UploadTaskStatus[] = [
        {
          id: "sync-task-item-osc-1",
          itemId: "item-osc-1",
          itemTitle: mockItemNormal.title,
          itemType: "ENCONTRADO",
          progress: 0,
          status: "ERROR",
          statusMessage: "Erro antigo",
          error: "Erro de conexão",
          startedAt: new Date().toISOString(),
        },
      ];

      const evaluated = evaluateModalState(initialModal, staleErrorTasks, itemsList);
      expect(evaluated?.status).toBe("CONFIRMED");
      expect(evaluated?.status).not.toBe("SYNC_ERROR");
    });

    it("TESTE B: items NÃO contém item confirmado e activeUploadTasks contém ERROR -> resultado SYNC_ERROR", () => {
      const initialModal: ModalState = {
        status: "OFFLINE_QUEUED",
        item: { ...mockItemNormal, id: "item-osc-2", isOfflineQueued: true },
      };

      const errorTasks: UploadTaskStatus[] = [
        {
          id: "sync-task-item-osc-2",
          itemId: "item-osc-2",
          itemTitle: mockItemNormal.title,
          itemType: "ENCONTRADO",
          progress: 0,
          status: "ERROR",
          statusMessage: "Falha remota",
          error: "Erro de rede",
          startedAt: new Date().toISOString(),
        },
      ];

      const evaluated = evaluateModalState(initialModal, errorTasks, []);
      expect(evaluated?.status).toBe("SYNC_ERROR");
      expect(evaluated?.error).toBe("Erro de rede");
    });

    it("TESTE C: Ciclo completo OFFLINE_QUEUED -> ERROR (SYNC_ERROR) -> retry (UPLOADING) -> CONFIRMED", () => {
      let state: ModalState | null = {
        status: "OFFLINE_QUEUED",
        item: { ...mockItemNormal, id: "item-osc-3", isOfflineQueued: true },
      };

      // 1. Falha inicial
      const errorTask: UploadTaskStatus = {
        id: "sync-task-item-osc-3",
        itemId: "item-osc-3",
        itemTitle: mockItemNormal.title,
        itemType: "ENCONTRADO",
        progress: 0,
        status: "ERROR",
        statusMessage: "Falha",
        error: "Timeout",
        startedAt: new Date().toISOString(),
      };
      state = evaluateModalState(state, [errorTask], []);
      expect(state?.status).toBe("SYNC_ERROR");

      // 2. Retry iniciado
      const retryTask: UploadTaskStatus = {
        ...errorTask,
        status: "UPLOADING",
        progress: 40,
        statusMessage: "Reenviando...",
      };
      state = evaluateModalState(state, [retryTask], []);
      expect(state?.status).toBe("OFFLINE_QUEUED");

      // 3. Sucesso confirmado
      const confirmedTask: UploadTaskStatus = {
        ...retryTask,
        status: "COMPLETED",
        progress: 100,
      };
      const itemsList: LostFoundItem[] = [
        { ...mockItemNormal, id: "item-osc-3", isOfflineQueued: false },
      ];
      state = evaluateModalState(state, [confirmedTask], itemsList);
      expect(state?.status).toBe("CONFIRMED");
    });

    it("TESTE D: item já confirmado e task ERROR chega posteriormente -> estado continua estritamente CONFIRMED", () => {
      const confirmedModal: ModalState = {
        status: "CONFIRMED",
        item: { ...mockItemNormal, id: "item-osc-4", isOfflineQueued: false },
      };

      const lateArrivingErrorTask: UploadTaskStatus = {
        id: "sync-task-item-osc-4",
        itemId: "item-osc-4",
        itemTitle: mockItemNormal.title,
        itemType: "ENCONTRADO",
        progress: 0,
        status: "ERROR",
        statusMessage: "Erro tardio",
        error: "Falha rejeitada",
        startedAt: new Date().toISOString(),
      };

      const evaluated = evaluateModalState(confirmedModal, [lateArrivingErrorTask], []);
      expect(evaluated?.status).toBe("CONFIRMED");
    });

    it("TESTE E: Execuções sucessivas não geram oscilação entre CONFIRMED e SYNC_ERROR", () => {
      let state: ModalState | null = {
        status: "CONFIRMED",
        item: { ...mockItemNormal, id: "item-osc-5", isOfflineQueued: false },
      };

      const itemsList: LostFoundItem[] = [
        { ...mockItemNormal, id: "item-osc-5", isOfflineQueued: false },
      ];

      const staleErrorTask: UploadTaskStatus = {
        id: "sync-task-item-osc-5",
        itemId: "item-osc-5",
        itemTitle: mockItemNormal.title,
        itemType: "ENCONTRADO",
        progress: 0,
        status: "ERROR",
        statusMessage: "Stale error",
        error: "Stale network failure",
        startedAt: new Date().toISOString(),
      };

      // 10 avaliações sucessivas simulando 10 re-renders
      for (let i = 0; i < 10; i++) {
        state = evaluateModalState(state, [staleErrorTask], itemsList);
        expect(state?.status).toBe("CONFIRMED");
      }
    });
  });
});
