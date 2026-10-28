import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Test Suite: LOCALIZA+ v1.10.9 — SEC-05 e SEC-06
 *
 * SEC-05: Bloqueio estrito de servidores suspensos ou banidos em todas as operações de servidor.
 * SEC-06: Prevenção contra autoaprovação de perfil e garantia de aprovação administrativa estrita.
 */

describe("SEC-05 & SEC-06: Bloqueio de Servidores Inativos e Impedimento de Autoaprovação", () => {
  const rulesPath = path.resolve(process.cwd(), "firestore.rules");
  const rulesContent = fs.readFileSync(rulesPath, "utf-8");

  // Context simulator matching firestore.rules logic
  function evaluateIsAccountBlocked(userDoc: { status?: "active" | "suspended" | "banned" } | null): boolean {
    if (!userDoc) return false;
    return userDoc.status === "banned" || userDoc.status === "suspended";
  }

  function evaluateIsAccountActive(userDoc: { status?: "active" | "suspended" | "banned" } | null): boolean {
    return !evaluateIsAccountBlocked(userDoc);
  }

  function evaluateIsRootAdmin(auth: { email?: string; email_verified?: boolean } | null): boolean {
    if (!auth || !auth.email_verified || !auth.email) return false;
    const email = auth.email.toLowerCase();
    return email === "paulocauan39@gmail.com";
  }

  function evaluateIsDocAdmin(
    userDoc: { role?: string; approvalStatus?: string; status?: "active" | "suspended" | "banned" } | null
  ): boolean {
    if (!userDoc) return false;
    return (
      evaluateIsAccountActive(userDoc) &&
      userDoc.role === "ADMIN" &&
      userDoc.approvalStatus === "APROVADO"
    );
  }

  function evaluateIsAdmin(params: {
    auth: { email?: string; email_verified?: boolean; token?: { role?: string; admin?: boolean } } | null;
    userDoc: { role?: string; approvalStatus?: string; status?: "active" | "suspended" | "banned" } | null;
  }): boolean {
    if (!params.auth) return false;
    if (evaluateIsRootAdmin(params.auth)) return true;

    const isActive = evaluateIsAccountActive(params.userDoc);
    if (!isActive) return false;

    const hasClaim = params.auth.token?.role === "ADMIN" || params.auth.token?.admin === true;
    const isDoc = evaluateIsDocAdmin(params.userDoc);
    return hasClaim || isDoc;
  }

  function evaluateIsDocServidor(
    auth: { email_verified?: boolean } | null,
    userDoc: { role?: string; approvalStatus?: string; status?: "active" | "suspended" | "banned" } | null
  ): boolean {
    if (!auth || !auth.email_verified || !userDoc) return false;
    return (
      evaluateIsAccountActive(userDoc) &&
      userDoc.role === "SERVIDOR" &&
      userDoc.approvalStatus === "APROVADO"
    );
  }

  function evaluateIsServidor(params: {
    auth: { email?: string; email_verified?: boolean; token?: { role?: string; admin?: boolean } } | null;
    userDoc: { role?: string; approvalStatus?: string; status?: "active" | "suspended" | "banned" } | null;
  }): boolean {
    if (!params.auth) return false;
    const admin = evaluateIsAdmin(params);
    if (admin) return true;

    const isActive = evaluateIsAccountActive(params.userDoc);
    if (!isActive) return false;

    return evaluateIsDocServidor(params.auth, params.userDoc);
  }

  // Items update evaluation
  function evaluateItemUpdate(params: {
    auth: { uid: string; email?: string; email_verified?: boolean; token?: { role?: string } } | null;
    userDoc: { role?: string; approvalStatus?: string; status?: "active" | "suspended" | "banned" } | null;
    existingItem: { registeredByUserId: string; registeredByRole: string; createdAt: string };
    incomingItem: { registeredByUserId: string; registeredByRole: string; createdAt: string };
  }): boolean {
    if (!params.auth) return false;
    const admin = evaluateIsAdmin(params);
    if (admin) return true;

    const servidor = evaluateIsServidor(params);
    if (servidor) return true;

    // Normal author update
    const isActive = evaluateIsAccountActive(params.userDoc);
    if (
      isActive &&
      params.existingItem.registeredByUserId === params.auth.uid &&
      params.incomingItem.registeredByUserId === params.existingItem.registeredByUserId &&
      params.incomingItem.createdAt === params.existingItem.createdAt &&
      params.incomingItem.registeredByRole === params.existingItem.registeredByRole
    ) {
      return true;
    }

    return false;
  }

  // Users creation evaluation
  function evaluateUserCreate(params: {
    auth: { uid: string; email?: string; email_verified?: boolean; token?: { role?: string } };
    targetUserId: string;
    incoming: { id: string; email: string; role: string; approvalStatus: string; admin?: boolean };
  }): boolean {
    if (params.auth.uid !== params.targetUserId) return false;
    if (params.incoming.id !== params.targetUserId) return false;
    if (params.incoming.email !== params.auth.email) return false;

    // Root admin or admin claim
    if (evaluateIsRootAdmin(params.auth) || params.auth.token?.role === "ADMIN") {
      return true;
    }

    // Regular users:
    const isStudentEmail = Boolean(
      params.auth.email_verified && params.auth.email?.match(/.*@(?:estudantes|estudante|aluno)\.ifpr\.edu\.br$/)
    );
    const isStaffEmail = Boolean(
      params.auth.email_verified &&
        params.auth.email?.match(/.*@ifpr\.edu\.br$/) &&
        !params.auth.email?.match(/.*@(?:estudantes|estudante|aluno|escola)\.ifpr\.edu\.br$/)
    );

    const isRoleValid =
      (params.incoming.role === "ALUNO" && isStudentEmail) ||
      (params.incoming.role === "SERVIDOR" && isStaffEmail) ||
      params.incoming.role === "INTRUSO";

    if (!isRoleValid) return false;
    if (params.incoming.admin === true) return false;

    // SEC-06: SERVIDOR can NEVER be self-created as APROVADO
    const isApprovalAllowed =
      params.incoming.approvalStatus === "PENDENTE" ||
      (params.incoming.approvalStatus === "APROVADO" &&
        (params.incoming.role === "INTRUSO" || (params.incoming.role === "ALUNO" && isStudentEmail)));

    return isApprovalAllowed;
  }

  // Users update evaluation
  function evaluateUserUpdate(params: {
    auth: { uid: string; email?: string; email_verified?: boolean; token?: { role?: string } };
    targetUserId: string;
    userDoc: { role?: string; approvalStatus?: string; status?: "active" | "suspended" | "banned" } | null;
    existing: { id: string; email: string; role: string; approvalStatus: string; admin?: boolean; status?: string };
    incoming: { id: string; email: string; role: string; approvalStatus: string; admin?: boolean; status?: string };
  }): boolean {
    const admin = evaluateIsAdmin({ auth: params.auth, userDoc: params.userDoc });
    if (admin) return true;

    const isActive = evaluateIsAccountActive(params.userDoc);
    if (!isActive) return false;

    if (params.auth.uid !== params.targetUserId) return false;
    if (params.incoming.id !== params.targetUserId) return false;
    if (params.incoming.email !== params.existing.email) return false;

    // Cannot change admin field
    if (params.incoming.admin !== params.existing.admin) return false;

    // SEC-06: Cannot change approvalStatus under any circumstances
    if (params.incoming.approvalStatus !== params.existing.approvalStatus) return false;

    // Cannot change status
    if (params.incoming.status && params.incoming.status !== params.existing.status) return false;

    // Role anti-escalation
    if (params.incoming.role !== params.existing.role) {
      const isUpgrade =
        params.existing.role === "INTRUSO" &&
        ((params.incoming.role === "ALUNO" && params.auth.email?.endsWith("@estudantes.ifpr.edu.br")) ||
          (params.incoming.role === "SERVIDOR" && params.auth.email?.endsWith("@ifpr.edu.br")));
      if (!isUpgrade) return false;
    }

    return true;
  }

  // =========================================================================
  // Testes Obrigatórios
  // =========================================================================

  // 1. Um servidor aprovado e ativo pode executar as operações autorizadas
  it("1. Servidor aprovado e ativo pode executar operações autorizadas (isServidor e item update)", () => {
    const activeStaffAuth = {
      uid: "servidor_ativo_01",
      email: "professor@ifpr.edu.br",
      email_verified: true,
    };
    const activeStaffDoc = {
      role: "SERVIDOR",
      approvalStatus: "APROVADO",
      status: "active" as const,
    };

    expect(evaluateIsServidor({ auth: activeStaffAuth, userDoc: activeStaffDoc })).toBe(true);

    const canUpdateItem = evaluateItemUpdate({
      auth: activeStaffAuth,
      userDoc: activeStaffDoc,
      existingItem: { registeredByUserId: "other_user", registeredByRole: "ALUNO", createdAt: "2026-01-01T00:00:00Z" },
      incomingItem: { registeredByUserId: "other_user", registeredByRole: "ALUNO", createdAt: "2026-01-01T00:00:00Z" },
    });
    expect(canUpdateItem).toBe(true);
  });

  // 2. Um servidor suspenso não pode atualizar itens nem executar operações exclusivas de servidor
  it("2. Servidor suspenso é BLOQUEADO em isServidor e em atualização de itens de terceiros", () => {
    const suspendedStaffAuth = {
      uid: "servidor_suspenso_02",
      email: "servidor.suspenso@ifpr.edu.br",
      email_verified: true,
    };
    const suspendedStaffDoc = {
      role: "SERVIDOR",
      approvalStatus: "APROVADO",
      status: "suspended" as const,
    };

    expect(evaluateIsServidor({ auth: suspendedStaffAuth, userDoc: suspendedStaffDoc })).toBe(false);

    const canUpdateItem = evaluateItemUpdate({
      auth: suspendedStaffAuth,
      userDoc: suspendedStaffDoc,
      existingItem: { registeredByUserId: "other_user", registeredByRole: "ALUNO", createdAt: "2026-01-01T00:00:00Z" },
      incomingItem: { registeredByUserId: "other_user", registeredByRole: "ALUNO", createdAt: "2026-01-01T00:00:00Z" },
    });
    expect(canUpdateItem).toBe(false);
  });

  // 3. Um servidor banido também é bloqueado
  it("3. Servidor banido é BLOQUEADO em isServidor e em atualização de itens", () => {
    const bannedStaffAuth = {
      uid: "servidor_banido_03",
      email: "servidor.banido@ifpr.edu.br",
      email_verified: true,
    };
    const bannedStaffDoc = {
      role: "SERVIDOR",
      approvalStatus: "APROVADO",
      status: "banned" as const,
    };

    expect(evaluateIsServidor({ auth: bannedStaffAuth, userDoc: bannedStaffDoc })).toBe(false);

    const canUpdateItem = evaluateItemUpdate({
      auth: bannedStaffAuth,
      userDoc: bannedStaffDoc,
      existingItem: { registeredByUserId: "other_user", registeredByRole: "ALUNO", createdAt: "2026-01-01T00:00:00Z" },
      incomingItem: { registeredByUserId: "other_user", registeredByRole: "ALUNO", createdAt: "2026-01-01T00:00:00Z" },
    });
    expect(canUpdateItem).toBe(false);
  });

  // 4. Uma custom claim isolada "role: 'SERVIDOR'" não concede privilégios
  it("4. Custom claim isolada role: 'SERVIDOR' com perfil ausente ou pendente NÃO concede isServidor", () => {
    const authWithClaimOnly = {
      uid: "claim_only_user",
      email: "professor@ifpr.edu.br",
      email_verified: true,
      token: { role: "SERVIDOR" },
    };

    // Perfil ausente
    expect(evaluateIsServidor({ auth: authWithClaimOnly, userDoc: null })).toBe(false);

    // Perfil pendente
    const pendingDoc = { role: "SERVIDOR", approvalStatus: "PENDENTE", status: "active" as const };
    expect(evaluateIsServidor({ auth: authWithClaimOnly, userDoc: pendingDoc })).toBe(false);
  });

  // 5. Um usuário comum não pode autoaprovar o próprio cadastro por atualização
  it("5. Usuário comum NÃO pode autoaprovar o próprio cadastro na atualização (approvalStatus imutável)", () => {
    const studentAuth = {
      uid: "student_std_01",
      email: "aluno@estudantes.ifpr.edu.br",
      email_verified: true,
    };
    const studentDoc = {
      role: "ALUNO",
      approvalStatus: "PENDENTE",
      status: "active" as const,
    };

    const attemptSelfApproval = evaluateUserUpdate({
      auth: studentAuth,
      targetUserId: "student_std_01",
      userDoc: studentDoc,
      existing: {
        id: "student_std_01",
        email: "aluno@estudantes.ifpr.edu.br",
        role: "ALUNO",
        approvalStatus: "PENDENTE",
        admin: false,
        status: "active",
      },
      incoming: {
        id: "student_std_01",
        email: "aluno@estudantes.ifpr.edu.br",
        role: "ALUNO",
        approvalStatus: "APROVADO", // Autoaprovação maliciosa
        admin: false,
        status: "active",
      },
    });

    expect(attemptSelfApproval).toBe(false);
  });

  // 6. A criação de usuários respeita a política explícita de aprovação
  it("6. Na criação: Servidor comum DEVE nascer PENDENTE; tentativa de nascer APROVADO é REJEITADA", () => {
    const staffAuth = {
      uid: "staff_new_01",
      email: "novo.servidor@ifpr.edu.br",
      email_verified: true,
    };

    // Tentativa de nascer APROVADO sem ser admin
    const attemptCreateApproved = evaluateUserCreate({
      auth: staffAuth,
      targetUserId: "staff_new_01",
      incoming: {
        id: "staff_new_01",
        email: "novo.servidor@ifpr.edu.br",
        role: "SERVIDOR",
        approvalStatus: "APROVADO", // Não permitido para servidor no create
      },
    });
    expect(attemptCreateApproved).toBe(false);

    // Criação legítima com status PENDENTE
    const legitimateCreatePending = evaluateUserCreate({
      auth: staffAuth,
      targetUserId: "staff_new_01",
      incoming: {
        id: "staff_new_01",
        email: "novo.servidor@ifpr.edu.br",
        role: "SERVIDOR",
        approvalStatus: "PENDENTE",
      },
    });
    expect(legitimateCreatePending).toBe(true);
  });

  // 7. Usuários comuns não conseguem promover a si mesmos a ADMIN nem alterar campos administrativos protegidos
  it("7. Usuários comuns são impedidos de promover a ADMIN ou alterar status/admin", () => {
    const studentAuth = {
      uid: "student_std_01",
      email: "aluno@estudantes.ifpr.edu.br",
      email_verified: true,
    };
    const studentDoc = {
      role: "ALUNO",
      approvalStatus: "APROVADO",
      status: "active" as const,
    };

    // Tentativa de escalação de papel para ADMIN
    const escalateRole = evaluateUserUpdate({
      auth: studentAuth,
      targetUserId: "student_std_01",
      userDoc: studentDoc,
      existing: { id: "student_std_01", email: "aluno@estudantes.ifpr.edu.br", role: "ALUNO", approvalStatus: "APROVADO", admin: false, status: "active" },
      incoming: { id: "student_std_01", email: "aluno@estudantes.ifpr.edu.br", role: "ADMIN", approvalStatus: "APROVADO", admin: false, status: "active" },
    });
    expect(escalateRole).toBe(false);

    // Tentativa de injeção de admin: true
    const injectAdmin = evaluateUserUpdate({
      auth: studentAuth,
      targetUserId: "student_std_01",
      userDoc: studentDoc,
      existing: { id: "student_std_01", email: "aluno@estudantes.ifpr.edu.br", role: "ALUNO", approvalStatus: "APROVADO", admin: false, status: "active" },
      incoming: { id: "student_std_01", email: "aluno@estudantes.ifpr.edu.br", role: "ALUNO", approvalStatus: "APROVADO", admin: true, status: "active" },
    });
    expect(injectAdmin).toBe(false);

    // Tentativa de reverter ban/suspensão alterando status
    const unbanSelf = evaluateUserUpdate({
      auth: studentAuth,
      targetUserId: "student_std_01",
      userDoc: { ...studentDoc, status: "suspended" },
      existing: { id: "student_std_01", email: "aluno@estudantes.ifpr.edu.br", role: "ALUNO", approvalStatus: "APROVADO", admin: false, status: "suspended" },
      incoming: { id: "student_std_01", email: "aluno@estudantes.ifpr.edu.br", role: "ALUNO", approvalStatus: "APROVADO", admin: false, status: "active" },
    });
    expect(unbanSelf).toBe(false);
  });

  // 8. O Root Admin legítimo mantém as permissões previstas
  it("8. Root Admin (paulocauan39@gmail.com verificado) mantém privilégios absolutos mesmo sem perfil", () => {
    const rootAuth = {
      uid: "root_master_001",
      email: "paulocauan39@gmail.com",
      email_verified: true,
    };

    expect(evaluateIsRootAdmin(rootAuth)).toBe(true);
    expect(evaluateIsAdmin({ auth: rootAuth, userDoc: null })).toBe(true);
    expect(evaluateIsServidor({ auth: rootAuth, userDoc: null })).toBe(true);

    // Root admin pode criar seu próprio usuário como ADMIN e APROVADO
    const rootCreatesSelf = evaluateUserCreate({
      auth: rootAuth,
      targetUserId: rootAuth.uid,
      incoming: {
        id: rootAuth.uid,
        email: "paulocauan39@gmail.com",
        role: "ADMIN",
        approvalStatus: "APROVADO",
      },
    });
    expect(rootCreatesSelf).toBe(true);
  });

  // 9. As operações de aprovação administrativa continuam funcionando conforme a política definida
  it("9. Administrador ativo pode aprovar usuários pendentes (alterar approvalStatus de PENDENTE para APROVADO)", () => {
    const adminAuth = {
      uid: "admin_active_01",
      email: "coordenador@ifpr.edu.br",
      email_verified: true,
    };
    const adminDoc = {
      role: "ADMIN",
      approvalStatus: "APROVADO",
      status: "active" as const,
    };

    const adminApprovesStaff = evaluateUserUpdate({
      auth: adminAuth,
      targetUserId: "pending_staff_01",
      userDoc: adminDoc,
      existing: {
        id: "pending_staff_01",
        email: "novo.servidor@ifpr.edu.br",
        role: "SERVIDOR",
        approvalStatus: "PENDENTE",
        admin: false,
        status: "active",
      },
      incoming: {
        id: "pending_staff_01",
        email: "novo.servidor@ifpr.edu.br",
        role: "SERVIDOR",
        approvalStatus: "APROVADO", // Aprovação pelo Administrador
        admin: false,
        status: "active",
      },
    });

    expect(adminApprovesStaff).toBe(true);
  });

  // 10. Validações estáticas de integridade de firestore.rules
  it("10. firestore.rules reflete as travas estritas no código real", () => {
    // isDocServidor exige isAccountActive
    expect(rulesContent).toMatch(/function isDocServidor\(\)[\s\S]*?isAccountActive\(\)/);

    // isServidor exige isAccountActive
    expect(rulesContent).toMatch(/function isServidor\(\)[\s\S]*?isAccountActive\(\)/);

    // isAdmin exige isAccountActive para admins regulares
    expect(rulesContent).toMatch(/function isAdmin\(\)[\s\S]*?isAccountActive\(\)/);

    // users allow update exige que approvalStatus permaneça inalterado para não-admins
    expect(rulesContent).toMatch(/allow update: if isAdmin\(\) \|\|\s*\([\s\S]*?\(incoming\(\)\.approvalStatus == existing\(\)\.approvalStatus\)/);
  });
});
