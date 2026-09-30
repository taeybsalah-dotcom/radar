import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

declare const process: any;

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://zagpvflyizbmzsbmhnts.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Bx1NGkxLxilvNA3RgcioVQ_t8zlk72H';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default async function handler(req: any, res: any) {
  try {
    let storeSlug = '';
    if (req.query && req.query.store) {
      storeSlug = String(req.query.store).trim();
    }
    if (!storeSlug && req.url) {
      try {
        const parsed = new URL(req.url, 'http://localhost');
        storeSlug = (parsed.searchParams.get('store') || '').trim();
      } catch (e) {}
    }

    const rawSize = req.query?.size ? parseInt(String(req.query.size), 10) : 180;
    const targetSize = !isNaN(rawSize) && rawSize >= 64 && rawSize <= 1024 ? rawSize : 180;

    if (!storeSlug) {
      return await sendDefaultIcon(res, targetSize);
    }

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeSlug);
    let query = supabase.from('stores').select('logo_url, name, primary_color');
    if (isUUID) {
      query = query.or(`slug.ilike.${storeSlug},id.eq.${storeSlug}`);
    } else {
      query = query.or(`slug.ilike.${storeSlug},name.ilike.${storeSlug}`);
    }

    const { data: storeData } = await query.limit(1).maybeSingle();
    const logoUrl = storeData?.logo_url;

    if (!logoUrl) {
      return await sendDefaultIcon(res, targetSize);
    }

    let inputBuffer: Buffer | null = null;

    if (logoUrl.startsWith('data:image/')) {
      const parts = logoUrl.split(',');
      if (parts.length === 2) {
        inputBuffer = Buffer.from(parts[1], 'base64');
      }
    } else if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
      const fetchRes = await fetch(logoUrl);
      if (fetchRes.ok) {
        const arrayBuf = await fetchRes.arrayBuffer();
        inputBuffer = Buffer.from(arrayBuf);
      }
    }

    if (!inputBuffer) {
      return await sendDefaultIcon(res, targetSize);
    }

    // Convert input image (WebP/JPG/PNG/SVG) to crisp PNG formatted for Apple Touch Icon / PWA Home Screen
    const innerPadding = Math.round(targetSize * 0.88);
    const innerBuffer = await sharp(inputBuffer)
      .resize(innerPadding, innerPadding, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      })
      .png()
      .toBuffer();

    const finalPngBuffer = await sharp({
      create: {
        width: targetSize,
        height: targetSize,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite([{ input: innerBuffer, gravity: 'center' }])
      .png({ quality: 95, compressionLevel: 8 })
      .toBuffer();

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', finalPngBuffer.length);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('Access-Control-Allow-Origin', '*');

    return res.status(200).send(finalPngBuffer);
  } catch (err: any) {
    console.error('Error generating dynamic PNG icon:', err);
    return await sendDefaultIcon(res, 180);
  }
}

async function sendDefaultIcon(res: any, size: number) {
  try {
    const svgContent = `
      <svg width="${size}" height="${size}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <rect width="100" height="100" rx="22" fill="#0B0F17"/>
        <text x="50" y="65" font-size="50" text-anchor="middle" fill="#F59E0B">⚡</text>
      </svg>
    `;
    const defaultPng = await sharp(Buffer.from(svgContent)).png().toBuffer();
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', defaultPng.length);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).send(defaultPng);
  } catch (e) {
    return res.redirect(302, '/icon-192.svg');
  }
}
