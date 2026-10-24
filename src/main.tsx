import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { getActiveTenantConfig } from './config/tenant.ts';
import { ResellerSuspendedScreen } from './components/ResellerSuspendedScreen.tsx';
import { getSupabaseClient } from './lib/supabase.ts';
import './index.css';

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
  const [isSuspended, setIsSuspended] = useState(false);
  const [suspensionReason, setSuspensionReason] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    // 1. Initial Check on platform_system_config
    (supabase as any)
      .from('platform_system_config')
      .select('platform_status, suspension_reason')
      .eq('key', 'platform_status')
      .maybeSingle()
      .then(({ data, error }: any) => {
        if (!error && data) {
          if (data.platform_status === 'suspended') {
            setIsSuspended(true);
            setSuspensionReason(data.suspension_reason || null);
          }
        }
      });

    // 2. Realtime listener: triggers instantly when Master Control sends Kill Switch to this database
    try {
      const channel = supabase
        .channel('instance_platform_killswitch')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'platform_system_config',
            filter: 'key=eq.platform_status',
          },
          (payload: any) => {
            const updated = payload.new;
            if (updated?.platform_status === 'suspended') {
              setIsSuspended(true);
              setSuspensionReason(updated.suspension_reason || null);
            } else if (updated?.platform_status === 'active') {
              setIsSuspended(false);
              setSuspensionReason(null);
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } catch (err) {
      console.warn('[RootApp] Realtime killswitch receiver error:', err);
    }
  }, []);

  if (isSuspended) {
    return <ResellerSuspendedScreen reason={suspensionReason} />;
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
