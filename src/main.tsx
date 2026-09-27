import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initializeAppServices } from './lib/appInit';
import './index.css';

// Suppress benign Vite development/HMR websocket notices in sandboxed preview environments
if (import.meta.env.DEV && typeof window !== 'undefined' && window.console) {
  const methods = ['error', 'warn', 'info', 'debug', 'log'] as const;
  for (let i = 0; i < methods.length; i++) {
    const m = methods[i];
    const orig = window.console[m];
    if (typeof orig === 'function') {
      window.console[m] = function (...args: any[]) {
        const first = args[0];
        if (typeof first === 'string' && (first.includes('[vite]') || first.includes('[dev]'))) {
          return;
        }
        return orig.apply(window.console, args);
      };
    }
  }

  window.addEventListener('error', (event) => {
    if (
      event &&
      ((typeof event.message === 'string' && (event.message.includes('[vite]') || event.message.includes('[dev]'))) ||
        (typeof event.filename === 'string' && event.filename.includes('/@vite/client')))
    ) {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    }
  }, true);
}

// Ensure the root DOM element exists and mount React
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

  // Asynchronously initialize background application services
  if (typeof window !== 'undefined') {
    const triggerInit = () => {
      try {
        initializeAppServices().catch((err) => console.warn('[Main] Aviso ao inicializar appInit:', err));
      } catch (err) {
        console.warn('[Main] Aviso ao disparar appInit:', err);
      }
    };

    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(triggerInit, { timeout: 1000 });
    } else {
      setTimeout(triggerInit, 100);
    }
  }
}

