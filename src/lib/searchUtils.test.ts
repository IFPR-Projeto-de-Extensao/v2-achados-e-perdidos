import { describe, it, expect } from "vitest";
import { filterHomeItems } from "./searchUtils";
import { LostFoundItem } from "../types";
import { SemanticSearchResult } from "./apiHelper";

const mockItems: LostFoundItem[] = [
  {
    id: "item-1",
    title: "Chave do Armário",
    category: "Chaves",
    type: "PERDIDO",
    status: "PERDIDO",
    description: "Chave com chaveiro azul do IFPR",
    color: "Azul",
    brand: "Papaiz",
    location: "Biblioteca Central",
    date: "2026-08-10",
    imageUrl: "",
    contactInfo: "aluno@ifpr.edu.br",
    registeredByUserId: "user-1",
    registeredByRole: "ALUNO",
    registeredByName: "Lucas Silva",
    createdAt: "2026-08-10T10:00:00Z",
    qrCodeId: "QR-IFPR-001",
  },
  {
    id: "item-2",
    title: "Garrafa Térmica",
    category: "Garrafas & Marmitas",
    type: "ENCONTRADO",
    status: "ENCONTRADO",
    description: "Garrafa de alumínio preta deixada na arquibancada",
    color: "Preta",
    brand: "Kouda",
    location: "Quadra Poliesportiva",
    date: "2026-08-11",
    imageUrl: "",
    contactInfo: "servidor@ifpr.edu.br",
    registeredByUserId: "user-2",
    registeredByRole: "SERVIDOR",
    registeredByName: "Servidor Carlos",
    createdAt: "2026-08-11T14:00:00Z",
    qrCodeId: "QR-IFPR-002",
  },
  {
    id: "item-3",
    title: "Calculadora Científica",
    category: "Eletrônicos",
    type: "ENCONTRADO",
    status: "ENCONTRADO",
    description: "Calculadora Casio fx-82ms",
    color: "Cinza",
    brand: "Casio",
    location: "Laboratório de Informática 1",
    date: "2026-08-12",
    imageUrl: "",
    contactInfo: "mariana@ifpr.edu.br",
    registeredByUserId: "user-3",
    registeredByRole: "ALUNO",
    registeredByName: "Mariana Souza",
    createdAt: "2026-08-12T09:00:00Z",
    qrCodeId: "QR-IFPR-003",
  },
  {
    id: "item-4",
    // Test item with empty strings
    title: "Caderno Universitário",
    category: "Material Escolar & Livros",
    type: "PERDIDO",
    status: "PERDIDO",
    description: "",
    color: "",
    brand: "",
    location: "Bloco A - Sala 102",
    date: "2026-08-12",
    imageUrl: "",
    contactInfo: "",
    registeredByUserId: "user-4",
    registeredByRole: "ALUNO",
    registeredByName: "Ana Santos",
    createdAt: "2026-08-12T11:00:00Z",
    qrCodeId: "",
  },
];

describe("Home Search & Filter Logic (filterHomeItems)", () => {
  it("should return empty array if items array is null, undefined, or empty", () => {
    expect(filterHomeItems({ items: null })).toEqual([]);
    expect(filterHomeItems({ items: undefined })).toEqual([]);
    expect(filterHomeItems({ items: [] })).toEqual([]);
  });

  it("should return first 6 items by default when no search or category is specified", () => {
    const results = filterHomeItems({ items: mockItems });
    expect(results.length).toBe(4);
    expect(results[0].id).toBe("item-1");
  });

  it("should filter by category correctly", () => {
    const results = filterHomeItems({
      items: mockItems,
      selectedCategory: "Eletrônicos",
    });
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("item-3");
    expect(results[0].category).toBe("Eletrônicos");
  });

  it("should treat 'TODAS', null, or empty string category as matching all categories", () => {
    expect(filterHomeItems({ items: mockItems, selectedCategory: "TODAS" }).length).toBe(4);
    expect(filterHomeItems({ items: mockItems, selectedCategory: null }).length).toBe(4);
    expect(filterHomeItems({ items: mockItems, selectedCategory: undefined }).length).toBe(4);
    expect(filterHomeItems({ items: mockItems, selectedCategory: "" }).length).toBe(4);
  });

  it("should safely filter items with keyword search across title, description, location, color, brand, or qrCodeId", () => {
    const byTitle = filterHomeItems({ items: mockItems, searchTerm: "chave" });
    expect(byTitle.length).toBe(1);
    expect(byTitle[0].id).toBe("item-1");

    const byColor = filterHomeItems({ items: mockItems, searchTerm: "preta" });
    expect(byColor.length).toBe(1);
    expect(byColor[0].id).toBe("item-2");

    const byBrand = filterHomeItems({ items: mockItems, searchTerm: "Casio" });
    expect(byBrand.length).toBe(1);
    expect(byBrand[0].id).toBe("item-3");

    const byLocation = filterHomeItems({ items: mockItems, searchTerm: "Quadra" });
    expect(byLocation.length).toBe(1);
    expect(byLocation[0].id).toBe("item-2");

    const byQr = filterHomeItems({ items: mockItems, searchTerm: "QR-IFPR-001" });
    expect(byQr.length).toBe(1);
    expect(byQr[0].id).toBe("item-1");
  });

  it("should handle null/undefined item properties without throwing toLowerCase errors", () => {
    const dirtyItems = [
      ...mockItems,
      {
        id: "item-dirty",
        title: (null as unknown) as string,
        category: "Outros",
        type: "PERDIDO",
        status: "PERDIDO",
        description: (undefined as unknown) as string,
        color: (null as unknown) as string,
        brand: (undefined as unknown) as string,
        location: (null as unknown) as string,
        date: "2026-08-13",
        imageUrl: "",
        contactInfo: "",
        registeredByUserId: "user-99",
        registeredByRole: "ALUNO",
        registeredByName: "Teste",
        createdAt: "2026-08-13T00:00:00Z",
        qrCodeId: "",
      } as LostFoundItem,
    ];

    expect(() =>
      filterHomeItems({ items: dirtyItems, searchTerm: "qualquer", selectedCategory: "TODAS" })
    ).not.toThrow();
  });

  it("should prioritize AI semantic search results and sort by relevance score descending", () => {
    const mockSemanticResults: SemanticSearchResult[] = [
      { itemId: "item-2", relevanceScore: 80, explanation: "Garrafa", highlightKeywords: ["garrafa"] },
      { itemId: "item-1", relevanceScore: 95, explanation: "Chave azul", highlightKeywords: ["chave", "azul"] },
    ];

    const results = filterHomeItems({
      items: mockItems,
      searchTerm: "chave azul encontrada",
      semanticMode: true,
      semanticResults: mockSemanticResults,
    });

    expect(results.length).toBe(2);
    // Highest relevance score (95) comes first
    expect(results[0].id).toBe("item-1");
    expect(results[1].id).toBe("item-2");
  });

  it("should respect category filtering in conjunction with semantic search results", () => {
    const mockSemanticResults: SemanticSearchResult[] = [
      { itemId: "item-2", relevanceScore: 80, explanation: "Garrafa", highlightKeywords: ["garrafa"] },
      { itemId: "item-1", relevanceScore: 95, explanation: "Chave azul", highlightKeywords: ["chave", "azul"] },
    ];

    const results = filterHomeItems({
      items: mockItems,
      searchTerm: "chave azul encontrada",
      semanticMode: true,
      semanticResults: mockSemanticResults,
      selectedCategory: "Chaves",
    });

    expect(results.length).toBe(1);
    expect(results[0].id).toBe("item-1");
  });
});
