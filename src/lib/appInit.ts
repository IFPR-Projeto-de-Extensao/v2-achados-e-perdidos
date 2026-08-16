/**
 * Asynchronous Application Initializer - Localiza+ IFPR Campus Ivaiporã
 * Encapsulates Firebase secondary services and diagnostic monitors.
 * vite-plugin-pwa handles Service Worker auto-registration seamlessly via 'injectRegister: auto'.
 * Imported dynamically only after React root has mounted to prevent circular initialization and TDZ.
 */

import { initFirebaseSecondaryServices } from "./firebase";
import { initGoogleAnalytics } from "./analytics";
import { registerUptimeServiceWorker } from "./uptimeManager";

export async function initializeAppServices(): Promise<void> {
  if (typeof window === "undefined") return;

  console.log("[AppInit] Inicializando serviços em segundo plano após montagem do DOM...");

  // 1. Google Analytics
  try {
    initGoogleAnalytics();
  } catch (err) {
    console.warn("[AppInit] Google Analytics init notice:", err);
  }

  // 2. Firebase Secondary (Analytics & Performance Monitoring)
  try {
    await initFirebaseSecondaryServices();
  } catch (err) {
    console.warn("[AppInit] Firebase Secondary services init notice:", err);
  }

  // 3. Service Worker Heartbeat Watchdog (attaches to active SW controller without registering anew)
  try {
    registerUptimeServiceWorker((status, ping) => {
      console.log(`[AppInit] SW Uptime Watchdog status: ${status}, last ping: ${ping}`);
    });
  } catch (err) {
    console.warn("[AppInit] SW Watchdog notice:", err);
  }
}
