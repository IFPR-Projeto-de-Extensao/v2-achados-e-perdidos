/**
 * Universal Analytics & Monitoring Service
 * Integrates Google Analytics (gtag.js), Firebase Analytics, and Backend Monitoring
 */

import { logFirebaseEvent } from './firebase';

declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
  }
}

const defaultMeasurementId =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GA_MEASUREMENT_ID) ||
  (typeof process !== 'undefined' && process.env?.VITE_GA_MEASUREMENT_ID) ||
  '';

let gtagLoadFailed = false;

export function resetGoogleAnalyticsStateForTesting() {
  gtagLoadFailed = false;
}

// Helper to check whether Google Analytics / GTM script is already present in DOM
export function isGoogleAnalyticsScriptPresent(): boolean {
  if (typeof document === 'undefined') return false;
  return Boolean(
    (typeof document.getElementById === 'function' && document.getElementById('ga-gtag-script')) ||
    (typeof document.querySelector === 'function' && document.querySelector('script[src*="googletagmanager.com/gtag/js"]'))
  );
}

// Initialize Google Analytics Global Tracking
export function initGoogleAnalytics(measurementId = defaultMeasurementId) {
  if (
    typeof window === 'undefined' ||
    !measurementId ||
    typeof measurementId !== 'string' ||
    !measurementId.trim() ||
    measurementId.trim() === 'undefined' ||
    measurementId.trim() === 'null' ||
    measurementId.trim() === 'G-'
  ) {
    return;
  }

  // Do not attempt external GTM injection when offline or after a prior load failure (no infinite retries)
  if (gtagLoadFailed) {
    return;
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    console.debug('[Analytics Notice] Navegador offline: carregamento do Google Analytics adiado sem erro.');
    return;
  }

  const cleanId = measurementId.trim();

  // Deduplication check: prevent multiple injections if gtag.js is already in DOM (e.g. injected by Firebase SDK)
  if (isGoogleAnalyticsScriptPresent()) {
    console.debug(`[Analytics Notice] Script do Google Analytics já presente no DOM. Evitando injeção duplicada para ${cleanId}.`);
    return;
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    try {
      window.dataLayer.push(arguments);
    } catch (_) {}
  };
  window.gtag('js', new Date());
  window.gtag('config', cleanId, { send_page_view: true });

  const script = document.createElement('script');
  script.id = 'ga-gtag-script';
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${cleanId}`;
  script.onerror = () => {
    gtagLoadFailed = true;
    console.warn(`[Analytics Notice] Não foi possível carregar o script do Google Analytics (${cleanId}). O aplicativo continuará funcionando normalmente.`);
  };
  document.head.appendChild(script);

  console.log(`Google Analytics (${cleanId}) inicializado.`);
}

// Track Custom Event across Google Analytics, Firebase, and Backend API
export function trackCustomEvent(eventName: string, params: Record<string, any> = {}) {
  const timestamp = new Date().toISOString();

  // 1. Google Analytics Event
  if (!gtagLoadFailed && typeof window !== 'undefined' && typeof window.gtag === 'function') {
    try {
      window.gtag('event', eventName, params);
    } catch (e) {
      console.warn("Erro ao registrar evento no Google Analytics:", e);
    }
  }

  // 2. Firebase Analytics Event
  try {
    logFirebaseEvent(eventName, params);
  } catch (e) {
    console.warn("Erro ao registrar evento no Firebase Analytics:", e);
  }

  // 3. Backend Express Server Analytics Endpoint (skipped cleanly when offline)
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (!isOffline && typeof window !== 'undefined' && typeof fetch === 'function') {
    try {
      fetch('/api/analytics/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventName,
          params,
          timestamp,
          url: window.location?.href || '',
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        }),
      })
        .then((res) => {
          if (!res.ok) {
            // Endpoint not available on current hosting provider, ignore silently
          }
        })
        .catch(() => {
          // Non-blocking background analytics ping failure
        });
    } catch (_) {}
  }
}

// Track Pageview
export function trackPageView(pageName: string) {
  trackCustomEvent('page_view', { page_title: pageName, page_location: typeof window !== 'undefined' ? window.location.href : '' });
}
