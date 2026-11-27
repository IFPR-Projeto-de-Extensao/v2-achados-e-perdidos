import type { ActionCodeSettings } from "firebase/auth";
import type { ApprovalStatus, User, UserRole } from "../types";

export const VALID_ADMIN_USER_ROLES = ["ALUNO", "SERVIDOR", "ADMIN", "INTRUSO"] as const;
export const VALID_APPROVAL_STATUSES = ["APROVADO", "PENDENTE"] as const;

export type EmailDeliveryStatus =
  | "SENT"
  | "PENDING"
  | "FIREBASE_AUTH_SENT"
  | "PENDING_SMTP_CONFIG"
  | "ERROR";

export type EmailDeliveryMethod = "RESEND" | "SMTP" | "FIREBASE_AUTH" | "NONE";

export interface AdminCreateUserResult {
  success: boolean;
  user: User;
  authCreated: boolean;
  emailSent: boolean;
  deliveryMethod: EmailDeliveryMethod;
  deliveryStatus: EmailDeliveryStatus;
  normalizedStatus?: "SENT" | "PENDING" | "ERROR";
  provider?: "RESEND" | "SMTP" | "NONE";
  messageId?: string | null;
  deliveryError?: string;
  manualSetupLink?: string;
  continueUriFallbackUsed?: boolean;
}

export interface AdminSendFirstAccessResult {
  success: boolean;
  uid: string;
  email: string;
  authProvisioned: boolean;
  emailSent: boolean;
  deliveryMethod: EmailDeliveryMethod;
  deliveryStatus: EmailDeliveryStatus;
  normalizedStatus?: "SENT" | "PENDING" | "ERROR";
  provider?: "RESEND" | "SMTP" | "NONE";
  messageId?: string | null;
  deliveryError?: string;
  manualSetupLink?: string;
  continueUriFallbackUsed?: boolean;
}

