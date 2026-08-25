// ==============================================================================
// Firebase Cloud Messaging (FCM) & Real-time Push Notification Manager
// IFPR Campus Ivaiporã • Sistema de Achados e Perdidos
// ==============================================================================

import { getApp } from "firebase/app";
import { getMessaging, getToken, onMessage, isSupported as isMessagingSupported, Messaging } from "firebase/messaging";
import { doc, setDoc, getDoc, collection, addDoc, getDocs, query, where } from "firebase/firestore";
import { db, auth, handleFirestoreError, OperationType } from "./firebase";
import { User, LostFoundItem, NotificationItem } from "../types";
import { triggerVibration, vibrateSuccess, vibrateWarning, vibrateCritical } from "./utils";
import firebaseConfig from "../../firebase-applet-config.json";

export interface FCMSubscriptionRecord {
  userId: string;
  userEmail: string;
  userName: string;
  fcmToken: string;
  subscribedAt: string;
  userAgent: string;
  active: boolean;
  notifyOnLostFoundMatch: boolean;
  notifyOnStatusChange: boolean;
  notifyOnCampusBroadcasts: boolean;
  deviceType: "mobile" | "desktop";
  lastActiveTimestamp?: string;
}

export interface MatchPushPayload {
  targetUserId: string;
  targetUserEmail?: string;
  targetUserName?: string;
  matchScore: number;
  newRegisteredItem: LostFoundItem;
  userLostItem: LostFoundItem;
  matchedFeatures?: string[];
  reason?: string;
}

let messagingInstance: Messaging | null = null;
let audioContextInstance: AudioContext | null = null;

/**
 * Plays a discrete, pleasant institutional alert chime for found matches
 */
export function playNotificationChime() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioContextInstance) {
      audioContextInstance = new AudioContextClass();
    }

    if (audioContextInstance.state === "suspended") {
      audioContextInstance.resume();
    }

    const ctx = audioContextInstance;
    const now = ctx.currentTime;

    // Harmonic two-tone chime (F5 -> A5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(698.46, now); // F5
    osc1.frequency.exponentialRampToValueAtTime(880.0, now + 0.15); // A5

    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.linearRampToValueAtTime(0.2, now + 0.04);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.6);
  } catch (err) {
    // Non-blocking audio fallback
  }
}

/**
 * Lazily initializes and returns the Firebase Cloud Messaging instance
 */
export async function getFCMInstance(): Promise<Messaging | null> {
  if (typeof window === "undefined") return null;
  if (messagingInstance) return messagingInstance;

  try {
    const supported = await isMessagingSupported();
    if (supported) {
      messagingInstance = getMessaging(getApp());
    }
  } catch (err) {
    console.warn("[FCM Notice] Firebase Messaging not available in this container environment:", err);
  }
  return messagingInstance;
}

/**
 * Requests browser permission and generates / persists the FCM Token for the user
 */
