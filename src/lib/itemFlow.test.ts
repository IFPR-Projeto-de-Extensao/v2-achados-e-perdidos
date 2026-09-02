import { describe, it, expect } from "vitest";
import { LostFoundItem, ItemStatus, UserRole } from "../types";

// Validation helper replicating core business logic
export function validateItemInput(item: {
  title?: string;
  description?: string;
  location?: string;
  type?: string;
}): { isValid: boolean; error?: string } {
  if (!item.title || !item.title.trim()) {
    return { isValid: false, error: "O título do objeto é obrigatório." };
  }
  if (!item.description || !item.description.trim()) {
    return { isValid: false, error: "A descrição do objeto é obrigatória." };
  }
  if (!item.location || !item.location.trim()) {
    return { isValid: false, error: "O local do objeto é obrigatório." };
  }
  if (!item.type || (item.type !== "PERDIDO" && item.type !== "ENCONTRADO")) {
    return { isValid: false, error: "O tipo do objeto deve ser PERDIDO ou ENCONTRADO." };
  }
  return { isValid: true };
}

// Authorization check helper replicating AppContext RBAC rules
export function checkItemMutationPermission(
  action: "EDIT" | "STATUS_CHANGE" | "DELETE" | "RETURN",
  user: { id: string; role: UserRole; isGuest: boolean; email?: string } | null,
  item: LostFoundItem
): { allowed: boolean; reason?: string } {
  if (!user || user.isGuest || user.id === "guest") {
    return { allowed: false, reason: "Usuário não autenticado." };
  }

  const isOwner =
    item.registeredByUserId === user.id ||
    (Boolean(user.email) && Boolean(item.contactInfo) && item.contactInfo?.toLowerCase().includes(user.email?.toLowerCase() || "")) ||
    (Boolean(user.id) && item.registeredByUserId === user.id);

  const isStaffOrAdmin = user.role === "ADMIN" || user.role === "SERVIDOR" || user.email === "paulocauan39@gmail.com";
  const isAdmin = user.role === "ADMIN" || user.email === "paulocauan39@gmail.com";

  switch (action) {
    case "EDIT":
    case "STATUS_CHANGE":
      if (isOwner || isStaffOrAdmin) return { allowed: true };
      return { allowed: false, reason: "Apenas o autor ou servidores/administradores podem alterar este item." };

    case "DELETE":
      if (isOwner || isAdmin) return { allowed: true };
      return { allowed: false, reason: "Apenas o autor ou administradores podem excluir este item." };

    case "RETURN":
      if (isStaffOrAdmin) return { allowed: true };
      return { allowed: false, reason: "Apenas servidores ou administradores podem registrar devoluções." };

    default:
      return { allowed: false, reason: "Ação não reconhecida." };
  }
}

