/**
 * 🧠 AI Menu Auto-Builder Services
 * معالجة وضغط صورة المنيو محلياً وإرسالها لمسار الذكاء الاصطناعي الخلفي
 * مع حفظ الأصناف والأقسام الجديدة آلياً وأمان تام.
 */

import { LoyaltyService } from './supabase';
import { CatalogItem } from '../types';

export interface ParsedMenuItem {
  id?: string;
  name: string;
  category: string;
  price: number;
  description?: string;
  item_type: 'product' | 'service';
  selected?: boolean;
}

export interface ParseMenuResponse {
  success: boolean;
  categories: string[];
  items: ParsedMenuItem[];
  code?: string;
  error?: string;
}

export interface CompressedImageResult {
  base64: string;
  mimeType: string;
  previewUrl: string;
  sizeKB: number;
}

/**
 * تنظيف السعر واستخراجه كرقم دقيق مع تحويل الأرقام العربية إلى إنجليزية
 */
export function cleanPrice(raw: any): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number' && !isNaN(raw)) return raw;

  let str = String(raw).trim();

  // تحويل الأرقام العربية والشرقية (٠-٩) إلى أرقام إنجليزية (0-9)
  const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  const persianNumerals = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  for (let i = 0; i < 10; i++) {
    str = str.replace(new RegExp(arabicNumerals[i], 'g'), String(i));
    str = str.replace(new RegExp(persianNumerals[i], 'g'), String(i));
  }

  // استبدال الفواصل العشرية العربية
  str = str.replace(/٫/g, '.').replace(/,/g, '.');

  // إزالة كلمات ورموز العملات
  str = str.replace(/(ر\.س|رس|ريال|ريالات|SAR|SR|USD|\$|EUR|AED)/gi, '');

  // استخراج الرقم
  const match = str.match(/(\d+(?:\.\d+)?)/);
  if (match) {
    const num = parseFloat(match[1]);
    return isNaN(num) ? 0 : num;
  }
  return 0;
}

/**
 * ضغط الصورة في المتصفح قبل إرسالها (Client-Side Compression):
 * أبعاد لا تتجاوز 1600px، وحجم لا يتجاوز 1MB للحفاظ على سرعة الرفع وأداء Cloudflare Worker
 */
export async function compressMenuImageForAi(file: File): Promise<CompressedImageResult> {
  const MAX_DIMENSION = 1000;
  const QUALITY = 0.6;

  return new Promise((resolve, reject) => {
    // إذا كان الملف PDF، نرفضه بلطف لأن المعالجة الحالية للصور
    if (file.type === 'application/pdf') {
      reject(new Error('يرجى التقاط أو رفع صورة المنيو (JPG أو PNG أو WebP) بدلاً من PDF لضمان دقة الرؤية.'));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let width = img.width;
      let height = img.height;

      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width > height) {
          height = Math.round((height * MAX_DIMENSION) / width);
          width = MAX_DIMENSION;
        } else {
          width = Math.round((width * MAX_DIMENSION) / height);
          height = MAX_DIMENSION;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('تعذر إنشاء بيئة معالجة الصورة'));
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      const mimeType = 'image/jpeg';
      const dataUrl = canvas.toDataURL(mimeType, QUALITY);
      const base64Data = dataUrl.split(',')[1] || '';

      // حساب الحجم التقريبي بالكيلوبايت
      const sizeKB = Math.round((base64Data.length * 3) / 4 / 1024);

      resolve({
        base64: base64Data,
        mimeType,
        previewUrl: dataUrl,
        sizeKB,
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('تعذر قراءة ملف الصورة.'));
    };

    img.src = objectUrl;
  });
}

function sanitizeGeminiModel(rawModel?: string): string {
  if (!rawModel || typeof rawModel !== 'string') return 'gemini-3.8-flash';
  const trimmed = rawModel.trim().toLowerCase();
  if (
    trimmed.includes('1.5') ||
    trimmed.includes('2.0') ||
    trimmed.includes('2.5') ||
    trimmed.includes('3.1') ||
    trimmed === 'gemini-flash-latest' ||
    trimmed === 'gemini-flash-lite-latest'
  ) {
    return 'gemini-3.8-flash';
  }
  return trimmed;
}

