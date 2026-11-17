export interface PaginatedPublicApiOptions {
  limit?: number;
  maxPages?: number;
  fetcher?: typeof fetch;
}

/**
 * Consome todas as páginas de um endpoint público paginado por cursor (`nextCursor` / `hasMore`)
 * mantendo compatibilidade com respostas legadas sem paginação e proteção contra loops de cursor.
 */
export async function fetchAllPaginatedPublicRecords<T = Record<string, any>>(
  baseUrl: string,
  listKey: "items" | "entries",
  options: PaginatedPublicApiOptions = {}
): Promise<{ ok: boolean; records: T[]; pagesLoaded: number }> {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 100), 1), 100);
  const maxPages = Math.min(Math.max(Math.trunc(options.maxPages ?? 50), 1), 200);
  const fetchImpl = options.fetcher || fetch;

  const accumulated: T[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  let pagesLoaded = 0;

  while (pagesLoaded < maxPages) {
    const separator = baseUrl.includes("?") ? "&" : "?";
    const url = cursor
      ? `${baseUrl}${separator}limit=${limit}&cursor=${encodeURIComponent(cursor)}`
      : `${baseUrl}${separator}limit=${limit}`;

    const res = await fetchImpl(url);
    if (!res || !res.ok) {
      return { ok: false, records: [], pagesLoaded };
    }

    const payload = await res.json();
    const batch = Array.isArray(payload?.[listKey]) ? (payload[listKey] as T[]) : [];
    accumulated.push(...batch);
    pagesLoaded++;

    const nextCursor =
      typeof payload?.nextCursor === "string" && payload.nextCursor.trim().length > 0
        ? payload.nextCursor.trim()
        : null;
    const hasMore = Boolean(payload?.hasMore && nextCursor);

    if (!hasMore || !nextCursor || seenCursors.has(nextCursor)) {
      break;
    }

    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  return { ok: true, records: accumulated, pagesLoaded };
}
