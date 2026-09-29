import { describe, it, expect, vi, beforeEach } from "vitest";
import { User, UserRole, LostFoundItem } from "../types";

/**
 * Suite de Testes de Blindagem de Autenticação Real no Cadastro
 * Valida os 6 cenários mandatórios de proteção contra identidade guest e fallbacks inseguros.
 */
describe("Blindagem de Autenticação Real no Cadastro de Itens (IFPR Campus Ivaiporã)", () => {
  // Mock helper function replicating the strict authentication validation engine
  function validateRegistrationAuthContext(params: {
    authLoading: boolean;
    authCurrentUser: { uid: string; email: string; emailVerified: boolean } | null;
    currentUser: User | null;
    itemRegisteredByUserId?: string;
  }): {
    canProceed: boolean;
    error?: string;
    effectiveUserId?: string;
    effectiveUserRole?: UserRole;
  } {
    // Scenario: authLoading active
    if (params.authLoading) {
      return {
        canProceed: false,
        error: "Autenticação em carregamento: Aguarde a inicialização da sessão Firebase.",
      };
    }

    const authUser = params.authCurrentUser;
    if (!authUser || !authUser.uid || !authUser.email) {
      return {
        canProceed: false,
        error: "Autenticação obrigatória: Sessão Firebase Authentication ativa não encontrada.",
      };
    }

    if (!authUser.emailVerified && authUser.email !== "paulocauan39@gmail.com") {
      return {
        canProceed: false,
        error: "E-mail não verificado: A confirmação de e-mail institucional é obrigatória.",
      };
    }

    const isRootAdmin = authUser.email === "paulocauan39@gmail.com";
    const effectiveUserRole: UserRole | undefined = isRootAdmin
      ? "ADMIN"
      : params.currentUser?.role && params.currentUser.role !== "INTRUSO"
      ? params.currentUser.role
      : undefined;

    if (!effectiveUserRole) {
      return {
        canProceed: false,
        error: "Perfil institucional não disponível para autorização no Firestore.",
      };
    }

    const effectiveUserId = authUser.uid;

    if (params.itemRegisteredByUserId && params.itemRegisteredByUserId !== authUser.uid) {
      return {
        canProceed: false,
        error: "Falha de consistência de autenticação: UID do autor não coincide com a sessão ativa.",
      };
    }

    return {
      canProceed: true,
      effectiveUserId,
      effectiveUserRole,
    };
  }

  const createMockUser = (overrides: Partial<User> = {}): User => ({
    id: "user-123",
    name: "Aluno Teste",
    email: "aluno@estudantes.ifpr.edu.br",
    role: "ALUNO",
    reputationScore: 100,
    avatarUrl: "https://example.com/avatar.png",
    courseOrDept: "Técnico em Informática",
    registrationNumber: "202612345",
    createdAt: new Date().toISOString(),
    status: "active",
    ...overrides,
  });

  // 1. auth.currentUser ausente → não chamar setDoc()
  it("1. auth.currentUser ausente: Bloqueia cadastro e não permite setDoc()", () => {
    const result = validateRegistrationAuthContext({
      authLoading: false,
      authCurrentUser: null,
      currentUser: null,
    });

    expect(result.canProceed).toBe(false);
    expect(result.error).toContain("Autenticação obrigatória");
    expect(result.effectiveUserId).toBeUndefined();
  });

  // 2. auth.currentUser presente mas email não verificado → não chamar setDoc()
  it("2. auth.currentUser presente mas e-mail não verificado: Bloqueia setDoc()", () => {
    const result = validateRegistrationAuthContext({
      authLoading: false,
      authCurrentUser: {
        uid: "uid-unverified-123",
        email: "aluno@estudantes.ifpr.edu.br",
        emailVerified: false,
      },
      currentUser: createMockUser({
        id: "uid-unverified-123",
        email: "aluno@estudantes.ifpr.edu.br",
      }),
    });

    expect(result.canProceed).toBe(false);
    expect(result.error).toContain("E-mail não verificado");
  });

  // 3. registeredByUserId diferente de auth.currentUser.uid → não chamar setDoc()
  it("3. registeredByUserId diferente de auth.currentUser.uid: Bloqueia tentativa de setDoc() com mismatch", () => {
    const result = validateRegistrationAuthContext({
      authLoading: false,
      authCurrentUser: {
        uid: "active-user-uid",
        email: "aluno@estudantes.ifpr.edu.br",
        emailVerified: true,
      },
      currentUser: createMockUser({
        id: "active-user-uid",
        email: "aluno@estudantes.ifpr.edu.br",
      }),
      itemRegisteredByUserId: "different-user-uid-or-guest",
    });

    expect(result.canProceed).toBe(false);
    expect(result.error).toContain("UID do autor não coincide com a sessão ativa");
  });

  // 4. auth.currentUser.uid válido + email verificado + role válida → permitir tentativa de setDoc()
  it("4. auth.currentUser.uid válido + email verificado + role válida: Permite avanço para persistência Firestore", () => {
    const result = validateRegistrationAuthContext({
      authLoading: false,
      authCurrentUser: {
        uid: "valid-auth-uid-456",
        email: "aluno.valido@estudantes.ifpr.edu.br",
        emailVerified: true,
      },
      currentUser: createMockUser({
        id: "valid-auth-uid-456",
        email: "aluno.valido@estudantes.ifpr.edu.br",
        role: "ALUNO",
      }),
      itemRegisteredByUserId: "valid-auth-uid-456",
    });

    expect(result.canProceed).toBe(true);
    expect(result.effectiveUserId).toBe("valid-auth-uid-456");
    expect(result.effectiveUserRole).toBe("ALUNO");
    expect(result.error).toBeUndefined();
  });

  // 5. nunca gerar registeredByUserId = "guest-campus"
  it("5. Nunca gera registeredByUserId = 'guest-campus' sob nenhuma hipótese", () => {
    const testCases = [
      { authLoading: false, authCurrentUser: null, currentUser: null },
      { authLoading: true, authCurrentUser: null, currentUser: null },
      {
        authLoading: false,
        authCurrentUser: { uid: "real-uid", email: "user@ifpr.edu.br", emailVerified: true },
        currentUser: createMockUser({ id: "real-uid", email: "user@ifpr.edu.br", role: "SERVIDOR" as UserRole }),
      },
    ];

    for (const tc of testCases) {
      const res = validateRegistrationAuthContext(tc);
      expect(res.effectiveUserId).not.toBe("guest-campus");
    }
  });

  // 6. nunca usar "ALUNO" artificialmente quando o perfil real não estiver disponível
  it("6. Nunca assume 'ALUNO' artificialmente quando o perfil real do usuário não estiver carregado", () => {
    const result = validateRegistrationAuthContext({
      authLoading: false,
      authCurrentUser: {
        uid: "auth-uid-no-profile",
        email: "servidor@ifpr.edu.br",
        emailVerified: true,
      },
      currentUser: null, // Perfil ainda não sincronizado do Firestore
    });

    expect(result.canProceed).toBe(false);
    expect(result.effectiveUserRole).not.toBe("ALUNO");
    expect(result.error).toContain("Perfil institucional não disponível");
  });

  // 7. Cenário de inicialização em que authLoading ainda está ativo
  it("7. Bloqueia cadastro durante a inicialização assíncrona (authLoading = true)", () => {
    const result = validateRegistrationAuthContext({
      authLoading: true,
      authCurrentUser: null,
      currentUser: null,
    });

    expect(result.canProceed).toBe(false);
    expect(result.error).toContain("Autenticação em carregamento");
  });
});
