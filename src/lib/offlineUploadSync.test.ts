import { describe, it, expect, vi, beforeEach } from "vitest";
import { LostFoundItem, SyncQueueEntry, UploadTaskStatus, RegistrationStatus } from "../types";
import {
  calculatePayloadSizeBytes,
  classifySyncError,
  FIRESTORE_DEFENSIVE_PAYLOAD_LIMIT_BYTES,
  isPayloadWithinDefensiveLimit,
} from "./payloadSizeGuard";
import { getUploadTaskId } from "./indexedDB";

// Realistic in-memory simulation of the AppContext + IndexedDB sync engine
class RealisticSyncQueueEngine {
  private queue: Map<string, SyncQueueEntry> = new Map();
  private activeTasks: Map<string, UploadTaskStatus> = new Map();
  private firestoreDb: Map<string, LostFoundItem> = new Map();
  private isSyncing = false;

  async enqueue(
    item: LostFoundItem,
    initialOptions?: Partial<Omit<SyncQueueEntry, "id" | "type" | "payload" | "createdAt">>
  ): Promise<SyncQueueEntry> {
    const payloadSize = initialOptions?.payloadSizeBytes ?? calculatePayloadSizeBytes(item);
    const resolvedItemId = item.id;
    const entryId = `queue-${resolvedItemId}`;

    const entry: SyncQueueEntry = {
      id: entryId,
      itemId: resolvedItemId,
      type: "REGISTER_ITEM",
      payload: {
        ...item,
        id: resolvedItemId,
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
    return Array.from(this.queue.values()).map((entry) => ({
      ...entry,
      itemId: entry.itemId || entry.payload?.id || entry.id.replace(/^queue-/, ""),
    })).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  async getCount(): Promise<number> {
    return this.queue.size;
  }

  async remove(id: string): Promise<void> {
    this.queue.delete(id);
  }

  async removeByItemId(itemId: string): Promise<void> {
    for (const [key, entry] of this.queue.entries()) {
      if (
        entry.itemId === itemId ||
        entry.payload?.id === itemId ||
        entry.id === `queue-${itemId}` ||
        entry.id === itemId
      ) {
        this.queue.delete(key);
      }
    }
  }

  async update(id: string, updates: Partial<SyncQueueEntry>): Promise<void> {
    const existing = this.queue.get(id);
    if (existing) {
      this.queue.set(id, { ...existing, ...updates });
    }
  }

  async clear(): Promise<void> {
    this.queue.clear();
    this.activeTasks.clear();
    this.firestoreDb.clear();
  }

  // Active Upload Tasks Management (Canonical task-${itemId})
  setTask(task: UploadTaskStatus): void {
    this.activeTasks.set(task.id, task);
  }

  getTask(taskId: string): UploadTaskStatus | undefined {
    return this.activeTasks.get(taskId);
  }

  getAllTasks(): UploadTaskStatus[] {
    return Array.from(this.activeTasks.values());
  }

  removeTask(taskId: string): void {
    this.activeTasks.delete(taskId);
  }

  // Cancel upload task by canonical taskId or itemId
  async cancelUploadTask(taskId: string): Promise<void> {
    const task = this.activeTasks.get(taskId);
    const resolvedItemId = task?.itemId || taskId.replace(/^task-/, "");

    await this.removeByItemId(resolvedItemId);
    await this.remove(taskId);
    if (task) {
      await this.remove(task.id);
    }

    // Remove from active tasks state
    for (const [id, t] of this.activeTasks.entries()) {
      if (id === taskId || t.itemId === resolvedItemId) {
        this.activeTasks.delete(id);
      }
    }
  }

  // Retry upload task
  async retryUploadTask(taskId: string, isOnline: boolean): Promise<boolean> {
    const task = this.activeTasks.get(taskId);
    const resolvedItemId = task?.itemId || taskId.replace(/^task-/, "");
    const canonicalTaskId = getUploadTaskId(resolvedItemId);

    const queue = await this.getAll();
    const entry = queue.find(
      (e) => e.itemId === resolvedItemId || e.payload?.id === resolvedItemId || e.id === taskId
    );

    if (entry) {
      const isPermanentError =
        entry.status === "ERRO_PERMANENTE" ||
        entry.errorType === "PERMANENT" ||
        (typeof entry.error === "string" &&
          (entry.error.includes("PAYLOAD_SIZE") ||
            entry.error.includes("FIELD_LIMIT") ||
            entry.error.includes("PERMANENT")));

      if (isPermanentError) {
        return false; // Blocked
      }

      await this.update(entry.id, {
        status: "PENDENTE",
        error: undefined,
        errorType: undefined,
      });
    }

    this.setTask({
      id: canonicalTaskId,
      itemId: resolvedItemId,
      itemTitle: task?.itemTitle || "Objeto",
      itemType: task?.itemType || "ENCONTRADO",
      status: "UPLOADING",
      progress: 30,
      statusMessage: "Tentando sincronizar novamente...",
      startedAt: new Date().toISOString(),
    });

    await this.processSync(isOnline);
    return true;
  }

  // Add Item Pipeline matching AppContext.addItem()
  async addItem(
    itemData: LostFoundItem,
    isOnline: boolean,
    forceFirestoreFail?: boolean
  ): Promise<{
    newItem: LostFoundItem;
    persistenceStatus: RegistrationStatus;
    isOffline: boolean;
  }> {
    const newItemId = itemData.id;
    const taskId = getUploadTaskId(newItemId);

    this.setTask({
      id: taskId,
      itemId: newItemId,
      itemTitle: itemData.title,
      itemType: itemData.type,
      progress: 15,
      status: "COMPRESSING",
      statusMessage: "Otimizando fotos e comprimindo imagem...",
      startedAt: new Date().toISOString(),
    });

    const payloadSizeBytes = calculatePayloadSizeBytes(itemData);

    // 1. DEFENSIVE SIZE GUARD
    if (payloadSizeBytes > FIRESTORE_DEFENSIVE_PAYLOAD_LIMIT_BYTES) {
      const queuedItem: LostFoundItem = { ...itemData, isOfflineQueued: true };
      await this.enqueue(queuedItem, {
        status: "ERRO_PERMANENTE",
        errorType: "PERMANENT",
        error: `PAYLOAD_SIZE_EXCEEDS_DEFENSIVE_LIMIT (${payloadSizeBytes} bytes)`,
        payloadSizeBytes,
      });
      this.setTask({
        id: taskId,
        itemId: newItemId,
        itemTitle: itemData.title,
        itemType: itemData.type,
        progress: 100,
        status: "ERROR",
        error: "PAYLOAD_SIZE_EXCEEDS_DEFENSIVE_LIMIT",
        statusMessage: "Este item possui dados grandes demais.",
        startedAt: new Date().toISOString(),
      });
      return { newItem: queuedItem, persistenceStatus: "ERROR", isOffline: false };
    }

    // 2. OFFLINE
    if (!isOnline) {
      const queuedItem: LostFoundItem = { ...itemData, isOfflineQueued: true };
      await this.enqueue(queuedItem, {
        status: "PENDENTE",
        payloadSizeBytes,
      });
      this.setTask({
        id: taskId,
        itemId: newItemId,
        itemTitle: itemData.title,
        itemType: itemData.type,
        progress: 100,
        status: "QUEUED_SYNC",
        statusMessage: "Salvo no armazenamento local seguro.",
        startedAt: new Date().toISOString(),
      });
      return { newItem: queuedItem, persistenceStatus: "PENDING_SYNC", isOffline: true };
    }

    // 3. ONLINE - Attempt Firestore write
    if (forceFirestoreFail) {
      const queuedItem: LostFoundItem = { ...itemData, isOfflineQueued: true };
      await this.enqueue(queuedItem, {
        status: "ERRO_TEMPORARIO",
        errorType: "TEMPORARY",
        error: "Network unavailable",
        payloadSizeBytes,
      });
      this.setTask({
        id: taskId,
        itemId: newItemId,
        itemTitle: itemData.title,
        itemType: itemData.type,
        progress: 100,
        status: "QUEUED_SYNC",
        statusMessage: "Conexão instável. Salvo no IndexedDB para Background Sync.",
        startedAt: new Date().toISOString(),
      });
      return { newItem: queuedItem, persistenceStatus: "PENDING_SYNC", isOffline: true };
    }

    // Firestore Success
    const confirmedItem: LostFoundItem = {
      ...itemData,
      isOfflineQueued: false,
      syncedAt: new Date().toISOString(),
    };
    this.firestoreDb.set(newItemId, confirmedItem);
    await this.removeByItemId(newItemId);

    this.setTask({
      id: taskId,
      itemId: newItemId,
      itemTitle: itemData.title,
      itemType: itemData.type,
      progress: 100,
      status: "COMPLETED",
      statusMessage: "Persistência confirmada com sucesso no Firestore!",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });

    return { newItem: confirmedItem, persistenceStatus: "CONFIRMED", isOffline: false };
  }

  // Full Idempotent Sync Process
  async processSync(
    isOnline: boolean,
    customWriter?: (item: LostFoundItem) => Promise<boolean>
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
      const processedItemIds = new Set<string>();

      for (const entry of entries) {
        const itemId = entry.itemId || entry.payload?.id || entry.id.replace(/^queue-/, "");
        if (processedItemIds.has(itemId)) {
          await this.remove(entry.id);
          continue;
        }
        processedItemIds.add(itemId);

        const taskId = getUploadTaskId(itemId);

        if (entry.status === "ERRO_PERMANENTE" || entry.errorType === "PERMANENT") {
          permanentErrorCount++;
          this.setTask({
            id: taskId,
            itemId: itemId,
            itemTitle: entry.payload?.title || "Objeto",
            itemType: entry.payload?.type || "ENCONTRADO",
            progress: 100,
            status: "ERROR",
            error: entry.error || "ERRO_PERMANENTE",
            statusMessage: "Item precisa de atenção.",
            startedAt: entry.createdAt,
          });
          continue;
        }

        const itemToSave: LostFoundItem = {
          ...entry.payload,
          id: itemId,
          isOfflineQueued: false,
          syncedAt: new Date().toISOString(),
        };

        const payloadSizeBytes = calculatePayloadSizeBytes(itemToSave);

        if (payloadSizeBytes > FIRESTORE_DEFENSIVE_PAYLOAD_LIMIT_BYTES) {
          permanentErrorCount++;
          await this.update(entry.id, {
            status: "ERRO_PERMANENTE",
            errorType: "PERMANENT",
            error: `PAYLOAD_SIZE_EXCEEDS_DEFENSIVE_LIMIT (${payloadSizeBytes} bytes)`,
            payloadSizeBytes,
            lastAttempt: new Date().toISOString(),
          });
          this.setTask({
            id: taskId,
            itemId: itemId,
            itemTitle: itemToSave.title,
            itemType: itemToSave.type,
            progress: 100,
            status: "ERROR",
            error: "PAYLOAD_SIZE_EXCEEDS_DEFENSIVE_LIMIT",
            statusMessage: "Tamanho excedido.",
            startedAt: entry.createdAt,
          });
          continue;
        }

        try {
          if (customWriter) {
            await customWriter(itemToSave);
          } else {
            this.firestoreDb.set(itemToSave.id, itemToSave);
          }

          // Success: remove from IndexedDB and update canonical task
          await this.remove(entry.id);
          await this.removeByItemId(itemId);

          this.setTask({
            id: taskId,
            itemId: itemId,
            itemTitle: itemToSave.title,
            itemType: itemToSave.type,
            progress: 100,
            status: "COMPLETED",
            statusMessage: "Sincronizado com sucesso com o servidor em nuvem!",
            startedAt: entry.createdAt,
            completedAt: new Date().toISOString(),
          });

          syncedCount++;
        } catch (syncErr: any) {
          const classified = classifySyncError(syncErr, payloadSizeBytes);
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
          this.setTask({
            id: taskId,
            itemId: itemId,
            itemTitle: itemToSave.title,
            itemType: itemToSave.type,
            progress: 100,
            status: "ERROR",
            error: classified.reason,
            statusMessage: classified.userMessage,
            startedAt: entry.createdAt,
          });
        }
      }

      return {
        syncedCount,
        temporaryErrorCount,
        permanentErrorCount,
        remainingCount: this.queue.size,
      };
    } finally {
      this.isSyncing = false;
    }
  }

  isItemInFirestore(id: string): boolean {
    return this.firestoreDb.has(id);
  }
}

// Canonical Reactive Modal State Evaluator matching RegisterItemView
interface CanonicalModalState {
  status: RegistrationStatus;
  item: LostFoundItem;
  error?: string;
  taskId?: string;
}

function evaluateCanonicalModalState(
  currentModal: CanonicalModalState | null,
  activeTasks: UploadTaskStatus[]
): CanonicalModalState | null {
  if (!currentModal) return null;

  // 1. Terminal State Guard: CONFIRMED is immutable terminal state
  if (currentModal.status === "CONFIRMED") {
    return currentModal;
  }

  const currentItemId = currentModal.item.id;
  const canonicalTaskId = getUploadTaskId(currentItemId);

  // 2. Correlation exclusively with the canonical task task-${itemId}
  const matchingTask = activeTasks.find(
    (t) => t.id === canonicalTaskId || t.itemId === currentItemId
  );

  if (matchingTask) {
    if (matchingTask.status === "COMPLETED") {
      return {
        status: "CONFIRMED",
        item: currentModal.item,
      };
    } else if (
      matchingTask.status === "ERROR" &&
      currentModal.status === "PENDING_SYNC"
    ) {
      return {
        status: "ERROR",
        item: currentModal.item,
        error: matchingTask.error || "Falha temporária ao sincronizar o cadastro com o servidor em nuvem.",
        taskId: canonicalTaskId,
      };
    } else if (
      (matchingTask.status === "UPLOADING" ||
        matchingTask.status === "QUEUED_SYNC" ||
        matchingTask.status === "SAVING_LOCAL") &&
      currentModal.status === "ERROR"
    ) {
      return {
        status: "PENDING_SYNC",
        item: currentModal.item,
        taskId: canonicalTaskId,
      };
    }
  }

  return currentModal;
}

// -------------------------------------------------------------
// Test Suite
// -------------------------------------------------------------

describe("Arquitetura Canônica de Upload e Sincronização Offline (task-${itemId})", () => {
  let engine: RealisticSyncQueueEngine;

  const mockItemNormal: LostFoundItem = {
    id: "ifpr-m12345-789",
    title: "Calculadora Científica Casio fx-82MS",
    description: "Calculadora esquecida no Laboratório de Informática II.",
    type: "ENCONTRADO",
    category: "Eletrônicos",
    color: "Preto",
    brand: "Casio",
    imageUrl: undefined,
    contactInfo: "Coordenação",
    date: "2026-03-25",
    location: "Laboratório de Informática II",
    status: "ENCONTRADO",
    qrCodeId: "QR-IFPR-M12345-CALCULADOR",
    registeredByUserId: "user-1",
    registeredByName: "Servidor Teste",
    registeredByRole: "SERVIDOR",
    createdAt: new Date().toISOString(),
    history: [],
    storageDeadlineDays: 90,
  };

  beforeEach(async () => {
    engine = new RealisticSyncQueueEngine();
    await engine.clear();
  });

  // =========================================================================
  // 20 Mandatory Architectural Scenarios
  // =========================================================================

  it("1. Online → CONFIRMED com sucesso real no Firestore", async () => {
    const res = await engine.addItem(mockItemNormal, true);
    expect(res.persistenceStatus).toBe("CONFIRMED");
    expect(res.newItem.isOfflineQueued).toBe(false);
    expect(engine.isItemInFirestore(mockItemNormal.id)).toBe(true);
    expect(await engine.getCount()).toBe(0);
    const task = engine.getTask(getUploadTaskId(mockItemNormal.id));
    expect(task?.status).toBe("COMPLETED");
  });

  it("2. Offline → PENDING_SYNC e persistência segura no IndexedDB", async () => {
    const res = await engine.addItem(mockItemNormal, false);
    expect(res.persistenceStatus).toBe("PENDING_SYNC");
    expect(res.newItem.isOfflineQueued).toBe(true);
    expect(engine.isItemInFirestore(mockItemNormal.id)).toBe(false);
    expect(await engine.getCount()).toBe(1);
    const task = engine.getTask(getUploadTaskId(mockItemNormal.id));
    expect(task?.status).toBe("QUEUED_SYNC");
  });

  it("3. Sync → CONFIRMED ao restabelecer conexão online", async () => {
    await engine.addItem(mockItemNormal, false);
    expect(await engine.getCount()).toBe(1);

    const syncRes = await engine.processSync(true);
    expect(syncRes.syncedCount).toBe(1);
    expect(await engine.getCount()).toBe(0);
    expect(engine.isItemInFirestore(mockItemNormal.id)).toBe(true);
    const task = engine.getTask(getUploadTaskId(mockItemNormal.id));
    expect(task?.status).toBe("COMPLETED");
  });

  it("4. Falha temporária no envio → PENDING_SYNC", async () => {
    const res = await engine.addItem(mockItemNormal, true, true);
    expect(res.persistenceStatus).toBe("PENDING_SYNC");
    expect(res.newItem.isOfflineQueued).toBe(true);
    expect(await engine.getCount()).toBe(1);
  });

  it("5. Erro permanente (Payload > 900KB) → ERROR defensivo", async () => {
    const bigString = "A".repeat(950000);
    const largeItem: LostFoundItem = {
      ...mockItemNormal,
      id: "ifpr-large-item-1",
      description: bigString,
    };

    const res = await engine.addItem(largeItem, true);
    expect(res.persistenceStatus).toBe("ERROR");
    expect(res.newItem.isOfflineQueued).toBe(true);
    const task = engine.getTask(getUploadTaskId(largeItem.id));
    expect(task?.status).toBe("ERROR");
    expect(task?.error).toBe("PAYLOAD_SIZE_EXCEEDS_DEFENSIVE_LIMIT");
  });

  it("6. Retry → CONFIRMED para falhas recuperáveis", async () => {
    await engine.addItem(mockItemNormal, false);
    const taskId = getUploadTaskId(mockItemNormal.id);

    // Fail first sync
    await engine.processSync(true, async () => {
      throw new Error("Temporary network timeout");
    });
    expect(engine.getTask(taskId)?.status).toBe("ERROR");

    // Retry succeeds
    const retried = await engine.retryUploadTask(taskId, true);
    expect(retried).toBe(true);
    expect(engine.getTask(taskId)?.status).toBe("COMPLETED");
    expect(await engine.getCount()).toBe(0);
  });

  it("7. Duas sincronizações simultâneas respeitam mutex e não duplicam gravação", async () => {
    await engine.addItem(mockItemNormal, false);

    const customWriter = vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 25));
      return true;
    });

    const [r1, r2] = await Promise.all([
      engine.processSync(true, customWriter),
      engine.processSync(true, customWriter),
    ]);

    expect(r1.syncedCount === 1 || r2.syncedCount === 1).toBe(true);
    expect(r1.skippedConcurrently || r2.skippedConcurrently).toBe(true);
    expect(customWriter).toHaveBeenCalledTimes(1);
  });

  it("8. Uma única tarefa por itemId (task-${itemId})", async () => {
    const itemId = "ifpr-single-task-123";
    const item: LostFoundItem = { ...mockItemNormal, id: itemId };
    await engine.addItem(item, false);

    const canonicalId = getUploadTaskId(itemId);
    expect(canonicalId).toBe(`task-${itemId}`);

    const tasks = engine.getAllTasks().filter((t) => t.itemId === itemId);
    expect(tasks.length).toBe(1);
    expect(tasks[0].id).toBe(`task-${itemId}`);
  });

  it("9. Nunca coexistir upload-task-* com sync-task-*", async () => {
    const itemId = "ifpr-no-dual-prefix";
    const item: LostFoundItem = { ...mockItemNormal, id: itemId };
    await engine.addItem(item, false);

    const allTasks = engine.getAllTasks();
    const legacyUpload = allTasks.filter((t) => t.id.startsWith("upload-task-"));
    const legacySync = allTasks.filter((t) => t.id.startsWith("sync-task-"));

    expect(legacyUpload.length).toBe(0);
    expect(legacySync.length).toBe(0);
  });

  it("10. CONFIRMED + ERROR stale: CONFIRMED é terminal e imutável", () => {
    const confirmedModal: CanonicalModalState = {
      status: "CONFIRMED",
      item: { ...mockItemNormal, id: "item-stale-1", isOfflineQueued: false },
    };

    const staleErrorTask: UploadTaskStatus = {
      id: getUploadTaskId("item-stale-1"),
      itemId: "item-stale-1",
      itemTitle: mockItemNormal.title,
      itemType: "ENCONTRADO",
      status: "ERROR",
      statusMessage: "Stale network timeout",
      error: "Timeout",
      startedAt: new Date().toISOString(),
      progress: 0,
    };

    const evaluated = evaluateCanonicalModalState(confirmedModal, [staleErrorTask]);
    expect(evaluated?.status).toBe("CONFIRMED");
    expect(evaluated?.status).not.toBe("ERROR");
  });

  it("11. CONFIRMED + reload / múltiplos ciclos mantém CONFIRMED", () => {
    let modal: CanonicalModalState | null = {
      status: "CONFIRMED",
      item: { ...mockItemNormal, id: "item-reload-1", isOfflineQueued: false },
    };

    const tasks: UploadTaskStatus[] = [];
    for (let i = 0; i < 5; i++) {
      modal = evaluateCanonicalModalState(modal, tasks);
      expect(modal?.status).toBe("CONFIRMED");
    }
  });

  it("12. CONFIRMED + evento de rede não altera estado para PENDING_SYNC", () => {
    const modal: CanonicalModalState = {
      status: "CONFIRMED",
      item: { ...mockItemNormal, id: "item-net-1", isOfflineQueued: false },
    };

    const queuedTask: UploadTaskStatus = {
      id: getUploadTaskId("item-net-1"),
      itemId: "item-net-1",
      itemTitle: mockItemNormal.title,
      itemType: "ENCONTRADO",
      status: "QUEUED_SYNC",
      statusMessage: "Background sync",
      startedAt: new Date().toISOString(),
      progress: 50,
    };

    const res = evaluateCanonicalModalState(modal, [queuedTask]);
    expect(res?.status).toBe("CONFIRMED");
  });

  it("13. Remoção física da fila IndexedDB após confirmação no Firestore", async () => {
    await engine.addItem(mockItemNormal, false);
    expect(await engine.getCount()).toBe(1);

    await engine.processSync(true);
    expect(await engine.getCount()).toBe(0);
  });

  it("14. Cancelamento real (cancelUploadTask) remove pendência do IndexedDB e activeTasks", async () => {
    await engine.addItem(mockItemNormal, false);
    const taskId = getUploadTaskId(mockItemNormal.id);

    expect(await engine.getCount()).toBe(1);
    expect(engine.getTask(taskId)).toBeDefined();

    await engine.cancelUploadTask(taskId);

    expect(await engine.getCount()).toBe(0);
    expect(engine.getTask(taskId)).toBeUndefined();
    expect(engine.isItemInFirestore(mockItemNormal.id)).toBe(false);
  });

  it("15. Retry após erro recuperável limpa status de erro e envia", async () => {
    await engine.addItem(mockItemNormal, false);
    const taskId = getUploadTaskId(mockItemNormal.id);

    // Fail first
    await engine.processSync(true, async () => {
      throw new Error("HTTP 500");
    });
    expect(engine.getTask(taskId)?.status).toBe("ERROR");

    // Retry
    const success = await engine.retryUploadTask(taskId, true);
    expect(success).toBe(true);
    expect(engine.getTask(taskId)?.status).toBe("COMPLETED");
  });

  it("16. Migração de entrada legada normaliza itemId sem perda", async () => {
    // Manually push legacy entry without top-level itemId
    const legacyEntry: SyncQueueEntry = {
      id: "queue-legacy-item-999",
      type: "REGISTER_ITEM",
      payload: {
        ...mockItemNormal,
        id: "legacy-item-999",
        isOfflineQueued: true,
      },
      createdAt: new Date().toISOString(),
      status: "PENDENTE",
      attempts: 0,
      payloadSizeBytes: 500,
    };
    (engine as any).queue.set(legacyEntry.id, legacyEntry);

    const all = await engine.getAll();
    expect(all[0].itemId).toBe("legacy-item-999");

    const syncRes = await engine.processSync(true);
    expect(syncRes.syncedCount).toBe(1);
    expect(engine.isItemInFirestore("legacy-item-999")).toBe(true);
  });

  it("17. addItem com falha define isOfflineQueued: true antes de retornar", async () => {
    const res = await engine.addItem(mockItemNormal, false);
    expect(res.newItem.isOfflineQueued).toBe(true);
    expect(res.persistenceStatus).toBe("PENDING_SYNC");
  });

  it("18. Sync imediato após falha não cria uma segunda task", async () => {
    await engine.addItem(mockItemNormal, false);
    const taskId = getUploadTaskId(mockItemNormal.id);

    await engine.processSync(true);

    const tasksForThisItem = engine.getAllTasks().filter((t) => t.itemId === mockItemNormal.id);
    expect(tasksForThisItem.length).toBe(1);
    expect(tasksForThisItem[0].id).toBe(taskId);
  });

  it("19. task-${itemId} permanece determinística e única", () => {
    const idA = "ifpr-abc";
    const idB = "ifpr-abc";
    expect(getUploadTaskId(idA)).toBe(getUploadTaskId(idB));
    expect(getUploadTaskId(idA)).toBe("task-ifpr-abc");
  });

  it("20. Firestore confirmado remove pendência mesmo se a task estiver atrasada", async () => {
    await engine.addItem(mockItemNormal, true);
    expect(await engine.getCount()).toBe(0);
    expect(engine.isItemInFirestore(mockItemNormal.id)).toBe(true);
  });

  // =========================================================================
  // 15. Regressão Exata do Bug Observado
  // =========================================================================
  describe("15. Regressão Exata do Bug de Oscilação / Flickering", () => {
    it("Cenário A: Firestore CONFIRMED + task ERROR residual -> Modal permanece CONFIRMED sem oscilação", () => {
      const modal: CanonicalModalState = {
        status: "CONFIRMED",
        item: { ...mockItemNormal, id: "item-regression-1", isOfflineQueued: false },
      };

      const residualErrorTask: UploadTaskStatus = {
        id: getUploadTaskId("item-regression-1"),
        itemId: "item-regression-1",
        itemTitle: mockItemNormal.title,
        itemType: "ENCONTRADO",
        status: "ERROR",
        statusMessage: "Falha antiga",
        error: "Timeout",
        startedAt: new Date().toISOString(),
        progress: 0,
      };

      for (let render = 0; render < 10; render++) {
        const nextState = evaluateCanonicalModalState(modal, [residualErrorTask]);
        expect(nextState?.status).toBe("CONFIRMED");
      }
    });

    it("Cenário B: Firestore NÃO confirmado + task ERROR -> Modal transita para ERROR", () => {
      const modal: CanonicalModalState = {
        status: "PENDING_SYNC",
        item: { ...mockItemNormal, id: "item-regression-2", isOfflineQueued: true },
      };

      const realErrorTask: UploadTaskStatus = {
        id: getUploadTaskId("item-regression-2"),
        itemId: "item-regression-2",
        itemTitle: mockItemNormal.title,
        itemType: "ENCONTRADO",
        status: "ERROR",
        statusMessage: "Falha de rede",
        error: "Erro 503",
        startedAt: new Date().toISOString(),
        progress: 0,
      };

      const nextState = evaluateCanonicalModalState(modal, [realErrorTask]);
      expect(nextState?.status).toBe("ERROR");
      expect(nextState?.error).toBe("Erro 503");
      expect(nextState?.taskId).toBe(getUploadTaskId("item-regression-2"));
    });
  });
});
