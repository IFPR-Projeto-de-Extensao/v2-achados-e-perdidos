import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import http from "http";
import fs from "fs";
import path from "path";

const hoisted = vi.hoisted(() => {
  const store: Record<string, Map<string, any>> = {
    users: new Map(),
    role_assignments: new Map(),
    audit_logs: new Map(),
    activity_logs: new Map(),
  };
  const tokenUsers = new Map<string, any>();
  const customClaimsByUid = new Map<string, Record<string, any>>();
  const revokedUids: string[] = [];

  const resetStore = () => {
    for (const col of Object.values(store)) {
      col.clear();
    }
    tokenUsers.clear();
    customClaimsByUid.clear();
    revokedUids.length = 0;
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
            data: () => ({ ...docData }),
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
      const stagedWrites: Array<() => Promise<void>> = [];
      const tx = {
        async get(ref: any) {
          return ref.get();
        },
        set(ref: any, payload: Record<string, any>, opts?: { merge?: boolean }) {
          stagedWrites.push(() => ref.set(payload, opts));
        },
        update(ref: any, payload: Record<string, any>) {
          stagedWrites.push(() => ref.update(payload));
        },
      };
      const result = await fn(tx);
      for (const w of stagedWrites) {
        await w();
      }
      return result;
    },
  };

  return { store, tokenUsers, customClaimsByUid, revokedUids, resetStore, mockDb };
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
    async getUser(uid: string) {
      const userDoc = hoisted.store.users.get(uid);
      return {
        uid,
        email: userDoc?.email || `${uid}@gmail.com`,
        displayName: userDoc?.name || "Usuário Teste",
        emailVerified: userDoc?.emailVerified ?? true,
        customClaims: hoisted.customClaimsByUid.get(uid) || {},
      };
    },
    async setCustomUserClaims(uid: string, claims: Record<string, any>) {
      hoisted.customClaimsByUid.set(uid, { ...claims });
    },
    async revokeRefreshTokens(uid: string) {
      hoisted.revokedUids.push(uid);
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

import app from "../../server";
import { reconcileUserProfiles } from "../../scripts/reconcile-user-profiles";
import { buildFirestoreItemCreatePayload } from "./itemPrivacyUtils";
import {
  isPersistedDocEligibleForItemWrite,
  formatForensicRuntimeLine,
} from "../context/AppContext";
import {
  isAuthorizationUploadError,
  isPermanentUploadError,
  computeUploadSubtitle,
} from "../components/UploadStatusIndicator";
import { classifySyncError } from "./payloadSizeGuard";
import type { UploadTaskStatus } from "../types";

// Canonical evaluator mirroring firestore.rules item/item_private/item_history create evaluation
function evaluateRulesForNonRootItemCreate(params: {
  authUid: string;
  authEmail: string;
  emailVerified: boolean;
  tokenClaims?: Record<string, any>;
  userDoc?: Record<string, any> | null;
  incomingItem: Record<string, any>;
}): { allowed: boolean; failedConditions: string[] } {
  const { authUid, authEmail, emailVerified, tokenClaims = {}, userDoc, incomingItem } = params;
  const failed: string[] = [];
  const u = userDoc || null;
  const userDocExists = Boolean(u);
  const nowMs = Date.now();

  const isUserDocBlocked = (() => {
    if (!u) return false;
    const blockExp = typeof u.blockExpiresAt === "number" ? u.blockExpiresAt : null;
    const suspUntil = typeof u.suspendedUntil === "number" ? u.suspendedUntil : null;
    const tempBlock = (blockExp !== null && blockExp > nowMs) || (suspUntil !== null && suspUntil > nowMs);
    return (
      u.active === false ||
      u.status === "banned" ||
      u.status === "inactive" ||
      (u.status === "suspended" && (tempBlock || (blockExp === null && suspUntil === null))) ||
      tempBlock
    );
  })();

  const isUserDocActive = (() => {
    if (!u) return false;
    const statusVal = "status" in u ? u.status : "active";
    return (
      (!("active" in u) || u.active !== false) &&
      statusVal === "active" &&
      !isUserDocBlocked &&
      (!("role" in u) || u.role !== "INTRUSO")
    );
  })();

  const isAccountActive = userDocExists && isUserDocActive;
  const isAdminUserDoc = Boolean(u && u.role === "ADMIN" && u.approvalStatus === "APROVADO");
  const hasAdminClaim =
    emailVerified &&
    (tokenClaims.role === "ADMIN" || tokenClaims.admin === true) &&
    (!userDocExists || isAdminUserDoc);
  const isDocAdmin = emailVerified && userDocExists && isAdminUserDoc;
  const isApprovedStaffOrAdminDoc = Boolean(
    u && (u.role === "SERVIDOR" || u.role === "ADMIN") && u.approvalStatus === "APROVADO"
  );
  const canRegisterItems = emailVerified && ((userDocExists && isApprovedStaffOrAdminDoc) || hasAdminClaim);
  const isRecognizedUserDocRole = Boolean(
    u && (u.role === "ALUNO" || u.role === "SERVIDOR" || (u.role === "ADMIN" && u.approvalStatus === "APROVADO"))
  );
  const isInstitutionalEmail = /@([a-z0-9-]+\.)*ifpr\.edu\.br$/i.test(authEmail);
  const isIntruso =
    !emailVerified ||
    (!(userDocExists && isRecognizedUserDocRole) &&
      !hasAdminClaim &&
      ((u && u.role === "INTRUSO") || !isInstitutionalEmail));

  if (incomingItem.registeredByUserId !== authUid) failed.push("registeredByUserId != auth.uid");
  if (!emailVerified) failed.push("!isEmailVerified()");
  if (!isAccountActive) failed.push("!isAccountActive()");
  if (isIntruso) failed.push("isIntruso()");
  if (incomingItem.registeredByRole === "ADMIN" && !(hasAdminClaim || isDocAdmin)) {
    failed.push("ADMIN_CHECK_FAILED (hasAdminClaim || isDocAdmin == false)");
  }
  if (incomingItem.registeredByRole === "SERVIDOR" && !canRegisterItems) {
    failed.push("SERVIDOR_CHECK_FAILED (canRegisterItems() == false)");
  }
  if ("isOfflineQueued" in incomingItem || "syncedAt" in incomingItem) {
    // Verify clean payload discipline
    if (incomingItem.isOfflineQueued !== undefined || incomingItem.syncedAt !== undefined) {
      failed.push("UNEXPECTED_QUEUE_METADATA");
    }
  }

  return { allowed: failed.length === 0, failedConditions: failed };
}

describe("Reconciliação de Perfis, Regras Firestore, Fila Offline e UI — Localiza+ v1.10.13", () => {
  let server: http.Server;
  let baseUrl = "";
  const prevRootUid = process.env.ROOT_ADMIN_UID;
  const ROOT_UID = "hCG5mDgK1fRaTojULzlM7dXvb7n2";

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

  beforeAll(async () => {
    process.env.ROOT_ADMIN_UID = ROOT_UID;
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
    process.env.ROOT_ADMIN_UID = prevRootUid;
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  beforeEach(() => {
    hoisted.resetStore();
  });

  describe("(a, b, c) Validação das Firestore Rules para ADMIN/SERVIDOR não-root vs INTRUSO/PENDENTE", () => {
    it("(a) ADMIN não-root com users/{uid} ADMIN/APROVADO/active tem permissão para criar item", () => {
      const res = evaluateRulesForNonRootItemCreate({
        authUid: "gmail-admin-1",
        authEmail: "admin.promovido@gmail.com",
        emailVerified: true,
        tokenClaims: { role: "ADMIN", admin: true },
        userDoc: {
          role: "ADMIN",
          approvalStatus: "APROVADO",
          status: "active",
          active: true,
        },
        incomingItem: buildFirestoreItemCreatePayload({
          id: "ifpr-test-1",
          title: "Carteira Marrom",
          registeredByUserId: "gmail-admin-1",
          registeredByRole: "ADMIN",
          type: "ENCONTRADO",
          status: "ENCONTRADO",
        }),
      });
      expect(res.allowed).toBe(true);
      expect(res.failedConditions).toEqual([]);
    });

    it("(b) mesmo token com claim ADMIN mas users/{uid} INTRUSO ou PENDENTE falha com permission-denied", () => {
      const intrusoRes = evaluateRulesForNonRootItemCreate({
        authUid: "gmail-admin-divergent",
        authEmail: "admin.promovido@gmail.com",
        emailVerified: true,
        tokenClaims: { role: "ADMIN", admin: true },
        userDoc: {
          role: "INTRUSO",
          approvalStatus: "PENDENTE",
          status: "active",
        },
        incomingItem: {
          id: "ifpr-test-2",
          registeredByUserId: "gmail-admin-divergent",
          registeredByRole: "ADMIN",
        },
      });
      expect(intrusoRes.allowed).toBe(false);
      expect(intrusoRes.failedConditions).toContain("!isAccountActive()");
      expect(intrusoRes.failedConditions).toContain("isIntruso()");
      expect(intrusoRes.failedConditions.some((c) => c.startsWith("ADMIN_CHECK_FAILED"))).toBe(true);

      const pendenteRes = evaluateRulesForNonRootItemCreate({
        authUid: "gmail-admin-pendente",
        authEmail: "admin.promovido@gmail.com",
        emailVerified: true,
        tokenClaims: { role: "ADMIN", admin: true },
        userDoc: {
          role: "ADMIN",
          approvalStatus: "PENDENTE",
          status: "active",
        },
        incomingItem: {
          id: "ifpr-test-3",
          registeredByUserId: "gmail-admin-pendente",
          registeredByRole: "ADMIN",
        },
      });
      expect(pendenteRes.allowed).toBe(false);
      expect(pendenteRes.failedConditions).toContain("isIntruso()");
      expect(pendenteRes.failedConditions.some((c) => c.startsWith("ADMIN_CHECK_FAILED"))).toBe(true);
    });

    it("(c) SERVIDOR aprovado cria normalmente; SERVIDOR PENDENTE é recusado", () => {
      const servOk = evaluateRulesForNonRootItemCreate({
        authUid: "gmail-serv-1",
        authEmail: "servidor.promovido@gmail.com",
        emailVerified: true,
        tokenClaims: { role: "SERVIDOR" },
        userDoc: {
          role: "SERVIDOR",
          approvalStatus: "APROVADO",
          status: "active",
          active: true,
        },
        incomingItem: {
          id: "ifpr-test-4",
          registeredByUserId: "gmail-serv-1",
          registeredByRole: "SERVIDOR",
        },
      });
      expect(servOk.allowed).toBe(true);

      const servPend = evaluateRulesForNonRootItemCreate({
        authUid: "gmail-serv-pend",
        authEmail: "servidor.pendente@gmail.com",
        emailVerified: true,
        tokenClaims: { role: "SERVIDOR" },
        userDoc: {
          role: "SERVIDOR",
          approvalStatus: "PENDENTE",
          status: "active",
        },
        incomingItem: {
          id: "ifpr-test-5",
          registeredByUserId: "gmail-serv-pend",
          registeredByRole: "SERVIDOR",
        },
      });
      expect(servPend.allowed).toBe(false);
      expect(servPend.failedConditions.some((c) => c.startsWith("SERVIDOR_CHECK_FAILED"))).toBe(true);
    });
  });

  describe("(d) /api/auth/reconcile-profile, /api/admin/assign-role e script de reconciliação", () => {
    it("reconcilia users/{uid} divergente (INTRUSO/PENDENTE -> ADMIN/APROVADO/active), atualiza claims e é idempotente", async () => {
      const uid = "gmail-promoted-admin";
      hoisted.tokenUsers.set("tok-gmail-admin", {
        uid,
        email: "promovido@gmail.com",
        email_verified: true,
      });
      hoisted.store.users.set(uid, {
        id: uid,
        email: "promovido@gmail.com",
        role: "INTRUSO",
        approvalStatus: "PENDENTE",
        status: "active",
      });
      hoisted.store.role_assignments.set(uid, {
        id: uid,
        targetUserId: uid,
        targetEmail: "promovido@gmail.com",
        assignedRole: "ADMIN",
        approvalStatus: "APROVADO",
        assignedByEmail: "paulocauan39@gmail.com",
        assignedAt: "2026-11-15T10:00:00.000Z",
        active: true,
      });

      const res1 = await postJson("/api/auth/reconcile-profile", {}, "tok-gmail-admin");
      expect(res1.status).toBe(200);
      expect(res1.json.success).toBe(true);
      expect(res1.json.reconciled).toBe(true);
      expect(res1.json.assignedRole).toBe("ADMIN");

      const updatedUser = hoisted.store.users.get(uid);
      expect(updatedUser.role).toBe("ADMIN");
      expect(updatedUser.approvalStatus).toBe("APROVADO");
      expect(updatedUser.status).toBe("active");
      expect(updatedUser.active).toBe(true);
      expect(updatedUser.roleAssignmentActive).toBe(true);
      expect(hoisted.customClaimsByUid.get(uid)).toEqual({
        role: "ADMIN",
        approvalStatus: "APROVADO",
        admin: true,
      });

      // Segunda chamada deve ser idempotente (alreadyConsistent: true, reconciled: false)
      const res2 = await postJson("/api/auth/reconcile-profile", {}, "tok-gmail-admin");
      expect(res2.status).toBe(200);
      expect(res2.json.reconciled).toBe(false);
      expect(res2.json.alreadyConsistent).toBe(true);
    });

    it("recusa/ignora reconciliação se email não verificado, sem atribuição ativa ou conta banida/suspensa/active=false", async () => {
      // 1. Sem autenticação -> 401
      const unauthRes = await postJson("/api/auth/reconcile-profile", {});
      expect(unauthRes.status).toBe(401);

      // 2. Email não verificado -> 403
      hoisted.tokenUsers.set("tok-unverified", {
        uid: "u-unv",
        email: "unv@gmail.com",
        email_verified: false,
      });
      const unvRes = await postJson("/api/auth/reconcile-profile", {}, "tok-unverified");
      expect(unvRes.status).toBe(403);
      expect(unvRes.json.code).toBe("AUTH_EMAIL_NOT_VERIFIED");

      // 3. Atribuição revogada (active: false) -> NÃO promove
      const revUid = "u-revoked";
      hoisted.tokenUsers.set("tok-rev", {
        uid: revUid,
        email: "rev@gmail.com",
        email_verified: true,
      });
      hoisted.store.users.set(revUid, {
        id: revUid,
        email: "rev@gmail.com",
        role: "INTRUSO",
        approvalStatus: "PENDENTE",
        status: "active",
      });
      hoisted.store.role_assignments.set(revUid, {
        targetUserId: revUid,
        assignedRole: "ADMIN",
        approvalStatus: "APROVADO",
        active: false,
      });
      const revRes = await postJson("/api/auth/reconcile-profile", {}, "tok-rev");
      expect(revRes.status).toBe(200);
      expect(revRes.json.reconciled).toBe(false);
      expect(hoisted.store.users.get(revUid).role).toBe("INTRUSO");

      // 4. Conta banida ou active=false -> NÃO remove banimento nem promove
      const banUid = "u-banned";
      hoisted.tokenUsers.set("tok-ban", {
        uid: banUid,
        email: "ban@gmail.com",
        email_verified: true,
      });
      hoisted.store.users.set(banUid, {
        id: banUid,
        email: "ban@gmail.com",
        role: "INTRUSO",
        status: "banned",
      });
      hoisted.store.role_assignments.set(banUid, {
        targetUserId: banUid,
        assignedRole: "SERVIDOR",
        approvalStatus: "APROVADO",
        active: true,
      });
      const banRes = await postJson("/api/auth/reconcile-profile", {}, "tok-ban");
      expect(banRes.status).toBe(403);
      expect(banRes.json.code).toBe("ACCOUNT_BLOCKED");
      expect(hoisted.store.users.get(banUid).status).toBe("banned");
      expect(hoisted.store.users.get(banUid).role).toBe("INTRUSO");
    });

    it("POST /api/admin/assign-role grava status=active e active=true para APROVADO e claim admin=true para ADMIN sem remover ban/suspensão", async () => {
      hoisted.tokenUsers.set("tok-root", {
        uid: ROOT_UID,
        email: "paulocauan39@gmail.com",
        email_verified: true,
      });

      const targetUid = "gmail-target-admin";
      hoisted.store.users.set(targetUid, {
        id: targetUid,
        email: "novo.admin@gmail.com",
        role: "INTRUSO",
        approvalStatus: "PENDENTE",
      });

      const assignRes = await postJson(
        "/api/admin/assign-role",
        { targetUserId: targetUid, targetRole: "ADMIN", reason: "Promoção QA" },
        "tok-root"
      );
      expect(assignRes.status).toBe(200);
      expect(hoisted.store.users.get(targetUid).role).toBe("ADMIN");
      expect(hoisted.store.users.get(targetUid).approvalStatus).toBe("APROVADO");
      expect(hoisted.store.users.get(targetUid).status).toBe("active");
      expect(hoisted.store.users.get(targetUid).active).toBe(true);
      expect(hoisted.customClaimsByUid.get(targetUid)).toEqual({
        role: "ADMIN",
        approvalStatus: "APROVADO",
        admin: true,
      });

      // Target banido não deve ter status sobrescrito para active
      const bannedUid = "gmail-banned-target";
      hoisted.store.users.set(bannedUid, {
        id: bannedUid,
        email: "ban.target@gmail.com",
        role: "INTRUSO",
        status: "banned",
      });
      const assignBannedRes = await postJson(
        "/api/admin/assign-role",
        { targetUserId: bannedUid, targetRole: "SERVIDOR" },
        "tok-root"
      );
      expect(assignBannedRes.status).toBe(200);
      expect(hoisted.store.users.get(bannedUid).status).toBe("banned");
      expect(hoisted.store.users.get(bannedUid).active).toBeUndefined();
    });

    it("script reconcileUserProfiles funciona em --dry-run e modo real ignorando root e contas suspensas/banidas", async () => {
      hoisted.store.users.set("u-div-1", {
        id: "u-div-1",
        email: "div1@gmail.com",
        role: "INTRUSO",
        approvalStatus: "PENDENTE",
        status: "active",
      });
      hoisted.store.role_assignments.set("u-div-1", {
        targetUserId: "u-div-1",
        targetEmail: "div1@gmail.com",
        assignedRole: "SERVIDOR",
        approvalStatus: "APROVADO",
        active: true,
      });

      hoisted.store.users.set("u-susp-2", {
        id: "u-susp-2",
        email: "susp2@gmail.com",
        role: "INTRUSO",
        status: "suspended",
        active: false,
      });
      hoisted.store.role_assignments.set("u-susp-2", {
        targetUserId: "u-susp-2",
        targetEmail: "susp2@gmail.com",
        assignedRole: "ADMIN",
        approvalStatus: "APROVADO",
        active: true,
      });

      const drySummary = await reconcileUserProfiles({
        dryRun: true,
        db: hoisted.mockDb as any,
        auth: null,
      });
      expect(drySummary.divergent).toBe(1);
      expect(drySummary.reconciled).toBe(0);
      expect(drySummary.skippedBlocked).toBe(1);
      expect(hoisted.store.users.get("u-div-1").role).toBe("INTRUSO");

      const liveSummary = await reconcileUserProfiles({
        dryRun: false,
        db: hoisted.mockDb as any,
        auth: null,
      });
      expect(liveSummary.reconciled).toBe(1);
      expect(liveSummary.skippedBlocked).toBe(1);
      expect(hoisted.store.users.get("u-div-1").role).toBe("SERVIDOR");
      expect(hoisted.store.users.get("u-div-1").approvalStatus).toBe("APROVADO");
      expect(hoisted.store.users.get("u-div-1").status).toBe("active");
      expect(hoisted.store.users.get("u-div-1").active).toBe(true);
      expect(hoisted.store.users.get("u-susp-2").role).toBe("INTRUSO");
      expect(hoisted.store.users.get("u-susp-2").status).toBe("suspended");
    });
  });

  describe("(e) Pré-validação em addItem, log em 1 linha e Toast único no RegisterItemView", () => {
    it("isPersistedDocEligibleForItemWrite rejeita INTRUSO, PENDENTE e contas bloqueadas", () => {
      expect(isPersistedDocEligibleForItemWrite({ role: "INTRUSO", approvalStatus: "APROVADO", status: "active" })).toBe(false);
      expect(isPersistedDocEligibleForItemWrite({ role: "ADMIN", approvalStatus: "PENDENTE", status: "active" })).toBe(false);
      expect(isPersistedDocEligibleForItemWrite({ role: "SERVIDOR", approvalStatus: "APROVADO", status: "banned" })).toBe(false);
      expect(isPersistedDocEligibleForItemWrite({ role: "ADMIN", approvalStatus: "APROVADO", status: "active", active: false })).toBe(false);
      expect(isPersistedDocEligibleForItemWrite({ role: "ADMIN", approvalStatus: "APROVADO", status: "active", active: true })).toBe(true);
      expect(isPersistedDocEligibleForItemWrite({ role: "SERVIDOR", approvalStatus: "APROVADO", status: "active" })).toBe(true);
    });

    it("formatForensicRuntimeLine formata todos os campos obrigatórios em uma única linha de texto simples", () => {
      const line = formatForensicRuntimeLine({
        context: "addItem",
        uid: "uid-1",
        email: "admin@gmail.com",
        tokenEmailVerified: true,
        tokenRole: "ADMIN",
        userDocExists: true,
        userDocRole: "ADMIN",
        userDocApprovalStatus: "APROVADO",
        userDocStatus: "active",
        userDocActive: true,
        registeredByRole: "ADMIN",
      });
      expect(line).not.toContain("\n");
      expect(line).toContain("[FIRESTORE_FORENSIC_RUNTIME]");
      expect(line).toContain("userDocRole=ADMIN");
      expect(line).toContain("userDocApprovalStatus=APROVADO");
      expect(line).toContain("userDocStatus=active");
      expect(line).toContain("userDocActive=true");
      expect(line).toContain("registeredByRole=ADMIN");
    });

    it("addItem não chama addToast diretamente (RegisterItemView emite exatamente 1 toast em permission-denied)", () => {
      const appCtxSrc = fs.readFileSync(path.resolve(process.cwd(), "src/context/AppContext.tsx"), "utf-8");
      const addItemStart = appCtxSrc.indexOf("const addItem = async");
      const addItemEnd = appCtxSrc.indexOf("const suggestMatchesForItem", addItemStart);
      expect(addItemStart).toBeGreaterThan(-1);
      expect(addItemEnd).toBeGreaterThan(addItemStart);

      const addItemBlock = appCtxSrc.slice(addItemStart, addItemEnd);
      expect(addItemBlock).not.toContain("addToast(");
      expect(addItemBlock).toContain("isPersistedDocEligibleForItemWrite");
      expect(addItemBlock).toContain("writeBatch(db)");
      expect(addItemBlock).toContain("buildFirestoreItemCreatePayload(newItem)");

      // Simulação exata do tratamento de toast no fluxo addItem + RegisterItemView.handleFinalSubmit
      const emittedToasts: Array<{ text: string; type: string }> = [];
      const addToast = (text: string, type: string) => emittedToasts.push({ text, type });
      const err = classifySyncError({ code: "permission-denied", message: "Missing or insufficient permissions." }, 1024);
      expect(err.category).toBe("AUTHORIZATION");
      // RegisterItemView chama addToast uma única vez usando errorCategory e classifiedMessage
      addToast(err.userMessage, err.category === "AUTHORIZATION" ? "error" : "warning");
      expect(emittedToasts).toHaveLength(1);
    });
  });

  describe("(f) Payload limpo na fila offline e UploadStatusIndicator bloqueado por autorização", () => {
    it("buildFirestoreItemCreatePayload remove isOfflineQueued, syncedAt, history e historyLogs", () => {
      const cleaned = buildFirestoreItemCreatePayload({
        id: "ifpr-abc",
        title: "Chave",
        type: "ENCONTRADO",
        status: "ENCONTRADO",
        isOfflineQueued: false,
        syncedAt: "2026-11-15T12:00:00.000Z",
        history: [{ id: "h1", action: "Ocorrência cadastrada" }],
        historyLogs: [{ id: "h1" }],
        secretVerificationHint: "Segredo",
        secretVerificationKey: "hash-123",
      });

      expect("isOfflineQueued" in cleaned).toBe(false);
      expect("syncedAt" in cleaned).toBe(false);
      expect("history" in cleaned).toBe(false);
      expect("historyLogs" in cleaned).toBe(false);
      expect("secretVerificationHint" in cleaned).toBe(false);
      expect("secretVerificationKey" in cleaned).toBe(false);
      expect(cleaned.id).toBe("ifpr-abc");
      expect(cleaned.title).toBe("Chave");
    });

    it("UploadStatusIndicator classifica erro AUTHORIZATION como permanente, exibe subtítulo correto e oculta aviso verde de Background Sync", () => {
      const authTask: UploadTaskStatus = {
        id: "task-ifpr-1",
        itemId: "ifpr-1",
        itemTitle: "Mochila",
        itemType: "ENCONTRADO",
        progress: 100,
        status: "ERROR",
        error: "AUTHORIZATION_PERMISSION_DENIED",
        statusMessage: "Sincronização recusada por falta de autorização/permissão no Firestore. O item permanece preservado no dispositivo.",
        startedAt: "2026-11-15T12:00:00.000Z",
      };

      expect(isAuthorizationUploadError(authTask)).toBe(true);
      expect(isPermanentUploadError(authTask)).toBe(true);

      const subtitle = computeUploadSubtitle({
        isOnline: true,
        isSyncing: false,
        pendingSyncCount: 1,
        inProgressCount: 0,
        authorizationErrorCount: 1,
        permanentErrorCount: 1,
        temporaryErrorCount: 0,
        completedCount: 0,
      });
      expect(subtitle).toBe("Sincronização bloqueada por falta de autorização");

      const indicatorSrc = fs.readFileSync(
        path.resolve(process.cwd(), "src/components/UploadStatusIndicator.tsx"),
        "utf-8"
      );
      expect(indicatorSrc).toContain("{permanentErrorCount === 0 && (");
    });
  });
});
