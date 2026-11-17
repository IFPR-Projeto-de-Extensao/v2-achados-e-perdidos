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

export interface OfflineSyncOwnershipCheck {
  allowed: boolean;
  errorCode?: "AUTH_REQUIRED" | "MISSING_ORIGINAL_AUTHOR" | "AUTH_MISMATCH";
  statusMessage?: string;
}

/**
 * Garante que toda criação via Client SDK na fila offline utilize exatamente
 * `registeredByUserId === currentAuthUid`. Nenhuma conta (nem ADMIN) pode assumir
 * ou sobrescrever a autoria de um cadastro feito por outro usuário.
 */
export function evaluateOfflineSyncOwnership(
  registeredByUserId: unknown,
  currentAuthUid: string | null | undefined
): OfflineSyncOwnershipCheck {
  const authUid = typeof currentAuthUid === "string" ? currentAuthUid.trim() : "";
  if (!authUid) {
    return {
      allowed: false,
      errorCode: "AUTH_REQUIRED",
      statusMessage: "Faça login com sua conta institucional para sincronizar este item.",
    };
  }

  const originalUid = typeof registeredByUserId === "string" ? registeredByUserId.trim() : "";
  if (!originalUid) {
    return {
      allowed: false,
      errorCode: "MISSING_ORIGINAL_AUTHOR",
      statusMessage:
        "Registro offline sem autor original identificado. A sincronização permanece preservada no dispositivo aguardando a conta responsável.",
    };
  }

  if (originalUid !== authUid) {
    return {
      allowed: false,
      errorCode: "AUTH_MISMATCH",
      statusMessage:
        "Este item foi cadastrado por outra conta. A sincronização depende do login da conta responsável original; o registro permanece seguro na fila.",
    };
  }

  return { allowed: true };
}

