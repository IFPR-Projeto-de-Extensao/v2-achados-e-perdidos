import type { AccountStatus, User } from "../types";
import type { Timestamp } from "firebase/firestore";
import { safeParseDate } from "./utils";

export interface ResolvedAccountStatus {
  status: AccountStatus;
  isExpiredSuspension: boolean;
  statusReason?: string;
  statusUpdatedAt?: string;
  statusUpdatedBy?: string;
  suspendedUntil?: Timestamp | string;
}

export interface FieldDeadlineEvaluation {
  isPresent: boolean;
  isValid: boolean;
  isInvalid: boolean;
  timestampMs: number;
  isActive: boolean;
  isExpired: boolean;
}

/**
 * Evaluates a temporal deadline field distinguishing 3 explicit states:
 * 1. Absent: not defined on object or null/empty string (does not block).
 * 2. Present with valid timestamp: evaluated temporally against 'now'.
 * 3. Present with invalid value: cannot be interpreted as expired and prevents auto-release.
 */
export function evaluateDeadlineField(
  user: Partial<User> | null | undefined,
  fieldKey: "suspendedUntil" | "blockExpiresAt",
  now: number = Date.now()
): FieldDeadlineEvaluation {
  // 1. Ausência determinada pela inexistência efetiva da propriedade no objeto
  if (!user || !(fieldKey in user)) {
    return {
      isPresent: false,
      isValid: false,
      isInvalid: false,
      timestampMs: 0,
      isActive: false,
      isExpired: false,
    };
  }

  const val = (user as any)[fieldKey];

  // Em JavaScript/TypeScript, a atribuição explícita de 'undefined' representa a ausência
  // de valor antes da serialização. No Firestore e no sanitizeFirestoreData, propriedades 'undefined'
  // são eliminadas e nunca persistidas como campos. Portanto, 'undefined' representa campo ausente.
  if (val === undefined) {
    return {
      isPresent: false,
      isValid: false,
      isInvalid: false,
      timestampMs: 0,
      isActive: false,
      isExpired: false,
    };
  }

  // A partir deste ponto, a propriedade está EFETIVAMENTE PRESENTE no documento
  // 1. null: no Firestore, null é null_type (não é timestamp) -> presente e inválido
  if (val === null) {
    return {
      isPresent: true,
      isValid: false,
      isInvalid: true,
      timestampMs: 0,
      isActive: false,
      isExpired: false,
    };
  }

  // 2. String vazia ou contendo apenas espaços: não é timestamp -> presente e inválido
  if (typeof val === "string" && val.trim() === "") {
    return {
      isPresent: true,
      isValid: false,
      isInvalid: true,
      timestampMs: 0,
      isActive: false,
      isExpired: false,
    };
  }

  // 3. Número: no Firestore, número é int/float (não é timestamp) -> presente e inválido
  if (typeof val === "number") {
    return {
      isPresent: true,
      isValid: false,
      isInvalid: true,
      timestampMs: 0,
      isActive: false,
      isExpired: false,
    };
  }

  // 4. Booleano ou Array: tipo não temporal -> presente e inválido
  if (typeof val === "boolean" || Array.isArray(val)) {
    return {
      isPresent: true,
      isValid: false,
      isInvalid: true,
      timestampMs: 0,
      isActive: false,
      isExpired: false,
    };
  }

  // 5. Avaliação de formatos aceitos (Timestamp nativo, Date ou string ISO parseável)
  // Strings arbitrárias (e.g. "invalid-1") não devem ser interpretadas como datas legadas pelo V8
  if (typeof val === "string") {
    const isDatePattern = /^\d{4}-\d{2}-\d{2}/.test(val) || /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(val);
    if (!isDatePattern) {
      return {
        isPresent: true,
        isValid: false,
        isInvalid: true,
        timestampMs: 0,
        isActive: false,
        isExpired: false,
      };
    }
  }

  const parsed = safeParseDate(val);
  if (!parsed || isNaN(parsed.getTime()) || parsed.getTime() <= 0) {
    return {
      isPresent: true,
      isValid: false,
      isInvalid: true,
      timestampMs: 0,
      isActive: false,
      isExpired: false,
    };
  }

  const ms = parsed.getTime();
  return {
    isPresent: true,
    isValid: true,
    isInvalid: false,
    timestampMs: ms,
    isActive: ms > now,
    isExpired: ms <= now,
  };
}

