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
 * Asynchronously initializes secondary Firebase services (Analytics and Performance)
 * without blocking the critical render path or main thread during initial DOM load.
 */
export async function initFirebaseSecondaryServices() {
  if (typeof window === 'undefined') return;

  try {
    const supported = await isAnalyticsSupported();
    if (supported && !firebaseAnalytics) {
      firebaseAnalytics = getAnalytics(app);
      console.log("[Firebase] Analytics inicializado de forma assíncrona.");
    }
  } catch (_) {
    // Non-blocking in dev or restricted domains
  }

  try {
    if (!firebasePerformance) {
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

