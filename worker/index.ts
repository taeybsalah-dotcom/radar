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

  const prompt = `استخرج أصناف المنيو على شكل مصفوفة JSON مضغوطة بمفاتيح من حرف واحد فقط:
[{"n": "اسم الصنف", "c": "القسم", "p": 15}]
- n: اسم الصنف بدقة.
- c: اسم القسم المناسب.
- p: السعر المالي كرقم إنجليزي فقط (مثلاً 15 أو 24.5).
  * حوّل أي أرقام عربية إلى إنجليزية (15).
  * تجاهل السعرات الحرارية تماماً (cal/سعرة/kcal/🔥).
لا تستخرج وصفاً نهائياً.`;

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
      temperature: 0,
      maxOutputTokens: 8192,
      thinkingConfig: {
        thinkingBudget: 0,
      },
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            n: { type: 'STRING', description: 'اسم الصنف' },
            c: { type: 'STRING', description: 'القسم' },
            p: { type: 'NUMBER', description: 'السعر المالي' },
          },
          required: ['n', 'c', 'p'],
        },
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

  let rawList: any[] = [];
  try {
    const parsed = JSON.parse(rawText);
    rawList = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.items)
      ? parsed.items
      : [];
  } catch (e) {
    throw new Error('فشل في قراءة بيانات المنيو المستخرجة.');
  }

  const categoriesSet = new Set<string>();
  const items: ParsedMenuItem[] = [];

  for (const it of rawList) {
    const name = String(it.n || it.name || '').trim();
    const category = String(it.c || it.category || 'عام').trim();
    const price = cleanPrice(it.p ?? it.price);
    if (!name) continue;

    if (category) categoriesSet.add(category);
    items.push({
      name,
      category,
      price,
      description: '',
      item_type: 'product',
    });
  }

  return {
    categories: Array.from(categoriesSet),
    items,
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

    // Use gemini-flash-lite-latest (fastest & officially supported multimodal vision model)
    const result = await callGeminiVision(apiKey, imageBase64, mimeType, 'gemini-flash-lite-latest');

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
