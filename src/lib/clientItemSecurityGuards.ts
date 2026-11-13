import { PRIVATE_ITEM_FIELDS } from "./itemPrivacyUtils";

export const ITEM_PUBLIC_COLLECTIONS = ["items", "found_items", "lost_items"] as const;

export const PROTECTED_DESTINATION_OR_RESOLUTION_FIELDS = [
  "resolutionDate",
  "destinationType",
  "destinationReason",
  "destinationDate",
  "destinationResponsible",
] as const;

export function assertClientItemDataUpdateAllowed(updatedFields: Record<string, any> | null | undefined): void {
  const status = updatedFields?.status;
  if (status === "DEVOLVIDO") {
    throw new Error("Transição direta para DEVOLVIDO bloqueada: utilize o fluxo formal de devolução (registerItemReturn).");
  }
  if (status === "ENCERRADO") {
    throw new Error("Transição direta para ENCERRADO bloqueada em updateItemData: utilize o fluxo dedicado de destinação (registerItemDestination).");
  }
}

export function assertDirectDocUpdateAllowed(
  collectionName: string,
  data: Record<string, any> | null | undefined,
  existingStatus?: string | null
): void {
  if (!ITEM_PUBLIC_COLLECTIONS.includes(collectionName as any)) {
    return;
  }

  if (existingStatus === "DEVOLVIDO" || existingStatus === "ENCERRADO") {
    throw new Error("Atualização direta bloqueada: objeto já finalizado (DEVOLVIDO ou ENCERRADO) exige fluxo administrativo autorizado.");
  }

  const nextStatus = data?.status;
  if (nextStatus === "DEVOLVIDO") {
    throw new Error("Transição direta para DEVOLVIDO bloqueada: utilize o fluxo formal de devolução (/api/items/register-return).");
  }
  if (nextStatus === "ENCERRADO") {
    throw new Error("Transição direta para ENCERRADO bloqueada: utilize o fluxo formal de destinação (registerItemDestination).");
  }

  if (data && typeof data === "object") {
    const keys = Object.keys(data);
    for (const privField of PRIVATE_ITEM_FIELDS) {
      if (keys.includes(privField)) {
        throw new Error(`Alteração direta de campo protegido '${privField}' bloqueada em '${collectionName}'.`);
      }
    }
    for (const protectedField of PROTECTED_DESTINATION_OR_RESOLUTION_FIELDS) {
      if (keys.includes(protectedField)) {
        throw new Error(`Alteração direta de campo de encerramento/resolução '${protectedField}' bloqueada em '${collectionName}'.`);
      }
    }
  }
}

export function classifyFirestoreWriteError(
  err: unknown,
  fallbackMessage = "Erro ao persistir dados no banco de dados. Tente novamente."
): { kind: "PERMISSION_DENIED" | "NETWORK_ERROR" | "UNKNOWN_ERROR"; userMessage: string } {
  const code = String((err as any)?.code || "").toLowerCase();
  const message = String((err as any)?.message || err || "").toLowerCase();

  if (
    code.includes("permission-denied") ||
    code.includes("unauthenticated") ||
    message.includes("missing or insufficient permissions") ||
    message.includes("permission-denied") ||
    message.includes("permission denied")
  ) {
    return {
      kind: "PERMISSION_DENIED",
      userMessage: "Permissão insuficiente para gravar esta operação no banco de dados.",
    };
  }

  if (
    code.includes("unavailable") ||
    code.includes("deadline-exceeded") ||
    message.includes("network") ||
    message.includes("failed to fetch") ||
    message.includes("offline") ||
    message.includes("client is offline")
  ) {
    return {
      kind: "NETWORK_ERROR",
      userMessage: "Falha de conexão com o servidor ao salvar no banco de dados. Verifique sua rede e tente novamente.",
    };
  }

  return {
    kind: "UNKNOWN_ERROR",
    userMessage: fallbackMessage,
  };
}
