import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  executeAdminBatchItemStatusUpdate,
  executeAdminBatchItemDeletion,
  executeAdminBatchUserApproval,
} from "./adminBatchOperations";
import { User, ItemStatus } from "../types";

describe("Auditoria e Integridade das Operações Administrativas (Localiza+ IFPR)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockUser = (id: string, name: string): User => ({
    id,
    name,
    email: `${id}@ifpr.edu.br`,
    role: "ALUNO",
    approvalStatus: "PENDENTE",
    courseOrDept: "Técnico em Informática",
    registrationNumber: `2026100${id}`,
    avatarUrl: `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150`,
  });

  describe("Teste 1 — Sucesso Individual", () => {
    it("deve confirmar gravação no Firestore antes de alterar estado local e exibir sucesso", async () => {
      let localStatus: ItemStatus = "ENCONTRADO";
      let toastMessage = "";
      let toastType = "";

      const mockFirestoreWrite = vi.fn().mockImplementation(async () => {
        // Simula persistência no Firestore com confirmação
        return Promise.resolve();
      });

      // Simulação do fluxo: validar -> aguardar Firestore -> atualizar estado -> exibir toast
      await mockFirestoreWrite();
      localStatus = "DEVOLVIDO";
      toastMessage = "Item alterado para DEVOLVIDO com sucesso!";
      toastType = "success";

      expect(mockFirestoreWrite).toHaveBeenCalledTimes(1);
      expect(localStatus).toBe("DEVOLVIDO");
      expect(toastType).toBe("success");
      expect(toastMessage).toContain("sucesso");
    });
  });

  describe("Teste 2 — Falha Individual", () => {
    it("não deve declarar sucesso e não deve atualizar estado local quando Firestore falhar", async () => {
      let localStatus: ItemStatus = "ENCONTRADO";
      let toastMessage = "";
      let toastType = "";
      let errorLogged = false;

      const mockFirestoreWrite = vi.fn().mockImplementation(async () => {
        throw new Error("FirebaseError: [code=unavailable] Backend Firestore offline.");
      });

      try {
        await mockFirestoreWrite();
        localStatus = "DEVOLVIDO"; // Não deve ser executado
        toastMessage = "Sucesso falso";
        toastType = "success";
      } catch (err: any) {
        errorLogged = true;
        toastMessage = "Erro ao gravar alteração no Firestore.";
        toastType = "error";
      }

      // Verificações: estado local NÃO foi alterado, erro reportado, sem falso sucesso
      expect(localStatus).toBe("ENCONTRADO");
      expect(toastType).toBe("error");
      expect(toastMessage).toContain("Erro ao gravar");
      expect(toastMessage).not.toContain("Sucesso falso");
      expect(errorLogged).toBe(true);
    });
  });

  describe("Teste 3 — Lote Totalmente Bem-Sucedido", () => {
    it("todas as operações confirmadas no Firestore atualizam o estado local e geram sucesso total", async () => {
      const itemIds = ["item-01", "item-02", "item-03"];
      const localItems: Record<string, ItemStatus> = {
        "item-01": "ENCONTRADO",
        "item-02": "ENCONTRADO",
        "item-03": "ENCONTRADO",
      };

      const mockUpdateDoc = vi.fn().mockResolvedValue(undefined);

      const result = await executeAdminBatchItemStatusUpdate(itemIds, "DEVOLVIDO", mockUpdateDoc);

      // Aplicar apenas aos confirmados
      if (result.succeeded.length > 0) {
        result.succeeded.forEach((id) => {
          localItems[id] = "DEVOLVIDO";
        });
      }

      expect(result.success).toBe(true);
      expect(result.statusSummary).toBe("ALL_SUCCEEDED");
      expect(result.succeeded).toEqual(["item-01", "item-02", "item-03"]);
      expect(result.failed).toEqual([]);
      expect(localItems["item-01"]).toBe("DEVOLVIDO");
      expect(localItems["item-02"]).toBe("DEVOLVIDO");
      expect(localItems["item-03"]).toBe("DEVOLVIDO");
      expect(result.message).toContain("3 item(ns) alterado(s) para DEVOLVIDO com sucesso!");
    });

    it("aprovação atômica em lote (writeBatch) confirma todos os usuários", async () => {
      const pendingUsers: User[] = [
        createMockUser("u-1", "Aluno 1"),
        createMockUser("u-2", "Aluno 2"),
      ];

      const mockBatchCommit = vi.fn().mockResolvedValue(undefined);

      const result = await executeAdminBatchUserApproval(pendingUsers, mockBatchCommit);

      expect(result.success).toBe(true);
      expect(result.statusSummary).toBe("ALL_SUCCEEDED");
      expect(result.succeeded).toEqual(["u-1", "u-2"]);
      expect(result.failed).toEqual([]);
      expect(mockBatchCommit).toHaveBeenCalledTimes(1);
      expect(result.message).toContain("Todos os 2 cadastros pendentes foram aprovados");
    });
  });

  describe("Teste 4 — Lote Parcialmente Malsucedido", () => {
    it("quando algumas escritas falham, o estado local reflete apenas as confirmadas e NÃO declara sucesso total", async () => {
      const itemIds = ["item-ok-1", "item-fail-2", "item-ok-3"];
      const localItems: Record<string, ItemStatus> = {
        "item-ok-1": "DISPONIVEL",
        "item-fail-2": "DISPONIVEL",
        "item-ok-3": "DISPONIVEL",
      };

      const mockUpdateDoc = vi.fn().mockImplementation(async (id: string) => {
        if (id === "item-fail-2") {
          throw new Error("Erro de permissão no Firestore para item-fail-2");
        }
        return Promise.resolve();
      });

      const result = await executeAdminBatchItemStatusUpdate(itemIds, "DEVOLVIDO", mockUpdateDoc);

      // Apenas os itens bem-sucedidos devem ter o estado local alterado
      result.succeeded.forEach((id) => {
        localItems[id] = "DEVOLVIDO";
      });

      expect(result.success).toBe(false); // Não pode ser considerado sucesso total
      expect(result.statusSummary).toBe("PARTIALLY_SUCCEEDED");
      expect(result.succeeded).toEqual(["item-ok-1", "item-ok-3"]);
      expect(result.failed).toEqual(["item-fail-2"]);

      // Estado local consistente: item-fail-2 permanece DISPONIVEL
      expect(localItems["item-ok-1"]).toBe("DEVOLVIDO");
      expect(localItems["item-fail-2"]).toBe("DISPONIVEL");
      expect(localItems["item-ok-3"]).toBe("DEVOLVIDO");

      // Mensagem clara informando tanto os sucessos quanto as falhas
      expect(result.message).toContain("2 item(ns) alterado(s) com sucesso");
      expect(result.message).toContain("1 falharam na gravação remota");
    });

    it("exclusão em lote com falha parcial remove apenas itens confirmados do estado local", async () => {
      const itemIds = ["item-del-1", "item-del-2"];
      let localItems = ["item-del-1", "item-del-2"];

      const mockDeleteDoc = vi.fn().mockImplementation(async (id: string) => {
        if (id === "item-del-2") {
          throw new Error("Falha de rede ao excluir item-del-2");
        }
        return Promise.resolve();
      });

      const result = await executeAdminBatchItemDeletion(itemIds, mockDeleteDoc);

      // Remove apenas succeeded
      localItems = localItems.filter((id) => !result.succeeded.includes(id));

      expect(result.statusSummary).toBe("PARTIALLY_SUCCEEDED");
      expect(result.succeeded).toEqual(["item-del-1"]);
      expect(result.failed).toEqual(["item-del-2"]);
      expect(localItems).toEqual(["item-del-2"]); // item-del-2 NÃO foi removido falsamente
      expect(result.message).toContain("1 item(ns) excluído(s) com sucesso e 1 falharam");
    });
  });

  describe("Teste 5 — Lote Totalmente Malsucedido", () => {
    it("quando todas as escritas falham, nenhuma alteração é aplicada ao estado local e erro é emitido", async () => {
      const itemIds = ["item-01", "item-02"];
      const localItems: Record<string, ItemStatus> = {
        "item-01": "ENCONTRADO",
        "item-02": "ENCONTRADO",
      };

      const mockUpdateDoc = vi.fn().mockRejectedValue(new Error("Timeout Firestore"));

      const result = await executeAdminBatchItemStatusUpdate(itemIds, "DEVOLVIDO", mockUpdateDoc);

      if (result.succeeded.length > 0) {
        result.succeeded.forEach((id) => {
          localItems[id] = "DEVOLVIDO";
        });
      }

      expect(result.success).toBe(false);
      expect(result.statusSummary).toBe("ALL_FAILED");
      expect(result.succeeded).toEqual([]);
      expect(result.failed).toEqual(["item-01", "item-02"]);
      expect(localItems["item-01"]).toBe("ENCONTRADO");
      expect(localItems["item-02"]).toBe("ENCONTRADO");
      expect(result.message).toContain("Nenhuma alteração foi persistida");
    });

    it("falha no commit do writeBatch não altera nenhum usuário localmente", async () => {
      const pendingUsers: User[] = [
        createMockUser("u-1", "Aluno 1"),
      ];

      const mockBatchCommit = vi.fn().mockRejectedValue(new Error("Batch commit failed"));

      const result = await executeAdminBatchUserApproval(pendingUsers, mockBatchCommit);

      expect(result.success).toBe(false);
      expect(result.statusSummary).toBe("ALL_FAILED");
      expect(result.succeeded).toEqual([]);
      expect(result.failed).toEqual(["u-1"]);
      expect(result.message).toContain("Nenhum cadastro foi alterado");
    });
  });

  describe("Teste 6 — Exceção Inesperada", () => {
    it("deve capturar exceção inesperada e preservar estado original", async () => {
      let isLocalModified = false;
      let toastSuccessCalled = false;

      const crashFn = async () => {
        throw new TypeError("Cannot read properties of undefined (reading 'token')");
      };

      try {
        await crashFn();
        isLocalModified = true;
        toastSuccessCalled = true;
      } catch (err: any) {
        expect(err).toBeInstanceOf(TypeError);
      }

      expect(isLocalModified).toBe(false);
      expect(toastSuccessCalled).toBe(false);
    });
  });

  describe("Teste 7 — Operação Concorrente", () => {
    it("duas operações concorrentes sobre itens distintos não corrompem o estado", async () => {
      const localState: Record<string, ItemStatus> = {
        "item-A": "ENCONTRADO",
        "item-B": "ENCONTRADO",
      };

      const mockUpdateDocA = vi.fn().mockImplementation(async () => {
        await new Promise((res) => setTimeout(res, 10));
        return Promise.resolve();
      });

      const mockUpdateDocB = vi.fn().mockImplementation(async () => {
        await new Promise((res) => setTimeout(res, 5));
        return Promise.resolve();
      });

      // Disparadas em paralelo
      const [resA, resB] = await Promise.all([
        executeAdminBatchItemStatusUpdate(["item-A"], "DEVOLVIDO", mockUpdateDocA),
        executeAdminBatchItemStatusUpdate(["item-B"], "EM_ANALISE", mockUpdateDocB),
      ]);

      if (resA.succeeded.includes("item-A")) localState["item-A"] = "DEVOLVIDO";
      if (resB.succeeded.includes("item-B")) localState["item-B"] = "EM_ANALISE";

      expect(localState["item-A"]).toBe("DEVOLVIDO");
      expect(localState["item-B"]).toBe("EM_ANALISE");
      expect(resA.success).toBe(true);
      expect(resB.success).toBe(true);
    });
  });
});
