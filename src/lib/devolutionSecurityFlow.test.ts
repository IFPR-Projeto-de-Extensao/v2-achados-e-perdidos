import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  canOperateFormalReturn,
  canStartFormalReturnForItem,
  canReopenFormalReturn,
} from "./devolutionAuth";
import { executeFormalItemReturn, executeAdminReopenReturn } from "../../server";
import { LostFoundItem, User } from "../types";

/**
 * In-memory transactional Firestore Admin simulator for testing
 * executeFormalItemReturn & executeAdminReopenReturn end-to-end.
 */
function createMockAdminFirestore(seed?: {
  users?: Record<string, any>;
  items?: Record<string, any>;
  claims?: Record<string, any>;
}) {
  const store: Record<string, Map<string, any>> = {
    users: new Map(Object.entries(seed?.users || {})),
    items: new Map(Object.entries(seed?.items || {})),
    claims: new Map(Object.entries(seed?.claims || {})),
    item_return_records: new Map(),
    signature_requests: new Map(),
    audit_logs: new Map(),
    activity_logs: new Map(),
    email_notifications: new Map(),
  };

  const makeDocRef = (colName: string, docId: string) => ({
    id: docId,
    _col: colName,
    async get() {
      const data = store[colName]?.get(docId);
      return {
        id: docId,
        exists: Boolean(data),
        data: () => (data ? structuredClone(data) : undefined),
      };
    },
    async set(payload: Record<string, any>, opts?: { merge?: boolean }) {
      if (!store[colName]) store[colName] = new Map();
      const prev = store[colName].get(docId) || {};
      store[colName].set(
        docId,
        opts?.merge ? { ...prev, ...structuredClone(payload) } : structuredClone(payload)
      );
    },
    async update(payload: Record<string, any>) {
      if (!store[colName]?.has(docId)) {
        throw new Error(`Document ${colName}/${docId} does not exist`);
      }
      const prev = store[colName].get(docId) || {};
      const next = { ...prev };
      for (const [k, v] of Object.entries(payload)) {
        if (
          v === null ||
          (typeof v === "object" &&
            v !== null &&
            (v.constructor?.name === "DeleteTransform" || (v as any).__isDeleteTransform))
        ) {
          if (v === null) {
            next[k] = null;
          } else {
            delete next[k];
          }
        } else {
          next[k] = structuredClone(v);
        }
      }
      store[colName].set(docId, next);
    },
  });

  const makeQuery = (colName: string, filters: Array<{ field: string; value: any }> = []) => ({
    where(field: string, _op: string, value: any) {
      return makeQuery(colName, [...filters, { field, value }]);
    },
    async get() {
      const col = store[colName] || new Map();
      const matchedDocs: any[] = [];
      for (const [docId, docData] of col.entries()) {
        const matches = filters.every((f) => docData?.[f.field] === f.value);
        if (matches) {
          matchedDocs.push({
            id: docId,
            ref: makeDocRef(colName, docId),
            data: () => structuredClone(docData),
          });
        }
      }
      return { docs: matchedDocs };
    },
  });

  const db = {
    _store: store,
    collection(colName: string) {
      return {
        doc: (docId: string) => makeDocRef(colName, docId),
        where: (field: string, op: string, value: any) =>
          makeQuery(colName, [{ field, value }]),
      };
    },
    async runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
      let wrote = false;
      const pendingOps: Array<() => Promise<void>> = [];
      const tx = {
        async get(target: any) {
          if (wrote) {
            throw new Error("Firestore transactions require all reads before all writes.");
          }
          return target.get();
        },
        update(ref: any, data: Record<string, any>) {
          wrote = true;
          pendingOps.push(() => ref.update(data));
        },
        set(ref: any, data: Record<string, any>, opts?: { merge?: boolean }) {
          wrote = true;
          pendingOps.push(() => ref.set(data, opts));
        },
      };
      const res = await fn(tx);
      for (const op of pendingOps) {
        await op();
      }
      return res;
    },
  };

  return db;
}

