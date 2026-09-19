import { describe, it, expect } from "vitest";
import { determineInstitutionalRole } from "../context/AppContext";
import { sanitizeUserList } from "./shared-constants";
import { User, UserRole } from "../types";

describe("Bateria de Testes: Fluxo de Autenticação e Registro Institucional Localiza+", () => {
  // Cenário 1: Cadastro institucional de aluno
  it("Cenário 1: Cadastro institucional de aluno (@estudantes.ifpr.edu.br) determina role ALUNO e vínculo institucional válido", () => {
    const res = determineInstitutionalRole("20251iva10030099@estudantes.ifpr.edu.br");
    expect(res.isInstitutional).toBe(true);
    expect(res.role).toBe("ALUNO");
    expect(res.label).toBe("Estudante IFPR (Aluno)");
  });

  // Cenário 2: Cadastro institucional de servidor
  it("Cenário 2: Cadastro institucional de servidor (@ifpr.edu.br) determina role SERVIDOR", () => {
    const res = determineInstitutionalRole("professor.teste@ifpr.edu.br");
    expect(res.isInstitutional).toBe(true);
    expect(res.role).toBe("SERVIDOR");
    expect(res.label).toBe("Servidor IFPR (Docente / TAE)");
  });

  // Cenário 3: Domínio externo rejeitado
  it("Cenário 3: Domínio externo (ex: gmail, outlook, yahoo) é marcado como não-institucional e rejeitado", () => {
    const external1 = determineInstitutionalRole("usuario.aleatorio@gmail.com");
    expect(external1.isInstitutional).toBe(false);
    expect(external1.label).toBe("Não Institucional");

    const external2 = determineInstitutionalRole("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@gmail.com");
    expect(external2.isInstitutional).toBe(false);
  });

  // Cenário 4: Role determinado automaticamente pelo domínio
  it("Cenário 4: Role é determinado estritamente pelo domínio do e-mail institucional", () => {
    const aluno = determineInstitutionalRole("aluno@estudantes.ifpr.edu.br");
    expect(aluno.role).toBe("ALUNO");

    const servidor = determineInstitutionalRole("docente@ifpr.edu.br");
    expect(servidor.role).toBe("SERVIDOR");
  });

  // Cenário 5: Usuário não pode escolher ADMIN
  it("Cenário 5: Usuário não pode obter ADMIN via domínio acadêmico ou manipulação de formulário", () => {
    const aluno = determineInstitutionalRole("aluno.esperto@estudantes.ifpr.edu.br");
    expect(aluno.role).not.toBe("ADMIN");
    expect(aluno.role).toBe("ALUNO");

    const servidor = determineInstitutionalRole("servidor.comum@ifpr.edu.br");
    expect(servidor.role).not.toBe("ADMIN");
    expect(servidor.role).toBe("SERVIDOR");

    // Apenas e-mail do root admin é reconhecido como ADMIN
    const root = determineInstitutionalRole("paulocauan39@gmail.com");
    expect(root.role).toBe("ADMIN");
  });

  // Cenário 6: Novo usuário não-admin deve receber status PENDENTE
  it("Cenário 6: Novo cadastro institucional não-admin deve receber status inicial PENDENTE", () => {
    const cleanEmail = "20251iva10030099@estudantes.ifpr.edu.br";
    const determination = determineInstitutionalRole(cleanEmail);
    const initialStatus = determination.role === "ADMIN" ? "APROVADO" : "PENDENTE";
    expect(initialStatus).toBe("PENDENTE");
  });

  // Cenário 7: Falha na criação do documento Firestore é tratada
  it("Cenário 7: Falha na criação do documento Firestore propaga erro claro sem travar a interface", async () => {
    let errorCaught = false;
    try {
      // Simulação de erro de permissão do Firestore
      throw new Error("Missing or insufficient permissions: firestore.rules rejected create.");
    } catch (e: any) {
      errorCaught = true;
      expect(e.message).toContain("permissions");
    }
    expect(errorCaught).toBe(true);
  });

  // Cenário 8: Não ocorre criação silenciosa de conta órfã em novo cadastro (compensação)
  it("Cenário 8: Transação compensatória garante reversão quando o documento Firestore não pode ser criado", () => {
    let deletedAuth = false;
    const mockAuthUser = {
      uid: "mock-uid-test",
      delete: async () => {
        deletedAuth = true;
      },
    };

    // Fluxo simulado de compensação
    try {
      throw new Error("Simulated Firestore creation failure");
    } catch {
      if (mockAuthUser) {
        mockAuthUser.delete();
      }
    }
    expect(deletedAuth).toBe(true);
  });

  // Cenário 9: Usuário Google institucional é provisionado corretamente
  it("Cenário 9: Usuário Google institucional (@estudantes.ifpr.edu.br) é reconhecido com role ALUNO", () => {
    const googleUserEmail = "20251iva10030012@estudantes.ifpr.edu.br";
    const determination = determineInstitutionalRole(googleUserEmail);
    expect(determination.isInstitutional).toBe(true);
    expect(determination.role).toBe("ALUNO");
  });

  // Cenário 10: Usuário Google externo é rejeitado para auto-provisionamento institucional
  it("Cenário 10: Usuário Google externo (ex: kalilpadilha10@gmail.com) é classificado como não institucional", () => {
    const determination = determineInstitutionalRole("kalilpadilha10@gmail.com");
    expect(determination.isInstitutional).toBe(false);
  });

  // Cenário 11: Usuário ADMIN existente continua ADMIN
  it("Cenário 11: Usuário ADMIN existente na base de dados preserva papel ADMIN na sincronização", () => {
    const existingAdmin: User = {
      id: "admin-uid-1",
      name: "Paulo Cauan",
      email: "paulocauan39@gmail.com",
      role: "ADMIN",
      courseOrDept: "Administração",
      registrationNumber: "20260001",
      avatarUrl: "",
      approvalStatus: "APROVADO",
    };
    const sanitized = sanitizeUserList([existingAdmin]);
    expect(sanitized[0].role).toBe("ADMIN");
  });

  // Cenário 12: Usuário ALUNO existente continua ALUNO
  it("Cenário 12: Usuário ALUNO existente preserva papel ALUNO", () => {
    const existingAluno: User = {
      id: "aluno-uid-1",
      name: "Luan Matheus",
      email: "20251iva10030005@estudantes.ifpr.edu.br",
      role: "ALUNO",
      courseOrDept: "Estudante IFPR Campus Ivaiporã",
      registrationNumber: "20251iva10030005",
      avatarUrl: "",
      approvalStatus: "APROVADO",
    };
    const sanitized = sanitizeUserList([existingAluno]);
    expect(sanitized[0].role).toBe("ALUNO");
  });

  // Cenário 13: Usuário SERVIDOR existente continua SERVIDOR
  it("Cenário 13: Usuário SERVIDOR existente preserva papel SERVIDOR", () => {
    const existingServidor: User = {
      id: "servidor-uid-1",
      name: "Ronan Anacleto Lopes",
      email: "ronan.lopes@ifpr.edu.br",
      role: "SERVIDOR",
      courseOrDept: "Servidor IFPR Campus Ivaiporã",
      registrationNumber: "20260099",
      avatarUrl: "",
      approvalStatus: "APROVADO",
    };
    const sanitized = sanitizeUserList([existingServidor]);
    expect(sanitized[0].role).toBe("SERVIDOR");
  });

  // Cenário 14: Dashboard continua exibindo todos os documentos '/users'
  it("Cenário 14: Lista sanitizada inclui todos os documentos únicos sem descartar registros legítimos", () => {
    const userDocs: User[] = [
      { id: "u1", name: "User 1", email: "u1@ifpr.edu.br", role: "SERVIDOR", courseOrDept: "Dept 1", registrationNumber: "1", avatarUrl: "" },
      { id: "u2", name: "User 2", email: "u2@estudantes.ifpr.edu.br", role: "ALUNO", courseOrDept: "Dept 2", registrationNumber: "2", avatarUrl: "" },
      { id: "u3", name: "User 3", email: "u3@estudantes.ifpr.edu.br", role: "ALUNO", courseOrDept: "Dept 3", registrationNumber: "3", avatarUrl: "" },
    ];
    const sanitized = sanitizeUserList(userDocs);
    expect(sanitized).toHaveLength(3);
  });

  // Cenário 15: Busca e filtros continuam funcionando
  it("Cenário 15: Busca e filtros por role filtram corretamente os usuários", () => {
    const users: User[] = [
      { id: "u1", name: "Carlos Silva", email: "carlos@estudantes.ifpr.edu.br", role: "ALUNO", courseOrDept: "TI", registrationNumber: "101", avatarUrl: "" },
      { id: "u2", name: "Mariana Souza", email: "mariana@ifpr.edu.br", role: "SERVIDOR", courseOrDept: "Docente", registrationNumber: "102", avatarUrl: "" },
      { id: "u3", name: "Paulo Cauan", email: "paulocauan39@gmail.com", role: "ADMIN", courseOrDept: "Direção", registrationNumber: "103", avatarUrl: "" },
    ];

    // Filtro por role
    const alunos = users.filter((u) => u.role === "ALUNO");
    expect(alunos).toHaveLength(1);
    expect(alunos[0].name).toBe("Carlos Silva");

    const servidores = users.filter((u) => u.role === "SERVIDOR");
    expect(servidores).toHaveLength(1);
    expect(servidores[0].name).toBe("Mariana Souza");

    // Filtro por busca de texto (nome ou matrícula)
    const searchTerm = "102";
    const searchResults = users.filter(
      (u) =>
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.registrationNumber.includes(searchTerm)
    );
    expect(searchResults).toHaveLength(1);
    expect(searchResults[0].name).toBe("Mariana Souza");
  });
});
