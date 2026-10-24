import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { initActiveTenant, getCurrentTenant } from './config/dynamicTenant.ts';
import { ResellerSuspendedScreen } from './components/ResellerSuspendedScreen.tsx';
import { getSupabaseClient } from './lib/supabase.ts';
import './index.css';

// 🛡️ Deployment Auto-Recovery: Handle stale chunk hashes smoothly
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    console.warn('[Platform Engine] New platform deployment detected or chunk preload failed. Auto-reloading...', event);
    const key = 'radar_last_preload_reload';
    const lastReload = sessionStorage.getItem(key);
    const now = Date.now();
    if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
      sessionStorage.setItem(key, String(now));
      window.location.reload();
    }
  });
}

const RootApp: React.FC = () => {
  const [ready, setReady] = useState(false);
  const [isSuspended, setIsSuspended] = useState(false);

  useEffect(() => {
    initActiveTenant().then((tenant) => {
      // 1. Dynamic Favicon & Meta setup
      if (typeof document !== 'undefined') {
        document.title = tenant.name;
        if (tenant.brandLogoUrl) {
          const faviconLink = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
          if (faviconLink) faviconLink.href = tenant.brandLogoUrl;
          const appleIcon = document.querySelector("link[rel*='apple-touch-icon']") as HTMLLinkElement;
          if (appleIcon) appleIcon.href = tenant.brandLogoUrl;
        }
      }

      // 2. Kill Switch check
      if (!tenant.isMasterRadar && tenant.platformStatus === 'suspended') {
        setIsSuspended(true);
      }

      // 3. Realtime Kill Switch listener on Master database
      if (!tenant.isMasterRadar) {
        try {
          const masterClient = getSupabaseClient();
          if (masterClient) {
            masterClient
              .channel(`reseller_killswitch_${tenant.slug}`)
              .on(
                'postgres_changes',
                {
                  event: 'UPDATE',
                  schema: 'public',
                  table: 'resellers',
                  filter: `slug=eq.${tenant.slug}`,
                },
                (payload: any) => {
                  const updated = payload.new;
                  if (updated?.platform_status === 'suspended') {
                    setIsSuspended(true);
                  } else if (updated?.platform_status === 'active') {
                    setIsSuspended(false);
                  }
                }
              )
              .subscribe();
          }
        } catch (e) {
          console.warn('[RootApp] Realtime killswitch listener init warning:', e);
        }
      }

      setReady(true);
    });
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (isSuspended) {
    return <ResellerSuspendedScreen />;
  }

  return (
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootApp />
  </React.StrictMode>,
);
