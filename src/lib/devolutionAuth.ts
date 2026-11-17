import { isAccountBlocked } from "./accountStatusUtils";
import { LostFoundItem, User } from "../types";

export const ROOT_ADMIN_EMAIL = "paulocauan39@gmail.com";
export const ROOT_ADMIN_UID = "hCG5mDgK1fRaTojULzlM7dXvb7n2";

export interface AuthContextIdentity {
  uid?: string | null;
  email?: string | null;
  emailVerified?: boolean | null;
}

export function isVerifiedRootAdminIdentity(
  user: Partial<User> | null | undefined,
  authInfo?: AuthContextIdentity | null
): boolean {
  if (!authInfo || !authInfo.uid || authInfo.emailVerified !== true) return false;
  if (authInfo.uid !== ROOT_ADMIN_UID) return false;
  const authEmail = (authInfo.email || "").trim().toLowerCase();
  const userEmail = (user?.email || "").trim().toLowerCase();
  return (
    authEmail === ROOT_ADMIN_EMAIL.toLowerCase() ||
    (!authEmail && userEmail === ROOT_ADMIN_EMAIL.toLowerCase())
  );
}

/**
 * Avalia exclusivamente pela sessão Firebase Auth (sem fallback de documento Firestore)
 * se o usuário autenticado é o Root Admin legítimo (UID fixo + e-mail case-insensitive + emailVerified === true).
 */
export function isVerifiedRootAdminAuthUser(
  authInfo?: AuthContextIdentity | null
): boolean {
  return isVerifiedRootAdminIdentity(null, authInfo);
}

/**
 * Pure helper evaluating whether an authenticated user has institutional standing
 * to initiate or register a formal item return (DEVE ser SERVIDOR ou ADMIN aprovado,
 * com conta ativa, vínculo UID consistente e e-mail verificado no Firebase Auth).
 */
export function canOperateFormalReturn(
  user: Partial<User> | null | undefined,
  authInfo?: AuthContextIdentity | null,
  isGuest?: boolean
): boolean {
  if (isGuest) return false;
  if (!user || !user.id || user.id === "guest" || user.id === "guest_visitor") return false;
  if (!authInfo || !authInfo.uid) return false;
  if (user.id !== authInfo.uid) return false;

  // Regra estrita consistente com firestore.rules (inclusive para o Root Admin via isRootAdmin()):
  // exige emailVerified === true diretamente do token/sessão Firebase Auth, sem fallback em Firestore.
  if (authInfo.emailVerified !== true) {
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

  if (isVerifiedRootAdminIdentity(user, authInfo)) {
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
  if (isVerifiedRootAdminIdentity(user, authInfo)) return true;
  return user?.role === "ADMIN" && user?.approvalStatus === "APROVADO";
}
