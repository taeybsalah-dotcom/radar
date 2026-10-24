import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_TENANT_CONFIG, WhiteLabelTenantConfig } from './tenant';

export interface ResolvedTenant {
  slug: string;
  name: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  platformStatus: 'active' | 'suspended' | 'maintenance';
  suspensionReason?: string | null;
  brandLogoUrl?: string | null;
  brandPrimaryColor?: string | null;
  isMasterRadar: boolean;
}

// Master Radar fallback
const MASTER_RADAR_TENANT: ResolvedTenant = {
  slug: 'radar',
  name: 'رادار',
  supabaseUrl: 'https://zagpvflyizbmzsbmhnts.supabase.co',
  supabaseAnonKey: 'sb_publishable_Bx1NGkxLxilvNA3RgcioVQ_t8zlk72H',
  platformStatus: 'active',
  brandLogoUrl: '/radar-logo-dark.jpg',
  brandPrimaryColor: '#F59E0B',
  isMasterRadar: true,
};

let currentTenant: ResolvedTenant = MASTER_RADAR_TENANT;
let scopedSupabaseClient: SupabaseClient | null = null;

/**
 * Resolve current active tenant from Hostname or URL param
 */
export async function initActiveTenant(): Promise<ResolvedTenant> {
  if (typeof window === 'undefined') {
    return MASTER_RADAR_TENANT;
  }

  const hostname = window.location.hostname.toLowerCase();
  const searchParams = new URLSearchParams(window.location.search);
  const tenantParam = searchParams.get('tenant') || searchParams.get('reseller');

  // 1. If running explicitly as Master Radar on myradar.sarl, keep master
  if (hostname === 'myradar.sarl' || hostname === 'www.myradar.sarl') {
    currentTenant = MASTER_RADAR_TENANT;
    return currentTenant;
  }

  // 2. Check if environment variables directly override tenant (e.g. dedicated cloudflare deployment)
  const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
  const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;
  const envBrandName = (import.meta as any).env?.VITE_BRAND_NAME;

  if (envBrandName && envBrandName !== 'رادار' && envUrl && envKey) {
    currentTenant = {
      slug: (import.meta as any).env?.VITE_BRAND_SLUG || 'reseller',
      name: envBrandName,
      supabaseUrl: envUrl,
      supabaseAnonKey: envKey,
      platformStatus: 'active',
      brandLogoUrl: (import.meta as any).env?.VITE_BRAND_LOGO_URL || '/radar-logo-dark.jpg',
      brandPrimaryColor: (import.meta as any).env?.VITE_BRAND_PRIMARY_COLOR || '#4F46E5',
      isMasterRadar: false,
    };
    return currentTenant;
  }

  // 3. Dynamic lookup against Master Radar `resellers` table by hostname or tenant param
  try {
    const masterLookup = createClient(
      MASTER_RADAR_TENANT.supabaseUrl,
      MASTER_RADAR_TENANT.supabaseAnonKey
    );

    let query = masterLookup.from('resellers').select('*');

    if (tenantParam) {
      query = query.eq('slug', tenantParam.trim().toLowerCase());
    } else {
      query = query.or(`custom_domain.eq.${hostname},subdomain.eq.${hostname}`);
    }

    const { data: reseller, error } = await query.maybeSingle();

    if (reseller && !error) {
      currentTenant = {
        slug: reseller.slug,
        name: reseller.name,
        supabaseUrl: reseller.supabase_url,
        supabaseAnonKey: reseller.supabase_anon_key,
        platformStatus: reseller.platform_status || 'active',
        suspensionReason: reseller.suspension_reason,
        brandLogoUrl: reseller.brand_logo_url || '/radar-logo-dark.jpg',
        brandPrimaryColor: reseller.brand_primary_color || '#4F46E5',
        isMasterRadar: false,
      };

      // Set page title & theme
      document.title = currentTenant.name;
      return currentTenant;
    }
  } catch (err) {
    console.warn('[Tenant] Dynamic resolution fallback to default:', err);
  }

  currentTenant = MASTER_RADAR_TENANT;
  return currentTenant;
}

/**
 * Get the currently resolved tenant
 */
export function getCurrentTenant(): ResolvedTenant {
  return currentTenant;
}

/**
 * Get or create scoped Supabase Client with isolated storageKey to prevent auth token collision
 */
export function getScopedSupabaseClient(): SupabaseClient {
  if (scopedSupabaseClient) {
    return scopedSupabaseClient;
  }

  const tenant = getCurrentTenant();
  const storageKey = `radar_session_${tenant.slug}`;

  scopedSupabaseClient = createClient(tenant.supabaseUrl, tenant.supabaseAnonKey, {
    auth: {
      storageKey, // Isolates sessions per tenant completely in localStorage
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  return scopedSupabaseClient;
}
