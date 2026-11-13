import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import http from "http";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const VALID_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const ALT_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mP8z8BQzwAEjDAGACfUAwH8+y4PAAAAAElFTkSuQmCC";

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

  const mockDb = {
    collection(colName: string) {
      return {
        doc: (docId: string) => makeDocRef(colName, docId),
        where: (field: string, _op: string, value: any) =>
          makeQuery(colName, [{ field, value }]),
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
  decryptSignatureToken,
  sanitizeEmailNotificationUrl,
  hasUserActiveTemporalBlock,
} from "../../server";

describe("ETAPA 13 — Blindagem de Assinatura Remota, Reabertura Transacional e Métricas Reais", () => {
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
    process.env.SIGNATURE_TOKEN_SECRET = "v1:test_signature_token_secret_32_chars_minimum_ok";
    delete process.env.SIGNATURE_TOKEN_SECRET_PREVIOUS;
    hoisted.resetStore();

    // Seed accounts & tokens
    hoisted.store.users.set("uid-serv-1", {
      id: "uid-serv-1",
      name: "Maria Servidora",
      email: "maria@ifpr.edu.br",
      role: "SERVIDOR",
      approvalStatus: "APROVADO",
      status: "active",
      active: true,
    });
    hoisted.store.users.set("uid-serv-2", {
      id: "uid-serv-2",
      name: "Pedro Servidor",
      email: "pedro@ifpr.edu.br",
      role: "SERVIDOR",
      approvalStatus: "APROVADO",
      status: "active",
      active: true,
    });
    hoisted.store.users.set("uid-serv-blocked", {
      id: "uid-serv-blocked",
      name: "Servidor Bloqueado",
      email: "bloqueado@ifpr.edu.br",
      role: "SERVIDOR",
      approvalStatus: "APROVADO",
      status: "active",
      blockExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
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
    hoisted.store.role_assignments.set("uid-admin-1", {
      userId: "uid-admin-1",
      assignedRole: "ADMIN",
      approvalStatus: "APROVADO",
      revoked: false,
    });
    hoisted.store.users.set("uid-aluno-1", {
      id: "uid-aluno-1",
      name: "Ana Aluna",
      email: "ana@estudantes.ifpr.edu.br",
      role: "ALUNO",
      approvalStatus: "APROVADO",
      status: "active",
    });

    hoisted.tokenUsers.set("tok-serv-1", {
      uid: "uid-serv-1",
      email: "maria@ifpr.edu.br",
      email_verified: true,
    });
    hoisted.tokenUsers.set("tok-serv-2", {
      uid: "uid-serv-2",
      email: "pedro@ifpr.edu.br",
      email_verified: true,
    });
    hoisted.tokenUsers.set("tok-serv-blocked", {
      uid: "uid-serv-blocked",
      email: "bloqueado@ifpr.edu.br",
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

    // Seed items & claims
    hoisted.store.items.set("item-remote-1", {
      id: "item-remote-1",
      title: "Notebook Dell Prata",
      type: "ENCONTRADO",
      status: "ENCONTRADO",
      category: "Eletrônicos",
      location: "Biblioteca",
      registeredByUserId: "uid-serv-1",
      history: [],
    });
    hoisted.store.claims.set("claim-1", {
      id: "claim-1",
      itemId: "item-remote-1",
      claimerId: "uid-aluno-1",
      status: "APROVADO",
    });
  });

  describe("1. Utilitários criptográficos e validação temporal", () => {
    it("cifra e decifra tokens remotos com AES-256-GCM e redige links em logs de e-mail", () => {
      const raw = "sig_abcdef1234567890";
      const enc = encryptSignatureToken(raw);
      expect(enc).not.toContain(raw);
      expect(decryptSignatureToken(enc)).toBe(raw);
      expect(decryptSignatureToken("malformed")).toBeNull();

      const rawUrl = `https://localiza.ifpr.edu.br/?tab=sign-receipt&itemId=it1&token=${raw}`;
      const redacted = sanitizeEmailNotificationUrl(rawUrl);
      expect(redacted).not.toContain(raw);
      expect(redacted).toContain("token=[REDACTED]");
    });

    it("detecta bloqueios temporais ativos em string ISO, number ms e Firestore Timestamp", () => {
      expect(hasUserActiveTemporalBlock({ blockExpiresAt: new Date(Date.now() + 60_000).toISOString() })).toBe(true);
      expect(hasUserActiveTemporalBlock({ suspendedUntil: Date.now() + 60_000 })).toBe(true);
      expect(hasUserActiveTemporalBlock({ blockExpiresAt: { toMillis: () => Date.now() + 60_000 } })).toBe(true);
      expect(hasUserActiveTemporalBlock({ blockExpiresAt: new Date(Date.now() - 60_000).toISOString() })).toBe(false);
    });
  });

  describe("2. Achado A — Invalidação atômica de tokens remotos na reabertura e concorrência", () => {
    const registerRemoteReturn = async (itemId = "item-remote-1") => {
      return postJson(
        "/api/items/register-return",
        {
          itemId,
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
    };

    it("deve invalidar signature_requests na reabertura, restaurar reivindicação única e retornar HTTP 410 ao tentar verificar ou assinar com o token antigo", async () => {
      const reg = await registerRemoteReturn();
      expect(reg.status).toBe(200);
      expect(reg.json.success).toBe(true);

      const urlObj = new URL(reg.json.signatureLink);
      const oldToken = urlObj.searchParams.get("token")!;
      expect(oldToken).toMatch(/^sig_/);

      // Verify public item has NO plaintext signatureToken or private PII, and private record holds PENDING_REMOTE
      const publicItem = hoisted.store.items.get("item-remote-1");
      expect(publicItem.signatureToken).toBeUndefined();
      expect(publicItem.recipientName).toBeUndefined();
      const privateRec = hoisted.store.item_return_records.get("item-remote-1");
      expect(privateRec.signatureToken).toBeNull();
      expect(privateRec.recipientSignatureStatus).toBe("PENDING_REMOTE");
      expect(hoisted.store.claims.get("claim-1").status).toBe("CONCLUIDO");

      // Reopen via ADMIN endpoint
      const reopen = await postJson(
        "/api/items/reopen-return",
        { itemId: "item-remote-1", reason: "Reabertura de auditoria: receptor não compareceu." },
        "tok-admin-1"
      );
      expect(reopen.status).toBe(200);
      expect(reopen.json.success).toBe(true);
      expect(reopen.json.signatureRequestInvalidated).toBe(true);
      expect(reopen.json.restoredClaimIds).toEqual(["claim-1"]);

      // Check signature_requests invalidated and tokenHash wiped
      const sigReqAfterReopen = hoisted.store.signature_requests.get("item-remote-1");
      expect(sigReqAfterReopen.invalidated).toBe(true);
      expect(sigReqAfterReopen.used).toBe(true);
      expect(sigReqAfterReopen.tokenHash).toBeUndefined();
      expect(sigReqAfterReopen.encryptedToken).toBeUndefined();

      // Check single claim reverted to APROVADO
      expect(hoisted.store.claims.get("claim-1").status).toBe("APROVADO");

      // Attempting verify-token with OLD token MUST fail with 410 TOKEN_INVALIDATED
      const verifyOld = await postJson("/api/signature/verify-token", {
        itemId: "item-remote-1",
        token: oldToken,
      });
      expect(verifyOld.status).toBe(410);
      expect(verifyOld.json.reason).toBe("TOKEN_INVALIDATED");

      // Attempting confirm-signature with OLD token MUST fail with 410 and NOT change status to DEVOLVIDO
      const confirmOld = await postJson("/api/signature/confirm-signature", {
        itemId: "item-remote-1",
        token: oldToken,
        signatureDataUrl: VALID_PNG,
      });
      expect(confirmOld.status).toBe(410);
      expect(confirmOld.json.error).toContain("invalidada");
      expect(hoisted.store.items.get("item-remote-1").status).toBe("ENCONTRADO");
    });

    it("não deve reativar reivindicações cegamente quando houver múltiplos vínculos CONCLUIDO na reabertura", async () => {
      hoisted.store.claims.set("claim-2", {
        id: "claim-2",
        itemId: "item-remote-1",
        claimerId: "uid-serv-2",
        status: "APROVADO",
      });
      const reg = await registerRemoteReturn();
      expect(reg.status).toBe(200);

      const reopen = await postJson(
        "/api/items/reopen-return",
        { itemId: "item-remote-1", reason: "Reabertura com múltiplas reivindicações vinculadas." },
        "tok-admin-1"
      );
      expect(reopen.status).toBe(200);
      expect(reopen.json.requiresAdminClaimReview).toBe(true);
      expect(reopen.json.restoredClaimIds).toEqual([]);
      expect(hoisted.store.claims.get("claim-1").status).toBe("CONCLUIDO");
      expect(hoisted.store.claims.get("claim-2").status).toBe("CONCLUIDO");
    });

    it("deve manter consistência atômica sob concorrência entre reabertura e confirmação remota", async () => {
      const reg = await registerRemoteReturn();
      const oldToken = new URL(reg.json.signatureLink).searchParams.get("token")!;

      const [reopenRes, confirmRes] = await Promise.all([
        postJson(
          "/api/items/reopen-return",
          { itemId: "item-remote-1", reason: "Cancelamento simultâneo na portaria." },
          "tok-admin-1"
        ),
        postJson("/api/signature/confirm-signature", {
          itemId: "item-remote-1",
          token: oldToken,
          signatureDataUrl: VALID_PNG,
        }),
      ]);

      expect(reopenRes.status).toBe(200);
      // Since reopen acquired tx lock first, confirm sees ENCONTRADO + invalidated -> 410.
      // Either way, final state must NEVER mix status ENCONTRADO with SIGNED recipientSignatureUrl!
      const finalItem = hoisted.store.items.get("item-remote-1");
      const finalPriv = hoisted.store.item_return_records.get("item-remote-1");
      if (confirmRes.status === 200) {
        expect(finalItem.status).toBe("DEVOLVIDO");
        expect(finalPriv.recipientSignatureStatus).toBe("SIGNED");
      } else {
        expect([400, 403, 409, 410]).toContain(confirmRes.status);
        expect(finalItem.status).toBe("ENCONTRADO");
        expect(finalItem.recipientSignatureUrl).toBeUndefined();
        expect(finalPriv?.recipientSignatureUrl).toBeUndefined();
      }
    });
  });

  describe("3. Achado C — Endurecimento HTTP de verify-token, confirm-signature e send-request", () => {
    it("rejeita token incorreto com HTTP 403 mesmo quando o item já foi assinado (sem vazar URL/PII), mas permite idempotência segura com o token válido", async () => {
      const reg = await postJson(
        "/api/items/register-return",
        {
          itemId: "item-remote-1",
          recipientName: "Ana Aluna",
          recipientEmail: "ana@estudantes.ifpr.edu.br",
          recipientBond: "Aluno",
          recipientDocument: "20260001",
          identityVerified: true,
          signatureType: "REMOTE_EMAIL",
        },
        "tok-serv-1"
      );
      const validToken = new URL(reg.json.signatureLink).searchParams.get("token")!;

      const confirm = await postJson("/api/signature/confirm-signature", {
        itemId: "item-remote-1",
        token: validToken,
        signatureDataUrl: VALID_PNG,
        signerName: "Invasor Tentando Alterar Nome",
        signerEmail: "invasor@gmail.com",
      });
      expect(confirm.status).toBe(200);
      expect(confirm.json.success).toBe(true);

      // Persisted recipientName/email in private return record MUST remain Ana Aluna, not overwritten by confirm body
      const persistedPublic = hoisted.store.items.get("item-remote-1");
      expect(persistedPublic.recipientName).toBeUndefined();
      expect(persistedPublic.recipientEmail).toBeUndefined();
      const persistedPriv = hoisted.store.item_return_records.get("item-remote-1");
      expect(persistedPriv.recipientName).toBe("Ana Aluna");
      expect(persistedPriv.recipientEmail).toBe("ana@estudantes.ifpr.edu.br");

      // Wrong token on SIGNED item MUST be 403 with zero PII/signature leak
      const wrongVerify = await postJson("/api/signature/verify-token", {
        itemId: "item-remote-1",
        token: "sig_wrong_attacker_token",
      });
      expect(wrongVerify.status).toBe(403);
      expect(wrongVerify.json.valid).toBe(false);
      expect(wrongVerify.json.recipientSignatureUrl).toBeUndefined();

      const wrongConfirm = await postJson("/api/signature/confirm-signature", {
        itemId: "item-remote-1",
        token: "sig_wrong_attacker_token",
        signatureDataUrl: ALT_PNG,
      });
      expect(wrongConfirm.status).toBe(403);

      // Valid token F5 recovery MUST succeed and return persisted PNG (NOT ALT_PNG)
      const idempConfirm = await postJson("/api/signature/confirm-signature", {
        itemId: "item-remote-1",
        token: validToken,
        signatureDataUrl: ALT_PNG,
      });
      expect(idempConfirm.status).toBe(200);
      expect(idempConfirm.json.alreadyCompleted).toBe(true);
      expect(idempConfirm.json.recipientSignatureUrl).toBe(VALID_PNG);

      // Sending new request on already SIGNED item MUST fail with 409
      const sendAfterSigned = await postJson(
        "/api/signature/send-request",
        { itemId: "item-remote-1", mode: "LINK_ONLY" },
        "tok-serv-1"
      );
      expect(sendAfterSigned.status).toBe(409);
    });

    it("bloqueia bypasses em /api/signature/send-request, reutiliza link não expirado e rotaciona token expirado sem vazar token em logs", async () => {
      const reg = await postJson(
        "/api/items/register-return",
        {
          itemId: "item-remote-1",
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
      const originalToken = new URL(reg.json.signatureLink).searchParams.get("token")!;

      // Unauthenticated -> 401
      expect((await postJson("/api/signature/send-request", { itemId: "item-remote-1" })).status).toBe(401);
      // Student -> 403
      expect((await postJson("/api/signature/send-request", { itemId: "item-remote-1" }, "tok-aluno-1")).status).toBe(403);
      // Temporally blocked staff -> 403
      expect((await postJson("/api/signature/send-request", { itemId: "item-remote-1" }, "tok-serv-blocked")).status).toBe(403);
      // Different staff (non-issuer, non-admin) -> 403
      expect((await postJson("/api/signature/send-request", { itemId: "item-remote-1" }, "tok-serv-2")).status).toBe(403);

      // Client supplying signatureToken or used:false MUST fail with 400
      expect(
        (
          await postJson(
            "/api/signature/send-request",
            { itemId: "item-remote-1", signatureToken: "sig_forged" },
            "tok-serv-1"
          )
        ).status
      ).toBe(400);

      // Tampering recipientEmail or issuer UID MUST fail with 403
      expect(
        (
          await postJson(
            "/api/signature/send-request",
            { itemId: "item-remote-1", recipientEmail: "outro@gmail.com" },
            "tok-serv-1"
          )
        ).status
      ).toBe(403);
      expect(
        (
          await postJson(
            "/api/signature/send-request",
            { itemId: "item-remote-1", dispatchedByUserId: "uid-serv-2" },
            "tok-serv-1"
          )
        ).status
      ).toBe(403);

      // Legitimate LINK_ONLY recovery by original issuer MUST return exact SAME token & preserve issuer
      const linkRes = await postJson(
        "/api/signature/send-request",
        { itemId: "item-remote-1", mode: "LINK_ONLY", originUrl: "https://localiza.ifpr.edu.br" },
        "tok-serv-1"
      );
      expect(linkRes.status).toBe(200);
      expect(linkRes.json.reissued).toBe(false);
      expect(linkRes.json.token).toBe(originalToken);
      expect(hoisted.store.signature_requests.get("item-remote-1").dispatchedByUserId).toBe("uid-serv-1");

      // Expire the request manually in DB and trigger EMAIL resend -> rotates new CSPRNG token & redacts email_notifications
      const sigReq = hoisted.store.signature_requests.get("item-remote-1");
      sigReq.expiresAt = new Date(Date.now() - 60_000).toISOString();
      const privDoc = hoisted.store.item_return_records.get("item-remote-1");
      privDoc.signatureTokenExpiresAt = sigReq.expiresAt;

      const resendRes = await postJson(
        "/api/signature/send-request",
        { itemId: "item-remote-1", mode: "EMAIL", originUrl: "https://localiza.ifpr.edu.br" },
        "tok-admin-1"
      );
      expect(resendRes.status).toBe(200);
      expect(resendRes.json.reissued).toBe(true);
      expect(resendRes.json.token).toMatch(/^sig_/);
      expect(resendRes.json.token).not.toBe(originalToken);
      expect(hoisted.store.signature_requests.get("item-remote-1").dispatchedByUserId).toBe("uid-serv-1");

      // Old expired token MUST now fail verify-token
      const verifyExpiredOld = await postJson("/api/signature/verify-token", {
        itemId: "item-remote-1",
        token: originalToken,
      });
      expect(verifyExpiredOld.status).toBe(403);

      // Email notification logs (both initial register-return & send-request EMAIL) MUST NOT contain plaintext tokens
      expect(hoisted.store.email_notifications.size).toBe(2);
      for (const notif of hoisted.store.email_notifications.values()) {
        const serialized = JSON.stringify(notif);
        expect(serialized).not.toContain(originalToken);
        expect(serialized).not.toContain(resendRes.json.token);
        expect(notif.signatureLinkRedacted).toContain("token=[REDACTED]");
      }

      // ENCERRADO item MUST fail send-request (409) and verify-token (400)
      hoisted.store.items.set("item-closed", {
        id: "item-closed",
        title: "Guarda-Chuva",
        status: "ENCERRADO",
      });
      expect(
        (
          await postJson(
            "/api/signature/send-request",
            { itemId: "item-closed", mode: "LINK_ONLY" },
            "tok-admin-1"
          )
        ).status
      ).toBe(409);
      expect(
        (
          await postJson("/api/signature/verify-token", {
            itemId: "item-closed",
            token: "sig_any",
          })
        ).status
      ).toBe(400);
    });
  });

  describe("4. Achados B, D e E — Integridade da UI, PDF browser-safe, métricas reais e contexto", () => {
    const readFile = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), "utf-8");

    it("RemoteSignatureModal.tsx não deve usar Buffer.from nem item.signatureToken e deve refletir atestação real no PDF", () => {
      const code = readFile("src/components/RemoteSignatureModal.tsx");
      expect(code).not.toContain("Buffer.from");
      expect(code).not.toContain("item.signatureToken");
      expect(code).toContain("encodeBase64Utf8");
      expect(code).toContain("DUPLA ASSINATURA CONCLUÍDA");
      expect(code).toContain("Atestação Institucional Pendente");
    });

    it("ItemDetailModal.tsx deve restringir ações PENDING_REMOTE a canSignAsStaff e resolver link seguro pelo backend", () => {
      const code = readFile("src/components/ItemDetailModal.tsx");
      expect(code).not.toContain("item.signatureToken");
      expect(code).not.toContain("generateSecureSignatureToken");
      expect(code).not.toContain('item.recipientSignatureEmail || item.contactInfo || "localizamais0@gmail.com"');
      expect(code).toContain("canSignAsStaff &&");
      expect(code).toContain("resolveRemoteSignatureLink");
      expect(code).toContain('mode: "LINK_ONLY"');
      expect(code).toContain("resolvedRemoteToken");
    });

    it("DashboardView.tsx e DigitalReturnsD3Chart.tsx devem excluir PENDING_REMOTE e não assinados das métricas digitais", () => {
      const dash = readFile("src/components/DashboardView.tsx");
      const d3 = readFile("src/components/DigitalReturnsD3Chart.tsx");

      expect(dash).toContain("computeDashboardReturnMetrics");
      expect(dash).toContain("isRecipientReturnConcluded");
      expect(dash).toContain("pendingRemoteSignaturesCount");

      expect(d3).toContain('if (!item || item.status !== "DEVOLVIDO") return false;');
      expect(d3).toContain('if (item.recipientSignatureStatus === "PENDING_REMOTE") return false;');
      expect(d3).not.toContain("item.signatureToken?.substring");
      expect(d3).not.toContain("it.signatureToken?.substring");
      expect(d3).toContain("pendingStaffAttestation");
      expect(d3).toContain("Dupla Assinatura");
    });

    it("AppContext.tsx deve sincronizar restoredClaimIds na reabertura e impedir exclusão direta de DEVOLVIDO", () => {
      const ctx = readFile("src/context/AppContext.tsx");
      expect(ctx).toContain("restoredClaimIds");
      expect(ctx).toContain("requiresAdminClaimReview");
      expect(ctx).toContain('if (existing.status === "DEVOLVIDO")');
    });
  });
});
