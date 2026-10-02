import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

declare const process: any;

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://zagpvflyizbmzsbmhnts.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Bx1NGkxLxilvNA3RgcioVQ_t8zlk72H';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function getHtmlTemplate(): string {
  try {
    const cwd = process.cwd ? process.cwd() : '.';
    const distPath = path.join(cwd, 'dist', 'index.html');
    if (fs.existsSync(distPath)) {
      return fs.readFileSync(distPath, 'utf-8');
    }
    const rootPath = path.join(cwd, 'index.html');
    if (fs.existsSync(rootPath)) {
      return fs.readFileSync(rootPath, 'utf-8');
    }
  } catch (e) {
    // ignore
  }

  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const p1 = path.join(__dirname, '..', 'dist', 'index.html');
    if (fs.existsSync(p1)) return fs.readFileSync(p1, 'utf-8');
    const p2 = path.join(__dirname, '..', 'index.html');
    if (fs.existsSync(p2)) return fs.readFileSync(p2, 'utf-8');
  } catch (e) {
    // ignore
  }

  return `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="/icon-192.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>Radar</title>
    <link rel="manifest" href="/api/manifest" id="app-manifest" />
    <meta name="theme-color" content="#0B0F17" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Radar" />
    <meta name="mobile-web-app-capable" content="yes" />
    <link rel="apple-touch-icon" href="/icon-192.svg" />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  </head>
  <body class="bg-[#0B0F17] text-slate-100 font-sans min-h-screen antialiased selection:bg-amber-500 selection:text-black">
    <div id="root"></div>
  </body>
</html>`;
}

const ssrStoreCache = new Map<string, { data: any; timestamp: number }>();

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
      const cachedDomain = ssrStoreCache.get(`host_${hostHeader}`);
      if (cachedDomain && Date.now() - cachedDomain.timestamp < 300000) {
        storeSlug = cachedDomain.data?.slug || cachedDomain.data?.id || '';
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
            ssrStoreCache.set(`host_${hostHeader}`, { data: domainStore, timestamp: Date.now() });
          }
        } catch (e) {}
      }
    }

    let storeName = 'رادار | RADAR للولاء الذكي';
    let logoUrl = '/icon-192.svg';
    let primaryColor = '#0B0F17';
    let secondaryColor = '#F59E0B';
    let foundSlug = storeSlug;

    if (portal === 'super-admin') {
      storeName = 'RADAR';
      foundSlug = '';
    } else if (portal === 'partner') {
      storeName = 'بوابة الشريك | RADAR';
      foundSlug = '';
    } else if (portal === 'join') {
      storeName = 'بوابة التسجيل | RADAR';
      foundSlug = '';
    } else if (portal === 'onboarding') {
      storeName = 'بوابة إعداد المتجر | RADAR';
      foundSlug = '';
    } else if (portal === 'admin' && !storeSlug) {
      storeName = 'لوحة التاجر';
      foundSlug = '';
    } else if (portal === 'cashier' && !storeSlug) {
      storeName = 'نظام الكاشير';
      foundSlug = '';
    } else if (!storeSlug) {
      storeName = 'بوابة التسجيل | RADAR';
      foundSlug = '';
    } else if (storeSlug) {
      const cacheKey = storeSlug.toLowerCase().trim();
      const cached = ssrStoreCache.get(cacheKey);

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
          ssrStoreCache.set(cacheKey, { data: storeData, timestamp: Date.now() });
          if (storeData.slug) ssrStoreCache.set(storeData.slug.toLowerCase(), { data: storeData, timestamp: Date.now() });
          if (storeData.id) ssrStoreCache.set(storeData.id.toLowerCase(), { data: storeData, timestamp: Date.now() });
        }
      }

      if (storeData) {
        storeName = storeData.name || storeName;
        logoUrl = storeData.logo_url || logoUrl;
        primaryColor = storeData.primary_color || primaryColor;
        secondaryColor = storeData.secondary_color || secondaryColor;
        foundSlug = storeData.slug || storeSlug;
      } else {
        storeName = storeSlug;
      }
    }

    let rawHtml = getHtmlTemplate();
    const timestamp = Date.now();

    const manifestUrl = foundSlug
      ? `/api/manifest?store=${encodeURIComponent(foundSlug)}&portal=${encodeURIComponent(portal)}&t=${timestamp}`
      : `/api/manifest?portal=${encodeURIComponent(portal)}&t=${timestamp}`;

    const httpIconUrl = (portal === 'super-admin' || !foundSlug)
      ? '/icon-192.svg'
      : `/api/icon?store=${encodeURIComponent(foundSlug)}&v=${timestamp}`;

    const appleIconHref = foundSlug
      ? `${httpIconUrl}&size=180`
      : '/icon-192.svg';
    const faviconHref = foundSlug
      ? `${httpIconUrl}&size=192`
      : '/icon-192.svg';

    // 1. Replace <title>
    rawHtml = rawHtml.replace(/<title>.*?<\/title>/i, `<title>${storeName}</title>`);

    // 2. Replace or inject <meta name="apple-mobile-web-app-title">
    if (rawHtml.includes('apple-mobile-web-app-title')) {
      rawHtml = rawHtml.replace(
        /<meta\s+name=["']apple-mobile-web-app-title["'][^>]*>/i,
        `<meta name="apple-mobile-web-app-title" content="${storeName}" />`
      );
    } else {
      rawHtml = rawHtml.replace(
        /<head>/i,
        `<head>\n    <meta name="apple-mobile-web-app-title" content="${storeName}" />`
      );
    }

    // 3. Replace or inject <link rel="apple-touch-icon"> (Clean PNG URL for iOS Safari)
    if (rawHtml.includes('apple-touch-icon')) {
      rawHtml = rawHtml.replace(
        /<link\s+rel=["']apple-touch-icon["'][^>]*>/i,
        `<link rel="apple-touch-icon" sizes="180x180" href="${appleIconHref}" />`
      );
    } else {
      rawHtml = rawHtml.replace(
        /<head>/i,
        `<head>\n    <link rel="apple-touch-icon" sizes="180x180" href="${appleIconHref}" />`
      );
    }

    // 4. Replace or inject <link rel="manifest">
    if (rawHtml.includes('rel="manifest"') || rawHtml.includes("rel='manifest'")) {
      rawHtml = rawHtml.replace(
        /<link\s+rel=["']manifest["'][^>]*>/i,
        `<link rel="manifest" href="${manifestUrl}" id="app-manifest" />`
      );
    } else {
      rawHtml = rawHtml.replace(
        /<head>/i,
        `<head>\n    <link rel="manifest" href="${manifestUrl}" id="app-manifest" />`
      );
    }

    // 5. Replace or inject <meta name="theme-color">
    if (rawHtml.includes('theme-color')) {
      rawHtml = rawHtml.replace(
        /<meta\s+name=["']theme-color["'][^>]*>/i,
        `<meta name="theme-color" content="${secondaryColor}" />`
      );
    }

    // 6. Replace favicon
    rawHtml = rawHtml.replace(
      /<link\s+rel=["']icon["'][^>]*>/i,
      `<link rel="icon" href="${faviconHref}" />`
    );

    // Real-time HTML Delivery: Zero edge/browser cache for HTML to guarantee instant delivery of newest JS bundle hashes
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=0, must-revalidate');

    return res.status(200).send(rawHtml);
  } catch (err: any) {
    console.error('SSR Handler Error:', err);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=0, must-revalidate');
    return res.status(200).send(getHtmlTemplate());
  }
}
