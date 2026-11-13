import { isAccountBlocked } from "./accountStatusUtils";
import { LostFoundItem, User } from "../types";

export const ROOT_ADMIN_EMAIL = "paulocauan39@gmail.com";

export interface AuthContextIdentity {
  uid?: string | null;
  email?: string | null;
  emailVerified?: boolean | null;
}

/**
 * Pure helper evaluating whether an authenticated user has institutional standing
 * to initiate or register a formal item return (DEVE ser SERVIDOR ou ADMIN aprovado,
 * com conta ativa e e-mail verificado).
 */
export function canOperateFormalReturn(
  user: Partial<User> | null | undefined,
  authInfo?: AuthContextIdentity | null,
  isGuest?: boolean
): boolean {
  if (isGuest) return false;
  if (!user || !user.id || user.id === "guest") return false;
  if (!authInfo || !authInfo.uid) return false;

  const email = (authInfo.email || user.email || "").trim().toLowerCase();
  const isRootEmail = email === ROOT_ADMIN_EMAIL.toLowerCase();

  if (!isRootEmail && authInfo.emailVerified !== true && user.emailVerified !== true) {
    return false;
  }

  if (isAccountBlocked(user)) {
    return false;
  }

  const normStatus = String(user.status || "active").trim().toLowerCase();
  if (
    normStatus === "suspended" ||
    normStatus === "banned" ||
    normStatus === "inactive" ||
    (user as any).active === false
  ) {
    return false;
  }

  if (isRootEmail && (user.role === "ADMIN" || user.approvalStatus === "APROVADO")) {
    return true;
  }

  if (user.role !== "ADMIN" && user.role !== "SERVIDOR") {
    return false;
  }

  return user.approvalStatus === "APROVADO";
}

/**
 * Evaluates whether the formal return CTA should be available for a specific item.
 * Prevents formal return actions on items that are already DEVOLVIDO or ENCERRADO.
 */
export function canStartFormalReturnForItem(
  user: Partial<User> | null | undefined,
  authInfo: AuthContextIdentity | null | undefined,
  item: Partial<LostFoundItem> | null | undefined,
  isGuest?: boolean
): boolean {
  if (!item || !item.id) return false;
  if (item.status === "DEVOLVIDO" || item.status === "ENCERRADO") return false;
  return canOperateFormalReturn(user, authInfo, isGuest);
}

/**
 * Evaluates whether the user is an approved & active ADMIN capable of reopening a return.
 */
export function canReopenFormalReturn(
  user: Partial<User> | null | undefined,
  authInfo?: AuthContextIdentity | null,
  isGuest?: boolean
): boolean {
  if (!canOperateFormalReturn(user, authInfo, isGuest)) return false;
  const email = (authInfo?.email || user?.email || "").trim().toLowerCase();
  if (email === ROOT_ADMIN_EMAIL.toLowerCase()) return true;
  return user?.role === "ADMIN" && user?.approvalStatus === "APROVADO";
}
