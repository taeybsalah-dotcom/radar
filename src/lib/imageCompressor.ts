/**
 * 🖼️ Image Compressor + Uploader (HTML5 Canvas Client-Side Auto-Compression)
 * يقوم بضغط وتصغير أي صورة مرفوعة من الجوال أو الكمبيوتر إلى أصغر حجم ممكن
 * مع الحفاظ التام على جودة العرض لتوفير الذاكرة وسرعة التحميل.
 *
 * 🛡️ EGRESS GUARD: the compressed image is uploaded to the public Supabase Storage
 * bucket `store-assets` and ONLY the public URL is returned. Base64 data URLs must
 * never be stored in the database. (`dataUrl` keeps its historical name so existing
 * callers keep working, but it now always holds an https:// URL.)
 */

import { getSupabaseClient } from './supabase';

export const STORE_ASSETS_BUCKET = 'store-assets';

export interface CompressionResult {
  /** Public CDN URL of the uploaded image (never a base64 data URL). */
  dataUrl: string;
  url?: string;
  originalSizeKB: number;
  compressedSizeKB: number;
  reductionPercentage: number;
  savingsPercent: number;
}

/**
 * Builds the public URL of a Storage object. If VITE_ASSET_CDN_BASE is set
 * (a Cloudflare-proxied hostname in front of the Supabase project, e.g.
 * https://cdn.example.com) it is used so the image is served from the edge cache.
 */
export function getStoreAssetPublicUrl(path: string): string {
  const cdn = ((import.meta as any).env?.VITE_ASSET_CDN_BASE || '').replace(/\/+$/, '');
  if (cdn) return `${cdn}/storage/v1/object/public/${STORE_ASSETS_BUCKET}/${path}`;
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase client not available');
  return supabase.storage.from(STORE_ASSETS_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function sha1Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-1', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Uploads a blob with a content-hash filename (immutable => cacheable for a year). */
export async function uploadImageBlob(blob: Blob, folder: string = 'misc'): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('تعذر الاتصال بالتخزين السحابي، لم يتم رفع الصورة');
  const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/jpeg' ? 'jpg' : 'webp';
  const hash = await sha1Hex(blob);
  const safeFolder = (folder || 'misc').replace(/[^a-zA-Z0-9_-]/g, '_');
  const path = `${safeFolder}/${hash}.${ext}`;
  const { error } = await supabase.storage.from(STORE_ASSETS_BUCKET).upload(path, blob, {
    contentType: blob.type,
    cacheControl: '31536000',
    upsert: true,
  });
  if (error) throw new Error(`فشل رفع الصورة: ${error.message}`);
  return getStoreAssetPublicUrl(path);
}

export function compressImage(
  file: File,
  maxWidth: number = 500,
  maxHeight: number = 500,
  quality: number = 0.85,
  format: 'image/png' | 'image/webp' | 'image/jpeg' = 'image/png',
  folder: string = 'misc'
): Promise<CompressionResult> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let width = img.width;
      let height = img.height;

      // حساب الأبعاد الجديدة مع الحفاظ على نسبة العرض للارتفاع (Aspect Ratio)
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      // الرسم على الـ Canvas وتوليد الصورة المضغوطة
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }

      // تنعيم الحواف وتحسين دقة الرسم
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      // التصدير كملف Blob (وليس Base64) ثم الرفع إلى Supabase Storage
      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            reject(new Error('Failed to compress image'));
            return;
          }
          try {
            const url = await uploadImageBlob(blob, folder);

            // حساب الأحجام وتوفير المساحة
            const originalSizeKB = Math.round(file.size / 1024);
            const compressedSizeKB = Math.round(blob.size / 1024);
            const reductionPercentage = Math.max(
              0,
              Math.round(((originalSizeKB - compressedSizeKB) / Math.max(originalSizeKB, 1)) * 100)
            );

            resolve({
              dataUrl: url,
              url,
              originalSizeKB,
              compressedSizeKB,
              reductionPercentage,
              savingsPercent: reductionPercentage,
            });
          } catch (err) {
            reject(err);
          }
        },
        format,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image file'));
    };
    img.src = objectUrl;
  });
}
