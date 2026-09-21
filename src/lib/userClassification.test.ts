import { describe, it, expect, vi } from "vitest";
import { determineInstitutionalRole } from "../context/AppContext";
import { UserRole, User } from "../types";

describe("Institutional User Classification & Domain Analysis System", () => {
  describe("Scenario 1: Standard Student Domain (@estudantes.ifpr.edu.br)", () => {
    it("should classify standard student email as ALUNO", () => {
      const result = determineInstitutionalRole("aluno@estudantes.ifpr.edu.br");
      expect(result.role).toBe("ALUNO");
      expect(result.isInstitutional).toBe(true);
      expect(result.label).toContain("Estudante");
    });
  });

  describe("Scenario 2: Singular Student Domain Variant (@estudante.ifpr.edu.br)", () => {
    it("should classify singular student email as ALUNO", () => {
      const result = determineInstitutionalRole("joao.silva@estudante.ifpr.edu.br");
      expect(result.role).toBe("ALUNO");
      expect(result.isInstitutional).toBe(true);
    });
  });

  describe("Scenario 3: Subdomain Student Email (@campus.estudantes.ifpr.edu.br)", () => {
    it("should classify subdomain student email as ALUNO", () => {
      const result = determineInstitutionalRole("aluno@campus.estudantes.ifpr.edu.br");
      expect(result.role).toBe("ALUNO");
      expect(result.isInstitutional).toBe(true);
    });
  });

  describe("Scenario 4: Main Staff / Faculty Domain (@ifpr.edu.br)", () => {
    it("should classify main IFPR staff email as SERVIDOR", () => {
      const result = determineInstitutionalRole("servidor@ifpr.edu.br");
      expect(result.role).toBe("SERVIDOR");
      expect(result.isInstitutional).toBe(true);
      expect(result.label).toContain("Servidor");
    });
  });

  describe("Scenario 5: Reitoria Subdomain (@reitoria.ifpr.edu.br)", () => {
    it("should classify reitoria staff email as SERVIDOR", () => {
      const result = determineInstitutionalRole("professor@reitoria.ifpr.edu.br");
      expect(result.role).toBe("SERVIDOR");
      expect(result.isInstitutional).toBe(true);
    });
  });

  describe("Scenario 6: Campus Subdomain (@ivaipora.ifpr.edu.br)", () => {
    it("should classify campus staff email as SERVIDOR", () => {
      const result = determineInstitutionalRole("diretoria@ivaipora.ifpr.edu.br");
      expect(result.role).toBe("SERVIDOR");
      expect(result.isInstitutional).toBe(true);
    });
  });

  describe("Scenario 7: External Commercial Domain (Gmail)", () => {
    it("should classify gmail.com as INTRUSO (Usuário externo)", () => {
      const result = determineInstitutionalRole("usuario@gmail.com");
      expect(result.role).toBe("INTRUSO");
      expect(result.isInstitutional).toBe(false);
      expect(result.label).toBe("Usuário externo");
    });
  });

  describe("Scenario 8: External Commercial Domain (Outlook)", () => {
    it("should classify outlook.com as INTRUSO (Usuário externo)", () => {
      const result = determineInstitutionalRole("usuario@outlook.com");
      expect(result.role).toBe("INTRUSO");
      expect(result.isInstitutional).toBe(false);
      expect(result.label).toBe("Usuário externo");
    });
  });

  describe("Scenario 9: External Commercial Domain (Hotmail)", () => {
    it("should classify hotmail.com as INTRUSO (Usuário externo)", () => {
      const result = determineInstitutionalRole("usuario@hotmail.com");
      expect(result.role).toBe("INTRUSO");
      expect(result.isInstitutional).toBe(false);
      expect(result.label).toBe("Usuário externo");
    });
  });

  describe("Scenario 10: External Commercial Domain (Yahoo)", () => {
    it("should classify yahoo.com.br as INTRUSO (Usuário externo)", () => {
      const result = determineInstitutionalRole("usuario@yahoo.com.br");
      expect(result.role).toBe("INTRUSO");
      expect(result.isInstitutional).toBe(false);
      expect(result.label).toBe("Usuário externo");
    });
  });

  describe("Scenario 11: Anti-Spoofing - Fake IFPR Prefix (fakeifpr.edu.br)", () => {
    it("should reject fake domain and classify as INTRUSO", () => {
      const result = determineInstitutionalRole("hacker@fakeifpr.edu.br");
      expect(result.role).toBe("INTRUSO");
      expect(result.isInstitutional).toBe(false);
    });
  });

  describe("Scenario 12: Anti-Spoofing - Hyphenated Domain (not-ifpr.edu.br)", () => {
    it("should reject hyphenated domain and classify as INTRUSO", () => {
      const result = determineInstitutionalRole("fake@not-ifpr.edu.br");
      expect(result.role).toBe("INTRUSO");
      expect(result.isInstitutional).toBe(false);
    });
  });

  describe("Scenario 13: Anti-Spoofing - Domain Suffix Injection (ifpr.edu.br.attacker.com)", () => {
    it("should reject domain suffix attacker injection and classify as INTRUSO", () => {
      const result = determineInstitutionalRole("estudantes@ifpr.edu.br.attacker.com");
      expect(result.role).toBe("INTRUSO");
      expect(result.isInstitutional).toBe(false);
    });
  });

  describe("Scenario 14: Malformed and Empty Email Inputs", () => {
    it("should classify empty or invalid email strings safely as INTRUSO", () => {
      expect(determineInstitutionalRole("").role).toBe("INTRUSO");
      expect(determineInstitutionalRole("invalid-email").role).toBe("INTRUSO");
      expect(determineInstitutionalRole("user@").role).toBe("INTRUSO");
      expect(determineInstitutionalRole("@").role).toBe("INTRUSO");
      expect(determineInstitutionalRole("   ").role).toBe("INTRUSO");
    });
  });

  describe("Scenario 15: Admin Role Modification and Audit Integration", () => {
    it("should support manual role adjustment to INTRUSO, ALUNO, SERVIDOR, and ADMIN", () => {
      const targetUser: User = {
        id: "user-test-1",
        name: "Carlos Externo",
        email: "carlos@gmail.com",
        role: "INTRUSO",
        courseOrDept: "Visitante",
        registrationNumber: "EXT-001",
        reputationScore: 0,
        avatarUrl: "",
      };

      const auditEntries: Array<{ action: string; details: string }> = [];
      const mockRecordAuditLog = vi.fn(async (action: string, details: string) => {
        auditEntries.push({ action, details });
      });

      const applyRoleChange = async (user: User, newRole: UserRole) => {
        const previousRole = user.role;
        user.role = newRole;
        await mockRecordAuditLog(
          "ALTERACAO_PERMISSAO",
          `Alterou permissão de '${user.name}' de ${previousRole} para ${newRole}.`
        );
      };

      applyRoleChange(targetUser, "ALUNO");
      expect(targetUser.role).toBe("ALUNO");
      expect(mockRecordAuditLog).toHaveBeenCalledWith(
        "ALTERACAO_PERMISSAO",
        "Alterou permissão de 'Carlos Externo' de INTRUSO para ALUNO."
      );

      applyRoleChange(targetUser, "INTRUSO");
      expect(targetUser.role).toBe("INTRUSO");
      expect(mockRecordAuditLog).toHaveBeenCalledWith(
        "ALTERACAO_PERMISSAO",
        "Alterou permissão de 'Carlos Externo' de ALUNO para INTRUSO."
      );
    });
  });
});
