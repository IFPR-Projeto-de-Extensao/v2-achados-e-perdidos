import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import type { Analytics } from 'firebase/analytics';
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

let secondaryServicesInitPromise: Promise<void> | null = null;
let analyticsInitAttempted = false;
let analyticsLoadFailed = false;
let logFbEventFn: ((analyticsInstance: Analytics, eventName: string, eventParams?: Record<string, any>) => void) | null = null;

export function hasValidMeasurementId(id: unknown): id is string {
  return typeof id === 'string' && /^G-[A-Za-z0-9]+$/.test(id.trim());
}

/**
 * Checks whether Firebase Analytics should be initialized.
 * Strictly requires VITE_ENABLE_FIREBASE_ANALYTICS to be explicitly "true".
 * Defaults to false so external GTM/Analytics telemetry is strictly optional
 * and never triggers getAnalytics(app) or googletagmanager.com requests unless explicitly enabled.
 */
export function isFirebaseAnalyticsEnabled(): boolean {
  try {
    if (typeof import.meta !== "undefined" && import.meta.env?.VITE_ENABLE_FIREBASE_ANALYTICS === "true") {
      return true;
    }
    if (typeof process !== "undefined" && process.env?.VITE_ENABLE_FIREBASE_ANALYTICS === "true") {
      return true;
    }
  } catch (_) {}
  return false;
}

export function getFirebaseAnalyticsState() {
  return {
    enabled: isFirebaseAnalyticsEnabled(),
    initialized: Boolean(firebaseAnalytics),
    attempted: analyticsInitAttempted,
    failed: analyticsLoadFailed,
  };
}

export function resetFirebaseAnalyticsStateForTesting() {
  firebaseAnalytics = null;
  logFbEventFn = null;
  secondaryServicesInitPromise = null;
  analyticsInitAttempted = false;
  analyticsLoadFailed = false;
}

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
 * Strictly singleton per page load and opt-in for external telemetry:
 * - When VITE_ENABLE_FIREBASE_ANALYTICS !== "true", getAnalytics(app) is never invoked.
 * - When enabled, initializes strictly once with offline guard and non-blocking error handling.
 */
export async function initFirebaseSecondaryServices(): Promise<void> {
  if (typeof window === 'undefined') return;

  if (secondaryServicesInitPromise) {
    return secondaryServicesInitPromise;
  }

  secondaryServicesInitPromise = (async () => {
    // 1. Firebase Analytics (strictly optional via VITE_ENABLE_FIREBASE_ANALYTICS="true")
    if (!analyticsInitAttempted && !firebaseAnalytics && !analyticsLoadFailed) {
      analyticsInitAttempted = true;

      if (!isFirebaseAnalyticsEnabled()) {
        console.debug("[Firebase] Analytics desabilitado por configuração (VITE_ENABLE_FIREBASE_ANALYTICS !== 'true').");
      } else {
        const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
        const measurementId = (firebaseConfig as any)?.measurementId;

        if (isOffline) {
          console.debug("[Firebase] Analytics adiado: navegador offline. Serviços essenciais seguem normalmente.");
        } else if (!hasValidMeasurementId(measurementId)) {
          console.debug("[Firebase] Analytics não inicializado: measurementId ausente ou inválido.");
        } else {
          try {
            const analyticsModule = await import('firebase/analytics');
            const supported = await analyticsModule.isSupported();
            if (supported && !firebaseAnalytics && !analyticsLoadFailed) {
              firebaseAnalytics = analyticsModule.getAnalytics(app);
              logFbEventFn = analyticsModule.logEvent;
              console.log("[Firebase] Analytics inicializado de forma assíncrona.");
            }
          } catch (analyticsErr) {
            analyticsLoadFailed = true;
            firebaseAnalytics = null;
            logFbEventFn = null;
            console.warn("[Firebase] Aviso ao inicializar Analytics (serviço secundário não essencial):", analyticsErr);
          }
        }
      }
    }

    // 2. Firebase Performance Monitoring (strictly opt-in via VITE_ENABLE_FIREBASE_PERF="true")
    try {
      if (isFirebasePerformanceEnabled() && !firebasePerformance) {
        firebasePerformance = getPerformance(app);
        console.log("[Firebase] Performance Monitoring inicializado de forma assíncrona.");
      }
    } catch (_) {
      // Non-blocking
    }
  })();

  return secondaryServicesInitPromise;
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
  if (!firebaseAnalytics || !logFbEventFn || analyticsLoadFailed) {
    return;
  }
  try {
    logFbEventFn(firebaseAnalytics, eventName, eventParams);
  } catch (err) {
    analyticsLoadFailed = true;
    console.warn("Erro ao enviar evento para Firebase Analytics:", err);
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

