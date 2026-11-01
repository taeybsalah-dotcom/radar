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

const getDomainCacheKey = () => {
  if (typeof window === 'undefined') return 'radar_cached_tenant_branding';
  const cleanHost = window.location.hostname.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `radar_cached_tenant_branding_${cleanHost}`;
};

// Known tenant initial profiles for 0ms Instant Rendering based on Hostname
const SADEEM_PROFILE: WhiteLabelTenantConfig = {
  brandName: 'سديم الأثر',
  brandEnglishName: 'Sadim Al-Athir',
  tagline: 'منظومة نقاط البيع السحابية وإدارة المطاعم والمقاهي',
  logoUrl: '/sadeem-logo-cropped.png',
  faviconUrl: '/sadeem-favicon.png',
  domain: 'sdeemalathr.com',
  supportPhone: '+966500000000',
  supportWhatsapp: '966500000000',
  supportEmail: 'info@sadim-alathir.com',
  primaryColorHex: '#10B981',
  accentColorHex: '#0EA5E9',
  pwaAppName: 'سديم الأثر POS',
  copyrightHolder: 'مؤسسة سديم الأثر لتقنية المعلومات',
  isWhiteLabelTenant: true,
};

const RADAR_PROFILE: WhiteLabelTenantConfig = {
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

function resolveInitialConfig(): WhiteLabelTenantConfig {
  if (typeof window === 'undefined') return RADAR_PROFILE;

  const host = window.location.hostname.toLowerCase();
  let base = RADAR_PROFILE;
  if (host.includes('sdeem') || host.includes('sadim')) {
    base = SADEEM_PROFILE;
  }

  // Check host-specific cache
  try {
    const raw = localStorage.getItem(getDomainCacheKey());
    if (raw) {
      const b = JSON.parse(raw);
      const bName = b.brand_name || b.name;
      if (bName) {
        // Guard against cross-domain cache contamination
        const isSadeemHost = host.includes('sdeem') || host.includes('sadim');
        if (isSadeemHost && bName === 'رادار') {
          // Reject stale radar cache on sadeem domain
        } else {
          base = {
            ...base,
            brandName: bName,
            brandEnglishName: b.brand_english_name || b.name_en || base.brandEnglishName,
            tagline: b.tagline || base.tagline,
            logoUrl: b.logo_url || base.logoUrl,
            faviconUrl: b.favicon_url || b.logo_url || base.faviconUrl,
            domain: b.domain || b.custom_domain || base.domain,
            supportPhone: b.support_phone || base.supportPhone,
            supportWhatsapp: b.support_whatsapp || base.supportWhatsapp,
            supportEmail: b.support_email || base.supportEmail,
            primaryColorHex: b.primary_color_hex || base.primaryColorHex,
            accentColorHex: b.accent_color_hex || base.accentColorHex,
            pwaAppName: b.pwa_name || `${bName} - نقاط البيع والولاء`,
            copyrightHolder: b.copyright_holder || bName,
            isWhiteLabelTenant: bName !== 'رادار',
          };
        }
      }
    }
  } catch {}

  return base;
}

let memoryConfig: WhiteLabelTenantConfig = resolveInitialConfig();

type BrandingListener = (config: WhiteLabelTenantConfig) => void;
const brandingListeners = new Set<BrandingListener>();

export function subscribeTenantBranding(listener: BrandingListener): () => void {
  brandingListeners.add(listener);
  return () => {
    brandingListeners.delete(listener);
  };
}

/**
 * ⚡ Update Active Tenant Branding from Database & Cache
 */
export function applyTenantBranding(data: any): WhiteLabelTenantConfig {
  if (!data) return memoryConfig;

  const brandName = data.brand_name || data.name;
  if (!brandName) return memoryConfig;

  memoryConfig = {
    brandName,
    brandEnglishName: data.brand_english_name || data.name_en || memoryConfig.brandEnglishName,
    tagline: data.tagline || memoryConfig.tagline,
    logoUrl: data.logo_url || memoryConfig.logoUrl,
    faviconUrl: data.favicon_url || data.logo_url || memoryConfig.faviconUrl,
    domain: data.domain || data.custom_domain || memoryConfig.domain,
    supportPhone: data.support_phone || memoryConfig.supportPhone,
    supportWhatsapp: data.support_whatsapp || memoryConfig.supportWhatsapp,
    supportEmail: data.support_email || memoryConfig.supportEmail,
    primaryColorHex: data.primary_color_hex || memoryConfig.primaryColorHex,
    accentColorHex: data.accent_color_hex || memoryConfig.accentColorHex,
    pwaAppName: data.pwa_name || `${brandName} - نقاط البيع والولاء`,
    copyrightHolder: data.copyright_holder || brandName,
    isWhiteLabelTenant: brandName !== 'رادار',
  };

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(getDomainCacheKey(), JSON.stringify({
        ...data,
        brand_name: brandName,
      }));
      // Update DOM title and favicon
      document.title = memoryConfig.brandName;
      if (memoryConfig.faviconUrl) {
        const fav = document.getElementById('app-favicon') as HTMLLinkElement;
        if (fav) fav.href = memoryConfig.faviconUrl;
      }
    } catch {}
  }

  // Notify all subscribed components
  brandingListeners.forEach((fn) => {
    try { fn(memoryConfig); } catch {}
  });

  return memoryConfig;
}

export function getActiveTenantConfig(): WhiteLabelTenantConfig {
  return memoryConfig;
}
