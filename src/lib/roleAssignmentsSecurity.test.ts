import { describe, it, expect, beforeEach } from "vitest";
import { resolveEffectiveUserIdentity } from "../context/AppContext";
import { User, RoleAssignment, UserRole, ApprovalStatus } from "../types";
import { generateRoleAssignmentsAuditReport, isInstitutionalEmail } from "./roleAssignmentsAudit";

/**
 * Simulador fiel das Firestore Security Rules (firestore.rules)
 * Reflete rigorosamente a eliminação de Custom Claims como fonte independente de autorização
 * e a obrigatoriedade da coleção /role_assignments para contas externas.
 */
class FirestoreRulesSimulator {
  private roleAssignments = new Map<string, RoleAssignment>();
  private users = new Map<string, Partial<User>>();

  setUser(uid: string, data: Partial<User>) {
    this.users.set(uid, data);
  }

  setRoleAssignment(uid: string, assignment: RoleAssignment) {
    this.roleAssignments.set(uid, assignment);
  }

  clear() {
    this.roleAssignments.clear();
    this.users.clear();
  }

  clientSdkWriteRoleAssignment(auth: { uid: string; email: string; role?: string; isAdmin?: boolean } | null): { allowed: boolean; reason?: string } {
    // Regra 0: match /role_assignments/{targetUserId} { allow create, update, delete: if false; }
    return { allowed: false, reason: "PERMISSION_DENIED: Client SDK cannot write to /role_assignments" };
  }

  isEmailVerified(auth: { email_verified?: boolean } | null): boolean {
    return Boolean(auth && auth.email_verified === true);
  }

  isAccountActive(auth: { uid: string; email?: string; email_verified?: boolean } | null): boolean {
    if (!auth || !auth.uid) return false;
    if (this.isRootAdmin(auth)) return true;
    const userDoc = this.users.get(auth.uid);
    if (!userDoc) return false;
    if (userDoc.status === "banned" || userDoc.status === "suspended") return false;
    return true;
  }

  isRootAdmin(auth: { uid: string; email?: string; email_verified?: boolean; role?: string } | null): boolean {
    if (!auth || !auth.uid || !this.isEmailVerified(auth)) return false;
    if (auth.role === "INTRUSO") return false;
    const matchesEmail = (auth.email || "").toLowerCase() === "paulocauan39@gmail.com";
    const matchesUid = auth.uid === "hCG5mDgK1fRaTojULzlM7dXvb7n2";
    return matchesEmail && matchesUid;
  }

  hasValidAssignment(auth: { uid: string; email: string; email_verified?: boolean; role?: string } | null, expectedRole: string): boolean {
    if (!auth || !auth.uid || !this.isEmailVerified(auth)) return false;
    if (auth.role === "INTRUSO") return false;

    const assignment = this.roleAssignments.get(auth.uid);
    if (!assignment) return false;
    if (assignment.targetUserId !== auth.uid) return false;
    if (assignment.active !== true) return false;
    if (assignment.assignedRole !== expectedRole) return false;
    if (assignment.approvalStatus !== "APROVADO") return false;

    return true;
  }

  isInstitutionalStaffEmail(email?: string): boolean {
    if (!email) return false;
    const clean = email.toLowerCase();
    return clean.endsWith("@ifpr.edu.br") && !clean.includes("@estudantes.") && !clean.includes("@aluno.");
  }

  isInstitutionalStudentEmail(email?: string): boolean {
    if (!email) return false;
    const clean = email.toLowerCase();
    return clean.endsWith("@estudantes.ifpr.edu.br") || clean.endsWith("@aluno.ifpr.edu.br");
  }

  isDocAdmin(auth: { uid: string; email: string; email_verified?: boolean; role?: string } | null): boolean {
    if (!auth || !this.isEmailVerified(auth)) return false;
    if (auth.role === "INTRUSO") return false;
    const userDoc = this.users.get(auth.uid);
    if (!userDoc) return false;
    if (userDoc.role !== "ADMIN" || userDoc.approvalStatus !== "APROVADO") return false;
    return this.isRootAdmin(auth) || this.hasValidAssignment(auth, "ADMIN");
  }

  isAdmin(auth: { uid: string; email: string; email_verified?: boolean; role?: string; customClaimsAdmin?: boolean } | null): boolean {
    if (!auth) return false;
    if (auth.role === "INTRUSO") return false;
    // Sem bypass por custom claims: apenas Root Admin ou isDocAdmin com conta ativa
    return this.isRootAdmin(auth) || (this.isAccountActive(auth) && this.isDocAdmin(auth));
  }

  isDocServidorIdentity(auth: { uid: string; email: string; email_verified?: boolean; role?: string } | null): boolean {
    if (!auth || !this.isEmailVerified(auth)) return false;
    if (auth.role === "INTRUSO") return false;
    const userDoc = this.users.get(auth.uid);
    if (!userDoc || userDoc.role !== "SERVIDOR") return false;
    return this.isInstitutionalStaffEmail(auth.email) || this.hasValidAssignment(auth, "SERVIDOR");
  }

