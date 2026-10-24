/**
 * 🏢 WHITE-LABEL TENANT CONFIGURATION INTERFACE
 * Everything that personalizes the platform for a dedicated Wholesaler/Reseller
 */
export interface WhiteLabelTenantConfig {
  brandName: string;
  brandEnglishName: string;
  tagline: string;
  logoUrl?: string;
  faviconUrl?: string;
  domain?: string;
  supportPhone?: string;
  supportWhatsapp?: string;
  supportEmail?: string;
  primaryColorHex?: string;
  accentColorHex?: string;
  pwaAppName: string;
  copyrightHolder: string;
  isWhiteLabelTenant: boolean;
}

const CACHE_KEY = 'radar_cached_tenant_branding';

/**
 * 🌟 BASE DEFAULTS (Overridden dynamically from DB table tenant_branding)
 */
let memoryConfig: WhiteLabelTenantConfig = {
  brandName: import.meta.env.VITE_BRAND_NAME || 'رادار',
  brandEnglishName: import.meta.env.VITE_BRAND_NAME_EN || 'Radar',
  tagline: import.meta.env.VITE_BRAND_TAGLINE || 'منظومة الولاء ونقاط البيع السحابية الذكية',
  logoUrl: import.meta.env.VITE_BRAND_LOGO_URL || '/radar-logo-dark.jpg',
  faviconUrl: import.meta.env.VITE_BRAND_FAVICON_URL || '/favicon.png',
  domain: import.meta.env.VITE_BRAND_DOMAIN || 'myradar.sarl',
  supportPhone: import.meta.env.VITE_SUPPORT_PHONE || '+966500000000',
  supportWhatsapp: import.meta.env.VITE_SUPPORT_WHATSAPP || '966500000000',
  supportEmail: import.meta.env.VITE_SUPPORT_EMAIL || 'support@radar.sa',
  primaryColorHex: import.meta.env.VITE_BRAND_PRIMARY_COLOR || '#F59E0B',
  accentColorHex: import.meta.env.VITE_BRAND_ACCENT_COLOR || '#10B981',
  pwaAppName: import.meta.env.VITE_BRAND_PWA_NAME || 'منظومة نقاط البيع والولاء',
  copyrightHolder: import.meta.env.VITE_BRAND_COPYRIGHT || 'جميع الحقوق محفوظة',
  isWhiteLabelTenant: Boolean(import.meta.env.VITE_BRAND_NAME && import.meta.env.VITE_BRAND_NAME !== 'رادار'),
};

// Immediately hydrate from localStorage for 0ms Zero-Flicker load
if (typeof window !== 'undefined') {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const b = JSON.parse(raw);
      if (b.brand_name) {
        memoryConfig = {
          ...memoryConfig,
          brandName: b.brand_name,
          brandEnglishName: b.brand_english_name || memoryConfig.brandEnglishName,
          tagline: b.tagline || memoryConfig.tagline,
          logoUrl: b.logo_url || memoryConfig.logoUrl,
          faviconUrl: b.favicon_url || b.logo_url || memoryConfig.faviconUrl,
          supportPhone: b.support_phone || memoryConfig.supportPhone,
          supportWhatsapp: b.support_whatsapp || memoryConfig.supportWhatsapp,
          supportEmail: b.support_email || memoryConfig.supportEmail,
          primaryColorHex: b.primary_color_hex || memoryConfig.primaryColorHex,
          accentColorHex: b.accent_color_hex || memoryConfig.accentColorHex,
          copyrightHolder: b.copyright_holder || b.brand_name,
          isWhiteLabelTenant: b.brand_name !== 'رادار',
        };
      }
    }
  } catch {}
}

/**
 * ⚡ Update Active Tenant Branding from Database & Cache
 */
export function applyTenantBranding(data: any): WhiteLabelTenantConfig {
  if (!data || !data.brand_name) return memoryConfig;

  memoryConfig = {
    brandName: data.brand_name,
    brandEnglishName: data.brand_english_name || memoryConfig.brandEnglishName,
    tagline: data.tagline || memoryConfig.tagline,
    logoUrl: data.logo_url || memoryConfig.logoUrl,
    faviconUrl: data.favicon_url || data.logo_url || memoryConfig.faviconUrl,
    domain: data.domain || memoryConfig.domain,
    supportPhone: data.support_phone || memoryConfig.supportPhone,
    supportWhatsapp: data.support_whatsapp || memoryConfig.supportWhatsapp,
    supportEmail: data.support_email || memoryConfig.supportEmail,
    primaryColorHex: data.primary_color_hex || memoryConfig.primaryColorHex,
    accentColorHex: data.accent_color_hex || memoryConfig.accentColorHex,
    pwaAppName: `${data.brand_name} - نقاط البيع والولاء`,
    copyrightHolder: data.copyright_holder || data.brand_name,
    isWhiteLabelTenant: data.brand_name !== 'رادار',
  };

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      // Update DOM
      document.title = memoryConfig.brandName;
      if (memoryConfig.faviconUrl) {
        const fav = document.getElementById('app-favicon') as HTMLLinkElement;
        if (fav) fav.href = memoryConfig.faviconUrl;
      }
    } catch {}
  }

  return memoryConfig;
}

export function getActiveTenantConfig(): WhiteLabelTenantConfig {
  return memoryConfig;
}
