import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// Ensure root DOM mounting happens safely
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>
  );
}

// Deferred Service Worker registration after initial DOM hydration and load event
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    setTimeout(async () => {
      try {
        const { registerSW } = await import('virtual:pwa-register');
        registerSW({
          immediate: false,
          onNeedRefresh() {
            console.log('[PWA IFPR] Nova versão da aplicação disponível.');
          },
          onOfflineReady() {
            console.log('[PWA IFPR] Aplicação pronta para operação offline.');
          },
        });
      } catch (_) {
        try {
          const reg = await navigator.serviceWorker.register('/sw.js');
          console.log('[SW IFPR] Service Worker ativo:', reg.scope);
        } catch (swErr) {
          console.warn('[SW IFPR] Registro do Service Worker adiado:', swErr);
        }
      }
    }, 120);
  });
}