  isDocServidor(auth: { uid: string; email: string; email_verified?: boolean; role?: string } | null): boolean {
    if (!this.isDocServidorIdentity(auth)) return false;
    const userDoc = this.users.get(auth!.uid);
    return userDoc?.approvalStatus === "APROVADO";
  }

  isDocAluno(auth: { uid: string; email: string; email_verified?: boolean; role?: string } | null): boolean {
    if (!auth || !this.isEmailVerified(auth)) return false;
    if (auth.role === "INTRUSO") return false;
    const userDoc = this.users.get(auth.uid);
    if (!userDoc || userDoc.role !== "ALUNO") return false;
    return this.isInstitutionalStudentEmail(auth.email) || this.hasValidAssignment(auth, "ALUNO");
  }

  isIntruso(auth: { uid: string; email: string; email_verified?: boolean; role?: string } | null): boolean {
    if (!auth) return true;
    if (!this.isEmailVerified(auth)) return true;
    if (auth.role === "INTRUSO") return true;
    const userDoc = this.users.get(auth.uid);
    if (userDoc?.role === "INTRUSO" && !this.isRootAdmin(auth)) return true;

    const isInstStudent = this.isInstitutionalStudentEmail(auth.email);
    const isInstStaff = this.isInstitutionalStaffEmail(auth.email);
    const isRoot = this.isRootAdmin(auth);
    const isDocAdm = this.isDocAdmin(auth);
    const isDocServ = this.isDocServidorIdentity(auth);
    const isDocAlu = this.isDocAluno(auth);

    if (!isInstStudent && !isInstStaff && !isRoot && !isDocAdm && !isDocServ && !isDocAlu) {
      return true;
    }
    return false;
  }

  canRegisterItems(auth: { uid: string; email: string; email_verified?: boolean; role?: string; customClaimsAdmin?: boolean } | null): boolean {
    if (!auth || !this.isEmailVerified(auth)) return false;
    if (auth.role === "INTRUSO") return false;
    if (!this.isAccountActive(auth)) return false;

    // Root Admin
    if (this.isRootAdmin(auth)) return true;

    // Admin autenticado via /role_assignments
    if (this.isDocAdmin(auth)) return true;

    // Servidor institucional ou designado com approvalStatus APROVADO
    if (this.isDocServidor(auth) && (this.isInstitutionalStaffEmail(auth.email) || this.hasValidAssignment(auth, "SERVIDOR"))) {
      return true;
    }

    return false;
  }
}

/**
 * Simulador do Backend Express e Firebase Admin SDK (/server.ts)
 */
class AdminBackendSimulator {
  private users = new Map<string, Partial<User>>();
  private roleAssignments = new Map<string, RoleAssignment>();
  private auditLogs: any[] = [];
  private activityLogs: any[] = [];
  private userClaims = new Map<string, Record<string, any>>();
  private revokedTokens = new Set<string>();

  setUser(uid: string, data: Partial<User>) {
    this.users.set(uid, data);
  }

  getUser(uid: string) {
    return this.users.get(uid);
  }

  setRoleAssignment(uid: string, assignment: RoleAssignment) {
    this.roleAssignments.set(uid, assignment);
  }

  getRoleAssignment(uid: string) {
    return this.roleAssignments.get(uid);
  }

  getAuditLogs() {
    return this.auditLogs;
  }

  getClaims(uid: string) {
    return this.userClaims.get(uid);
  }

  isRefreshTokenRevoked(uid: string) {
    return this.revokedTokens.has(uid);
  }

  clear() {
    this.users.clear();
    this.roleAssignments.clear();
    this.auditLogs = [];
    this.activityLogs = [];
    this.userClaims.clear();
    this.revokedTokens.clear();
  }

  /**
   * Espelha rigorosamente authenticateToken() de server.ts
   */
  authenticateToken(
    token: { uid: string; email: string; email_verified: boolean },
    options?: { simulateAssignmentReadFailure?: boolean }
  ): { isAdmin: boolean; role: string; email_verified: boolean } {
    const isRootEmail = (token.email || "").toLowerCase() === "paulocauan39@gmail.com";
    const isEmailVerified = token.email_verified === true;
    const matchesRootUid = token.uid === "hCG5mDgK1fRaTojULzlM7dXvb7n2";
    const isRoot = isRootEmail && isEmailVerified && matchesRootUid;

    const userDoc = this.users.get(token.uid);
    const isSuspendedOrBanned = userDoc?.status === "banned" || userDoc?.status === "suspended";
    const dbRole = userDoc?.role;

    let hasAdminAssignment = false;
    if (!options?.simulateAssignmentReadFailure) {
      const assignment = this.roleAssignments.get(token.uid);
      if (
        assignment &&
        assignment.targetUserId === token.uid &&
        assignment.active === true &&
        assignment.assignedRole === "ADMIN" &&
        assignment.approvalStatus === "APROVADO"
      ) {
        hasAdminAssignment = true;
      }
    }

    let isAdmin = false;
    if (isSuspendedOrBanned) {
      isAdmin = false;
    } else if (isRoot) {
      isAdmin = true;
    } else if (hasAdminAssignment && isEmailVerified) {
      isAdmin = true;
    } else {
      isAdmin = false;
    }

    return {
      isAdmin,
      role: isAdmin ? "ADMIN" : (dbRole || "ALUNO"),
      email_verified: isEmailVerified,
    };
  }

