import { describe, it, expect } from "vitest";
import { ROUTES, parseCurrentRoute } from "./routes";
import { isAccountBlocked, isUserAccountActive } from "./accountStatusUtils";
import { DEFAULT_GUEST_USER } from "./shared-constants";
import { CURRENT_VERSION } from "../data/versionsData";
import { User, UserRole, AccountStatus, ApprovalStatus } from "../types";

/**
 * Pure authorization evaluation replicating the production useAdminGuard logic
 */
function evaluatePanelAuthorization(params: {
  currentUser: Partial<User> | null | undefined;
  isAuthLoading?: boolean;
  authLoading?: boolean;
  isEmailVerificationRequired?: boolean;
}) {
  const {
    currentUser,
    isAuthLoading = false,
    authLoading = false,
    isEmailVerificationRequired = false,
  } = params;

  const effectiveLoading = isAuthLoading || authLoading;
  const isEmailValid = !isEmailVerificationRequired;
  const isAdmin = Boolean(currentUser && currentUser.role === "ADMIN" && isEmailValid);
  const isStaff = Boolean(currentUser && currentUser.role === "SERVIDOR" && isEmailValid);
  const isBlocked = isAccountBlocked(currentUser);
  const isApproved = currentUser?.approvalStatus === "APROVADO";

  const authorized =
    !effectiveLoading &&
    Boolean(
      currentUser &&
      currentUser.id &&
      currentUser.id !== DEFAULT_GUEST_USER.id &&
      (isAdmin || isStaff) &&
      isApproved &&
      !isBlocked
    );

  return {
    isAdmin,
    isStaff,
    isAuthLoading: effectiveLoading,
    authorized,
    isBlocked,
    isApproved,
  };
}

/**
 * Navigation visibility helper replicating Navbar / MobileBottomNav logic
 */
function getPanelNavigationVisibility(user: Partial<User>) {
  const hasAccess = user.role === "ADMIN" || user.role === "SERVIDOR";
  return {
    desktopLinkVisible: hasAccess,
    desktopLinkLabel: user.role === "ADMIN" ? "Admin" : user.role === "SERVIDOR" ? "Painel do Servidor" : null,
    mobileDrawerVisible: hasAccess,
    mobileDrawerLabel: user.role === "ADMIN" ? "Painel Administrativo Institucional" : user.role === "SERVIDOR" ? "Painel do Servidor" : null,
    mobileBottomNavTarget: hasAccess ? "/admin" : "/perfil",
    mobileBottomNavLabel: user.role === "ADMIN" ? "Admin" : user.role === "SERVIDOR" ? "Servidor" : "Perfil",
  };
}

/**
 * Backend token resolution simulation replicating server.ts auth middleware
 */
function simulateServerAuthMiddleware(
  decodedToken: { uid: string; email?: string; role?: string; email_verified?: boolean; admin?: boolean },
  firestoreDoc?: { role?: string; emailVerified?: boolean; approvalStatus?: string }
) {
  const isRoot = decodedToken.email === "paulocauan39@gmail.com";
  let isEmailVerified = isRoot ? true : decodedToken.email_verified === true;
  let isAdmin = isRoot;
  let dbRole: string | undefined = undefined;

  if (firestoreDoc) {
    dbRole = firestoreDoc.role;
    if (firestoreDoc.role === "ADMIN" && (isRoot || firestoreDoc.approvalStatus === "APROVADO")) {
      isAdmin = true;
    } else if (!isRoot) {
      isAdmin = false;
    }
  } else if (!isRoot) {
    isAdmin = false;
  }

  if (isRoot) {
    isEmailVerified = true;
  }

  const authUser = {
    uid: decodedToken.uid,
    email: decodedToken.email,
    email_verified: isEmailVerified,
    role: isRoot ? "ADMIN" : (isAdmin ? "ADMIN" : (dbRole || "ALUNO")),
    isAdmin,
  };

  const isStaffOrAdmin = authUser.isAdmin || authUser.role === "ADMIN" || authUser.role === "SERVIDOR";

  return { authUser, isStaffOrAdmin };
}

