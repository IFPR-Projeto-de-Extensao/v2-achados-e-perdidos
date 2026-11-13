import { LostFoundItem } from "../types";

export interface HomeItemStats {
  totalItems: number;
  foundItems: number;
  lostItems: number;
  returnedItems: number;
}

/**
 * Calcula os contadores da tela inicial a partir do acervo real, sem mutar objetos:
 * - Deduplica por `id` válido para evitar contagem dupla caso existam duplicatas locais.
 * - Considera ativos na vitrine os itens que NÃO estão finalizados (DEVOLVIDO / ENCERRADO),
 *   incluindo ENCONTRADO, PERDIDO, EM_ANALISE, PROPRIETARIO_IDENTIFICADO e DISPONIVEL.
 */
export function computeHomeItemStats(
  items: readonly (LostFoundItem | null | undefined)[] | null | undefined
): HomeItemStats {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      totalItems: 0,
      foundItems: 0,
      lostItems: 0,
      returnedItems: 0,
    };
  }

  const seenIds = new Set<string>();
  let totalItems = 0;
  let foundItems = 0;
  let lostItems = 0;
  let returnedItems = 0;

  for (const item of items) {
    if (!item || typeof item !== "object") continue;

    const itemId = typeof item.id === "string" ? item.id.trim() : "";
    if (itemId) {
      if (seenIds.has(itemId)) continue;
      seenIds.add(itemId);
    }

    totalItems += 1;
    const status = String(item.status || "").trim().toUpperCase();

    if (status === "DEVOLVIDO") {
      returnedItems += 1;
      continue;
    }

    if (status === "ENCERRADO") {
      continue;
    }

    if (item.type === "ENCONTRADO") {
      foundItems += 1;
    } else if (item.type === "PERDIDO") {
      lostItems += 1;
    }
  }

  return {
    totalItems,
    foundItems,
    lostItems,
    returnedItems,
  };
}
