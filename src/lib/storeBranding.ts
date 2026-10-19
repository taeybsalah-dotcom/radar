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
  theme_mode?: 'light' | 'dark' | 'warm_cream' | 'system';
  background_color?: string;
  card_color?: string;
  card_text_color?: string;
  theme_preset?: string;
  branch_id?: string | null;
  cached_at?: number;
}

export interface BrandThemePreset {
  id: string;
  name: string;
  description: string;
  theme_mode: 'light' | 'dark' | 'warm_cream';
  primary_color: string;
  secondary_color: string;
  background_color: string;
  card_color: string;
  icon: string;
}

export const BRAND_PRESETS: BrandThemePreset[] = [
  {
    id: 'cafe_warm',
    name: 'قهوة وكافيه مختص ☕',
    description: 'درجات الفانيلا والبيج الدافئ مع بني الموكا والكراميل',
    theme_mode: 'warm_cream',
    primary_color: '#3B2314',
    secondary_color: '#D97706',
    background_color: '#FAF6F0',
    card_color: '#FFFFFF',
    icon: '☕',
  },
  {
    id: 'clean_restaurant',
    name: 'مطاعم وبرغر راقي 🍔',
    description: 'أبيض ناصع مع كحلي عصري وأحمر كلاسيكي دافئ',
    theme_mode: 'light',
    primary_color: '#0F172A',
    secondary_color: '#DC2626',
    background_color: '#F8FAFC',
    card_color: '#FFFFFF',
    icon: '🍔',
  },
  {
    id: 'healthy_juice',
    name: 'هيلثي وعصائر طازجة 🌿',
    description: 'أخضر نعناعي مشرق مع خلفية طبيعية منعشة',
    theme_mode: 'light',
    primary_color: '#047857',
    secondary_color: '#EAB308',
    background_color: '#F0FDF4',
    card_color: '#FFFFFF',
    icon: '🌿',
  },
  {
    id: 'salon_spa',
    name: 'صوالين وسبا فاخر 🌸',
    description: 'وردي بلش راقي مع ذهبي روز وخلفية لؤلؤية هادئة',
    theme_mode: 'light',
    primary_color: '#9D174D',
    secondary_color: '#F59E0B',
    background_color: '#FFF5F7',
    card_color: '#FFFFFF',
    icon: '🌸',
  },
  {
    id: 'royal_gold',
    name: 'فخامة ملكية ذهبية 👑',
    description: 'كحلي إمبراطوري عميق مع ذهبي مطفي كلاسيكي',
    theme_mode: 'light',
    primary_color: '#1E1B4B',
    secondary_color: '#B45309',
    background_color: '#FDFBF7',
    card_color: '#FFFFFF',
    icon: '👑',
  },
  {
    id: 'sleek_dark',
    name: 'ليلي فاخر (سهرة ولاونج) 🌙',
    description: 'أسود ملكي مع تدرجات ذهبية للمطاعم الفاخرة',
    theme_mode: 'dark',
    primary_color: '#0F172A',
    secondary_color: '#F59E0B',
    background_color: '#080B11',
    card_color: '#131A26',
    icon: '🌙',
  },
];

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
    theme_mode: store.theme_mode || 'light',
    background_color: store.background_color || (store.theme_mode === 'warm_cream' ? '#FAF6F0' : store.theme_mode === 'dark' ? '#080B11' : '#F8FAFC'),
    card_color: store.card_color || (store.theme_mode === 'dark' ? '#131A26' : '#FFFFFF'),
    card_text_color: store.card_text_color || undefined,
    theme_preset: store.theme_preset || undefined,
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
