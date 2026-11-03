import { describe, it, expect } from "vitest";
import { determineInstitutionalRole, previewInstitutionalRole } from "../context/AppContext";
import { UserRole } from "../types";

/**
 * Função pura que espelha exatamente a regra de resolução e precedência de targetRole em verifyUserInFirestore()
 */
function resolveTargetRole({
  email,
  emailVerified,
  existingRole,
  existingApprovalStatus,
}: {
  email: string;
  emailVerified: boolean;
  existingRole?: UserRole;
  existingApprovalStatus?: string;
}): UserRole {
  const cleanEmail = email.toLowerCase().trim();
  const isRoot = cleanEmail === "paulocauan39@gmail.com";
  const verifiedRoleDetermination = determineInstitutionalRole(cleanEmail, emailVerified);

  return isRoot
    ? "ADMIN"
    : (verifiedRoleDetermination.role === "INTRUSO")
    ? "INTRUSO"
    : (existingRole === "ADMIN" && existingApprovalStatus === "APROVADO" && isRoot)
    ? "ADMIN"
    : (existingRole === "SERVIDOR" && existingApprovalStatus === "APROVADO" && verifiedRoleDetermination.role === "SERVIDOR")
    ? "SERVIDOR"
    : verifiedRoleDetermination.role;
}

describe("LOCALIZA+ v1.10.10 — Precedência de Identidade Institucional em verifyUserInFirestore", () => {
  it("1. Gmail com documento antigo SERVIDOR/APROVADO -> INTRUSO", () => {
    const role = resolveTargetRole({
      email: "contato.pclabs@gmail.com",
      emailVerified: true,
      existingRole: "SERVIDOR",
      existingApprovalStatus: "APROVADO",
    });
    expect(role).toBe("INTRUSO");
  });

  it("2. Gmail com documento antigo ADMIN/APROVADO -> INTRUSO", () => {
    const role = resolveTargetRole({
      email: "falsroadmin@gmail.com",
      emailVerified: true,
      existingRole: "ADMIN",
      existingApprovalStatus: "APROVADO",
    });
    expect(role).toBe("INTRUSO");
  });

  it("3. E-mail institucional de aluno -> ALUNO", () => {
    const role = resolveTargetRole({
      email: "aluno.teste@estudantes.ifpr.edu.br",
      emailVerified: true,
      existingRole: "INTRUSO",
      existingApprovalStatus: "PENDENTE",
    });
    expect(role).toBe("ALUNO");
  });

  it("4. E-mail institucional de servidor aprovado -> SERVIDOR", () => {
    const role = resolveTargetRole({
      email: "servidor.teste@ifpr.edu.br",
      emailVerified: true,
      existingRole: "SERVIDOR",
      existingApprovalStatus: "APROVADO",
    });
    expect(role).toBe("SERVIDOR");
  });

  it("5. E-mail institucional de servidor pendente -> SERVIDOR (papel determinado pelo domínio, com approvalStatus pendente gerenciado separadamente)", () => {
    const role = resolveTargetRole({
      email: "novo.servidor@ifpr.edu.br",
      emailVerified: true,
      existingRole: "INTRUSO",
      existingApprovalStatus: "PENDENTE",
    });
    expect(role).toBe("SERVIDOR");
  });

  it("6. Root Admin oficial (paulocauan39@gmail.com) -> ADMIN", () => {
    const role = resolveTargetRole({
      email: "paulocauan39@gmail.com",
      emailVerified: true,
      existingRole: "ALUNO",
      existingApprovalStatus: "APROVADO",
    });
    expect(role).toBe("ADMIN");
  });

  it("7. Conta externa com perfil antigo privilegiado -> INTRUSO", () => {
    const role = resolveTargetRole({
      email: "visitante.externo@yahoo.com.br",
      emailVerified: true,
      existingRole: "SERVIDOR",
      existingApprovalStatus: "APROVADO",
    });
    expect(role).toBe("INTRUSO");
  });

  it("8. Migração por e-mail de conta externa não herda privilégios -> INTRUSO", () => {
    const role = resolveTargetRole({
      email: "externo.migracao@outlook.com",
      emailVerified: true,
      existingRole: "ADMIN",
      existingApprovalStatus: "APROVADO",
    });
    expect(role).toBe("INTRUSO");
  });

  it("9. Alteração de estado local/cache (tentativa de injetar role privilegiada no objeto existente) não concede autorização -> INTRUSO", () => {
    const role = resolveTargetRole({
      email: "atacante@gmail.com",
      emailVerified: true,
      existingRole: "SERVIDOR",
      existingApprovalStatus: "APROVADO",
    });
    expect(role).toBe("INTRUSO");
  });
});
