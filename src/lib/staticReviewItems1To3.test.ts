import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import http from "http";

const hoisted = vi.hoisted(() => {
  const store: Record<string, Map<string, any>> = {
    users: new Map(),
    role_assignments: new Map(),
    signature_requests: new Map(),
    audit_logs: new Map(),
  };

  const tokenUsers = new Map<string, any>();

  const resetStore = () => {
    for (const col of Object.values(store)) {
      col.clear();
    }
    tokenUsers.clear();
  };

  const applyPayload = (prev: Record<string, any>, payload: Record<string, any>, merge: boolean) => {
    const base = merge ? { ...prev } : {};
    for (const [k, v] of Object.entries(payload)) {
      if (v && typeof v === "object" && (v as any).__isDeleteTransform) {
        delete base[k];
      } else {
        base[k] = v;
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
        data: () => (data ? { ...data } : undefined),
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
            data: () => docData,
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
  authenticateToken,
  parseUserExpiryMs,
  isUserBlockedOrInactive,
  canRemovePreviousEncryptionKey,
} from "../../server";
import { verifyServerlessCallerAccess } from "../../api/_lib/firebaseAdmin";

describe("Revisão Estática Itens 1, 2 e 3 — Auth, Bloqueios e Timestamp Fail-Closed", () => {
  let server: http.Server;
  let baseUrl = "";

  const runAuthenticate = async (bearerToken: string) => {
    const req: any = {
      headers: { authorization: `Bearer ${bearerToken}` },
    };
    const res: any = {};
    let nextCalled = false;
    await authenticateToken(req, res, () => {
      nextCalled = true;
    });
    return { req, nextCalled };
  };

  const postJson = async (endpoint: string, body: any, bearerToken?: string) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
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
    if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
    const res = await fetch(`${baseUrl}${endpoint}`, { method: "GET", headers });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  };

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = http.createServer(app);
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  beforeEach(() => {
    hoisted.resetStore();
  });

  describe("Item 1 — role nunca permanece ADMIN quando isAdmin === false", () => {
    it("rebaixamento automático no authenticateToken e verifyServerlessCallerAccess para ADMIN sem role_assignments", async () => {
      const uid = "uid-orphan-admin";
      hoisted.tokenUsers.set("tok-orphan-admin", {
        uid,
        email: "orphan.admin@ifpr.edu.br",
        email_verified: true,
      });
      hoisted.store.users.set(uid, {
        uid,
        role: "ADMIN",
        approvalStatus: "APROVADO",
        status: "active",
      });

      const { req, nextCalled } = await runAuthenticate("tok-orphan-admin");
      expect(nextCalled).toBe(true);
      expect(req.authUser.isAdmin).toBe(false);
      expect(req.authUser.role).not.toBe("ADMIN");
      expect(req.authUser.role).toBe("ALUNO");

      const caller = await verifyServerlessCallerAccess(hoisted.mockDb as any, {
        uid,
        email: "orphan.admin@ifpr.edu.br",
        email_verified: true,
      });
      expect(caller.isAdmin).toBe(false);
      expect(caller.role).not.toBe("ADMIN");
      expect(caller.role).toBe("ALUNO");

      const httpRes = await postJson("/api/admin/delete-user", { targetUserId: "someone" }, "tok-orphan-admin");
      expect(httpRes.status).toBe(403);
    });

    it("admin banido recebe isAdmin=false, isBlocked=true, role=INTRUSO e é barrado no HTTP", async () => {
      const uid = "uid-banned-admin";
      hoisted.tokenUsers.set("tok-banned-admin", {
        uid,
        email: "banned.admin@ifpr.edu.br",
        email_verified: true,
      });
      hoisted.store.users.set(uid, {
        uid,
        role: "ADMIN",
        approvalStatus: "APROVADO",
        status: "banned",
      });
      hoisted.store.role_assignments.set(uid, {
        targetUserId: uid,
        active: true,
        assignedRole: "ADMIN",
        approvalStatus: "APROVADO",
      });

      const { req } = await runAuthenticate("tok-banned-admin");
      expect(req.authUser.isAdmin).toBe(false);
      expect(req.authUser.isBlocked).toBe(true);
      expect(req.authUser.role).toBe("INTRUSO");

      const caller = await verifyServerlessCallerAccess(hoisted.mockDb as any, {
        uid,
        email: "banned.admin@ifpr.edu.br",
        email_verified: true,
      });
      expect(caller.isAdmin).toBe(false);
      expect(caller.isBlocked).toBe(true);
      expect(caller.role).toBe("INTRUSO");

      const httpRes = await postJson("/api/admin/delete-user", { targetUserId: "someone" }, "tok-banned-admin");
      expect(httpRes.status).toBe(403);
      expect(httpRes.json.code).toBe("ACCOUNT_BLOCKED");
    });

    it("admin com e-mail não verificado recebe isAdmin=false e role != ADMIN", async () => {
      const uid = "uid-unverified-admin";
      hoisted.tokenUsers.set("tok-unverified-admin", {
        uid,
        email: "unverified.admin@ifpr.edu.br",
        email_verified: false,
      });
      hoisted.store.users.set(uid, {
        uid,
        role: "ADMIN",
        approvalStatus: "APROVADO",
        status: "active",
      });
      hoisted.store.role_assignments.set(uid, {
        targetUserId: uid,
        active: true,
        assignedRole: "ADMIN",
        approvalStatus: "APROVADO",
      });

      const { req } = await runAuthenticate("tok-unverified-admin");
      expect(req.authUser.isAdmin).toBe(false);
      expect(req.authUser.role).toBe("ALUNO");

      const caller = await verifyServerlessCallerAccess(hoisted.mockDb as any, {
        uid,
        email: "unverified.admin@ifpr.edu.br",
        email_verified: false,
      });
      expect(caller.isAdmin).toBe(false);
      expect(caller.role).toBe("ALUNO");
    });

    it("admin legítimo (role_assignments ativo + e-mail verificado) mantém isAdmin=true e role=ADMIN", async () => {
      const uid = "uid-valid-admin";
      hoisted.tokenUsers.set("tok-valid-admin", {
        uid,
        email: "valid.admin@ifpr.edu.br",
        email_verified: true,
      });
      hoisted.store.users.set(uid, {
        uid,
        role: "ADMIN",
        approvalStatus: "APROVADO",
        status: "active",
      });
      hoisted.store.role_assignments.set(uid, {
        targetUserId: uid,
        active: true,
        assignedRole: "ADMIN",
        approvalStatus: "APROVADO",
      });

      const { req } = await runAuthenticate("tok-valid-admin");
      expect(req.authUser.isAdmin).toBe(true);
      expect(req.authUser.isBlocked).toBe(false);
      expect(req.authUser.role).toBe("ADMIN");

      const caller = await verifyServerlessCallerAccess(hoisted.mockDb as any, {
        uid,
        email: "valid.admin@ifpr.edu.br",
        email_verified: true,
      });
      expect(caller.isAdmin).toBe(true);
      expect(caller.isBlocked).toBe(false);
      expect(caller.role).toBe("ADMIN");
    });
  });

  describe("Item 2 — Bloqueios completos alinhados com Firestore Rules", () => {
    it("rejeita com 403 ACCOUNT_BLOCKED para active:false, status:inactive, status:suspended sem expiração e blockExpiresAt/suspendedUntil futuros", async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000);
      const cases = [
        { name: "active=false", doc: { role: "SERVIDOR", approvalStatus: "APROVADO", active: false } },
        { name: "status=inactive", doc: { role: "SERVIDOR", approvalStatus: "APROVADO", status: "inactive" } },
        { name: "status=suspended sem data", doc: { role: "ALUNO", status: "suspended" } },
        {
          name: "blockExpiresAt Timestamp futuro",
          doc: {
            role: "ALUNO",
            status: "active",
            blockExpiresAt: { toDate: () => futureDate, toMillis: () => futureDate.getTime() },
          },
        },
        {
          name: "suspendedUntil ISO futuro",
          doc: { role: "SERVIDOR", approvalStatus: "APROVADO", suspendedUntil: futureDate.toISOString() },
        },
        {
          name: "blockExpiresAt seconds/nanoseconds futuro",
          doc: {
            role: "ALUNO",
            blockExpiresAt: { seconds: Math.floor(futureDate.getTime() / 1000), nanoseconds: 0 },
          },
        },
      ];

      for (let i = 0; i < cases.length; i++) {
        const c = cases[i];
        expect(isUserBlockedOrInactive(c.doc), c.name).toBe(true);

        const uid = `uid-blocked-${i}`;
        const tok = `tok-blocked-${i}`;
        hoisted.tokenUsers.set(tok, {
          uid,
          email: `blocked${i}@ifpr.edu.br`,
          email_verified: true,
        });
        hoisted.store.users.set(uid, { uid, ...c.doc });

        const { req } = await runAuthenticate(tok);
        expect(req.authUser.isBlocked, c.name).toBe(true);
        expect(req.authUser.isAdmin, c.name).toBe(false);

        const res = await getJson("/api/monitoring/export-logs", tok);
        expect(res.status, c.name).toBe(403);
        expect(res.json.code, c.name).toBe("ACCOUNT_BLOCKED");
      }
    });

    it("mantém bloqueio para status=suspended sem suspendedUntil mesmo com blockExpiresAt expirado e libera apenas com suspendedUntil Timestamp expirado", async () => {
      const pastDate = new Date(Date.now() - 10 * 60 * 1000);

      // Caso 1: Suspensão indefinida (sem suspendedUntil) com blockExpiresAt residual expirado -> DEVE permanecer bloqueada (paridade hasS)
      const indefiniteResidualDoc = {
        uid: "uid-indefinite-residual",
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        status: "suspended",
        blockExpiresAt: { seconds: Math.floor(pastDate.getTime() / 1000), nanoseconds: 0 },
      };
      expect(isUserBlockedOrInactive(indefiniteResidualDoc)).toBe(true);

      // Caso 2: Suspensão temporária com suspendedUntil Timestamp expirado e active !== false -> liberada
      const uid = "uid-expired-suspension";
      const doc = {
        uid,
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        status: "suspended",
        suspendedUntil: { seconds: Math.floor(pastDate.getTime() / 1000), nanoseconds: 0 },
      };

      expect(isUserBlockedOrInactive(doc)).toBe(false);
      hoisted.tokenUsers.set("tok-expired-susp", {
        uid,
        email: "servidor@ifpr.edu.br",
        email_verified: true,
      });
      hoisted.store.users.set(uid, doc);

      const { req } = await runAuthenticate("tok-expired-susp");
      expect(req.authUser.isBlocked).toBe(false);
      expect(req.authUser.role).toBe("SERVIDOR");

      const caller = await verifyServerlessCallerAccess(hoisted.mockDb as any, {
        uid,
        email: "servidor@ifpr.edu.br",
        email_verified: true,
      });
      expect(caller.isBlocked).toBe(false);
      expect(caller.role).toBe("SERVIDOR");
    });
  });

  describe("Item 3 — parseUserExpiryMs e canRemovePreviousEncryptionKey fail-closed", () => {
    it("parseUserExpiryMs converte Firestore Timestamp, seconds/ms, ISO string e retorna null para inválido", () => {
      const targetMs = 1893456000000; // 2030-01-01T00:00:00.000Z
      expect(parseUserExpiryMs({ toMillis: () => targetMs })).toBe(targetMs);
      expect(parseUserExpiryMs({ toDate: () => new Date(targetMs) })).toBe(targetMs);
      expect(parseUserExpiryMs({ _seconds: 1893456000, _nanoseconds: 500_000_000 })).toBe(targetMs + 500);
      expect(parseUserExpiryMs({ seconds: 1893456000, nanoseconds: 0 })).toBe(targetMs);
      expect(parseUserExpiryMs(1893456000)).toBe(targetMs);
      expect(parseUserExpiryMs(targetMs)).toBe(targetMs);
      expect(parseUserExpiryMs("2030-01-01T00:00:00.000Z")).toBe(targetMs);
      expect(parseUserExpiryMs(undefined)).toBeNull();
      expect(parseUserExpiryMs(null)).toBeNull();
      expect(parseUserExpiryMs("not-a-date")).toBeNull();
    });

    it("canRemovePreviousEncryptionKey falha fechado com Firestore Timestamp futuro, expiresAt ausente ou inválido", async () => {
      const futureMs = Date.now() + 3600_000;
      const pastMs = Date.now() - 3600_000;

      // 1) Token ativo com Firestore Timestamp futuro (não possui .getTime()) -> deve bloquear remoção
      hoisted.store.signature_requests.set("sig-future", {
        itemId: "item-future",
        used: false,
        invalidated: false,
        encryptionKeyId: "k2026",
        expiresAt: { toMillis: () => futureMs, toDate: () => new Date(futureMs) },
      });
      const futureRes = await canRemovePreviousEncryptionKey(hoisted.mockDb, "k2026");
      expect(futureRes.safeToRemove).toBe(false);
      expect(futureRes.activeDependentCount).toBe(1);
      expect(futureRes.itemIds).toEqual(["item-future"]);

      // 2) expiresAt ausente (undefined) -> fail-closed, não assume expirado
      hoisted.store.signature_requests.clear();
      hoisted.store.signature_requests.set("sig-missing-exp", {
        itemId: "item-missing-exp",
        used: false,
        invalidated: false,
        encryptedToken: "k2026.iv.tag.cipher",
      });
      const missingRes = await canRemovePreviousEncryptionKey(hoisted.mockDb, "k2026");
      expect(missingRes.safeToRemove).toBe(false);
      expect(missingRes.itemIds).toEqual(["item-missing-exp"]);

      // 3) expiresAt inválido -> fail-closed
      hoisted.store.signature_requests.clear();
      hoisted.store.signature_requests.set("sig-invalid-exp", {
        itemId: "item-invalid-exp",
        used: false,
        invalidated: false,
        encryptionKeyId: "k2026",
        expiresAt: "invalid-timestamp",
      });
      const invalidRes = await canRemovePreviousEncryptionKey(hoisted.mockDb, "k2026");
      expect(invalidRes.safeToRemove).toBe(false);
      expect(invalidRes.itemIds).toEqual(["item-invalid-exp"]);

      // 4) expiresAt no passado (ou invalidated=true / used=true) -> seguro para remover
      hoisted.store.signature_requests.clear();
      hoisted.store.signature_requests.set("sig-expired", {
        itemId: "item-expired",
        used: false,
        invalidated: false,
        encryptionKeyId: "k2026",
        expiresAt: { seconds: Math.floor(pastMs / 1000), nanoseconds: 0 },
      });
      hoisted.store.signature_requests.set("sig-invalidated", {
        itemId: "item-invalidated",
        used: false,
        invalidated: true,
        encryptionKeyId: "k2026",
        expiresAt: { toMillis: () => futureMs },
      });
      const safeRes = await canRemovePreviousEncryptionKey(hoisted.mockDb, "k2026");
      expect(safeRes.safeToRemove).toBe(true);
      expect(safeRes.activeDependentCount).toBe(0);
      expect(safeRes.itemIds).toEqual([]);
    });
  });
});
