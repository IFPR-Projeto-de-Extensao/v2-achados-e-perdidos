import { NotificationItem, User } from "../types";

/**
 * Checks whether a notification is broadcast globally to all users
 */
export function isGlobalNotification(
  userId?: string | null,
  isGlobal?: boolean
): boolean {
  if (isGlobal === true) return true;
  if (!userId) return false;
  const normalized = userId.trim().toLowerCase();
  return (
    normalized === "all" ||
    normalized === "todos" ||
    normalized === "todos_alunos" ||
    normalized === "global"
  );
}

/**
 * Determines strictly whether a given notification should be visible or alerted to a specific user.
 * 
 * Rules:
 * 1. Admin users can view all notifications.
 * 2. Truly global notifications are visible to all users.
 * 3. Individual notifications are visible ONLY to the specific user matching userId or UID.
 * 4. A notification intended for student A will NEVER be visible to student B.
 */
export function isNotificationForUser(
  notification: NotificationItem | null | undefined,
  user?: User | null,
  fbUid?: string | null
): boolean {
  if (!notification || !notification.userId) return false;

  // 1. Admins have oversight of all system notifications
  if (user?.role === "ADMIN") {
    return true;
  }

  // 2. Global notifications destined for everyone
  if (isGlobalNotification(notification.userId, notification.isGlobal)) {
    return true;
  }

  // 3. Direct recipient verification (User ID or Firebase Auth UID)
  const currentUserId = user?.id?.trim();
  const currentFbUid = fbUid?.trim();
  const targetUserId = notification.userId.trim();

  if (currentUserId && currentUserId !== "guest_visitor" && targetUserId === currentUserId) {
    return true;
  }

  if (currentFbUid && targetUserId === currentFbUid) {
    return true;
  }

  return false;
}

/**
 * Filters a notification list, returning strictly the items allowed for the user.
 */
export function filterNotificationsForUser(
  notifications: NotificationItem[] | null | undefined,
  user?: User | null,
  fbUid?: string | null
): NotificationItem[] {
  if (!Array.isArray(notifications)) return [];
  return notifications.filter((n) => isNotificationForUser(n, user, fbUid));
}
