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

async function callGeminiVision(
  apiKey: string,
  base64Data: string,
  mimeType: string,
  modelName: string
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
  return {
    categories: Array.isArray(parsed.categories) ? parsed.categories : [],
    items: Array.isArray(parsed.items) ? parsed.items : [],
  };
}

async function handleParseMenu(request: Request, env: Env): Promise<Response> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    return jsonResponse(
      {
        success: false,
        code: 'GEMINI_API_KEY_MISSING',
        error: 'مفتاح Gemini API غير مضبوط في السيرفر. يرجى تفعيله عبر Cloudflare Secret.',
      },
      503
    );
  }

  try {
    const body: any = await request.json();
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

    // Try primary requested model: gemini-2.5-flash
    // If Google returns 404/not-found, fallback seamlessly to gemini-2.0-flash then gemini-1.5-flash
    const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
    let lastError: any = null;
    let result: ParsedMenuResult | null = null;

    for (const model of modelsToTry) {
      try {
        result = await callGeminiVision(apiKey, imageBase64, mimeType, model);
        if (result) break;
      } catch (err: any) {
        lastError = err;
        // If 404 (model not available in current region/API version), try next model
        if (err?.status === 404 || String(err?.message).includes('not found')) {
          continue;
        }
        // If other error (e.g. invalid key or bad payload), stop and report
        throw err;
      }
    }

    if (!result) {
      throw lastError || new Error('تعذر معالجة الصورة بنماذج Gemini المتاحة.');
    }

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

    // Default to serving static assets
    return env.ASSETS.fetch(request);
  },
};
