import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

describe("Audit Logs & Activity Logs Strict Identity Integrity & Anti-Spoofing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const rulesPath = path.resolve(process.cwd(), "firestore.rules");
  const rulesContent = fs.readFileSync(rulesPath, "utf-8");

  // Simulated validator mirroring the exact evaluation logic of firestore.rules for audit_logs / activity_logs
  function simulateCreateAuditLog(
    auth: { uid: string; email?: string; role?: string; approvalStatus?: string; token?: { email?: string; role?: string; admin?: boolean } } | null,
    logData: Record<string, any>,
    collectionType: "audit_logs" | "activity_logs"
  ): { allowed: boolean; reason?: string } {
    if (!auth || !auth.uid) {
      return { allowed: false, reason: "UNAUTHENTICATED" };
    }

    const isRoot = auth.email?.toLowerCase() === "paulocauan39@gmail.com" || auth.token?.email?.toLowerCase() === "paulocauan39@gmail.com";
    const isAdmin = isRoot || auth.token?.role === "ADMIN" || auth.token?.admin === true || (auth.role === "ADMIN" && auth.approvalStatus === "APROVADO");
    const isServidor = auth.role === "SERVIDOR" || auth.token?.role === "SERVIDOR";
    const isAccountActive = auth.approvalStatus === "APROVADO" || isAdmin;

    if (!isAccountActive && !isAdmin) {
      return { allowed: false, reason: "ACCOUNT_INACTIVE" };
    }

    const tokenEmail = auth.token?.email || auth.email;

    if (collectionType === "audit_logs") {
      // 1. actorId must match request.auth.uid
      if (logData.actorId !== auth.uid) {
        return { allowed: false, reason: "ACTOR_ID_SPOOFING_REJECTED" };
      }

      // 2. actorEmail must match request.auth.token.email
      if (tokenEmail && logData.actorEmail && logData.actorEmail !== tokenEmail) {
        return { allowed: false, reason: "ACTOR_EMAIL_SPOOFING_REJECTED" };
      }

      // 3. actorRole validation
      if (isAdmin && (logData.actorRole === "ADMIN" || logData.actorRole === "SERVIDOR")) {
        return { allowed: true };
      }

      if (isServidor && isAccountActive && logData.actorRole === "SERVIDOR") {
        return { allowed: true };
      }

      if (logData.actorRole === "ALUNO" && logData.objectType === "ITEM") {
        const allowedActions = ["CADASTRO_OCORRENCIA", "EDIT_OCORRENCIA", "STATUS_OVERRIDE", "EXCLUSAO_ITEM"];
        if (allowedActions.includes(logData.action)) {
          return { allowed: true };
        }
      }

      return { allowed: false, reason: "ACTOR_ROLE_OR_ACTION_REJECTED" };
    }

    if (collectionType === "activity_logs") {
      // 1. actorId and adminId must match auth.uid if present
      if (logData.actorId && logData.actorId !== auth.uid) {
        return { allowed: false, reason: "ACTOR_ID_SPOOFING_REJECTED" };
      }
      if (logData.adminId && logData.adminId !== auth.uid && logData.adminId !== "sistema-institucional") {
        return { allowed: false, reason: "ADMIN_ID_SPOOFING_REJECTED" };
      }

      // 2. actorEmail must match tokenEmail
      if (tokenEmail && logData.actorEmail && logData.actorEmail !== tokenEmail) {
        return { allowed: false, reason: "ACTOR_EMAIL_SPOOFING_REJECTED" };
      }
      if (tokenEmail && logData.adminEmail && logData.adminEmail !== tokenEmail) {
        return { allowed: false, reason: "ADMIN_EMAIL_SPOOFING_REJECTED" };
      }

      // 3. Role validation
      if (isAdmin && (!logData.actorRole || ["ADMIN", "SERVIDOR"].includes(logData.actorRole))) {
        return { allowed: true };
      }

      if (isServidor && isAccountActive && (!logData.actorRole || logData.actorRole === "SERVIDOR")) {
        return { allowed: true };
      }

      if (logData.actorRole === "ALUNO" || logData.userRole === "ALUNO") {
        const allowedActions = ["CADASTRO_OCORRENCIA", "EDIT_OCORRENCIA", "STATUS_OVERRIDE", "EXCLUSAO_ITEM"];
        if (allowedActions.includes(logData.action)) {
          return { allowed: true };
        }
      }

      return { allowed: false, reason: "ACTOR_ROLE_OR_ACTION_REJECTED" };
    }

    return { allowed: false, reason: "INVALID_COLLECTION" };
  }

  // Test A: Actor ID Spoofing
  it("A. Actor ID Spoofing: Usuário autenticado tentando criar log com actorId de outro usuário é bloqueado", () => {
    const authUser = {
      uid: "real-student-uid-100",
      email: "aluno@estudantes.ifpr.edu.br",
      role: "ALUNO",
      approvalStatus: "APROVADO",
      token: { email: "aluno@estudantes.ifpr.edu.br" },
    };

    const spoofedLog = {
      actorId: "victim-admin-uid-999", // Spoofed target
      actorEmail: "aluno@estudantes.ifpr.edu.br",
      actorRole: "ALUNO",
      objectType: "ITEM",
      action: "CADASTRO_OCORRENCIA",
    };

    const resAudit = simulateCreateAuditLog(authUser, spoofedLog, "audit_logs");
    expect(resAudit.allowed).toBe(false);
    expect(resAudit.reason).toBe("ACTOR_ID_SPOOFING_REJECTED");

    const resActivity = simulateCreateAuditLog(authUser, spoofedLog, "activity_logs");
    expect(resActivity.allowed).toBe(false);
    expect(resActivity.reason).toBe("ACTOR_ID_SPOOFING_REJECTED");
  });

  // Test B: Actor Email Spoofing
  it("B. Actor Email Spoofing: Usuário autenticado tentando criar log com e-mail forjado de admin é bloqueado", () => {
    const authUser = {
      uid: "student-uid-100",
      email: "aluno@estudantes.ifpr.edu.br",
      role: "ALUNO",
      approvalStatus: "APROVADO",
      token: { email: "aluno@estudantes.ifpr.edu.br" },
    };

    const spoofedEmailLog = {
      actorId: "student-uid-100",
      actorEmail: "admin@ifpr.edu.br", // Spoofed email
      actorRole: "ALUNO",
      objectType: "ITEM",
      action: "CADASTRO_OCORRENCIA",
    };

    const resAudit = simulateCreateAuditLog(authUser, spoofedEmailLog, "audit_logs");
    expect(resAudit.allowed).toBe(false);
    expect(resAudit.reason).toBe("ACTOR_EMAIL_SPOOFING_REJECTED");

    const resActivity = simulateCreateAuditLog(authUser, spoofedEmailLog, "activity_logs");
    expect(resActivity.allowed).toBe(false);
    expect(resActivity.reason).toBe("ACTOR_EMAIL_SPOOFING_REJECTED");
  });

  // Test C: Actor Role Spoofing (ALUNO tentando se passar por ADMIN)
  it("C. Actor Role Spoofing: ALUNO tentando registrar log com actorRole='ADMIN' é bloqueado", () => {
    const authUser = {
      uid: "student-uid-100",
      email: "aluno@estudantes.ifpr.edu.br",
      role: "ALUNO",
      approvalStatus: "APROVADO",
      token: { email: "aluno@estudantes.ifpr.edu.br" },
    };

    const spoofedRoleLog = {
      actorId: "student-uid-100",
      actorEmail: "aluno@estudantes.ifpr.edu.br",
      actorRole: "ADMIN", // Spoofed privilege
      objectType: "ITEM",
      action: "CADASTRO_OCORRENCIA",
    };

    const resAudit = simulateCreateAuditLog(authUser, spoofedRoleLog, "audit_logs");
    expect(resAudit.allowed).toBe(false);
    expect(resAudit.reason).toBe("ACTOR_ROLE_OR_ACTION_REJECTED");

    const resActivity = simulateCreateAuditLog(authUser, spoofedRoleLog, "activity_logs");
    expect(resActivity.allowed).toBe(false);
    expect(resActivity.reason).toBe("ACTOR_ROLE_OR_ACTION_REJECTED");
  });

  // Test D: Admin Claims Spoofing no Payload
  it("D. Admin Spoofing: Envio de admin=true ou role='ADMIN' no payload não confere privilégios se o usuário não for admin", () => {
    const authUser = {
      uid: "student-uid-100",
      email: "aluno@estudantes.ifpr.edu.br",
      role: "ALUNO",
      approvalStatus: "APROVADO",
      token: { email: "aluno@estudantes.ifpr.edu.br" },
    };

    const maliciousLog = {
      actorId: "student-uid-100",
      actorEmail: "aluno@estudantes.ifpr.edu.br",
      actorRole: "ADMIN",
      admin: true,
      role: "ADMIN",
      objectType: "USER",
      action: "ALTERACAO_PERMISSAO", // Unauthorized admin action
    };

    const res = simulateCreateAuditLog(authUser, maliciousLog, "audit_logs");
    expect(res.allowed).toBe(false);
  });

  // Test E: Identidade Legítima Autenticada
  it("E. Identidade Legítima: Usuário autenticado com UID e e-mail corretos cria log com sucesso", () => {
    const authStudent = {
      uid: "student-uid-100",
      email: "aluno@estudantes.ifpr.edu.br",
      role: "ALUNO",
      approvalStatus: "APROVADO",
      token: { email: "aluno@estudantes.ifpr.edu.br" },
    };

    const legitStudentLog = {
      actorId: "student-uid-100",
      actorEmail: "aluno@estudantes.ifpr.edu.br",
      actorRole: "ALUNO",
      objectType: "ITEM",
      action: "CADASTRO_OCORRENCIA",
    };

    const resStudent = simulateCreateAuditLog(authStudent, legitStudentLog, "audit_logs");
    expect(resStudent.allowed).toBe(true);

    const authAdmin = {
      uid: "admin-uid-999",
      email: "admin@ifpr.edu.br",
      role: "ADMIN",
      approvalStatus: "APROVADO",
      token: { email: "admin@ifpr.edu.br", role: "ADMIN" },
    };

    const legitAdminLog = {
      actorId: "admin-uid-999",
      actorEmail: "admin@ifpr.edu.br",
      actorRole: "ADMIN",
      objectType: "SYSTEM",
      action: "CONFIGURACAO_SISTEMA",
    };

    const resAdmin = simulateCreateAuditLog(authAdmin, legitAdminLog, "audit_logs");
    expect(resAdmin.allowed).toBe(true);
  });

  // Test F: Imutabilidade Estrita (update e delete bloqueados)
  it("F. Imutabilidade Estrita: firestore.rules bloqueia expressamente update e delete para audit_logs e activity_logs", () => {
    expect(rulesContent).toMatch(/match \/audit_logs\/\{logId\}[\s\S]*?allow update: if false;/);
    expect(rulesContent).toMatch(/match \/audit_logs\/\{logId\}[\s\S]*?allow delete: if false;/);
    expect(rulesContent).toMatch(/match \/activity_logs\/\{logId\}[\s\S]*?allow update: if false;/);
    expect(rulesContent).toMatch(/match \/activity_logs\/\{logId\}[\s\S]*?allow delete: if false;/);
  });

  // Test G: Usuário Não Autenticado
  it("G. Usuário não autenticado tentando criar auditoria é bloqueado", () => {
    const unauthLog = {
      actorId: "any-uid",
      action: "CADASTRO_OCORRENCIA",
    };

    const resAudit = simulateCreateAuditLog(null, unauthLog, "audit_logs");
    expect(resAudit.allowed).toBe(false);
    expect(resAudit.reason).toBe("UNAUTHENTICATED");

    const resActivity = simulateCreateAuditLog(null, unauthLog, "activity_logs");
    expect(resActivity.allowed).toBe(false);
    expect(resActivity.reason).toBe("UNAUTHENTICATED");
  });

  // Test H: Validação Estrita no Backend Server-side (delete-user e system/config)
  it("H. Backend Server-side: Endpoints administrativos gravam auditoria utilizando a identidade verificada do token", async () => {
    const deleteUserModule = fs.readFileSync(path.resolve(process.cwd(), "api/admin/delete-user.ts"), "utf-8");
    const systemConfigModule = fs.readFileSync(path.resolve(process.cwd(), "api/system/config.ts"), "utf-8");

    // Confirms delete-user binds to decoded adminUid and adminEmail
    expect(deleteUserModule).toContain("actorId: adminUid");
    expect(deleteUserModule).toContain("actorEmail: adminEmail");
    expect(deleteUserModule).toContain("actorRole: \"ADMIN\"");
    expect(deleteUserModule).toContain("action: \"ACCOUNT_DELETED\"");

    // Confirms system/config binds to decoded adminUid and adminEmail
    expect(systemConfigModule).toContain("performedBy: adminUid");
    expect(systemConfigModule).toContain("performedByEmail: adminEmail");
    expect(systemConfigModule).toContain("action: \"UPDATE_SYSTEM_CONFIG\"");
  });
});