/**
 * Resolves the real-time account status of a user.
 * Automatically marks a suspension as expired if all valid deadlines have passed
 * and no active block remains. Any present invalid temporal field halts auto-release.
 * An absent, undefined, null, empty/whitespace, or unknown status is NEVER presumed active.
 */
export function resolveAccountStatus(user: Partial<User> | null | undefined): ResolvedAccountStatus {
  if (!user) {
    return {
      status: "suspended",
      isExpiredSuspension: false,
      statusReason: "Perfil de usuário não fornecido",
    };
  }

  const rawStatus = (user as any).status;

  // Validação explícita dos estados permitidos ("active", "suspended", "banned")
  // Qualquer status ausente (undefined / inexistente), null, string vazia ("" ou apenas espaços)
  // ou desconhecido NUNCA é presumido como ativo.
  const isStatusValid =
    typeof rawStatus === "string" &&
    rawStatus.trim() !== "" &&
    (rawStatus === "active" || rawStatus === "suspended" || rawStatus === "banned");

  if (!isStatusValid) {
    return {
      status: "suspended",
      isExpiredSuspension: false,
      statusReason: user.statusReason || "Status da conta ausente ou inválido",
      statusUpdatedAt: user.statusUpdatedAt,
      statusUpdatedBy: user.statusUpdatedBy,
      suspendedUntil: user.suspendedUntil,
    };
  }

  const currentStatus: AccountStatus = rawStatus;
  const now = Date.now();

  const suspendedUntilEval = evaluateDeadlineField(user, "suspendedUntil", now);
  const blockExpiresAtEval = evaluateDeadlineField(user, "blockExpiresAt", now);

  const hasAnyActiveBlock = suspendedUntilEval.isActive || blockExpiresAtEval.isActive;
  const hasAnyInvalidField = suspendedUntilEval.isInvalid || blockExpiresAtEval.isInvalid;
  const hasAtLeastOneValidDeadline = suspendedUntilEval.isValid || blockExpiresAtEval.isValid;

  // 1. Permanent ban always takes precedence over any temporary fields
  if (currentStatus === "banned") {
    return {
      status: "banned",
      isExpiredSuspension: false,
      statusReason: user.statusReason,
      statusUpdatedAt: user.statusUpdatedAt,
      statusUpdatedBy: user.statusUpdatedBy,
      suspendedUntil: user.suspendedUntil,
    };
  }

  // 2. Any active temporary block (future timestamp) overrides active status
  if (hasAnyActiveBlock) {
    return {
      status: "suspended",
      isExpiredSuspension: false,
      statusReason: user.statusReason,
      statusUpdatedAt: user.statusUpdatedAt,
      statusUpdatedBy: user.statusUpdatedBy,
      suspendedUntil: user.suspendedUntil,
    };
  }

  // 3. For suspended accounts: auto-release ONLY when:
  //    - At least one valid deadline exists.
  //    - No present field is invalid (any invalid field halts auto-release).
  //    - No block remains active.
  if (currentStatus === "suspended") {
    const canAutoRelease = !hasAnyActiveBlock && hasAtLeastOneValidDeadline && !hasAnyInvalidField;

    if (canAutoRelease) {
      return {
        status: "active",
        isExpiredSuspension: true,
        statusReason: undefined,
        statusUpdatedAt: user.statusUpdatedAt,
        statusUpdatedBy: user.statusUpdatedBy,
        suspendedUntil: undefined,
      };
    }

    // Suspended without valid deadline (e.g. invalid, indefinite or missing)
    return {
      status: "suspended",
      isExpiredSuspension: false,
      statusReason: user.statusReason,
      statusUpdatedAt: user.statusUpdatedAt,
      statusUpdatedBy: user.statusUpdatedBy,
      suspendedUntil: user.suspendedUntil,
    };
  }

  return {
    status: currentStatus,
    isExpiredSuspension: false,
    statusReason: user.statusReason,
    statusUpdatedAt: user.statusUpdatedAt,
    statusUpdatedBy: user.statusUpdatedBy,
    suspendedUntil: user.suspendedUntil,
  };
}

/**
 * Checks if a user's account is currently active and allowed to perform write operations.
 */
export function isUserAccountActive(user: Partial<User> | null | undefined): boolean {
  const resolved = resolveAccountStatus(user);
  return resolved.status === "active";
}