async function callGeminiDirectClient(
  apiKey: string,
  base64Data: string,
  mimeType: string,
  modelName: string
): Promise<ParseMenuResponse> {
  const cleanModel = sanitizeGeminiModel(modelName);
  const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${apiKey}`;

  const prompt = `أنت خبير محترف في رقمنة وقراءة قوائم الطعام والخدمات (Menu Digitizer).
قم بتحليل صورة المنيو بدقة بالغة واستخرج كافة الأصناف والمنتجات والخدمات الموجودة.
لكل صنف استخرج:
1. name: اسم الصنف بدقة كما هو مكتوب بالعربية أو الإنجليزية.
2. category: اسم القسم المناسب (مثل: أطباق رئيسية، برجر، مقبلات، مشروبات، حلويات، خدمات عامة، إلخ).
3. price: السعر كرقم مجرد فقط بدون علامات العملة، وإذا لم يوجد سعر ضعه 0.
4. description: وصف الصنف أو مكوناته إن وجدت، أو اتركه فارغاً.
5. item_type: حدد هل هو "product" (طعام، مشروبات، سلع) أو "service" (خدمات، غسيل، حلاقة، مساج، إلخ).
استخرج أيضاً قائمة بجميع الأقسام الفرعية المميزة في categories.`;

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: mimeType,
              data: cleanBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          categories: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'قائمة الأقسام المستخرجة من المنيو',
          },
          items: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING', description: 'اسم الصنف' },
                category: { type: 'STRING', description: 'القسم أو التصنيف' },
                price: { type: 'NUMBER', description: 'السعر كرقم مجرد' },
                description: { type: 'STRING', description: 'الوصف أو المكونات' },
                item_type: {
                  type: 'STRING',
                  enum: ['product', 'service'],
                  description: 'نوع الصنف',
                },
              },
              required: ['name', 'category', 'price', 'item_type'],
            },
          },
        },
        required: ['categories', 'items'],
      },
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text();
    let errJson: any = null;
    try { errJson = JSON.parse(errText); } catch {}
    const msg = errJson?.error?.message || errText;
    throw new Error(`خطأ خدمة الذكاء الاصطناعي (${response.status}): ${msg}`);
  }

  const resJson: any = await response.json();
  const rawText = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error('لم يتم استخراج أي بيانات من الصورة، يرجى التأكد من وضوح الصورة وتجربة زاوية أخرى.');
  }

  const parsed = JSON.parse(rawText);
  const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];

  const items: ParsedMenuItem[] = rawItems.map((it: any, index: number) => ({
    id: `ai-item-${Date.now()}-${index}`,
    name: String(it.name || '').trim(),
    category: String(it.category || 'عام').trim(),
    price: cleanPrice(it.price),
    description: it.description ? String(it.description).trim() : undefined,
    item_type: it.item_type === 'service' ? 'service' : 'product',
    selected: true,
  }));

  const categories: string[] =
    Array.isArray(parsed?.categories) && parsed.categories.length > 0
      ? parsed.categories
      : Array.from(new Set(items.map((i) => i.category)));

  return {
    success: true,
    categories,
    items,
  };
}

/**
 * إرسال الصورة للسيرفر الخلفي /api/ai/parse-menu مع توفير بديل مباشر
 */
export async function parseMenuWithAi(
  base64Data: string,
  mimeType: string = 'image/jpeg'
): Promise<ParseMenuResponse> {
  // 1. جلب تكاملات المنصة لاستخراج المفتاح والموديل المعتمدين
  let apiKey: string | undefined;
  let model: string = 'gemini-3.8-flash';

  try {
    const integrations = await LoyaltyService.getPlatformIntegrations().catch(() => null);
    if (integrations?.gemini_api_key) {
      apiKey = integrations.gemini_api_key.trim();
    }
    if (integrations?.gemini_model) {
      model = sanitizeGeminiModel(integrations.gemini_model);
    }
  } catch {}

  // 2. إذا كان مفتاح الـ API متاحاً، ننفذ الاستدعاء المباشر عبر Google Vision API لتفادي مهلات البروكسي والسيرفر السحابي
  if (apiKey) {
    try {
      return await callGeminiDirectClient(apiKey, base64Data, mimeType, model);
    } catch (directErr: any) {
      console.warn('Direct Gemini call failed, falling back to server route:', directErr);
    }
  }

  // 3. محاولة الاستدعاء عبر مسار السيرفر الخلفي /api/ai/parse-menu
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch('/api/ai/parse-menu', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageBase64: base64Data,
        mimeType,
        apiKey,
        model,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      const resJson: any = await response.json().catch(() => ({}));
      if (resJson && resJson.success) {
        const items: ParsedMenuItem[] = (resJson.items || []).map((it: any, index: number) => ({
          id: `ai-item-${Date.now()}-${index}`,
          name: String(it.name || '').trim(),
          category: String(it.category || 'عام').trim(),
          price: cleanPrice(it.price),
          description: it.description ? String(it.description).trim() : undefined,
          item_type: it.item_type === 'service' ? 'service' : 'product',
          selected: true,
        }));

        const categories: string[] =
          Array.isArray(resJson.categories) && resJson.categories.length > 0
            ? resJson.categories
            : Array.from(new Set(items.map((i) => i.category)));

        return {
          success: true,
          categories,
          items,
        };
      } else if (resJson?.error) {
        return {
          success: false,
          categories: [],
          items: [],
          code: resJson.code,
          error: resJson.error,
        };
      }
    }
  } catch (netErr: any) {
    console.warn('Network call to /api/ai/parse-menu failed:', netErr);
  }

  return {
    success: false,
    categories: [],
    items: [],
    code: 'GEMINI_API_KEY_MISSING',
    error: 'مفتاح Gemini API غير مضبوط أو تعذر الاتصال بخدمة الذكاء الاصطناعي. يرجى تفعيله عبر مركز التكاملات في لوحة المالك.',
  };
}

/**
 * حفظ الأصناف المعتمدة دفعة واحدة مع إنشاء الأقسام الناقصة آلياً
 */
export async function batchSaveParsedMenuItems(
  storeId: string,
  items: ParsedMenuItem[],
  existingCategoryNames: string[],
  onProgress?: (current: number, total: number) => void
): Promise<{ savedCount: number; createdItems: CatalogItem[] }> {
  const selectedItems = items.filter((i) => i.selected);
  const knownCategories = new Set(existingCategoryNames.map((c) => c.trim().toLowerCase()));

  // 1. تسجيل أي قسم جديد غير موجود
  for (const item of selectedItems) {
    const catName = item.category.trim();
    if (catName && !knownCategories.has(catName.toLowerCase())) {
      try {
        await LoyaltyService.addGlobalCategory({
          store_id: storeId,
          name: catName,
          type: item.item_type,
          sort_order: knownCategories.size + 1,
        });
        knownCategories.add(catName.toLowerCase());
      } catch (e) {
        console.warn('Could not auto-register category:', catName, e);
      }
    }
  }

  // 2. حفظ كل صنف في قاعدة البيانات عبر addCatalogItem (التي تستخدم التذكرة الآمنة)
  const createdItems: CatalogItem[] = [];
  let current = 0;

  for (const item of selectedItems) {
    try {
      const created = await LoyaltyService.addCatalogItem({
        store_id: storeId,
        name: item.name,
        description: item.description || null,
        category: item.category || 'عام',
        price: Number(item.price) || 0,
        item_type: item.item_type,
        duration_minutes: item.item_type === 'service' ? 30 : undefined,
        is_available: true,
      });
      createdItems.push(created);
    } catch (err) {
      console.error('Error saving AI item:', item.name, err);
    }
    current++;
    if (onProgress) {
      onProgress(current, selectedItems.length);
    }
  }

  return {
    savedCount: createdItems.length,
    createdItems,
  };
}
