/**
 * Secondary non-blocking services initialization
 * Delegates to the single canonical initializeAppServices() pipeline in appInit.ts
 * so Analytics, Performance, and the SW Uptime Watchdog never execute twice or out of order.
 */

import { initializeAppServices } from "./appInit";

export async function initSecondaryServices(): Promise<void> {
  if (typeof window === 'undefined') return;
  return initializeAppServices();
}
