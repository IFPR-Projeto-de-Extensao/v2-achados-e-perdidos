export interface ExistingRemoteItemEvaluation {
  action: "CREATE_NEW" | "CONFIRM_ALREADY_SYNCED" | "CONFLICT_STOP";
  reason?: string;
  matchingFields: string[];
  conflictingFields: string[];
  statusProgressed?: boolean;
}

function normStr(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/**
 * Avalia se um documento /items/{id} já existente no Firestore representa:
 * - O mesmo cadastro que acabou sendo confirmado no servidor (equivalência dos campos centrais),
 *   caso em que o cliente NÃO deve sobrescrever o item ou seu histórico (apenas reconciliar a fila); ou
 * - Um registro divergente / conflitante (outro autor ou conteúdo distinto), caso em que o reenvio
 *   automático deve ser interrompido com erro controlado sem alterar o servidor ou apagar a fila.
 */
export function evaluateExistingRemoteItem(
  localPayload: Record<string, any>,
  remoteData: Record<string, any> | null | undefined
): ExistingRemoteItemEvaluation {
  if (!remoteData || typeof remoteData !== "object") {
    return {
      action: "CREATE_NEW",
      matchingFields: [],
      conflictingFields: [],
    };
  }

  const coreFields = [
    "registeredByUserId",
    "type",
    "title",
    "category",
    "location",
    "date",
    "description",
  ] as const;

  const matchingFields: string[] = [];
  const conflictingFields: string[] = [];

  for (const field of coreFields) {
    const localVal = normStr(localPayload[field]);
    const remoteVal = normStr(remoteData[field]);
    if (localVal === remoteVal) {
      matchingFields.push(field);
    } else {
      conflictingFields.push(field);
    }
  }

  if (conflictingFields.length === 0) {
    const localStatus = normStr(localPayload.status);
    const remoteStatus = normStr(remoteData.status);
    return {
      action: "CONFIRM_ALREADY_SYNCED",
      matchingFields,
      conflictingFields: [],
      statusProgressed: Boolean(remoteStatus && localStatus && remoteStatus !== localStatus),
    };
  }

  return {
    action: "CONFLICT_STOP",
    reason: `Conflito detectado: o documento /items/${normStr(localPayload.id) || "(sem-id)"} já existe no servidor com divergência em: ${conflictingFields.join(", ")}.`,
    matchingFields,
    conflictingFields,
  };
}