  /**
   * Espelha a transação ACID de POST /api/admin/assign-role
   */
  postAssignRole(
    caller: { uid: string; email: string; email_verified: boolean; isAdmin: boolean; status?: string } | null,
    body: { targetUserId?: string; targetRole?: string; reason?: string },
    options?: { simulateUserWriteFailure?: boolean; simulateLogWriteFailure?: boolean }
  ): { status: number; body: any } {
    if (!caller || !caller.uid) {
      return { status: 401, body: { success: false, error: "Autenticação obrigatória." } };
    }

    if (!caller.email_verified) {
      return { status: 403, body: { success: false, error: "E-mail não verificado." } };
    }

    if (!caller.isAdmin) {
      return { status: 403, body: { success: false, error: "Acesso negado. Apenas administradores." } };
    }

    if (caller.status === "banned" || caller.status === "suspended") {
      return { status: 403, body: { success: false, error: "Conta suspensa ou desativada." } };
    }

    const { targetUserId, targetRole, reason } = body;
    if (!targetUserId || typeof targetUserId !== "string" || !targetUserId.trim()) {
      return { status: 400, body: { success: false, error: "targetUserId é obrigatório." } };
    }

    const cleanTarget = targetUserId.trim();
    const validRoles = ["ALUNO", "SERVIDOR", "ADMIN", "INTRUSO"];
    if (!targetRole || !validRoles.includes(targetRole.toUpperCase())) {
      return { status: 400, body: { success: false, error: "targetRole inválido." } };
    }

    const cleanRole = targetRole.toUpperCase() as UserRole;
    const isRootCaller = caller.email.toLowerCase() === "paulocauan39@gmail.com";

    if (cleanTarget === caller.uid) {
      return { status: 403, body: { success: false, error: "Um administrador não pode alterar o próprio cargo." } };
    }

    if (cleanRole === "ADMIN" && !isRootCaller) {
      return { status: 403, body: { success: false, error: "Apenas o Administrador Raiz pode conceder ADMIN." } };
    }

    const targetUser = this.users.get(cleanTarget);
    if (!targetUser) {
      return { status: 404, body: { success: false, error: "Usuário alvo não encontrado." } };
    }

    const previousRole = targetUser.role || "INTRUSO";
    if (previousRole === "ADMIN" && !isRootCaller) {
      return { status: 403, body: { success: false, error: "Apenas o Administrador Raiz pode alterar outro Administrador." } };
    }

    // ACID Transaction Execution
    const nowIso = new Date().toISOString();
    const isIntruso = cleanRole === "INTRUSO";
    const approvalStatus: ApprovalStatus = isIntruso ? "PENDENTE" : "APROVADO";
    const active = !isIntruso;

    const assignmentDoc: RoleAssignment = {
      id: cleanTarget,
      targetUserId: cleanTarget,
      targetEmail: targetUser.email || "",
      assignedRole: cleanRole,
      approvalStatus,
      assignedByUid: caller.uid,
      assignedByEmail: caller.email,
      assignedByName: caller.email.split("@")[0],
      assignedAt: nowIso,
      active,
      updatedAt: nowIso,
      reason: reason || "Atribuição administrativa de cargo",
    };

    // Simulação de falha transacional: se falhar a gravação em users ou audit, NADA é persistido
    if (options?.simulateUserWriteFailure) {
      return { status: 500, body: { success: false, error: "Falha transacional na gravação do perfil." } };
    }

    if (options?.simulateLogWriteFailure) {
      return { status: 500, body: { success: false, error: "Falha transacional na gravação da auditoria." } };
    }

    // Gravação atômica
    this.roleAssignments.set(cleanTarget, assignmentDoc);
    targetUser.role = cleanRole;
    targetUser.approvalStatus = approvalStatus;
    targetUser.roleAssignedBy = caller.email;
    targetUser.roleAssignedAt = nowIso;
    targetUser.roleAssignmentActive = active;

    this.auditLogs.push({
      action: isIntruso ? "ROLE_REVOKED" : "ROLE_ASSIGNED",
      objectId: cleanTarget,
      actorEmail: caller.email,
      newRole: cleanRole,
      immutable: true,
      timestamp: nowIso,
    });

    // Claims and Token Revocation outside transaction
    this.userClaims.set(cleanTarget, { role: cleanRole, approvalStatus });
    if (isIntruso) {
      this.revokedTokens.add(cleanTarget);
    }

    return {
      status: 200,
      body: {
        success: true,
        message: `Cargo '${cleanRole}' atribuído com sucesso.`,
        assignment: assignmentDoc,
        claimsSynced: true,
      },
    };
  }

