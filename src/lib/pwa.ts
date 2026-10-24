import { Store } from '../types';
import { getActiveTenantConfig } from '../config/tenant';

let activeBlobUrl: string | null = null;

function generateStoreSvgIcon(storeName: string, primaryColor: string, secondaryColor: string): string {
  const char = (storeName || 'ST').trim().slice(0, 2).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width="192" height="192">
    <rect width="192" height="192" rx="42" fill="${primaryColor}" />
    <circle cx="96" cy="96" r="70" fill="none" stroke="${secondaryColor}" stroke-width="4" stroke-dasharray="8 6" opacity="0.6" />
    <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#FFFFFF" font-family="sans-serif" font-weight="900" font-size="64" letter-spacing="1">
      ${char}
    </text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Updates dynamic PWA manifest, Apple touch icon, meta tags, and title based on current store & portal.
 * Respects Active Tenant Branding (White-Label) across all portals.
 */
export function updateDynamicPWA(store: Store | null, portal: string = 'customer') {
  if (typeof window === 'undefined') return;

  const tenant = getActiveTenantConfig();
  const tenantBrand = tenant.brandName || 'المنصة السحابية';
  const tenantLogo = tenant.faviconUrl || tenant.logoUrl || '/favicon.png';

  let pageTitle = tenantBrand;
  let manifestName = `${tenantBrand} للولاء الذكي`;
  let manifestShortName = tenant.brandEnglishName || tenantBrand;
  let primaryColor = tenant.primaryColorHex || '#0B0F17';
  let secondaryColor = tenant.accentColorHex || '#F59E0B';

  const effectiveStore =
    portal === 'super-admin' ||
    portal === 'partner' ||
    portal === 'join' ||
    portal === 'partner-landing'
      ? null
      : store;

  switch (portal) {
    case 'super-admin':
      pageTitle = `بوابة المالك | ${tenantBrand}`;
      manifestName = `منصة ${tenantBrand}`;
      manifestShortName = tenantBrand;
      primaryColor = '#0B0F17';
      secondaryColor = tenant.primaryColorHex || '#F59E0B';
      break;

    case 'partner':
      pageTitle = `بوابة الشريك | ${tenantBrand}`;
      manifestName = `بوابة شركاء المبيعات | ${tenantBrand}`;
      manifestShortName = `شريك ${tenantBrand}`;
      primaryColor = '#0B0F17';
      secondaryColor = '#10B981';
      break;

    case 'admin':
      pageTitle = effectiveStore?.name || 'لوحة التاجر';
      manifestName = effectiveStore?.name
        ? `${effectiveStore.name} - لوحة الإدارة`
        : 'لوحة تحكم التاجر';
      manifestShortName = effectiveStore?.name ? effectiveStore.name.slice(0, 12) : 'إدارة المتجر';
      primaryColor = effectiveStore?.primary_color || '#0F172A';
      secondaryColor = effectiveStore?.secondary_color || '#F59E0B';
      break;

    case 'cashier':
      pageTitle = effectiveStore?.name
        ? `${effectiveStore.name} - الكاشير`
        : 'نظام الكاشير';
      manifestName = effectiveStore?.name
        ? `${effectiveStore.name} - كاشير الولاء`
        : `كاشير ${tenantBrand}`;
      manifestShortName = effectiveStore?.name
        ? `${effectiveStore.name.slice(0, 8)} POS`
        : 'الكاشير';
      primaryColor = effectiveStore?.primary_color || '#0F172A';
      secondaryColor = effectiveStore?.secondary_color || '#F59E0B';
      break;

    case 'kds':
      pageTitle = effectiveStore?.name
        ? `${effectiveStore.name} - شاشة المطبخ KDS`
        : 'شاشة المطبخ والعرض';
      manifestName = effectiveStore?.name
        ? `${effectiveStore.name} - شاشة العرض المباشر`
        : 'شاشة العرض المباشر';
      manifestShortName = 'شاشة KDS';
      primaryColor = '#0F172A';
      secondaryColor = '#F59E0B';
      break;

    case 'driver':
      pageTitle = effectiveStore?.name
        ? `${effectiveStore.name} - تطبيق كابتن التوصيل 🛵`
        : `كابتن التوصيل | ${tenantBrand}`;
      manifestName = effectiveStore?.name
        ? `${effectiveStore.name} - كابتن التوصيل`
        : `كابتن توصيل ${tenantBrand}`;
      manifestShortName = effectiveStore?.name
        ? `${effectiveStore.name.slice(0, 8)} سائق`
        : 'كابتن التوصيل';
      primaryColor = effectiveStore?.primary_color || '#0F172A';
      secondaryColor = effectiveStore?.secondary_color || '#F59E0B';
      break;

    case 'customer':
      pageTitle = effectiveStore?.name
        ? effectiveStore.name
        : 'بطاقة الولاء';
      manifestName = effectiveStore?.name
        ? `${effectiveStore.name} - بطاقة الولاء`
        : 'محفظة الولاء';
      manifestShortName = effectiveStore?.name ? effectiveStore.name.slice(0, 12) : 'بطاقتي';
      primaryColor = effectiveStore?.primary_color || '#0F172A';
      secondaryColor = effectiveStore?.secondary_color || '#F59E0B';
      break;

    case 'join':
      pageTitle = `بوابة التسجيل | ${tenantBrand}`;
      manifestName = `تسجيل متجر جديد | ${tenantBrand}`;
      manifestShortName = 'بوابة التسجيل';
      primaryColor = '#0B0F17';
      secondaryColor = '#F59E0B';
      break;

    case 'partner-landing':
      pageTitle = `بوابة الشريك | ${tenantBrand}`;
      manifestName = 'بوابة الشريك المعتمد';
      manifestShortName = `شريك ${tenantBrand}`;
      primaryColor = '#0B0F17';
      secondaryColor = '#10B981';
      break;

    case 'onboarding':
      pageTitle = effectiveStore?.name ? `${effectiveStore.name} - إعداد المتجر` : `بوابة إعداد المتجر | ${tenantBrand}`;
      manifestName = `تأسيس المتجر | ${tenantBrand}`;
      manifestShortName = 'تأسيس متجر';
      primaryColor = '#0B0F17';
      secondaryColor = '#F59E0B';
      break;

    default:
      pageTitle = tenantBrand;
      manifestName = tenantBrand;
      manifestShortName = tenantBrand;
  }

  // Determine active icon: Store custom logo -> Store SVG icon -> Tenant logo
  let storeIconUrl = tenantLogo;
  if (effectiveStore) {
    if (effectiveStore.logo_url && effectiveStore.logo_url.trim()) {
      storeIconUrl = effectiveStore.logo_url;
    } else {
      storeIconUrl = generateStoreSvgIcon(effectiveStore.name || 'ST', primaryColor, secondaryColor);
    }
  }

  // 1. Build Dynamic Manifest Object
  const manifestIcons = [
    {
      src: storeIconUrl,
      sizes: '192x192 512x512',
      type: storeIconUrl.startsWith('data:image/svg')
        ? 'image/svg+xml'
        : storeIconUrl.startsWith('data:image/png')
        ? 'image/png'
        : 'image/jpeg',
      purpose: 'any maskable',
    },
    {
      src: storeIconUrl,
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any',
    },
  ];

  const slug = effectiveStore?.slug || '';
  const startUrl =
    portal === 'super-admin'
      ? '/super-admin'
      : portal === 'partner'
      ? '/partner'
      : portal === 'join'
      ? '/join'
      : slug
      ? `/?store=${encodeURIComponent(slug)}&portal=${encodeURIComponent(portal)}`
      : `/?portal=${encodeURIComponent(portal)}`;

  const manifestObject = {
    name: manifestName,
    short_name: manifestShortName,
    description: `منصة ${tenantBrand} للولاء والمكافآت الذكية - ${manifestName}`,
    start_url: startUrl,
    scope: '/',
    display: 'standalone',
    background_color: primaryColor,
    theme_color: secondaryColor,
    orientation: 'portrait',
    icons: manifestIcons,
  };

  // 2. Inject or Update Blob Manifest Link
  try {
    if (activeBlobUrl) {
      URL.revokeObjectURL(activeBlobUrl);
    }
    const manifestBlob = new Blob([JSON.stringify(manifestObject, null, 2)], {
      type: 'application/manifest+json',
    });
    activeBlobUrl = URL.createObjectURL(manifestBlob);

    let manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
    if (!manifestLink) {
      manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      document.head.appendChild(manifestLink);
    }
    manifestLink.href = activeBlobUrl;
  } catch (e) {
    console.warn('Dynamic manifest blob error:', e);
  }

  // 3. Apple Touch Icon
  let appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement;
  if (!appleTouchIcon) {
    appleTouchIcon = document.createElement('link');
    appleTouchIcon.rel = 'apple-touch-icon';
    document.head.appendChild(appleTouchIcon);
  }
  appleTouchIcon.href = storeIconUrl;

  // 4. Favicon - Strictly sets the tab icon to the tenant's uploaded logo!
  let favicon = (document.getElementById('app-favicon') || document.querySelector('link[rel="icon"]')) as HTMLLinkElement;
  if (!favicon) {
    favicon = document.createElement('link');
    favicon.rel = 'icon';
    document.head.appendChild(favicon);
  }
  favicon.href = storeIconUrl;

  // 5. Apple Mobile Web App Title
  let appleTitleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]') as HTMLMetaElement;
  if (!appleTitleMeta) {
    appleTitleMeta = document.createElement('meta');
    appleTitleMeta.name = 'apple-mobile-web-app-title';
    document.head.appendChild(appleTitleMeta);
  }
  appleTitleMeta.content = manifestShortName;

  // 6. Theme Color Meta
  let themeColorMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement;
  if (!themeColorMeta) {
    themeColorMeta = document.createElement('meta');
    themeColorMeta.name = 'theme-color';
    document.head.appendChild(themeColorMeta);
  }
  themeColorMeta.content = secondaryColor;

  // 7. Page Document Title - Completely dynamic based on tenantBrand
  document.title = pageTitle;
}
