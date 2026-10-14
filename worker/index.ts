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
  modelName: string
): Promise<ParsedMenuResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const prompt = `استخرج أصناف المنيو بدقة وسرعة:
لكل صنف استخرج:
- name: اسم الصنف بدقة.
- category: اسم القسم المناسب.
- price: السعر المالي كرقم إنجليزي صريح (مثلاً 15 أو 24.5).
  * إلزام: حوّل أي أرقام عربية (مثل ١٥، ٢٠) إلى أرقام إنجليزية صريحة (15, 20).
  * تفريق صارم: تجاهل تماماً أرقام السعرات الحرارية (سعرة / كالوري / Cal / Kcal / 🔥 / أو الأرقام الكبيرة مثل 350 و 600) ولا تضعها في السعر! السعر هو الثمن المالي فقط.
  * احذف أي كلمة عملة (ر.س أو ريال أو SAR) وضع الرقم فقط.
- description: نص فارغ "" إذا لم يكن مكتوباً بالمنيو.
- item_type: "product" أو "service".
لا تؤلف أي وصف من عندك أبداً.`;

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
      maxOutputTokens: 4096,
      thinkingConfig: {
        thinkingBudget: 0,
      },
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          categories: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'الأقسام',
          },
          items: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING' },
                category: { type: 'STRING' },
                price: { type: 'NUMBER', description: 'السعر المالي كرقم مجرد' },
                description: { type: 'STRING' },
                item_type: {
                  type: 'STRING',
                  enum: ['product', 'service'],
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

    // Use gemini-3.8-flash exclusively as requested
    const result = await callGeminiVision(apiKey, imageBase64, mimeType, 'gemini-3.8-flash');

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
