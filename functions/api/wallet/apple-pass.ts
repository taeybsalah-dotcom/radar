// ماكينة ختم بطاقات Apple Wallet الرسمية (Cloudflare Pages Function)
// المسار: GET /api/wallet/apple-pass?store_id=<uuid>&customer_id=<uuid>
//
// المتغيرات السرية المطلوبة في إعدادات Cloudflare (Pages > Settings > Variables):
//   SUPABASE_URL                (أو VITE_SUPABASE_URL)  رابط قاعدة بيانات هذا الوكيل
//   SUPABASE_SERVICE_ROLE_KEY   مفتاح سري: للسيرفر فقط، ممنوع وضعه في الواجهة أو الكود
import { generateSignedApplePass } from '../../../src/lib/applePassSigner';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...CORS_HEADERS,
    },
  });
}

async function restGet(supabaseUrl: string, serviceKey: string, path: string): Promise<any[]> {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`فشل قراءة البيانات من القاعدة (${res.status})`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function onRequestGet(context: any): Promise<Response> {
  const { request, env } = context;

  const supabaseUrl = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!supabaseUrl || !serviceKey) {
    return errorResponse(500, 'إعدادات السيرفر غير مكتملة: يلزم ضبط SUPABASE_SERVICE_ROLE_KEY في Cloudflare');
  }

  const url = new URL(request.url);
  const storeId = url.searchParams.get('store_id') || '';
  const customerId = url.searchParams.get('customer_id') || '';
  if (!UUID_RE.test(storeId) || !UUID_RE.test(customerId)) {
    return errorResponse(400, 'معرّف المتجر أو العميل غير صالح');
  }

  try {
    // 1. المتجر
    const stores = await restGet(
      supabaseUrl,
      serviceKey,
      `stores?id=eq.${storeId}&select=id,slug,name,primary_color,secondary_color,points_per_riyal,phone&limit=1`
    );
    const store = stores[0];
    if (!store) return errorResponse(404, 'المتجر غير موجود');

    // 2. العميل (لازم يتبع نفس المتجر)
    const customers = await restGet(
      supabaseUrl,
      serviceKey,
      `store_customers?id=eq.${customerId}&store_id=eq.${storeId}&select=*&limit=1`
    );
    const row = customers[0];
    if (!row) return errorResponse(404, 'العميل غير موجود في هذا المتجر');
    const customer = {
      id: row.id,
      name: row.name ?? null,
      phone: row.phone ?? null,
      points_balance: Number(row.points_balance ?? row.wallet_balance ?? 0),
    };

    // 3. بيانات شهادة آبل (سرية، تُقرأ بمفتاح السيرفر فقط)
    const integrations = await restGet(
      supabaseUrl,
      serviceKey,
      'platform_integrations?select=apple_wallet_enabled,apple_pass_type_id,apple_team_id,apple_cert_p12_base64,apple_cert_password&order=created_at.desc&limit=1'
    );
    const cfg = integrations[0];
    if (!cfg || !cfg.apple_wallet_enabled) {
      return errorResponse(403, 'بوابة محفظة آبل غير مفعّلة في مركز التكاملات');
    }
    if (!cfg.apple_pass_type_id || !cfg.apple_team_id || !cfg.apple_cert_p12_base64) {
      return errorResponse(422, 'بيانات شهادة آبل غير مكتملة في مركز التكاملات');
    }

    // 4. فروع المتجر للتنبيه الجغرافي (اختياري: لو الجدول أو الأعمدة غير موجودة نكمل بدونها)
    let branches: any[] = [];
    try {
      branches = await restGet(
        supabaseUrl,
        serviceKey,
        `store_branches?store_id=eq.${storeId}&select=name,latitude,longitude&limit=10`
      );
    } catch {
      branches = [];
    }

    // 5. الختم
    const pkpass = generateSignedApplePass({
      store,
      customer,
      branches,
      credentials: {
        passTypeId: cfg.apple_pass_type_id,
        teamId: cfg.apple_team_id,
        p12Base64: cfg.apple_cert_p12_base64,
        p12Password: cfg.apple_cert_password,
      },
    });

    const safeName = String(store.slug || 'loyalty').replace(/[^a-zA-Z0-9_-]/g, '_');
    return new Response(pkpass, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': `inline; filename="${safeName}.pkpass"`,
        'Cache-Control': 'no-store',
        ...CORS_HEADERS,
      },
    });
  } catch (err: any) {
    return errorResponse(500, `فشل إصدار بطاقة آبل: ${err?.message || 'خطأ غير معروف'}`);
  }
}
