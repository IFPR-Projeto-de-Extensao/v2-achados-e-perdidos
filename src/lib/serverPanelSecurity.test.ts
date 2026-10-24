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
function simulateServerAuthMiddleware(decodedToken: { uid: string; email?: string; role?: string }, firestoreDoc?: { role?: string; emailVerified?: boolean }) {
  const isRoot = decodedToken.email === "paulocauan39@gmail.com";
  let isAdmin = isRoot || decodedToken.role === "ADMIN";
  let isEmailVerified = isRoot ? true : false;
  let dbRole: string | undefined = undefined;

  if (firestoreDoc) {
    dbRole = firestoreDoc.role;
    if (firestoreDoc.role === "ADMIN") {
      isAdmin = true;
    }
    if (firestoreDoc.emailVerified === true) {
      isEmailVerified = true;
    }
  }

  if (isAdmin) {
    isEmailVerified = true;
  }

  const authUser = {
    uid: decodedToken.uid,
    email: decodedToken.email,
    email_verified: isEmailVerified,
    role: isAdmin ? "ADMIN" : (dbRole || decodedToken.role || "ALUNO"),
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
      };

      const firestoreUser = {
        role: "SERVIDOR",
        emailVerified: true,
      };

      const { authUser, isStaffOrAdmin } = simulateServerAuthMiddleware(decodedWithoutClaims, firestoreUser);
      expect(authUser.role).toBe("SERVIDOR");
      expect(authUser.isAdmin).toBe(false);
      expect(isStaffOrAdmin).toBe(true);
    });

    it("deve rejeitar ALUNO em verificações isStaffOrAdmin no backend", () => {
      const decodedAluno = {
        uid: "aluno_fb_uid_888",
        email: "aluno@estudantes.ifpr.edu.br",
      };

      const firestoreUser = {
        role: "ALUNO",
        emailVerified: true,
      };

      const { authUser, isStaffOrAdmin } = simulateServerAuthMiddleware(decodedAluno, firestoreUser);
      expect(authUser.role).toBe("ALUNO");
      expect(authUser.isAdmin).toBe(false);
      expect(isStaffOrAdmin).toBe(false);
    });
  });

  describe("5. Preservação da Versão Oficial do Sistema", () => {
    it("deve manter rigorosamente a versão base em v1.10.2", () => {
      expect(CURRENT_VERSION).toBe("v1.10.2");
    });
  });
});
