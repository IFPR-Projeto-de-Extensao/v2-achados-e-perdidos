import { describe, it, expect } from "vitest";
import { Timestamp, deleteField } from "firebase/firestore";
import {
  buildUserStatusTransitionData,
  isPersistedUserDocActive,
  isPersistedDocEligibleForItemWrite,
} from "../context/AppContext";
import { sanitizeFirestoreData } from "./shared-constants";
import { resolveAccountStatus } from "./accountStatusUtils";
import { evaluateListenerSession } from "./listenerGuards";
import { canOperateFormalReturn } from "./devolutionAuth";
import {
  isUserBlockedOrInactive as adminIsUserBlockedOrInactive,
  hasUserBanSuspensionOrBlock as adminHasUserBanSuspensionOrBlock,
  buildApprovedUserStatusFields,
} from "../../api/_lib/firebaseAdmin";
import {
  isUserBlockedOrInactive as serverIsUserBlockedOrInactive,
  hasUserActiveTemporalBlock as serverHasUserActiveTemporalBlock,
  evaluateFirestoreStandingDeadline,
} from "../../server";

describe("LOCALIZA+ v1.10.13 — Etapa 10: Transições Administrativas, Guards e Paridade Full-Stack", () => {
  describe("1. buildUserStatusTransitionData & sanitizeFirestoreData (updateUserStatus)", () => {
    it("reativação ('active') grava active: true, preserva deleteField() para suspendedUntil e blockExpiresAt e limpa estado local sem chaves undefined", () => {
      const sentinel = deleteField();
      const sanitized = sanitizeFirestoreData({
        suspendedUntil: sentinel,
        blockExpiresAt: sentinel,
        ts: Timestamp.now(),
      });
      expect(sanitized.suspendedUntil).toBe(sentinel);
      expect(sanitized.blockExpiresAt).toBe(sentinel);
      expect(sanitized.ts).toBeInstanceOf(Timestamp);

      const transition = buildUserStatusTransitionData({
        newStatus: "active",
        reason: "",
        actorId: "admin-1",
        actorName: "Admin IFPR",
        actorEmail: "admin@ifpr.edu.br",
        nowIso: "2026-11-18T12:00:00.000Z",
      });

      expect(transition.firestorePayload.status).toBe("active");
      expect(transition.firestorePayload.active).toBe(true);
      expect(transition.firestorePayload.suspendedUntil).toBeDefined();
      expect(transition.firestorePayload.blockExpiresAt).toBeDefined();
      expect(transition.firestorePayload.statusReason).toBeDefined();

      // Garante que os valores no payload de reativação são sentinels reais de deleteField()
      expect(JSON.stringify(transition.firestorePayload.suspendedUntil)).toBe(JSON.stringify(deleteField()));
      expect(JSON.stringify(transition.firestorePayload.blockExpiresAt)).toBe(JSON.stringify(deleteField()));
      expect(JSON.stringify(transition.firestorePayload.statusReason)).toBe(JSON.stringify(deleteField()));

      const legacyUser: any = {
        id: "user-legacy-1",
        name: "Aluno Teste",
        email: "aluno@estudantes.ifpr.edu.br",
        role: "ALUNO",
        status: "suspended",
        active: false,
        statusReason: "Suspensão antiga",
        suspendedUntil: "2025-01-01T00:00:00.000Z",
        blockExpiresAt: "2025-01-02T00:00:00.000Z",
      };

      const updatedLocal = transition.applyToLocalUser(legacyUser);
      expect(updatedLocal.status).toBe("active");
      expect(updatedLocal.active).toBe(true);
      expect("suspendedUntil" in updatedLocal).toBe(false);
      expect("blockExpiresAt" in updatedLocal).toBe(false);
      expect("statusReason" in updatedLocal).toBe(false);

      const resolvedAfter = resolveAccountStatus(updatedLocal);
      expect(resolvedAfter.status).toBe("active");
      expect(resolvedAfter.hasLegacyInconsistency).toBe(false);
    });

    it("suspensão temporária grava suspendedUntil como Timestamp nativo, active: true e limpa blockExpiresAt residual", () => {
      const futureIso = new Date(Date.now() + 5 * 86400_000).toISOString();
      const transition = buildUserStatusTransitionData({
        newStatus: "suspended",
        reason: "Conduta inadequada",
        suspendedUntil: futureIso,
        actorId: "admin-1",
        actorName: "Admin IFPR",
        actorEmail: "admin@ifpr.edu.br",
      });

      expect(transition.firestorePayload.status).toBe("suspended");
      expect(transition.firestorePayload.active).toBe(true);
      expect(transition.firestorePayload.suspendedUntil).toBeInstanceOf(Timestamp);
      expect(JSON.stringify(transition.firestorePayload.blockExpiresAt)).toBe(JSON.stringify(deleteField()));
      expect(transition.firestorePayload.statusReason).toBe("Conduta inadequada");

      const updatedLocal = transition.applyToLocalUser({
        id: "u-temp",
        name: "Temp",
        email: "temp@estudantes.ifpr.edu.br",
        role: "ALUNO",
        status: "active",
        blockExpiresAt: "2024-01-01T00:00:00.000Z",
      } as any);

      expect(updatedLocal.suspendedUntil).toBeInstanceOf(Timestamp);
      expect("blockExpiresAt" in updatedLocal).toBe(false);
      expect(resolveAccountStatus(updatedLocal).status).toBe("suspended");
    });

    it("suspensão por tempo indeterminado remove suspendedUntil e blockExpiresAt via deleteField()", () => {
      const transition = buildUserStatusTransitionData({
        newStatus: "suspended",
        reason: "Bloqueio por tempo indeterminado",
        suspendedUntil: undefined,
        actorId: "admin-1",
        actorName: "Admin IFPR",
        actorEmail: "admin@ifpr.edu.br",
      });

      expect(transition.firestorePayload.status).toBe("suspended");
      expect(transition.firestorePayload.active).toBe(true);
      expect(JSON.stringify(transition.firestorePayload.suspendedUntil)).toBe(JSON.stringify(deleteField()));
      expect(JSON.stringify(transition.firestorePayload.blockExpiresAt)).toBe(JSON.stringify(deleteField()));

      const updatedLocal = transition.applyToLocalUser({
        id: "u-indef",
        name: "Indef",
        email: "indef@estudantes.ifpr.edu.br",
        role: "ALUNO",
        status: "active",
        blockExpiresAt: Timestamp.fromDate(new Date(Date.now() - 86400_000)),
      } as any);

      expect("suspendedUntil" in updatedLocal).toBe(false);
      expect("blockExpiresAt" in updatedLocal).toBe(false);
      expect(resolveAccountStatus(updatedLocal).status).toBe("suspended");
    });

    it("falha explicitamente ao receber prazo inválido ('invalid-date', '', null) sem fallback silencioso para indeterminado", () => {
      expect(() =>
        buildUserStatusTransitionData({
          newStatus: "suspended",
          reason: "Teste inválido",
          suspendedUntil: "invalid-date",
          actorId: "admin-1",
          actorName: "Admin",
          actorEmail: "admin@ifpr.edu.br",
        })
      ).toThrow();

      expect(() =>
        buildUserStatusTransitionData({
          newStatus: "suspended",
          reason: "Teste vazio",
          suspendedUntil: "   ",
          actorId: "admin-1",
          actorName: "Admin",
          actorEmail: "admin@ifpr.edu.br",
        })
      ).toThrow();

      expect(() =>
        buildUserStatusTransitionData({
          newStatus: "suspended",
          reason: "Teste null",
          suspendedUntil: null,
          actorId: "admin-1",
          actorName: "Admin",
          actorEmail: "admin@ifpr.edu.br",
        })
      ).toThrow();
    });
  });

  describe("2. Guards de Sessão, Devolução e Elegibilidade (AppContext, listenerGuards, devolutionAuth)", () => {
    it("bloqueia contas com status: null, status: '', active: false, ISO-8601 e suspensão indefinida com blockExpiresAt expirado", () => {
      const blockedCases: any[] = [
        { id: "u1", role: "SERVIDOR", approvalStatus: "APROVADO", status: null, active: true },
        { id: "u2", role: "SERVIDOR", approvalStatus: "APROVADO", status: "", active: true },
        { id: "u3", role: "SERVIDOR", approvalStatus: "APROVADO", status: "active", active: false },
        { id: "u4", role: "SERVIDOR", approvalStatus: "APROVADO", status: "active", blockExpiresAt: "2024-01-01T00:00:00.000Z" },
        { id: "u5", role: "SERVIDOR", approvalStatus: "APROVADO", status: "active", suspendedUntil: true },
        { id: "u6", role: "SERVIDOR", approvalStatus: "APROVADO", status: "active", blockExpiresAt: ["2024-01-01"] },
        { id: "u7", role: "SERVIDOR", approvalStatus: "APROVADO", status: "suspended", blockExpiresAt: Timestamp.fromDate(new Date(Date.now() - 86400_000)) },
      ];

      const makeFirebaseUser = (uid: string) => ({
        uid,
        email: "servidor@ifpr.edu.br",
        emailVerified: true,
      });

      for (const userDoc of blockedCases) {
        const fbUser = makeFirebaseUser(userDoc.id);
        expect(isPersistedUserDocActive(userDoc)).toBe(false);
        expect(isPersistedDocEligibleForItemWrite(userDoc)).toBe(false);
        expect(canOperateFormalReturn(userDoc, fbUser, false)).toBe(false);
        const session = evaluateListenerSession({
          authLoading: false,
          firebaseUser: fbUser,
          currentUser: userDoc,
        });
        expect(session.isAccountActive).toBe(false);
        expect(session.isApprovedStaffOrAdmin).toBe(false);
      }

      const validActive = {
        id: "u-ok",
        email: "servidor@ifpr.edu.br",
        role: "SERVIDOR" as const,
        approvalStatus: "APROVADO" as const,
        status: "active" as const,
        active: true,
        blockExpiresAt: Timestamp.fromDate(new Date(Date.now() - 3600_000)),
      };
      const validFbUser = makeFirebaseUser("u-ok");
      expect(isPersistedUserDocActive(validActive)).toBe(true);
      expect(isPersistedDocEligibleForItemWrite(validActive)).toBe(true);
      expect(canOperateFormalReturn(validActive, validFbUser, false)).toBe(true);
      const validSession = evaluateListenerSession({
        authLoading: false,
        firebaseUser: validFbUser,
        currentUser: validActive,
      });
      expect(validSession.isAccountActive).toBe(true);
      expect(validSession.isApprovedStaffOrAdmin).toBe(true);
    });
  });

  describe("3. Paridade Backend (server.ts e api/_lib/firebaseAdmin.ts) com Firestore Rules", () => {
    it("isUserBlockedOrInactive e hasUserActiveTemporalBlock rejeitam ISO-8601, null, '', number, boolean, array, object, active: false e suspensão indefinida com residual", () => {
      const pastIso = new Date(Date.now() - 86400_000).toISOString();
      const pastTs = Timestamp.fromDate(new Date(Date.now() - 86400_000));
      const futureTs = Timestamp.fromDate(new Date(Date.now() + 86400_000));

      const blockedDocs: Array<{ label: string; doc: Record<string, any>; temporalExpected: boolean }> = [
        { label: "active + blockExpiresAt ISO expirada", doc: { status: "active", active: true, blockExpiresAt: pastIso }, temporalExpected: true },
        { label: "active + suspendedUntil ISO futura", doc: { status: "active", active: true, suspendedUntil: new Date(Date.now() + 86400_000).toISOString() }, temporalExpected: true },
        { label: "active + suspendedUntil null", doc: { status: "active", active: true, suspendedUntil: null }, temporalExpected: true },
        { label: "active + blockExpiresAt ''", doc: { status: "active", active: true, blockExpiresAt: "" }, temporalExpected: true },
        { label: "active + blockExpiresAt number", doc: { status: "active", active: true, blockExpiresAt: 1700000000000 }, temporalExpected: true },
        { label: "active + blockExpiresAt boolean", doc: { status: "active", active: true, blockExpiresAt: true }, temporalExpected: true },
        { label: "active + blockExpiresAt array", doc: { status: "active", active: true, blockExpiresAt: ["2026-01-01"] }, temporalExpected: true },
        { label: "active + suspendedUntil object/map", doc: { status: "active", active: true, suspendedUntil: { foo: "bar" } }, temporalExpected: true },
        { label: "active + active: false", doc: { status: "active", active: false }, temporalExpected: false },
        { label: "status: null", doc: { status: null, active: true }, temporalExpected: false },
        { label: "status: ''", doc: { status: "", active: true }, temporalExpected: false },
        { label: "status: 'inactive'", doc: { status: "inactive", active: true }, temporalExpected: false },
        { label: "status: 'banned' + suspendedUntil expirado", doc: { status: "banned", active: true, suspendedUntil: pastTs }, temporalExpected: false },
        { label: "suspended sem suspendedUntil + blockExpiresAt Timestamp expirado", doc: { status: "suspended", active: true, blockExpiresAt: pastTs }, temporalExpected: false },
        { label: "suspended + suspendedUntil Timestamp futuro", doc: { status: "suspended", active: true, suspendedUntil: futureTs }, temporalExpected: true },
        { label: "suspended + suspendedUntil Timestamp expirado + blockExpiresAt Timestamp futuro", doc: { status: "suspended", active: true, suspendedUntil: pastTs, blockExpiresAt: futureTs }, temporalExpected: true },
      ];

      for (const c of blockedDocs) {
        expect(serverIsUserBlockedOrInactive(c.doc), `server.ts: ${c.label}`).toBe(true);
        expect(adminIsUserBlockedOrInactive(c.doc), `firebaseAdmin.ts: ${c.label}`).toBe(true);
        expect(adminHasUserBanSuspensionOrBlock(c.doc), `hasBanSuspensionOrBlock: ${c.label}`).toBe(true);
        expect(serverHasUserActiveTemporalBlock(c.doc), `temporalBlock: ${c.label}`).toBe(c.temporalExpected);
        expect(buildApprovedUserStatusFields(c.doc, "APROVADO", true), `buildApprovedUserStatusFields: ${c.label}`).toEqual({});
      }

      // Casos liberados (paridade estrita com Firestore Rules)
      const allowedDocs: Array<{ label: string; doc: Record<string, any> }> = [
        { label: "active + active: true", doc: { status: "active", active: true } },
        { label: "active + blockExpiresAt Timestamp expirado", doc: { status: "active", active: true, blockExpiresAt: pastTs } },
        { label: "status ausente (C-26)", doc: { role: "ALUNO", approvalStatus: "APROVADO" } },
        { label: "suspended + suspendedUntil Timestamp expirado sem blockExpiresAt", doc: { status: "suspended", active: true, suspendedUntil: pastTs } },
        { label: "suspended + ambos Timestamps expirados", doc: { status: "suspended", active: true, suspendedUntil: pastTs, blockExpiresAt: pastTs } },
      ];

      for (const c of allowedDocs) {
        expect(serverIsUserBlockedOrInactive(c.doc), `server.ts allowed: ${c.label}`).toBe(false);
        expect(adminIsUserBlockedOrInactive(c.doc), `firebaseAdmin.ts allowed: ${c.label}`).toBe(false);
      }

      expect(evaluateFirestoreStandingDeadline({ blockExpiresAt: pastIso }, "blockExpiresAt").isInvalid).toBe(true);
      expect(evaluateFirestoreStandingDeadline({ blockExpiresAt: pastTs }, "blockExpiresAt").isExpired).toBe(true);
      expect(evaluateFirestoreStandingDeadline({}, "blockExpiresAt").isPresent).toBe(false);
    });
  });
});