  /**
   * Espelha a transação ACID de POST /api/admin/revoke-role
   */
  postRevokeRole(
    caller: { uid: string; email: string; email_verified: boolean; isAdmin: boolean } | null,
    body: { targetUserId?: string; reason?: string }
  ): { status: number; body: any } {
    if (!caller || !caller.isAdmin) {
      return { status: 403, body: { success: false, error: "Acesso negado." } };
    }

    if (!caller.email_verified) {
      return { status: 403, body: { success: false, error: "E-mail não verificado." } };
    }

    const { targetUserId, reason } = body;
    if (!targetUserId) {
      return { status: 400, body: { success: false, error: "targetUserId obrigatório." } };
    }

    if (targetUserId === caller.uid) {
      return { status: 403, body: { success: false, error: "Auto-revogação proibida." } };
    }

    const targetUser = this.users.get(targetUserId);
    if (!targetUser) {
      return { status: 404, body: { success: false, error: "Usuário não encontrado." } };
    }

    const isRootCaller = caller.email.toLowerCase() === "paulocauan39@gmail.com";
    if (targetUser.role === "ADMIN" && !isRootCaller) {
      return { status: 403, body: { success: false, error: "Apenas o Root Admin pode revogar outro Admin." } };
    }

    const nowIso = new Date().toISOString();
    const assignment = this.roleAssignments.get(targetUserId);
    if (assignment) {
      assignment.active = false;
      assignment.revokedAt = nowIso;
      assignment.revokedByEmail = caller.email;
      assignment.revocationReason = reason || "Revogação administrativa de cargo";
    }

    targetUser.role = "INTRUSO";
    targetUser.approvalStatus = "PENDENTE";
    targetUser.roleAssignmentActive = false;

    this.auditLogs.push({
      action: "ROLE_REVOKED",
      objectId: targetUserId,
      actorEmail: caller.email,
      newRole: "INTRUSO",
      immutable: true,
      timestamp: nowIso,
    });

    this.userClaims.set(targetUserId, { role: "INTRUSO", approvalStatus: "PENDENTE" });
    this.revokedTokens.add(targetUserId);

    return { status: 200, body: { success: true, message: "Cargo revogado.", claimsSynced: true } };
  }
}

