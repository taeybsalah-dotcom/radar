import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { AuthProvider } from './context/AuthContext.tsx'
import { getActiveTenantConfig } from './config/tenant.ts'
import './index.css'

// 🎨 Apply Dynamic White-Label Brand Title, Meta & Favicon
if (typeof document !== 'undefined') {
  const tenant = getActiveTenantConfig();
  if (tenant.brandName) {
    document.title = tenant.brandName;
  }
  if (tenant.logoUrl) {
    const faviconLink = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
    if (faviconLink) {
      faviconLink.href = tenant.logoUrl;
    }
    const appleIcon = document.querySelector("link[rel*='apple-touch-icon']") as HTMLLinkElement;
    if (appleIcon) {
      appleIcon.href = tenant.logoUrl;
    }
  }
}

// 🛡️ Radar Deployment Auto-Recovery: Handle stale chunk hashes smoothly
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    console.warn('[Platform Engine] New platform deployment detected or chunk preload failed. Auto-reloading to fetch newest version...', event);
    const key = 'radar_last_preload_reload';
    const lastReload = sessionStorage.getItem(key);
    const now = Date.now();
    // Allow auto-reload once every 10 seconds to prevent any loop
    if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
      sessionStorage.setItem(key, String(now));
      window.location.reload();
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)


