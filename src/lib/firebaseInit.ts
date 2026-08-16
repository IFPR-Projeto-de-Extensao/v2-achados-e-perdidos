/**
 * Firebase Initializer with ready promise - Localiza+ IFPR Campus Ivaiporã
 * Guarantees that db and auth instances are exported and ready, avoiding any TDZ
 * or premature initialization conflicts.
 */

import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth, GoogleAuthProvider } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  Firestore,
} from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let googleProviderInstance: GoogleAuthProvider | null = null;

let resolveReady: () => void;
export const firebaseReadyPromise: Promise<void> = new Promise((resolve) => {
  resolveReady = resolve;
});

export function getFirebaseApp(): FirebaseApp {
  if (!appInstance) {
    appInstance = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  }
  return appInstance;
}

export function getFirebaseAuth(): Auth {
  if (!authInstance) {
    authInstance = getAuth(getFirebaseApp());
  }
  return authInstance;
}

export function getFirebaseDb(): Firestore {
  if (!dbInstance) {
    const dbId =
      (firebaseConfig as any).firestoreDatabaseId ||
      "ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1";
    const app = getFirebaseApp();

    try {
      // Configure multi-tab cache manager to avoid IndexedDB lock or closing conflicts across iframe/tabs
      dbInstance = initializeFirestore(
        app,
        {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager(),
          }),
        },
        dbId
      );
    } catch (err: any) {
      try {
        dbInstance = initializeFirestore(
          app,
          {
            localCache: memoryLocalCache(),
          },
          dbId
        );
      } catch {
        dbInstance = getFirestore(app, dbId);
      }
    }
  }
  return dbInstance;
}

export function getGoogleAuthProvider(): GoogleAuthProvider {
  if (!googleProviderInstance) {
    googleProviderInstance = new GoogleAuthProvider();
    googleProviderInstance.addScope("https://mail.google.com/");
    googleProviderInstance.addScope("https://www.googleapis.com/auth/gmail.send");
    googleProviderInstance.addScope("https://www.googleapis.com/auth/gmail.readonly");
  }
  return googleProviderInstance;
}

// Initialize immediately in a safe manner and resolve the readiness promise
try {
  getFirebaseApp();
  getFirebaseAuth();
  getFirebaseDb();
  getGoogleAuthProvider();
  resolveReady!();
} catch (e) {
  console.warn("[FirebaseInit] Inicialização diferida:", e);
  resolveReady!();
}

export { appInstance as app, authInstance as auth, dbInstance as db };
