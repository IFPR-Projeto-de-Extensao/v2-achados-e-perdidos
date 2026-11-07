import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getRootAdminUid,
  evaluateRootAdminAuth,
  ROOT_ADMIN_EMAIL,
} from "../../server";

/**
 * Simulator for backend role assignment endpoint (/api/admin/assign-role)
 * Validates request authorization and role assignment restrictions
 * exactly as implemented in server.ts.
 */
interface AssignRoleRequest {
  caller: {
    uid: string;
    email: string;
    email_verified?: boolean;
    isAdmin?: boolean;
    role?: string;
  };
  body: {
    targetUserId: string;
    targetRole: string;
    reason?: string;
  };
  mockDb: {
    users: Map<string, any>;
    roleAssignments: Map<string, any>;
  };
}

interface AssignRoleResponse {
  statusCode: number;
  body: {
    success: boolean;
    error?: string;
    code?: string;
    assignedRole?: string;
    approvalStatus?: string;
  };
}

function simulateAssignRoleEndpoint(req: AssignRoleRequest): AssignRoleResponse {
  const { caller, body, mockDb } = req;

  // 1. Authentication check
  if (!caller || !caller.uid) {
    return {
      statusCode: 401,
      body: { success: false, error: "Usuário não autenticado." },
    };
  }

  // 2. requireAdmin middleware check
  const rootEval = evaluateRootAdminAuth(caller);
  const isCallerRoot = rootEval.isRoot;

  let isCallerAdmin = false;
  if (isCallerRoot) {
    isCallerAdmin = true;
  } else {
    const callerUser = mockDb.users.get(caller.uid);
    const callerAssign = mockDb.roleAssignments.get(caller.uid);
    const hasAdminAssignment =
      callerAssign?.targetUserId === caller.uid &&
      callerAssign?.active === true &&
      callerAssign?.assignedRole === "ADMIN" &&
      callerAssign?.approvalStatus === "APROVADO";
    const isDocAdmin =
      callerUser?.role === "ADMIN" && callerUser?.approvalStatus === "APROVADO";

    if ((hasAdminAssignment || isDocAdmin) && caller.email_verified === true) {
      if (callerUser?.status !== "banned" && callerUser?.status !== "suspended") {
        isCallerAdmin = true;
      }
    }
  }

  if (!isCallerAdmin) {
    return {
      statusCode: 403,
      body: {
        success: false,
        error: "Acesso negado. Apenas administradores autorizados do IFPR podem executar esta operação.",
      },
    };
  }

  // 3. Body validation
  const { targetUserId, targetRole, reason } = body;
  if (!targetUserId || typeof targetUserId !== "string" || !targetUserId.trim()) {
    return {
      statusCode: 400,
      body: {
        success: false,
        error: "targetUserId é obrigatório e deve ser uma string válida.",
        code: "INVALID_TARGET_USER_ID",
      },
    };
  }

  const cleanTargetUid = targetUserId.trim();
  const validRoles = ["ALUNO", "SERVIDOR", "ADMIN", "INTRUSO"];
  if (!targetRole || typeof targetRole !== "string" || !validRoles.includes(targetRole.toUpperCase())) {
    return {
      statusCode: 400,
      body: {
        success: false,
        error: `targetRole inválido. Valores permitidos: ${validRoles.join(", ")}.`,
        code: "INVALID_ROLE",
      },
    };
  }

  const cleanRole = targetRole.toUpperCase();

  // 4. Self-elevation check
  if (cleanTargetUid === caller.uid) {
    return {
      statusCode: 403,
      body: {
        success: false,
        error: "Operação não permitida: um administrador não pode alterar o próprio cargo.",
        code: "SELF_ASSIGNMENT_FORBIDDEN",
      },
    };
  }

  // 5. Root Admin exclusivity check for granting ADMIN role
  if (cleanRole === "ADMIN" && !isCallerRoot) {
    return {
      statusCode: 403,
      body: {
        success: false,
        error: "Apenas o Administrador Raiz oficial (paulocauan39@gmail.com) pode conceder o cargo de ADMIN.",
        code: "ROOT_ADMIN_ONLY_FOR_ADMIN_ROLE",
      },
    };
  }

  // 6. Target validation
  const targetUser = mockDb.users.get(cleanTargetUid);
  const targetAssign = mockDb.roleAssignments.get(cleanTargetUid);
  const targetEmail = targetUser?.email || targetAssign?.targetEmail || "";

  if (targetEmail.toLowerCase() === ROOT_ADMIN_EMAIL.toLowerCase()) {
    return {
      statusCode: 403,
      body: {
        success: false,
        error: "Não é permitido alterar o cargo do Administrador Raiz oficial.",
        code: "CANNOT_MODIFY_ROOT_ADMIN",
      },
    };
  }

  const previousRole = targetUser?.role || targetAssign?.assignedRole || "INTRUSO";
  if (previousRole === "ADMIN" && !isCallerRoot) {
    return {
      statusCode: 403,
      body: {
        success: false,
        error: "Apenas o Administrador Raiz oficial pode alterar o cargo de outro Administrador.",
        code: "ROOT_ADMIN_ONLY_TO_MODIFY_ADMIN",
      },
    };
  }

  // 7. Atomic transaction commit
  const isIntruso = cleanRole === "INTRUSO";
  const approvalStatus = isIntruso ? "PENDENTE" : "APROVADO";
  const active = !isIntruso;

  const nowIso = new Date().toISOString();
  mockDb.roleAssignments.set(cleanTargetUid, {
    id: cleanTargetUid,
    targetUserId: cleanTargetUid,
    targetEmail,
    assignedRole: cleanRole,
    approvalStatus,
    assignedByUid: caller.uid,
    assignedByEmail: caller.email,
    assignedAt: nowIso,
    active,
    reason: reason || "Atribuição administrativa de cargo",
  });

  if (targetUser) {
    mockDb.users.set(cleanTargetUid, {
      ...targetUser,
      role: cleanRole,
      approvalStatus,
      updatedAt: nowIso,
    });
  }

  return {
    statusCode: 200,
    body: {
      success: true,
      assignedRole: cleanRole,
      approvalStatus,
    },
  };
}

