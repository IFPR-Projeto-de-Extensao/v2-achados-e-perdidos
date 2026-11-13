import { LostFoundItem } from "../types";

export interface DashboardReturnMetricsBreakdown {
  /** Total de itens no acervo */
  totalItems: number;
  /** Total de objetos com status DEVOLVIDO (inclui presenciais concluídas e remotas em andamento) */
  registeredReturnsCount: number;
  /** Devoluções aguardando assinatura remota do recebedor (recipientSignatureStatus === 'PENDING_REMOTE') */
  pendingRemoteSignaturesCount: number;
  /** Devoluções com entrega/assinatura do recebedor efetivamente concluída (exclui PENDING_REMOTE) */
  concludedReturnsCount: number;
  /** Devoluções assinadas pelo recebedor que ainda aguardam atestação digital do servidor */
  pendingStaffAttestationCount: number;
  /** Devoluções com dupla assinatura digital concluída (recebedor + servidor) */
  dualSignedReturnsCount: number;
  /** Taxa percentual de devoluções concluídas sobre o total de itens */
  successRate: number;
}

/**
 * Verifica se um item representa uma devolução com assinatura/entrega do recebedor
 * efetivamente concluída (excluindo solicitações com assinatura remota pendente).
 */
export function isRecipientReturnConcluded(
  item: Partial<Pick<LostFoundItem, "status" | "recipientSignatureStatus" | "recipientSignatureUrl">>
): boolean {
  if (!item || item.status !== "DEVOLVIDO") return false;
  if (item.recipientSignatureStatus === "PENDING_REMOTE") return false;
  return true;
}

/**
 * Verifica se um item está aguardando assinatura remota do recebedor.
 */
export function isRecipientRemoteSignaturePending(
  item: Partial<Pick<LostFoundItem, "status" | "recipientSignatureStatus" | "recipientSignatureUrl">>
): boolean {
  return Boolean(
    item &&
    item.status === "DEVOLVIDO" &&
    item.recipientSignatureStatus === "PENDING_REMOTE" &&
    !item.recipientSignatureUrl
  );
}

/**
 * Verifica se um item já foi assinado pelo recebedor mas aguarda assinatura do servidor.
 */
export function isStaffAttestationPending(
  item: Partial<Pick<LostFoundItem, "status" | "recipientSignatureStatus" | "staffSignatureStatus">>
): boolean {
  return Boolean(
    item &&
    item.status === "DEVOLVIDO" &&
    item.recipientSignatureStatus === "SIGNED" &&
    item.staffSignatureStatus !== "SIGNED"
  );
}

/**
 * Verifica se um item possui dupla assinatura digital concluída (recebedor + servidor).
 */
export function isDualSignatureCompleted(
  item: Partial<
    Pick<
      LostFoundItem,
      | "status"
      | "recipientSignatureStatus"
      | "staffSignatureStatus"
      | "recipientSignatureUrl"
      | "staffSignatureUrl"
    >
  >
): boolean {
  return Boolean(
    item &&
    item.status === "DEVOLVIDO" &&
    item.recipientSignatureStatus === "SIGNED" &&
    item.staffSignatureStatus === "SIGNED" &&
    Boolean(item.recipientSignatureUrl) &&
    Boolean(item.staffSignatureUrl)
  );
}

/**
 * Calcula de forma desacoplada e auditável todas as métricas de devolução e assinatura
 * para o painel administrativo e de servidores, evitando misturar devoluções pendentes
 * de assinatura remota com devoluções concluídas.
 */
export function computeDashboardReturnMetrics(items: Array<Partial<LostFoundItem>>): DashboardReturnMetricsBreakdown {
  const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
  const totalItems = safeItems.length;
  let registeredReturnsCount = 0;
  let pendingRemoteSignaturesCount = 0;
  let concludedReturnsCount = 0;
  let pendingStaffAttestationCount = 0;
  let dualSignedReturnsCount = 0;

  for (const item of safeItems) {
    if (item.status !== "DEVOLVIDO") continue;
    registeredReturnsCount += 1;

    if (isRecipientRemoteSignaturePending(item)) {
      pendingRemoteSignaturesCount += 1;
    } else if (isRecipientReturnConcluded(item)) {
      concludedReturnsCount += 1;
    }

    if (isStaffAttestationPending(item)) {
      pendingStaffAttestationCount += 1;
    }

    if (isDualSignatureCompleted(item)) {
      dualSignedReturnsCount += 1;
    }
  }

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
