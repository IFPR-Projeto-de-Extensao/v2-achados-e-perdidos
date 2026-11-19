import type { AccountStatus, User } from "../types";
import type { Timestamp } from "firebase/firestore";
import { safeParseDate } from "./utils";

export type DeadlineFieldValueKind =
  | "absent"
  | "timestamp"
  | "null"
  | "empty_string"
  | "iso_string"
  | "invalid_string"
  | "number"
  | "boolean"
  | "array"
  | "object";

export interface FieldDeadlineEvaluation {
  isPresent: boolean;
  isValid: boolean;
  isInvalid: boolean;
  valueKind: DeadlineFieldValueKind;
  timestampMs: number;
  isActive: boolean;
  isExpired: boolean;
}

export interface ResolvedAccountStatus {
  status: AccountStatus;
  isExpiredSuspension: boolean;
  isDeactivated: boolean;
  hasLegacyInconsistency: boolean;
  hasMissingStatusField: boolean;
  inconsistencyReasons: string[];
  suspendedUntilEval: FieldDeadlineEvaluation;
  blockExpiresAtEval: FieldDeadlineEvaluation;
  statusReason?: string;
  statusUpdatedAt?: string;
  statusUpdatedBy?: string;
  suspendedUntil?: Timestamp | string;
  blockExpiresAt?: Timestamp | string;
}

const ABSENT_DEADLINE_EVAL: FieldDeadlineEvaluation = {
  isPresent: false,
  isValid: false,
  isInvalid: false,
  valueKind: "absent",
  timestampMs: 0,
  isActive: false,
  isExpired: false,
};

function makeInvalidDeadlineEval(valueKind: DeadlineFieldValueKind): FieldDeadlineEvaluation {
  return {
    isPresent: true,
    isValid: false,
    isInvalid: true,
    valueKind,
    timestampMs: 0,
    isActive: false,
    isExpired: false,
  };
}

/**
 * Extracts milliseconds strictly from Firestore Timestamp instances or serialized
 * Timestamp maps ({ seconds, nanoseconds } or { _seconds, _nanoseconds }).
 * Rejects strings (including ISO-8601), numbers, booleans, arrays, JS Date objects,
 * and arbitrary maps to maintain strict parity with `val is timestamp` in Firestore Rules.
 */
