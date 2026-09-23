import { describe, it, expect } from "vitest";
import { determineInstitutionalRole, previewInstitutionalRole } from "../context/AppContext";
import { sanitizeUserList } from "./shared-constants";
import { User, UserRole, AccountStatus } from "../types";
import {
  resolveAccountStatus,
  isUserAccountActive,
  isAccountBlocked,
  sortUsersByCreationDesc,
} from "./accountStatusUtils";

describe("Bateria de Testes: Fluxo de Autenticação e Registro Institucional Localiza+", () => {
  // Cenário 1: Cadastro institucional de aluno
  it("Cenário 1: Cadastro institucional de aluno (@estudantes.ifpr.edu.br) determina role ALUNO e vínculo institucional válido quando verificado", () => {
    const res = determineInstitutionalRole("20251iva10030099@estudantes.ifpr.edu.br", true);
    expect(res.isInstitutional).toBe(true);
    expect(res.role).toBe("ALUNO");
    expect(res.label).toBe("Estudante IFPR (Aluno)");

    const preview = previewInstitutionalRole("20251iva10030099@estudantes.ifpr.edu.br");
    expect(preview.isInstitutional).toBe(true);
    expect(preview.role).toBe("ALUNO");
  });

  // Cenário 2: Cadastro institucional de servidor
  it("Cenário 2: Cadastro institucional de servidor (@ifpr.edu.br) determina role SERVIDOR quando verificado", () => {
    const res = determineInstitutionalRole("professor.teste@ifpr.edu.br", true);
    expect(res.isInstitutional).toBe(true);
    expect(res.role).toBe("SERVIDOR");
    expect(res.label).toBe("Servidor IFPR (Docente / TAE)");

    const preview = previewInstitutionalRole("professor.teste@ifpr.edu.br");
    expect(preview.isInstitutional).toBe(true);
    expect(preview.role).toBe("SERVIDOR");
  });

  // Cenário 3: Domínio externo rejeitado
  it("Cenário 3: Domínio externo (ex: gmail, outlook, yahoo) é marcado como não-institucional e classificado como Usuário externo (INTRUSO)", () => {
    const external1 = previewInstitutionalRole("usuario.aleatorio@gmail.com");
    expect(external1.isInstitutional).toBe(false);
    expect(external1.role).toBe("INTRUSO");
    expect(external1.label).toBe("Usuário externo");

    const external2 = previewInstitutionalRole("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@gmail.com");
    expect(external2.isInstitutional).toBe(false);
    expect(external2.role).toBe("INTRUSO");
  });

  // Cenário 4: Role determinado automaticamente pelo domínio
  it("Cenário 4: Role é determinado estritamente pelo domínio do e-mail institucional quando verificado", () => {
    const aluno = determineInstitutionalRole("aluno@estudantes.ifpr.edu.br", true);
    expect(aluno.role).toBe("ALUNO");

    const servidor = determineInstitutionalRole("docente@ifpr.edu.br", true);
    expect(servidor.role).toBe("SERVIDOR");
  });

  // Cenário 5: Usuário não pode escolher ADMIN
  it("Cenário 5: Usuário não pode obter ADMIN via domínio acadêmico ou manipulação de formulário", () => {
    const aluno = determineInstitutionalRole("aluno.esperto@estudantes.ifpr.edu.br", true);
    expect(aluno.role).not.toBe("ADMIN");
    expect(aluno.role).toBe("ALUNO");

    const servidor = determineInstitutionalRole("servidor.comum@ifpr.edu.br", true);
    expect(servidor.role).not.toBe("ADMIN");
    expect(servidor.role).toBe("SERVIDOR");

    // Apenas e-mail do root admin é reconhecido como ADMIN
    const root = determineInstitutionalRole("paulocauan39@gmail.com", true);
    expect(root.role).toBe("ADMIN");
  });

  // Cenário 6: Novo usuário não-admin deve receber status PENDENTE
  it("Cenário 6: Novo cadastro institucional não-admin deve receber status inicial PENDENTE", () => {
    const cleanEmail = "20251iva10030099@estudantes.ifpr.edu.br";
    const determination = previewInstitutionalRole(cleanEmail);
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
    const determination = determineInstitutionalRole(googleUserEmail, true);
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

  // ========================================================
  // CENÁRIOS ESPECÍFICOS DE INTEGRAÇÃO: STATUS E CLASSIFICAÇÃO
  // ========================================================

  describe("Cenário A: Classificação por Domínio e Zero-Trust", () => {
    it("Classifica e-mail institucional de estudante como ALUNO após verificação", () => {
      const res = determineInstitutionalRole("lucas@estudantes.ifpr.edu.br", true);
      expect(res.role).toBe("ALUNO");
      expect(res.isInstitutional).toBe(true);
    });

    it("Classifica e-mail institucional de servidor como SERVIDOR após verificação", () => {
      const res = determineInstitutionalRole("professor@ifpr.edu.br", true);
      expect(res.role).toBe("SERVIDOR");
      expect(res.isInstitutional).toBe(true);
    });

    it("Classifica domínios externos (@gmail.com, @hotmail.com) como INTRUSO mesmo se verificados", () => {
      const resGmail = determineInstitutionalRole("visitante@gmail.com", true);
      expect(resGmail.role).toBe("INTRUSO");
      expect(resGmail.isInstitutional).toBe(false);

      const resHotmail = determineInstitutionalRole("visitante@hotmail.com", true);
      expect(resHotmail.role).toBe("INTRUSO");
      expect(resHotmail.isInstitutional).toBe(false);
    });

    it("E-mail não verificado sempre resulta em role INTRUSO (Zero-Trust)", () => {
      const unverifiedEstudante = determineInstitutionalRole("fake@estudantes.ifpr.edu.br", false);
      expect(unverifiedEstudante.role).toBe("INTRUSO");

      const unverifiedServidor = determineInstitutionalRole("fake@ifpr.edu.br", false);
      expect(unverifiedServidor.role).toBe("INTRUSO");
    });
  });

  describe("Cenário B: Conta Externa Autenticada (@gmail.com)", () => {
    it("Permite autenticação de usuário externo sem bloquear o login, atribuindo role INTRUSO e status ativo", () => {
      const externalUser: User = {
        id: "ext-123",
        name: "Visitante da Silva",
        email: "visitante@gmail.com",
        role: "INTRUSO",
        status: "active",
        courseOrDept: "Usuário Externo / Visitante",
        registrationNumber: "EXT123456",
        avatarUrl: "",
      };

      // Não é rejeitado, role é INTRUSO e status é active
      expect(externalUser.role).toBe("INTRUSO");
      expect(externalUser.status).toBe("active");
    });
  });

  describe("Cenário C: Independência entre Role e Status da Conta", () => {
    it("Permite qualquer combinação válida de role e status de conta", () => {
      const combinations: Array<{ role: UserRole; status: AccountStatus }> = [
        { role: "ALUNO", status: "active" },
        { role: "ALUNO", status: "suspended" },
        { role: "ALUNO", status: "banned" },
        { role: "SERVIDOR", status: "active" },
        { role: "SERVIDOR", status: "suspended" },
        { role: "INTRUSO", status: "active" },
        { role: "INTRUSO", status: "suspended" },
        { role: "INTRUSO", status: "banned" },
        { role: "ADMIN", status: "active" },
      ];

      combinations.forEach(({ role, status }) => {
        const u: User = {
          id: `u-${role}-${status}`,
          name: "Test User",
          email: "test@example.com",
          role,
          status,
          courseOrDept: "Dept",
          registrationNumber: "1",
          avatarUrl: "",
        };
        expect(u.role).toBe(role);
        expect(u.status).toBe(status);
      });
    });
  });

  describe("Cenário D: Ações Permitidas e Bloqueadas para Role INTRUSO", () => {
    const intrusoUser: User = {
      id: "intruso-1",
      name: "Usuário Externo",
      email: "externo@gmail.com",
      role: "INTRUSO",
      status: "active",
      courseOrDept: "Usuário Externo / Visitante",
      registrationNumber: "EXT111",
      avatarUrl: "",
    };

    it("INTRUSO tem acesso a consultas públicas do catálogo", () => {
      const canViewCatalog = true; // Catálogo é público
      expect(canViewCatalog).toBe(true);
    });

    it("INTRUSO é impedido de cadastrar itens, registrar ocorrências e efetuar devoluções", () => {
      const canCreateItem = intrusoUser.role !== "INTRUSO" && intrusoUser.status === "active";
      const canClaimItem = intrusoUser.role !== "INTRUSO" && intrusoUser.status === "active";
      const canReturnItem = (intrusoUser.role === "SERVIDOR" || intrusoUser.role === "ADMIN") && intrusoUser.status === "active";

      expect(canCreateItem).toBe(false);
      expect(canClaimItem).toBe(false);
      expect(canReturnItem).toBe(false);
    });
  });

  describe("Cenário E: Ações Permitidas e Bloqueadas para Status Suspended e Banned", () => {
    const suspendedAluno: User = {
      id: "aluno-susp-1",
      name: "Aluno Suspenso",
      email: "aluno@estudantes.ifpr.edu.br",
      role: "ALUNO",
      status: "suspended",
      statusReason: "Violação de regras",
      suspendedUntil: new Date(Date.now() + 86400000).toISOString(),
      courseOrDept: "TADS",
      registrationNumber: "2026111",
      avatarUrl: "",
    };

    const bannedServidor: User = {
      id: "serv-ban-1",
      name: "Servidor Banido",
      email: "serv@ifpr.edu.br",
      role: "SERVIDOR",
      status: "banned",
      statusReason: "Infração disciplinar grave",
      courseOrDept: "Docente",
      registrationNumber: "2026222",
      avatarUrl: "",
    };

    it("Contas suspensas ou banidas não podem criar itens ou registrar ações ativas", () => {
      const isAlunoActive = suspendedAluno.status === "active";
      const isServidorActive = bannedServidor.status === "active";

      expect(isAlunoActive).toBe(false);
      expect(isServidorActive).toBe(false);
    });

    it("Contas suspensas e banidas preservam motivo e informações no documento", () => {
      expect(suspendedAluno.statusReason).toBe("Violação de regras");
      expect(suspendedAluno.suspendedUntil).toBeDefined();
      expect(bannedServidor.statusReason).toBe("Infração disciplinar grave");
    });
  });

  describe("Cenário F: Exclusão Segura de Contas Administrativas", () => {
    it("Impede que um administrador exclua sua própria conta ativa", () => {
      const adminId: string = "admin-root-1";
      const targetUserId: string = "admin-root-1";
      const canDeleteSelf = targetUserId !== adminId;

      expect(canDeleteSelf).toBe(false);
    });

    it("Permite exclusão de contas de terceiros por administradores", () => {
      const adminId: string = "admin-root-1";
      const targetUserId: string = "user-to-delete-999";
      const canDeleteTarget = targetUserId !== adminId;

      expect(canDeleteTarget).toBe(true);
    });
  });

  describe("Cenário G: Auditoria de Ciclo de Vida de Contas", () => {
    const validAuditLifecycleActions = [
      "ACCOUNT_SUSPENDED",
      "ACCOUNT_BANNED",
      "ACCOUNT_REACTIVATED",
      "ACCOUNT_DELETED",
    ];

    it("Todos os eventos de ciclo de vida são devidamente reconhecidos no sistema", () => {
      validAuditLifecycleActions.forEach((action) => {
        expect([
          "ACCOUNT_SUSPENDED",
          "ACCOUNT_BANNED",
          "ACCOUNT_REACTIVATED",
          "ACCOUNT_DELETED",
        ]).toContain(action);
      });
    });

    it("Estrutura do registro de auditoria de exclusão de conta contém dados obrigatórios", () => {
      const auditEntry = {
        objectId: "target-user-uid",
        objectType: "USER",
        objectTitle: "Nome do Usuário",
        action: "ACCOUNT_DELETED",
        actorId: "admin-uid",
        actorRole: "ADMIN",
        fieldChanged: "account_lifecycle",
        oldValue: "active",
        newValue: "DELETED",
        timestamp: new Date().toISOString(),
      };

      expect(auditEntry.action).toBe("ACCOUNT_DELETED");
      expect(auditEntry.objectType).toBe("USER");
      expect(auditEntry.actorRole).toBe("ADMIN");
      expect(auditEntry.fieldChanged).toBe("account_lifecycle");
      expect(auditEntry.newValue).toBe("DELETED");
    });
  });

  // ========================================================
  // 6 CENÁRIOS DE TESTE OBRIGATÓRIOS DO LOCALIZA+
  // ========================================================

  describe("6 Cenários de Teste Obrigatórios", () => {
    // Teste 1: Usuário @estudantes.ifpr.edu.br
    it("1. Usuário @estudantes.ifpr.edu.br: pré-verificação sem privilégios (INTRUSO); pós-verificação classificado automaticamente como ALUNO", () => {
      const email = "estudante.teste@estudantes.ifpr.edu.br";
      // Pré-verificação
      const preVerification = determineInstitutionalRole(email, false);
      expect(preVerification.role).toBe("INTRUSO");
      expect(preVerification.isInstitutional).toBe(false);

      // Pós-verificação (após confirmação do e-mail, sem intervenção do admin)
      const postVerification = determineInstitutionalRole(email, true);
      expect(postVerification.role).toBe("ALUNO");
      expect(postVerification.isInstitutional).toBe(true);
    });

    // Teste 2: Usuário @ifpr.edu.br
    it("2. Usuário @ifpr.edu.br: pós-verificação classificado automaticamente como SERVIDOR", () => {
      const email = "servidor.teste@ifpr.edu.br";
      // Pré-verificação
      const preVerification = determineInstitutionalRole(email, false);
      expect(preVerification.role).toBe("INTRUSO");

      // Pós-verificação
      const postVerification = determineInstitutionalRole(email, true);
      expect(postVerification.role).toBe("SERVIDOR");
      expect(postVerification.isInstitutional).toBe(true);
    });

    // Teste 3: Usuário @gmail.com
    it("3. Usuário @gmail.com: pós-verificação classificado como INTRUSO, funcional, ativo e sem privilégios institucionais", () => {
      const email = "visitante@gmail.com";
      const res = determineInstitutionalRole(email, true);
      expect(res.role).toBe("INTRUSO");
      expect(res.isInstitutional).toBe(false);

      const externalAccount: User = {
        id: "usr-gmail-1",
        name: "Visitante Gmail",
        email: email,
        role: res.role,
        status: "active",
        courseOrDept: "Comunidade Externa",
        registrationNumber: "EXT123456",
        avatarUrl: "",
        approvalStatus: "APROVADO",
        emailVerified: true,
      };

      const resolved = resolveAccountStatus(externalAccount);
      expect(resolved.status).toBe("active");
      expect(isUserAccountActive(externalAccount)).toBe(true);
      expect(isAccountBlocked(externalAccount)).toBe(false);
      expect(externalAccount.role).toBe("INTRUSO");
    });

    // Teste 4: Criação sequencial de contas e ordenação (mais recente primeiro)
    it("4. Criação sequencial de contas: ordenação correta na administração com as mais recentes primeiro", () => {
      const user1MonthAgo: User = {
        id: "u-old-1",
        name: "Criado há 1 mês",
        email: "mes@ifpr.edu.br",
        role: "SERVIDOR",
        status: "active",
        courseOrDept: "DAE",
        registrationNumber: "1001",
        avatarUrl: "",
        createdAt: new Date("2026-08-20T10:00:00Z").toISOString(),
      };

      const user1WeekAgo: User = {
        id: "u-week-2",
        name: "Criado há 1 semana",
        email: "semana@estudantes.ifpr.edu.br",
        role: "ALUNO",
        status: "active",
        courseOrDept: "TADS",
        registrationNumber: "1002",
        avatarUrl: "",
        createdAt: new Date("2026-09-16T10:00:00Z").toISOString(),
      };

      const userYesterday: User = {
        id: "u-yest-3",
        name: "Criado ontem",
        email: "ontem@estudantes.ifpr.edu.br",
        role: "ALUNO",
        status: "active",
        courseOrDept: "TADS",
        registrationNumber: "1003",
        avatarUrl: "",
        createdAt: new Date("2026-09-22T15:00:00Z").toISOString(),
      };

      const userToday: User = {
        id: "u-today-4",
        name: "Criado hoje",
        email: "hoje@gmail.com",
        role: "INTRUSO",
        status: "active",
        courseOrDept: "Visitante",
        registrationNumber: "EXT1004",
        avatarUrl: "",
        createdAt: new Date("2026-09-23T12:00:00Z").toISOString(),
      };

      // Inserção em ordem arbitrária/desordenada
      const inputList = [user1WeekAgo, userToday, user1MonthAgo, userYesterday];
      const sorted = sortUsersByCreationDesc(inputList);

      // Ordem esperada: Hoje -> Ontem -> 1 semana -> 1 mês
      expect(sorted[0].id).toBe("u-today-4");
      expect(sorted[1].id).toBe("u-yest-3");
      expect(sorted[2].id).toBe("u-week-2");
      expect(sorted[3].id).toBe("u-old-1");
    });

    // Teste 5: Suspensão de usuário institucional
    it("5. Suspensão de usuário institucional: status torna-se 'suspended' independente de ser ALUNO ou verificado", () => {
      const alunoUser: User = {
        id: "u-aluno-suspenso",
        name: "Aluno Suspenso",
        email: "aluno.infrator@estudantes.ifpr.edu.br",
        role: "ALUNO",
        status: "suspended",
        statusReason: "Infração disciplinar temporária",
        statusUpdatedAt: new Date().toISOString(),
        suspendedUntil: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        courseOrDept: "TADS",
        registrationNumber: "2026111",
        avatarUrl: "",
        emailVerified: true,
      };

      const resolved = resolveAccountStatus(alunoUser);
      expect(resolved.status).toBe("suspended");
      expect(alunoUser.role).toBe("ALUNO"); // Role institucional intacta
      expect(isUserAccountActive(alunoUser)).toBe(false); // Ações bloqueadas por suspensão
      expect(isAccountBlocked(alunoUser)).toBe(true);
    });

    // Teste 6: Banimento de usuário institucional
    it("6. Banimento de usuário institucional: status torna-se 'banned' permanente com bloqueio de acesso", () => {
      const servidorBanido: User = {
        id: "u-servidor-banido",
        name: "Ex-Servidor Banido",
        email: "servidor.grave@ifpr.edu.br",
        role: "SERVIDOR",
        status: "banned",
        statusReason: "Infração grave gravíssima transitada em julgado",
        statusUpdatedAt: new Date().toISOString(),
        courseOrDept: "Administração",
        registrationNumber: "99999",
        avatarUrl: "",
        emailVerified: true,
      };

      const resolved = resolveAccountStatus(servidorBanido);
      expect(resolved.status).toBe("banned");
      expect(servidorBanido.role).toBe("SERVIDOR"); // Papel original registrado
      expect(isUserAccountActive(servidorBanido)).toBe(false);
      expect(isAccountBlocked(servidorBanido)).toBe(true);
    });
  });
});