/**
 * Checks if a user's account is currently blocked (suspended or banned).
 */
export function isAccountBlocked(user: Partial<User> | null | undefined): boolean {
  const resolved = resolveAccountStatus(user);
  return resolved.status === "suspended" || resolved.status === "banned";
}

export interface SuspensionPresetOption {
  id: string;
  label: string;
  days?: number;
  hours?: number;
}

export const SUSPENSION_PRESET_OPTIONS: SuspensionPresetOption[] = [
  { id: "1_day", label: "1 dia (24 horas)", days: 1 },
  { id: "3_days", label: "3 dias", days: 3 },
  { id: "7_days", label: "7 dias (1 semana)", days: 7 },
  { id: "15_days", label: "15 dias", days: 15 },
  { id: "30_days", label: "30 dias (1 mês)", days: 30 },
  { id: "60_days", label: "60 dias (2 meses)", days: 60 },
  { id: "custom", label: "Data e hora personalizada..." },
  { id: "indefinite", label: "Por tempo indeterminado (até reativação manual)" },
];

/**
 * Computes the ISO-8601 string for a given preset duration from now.
 */
export function calculateSuspensionDeadline(presetId: string, customIso?: string): string | undefined {
  if (presetId === "indefinite") {
    return undefined;
  }
  if (presetId === "custom" && customIso) {
    return customIso;
  }

  const preset = SUSPENSION_PRESET_OPTIONS.find((p) => p.id === presetId);
  if (!preset || !preset.days) {
    return undefined;
  }

  const future = new Date(Date.now() + preset.days * 24 * 60 * 60 * 1000);
  return future.toISOString();
}

/**
 * Formats account status details for display.
 */
export function formatAccountStatusDetails(user: Partial<User>): {
  label: string;
  badgeClass: string;
  dotClass: string;
  description: string;
} {
  const resolved = resolveAccountStatus(user);

  switch (resolved.status) {
    case "banned":
      return {
        label: "Banido",
        badgeClass: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/50",
        dotClass: "bg-red-500",
        description: resolved.statusReason
          ? `Conta banida permanentemente. Motivo: ${resolved.statusReason}`
          : "Conta banida permanentemente por infração às normas do IFPR.",
      };

    case "suspended": {
      const untilDate = resolved.suspendedUntil ? safeParseDate(resolved.suspendedUntil) : null;
      const untilStr = untilDate ? ` até ${untilDate.toLocaleDateString("pt-BR")} às ${untilDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : " por tempo indeterminado";
      return {
        label: "Suspenso",
        badgeClass: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/50",
        dotClass: "bg-amber-500",
        description: `Conta suspensa${untilStr}.${resolved.statusReason ? ` Motivo: ${resolved.statusReason}` : ""}`,
      };
    }

    case "active":
      return {
        label: "Ativo",
        badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/50",
        dotClass: "bg-emerald-500",
        description: "Conta ativa e com acesso liberado a todas as funcionalidades.",
      };

    default:
      return {
        label: "Inativo / Restrito",
        badgeClass: "bg-neutral-100 text-neutral-700 border-neutral-300 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700",
        dotClass: "bg-neutral-400",
        description: "Conta inativa ou com status irregular no sistema.",
      };
  }
}

/**
 * Safely extracts a numeric timestamp in milliseconds for sorting users by creation date.
 * Priority:
 * 1. user.createdAt (reliable ISO or string date in user document)
 * 2. statusChangedAt / statusUpdatedAt
 * 3. 0 if completely absent
 */
export function getUserCreationTimestamp(user: Partial<User> | null | undefined): number {
  if (!user) return 0;
  if (user.createdAt) {
    const parsed = Date.parse(user.createdAt);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  if (user.statusChangedAt) {
    const parsed = Date.parse(user.statusChangedAt);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  if (user.statusUpdatedAt) {
    const parsed = Date.parse(user.statusUpdatedAt);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 0;
}

/**
 * Sorts an array of users strictly by creation date, newest first (mais recente -> mais antiga).
 */
export function sortUsersByCreationDesc(users: User[]): User[] {
  return [...users].sort((a, b) => {
    const timeA = getUserCreationTimestamp(a);
    const timeB = getUserCreationTimestamp(b);
    return timeB - timeA;
  });
}

