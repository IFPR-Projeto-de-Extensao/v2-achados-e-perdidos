/**
 * Localiza+ Defensive Payload Size & Error Classification Engine
 * 
 * Implementa:
 * 1. Cálculo de tamanho em bytes UTF-8 do payload JSON serializado via TextEncoder (com fallbacks para Blob e encodeURIComponent).
 *    NOTA DE ARQUITETURA: Esta medição afere o tamanho do payload serializado em JavaScript e funciona como
 *    uma GUARDA DEFENSIVA conservadora (não representa nem substitui o tamanho interno/binário ou protocolo wire do Firestore).
 * 2. Guarda defensiva interna de 900.000 bytes (prevenindo que payloads se aproximem do teto rígido de 1 MiB do Firestore).
 * 3. Classificação sistemática e determinística de erros de sincronização (TEMPORÁRIOS vs PERMANENTES).
 */

export const FIRESTORE_DEFENSIVE_PAYLOAD_LIMIT_BYTES = 900_000;

export type SyncErrorCategory = "TEMPORARY" | "PERMANENT" | "AUTHORIZATION";

export interface ClassifiedSyncError {
  category: SyncErrorCategory;
  isPermanent: boolean;
  reason: string;
  userMessage: string;
  payloadSizeBytes?: number;
  originalCode?: string;
  originalName?: string;
  originalMessage?: string;
}

/**
 * Calcula o tamanho em bytes UTF-8 do payload serializado em JSON pelo JavaScript.
 * Funciona como uma GUARDA DEFENSIVA conservadora (não representa a serialização interna do Firestore).
 * Prefere TextEncoder quando disponível, com fallbacks para Blob e encodeURIComponent.
 */
export function calculatePayloadSizeBytes(data: unknown): number {
  if (data === null || data === undefined) return 0;
  try {
    const jsonString = typeof data === "string" ? data : JSON.stringify(data);
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(jsonString).length;
    }
    if (typeof Blob !== "undefined") {
      return new Blob([jsonString]).size;
    }
    return unescape(encodeURIComponent(jsonString)).length;
  } catch {
    return 0;
  }
}

/**
 * Validates if the given payload fits within the 900 KB defensive limit.
 */
export function isPayloadWithinDefensiveLimit(data: unknown): {
  isWithinLimit: boolean;
  byteSize: number;
  limitBytes: number;
} {
  const byteSize = calculatePayloadSizeBytes(data);
  return {
    isWithinLimit: byteSize <= FIRESTORE_DEFENSIVE_PAYLOAD_LIMIT_BYTES,
    byteSize,
    limitBytes: FIRESTORE_DEFENSIVE_PAYLOAD_LIMIT_BYTES,
  };
}

/**
 * Classifies sync errors into TEMPORARY (retryable upon reconnect/manual sync)
 * or PERMANENT (unrecoverable without user modification, e.g. payload > 900 KB or unrecoverable client errors).
 */
export function classifySyncError(error: unknown, payloadSizeBytes?: number): ClassifiedSyncError {
  const originalCode = (error as any)?.code;
  const originalName = (error as any)?.name || (error instanceof Error ? error.name : undefined);
  const originalMessage = error instanceof Error
    ? error.message
    : ((error as any)?.message || (typeof error === "string" ? error : String(error || "")));

  // 1. Check size guard first
  if (payloadSizeBytes !== undefined && payloadSizeBytes > FIRESTORE_DEFENSIVE_PAYLOAD_LIMIT_BYTES) {
    return {
      category: "PERMANENT",
      isPermanent: true,
      reason: `PAYLOAD_SIZE_EXCEEDS_DEFENSIVE_LIMIT (${payloadSizeBytes} bytes > ${FIRESTORE_DEFENSIVE_PAYLOAD_LIMIT_BYTES} bytes)`,
      userMessage: "Este item possui dados ou imagem grandes demais para sincronização. O cadastro foi preservado no dispositivo e precisa ser ajustado.",
      payloadSizeBytes,
      originalCode,
      originalName,
      originalMessage,
    };
  }

  const errMessage = originalMessage;
  const errLower = errMessage.toLowerCase();
  const codeLower = typeof originalCode === "string" ? originalCode.toLowerCase() : "";

  // 2. Unrecoverable data structure & payload boundary errors
  if (
    codeLower === "invalid-argument" ||
    codeLower === "resource-exhausted" ||
    errLower.includes("exceeds maximum allowed size") ||
    errLower.includes("payload_size_exceeds_defensive_limit") ||
    errLower.includes("field_limit_exceeded") ||
    errLower.includes("invalid-argument") ||
    errLower.includes("invalid argument")
  ) {
    return {
      category: "PERMANENT",
      isPermanent: true,
      reason: errMessage || "Erro permanente de validação ou estrutura de dados",
      userMessage: "Este item possui dados/imagens que excedem os limites permitidos. O cadastro precisa ser cancelado ou ajustado.",
      payloadSizeBytes,
      originalCode,
      originalName,
      originalMessage,
    };
  }

  // 3. Permission and authorization errors (permission-denied is NOT network instability)
  if (
    codeLower === "permission-denied" ||
    errLower.includes("permission-denied") ||
    errLower.includes("permission denied") ||
    errLower.includes("missing or insufficient permissions")
  ) {
    return {
      category: "AUTHORIZATION",
      isPermanent: true,
      reason: errMessage || "Recusado pelas regras de segurança do Firestore (permission-denied)",
      userMessage: "Sincronização recusada por falta de autorização/permissão no Firestore. O item permanece preservado no dispositivo.",
      payloadSizeBytes,
      originalCode,
      originalName,
      originalMessage,
    };
  }

  // 4. Temporary / Transient errors (unavailable, deadline-exceeded, network timeout, offline, network failure)
  return {
    category: "TEMPORARY",
    isPermanent: false,
    reason: errMessage || "Instabilidade transitória de rede ou serviço",
    userMessage: "Não foi possível sincronizar agora devido a instabilidade temporária. Tentaremos novamente.",
    payloadSizeBytes,
    originalCode,
    originalName,
    originalMessage,
  };
}
