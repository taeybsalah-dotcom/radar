/**
 * 🏢 WHITE-LABEL TENANT CONFIGURATION INTERFACE
 * Everything that personalizes the platform for a dedicated Wholesaler/Reseller
 */
export interface WhiteLabelTenantConfig {
  // Identity & Branding
  brandName: string;            // e.g. "رادار" or "الوسيط للحلول الرقمية"
  brandEnglishName: string;     // e.g. "Radar" or "AlWaseet"
  tagline: string;              // e.g. "منظومة الولاء والمبيعات السحابية"
  logoUrl?: string;             // Custom Logo URL or path
  faviconUrl?: string;          // Browser tab favicon
  
  // Custom Domain
  domain?: string;              // e.g. "alwaseet-pos.com"
  
  // Support & Contact
  supportPhone?: string;        // e.g. "+966500000000"
  supportWhatsapp?: string;     // e.g. "966500000000"
  supportEmail?: string;        // e.g. "support@partnerdomain.com"
  
  // Colors & Theme (CSS Hex or Tailwind colors)
  primaryColorHex?: string;     // e.g. "#F59E0B" (Amber) or "#10B981" (Emerald)
  accentColorHex?: string;      // e.g. "#0EA5E9" (Sky)
  
  // PWA / App Title
  pwaAppName: string;           // Title shown when installing app
  
  // Copyright & Legal
  copyrightHolder: string;      // e.g. "شركة الوسيط للتقنية"
}

/**
 * 🌟 DEFAULT MASTER TENANT (RADAR)
 * Override these values using environment variables or a custom tenant JSON when cloning.
 */
export const DEFAULT_TENANT_CONFIG: WhiteLabelTenantConfig = {
  brandName: import.meta.env.VITE_BRAND_NAME || 'رادار',
  brandEnglishName: import.meta.env.VITE_BRAND_NAME_EN || 'Radar',
  tagline: import.meta.env.VITE_BRAND_TAGLINE || 'منظومة الولاء ونقاط البيع السحابية الذكية',
  logoUrl: import.meta.env.VITE_BRAND_LOGO_URL || '',
  faviconUrl: import.meta.env.VITE_BRAND_FAVICON_URL || '/favicon.ico',
  domain: import.meta.env.VITE_BRAND_DOMAIN || 'radar.sa',
  supportPhone: import.meta.env.VITE_SUPPORT_PHONE || '+966500000000',
  supportWhatsapp: import.meta.env.VITE_SUPPORT_WHATSAPP || '966500000000',
  supportEmail: import.meta.env.VITE_SUPPORT_EMAIL || 'support@radar.sa',
  primaryColorHex: import.meta.env.VITE_BRAND_PRIMARY_COLOR || '#F59E0B',
  accentColorHex: import.meta.env.VITE_BRAND_ACCENT_COLOR || '#10B981',
  pwaAppName: import.meta.env.VITE_BRAND_PWA_NAME || 'رادار - نقاط البيع والولاء',
  copyrightHolder: import.meta.env.VITE_BRAND_COPYRIGHT || 'منظومة رادار السحابية',
};

/**
 * Helper to get active tenant branding anywhere in the app
 */
export function getActiveTenantConfig(): WhiteLabelTenantConfig {
  return DEFAULT_TENANT_CONFIG;
}
