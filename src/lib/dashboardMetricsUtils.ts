import { LostFoundItem } from "../types";
import { safeIncludes, safeParseDate, sanitizeQuery } from "./utils";

export function isRecipientRemoteSignaturePending(item: Partial<LostFoundItem> | null | undefined): boolean {
  if (!item || item.status !== "DEVOLVIDO") return false;
  return item.recipientSignatureStatus === "PENDING_REMOTE" && !item.recipientSignatureUrl;
}

export function isRecipientReturnConcluded(item: Partial<LostFoundItem> | null | undefined): boolean {
  if (!item || item.status !== "DEVOLVIDO") return false;
  if (isRecipientRemoteSignaturePending(item)) return false;
  return item.recipientSignatureStatus === "SIGNED" || Boolean(item.recipientSignatureUrl);
}

export function isStaffAttestationPending(item: Partial<LostFoundItem> | null | undefined): boolean {
  if (!isRecipientReturnConcluded(item)) return false;
  return item?.staffSignatureStatus !== "SIGNED";
}

export function isDualSignatureCompleted(item: Partial<LostFoundItem> | null | undefined): boolean {
  if (!isRecipientReturnConcluded(item)) return false;
  return item?.staffSignatureStatus === "SIGNED";
}

export interface DashboardReturnMetrics {
  totalItems: number;
  registeredReturnsCount: number;
  pendingRemoteSignaturesCount: number;
  concludedReturnsCount: number;
  pendingStaffAttestationCount: number;
  dualSignedReturnsCount: number;
  successRate: number;
}

export function computeDashboardReturnMetrics(items: LostFoundItem[]): DashboardReturnMetrics {
  const validItems = (items || []).filter(Boolean);
  const totalItems = validItems.length;
  const registeredReturnsCount = validItems.filter((it) => it.status === "DEVOLVIDO").length;
  const pendingRemoteSignaturesCount = validItems.filter((it) => isRecipientRemoteSignaturePending(it)).length;
  const concludedReturnsCount = validItems.filter((it) => isRecipientReturnConcluded(it)).length;
  const pendingStaffAttestationCount = validItems.filter((it) => isStaffAttestationPending(it)).length;
  const dualSignedReturnsCount = validItems.filter((it) => isDualSignatureCompleted(it)).length;
  const successRate = totalItems > 0 ? Math.round((concludedReturnsCount / totalItems) * 100) : 0;

  return {
    totalItems,
    registeredReturnsCount,
    pendingRemoteSignaturesCount,
    concludedReturnsCount,
    pendingStaffAttestationCount,
    dualSignedReturnsCount,
    successRate,
  };
}

export interface AdminTableFilterOptions {
  search?: string;
  category?: string;
  statusFilter?: string;
}

/**
 * Filters and sorts items for the Admin "Controle de Objetos e Override de Status"
 * and Custody tables, prioritizing active items awaiting arrival (ENCONTRADO/PERDIDO),
 * then EM_ANALISE, then resolved items (DEVOLVIDO/ENCERRADO), ordered newest first.
 */
export function sortAndFilterAdminTableItems(
  items: LostFoundItem[],
  options: AdminTableFilterOptions = {}
): LostFoundItem[] {
  const { search = "", category = "TODAS", statusFilter = "TODOS" } = options;
  const q = sanitizeQuery(search);

  return [...(items || [])]
    .filter((it) => {
      if (!it) return false;
      if (category !== "TODAS" && it.category !== category) {
        return false;
      }
      if (statusFilter !== "TODOS" && it.status !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        safeIncludes(it.title, q) ||
        safeIncludes(it.registeredByName, q) ||
        safeIncludes(it.id, q) ||
        safeIncludes(it.qrCodeId, q) ||
        safeIncludes(it.location, q) ||
        safeIncludes(it.category, q) ||
        safeIncludes(it.color, q) ||
        safeIncludes(it.brand, q)
      );
    })
    .sort((a, b) => {
      const aPriority =
        a.status === "ENCONTRADO" || a.status === "PERDIDO"
          ? 0
          : a.status === "EM_ANALISE"
          ? 1
          : 2;
      const bPriority =
        b.status === "ENCONTRADO" || b.status === "PERDIDO"
          ? 0
          : b.status === "EM_ANALISE"
          ? 1
          : 2;
      if (aPriority !== bPriority) return aPriority - bPriority;
      const da = safeParseDate(a.createdAt || a.date)?.getTime() || 0;
      const db = safeParseDate(b.createdAt || b.date)?.getTime() || 0;
      return db - da;
    });
}

/**
 * Builds category distribution strictly from real stored items.
 * Returns [] when there are no items (never fabricates fallback slices).
 */
export function buildPieCategoryData(
  items: LostFoundItem[]
): Array<{ name: string; value: number }> {
  const categoryCounts: Record<string, number> = {};
  (items || []).forEach((it) => {
    if (!it || !it.category) return;
    categoryCounts[it.category] = (categoryCounts[it.category] || 0) + 1;
  });

  return Object.keys(categoryCounts).map((catKey) => ({
    name: catKey,
    value: categoryCounts[catKey],
  }));
}

/**
 * Reads JS heap memory usage from performance.memory when supported by the browser.
 * Returns null when unsupported (e.g., Firefox, Safari, SSR) instead of inventing values.
 */
export function readAvailableMemoryUsageMB(
  perfObj?: { memory?: { usedJSHeapSize?: number } } | null
): number | null {
  const targetPerf =
    perfObj !== undefined
      ? perfObj
      : typeof window !== "undefined" && typeof performance !== "undefined"
      ? (performance as any)
      : null;

  const usedHeap = targetPerf?.memory?.usedJSHeapSize;
  if (typeof usedHeap === "number" && Number.isFinite(usedHeap) && usedHeap > 0) {
    return parseFloat((usedHeap / (1024 * 1024)).toFixed(1));
  }
  return null;
}