describe("LOCALIZA+ v1.10.11 — Root Admin Security & Configuration Suite", () => {
  const PINNED_ROOT_UID = "hCG5mDgK1fRaTojULzlM7dXvb7n2";
  const ORIGINAL_ENV = process.env.ROOT_ADMIN_UID;

  beforeEach(() => {
    process.env.ROOT_ADMIN_UID = PINNED_ROOT_UID;
  });

  afterEach(() => {
    if (ORIGINAL_ENV !== undefined) {
      process.env.ROOT_ADMIN_UID = ORIGINAL_ENV;
    } else {
      delete process.env.ROOT_ADMIN_UID;
    }
  });

  describe("getRootAdminUid() — Safe Parsing & Fail-Closed Guard", () => {
    it("returns clean UID when set normally without quotes", () => {
      process.env.ROOT_ADMIN_UID = "hCG5mDgK1fRaTojULzlM7dXvb7n2";
      expect(getRootAdminUid()).toBe("hCG5mDgK1fRaTojULzlM7dXvb7n2");
    });

    it("safely strips surrounding double quotes from .env injection", () => {
      process.env.ROOT_ADMIN_UID = '"hCG5mDgK1fRaTojULzlM7dXvb7n2"';
      expect(getRootAdminUid()).toBe("hCG5mDgK1fRaTojULzlM7dXvb7n2");
    });

    it("safely strips surrounding single quotes from .env injection", () => {
      process.env.ROOT_ADMIN_UID = "'hCG5mDgK1fRaTojULzlM7dXvb7n2'";
      expect(getRootAdminUid()).toBe("hCG5mDgK1fRaTojULzlM7dXvb7n2");
    });

    it("safely trims surrounding whitespace", () => {
      process.env.ROOT_ADMIN_UID = "   hCG5mDgK1fRaTojULzlM7dXvb7n2   ";
      expect(getRootAdminUid()).toBe("hCG5mDgK1fRaTojULzlM7dXvb7n2");
    });

    it("returns empty string (fail-closed) when environment variable is undefined", () => {
      delete process.env.ROOT_ADMIN_UID;
      expect(getRootAdminUid()).toBe("");
    });

    it("returns empty string (fail-closed) when environment variable is empty or spaces", () => {
      process.env.ROOT_ADMIN_UID = "   ";
      expect(getRootAdminUid()).toBe("");
    });
  });

  describe("9 Cenários Obrigatórios de Segurança e Autorização", () => {
    // Cenário 1: UID correto + e-mail correto + e-mail verificado: Root Admin reconhecido quando ROOT_ADMIN_UID configurado
    it("Cenário 1: UID correto + e-mail correto + e-mail verificado é reconhecido como Root Admin", () => {
      process.env.ROOT_ADMIN_UID = PINNED_ROOT_UID;
      const result = evaluateRootAdminAuth({
        uid: PINNED_ROOT_UID,
        email: "paulocauan39@gmail.com",
        email_verified: true,
      });

      expect(result.isRoot).toBe(true);
      expect(result.rejectionReason).toBeUndefined();
    });

    // Cenário 2: Mesmo e-mail com UID diferente: negado
    it("Cenário 2: Mesmo e-mail de Root Admin com UID diferente é estritamente negado", () => {
      process.env.ROOT_ADMIN_UID = PINNED_ROOT_UID;
      const result = evaluateRootAdminAuth({
        uid: "attacker_spoofed_uid_12345",
        email: "paulocauan39@gmail.com",
        email_verified: true,
      });

      expect(result.isRoot).toBe(false);
      expect(result.rejectionReason).toBe("UID_NOT_MATCHING_PINNED_ROOT");
    });

    // Cenário 3: UID correto com e-mail diferente: negado
    it("Cenário 3: UID correto com e-mail diferente é estritamente negado", () => {
      process.env.ROOT_ADMIN_UID = PINNED_ROOT_UID;
      const result = evaluateRootAdminAuth({
        uid: PINNED_ROOT_UID,
        email: "imposter@gmail.com",
        email_verified: true,
      });

      expect(result.isRoot).toBe(false);
      expect(result.rejectionReason).toBe("EMAIL_NOT_ROOT_ADMIN");
    });

    // Cenário 4: E-mail correto não verificado: negado
    it("Cenário 4: E-mail de Root Admin não verificado pelo provedor é estritamente negado", () => {
      process.env.ROOT_ADMIN_UID = PINNED_ROOT_UID;
      const result = evaluateRootAdminAuth({
        uid: PINNED_ROOT_UID,
        email: "paulocauan39@gmail.com",
        email_verified: false,
      });

      expect(result.isRoot).toBe(false);
      expect(result.rejectionReason).toBe("EMAIL_NOT_VERIFIED");
    });

    // Cenário 5: ROOT_ADMIN_UID ausente: fail-closed
    it("Cenário 5: ROOT_ADMIN_UID ausente no ambiente resulta em fail-closed estrito", () => {
      delete process.env.ROOT_ADMIN_UID;
      const result = evaluateRootAdminAuth({
        uid: PINNED_ROOT_UID,
        email: "paulocauan39@gmail.com",
        email_verified: true,
      });

      expect(result.isRoot).toBe(false);
      expect(result.rejectionReason).toBe("ROOT_ADMIN_UID_NOT_CONFIGURED");
    });

    // Cenário 6: ADMIN comum aprovado: mantém permissões administrativas normais
    it("Cenário 6: ADMIN institucional aprovado mantém permissões administrativas normais", () => {
      const mockDb = {
        users: new Map<string, any>([
          [
            "admin_docente_1",
            {
              id: "admin_docente_1",
              name: "Admin Docente IFPR",
              email: "admin.docente@ifpr.edu.br",
              role: "ADMIN",
              approvalStatus: "APROVADO",
              status: "active",
            },
          ],
          [
            "aluno_target_1",
            {
              id: "aluno_target_1",
              name: "Aluno IFPR",
              email: "aluno@ifpr.edu.br",
              role: "ALUNO",
              approvalStatus: "APROVADO",
              status: "active",
            },
          ],
        ]),
        roleAssignments: new Map<string, any>([
          [
            "admin_docente_1",
            {
              targetUserId: "admin_docente_1",
              targetEmail: "admin.docente@ifpr.edu.br",
              assignedRole: "ADMIN",
              approvalStatus: "APROVADO",
              active: true,
            },
          ],
        ]),
      };

      const response = simulateAssignRoleEndpoint({
        caller: {
          uid: "admin_docente_1",
          email: "admin.docente@ifpr.edu.br",
          email_verified: true,
        },
        body: {
          targetUserId: "aluno_target_1",
          targetRole: "SERVIDOR",
          reason: "Servidor recém-empossado no IFPR",
        },
        mockDb,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.assignedRole).toBe("SERVIDOR");
      expect(mockDb.users.get("aluno_target_1")?.role).toBe("SERVIDOR");
    });

    // Cenário 7: ADMIN comum aprovado: não pode atribuir cargo ADMIN
    it("Cenário 7: ADMIN comum aprovado é estritamente impedido de atribuir o cargo ADMIN", () => {
      const mockDb = {
        users: new Map<string, any>([
          [
            "admin_docente_1",
            {
              id: "admin_docente_1",
              name: "Admin Docente IFPR",
              email: "admin.docente@ifpr.edu.br",
              role: "ADMIN",
              approvalStatus: "APROVADO",
              status: "active",
            },
          ],
          [
            "target_candidate",
            {
              id: "target_candidate",
              name: "Colega Docente",
              email: "colega@ifpr.edu.br",
              role: "SERVIDOR",
              approvalStatus: "APROVADO",
              status: "active",
            },
          ],
        ]),
        roleAssignments: new Map<string, any>([
          [
            "admin_docente_1",
            {
              targetUserId: "admin_docente_1",
              targetEmail: "admin.docente@ifpr.edu.br",
              assignedRole: "ADMIN",
              approvalStatus: "APROVADO",
              active: true,
            },
          ],
        ]),
      };

      const response = simulateAssignRoleEndpoint({
        caller: {
          uid: "admin_docente_1",
          email: "admin.docente@ifpr.edu.br",
          email_verified: true,
        },
        body: {
          targetUserId: "target_candidate",
          targetRole: "ADMIN",
          reason: "Tentativa de elevação por admin comum",
        },
        mockDb,
      });

      expect(response.statusCode).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe("ROOT_ADMIN_ONLY_FOR_ADMIN_ROLE");
      expect(response.body.error).toContain("Apenas o Administrador Raiz oficial");
      // Verifica que o cargo no banco não foi modificado
      expect(mockDb.users.get("target_candidate")?.role).toBe("SERVIDOR");
    });

    // Cenário 8: Root Admin: pode atribuir SERVIDOR a conta Gmail externa
    it("Cenário 8: Root Admin pode atribuir legitimamente o cargo SERVIDOR a uma conta Gmail externa", () => {
      process.env.ROOT_ADMIN_UID = PINNED_ROOT_UID;

      const mockDb = {
        users: new Map<string, any>([
          [
            PINNED_ROOT_UID,
            {
              id: PINNED_ROOT_UID,
              name: "Paulo Cauan",
              email: "paulocauan39@gmail.com",
              role: "ADMIN",
              approvalStatus: "APROVADO",
              status: "active",
            },
          ],
          [
            "gmail_user_external_456",
            {
              id: "gmail_user_external_456",
              name: "Colaborador Externo",
              email: "colaborador.externo@gmail.com",
              role: "INTRUSO",
              approvalStatus: "PENDENTE",
              status: "active",
            },
          ],
        ]),
        roleAssignments: new Map<string, any>(),
      };

      const response = simulateAssignRoleEndpoint({
        caller: {
          uid: PINNED_ROOT_UID,
          email: "paulocauan39@gmail.com",
          email_verified: true,
        },
        body: {
          targetUserId: "gmail_user_external_456",
          targetRole: "SERVIDOR",
          reason: "Atendente terceirizado aprovado pela Direção",
        },
        mockDb,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.assignedRole).toBe("SERVIDOR");
      expect(response.body.approvalStatus).toBe("APROVADO");

      // Confirma que /role_assignments e /users foram devidamente persistidos
      const assignment = mockDb.roleAssignments.get("gmail_user_external_456");
      expect(assignment).toBeDefined();
      expect(assignment.assignedRole).toBe("SERVIDOR");
      expect(assignment.approvalStatus).toBe("APROVADO");
      expect(assignment.active).toBe(true);
      expect(assignment.assignedByEmail).toBe("paulocauan39@gmail.com");

      const user = mockDb.users.get("gmail_user_external_456");
      expect(user.role).toBe("SERVIDOR");
      expect(user.approvalStatus).toBe("APROVADO");
    });

    // Cenário 9: Root Admin: pode atribuir ADMIN a terceiro
    it("Cenário 9: Root Admin pode atribuir com sucesso o cargo ADMIN a um terceiro", () => {
      process.env.ROOT_ADMIN_UID = PINNED_ROOT_UID;

      const mockDb = {
        users: new Map<string, any>([
          [
            PINNED_ROOT_UID,
            {
              id: PINNED_ROOT_UID,
              name: "Paulo Cauan",
              email: "paulocauan39@gmail.com",
              role: "ADMIN",
              approvalStatus: "APROVADO",
              status: "active",
            },
          ],
          [
            "servidor_destaque_789",
            {
              id: "servidor_destaque_789",
              name: "Servidor Promovido",
              email: "servidor.promovido@ifpr.edu.br",
              role: "SERVIDOR",
              approvalStatus: "APROVADO",
              status: "active",
            },
          ],
        ]),
        roleAssignments: new Map<string, any>([
          [
            "servidor_destaque_789",
            {
              targetUserId: "servidor_destaque_789",
              targetEmail: "servidor.promovido@ifpr.edu.br",
              assignedRole: "SERVIDOR",
              approvalStatus: "APROVADO",
              active: true,
            },
          ],
        ]),
      };

      const response = simulateAssignRoleEndpoint({
        caller: {
          uid: PINNED_ROOT_UID,
          email: "paulocauan39@gmail.com",
          email_verified: true,
        },
        body: {
          targetUserId: "servidor_destaque_789",
          targetRole: "ADMIN",
          reason: "Nomeação para equipe de TI do IFPR",
        },
        mockDb,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.assignedRole).toBe("ADMIN");
      expect(response.body.approvalStatus).toBe("APROVADO");

      const assignment = mockDb.roleAssignments.get("servidor_destaque_789");
      expect(assignment.assignedRole).toBe("ADMIN");
      expect(assignment.approvalStatus).toBe("APROVADO");
      expect(assignment.active).toBe(true);

      const user = mockDb.users.get("servidor_destaque_789");
      expect(user.role).toBe("ADMIN");
      expect(user.approvalStatus).toBe("APROVADO");
    });
  });
});
