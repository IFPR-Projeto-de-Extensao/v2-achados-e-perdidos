import { describe, it, expect } from "vitest";
import {
  normalizeCategory,
  getCategoryDisplay,
  getCategoryInternalId,
  areCategoriesEquivalent,
  isCategoryMatch,
  CANONICAL_ITEM_CATEGORIES,
} from "./categoryUtils";
import { searchItems } from "./searchUtils";
import { LostFoundItem, ItemCategory } from "../types";

describe("LOCALIZA+ — Correção de Inconsistência na Categoria 'Outros' & Normalização Canônica", () => {
  // Test 1: Cadastro com categoria "Outros"
  it("1. Cadastro com categoria 'Outros' deve persistir a representação canônica", () => {
    const rawInput = "Outros";
    const normalized = normalizeCategory(rawInput);

    expect(normalized).toBe("Outros");
    expect(getCategoryDisplay(normalized)).toBe("Outros");
    expect(getCategoryInternalId(normalized)).toBe("OUTROS");
  });

  // Test 2: Edição mantendo a categoria "Outros"
  it("2. Edição mantendo a categoria 'Outros' não deve alterar o valor canônico", () => {
    const originalCategory: ItemCategory = "Outros";
    const editInput = "Outros";
    const saved = normalizeCategory(editInput);

    expect(saved).toBe("Outros");
    expect(areCategoriesEquivalent(originalCategory, saved)).toBe(true);
  });

  // Test 3: Edição alterando outra categoria para "Outros"
  it("3. Edição alterando outra categoria para 'Outros' (ou variações como 'OUTROS' ou com espaços) deve salvar canônico", () => {
    const inputs = ["Outros", "OUTROS", "outros", "  outros  ", " OUTRO ", "Outro"];

    inputs.forEach((input) => {
      const saved = normalizeCategory(input);
      expect(saved).toBe("Outros");
      expect(getCategoryDisplay(saved)).toBe("Outros");
    });
  });

  // Test 4: Reedição de um objeto que já possui "OUTROS"
  it("4. Reedição de um objeto que já possui 'OUTROS' legado deve normalizar e preservar 'Outros' sucessivamente", () => {
    let currentCategory: string = "OUTROS";

    // Simula 5 edições sucessivas
    for (let i = 0; i < 5; i++) {
      currentCategory = normalizeCategory(currentCategory);
      expect(currentCategory).toBe("Outros");
      expect(getCategoryDisplay(currentCategory)).toBe("Outros");
    }
  });

  // Test 5: Filtragem conjunta de registros com "Outros" e "OUTROS"
  it("5. Filtragem conjunta de registros deve incluir indistintamente 'Outros' e 'OUTROS'", () => {
    const mockItems: Partial<LostFoundItem>[] = [
      { id: "1", title: "Item 1", category: "Outros" as ItemCategory },
      { id: "2", title: "Item 2", category: "OUTROS" as any },
      { id: "3", title: "Item 3", category: " outros " as any },
      { id: "4", title: "Item 4", category: "Eletrônicos" as ItemCategory },
      { id: "5", title: "Item 5", category: "Chaves" as ItemCategory },
    ];

    const filterCategory = "Outros";
    const matched = mockItems.filter((i) => isCategoryMatch(i.category, filterCategory));

    expect(matched).toHaveLength(3);
    expect(matched.map((m) => m.id)).toEqual(["1", "2", "3"]);
  });

  // Test 6: Persistência da categoria no formato canônico
  it("6. Persistência da categoria deve produzir sempre o valor canônico padrão", () => {
    const testCases: [string, ItemCategory][] = [
      ["OUTROS", "Outros"],
      ["outros", "Outros"],
      ["Outros", "Outros"],
      ["  OUTROS  ", "Outros"],
      ["ELETRONICOS", "Eletrônicos"],
      ["eletronicos", "Eletrônicos"],
      ["VESTUARIO", "Roupas & Calçados"],
      ["CHAVES", "Chaves"],
      ["MATERIAL_ESCOLAR", "Material Escolar & Livros"],
      ["ACESSORIOS", "Acessórios & Bijuterias"],
      ["GARRAFAS", "Garrafas & Marmitas"],
      ["GUARDA_CHUVAS", "Guarda-chuvas"],
    ];

    testCases.forEach(([input, expected]) => {
      expect(normalizeCategory(input)).toBe(expected);
    });
  });

  // Test 7: Exibição correta do nome "Outros" na interface
  it("7. Exibição na interface deve manter a capitalização visual adequada 'Outros'", () => {
    expect(getCategoryDisplay("OUTROS")).toBe("Outros");
    expect(getCategoryDisplay("outros")).toBe("Outros");
    expect(getCategoryDisplay(" Outros ")).toBe("Outros");
    expect(getCategoryDisplay(null)).toBe("Outros");
    expect(getCategoryDisplay(undefined)).toBe("Outros");
  });

  // Test 8: Garantia de que as demais categorias continuam funcionando
  it("8. Todas as 9 categorias canônicas oficiais continuam preservadas e acessíveis", () => {
    expect(CANONICAL_ITEM_CATEGORIES).toHaveLength(9);

    CANONICAL_ITEM_CATEGORIES.forEach((cat) => {
      expect(normalizeCategory(cat)).toBe(cat);
      expect(getCategoryDisplay(cat)).toBe(cat);
      expect(areCategoriesEquivalent(cat, cat)).toBe(true);
      expect(isCategoryMatch(cat, cat)).toBe(true);
    });
  });

  // Test 9: Compatibilidade com registros antigos e busca
  it("9. Compatibilidade com registros antigos no utilitário de busca (searchUtils)", () => {
    const items: LostFoundItem[] = [
      {
        id: "item-antigo-1",
        title: "Guarda-sol antigo",
        category: "OUTROS" as any,
        description: "Objeto variado",
        location: "Portaria",
        color: "Azul",
        brand: "Genérico",
        date: "2026-01-01",
        imageUrl: "",
        contactInfo: "Secretaria",
        type: "ENCONTRADO",
        status: "ENCONTRADO",
        createdAt: "2026-01-01T10:00:00Z",
        qrCodeId: "QR-1",
        registeredByUserId: "uid-1",
        registeredByName: "Admin",
        registeredByRole: "ADMIN",
        storageDeadlineDays: 90,
      },
      {
        id: "item-recente-2",
        title: "Brinquedo recente",
        category: "Outros",
        description: "Brinquedo de plástico",
        location: "Pátio",
        color: "Amarelo",
        brand: "Lego",
        date: "2026-02-01",
        imageUrl: "",
        contactInfo: "Secretaria",
        type: "ENCONTRADO",
        status: "ENCONTRADO",
        createdAt: "2026-02-01T10:00:00Z",
        qrCodeId: "QR-2",
        registeredByUserId: "uid-1",
        registeredByName: "Admin",
        registeredByRole: "ADMIN",
        storageDeadlineDays: 90,
      },
      {
        id: "item-outro-tipo",
        title: "Celular Samsung",
        category: "Eletrônicos",
        description: "Aparelho preto",
        location: "Sala 02",
        color: "Preto",
        brand: "Samsung",
        date: "2026-02-01",
        imageUrl: "",
        contactInfo: "Secretaria",
        type: "ENCONTRADO",
        status: "ENCONTRADO",
        createdAt: "2026-02-01T10:00:00Z",
        qrCodeId: "QR-3",
        registeredByUserId: "uid-1",
        registeredByName: "Admin",
        registeredByRole: "ADMIN",
        storageDeadlineDays: 90,
      },
    ];

    // Busca filtrando por "Outros"
    const results = searchItems(items, "", "Outros");

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.id)).toContain("item-antigo-1");
    expect(results.map((r) => r.id)).toContain("item-recente-2");
    expect(results.map((r) => r.id)).not.toContain("item-outro-tipo");
  });

  // Test 10: Ausência de regressões no cadastro e na edição
  it("10. Ausência de regressão: valores não reconhecidos são preservados sem corrupção", () => {
    const customCategory = "Equipamento Especial de Laboratório";
    const normalized = normalizeCategory(customCategory);

    expect(normalized).toBe(customCategory);
    expect(areCategoriesEquivalent(customCategory, customCategory)).toBe(true);
    expect(areCategoriesEquivalent(customCategory, "Outros")).toBe(false);
  });
});
