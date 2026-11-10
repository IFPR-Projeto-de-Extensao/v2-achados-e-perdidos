/**
 * Centralized Category Normalization & Matching Utility
 * Localiza+ IFPR Campus Ivaiporã
 *
 * Ensures canonical representation, case-insensitive normalization,
 * whitespace trimming, display labels, internal identifiers,
 * and backward compatibility across registration, editing, persistence, and filtering.
 */

import { ItemCategory } from "../types";

/**
 * 9 Canonical Item Categories recognized across the entire Localiza+ ecosystem
 */
export const CANONICAL_ITEM_CATEGORIES: readonly ItemCategory[] = [
  "Eletrônicos",
  "Documentos & Cartões",
  "Roupas & Calçados",
  "Chaves",
  "Material Escolar & Livros",
  "Acessórios & Bijuterias",
  "Garrafas & Marmitas",
  "Guarda-chuvas",
  "Outros",
] as const;

export interface CategoryMetadata {
  id: string; // Internal standard uppercase identifier (e.g. "OUTROS")
  canonical: ItemCategory; // Canonical stored and typed representation (e.g. "Outros")
  label: string; // Human-readable UI display label (e.g. "Outros")
  aliases: readonly string[]; // All legacy, uppercase, slug, and variations
}

export const CATEGORY_DEFINITIONS: Record<ItemCategory, CategoryMetadata> = {
  "Eletrônicos": {
    id: "ELETRONICOS",
    canonical: "Eletrônicos",
    label: "Eletrônicos",
    aliases: [
      "eletronicos",
      "eletrônicos",
      "eletronico",
      "eletrônico",
      "eletronicos & acessorios",
      "eletrônicos & acessórios",
      "eletronicos e acessorios",
      "eletrônicos e acessórios",
      "celular",
      "notebook",
      "smartphone",
      "computador",
    ],
  },
  "Documentos & Cartões": {
    id: "DOCUMENTOS",
    canonical: "Documentos & Cartões",
    label: "Documentos & Cartões",
    aliases: [
      "documentos",
      "documento",
      "cartoes",
      "cartões",
      "cartao",
      "cartão",
      "documentos & cartões",
      "documentos e cartoes",
      "documentos e cartões",
      "documentos_cartoes",
      "carteirinha",
      "crachá",
      "cracha",
      "cnh",
      "rg",
      "cpf",
    ],
  },
  "Roupas & Calçados": {
    id: "VESTUARIO",
    canonical: "Roupas & Calçados",
    label: "Roupas & Calçados",
    aliases: [
      "vestuario",
      "vestuário",
      "roupas",
      "roupa",
      "calcados",
      "calçados",
      "calcado",
      "calçado",
      "roupas & calçados",
      "roupas e calcados",
      "roupas e calçados",
      "vestuario_roupas",
      "vestuário / roupas",
      "casaco",
      "agasalho",
      "jaqueta",
      "moletom",
      "tenis",
      "tênis",
    ],
  },
  "Chaves": {
    id: "CHAVES",
    canonical: "Chaves",
    label: "Chaves",
    aliases: [
      "chaves",
      "chave",
      "chaveiro",
      "chaveiros",
    ],
  },
  "Material Escolar & Livros": {
    id: "MATERIAL_ESCOLAR",
    canonical: "Material Escolar & Livros",
    label: "Material Escolar & Livros",
    aliases: [
      "material escolar",
      "material_escolar",
      "material escolar & livros",
      "material escolar e livros",
      "livros",
      "livro",
      "caderno",
      "cadernos",
      "estojo",
      "estojos",
      "apostila",
      "apostilas",
      "mochila",
      "mochilas",
    ],
  },
  "Acessórios & Bijuterias": {
    id: "ACESSORIOS",
    canonical: "Acessórios & Bijuterias",
    label: "Acessórios & Bijuterias",
    aliases: [
      "acessorios",
      "acessórios",
      "acessorio",
      "acessório",
      "bijuterias",
      "bijuteria",
      "acessórios & bijuterias",
      "acessorios e bijuterias",
      "acessorios_objetos_pessoais",
      "acessórios / objetos pessoais",
      "óculos",
      "oculos",
      "relogio",
      "relógio",
      "pulseira",
      "anel",
      "colar",
    ],
  },
  "Garrafas & Marmitas": {
    id: "GARRAFAS",
    canonical: "Garrafas & Marmitas",
    label: "Garrafas & Marmitas",
    aliases: [
      "garrafas",
      "garrafa",
      "marmitas",
      "marmita",
      "garrafas & marmitas",
      "garrafas e marmitas",
      "garrafas e copos",
      "garrafas / copos",
      "copos",
      "copo",
      "squeeze",
      "squeezes",
      "garrafas_marmitas",
      "termica",
      "térmica",
    ],
  },
  "Guarda-chuvas": {
    id: "GUARDA_CHUVAS",
    canonical: "Guarda-chuvas",
    label: "Guarda-chuvas",
    aliases: [
      "guarda-chuvas",
      "guarda-chuva",
      "guarda_chuvas",
      "guarda_chuva",
      "guardachuvas",
      "guardachuva",
      "sombrinhas",
      "sombrinha",
    ],
  },
  "Outros": {
    id: "OUTROS",
    canonical: "Outros",
    label: "Outros",
    aliases: [
      "outros",
      "outro",
      "outros objetos",
      "outros_objetos",
      "outras",
      "diversos",
      "diverso",
    ],
  },
};

