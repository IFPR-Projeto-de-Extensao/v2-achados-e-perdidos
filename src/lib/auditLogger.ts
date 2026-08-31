import { doc, setDoc, collection } from "firebase/firestore";
import { db } from "./firebase";
import { ActivityLog } from "../types";

export interface AuditEventParams {
  itemId?: string;
  adminId?: string;
  adminName?: string;
  actorRole?: "ADMIN" | "SERVIDOR" | "ALUNO" | "SISTEMA";
  action: ActivityLog["action"];
  details: string;
  timestamp?: string;
  metadata?: Record<string, any>;
}

/**
 * Registra um log de auditoria institucional na coleção 'activity_logs' do Firestore
 * para operações críticas (devoluções, assinaturas digitais, alterações de status e segurança).
 */
export async function logAuditEvent(params: AuditEventParams): Promise<string> {
  const nowIso = params.timestamp || new Date().toISOString();
  const logId = `act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  const logPayload: Record<string, any> = {
    id: logId,
    adminId: params.adminId || "sistema-institucional",
    adminName: params.adminName || "Sistema Localiza+ IFPR",
    action: params.action,
    details: params.details,
    timestamp: nowIso,
  };

  if (params.itemId) {
    logPayload.itemId = params.itemId;
  }
  if (params.actorRole) {
    logPayload.actorRole = params.actorRole;
  }
  if (params.metadata) {
    logPayload.metadata = params.metadata;
  }

  try {
    const logDocRef = doc(db, "activity_logs", logId);
    await setDoc(logDocRef, logPayload);
    return logId;
  } catch (error) {
    console.warn("[AuditLogger] Falha ao persistir log de auditoria no Firestore:", error);
    // Fallback attempt with collection reference
    try {
      const colRef = collection(db, "activity_logs");
      await setDoc(doc(colRef, logId), logPayload);
      return logId;
    } catch (fallbackError) {
      console.error("[AuditLogger] Erro persistente ao registrar auditoria:", fallbackError);
      return logId;
    }
  }
}

/**
 * Função utilitária especializada para auditoria de Devolução com Assinatura Digital
 */
export async function logItemReturnAudit(params: {
  itemId: string;
  itemTitle?: string;
  signerName: string;
  signerBond?: string;
  signerEmail?: string;
  validationCode: string;
  signatureType: "IN_PERSON_DEVICE" | "REMOTE_EMAIL";
  operatorId?: string;
  operatorName?: string;
}): Promise<string> {
  const actorDesc = `${params.signerName}${params.signerBond ? ` (${params.signerBond})` : ""}`;
  const details =
    `Devolução com Assinatura Digital (${params.signatureType === "REMOTE_EMAIL" ? "Remota por Token" : "Presencial no Dispositivo"}) ` +
    `concluída para o item #${params.itemId}${params.itemTitle ? ` (${params.itemTitle})` : ""}. ` +
    `Receptor: ${actorDesc}. Código de Autenticidade: ${params.validationCode}.`;

  return logAuditEvent({
    itemId: params.itemId,
    adminId: params.operatorId || "token-auth-validator",
    adminName: params.operatorName || actorDesc,
    action: "REGISTRO_DEVOLUCAO",
    details,
    metadata: {
      operationType: "ITEM_RETURN_SIGNATURE_VALIDATED",
      itemId: params.itemId,
      signerName: params.signerName,
      signerBond: params.signerBond,
      signerEmail: params.signerEmail,
      validationCode: params.validationCode,
      signatureType: params.signatureType,
    },
  });
}
