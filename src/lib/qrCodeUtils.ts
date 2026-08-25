import { LostFoundItem } from "../types";
import { db } from "./firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { safeToLower } from "./utils";

/**
 * Returns the public canonical deep-link URL for an item.
 * Encoded inside QR Codes and share links so scanning instantly opens the item details.
 */
export function getItemPublicUrl(item: { id: string; qrCodeId?: string; type?: string }): string {
  if (!item || !item.id) return "";
  
  const origin =
    typeof window !== "undefined" && window.location?.origin && window.location.origin !== "null"
      ? window.location.origin
      : "https://localizamais.ifpr.edu.br";

  const tab = item.type === "PERDIDO" ? "lost" : "found";
  const params = new URLSearchParams();
  params.set("tab", tab);
  params.set("itemId", item.id);
  if (item.qrCodeId) {
    params.set("qr", item.qrCodeId);
  }

  return `${origin}/?${params.toString()}`;
}

/**
 * Returns the exact value to be encoded in QRCodeSVG components and printable tags.
 */
export function getItemQrValue(item: { id: string; qrCodeId?: string; type?: string }): string {
  return getItemPublicUrl(item);
}

export interface ParsedQrResult {
  itemId: string | null;
  qrCodeId: string | null;
  tab: string | null;
  rawQuery: string;
}

/**
 * Parses any input string (URL, query string, path, or raw tag code) to extract
 * the item ID or QR Tag ID.
 */
export function parseQrCodeOrUrl(input: string): ParsedQrResult {
  const rawQuery = (input || "").trim();
  if (!rawQuery) {
    return { itemId: null, qrCodeId: null, tab: null, rawQuery: "" };
  }

  // 1. Try parsing as a URL
  try {
    let urlObj: URL | null = null;
    if (rawQuery.startsWith("http://") || rawQuery.startsWith("https://")) {
      urlObj = new URL(rawQuery);
    } else if (rawQuery.startsWith("/")) {
      urlObj = new URL(rawQuery, "https://localizamais.ifpr.edu.br");
    } else if (
      rawQuery.includes("?itemId=") ||
      rawQuery.includes("&itemId=") ||
      rawQuery.includes("?item=") ||
      rawQuery.includes("&item=") ||
      rawQuery.includes("?id=") ||
      rawQuery.includes("&id=") ||
      rawQuery.includes("?qr=") ||
      rawQuery.includes("&qr=")
    ) {
      urlObj = new URL(
        `https://localizamais.ifpr.edu.br/${rawQuery.startsWith("?") ? "" : "?"}${rawQuery}`
      );
    }

    if (urlObj) {
      const params = urlObj.searchParams;
      const itemId =
        params.get("itemId") ||
        params.get("item") ||
        params.get("id") ||
        null;
      const qrCodeId =
        params.get("qr") ||
        params.get("qrCodeId") ||
        params.get("qrCode") ||
        null;
      const tab = params.get("tab") || null;

      // Check path: e.g. /item/123 or /itens/123 or /achados/123 or /perdidos/123 or /qr/123
      const pathSegments = urlObj.pathname.split("/").filter(Boolean);
      let pathItemId: string | null = null;
      for (let i = 0; i < pathSegments.length; i++) {
        const seg = pathSegments[i].toLowerCase();
        if (
          ["item", "itens", "objeto", "objetos", "achados", "perdidos", "qr"].includes(seg) &&
          pathSegments[i + 1]
        ) {
          pathItemId = decodeURIComponent(pathSegments[i + 1]);
          break;
        }
      }

      if (itemId || qrCodeId || pathItemId) {
        return {
          itemId: itemId || pathItemId || null,
          qrCodeId: qrCodeId || null,
          tab: tab || null,
          rawQuery,
        };
      }
    }
  } catch (_) {
    // Not a valid URL, continue to pattern matching
  }

  // 2. Check if it is a QR-IFPR code format (e.g. QR-IFPR-101-GARRAFA)
  if (/^QR-IFPR-/i.test(rawQuery)) {
    return {
      itemId: null,
      qrCodeId: rawQuery,
      tab: null,
      rawQuery,
    };
  }

  // 3. Fallback: treat as potential item ID or search string
  return {
    itemId: rawQuery,
    qrCodeId: null,
    tab: null,
    rawQuery,
  };
}

/**
 * Searches in-memory items list for an item matching either its ID or qrCodeId.
 */
export function findItemInList(
  parsed: ParsedQrResult | string,
  items: LostFoundItem[]
): LostFoundItem | null {
  if (!items || items.length === 0) return null;

  const parsedObj = typeof parsed === "string" ? parseQrCodeOrUrl(parsed) : parsed;
  const targetItemId = parsedObj.itemId ? safeToLower(parsedObj.itemId) : null;
  const targetQrId = parsedObj.qrCodeId ? safeToLower(parsedObj.qrCodeId) : null;
  const targetRaw = safeToLower(parsedObj.rawQuery);

  // Exact ID match
  if (targetItemId) {
    const match = items.find((it) => it && safeToLower(it.id) === targetItemId);
    if (match) return match;
  }

  // Exact QR Code ID match
  if (targetQrId) {
    const match = items.find((it) => it && safeToLower(it.qrCodeId) === targetQrId);
    if (match) return match;
  }

  // Match raw query against ID, QR Tag, or partial match
  if (targetRaw) {
    const exactMatch = items.find(
      (it) =>
        it &&
        (safeToLower(it.id) === targetRaw ||
          safeToLower(it.qrCodeId) === targetRaw)
    );
    if (exactMatch) return exactMatch;

    // Partial QR match
    const partialMatch = items.find(
      (it) =>
        it &&
        ((it.qrCodeId && safeToLower(it.qrCodeId).includes(targetRaw)) ||
          (it.title && safeToLower(it.title).includes(targetRaw)))
    );
    if (partialMatch) return partialMatch;
  }

  return null;
}

/**
 * Asynchronously fetches an item from Firestore by its unique document ID or qrCodeId.
 * Guarantees that deep-linked QR code scans work even before in-memory state finishes syncing.
 */
export async function fetchItemFromFirestore(
  parsedOrId: ParsedQrResult | string
): Promise<LostFoundItem | null> {
  const parsed = typeof parsedOrId === "string" ? parseQrCodeOrUrl(parsedOrId) : parsedOrId;
  const searchId = parsed.itemId || (parsed.rawQuery && !parsed.rawQuery.startsWith("http") ? parsed.rawQuery : null);
  const searchQr = parsed.qrCodeId || (parsed.rawQuery && parsed.rawQuery.startsWith("QR-IFPR-") ? parsed.rawQuery : null);

  // 1. Direct Document ID lookup
  if (searchId) {
    try {
      const docRef = doc(db, "items", searchId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return { id: snap.id, ...snap.data() } as LostFoundItem;
      }
    } catch (err) {
      console.warn("[qrCodeUtils] Erro ao buscar item por ID no Firestore:", err);
    }
  }

  // 2. Query by qrCodeId field in Firestore
  if (searchQr) {
    try {
      const itemsCol = collection(db, "items");
      const q = query(itemsCol, where("qrCodeId", "==", searchQr));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const firstDoc = snap.docs[0];
        return { id: firstDoc.id, ...firstDoc.data() } as LostFoundItem;
      }
    } catch (err) {
      console.warn("[qrCodeUtils] Erro ao buscar item por qrCodeId no Firestore:", err);
    }
  }

  return null;
}
