import { LostFoundItem } from "../types";
import { SemanticSearchResult } from "./apiHelper";
import { safeIncludes, sanitizeQuery, safeToLower } from "./utils";

export interface FilterHomeItemsOptions {
  items: LostFoundItem[] | null | undefined;
  searchTerm?: string | null | undefined;
  selectedCategory?: string | null | undefined;
  semanticMode?: boolean;
  semanticResults?: SemanticSearchResult[] | null | undefined;
  limit?: number;
}

/**
 * Filter items for the Home page display, respecting semantic results (if active)
 * or falling back safely to local multi-field search with category filtering.
 * Guaranteed 100% null/undefined safe.
 */
export function filterHomeItems(options: FilterHomeItemsOptions): LostFoundItem[] {
  const {
    items,
    searchTerm,
    selectedCategory,
    semanticMode = true,
    semanticResults,
    limit = 6,
  } = options;

  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const cleanSearch = sanitizeQuery(searchTerm);
  const cleanCategory = sanitizeQuery(selectedCategory);
  const isCategoryAll = !cleanCategory || cleanCategory === "TODAS";

  // If semantic mode has positive results and search query has at least 3 characters
  if (
    semanticMode &&
    Array.isArray(semanticResults) &&
    semanticResults.length > 0 &&
    cleanSearch.length >= 3
  ) {
    const semanticItemMap = new Map(semanticResults.map((r) => [r.itemId, r]));

    const matchedItems = items
      .filter((item) => item && semanticItemMap.has(item.id))
      .filter((item) => isCategoryAll || item.category === cleanCategory);

    // Sort by AI relevance score descending
    matchedItems.sort((a, b) => {
      const scoreA = semanticItemMap.get(a.id)?.relevanceScore || 0;
      const scoreB = semanticItemMap.get(b.id)?.relevanceScore || 0;
      return scoreB - scoreA;
    });

    return matchedItems;
  }

  // Standard safe keyword filter
  const filtered = items.filter((item) => {
    if (!item) return false;

    const matchesCategory = isCategoryAll || item.category === cleanCategory;
    if (!matchesCategory) return false;

    if (!cleanSearch) return true;

    return (
      safeIncludes(item.title, cleanSearch) ||
      safeIncludes(item.description, cleanSearch) ||
      safeIncludes(item.location, cleanSearch) ||
      safeIncludes(item.brand, cleanSearch) ||
      safeIncludes(item.color, cleanSearch) ||
      safeIncludes(item.qrCodeId, cleanSearch) ||
      safeIncludes(item.id, cleanSearch) ||
      safeToLower(item.category) === safeToLower(cleanSearch)
    );
  });

  return typeof limit === "number" && limit > 0 ? filtered.slice(0, limit) : filtered;
}