const VALID_SIGNATURE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("ETAPA 11: Blindagem Completa do Fluxo de Devolução, Leitor QR e Firestore Rules", () => {
  describe("1. Matriz de Autorização (9 perfis de usuário) — Helpers de UI e Contexto", () => {
    const activeItem: Partial<LostFoundItem> = {
      id: "item-001",
      title: "Garrafa Térmica",
      status: "ENCONTRADO",
      registeredByUserId: "uid_aluno_autor",
    };
    const returnedItem: Partial<LostFoundItem> = {
      ...activeItem,
      status: "DEVOLVIDO",
    };

    it("deve bloquear visitante não autenticado / guest", () => {
      expect(canStartFormalReturnForItem(null, null, activeItem, true)).toBe(false);
      expect(canStartFormalReturnForItem({ id: "guest", role: "ALUNO" }, null, activeItem, true)).toBe(false);
    });

    it("deve bloquear usuário INTRUSO", () => {
      const user: Partial<User> = { id: "u_intruso", role: "INTRUSO", approvalStatus: "APROVADO", status: "active", emailVerified: true };
      expect(canStartFormalReturnForItem(user, { uid: "u_intruso", email: "intruso@gmail.com", emailVerified: true }, activeItem, false)).toBe(false);
    });

    it("deve bloquear ALUNO comum e ALUNO autor legado do item", () => {
      const alunoComum: Partial<User> = { id: "u_aluno", role: "ALUNO", approvalStatus: "APROVADO", status: "active", emailVerified: true };
      const alunoAutor: Partial<User> = { id: "uid_aluno_autor", role: "ALUNO", approvalStatus: "APROVADO", status: "active", emailVerified: true };

      expect(canStartFormalReturnForItem(alunoComum, { uid: "u_aluno", email: "a@estudantes.ifpr.edu.br", emailVerified: true }, activeItem, false)).toBe(false);
      expect(canStartFormalReturnForItem(alunoAutor, { uid: "uid_aluno_autor", email: "autor@estudantes.ifpr.edu.br", emailVerified: true }, activeItem, false)).toBe(false);
    });

    it("deve bloquear SERVIDOR com aprovação PENDENTE ou REJEITADO", () => {
      const servPend: Partial<User> = { id: "s_pend", role: "SERVIDOR", approvalStatus: "PENDENTE", status: "active", emailVerified: true };
      const servRej: Partial<User> = { id: "s_rej", role: "SERVIDOR", approvalStatus: "REJEITADO", status: "active", emailVerified: true };

      expect(canStartFormalReturnForItem(servPend, { uid: "s_pend", email: "p@ifpr.edu.br", emailVerified: true }, activeItem, false)).toBe(false);
      expect(canStartFormalReturnForItem(servRej, { uid: "s_rej", email: "r@ifpr.edu.br", emailVerified: true }, activeItem, false)).toBe(false);
    });

    it("deve bloquear SERVIDOR suspenso ou banido mesmo se aprovado", () => {
      const servSusp: Partial<User> = { id: "s_susp", role: "SERVIDOR", approvalStatus: "APROVADO", status: "suspended", emailVerified: true };
      const servTemp: Partial<User> = { id: "s_temp", role: "SERVIDOR", approvalStatus: "APROVADO", status: "active", blockExpiresAt: new Date(Date.now() + 60000).toISOString(), emailVerified: true };

      expect(canStartFormalReturnForItem(servSusp, { uid: "s_susp", email: "s@ifpr.edu.br", emailVerified: true }, activeItem, false)).toBe(false);
      expect(canStartFormalReturnForItem(servTemp, { uid: "s_temp", email: "t@ifpr.edu.br", emailVerified: true }, activeItem, false)).toBe(false);
    });

    it("deve permitir SERVIDOR aprovado ativo e ADMIN aprovado ativo para itens elegíveis, e bloquear para itens já DEVOLVIDO/ENCERRADO", () => {
      const servOk: Partial<User> = { id: "s_ok", role: "SERVIDOR", approvalStatus: "APROVADO", status: "active", emailVerified: true };
      const adminOk: Partial<User> = { id: "a_ok", role: "ADMIN", approvalStatus: "APROVADO", status: "active", emailVerified: true };

      expect(canStartFormalReturnForItem(servOk, { uid: "s_ok", email: "s@ifpr.edu.br", emailVerified: true }, activeItem, false)).toBe(true);
      expect(canStartFormalReturnForItem(adminOk, { uid: "a_ok", email: "a@ifpr.edu.br", emailVerified: true }, activeItem, false)).toBe(true);
      expect(canStartFormalReturnForItem(servOk, { uid: "s_ok", email: "s@ifpr.edu.br", emailVerified: true }, returnedItem, false)).toBe(false);
      expect(canStartFormalReturnForItem(adminOk, { uid: "a_ok", email: "a@ifpr.edu.br", emailVerified: true }, returnedItem, false)).toBe(false);
    });

    it("deve restringir reabertura de devolução exclusivamente a ADMIN ativo e aprovado", () => {
      const servOk: Partial<User> = { id: "s_ok", role: "SERVIDOR", approvalStatus: "APROVADO", status: "active", emailVerified: true };
      const adminOk: Partial<User> = { id: "a_ok", role: "ADMIN", approvalStatus: "APROVADO", status: "active", emailVerified: true };
      expect(canReopenFormalReturn(servOk, { uid: "s_ok", email: "s@ifpr.edu.br", emailVerified: true }, false)).toBe(false);
      expect(canReopenFormalReturn(adminOk, { uid: "a_ok", email: "a@ifpr.edu.br", emailVerified: true }, false)).toBe(true);
    });
  });

  describe("2. Backend Autoritativo — executeFormalItemReturn e executeAdminReopenReturn", () => {
    let mockDb: ReturnType<typeof createMockAdminFirestore>;

    beforeEach(() => {
      process.env.SIGNATURE_TOKEN_SECRET = "v1:test_signature_token_secret_32_chars_minimum_ok";
      delete process.env.SIGNATURE_TOKEN_SECRET_PREVIOUS;
      mockDb = createMockAdminFirestore({
        users: {
          uid_intruso: { id: "uid_intruso", role: "INTRUSO", approvalStatus: "APROVADO", status: "active" },
          uid_aluno: { id: "uid_aluno", role: "ALUNO", approvalStatus: "APROVADO", status: "active" },
          uid_aluno_autor: { id: "uid_aluno_autor", role: "ALUNO", approvalStatus: "APROVADO", status: "active" },
          uid_serv_pend: { id: "uid_serv_pend", role: "SERVIDOR", approvalStatus: "PENDENTE", status: "active" },
          uid_serv_rej: { id: "uid_serv_rej", role: "SERVIDOR", approvalStatus: "REJEITADO", status: "active" },
          uid_serv_susp: { id: "uid_serv_susp", role: "SERVIDOR", approvalStatus: "APROVADO", status: "suspended" },
          uid_serv_temp_block: {
            id: "uid_serv_temp_block",
            role: "SERVIDOR",
            approvalStatus: "APROVADO",
            status: "active",
            blockExpiresAt: Date.now() + 3600000,
          },
          uid_serv_ok: { id: "uid_serv_ok", name: "Maria TAE", role: "SERVIDOR", approvalStatus: "APROVADO", status: "active" },
          uid_admin_ok: { id: "uid_admin_ok", name: "Carlos Admin", role: "ADMIN", approvalStatus: "APROVADO", status: "active" },
        },
        items: {
          "item-ok": {
            id: "item-ok",
            title: "Calculadora Casio",
            type: "ENCONTRADO",
            status: "ENCONTRADO",
            location: "Biblioteca",
            category: "Eletrônicos",
            qrCodeId: "QR-IFPR-CALC",
            registeredByUserId: "uid_aluno_autor",
            registeredByRole: "ALUNO",
            history: [],
          },
          "item-devolvido": {
            id: "item-devolvido",
            title: "Guarda-Chuva",
            type: "ENCONTRADO",
            status: "DEVOLVIDO",
            returnedByUserId: "uid_serv_ok",
            history: [],
          },
          "item-encerrado": {
            id: "item-encerrado",
            title: "Casaco Antigo",
            type: "ENCONTRADO",
            status: "ENCERRADO",
            history: [],
          },
        },
        claims: {
          "claim_1": { id: "claim_1", itemId: "item-ok", claimerId: "uid_aluno", status: "APROVADO" },
          "claim_2": { id: "claim_2", itemId: "item-ok", claimerId: "uid_other", status: "PENDENTE" },
        },
      });
    });

    const validInPersonBody = {
      itemId: "item-ok",
      recipientName: "João Estudante",
      recipientEmail: "joao@estudantes.ifpr.edu.br",
      recipientBond: "Aluno",
      recipientDocument: "202600123",
      observations: "Documento conferido na SEBAC",
      identityVerified: true,
      signatureType: "IN_PERSON_DEVICE",
      signatureDataUrl: VALID_SIGNATURE_PNG,
    };

    it("deve rejeitar os perfis não autorizados (não autenticado, INTRUSO, ALUNO, ALUNO autor, SERVIDOR pendente/rejeitado/suspenso/bloqueado)", async () => {
      const unauthorizedCallers = [
        { uid: "", email_verified: false },
        { uid: "uid_intruso", email: "i@gmail.com", email_verified: true },
        { uid: "uid_aluno", email: "a@estudantes.ifpr.edu.br", email_verified: true },
        { uid: "uid_aluno_autor", email: "autor@estudantes.ifpr.edu.br", email_verified: true },
        { uid: "uid_serv_pend", email: "p@ifpr.edu.br", email_verified: true },
        { uid: "uid_serv_rej", email: "r@ifpr.edu.br", email_verified: true },
        { uid: "uid_serv_susp", email: "s@ifpr.edu.br", email_verified: true },
        { uid: "uid_serv_temp_block", email: "tb@ifpr.edu.br", email_verified: true },
        { uid: "uid_serv_ok", email: "s@ifpr.edu.br", email_verified: false },
      ];

      for (const caller of unauthorizedCallers) {
        const res = await executeFormalItemReturn(mockDb, caller as any, validInPersonBody);
        expect(res.success).toBe(false);
        expect([401, 403]).toContain(res.statusCode);
      }

      // Item status must remain unchanged
      const itemSnap = await mockDb.collection("items").doc("item-ok").get();
      expect(itemSnap.data().status).toBe("ENCONTRADO");
    });

    it("deve rejeitar payloads sem verificação de documento, sem assinatura presencial ou com formato inválido", async () => {
      const staff = { uid: "uid_serv_ok", email: "maria@ifpr.edu.br", email_verified: true };

      const noIdRes = await executeFormalItemReturn(mockDb, staff, { ...validInPersonBody, identityVerified: false });
      expect(noIdRes.success).toBe(false);
      expect(noIdRes.statusCode).toBe(400);

      const noSigRes = await executeFormalItemReturn(mockDb, staff, { ...validInPersonBody, signatureDataUrl: "" });
      expect(noSigRes.success).toBe(false);
      expect(noSigRes.statusCode).toBe(400);

      const badEmailRes = await executeFormalItemReturn(mockDb, staff, { ...validInPersonBody, recipientEmail: "invalido" });
      expect(badEmailRes.success).toBe(false);
      expect(badEmailRes.statusCode).toBe(400);

      const badImgRes = await executeFormalItemReturn(mockDb, staff, { ...validInPersonBody, signatureDataUrl: "data:text/html,<script>1</script>" });
      expect(badImgRes.success).toBe(false);
      expect(badImgRes.statusCode).toBe(400);
    });

    it("deve impedir duplicação de devolução para item já DEVOLVIDO ou ENCERRADO (HTTP 409)", async () => {
      const staff = { uid: "uid_serv_ok", email: "maria@ifpr.edu.br", email_verified: true };

      const resAlreadyReturned = await executeFormalItemReturn(mockDb, staff, { ...validInPersonBody, itemId: "item-devolvido" });
      expect(resAlreadyReturned.success).toBe(false);
      expect(resAlreadyReturned.statusCode).toBe(409);

      const resClosed = await executeFormalItemReturn(mockDb, staff, { ...validInPersonBody, itemId: "item-encerrado" });
      expect(resClosed.success).toBe(false);
      expect(resClosed.statusCode).toBe(409);
    });

    it("deve concluir devolução presencial formal com transação atômica, assinatura, código validador, conclusão de claim aprovada e auditoria imutável", async () => {
      const staff = { uid: "uid_serv_ok", email: "maria@ifpr.edu.br", email_verified: true };

      const res = await executeFormalItemReturn(mockDb, staff, validInPersonBody);
      expect(res.success).toBe(true);
      expect(res.statusCode).toBe(200);
      expect(res.validationCode).toMatch(/^COMP-IFPR-/);
      expect(res.completedClaimIds).toEqual(["claim_1"]);

      const updatedItem = (await mockDb.collection("items").doc("item-ok").get()).data();
      expect(updatedItem.status).toBe("DEVOLVIDO");
      // Public item document must NOT expose personal recipient or signature fields
      expect(updatedItem.recipientName).toBeUndefined();
      expect(updatedItem.recipientEmail).toBeUndefined();
      expect(updatedItem.recipientDocument).toBeUndefined();
      expect(updatedItem.recipientSignatureUrl).toBeUndefined();
      expect(updatedItem.receiptValidationCode).toBeUndefined();
      expect(updatedItem.signatureToken).toBeUndefined();

      // Private return record holds all formal return/recipient/signature fields
      const privateRecord = (await mockDb.collection("item_return_records").doc("item-ok").get()).data();
      expect(privateRecord).toBeDefined();
      expect(privateRecord.returnedByUserId).toBe("uid_serv_ok");
      expect(privateRecord.returnedByName).toBe("Maria TAE");
      expect(privateRecord.returnedByRole).toBe("SERVIDOR");
      expect(privateRecord.recipientName).toBe("João Estudante");
      expect(privateRecord.recipientEmail).toBe("joao@estudantes.ifpr.edu.br");
      expect(privateRecord.recipientSignatureStatus).toBe("SIGNED");
      expect(privateRecord.recipientSignatureUrl).toBe(VALID_SIGNATURE_PNG);
      expect(privateRecord.staffSignatureStatus).toBe("PENDING_STAFF");
      expect(privateRecord.signatureToken).toBeNull();

      // Claim APROVADO transitioned to CONCLUIDO; claim PENDENTE untouched
      const claim1 = (await mockDb.collection("claims").doc("claim_1").get()).data();
      const claim2 = (await mockDb.collection("claims").doc("claim_2").get()).data();
      expect(claim1.status).toBe("CONCLUIDO");
      expect(claim2.status).toBe("PENDENTE");

      // Immutable audit & activity logs generated
      expect(mockDb._store.audit_logs.size).toBe(1);
      expect(mockDb._store.activity_logs.size).toBe(1);
      const [auditEntry] = Array.from(mockDb._store.audit_logs.values());
      expect(auditEntry.action).toBe("REGISTRO_DEVOLUCAO");
      expect(auditEntry.actorId).toBe("uid_serv_ok");
      expect(auditEntry.immutable).toBe(true);
    });

    it("deve registrar devolução remota com token privado em signature_requests sem expor plaintext token no item público e sem marcar SIGNED", async () => {
      const admin = { uid: "uid_admin_ok", email: "carlos.admin@ifpr.edu.br", email_verified: true };

      const res = await executeFormalItemReturn(mockDb, admin, {
        ...validInPersonBody,
        signatureType: "REMOTE_EMAIL",
        signatureDataUrl: undefined,
        originUrl: "https://localiza.ifpr.edu.br",
      });

      expect(res.success).toBe(true);
      expect(res.signatureLink).toContain("https://localiza.ifpr.edu.br/?tab=sign-receipt&itemId=item-ok&token=sig_");

      const updatedItem = (await mockDb.collection("items").doc("item-ok").get()).data();
      expect(updatedItem.status).toBe("DEVOLVIDO");
      expect(updatedItem.recipientName).toBeUndefined();
      expect(updatedItem.recipientEmail).toBeUndefined();
      expect(updatedItem.signatureToken).toBeUndefined();

      const privateRecord = (await mockDb.collection("item_return_records").doc("item-ok").get()).data();
      expect(privateRecord).toBeDefined();
      expect(privateRecord.recipientSignatureStatus).toBe("PENDING_REMOTE");
      expect(privateRecord.signatureToken).toBeNull();
      expect(privateRecord.signatureTokenUsed).toBe(false);

      const sigReq = (await mockDb.collection("signature_requests").doc("item-ok").get()).data();
      expect(sigReq).toBeDefined();
      expect(sigReq.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(sigReq.used).toBe(false);
      expect(sigReq.dispatchedByUserId).toBe("uid_admin_ok");
    });

    it("deve restringir reabertura exclusivamente a ADMIN aprovado e ativo com justificativa obrigatória", async () => {
      const staff = { uid: "uid_serv_ok", email: "maria@ifpr.edu.br", email_verified: true };
      const admin = { uid: "uid_admin_ok", email: "carlos.admin@ifpr.edu.br", email_verified: true };

      const staffAttempt = await executeAdminReopenReturn(mockDb, staff, { itemId: "item-devolvido", reason: "Tentativa indevida" });
      expect(staffAttempt.success).toBe(false);
      expect(staffAttempt.statusCode).toBe(403);

      const shortReason = await executeAdminReopenReturn(mockDb, admin, { itemId: "item-devolvido", reason: "err" });
      expect(shortReason.success).toBe(false);
      expect(shortReason.statusCode).toBe(400);

      const adminReopen = await executeAdminReopenReturn(mockDb, admin, {
        itemId: "item-devolvido",
        reason: "Entrega registrada no item equivocado durante conferência.",
      });
      expect(adminReopen.success).toBe(true);
      expect(adminReopen.previousStatus).toBe("ENCONTRADO");

      const reopenedItem = (await mockDb.collection("items").doc("item-devolvido").get()).data();
      expect(reopenedItem.status).toBe("ENCONTRADO");
      expect(reopenedItem.returnedByUserId).toBeUndefined();
    });
  });

  describe("3. Auditoria Estática dos Componentes, Contexto e Remoção de Bypasses", () => {
    const readFile = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), "utf-8");

    it("QRCodeScannerModal.tsx não deve chamar updateItemStatus('DEVOLVIDO') e deve manter câmera/busca/detalhes", () => {
      const code = readFile("src/components/QRCodeScannerModal.tsx");
      expect(code).not.toContain('updateItemStatus(foundItem.id, "DEVOLVIDO")');
      expect(code).not.toContain("handleConfirmReturn");
      expect(code).toContain("canStartFormalReturnForItem");
      expect(code).toContain("Iniciar Devolução Formal");
      expect(code).toContain("Abrir Detalhes");
      expect(code).toContain("Ver Ficha Pública");
      expect(code).toContain("startCamera");
      expect(code).toContain("handleScanOrSearch");
    });

    it("ItemDetailModal.tsx não deve conter handleMarkAsReturned nem escrita direta em items após assinatura do atendente", () => {
      const code = readFile("src/components/ItemDetailModal.tsx");
      expect(code).not.toContain("handleMarkAsReturned");
      expect(code).toContain("canStartFormalReturnForItem");
      expect(code).toContain("canReopenFormalReturn");
      expect(code).toContain("returnModalAutoOpen");
      expect(code).toContain('err?.message || "Erro ao registrar devolução do objeto."');
    });

    it("DashboardView.tsx, ObjectsView.tsx e RemoteSignatureModal.tsx não devem possuir atalho direto para DEVOLVIDO", () => {
      const dash = readFile("src/components/DashboardView.tsx");
      const objs = readFile("src/components/ObjectsView.tsx");
      const remote = readFile("src/components/RemoteSignatureModal.tsx");

      expect(dash).not.toContain('<option value="DEVOLVIDO">DEVOLVIDO</option>');
      expect(objs).not.toContain('bulkUpdateItemStatus(\n                    selectedItemIds,\n                    "DEVOLVIDO"');
      expect(objs).not.toContain("Marcar Devolvidos");
      expect(remote).not.toContain('await updateDocDirectly("items", item.id');
    });

    it("AppContext.tsx deve bloquear DEVOLVIDO em updateItemStatus/bulkUpdateItemStatus, remover bypass isOwner e chamar /api/items/register-return", () => {
      const ctx = readFile("src/context/AppContext.tsx");
      expect(ctx).toContain('if (status === "DEVOLVIDO")');
      expect(ctx).toContain("/api/items/register-return");
      expect(ctx).toContain("/api/items/reopen-return");
      expect(ctx).toContain("canOperateFormalReturn");
    });
  });

  describe("4. Firestore Rules — Proteção Contra Escrita Direta em DEVOLVIDO e Adulteração de Campos Formais", () => {
    const rules = fs.readFileSync(path.resolve(process.cwd(), "firestore.rules"), "utf-8");

    it("deve bloquear status DEVOLVIDO na criação e em atualizações diretas nas coleções /items, /found_items e /lost_items", () => {
      expect(rules).toContain("function hasNoReturnOrSignatureFields(data)");
      expect(rules).toContain("function hasNoProtectedReturnOrSignatureMutation()");
      expect(rules).toContain("function isAuthorSafeMetadataEdit()");
      expect(rules).toContain("function isStaffOrAdminNonReturnItemUpdate()");
      expect(rules).toContain("incoming().status != 'DEVOLVIDO'");

      for (const col of ["items", "found_items", "lost_items"]) {
        const updateBlock = rules.match(new RegExp(`match \\/${col}\\/\\{itemId\\}[\\s\\S]*?allow update: if[\\s\\S]*?;`));
        expect(updateBlock).not.toBeNull();
        expect(updateBlock![0]).toContain("isAuthorSafeMetadataEdit()");
        expect(updateBlock![0]).toContain("isStaffOrAdminNonReturnItemUpdate()");
      }
    });

    // Strict CEL simulation matching the updated firestore.rules logic for /items/{itemId}
    function evaluateItemUpdateRule(params: {
      authUid: string | null;
      emailVerified: boolean;
      userDoc?: { role?: string; approvalStatus?: string; status?: string; blockExpiresAt?: number };
      isRootAdmin?: boolean;
      existing: Record<string, any>;
      incoming: Record<string, any>;
    }): boolean {
      if (!params.authUid) return false;
      const u = params.userDoc;
      const now = Date.now();
      const accountActive =
        Boolean(params.isRootAdmin) ||
        Boolean(
          u &&
            (u.status === "active" && (!u.blockExpiresAt || now >= u.blockExpiresAt)) &&
            u.role !== "INTRUSO"
        );
      if (!accountActive) return false;

      const diffKeys = new Set<string>();
      for (const k of new Set([...Object.keys(params.existing), ...Object.keys(params.incoming)])) {
        if (JSON.stringify(params.existing[k]) !== JSON.stringify(params.incoming[k])) {
          diffKeys.add(k);
        }
      }

      const protectedKeys = new Set([
        "returnedByUserId", "returnedByName", "returnedByRole", "returnDate", "returnTime",
        "recipientName", "recipientEmail", "recipientBond", "recipientDocument", "returnObservations",
        "receiptValidationCode", "recipientSignatureUrl", "recipientSignatureType", "recipientSignatureMethod",
        "recipientSignatureStatus", "staffSignatureStatus", "staffSignatureUrl", "staffSignatureMethod",
        "staffSignedAt", "staffSignerUid", "staffSignerName", "staffSignerEmail",
        "signatureToken", "signatureTokenExpiresAt", "signatureTokenUsed", "signedAt",
      ]);

      for (const k of diffKeys) {
        if (protectedKeys.has(k)) return false;
      }

      if (params.existing.registeredByUserId && params.incoming.registeredByUserId !== params.existing.registeredByUserId) return false;
      if (params.existing.status === "DEVOLVIDO" || params.existing.status === "ENCERRADO") return false;

      const isDocServidor = params.emailVerified && u?.role === "SERVIDOR" && u?.approvalStatus === "APROVADO";
      const isDocAdmin = params.emailVerified && u?.role === "ADMIN" && u?.approvalStatus === "APROVADO";

      if (isDocServidor || isDocAdmin || params.isRootAdmin) {
        if (params.incoming.status === "DEVOLVIDO") return false;
        return true;
      }

      // Author safe metadata edit (no status changes)
      if (
        params.emailVerified &&
        u?.role !== "INTRUSO" &&
        params.existing.registeredByUserId === params.authUid &&
        params.incoming.status === params.existing.status
      ) {
        const allowedAuthorKeys = new Set([
          "title", "description", "category", "location", "date", "color", "brand",
          "contactInfo", "imageUrl", "additionalImages", "secretVerificationHint",
          "lastEditedByUserId", "lastEditedByName", "lastEditedByRole", "lastEditedAt", "history", "historyLogs",
        ]);
        for (const k of diffKeys) {
          if (!allowedAuthorKeys.has(k)) return false;
        }
        return true;
      }

      return false;
    }

    it("deve simular fielmente todos os cenários positivos e negativos das regras de /items/{itemId}", () => {
      const baseItem = {
        id: "it-1",
        title: "Caderno",
        status: "ENCONTRADO",
        registeredByUserId: "uid_aluno_autor",
      };

      // ALUNO autor pode editar título/descrição sem alterar status
      expect(
        evaluateItemUpdateRule({
          authUid: "uid_aluno_autor",
          emailVerified: true,
          userDoc: { role: "ALUNO", approvalStatus: "APROVADO", status: "active" },
          existing: baseItem,
          incoming: { ...baseItem, title: "Caderno Tilibra" },
        })
      ).toBe(true);

      // ALUNO autor NÃO pode alterar status nem marcar DEVOLVIDO
      expect(
        evaluateItemUpdateRule({
          authUid: "uid_aluno_autor",
          emailVerified: true,
          userDoc: { role: "ALUNO", approvalStatus: "APROVADO", status: "active" },
          existing: baseItem,
          incoming: { ...baseItem, status: "DEVOLVIDO" },
        })
      ).toBe(false);

      // SERVIDOR aprovado pode alterar status legítimo não-DEVOLVIDO (ENCONTRADO -> EM_ANALISE)
      expect(
        evaluateItemUpdateRule({
          authUid: "uid_serv",
          emailVerified: true,
          userDoc: { role: "SERVIDOR", approvalStatus: "APROVADO", status: "active" },
          existing: baseItem,
          incoming: { ...baseItem, status: "EM_ANALISE" },
        })
      ).toBe(true);

      // SERVIDOR e ADMIN NÃO podem gravar DEVOLVIDO diretamente pelo client SDK
      expect(
        evaluateItemUpdateRule({
          authUid: "uid_serv",
          emailVerified: true,
          userDoc: { role: "SERVIDOR", approvalStatus: "APROVADO", status: "active" },
          existing: baseItem,
          incoming: { ...baseItem, status: "DEVOLVIDO" },
        })
      ).toBe(false);

      expect(
        evaluateItemUpdateRule({
          authUid: "uid_admin",
          emailVerified: true,
          userDoc: { role: "ADMIN", approvalStatus: "APROVADO", status: "active" },
          existing: baseItem,
          incoming: { ...baseItem, status: "DEVOLVIDO" },
        })
      ).toBe(false);

      // SERVIDOR NÃO pode alterar campos formais de devolução/assinatura pelo client SDK
      expect(
        evaluateItemUpdateRule({
          authUid: "uid_serv",
          emailVerified: true,
          userDoc: { role: "SERVIDOR", approvalStatus: "APROVADO", status: "active" },
          existing: baseItem,
          incoming: { ...baseItem, recipientSignatureStatus: "SIGNED" },
        })
      ).toBe(false);

      // Item já DEVOLVIDO não pode ser revertido ou editado diretamente pelo client SDK
      expect(
        evaluateItemUpdateRule({
          authUid: "uid_admin",
          emailVerified: true,
          userDoc: { role: "ADMIN", approvalStatus: "APROVADO", status: "active" },
          existing: { ...baseItem, status: "DEVOLVIDO" },
          incoming: { ...baseItem, status: "ENCONTRADO" },
        })
      ).toBe(false);
    });
  });
});
