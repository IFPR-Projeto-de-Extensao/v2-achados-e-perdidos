import { User } from "../types";
import { isAccountBlocked } from "./accountStatusUtils";
import {
  AuthContextIdentity,
  canOperateFormalReturn,
  isVerifiedRootAdminIdentity,
} from "./devolutionAuth";

export interface ListenerSessionInput {
  authLoading: boolean;
  firebaseUser: AuthContextIdentity | null | undefined;
  currentUser: Partial<User> | null | undefined;
}

export type ItemHistorySubscriptionMode = "WAIT" | "FIRESTORE_STAFF" | "PUBLIC_API";
export type ClaimsSubscriptionScope = "NONE" | "ALL" | "SELF";
export type NotificationsSubscriptionScope = "NONE" | "ALL" | "SELF";

export interface EvaluatedListenerSession {
  isSessionReady: boolean;
  uid: string | null;
  isEmailVerified: boolean;
  isRootAdmin: boolean;
  isAccountActive: boolean;
  isApprovedAdmin: boolean;
  isApprovedStaffOrAdmin: boolean;
}

/**
 * Avalia de forma centralizada e pura se a sessão de autenticação estabilizou
 * (`authLoading === false`), se o UID autenticado coincide com `currentUser.id`,
 * se a conta está ativa/não bloqueada e quais privilégios reais possui no Firestore Rules.
 */
export function evaluateListenerSession(
  input: ListenerSessionInput
): EvaluatedListenerSession {
  const uid = input.firebaseUser?.uid || null;
  const user = input.currentUser;

  const isSessionReady = Boolean(
    !input.authLoading &&
      uid &&
      user &&
      user.id &&
      user.id !== "guest" &&
      user.id !== "guest_visitor" &&
      user.id === uid
  );

  if (!isSessionReady || !uid || !user) {
    return {
      isSessionReady: false,
      uid: null,
      isEmailVerified: false,
      isRootAdmin: false,
      isAccountActive: false,
      isApprovedAdmin: false,
      isApprovedStaffOrAdmin: false,
    };
  }

  const isEmailVerified = input.firebaseUser?.emailVerified === true;
  const isRootAdmin = isVerifiedRootAdminIdentity(user, input.firebaseUser);

  const normStatus = String(user.status || "active").trim().toLowerCase();
  const isBlockedOrInactive =
    isAccountBlocked(user) ||
    normStatus === "suspended" ||
    normStatus === "banned" ||
    normStatus === "inactive" ||
    (user as any).active === false;

  const isAccountActive = !isBlockedOrInactive && user.role !== "INTRUSO";

  const isApprovedAdmin = Boolean(
    isEmailVerified &&
      isAccountActive &&
      (isRootAdmin || (user.role === "ADMIN" && user.approvalStatus === "APROVADO"))
  );

  const isApprovedStaffOrAdmin = canOperateFormalReturn(
    user,
    input.firebaseUser,
    false
  );

  return {
    isSessionReady: true,
    uid,
    isEmailVerified,
    isRootAdmin,
    isAccountActive,
    isApprovedAdmin,
    isApprovedStaffOrAdmin,
  };
}

export function getItemHistorySubscriptionMode(
  input: ListenerSessionInput
): ItemHistorySubscriptionMode {
  if (input.authLoading) return "WAIT";
  const session = evaluateListenerSession(input);
  if (session.isApprovedStaffOrAdmin) return "FIRESTORE_STAFF";
  return "PUBLIC_API";
}

export function canSubscribeStaffItemCollections(
  input: ListenerSessionInput
): boolean {
  return evaluateListenerSession(input).isApprovedStaffOrAdmin;
}

export function canSubscribeUsersDirectory(
  input: ListenerSessionInput
): boolean {
  return evaluateListenerSession(input).isApprovedAdmin;
}

export function canSubscribeStaffLogs(input: ListenerSessionInput): boolean {
  return evaluateListenerSession(input).isApprovedStaffOrAdmin;
}

export function canSubscribeAdminOnlyLogs(input: ListenerSessionInput): boolean {
  return evaluateListenerSession(input).isApprovedAdmin;
}

export function getClaimsListenerScope(
  input: ListenerSessionInput
): ClaimsSubscriptionScope {
  const session = evaluateListenerSession(input);
  if (!session.isSessionReady || !session.isAccountActive) return "NONE";
  if (session.isApprovedStaffOrAdmin) return "ALL";
  return "SELF";
}

export function getNotificationsListenerScope(
  input: ListenerSessionInput
): NotificationsSubscriptionScope {
  const session = evaluateListenerSession(input);
  if (!session.isSessionReady) return "NONE";
  if (session.isApprovedAdmin) return "ALL";
  return "SELF";
}
