import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initializeAppServices } from './lib/appInit';
import './index.css';

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

