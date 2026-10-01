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
 */
export function updateDynamicPWA(store: Store | null, portal: string = 'customer') {
  if (typeof window === 'undefined') return;

  const isPlatformPortal =
    portal === 'super-admin' ||
    portal === 'join' ||
    portal === 'partner' ||
    portal === 'partner-landing';

  const effectiveStore = isPlatformPortal ? null : store;

  const exactStoreName = isPlatformPortal
    ? 'Radar Platform Owner'
    : effectiveStore?.name || (effectiveStore?.slug ? effectiveStore.slug.toUpperCase() : 'Radar');

  const slug = effectiveStore?.slug || '';
  const startUrl = isPlatformPortal
    ? '/?portal=super-admin'
    : slug
    ? `/?store=${encodeURIComponent(slug)}&portal=${encodeURIComponent(portal)}`
    : `/?portal=${encodeURIComponent(portal)}`;

  const primaryColor = isPlatformPortal ? '#0B0F17' : effectiveStore?.primary_color || '#0B0F17';
  const secondaryColor = isPlatformPortal ? '#F59E0B' : effectiveStore?.secondary_color || '#F59E0B';

  // Determine active icon: Store custom logo -> Store SVG icon -> Platform icon
  let storeIconUrl = '/icon-192.svg';
  if (!isPlatformPortal && effectiveStore) {
    if (effectiveStore.logo_url && effectiveStore.logo_url.trim()) {
      storeIconUrl = effectiveStore.logo_url;
    } else {
      storeIconUrl = generateStoreSvgIcon(exactStoreName, primaryColor, secondaryColor);
    }
  }

  // 1. Build Dynamic Manifest Object
  const manifestIcons = isPlatformPortal || !effectiveStore
    ? [
        {
          src: '/icon-192.svg',
          sizes: '192x192',
          type: 'image/svg+xml',
          purpose: 'any',
        },
        {
          src: '/icon-512.svg',
          sizes: '512x512',
          type: 'image/svg+xml',
          purpose: 'any',
        },
      ]
    : [
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
          src: '/icon-192.svg',
          sizes: '192x192',
          type: 'image/svg+xml',
          purpose: 'any',
        },
      ];

  const manifestObject = {
    name: exactStoreName,
    short_name: exactStoreName,
    description: isPlatformPortal
      ? 'Radar Loyalty Platform - Super Admin'
      : `نظام الولاء والمكافآت الذكي - ${exactStoreName}`,
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
  appleTitleMeta.content = exactStoreName;

  // 6. Theme Color Meta
  let themeColorMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement;
  if (!themeColorMeta) {
    themeColorMeta = document.createElement('meta');
    themeColorMeta.name = 'theme-color';
    document.head.appendChild(themeColorMeta);
  }
  themeColorMeta.content = secondaryColor;

  // 7. Page Document Title
  document.title = exactStoreName;

  // 8. Persist last active store & portal in localStorage ONLY if inside a specific store portal
  if (slug && !isPlatformPortal) {
    try {
      localStorage.setItem('radar_last_store_slug', slug);
      localStorage.setItem('radar_last_portal', portal);
      localStorage.setItem('radar_last_store_name', exactStoreName);
    } catch (e) {
      // ignore
    }
  }
}