export interface PasswordResetDispatchResult {
  sent: boolean;
  usedFallbackWithoutContinueUri: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface ValidatedAdminCreateUserPayload {
  name: string;
  email: string;
  role: UserRole;
  approvalStatus: ApprovalStatus;
  courseOrDept: string;
  registrationNumber: string;
  phone: string;
  avatarUrl: string;
  reputationScore: number;
}

export function normalizeAuthEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

export function isValidAuthEmail(email: string): boolean {
  if (!email || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export function isContinueUriUnauthorizedError(err: any): boolean {
  const code = String(err?.code || "").toLowerCase();
  const message = String(err?.message || "").toLowerCase();
  return (
    code.includes("unauthorized-continue-uri") ||
    code.includes("invalid-continue-uri") ||
    code.includes("missing-continue-uri") ||
    message.includes("unauthorized-continue-uri") ||
    message.includes("invalid-continue-uri") ||
    message.includes("missing-continue-uri") ||
    message.includes("domain not allowlisted") ||
    message.includes("continue url")
  );
}

export function buildPasswordResetActionCodeSettings(
  originUrl?: string | null
): ActionCodeSettings | undefined {
  if (!originUrl || typeof originUrl !== "string") return undefined;
  const trimmed = originUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return undefined;

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const isLocal = host === "localhost" || host === "127.0.0.1";
    if (parsed.protocol !== "https:" && !(isLocal && parsed.protocol === "http:")) {
      return undefined;
    }
    return {
      url: `${parsed.origin}/redefinir-senha`,
      handleCodeInApp: true,
    };
  } catch {
    return undefined;
  }
}

export function shouldTriggerClientFirebaseResetFallback(
  deliveryStatus?: string | null
): boolean {
  return (
    deliveryStatus === "PENDING" ||
    deliveryStatus === "PENDING_SMTP_CONFIG" ||
    deliveryStatus === "ERROR"
  );
}

export function validateNewPasswordInput(
  password: string,
  confirmPassword?: string
): { ok: true; password: string } | { ok: false; error: string; code: string } {
  const trimmed = typeof password === "string" ? password : "";
  if (!trimmed || trimmed.trim().length < 6) {
    return {
      ok: false,
      error: "A senha deve ter pelo menos 6 caracteres válidos.",
      code: "PASSWORD_TOO_SHORT",
    };
  }
  if (trimmed.length > 128) {
    return {
      ok: false,
      error: "A senha não pode ultrapassar 128 caracteres.",
      code: "PASSWORD_TOO_LONG",
    };
  }
  if (typeof confirmPassword === "string" && trimmed !== confirmPassword) {
    return {
      ok: false,
      error: "As senhas informadas não coincidem.",
      code: "PASSWORD_MISMATCH",
    };
  }
  return { ok: true, password: trimmed };
}

export function getDefaultCourseForRole(role: UserRole): string {
  switch (role) {
    case "ADMIN":
      return "Administração TI - IFPR Campus Ivaiporã";
    case "SERVIDOR":
      return "Servidor IFPR Campus Ivaiporã";
    case "ALUNO":
      return "Estudante IFPR Campus Ivaiporã";
    default:
      return "Comunidade Externa";
  }
}

function sanitizeAvatarInput(raw: unknown, fallbackName: string): string {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (/^https:\/\//i.test(trimmed) && trimmed.length <= 2048) {
      return trimmed;
    }
  }
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(fallbackName)}`;
}

export function validateAdminCreateUserInput(
  raw: any
):
  | { ok: true; data: ValidatedAdminCreateUserPayload }
  | { ok: false; error: string; code: string } {
  if (!raw || typeof raw !== "object") {
    return {
      ok: false,
      error: "Dados do usuário não informados.",
      code: "INVALID_PAYLOAD",
    };
  }

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (name.length < 3 || name.length > 120) {
    return {
      ok: false,
      error: "Informe o nome completo (entre 3 e 120 caracteres).",
      code: "INVALID_NAME",
    };
  }

  const email = normalizeAuthEmail(raw.email);
  if (!isValidAuthEmail(email)) {
    return {
      ok: false,
      error: "Informe um endereço de e-mail válido.",
      code: "INVALID_EMAIL",
    };
  }

  const rawRole = typeof raw.role === "string" ? raw.role.trim().toUpperCase() : "ALUNO";
  if (!(VALID_ADMIN_USER_ROLES as readonly string[]).includes(rawRole)) {
    return {
      ok: false,
      error: `Perfil inválido. Valores permitidos: ${VALID_ADMIN_USER_ROLES.join(", ")}.`,
      code: "INVALID_ROLE",
    };
  }
  const role = rawRole as UserRole;

  const rawApproval =
    typeof raw.approvalStatus === "string"
      ? raw.approvalStatus.trim().toUpperCase()
      : "APROVADO";
  const approvalStatus: ApprovalStatus = (VALID_APPROVAL_STATUSES as readonly string[]).includes(
    rawApproval
  )
    ? (rawApproval as ApprovalStatus)
    : "APROVADO";

  const courseOrDeptRaw =
    typeof raw.courseOrDept === "string" ? raw.courseOrDept.trim().slice(0, 150) : "";
  const courseOrDept = courseOrDeptRaw || getDefaultCourseForRole(role);

  const registrationNumber =
    typeof raw.registrationNumber === "string"
      ? raw.registrationNumber.trim().slice(0, 50)
      : "";

  const phone = typeof raw.phone === "string" ? raw.phone.trim().slice(0, 30) : "";
  const avatarUrl = sanitizeAvatarInput(raw.avatarUrl, name);
  const rawScore = Number(raw.reputationScore);
  const reputationScore =
    Number.isFinite(rawScore) && rawScore >= 0 && rawScore <= 1000 ? Math.round(rawScore) : 100;

  return {
    ok: true,
    data: {
      name,
      email,
      role,
      approvalStatus,
      courseOrDept,
      registrationNumber,
      phone,
      avatarUrl,
      reputationScore,
    },
  };
}

/**
 * Dispatches Firebase Auth password reset email with continueUrl actionCodeSettings,
 * falling back cleanly to default Firebase Auth reset link ONLY when continueUrl fails
 * due to an unauthorized continue URI. Never masks real delivery or rate-limit errors.
 */
export async function dispatchPasswordResetWithFallback<TAuth>(params: {
  auth: TAuth;
  email: string;
  originUrl?: string | null;
  sendFn: (auth: TAuth, email: string, actionCodeSettings?: ActionCodeSettings) => Promise<void>;
}): Promise<PasswordResetDispatchResult> {
  const cleanEmail = normalizeAuthEmail(params.email);
  const actionCodeSettings = buildPasswordResetActionCodeSettings(params.originUrl);

  if (actionCodeSettings) {
    try {
      await params.sendFn(params.auth, cleanEmail, actionCodeSettings);
      return {
        sent: true,
        usedFallbackWithoutContinueUri: false,
      };
    } catch (err: any) {
      if (!isContinueUriUnauthorizedError(err)) {
        throw err;
      }
      // Retry using Firebase's default auth handler when the active host is not yet listed in Authorized Domains
      await params.sendFn(params.auth, cleanEmail);
      return {
        sent: true,
        usedFallbackWithoutContinueUri: true,
      };
    }
  }

  await params.sendFn(params.auth, cleanEmail);
  return {
    sent: true,
    usedFallbackWithoutContinueUri: false,
  };
}
