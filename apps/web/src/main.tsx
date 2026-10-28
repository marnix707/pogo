import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/700.css';
import { App } from './App';
import { AdminApp, isAdminSite } from './admin/AdminApp';
import { initTheme } from './lib/settings';
import './index.css';

initTheme();

// The app is portrait only: lock it where the browser allows it (installed app / fullscreen); the manifest
// says portrait too, and a phone held sideways in a browser tab gets the "turn your phone" notice (App).
try {
  void (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })
    .lock?.('portrait')
    ?.catch(() => {});
} catch {
  // Not supported (iOS Safari, desktop): the notice covers it.
}

// Installable app + instant shell. Production only: in dev a service worker would fight Vite's HMR.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Unsupported or blocked (private mode): the app works fine without it.
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isAdminSite() ? <AdminApp /> : <App />}</StrictMode>,
);
