export interface Env {
  ASSETS: { fetch: typeof fetch };
  GEMINI_API_KEY?: string;
  VITE_SUPABASE_URL?: string;
  SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SOVEREIGN_MASTER_TOKEN?: string;
  PAYMENT_WEBHOOK_SECRET?: string;
  MOYASAR_WEBHOOK_SECRET?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, x-moyasar-signature, x-webhook-signature, x-signature, x-staff-token',
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

// ==============================================================================
// 🛡️ CRYPTOGRAPHIC HMAC-SHA256 SIGNATURE VERIFICATION (WEB CRYPTO + TIMING SAFE)
// ==============================================================================
export async function computeHmacSha256Hex(secret: string, rawBody: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(rawBody);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  return Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  const cleanA = a.trim().toLowerCase().replace(/^sha256=/, '');
  const cleanB = b.trim().toLowerCase().replace(/^sha256=/, '');
  if (cleanA.length === 0 || cleanA.length !== cleanB.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < cleanA.length; i++) {
    diff |= cleanA.charCodeAt(i) ^ cleanB.charCodeAt(i);
  }
  return diff === 0;
}

export async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined
): Promise<boolean> {
  if (!secret || !secret.trim() || !signatureHeader || !signatureHeader.trim()) {
    return false;
  }
  const expectedHex = await computeHmacSha256Hex(secret.trim(), rawBody);
  return timingSafeEqualHex(signatureHeader, expectedHex);
}

// ==============================================================================
// 💳 SERVER-AUTHORITATIVE BILLING WEBHOOK & SANDBOX WEBHOOK HANDLERS
// ==============================================================================
function resolveSupabaseCredentials(env: Env, requestHeaders?: Headers) {
  const supabaseUrl =
    env.SUPABASE_URL ||
    env.VITE_SUPABASE_URL ||
    requestHeaders?.get('x-supabase-url') ||
    'https://zagpvflyizbmzsbmhnts.supabase.co';
  const anonKey =
    env.SUPABASE_ANON_KEY ||
    env.VITE_SUPABASE_ANON_KEY ||
    requestHeaders?.get('x-supabase-anon-key') ||
    'sb_publishable_Bx1NGkxLxilvNA3RgcioVQ_t8zlk72H';
  const serviceRoleKey =
    env.SUPABASE_SERVICE_ROLE_KEY ||
    (env as any).SUPABASE_SERVICE_ROLE_KE ||
    '';
  const masterToken = env.SOVEREIGN_MASTER_TOKEN || '';
  const webhookSecret =
    env.PAYMENT_WEBHOOK_SECRET ||
    env.MOYASAR_WEBHOOK_SECRET ||
    'radar_sadim_webhook_hmac_secret_2026';

  return { supabaseUrl, anonKey, serviceRoleKey, masterToken, webhookSecret };
}

