import { deleteField } from "firebase/firestore";
import {
  ItemHistoryLog,
  ItemStatus,
  LostFoundItem,
  SystemAuditLog,
  UserRole,
} from "../types";
import { sanitizeFirestoreData } from "./shared-constants";

/**
 * Inserts or updates an item in a list while preserving ordering when updating
 * and prepending when an item was fetched directly (e.g., via QR Code or ?itemId=).
 */
export function upsertItemPreservingFields(
  list: LostFoundItem[],
  updatedItem: LostFoundItem
): LostFoundItem[] {
  const exists = list.some((it) => it.id === updatedItem.id);
  if (exists) {
    return list.map((it) => (it.id === updatedItem.id ? updatedItem : it));
  }
  return [updatedItem, ...list];
}

export interface ItemStatusTransitionParams {
  existing: LostFoundItem;
  newStatus: ItemStatus;
  actorId: string;
  actorName: string;
  actorEmail: string;
  actorRole: UserRole;
  isBulk?: boolean;
  nowIso?: string;
  transactionId?: string;
}

export interface ItemStatusTransitionArtifacts {
  updatedItem: LostFoundItem;
  nextHistory: ItemHistoryLog[];
  firestoreItemUpdate: Record<string, any>;
  historyEntry: ItemHistoryLog;
  auditLogDoc: SystemAuditLog;
  activityLogDoc: Record<string, any>;
}

/**
 * Builds deterministic item, history, audit_logs and activity_logs payloads
 * for valid non-return/non-closure status transitions.
 */
export function buildItemStatusTransitionPatch(
  params: ItemStatusTransitionParams
): ItemStatusTransitionArtifacts {
  const {
    existing,
    newStatus,
    actorId,
    actorName,
    actorEmail,
    actorRole,
    isBulk = false,
    nowIso = new Date().toISOString(),
    transactionId,
  } = params;

  const uniqueSuffix = Math.random().toString(36).substring(2, 6);
  const stamp = Date.now();
  const txId =
    transactionId ||
    `TX-STAT-${stamp.toString(36).toUpperCase()}-${uniqueSuffix.toUpperCase()}`;

  const existingHistory = existing.history || existing.historyLogs || [];
  const historyEntry: ItemHistoryLog = {
    id: `hist-${stamp}-${uniqueSuffix}`,
    action: `Status alterado para ${newStatus}`,
    actorId,
    actorName,
    actorRole,
    userId: actorId,
    userName: actorName,
    userRole: actorRole,
    timestamp: nowIso,
    transactionId: txId,
    objectId: existing.id,
    oldValue: existing.status || "N/A",
    newValue: newStatus,
    details: isBulk
      ? `Status do objeto alterado em lote de ${existing.status || "N/A"} para ${newStatus}.`
      : `Status do objeto alterado de ${existing.status || "N/A"} para ${newStatus}.`,
  };

  const nextHistory = [...existingHistory, historyEntry];

  const firestoreItemUpdate = sanitizeFirestoreData({
    status: newStatus,
    resolutionDate: deleteField(),
    history: nextHistory,
    historyLogs: nextHistory,
  });

  const updatedItem: LostFoundItem = {
    ...existing,
    status: newStatus,
    resolutionDate: undefined,
    history: nextHistory,
    historyLogs: nextHistory,
  };

  const auditId = `audit-${stamp}-${uniqueSuffix}`;
  const detailsText = isBulk
    ? `Status do objeto '${existing.title || existing.id}' alterado em lote de ${existing.status || "DESCONHECIDO"} para ${newStatus}.`
    : `Status do objeto '${existing.title || existing.id}' alterado de ${existing.status || "DESCONHECIDO"} para ${newStatus}.`;

  const auditLogDoc: SystemAuditLog = {
    id: auditId,
    transactionId: txId,
    objectId: existing.id,
    objectType: "ITEM",
    objectTitle: existing.title || existing.id,
    action: "STATUS_OVERRIDE",
    actorId,
    actorName,
    actorEmail,
    actorRole,
    timestamp: nowIso,
    fieldChanged: "status",
    oldValue: existing.status || "DESCONHECIDO",
    newValue: newStatus,
    details: detailsText,
    immutable: true,
  };

  const activityLogDoc: Record<string, any> = sanitizeFirestoreData({
    id: auditId,
    adminId: actorId,
    actorId,
    actorEmail,
    adminEmail: actorEmail,
    actorRole,
    adminName: actorName,
    action: "STATUS_OVERRIDE",
    transactionId: txId,
    objectId: existing.id,
    objectType: "ITEM",
    fieldChanged: "status",
    oldValue: existing.status || "DESCONHECIDO",
    newValue: newStatus,
    details: `${detailsText} [TX: ${txId} | OBJ: ${existing.id}]`,
    timestamp: nowIso,
  });

  return {
    updatedItem,
    nextHistory,
    firestoreItemUpdate,
    historyEntry,
    auditLogDoc,
    activityLogDoc,
  };
}
