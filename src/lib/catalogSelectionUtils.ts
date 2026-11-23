/**
 * Pure, deterministic selection & bulk-target helpers shared between
 * Grid Mode (CARDS) and List Mode (LISTA) in ObjectsView.
 */

/**
 * Toggles a single item ID in the selected list without allowing duplicates.
 */
export function toggleItemSelection(
  selectedIds: readonly string[],
  itemId: string,
  shouldSelect: boolean
): string[] {
  if (!itemId) return [...selectedIds];
  const exists = selectedIds.includes(itemId);

  if (shouldSelect) {
    if (exists) return [...selectedIds];
    return [...selectedIds, itemId];
  }

  if (!exists) return [...selectedIds];
  return selectedIds.filter((id) => id !== itemId);
}

/**
 * Checks whether every ID in the current filtered catalog slice is selected.
 */
export function areAllFilteredItemsSelected(
  selectedIds: readonly string[],
  filteredIds: readonly string[]
): boolean {
  if (filteredIds.length === 0) return false;
  const selectedSet = new Set(selectedIds);
  return filteredIds.every((id) => selectedSet.has(id));
}

/**
 * Checks whether some (but not all) IDs in the current filtered catalog slice are selected.
 */
export function areSomeFilteredItemsSelected(
  selectedIds: readonly string[],
  filteredIds: readonly string[]
): boolean {
  if (filteredIds.length === 0 || selectedIds.length === 0) return false;
  const selectedSet = new Set(selectedIds);
  let matched = 0;
  for (const id of filteredIds) {
    if (selectedSet.has(id)) matched++;
  }
  return matched > 0 && matched < filteredIds.length;
}

/**
 * Toggles selection for all currently filtered items:
 * - If every filtered item is already selected, unselects all filtered items.
 * - Otherwise, selects every filtered item (deduplicated).
 */
export function toggleSelectAllFiltered(
  selectedIds: readonly string[],
  filteredIds: readonly string[]
): string[] {
  if (filteredIds.length === 0) return [];
  if (areAllFilteredItemsSelected(selectedIds, filteredIds)) {
    const filteredSet = new Set(filteredIds);
    return selectedIds.filter((id) => !filteredSet.has(id));
  }
  return Array.from(new Set([...selectedIds, ...filteredIds]));
}

/**
 * Prunes any selected IDs that are no longer present in the active catalog pool
 * while preserving order and deduplicating.
 */
export function pruneStaleSelectedIds(
  selectedIds: readonly string[],
  validPoolIds: readonly string[]
): string[] {
  if (selectedIds.length === 0) return [];
  const validSet = new Set(validPoolIds);
  const seen = new Set<string>();
  const next: string[] = [];
  for (const id of selectedIds) {
    if (validSet.has(id) && !seen.has(id)) {
      seen.add(id);
      next.push(id);
    }
  }
  return next;
}

/**
 * Resolves the exact target IDs for a bulk operation, guaranteeing that
 * unselected or nonexistent items are never included.
 */
export function resolveBulkActionTargetIds(
  selectedIds: readonly string[],
  validPoolIds: readonly string[]
): string[] {
  return pruneStaleSelectedIds(selectedIds, validPoolIds);
}

/**
 * After a bulk operation completes, removes only succeeded IDs from the selection,
 * preserving any failed IDs so the operator can inspect or retry them.
 */
export function reconcileSelectionAfterBulkAction(
  selectedIds: readonly string[],
  succeededIds: readonly string[] | undefined | null
): string[] {
  if (!succeededIds) return [];
  const succeededSet = new Set(succeededIds);
  return selectedIds.filter((id) => !succeededSet.has(id));
}
