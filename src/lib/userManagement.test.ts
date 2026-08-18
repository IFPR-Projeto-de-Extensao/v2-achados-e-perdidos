import { describe, it, expect } from "vitest";
import { sanitizeUserList, DEFAULT_GUEST_USER } from "./shared-constants";
import { User, UserRole } from "../types";

describe("User Management & Deduplication", () => {
  it("should filter out duplicate IDs and emails in sanitizeUserList", () => {
    const rawUsers: User[] = [
      {
        id: "uid-123",
        name: "Paulo Cauan",
        email: "paulocauan39@gmail.com",
        role: "ADMIN",
        courseOrDept: "TI",
        registrationNumber: "2026001",
        avatarUrl: "",
      },
      {
        id: "uid-123", // duplicate ID
        name: "Paulo Cauan Duplicate ID",
        email: "other@gmail.com",
        role: "ADMIN",
        courseOrDept: "TI",
        registrationNumber: "2026002",
        avatarUrl: "",
      },
      {
        id: "uid-456",
        name: "Paulo Cauan Duplicate Email",
        email: "paulocauan39@gmail.com", // duplicate Email
        role: "ALUNO",
        courseOrDept: "TI",
        registrationNumber: "2026003",
        avatarUrl: "",
      },
      {
        id: "uid-789",
        name: "Servidor Exemplo",
        email: "servidor@ifpr.edu.br",
        role: "SERVIDOR",
        courseOrDept: "Docente",
        registrationNumber: "2026004",
        avatarUrl: "",
      },
    ];

    const sanitized = sanitizeUserList(rawUsers);
    expect(sanitized).toHaveLength(2);
    expect(sanitized[0].id).toBe("uid-123");
    expect(sanitized[1].id).toBe("uid-789");
  });

  it("should preserve valid user roles (ALUNO, SERVIDOR, ADMIN)", () => {
    const roles: UserRole[] = ["ALUNO", "SERVIDOR", "ADMIN"];
    roles.forEach((r) => {
      const user: User = {
        id: `uid-${r}`,
        name: `Test ${r}`,
        email: `test-${r}@ifpr.edu.br`,
        role: r,
        courseOrDept: "IFPR",
        registrationNumber: "123",
        avatarUrl: "",
      };
      const list = sanitizeUserList([user]);
      expect(list[0].role).toBe(r);
    });
  });

  it("DEFAULT_GUEST_USER should have guest_visitor ID", () => {
    expect(DEFAULT_GUEST_USER.id).toBe("guest_visitor");
    expect(DEFAULT_GUEST_USER.role).toBe("ALUNO");
  });
});