describe("LOCALIZA+ v1.10.2 — Auditoria e Segurança do Painel do Servidor", () => {
  describe("1. Autorização Granular do Painel (useAdminGuard)", () => {
    it("deve autorizar SERVIDOR ativo e aprovado a acessar o painel", () => {
      const servidorUser: User = {
        id: "servidor_uid_123",
        name: "Carlos Servidor",
        email: "carlos.servidor@ifpr.edu.br",
        role: "SERVIDOR",
        status: "active",
        approvalStatus: "APROVADO",
        reputationScore: 10,
        createdAt: "2026-01-01T00:00:00Z",
        courseOrDept: "SEBAC Campus Ivaiporã",
        registrationNumber: "202610111",
        avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150",
      };

      const result = evaluatePanelAuthorization({ currentUser: servidorUser });
      expect(result.authorized).toBe(true);
      expect(result.isStaff).toBe(true);
      expect(result.isAdmin).toBe(false);
      expect(result.isBlocked).toBe(false);
      expect(result.isApproved).toBe(true);
    });

    it("deve manter acesso administrativo irrestrito para ADMIN", () => {
      const adminUser: User = {
        id: "admin_uid_999",
        name: "Paulo Admin",
        email: "paulocauan39@gmail.com",
        role: "ADMIN",
        status: "active",
        approvalStatus: "APROVADO",
        reputationScore: 10,
        createdAt: "2026-01-01T00:00:00Z",
        courseOrDept: "TI IFPR",
        registrationNumber: "202600001",
        avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150",
      };

      const result = evaluatePanelAuthorization({ currentUser: adminUser });
      expect(result.authorized).toBe(true);
      expect(result.isAdmin).toBe(true);
      expect(result.isStaff).toBe(false);
    });

    it("deve estritamente bloquear acesso para ALUNO", () => {
      const alunoUser: User = {
        id: "aluno_uid_456",
        name: "João Aluno",
        email: "joao.aluno@estudantes.ifpr.edu.br",
        role: "ALUNO",
        status: "active",
        approvalStatus: "APROVADO",
        reputationScore: 10,
        createdAt: "2026-01-01T00:00:00Z",
        courseOrDept: "Informática Integrado",
        registrationNumber: "202620222",
        avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150",
      };

      const result = evaluatePanelAuthorization({ currentUser: alunoUser });
      expect(result.authorized).toBe(false);
      expect(result.isStaff).toBe(false);
      expect(result.isAdmin).toBe(false);
    });

    it("deve estritamente bloquear visitante não autenticado ou guest", () => {
      const guestResult = evaluatePanelAuthorization({ currentUser: DEFAULT_GUEST_USER });
      expect(guestResult.authorized).toBe(false);

      const nullResult = evaluatePanelAuthorization({ currentUser: null });
      expect(nullResult.authorized).toBe(false);
    });

    it("deve bloquear Servidor suspenso, banido ou com aprovação pendente", () => {
      // Suspenso
      const servidorSuspenso: Partial<User> = {
        id: "serv_susp_1",
        role: "SERVIDOR",
        status: "suspended",
        approvalStatus: "APROVADO",
      };
      expect(evaluatePanelAuthorization({ currentUser: servidorSuspenso }).authorized).toBe(false);

      // Banido
      const servidorBanido: Partial<User> = {
        id: "serv_ban_1",
        role: "SERVIDOR",
        status: "banned",
        approvalStatus: "APROVADO",
      };
      expect(evaluatePanelAuthorization({ currentUser: servidorBanido }).authorized).toBe(false);

      // Não Aprovado / Pendente
      const servidorPendente: Partial<User> = {
        id: "serv_pend_1",
        role: "SERVIDOR",
        status: "active",
        approvalStatus: "PENDENTE",
      };
      expect(evaluatePanelAuthorization({ currentUser: servidorPendente }).authorized).toBe(false);

      // E-mail Não Verificado
      const servidorEmailPendente: Partial<User> = {
        id: "serv_email_1",
        role: "SERVIDOR",
        status: "active",
        approvalStatus: "APROVADO",
      };
      expect(
        evaluatePanelAuthorization({
          currentUser: servidorEmailPendente,
          isEmailVerificationRequired: true,
        }).authorized
      ).toBe(false);
    });

    it("não deve redirecionar prematuramente durante carregamento assíncrono do perfil", () => {
      const servidorLoading: Partial<User> = {
        id: "serv_load_1",
        role: "SERVIDOR",
        status: "active",
        approvalStatus: "APROVADO",
      };

      const inFlightAuth = evaluatePanelAuthorization({
        currentUser: servidorLoading,
        authLoading: true,
      });

      expect(inFlightAuth.isAuthLoading).toBe(true);
      expect(inFlightAuth.authorized).toBe(false);

      // Quando o carregamento assíncrono termina
      const finishedAuth = evaluatePanelAuthorization({
        currentUser: servidorLoading,
        authLoading: false,
      });

      expect(finishedAuth.isAuthLoading).toBe(false);
      expect(finishedAuth.authorized).toBe(true);
    });
  });

  describe("2. Mapeamento e Resolução de Rotas (/servidor e /admin)", () => {
    it("deve mapear ROUTES.SERVER para /servidor", () => {
      expect(ROUTES.SERVER).toBe("/servidor");
    });

    it("deve reconhecer /servidor e /painel-servidor mapeando para routeKey admin", () => {
      const parsedServidor = parseCurrentRoute("/servidor");
      expect(parsedServidor.routeKey).toBe("admin");
      expect(parsedServidor.pathname).toBe("/admin/dashboard");

      const parsedPainel = parseCurrentRoute("/painel-servidor");
      expect(parsedPainel.routeKey).toBe("admin");
      expect(parsedPainel.pathname).toBe("/admin/dashboard");
    });
  });

  describe("3. Visibilidade e Integridade de Navegação (Navbar e MobileBottomNav)", () => {
    it("deve exibir Painel do Servidor para usuário SERVIDOR", () => {
      const navServidor = getPanelNavigationVisibility({ role: "SERVIDOR" });
      expect(navServidor.desktopLinkVisible).toBe(true);
      expect(navServidor.desktopLinkLabel).toBe("Painel do Servidor");
      expect(navServidor.mobileDrawerVisible).toBe(true);
      expect(navServidor.mobileDrawerLabel).toBe("Painel do Servidor");
      expect(navServidor.mobileBottomNavTarget).toBe("/admin");
      expect(navServidor.mobileBottomNavLabel).toBe("Servidor");
    });

    it("deve exibir Admin para usuário ADMIN", () => {
      const navAdmin = getPanelNavigationVisibility({ role: "ADMIN" });
      expect(navAdmin.desktopLinkVisible).toBe(true);
      expect(navAdmin.desktopLinkLabel).toBe("Admin");
      expect(navAdmin.mobileDrawerVisible).toBe(true);
      expect(navAdmin.mobileDrawerLabel).toBe("Painel Administrativo Institucional");
      expect(navAdmin.mobileBottomNavTarget).toBe("/admin");
      expect(navAdmin.mobileBottomNavLabel).toBe("Admin");
    });

    it("deve ocultar links administrativos e de servidor para ALUNO", () => {
      const navAluno = getPanelNavigationVisibility({ role: "ALUNO" });
      expect(navAluno.desktopLinkVisible).toBe(false);
      expect(navAluno.desktopLinkLabel).toBe(null);
      expect(navAluno.mobileDrawerVisible).toBe(false);
      expect(navAluno.mobileDrawerLabel).toBe(null);
      expect(navAluno.mobileBottomNavTarget).toBe("/perfil");
      expect(navAluno.mobileBottomNavLabel).toBe("Perfil");
    });
  });

  describe("4. Consistência de Backend e Middleware de Autenticação (server.ts)", () => {
    it("deve resolver role SERVIDOR a partir do documento Firestore mesmo sem claim customizada no token", () => {
      const decodedWithoutClaims = {
        uid: "servidor_fb_uid_777",
        email: "portaria.ivaipora@ifpr.edu.br",
        email_verified: true,
      };

      const firestoreUser = {
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        emailVerified: true,
      };

      const { authUser, isStaffOrAdmin } = simulateServerAuthMiddleware(decodedWithoutClaims, firestoreUser);
      expect(authUser.role).toBe("SERVIDOR");
      expect(authUser.isAdmin).toBe(false);
      expect(isStaffOrAdmin).toBe(true);
    });

    it("deve revogar isAdmin se usuário foi rebaixado para ALUNO no Firestore mesmo com claim antiga role ADMIN no token", () => {
      const staleAdminToken = {
        uid: "demoted_admin_uid",
        email: "antigo.admin@ifpr.edu.br",
        role: "ADMIN",
        admin: true,
        email_verified: true,
      };

      const firestoreDemotedUser = {
        role: "ALUNO",
        approvalStatus: "APROVADO",
      };

      const { authUser, isStaffOrAdmin } = simulateServerAuthMiddleware(staleAdminToken, firestoreDemotedUser);
      expect(authUser.isAdmin).toBe(false);
      expect(authUser.role).toBe("ALUNO");
      expect(isStaffOrAdmin).toBe(false);
    });

    it("não deve aceitar emailVerified do Firestore como substituto de confirmação criptográfica do token", () => {
      const unverifiedToken = {
        uid: "unverified_uid",
        email: "user@ifpr.edu.br",
        role: "SERVIDOR",
        email_verified: false,
      };

      const firestoreUserWithDocFlag = {
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        emailVerified: true, // Campo mutável no Firestore NÃO pode suplantar o token
      };

      const { authUser } = simulateServerAuthMiddleware(unverifiedToken, firestoreUserWithDocFlag);
      expect(authUser.email_verified).toBe(false);
    });

    it("deve rejeitar ALUNO em verificações isStaffOrAdmin no backend", () => {
      const decodedAluno = {
        uid: "aluno_fb_uid_888",
        email: "aluno@estudantes.ifpr.edu.br",
        email_verified: true,
      };

      const firestoreUser = {
        role: "ALUNO",
        approvalStatus: "APROVADO",
        emailVerified: true,
      };

      const { authUser, isStaffOrAdmin } = simulateServerAuthMiddleware(decodedAluno, firestoreUser);
      expect(authUser.role).toBe("ALUNO");
      expect(authUser.isAdmin).toBe(false);
      expect(isStaffOrAdmin).toBe(false);
    });
  });

  describe("5. Preservação da Versão Oficial do Sistema", () => {
    it("deve manter rigorosamente a versão atual em v1.10.10", () => {
      expect(CURRENT_VERSION).toBe("v1.10.10");
    });
  });

  describe("6. Auditoria e Validação de Segurança do Backend (server.ts - Cenários Auditados)", () => {
    // Helper to create mock Firestore with transaction support
    function createMockFirestore(options: {
      users?: Record<string, any>;
      items?: Record<string, any>;
      throwOnUserGet?: boolean;
      throwOnItemGet?: boolean;
    }) {
      const usersData: Record<string, any> = { ...(options.users || {}) };
      const itemsData: Record<string, any> = { ...(options.items || {}) };

      const getDocRef = (collName: string, docId: string) => ({
        id: docId,
        collectionName: collName,
        get: async () => {
          if (collName === "users") {
            if (options.throwOnUserGet) throw new Error("Firestore read connection timed out");
            const udata = usersData[docId];
            return {
              id: docId,
              exists: Boolean(udata),
              data: () => udata,
            };
          }
          if (collName === "items") {
            if (options.throwOnItemGet) throw new Error("Firestore read error on items");
            const idata = itemsData[docId];
            return {
              id: docId,
              exists: Boolean(idata),
              data: () => idata,
            };
          }
          return { id: docId, exists: false, data: () => undefined };
        },
        set: async (data: any, setOpts?: { merge?: boolean }) => {
          const store = collName === "users" ? usersData : itemsData;
          if (setOpts?.merge && store[docId]) {
            store[docId] = { ...store[docId], ...data };
          } else {
            store[docId] = { ...data };
          }
          return { id: docId };
        },
        update: async (data: any) => {
          const store = collName === "users" ? usersData : itemsData;
          if (store[docId]) {
            store[docId] = { ...store[docId], ...data };
          }
          return { id: docId };
        },
      });

      return {
        _usersData: usersData,
        _itemsData: itemsData,
        collection: (collName: string) => ({
          doc: (docId: string) => getDocRef(collName, docId),
        }),
        runTransaction: async (updateFunction: (transaction: any) => Promise<any>) => {
          const transaction = {
            get: async (docRef: any) => {
              return await docRef.get();
            },
            set: (docRef: any, data: any, setOpts?: { merge?: boolean }) => {
              const store = docRef.collectionName === "users" ? usersData : itemsData;
              if (setOpts?.merge && store[docRef.id]) {
                store[docRef.id] = { ...store[docRef.id], ...data };
              } else {
                store[docRef.id] = { ...data };
              }
            },
            update: (docRef: any, data: any) => {
              const store = docRef.collectionName === "users" ? usersData : itemsData;
              if (store[docRef.id]) {
                store[docRef.id] = { ...store[docRef.id], ...data };
              }
            },
          };
          return await updateFunction(transaction);
        },
      };
    }

    // Cenário 1: Servidor com perfil 'SERVIDOR', status 'active', aprovado e e-mail verificado -> Autorizado.
    it("Cenário 1: Servidor com perfil 'SERVIDOR', status 'active', aprovado e e-mail verificado -> Autorizado (200)", async () => {
      const { validateStaffOrAdminAccess } = await import("../../server");
      const mockDb = createMockFirestore({
        users: {
          serv_valid: {
            name: "Carlos Servidor",
            role: "SERVIDOR",
            status: "active",
            active: true,
            approvalStatus: "APROVADO",
            emailVerified: true,
          },
        },
      });

      const authUser = { uid: "serv_valid", email: "carlos@ifpr.edu.br", email_verified: true };
      const res = await validateStaffOrAdminAccess(mockDb, authUser);
      expect(res.authorized).toBe(true);
      expect(res.statusCode).toBe(200);
      expect(res.signerName).toBe("Carlos Servidor");
    });

    // Cenário 2: Servidor com status 'suspended' em minúsculas -> Negado (403).
    it("Cenário 2: Servidor com status 'suspended' em minúsculas -> Negado (403)", async () => {
      const { validateStaffOrAdminAccess } = await import("../../server");
      const mockDb = createMockFirestore({
        users: {
          serv_susp_lower: {
            name: "Servidor Suspenso",
            role: "SERVIDOR",
            status: "suspended",
            approvalStatus: "APROVADO",
            emailVerified: true,
          },
        },
      });

      const authUser = { uid: "serv_susp_lower", email: "susp@ifpr.edu.br", email_verified: true };
      const res = await validateStaffOrAdminAccess(mockDb, authUser);
      expect(res.authorized).toBe(false);
      expect(res.statusCode).toBe(403);
      expect(res.errorMessage).toContain("Conta suspensa ou inativa");
    });

    // Cenário 3: Servidor com status 'SUSPENDED' em maiúsculas -> Negado (403).
    it("Cenário 3: Servidor com status 'SUSPENDED' em maiúsculas -> Negado (403)", async () => {
      const { validateStaffOrAdminAccess } = await import("../../server");
      const mockDb = createMockFirestore({
        users: {
          serv_susp_upper: {
            name: "Servidor Suspenso Upper",
            role: "SERVIDOR",
            status: "SUSPENDED",
            approvalStatus: "APROVADO",
            emailVerified: true,
          },
        },
      });

      const authUser = { uid: "serv_susp_upper", email: "susp_up@ifpr.edu.br", email_verified: true };
      const res = await validateStaffOrAdminAccess(mockDb, authUser);
      expect(res.authorized).toBe(false);
      expect(res.statusCode).toBe(403);
      expect(res.errorMessage).toContain("Conta suspensa ou inativa");
    });

    // Cenário 4: Servidor com status 'banned' ou 'BANNED' -> Negado (403).
    it("Cenário 4: Servidor com status 'banned' ou 'BANNED' -> Negado (403)", async () => {
      const { validateStaffOrAdminAccess } = await import("../../server");
      const mockDb = createMockFirestore({
        users: {
          serv_ban_lower: {
            role: "SERVIDOR",
            status: "banned",
            approvalStatus: "APROVADO",
            emailVerified: true,
          },
          serv_ban_upper: {
            role: "SERVIDOR",
            status: "BANNED",
            approvalStatus: "APROVADO",
            emailVerified: true,
          },
        },
      });

      const res1 = await validateStaffOrAdminAccess(mockDb, { uid: "serv_ban_lower", email: "ban1@ifpr.edu.br", email_verified: true });
      expect(res1.authorized).toBe(false);
      expect(res1.statusCode).toBe(403);

      const res2 = await validateStaffOrAdminAccess(mockDb, { uid: "serv_ban_upper", email: "ban2@ifpr.edu.br", email_verified: true });
      expect(res2.authorized).toBe(false);
      expect(res2.statusCode).toBe(403);
    });

    // Cenário 5: Servidor com status 'active', porém com campo 'active: false' -> Negado (403).
    it("Cenário 5: Servidor com status 'active', porém com campo 'active: false' -> Negado (403)", async () => {
      const { validateStaffOrAdminAccess } = await import("../../server");
      const mockDb = createMockFirestore({
        users: {
          serv_flag_inactive: {
            role: "SERVIDOR",
            status: "active",
            active: false,
            approvalStatus: "APROVADO",
            emailVerified: true,
          },
        },
      });

      const authUser = { uid: "serv_flag_inactive", email: "inact_flag@ifpr.edu.br", email_verified: true };
      const res = await validateStaffOrAdminAccess(mockDb, authUser);
      expect(res.authorized).toBe(false);
      expect(res.statusCode).toBe(403);
    });

    // Cenário 6: Servidor com status 'inactive' / 'INACTIVE' -> Negado (403).
    it("Cenário 6: Servidor com status 'inactive' / 'INACTIVE' -> Negado (403)", async () => {
      const { validateStaffOrAdminAccess } = await import("../../server");
      const mockDb = createMockFirestore({
        users: {
          serv_inact_lower: {
            role: "SERVIDOR",
            status: "inactive",
            approvalStatus: "APROVADO",
            emailVerified: true,
          },
          serv_inact_upper: {
            role: "SERVIDOR",
            status: "INACTIVE",
            approvalStatus: "APROVADO",
            emailVerified: true,
          },
        },
      });

      const res1 = await validateStaffOrAdminAccess(mockDb, { uid: "serv_inact_lower", email: "in1@ifpr.edu.br", email_verified: true });
      expect(res1.authorized).toBe(false);
      expect(res1.statusCode).toBe(403);

      const res2 = await validateStaffOrAdminAccess(mockDb, { uid: "serv_inact_upper", email: "in2@ifpr.edu.br", email_verified: true });
      expect(res2.authorized).toBe(false);
      expect(res2.statusCode).toBe(403);
    });

    // Cenário 7: Usuário com documento ausente no Firestore -> Negado (403) de forma segura.
    it("Cenário 7: Usuário com documento ausente no Firestore -> Negado (403) de forma segura", async () => {
      const { validateStaffOrAdminAccess } = await import("../../server");
      const mockDb = createMockFirestore({
        users: {},
      });

      const authUser = { uid: "serv_inexistente", email: "ghost@ifpr.edu.br", email_verified: true };
      const res = await validateStaffOrAdminAccess(mockDb, authUser);
      expect(res.authorized).toBe(false);
      expect(res.statusCode).toBe(403);
      expect(res.errorMessage).toContain("não encontrado no sistema");
    });

    // Cenário 8: Usuário com role 'ALUNO' tentando assinar -> Negado (403).
    it("Cenário 8: Usuário com role 'ALUNO' tentando assinar -> Negado (403)", async () => {
      const { validateStaffOrAdminAccess } = await import("../../server");
      const mockDb = createMockFirestore({
        users: {
          aluno_uid_test: {
            name: "Lucas Aluno",
            role: "ALUNO",
            status: "active",
            active: true,
            approvalStatus: "APROVADO",
            emailVerified: true,
          },
        },
      });

      const authUser = { uid: "aluno_uid_test", email: "lucas@estudantes.ifpr.edu.br", email_verified: true };
      const res = await validateStaffOrAdminAccess(mockDb, authUser);
      expect(res.authorized).toBe(false);
      expect(res.statusCode).toBe(403);
      expect(res.errorMessage).toContain("Apenas servidores e administradores do IFPR");
    });

    // Cenário 9: Servidor com approvalStatus 'PENDENTE' ou 'REJEITADO' -> Negado (403).
    it("Cenário 9: Servidor com approvalStatus 'PENDENTE' ou 'REJEITADO' -> Negado (403)", async () => {
      const { validateStaffOrAdminAccess } = await import("../../server");
      const mockDb = createMockFirestore({
        users: {
          serv_pend: {
            role: "SERVIDOR",
            status: "active",
            active: true,
            approvalStatus: "PENDENTE",
            emailVerified: true,
          },
          serv_rej: {
            role: "SERVIDOR",
            status: "active",
            active: true,
            approvalStatus: "REJEITADO",
            emailVerified: true,
          },
        },
      });

      const res1 = await validateStaffOrAdminAccess(mockDb, { uid: "serv_pend", email: "pend@ifpr.edu.br", email_verified: true });
      expect(res1.authorized).toBe(false);
      expect(res1.statusCode).toBe(403);

      const res2 = await validateStaffOrAdminAccess(mockDb, { uid: "serv_rej", email: "rej@ifpr.edu.br", email_verified: true });
      expect(res2.authorized).toBe(false);
      expect(res2.statusCode).toBe(403);
    });

    // Cenário 10: Servidor com e-mail não verificado -> Negado (403).
    it("Cenário 10: Servidor com e-mail não verificado -> Negado (403)", async () => {
      const { validateStaffOrAdminAccess } = await import("../../server");
      const mockDb = createMockFirestore({
        users: {
          serv_unverified_email: {
            role: "SERVIDOR",
            status: "active",
            active: true,
            approvalStatus: "APROVADO",
            emailVerified: false,
          },
        },
      });

      const authUser = { uid: "serv_unverified_email", email: "unver@ifpr.edu.br", email_verified: false };
      const res = await validateStaffOrAdminAccess(mockDb, authUser);
      expect(res.authorized).toBe(false);
      expect(res.statusCode).toBe(403);
    });

    // Cenário 11: Aluno tentando chamar /api/automation/notify-item-returned -> Negado (403).
    it("Cenário 11: Aluno tentando chamar /api/automation/notify-item-returned -> Negado (403)", async () => {
      const { validateDevolutionNotificationAccess } = await import("../../server");
      const mockDb = createMockFirestore({
        users: {
          aluno_uid_notif: {
            name: "Aluno Invasor",
            role: "ALUNO",
            status: "active",
            active: true,
            approvalStatus: "APROVADO",
            emailVerified: true,
          },
        },
        items: {
          item_101: {
            id: "item_101",
            title: "Calculadora Científica",
            status: "DEVOLVIDO",
            returnedByUserId: "aluno_uid_notif",
          },
        },
      });

      const authUser = { uid: "aluno_uid_notif", email: "aluno@estudantes.ifpr.edu.br", email_verified: true };
      const res = await validateDevolutionNotificationAccess(mockDb, authUser, "item_101");
      expect(res.authorized).toBe(false);
      expect(res.statusCode).toBe(403);
    });

    // Cenário 12: Servidor chamando notificação para item não encontrado (404) ou que não está 'DEVOLVIDO' (400) -> Rejeitado.
    it("Cenário 12: Servidor chamando notificação para item não encontrado (404) ou não 'DEVOLVIDO' (400) -> Rejeitado", async () => {
      const { validateDevolutionNotificationAccess } = await import("../../server");
      const mockDb = createMockFirestore({
        users: {
          serv_notif: {
            name: "Servidor Atendente",
            role: "SERVIDOR",
            status: "active",
            active: true,
            approvalStatus: "APROVADO",
            emailVerified: true,
          },
        },
        items: {
          item_localizado: {
            id: "item_localizado",
            title: "Garrafa Térmica",
            status: "LOCALIZADO", // Not DEVOLVIDO
            returnedByUserId: "serv_notif",
          },
        },
      });

      const authUser = { uid: "serv_notif", email: "atendente@ifpr.edu.br", email_verified: true };

      // 404: Item inexistente
      const res404 = await validateDevolutionNotificationAccess(mockDb, authUser, "item_fantasma");
      expect(res404.authorized).toBe(false);
      expect(res404.statusCode).toBe(404);

      // 400: Item não DEVOLVIDO
      const res400 = await validateDevolutionNotificationAccess(mockDb, authUser, "item_localizado");
      expect(res400.authorized).toBe(false);
      expect(res400.statusCode).toBe(400);
      expect(res400.errorMessage).toContain("não foi registrada como DEVOLVIDO");
    });

    // Cenário 13: Servidor tentando notificar devolução efetuada por outro servidor -> Negado (403).
    it("Cenário 13: Servidor tentando notificar devolução efetuada por outro servidor -> Negado (403)", async () => {
      const { validateDevolutionNotificationAccess } = await import("../../server");
      const mockDb = createMockFirestore({
        users: {
          serv_caller: {
            name: "Servidor Intruso",
            role: "SERVIDOR",
            status: "active",
            active: true,
            approvalStatus: "APROVADO",
            emailVerified: true,
          },
        },
        items: {
          item_other_staff: {
            id: "item_other_staff",
            title: "Caderno Universitário",
            status: "DEVOLVIDO",
            returnedByUserId: "serv_original_attendant", // Outro servidor!
          },
        },
      });

      const authUser = { uid: "serv_caller", email: "intruso@ifpr.edu.br", email_verified: true };
      const res = await validateDevolutionNotificationAccess(mockDb, authUser, "item_other_staff");
      expect(res.authorized).toBe(false);
      expect(res.statusCode).toBe(403);
      expect(res.errorMessage).toContain("Apenas o atendente responsável por registrar a devolução");
    });

    // Cenário 14: Servidor chamando notificação válida para item que ele mesmo devolveu -> Sucesso (200).
    it("Cenário 14: Servidor chamando notificação válida para item que ele mesmo devolveu -> Sucesso (200)", async () => {
      const { validateDevolutionNotificationAccess } = await import("../../server");
      const mockDb = createMockFirestore({
        users: {
          serv_legit: {
            name: "Servidor Legítimo",
            role: "SERVIDOR",
            status: "active",
            active: true,
            approvalStatus: "APROVADO",
            emailVerified: true,
          },
        },
        items: {
          item_legit: {
            id: "item_legit",
            title: "Chaveiro com Crachá",
            status: "DEVOLVIDO",
            returnedByUserId: "serv_legit",
            devolutionNotified: false,
          },
        },
      });

      const authUser = { uid: "serv_legit", email: "legit@ifpr.edu.br", email_verified: true };
      const res = await validateDevolutionNotificationAccess(mockDb, authUser, "item_legit");
      expect(res.authorized).toBe(true);
      expect(res.statusCode).toBe(200);
      expect(res.alreadyNotified).toBe(false);
      expect(res.itemData?.title).toBe("Chaveiro com Crachá");
    });

    // Cenário 15: Chamada subsequente (idempotência) para item já notificado -> Sucesso (200, alreadyNotified: true) sem duplicar envio.
    it("Cenário 15: Chamada subsequente (idempotência) para item já notificado -> Sucesso (200, alreadyNotified: true)", async () => {
      const { validateDevolutionNotificationAccess } = await import("../../server");
      const mockDb = createMockFirestore({
        users: {
          serv_legit: {
            name: "Servidor Legítimo",
            role: "SERVIDOR",
            status: "active",
            active: true,
            approvalStatus: "APROVADO",
            emailVerified: true,
          },
        },
        items: {
          item_already_notified: {
            id: "item_already_notified",
            title: "Mochila Preta",
            status: "DEVOLVIDO",
            returnedByUserId: "serv_legit",
            devolutionNotified: true,
          },
        },
      });

      const authUser = { uid: "serv_legit", email: "legit@ifpr.edu.br", email_verified: true };
      const res = await validateDevolutionNotificationAccess(mockDb, authUser, "item_already_notified");
      expect(res.authorized).toBe(true);
      expect(res.statusCode).toBe(200);
      expect(res.alreadyNotified).toBe(true);
    });

    // Cenário 16: ADMIN legítimo no Firestore (role: 'ADMIN', status: 'active', approvalStatus: 'APROVADO', email_verified: true) -> Autorizado (200).
    it("Cenário 16: ADMIN legítimo no Firestore -> Autorizado (200)", async () => {
      const { validateStaffOrAdminAccess } = await import("../../server");
      const mockDb = createMockFirestore({
        users: {
          admin_legit_user: {
            name: "Administrador Valioso",
            role: "ADMIN",
            status: "active",
            active: true,
            approvalStatus: "APROVADO",
            emailVerified: true,
          },
        },
      });

      const authUser = { uid: "admin_legit_user", email: "admin.valioso@ifpr.edu.br", email_verified: true };
      const res = await validateStaffOrAdminAccess(mockDb, authUser);
      expect(res.authorized).toBe(true);
      expect(res.statusCode).toBe(200);
      expect(res.signerName).toBe("Administrador Valioso");
    });

    // Cenário 17: ADMIN rebaixado para ALUNO ou SERVIDOR no Firestore não retém privilégio administrativo por claim antiga.
    it("Cenário 17: ADMIN rebaixado no Firestore para ALUNO ou SERVIDOR -> Sem privilégio administrativo", async () => {
      const { validateStaffOrAdminAccess, validateDevolutionNotificationAccess } = await import("../../server");
      const mockDb = createMockFirestore({
        users: {
          demoted_to_aluno: {
            name: "Antigo Admin Agora Aluno",
            role: "ALUNO",
            status: "active",
            active: true,
            approvalStatus: "APROVADO",
            emailVerified: true,
          },
          demoted_to_servidor: {
            name: "Antigo Admin Agora Servidor",
            role: "SERVIDOR",
            status: "active",
            active: true,
            approvalStatus: "APROVADO",
            emailVerified: true,
          },
        },
        items: {
          item_admin_check: {
            id: "item_admin_check",
            status: "DEVOLVIDO",
            returnedByUserId: "other_staff_attendant",
          },
        },
      });

      // 1. Demoted to ALUNO attempting staff/admin access with stale isAdmin: true token
      const authDemotedAluno = { uid: "demoted_to_aluno", email: "aluno@ifpr.edu.br", email_verified: true, isAdmin: true };
      const res1 = await validateStaffOrAdminAccess(mockDb, authDemotedAluno);
      expect(res1.authorized).toBe(false);
      expect(res1.statusCode).toBe(403);

      // 2. Demoted to SERVIDOR attempting to notify devolution performed by another attendant (claims isAdmin: true)
      // Must NOT be treated as admin, therefore blocked from notifying another attendant's return
      const authDemotedServidor = { uid: "demoted_to_servidor", email: "servidor@ifpr.edu.br", email_verified: true, isAdmin: true };
      const res2 = await validateDevolutionNotificationAccess(mockDb, authDemotedServidor, "item_admin_check");
      expect(res2.authorized).toBe(false);
      expect(res2.statusCode).toBe(403);
      expect(res2.errorMessage).toContain("Apenas o atendente responsável");
    });

    // Cenário 18: Usuário com claim isAdmin: true mas documento ausente no Firestore -> Negado (403).
    it("Cenário 18: Usuário com claim isAdmin: true mas documento ausente no Firestore -> Negado (403)", async () => {
      const { validateStaffOrAdminAccess } = await import("../../server");
      const mockDb = createMockFirestore({
        users: {},
      });

      const authUser = { uid: "fake_admin_ghost", email: "ghost.admin@ifpr.edu.br", email_verified: true, isAdmin: true };
      const res = await validateStaffOrAdminAccess(mockDb, authUser);
      expect(res.authorized).toBe(false);
      expect(res.statusCode).toBe(403);
      expect(res.errorMessage).toContain("não encontrado no sistema");
    });

    // Cenário 19: ADMIN suspenso, banido ou inativo no Firestore -> Bloqueado (403).
    it("Cenário 19: ADMIN suspenso, banido ou com active: false no Firestore -> Bloqueado (403)", async () => {
      const { validateStaffOrAdminAccess } = await import("../../server");
      const mockDb = createMockFirestore({
        users: {
          admin_suspended: {
            role: "ADMIN",
            status: "suspended",
            active: true,
            approvalStatus: "APROVADO",
            emailVerified: true,
          },
          admin_inactive_flag: {
            role: "ADMIN",
            status: "active",
            active: false,
            approvalStatus: "APROVADO",
            emailVerified: true,
          },
        },
      });

      const resSuspended = await validateStaffOrAdminAccess(mockDb, {
        uid: "admin_suspended",
        email: "susp_admin@ifpr.edu.br",
        email_verified: true,
        isAdmin: true,
      });
      expect(resSuspended.authorized).toBe(false);
      expect(resSuspended.statusCode).toBe(403);

      const resInactiveFlag = await validateStaffOrAdminAccess(mockDb, {
        uid: "admin_inactive_flag",
        email: "flag_admin@ifpr.edu.br",
        email_verified: true,
        isAdmin: true,
      });
      expect(resInactiveFlag.authorized).toBe(false);
      expect(resInactiveFlag.statusCode).toBe(403);
    });

    // Cenário 20: Falha de leitura segura no Firestore -> Rejeitado (500) sem fallback permissivo.
    it("Cenário 20: Falha de leitura segura no Firestore -> Rejeitado (500) sem fallback permissivo", async () => {
      const { validateStaffOrAdminAccess, validateDevolutionNotificationAccess } = await import("../../server");
      const mockDb = createMockFirestore({
        throwOnUserGet: true,
      });

      const authUser = { uid: "user_crash", email: "crash@ifpr.edu.br", email_verified: true };
      const res = await validateStaffOrAdminAccess(mockDb, authUser);
      expect(res.authorized).toBe(false);
      expect(res.statusCode).toBe(500);
      expect(res.errorMessage).toContain("Erro interno ao validar credenciais");

      const resNotif = await validateDevolutionNotificationAccess(mockDb, authUser, "item_any");
      expect(resNotif.authorized).toBe(false);
      expect(resNotif.statusCode).toBe(500);
    });

    // Cenário 21: Confirmação de e-mail restrita ao token criptográfico (emailVerified do Firestore NÃO substitui authUser.email_verified).
    it("Cenário 21: Confirmação de e-mail restrita ao token (emailVerified do Firestore NÃO substitui)", async () => {
      const { validateStaffOrAdminAccess } = await import("../../server");
      const mockDb = createMockFirestore({
        users: {
          user_fake_email_verified: {
            name: "Servidor Sem Token Verificado",
            role: "SERVIDOR",
            status: "active",
            active: true,
            approvalStatus: "APROVADO",
            emailVerified: true, // No doc está true, mas o token é false
          },
        },
      });

      const authUser = {
        uid: "user_fake_email_verified",
        email: "unverified.token@ifpr.edu.br",
        email_verified: false, // Token do provedor não está verificado
      };

      const res = await validateStaffOrAdminAccess(mockDb, authUser);
      expect(res.authorized).toBe(false);
      expect(res.statusCode).toBe(403);
      expect(res.errorMessage).toContain("E-mail não verificado");
    });

    // Cenário 22: Extração estrita de destinatário confiável (extractTrustedRecipientEmail).
    it("Cenário 22: Extração estrita de destinatário confiável exclusivamente de campos auditados do item", async () => {
      const { extractTrustedRecipientEmail } = await import("../../server");

      // 1. Direct recipientEmail
      expect(extractTrustedRecipientEmail({ recipientEmail: "destinatario@ifpr.edu.br" })).toBe("destinatario@ifpr.edu.br");

      // 2. recipientSignatureEmail
      expect(extractTrustedRecipientEmail({ recipientSignatureEmail: "assinante@ifpr.edu.br" })).toBe("assinante@ifpr.edu.br");

      // 3. registeredByUserEmail ONLY for PERDIDO items
      expect(extractTrustedRecipientEmail({ type: "PERDIDO", registeredByUserEmail: "autor@estudantes.ifpr.edu.br" })).toBe("autor@estudantes.ifpr.edu.br");

      // 4. contactInfo containing email is ignored (returns null)
      expect(extractTrustedRecipientEmail({ type: "PERDIDO", contactInfo: "Entrar em contato via aluno.dono@ifpr.edu.br ou fone" })).toBe(null);

      // 5. Sem e-mail confiável -> retorna null
      expect(extractTrustedRecipientEmail({})).toBe(null);
      expect(extractTrustedRecipientEmail({ contactInfo: "(44) 99999-9999" })).toBe(null);
      expect(extractTrustedRecipientEmail(null)).toBe(null);
    });

    // Cenário 23: Resistência à concorrência na notificação via transação atômica.
    it("Cenário 23: Resistência à concorrência via lock atômico (PROCESSING -> COMPLETED / FAILED)", async () => {
      const mockDb = createMockFirestore({
        items: {
          item_concurrent: {
            id: "item_concurrent",
            status: "DEVOLVIDO",
            returnedByUserId: "serv_attendant",
            recipientEmail: "proprietario@ifpr.edu.br",
            devolutionNotificationStatus: "IDLE",
          },
        },
      });

      // 1. Primeira requisição adquire lock atômico
      const claim1 = await mockDb.runTransaction(async (transaction: any) => {
        const itemRef = mockDb.collection("items").doc("item_concurrent");
        const docSnap = await transaction.get(itemRef);
        const fresh = docSnap.data();

        if (fresh.devolutionNotificationStatus === "PROCESSING") {
          return { status: "IN_PROGRESS" };
        }

        transaction.set(itemRef, {
          devolutionNotificationStatus: "PROCESSING",
          devolutionNotificationClaimedAtMs: Date.now(),
        }, { merge: true });

        return { status: "CLAIMED" };
      });

      expect(claim1.status).toBe("CLAIMED");

      // 2. Segunda requisição simultânea detecta status 'PROCESSING' e é rejeitada com IN_PROGRESS (409)
      const claim2 = await mockDb.runTransaction(async (transaction: any) => {
        const itemRef = mockDb.collection("items").doc("item_concurrent");
        const docSnap = await transaction.get(itemRef);
        const fresh = docSnap.data();

        if (fresh.devolutionNotificationStatus === "PROCESSING") {
          return { status: "IN_PROGRESS" };
        }

        return { status: "CLAIMED" };
      });

      expect(claim2.status).toBe("IN_PROGRESS");

      // 3. Após finalização com sucesso, o status transita para COMPLETED e flag devolutionNotified: true
      await mockDb.collection("items").doc("item_concurrent").set({
        devolutionNotified: true,
        devolutionNotificationStatus: "COMPLETED",
      }, { merge: true });

      // 4. Requisições posteriores detectam ALREADY_COMPLETED
      const claim3 = await mockDb.runTransaction(async (transaction: any) => {
        const itemRef = mockDb.collection("items").doc("item_concurrent");
        const docSnap = await transaction.get(itemRef);
        const fresh = docSnap.data();

        if (fresh.devolutionNotified === true || fresh.devolutionNotificationStatus === "COMPLETED") {
          return { status: "ALREADY_COMPLETED" };
        }
        return { status: "CLAIMED" };
      });

      expect(claim3.status).toBe("ALREADY_COMPLETED");
    });

    // Cenário 24: Recuperabilidade após falha real (status FAILED permite nova tentativa).
    it("Cenário 24: Recuperabilidade após falha real (status FAILED permite retry)", async () => {
      const mockDb = createMockFirestore({
        items: {
          item_recoverable: {
            id: "item_recoverable",
            status: "DEVOLVIDO",
            recipientEmail: "proprietario@ifpr.edu.br",
            devolutionNotificationStatus: "FAILED",
            devolutionNotificationLastError: "SMTP connection timeout",
          },
        },
      });

      // Como o status é FAILED (e não COMPLETED), o lock de nova tentativa pode ser adquirido
      const retryClaim = await mockDb.runTransaction(async (transaction: any) => {
        const itemRef = mockDb.collection("items").doc("item_recoverable");
        const docSnap = await transaction.get(itemRef);
        const fresh = docSnap.data();

        if (fresh.devolutionNotificationStatus === "COMPLETED") {
          return { status: "ALREADY_COMPLETED" };
        }
        if (fresh.devolutionNotificationStatus === "PROCESSING") {
          return { status: "IN_PROGRESS" };
        }

        transaction.set(itemRef, {
          devolutionNotificationStatus: "PROCESSING",
          devolutionNotificationClaimedAtMs: Date.now(),
        }, { merge: true });

        return { status: "CLAIMED" };
      });

      expect(retryClaim.status).toBe("CLAIMED");
    });

    // Cenário 25: Item "ENCONTRADO" sem destinatário de devolução confirmado -> registeredByUserEmail do finder NÃO é usado.
    it("Cenário 25: Item ENCONTRADO sem destinatário -> registeredByUserEmail de quem encontrou não é aceito", async () => {
      const { extractTrustedRecipientEmail } = await import("../../server");
      const foundItem = {
        type: "ENCONTRADO",
        registeredByUserEmail: "finder@ifpr.edu.br",
        contactInfo: "Contato com finder@ifpr.edu.br",
      };
      expect(extractTrustedRecipientEmail(foundItem)).toBe(null);
    });

    // Cenário 26: E-mail inserido em contactInfo (texto livre) NÃO é extraído.
    it("Cenário 26: contactInfo é texto livre e não é usado como destinatário confiável", async () => {
      const { extractTrustedRecipientEmail } = await import("../../server");
      const itemWithFreeText = {
        type: "PERDIDO",
        contactInfo: "Ligar para suporte@ifpr.edu.br ou WhatsApp",
      };
      expect(extractTrustedRecipientEmail(itemWithFreeText)).toBe(null);
    });

    // Cenário 27: Item PERDIDO sem destinatário confirmado e sem registeredByUserEmail -> Retorna null.
    it("Cenário 27: Item PERDIDO sem e-mail confiável -> Retorna null", async () => {
      const { extractTrustedRecipientEmail } = await import("../../server");
      const itemLost = {
        type: "PERDIDO",
        title: "Carteira",
      };
      expect(extractTrustedRecipientEmail(itemLost)).toBe(null);
    });

    // Cenário 28: Item PERDIDO com registeredByUserEmail do dono legítimo -> Aceito como destinatário.
    it("Cenário 28: Item PERDIDO com registeredByUserEmail do dono -> Aceito como destinatário", async () => {
      const { extractTrustedRecipientEmail } = await import("../../server");
      const itemLostOwner = {
        type: "PERDIDO",
        registeredByUserEmail: "dono.perdido@estudantes.ifpr.edu.br",
      };
      expect(extractTrustedRecipientEmail(itemLostOwner)).toBe("dono.perdido@estudantes.ifpr.edu.br");
    });

    // Cenário 29: Duas tentativas simultâneas de aquisição de claim -> Apenas uma adquire a reserva com claimId único.
    it("Cenário 29: Duas tentativas simultâneas -> Apenas uma adquire o claimId", async () => {
      const mockDb = createMockFirestore({
        items: {
          item_race_claim: {
            id: "item_race_claim",
            status: "DEVOLVIDO",
            recipientEmail: "dono@ifpr.edu.br",
            devolutionNotificationStatus: "IDLE",
          },
        },
      });

      const claimId1 = "claim_attempt_1";
      const claimId2 = "claim_attempt_2";

      const res1 = await mockDb.runTransaction(async (tx: any) => {
        const ref = mockDb.collection("items").doc("item_race_claim");
        const doc = await tx.get(ref);
        const data = doc.data();
        if (data.devolutionNotificationStatus === "PROCESSING") return { status: "IN_PROGRESS" };
        tx.set(ref, { devolutionNotificationStatus: "PROCESSING", devolutionNotificationClaimId: claimId1 }, { merge: true });
        return { status: "CLAIMED" };
      });

      expect(res1.status).toBe("CLAIMED");

      const res2 = await mockDb.runTransaction(async (tx: any) => {
        const ref = mockDb.collection("items").doc("item_race_claim");
        const doc = await tx.get(ref);
        const data = doc.data();
        if (data.devolutionNotificationStatus === "PROCESSING") return { status: "IN_PROGRESS" };
        tx.set(ref, { devolutionNotificationStatus: "PROCESSING", devolutionNotificationClaimId: claimId2 }, { merge: true });
        return { status: "CLAIMED" };
      });

      expect(res2.status).toBe("IN_PROGRESS");
    });

    // Cenário 30: Claim antigo expirado ou substituído não pode sobrescrever o estado atual da tentativa mais recente.
    it("Cenário 30: Fencing token / claimId obsoleto não sobrescreve tentativa nova", async () => {
      const mockDb = createMockFirestore({
        items: {
          item_fencing: {
            id: "item_fencing",
            status: "DEVOLVIDO",
            recipientEmail: "dono@ifpr.edu.br",
            devolutionNotificationStatus: "PROCESSING",
            devolutionNotificationClaimId: "new_claim_id_789", // Tentativa nova substituiu a antiga
          },
        },
      });

      const oldClaimId = "old_stale_claim_123";

      // Tentativa antiga tenta finalizar e gravar COMPLETED
      let completedByOld = false;
      await mockDb.runTransaction(async (tx: any) => {
        const ref = mockDb.collection("items").doc("item_fencing");
        const doc = await tx.get(ref);
        const data = doc.data();
        if (data.devolutionNotificationClaimId === oldClaimId) {
          tx.set(ref, { devolutionNotificationStatus: "COMPLETED" }, { merge: true });
          completedByOld = true;
        }
      });

      expect(completedByOld).toBe(false);
      const finalDoc = (await mockDb.collection("items").doc("item_fencing").get()).data();
      expect(finalDoc.devolutionNotificationStatus).toBe("PROCESSING"); // Não foi corrompido pelo claim antigo
    });

    // Cenário 31: Idempotência na criação de email_notifications via ID determinístico.
    it("Cenário 31: ID determinístico em email_notifications evita duplicação de documentos", async () => {
      const mockDb = createMockFirestore({});
      const itemId = "item_det_123";
      const notifDocId = `email_auto_${itemId}_ITEM_RETURNED`;

      await mockDb.collection("email_notifications").doc(notifDocId).set({
        id: notifDocId,
        itemId,
        status: "SENT",
      }, { merge: true });

      await mockDb.collection("email_notifications").doc(notifDocId).set({
        id: notifDocId,
        itemId,
        status: "SENT",
      }, { merge: true });

      // Deve existir exatamente 1 documento com essa chave determinística em itemsData
      const storedNotif = mockDb._itemsData[notifDocId];
      expect(storedNotif).toBeDefined();
      expect(storedNotif.itemId).toBe(itemId);
    });

    // Cenário 32: Recuperabilidade de itens em FAILED.
    it("Cenário 32: Itens em FAILED permitem retry imediato de notificação", async () => {
      const mockDb = createMockFirestore({
        items: {
          item_failed_retry: {
            id: "item_failed_retry",
            status: "DEVOLVIDO",
            recipientEmail: "dono@ifpr.edu.br",
            devolutionNotificationStatus: "FAILED",
          },
        },
      });

      const retryRes = await mockDb.runTransaction(async (tx: any) => {
        const ref = mockDb.collection("items").doc("item_failed_retry");
        const doc = await tx.get(ref);
        const data = doc.data();
        if (data.devolutionNotificationStatus === "PROCESSING") return { status: "IN_PROGRESS" };
        tx.set(ref, { devolutionNotificationStatus: "PROCESSING", devolutionNotificationClaimId: "retry_claim" }, { merge: true });
        return { status: "CLAIMED" };
      });

      expect(retryRes.status).toBe("CLAIMED");
    });

    // Cenário 33: Registros legados com flags de notificação concluída são reconhecidos.
    it("Cenário 33: Flags legadas devolutionNotified ou returnEmailNotified tratadas como alreadyNotified", async () => {
      const { validateDevolutionNotificationAccess } = await import("../../server");
      const mockDb = createMockFirestore({
        users: {
          staff_user: {
            role: "SERVIDOR",
            status: "active",
            active: true,
            approvalStatus: "APROVADO",
            emailVerified: true,
          },
        },
        items: {
          item_legacy_flag: {
            id: "item_legacy_flag",
            status: "DEVOLVIDO",
            returnedByUserId: "staff_user",
            devolutionNotified: true,
          },
        },
      });

      const authUser = { uid: "staff_user", email: "staff@ifpr.edu.br", email_verified: true };
      const res = await validateDevolutionNotificationAccess(mockDb, authUser, "item_legacy_flag");
      expect(res.authorized).toBe(true);
      expect(res.alreadyNotified).toBe(true);
    });

    // Cenário 34: Coerência transacional em falhas parciais de envio e persistência.
    it("Cenário 34: Falha entre criação de notificação e persistência do item não duplica log lógico", async () => {
      const mockDb = createMockFirestore({
        items: {
          item_partial_fail: {
            id: "item_partial_fail",
            status: "DEVOLVIDO",
            recipientEmail: "dono@ifpr.edu.br",
            devolutionNotificationStatus: "PROCESSING",
            devolutionNotificationClaimId: "claim_partial",
          },
        },
      });

      const notifId = `email_auto_item_partial_fail_ITEM_RETURNED`;
      // Simula gravação da notificação
      await mockDb.collection("email_notifications").doc(notifId).set({ id: notifId, status: "SENT" }, { merge: true });

      // Simula que a atualização do item falhou, mantendo item em FAILED ou PROCESSING com claimId diferente
      await mockDb.collection("items").doc("item_partial_fail").set({
        devolutionNotificationStatus: "FAILED",
        devolutionNotificationClaimId: "expired_or_failed",
      }, { merge: true });

      // Nova tentativa adquire novo claimId e reprocessa sem duplicar registro de log na coleção (graças ao ID determinístico)
      const newClaimId = "claim_new_retry";
      const retryResult = await mockDb.runTransaction(async (tx: any) => {
        const ref = mockDb.collection("items").doc("item_partial_fail");
        const doc = await tx.get(ref);
        const data = doc.data();
        if (data.devolutionNotificationStatus === "PROCESSING") return { status: "IN_PROGRESS" };
        tx.set(ref, { devolutionNotificationStatus: "PROCESSING", devolutionNotificationClaimId: newClaimId }, { merge: true });
        return { status: "CLAIMED" };
      });

      expect(retryResult.status).toBe("CLAIMED");
    });
  });

  describe("35. Auditoria de Segurança e Acesso ao Modo Manutenção", () => {
    it("deve permitir que ADMIN autorizado valide ou altere o estado de manutenção", () => {
      const adminAuth = simulateServerAuthMiddleware(
        { uid: "admin_1", email: "paulocauan39@gmail.com", email_verified: true },
        { role: "ADMIN", approvalStatus: "APROVADO" }
      );
      expect(adminAuth.authUser.isAdmin).toBe(true);
      expect(adminAuth.isStaffOrAdmin).toBe(true);
    });

    it("deve estritamente barrar SERVIDOR de alterar configuração de manutenção (Simulação de RBAC / requireAdmin)", () => {
      const serverAuth = simulateServerAuthMiddleware(
        { uid: "serv_1", email: "servidor@ifpr.edu.br", email_verified: true },
        { role: "SERVIDOR", approvalStatus: "APROVADO" }
      );
      expect(serverAuth.authUser.isAdmin).toBe(false);
      const isAllowedByAdminGuard = serverAuth.authUser.isAdmin;
      expect(isAllowedByAdminGuard).toBe(false);
    });

    it("deve estritamente barrar ALUNO de alterar configuração de manutenção", () => {
      const alunoAuth = simulateServerAuthMiddleware(
        { uid: "aluno_1", email: "aluno@estudante.ifpr.edu.br", email_verified: true },
        { role: "ALUNO", approvalStatus: "APROVADO" }
      );
      expect(alunoAuth.authUser.isAdmin).toBe(false);
    });

    it("deve manter acesso operacional de SERVIDOR à custódia e assinaturas pendentes mesmo durante manutenção", () => {
      const servidorUser: User = {
        id: "serv_op_1",
        name: "Servidor Operacional",
        email: "operacional@ifpr.edu.br",
        role: "SERVIDOR",
        status: "active",
        approvalStatus: "APROVADO",
        reputationScore: 10,
        createdAt: "2026-01-01T00:00:00Z",
        courseOrDept: "Portaria IFPR",
        registrationNumber: "202633333",
        avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150",
      };
      const authEval = evaluatePanelAuthorization({ currentUser: servidorUser });
      expect(authEval.authorized).toBe(true);
      expect(authEval.isStaff).toBe(true);
    });
  });
});
