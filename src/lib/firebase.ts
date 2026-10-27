import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getAnalytics, isSupported as isAnalyticsSupported, logEvent as logFbEvent, Analytics } from 'firebase/analytics';
import { getPerformance, FirebasePerformance, trace } from 'firebase/performance';
import firebaseConfig from '../../firebase-applet-config.json';
import { getFirebaseApp, getFirebaseAuth, getFirebaseDb, getGoogleAuthProvider, firebaseReadyPromise } from './firebaseInit';

export const app = getFirebaseApp();
export const db = getFirebaseDb();
export const auth = getFirebaseAuth();
export const googleProvider = getGoogleAuthProvider();
export { firebaseReadyPromise };

export let firebaseAnalytics: Analytics | null = null;
export let firebasePerformance: FirebasePerformance | null = null;

// Validate Connection to Firestore on boot
async function testConnection() {
  try {
    if (typeof window !== "undefined" && db) {
      await getDocFromServer(doc(db, 'test', 'connection'));
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Please check your Firebase configuration or network status.");
    }
  }
}
testConnection();

/**
 * Checks whether Firebase Performance Monitoring should be initialized.
 * Strictly requires VITE_ENABLE_FIREBASE_PERF to be explicitly "true".
 * Defaults to false to prevent unintended background telemetry and DNS errors.
 */
export function isFirebasePerformanceEnabled(): boolean {
  try {
    if (typeof import.meta !== "undefined" && import.meta.env?.VITE_ENABLE_FIREBASE_PERF === "true") {
      return true;
    }
    if (typeof process !== "undefined" && process.env?.VITE_ENABLE_FIREBASE_PERF === "true") {
      return true;
    }
  } catch (_) {}
  return false;
}

/**
 * Asynchronously initializes secondary Firebase services (Analytics and Performance)
 * without blocking the critical render path or main thread during initial DOM load.
 */
export async function initFirebaseSecondaryServices() {
  if (typeof window === 'undefined') return;

  try {
    const supported = await isAnalyticsSupported();
    if (supported && !firebaseAnalytics) {
      // Monitor DOM injection of the Firebase Analytics gtag script to attach a non-blocking error handler
      if (typeof document !== "undefined") {
        try {
          const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
              for (const node of Array.from(mutation.addedNodes)) {
                if (
                  node.nodeName === "SCRIPT" &&
                  (node as HTMLScriptElement).src &&
                  (node as HTMLScriptElement).src.includes("googletagmanager.com/gtag/js")
                ) {
                  const scriptEl = node as HTMLScriptElement;
                  scriptEl.addEventListener("error", () => {
                    console.warn(
                      `[Firebase Analytics Notice] Falha na resolução de rede/DNS para Google Tag Manager (${scriptEl.src}). A aplicação e os serviços essenciais continuam operando normalmente sem telemetria externa.`
                    );
                  });
                  observer.disconnect();
                  return;
                }
              }
            }
          });
          observer.observe(document.head || document.documentElement, { childList: true, subtree: true });
          setTimeout(() => {
            try { observer.disconnect(); } catch (_) {}
          }, 5000);
        } catch (_) {}
      }

      firebaseAnalytics = getAnalytics(app);
      console.log("[Firebase] Analytics inicializado de forma assíncrona.");
    }
  } catch (analyticsErr) {
    console.warn("[Firebase] Aviso ao inicializar Analytics (serviço secundário não essencial):", analyticsErr);
  }

  try {
    if (isFirebasePerformanceEnabled() && !firebasePerformance) {
      firebasePerformance = getPerformance(app);
      console.log("[Firebase] Performance Monitoring inicializado de forma assíncrona.");
    }
  } catch (_) {
    // Non-blocking
  }
}

export function traceFirebasePerformance(metricName: string) {
  if (firebasePerformance) {
    try {
      const t = trace(firebasePerformance, metricName);
      t.start();
      return t;
    } catch (e) {
      console.warn("Aviso na métrica de performance:", e);
    }
  }
  return null;
}

export function logFirebaseEvent(eventName: string, eventParams?: Record<string, any>) {
  if (firebaseAnalytics) {
    try {
      logFbEvent(firebaseAnalytics, eventName, eventParams);
    } catch (err) {
      console.warn("Erro ao enviar evento para Firebase Analytics:", err);
    }
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const rawMsg = error instanceof Error ? error.message : String(error);

  // Filter out transient browser lifecycle / offline / closing signals to prevent unhandled UI disruption
  if (
    rawMsg.includes("closing") ||
    rawMsg.includes("closed") ||
    rawMsg.includes("hidden") ||
    rawMsg.includes("the client is offline") ||
    rawMsg.includes("AbortError")
  ) {
    console.debug(`[Firestore Lifecycle Notice] ${operationType} on ${path}: ${rawMsg}`);
    return;
  }

  const errInfo: FirestoreErrorInfo = {
    error: rawMsg,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.warn('Firestore Notice: ', JSON.stringify(errInfo));
}

