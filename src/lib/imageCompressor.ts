/**
 * 🖼️ Image Compressor Utility (HTML5 Canvas Client-Side Auto-Compression)
 * يقوم بضغط وتصغير أي صورة مرفوعة من الجوال أو الكمبيوتر إلى أصغر حجم ممكن
 * مع الحفاظ التام على جودة العرض لتوفير الذاكرة وسرعة التحميل.
 */

export interface CompressionResult {
  dataUrl: string;
  originalSizeKB: number;
  compressedSizeKB: number;
  reductionPercentage: number;
  savingsPercent: number;
}

export function compressImage(
  file: File,
  maxWidth: number = 500,
  maxHeight: number = 500,
  quality: number = 0.85,
  format: 'image/png' | 'image/webp' | 'image/jpeg' = 'image/png'
): Promise<CompressionResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
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

        // التصدير بصيغة PNG أو الصيغة المحددة
        const compressedDataUrl = canvas.toDataURL(format, quality);

        // حساب الأحجام وتوفير المساحة
        const originalSizeKB = Math.round(file.size / 1024);
        const headMatch = compressedDataUrl.match(/^data:([^;]+);base64,/);
        const headLen = headMatch ? headMatch[0].length : 0;
        const compressedSizeBytes = Math.round(((compressedDataUrl.length - headLen) * 3) / 4);
        const compressedSizeKB = Math.round(compressedSizeBytes / 1024);

        const reductionPercentage = Math.max(
          0,
          Math.round(((originalSizeKB - compressedSizeKB) / originalSizeKB) * 100)
        );

        resolve({
          dataUrl: compressedDataUrl,
          originalSizeKB,
          compressedSizeKB,
          reductionPercentage,
          savingsPercent: reductionPercentage,
        });
      };

      img.onerror = () => reject(new Error('Failed to load image file'));
      img.src = event.target?.result as string;
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
