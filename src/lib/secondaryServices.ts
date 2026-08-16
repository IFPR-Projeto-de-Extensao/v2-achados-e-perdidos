/**
 * Secondary non-blocking services initialization
 * Ensures the DOM mount and React render complete first before loading analytics, performance, and monitoring.
 */

import { initFirebaseSecondaryServices } from "./firebase";
import { initGoogleAnalytics } from "./analytics";
import { registerUptimeServiceWorker } from "./uptimeManager";

export async function initSecondaryServices() {
  if (typeof window === 'undefined') return;

  // Run secondary initializations in microtasks or idle callbacks to keep main thread free
  try {
    initGoogleAnalytics();
  } catch (e) {
    console.warn('[Services] Google Analytics init warning:', e);
  }

  try {
    await initFirebaseSecondaryServices();
  } catch (e) {
    console.warn('[Services] Firebase Secondary init warning:', e);
  }

  try {
    registerUptimeServiceWorker();
  } catch (e) {
    console.warn('[Services] Uptime Monitor init warning:', e);
  }
}
