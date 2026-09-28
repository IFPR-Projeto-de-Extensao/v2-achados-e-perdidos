import { ItemStatus, User } from "../types";

export interface BatchOperationResult<T = string> {
  success: boolean;
  totalRequested: number;
  succeeded: T[];
  failed: T[];
  statusSummary: "ALL_SUCCEEDED" | "PARTIALLY_SUCCEEDED" | "ALL_FAILED";
  message: string;
}

/**
 * Executa atualização administrativa de status em lote garantindo integridade estrita:
 * Firestore confirmação -> estado local atualizado -> feedback exibido.
 * Em caso de falha parcial ou total, as operações que falharam não são aplicadas ao estado local.
 */
export async function executeAdminBatchItemStatusUpdate(
  itemIds: string[],
  status: ItemStatus,
  updateDocFn: (id: string, data: { status: ItemStatus }) => Promise<void>
): Promise<BatchOperationResult> {
  if (!itemIds || itemIds.length === 0) {
    return {
      success: true,
      totalRequested: 0,
      succeeded: [],
      failed: [],
      statusSummary: "ALL_SUCCEEDED",
      message: "Nenhum item selecionado para atualização.",
    };
  }

  const succeeded: string[] = [];
  const failed: string[] = [];

  for (const id of itemIds) {
    try {
      await updateDocFn(id, { status });
      succeeded.push(id);
    } catch {
      failed.push(id);
    }
  }

  if (failed.length === 0) {
    return {
      success: true,
      totalRequested: itemIds.length,
      succeeded,
      failed,
      statusSummary: "ALL_SUCCEEDED",
      message: `${succeeded.length} item(ns) alterado(s) para ${status} com sucesso!`,
    };
  }

  if (succeeded.length === 0) {
    return {
      success: false,
      totalRequested: itemIds.length,
      succeeded,
      failed,
      statusSummary: "ALL_FAILED",
      message: `Falha ao alterar o status dos ${failed.length} item(ns) no Firestore. Nenhuma alteração foi persistida.`,
    };
  }

  return {
    success: false,
    totalRequested: itemIds.length,
    succeeded,
    failed,
    statusSummary: "PARTIALLY_SUCCEEDED",
    message: `${succeeded.length} item(ns) alterado(s) com sucesso e ${failed.length} falharam na gravação remota.`,
  };
}

/**
 * Executa exclusão administrativa em lote com validação de confirmação remota:
 * Apenas os itens efetivamente excluídos no Firestore são marcados como sucedidos.
 */
export async function executeAdminBatchItemDeletion(
  itemIds: string[],
  deleteDocFn: (id: string) => Promise<void>
): Promise<BatchOperationResult> {
  if (!itemIds || itemIds.length === 0) {
    return {
      success: true,
      totalRequested: 0,
      succeeded: [],
      failed: [],
      statusSummary: "ALL_SUCCEEDED",
      message: "Nenhum item selecionado para exclusão.",
    };
  }

  const succeeded: string[] = [];
  const failed: string[] = [];

  for (const id of itemIds) {
    try {
      await deleteDocFn(id);
      succeeded.push(id);
    } catch {
      failed.push(id);
    }
  }

  if (failed.length === 0) {
    return {
      success: true,
      totalRequested: itemIds.length,
      succeeded,
      failed,
      statusSummary: "ALL_SUCCEEDED",
      message: `${succeeded.length} item(ns) excluído(s) permanentemente!`,
    };
  }

  if (succeeded.length === 0) {
    return {
      success: false,
      totalRequested: itemIds.length,
      succeeded,
      failed,
      statusSummary: "ALL_FAILED",
      message: `Falha ao excluir os ${failed.length} item(ns) no Firestore. Nenhum item foi removido.`,
    };
  }

  return {
    success: false,
    totalRequested: itemIds.length,
    succeeded,
    failed,
    statusSummary: "PARTIALLY_SUCCEEDED",
    message: `${succeeded.length} item(ns) excluído(s) com sucesso e ${failed.length} falharam na exclusão remota.`,
  };
}

/**
 * Executa aprovação atômica em lote no Firestore utilizando writeBatch:
 * Se o commit falhar, o estado local permanece inalterado.
 */
export async function executeAdminBatchUserApproval(
  pendingUsers: User[],
  batchCommitFn: (users: User[]) => Promise<void>
): Promise<BatchOperationResult<string>> {
  if (!pendingUsers || pendingUsers.length === 0) {
    return {
      success: true,
      totalRequested: 0,
      succeeded: [],
      failed: [],
      statusSummary: "ALL_SUCCEEDED",
      message: "Nenhuma solicitação pendente de aprovação no momento.",
    };
  }

  try {
    await batchCommitFn(pendingUsers);
    const userIds = pendingUsers.map((u) => u.id);
    return {
      success: true,
      totalRequested: pendingUsers.length,
      succeeded: userIds,
      failed: [],
      statusSummary: "ALL_SUCCEEDED",
      message: `✅ Todos os ${pendingUsers.length} cadastros pendentes foram aprovados com sucesso!`,
    };
  } catch {
    return {
      success: false,
      totalRequested: pendingUsers.length,
      succeeded: [],
      failed: pendingUsers.map((u) => u.id),
      statusSummary: "ALL_FAILED",
      message: "Erro ao gravar aprovações em lote no Firestore. Nenhum cadastro foi alterado.",
    };
  }
}