async function callSupabaseRpc(
  supabaseUrl: string,
  apiKey: string,
  bearerToken: string,
  rpcName: string,
  params: Record<string, unknown>
): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/${rpcName}`, {
    method: 'POST',
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${bearerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

export async function handleBillingWebhook(request: Request, env: Env): Promise<Response> {
  const rawBody = await request.text();
  const sigHeader =
    request.headers.get('x-moyasar-signature') ||
    request.headers.get('x-webhook-signature') ||
    request.headers.get('x-signature');

  const { supabaseUrl, anonKey, serviceRoleKey, masterToken, webhookSecret } =
    resolveSupabaseCredentials(env, request.headers);

  // 1. Cryptographic HMAC-SHA256 Signature Verification
  const isSignatureValid = await verifyWebhookSignature(rawBody, sigHeader, webhookSecret);
  if (!isSignatureValid) {
    return jsonResponse(
      {
        success: false,
        code: 'INVALID_SIGNATURE',
        error: 'فشل التحقق من التوقيع المشفر لبوابة الدفع (Webhook Signature Mismatch)',
      },
      401
    );
  }

  // 2. Parse & Validate Payload
  let payload: any = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse(
      {
        success: false,
        code: 'MALFORMED_PAYLOAD',
        error: 'بيانات الإشعار غير صالحة (Invalid JSON)',
      },
      400
    );
  }

  const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
  const eventId = String(payload?.id || payload?.event_id || data?.event_id || '').trim();
  const paymentId = String(
    data?.id || data?.payment_id || data?.transaction_id || payload?.payment_id || ''
  ).trim();
  const storeId = String(
    data?.metadata?.store_id || data?.store_id || payload?.store_id || ''
  ).trim();
  const invoiceType = String(
    data?.metadata?.invoice_type || data?.invoice_type || payload?.invoice_type || 'setup'
  )
    .trim()
    .toLowerCase();
  const gateway = String(payload?.provider || data?.gateway || payload?.gateway || 'moyasar')
    .trim()
    .toLowerCase();
  const paymentMethod = String(
    data?.source?.type || data?.payment_method || payload?.payment_method || 'mada'
  )
    .trim()
    .toLowerCase();

  const rawAmount = Number(data?.amount ?? payload?.amount ?? 0);
  // If Moyasar sends amount in Halalas (e.g. 50000 for 500 SAR when currency=SAR and is_halalas=true)
  const amount =
    data?.is_halalas === true ? Math.round(rawAmount) / 100 : Math.round(rawAmount * 100) / 100;

  if (!eventId || !paymentId || !storeId) {
    return jsonResponse(
      {
        success: false,
        code: 'MISSING_REQUIRED_FIELDS',
        error: 'حقول الإشعار الأساسية مفقودة (event_id, payment_id, store_id)',
      },
      400
    );
  }

  const activeKey = serviceRoleKey || anonKey;
  if (!activeKey) {
    return jsonResponse(
      {
        success: false,
        code: 'SERVER_MISCONFIGURED',
        error: 'مفاتيح الاتصال بقاعدة البيانات غير مهيأة في السيرفر',
      },
      500
    );
  }

  // 3. Execute Single Atomic Postgres RPC (process_store_payment_atomic)
  const rpcResult = await callSupabaseRpc(
    supabaseUrl,
    activeKey,
    activeKey,
    'process_store_payment_atomic',
    {
      p_store_id: storeId,
      p_invoice_type: invoiceType,
      p_amount: amount,
      p_payment_method: paymentMethod,
      p_gateway: gateway,
      p_gateway_payment_id: paymentId,
      p_plan_id: data?.metadata?.plan_id || data?.plan_id || payload?.plan_id || null,
      p_plan_code: data?.metadata?.plan_code || data?.plan_code || payload?.plan_code || null,
      p_plan_name: data?.metadata?.plan_name || data?.plan_name || payload?.plan_name || null,
      p_duration_months: Number(
        data?.metadata?.duration_months || data?.duration_months || payload?.duration_months || 1
      ),
      p_vat_rate:
        data?.vat_rate !== undefined
          ? Number(data.vat_rate)
          : payload?.vat_rate !== undefined
          ? Number(payload.vat_rate)
          : 0.0,
      p_gateway_fee: data?.gateway_fee !== undefined ? Number(data.gateway_fee) : null,
      p_webhook_event_id: eventId,
      p_master_token: masterToken || null,
    }
  );

  // 4. If Atomic RPC threw an exception (Full Rollback), log the failure in billing_webhook_events
  if (!rpcResult.ok || !rpcResult.data || rpcResult.data.success !== true) {
    const errMsg =
      rpcResult.data?.message ||
      rpcResult.data?.error ||
      `Atomic RPC failed with HTTP ${rpcResult.status}`;

    const isUuidStore = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      storeId
    );

    const failureLog = await callSupabaseRpc(
      supabaseUrl,
      activeKey,
      activeKey,
      'log_billing_webhook_failure',
      {
        p_provider: gateway.toUpperCase(),
        p_event_id: eventId,
        p_event_type: `PAYMENT_${invoiceType.toUpperCase()}_FAILED`,
        p_store_id: isUuidStore ? storeId : null,
        p_error_message: errMsg,
        p_payload: payload,
        p_master_token: masterToken || null,
      }
    );

    return jsonResponse(
      {
        success: false,
        code: 'ATOMIC_PAYMENT_ROLLBACK',
        error: errMsg,
        event_id: eventId,
        payment_id: paymentId,
        webhook_failure_logged: Boolean(failureLog.ok && failureLog.data?.success),
        webhook_event_row_id: failureLog.data?.webhook_event_row_id || null,
      },
      422
    );
  }

  return jsonResponse({
    success: true,
    idempotent: Boolean(rpcResult.data.idempotent),
    is_sandbox: Boolean(rpcResult.data.is_sandbox),
    event_id: eventId,
    payment_id: rpcResult.data.gateway_payment_id || paymentId,
    transaction_id: rpcResult.data.transaction_id,
    invoice_id: rpcResult.data.invoice_id,
    invoice_number: rpcResult.data.invoice_number,
    ledger_id: rpcResult.data.ledger_id,
    store_id: rpcResult.data.store_id,
    gross_amount: rpcResult.data.gross_amount,
    vat_amount: rpcResult.data.vat_amount,
    net_amount: rpcResult.data.net_amount,
    gateway_fee: rpcResult.data.gateway_fee,
    commission_amount: rpcResult.data.commission_amount,
    net_platform_amount: rpcResult.data.net_platform_amount,
    subscription_end_date: rpcResult.data.subscription_end_date,
  });
}

export async function handleSandboxWebhook(request: Request, env: Env): Promise<Response> {
  // 1. Require Authentication Header (Store Owner JWT or Staff Session Token)
  const authHeader = request.headers.get('authorization') || '';
  const staffToken = request.headers.get('x-staff-token') || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!bearerToken && !staffToken) {
    return jsonResponse(
      {
        success: false,
        code: 'UNAUTHORIZED',
        error: 'يجب تسجيل الدخول كمدير للمتجر أو مشرف عام لإجراء عملية الدفع التجريبية',
      },
      401
    );
  }

  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      {
        success: false,
        code: 'INVALID_PAYLOAD',
        error: 'بيانات طلب الدفع التجريبي غير صالحة',
      },
      400
    );
  }

  const storeId = String(body?.store_id || body?.storeId || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeId)) {
    return jsonResponse(
      {
        success: false,
        code: 'INVALID_STORE_ID',
        error: 'معرّف المتجر غير صالح',
      },
      400
    );
  }

  const { supabaseUrl, anonKey, serviceRoleKey, webhookSecret } = resolveSupabaseCredentials(
    env,
    request.headers
  );
  const apiKey = anonKey || serviceRoleKey;
  if (!apiKey) {
    return jsonResponse(
      {
        success: false,
        code: 'SERVER_MISCONFIGURED',
        error: 'مفاتيح الاتصال بقاعدة البيانات غير مهيأة في السيرفر',
      },
      500
    );
  }

  // 2. Verify Caller Authorization & Sandbox Mode on Server via verify_sandbox_checkout_access
  const checkRes = await callSupabaseRpc(
    supabaseUrl,
    apiKey,
    bearerToken || apiKey,
    'verify_sandbox_checkout_access',
    {
      p_store_id: storeId,
      p_staff_token: staffToken || null,
    }
  );

  if (!checkRes.ok || !checkRes.data || checkRes.data.allowed !== true) {
    return jsonResponse(
      {
        success: false,
        code: 'FORBIDDEN_SANDBOX_CHECKOUT',
        error:
          checkRes.data?.error ||
          'غير مصرح لك بإجراء عملية الدفع التجريبية لهذا المتجر أو أن وضع Sandbox مغلق',
      },
      403
    );
  }

  // 3. Construct Sandbox Webhook Payload with Explicit SANDBOX_ Prefix & HMAC-SHA256 Signature
  const rawPaymentId = String(
    body?.gateway_payment_id || body?.payment_id || `pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  ).trim();
  const sandboxPaymentId = rawPaymentId.startsWith('SANDBOX_')
    ? rawPaymentId
    : `SANDBOX_${rawPaymentId}`;
  const sandboxEventId = String(body?.event_id || `evt_${sandboxPaymentId}`).trim();

  const webhookPayload = {
    id: sandboxEventId,
    event_id: sandboxEventId,
    provider: 'SANDBOX',
    gateway: 'sandbox',
    store_id: storeId,
    payment_id: sandboxPaymentId,
    invoice_type: body?.invoice_type || body?.invoiceType || 'setup',
    amount: Number(body?.amount ?? 0),
    payment_method: body?.payment_method || body?.paymentMethod || 'mada',
    plan_id: body?.plan_id || body?.planId || null,
    plan_code: body?.plan_code || body?.planCode || null,
    plan_name: body?.plan_name || body?.planName || null,
    duration_months: Number(body?.duration_months || body?.durationMonths || 1),
    vat_rate: body?.vat_rate !== undefined ? Number(body.vat_rate) : 0.0,
    is_sandbox: true,
  };

  const rawWebhookBody = JSON.stringify(webhookPayload);
  const signature = await computeHmacSha256Hex(webhookSecret, rawWebhookBody);

  const forwardHeaders = new Headers(request.headers);
  forwardHeaders.set('Content-Type', 'application/json');
  forwardHeaders.set('x-webhook-signature', signature);

  const signedWebhookRequest = new Request(new URL('/api/billing/webhook', request.url).toString(), {
    method: 'POST',
    headers: forwardHeaders,
    body: rawWebhookBody,
  });

  return handleBillingWebhook(signedWebhookRequest, env);
}

