import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  canOperateFormalReturn,
  canReopenFormalReturn,
  ROOT_ADMIN_EMAIL,
  ROOT_ADMIN_UID,
} from "./devolutionAuth";
import {
  evaluateListenerSession,
  getItemHistorySubscriptionMode,
  canSubscribeStaffItemCollections,
  canSubscribeUsersDirectory,
  canSubscribeStaffLogs,
  canSubscribeAdminOnlyLogs,
  getClaimsListenerScope,
  getNotificationsListenerScope,
} from "./listenerGuards";
import { evaluateExistingRemoteItem } from "./offlineSyncRecovery";
import { sanitizePublicHistoryEntry } from "../../server";
import { User } from "../types";

function readSrc(relPath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "uid-test-1",
    name: "Usuário Teste",
    email: "teste@ifpr.edu.br",
    role: "SERVIDOR",
    approvalStatus: "APROVADO",
    status: "active",
    courseOrDept: "SEBAC",
    registrationNumber: "12345",
    avatarUrl: "",
    reputationScore: 100,
    ...overrides,
  };
}

describe("ETAPA 5 — Unit Tests: devolutionAuth, Listeners RBAC (13 coleções) e syncOfflineQueue", () => {
  describe("1. devolutionAuth — Validação estrita de emailVerified, UID e Root Admin", () => {
    it("não aceita user.emailVerified do Firestore como substituto quando authInfo.emailVerified é false", () => {
      const user = makeUser({ id: "uid-serv-1", role: "SERVIDOR", approvalStatus: "APROVADO", emailVerified: true });
      const authInfo = { uid: "uid-serv-1", email: "serv@ifpr.edu.br", emailVerified: false };

      expect(canOperateFormalReturn(user, authInfo, false)).toBe(false);
    });

    it("exige authInfo.emailVerified === true também para o Root Admin (alinhado a isRootAdmin() nas rules)", () => {
      const rootUser = makeUser({
        id: ROOT_ADMIN_UID,
        email: ROOT_ADMIN_EMAIL,
        role: "ADMIN",
        approvalStatus: "APROVADO",
        emailVerified: true,
      });

      expect(
        canOperateFormalReturn(
          rootUser,
          { uid: ROOT_ADMIN_UID, email: ROOT_ADMIN_EMAIL, emailVerified: false },
          false
        )
      ).toBe(false);

      expect(
        canOperateFormalReturn(
          rootUser,
          { uid: ROOT_ADMIN_UID, email: ROOT_ADMIN_EMAIL, emailVerified: true },
          false
        )
      ).toBe(true);
    });

    it("bloqueia divergência entre user.id e authInfo.uid e não libera Root Admin apenas por e-mail sem UID correspondente", () => {
      const forgedRoot = makeUser({
        id: "uid-atacante",
        email: ROOT_ADMIN_EMAIL,
        role: "ALUNO",
        approvalStatus: "PENDENTE",
      });
      expect(
        canOperateFormalReturn(
          forgedRoot,
          { uid: "uid-atacante", email: ROOT_ADMIN_EMAIL, emailVerified: true },
          false
        )
      ).toBe(false);
      expect(
        canReopenFormalReturn(
          forgedRoot,
          { uid: "uid-atacante", email: ROOT_ADMIN_EMAIL, emailVerified: true },
          false
        )
      ).toBe(false);

      const validUserMismatch = makeUser({ id: "uid-A", role: "ADMIN", approvalStatus: "APROVADO" });
      expect(
        canOperateFormalReturn(
          validUserMismatch,
          { uid: "uid-B", email: "admin@ifpr.edu.br", emailVerified: true },
          false
        )
      ).toBe(false);
    });
  });

  describe("2. Listener Guards — Estabilização (authLoading), troca de sessão e reativação pós-aprovação", () => {
    it("bloqueia TODOS os listeners autenticados enquanto authLoading === true", () => {
      const input = {
        authLoading: true,
        firebaseUser: { uid: ROOT_ADMIN_UID, email: ROOT_ADMIN_EMAIL, emailVerified: true },
        currentUser: makeUser({ id: ROOT_ADMIN_UID, email: ROOT_ADMIN_EMAIL, role: "ADMIN", approvalStatus: "APROVADO" }),
      };

      expect(evaluateListenerSession(input).isSessionReady).toBe(false);
      expect(getItemHistorySubscriptionMode(input)).toBe("WAIT");
      expect(canSubscribeStaffItemCollections(input)).toBe(false);
      expect(canSubscribeUsersDirectory(input)).toBe(false);
      expect(canSubscribeStaffLogs(input)).toBe(false);
      expect(canSubscribeAdminOnlyLogs(input)).toBe(false);
      expect(getClaimsListenerScope(input)).toBe("NONE");
      expect(getNotificationsListenerScope(input)).toBe("NONE");
    });

    it("visitante e ALUNO não abrem listener direto de item_history/item_private/item_return_records/logs/users; ALUNO lê apenas claims/notifications SELF", () => {
      const visitorInput = { authLoading: false, firebaseUser: null, currentUser: makeUser({ id: "guest", role: "ALUNO" }) };
      expect(getItemHistorySubscriptionMode(visitorInput)).toBe("PUBLIC_API");
      expect(getClaimsListenerScope(visitorInput)).toBe("NONE");
      expect(getNotificationsListenerScope(visitorInput)).toBe("NONE");

      const alunoInput = {
        authLoading: false,
        firebaseUser: { uid: "uid-aluno-1", email: "a@estudantes.ifpr.edu.br", emailVerified: true },
        currentUser: makeUser({ id: "uid-aluno-1", email: "a@estudantes.ifpr.edu.br", role: "ALUNO", approvalStatus: "APROVADO" }),
      };
      expect(getItemHistorySubscriptionMode(alunoInput)).toBe("PUBLIC_API");
      expect(canSubscribeStaffItemCollections(alunoInput)).toBe(false);
      expect(canSubscribeUsersDirectory(alunoInput)).toBe(false);
      expect(canSubscribeStaffLogs(alunoInput)).toBe(false);
      expect(canSubscribeAdminOnlyLogs(alunoInput)).toBe(false);
      expect(getClaimsListenerScope(alunoInput)).toBe("SELF");
      expect(getNotificationsListenerScope(alunoInput)).toBe("SELF");
    });

    it("SERVIDOR PENDENTE ou não verificado não abre listeners de staff e cai para SELF em claims/notifications; reativa ao virar APROVADO + verificado", () => {
      const servPendente = {
        authLoading: false,
        firebaseUser: { uid: "uid-serv-1", email: "s@ifpr.edu.br", emailVerified: true },
        currentUser: makeUser({ id: "uid-serv-1", role: "SERVIDOR", approvalStatus: "PENDENTE", status: "active" }),
      };
      expect(getItemHistorySubscriptionMode(servPendente)).toBe("PUBLIC_API");
      expect(canSubscribeStaffItemCollections(servPendente)).toBe(false);
      expect(canSubscribeStaffLogs(servPendente)).toBe(false);
      expect(getClaimsListenerScope(servPendente)).toBe("SELF");
      expect(getNotificationsListenerScope(servPendente)).toBe("SELF");

      const servAprovado = {
        ...servPendente,
        currentUser: makeUser({ id: "uid-serv-1", role: "SERVIDOR", approvalStatus: "APROVADO", status: "active" }),
      };
      expect(getItemHistorySubscriptionMode(servAprovado)).toBe("FIRESTORE_STAFF");
      expect(canSubscribeStaffItemCollections(servAprovado)).toBe(true);
      expect(canSubscribeStaffLogs(servAprovado)).toBe(true);
      expect(canSubscribeUsersDirectory(servAprovado)).toBe(false);
      expect(canSubscribeAdminOnlyLogs(servAprovado)).toBe(false);
      expect(getClaimsListenerScope(servAprovado)).toBe("ALL");
      expect(getNotificationsListenerScope(servAprovado)).toBe("SELF");
    });

    it("Root Admin e ADMIN aprovado habilitam todos os listeners ao finalizar authLoading; INTRUSO e bloqueado/active=false são cortados", () => {
      const rootReady = {
        authLoading: false,
        firebaseUser: { uid: ROOT_ADMIN_UID, email: ROOT_ADMIN_EMAIL, emailVerified: true },
        currentUser: makeUser({ id: ROOT_ADMIN_UID, email: ROOT_ADMIN_EMAIL, role: "ADMIN", approvalStatus: "APROVADO" }),
      };
      expect(getItemHistorySubscriptionMode(rootReady)).toBe("FIRESTORE_STAFF");
      expect(canSubscribeStaffItemCollections(rootReady)).toBe(true);
      expect(canSubscribeUsersDirectory(rootReady)).toBe(true);
      expect(canSubscribeStaffLogs(rootReady)).toBe(true);
      expect(canSubscribeAdminOnlyLogs(rootReady)).toBe(true);
      expect(getClaimsListenerScope(rootReady)).toBe("ALL");
      expect(getNotificationsListenerScope(rootReady)).toBe("ALL");

      const adminActiveFalse = {
        authLoading: false,
        firebaseUser: { uid: "uid-adm-2", email: "adm@gmail.com", emailVerified: true },
        currentUser: makeUser({ id: "uid-adm-2", role: "ADMIN", approvalStatus: "APROVADO", status: "active", active: false } as any),
      };
      expect(canSubscribeUsersDirectory(adminActiveFalse)).toBe(false);
      expect(canSubscribeAdminOnlyLogs(adminActiveFalse)).toBe(false);
      expect(getClaimsListenerScope(adminActiveFalse)).toBe("NONE");

      const intrusoVerifiedActive = {
        authLoading: false,
        firebaseUser: { uid: "uid-intruso", email: "intruso@gmail.com", emailVerified: true },
        currentUser: makeUser({ id: "uid-intruso", role: "INTRUSO", approvalStatus: "APROVADO", status: "active" }),
      };
      expect(getItemHistorySubscriptionMode(intrusoVerifiedActive)).toBe("PUBLIC_API");
      expect(canSubscribeStaffItemCollections(intrusoVerifiedActive)).toBe(false);
      expect(canSubscribeUsersDirectory(intrusoVerifiedActive)).toBe(false);
      expect(canSubscribeStaffLogs(intrusoVerifiedActive)).toBe(false);
      expect(canSubscribeAdminOnlyLogs(intrusoVerifiedActive)).toBe(false);
      expect(getClaimsListenerScope(intrusoVerifiedActive)).toBe("SELF");
      expect(getNotificationsListenerScope(intrusoVerifiedActive)).toBe("SELF");

      const intrusoUnverified = {
        authLoading: false,
        firebaseUser: { uid: "uid-intruso-unv", email: "unv@gmail.com", emailVerified: false },
        currentUser: makeUser({ id: "uid-intruso-unv", role: "INTRUSO", approvalStatus: "PENDENTE", status: "active" }),
      };
      expect(getClaimsListenerScope(intrusoUnverified)).toBe("NONE");

      const intrusoBlocked = {
        authLoading: false,
        firebaseUser: { uid: "uid-intruso-blk", email: "blk@gmail.com", emailVerified: true },
        currentUser: makeUser({ id: "uid-intruso-blk", role: "INTRUSO", approvalStatus: "APROVADO", status: "banned" }),
      };
      expect(getClaimsListenerScope(intrusoBlocked)).toBe("NONE");
    });

    it("AppContext.tsx usa listenerGuards nos 13 listeners, dependências completas e rota /api/items/public-history sem PII", () => {
      const ctxSrc = readSrc("src/context/AppContext.tsx");
      expect(ctxSrc).toContain("canSubscribeStaffLogs({ authLoading, firebaseUser, currentUser })");
      expect(ctxSrc).toContain("canSubscribeAdminOnlyLogs({ authLoading, firebaseUser, currentUser })");
      expect(ctxSrc).toContain("canSubscribeUsersDirectory({ authLoading, firebaseUser, currentUser })");
      expect(ctxSrc).toContain("getItemHistorySubscriptionMode({ authLoading, firebaseUser, currentUser })");
      expect(ctxSrc).toContain("canSubscribeStaffItemCollections({ authLoading, firebaseUser, currentUser })");
      expect(ctxSrc).toContain("getClaimsListenerScope({ authLoading, firebaseUser, currentUser })");
      expect(ctxSrc).toContain("getNotificationsListenerScope({ authLoading, firebaseUser, currentUser })");
      expect(ctxSrc).toContain('fetchAllPaginatedPublicRecords<ItemHistoryLog>("/api/items/public-history", "entries")');
      expect(ctxSrc).toContain("fetchAllPaginatedPublicRecords<LostFoundItem>(");
      expect(ctxSrc).toContain('"/api/items/public-catalog"');

      const sanitizedHistory = sanitizePublicHistoryEntry({
        id: "hist-1",
        objectId: "item-1",
        action: "DEVOLUCAO",
        recipientName: "João da Silva",
        recipientDocument: "123.456.789-00",
        receiptValidationCode: "SEC-999",
        details: "Devolvido para João da Silva CPF 123.456.789-00",
        timestamp: "2026-11-17T10:00:00.000Z",
      });
      expect(sanitizedHistory).toBeTruthy();
      expect((sanitizedHistory as any).recipientName).toBeUndefined();
      expect((sanitizedHistory as any).recipientDocument).toBeUndefined();
      expect((sanitizedHistory as any).receiptValidationCode).toBeUndefined();
      expect(sanitizedHistory?.details).not.toContain("João da Silva");
    });

    it("AppContext.tsx inicializa estados administrativos neutros, limpa caches em logout/troca de conta e bloqueia bypass de Root/Admin", () => {
      const ctxSrc = readSrc("src/context/AppContext.tsx");

      // Fix 1: addItem usa isVerifiedRootAdminAuthUser e exige emailVerified antes de verificar Root Admin
      expect(ctxSrc).toContain("const isRootAdmin = isVerifiedRootAdminAuthUser(authUser);");
      expect(ctxSrc).not.toContain("if (!authUser.emailVerified && !isRootAdmin)");

      // Fix 4: syncOfflineQueue usa evaluateOfflineSyncOwnership e não possui bypass isApprovedAdminSync
      expect(ctxSrc).toContain("evaluateOfflineSyncOwnership(");
      expect(ctxSrc).not.toContain("isApprovedAdminSync");

      // Fix 5: sem seed fictícia de backup e com limpeza explícita de caches administrativos sem localStorage.clear()
      expect(ctxSrc).not.toContain("backup-init-1");
      expect(ctxSrc).not.toContain("Carlos Eduardo Machado");
      expect(ctxSrc).toContain("clearAdminAndPrivateSessionState");
      expect(ctxSrc).toContain('localStorage.removeItem("ifpr_generated_documents_cache")');
      expect(ctxSrc).toContain('localStorage.removeItem("ifpr_document_templates_cache")');
      expect(ctxSrc).toContain('localStorage.removeItem("ifpr_project_settings_cache")');
      expect(ctxSrc).toContain("localStorage.removeItem(LOCAL_STORAGE_ALL_USERS_KEY)");
      expect(ctxSrc).not.toContain("localStorage.clear()");
    });
  });

  describe("3. offlineSyncRecovery — Reconciliação segura de item inexistente, equivalente já salvo e conflito", () => {
    const baseLocalPayload = {
      id: "ifpr-TEST-001",
      title: "Garrafa Azul",
      description: "Garrafa térmica de inox",
      category: "Outros",
      type: "ENCONTRADO",
      status: "ENCONTRADO",
      location: "Biblioteca",
      date: "2026-11-10",
      registeredByUserId: "uid-serv-1",
      registeredByRole: "SERVIDOR",
    };

    it("retorna CREATE_NEW quando documento não existe no servidor", () => {
      const evalRes = evaluateExistingRemoteItem(baseLocalPayload, null);
      expect(evalRes.action).toBe("CREATE_NEW");
    });

    it("retorna CONFIRM_ALREADY_SYNCED quando documento existe no servidor com mesmos dados centrais (mesmo se status já avançou)", () => {
      const remoteSame = {
        ...baseLocalPayload,
        status: "DEVOLVIDO",
      };
      const evalRes = evaluateExistingRemoteItem(baseLocalPayload, remoteSame);
      expect(evalRes.action).toBe("CONFIRM_ALREADY_SYNCED");
      expect(evalRes.statusProgressed).toBe(true);
      expect(evalRes.conflictingFields).toEqual([]);
    });

    it("retorna CONFLICT_STOP quando documento remoto diverge em autor ou conteúdo, bloqueando sobrescrita", () => {
      const remoteDivergent = {
        ...baseLocalPayload,
        title: "Outro Objeto Totalmente Diferente",
        registeredByUserId: "uid-outro-servidor",
      };
      const evalRes = evaluateExistingRemoteItem(baseLocalPayload, remoteDivergent);
      expect(evalRes.action).toBe("CONFLICT_STOP");
      expect(evalRes.conflictingFields).toContain("registeredByUserId");
      expect(evalRes.conflictingFields).toContain("title");
    });

    it("AppContext syncOfflineQueue executa getDoc antes de writeBatch e interrompe retry em conflito sem apagar fila", () => {
      const ctxSrc = readSrc("src/context/AppContext.tsx");
      const fnIdx = ctxSrc.indexOf("const syncOfflineQueue = async");
      expect(fnIdx).toBeGreaterThan(-1);
      const fnBody = ctxSrc.slice(fnIdx, fnIdx + 22000);

      const getDocPos = fnBody.indexOf("const existingRemoteSnap = await getDocFromServer(itemRef)");
      const evalPos = fnBody.indexOf("evaluateExistingRemoteItem(");
      const conflictPos = fnBody.indexOf('remoteEvaluation.action === "CONFLICT_STOP"');
      const batchCreatePos = fnBody.indexOf("syncBatch.set(itemRef,");

      expect(getDocPos).toBeGreaterThan(-1);
      expect(evalPos).toBeGreaterThan(getDocPos);
      expect(conflictPos).toBeGreaterThan(evalPos);
      expect(batchCreatePos).toBeGreaterThan(conflictPos);
      expect(fnBody).toContain("SYNC_CONFLICT_EXISTING_ITEM");
    });
  });
});
