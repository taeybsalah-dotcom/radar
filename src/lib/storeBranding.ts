// ==============================================================================
// 🛡️ RADAR WHITE-LABEL BRANDING & DYNAMIC SPLASH ENGINE
// Handles caching and instant retrieval of store brand assets (logo, name, colors)
// for Customer, Cashier POS, and Merchant Admin portals.
// ==============================================================================

import { Store } from '../types';

export interface StoreBranding {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  branch_id?: string | null;
  cached_at?: number;
}

export const BRANDING_STORAGE_KEY = 'radar_active_store_branding';

/**
 * Saves store branding into localStorage and sessionStorage for instant preloader access.
 */
export function saveActiveStoreBranding(store: Store | null | undefined, branchId?: string | null): void {
  if (typeof window === 'undefined') return;
  if (!store || !store.id) return;

  const branding: StoreBranding = {
    id: store.id,
    name: store.name || 'المتجر',
    slug: store.slug || store.id,
    logo_url: store.logo_url || undefined,
    primary_color: store.primary_color || '#0F172A',
    secondary_color: store.secondary_color || '#F59E0B',
    branch_id: branchId || undefined,
    cached_at: Date.now(),
  };

  try {
    const serialized = JSON.stringify(branding);
    localStorage.setItem(BRANDING_STORAGE_KEY, serialized);
    sessionStorage.setItem(BRANDING_STORAGE_KEY, serialized);
    if (store.slug) {
      localStorage.setItem('radar_last_store_slug', store.slug);
    }
    if (store.logo_url) {
      localStorage.setItem('radar_last_store_logo', store.logo_url);
    }
  } catch (e) {
    console.warn('[Branding] Failed to save active store branding to storage:', e);
  }
}

/**
 * Retrieves the currently active store branding from sessionStorage or localStorage.
 * Performs fallback lookups across auth state or local stores list if available.
 */
export function getActiveStoreBranding(): StoreBranding | null {
  if (typeof window === 'undefined') return null;

  try {
    // 1. Check session storage (active tab priority)
    const sessionRaw = sessionStorage.getItem(BRANDING_STORAGE_KEY);
    if (sessionRaw) {
      const parsed = JSON.parse(sessionRaw);
      if (parsed && parsed.name) return parsed;
    }

    // 2. Check local storage (persistent across reloads)
    const localRaw = localStorage.getItem(BRANDING_STORAGE_KEY);
    if (localRaw) {
      const parsed = JSON.parse(localRaw);
      if (parsed && parsed.name) return parsed;
    }

    // 3. Fallback: Parse unified auth user store info
    const rawAuth = localStorage.getItem('radar_unified_auth_user');
    if (rawAuth) {
      const parsedAuth = JSON.parse(rawAuth);
      if (parsedAuth && (parsedAuth.storeName || parsedAuth.storeSlug)) {
        return {
          id: parsedAuth.storeId || '',
          name: parsedAuth.storeName || 'المتجر',
          slug: parsedAuth.storeSlug || '',
          logo_url: parsedAuth.storeLogoUrl || localStorage.getItem('radar_last_store_logo') || undefined,
          primary_color: parsedAuth.primaryColor || '#0F172A',
          secondary_color: parsedAuth.secondaryColor || '#F59E0B',
          cached_at: Date.now(),
        };
      }
    }
  } catch (e) {
    console.warn('[Branding] Failed to retrieve store branding:', e);
  }

  return null;
}

/**
 * Clears active store branding (e.g. when logging out or entering platform-wide portals).
 */
export function clearActiveStoreBranding(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(BRANDING_STORAGE_KEY);
    localStorage.removeItem(BRANDING_STORAGE_KEY);
  } catch {}
}
