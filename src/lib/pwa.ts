import { Store } from '../types';

let activeBlobUrl: string | null = null;

function generateStoreSvgIcon(name: string, primaryColor: string, secondaryColor: string): string {
  const initials = (name || 'ST').slice(0, 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width="192" height="192">
    <rect width="192" height="192" rx="44" fill="${primaryColor}"/>
    <rect x="8" y="8" width="176" height="176" rx="36" fill="none" stroke="${secondaryColor}" stroke-width="4" stroke-opacity="0.6"/>
    <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="70" fill="${secondaryColor}">${initials}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Updates dynamic PWA manifest, Apple touch icon, meta tags, and title based on current store & portal.
 * Strictly separates titles and headers across all 5 tiers.
 */
export function updateDynamicPWA(store: Store | null, portal: string = 'customer') {
  if (typeof window === 'undefined') return;

  let pageTitle = 'رادار | RADAR';
  let manifestName = 'رادار | RADAR للولاء الذكي';
  let manifestShortName = 'RADAR';
  let primaryColor = '#0B0F17';
  let secondaryColor = '#F59E0B';

  const effectiveStore =
    portal === 'super-admin' ||
    portal === 'partner' ||
    portal === 'join' ||
    portal === 'partner-landing'
      ? null
      : store;

  switch (portal) {
    case 'super-admin':
      pageTitle = 'RADAR';
      manifestName = 'منصة رادار | RADAR';
      manifestShortName = 'RADAR';
      primaryColor = '#0B0F17';
      secondaryColor = '#F59E0B';
      break;

    case 'partner':
      pageTitle = 'بوابة الشريك | RADAR';
      manifestName = 'بوابة شركاء المبيعات | RADAR';
      manifestShortName = 'شريك رادار';
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
        : 'كاشير رادار';
      manifestShortName = effectiveStore?.name
        ? `${effectiveStore.name.slice(0, 8)} POS`
        : 'الكاشير';
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
      pageTitle = 'بوابة التسجيل | RADAR';
      manifestName = 'تسجيل متجر جديد | RADAR';
      manifestShortName = 'بوابة التسجيل';
      primaryColor = '#0B0F17';
      secondaryColor = '#F59E0B';
      break;

    case 'partner-landing':
      pageTitle = 'بوابة الشريك | RADAR';
      manifestName = 'بوابة الشريك المعتمد';
      manifestShortName = 'شريك رادار';
      primaryColor = '#0B0F17';
      secondaryColor = '#10B981';
      break;

    case 'onboarding':
      pageTitle = effectiveStore?.name ? `${effectiveStore.name} - إعداد المتجر` : 'بوابة إعداد المتجر | RADAR';
      manifestName = 'تأسيس المتجر | RADAR';
      manifestShortName = 'تأسيس متجر';
      primaryColor = '#0B0F17';
      secondaryColor = '#F59E0B';
      break;

    default:
      pageTitle = 'RADAR';
      manifestName = 'رادار | RADAR';
      manifestShortName = 'RADAR';
  }

  // Determine active icon: Store custom logo -> Store SVG icon -> Platform icon
  let storeIconUrl = '/icon-192.png';
  if (effectiveStore) {
    if (effectiveStore.logo_url && effectiveStore.logo_url.trim()) {
      storeIconUrl = effectiveStore.logo_url;
    } else {
      storeIconUrl = generateStoreSvgIcon(effectiveStore.name || 'ST', primaryColor, secondaryColor);
    }
  }

  // 1. Build Dynamic Manifest Object
  const manifestIcons = effectiveStore
    ? [
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
          src: '/icon-192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        },
      ]
    : [
        {
          src: '/icon-192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: '/icon-512.png',
          sizes: '512x512',
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
    description: `منصة رادار للولاء والمكافآت الذكية - ${manifestName}`,
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

  // 3. Apple Touch Icon for iOS Safari Home Screen
  let appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement;
  if (!appleTouchIcon) {
    appleTouchIcon = document.createElement('link');
    appleTouchIcon.rel = 'apple-touch-icon';
    document.head.appendChild(appleTouchIcon);
  }
  appleTouchIcon.href = storeIconUrl;

  // 4. Favicon
  let favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
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

  // 7. Page Document Title - Strictly Role & Portal Isolated
  document.title = pageTitle;

  // 8. Persist last active store & portal in localStorage ONLY if inside a specific store portal
  if (slug && portal !== 'super-admin' && portal !== 'partner') {
    try {
      localStorage.setItem('radar_last_store_slug', slug);
      localStorage.setItem('radar_last_portal', portal);
      localStorage.setItem('radar_last_store_name', pageTitle);
    } catch (e) {
      // ignore
    }
  }
}
