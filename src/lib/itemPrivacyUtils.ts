import { LostFoundItem, ItemHistoryLog } from "../types";

/**
 * Lista canônica de campos privados/sensíveis de devolução, assinatura,
 * identificação pessoal (PII) e segredos de verificação que NUNCA devem
 * permanecer expostos nas coleções de catálogo público (/items, /found_items, /lost_items)
 * ou em caches locais de visitantes/alunos.
 */
export const PRIVATE_ITEM_FIELDS = [
  "recipientName",
  "recipientEmail",
  "recipientBond",
  "recipientDocument",
  "recipientUid",
  "returnObservations",
  "receiptValidationCode",
  "recipientSignatureUrl",
  "recipientSignatureType",
  "recipientSignatureMethod",
  "recipientSignatureStatus",
  "recipientSignatureName",
  "recipientSignatureEmail",
  "recipientSignatureBond",
  "recipientSignatureDate",
  "staffSignatureStatus",
  "staffSignatureMethod",
  "staffSignatureUrl",
  "staffSignedAt",
  "staffSignerUid",
  "staffSignerName",
  "staffSignerEmail",
  "returnedByUserId",
  "returnedByName",
  "returnedByRole",
  "returnDate",
  "returnTime",
  "signedAt",
  "signatureToken",
  "signatureTokenExpiresAt",
  "signatureTokenUsed",
  "signatureIpOrDevice",
  "secretVerificationKey",
  "secretVerificationHint",
  "devolutionNotified",
  "returnEmailNotified",
  "devolutionNotificationStatus",
  "devolutionNotifiedAt",
  "devolutionNotifiedBy",
  "requiresAdminClaimReview"
] as const;

export type PrivateItemFieldName = (typeof PRIVATE_ITEM_FIELDS)[number];

/**
 * Redige dados pessoais de recebedores, e-mails, documentos e códigos de validação
 * em logs públicos de histórico para evitar vazamento indireto na projeção pública.
 */
export function sanitizePublicHistoryLogs(
  logs: ItemHistoryLog[] | undefined
): ItemHistoryLog[] | undefined {
  if (!Array.isArray(logs)) return undefined;
  return logs.map((log) => {
    if (!log || typeof log !== "object") return log;
    const rawDetails = typeof log.details === "string" ? log.details : "";
    const rawDesc = typeof (log as any).description === "string" ? (log as any).description : "";
    const combinedText = `${rawDetails} ${rawDesc}`;
    const isReturnRelated =
      log.action === "RETURNED" ||
      log.action === "DEVOLUCAO" ||
      log.action === "REOPENED" ||
      log.action === "REABERTURA_DEVOLUCAO" ||
      /devolvido|restitu[ií]do|assinatura|recebedor|comprovante|valida[cç][aã]o|cpf|rg|siape|matr[ií]cula/i.test(combinedText);

    if (!isReturnRelated) {
      return { ...log };
    }

    let safeText = "Devolução institucional registrada no sistema.";
    if (log.action === "REOPENED" || log.action === "REABERTURA_DEVOLUCAO") {
      safeText = "Registro de devolução reaberto administrativamente.";
    }

    const sanitizedLog: Record<string, any> = {
      ...log,
      details: safeText,
    };
    if ("description" in sanitizedLog) {
      sanitizedLog.description = safeText;
    }
    return sanitizedLog as ItemHistoryLog;
  });
}

/**
 * Remove todos os campos privados/PII de um objeto Item, produzindo uma projeção
 * estritamente pública segura para visitantes, alunos e cache offline.
 */
export function sanitizePublicItemProjection<T extends Record<string, any>>(item: T): T {
  if (!item || typeof item !== "object") return item;
  const clone: Record<string, any> = { ...item };

  for (const field of PRIVATE_ITEM_FIELDS) {
    delete clone[field];
  }

  if (Array.isArray(clone.history)) {
    clone.history = sanitizePublicHistoryLogs(clone.history);
  }
  if (Array.isArray(clone.historyLogs)) {
    clone.historyLogs = sanitizePublicHistoryLogs(clone.historyLogs);
  }

  return clone as T;
}

/**
 * Extrai apenas os campos privados/administrativos de devolução e assinatura
 * para persistência ou leitura na coleção restrita /item_return_records/{itemId}.
 */
export function extractPrivateReturnRecord(item: Record<string, any>): Record<string, any> {
  if (!item || typeof item !== "object") return {};
  const record: Record<string, any> = {};
  for (const field of PRIVATE_ITEM_FIELDS) {
    if (item[field] !== undefined) {
      record[field] = item[field];
    }
  }
  if (item.id !== undefined) {
    record.itemId = item.id;
  }
  if (item.status !== undefined) {
    record.status = item.status;
  }
  if (item.resolutionDate !== undefined) {
    record.resolutionDate = item.resolutionDate;
  }
  if (Array.isArray(item.history)) {
    record.privateHistory = item.history;
  }
  if (Array.isArray(item.historyLogs)) {
    record.privateHistoryLogs = item.historyLogs;
  }
  return record;
}

/**
 * Mescla o documento público do catálogo com o registro privado de devolução
 * (apenas para sessões autorizadas de SERVIDOR ativo/aprovado ou ADMIN, ou no backend).
 */
export function mergeItemWithPrivateRecord(
  publicItem: LostFoundItem,
  privateRecord?: Record<string, any> | null
): LostFoundItem {
  if (!privateRecord || typeof privateRecord !== "object") {
    return publicItem;
  }
  const merged: Record<string, any> = {
    ...publicItem
  };
  for (const field of PRIVATE_ITEM_FIELDS) {
    if (privateRecord[field] !== undefined) {
      merged[field] = privateRecord[field];
    }
  }
  if (Array.isArray(privateRecord.privateHistory) && privateRecord.privateHistory.length > 0) {
    merged.history = privateRecord.privateHistory;
  }
  if (Array.isArray(privateRecord.privateHistoryLogs) && privateRecord.privateHistoryLogs.length > 0) {
    merged.historyLogs = privateRecord.privateHistoryLogs;
  }
  return merged as LostFoundItem;
}
