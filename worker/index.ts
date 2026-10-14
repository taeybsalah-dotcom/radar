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

  const prompt = `استخرج أصناف المنيو بدقة وسرعة وبدون تفكير مطول:
لكل صنف استخرج:
- name: اسم الصنف
- category: اسم القسم
- price: السعر كرقم مجرد (إذا غير موجود 0)
- description: نص فارغ "" إذا لم يكن مكتوباً بالمنيو
- item_type: "product" أو "service"
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
                price: { type: 'NUMBER' },
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