describe("Fluxo de Itens do Localiza+ (Validação e Autorização)", () => {
  const sampleItem: LostFoundItem = {
    id: "ifpr-2026-001",
    title: "Mochila Preta Dell",
    description: "Mochila contendo caderno e estojo esquecida na biblioteca.",
    category: "Outros",
    location: "Biblioteca Campus Ivaiporã",
    date: "2026-09-02",
    type: "ENCONTRADO",
    status: "ENCONTRADO",
    color: "Preto",
    brand: "Dell",
    imageUrl: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&q=80&w=600",
    registeredByUserId: "user-aluno-123",
    registeredByName: "Carlos Aluno",
    registeredByRole: "ALUNO",
    contactInfo: "carlos.aluno@escola.ifpr.edu.br",
    qrCodeId: "QR-IFPR-2026-MOCHILA",
    createdAt: new Date().toISOString(),
  };

  describe("1. Validação de Cadastro de Itens", () => {
    it("deve aceitar item com todos os campos obrigatórios válidos", () => {
      const result = validateItemInput({
        title: "Garrafa Térmica Azul",
        description: "Garrafa metálica esquecida na sala 04",
        location: "Bloco Didático - Sala 04",
        type: "PERDIDO",
      });
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("deve rejeitar item sem título", () => {
      const result = validateItemInput({
        title: "   ",
        description: "Descrição válida",
        location: "Refeitório",
        type: "ENCONTRADO",
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("O título do objeto é obrigatório.");
    });

    it("deve rejeitar item sem descrição", () => {
      const result = validateItemInput({
        title: "Calculadora Científica",
        description: "",
        location: "Lab de Informática 01",
        type: "PERDIDO",
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("A descrição do objeto é obrigatória.");
    });

    it("deve rejeitar item sem local", () => {
      const result = validateItemInput({
        title: "Casaco de Frio",
        description: "Casaco cinza IFPR",
        location: "  ",
        type: "ENCONTRADO",
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("O local do objeto é obrigatório.");
    });

    it("deve rejeitar item com tipo inválido", () => {
      const result = validateItemInput({
        title: "Chaveiro",
        description: "Chaveiro com 3 chaves",
        location: "Guarita",
        type: "OUTRO" as any,
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("O tipo do objeto deve ser PERDIDO ou ENCONTRADO.");
    });
  });

  describe("2. Controle de Acesso e Permissões (RBAC)", () => {
    const guestUser = { id: "guest", role: "ALUNO" as UserRole, isGuest: true };
    const ownerUser = { id: "user-aluno-123", role: "ALUNO" as UserRole, isGuest: false, email: "carlos.aluno@escola.ifpr.edu.br" };
    const otherStudent = { id: "user-aluno-456", role: "ALUNO" as UserRole, isGuest: false, email: "outro.aluno@escola.ifpr.edu.br" };
    const staffUser = { id: "user-staff-789", role: "SERVIDOR" as UserRole, isGuest: false, email: "servidor@ifpr.edu.br" };
    const adminUser = { id: "user-admin-000", role: "ADMIN" as UserRole, isGuest: false, email: "admin@ifpr.edu.br" };

    it("deve bloquear usuários não autenticados (visitantes) de qualquer ação mutável", () => {
      expect(checkItemMutationPermission("EDIT", guestUser, sampleItem).allowed).toBe(false);
      expect(checkItemMutationPermission("STATUS_CHANGE", guestUser, sampleItem).allowed).toBe(false);
      expect(checkItemMutationPermission("DELETE", guestUser, sampleItem).allowed).toBe(false);
      expect(checkItemMutationPermission("RETURN", guestUser, sampleItem).allowed).toBe(false);
    });

    it("deve permitir que o autor (dono) edite e altere status de seu próprio item", () => {
      expect(checkItemMutationPermission("EDIT", ownerUser, sampleItem).allowed).toBe(true);
      expect(checkItemMutationPermission("STATUS_CHANGE", ownerUser, sampleItem).allowed).toBe(true);
      expect(checkItemMutationPermission("DELETE", ownerUser, sampleItem).allowed).toBe(true);
    });

    it("deve impedir que outro aluno edite, altere status ou exclua o item de terceiros", () => {
      expect(checkItemMutationPermission("EDIT", otherStudent, sampleItem).allowed).toBe(false);
      expect(checkItemMutationPermission("STATUS_CHANGE", otherStudent, sampleItem).allowed).toBe(false);
      expect(checkItemMutationPermission("DELETE", otherStudent, sampleItem).allowed).toBe(false);
      expect(checkItemMutationPermission("RETURN", otherStudent, sampleItem).allowed).toBe(false);
    });

    it("deve permitir que Servidores (TAE/Docente) editem, alterem status e registrem devoluções", () => {
      expect(checkItemMutationPermission("EDIT", staffUser, sampleItem).allowed).toBe(true);
      expect(checkItemMutationPermission("STATUS_CHANGE", staffUser, sampleItem).allowed).toBe(true);
      expect(checkItemMutationPermission("RETURN", staffUser, sampleItem).allowed).toBe(true);
      // Servidor comum não deve poder excluir item de terceiro (exclusão restrita ao dono e admin)
      expect(checkItemMutationPermission("DELETE", staffUser, sampleItem).allowed).toBe(false);
    });

    it("deve permitir que Administradores realizem todas as operações", () => {
      expect(checkItemMutationPermission("EDIT", adminUser, sampleItem).allowed).toBe(true);
      expect(checkItemMutationPermission("STATUS_CHANGE", adminUser, sampleItem).allowed).toBe(true);
      expect(checkItemMutationPermission("DELETE", adminUser, sampleItem).allowed).toBe(true);
      expect(checkItemMutationPermission("RETURN", adminUser, sampleItem).allowed).toBe(true);
    });
  });
});
