export interface Env {
  ASSETS: { fetch: typeof fetch };
  GEMINI_API_KEY?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
    },
  });
}

interface ParsedMenuItem {
  name: string;
  category: string;
  price: number;
  description?: string;
  item_type: 'product' | 'service';
}

interface ParsedMenuResult {
  categories: string[];
  items: ParsedMenuItem[];
}

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

async function callGeminiVision(
  apiKey: string,
  base64Data: string,
  mimeType: string,
  modelName: string = 'gemini-flash-lite-latest'
): Promise<ParsedMenuResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const prompt = `أنت خبير محترف في رقمنة قوائم الطعام والخدمات (Menu Digitizer).
قم بتحليل صورة المنيو بدقة واستخرج كافة الأصناف والمنتجات والخدمات.
لكل صنف استخرج:
1. name: اسم الصنف بدقة كما هو مكتوب.
2. category: اسم القسم المناسب (مثل: أطباق رئيسية، برجر، مقبلات، مشروبات، حلويات، خدمات عامة).
3. price: السعر كرقم مجرد فقط (مثلاً 25 أو 18.5) بدون علامات عملة، وإذا لم يوجد سعر ضعه 0.
4. description: وصف الصنف أو مكوناته إن وجدت، أو اتركه فارغاً.
5. item_type: حدد هل هو "product" (طعام، مشروبات، منتجات) أو "service" (خدمات مواعيد، حلاقة، مساج، إلخ).
استخرج أيضاً قائمة بجميع الأقسام المميزة في categories.`;

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data,
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
    const errorText = await response.text();
    let errJson: any = null;
    try {
      errJson = JSON.parse(errorText);
    } catch {}
    const msg = errJson?.error?.message || errorText;
    const err = new Error(`Gemini API error (${response.status}): ${msg}`);
    (err as any).status = response.status;
    throw err;
  }

  const resJson: any = await response.json();
  const rawText = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error('لم يتم استخراج أي بيانات من الصورة، يرجى التأكد من وضوح المنيو.');
  }

  const parsed = JSON.parse(rawText) as ParsedMenuResult;
  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
  return {
    categories: Array.isArray(parsed.categories) ? parsed.categories : [],
    items: rawItems.map((it: any) => ({
      name: String(it.name || '').trim(),
      category: String(it.category || 'عام').trim(),
      price: cleanPrice(it.price),
      description: it.description ? String(it.description).trim() : '',
      item_type: it.item_type === 'service' ? 'service' : 'product',
    })),
  };
}

async function handleParseMenu(request: Request, env: Env): Promise<Response> {
  let body: any = null;
  try {
    body = await request.json();
  } catch {}

  const apiKey = (body?.apiKey && typeof body.apiKey === 'string' && body.apiKey.trim())
    ? body.apiKey.trim()
    : env.GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    return jsonResponse(
      {
        success: false,
        code: 'GEMINI_API_KEY_MISSING',
        error: 'مفتاح Gemini API غير مضبوط في السيرفر. يرجى تفعيله عبر مركز التكاملات أو Cloudflare Secret.',
      },
      503
    );
  }

  try {
    let imageBase64: string = body?.imageBase64 || '';
    const mimeType: string = body?.mimeType || 'image/jpeg';

    if (!imageBase64 || imageBase64.length < 50) {
      return jsonResponse(
        {
          success: false,
          code: 'INVALID_IMAGE',
          error: 'لم يتم استلام بيانات صورة صالحة للتحليل.',
        },
        400
      );
    }

    // Strip prefix if client included it
    if (imageBase64.includes(',')) {
      imageBase64 = imageBase64.split(',')[1];
    }

    const modelName = body?.model || 'gemini-flash-lite-latest';
    const result = await callGeminiVision(apiKey, imageBase64, mimeType, modelName);

    return jsonResponse({
      success: true,
      categories: result.categories,
      items: result.items,
    });
  } catch (error: any) {
    return jsonResponse(
      {
        success: false,
        error: error?.message || 'حدث خطأ أثناء معالجة المنيو بالذكاء الاصطناعي.',
      },
      500
    );
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // AI Menu Parse Route
    if (url.pathname === '/api/ai/parse-menu' && request.method === 'POST') {
      return handleParseMenu(request, env);
    }

    // Serve static assets with anti-stale caching rules
    const response = await env.ASSETS.fetch(request);

    // If it's a pre-hashed build asset (/assets/*.js, /assets/*.css), cache aggressively
    const pathname = url.pathname.toLowerCase();
    const isHashedAsset = pathname.startsWith('/assets/') && (pathname.endsWith('.js') || pathname.endsWith('.css'));

    const headers = new Headers(response.headers);

    if (isHashedAsset) {
      // 1 year cache for immutable content-hashed assets
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      // HTML, SPA routes, and root MUST NEVER be cached so browsers always fetch newest index.html & chunk hashes
      headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      headers.set('Pragma', 'no-cache');
      headers.set('Expires', '0');
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
