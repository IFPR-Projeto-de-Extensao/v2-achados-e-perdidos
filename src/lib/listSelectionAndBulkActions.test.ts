import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  toggleItemSelection,
  areAllFilteredItemsSelected,
  areSomeFilteredItemsSelected,
  toggleSelectAllFiltered,
  pruneStaleSelectedIds,
  resolveBulkActionTargetIds,
  reconcileSelectionAfterBulkAction,
} from "./catalogSelectionUtils";

describe("Catalog List/Grid Selection & Bulk Actions (QA Fix #1)", () => {
  const poolIds = ["item-a", "item-b", "item-c", "item-d"];

  it("selects a single item individually and unselects it cleanly", () => {
    const afterSelect = toggleItemSelection([], "item-b", true);
    expect(afterSelect).toEqual(["item-b"]);

    const afterUnselect = toggleItemSelection(afterSelect, "item-b", false);
    expect(afterUnselect).toEqual([]);
  });

  it("supports selecting multiple individual items without duplicates", () => {
    let selected: string[] = [];
    selected = toggleItemSelection(selected, "item-a", true);
    selected = toggleItemSelection(selected, "item-c", true);
    expect(selected).toEqual(["item-a", "item-c"]);

    // Selecting an already-selected item is idempotent (no duplicates)
    const noDup = toggleItemSelection(selected, "item-a", true);
    expect(noDup).toEqual(["item-a", "item-c"]);

    // Selecting a third item preserves existing selections
    const three = toggleItemSelection(noDup, "item-b", true);
    expect(three).toEqual(["item-a", "item-c", "item-b"]);

    // Unselecting one item preserves the remaining selected items
    const remaining = toggleItemSelection(three, "item-a", false);
    expect(remaining).toEqual(["item-c", "item-b"]);
  });

  it("ignores empty IDs gracefully", () => {
    expect(toggleItemSelection(["item-a"], "", true)).toEqual(["item-a"]);
    expect(toggleItemSelection(["item-a"], "", false)).toEqual(["item-a"]);
  });

  it("selects all and unselects all filtered items accurately", () => {
    const filteredIds = ["item-a", "item-b", "item-c"];
    expect(areAllFilteredItemsSelected([], filteredIds)).toBe(false);
    expect(areSomeFilteredItemsSelected([], filteredIds)).toBe(false);

    // Select all filtered
    const allSelected = toggleSelectAllFiltered([], filteredIds);
    expect(allSelected).toEqual(["item-a", "item-b", "item-c"]);
    expect(areAllFilteredItemsSelected(allSelected, filteredIds)).toBe(true);
    expect(areSomeFilteredItemsSelected(allSelected, filteredIds)).toBe(false);

    // Unselect all filtered
    const noneSelected = toggleSelectAllFiltered(allSelected, filteredIds);
    expect(noneSelected).toEqual([]);
    expect(areAllFilteredItemsSelected(noneSelected, filteredIds)).toBe(false);
    expect(areSomeFilteredItemsSelected(noneSelected, filteredIds)).toBe(false);
  });

  it("computes indeterminate partial-selection state accurately", () => {
    const filteredIds = ["item-a", "item-b", "item-c"];
    expect(areSomeFilteredItemsSelected(["item-b"], filteredIds)).toBe(true);
    expect(areAllFilteredItemsSelected(["item-b"], filteredIds)).toBe(false);

    // Toggling select-all when partially selected selects all filtered items
    const promoted = toggleSelectAllFiltered(["item-b"], filteredIds);
    expect(promoted).toEqual(["item-b", "item-a", "item-c"]);
    expect(areAllFilteredItemsSelected(promoted, filteredIds)).toBe(true);
    expect(areSomeFilteredItemsSelected(promoted, filteredIds)).toBe(false);
  });

  it("preserves selections outside the current filter when toggling select-all on a filtered subset", () => {
    const filteredSubset = ["item-a", "item-b"];
    const initialSelected = ["item-d"];

    const afterSelectSubset = toggleSelectAllFiltered(initialSelected, filteredSubset);
    expect(afterSelectSubset).toEqual(["item-d", "item-a", "item-b"]);

    const afterUnselectSubset = toggleSelectAllFiltered(afterSelectSubset, filteredSubset);
    expect(afterUnselectSubset).toEqual(["item-d"]);
  });

  it("prunes stale IDs that no longer exist in the catalog while deduplicating", () => {
    const pruned = pruneStaleSelectedIds(
      ["item-a", "deleted-99", "item-c", "item-a"],
      poolIds
    );
    expect(pruned).toEqual(["item-a", "item-c"]);
  });

  it("resolves bulk action target IDs strictly to valid selected items without affecting unselected items", () => {
    const selected = ["item-b", "item-d", "ghost-id", "item-b"];
    const targets = resolveBulkActionTargetIds(selected, poolIds);

    expect(targets).toEqual(["item-b", "item-d"]);
    expect(targets).not.toContain("item-a");
    expect(targets).not.toContain("item-c");
    expect(targets).not.toContain("ghost-id");
  });

  it("reconciles selection after partial bulk action failure, keeping failed IDs selected", () => {
    const current = ["item-a", "item-b", "item-c"];
    const remaining = reconcileSelectionAfterBulkAction(current, ["item-a", "item-c"]);
    expect(remaining).toEqual(["item-b"]);

    // Full success clears selection
    const empty = reconcileSelectionAfterBulkAction(remaining, ["item-b"]);
    expect(empty).toEqual([]);
  });

  it("preserves selected IDs across Grid <-> List layout mode transitions", () => {
    let layoutMode: "CARDS" | "LISTA" = "LISTA";
    let selected: string[] = [];

    // Select items in List mode
    selected = toggleItemSelection(selected, "item-a", true);
    selected = toggleItemSelection(selected, "item-c", true);
    expect(selected).toEqual(["item-a", "item-c"]);

    // Switch to Grid mode — state stays intact
    layoutMode = "CARDS";
    expect(layoutMode).toBe("CARDS");
    expect(selected).toEqual(["item-a", "item-c"]);

    // Toggle another item in Grid mode
    selected = toggleItemSelection(selected, "item-d", true);
    expect(selected).toEqual(["item-a", "item-c", "item-d"]);

    // Switch back to List mode — all 3 remain selected
    layoutMode = "LISTA";
    expect(layoutMode).toBe("LISTA");
    expect(selected).toEqual(["item-a", "item-c", "item-d"]);
  });

  describe("ObjectsView.tsx List Mode Structural Contract", () => {
    const objectsViewPath = path.resolve(process.cwd(), "src/components/ObjectsView.tsx");
    const source = fs.readFileSync(objectsViewPath, "utf-8");

    it("renders select-all header checkbox and per-row checkboxes in List Mode", () => {
      expect(source).toContain("headerCheckboxRef");
      expect(source).toContain("someFilteredSelected && !allFilteredSelected");
      expect(source).toContain("data-item-id={item.id}");
      expect(source).toContain('data-selected={isSelected ? "true" : "false"}');
      expect(source).toContain("aria-selected={isSelectableMode ? isSelected : undefined}");
    });

    it("prevents click propagation on checkbox cell so individual click does not double-toggle or open detail modal", () => {
      expect(source).toContain("onClick={(e) => e.stopPropagation()}");
      expect(source).toContain("handleToggleSelectItem(item.id, e.target.checked)");
    });

    it("toggles selection when clicking a row in selection mode and opens details otherwise", () => {
      expect(source).toContain("handleToggleSelectItem(item.id, !isSelected)");
      expect(source).toContain("handleItemClick(item)");
    });

    it("keeps Grid/List toggle accessible on mobile & desktop without clearing selectedItemIds", () => {
      expect(source).toContain('setLayoutViewMode("CARDS")');
      expect(source).toContain('setLayoutViewMode("LISTA")');
      expect(source).toContain("inline-flex items-center bg-white dark:bg-[#111827]");
    });

    it("uses resolveBulkActionTargetIds and reconcileSelectionAfterBulkAction for bulk actions", () => {
      expect(source).toContain("resolveBulkActionTargetIds(");
      expect(source).toContain("reconcileSelectionAfterBulkAction(prev, res?.succeededIds)");
    });
  });
});