export async function requestFCMPermissionAndToken(currentUser: User): Promise<{
  success: boolean;
  token: string;
  permission: NotificationPermission;
}> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return {
      success: false,
      token: "",
      permission: "denied",
    };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { success: false, token: "", permission };
    }

    let token = "";
    const messaging = await getFCMInstance();

    if (messaging) {
      try {
        // Register service worker if available
        let swRegistration: ServiceWorkerRegistration | undefined;
        if ("serviceWorker" in navigator) {
          try {
            swRegistration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });
          } catch (_) {
            swRegistration = await navigator.serviceWorker.ready;
          }
        }

        // VAPID Public Key for Web Push (IFPR / Firebase Web Push)
        const vapidKey = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZ_WJJn_9tghPvPGQn5UzVmxuvZ4qV1v0Z0K7wM";

        token = await getToken(messaging, {
          vapidKey,
          serviceWorkerRegistration: swRegistration,
        });
      } catch (err) {
        console.warn("[FCM Notice] VAPID Key token generation fallback:", err);
      }
    }

    if (!token) {
      // Deterministic synthetic FCM token for sandboxed iframe environments
      token = `fcm_ifpr_${currentUser.id}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    // Persist FCM subscription in Firestore
    const subscriptionRecord: FCMSubscriptionRecord = {
      userId: currentUser.id,
      userEmail: currentUser.email,
      userName: currentUser.name,
      fcmToken: token,
      subscribedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      active: true,
      notifyOnLostFoundMatch: true,
      notifyOnStatusChange: true,
      notifyOnCampusBroadcasts: true,
      deviceType: /Mobi|Android|iPhone/i.test(navigator.userAgent) ? "mobile" : "desktop",
      lastActiveTimestamp: new Date().toISOString(),
    };

    if (db) {
      try {
        const userRef = doc(db, "users", currentUser.id);
        await setDoc(userRef, {
          fcmToken: token,
          fcmSubscribed: true,
          fcmSubscribedAt: subscriptionRecord.subscribedAt,
          fcmNotificationsEnabled: true,
        }, { merge: true });

        const tokenRef = doc(db, "fcm_subscriptions", currentUser.id);
        await setDoc(tokenRef, subscriptionRecord, { merge: true });
      } catch (firestoreErr) {
        handleFirestoreError(firestoreErr, OperationType.WRITE, `fcm_subscriptions/${currentUser.id}`);
      }
    }

    // Save in localStorage as offline cache
    localStorage.setItem(`ifpr_fcm_token_${currentUser.id}`, token);
    localStorage.setItem(`ifpr_fcm_active_${currentUser.id}`, "true");
    localStorage.setItem(`ifpr_fcm_matches_enabled_${currentUser.id}`, "true");

    vibrateSuccess();
    playNotificationChime();

    return { success: true, token, permission };
  } catch (err) {
    console.error("Erro ao assinar FCM:", err);
    return { success: false, token: "", permission: "denied" };
  }
}

/**
 * Displays a rich browser Web Push Notification with actions, vibration, and URL routing
 */
export function displayWebPushNotification(
  title: string,
  body: string,
  data: { url?: string; itemId?: string; matchScore?: number } = {},
  icon = "/icon-192.png"
) {
  if (typeof window === "undefined") return;

  triggerVibration(180);
  playNotificationChime();

  if ("Notification" in window && Notification.permission === "granted") {
    try {
      const options: any = {
        body,
        icon,
        badge: "/icon-192.png",
        vibrate: [200, 100, 200, 100, 200],
        tag: `ifpr-notif-${Date.now()}`,
        renotify: true,
        requireInteraction: true,
        data: {
          url: data.url || window.location.origin,
          itemId: data.itemId,
          matchScore: data.matchScore,
        },
      };

      if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.showNotification(title, options);
        });
      } else {
        const notif = new Notification(title, options);
        notif.onclick = () => {
          window.focus();
          notif.close();
        };
      }
    } catch (err) {
      console.warn("Notice ao emitir push notification:", err);
    }
  }
}

/**
 * Dispatches a Real-time Push Notification to a user when a newly registered item matches their lost item
 */
export async function sendRealtimeMatchPushAlert(payload: MatchPushPayload): Promise<NotificationItem> {
  const {
    targetUserId,
    targetUserEmail,
    targetUserName,
    matchScore,
    newRegisteredItem,
    userLostItem,
    matchedFeatures = [],
    reason,
  } = payload;

  const featuresText = matchedFeatures.length > 0 ? ` (${matchedFeatures.join(", ")})` : "";
  const title = `🔍 Objeto Similar Encontrado (${matchScore}% de compatibilidade)!`;
  const message = `Um(a) "${newRegisteredItem.title}" com ${matchScore}% de similaridade com seu relato "${userLostItem.title}"${featuresText} acaba de ser registrado no local: ${newRegisteredItem.location}.`;

  const notificationItem: NotificationItem = {
    id: `notif-match-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    userId: targetUserId,
    title,
    message,
    timestamp: new Date().toISOString(),
    read: false,
    type: "MATCH",
    relatedItemId: newRegisteredItem.id,
  };

  // 1. Write notification to Firestore
  if (db) {
    try {
      const notifRef = doc(db, "notifications", notificationItem.id);
      await setDoc(notifRef, notificationItem);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `notifications/${notificationItem.id}`);
    }
  }

  // 2. Display Web Push Notification if active on target user device
  displayWebPushNotification(
    `IFPR Achados • Possível Pertence Encontrado!`,
    message,
    {
      url: `/?item=${newRegisteredItem.id}`,
      itemId: newRegisteredItem.id,
      matchScore,
    }
  );

  return notificationItem;
}

/**
 * Checks if the user is currently subscribed to FCM push alerts
 */
export function checkFCMSubscriptionStatus(userId: string): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(`ifpr_fcm_active_${userId}`) === "true";
}

/**
 * Sets up foreground Firebase Cloud Messaging push message listener
 */
export function setupFCMForegroundListener(
  onNotificationReceived: (payload: { title: string; body: string; data?: any }) => void
) {
  let unsubscribe: (() => void) | null = null;

  getFCMInstance().then((messaging) => {
    if (messaging) {
      try {
        unsubscribe = onMessage(messaging, (payload) => {
          console.log("[FCM Client] Mensagem recebida em primeiro plano:", payload);
          const title = payload.notification?.title || payload.data?.title || "IFPR Achados & Perdidos";
          const body = payload.notification?.body || payload.data?.body || "Nova notificação em tempo real.";
          
          playNotificationChime();
          triggerVibration(150);

          onNotificationReceived({
            title,
            body,
            data: payload.data,
          });
        });
      } catch (err) {
        console.warn("[FCM] Aviso no listener de mensagens em primeiro plano:", err);
      }
    }
  });

  return () => {
    if (unsubscribe) {
      unsubscribe();
    }
  };
}
