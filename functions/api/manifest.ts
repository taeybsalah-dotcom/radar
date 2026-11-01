// Dynamic PWA Web Manifest (Cloudflare Pages Function)
// المسار: GET /api/manifest

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function onRequestGet(context: any): Promise<Response> {
  const { request } = context;
  const url = new URL(request.url);

  const isSadeem = url.hostname.includes('sdeemalathr') || url.hostname.includes('sadim');
  const brandName = isSadeem ? 'سديم الأثر' : 'رادار';
  const themeColor = isSadeem ? '#10B981' : '#F59E0B';

  const manifest = {
    name: `منصة ${brandName} للولاء الذكي`,
    short_name: brandName,
    description: `منصة ${brandName} لإدارة نقاط البيع وبرامج الولاء والمكافآت الذكية`,
    start_url: `${url.origin}/`,
    scope: `${url.origin}/`,
    display: 'standalone',
    background_color: '#0B0F17',
    theme_color: themeColor,
    icons: [
      {
        src: `${url.origin}/favicon.png`,
        sizes: '192x192 512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    status: 200,
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      ...CORS_HEADERS,
    },
  });
}