export function extractFirestoreTimestampMs(val: unknown): number | null {
  if (!val || typeof val !== "object" || Array.isArray(val) || val instanceof Date) {
    return null;
  }

  const candidate = val as Record<string, any>;

  try {
    if (typeof candidate.toMillis === "function") {
      const ms = candidate.toMillis();
      return typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? ms : null;
    }

    if (typeof candidate.toDate === "function") {
      const d = candidate.toDate();
      if (d instanceof Date) {
        const ms = d.getTime();
        return Number.isFinite(ms) && ms > 0 ? ms : null;
      }
      return null;
    }

    const hasSeconds = typeof candidate.seconds === "number" && Number.isFinite(candidate.seconds);
    const hasUnderscoreSeconds =
      typeof candidate._seconds === "number" && Number.isFinite(candidate._seconds);

    if (hasSeconds || hasUnderscoreSeconds) {
      const seconds = hasSeconds ? candidate.seconds : candidate._seconds;
      const rawNanos = hasSeconds ? candidate.nanoseconds : candidate._nanoseconds;
      if (rawNanos !== undefined && (typeof rawNanos !== "number" || !Number.isFinite(rawNanos))) {
        return null;
      }
      const nanos = rawNanos ?? 0;
      const ms = seconds * 1000 + Math.floor(nanos / 1_000_000);
      return Number.isFinite(ms) && ms > 0 ? ms : null;
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Evaluates a temporal deadline field distinguishing 3 explicit states with strict
 * Firestore Rules (`val is timestamp`) parity:
 * 1. Absent (missing key or `undefined`): does not block.
 * 2. Present with valid Firestore Timestamp: evaluated temporally against `now`.
 * 3. Present with ANY non-Timestamp value (`null`, `string` including ISO-8601,
 *    `number`, `boolean`, `array`, arbitrary `object`): incompatible with Rules,
 *    considered invalid and fail-closed (blocks access and halts auto-release).
 */
export function evaluateDeadlineField(
  user: Partial<User> | null | undefined,
  fieldKey: "suspendedUntil" | "blockExpiresAt",
  now: number = Date.now()
): FieldDeadlineEvaluation {
  if (!user || typeof user !== "object" || !(fieldKey in user)) {
    return { ...ABSENT_DEADLINE_EVAL };
  }

  const val = (user as any)[fieldKey];

  // In JavaScript/TypeScript before Firestore serialization, `undefined` represents
  // absence because sanitizeFirestoreData strips undefined keys before persistence.
  if (val === undefined) {
    return { ...ABSENT_DEADLINE_EVAL };
  }

  if (val === null) {
    return makeInvalidDeadlineEval("null");
  }

  if (typeof val === "boolean") {
    return makeInvalidDeadlineEval("boolean");
  }

  if (typeof val === "number") {
    return makeInvalidDeadlineEval("number");
  }

  if (Array.isArray(val)) {
    return makeInvalidDeadlineEval("array");
  }

  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed === "") {
      return makeInvalidDeadlineEval("empty_string");
    }
    const looksLikeIsoOrDate =
      /^\d{4}-\d{2}-\d{2}/.test(trimmed) ||
      /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(trimmed) ||
      !Number.isNaN(Date.parse(trimmed));
    return makeInvalidDeadlineEval(looksLikeIsoOrDate ? "iso_string" : "invalid_string");
  }

  const ms = extractFirestoreTimestampMs(val);
  if (ms === null) {
    return makeInvalidDeadlineEval("object");
  }

  return {
    isPresent: true,
    isValid: true,
    isInvalid: false,
    valueKind: "timestamp",
    timestampMs: ms,
    isActive: ms > now,
    isExpired: ms <= now,
  };
}

export function describeDeadlineIncompatibility(
  fieldName: "suspendedUntil" | "blockExpiresAt",
  evalResult: FieldDeadlineEvaluation
): string {
  switch (evalResult.valueKind) {
    case "iso_string":
      return `Campo '${fieldName}' armazenado como string ISO-8601 (Firestore Rules exigem Timestamp nativo).`;
    case "empty_string":
      return `Campo '${fieldName}' armazenado como string vazia (Firestore Rules bloqueiam qualquer valor não Timestamp).`;
    case "invalid_string":
      return `Campo '${fieldName}' contém texto inválido não Timestamp.`;
    case "null":
      return `Campo '${fieldName}' armazenado como null explícito (Firestore Rules exigem remoção via deleteField() ou Timestamp).`;
    case "number":
      return `Campo '${fieldName}' armazenado como número (Firestore Rules exigem Timestamp nativo).`;
    case "boolean":
      return `Campo '${fieldName}' armazenado como booleano (incompatível com Firestore Rules).`;
    case "array":
      return `Campo '${fieldName}' armazenado como lista/array (incompatível com Firestore Rules).`;
    case "object":
      return `Campo '${fieldName}' armazenado como mapa/objeto não Timestamp (incompatível com Firestore Rules).`;
    default:
      return "";
  }
}

/**
 * Resolves the real-time account status of a user with strict parity to Firestore Rules `isStandingActive(u)`:
 * - `active === false` always blocks.
 * - Any present non-Timestamp `blockExpiresAt` or `suspendedUntil` always blocks (even if `status === "active"`).
 * - Any future Timestamp in `blockExpiresAt` or `suspendedUntil` blocks.
 * - Absent `'status'` key preserves legacy compatibility as effective `'active'` (matching C-26),
 *   subject to `active !== false` and valid/absent deadline checks, while flagging `hasMissingStatusField`.
 * - Present `'status'` with `null`, empty string, whitespace, `"inactive"`, or unknown value always blocks.
 * - `status === "banned"` never auto-releases.
 * - `status === "suspended"` auto-releases ONLY when `suspendedUntil` is a valid expired Timestamp
 *   AND no `blockExpiresAt` future/invalid block remains (indefinite suspensions NEVER auto-release via residual `blockExpiresAt`).
 */
export function resolveAccountStatus(
  user: Partial<User> | null | undefined,
  now: number = Date.now()
): ResolvedAccountStatus {
  if (!user || typeof user !== "object") {
    return {
      status: "suspended",
      isExpiredSuspension: false,
      isDeactivated: false,
      hasLegacyInconsistency: true,
      hasMissingStatusField: true,
      inconsistencyReasons: ["Perfil de usuário não fornecido."],
      suspendedUntilEval: { ...ABSENT_DEADLINE_EVAL },
      blockExpiresAtEval: { ...ABSENT_DEADLINE_EVAL },
      statusReason: "Perfil de usuário não fornecido",
    };
  }

  const rawStatus = (user as any).status;
  const hasStatusKey = Object.prototype.hasOwnProperty.call(user, "status") && rawStatus !== undefined;
  const isDeactivated = (user as any).active === false;

  const suspendedUntilEval = evaluateDeadlineField(user, "suspendedUntil", now);
  const blockExpiresAtEval = evaluateDeadlineField(user, "blockExpiresAt", now);

  const inconsistencyReasons: string[] = [];
  if (!hasStatusKey) {
    inconsistencyReasons.push(
      "Campo 'status' ausente no documento (compatibilidade legada aplicada como 'active', sujeita a demais regras)."
    );
  }
  if (isDeactivated) {
    inconsistencyReasons.push("Campo 'active' definido como false (conta desativada nas Firestore Rules).");
  }
  if (suspendedUntilEval.isInvalid) {
    inconsistencyReasons.push(describeDeadlineIncompatibility("suspendedUntil", suspendedUntilEval));
  }
  if (blockExpiresAtEval.isInvalid) {
    inconsistencyReasons.push(describeDeadlineIncompatibility("blockExpiresAt", blockExpiresAtEval));
  }

  // Explicit invalid status (`null`, `""`, `"   "`, `"inactive"`, unknown, non-string) always blocks
  if (hasStatusKey) {
    const isAllowedStatus =
      typeof rawStatus === "string" &&
      (rawStatus === "active" || rawStatus === "suspended" || rawStatus === "banned");
    if (!isAllowedStatus) {
      inconsistencyReasons.unshift(`Campo 'status' inválido ou incompatível (${String(rawStatus)}).`);
      return {
        status: "suspended",
        isExpiredSuspension: false,
        isDeactivated,
        hasLegacyInconsistency: true,
        hasMissingStatusField: false,
        inconsistencyReasons,
        suspendedUntilEval,
        blockExpiresAtEval,
        statusReason: user.statusReason || "Status da conta ausente ou inválido",
        statusUpdatedAt: user.statusUpdatedAt,
        statusUpdatedBy: user.statusUpdatedBy,
        suspendedUntil: suspendedUntilEval.isValid ? user.suspendedUntil : undefined,
        blockExpiresAt: blockExpiresAtEval.isValid ? user.blockExpiresAt : undefined,
      };
    }
  }

  // Absent 'status' key aligns with Firestore Rules: statusVal = ('status' in u) ? u.status : 'active'
  const currentStatus: AccountStatus = hasStatusKey ? (rawStatus as AccountStatus) : "active";
  const hasMissingStatusField = !hasStatusKey;

  if (currentStatus === "suspended" && !suspendedUntilEval.isPresent && blockExpiresAtEval.isPresent) {
    inconsistencyReasons.push(
      "Suspensão sem 'suspendedUntil' acompanhada de 'blockExpiresAt' residual (suspensão indefinida permanece bloqueada)."
    );
  }

  const hasLegacyInconsistency = inconsistencyReasons.length > 0;
  const hasAnyActiveBlock = suspendedUntilEval.isActive || blockExpiresAtEval.isActive;
  const hasAnyInvalidField = suspendedUntilEval.isInvalid || blockExpiresAtEval.isInvalid;

  // 1. Permanent ban always takes precedence over any temporary or legacy fields
  if (currentStatus === "banned") {
    return {
      status: "banned",
      isExpiredSuspension: false,
      isDeactivated,
      hasLegacyInconsistency,
      hasMissingStatusField,
      inconsistencyReasons,
      suspendedUntilEval,
      blockExpiresAtEval,
      statusReason: user.statusReason,
      statusUpdatedAt: user.statusUpdatedAt,
      statusUpdatedBy: user.statusUpdatedBy,
      suspendedUntil: user.suspendedUntil,
      blockExpiresAt: user.blockExpiresAt,
    };
  }

  // 2. active === false always blocks in Firestore Rules
  if (isDeactivated) {
    return {
      status: "suspended",
      isExpiredSuspension: false,
      isDeactivated: true,
      hasLegacyInconsistency: true,
      hasMissingStatusField,
      inconsistencyReasons,
      suspendedUntilEval,
      blockExpiresAtEval,
      statusReason: user.statusReason || "Conta desativada administrativamente (active: false)",
      statusUpdatedAt: user.statusUpdatedAt,
      statusUpdatedBy: user.statusUpdatedBy,
      suspendedUntil: suspendedUntilEval.isValid ? user.suspendedUntil : undefined,
      blockExpiresAt: blockExpiresAtEval.isValid ? user.blockExpiresAt : undefined,
    };
  }

  // 3. Any present incompatible deadline field (`null`, string/ISO, number, boolean, array, non-timestamp object)
  // blocks in Firestore Rules regardless of whether raw status is "active" or "suspended"
  if (hasAnyInvalidField) {
    return {
      status: "suspended",
      isExpiredSuspension: false,
      isDeactivated: false,
      hasLegacyInconsistency: true,
      hasMissingStatusField,
      inconsistencyReasons,
      suspendedUntilEval,
      blockExpiresAtEval,
      statusReason:
        user.statusReason ||
        inconsistencyReasons.find((r) => r.includes("suspendedUntil") || r.includes("blockExpiresAt")) ||
        "Bloqueio por campo temporal incompatível com as regras de segurança",
      statusUpdatedAt: user.statusUpdatedAt,
      statusUpdatedBy: user.statusUpdatedBy,
      suspendedUntil: suspendedUntilEval.isValid ? user.suspendedUntil : undefined,
      blockExpiresAt: blockExpiresAtEval.isValid ? user.blockExpiresAt : undefined,
    };
  }

  // 4. Any active future Firestore Timestamp block overrides active status
  if (hasAnyActiveBlock) {
    return {
      status: "suspended",
      isExpiredSuspension: false,
      isDeactivated: false,
      hasLegacyInconsistency,
      hasMissingStatusField,
      inconsistencyReasons,
      suspendedUntilEval,
      blockExpiresAtEval,
      statusReason: user.statusReason,
      statusUpdatedAt: user.statusUpdatedAt,
      statusUpdatedBy: user.statusUpdatedBy,
      suspendedUntil: suspendedUntilEval.isActive ? user.suspendedUntil : blockExpiresAtEval.isActive ? user.blockExpiresAt : user.suspendedUntil,
      blockExpiresAt: user.blockExpiresAt,
    };
  }

  // 5. For suspended accounts: auto-release ONLY when `suspendedUntil` is a valid expired
  // Firestore Timestamp (matching `statusVal == 'suspended' && hasS` in isStandingActive).
  // Indefinite suspensions (no suspendedUntil) NEVER unlock via residual `blockExpiresAt`.
  if (currentStatus === "suspended") {
    const canAutoRelease = suspendedUntilEval.isValid && suspendedUntilEval.isExpired;

    if (canAutoRelease) {
      return {
        status: "active",
        isExpiredSuspension: true,
        isDeactivated: false,
        hasLegacyInconsistency,
        hasMissingStatusField: false,
        inconsistencyReasons,
        suspendedUntilEval,
        blockExpiresAtEval,
        statusReason: undefined,
        statusUpdatedAt: user.statusUpdatedAt,
        statusUpdatedBy: user.statusUpdatedBy,
        suspendedUntil: undefined,
        blockExpiresAt: undefined,
      };
    }

    return {
      status: "suspended",
      isExpiredSuspension: false,
      isDeactivated: false,
      hasLegacyInconsistency,
      hasMissingStatusField: false,
      inconsistencyReasons,
      suspendedUntilEval,
      blockExpiresAtEval,
      statusReason: user.statusReason,
      statusUpdatedAt: user.statusUpdatedAt,
      statusUpdatedBy: user.statusUpdatedBy,
      suspendedUntil: undefined,
      blockExpiresAt: user.blockExpiresAt,
    };
  }

  // 6. Active (including legacy profile missing 'status' without any incompatible/future blocks)
  return {
    status: "active",
    isExpiredSuspension: false,
    isDeactivated: false,
    hasLegacyInconsistency,
    hasMissingStatusField,
    inconsistencyReasons,
    suspendedUntilEval,
    blockExpiresAtEval,
    statusReason: user.statusReason,
    statusUpdatedAt: user.statusUpdatedAt,
    statusUpdatedBy: user.statusUpdatedBy,
    suspendedUntil: undefined,
    blockExpiresAt: user.blockExpiresAt,
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
 * Formats a Date into `YYYY-MM-DDTHH:mm` in the user's LOCAL timezone (for `<input type="datetime-local">`),
 * avoiding UTC shifts from `.toISOString().slice(0, 16)`.
 */
export function formatLocalDateTimeInput(date: Date): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Strictly parses a `<input type="datetime-local">` string (`YYYY-MM-DDTHH:mm` or `YYYY-MM-DDTHH:mm:ss`)
 * in the LOCAL timezone without browser/UTC ambiguities and validates calendar bounds.
 */
export function parseLocalDateTimeInput(value: string): Date | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  const year = parseInt(match[1], 10);
  const monthNum = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const hour = parseInt(match[4], 10);
  const minute = parseInt(match[5], 10);
  const second = match[6] ? parseInt(match[6], 10) : 0;

  if (
    monthNum < 1 ||
    monthNum > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }

  const parsed = new Date(year, monthNum - 1, day, hour, minute, second, 0);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== monthNum - 1 ||
    parsed.getDate() !== day ||
    parsed.getHours() !== hour ||
    parsed.getMinutes() !== minute
  ) {
    return null;
  }

  return parsed;
}

/**
 * Computes the ISO-8601 string for a given preset duration from now, or validates custom input.
 * Fails loudly when presetId is unknown or when custom date is invalid / not in the future.
 */
export function calculateSuspensionDeadline(presetId: string, customInput?: string): string | undefined {
  if (presetId === "indefinite") {
    return undefined;
  }

  if (presetId === "custom") {
    if (!customInput || !customInput.trim()) {
      throw new Error("Selecione a data e horário limite para a suspensão personalizada.");
    }
    const localParsed = parseLocalDateTimeInput(customInput);
    const parsed = localParsed ?? safeParseDate(customInput);
    if (!parsed || Number.isNaN(parsed.getTime())) {
      throw new Error("A data e hora informadas para a suspensão personalizada são inválidas.");
    }
    if (parsed.getTime() <= Date.now()) {
      throw new Error("A data personalizada da suspensão deve estar no futuro.");
    }
    return parsed.toISOString();
  }

  const preset = SUSPENSION_PRESET_OPTIONS.find((p) => p.id === presetId);
  if (!preset || !preset.days) {
    throw new Error(`Prazo de suspensão desconhecido: '${presetId}'.`);
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
  inconsistencyAlert?: string;
} {
  const resolved = resolveAccountStatus(user);

  const inconsistencyAlert =
    resolved.hasLegacyInconsistency && resolved.inconsistencyReasons.length > 0
      ? resolved.inconsistencyReasons.join(" ")
      : undefined;

  switch (resolved.status) {
    case "banned":
      return {
        label: "Banido",
        badgeClass: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/50",
        dotClass: "bg-red-500",
        description: resolved.statusReason
          ? `Conta banida permanentemente. Motivo: ${resolved.statusReason}`
          : "Conta banida permanentemente por infração às normas do IFPR.",
        inconsistencyAlert,
      };

    case "suspended": {
      if (resolved.isDeactivated) {
        return {
          label: "Inativo / Desativado",
          badgeClass: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50",
          dotClass: "bg-rose-500",
          description: `Conta desativada administrativamente (active: false).${resolved.statusReason ? ` Motivo: ${resolved.statusReason}` : ""}`,
          inconsistencyAlert,
        };
      }

      if (resolved.suspendedUntilEval.isInvalid || resolved.blockExpiresAtEval.isInvalid) {
        return {
          label: "Bloqueado (Inconsistência)",
          badgeClass: "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
          dotClass: "bg-amber-600",
          description: inconsistencyAlert || "Conta bloqueada por incompatibilidade cadastral nas Firestore Rules.",
          inconsistencyAlert,
        };
      }

      const activeDeadlineRaw =
        resolved.suspendedUntilEval.isActive
          ? user.suspendedUntil
          : resolved.blockExpiresAtEval.isActive
          ? user.blockExpiresAt
          : resolved.suspendedUntil;
      const untilDate = activeDeadlineRaw ? safeParseDate(activeDeadlineRaw) : null;
      const untilStr = untilDate
        ? ` até ${untilDate.toLocaleDateString("pt-BR")} às ${untilDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
        : " por tempo indeterminado";
      return {
        label: "Suspenso",
        badgeClass: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/50",
        dotClass: "bg-amber-500",
        description: `Conta suspensa${untilStr}.${resolved.statusReason ? ` Motivo: ${resolved.statusReason}` : ""}`,
        inconsistencyAlert,
      };
    }

    case "active":
      return {
        label: "Ativo",
        badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/50",
        dotClass: "bg-emerald-500",
        description: resolved.hasMissingStatusField
          ? "Conta ativa via compatibilidade legada (campo 'status' ausente no documento)."
          : "Conta ativa e com acesso liberado a todas as funcionalidades.",
        inconsistencyAlert,
      };

    default:
      return {
        label: "Inativo / Restrito",
        badgeClass: "bg-neutral-100 text-neutral-700 border-neutral-300 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700",
        dotClass: "bg-neutral-400",
        description: "Conta inativa ou com status irregular no sistema.",
        inconsistencyAlert,
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
