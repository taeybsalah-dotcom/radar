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
      'Cache-Control': 'no-cache, no-store, must-revalidate',
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
  const storeParam = url.searchParams.get('store_id') || url.searchParams.get('store') || '';
  const customerIdParam = url.searchParams.get('customer_id') || url.searchParams.get('customerId') || '';
  const phoneParam = url.searchParams.get('phone') || '';
  const nameParam = url.searchParams.get('name') || '';

  if (!storeParam) {
    return errorResponse(400, 'معرّف المتجر مطلوب');
  }

  try {
    // 1. جلب بيانات المتجر (يدعم الـ UUID أو الـ Slug)
    const isStoreUuid = UUID_RE.test(storeParam);
    const storeQuery = isStoreUuid
      ? `id=eq.${storeParam}`
      : `slug=eq.${encodeURIComponent(storeParam)}`;

    const stores = await restGet(
      supabaseUrl,
      serviceKey,
      `stores?${storeQuery}&select=id,slug,name,primary_color,secondary_color,points_per_riyal,phone&limit=1`
    );
    const store = stores[0];
    if (!store) return errorResponse(404, 'المتجر غير موجود');

    // 2. معالجة بيانات العميل (بحث في قاعدة البيانات مع دعم Fallback فوري)
    let customer: { id: string; name: string | null; phone: string | null; points_balance: number } = {
      id: customerIdParam || 'guest',
      name: nameParam || 'عميل مميز',
      phone: phoneParam || null,
      points_balance: 0,
    };

    try {
      let row: any = null;

      // أ) محاولة البحث بمعرّف العميل أولاً
      if (customerIdParam && UUID_RE.test(customerIdParam)) {
        const byIdAndStore = await restGet(
          supabaseUrl,
          serviceKey,
          `store_customers?id=eq.${customerIdParam}&store_id=eq.${store.id}&select=*&limit=1`
        );
        if (byIdAndStore[0]) {
          row = byIdAndStore[0];
        } else {
          const byId = await restGet(
            supabaseUrl,
            serviceKey,
            `store_customers?id=eq.${customerIdParam}&select=*&limit=1`
          );
          if (byId[0]) row = byId[0];
        }
      }

      // ب) إذا لم نجد العميل ووصل رقم الجوال، نبحث برقم الجوال
      if (!row && phoneParam) {
        const cleanPhone = phoneParam.replace(/[^\d+]/g, '');
        const byPhoneAndStore = await restGet(
          supabaseUrl,
          serviceKey,
          `store_customers?store_id=eq.${store.id}&phone=eq.${encodeURIComponent(cleanPhone)}&select=*&limit=1`
        );
        if (byPhoneAndStore[0]) {
          row = byPhoneAndStore[0];
        } else {
          const byPhone = await restGet(
            supabaseUrl,
            serviceKey,
            `store_customers?phone=eq.${encodeURIComponent(cleanPhone)}&select=*&limit=1`
          );
          if (byPhone[0]) row = byPhone[0];
        }
      }

      // ج) إذا وُجد العميل في السجلات، نعتمد بياناته ورصيده الحقيقي
      if (row) {
        customer = {
          id: row.id,
          name: row.name || nameParam || 'عميل مميز',
          phone: row.phone || phoneParam || null,
          points_balance: Number(row.points_balance ?? row.wallet_balance ?? 0),
        };
      }
    } catch (custLookupErr) {
      console.warn('Customer lookup error (continuing with base info):', custLookupErr);
    }

    // 3. بيانات شهادة آبل (سرية، تُقرأ بمفتاح السيرفر فقط)
    const integrations = await restGet(
      supabaseUrl,
      serviceKey,
      'platform_integrations?select=id,apple_wallet_enabled,apple_pass_type_id,apple_team_id,apple_cert_p12_base64,apple_cert_password,created_at,updated_at&order=updated_at.desc.nullslast,created_at.desc.nullslast&limit=10'
    );
    const cfg =
      integrations.find((c: any) => c.apple_wallet_enabled && c.apple_cert_p12_base64) ||
      integrations.find((c: any) => c.apple_wallet_enabled) ||
      integrations[0];

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
        `store_branches?store_id=eq.${store.id}&select=name,latitude,longitude&limit=10`
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
