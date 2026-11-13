import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import http from "http";
import fs from "fs";
import path from "path";
import {
  PRIVATE_ITEM_FIELDS,
  sanitizePublicItemProjection,
  extractPrivateReturnRecord,
  mergeItemWithPrivateRecord,
} from "./itemPrivacyUtils";
import {
  computeDashboardReturnMetrics,
  isRecipientReturnConcluded,
  isRecipientRemoteSignaturePending,
  isStaffAttestationPending,
  isDualSignatureCompleted,
} from "./dashboardMetricsUtils";

const VALID_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const hoisted = vi.hoisted(() => {
  const store: Record<string, Map<string, any>> = {
    users: new Map(),
    items: new Map(),
    item_return_records: new Map(),
    claims: new Map(),
    signature_requests: new Map(),
    audit_logs: new Map(),
    activity_logs: new Map(),
    email_notifications: new Map(),
    role_assignments: new Map(),
  };

  const tokenUsers = new Map<string, any>();

  const resetStore = () => {
    for (const col of Object.values(store)) {
      col.clear();
    }
    tokenUsers.clear();
  };

  let txLock: Promise<void> = Promise.resolve();
  const withTxLock = async <T>(fn: () => Promise<T>): Promise<T> => {
    const prev = txLock;
    let release!: () => void;
    txLock = new Promise<void>((res) => {
      release = res;
    });
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  };

  const applyPayload = (prev: Record<string, any>, payload: Record<string, any>, merge: boolean) => {
    const base = merge ? { ...prev } : {};
    for (const [k, v] of Object.entries(payload)) {
      if (v && typeof v === "object" && (v as any).__isDeleteTransform) {
        delete base[k];
      } else {
        base[k] = structuredClone(v);
      }
    }
    return base;
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
      store[colName].set(docId, applyPayload(prev, payload, Boolean(opts?.merge)));
    },
    async update(payload: Record<string, any>) {
      if (!store[colName]?.has(docId)) {
        throw new Error(`Document ${colName}/${docId} does not exist`);
      }
      const prev = store[colName].get(docId) || {};
      store[colName].set(docId, applyPayload(prev, payload, true));
    },
  });

  const makeQuery = (colName: string, filters: Array<{ field: string; value: any }> = []) => ({
    where(field: string, _op: string, value: any) {
      return makeQuery(colName, [...filters, { field, value }]);
    },
    limit(_n: number) {
      return this;
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
      return { docs: matchedDocs, size: matchedDocs.length, empty: matchedDocs.length === 0 };
    },
  });

  const mockDb = {
    collection(colName: string) {
      return {
        doc: (docId: string) => makeDocRef(colName, docId),
        where: (field: string, _op: string, value: any) =>
          makeQuery(colName, [{ field, value }]),
        limit: (n: number) => makeQuery(colName, []).limit(n),
        get: () => makeQuery(colName, []).get(),
      };
    },
    async runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
      return withTxLock(async () => {
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
      });
    },
  };

  return { store, tokenUsers, resetStore, mockDb };
});

vi.mock("firebase-admin/app", () => ({
  getApps: () => [{ name: "mock-admin-app" }],
  initializeApp: () => ({ name: "mock-admin-app" }),
  cert: (c: any) => c,
}));

vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({
    async verifyIdToken(token: string) {
      const user = hoisted.tokenUsers.get(token);
      if (!user) {
        throw new Error("Invalid mocked ID token");
      }
      return user;
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

import app, {
  encryptSignatureToken,
  decryptSignatureTokenWithMetadata,
  getSignatureEncryptionKeyring,
  getSignatureLinkEncryptionKey,
  canRemovePreviousEncryptionKey,
} from "../../server";

describe("ETAPA 15 — Correção de Vulnerabilidades de Privacidade, Assinatura e Criptografia", () => {
  let server: http.Server;
  let baseUrl = "";

  const postJson = async (endpoint: string, body: any, bearerToken?: string) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (bearerToken) {
      headers.Authorization = `Bearer ${bearerToken}`;
    }
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  };

  const getJson = async (endpoint: string, bearerToken?: string) => {
    const headers: Record<string, string> = {};
    if (bearerToken) {
      headers.Authorization = `Bearer ${bearerToken}`;
    }
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: "GET",
      headers,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
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
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  beforeEach(() => {
    process.env.SIGNATURE_TOKEN_SECRET = "v2:active_secret_key_with_at_least_32_characters_ok";
    delete process.env.SIGNATURE_TOKEN_SECRET_PREVIOUS;
    delete process.env.SIGNATURE_TOKEN_KEY_ID;
    hoisted.resetStore();

    hoisted.store.users.set("uid-serv-1", {
      id: "uid-serv-1",
      name: "Maria Servidora",
      email: "maria@ifpr.edu.br",
      role: "SERVIDOR",
      approvalStatus: "APROVADO",
      status: "active",
      active: true,
    });
    hoisted.store.users.set("uid-admin-1", {
      id: "uid-admin-1",
      name: "Carlos Admin",
      email: "carlos.admin@ifpr.edu.br",
      role: "ADMIN",
      approvalStatus: "APROVADO",
      status: "active",
      active: true,
    });
    hoisted.store.users.set("uid-aluno-1", {
      id: "uid-aluno-1",
      name: "Ana Aluna",
      email: "ana@estudantes.ifpr.edu.br",
      role: "ALUNO",
      approvalStatus: "APROVADO",
      status: "active",
      active: true,
    });

    hoisted.tokenUsers.set("tok-serv-1", {
      uid: "uid-serv-1",
      email: "maria@ifpr.edu.br",
      email_verified: true,
    });
    hoisted.tokenUsers.set("tok-admin-1", {
      uid: "uid-admin-1",
      email: "carlos.admin@ifpr.edu.br",
      email_verified: true,
    });
    hoisted.tokenUsers.set("tok-aluno-1", {
      uid: "uid-aluno-1",
      email: "ana@estudantes.ifpr.edu.br",
      email_verified: true,
    });

    hoisted.store.items.set("item-etapa15", {
      id: "item-etapa15",
      title: "Mochila Dell Preta",
      description: "Mochila encontrada na biblioteca",
      type: "ENCONTRADO",
      status: "ENCONTRADO",
      category: "Mochilas",
      location: "Biblioteca",
      date: "2026-11-12",
      createdAt: "2026-11-12T10:00:00.000Z",
      registeredByUserId: "uid-serv-1",
      registeredByRole: "SERVIDOR",
      history: [],
    });
  });

  describe("Achado 1 — Proteção de Dados Pessoais nas Coleções Públicas e /item_return_records", () => {
    it("remove todos os campos privados e higieniza logs de histórico na projeção pública", () => {
      const rawDirtyItem: any = {
        id: "item-dirty-1",
        title: "Carteira Marrom",
        category: "Documentos",
        type: "ENCONTRADO",
        status: "DEVOLVIDO",
        location: "Portaria",
        date: "2026-11-12",
        createdAt: "2026-11-12T10:00:00.000Z",
        recipientName: "João da Silva",
        recipientEmail: "joao@estudantes.ifpr.edu.br",
        recipientDocument: "123.456.789-00",
        recipientBond: "Aluno",
        recipientSignatureUrl: VALID_PNG,
        recipientSignatureStatus: "SIGNED",
        receiptValidationCode: "COMP-IFPR-998877",
        staffSignatureUrl: VALID_PNG,
        staffSignerEmail: "maria@ifpr.edu.br",
        returnObservations: "Entregue na presença de testemunha",
        secretVerificationKey: "SECRET-KEY-99",
        history: [
          {
            id: "h1",
            action: "DEVOLUCAO",
            timestamp: "2026-11-12T12:00:00.000Z",
            userId: "uid-serv-1",
            userName: "Maria Servidora",
            details: "Objeto restituído a João da Silva (joao@estudantes.ifpr.edu.br) doc 123.456.789-00.",
          },
        ],
      };

      const sanitized = sanitizePublicItemProjection(rawDirtyItem);
      expect(sanitized.id).toBe("item-dirty-1");
      expect(sanitized.title).toBe("Carteira Marrom");
      expect(sanitized.status).toBe("DEVOLVIDO");

      for (const privField of PRIVATE_ITEM_FIELDS) {
        expect((sanitized as any)[privField]).toBeUndefined();
      }
      expect(JSON.stringify(sanitized.history)).not.toContain("João da Silva");
      expect(JSON.stringify(sanitized.history)).not.toContain("joao@estudantes.ifpr.edu.br");
      expect(JSON.stringify(sanitized.history)).not.toContain("123.456.789-00");

      const extracted = extractPrivateReturnRecord(rawDirtyItem);
      expect(extracted.recipientName).toBe("João da Silva");
      expect(extracted.recipientEmail).toBe("joao@estudantes.ifpr.edu.br");
      expect(extracted.recipientDocument).toBe("123.456.789-00");
      expect(extracted.receiptValidationCode).toBe("COMP-IFPR-998877");

      const merged = mergeItemWithPrivateRecord(sanitized, extracted);
      expect(merged.recipientName).toBe("João da Silva");
      expect(merged.receiptValidationCode).toBe("COMP-IFPR-998877");
    });

    it("mantém /items livre de PII após devolução formal e restringe /api/items/private-return-records a SERVIDOR e ADMIN", async () => {
      const reg = await postJson(
        "/api/items/register-return",
        {
          itemId: "item-etapa15",
          recipientName: "Ana Aluna",
          recipientEmail: "ana@estudantes.ifpr.edu.br",
          recipientBond: "Aluno",
          recipientDocument: "20269999",
          observations: "Devolução formal conferida",
          identityVerified: true,
          signatureType: "IN_PERSON_DEVICE",
          signatureDataUrl: VALID_PNG,
        },
        "tok-serv-1"
      );
      expect(reg.status).toBe(200);

      // Public catalog endpoint returns item WITHOUT any PII or signature fields
      const pubRes = await getJson("/api/items/public-catalog");
      expect(pubRes.status).toBe(200);
      const pubItem = pubRes.json.items.find((i: any) => i.id === "item-etapa15");
      expect(pubItem).toBeDefined();
      expect(pubItem.status).toBe("DEVOLVIDO");
      expect(pubItem.recipientName).toBeUndefined();
      expect(pubItem.recipientEmail).toBeUndefined();
      expect(pubItem.recipientDocument).toBeUndefined();
      expect(pubItem.recipientSignatureUrl).toBeUndefined();
      expect(pubItem.receiptValidationCode).toBeUndefined();

      // Private return records endpoint blocks unauthenticated (401) and ALUNO (403), allows SERVIDOR/ADMIN (200)
      expect((await getJson("/api/items/private-return-records")).status).toBe(401);
      expect((await getJson("/api/items/private-return-records", "tok-aluno-1")).status).toBe(403);

      const staffPrivRes = await getJson("/api/items/private-return-records", "tok-serv-1");
      expect(staffPrivRes.status).toBe(200);
      const recordList = Array.isArray(staffPrivRes.json.records) ? staffPrivRes.json.records : [];
      const itemRecord = recordList.find((r: any) => r.itemId === "item-etapa15");
      expect(itemRecord).toBeDefined();
      expect(itemRecord.recipientName).toBe("Ana Aluna");
      expect(itemRecord.recipientDocument).toBe("20269999");
    });
  });

  describe("Achado 2 — Proteção da Rota POST /api/signature/notify-signed", () => {
    it("rejeita chamadas sem autenticação (401), token inválido (403), item não assinado (409), spoofing de dados (403) e duplicação (409)", async () => {
      // 1. Sem credencial -> 401
      const unauthRes = await postJson("/api/signature/notify-signed", {
        itemId: "item-etapa15",
      });
      expect(unauthRes.status).toBe(401);

      // 2. Com credencial de ALUNO sem token -> 403
      const studentRes = await postJson(
        "/api/signature/notify-signed",
        { itemId: "item-etapa15" },
        "tok-aluno-1"
      );
      expect(studentRes.status).toBe(403);

      // 3. Registrar devolução remota (ainda PENDING_REMOTE, não assinada pelo receptor)
      const reg = await postJson(
        "/api/items/register-return",
        {
          itemId: "item-etapa15",
          recipientName: "Ana Aluna",
          recipientEmail: "ana@estudantes.ifpr.edu.br",
          recipientBond: "Aluno",
          recipientDocument: "20260001",
          identityVerified: true,
          signatureType: "REMOTE_EMAIL",
          originUrl: "https://localiza.ifpr.edu.br",
        },
        "tok-serv-1"
      );
      expect(reg.status).toBe(200);
      const validToken = new URL(reg.json.signatureLink).searchParams.get("token")!;

      // 4. Token inválido -> 403
      const badTokenRes = await postJson("/api/signature/notify-signed", {
        itemId: "item-etapa15",
        token: "sig_invalid_token_attacker_123456",
      });
      expect(badTokenRes.status).toBe(403);
      expect(badTokenRes.json.code).toBe("TOKEN_MISMATCH");

      // 5. Item ainda PENDING_REMOTE (não assinado) -> 409 SIGNATURE_NOT_COMPLETED
      const pendingNotifyRes = await postJson("/api/signature/notify-signed", {
        itemId: "item-etapa15",
        token: validToken,
      });
      expect(pendingNotifyRes.status).toBe(409);
      expect(pendingNotifyRes.json.code).toBe("SIGNATURE_NOT_COMPLETED");

      // 6. Confirmar assinatura remota legitimamente
      const confirmRes = await postJson("/api/signature/confirm-signature", {
        itemId: "item-etapa15",
        token: validToken,
        signatureDataUrl: VALID_PNG,
      });
      expect(confirmRes.status).toBe(200);

      // 7. Tentativa de spoofing de signerEmail ou signerName em notify-signed -> 403 PAYLOAD_TAMPER_DETECTED
      const spoofEmailRes = await postJson("/api/signature/notify-signed", {
        itemId: "item-etapa15",
        token: validToken,
        signerEmail: "invasor@gmail.com",
      });
      expect(spoofEmailRes.status).toBe(403);
      expect(spoofEmailRes.json.code).toBe("PAYLOAD_TAMPER_DETECTED");

      const spoofNameRes = await postJson("/api/signature/notify-signed", {
        itemId: "item-etapa15",
        token: validToken,
        signerName: "Outro Nome Falso",
      });
      expect(spoofNameRes.status).toBe(403);
      expect(spoofNameRes.json.code).toBe("PAYLOAD_TAMPER_DETECTED");

      // 8. Notificação legítima com token válido e dados íntegros -> 200
      const okNotifyRes = await postJson("/api/signature/notify-signed", {
        itemId: "item-etapa15",
        token: validToken,
        signerName: "Ana Aluna",
        signerEmail: "ana@estudantes.ifpr.edu.br",
        signedAt: confirmRes.json.signedAt,
      });
      expect(okNotifyRes.status).toBe(200);
      expect(okNotifyRes.json.success).toBe(true);
      expect(okNotifyRes.json.notificationId).toBe("sig_done_item-etapa15");

      // 9. Segunda chamada para o mesmo ciclo -> 409 NOTIFICATION_ALREADY_LOGGED (anti-duplicação)
      const duplicateNotifyRes = await postJson("/api/signature/notify-signed", {
        itemId: "item-etapa15",
        token: validToken,
      });
      expect(duplicateNotifyRes.status).toBe(409);
      expect(duplicateNotifyRes.json.code).toBe("NOTIFICATION_ALREADY_LOGGED");
    });
  });

  describe("Achado 3 — Correção do Bypass ALREADY_SIGNED no RemoteSignatureModal.tsx", () => {
    it("garante que RemoteSignatureModal.tsx valida o token no servidor ANTES de avaliar ALREADY_SIGNED e remove o fallback TOK-", () => {
      const modalCode = fs.readFileSync(
        path.resolve(process.cwd(), "src/components/RemoteSignatureModal.tsx"),
        "utf-8"
      );

      // Must NOT contain TOK- token prefix fallback in PDF
      expect(modalCode).not.toContain("TOK-${token.slice");
      // Must NOT contain fabricated REC-IFPR- fallback when validationCode is missing
      expect(modalCode).not.toContain("REC-IFPR-${foundItem.id");
      expect(modalCode).not.toContain("REC-IFPR-${item.id");

      // verify-token fetch MUST appear BEFORE setVerificationStatus("ALREADY_SIGNED")
      const verifyFetchIdx = modalCode.indexOf('fetch("/api/signature/verify-token"');
      const rejectInvalidIdx = modalCode.indexOf("if (!apiVerificationResult || apiVerificationResult.valid !== true)");
      const alreadySignedIdx = modalCode.indexOf('setVerificationStatus("ALREADY_SIGNED")');

      expect(verifyFetchIdx).toBeGreaterThan(0);
      expect(rejectInvalidIdx).toBeGreaterThan(verifyFetchIdx);
      expect(alreadySignedIdx).toBeGreaterThan(rejectInvalidIdx);

      // Must distinguish TOKEN_EXPIRED and TOKEN_INVALIDATED states
      expect(modalCode).toContain('"TOKEN_EXPIRED"');
      expect(modalCode).toContain('"TOKEN_INVALIDATED"');
      expect(modalCode).toContain('"ERROR"');
    });
  });

  describe("Achado 4 — Segredo AES-256-GCM Sem Fallback Previsível e Rotação de Chaves", () => {
    it("falha de forma fechada (SIGNATURE_ENCRYPTION_KEY_MISSING / HTTP 503) quando SIGNATURE_TOKEN_SECRET está ausente ou tem menos de 32 caracteres", async () => {
      delete process.env.SIGNATURE_TOKEN_SECRET;
      expect(() => getSignatureEncryptionKeyring()).toThrow("SIGNATURE_ENCRYPTION_KEY_MISSING");
      expect(() => getSignatureLinkEncryptionKey()).toThrow("SIGNATURE_ENCRYPTION_KEY_MISSING");
      expect(() => encryptSignatureToken("sig_1234567890")).toThrow("SIGNATURE_ENCRYPTION_KEY_MISSING");

      process.env.SIGNATURE_TOKEN_SECRET = "short_secret_under_32_chars";
      expect(() => getSignatureEncryptionKeyring()).toThrow("SIGNATURE_ENCRYPTION_KEY_MISSING");

      // Calling register-return with REMOTE_EMAIL when key is missing MUST fail closed with HTTP 503
      const regMissingKey = await postJson(
        "/api/items/register-return",
        {
          itemId: "item-etapa15",
          recipientName: "Ana Aluna",
          recipientEmail: "ana@estudantes.ifpr.edu.br",
          recipientBond: "Aluno",
          recipientDocument: "20260001",
          identityVerified: true,
          signatureType: "REMOTE_EMAIL",
        },
        "tok-serv-1"
      );
      expect(regMissingKey.status).toBe(503);
      expect(regMissingKey.json.error).toContain("SIGNATURE_TOKEN_SECRET");
    });

    it("suporta rotação de chaves (SIGNATURE_TOKEN_SECRET + SIGNATURE_TOKEN_SECRET_PREVIOUS) e recriptografa automaticamente em send-request", async () => {
      // 1. Emitir token com chave v1
      process.env.SIGNATURE_TOKEN_SECRET = "v1:first_generation_secret_key_with_32_plus_chars";
      delete process.env.SIGNATURE_TOKEN_SECRET_PREVIOUS;

      const reg = await postJson(
        "/api/items/register-return",
        {
          itemId: "item-etapa15",
          recipientName: "Ana Aluna",
          recipientEmail: "ana@estudantes.ifpr.edu.br",
          recipientBond: "Aluno",
          recipientDocument: "20260001",
          identityVerified: true,
          signatureType: "REMOTE_EMAIL",
          originUrl: "https://localiza.ifpr.edu.br",
        },
        "tok-serv-1"
      );
      expect(reg.status).toBe(200);
      const originalToken = new URL(reg.json.signatureLink).searchParams.get("token")!;

      const sigReqBefore = hoisted.store.signature_requests.get("item-etapa15");
      expect(sigReqBefore.encryptionKeyId).toBe("v1");
      expect(sigReqBefore.encryptedToken.startsWith("v1.")).toBe(true);

      // 2. Rotacionar para chave v2 mantendo v1 em SIGNATURE_TOKEN_SECRET_PREVIOUS
      process.env.SIGNATURE_TOKEN_SECRET = "v2:second_generation_secret_key_with_32_plus_chars";
      process.env.SIGNATURE_TOKEN_SECRET_PREVIOUS = "v1:first_generation_secret_key_with_32_plus_chars";

      // Enquanto sigReq ainda usa v1, canRemovePreviousEncryptionKey deve reportar safeToRemove: false
      const checkBefore = await canRemovePreviousEncryptionKey(hoisted.mockDb, "v1");
      expect(checkBefore.safeToRemove).toBe(false);
      expect(checkBefore.activeDependentCount).toBe(1);

      // Decifração direta identifica usedPreviousKey === true
      const meta = decryptSignatureTokenWithMetadata(sigReqBefore.encryptedToken);
      expect(meta).not.toBeNull();
      expect(meta!.token).toBe(originalToken);
      expect(meta!.keyId).toBe("v1");
      expect(meta!.usedPreviousKey).toBe(true);

      // 3. Chamar /api/signature/send-request (LINK_ONLY) -> decifra com v1 e recriptografa automaticamente com v2!
      const linkRes = await postJson(
        "/api/signature/send-request",
        { itemId: "item-etapa15", mode: "LINK_ONLY", originUrl: "https://localiza.ifpr.edu.br" },
        "tok-serv-1"
      );
      expect(linkRes.status).toBe(200);
      expect(linkRes.json.token).toBe(originalToken);
      expect(linkRes.json.reissued).toBe(false);

      const sigReqAfter = hoisted.store.signature_requests.get("item-etapa15");
      expect(sigReqAfter.encryptionKeyId).toBe("v2");
      expect(sigReqAfter.encryptedToken.startsWith("v2.")).toBe(true);

      // Agora todos os registros ativos usam v2 -> canRemovePreviousEncryptionKey retorna safeToRemove: true
      const checkAfter = await canRemovePreviousEncryptionKey(hoisted.mockDb, "v1");
      expect(checkAfter.safeToRemove).toBe(true);
      expect(checkAfter.activeDependentCount).toBe(0);
    });
  });

  describe("Achado 5 — Consistência das Métricas do Dashboard", () => {
    it("separa devoluções registradas, pendentes de assinatura remota, concluídas pelo receptor, pendentes de atestação do servidor e dupla assinatura", () => {
      const sampleItems: any[] = [
        {
          id: "it-1",
          status: "ENCONTRADO",
        },
        {
          id: "it-2",
          status: "DEVOLVIDO",
          recipientSignatureStatus: "PENDING_REMOTE",
          staffSignatureStatus: "PENDING_STAFF",
        },
        {
          id: "it-3",
          status: "DEVOLVIDO",
          recipientSignatureStatus: "SIGNED",
          recipientSignatureUrl: VALID_PNG,
          staffSignatureStatus: "PENDING_STAFF",
        },
        {
          id: "it-4",
          status: "DEVOLVIDO",
          recipientSignatureStatus: "SIGNED",
          recipientSignatureUrl: VALID_PNG,
          staffSignatureStatus: "SIGNED",
          staffSignatureUrl: VALID_PNG,
        },
      ];

      expect(isRecipientRemoteSignaturePending(sampleItems[1])).toBe(true);
      expect(isRecipientReturnConcluded(sampleItems[1])).toBe(false);

      expect(isRecipientReturnConcluded(sampleItems[2])).toBe(true);
      expect(isStaffAttestationPending(sampleItems[2])).toBe(true);
      expect(isDualSignatureCompleted(sampleItems[2])).toBe(false);

      expect(isRecipientReturnConcluded(sampleItems[3])).toBe(true);
      expect(isStaffAttestationPending(sampleItems[3])).toBe(false);
      expect(isDualSignatureCompleted(sampleItems[3])).toBe(true);

      const metrics = computeDashboardReturnMetrics(sampleItems);
      expect(metrics.totalItems).toBe(4);
      expect(metrics.registeredReturnsCount).toBe(3);
      expect(metrics.pendingRemoteSignaturesCount).toBe(1);
      expect(metrics.concludedReturnsCount).toBe(2);
      expect(metrics.pendingStaffAttestationCount).toBe(1);
      expect(metrics.dualSignedReturnsCount).toBe(1);
      expect(metrics.successRate).toBe(50); // 2 concluded out of 4 total items
    });
  });
});
