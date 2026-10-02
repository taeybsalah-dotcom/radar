import { createClient } from '@supabase/supabase-js';

declare const process: any;

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://zagpvflyizbmzsbmhnts.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Bx1NGkxLxilvNA3RgcioVQ_t8zlk72H';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const manifestStoreCache = new Map<string, { data: any; timestamp: number }>();

export default async function handler(req: any, res: any) {
  try {
    let storeSlug = '';
    let portal = 'customer';

    if (req.query && req.query.store) {
      storeSlug = String(req.query.store).trim();
    }
    if (req.query && req.query.portal) {
      portal = String(req.query.portal).trim();
    }

    if (!storeSlug && req.url) {
      try {
        const parsed = new URL(req.url, 'http://localhost');
        storeSlug = (parsed.searchParams.get('store') || '').trim();
        if (!req.query?.portal && parsed.searchParams.get('portal')) {
          portal = parsed.searchParams.get('portal')!.trim();
        }
      } catch (e) {}
    }

    let hostHeader = '';
    try {
      hostHeader = (req.headers['x-forwarded-host'] || req.headers['host'] || '').split(':')[0].toLowerCase().trim();
    } catch (e) {}

    if (!storeSlug && hostHeader && !hostHeader.includes('localhost') && !hostHeader.includes('127.0.0.1') && !hostHeader.includes('vercel.app')) {
      const cachedHost = manifestStoreCache.get(`host_${hostHeader}`);
      if (cachedHost && Date.now() - cachedHost.timestamp < 300000) {
        storeSlug = cachedHost.data?.slug || cachedHost.data?.id || '';
      } else {
        try {
          const { data: domainStore } = await supabase
            .from('stores')
            .select('*')
            .eq('custom_domain', hostHeader)
            .limit(1)
            .maybeSingle();

          if (domainStore) {
            storeSlug = domainStore.slug || domainStore.id;
            manifestStoreCache.set(`host_${hostHeader}`, { data: domainStore, timestamp: Date.now() });
          }
        } catch (e) {}
      }
    }

    let storeName = 'Radar Loyalty Engine';
    let storeShortName = 'Radar';
    let primaryColor = '#0B0F17';
    let secondaryColor = '#F59E0B';
    let logoUrl = '';
    let foundSlug = storeSlug;

    if (storeSlug) {
      const cacheKey = storeSlug.toLowerCase().trim();
      const cached = manifestStoreCache.get(cacheKey);

      let storeData: any = null;
      if (cached && Date.now() - cached.timestamp < 300000) {
        storeData = cached.data;
      } else {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeSlug);
        let query = supabase.from('stores').select('*');
        if (isUUID) {
          query = query.eq('id', storeSlug);
        } else {
          query = query.eq('slug', storeSlug.toLowerCase());
        }

        const { data } = await query.limit(1).maybeSingle();
        storeData = data;
        if (storeData) {
          manifestStoreCache.set(cacheKey, { data: storeData, timestamp: Date.now() });
          if (storeData.slug) manifestStoreCache.set(storeData.slug.toLowerCase(), { data: storeData, timestamp: Date.now() });
          if (storeData.id) manifestStoreCache.set(storeData.id.toLowerCase(), { data: storeData, timestamp: Date.now() });
        }
      }

      if (storeData) {
        storeName = storeData.name || storeName;
        storeShortName = storeData.name || storeShortName;
        primaryColor = storeData.primary_color || primaryColor;
        secondaryColor = storeData.secondary_color || secondaryColor;
        logoUrl = storeData.logo_url || '';
        foundSlug = storeData.slug || storeSlug;
      }
    }

    let portalTitle = storeName;
    if (portal === 'super-admin') {
      portalTitle = 'RADAR';
      storeName = 'RADAR';
    } else if (portal === 'partner') {
      portalTitle = 'بوابة الشريك | RADAR';
      storeName = 'بوابة الشريك | RADAR';
    } else if (portal === 'join') {
      portalTitle = 'بوابة التسجيل | RADAR';
      storeName = 'بوابة التسجيل | RADAR';
    } else if (portal === 'onboarding') {
      portalTitle = 'بوابة إعداد المتجر | RADAR';
      storeName = 'بوابة إعداد المتجر';
    } else if (portal === 'cashier') {
      portalTitle = `${storeName} - الكاشير`;
    } else if (portal === 'admin') {
      portalTitle = storeName;
    } else if (portal === 'customer') {
      portalTitle = storeName;
    }

    const startUrl = foundSlug
      ? `/?store=${encodeURIComponent(foundSlug)}&portal=${encodeURIComponent(portal)}`
      : `/?portal=${encodeURIComponent(portal)}`;

    const httpIconUrl = foundSlug
      ? `/api/icon?store=${encodeURIComponent(foundSlug)}`
      : '/icon-192.svg';

    const icons: any[] = [
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

    const manifest = {
      name: storeName,
      short_name: storeShortName,
      description: `نظام الولاء والمكافآت الذكي - ${storeName}`,
      start_url: startUrl,
      scope: '/',
      display: 'standalone',
      background_color: primaryColor,
      theme_color: secondaryColor,
      orientation: 'portrait',
      icons: icons,
    };

    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');

    return res.status(200).json(manifest);
  } catch (err: any) {
    console.error('Error serving dynamic manifest:', err);
    return res.status(200).json({
      name: 'Radar Loyalty Engine',
      short_name: 'Radar',
      start_url: '/',
      display: 'standalone',
      background_color: '#0B0F17',
      theme_color: '#F59E0B',
      icons: [
        {
          src: '/icon-192.svg',
          sizes: '192x192',
          type: 'image/svg+xml',
          purpose: 'any maskable',
        },
        {
          src: '/icon-512.svg',
          sizes: '512x512',
          type: 'image/svg+xml',
          purpose: 'any maskable',
        },
      ],
    });
  }
}
