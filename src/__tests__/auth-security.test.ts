import { describe, it, expect } from "vitest";
import {
  determineInstitutionalRole,
  previewInstitutionalRole,
} from "../context/AppContext";

describe("Localiza+ Zero-Trust Authentication & Authorization Matrix", () => {
  // Scenario A: Unverified Student Email
  it("Scenario A: Unverified student email (@estudantes.ifpr.edu.br with emailVerified=false) is classified as INTRUSO", () => {
    const email = "estudante.teste@estudantes.ifpr.edu.br";
    const determination = determineInstitutionalRole(email, false);
    expect(determination.role).toBe("INTRUSO");
    expect(determination.isInstitutional).toBe(false);
    expect(determination.label).toContain("não verificada");
  });

  // Scenario B: Verified Student Email
  it("Scenario B: Verified student email (@estudantes.ifpr.edu.br with emailVerified=true) is promoted to ALUNO", () => {
    const email = "estudante.teste@estudantes.ifpr.edu.br";
    const determination = determineInstitutionalRole(email, true);
    expect(determination.role).toBe("ALUNO");
    expect(determination.isInstitutional).toBe(true);
    expect(determination.label).toContain("Estudante IFPR");
  });

  // Scenario C: Unverified Staff/Teacher Email
  it("Scenario C: Unverified teacher/staff email (@ifpr.edu.br with emailVerified=false) is classified as INTRUSO", () => {
    const email = "professor.silva@ifpr.edu.br";
    const determination = determineInstitutionalRole(email, false);
    expect(determination.role).toBe("INTRUSO");
    expect(determination.isInstitutional).toBe(false);
    expect(determination.label).toContain("não verificada");
  });

  // Scenario D: Verified Staff/Teacher Email
  it("Scenario D: Verified teacher/staff email (@ifpr.edu.br with emailVerified=true) is promoted to SERVIDOR", () => {
    const email = "professor.silva@ifpr.edu.br";
    const determination = determineInstitutionalRole(email, true);
    expect(determination.role).toBe("SERVIDOR");
    expect(determination.isInstitutional).toBe(true);
    expect(determination.label).toContain("Servidor IFPR");
  });

  // Scenario E: Unverified External Email
  it("Scenario E: Unverified external email (e.g. usuario@gmail.com with emailVerified=false) is classified as INTRUSO", () => {
    const email = "usuario.externo@gmail.com";
    const determination = determineInstitutionalRole(email, false);
    expect(determination.role).toBe("INTRUSO");
    expect(determination.isInstitutional).toBe(false);
  });

  // Scenario F: Verified External Email (Non-Root)
  it("Scenario F: Verified external email (e.g. usuario@gmail.com with emailVerified=true) remains INTRUSO", () => {
    const email = "usuario.externo@gmail.com";
    const determination = determineInstitutionalRole(email, true);
    expect(determination.role).toBe("INTRUSO");
    expect(determination.isInstitutional).toBe(false);
  });

  // Scenario G: Superadmin Root Email
  it("Scenario G: Superadmin root email (paulocauan39@gmail.com) is always granted ADMIN", () => {
    const email = "paulocauan39@gmail.com";
    const determination = determineInstitutionalRole(email, true);
    expect(determination.role).toBe("ADMIN");
    expect(determination.isInstitutional).toBe(true);

    const unverifiedAdmin = determineInstitutionalRole(email, false);
    expect(unverifiedAdmin.role).toBe("ADMIN");
  });

  // Scenario H: Preview determination before account creation
  it("Scenario H: previewInstitutionalRole accurately determines target role for pre-registration validation", () => {
    const studentPreview = previewInstitutionalRole("aluno@estudantes.ifpr.edu.br");
    expect(studentPreview.isInstitutional).toBe(true);
    expect(studentPreview.role).toBe("ALUNO");

    const staffPreview = previewInstitutionalRole("servidor@ifpr.edu.br");
    expect(staffPreview.isInstitutional).toBe(true);
    expect(staffPreview.role).toBe("SERVIDOR");

    const externalPreview = previewInstitutionalRole("hacker@outlook.com");
    expect(externalPreview.isInstitutional).toBe(false);
    expect(externalPreview.role).toBe("INTRUSO");
  });
});
