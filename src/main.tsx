import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { getActiveTenantConfig, applyTenantBranding, subscribeTenantBranding, WhiteLabelTenantConfig } from './config/tenant.ts';
import { ResellerSuspendedScreen } from './components/ResellerSuspendedScreen.tsx';
import { getSupabaseClient } from './lib/supabase.ts';
import './index.css';

// 🛡️ Deployment Auto-Recovery: Handle stale chunk hashes smoothly
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    console.warn('[Platform Engine] New platform deployment detected. Auto-reloading...', event);
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
  const [tenantConfig, setTenantConfig] = useState<WhiteLabelTenantConfig>(getActiveTenantConfig());

  useEffect(() => {
    // 🔔 Subscribe to live branding updates so React re-renders cleanly
    const unsubscribeBranding = subscribeTenantBranding((newConfig) => {
      setTenantConfig({ ...newConfig });
    });

    const supabase = getSupabaseClient();
    if (!supabase) return unsubscribeBranding;

    // 1. Fetch Dynamic Tenant Branding via domain RPC (Al-Athar Core Multi-Tenant Engine)
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    (supabase as any)
      .rpc('get_active_tenant_by_domain', { p_host: host })
      .then(({ data, error }: any) => {
        if (!error && data && (data.brand_name || data.name)) {
          applyTenantBranding(data);
        }
      })
      .catch((err: any) => {
        console.warn('[Tenant Engine] Could not fetch dynamic branding for domain:', host, err);
      });

    // 2. Initial Check on platform_system_config
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

    // 3. Realtime Listeners: Kill Switch + Live Branding Updates
    try {
      const channel = supabase
        .channel('instance_realtime_sync')
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
        unsubscribeBranding();
        supabase.removeChannel(channel);
      };
    } catch (err) {
      console.warn('[RootApp] Realtime listener error:', err);
      return unsubscribeBranding;
    }
  }, []);

  if (isSuspended) {
    return <ResellerSuspendedScreen reason={suspensionReason} />;
  }

  return (
    <ErrorBoundary>
      <AuthProvider>
        <App key={tenantConfig.brandName} />
      </AuthProvider>
    </ErrorBoundary>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootApp />
  </React.StrictMode>,
);
