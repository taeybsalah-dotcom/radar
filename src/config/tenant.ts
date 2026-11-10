/**
 * 🏢 WHITE-LABEL TENANT CONFIGURATION INTERFACE
 * Everything that personalizes the platform for a dedicated Wholesaler/Reseller
 */
export interface WhiteLabelTenantConfig {
  tenantId: string;
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

export function getTargetTenantHost(): string {
  if (typeof window === 'undefined') return 'myradar.sarl';
  try {
    const params = new URLSearchParams(window.location.search);
    const tenantParam = params.get('tenant')?.trim().toLowerCase();
    if (tenantParam) {
      sessionStorage.setItem('radar_active_tenant_override', tenantParam);
      return tenantParam;
    }
    const savedOverride = sessionStorage.getItem('radar_active_tenant_override')?.trim().toLowerCase();
    if (savedOverride && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      return savedOverride;
    }
  } catch {}
  return window.location.hostname.toLowerCase();
}

const getDomainCacheKey = () => {
  if (typeof window === 'undefined') return 'radar_cached_tenant_branding';
  const cleanHost = getTargetTenantHost().replace(/[^a-z0-9]/g, '_');
  return `radar_cached_tenant_branding_${cleanHost}`;
};

// Known tenant initial profiles for 0ms Instant Rendering based on Hostname
const SADEEM_PROFILE: WhiteLabelTenantConfig = {
  tenantId: 'sadeem',
  brandName: 'سديم الأثر',
  brandEnglishName: 'Sadim Al-Athir',
  tagline: 'منظومة نقاط البيع السحابية وإدارة المطاعم والمقاهي',
  logoUrl: 'https://zagpvflyizbmzsbmhnts.supabase.co/storage/v1/object/public/store-assets/logos/sadeem-official-logo.jpg',
  faviconUrl: 'https://zagpvflyizbmzsbmhnts.supabase.co/storage/v1/object/public/store-assets/logos/sadeem-official-logo.jpg',
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

const RADAR_DEFAULT_LOGO =
  'https://zagpvflyizbmzsbmhnts.supabase.co/storage/v1/object/public/store-assets/logos/b9aaa6365c1812ebb5d88c90f358c1b1574f9ae7.webp';

const RADAR_PROFILE: WhiteLabelTenantConfig = {
  tenantId: 'radar',
  brandName: import.meta.env.VITE_BRAND_NAME || 'رادار',
  brandEnglishName: import.meta.env.VITE_BRAND_NAME_EN || 'Radar',
  tagline: import.meta.env.VITE_BRAND_TAGLINE || 'منظومة الولاء ونقاط البيع السحابية الذكية',
  logoUrl: import.meta.env.VITE_BRAND_LOGO_URL || RADAR_DEFAULT_LOGO,
  faviconUrl: import.meta.env.VITE_BRAND_FAVICON_URL || RADAR_DEFAULT_LOGO,
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

function sanitizeLogoUrl(url?: string | null, fallback?: string): string | undefined {
  if (!url || typeof url !== 'string') return fallback;
  const trimmed = url.trim();
  if (!trimmed || trimmed === '/favicon.png' || trimmed === '/favicon.ico' || trimmed === '/radar-logo-dark.jpg') {
    return fallback;
  }
  return trimmed;
}

function resolveInitialConfig(): WhiteLabelTenantConfig {
  if (typeof window === 'undefined') return RADAR_PROFILE;

  const host = getTargetTenantHost();
  let base = RADAR_PROFILE;
  if (host.includes('sdeem') || host.includes('sadim') || host === 'sadeem') {
    base = SADEEM_PROFILE;
  }

  // Check host-specific cache
  try {
    const raw = localStorage.getItem(getDomainCacheKey());
    if (raw) {
      const b = JSON.parse(raw);
      const bName = b.brand_name || b.name;
      if (bName) {
        const isSadeemHost = host.includes('sdeem') || host.includes('sadim') || host === 'sadeem';
        if (isSadeemHost && bName === 'رادار') {
          // Reject stale radar cache on sadeem domain
        } else {
          const tid = b.id || (isSadeemHost || bName === 'سديم الأثر' ? 'sadeem' : 'radar');
          const cleanLogo = sanitizeLogoUrl(b.logo_url, base.logoUrl);
          base = {
            ...base,
            tenantId: tid,
            brandName: bName,
            brandEnglishName: b.brand_english_name || b.name_en || base.brandEnglishName,
            tagline: b.tagline || base.tagline,
            logoUrl: cleanLogo,
            faviconUrl: sanitizeLogoUrl(b.favicon_url || b.logo_url, cleanLogo || base.faviconUrl),
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

  const tenantId = data.id || (brandName === 'سديم الأثر' ? 'sadeem' : memoryConfig.tenantId || 'radar');
  const nextLogoUrl = sanitizeLogoUrl(data.logo_url, memoryConfig.logoUrl);
  const nextFaviconUrl = sanitizeLogoUrl(data.favicon_url || data.logo_url, nextLogoUrl || memoryConfig.faviconUrl);

  const nextConfig: WhiteLabelTenantConfig = {
    tenantId,
    brandName,
    brandEnglishName: data.brand_english_name || data.name_en || memoryConfig.brandEnglishName,
    tagline: data.tagline || memoryConfig.tagline,
    logoUrl: nextLogoUrl,
    faviconUrl: nextFaviconUrl,
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

  const hasChanged =
    memoryConfig.tenantId !== nextConfig.tenantId ||
    memoryConfig.brandName !== nextConfig.brandName ||
    memoryConfig.logoUrl !== nextConfig.logoUrl ||
    memoryConfig.primaryColorHex !== nextConfig.primaryColorHex ||
    memoryConfig.accentColorHex !== nextConfig.accentColorHex ||
    memoryConfig.tagline !== nextConfig.tagline ||
    memoryConfig.supportWhatsapp !== nextConfig.supportWhatsapp;

  memoryConfig = nextConfig;

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(getDomainCacheKey(), JSON.stringify({
        ...data,
        brand_name: brandName,
        logo_url: nextLogoUrl,
      }));
      document.title = memoryConfig.brandName;
      if (hasChanged && memoryConfig.faviconUrl) {
        try {
          const size = 64;
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = size;
              canvas.height = size;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.beginPath();
                ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(img, 0, 0, size, size);
                const fav = document.getElementById('app-favicon') as HTMLLinkElement;
                if (fav) {
                  fav.href = canvas.toDataURL('image/png');
                  fav.type = 'image/png';
                }
              }
            } catch {}
          };
          img.src = memoryConfig.faviconUrl;
        } catch {}
      }
    } catch {}
  }

  if (hasChanged) {
    brandingListeners.forEach((fn) => {
      try { fn(memoryConfig); } catch {}
    });
  }

  return memoryConfig;
}

export function getActiveTenantConfig(): WhiteLabelTenantConfig {
  return memoryConfig;
}
