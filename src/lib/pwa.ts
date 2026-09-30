import { Store } from '../types';

let activeBlobUrl: string | null = null;

/**
 * Updates dynamic PWA manifest, Apple touch icon, meta tags, and title based on current store & portal.
 */
export function updateDynamicPWA(store: Store | null, portal: string = 'customer') {
  if (typeof window === 'undefined') return;

  const isSuperAdmin = portal === 'super-admin';
  const effectiveStore = isSuperAdmin ? null : store;

  const exactStoreName = isSuperAdmin
    ? 'Radar Platform Owner'
    : effectiveStore?.name || (effectiveStore?.slug ? effectiveStore.slug.toUpperCase() : 'Radar');

  const slug = effectiveStore?.slug || '';
  const startUrl = isSuperAdmin
    ? '/?portal=super-admin'
    : slug
    ? `/?store=${encodeURIComponent(slug)}&portal=${encodeURIComponent(portal)}`
    : `/?portal=${encodeURIComponent(portal)}`;

  const httpIconUrl = isSuperAdmin || !slug
    ? '/icon-192.svg'
    : `/api/icon?store=${encodeURIComponent(slug)}`;

  const primaryColor = isSuperAdmin ? '#0B0F17' : effectiveStore?.primary_color || '#0B0F17';
  const secondaryColor = isSuperAdmin ? '#F59E0B' : effectiveStore?.secondary_color || '#F59E0B';

  // 1. Build Dynamic Manifest Object
  const manifestIcons = isSuperAdmin || !slug
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
          src: `${httpIconUrl}&size=180`,
          sizes: '180x180',
          type: 'image/png',
          purpose: 'any maskable',
        },
        {
          src: `${httpIconUrl}&size=192`,
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any maskable',
        },
        {
          src: `${httpIconUrl}&size=512`,
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable',
        },
      ];

  const manifestObject = {
    name: exactStoreName,
    short_name: exactStoreName,
    description: isSuperAdmin ? 'Radar Loyalty Platform - Super Admin' : `نظام الولاء والمكافآت الذكي - ${exactStoreName}`,
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
    console.warn('Dynamic manifest blob error, fallback to API:', e);
    const apiManifestUrl = isSuperAdmin
      ? '/api/manifest?portal=super-admin'
      : slug
      ? `/api/manifest?store=${encodeURIComponent(slug)}&portal=${encodeURIComponent(portal)}`
      : `/api/manifest?portal=${encodeURIComponent(portal)}`;
    let manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
    if (manifestLink) {
      manifestLink.href = apiManifestUrl;
    }
  }

  // 3. Apple Touch Icon for iOS Safari Home Screen
  let appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement;
  if (!appleTouchIcon) {
    appleTouchIcon = document.createElement('link');
    appleTouchIcon.rel = 'apple-touch-icon';
    document.head.appendChild(appleTouchIcon);
  }
  appleTouchIcon.href = isSuperAdmin || !slug ? '/icon-192.svg' : `${httpIconUrl}&size=180`;

  // 4. Favicon
  let favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
  if (!favicon) {
    favicon = document.createElement('link');
    favicon.rel = 'icon';
    document.head.appendChild(favicon);
  }
  favicon.href = isSuperAdmin || !slug ? '/icon-192.svg' : `${httpIconUrl}&size=192`;

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
  if (slug && !isSuperAdmin) {
    try {
      localStorage.setItem('radar_last_store_slug', slug);
      localStorage.setItem('radar_last_portal', portal);
      localStorage.setItem('radar_last_store_name', exactStoreName);
    } catch (e) {
      // ignore
    }
  }
}
