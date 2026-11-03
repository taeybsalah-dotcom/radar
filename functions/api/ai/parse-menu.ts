// ماكينة قراءة المنيو بالذكاء الاصطناعي (Cloudflare Pages Function)
// المسار: POST /api/ai/parse-menu

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
    },
  });
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

function cleanPrice(raw: any): number {
  if (typeof raw === 'number' && !isNaN(raw)) return raw;
  if (!raw) return 0;

  let str = String(raw).trim();
  const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  const persianNumerals = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  for (let i = 0; i < 10; i++) {
    str = str.replace(new RegExp(arabicNumerals[i], 'g'), String(i));
    str = str.replace(new RegExp(persianNumerals[i], 'g'), String(i));
  }

  str = str.replace(/٫/g, '.').replace(/,/g, '.');
  str = str.replace(/(ر\.س|رس|ريال|ريالات|SAR|SR|USD|\$|EUR|AED)/gi, '');

  const match = str.match(/(\d+(?:\.\d+)?)/);
  if (match) {
    const num = parseFloat(match[1]);
    return isNaN(num) ? 0 : num;
  }
  return 0;
}

function resolveModelName(rawModel?: string): string {
  if (!rawModel || typeof rawModel !== 'string') return 'gemini-3.8-flash';
  const trimmed = rawModel.trim().toLowerCase();
  // إذا كان الموديل قديماً أو غير مدعوم لـ generateContent، نوجهه إلى الموديل الأحدث المستقر
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

export async function onRequestPost(context: any): Promise<Response> {
  const { request, env } = context;

  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ success: false, error: 'تعذر قراءة بيانات الطلب.' }, 400);
  }

  // 1. تحديد مفتاح API (من العميل أو بيئة Cloudflare أو Supabase)
  let apiKey =
    body?.apiKey && typeof body.apiKey === 'string' && body.apiKey.trim()
      ? body.apiKey.trim()
      : env?.GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    // محاولة جلب المفتاح تلقائياً من Supabase platform_integrations
    try {
      const supaUrl = env?.VITE_SUPABASE_URL || 'https://zagpvflyizbmzsbmhnts.supabase.co';
      const supaKey = env?.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Bx1NGkxLxilvNA3RgcioVQ_t8zlk72H';
      const rpcRes = await fetch(`${supaUrl}/rest/v1/rpc/get_platform_integrations_secure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supaKey,
          Authorization: `Bearer ${supaKey}`,
        },
        body: JSON.stringify({}),
      });
      if (rpcRes.ok) {
        const rpcJson: any = await rpcRes.json();
        if (rpcJson?.gemini_api_key) {
          apiKey = rpcJson.gemini_api_key.trim();
        }
      }
    } catch {}
  }

  if (!apiKey || apiKey.trim() === '') {
    return jsonResponse(
      {
        success: false,
        code: 'GEMINI_API_KEY_MISSING',
        error: 'مفتاح Gemini API غير مضبوط. يرجى تفعيله عبر مركز التكاملات في لوحة المالك.',
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

    if (imageBase64.includes(',')) {
      imageBase64 = imageBase64.split(',')[1];
    }

    const modelName = resolveModelName(body?.model);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

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
                data: imageBase64,
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

    const aiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      let errJson: any = null;
      try { errJson = JSON.parse(errText); } catch {}
      const msg = errJson?.error?.message || errText;
      return jsonResponse(
        {
          success: false,
          error: `خطأ من خدمة الذكاء الاصطناعي (${aiRes.status}): ${msg}`,
        },
        500
      );
    }

    const resJson: any = await aiRes.json();
    const rawText = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return jsonResponse(
        {
          success: false,
          error: 'لم يتم استخراج أي بيانات من الصورة، يرجى التأكد من وضوح الصورة وتجربة زاوية أخرى.',
        },
        422
      );
    }

    const parsed = JSON.parse(rawText);
    const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];

    const items = rawItems.map((it: any) => ({
      name: String(it.name || '').trim(),
      category: String(it.category || 'عام').trim(),
      price: cleanPrice(it.price),
      description: it.description ? String(it.description).trim() : '',
      item_type: it.item_type === 'service' ? 'service' : 'product',
    }));

    const categories: string[] =
      Array.isArray(parsed?.categories) && parsed.categories.length > 0
        ? parsed.categories
        : Array.from(new Set(items.map((i: any) => i.category)));

    return jsonResponse({
      success: true,
      categories,
      items,
    });
  } catch (error: any) {
    return jsonResponse(
      {
        success: false,
        error: error?.message || 'حدث خطأ غير متوقع أثناء معالجة المنيو بالذكاء الاصطناعي.',
      },
      500
    );
  }
}
