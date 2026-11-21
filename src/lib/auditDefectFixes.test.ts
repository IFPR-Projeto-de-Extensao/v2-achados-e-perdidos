import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import http from "http";
import fs from "fs";
import path from "path";
import {
  isVerifiedRootAdminAuthUser,
  ROOT_ADMIN_EMAIL,
  ROOT_ADMIN_UID,
} from "./devolutionAuth";
import {
  evaluateExistingRemoteItem,
  evaluateOfflineSyncOwnership,
} from "./offlineSyncRecovery";
import { fetchAllPaginatedPublicRecords } from "./publicApiPagination";

const hoisted = vi.hoisted(() => {
  const store: Record<string, Map<string, any>> = {
    items: new Map(),
    item_history: new Map(),
    users: new Map(),
  };

  const resetStore = () => {
    for (const col of Object.values(store)) {
      col.clear();
    }
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
  });

  const makeQuery = (
    colName: string,
    orderField: string | null = null,
    startAfterId: string | null = null,
    limitCount: number | null = null
  ) => ({
    orderBy(field: string) {
      return makeQuery(colName, field, startAfterId, limitCount);
    },
    startAfter(cursorSnap: any) {
      return makeQuery(colName, orderField, cursorSnap?.id || null, limitCount);
    },
    limit(n: number) {
      return makeQuery(colName, orderField, startAfterId, n);
    },
    async get() {
      const col = store[colName] || new Map();
      let docs = Array.from(col.entries()).map(([docId, docData]) => ({
        id: docId,
        ref: makeDocRef(colName, docId),
        data: () => structuredClone(docData),
      }));

      if (orderField === "__name__") {
        docs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      }

      if (startAfterId) {
        const idx = docs.findIndex((d) => d.id === startAfterId);
        if (idx >= 0) {
          docs = docs.slice(idx + 1);
        }
      }

      if (typeof limitCount === "number" && limitCount > 0) {
        docs = docs.slice(0, limitCount);
      }

      return {
        docs,
        size: docs.length,
        empty: docs.length === 0,
      };
    },
  });

  const mockDb = {
    collection(colName: string) {
      return {
        doc: (docId: string) => makeDocRef(colName, docId),
        orderBy: (field: string) => makeQuery(colName, field),
        startAfter: (cursorSnap: any) => makeQuery(colName, null, cursorSnap?.id || null),
        limit: (n: number) => makeQuery(colName, null, null, n),
        get: () => makeQuery(colName).get(),
      };
    },
  };

  return { store, resetStore, mockDb };
});

vi.mock("firebase-admin/app", () => ({
  getApps: () => [{ name: "mock-admin-app" }],
  initializeApp: () => ({ name: "mock-admin-app" }),
  cert: (c: any) => c,
}));

vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({
    async verifyIdToken() {
      throw new Error("Mock auth unused");
    },
  }),
}));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => hoisted.mockDb,
  FieldValue: {
    delete: () => ({ __isDeleteTransform: true }),
    serverTimestamp: () => new Date().toISOString(),
  },
  Timestamp: {
    now: () => ({ toDate: () => new Date(), toMillis: () => Date.now() }),
    fromDate: (d: Date) => ({ toDate: () => d, toMillis: () => d.getTime() }),
  },
}));

import app, { sanitizePublicHistoryEntry } from "../../server";
import { isPersistedDocEligibleForItemWrite } from "../context/AppContext";

function evaluateAddItemEligibilityForTest(params: {
  authUser: { uid?: string | null; email?: string | null; emailVerified?: boolean | null } | null;
  userDoc?: Record<string, any> | null;
}): { allowed: boolean; role?: string; reason?: string } {
  const { authUser, userDoc } = params;
  if (!authUser || !authUser.uid || !authUser.email) {
    return { allowed: false, reason: "UNAUTHENTICATED" };
  }
  if (authUser.emailVerified !== true) {
    return { allowed: false, reason: "EMAIL_NOT_VERIFIED" };
  }
  if (isVerifiedRootAdminAuthUser(authUser)) {
    return { allowed: true, role: "ADMIN" };
  }
  if (!isPersistedDocEligibleForItemWrite(userDoc)) {
    return { allowed: false, reason: "USER_DOC_NOT_ELIGIBLE" };
  }
  return { allowed: true, role: String(userDoc!.role) };
}

