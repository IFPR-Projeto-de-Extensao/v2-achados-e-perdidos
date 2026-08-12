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

const defaultMeasurementId = typeof import.meta !== 'undefined' ? ((import.meta as any).env?.VITE_GA_MEASUREMENT_ID || '') : '';

// Initialize Google Analytics Global Tracking
export function initGoogleAnalytics(measurementId = defaultMeasurementId) {
  if (typeof window === 'undefined' || !measurementId) return;

  // Check if gtag script is already present
  if (!document.getElementById('ga-gtag-script')) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', measurementId, { send_page_view: true });

    const script = document.createElement('script');
    script.id = 'ga-gtag-script';
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    script.onerror = () => {
      console.warn(`[Analytics Notice] Não foi possível carregar o script do Google Analytics (${measurementId}). O aplicativo continuará funcionando normalmente.`);
    };
    document.head.appendChild(script);

    console.log(`Google Analytics (${measurementId}) inicializado.`);
  }
}

// Track Custom Event across Google Analytics, Firebase, and Backend API
export function trackCustomEvent(eventName: string, params: Record<string, any> = {}) {
  const timestamp = new Date().toISOString();

  // 1. Google Analytics Event
  if (typeof window !== 'undefined' && window.gtag) {
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

  // 3. Backend Express Server Analytics Endpoint
  if (typeof window !== 'undefined') {
    fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventName,
        params,
        timestamp,
        url: window.location.href,
        userAgent: navigator.userAgent,
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
  }
}

// Track Pageview
export function trackPageView(pageName: string) {
  trackCustomEvent('page_view', { page_title: pageName, page_location: typeof window !== 'undefined' ? window.location.href : '' });
}
