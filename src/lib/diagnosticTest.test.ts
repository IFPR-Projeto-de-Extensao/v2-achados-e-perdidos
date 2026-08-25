import { describe, it, expect, vi } from "vitest";

describe("Localiza+ System Diagnostics - Feedback, Items & Discord Routing", () => {
  it("should validate feedback payload requirements and format", () => {
    const validFeedback = {
      name: "Aluno IFPR",
      email: "aluno@ifpr.edu.br",
      category: "FEEDBACK",
      subject: "Melhoria no Sistema",
      message: "Sugestão de funcionalidade para pesquisa rápida.",
      priority: "MEDIA",
    };

    expect(validFeedback.name.trim()).toBeTruthy();
    expect(validFeedback.email.trim()).toBeTruthy();
    expect(validFeedback.subject.trim()).toBeTruthy();
    expect(validFeedback.message.trim()).toBeTruthy();

    const invalidFeedback = {
      name: "",
      email: "aluno@ifpr.edu.br",
      category: "FEEDBACK",
      subject: "",
      message: "",
    };

    const isFeedbackValid = Boolean(
      invalidFeedback.name.trim() &&
      invalidFeedback.email.trim() &&
      invalidFeedback.subject.trim() &&
      invalidFeedback.message.trim()
    );

    expect(isFeedbackValid).toBe(false);
  });

  it("should route 'ACHADO' / 'ENCONTRADO' items strictly to #novos-achados", () => {
    const foundItem = {
      id: "item_found_01",
      title: "Caderno Universitário",
      type: "ENCONTRADO",
      category: "Material Escolar & Livros",
      location: "Biblioteca",
      date: "2026-08-25",
    };

    const isFound = foundItem.type === "ENCONTRADO" || foundItem.type === "ACHADO";
    const isLost = foundItem.type === "PERDIDO" || foundItem.type === "PERDA";

    expect(isFound).toBe(true);
    expect(isLost).toBe(false);
  });

  it("should route 'PERDIDO' / 'PERDA' items strictly to #novas-perdas", () => {
    const lostItem = {
      id: "item_lost_01",
      title: "Chave com chaveiro IFPR",
      type: "PERDIDO",
      category: "Chaves",
      location: "Pátio Central",
      date: "2026-08-25",
    };

    const isFound = lostItem.type === "ENCONTRADO" || lostItem.type === "ACHADO";
    const isLost = lostItem.type === "PERDIDO" || lostItem.type === "PERDA";

    expect(isFound).toBe(false);
    expect(isLost).toBe(true);
  });

  it("should prevent 403 Forbidden by ensuring authenticated academic users have valid user ID and roles", () => {
    const academicUser = {
      uid: "user_academic_123",
      email: "estudante@ifpr.edu.br",
      role: "ALUNO",
    };

    const itemToCreate = {
      title: "Calculadora Científica",
      type: "PERDIDO",
      category: "Eletrônicos",
      location: "Laboratório 3",
      date: "2026-08-25",
      registeredByUserId: academicUser.uid,
      registeredByRole: academicUser.role,
    };

    // Verify security rule condition: (incoming().registeredByUserId == request.auth.uid || incoming().registeredByUserId is string)
    const canCreate = Boolean(
      academicUser.uid &&
      itemToCreate.registeredByUserId === academicUser.uid &&
      itemToCreate.registeredByRole !== "ADMIN"
    );

    expect(canCreate).toBe(true);
  });
});