describe("Auditoria Final — Validação dos 5 Defeitos Comprovados (v1.10.13)", () => {
  let server: http.Server;
  let baseUrl = "";

  const getJson = async (endpoint: string) => {
    const res = await fetch(`${baseUrl}${endpoint}`);
    const json = await res.json().catch(() => ({}));
    return {
      status: res.status,
      headers: res.headers,
      json,
    };
  };

  beforeAll(async () => {
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    hoisted.resetStore();
  });

  describe("Defeito 1 — Identidade do Root Admin no addItem (UID + email + emailVerified)", () => {
    it("1.1 aceita Root Admin legítimo com UID, e-mail e emailVerified: true", () => {
      const res = evaluateAddItemEligibilityForTest({
        authUser: {
          uid: ROOT_ADMIN_UID,
          email: "  PauloCauan39@gmail.com  ",
          emailVerified: true,
        },
      });
      expect(res).toEqual({ allowed: true, role: "ADMIN" });
      expect(
        isVerifiedRootAdminAuthUser({
          uid: ROOT_ADMIN_UID,
          email: ROOT_ADMIN_EMAIL.toUpperCase(),
          emailVerified: true,
        })
      ).toBe(true);
    });

    it("1.2 rejeita mesmo e-mail do Root Admin com UID diferente quando não é staff persistido", () => {
      expect(
        isVerifiedRootAdminAuthUser({
          uid: "uid-atacante-123",
          email: ROOT_ADMIN_EMAIL,
          emailVerified: true,
        })
      ).toBe(false);

      const res = evaluateAddItemEligibilityForTest({
        authUser: {
          uid: "uid-atacante-123",
          email: ROOT_ADMIN_EMAIL,
          emailVerified: true,
        },
        userDoc: { role: "ALUNO", approvalStatus: "APROVADO", status: "active" },
      });
      expect(res.allowed).toBe(false);
    });

    it("1.3 rejeita UID do Root Admin com e-mail divergente no atalho de Root Admin", () => {
      expect(
        isVerifiedRootAdminAuthUser({
          uid: ROOT_ADMIN_UID,
          email: "outro-email@gmail.com",
          emailVerified: true,
        })
      ).toBe(false);

      const res = evaluateAddItemEligibilityForTest({
        authUser: {
          uid: ROOT_ADMIN_UID,
          email: "outro-email@gmail.com",
          emailVerified: true,
        },
        userDoc: { role: "ALUNO", approvalStatus: "APROVADO", status: "active" },
      });
      expect(res.allowed).toBe(false);
    });

    it("1.4 rejeita Root Admin com emailVerified: false mesmo se o Firestore tiver emailVerified: true", () => {
      expect(
        isVerifiedRootAdminAuthUser({
          uid: ROOT_ADMIN_UID,
          email: ROOT_ADMIN_EMAIL,
          emailVerified: false,
        })
      ).toBe(false);

      const res = evaluateAddItemEligibilityForTest({
        authUser: {
          uid: ROOT_ADMIN_UID,
          email: ROOT_ADMIN_EMAIL,
          emailVerified: false,
        },
        userDoc: { role: "ADMIN", approvalStatus: "APROVADO", status: "active", emailVerified: true },
      });
      expect(res).toEqual({ allowed: false, reason: "EMAIL_NOT_VERIFIED" });
    });

    it("1.5 mantém ADMIN não raiz aprovado e verificado elegível para cadastro", () => {
      const res = evaluateAddItemEligibilityForTest({
        authUser: {
          uid: "uid-admin-comum",
          email: "admin.secundario@gmail.com",
          emailVerified: true,
        },
        userDoc: { role: "ADMIN", approvalStatus: "APROVADO", status: "active" },
      });
      expect(res).toEqual({ allowed: true, role: "ADMIN" });
    });

    it("1.6 mantém SERVIDOR com conta Gmail atribuída administrativamente e aprovada elegível para cadastro", () => {
      const res = evaluateAddItemEligibilityForTest({
        authUser: {
          uid: "uid-serv-gmail",
          email: "servidor.teste@gmail.com",
          emailVerified: true,
        },
        userDoc: {
          role: "SERVIDOR",
          approvalStatus: "APROVADO",
          status: "active",
          roleAssignedBy: ROOT_ADMIN_EMAIL,
        },
      });
      expect(res).toEqual({ allowed: true, role: "SERVIDOR" });
    });
  });

  describe("Defeito 2 — Blindagem de sanitizePublicHistoryEntry", () => {
    it("2.1 omite details quando details é um objeto (sem gerar '[object Object]')", () => {
      const entry = sanitizePublicHistoryEntry({
        id: "h-obj",
        itemId: "item-1",
        action: "Atualização",
        actorRole: "SERVIDOR",
        details: { info: "valor interno", recipientName: "Maria" },
        timestamp: "2026-11-17T10:00:00Z",
      });
      expect(entry).toBeTruthy();
      expect(JSON.stringify(entry)).not.toContain("[object Object]");
      expect(entry?.details).not.toContain("Maria");
    });

    it("2.2 omite details quando details é um array", () => {
      const entry = sanitizePublicHistoryEntry({
        id: "h-arr",
        itemId: "item-1",
        action: "Atualização",
        actorRole: "SERVIDOR",
        details: ["linha 1", "linha 2"],
        timestamp: "2026-11-17T10:00:00Z",
      });
      expect(entry).toBeTruthy();
      expect(entry?.details).toBeUndefined();
    });

    it("2.3 omite oldValue e newValue quando são objetos", () => {
      const entry = sanitizePublicHistoryEntry({
        id: "h-oldnew-obj",
        itemId: "item-1",
        action: "Alteração de categoria",
        actorRole: "ADMIN",
        fieldChanged: "category",
        oldValue: { nome: "Antiga" },
        newValue: { nome: "Nova" },
        timestamp: "2026-11-17T10:00:00Z",
      });
      expect(entry).toBeTruthy();
      expect(entry?.oldValue).toBeUndefined();
      expect(entry?.newValue).toBeUndefined();
      expect(JSON.stringify(entry)).not.toContain("[object Object]");
    });

    it("2.4 neutraliza quando objetos aninhados contêm chaves privadas (recipientName/signatureData/cpf)", () => {
      const entry = sanitizePublicHistoryEntry({
        id: "h-nested-priv",
        itemId: "item-1",
        action: "Atualização de item",
        actorRole: "SERVIDOR",
        details: {
          meta: {
            nested: {
              recipientDocument: "111.222.333-44",
              signatureData: "data:image/png;base64,AAA",
            },
          },
        },
        timestamp: "2026-11-17T10:00:00Z",
      });
      expect(entry).toBeTruthy();
      expect(entry?.details).toBe("Atualização institucional registrada (dados privados omitidos na projeção pública).");
    });

    it("2.5 redige e-mail encontrado em texto livre de details/oldValue/newValue", () => {
      const entry = sanitizePublicHistoryEntry({
        id: "h-email",
        itemId: "item-1",
        action: "Observação",
        actorRole: "SERVIDOR",
        details: "Contato via servidor.sebac@ifpr.edu.br",
        oldValue: "antigo@gmail.com",
        timestamp: "2026-11-17T10:00:00Z",
      });
      expect(entry).toBeTruthy();
      expect(entry?.details).not.toContain("ifpr.edu.br");
      expect(entry?.oldValue).toBeUndefined();
    });

    it("2.6 redige telefone encontrado em texto livre", () => {
      const entry = sanitizePublicHistoryEntry({
        id: "h-phone",
        itemId: "item-1",
        action: "Atualização",
        actorRole: "SERVIDOR",
        details: "Ligar para (43) 99988-7766 após as 14h",
        timestamp: "2026-11-17T10:00:00Z",
      });
      expect(entry).toBeTruthy();
      expect(entry?.details).not.toContain("99988");
      expect(entry?.details).toContain("dados privados omitidos");
    });

    it("2.7 redige alteração em contactInfo (fieldChanged='contactInfo')", () => {
      const entry = sanitizePublicHistoryEntry({
        id: "h-contact-field",
        itemId: "item-1",
        action: "Edição",
        actorRole: "ADMIN",
        fieldChanged: "contactInfo",
        oldValue: "Portaria Bloco A",
        newValue: "SEBAC Ramal 4100",
        details: "Alteração de ponto de contato",
        timestamp: "2026-11-17T10:00:00Z",
      });
      expect(entry).toBeTruthy();
      expect((entry as any).fieldChanged).toBeUndefined();
      expect(entry?.oldValue).toBeUndefined();
      expect(entry?.newValue).toBeUndefined();
      expect(entry?.details).toContain("dados privados omitidos");
    });

    it("2.8 redige CPF e RG encontrados em texto livre", () => {
      const cpfEntry = sanitizePublicHistoryEntry({
        id: "h-cpf",
        itemId: "item-1",
        action: "Conferência",
        actorRole: "SERVIDOR",
        details: "Documento conferido: CPF 123.456.789-00",
        timestamp: "2026-11-17T10:00:00Z",
      });
      expect(cpfEntry?.details).not.toContain("123.456.789-00");

      const rgEntry = sanitizePublicHistoryEntry({
        id: "h-rg",
        itemId: "item-1",
        action: "Conferência",
        actorRole: "SERVIDOR",
        details: "Portador RG 10.234.567-8 apresentou documento",
        timestamp: "2026-11-17T10:00:00Z",
      });
      expect(rgEntry?.details).not.toContain("10.234.567-8");
    });

    it("2.9 omite actorName civil mantendo apenas actorRole normalizado", () => {
      const entry = sanitizePublicHistoryEntry({
        id: "h-actor",
        itemId: "item-1",
        action: "Objeto catalogado",
        actorId: "uid-servidor-99",
        actorName: "Prof. João Pedro Ribeiro",
        userName: "Prof. João Pedro Ribeiro",
        actorRole: "ADMIN",
        details: "Local confirmado no Bloco B",
        timestamp: "2026-11-17T10:00:00Z",
      });
      expect(entry).toBeTruthy();
      expect((entry as any).actorName).toBeUndefined();
      expect((entry as any).userName).toBeUndefined();
      expect((entry as any).actorId).toBeUndefined();
      expect(entry?.actorRole).toBe("ADMIN");
    });

    it("2.10 retorna texto institucional padrão em entradas de devolução", () => {
      const entry = sanitizePublicHistoryEntry({
        id: "h-ret",
        itemId: "item-1",
        action: "DEVOLUCAO",
        actorRole: "SERVIDOR",
        recipientName: "Fulano",
        details: "Devolvido a Fulano com assinatura",
        timestamp: "2026-11-17T10:00:00Z",
      });
      expect(entry).toEqual({
        id: "h-ret",
        itemId: "item-1",
        objectId: "item-1",
        action: "Devolução institucional registrada",
        actorRole: "SERVIDOR",
        timestamp: "2026-11-17T10:00:00Z",
        details: "Movimentação formal de devolução registrada no sistema.",
      });
    });

    it("2.11 preserva entrada comum segura sem dados privados", () => {
      const entry = sanitizePublicHistoryEntry({
        id: "h-safe",
        itemId: "item-1",
        action: "Atualização de local",
        actorRole: "SERVIDOR",
        fieldChanged: "location",
        oldValue: "Pátio Central",
        newValue: "SEBAC / Bloco A",
        details: "Objeto transferido para guarda na recepção do campus.",
        timestamp: "2026-11-17T10:00:00Z",
      });
      expect(entry).toEqual({
        id: "h-safe",
        itemId: "item-1",
        objectId: "item-1",
        action: "Atualização de local",
        actorRole: "SERVIDOR",
        timestamp: "2026-11-17T10:00:00Z",
        details: "Objeto transferido para guarda na recepção do campus.",
        fieldChanged: "location",
        oldValue: "Pátio Central",
        newValue: "SEBAC / Bloco A",
      });
    });

    it("2.12 rejeita entradas nulas/não-objeto e descarta campos desconhecidos e tipos malformados", () => {
      expect(sanitizePublicHistoryEntry(null)).toBeNull();
      expect(sanitizePublicHistoryEntry([])).toBeNull();
      expect(sanitizePublicHistoryEntry("texto")).toBeNull();

      const weird = sanitizePublicHistoryEntry({
        id: { bad: true },
        itemId: "item-ok",
        action: "Atualização",
        actorRole: "INVALID_ROLE",
        unknownSecretField: "nao-deve-vazar",
        details: () => "funcao",
        oldValue: [1, 2, 3],
        newValue: true,
        timestamp: 12345,
      });
      expect(weird).toBeTruthy();
      expect((weird as any).unknownSecretField).toBeUndefined();
      expect(weird?.actorRole).toBe("SERVIDOR");
      expect(weird?.id).toBeUndefined();
      expect(weird?.details).toBeUndefined();
      expect(weird?.oldValue).toBeUndefined();
      expect(weird?.newValue).toBe("true");
      expect(weird?.timestamp).toBe("");
    });
  });

  describe("Defeito 3 — Paginação real nos endpoints /api/items/public-catalog e /api/items/public-history", () => {
    it("3.1 pagina 1 de /api/items/public-catalog e /api/items/public-history respeita limit e retorna nextCursor e hasMore", async () => {
      for (const id of ["doc-03", "doc-01", "doc-02"]) {
        hoisted.store.items.set(id, {
          id,
          title: `Objeto ${id}`,
          type: "ENCONTRADO",
          status: "ENCONTRADO",
          category: "Outros",
          location: "Bloco A",
          secretVerificationHint: "Segredo interno",
          secretVerificationKey: "Chave secreta",
        });
        hoisted.store.item_history.set(id, {
          id,
          itemId: id,
          action: "Ocorrência cadastrada",
          actorRole: "SERVIDOR",
          actorName: "Servidor Oculto",
          details: `Detalhe público ${id}`,
          timestamp: "2026-11-17T10:00:00.000Z",
        });
      }

      const catPage1 = await getJson("/api/items/public-catalog?limit=2");
      expect(catPage1.status).toBe(200);
      expect(catPage1.headers.get("cache-control")).toContain("max-age=30");
      expect(catPage1.json.items.map((i: any) => i.id)).toEqual(["doc-01", "doc-02"]);
      expect(catPage1.json.hasMore).toBe(true);
      expect(catPage1.json.nextCursor).toBe("doc-02");
      expect(catPage1.json.limit).toBe(2);

      const histPage1 = await getJson("/api/items/public-history?limit=2");
      expect(histPage1.status).toBe(200);
      expect(histPage1.json.entries.map((e: any) => e.id)).toEqual(["doc-01", "doc-02"]);
      expect(histPage1.json.hasMore).toBe(true);
      expect(histPage1.json.nextCursor).toBe("doc-02");
    });

    it("3.2 página 2 via nextCursor conclui listagem sem duplicatas e com hasMore=false", async () => {
      for (const id of ["a1", "a2", "a3"]) {
        hoisted.store.items.set(id, { id, title: `Item ${id}`, status: "ENCONTRADO" });
        hoisted.store.item_history.set(id, { id, itemId: id, action: "Cadastro", timestamp: "2026-11-17T12:00:00Z" });
      }

      const p1 = await getJson("/api/items/public-catalog?limit=2");
      const p2 = await getJson(`/api/items/public-catalog?limit=2&cursor=${encodeURIComponent(p1.json.nextCursor)}`);
      expect(p2.status).toBe(200);
      expect(p2.json.items.map((i: any) => i.id)).toEqual(["a3"]);
      expect(p2.json.hasMore).toBe(false);
      expect(p2.json.nextCursor).toBeNull();

      const h1 = await getJson("/api/items/public-history?limit=2");
      const h2 = await getJson(`/api/items/public-history?limit=2&cursor=${encodeURIComponent(h1.json.nextCursor)}`);
      expect(h2.status).toBe(200);
      expect(h2.json.entries.map((e: any) => e.id)).toEqual(["a3"]);
      expect(h2.json.hasMore).toBe(false);
      expect(h2.json.nextCursor).toBeNull();
    });

    it("3.3 retorna lista vazia sem erro quando coleção está vazia", async () => {
      const cat = await getJson("/api/items/public-catalog");
      expect(cat.status).toBe(200);
      expect(cat.json).toEqual({
        success: true,
        items: [],
        nextCursor: null,
        hasMore: false,
        limit: 50,
      });

      const hist = await getJson("/api/items/public-history");
      expect(hist.status).toBe(200);
      expect(hist.json).toEqual({
        success: true,
        entries: [],
        nextCursor: null,
        hasMore: false,
        limit: 50,
      });
    });

    it("3.4 retorna erro controlado 400 para cursor inexistente ou malformado", async () => {
      hoisted.store.items.set("item-1", { id: "item-1", title: "Garrafa" });

      const missing = await getJson("/api/items/public-catalog?cursor=nao-existe");
      expect(missing.status).toBe(400);
      expect(missing.json.code).toBe("INVALID_CURSOR");

      const malformed = await getJson("/api/items/public-history?cursor=../segredo");
      expect(malformed.status).toBe(400);
      expect(malformed.json.code).toBe("INVALID_CURSOR");
    });

    it("3.5 aplica clamp para limite acima do máximo (MAX=100) e rejeita limit inválido com 400", async () => {
      hoisted.store.items.set("item-1", { id: "item-1", title: "Garrafa" });
      const clamped = await getJson("/api/items/public-catalog?limit=999");
      expect(clamped.status).toBe(200);
      expect(clamped.json.limit).toBe(100);

      const zero = await getJson("/api/items/public-catalog?limit=0");
      expect(zero.status).toBe(400);
      expect(zero.json.code).toBe("INVALID_LIMIT");

      const alpha = await getJson("/api/items/public-history?limit=abc");
      expect(alpha.status).toBe(400);
      expect(alpha.json.code).toBe("INVALID_LIMIT");
    });

    it("3.6 mantém ordenação determinística por ID de documento (__name__) sem omitir docs sem timestamp", async () => {
      hoisted.store.item_history.set("z-doc", { id: "z-doc", itemId: "i1", action: "Sem timestamp" });
      hoisted.store.item_history.set("a-doc", { id: "a-doc", itemId: "i1", action: "Cadastro" });
      hoisted.store.item_history.set("m-doc", { id: "m-doc", itemId: "i1", action: "Atualização" });

      const page = await getJson("/api/items/public-history?limit=10");
      expect(page.status).toBe(200);
      expect(page.json.entries.map((e: any) => e.id)).toEqual(["a-doc", "m-doc", "z-doc"]);
    });

    it("3.7 não pula nem duplica documentos com timestamps idênticos entre páginas", async () => {
      const sameTs = "2026-11-17T15:00:00.000Z";
      for (const id of ["h-1", "h-2", "h-3", "h-4", "h-5"]) {
        hoisted.store.item_history.set(id, {
          id,
          itemId: "item-same-ts",
          action: "Atualização",
          timestamp: sameTs,
          details: `Evento ${id}`,
        });
      }

      const result = await fetchAllPaginatedPublicRecords<any>(
        `${baseUrl}/api/items/public-history`,
        "entries",
        { limit: 2 }
      );
      expect(result.ok).toBe(true);
      expect(result.pagesLoaded).toBe(3);
      expect(result.records.map((r) => r.id)).toEqual(["h-1", "h-2", "h-3", "h-4", "h-5"]);
    });

    it("3.8 resposta pública não vaza nenhum campo privado mesmo com parâmetros de query adversariais", async () => {
      hoisted.store.items.set("item-priv", {
        id: "item-priv",
        title: "Celular Preto",
        secretVerificationHint: "Tela trincada",
        secretVerificationKey: "IMEI-999",
        recipientName: "Maria Oliveira",
        recipientDocument: "999.888.777-66",
        recipientContact: "(43) 99999-0000",
        receiptValidationCode: "REC-01",
        signatureData: "data:image/png;base64,BBB",
        returnedByUserId: "uid-serv-1",
      });

      const res = await getJson("/api/items/public-catalog?includePrivate=true&raw=1&limit=10");
      expect(res.status).toBe(200);
      expect(res.json.items).toHaveLength(1);
      const item = res.json.items[0];
      expect(item.secretVerificationHint).toBeUndefined();
      expect(item.secretVerificationKey).toBeUndefined();
      expect(item.recipientName).toBeUndefined();
      expect(item.recipientDocument).toBeUndefined();
      expect(item.recipientContact).toBeUndefined();
      expect(item.receiptValidationCode).toBeUndefined();
      expect(item.signatureData).toBeUndefined();
      expect(item.returnedByUserId).toBeUndefined();
    });
  });

  describe("Defeito 4 — Autoria estrita na fila offline (syncOfflineQueue)", () => {
    it("4.1 permite o próprio usuário sincronizar seu item", () => {
      expect(evaluateOfflineSyncOwnership("uid-serv-1", "uid-serv-1")).toEqual({ allowed: true });
    });

    it("4.2 permite ADMIN sincronizar item criado por ele mesmo", () => {
      expect(evaluateOfflineSyncOwnership(ROOT_ADMIN_UID, ROOT_ADMIN_UID)).toEqual({ allowed: true });
    });

    it("4.3 bloqueia ADMIN tentando sincronizar item criado por outro usuário (sem assumir autoria)", () => {
      const check = evaluateOfflineSyncOwnership("uid-outro-servidor", ROOT_ADMIN_UID);
      expect(check.allowed).toBe(false);
      expect(check.errorCode).toBe("AUTH_MISMATCH");
      expect(check.statusMessage).toContain("outra conta");
      expect(check.statusMessage).toContain("seguro na fila");
    });

    it("4.4 bloqueia item sem autor original definido", () => {
      expect(evaluateOfflineSyncOwnership("", "uid-admin").errorCode).toBe("MISSING_ORIGINAL_AUTHOR");
      expect(evaluateOfflineSyncOwnership(undefined, "uid-admin").errorCode).toBe("MISSING_ORIGINAL_AUTHOR");
      expect(evaluateOfflineSyncOwnership(null, "uid-admin").errorCode).toBe("MISSING_ORIGINAL_AUTHOR");
    });

    it("4.5 bloqueia sincronização sem usuário autenticado", () => {
      const check = evaluateOfflineSyncOwnership("uid-serv-1", null);
      expect(check.allowed).toBe(false);
      expect(check.errorCode).toBe("AUTH_REQUIRED");
    });

    it("4.6 bloqueia sobrescrita quando documento remoto já existe com outro autor ou conteúdo (CONFLICT_STOP)", () => {
      const evalRes = evaluateExistingRemoteItem(
        {
          id: "ifpr-1",
          registeredByUserId: "uid-serv-1",
          type: "ENCONTRADO",
          title: "Chaveiro",
          category: "Chaves",
          location: "Bloco A",
          date: "2026-11-17",
          description: "Chaveiro azul",
        },
        {
          id: "ifpr-1",
          registeredByUserId: "uid-serv-2",
          type: "ENCONTRADO",
          title: "Carteira",
          category: "Documentos",
          location: "Bloco B",
          date: "2026-11-17",
          description: "Carteira marrom",
        }
      );
      expect(evalRes.action).toBe("CONFLICT_STOP");
    });

    it("4.7 reconcilia fila sem sobrescrever quando documento remoto é equivalente (CONFIRM_ALREADY_SYNCED)", () => {
      const payload = {
        id: "ifpr-2",
        registeredByUserId: "uid-serv-1",
        type: "ENCONTRADO",
        title: "Mochila",
        category: "Bolsas e Mochilas",
        location: "Biblioteca",
        date: "2026-11-17",
        description: "Mochila preta",
        status: "ENCONTRADO",
      };
      const evalRes = evaluateExistingRemoteItem(payload, { ...payload, status: "DEVOLVIDO" });
      expect(evalRes.action).toBe("CONFIRM_ALREADY_SYNCED");
      expect(evalRes.statusProgressed).toBe(true);
    });

    it("4.8 preserva a fila IndexedDB em falhas de autoria/permissão/conflito em AppContext.tsx", () => {
      const ctxSrc = fs.readFileSync(path.resolve(process.cwd(), "src/context/AppContext.tsx"), "utf8");
      const fnIdx = ctxSrc.indexOf("const syncOfflineQueue = async");
      const fnEnd = ctxSrc.indexOf("const handleSwMessage", fnIdx);
      const syncBody = ctxSrc.slice(fnIdx, fnEnd > fnIdx ? fnEnd : fnIdx + 30000);

      expect(syncBody).toContain("evaluateOfflineSyncOwnership(");
      expect(syncBody).not.toContain("isApprovedAdminSync");
      // Remoção da fila só ocorre após o commit/reconciliação bem-sucedido, nunca nos branches continue/catch
      const authGuardPos = syncBody.indexOf("ownershipCheck.allowed");
      const conflictPos = syncBody.indexOf('remoteEvaluation.action === "CONFLICT_STOP"');
      const removePos = syncBody.indexOf("await removeSyncQueueEntry(entry.id)", conflictPos);
      expect(authGuardPos).toBeGreaterThan(-1);
      expect(conflictPos).toBeGreaterThan(authGuardPos);
      expect(removePos).toBeGreaterThan(conflictPos);
    });
  });

  describe("Defeito 5 — Limpeza de sessão, cache administrativo e sincronia pública", () => {
    it("5.1 limpa caches de usuários, documentos, templates e configurações em logout e troca de usuário sem apagar preferências/IndexedDB", () => {
      const ctxSrc = fs.readFileSync(path.resolve(process.cwd(), "src/context/AppContext.tsx"), "utf8");
      expect(ctxSrc).toContain("const clearAdminAndPrivateSessionState = () =>");
      expect(ctxSrc).toContain("if (previousUid && previousUid !== nextUid) {\n        clearAdminAndPrivateSessionState();");
      expect(ctxSrc).toContain("if (!fbUser) {\n        clearAdminAndPrivateSessionState();");

      const logoutIdx = ctxSrc.indexOf("const logout = async () =>");
      const logoutEnd = ctxSrc.indexOf("const updateUserRole =", logoutIdx);
      const logoutBody = ctxSrc.slice(logoutIdx, logoutEnd);
      expect(logoutBody).toContain("clearAdminAndPrivateSessionState()");
      expect(logoutBody).not.toContain("localStorage.clear()");
    });

    it("5.2 não hidrata allUsers/documentTemplates/generatedDocuments/projectSettings do localStorage antes da autenticação", () => {
      const ctxSrc = fs.readFileSync(path.resolve(process.cwd(), "src/context/AppContext.tsx"), "utf8");
      expect(ctxSrc).toContain("const [allUsers, setAllUsers] = useState<User[]>([]);");
      expect(ctxSrc).toContain(
        "const [documentTemplates, setDocumentTemplates] = useState<DocumentTemplate[]>(DEFAULT_DOCUMENT_TEMPLATES);"
      );
      expect(ctxSrc).toContain(
        "const [generatedDocuments, setGeneratedDocuments] = useState<GeneratedDocumentRecord[]>([]);"
      );
      expect(ctxSrc).toContain(
        "const [projectSettings, setProjectSettings] = useState<ProjectSettings>(DEFAULT_PROJECT_SETTINGS);"
      );
      expect(ctxSrc).toContain("const [backupLogs, setBackupLogs] = useState<BackupLog[]>([]);");
    });

    it("5.3 rebaixa histórico de staff síncronamente no modo PUBLIC_API antes do fetch assíncrono", () => {
      const ctxSrc = fs.readFileSync(path.resolve(process.cwd(), "src/context/AppContext.tsx"), "utf8");
      const publicApiIdx = ctxSrc.indexOf('if (mode === "PUBLIC_API") {');
      expect(publicApiIdx).toBeGreaterThan(-1);
      const publicApiBlock = ctxSrc.slice(publicApiIdx, publicApiIdx + 700);
      const applyEmptyPos = publicApiBlock.indexOf("applyHistoryMap({}, false);");
      const fetchPos = publicApiBlock.indexOf('fetchAllPaginatedPublicRecords<ItemHistoryLog>("/api/items/public-history", "entries")');
      expect(applyEmptyPos).toBeGreaterThan(-1);
      expect(fetchPos).toBeGreaterThan(applyEmptyPos);
      expect(ctxSrc).toContain("(currentUser as any)?.suspendedUntil");
      expect(ctxSrc).toContain("(currentUser as any)?.blockExpiresAt");
    });
  });
});
