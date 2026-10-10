import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Cache only the public application shell, never API responses or credentials.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(registration => {
    const update = () => { if (navigator.onLine && document.visibilityState === 'visible') void registration.update().catch(() => {}); };
    window.addEventListener('online', update);
    document.addEventListener('visibilitychange', update);
  }).catch(() => {});
}
