import { User } from "../types";
import { isAccountBlocked, isUserAccountActive } from "./accountStatusUtils";
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
  isVerifiedActiveExternalUser: boolean;
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
      isVerifiedActiveExternalUser: false,
      isApprovedAdmin: false,
      isApprovedStaffOrAdmin: false,
    };
  }

  const isEmailVerified = input.firebaseUser?.emailVerified === true;
  const isRootAdmin = isVerifiedRootAdminIdentity(user, input.firebaseUser);

  const isBlockedOrInactive =
    !isUserAccountActive(user) ||
    isAccountBlocked(user) ||
    (user as any).active === false;

  const isAccountActive = !isBlockedOrInactive && user.role !== "INTRUSO";
  const isVerifiedActiveExternalUser = Boolean(
    isEmailVerified && !isBlockedOrInactive && user.role === "INTRUSO"
  );

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
    isVerifiedActiveExternalUser,
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
  if (!session.isSessionReady) return "NONE";
  if (session.isApprovedStaffOrAdmin) return "ALL";
  if (session.isAccountActive || session.isVerifiedActiveExternalUser) return "SELF";
  return "NONE";
}

export function getNotificationsListenerScope(
  input: ListenerSessionInput
): NotificationsSubscriptionScope {
  const session = evaluateListenerSession(input);
  if (!session.isSessionReady) return "NONE";
  if (session.isApprovedAdmin) return "ALL";
  if (session.isAccountActive || session.isVerifiedActiveExternalUser) return "SELF";
  return "NONE";
}