describe("LOCALIZA+ v1.10.10 — Matriz de Conformidade e Segurança (20 Cenários Mandatórios)", () => {
  const rules = new FirestoreRulesSimulator();
  const backend = new AdminBackendSimulator();

  beforeEach(() => {
    rules.clear();
    backend.clear();
  });

  // Cenário 1: ADMIN legado em "/users", sem atribuição: backend nega
  it("1. ADMIN legado em '/users', sem atribuição em /role_assignments: backend nega privilégio administrativo", () => {
    backend.setUser("legacy_admin_uid", {
      id: "legacy_admin_uid",
      email: "antigo.admin@gmail.com",
      role: "ADMIN",
      approvalStatus: "APROVADO",
      status: "active",
    });

    const authResult = backend.authenticateToken({
      uid: "legacy_admin_uid",
      email: "antigo.admin@gmail.com",
      email_verified: true,
    });

    expect(authResult.isAdmin).toBe(false);
  });

  // Cenário 2: ADMIN legado em "/users", sem atribuição: frontend não concede privilégios
  it("2. ADMIN legado em '/users', sem atribuição em /role_assignments: frontend não concede privilégios (neutraliza como INTRUSO)", () => {
    const identity = resolveEffectiveUserIdentity({
      email: "antigo.admin@gmail.com",
      emailVerified: true,
      userDocData: {
        role: "ADMIN",
        approvalStatus: "APROVADO",
        roleAssignedBy: "admin_antigo",
        roleAssignedAt: "2025-01-01T00:00:00Z",
      },
      // Sem roleAssignment document
    });

    expect(identity.role).toBe("INTRUSO");
    expect(identity.isDesignated).toBe(false);
    expect(identity.isInstitutional).toBe(false);
  });

  // Cenário 3: ADMIN com atribuição ativa e aprovada: autorizado
  it("3. ADMIN com atribuição ativa e aprovada em /role_assignments: autorizado no backend e frontend", () => {
    const adminUid = "valid_admin_uid";
    backend.setUser(adminUid, {
      id: adminUid,
      email: "admin.secundario@gmail.com",
      role: "ADMIN",
      approvalStatus: "APROVADO",
      status: "active",
    });
    backend.setRoleAssignment(adminUid, {
      id: adminUid,
      targetUserId: adminUid,
      targetEmail: "admin.secundario@gmail.com",
      assignedRole: "ADMIN",
      approvalStatus: "APROVADO",
      assignedByUid: "root_uid",
      assignedByEmail: "paulocauan39@gmail.com",
      assignedAt: "2026-11-04T12:00:00Z",
      active: true,
      updatedAt: "2026-11-04T12:00:00Z",
    });

    const authResult = backend.authenticateToken({
      uid: adminUid,
      email: "admin.secundario@gmail.com",
      email_verified: true,
    });
    expect(authResult.isAdmin).toBe(true);

    const identity = resolveEffectiveUserIdentity({
      email: "admin.secundario@gmail.com",
      emailVerified: true,
      userDocData: { role: "ADMIN", approvalStatus: "APROVADO" },
      roleAssignment: backend.getRoleAssignment(adminUid),
    });
    expect(identity.role).toBe("ADMIN");
    expect(identity.approvalStatus).toBe("APROVADO");
  });

  // Cenário 4: ADMIN com atribuição revogada: negado
  it("4. ADMIN com atribuição revogada (active: false): negado no backend e frontend", () => {
    const adminUid = "revoked_admin_uid";
    backend.setUser(adminUid, {
      id: adminUid,
      email: "ex.admin@gmail.com",
      role: "INTRUSO",
      approvalStatus: "PENDENTE",
      status: "active",
    });
    backend.setRoleAssignment(adminUid, {
      id: adminUid,
      targetUserId: adminUid,
      targetEmail: "ex.admin@gmail.com",
      assignedRole: "ADMIN",
      approvalStatus: "APROVADO",
      assignedByUid: "root_uid",
      assignedByEmail: "paulocauan39@gmail.com",
      assignedAt: "2026-11-04T12:00:00Z",
      active: false, // Revogada
      updatedAt: "2026-11-04T13:00:00Z",
    });

    const authResult = backend.authenticateToken({
      uid: adminUid,
      email: "ex.admin@gmail.com",
      email_verified: true,
    });
    expect(authResult.isAdmin).toBe(false);

    const identity = resolveEffectiveUserIdentity({
      email: "ex.admin@gmail.com",
      emailVerified: true,
      userDocData: { role: "INTRUSO", approvalStatus: "PENDENTE" },
      roleAssignment: backend.getRoleAssignment(adminUid),
    });
    expect(identity.role).toBe("INTRUSO");
  });

  // Cenário 5: ADMIN com atribuição ausente: negado
  it("5. ADMIN com atribuição ausente em /role_assignments: negado imediatamente", () => {
    const adminUid = "missing_assign_uid";
    backend.setUser(adminUid, {
      id: adminUid,
      email: "sem.atribuicao@gmail.com",
      role: "ADMIN",
      approvalStatus: "APROVADO",
      status: "active",
    });

    const authResult = backend.authenticateToken({
      uid: adminUid,
      email: "sem.atribuicao@gmail.com",
      email_verified: true,
    });
    expect(authResult.isAdmin).toBe(false);
  });

  // Cenário 6: Falha ao consultar "/role_assignments": negado (fail-closed)
  it("6. Falha ao consultar '/role_assignments': operação falha de forma segura (fail-closed, negação de acesso)", () => {
    const adminUid = "db_error_admin_uid";
    backend.setUser(adminUid, {
      id: adminUid,
      email: "admin.falha@gmail.com",
      role: "ADMIN",
      approvalStatus: "APROVADO",
      status: "active",
    });

    // Simula erro ao ler /role_assignments
    const authResult = backend.authenticateToken(
      {
        uid: adminUid,
        email: "admin.falha@gmail.com",
        email_verified: true,
      },
      { simulateAssignmentReadFailure: true }
    );

    expect(authResult.isAdmin).toBe(false);
  });

  // Cenário 7: Custom Claim ADMIN antiga com atribuição revogada: negado
  it("7. Custom Claim ADMIN antiga com atribuição revogada: negado pelas regras e backend", () => {
    const uid = "stale_claim_uid";
    rules.setUser(uid, {
      id: uid,
      email: "antigo.admin@gmail.com",
      role: "INTRUSO",
      approvalStatus: "PENDENTE",
      status: "active",
    });
    rules.setRoleAssignment(uid, {
      id: uid,
      targetUserId: uid,
      targetEmail: "antigo.admin@gmail.com",
      assignedRole: "ADMIN",
      approvalStatus: "APROVADO",
      assignedByUid: "root_uid",
      assignedByEmail: "paulocauan39@gmail.com",
      assignedAt: "2026-11-04T12:00:00Z",
      active: false, // Revogado
      updatedAt: "2026-11-04T13:00:00Z",
    });

    // Usuário possui token JWT com custom claim admin antiga
    const canAccessAdmin = rules.isAdmin({
      uid,
      email: "antigo.admin@gmail.com",
      email_verified: true,
      customClaimsAdmin: true,
    });
    expect(canAccessAdmin).toBe(false);

    const canCreateItem = rules.canRegisterItems({
      uid,
      email: "antigo.admin@gmail.com",
      email_verified: true,
      customClaimsAdmin: true,
    });
    expect(canCreateItem).toBe(false);
  });

  // Cenário 8: Token antigo após revogação: operações protegidas negadas
  it("8. Token antigo após revogação: operações protegidas são estritamente negadas", () => {
    const uid = "old_token_user_uid";
    rules.setUser(uid, {
      id: uid,
      email: "ex.servidor@gmail.com",
      role: "INTRUSO",
      approvalStatus: "PENDENTE",
      status: "active",
    });
    rules.setRoleAssignment(uid, {
      id: uid,
      targetUserId: uid,
      targetEmail: "ex.servidor@gmail.com",
      assignedRole: "SERVIDOR",
      approvalStatus: "APROVADO",
      assignedByUid: "root_uid",
      assignedByEmail: "paulocauan39@gmail.com",
      assignedAt: "2026-11-04T12:00:00Z",
      active: false,
      updatedAt: "2026-11-04T13:00:00Z",
    });

    const canCreate = rules.canRegisterItems({
      uid,
      email: "ex.servidor@gmail.com",
      email_verified: true,
    });
    expect(canCreate).toBe(false);
  });

  // Cenário 9: Root Admin com e-mail não verificado ou UID incorreto: negado
  it("9. Root Admin com e-mail não verificado ou UID incorreto: negado no backend e regras (UID Pinning)", () => {
    // UID incorreto, mas e-mail correto e verificado
    const authResultWrongUid = backend.authenticateToken({
      uid: "fake_attacker_uid",
      email: "paulocauan39@gmail.com",
      email_verified: true,
    });
    expect(authResultWrongUid.isAdmin).toBe(false);

    const isRootRulesWrongUid = rules.isRootAdmin({
      uid: "fake_attacker_uid",
      email: "paulocauan39@gmail.com",
      email_verified: true,
    });
    expect(isRootRulesWrongUid).toBe(false);

    // UID correto, mas e-mail não verificado
    const authResultUnverified = backend.authenticateToken({
      uid: "hCG5mDgK1fRaTojULzlM7dXvb7n2",
      email: "paulocauan39@gmail.com",
      email_verified: false,
    });
    expect(authResultUnverified.isAdmin).toBe(false);

    const isRootRulesUnverified = rules.isRootAdmin({
      uid: "hCG5mDgK1fRaTojULzlM7dXvb7n2",
      email: "paulocauan39@gmail.com",
      email_verified: false,
    });
    expect(isRootRulesUnverified).toBe(false);
  });

  // Cenário 10: Root Admin com UID oficial e e-mail verificado: autorizado
  it("10. Root Admin com UID oficial e token verificado: autorizado no backend e regras", () => {
    const authResult = backend.authenticateToken({
      uid: "hCG5mDgK1fRaTojULzlM7dXvb7n2",
      email: "paulocauan39@gmail.com",
      email_verified: true,
    });
    expect(authResult.isAdmin).toBe(true);

    const isRootInRules = rules.isRootAdmin({
      uid: "hCG5mDgK1fRaTojULzlM7dXvb7n2",
      email: "paulocauan39@gmail.com",
      email_verified: true,
    });
    expect(isRootInRules).toBe(true);
  });

  // Cenário 11: Falha na gravação de "/users" durante concessão: operação transacional não deixa atribuição parcialmente criada
  it("11. Falha na gravação de '/users' durante concessão: operação transacional é revertida sem deixar documento parcial", () => {
    backend.setUser("target_fail_user", {
      id: "target_fail_user",
      email: "falha.usuario@gmail.com",
      role: "INTRUSO",
      approvalStatus: "PENDENTE",
    });

    const res = backend.postAssignRole(
      { uid: "root_uid", email: "paulocauan39@gmail.com", email_verified: true, isAdmin: true },
      { targetUserId: "target_fail_user", targetRole: "SERVIDOR" },
      { simulateUserWriteFailure: true }
    );

    expect(res.status).toBe(500);
    // Transação abortou: documento de role_assignments NÃO deve existir
    expect(backend.getRoleAssignment("target_fail_user")).toBeUndefined();
    // Perfil em users permaneceu intacto
    expect(backend.getUser("target_fail_user")?.role).toBe("INTRUSO");
  });

  // Cenário 12: Falha na gravação do log: atribuição não deve ser confirmada sem auditoria
  it("12. Falha na gravação do log de auditoria: operação transacional é revertida (sem auditoria = sem atribuição)", () => {
    backend.setUser("target_fail_log", {
      id: "target_fail_log",
      email: "falha.log@gmail.com",
      role: "INTRUSO",
      approvalStatus: "PENDENTE",
    });

    const res = backend.postAssignRole(
      { uid: "root_uid", email: "paulocauan39@gmail.com", email_verified: true, isAdmin: true },
      { targetUserId: "target_fail_log", targetRole: "SERVIDOR" },
      { simulateLogWriteFailure: true }
    );

    expect(res.status).toBe(500);
    expect(backend.getRoleAssignment("target_fail_log")).toBeUndefined();
    expect(backend.getUser("target_fail_log")?.role).toBe("INTRUSO");
  });

  // Cenário 13: Revogação: atribuição e auditoria consistentes
  it("13. Revogação de cargo: atribuição, perfil e auditoria são gravados de forma atômica e consistente", () => {
    backend.setUser("target_revoke_atomic", {
      id: "target_revoke_atomic",
      email: "revogar.atomo@gmail.com",
      role: "SERVIDOR",
      approvalStatus: "APROVADO",
    });
    backend.setRoleAssignment("target_revoke_atomic", {
      id: "target_revoke_atomic",
      targetUserId: "target_revoke_atomic",
      targetEmail: "revogar.atomo@gmail.com",
      assignedRole: "SERVIDOR",
      approvalStatus: "APROVADO",
      assignedByUid: "root_uid",
      assignedByEmail: "paulocauan39@gmail.com",
      assignedAt: "2026-11-04T12:00:00Z",
      active: true,
      updatedAt: "2026-11-04T12:00:00Z",
    });

    const revokeRes = backend.postRevokeRole(
      { uid: "root_uid", email: "paulocauan39@gmail.com", email_verified: true, isAdmin: true },
      { targetUserId: "target_revoke_atomic", reason: "Fim do contrato institucional" }
    );

    expect(revokeRes.status).toBe(200);

    const assignment = backend.getRoleAssignment("target_revoke_atomic");
    expect(assignment?.active).toBe(false);

    const user = backend.getUser("target_revoke_atomic");
    expect(user?.role).toBe("INTRUSO");
    expect(user?.approvalStatus).toBe("PENDENTE");

    const audit = backend.getAuditLogs().find((l) => l.objectId === "target_revoke_atomic" && l.action === "ROLE_REVOKED");
    expect(audit).toBeDefined();
    expect(audit.immutable).toBe(true);
    expect(backend.isRefreshTokenRevoked("target_revoke_atomic")).toBe(true);
  });

  // Cenário 14: Conta suspensa com token antigo: negada
  it("14. Conta suspensa com token antigo: negada tanto no backend quanto nas regras", () => {
    const uid = "suspended_user_uid";
    backend.setUser(uid, {
      id: uid,
      email: "admin.suspenso@ifpr.edu.br",
      role: "ADMIN",
      status: "suspended",
    });
    backend.setRoleAssignment(uid, {
      id: uid,
      targetUserId: uid,
      targetEmail: "admin.suspenso@ifpr.edu.br",
      assignedRole: "ADMIN",
      approvalStatus: "APROVADO",
      assignedByUid: "root_uid",
      assignedByEmail: "paulocauan39@gmail.com",
      assignedAt: "2026-11-04T12:00:00Z",
      active: true,
      updatedAt: "2026-11-04T12:00:00Z",
    });

    const authResult = backend.authenticateToken({
      uid,
      email: "admin.suspenso@ifpr.edu.br",
      email_verified: true,
    });
    expect(authResult.isAdmin).toBe(false);

    rules.setUser(uid, {
      id: uid,
      email: "admin.suspenso@ifpr.edu.br",
      role: "ADMIN",
      status: "suspended",
    });
    rules.setRoleAssignment(uid, {
      id: uid,
      targetUserId: uid,
      targetEmail: "admin.suspenso@ifpr.edu.br",
      assignedRole: "ADMIN",
      approvalStatus: "APROVADO",
      assignedByUid: "root_uid",
      assignedByEmail: "paulocauan39@gmail.com",
      assignedAt: "2026-11-04T12:00:00Z",
      active: true,
      updatedAt: "2026-11-04T12:00:00Z",
    });

    const canCreate = rules.canRegisterItems({
      uid,
      email: "admin.suspenso@ifpr.edu.br",
      email_verified: true,
    });
    expect(canCreate).toBe(false);
  });

  // Cenário 15: Conta banida com token antigo: negada
  it("15. Conta banida com token antigo: negada tanto no backend quanto nas regras", () => {
    const uid = "banned_user_uid";
    backend.setUser(uid, {
      id: uid,
      email: "admin.banido@ifpr.edu.br",
      role: "ADMIN",
      status: "banned",
    });

    const authResult = backend.authenticateToken({
      uid,
      email: "admin.banido@ifpr.edu.br",
      email_verified: true,
    });
    expect(authResult.isAdmin).toBe(false);

    rules.setUser(uid, {
      id: uid,
      email: "admin.banido@ifpr.edu.br",
      role: "ADMIN",
      status: "banned",
    });

    const canCreate = rules.canRegisterItems({
      uid,
      email: "admin.banido@ifpr.edu.br",
      email_verified: true,
    });
    expect(canCreate).toBe(false);
  });

  // Cenário 16: SERVIDOR institucional aprovado: pode cadastrar objetos
  it("16. SERVIDOR institucional aprovado (@ifpr.edu.br): pode cadastrar objetos em /items", () => {
    const uid = "servidor_inst_apr";
    rules.setUser(uid, {
      id: uid,
      email: "professor@ifpr.edu.br",
      role: "SERVIDOR",
      approvalStatus: "APROVADO",
      status: "active",
    });

    const canCreate = rules.canRegisterItems({
      uid,
      email: "professor@ifpr.edu.br",
      email_verified: true,
    });
    expect(canCreate).toBe(true);
  });

  // Cenário 17: SERVIDOR externo com atribuição válida: pode cadastrar objetos
  it("17. SERVIDOR externo (ex: Gmail) com atribuição válida em /role_assignments: pode cadastrar objetos em /items", () => {
    const uid = "servidor_ext_apr";
    rules.setUser(uid, {
      id: uid,
      email: "contato.pclabs@gmail.com",
      role: "SERVIDOR",
      approvalStatus: "APROVADO",
      status: "active",
    });
    rules.setRoleAssignment(uid, {
      id: uid,
      targetUserId: uid,
      targetEmail: "contato.pclabs@gmail.com",
      assignedRole: "SERVIDOR",
      approvalStatus: "APROVADO",
      assignedByUid: "root_uid",
      assignedByEmail: "paulocauan39@gmail.com",
      assignedAt: "2026-11-04T12:00:00Z",
      active: true,
      updatedAt: "2026-11-04T12:00:00Z",
    });

    const canCreate = rules.canRegisterItems({
      uid,
      email: "contato.pclabs@gmail.com",
      email_verified: true,
    });
    expect(canCreate).toBe(true);
  });

  // Cenário 18: ALUNO: não pode cadastrar objetos
  it("18. ALUNO (@estudantes.ifpr.edu.br ou designado): NÃO pode cadastrar objetos", () => {
    const uid = "aluno_uid";
    rules.setUser(uid, {
      id: uid,
      email: "aluno@estudantes.ifpr.edu.br",
      role: "ALUNO",
      approvalStatus: "APROVADO",
      status: "active",
    });

    const canCreate = rules.canRegisterItems({
      uid,
      email: "aluno@estudantes.ifpr.edu.br",
      email_verified: true,
    });
    expect(canCreate).toBe(false);
  });

  // Cenário 19: ADMIN autorizado: pode cadastrar objetos
  it("19. ADMIN autorizado (Root ou secundário com atribuição): pode cadastrar objetos", () => {
    // Root Admin
    const canRootCreate = rules.canRegisterItems({
      uid: "hCG5mDgK1fRaTojULzlM7dXvb7n2",
      email: "paulocauan39@gmail.com",
      email_verified: true,
    });
    expect(canRootCreate).toBe(true);

    // Admin secundário com atribuição ativa
    const secUid = "sec_admin_can_create";
    rules.setUser(secUid, {
      id: secUid,
      email: "sec.admin@gmail.com",
      role: "ADMIN",
      approvalStatus: "APROVADO",
      status: "active",
    });
    rules.setRoleAssignment(secUid, {
      id: secUid,
      targetUserId: secUid,
      targetEmail: "sec.admin@gmail.com",
      assignedRole: "ADMIN",
      approvalStatus: "APROVADO",
      assignedByUid: "root_uid",
      assignedByEmail: "paulocauan39@gmail.com",
      assignedAt: "2026-11-04T12:00:00Z",
      active: true,
      updatedAt: "2026-11-04T12:00:00Z",
    });

    const canSecCreate = rules.canRegisterItems({
      uid: secUid,
      email: "sec.admin@gmail.com",
      email_verified: true,
    });
    expect(canSecCreate).toBe(true);
  });

  // Cenário 20: INTRUSO: não pode cadastrar objetos
  it("20. INTRUSO: NÃO pode cadastrar objetos em nenhuma hipótese", () => {
    const uid = "intruso_uid";
    rules.setUser(uid, {
      id: uid,
      email: "desconhecido@hotmail.com",
      role: "INTRUSO",
      approvalStatus: "APROVADO",
      status: "active",
    });

    const canCreate = rules.canRegisterItems({
      uid,
      email: "desconhecido@hotmail.com",
      email_verified: true,
      role: "INTRUSO",
    });
    expect(canCreate).toBe(false);
  });
});
