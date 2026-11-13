import { describe, it, expect } from "vitest";
import { resolveEffectiveUserIdentity } from "../context/AppContext";
import { canOperateFormalReturn, canReopenFormalReturn } from "./devolutionAuth";

describe("LOCALIZA+ — Suíte de Testes de Homologação de Autorização (Etapa de Correção)", () => {
  it("A. Servidor com e-mail externo (ex: Gmail) explicitamente atribuído e aprovado consegue permissão de cadastro/operação", () => {
    const identity = resolveEffectiveUserIdentity({
      email: "contato.pclabs@gmail.com",
      emailVerified: true,
      userDocData: { role: "SERVIDOR", approvalStatus: "APROVADO", roleAssignedBy: "paulocauan39@gmail.com" },
      roleAssignment: {
        id: "uid-servidor-gmail",
        targetUserId: "uid-servidor-gmail",
        targetEmail: "contato.pclabs@gmail.com",
        assignedRole: "SERVIDOR",
        approvalStatus: "APROVADO",
        assignedByUid: "admin",
        assignedByEmail: "paulocauan39@gmail.com",
        assignedByName: "Admin",
        assignedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        active: true,
      },
    });

    expect(identity.role).toBe("SERVIDOR");
    expect(identity.approvalStatus).toBe("APROVADO");

    const canOperate = canOperateFormalReturn(
      { id: "uid-servidor-gmail", role: "SERVIDOR", approvalStatus: "APROVADO", status: "active" },
      { uid: "uid-servidor-gmail", email: "contato.pclabs@gmail.com", emailVerified: true },
      false
    );
    expect(canOperate).toBe(true);
  });

  it("B. Servidor institucional (@ifpr.edu.br) aprovado consegue permissão", () => {
    const identity = resolveEffectiveUserIdentity({
      email: "servidor.taes@ifpr.edu.br",
      emailVerified: true,
      userDocData: { role: "SERVIDOR", approvalStatus: "APROVADO" },
    });

    expect(identity.role).toBe("SERVIDOR");
    expect(identity.approvalStatus).toBe("APROVADO");
  });

  it("C. Servidor pendente não consegue operar devoluções nem cadastrar", () => {
    const canOperate = canOperateFormalReturn(
      { id: "uid-servidor-pendente", role: "SERVIDOR", approvalStatus: "PENDENTE", status: "active" },
      { uid: "uid-servidor-pendente", email: "pendente@ifpr.edu.br", emailVerified: true },
      false
    );
    expect(canOperate).toBe(false);
  });

  it("D. Aluno não consegue operar devoluções nem cadastrar", () => {
    const canOperate = canOperateFormalReturn(
      { id: "uid-aluno", role: "ALUNO", approvalStatus: "APROVADO", status: "active" },
      { uid: "uid-aluno", email: "estudante@estudantes.ifpr.edu.br", emailVerified: true },
      false
    );
    expect(canOperate).toBe(false);
  });

  it("E. Intruso / Usuário externo não aprovado não consegue operar", () => {
    const identity = resolveEffectiveUserIdentity({
      email: "externo@gmail.com",
      emailVerified: true,
      userDocData: { role: "INTRUSO", approvalStatus: "PENDENTE" },
    });

    expect(identity.role).toBe("INTRUSO");
    expect(identity.approvalStatus).toBe("APROVADO");

    const canOperate = canOperateFormalReturn(
      { id: "uid-intruso", role: "INTRUSO", approvalStatus: "PENDENTE", status: "active" },
      { uid: "uid-intruso", email: "externo@gmail.com", emailVerified: true },
      false
    );
    expect(canOperate).toBe(false);
  });

  it("F. Admin aprovado consegue operar", () => {
    const canOperate = canOperateFormalReturn(
      { id: "uid-admin", role: "ADMIN", approvalStatus: "APROVADO", status: "active" },
      { uid: "uid-admin", email: "admin@ifpr.edu.br", emailVerified: true },
      false
    );
    expect(canOperate).toBe(true);

    const canReopen = canReopenFormalReturn(
      { id: "uid-admin", role: "ADMIN", approvalStatus: "APROVADO", status: "active" },
      { uid: "uid-admin", email: "admin@ifpr.edu.br", emailVerified: true },
      false
    );
    expect(canReopen).toBe(true);
  });

  it("G. Admin raiz (paulocauan39@gmail.com) é reconhecido com plenos poderes", () => {
    const identity = resolveEffectiveUserIdentity({
      email: "paulocauan39@gmail.com",
      emailVerified: true,
    });

    expect(identity.role).toBe("ADMIN");
    expect(identity.approvalStatus).toBe("APROVADO");

    const canReopen = canReopenFormalReturn(
      { id: "hCG5mDgK1fRaTojULzlM7dXvb7n2", role: "ADMIN", approvalStatus: "APROVADO", status: "active", email: "paulocauan39@gmail.com" },
      { uid: "hCG5mDgK1fRaTojULzlM7dXvb7n2", email: "paulocauan39@gmail.com", emailVerified: true },
      false
    );
    expect(canReopen).toBe(true);
  });

  it("H. Anti-downgrade guard preserva atribuições administrativas válidas", () => {
    const identity = resolveEffectiveUserIdentity({
      email: "servidor.designado@gmail.com",
      emailVerified: true,
      userDocData: { role: "SERVIDOR", approvalStatus: "APROVADO", roleAssignedBy: "paulocauan39@gmail.com" },
      roleAssignment: null,
    });

    expect(identity.role).toBe("SERVIDOR");
    expect(identity.approvalStatus).toBe("APROVADO");
  });
});