// ==============================================================================
// 🤖 AI MENU DIGITIZER HANDLERS
// ==============================================================================
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

  const apiKey =
    body?.apiKey && typeof body.apiKey === 'string' && body.apiKey.trim()
      ? body.apiKey.trim()
      : env.GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    return jsonResponse(
      {
        success: false,
        code: 'GEMINI_API_KEY_MISSING',
        error:
          'مفتاح Gemini API غير مضبوط في السيرفر. يرجى تفعيله عبر مركز التكاملات أو Cloudflare Secret.',
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
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // 1. AI Menu Parse Route
    if (url.pathname === '/api/ai/parse-menu' && request.method === 'POST') {
      return handleParseMenu(request, env);
    }

    // 2. Cryptographically Verified Billing Webhook Route
    if (url.pathname === '/api/billing/webhook' && request.method === 'POST') {
      return handleBillingWebhook(request, env);
    }

    // 3. Authenticated Sandbox Webhook Route (Requires Store Owner JWT / Staff Token + Sandbox Mode)
    if (url.pathname === '/api/billing/sandbox-webhook' && request.method === 'POST') {
      return handleSandboxWebhook(request, env);
    }

    // 4. Serve static assets with anti-stale caching rules
    const response = await env.ASSETS.fetch(request);

    const pathname = url.pathname.toLowerCase();
    const isHashedAsset =
      pathname.startsWith('/assets/') && (pathname.endsWith('.js') || pathname.endsWith('.css'));

    const headers = new Headers(response.headers);

    if (isHashedAsset) {
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
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
