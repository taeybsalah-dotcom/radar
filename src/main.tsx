import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { getActiveTenantConfig, applyTenantBranding } from './config/tenant.ts';
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

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    // 1. Fetch Dynamic Tenant Branding via domain RPC (Al-Athar Core Multi-Tenant Engine)
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    (supabase as any)
      .rpc('get_active_tenant_by_domain', { p_host: host })
      .then(({ data }: any) => {
        if (data && data.brand_name) {
          applyTenantBranding(data);
        } else {
          // Fallback to legacy tenant_branding table
          (supabase as any)
            .from('tenant_branding')
            .select('*')
            .eq('key', 'default')
            .maybeSingle()
            .then(({ data: fallbackData }: any) => {
              if (fallbackData) applyTenantBranding(fallbackData);
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        // Fallback to legacy tenant_branding table if RPC fails or not yet applied
        (supabase as any)
          .from('tenant_branding')
          .select('*')
          .eq('key', 'default')
          .maybeSingle()
          .then(({ data: fallbackData }: any) => {
            if (fallbackData) applyTenantBranding(fallbackData);
          })
          .catch(() => {});
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
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'tenant_branding',
            filter: 'key=eq.default',
          },
          (payload: any) => {
            if (payload.new) {
              applyTenantBranding(payload.new);
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } catch (err) {
      console.warn('[RootApp] Realtime listener error:', err);
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