/**
 * Normalizes a string for clean comparison (trims, lowercases, removes accents and symbols)
 */
function cleanKey(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[&/_\\-]+/g, " ")       // normalize separators to space
    .replace(/\s+/g, " ")             // collapse multiple spaces
    .trim();
}

// Pre-computed lookup map for O(1) alias resolution
const ALIAS_LOOKUP_MAP: Map<string, ItemCategory> = new Map();

for (const canonical of CANONICAL_ITEM_CATEGORIES) {
  const def = CATEGORY_DEFINITIONS[canonical];
  // Map canonical name
  ALIAS_LOOKUP_MAP.set(cleanKey(canonical), canonical);
  // Map internal uppercase ID
  ALIAS_LOOKUP_MAP.set(cleanKey(def.id), canonical);
  // Map display label
  ALIAS_LOOKUP_MAP.set(cleanKey(def.label), canonical);
  // Map all registered aliases
  for (const alias of def.aliases) {
    ALIAS_LOOKUP_MAP.set(cleanKey(alias), canonical);
  }
}

/**
 * Normalizes any category string into the canonical ItemCategory representation.
 * - Handles differences between uppercase / lowercase (e.g. "OUTROS" -> "Outros")
 * - Handles leading and trailing whitespace (e.g. "  outros  " -> "Outros")
 * - Resolves known slugs and legacy values (e.g. "VESTUARIO" -> "Roupas & Calçados")
 * - Defaults empty/null/undefined to "Outros"
 * - Preserves unrecognized custom categories cleanly without data corruption
 */
export function normalizeCategory(category: string | undefined | null): ItemCategory {
  if (!category || typeof category !== "string") {
    return "Outros";
  }

  const trimmed = category.trim();
  if (trimmed === "") {
    return "Outros";
  }

  // Direct exact match
  if (CANONICAL_ITEM_CATEGORIES.includes(trimmed as ItemCategory)) {
    return trimmed as ItemCategory;
  }

  // Lookup by normalized cleaned key
  const cleaned = cleanKey(trimmed);
  const matched = ALIAS_LOOKUP_MAP.get(cleaned);
  if (matched) {
    return matched;
  }

  // If no match found, fallback safely: if it contains "outro", resolve to "Outros"
  if (cleaned.includes("outro")) {
    return "Outros";
  }

  // For any non-empty custom string, return trimmed as ItemCategory fallback
  return trimmed as ItemCategory;
}

/**
 * Returns human-readable, beautifully capitalized display name for any category.
 * Always returns "Outros" for "OUTROS", "outros", " Outros ", etc.
 */
export function getCategoryDisplay(category: string | undefined | null): string {
  const normalized = normalizeCategory(category);
  return CATEGORY_DEFINITIONS[normalized]?.label || String(category || "Outros").trim();
}

/**
 * Returns the standardized uppercase internal identifier for any category (e.g. "OUTROS")
 */
export function getCategoryInternalId(category: string | undefined | null): string {
  const normalized = normalizeCategory(category);
  return CATEGORY_DEFINITIONS[normalized]?.id || String(category || "OUTROS").trim().toUpperCase();
}

/**
 * Checks whether two category representations are equivalent.
 * Returns true for ("Outros", "OUTROS"), ("outros", " Outros "), etc.
 */
export function areCategoriesEquivalent(
  catA: string | undefined | null,
  catB: string | undefined | null
): boolean {
  if (!catA && !catB) return true;
  if (!catA || !catB) return false;
  return normalizeCategory(catA) === normalizeCategory(catB);
}

/**
 * Evaluates whether an item's category matches an active category filter.
 * - If filter is empty, "TODAS", or "TODOS", returns true (matches all).
 * - Otherwise performs canonical equivalent matching.
 */
export function isCategoryMatch(
  itemCategory: string | undefined | null,
  filterCategory: string | undefined | null
): boolean {
  if (!filterCategory) return true;
  const cleanFilter = filterCategory.trim().toUpperCase();
  if (cleanFilter === "TODAS" || cleanFilter === "TODOS" || cleanFilter === "") {
    return true;
  }
  return areCategoriesEquivalent(itemCategory, filterCategory);
}
