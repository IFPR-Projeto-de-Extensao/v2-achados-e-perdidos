import { User, RoleAssignment } from "../types";

export interface RoleAuditSummary {
  totalUsers: number;
  institutionalAccounts: User[];
  legacyExternalWithMetadata: User[];
  anomalousPrivilegedExternal: User[];
  externalIntrusos: User[];
  assignedInCollection: RoleAssignment[];
  needsReviewCount: number;
  readyForMigrationCount: number;
  reportDate: string;
}

/**
 * Identifica se um determinado e-mail pertence ao domínio institucional oficial do IFPR.
 */
export function isInstitutionalEmail(email?: string | null): boolean {
  if (!email || typeof email !== "string") return false;
  const clean = email.toLowerCase().trim();
  return (
    clean.endsWith("@estudantes.ifpr.edu.br") ||
    clean.endsWith("@ifpr.edu.br") ||
    clean.includes(".ifpr.edu.br")
  );
}

/**
 * Utilitário de auditoria e reconciliação segura de atribuições de cargos.
 * Analisa a base de usuários e as atribuições em /role_assignments para gerar
 * diagnóstico sem conversão cega ou mutação destrutiva em banco de dados.
 */
export function generateRoleAssignmentsAuditReport(
  users: User[],
  assignments: RoleAssignment[] = []
): RoleAuditSummary {
  const assignmentMap = new Map<string, RoleAssignment>();
  assignments.forEach((a) => {
    if (a && a.targetUserId) {
      assignmentMap.set(a.targetUserId, a);
    }
  });

  const institutionalAccounts: User[] = [];
  const legacyExternalWithMetadata: User[] = [];
  const anomalousPrivilegedExternal: User[] = [];
  const externalIntrusos: User[] = [];

  for (const user of users) {
    if (!user) continue;
    const isRoot = (user.email || "").toLowerCase() === "paulocauan39@gmail.com";
    if (isRoot) continue; // Root admin oficial tratado como âncora de segurança independente

    const institutional = isInstitutionalEmail(user.email);
    const hasRoleAssignment = assignmentMap.has(user.id);

    if (institutional) {
      institutionalAccounts.push(user);
    } else {
      // Conta externa (@gmail.com, etc.)
      const hasLegacyMetadata = Boolean(
        user.roleAssignedBy &&
        typeof user.roleAssignedBy === "string" &&
        user.roleAssignedBy.trim().length > 0
      );

      const isPrivileged = user.role === "SERVIDOR" || user.role === "ADMIN";

      if (hasRoleAssignment) {
        // Já possui registro seguro formal em /role_assignments
      } else if (hasLegacyMetadata && isPrivileged) {
        // Possui metadados legados mas ainda não está em /role_assignments -> candidata à validação/migração
        legacyExternalWithMetadata.push(user);
      } else if (!hasLegacyMetadata && isPrivileged) {
        // Possui cargo privilegiado mas nenhum metadado de atribuição -> anomalia a revisar
        anomalousPrivilegedExternal.push(user);
      } else {
        externalIntrusos.push(user);
      }
    }
  }

  return {
    totalUsers: users.length,
    institutionalAccounts,
    legacyExternalWithMetadata,
    anomalousPrivilegedExternal,
    externalIntrusos,
    assignedInCollection: assignments,
    needsReviewCount: anomalousPrivilegedExternal.length,
    readyForMigrationCount: legacyExternalWithMetadata.length,
    reportDate: new Date().toISOString(),
  };
}
