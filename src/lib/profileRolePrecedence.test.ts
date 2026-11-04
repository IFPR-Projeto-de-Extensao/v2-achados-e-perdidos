import { describe, it, expect } from "vitest";
import { resolveEffectiveUserIdentity } from "../context/AppContext";
import { User } from "../types";

describe("LOCALIZA+ v1.10.10 — Matriz Central de Identidade e Atribuição Administrativa", () => {
  // 1. Root Admin Oficial
  it("1. Root Admin Oficial (paulocauan39@gmail.com) é sempre ADMIN com status APROVADO", () => {
    const res = resolveEffectiveUserIdentity({
      email: "paulocauan39@gmail.com",
      emailVerified: true,
      userDocData: { role: "ALUNO", approvalStatus: "PENDENTE" },
    });
    expect(res.role).toBe("ADMIN");
    expect(res.approvalStatus).toBe("APROVADO");
    expect(res.isInstitutional).toBe(true);
    expect(res.isDesignated).toBe(false);
  });

  // 2. Zero-Trust: Contas não verificadas
  it("2. Contas externas ou institucionais com e-mail NÃO verificado são estritamente INTRUSO", () => {
    const unverifiedExt = resolveEffectiveUserIdentity({
      email: "contato.pclabs@gmail.com",
      emailVerified: false,
      userDocData: { role: "SERVIDOR", approvalStatus: "APROVADO" },
    });
    expect(unverifiedExt.role).toBe("INTRUSO");

    const unverifiedStaff = resolveEffectiveUserIdentity({
      email: "professor@ifpr.edu.br",
      emailVerified: false,
    });
    expect(unverifiedStaff.role).toBe("INTRUSO");
  });

  // 3. Classificação Automática Institucional: Estudante
  it("3. E-mail institucional de estudante (@estudantes.ifpr.edu.br) verificado -> ALUNO / APROVADO", () => {
    const res = resolveEffectiveUserIdentity({
      email: "aluno.teste@estudantes.ifpr.edu.br",
      emailVerified: true,
      userDocData: null,
    });
    expect(res.role).toBe("ALUNO");
    expect(res.approvalStatus).toBe("APROVADO");
    expect(res.isInstitutional).toBe(true);
    expect(res.isDesignated).toBe(false);
  });

  // 4. Classificação Automática Institucional: Servidor Aprovado
  it("4. E-mail institucional de servidor (@ifpr.edu.br) com documento APROVADO -> SERVIDOR / APROVADO", () => {
    const res = resolveEffectiveUserIdentity({
      email: "servidor.aprovado@ifpr.edu.br",
      emailVerified: true,
      userDocData: { role: "SERVIDOR", approvalStatus: "APROVADO" },
    });
    expect(res.role).toBe("SERVIDOR");
    expect(res.approvalStatus).toBe("APROVADO");
    expect(res.isInstitutional).toBe(true);
    expect(res.isDesignated).toBe(false);
  });

  // 5. Classificação Automática Institucional: Servidor Pendente
  it("5. E-mail institucional de servidor (@ifpr.edu.br) com documento PENDENTE -> SERVIDOR / PENDENTE", () => {
    const res = resolveEffectiveUserIdentity({
      email: "novo.servidor@ifpr.edu.br",
      emailVerified: true,
      userDocData: { role: "SERVIDOR", approvalStatus: "PENDENTE" },
    });
    expect(res.role).toBe("SERVIDOR");
    expect(res.approvalStatus).toBe("PENDENTE");
    expect(res.isInstitutional).toBe(true);
    expect(res.isDesignated).toBe(false);
  });

  // 6. Conta Externa sem Atribuição Administrativa -> INTRUSO
  it("6. Conta Gmail comum sem atribuição administrativa -> INTRUSO", () => {
    const res = resolveEffectiveUserIdentity({
      email: "usuario.comum@gmail.com",
      emailVerified: true,
      userDocData: null,
    });
    expect(res.role).toBe("INTRUSO");
    expect(res.isInstitutional).toBe(false);
    expect(res.isDesignated).toBe(false);
  });

  // 7. Neutralização de Documentos Legados sem roleAssignedBy
  it("7. Conta Gmail com documento legado SERVIDOR/APROVADO sem roleAssignedBy é neutralizada como INTRUSO", () => {
    const res = resolveEffectiveUserIdentity({
      email: "contato.pclabs@gmail.com",
      emailVerified: true,
      userDocData: {
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        // Sem roleAssignedBy ou vazio
      },
    });
    expect(res.role).toBe("INTRUSO");
    expect(res.isInstitutional).toBe(false);
    expect(res.isDesignated).toBe(false);
  });

  it("8. Conta Gmail com documento legado ADMIN/APROVADO sem roleAssignedBy é neutralizada como INTRUSO", () => {
    const res = resolveEffectiveUserIdentity({
      email: "falso.admin@gmail.com",
      emailVerified: true,
      userDocData: {
        role: "ADMIN",
        approvalStatus: "APROVADO",
        roleAssignedBy: "", // Espaço vazio não conta como atribuição válida
        roleAssignedAt: "",
      },
    });
    expect(res.role).toBe("INTRUSO");
    expect(res.isInstitutional).toBe(false);
  });

  // 9. Atribuição Administrativa Legítima: SERVIDOR Designado Aprovado via /role_assignments
  it("9. Conta externa com atribuição legítima de SERVIDOR via RoleAssignment -> SERVIDOR / APROVADO", () => {
    const res = resolveEffectiveUserIdentity({
      email: "contato.pclabs@gmail.com",
      emailVerified: true,
      userDocData: { role: "INTRUSO", approvalStatus: "PENDENTE" },
      roleAssignment: {
        id: "uid_pclabs",
        targetUserId: "uid_pclabs",
        targetEmail: "contato.pclabs@gmail.com",
        assignedRole: "SERVIDOR",
        approvalStatus: "APROVADO",
        assignedByUid: "admin_uid_root",
        assignedByEmail: "paulocauan39@gmail.com",
        assignedByName: "Paulo Cauan",
        assignedAt: "2026-11-04T12:00:00.000Z",
        active: true,
        updatedAt: "2026-11-04T12:00:00.000Z",
      },
    });
    expect(res.role).toBe("SERVIDOR");
    expect(res.approvalStatus).toBe("APROVADO");
    expect(res.isInstitutional).toBe(true);
    expect(res.isDesignated).toBe(true);
    expect(res.label).toContain("Servidor Designado (Aprovado)");
  });

  // 10. Atribuição Administrativa: SERVIDOR Designado Pendente
  it("10. Conta externa com atribuição de SERVIDOR com aprovação PENDENTE -> SERVIDOR / PENDENTE", () => {
    const res = resolveEffectiveUserIdentity({
      email: "parceiro.externo@gmail.com",
      emailVerified: true,
      userDocData: { role: "INTRUSO", approvalStatus: "PENDENTE" },
      roleAssignment: {
        id: "uid_parceiro",
        targetUserId: "uid_parceiro",
        targetEmail: "parceiro.externo@gmail.com",
        assignedRole: "SERVIDOR",
        approvalStatus: "PENDENTE",
        assignedByUid: "admin_uid_root",
        assignedByEmail: "paulocauan39@gmail.com",
        assignedByName: "Paulo Cauan",
        assignedAt: "2026-11-04T12:00:00.000Z",
        active: true,
        updatedAt: "2026-11-04T12:00:00.000Z",
      },
    });
    expect(res.role).toBe("SERVIDOR");
    expect(res.approvalStatus).toBe("PENDENTE");
    expect(res.isInstitutional).toBe(true);
    expect(res.isDesignated).toBe(true);
  });

  // 11. Atribuição Administrativa: ADMIN Designado
  it("11. Conta externa com atribuição de ADMIN concedida pelo Root Admin -> ADMIN / APROVADO", () => {
    const res = resolveEffectiveUserIdentity({
      email: "admin.suporte@gmail.com",
      emailVerified: true,
      userDocData: { role: "INTRUSO", approvalStatus: "PENDENTE" },
      roleAssignment: {
        id: "uid_admin_sec",
        targetUserId: "uid_admin_sec",
        targetEmail: "admin.suporte@gmail.com",
        assignedRole: "ADMIN",
        approvalStatus: "APROVADO",
        assignedByUid: "admin_uid_root",
        assignedByEmail: "paulocauan39@gmail.com",
        assignedByName: "Paulo Cauan",
        assignedAt: "2026-11-04T12:00:00.000Z",
        active: true,
        updatedAt: "2026-11-04T12:00:00.000Z",
      },
    });
    expect(res.role).toBe("ADMIN");
    expect(res.approvalStatus).toBe("APROVADO");
    expect(res.isInstitutional).toBe(true);
    expect(res.isDesignated).toBe(true);
  });

  // 12. Atribuição Administrativa: ALUNO Designado
  it("12. Conta externa com atribuição de ALUNO -> ALUNO / APROVADO", () => {
    const res = resolveEffectiveUserIdentity({
      email: "estudante.externo@hotmail.com",
      emailVerified: true,
      userDocData: { role: "INTRUSO", approvalStatus: "PENDENTE" },
      roleAssignment: {
        id: "uid_aluno_ext",
        targetUserId: "uid_aluno_ext",
        targetEmail: "estudante.externo@hotmail.com",
        assignedRole: "ALUNO",
        approvalStatus: "APROVADO",
        assignedByUid: "admin_uid_root",
        assignedByEmail: "paulocauan39@gmail.com",
        assignedByName: "Paulo Cauan",
        assignedAt: "2026-11-04T12:00:00.000Z",
        active: true,
        updatedAt: "2026-11-04T12:00:00.000Z",
      },
    });
    expect(res.role).toBe("ALUNO");
    expect(res.approvalStatus).toBe("APROVADO");
    expect(res.isInstitutional).toBe(true);
    expect(res.isDesignated).toBe(true);
  });

  // 13. Legado em /users com roleAssignedBy mas SEM /role_assignments -> Neutralizado como INTRUSO
  it("13. Conta com metadados legados em /users mas SEM /role_assignments é neutralizada como INTRUSO", () => {
    const res = resolveEffectiveUserIdentity({
      email: "ex.servidor@gmail.com",
      emailVerified: true,
      userDocData: {
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        roleAssignedBy: "admin_uid_root",
        roleAssignedByName: "Paulo Cauan",
        roleAssignedAt: "2026-11-04T12:00:00.000Z",
      },
      // Sem roleAssignment document
    });
    expect(res.role).toBe("INTRUSO");
    expect(res.isInstitutional).toBe(false);
    expect(res.isDesignated).toBe(false);
  });

  // 14. Matriz de Autorização de Cadastro de Objeto (canRegisterItems logic)
  it("14. Matriz de Cadastro de Objetos reflete precisamente as regras do sistema", () => {
    const canRegisterItem = (identity: { role: string; approvalStatus: string }) => {
      if (identity.role === "ADMIN") return true;
      if (identity.role === "SERVIDOR" && identity.approvalStatus === "APROVADO") return true;
      return false;
    };

    // Servidor institucional aprovado -> Pode cadastrar
    const staffApproved = resolveEffectiveUserIdentity({
      email: "prof@ifpr.edu.br",
      emailVerified: true,
      userDocData: { role: "SERVIDOR", approvalStatus: "APROVADO" },
    });
    expect(canRegisterItem(staffApproved)).toBe(true);

    // Servidor institucional pendente -> NÃO pode cadastrar
    const staffPending = resolveEffectiveUserIdentity({
      email: "prof@ifpr.edu.br",
      emailVerified: true,
      userDocData: { role: "SERVIDOR", approvalStatus: "PENDENTE" },
    });
    expect(canRegisterItem(staffPending)).toBe(false);

    // Servidor designado aprovado (ex: contato.pclabs@gmail.com com roleAssignment ativo) -> Pode cadastrar
    const designatedStaffApproved = resolveEffectiveUserIdentity({
      email: "contato.pclabs@gmail.com",
      emailVerified: true,
      userDocData: { role: "SERVIDOR", approvalStatus: "APROVADO" },
      roleAssignment: {
        id: "uid_pclabs",
        targetUserId: "uid_pclabs",
        targetEmail: "contato.pclabs@gmail.com",
        assignedRole: "SERVIDOR",
        approvalStatus: "APROVADO",
        assignedByUid: "admin_uid_root",
        assignedByEmail: "paulocauan39@gmail.com",
        assignedAt: "2026-11-04T12:00:00.000Z",
        active: true,
        updatedAt: "2026-11-04T12:00:00.000Z",
      },
    });
    expect(canRegisterItem(designatedStaffApproved)).toBe(true);

    // Servidor designado pendente -> NÃO pode cadastrar
    const designatedStaffPending = resolveEffectiveUserIdentity({
      email: "contato.pclabs@gmail.com",
      emailVerified: true,
      userDocData: { role: "SERVIDOR", approvalStatus: "PENDENTE" },
      roleAssignment: {
        id: "uid_pclabs",
        targetUserId: "uid_pclabs",
        targetEmail: "contato.pclabs@gmail.com",
        assignedRole: "SERVIDOR",
        approvalStatus: "PENDENTE",
        assignedByUid: "admin_uid_root",
        assignedByEmail: "paulocauan39@gmail.com",
        assignedAt: "2026-11-04T12:00:00.000Z",
        active: true,
        updatedAt: "2026-11-04T12:00:00.000Z",
      },
    });
    expect(canRegisterItem(designatedStaffPending)).toBe(false);

    // Servidor legado sem atribuição administrativa -> INTRUSO -> NÃO pode cadastrar
    const legacyStaff = resolveEffectiveUserIdentity({
      email: "contato.pclabs@gmail.com",
      emailVerified: true,
      userDocData: { role: "SERVIDOR", approvalStatus: "APROVADO" },
    });
    expect(canRegisterItem(legacyStaff)).toBe(false);

    // Aluno institucional ou designado -> NÃO pode cadastrar
    const student = resolveEffectiveUserIdentity({
      email: "aluno@estudantes.ifpr.edu.br",
      emailVerified: true,
      userDocData: { role: "ALUNO", approvalStatus: "APROVADO" },
    });
    expect(canRegisterItem(student)).toBe(false);

    // Intruso -> NÃO pode cadastrar
    const intruso = resolveEffectiveUserIdentity({
      email: "invasor@gmail.com",
      emailVerified: true,
      userDocData: null,
    });
    expect(canRegisterItem(intruso)).toBe(false);

    // Admin designado -> Pode cadastrar
    const designatedAdmin = resolveEffectiveUserIdentity({
      email: "admin.externo@gmail.com",
      emailVerified: true,
      userDocData: {
        role: "ADMIN",
        approvalStatus: "APROVADO",
      },
      roleAssignment: {
        id: "uid_admin_ext",
        targetUserId: "uid_admin_ext",
        targetEmail: "admin.externo@gmail.com",
        assignedRole: "ADMIN",
        approvalStatus: "APROVADO",
        assignedByUid: "admin_uid_root",
        assignedByEmail: "paulocauan39@gmail.com",
        assignedAt: "2026-11-04T12:00:00.000Z",
        active: true,
        updatedAt: "2026-11-04T12:00:00.000Z",
      },
    });
    expect(canRegisterItem(designatedAdmin)).toBe(true);

    // Root Admin -> Pode cadastrar
    const rootAdmin = resolveEffectiveUserIdentity({
      email: "paulocauan39@gmail.com",
      emailVerified: true,
      userDocData: null,
    });
    expect(canRegisterItem(rootAdmin)).toBe(true);
  });

  // 15. Atribuição via Coleção Segura RoleAssignment (/role_assignments/{uid})
  it("15. Atribuição via RoleAssignment ativo tem precedência e concede SERVIDOR / APROVADO", () => {
    const res = resolveEffectiveUserIdentity({
      email: "contato.pclabs@gmail.com",
      emailVerified: true,
      userDocData: { role: "INTRUSO", approvalStatus: "PENDENTE" },
      roleAssignment: {
        id: "uid_pclabs",
        targetUserId: "uid_pclabs",
        targetEmail: "contato.pclabs@gmail.com",
        assignedRole: "SERVIDOR",
        approvalStatus: "APROVADO",
        assignedByUid: "root_uid",
        assignedByEmail: "paulocauan39@gmail.com",
        assignedAt: "2026-11-04T12:00:00.000Z",
        active: true,
        updatedAt: "2026-11-04T12:00:00.000Z",
      },
    });
    expect(res.role).toBe("SERVIDOR");
    expect(res.approvalStatus).toBe("APROVADO");
    expect(res.isInstitutional).toBe(true);
    expect(res.isDesignated).toBe(true);
  });

  // 16. RoleAssignment inativo (revogado)
  it("16. RoleAssignment inativo (active: false) não concede privilégios e classifica conta externa como INTRUSO", () => {
    const res = resolveEffectiveUserIdentity({
      email: "contato.pclabs@gmail.com",
      emailVerified: true,
      userDocData: { role: "INTRUSO" },
      roleAssignment: {
        id: "uid_pclabs",
        targetUserId: "uid_pclabs",
        targetEmail: "contato.pclabs@gmail.com",
        assignedRole: "SERVIDOR",
        approvalStatus: "APROVADO",
        assignedByUid: "root_uid",
        assignedByEmail: "paulocauan39@gmail.com",
        assignedAt: "2026-11-04T12:00:00.000Z",
        active: false,
        updatedAt: "2026-11-04T12:00:00.000Z",
      },
    });
    expect(res.role).toBe("INTRUSO");
    expect(res.isInstitutional).toBe(false);
  });
});
