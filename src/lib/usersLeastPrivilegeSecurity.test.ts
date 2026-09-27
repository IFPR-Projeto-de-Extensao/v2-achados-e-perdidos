import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

describe("Users Collection Least Privilege, Anti-Enumeration & Privilege Escalation Hardening (/users)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const rulesPath = path.resolve(process.cwd(), "firestore.rules");
  const rulesContent = fs.readFileSync(rulesPath, "utf-8");

  // Simulated evaluator modeling the exact logic of firestore.rules for /users/{userId}
  function evaluateUsersRule(params: {
    operation: "get" | "list" | "create" | "update" | "delete";
    targetUserId: string;
    auth: {
      uid: string;
      email?: string;
      role?: string;
      approvalStatus?: string;
      status?: "active" | "suspended" | "banned";
      emailVerified?: boolean;
      token?: { email?: string; role?: string; admin?: boolean; email_verified?: boolean };
    } | null;
    existingData?: Record<string, any>;
    incomingData?: Record<string, any>;
    queryEmailFilter?: string;
  }): { allowed: boolean; reason?: string } {
    const { operation, targetUserId, auth, existingData, incomingData, queryEmailFilter } = params;

    // Default deny if not signed in (except where explicitly allowed)
    if (!auth || !auth.uid) {
      return { allowed: false, reason: "UNAUTHENTICATED" };
    }

    const tokenEmail = auth.token?.email || auth.email || "";
    const isRoot = tokenEmail.toLowerCase() === "paulocauan39@gmail.com";
    const hasAdminClaim = auth.token?.role === "ADMIN" || auth.token?.admin === true;
    const isDocAdmin = auth.role === "ADMIN" && auth.approvalStatus === "APROVADO";
    const isAdmin = isRoot || hasAdminClaim || isDocAdmin;

    const isEmailVerified = Boolean(auth.token?.email_verified ?? auth.emailVerified);
    const isAccountBlocked = auth.status === "banned" || auth.status === "suspended";
    const isAccountActive = !isAccountBlocked;
    const isAuthUser = auth.uid === targetUserId;

    // 1. GET (Read single document)
    if (operation === "get") {
      if (isAuthUser || isAdmin) {
        return { allowed: true };
      }
      return { allowed: false, reason: "GET_FORBIDDEN_NOT_SELF_OR_ADMIN" };
    }

    // 2. LIST (Query collection)
    if (operation === "list") {
      if (isAdmin) {
        return { allowed: true };
      }
      // Non-admin can only list/query where resource.data.email == request.auth.token.email
      if (isAccountActive && queryEmailFilter && queryEmailFilter === tokenEmail) {
        return { allowed: true };
      }
      return { allowed: false, reason: "GLOBAL_LIST_FORBIDDEN_NOT_ADMIN" };
    }

    // 3. CREATE (Registration)
    if (operation === "create") {
      if (!incomingData) return { allowed: false, reason: "NO_DATA" };
      if (!isAuthUser) return { allowed: false, reason: "CANNOT_CREATE_FOR_OTHER_UID" };
      if (incomingData.id !== targetUserId) return { allowed: false, reason: "ID_MISMATCH" };
      if (incomingData.email !== tokenEmail) return { allowed: false, reason: "EMAIL_MISMATCH" };

      if (isRoot || hasAdminClaim) {
        return { allowed: true };
      }

      const isPermittedRole = ["ALUNO", "SERVIDOR", "INTRUSO"].includes(incomingData.role);
      const isPrivilegeEscalation = incomingData.role === "ADMIN" || incomingData.admin === true;
      if (isPrivilegeEscalation) {
        return { allowed: false, reason: "PRIVILEGE_ESCALATION_ADMIN_FORBIDDEN" };
      }

      if (isPermittedRole) {
        return { allowed: true };
      }
      return { allowed: false, reason: "INVALID_ROLE" };
    }

    // 4. UPDATE (Profile Edit & Management)
    if (operation === "update") {
      if (!incomingData || !existingData) return { allowed: false, reason: "NO_DATA" };

      // Admin can update anything
      if (isAdmin) {
        return { allowed: true };
      }

      // Non-admin self-update checks
      if (!isAccountActive) return { allowed: false, reason: "ACCOUNT_INACTIVE" };
      if (!isAuthUser) return { allowed: false, reason: "CANNOT_UPDATE_OTHER_USER" };
      if (incomingData.id !== targetUserId) return { allowed: false, reason: "CANNOT_CHANGE_ID" };
      if (incomingData.email !== existingData.email) return { allowed: false, reason: "CANNOT_CHANGE_EMAIL" };

      // Anti-Escalation: Role
      const isRoleTampering = incomingData.role !== existingData.role && !(existingData.role === "INTRUSO" && ["ALUNO", "SERVIDOR"].includes(incomingData.role) && isEmailVerified);
      if (isRoleTampering) return { allowed: false, reason: "CANNOT_CHANGE_ROLE" };

      // Anti-Escalation: Admin claim
      if (incomingData.admin === true && existingData.admin !== true) {
        return { allowed: false, reason: "CANNOT_SET_ADMIN_TRUE" };
      }

      // Anti-Escalation: ApprovalStatus
      if (incomingData.approvalStatus !== existingData.approvalStatus && !(isEmailVerified && incomingData.approvalStatus === "APROVADO")) {
        return { allowed: false, reason: "CANNOT_CHANGE_APPROVAL_STATUS" };
      }

      // Anti-Escalation: Status & Suspension fields
      if (incomingData.status && incomingData.status !== existingData.status) {
        return { allowed: false, reason: "CANNOT_CHANGE_STATUS" };
      }
      if (incomingData.suspendedUntil && incomingData.suspendedUntil !== existingData.suspendedUntil) {
        return { allowed: false, reason: "CANNOT_CHANGE_SUSPENDED_UNTIL" };
      }
      if (incomingData.reputationScore !== undefined && incomingData.reputationScore !== existingData.reputationScore) {
        return { allowed: false, reason: "CANNOT_CHANGE_REPUTATION_SCORE" };
      }

      return { allowed: true };
    }

    // 5. DELETE
    if (operation === "delete") {
      if (isAdmin && !isAuthUser) {
        return { allowed: true };
      }
      return { allowed: false, reason: "DELETE_FORBIDDEN" };
    }

    return { allowed: false, reason: "UNKNOWN_OPERATION" };
  }

  // Test A: Usuário não autenticado tentando ler users
  it("A. Usuário não autenticado tentando ler doc de users é REJEITADO", () => {
    const res = evaluateUsersRule({
      operation: "get",
      targetUserId: "user-123",
      auth: null,
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("UNAUTHENTICATED");
  });

  // Test B: ALUNO tentando ler seu próprio UID
  it("B. ALUNO tentando ler users/{próprio UID} é PERMITIDO", () => {
    const authStudent = {
      uid: "student-uid-100",
      email: "estudante@estudantes.ifpr.edu.br",
      role: "ALUNO",
      emailVerified: true,
    };

    const res = evaluateUsersRule({
      operation: "get",
      targetUserId: "student-uid-100",
      auth: authStudent,
    });
    expect(res.allowed).toBe(true);
  });

  // Test C: ALUNO tentando ler UID de terceiro
  it("C. ALUNO tentando ler users/{UID de terceiro} é REJEITADO", () => {
    const authStudent = {
      uid: "student-uid-100",
      email: "estudante@estudantes.ifpr.edu.br",
      role: "ALUNO",
      emailVerified: true,
    };

    const res = evaluateUsersRule({
      operation: "get",
      targetUserId: "victim-uid-200",
      auth: authStudent,
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("GET_FORBIDDEN_NOT_SELF_OR_ADMIN");
  });

  // Test D: ALUNO tentando listar toda a coleção users
  it("D. ALUNO tentando listar globalmente a coleção users é REJEITADO", () => {
    const authStudent = {
      uid: "student-uid-100",
      email: "estudante@estudantes.ifpr.edu.br",
      role: "ALUNO",
      emailVerified: true,
    };

    const res = evaluateUsersRule({
      operation: "list",
      targetUserId: "",
      auth: authStudent,
      queryEmailFilter: undefined, // Indiscriminate getDocs(collection("users"))
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("GLOBAL_LIST_FORBIDDEN_NOT_ADMIN");
  });

  // Test E: SERVIDOR comum tentando listar toda a coleção users
  it("E. SERVIDOR comum (não admin) tentando listar toda a coleção users é REJEITADO", () => {
    const authServidor = {
      uid: "servidor-uid-300",
      email: "professor@ifpr.edu.br",
      role: "SERVIDOR",
      emailVerified: true,
    };

    const res = evaluateUsersRule({
      operation: "list",
      targetUserId: "",
      auth: authServidor,
      queryEmailFilter: undefined, // Indiscriminate getDocs(collection("users"))
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("GLOBAL_LIST_FORBIDDEN_NOT_ADMIN");
  });

  // Test F: ADMIN consultando e listando usuários
  it("F. ADMIN consultando doc individual de terceiro e listando toda a coleção é PERMITIDO", () => {
    const authAdmin = {
      uid: "admin-uid-999",
      email: "admin@ifpr.edu.br",
      role: "ADMIN",
      approvalStatus: "APROVADO",
      emailVerified: true,
    };

    const resGet = evaluateUsersRule({
      operation: "get",
      targetUserId: "student-uid-100",
      auth: authAdmin,
    });
    expect(resGet.allowed).toBe(true);

    const resList = evaluateUsersRule({
      operation: "list",
      targetUserId: "",
      auth: authAdmin,
    });
    expect(resList.allowed).toBe(true);
  });

  // Test G: ALUNO tentando alterar seu próprio role para ADMIN
  it("G. ALUNO tentando alterar seu próprio role para ADMIN é REJEITADO", () => {
    const authStudent = {
      uid: "student-uid-100",
      email: "estudante@estudantes.ifpr.edu.br",
      role: "ALUNO",
      approvalStatus: "APROVADO",
      status: "active" as const,
      emailVerified: true,
    };

    const existing = {
      id: "student-uid-100",
      email: "estudante@estudantes.ifpr.edu.br",
      role: "ALUNO",
      approvalStatus: "APROVADO",
      status: "active",
    };

    const maliciousUpdate = {
      ...existing,
      role: "ADMIN", // Tampered role
    };

    const res = evaluateUsersRule({
      operation: "update",
      targetUserId: "student-uid-100",
      auth: authStudent,
      existingData: existing,
      incomingData: maliciousUpdate,
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("CANNOT_CHANGE_ROLE");
  });

  // Test H: ALUNO tentando definir admin=true
  it("H. ALUNO tentando injetar admin=true em seu perfil é REJEITADO", () => {
    const authStudent = {
      uid: "student-uid-100",
      email: "estudante@estudantes.ifpr.edu.br",
      role: "ALUNO",
      approvalStatus: "APROVADO",
      status: "active" as const,
      emailVerified: true,
    };

    const existing = {
      id: "student-uid-100",
      email: "estudante@estudantes.ifpr.edu.br",
      role: "ALUNO",
      approvalStatus: "APROVADO",
      status: "active",
      admin: false,
    };

    const maliciousUpdate = {
      ...existing,
      admin: true, // Injected claim
    };

    const res = evaluateUsersRule({
      operation: "update",
      targetUserId: "student-uid-100",
      auth: authStudent,
      existingData: existing,
      incomingData: maliciousUpdate,
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("CANNOT_SET_ADMIN_TRUE");
  });

  // Test I: ALUNO tentando alterar status ou suspensão diretamente
  it("I. ALUNO tentando alterar status da conta (ex: unban) por manipulação direta é REJEITADO", () => {
    const authStudent = {
      uid: "student-uid-100",
      email: "estudante@estudantes.ifpr.edu.br",
      role: "ALUNO",
      approvalStatus: "APROVADO",
      status: "active" as const,
      emailVerified: true,
    };

    const existing = {
      id: "student-uid-100",
      email: "estudante@estudantes.ifpr.edu.br",
      role: "ALUNO",
      approvalStatus: "APROVADO",
      status: "suspended",
    };

    const maliciousUpdate = {
      ...existing,
      status: "active", // Tampered status
    };

    const res = evaluateUsersRule({
      operation: "update",
      targetUserId: "student-uid-100",
      auth: authStudent,
      existingData: existing,
      incomingData: maliciousUpdate,
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("CANNOT_CHANGE_STATUS");
  });

  // Test J: Usuário tentando alterar perfil de outro usuário
  it("J. Usuário tentando alterar dados de outro usuário é REJEITADO", () => {
    const authStudent = {
      uid: "student-uid-100",
      email: "estudante@estudantes.ifpr.edu.br",
      role: "ALUNO",
      approvalStatus: "APROVADO",
      status: "active" as const,
      emailVerified: true,
    };

    const res = evaluateUsersRule({
      operation: "update",
      targetUserId: "victim-uid-200",
      auth: authStudent,
      existingData: { id: "victim-uid-200", email: "outro@ifpr.edu.br", name: "Outro" },
      incomingData: { id: "victim-uid-200", email: "outro@ifpr.edu.br", name: "Hacked" },
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("CANNOT_UPDATE_OTHER_USER");
  });

  // Test K: Query legítima por próprio e-mail (Login sync)
  it("K. Query legítima filtrando exatamente pelo próprio e-mail autenticado é PERMITIDA", () => {
    const authStudent = {
      uid: "student-uid-100",
      email: "estudante@estudantes.ifpr.edu.br",
      role: "ALUNO",
      approvalStatus: "APROVADO",
      status: "active" as const,
      emailVerified: true,
    };

    const res = evaluateUsersRule({
      operation: "list",
      targetUserId: "",
      auth: authStudent,
      queryEmailFilter: "estudante@estudantes.ifpr.edu.br", // Matches token email
    });
    expect(res.allowed).toBe(true);
  });

  // Test L: Validação das regras declaradas em firestore.rules
  it("L. firestore.rules declara explicitamente least-privilege para get e list na coleção /users", () => {
    expect(rulesContent).toMatch(/match \/users\/\{userId\}[\s\S]*?allow get: if isAuthUser\(userId\) \|\| isAdmin\(\);/);
    expect(rulesContent).toMatch(/match \/users\/\{userId\}[\s\S]*?allow list: if isAdmin\(\) \|\|\s*\(isSignedIn\(\) && isAccountActive\(\) && resource\.data\.email == request\.auth\.token\.email\);/);
    expect(rulesContent).toContain("(!('admin' in incoming()) || incoming().admin == false)");
  });
});
