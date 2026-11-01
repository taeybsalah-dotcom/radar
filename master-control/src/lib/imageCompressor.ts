import { masterSupabase, MASTER_SUPABASE_URL } from './masterApi';

export interface CompressionResult {
  url: string;
  originalSizeKB: number;
  compressedSizeKB: number;
  savingsPercent: number;
}

const STORE_ASSETS_BUCKET = 'store-assets';

async function sha1Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-1', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function compressAndUploadLogo(
  file: File,
  maxWidth: number = 400,
  maxHeight: number = 400,
  quality: number = 0.82
): Promise<CompressionResult> {
  return new Promise((resolve, reject) => {
    const originalSizeKB = Math.round(file.size / 1024);
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = async () => {
      URL.revokeObjectURL(objectUrl);
      let width = img.width;
      let height = img.height;

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

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return reject(new Error('فشل معالجة أبعاد الصورة بالمتصفح'));
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to WebP or PNG Blob
      const format = file.type === 'image/png' ? 'image/png' : 'image/webp';
      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            return reject(new Error('فشل ضغط الصورة'));
          }

          const compressedSizeKB = Math.round(blob.size / 1024);
          const savingsPercent = Math.max(
            0,
            Math.round(((originalSizeKB - compressedSizeKB) / originalSizeKB) * 100)
          );

          try {
            const hash = await sha1Hex(blob);
            const ext = format === 'image/png' ? 'png' : 'webp';
            const filePath = `logos/${hash}.${ext}`;

            const { error: uploadError } = await masterSupabase.storage
              .from(STORE_ASSETS_BUCKET)
              .upload(filePath, blob, {
                contentType: format,
                cacheControl: '31536000',
                upsert: true,
              });

            if (uploadError) {
              // Fallback to Base64 data URL if storage upload failed
              const reader = new FileReader();
              reader.onload = () =>
                resolve({
                  url: reader.result as string,
                  originalSizeKB,
                  compressedSizeKB,
                  savingsPercent,
                });
              reader.onerror = () => reject(uploadError);
              reader.readAsDataURL(blob);
              return;
            }

            const { data: urlData } = masterSupabase.storage
              .from(STORE_ASSETS_BUCKET)
              .getPublicUrl(filePath);

            resolve({
              url: urlData.publicUrl,
              originalSizeKB,
              compressedSizeKB,
              savingsPercent,
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
      reject(new Error('الملف المحدد ليس صورة صالحة'));
    };

    img.src = objectUrl;
  });
}
