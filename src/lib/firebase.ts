import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
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
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
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
