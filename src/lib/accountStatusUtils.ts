import type { AccountStatus, User } from "../types";
import { safeParseDate } from "./utils";

export interface ResolvedAccountStatus {
  status: AccountStatus;
  isExpiredSuspension: boolean;
  statusReason?: string;
  statusUpdatedAt?: string;
  statusUpdatedBy?: string;
  suspendedUntil?: string;
}

/**
 * Resolves the real-time account status of a user.
 * Automatically marks a suspension as expired if its deadline has passed.
 */
export function resolveAccountStatus(user: Partial<User> | null | undefined): ResolvedAccountStatus {
  if (!user) {
    return {
      status: "active",
      isExpiredSuspension: false,
    };
  }

  const currentStatus: AccountStatus = user.status || "active";

  if (currentStatus === "suspended" && user.suspendedUntil) {
    const parsedDate = safeParseDate(user.suspendedUntil);
    const untilMs = parsedDate ? parsedDate.getTime() : 0;

    // If suspension deadline has passed, automatically resolve as active
    if (untilMs > 0 && untilMs <= Date.now()) {
      return {
        status: "active",
        isExpiredSuspension: true,
        statusReason: undefined,
        statusUpdatedAt: user.statusUpdatedAt,
        statusUpdatedBy: user.statusUpdatedBy,
        suspendedUntil: undefined,
      };
    }
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
    default:
      return {
        label: "Ativo",
        badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/50",
        dotClass: "bg-emerald-500",
        description: "Conta ativa e com acesso liberado a todas as funcionalidades.",
      };
  }
}
