/**
 * Asynchronous Application Initializer - Localiza+ IFPR Campus Ivaiporã
 * Encapsulates Firebase secondary services and diagnostic monitors.
 * vite-plugin-pwa handles Service Worker auto-registration seamlessly via 'injectRegister: auto'.
 * Imported dynamically only after React root has mounted to prevent circular initialization and TDZ.
 */

import { initFirebaseSecondaryServices, isFirebaseAnalyticsEnabled } from "./firebase";
import { initGoogleAnalytics } from "./analytics";
import { registerUptimeServiceWorker } from "./uptimeManager";

let appServicesInitPromise: Promise<void> | null = null;

export function resetAppInitForTesting(): void {
  appServicesInitPromise = null;
}

export async function initializeAppServices(): Promise<void> {
  if (typeof window === "undefined") return;

  if (appServicesInitPromise) {
    return appServicesInitPromise;
  }

  appServicesInitPromise = (async () => {
    console.log("[AppInit] Inicializando serviços em segundo plano após montagem do DOM...");

    // 1. Firebase Secondary Services (Analytics & Performance Monitoring — both strictly opt-in)
    try {
      await initFirebaseSecondaryServices();
    } catch (err) {
      console.warn("[AppInit] Firebase Secondary services init notice:", err);
    }

    // 2. Google Analytics (standalone fallback only when external Analytics is explicitly enabled)
    try {
      if (isFirebaseAnalyticsEnabled()) {
        initGoogleAnalytics();
      }
    } catch (err) {
      console.warn("[AppInit] Google Analytics init notice:", err);
    }

    // 3. Service Worker Heartbeat Watchdog (attaches once to active SW controller without registering anew)
    try {
      registerUptimeServiceWorker((status, ping) => {
        console.log(`[AppInit] SW Uptime Watchdog status: ${status}, last ping: ${ping}`);
      });
    } catch (err) {
      console.warn("[AppInit] SW Watchdog notice:", err);
    }
  })();

  return appServicesInitPromise;
}
