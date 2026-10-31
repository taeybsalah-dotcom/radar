// ماكينة ختم بطاقات Apple Wallet الرسمية (Cloudflare Pages Function)
// المسار: GET /api/wallet/apple-pass?store_id=<uuid>&customer_id=<uuid>
//
// المتغيرات السرية المطلوبة في إعدادات Cloudflare (Pages > Settings > Variables):
//   SUPABASE_URL                (أو VITE_SUPABASE_URL)  رابط قاعدة بيانات هذا الوكيل
//   SUPABASE_SERVICE_ROLE_KEY   مفتاح سري: للسيرفر فقط، ممنوع وضعه في الواجهة أو الكود
// Polyfill crypto.randomBytes for Cloudflare Workers / Edge runtime
if (typeof crypto !== 'undefined' && !(crypto as any).randomBytes) {
  (crypto as any).randomBytes = (size: number, callback?: (err: any, buf: any) => void) => {
    const arr = new Uint8Array(size);
    crypto.getRandomValues(arr);
    const res = {
      toString: () => {
        let s = '';
        for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
        return s;
      },
      length: arr.length,
    };
    if (typeof callback === 'function') callback(null, res);
    return res;
  };
}

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

function errorResponse(status: number, message: string, details?: any): Response {
  return new Response(JSON.stringify({ success: false, error: message, ...(details ? { debug: details } : {}) }), {
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

  const supabaseUrl = String(
    env.SUPABASE_URL || env.VITE_SUPABASE_URL || 'https://kspfiijorengpckdlymx.supabase.co'
  ).replace(/\/$/, '');
  const serviceKey = String(
    env.SUPABASE_SERVICE_ROLE_KEY ||
    env.SUPABASE_SERVICE_ROLE_KE ||
    env.SERVICE_ROLE_KEY ||
    ''
  ).trim();
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
      `stores?${storeQuery}&select=id,slug,name,primary_color,secondary_color,points_per_riyal,phone,logo_url&limit=1`
    );
    const store = stores[0];
    if (!store) return errorResponse(404, 'المتجر غير موجود');

    // دعم تمرير الشعار كمعامل بديل أو تحويل المسار النسبي إلى رابط كامل
    const logoParam = url.searchParams.get('logo_url') || url.searchParams.get('logo');
    if (logoParam && !store.logo_url) {
      store.logo_url = logoParam;
    }
    if (store.logo_url && store.logo_url.startsWith('/')) {
      store.logo_url = `${url.origin}${store.logo_url}`;
    }

    if (url.searchParams.get('debug') === 'store') {
      return new Response(JSON.stringify({ store }), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
      });
    }

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
    let integrations: any[] = [];
    let intError: string | null = null;
    try {
      integrations = await restGet(
        supabaseUrl,
        serviceKey,
        'platform_integrations?select=id,apple_wallet_enabled,apple_pass_type_id,apple_team_id,apple_cert_p12_base64,apple_cert_password,created_at,updated_at&order=updated_at.desc.nullslast,created_at.desc.nullslast&limit=10'
      );
    } catch (e: any) {
      intError = e.message;
    }

    const cfg =
      integrations.find((c: any) => c.apple_cert_p12_base64 && c.apple_pass_type_id) ||
      integrations.find((c: any) => c.apple_wallet_enabled) ||
      integrations[0];

    // تشخيص دقيق إذا تعذر التفعيل
    const isConfigured = Boolean(cfg && (cfg.apple_wallet_enabled || cfg.apple_cert_p12_base64));
    if (!isConfigured) {
      const isAnon = serviceKey.startsWith('sb_publishable_');
      const keyRoleGuess = isAnon ? 'ANON_KEY (المفتاح المستخدم في Cloudflare هو مفتاح anon وليس service_role)' : (serviceKey.startsWith('sb_secret_') ? 'SERVICE_ROLE_KEY' : (serviceKey.startsWith('eyJ') ? 'JWT' : 'UNKNOWN'));
      return errorResponse(403, 'بوابة محفظة آبل غير مفعّلة في مركز التكاملات', {
        db_host: new URL(supabaseUrl).host,
        key_type: keyRoleGuess,
        key_length: serviceKey.length,
        key_prefix: serviceKey.substring(0, 16) + '...',
        integrations_count: integrations.length,
        fetch_error: intError,
        has_cfg: Boolean(cfg),
        cfg_enabled: cfg?.apple_wallet_enabled ?? null,
        cfg_has_p12: Boolean(cfg?.apple_cert_p12_base64),
        cfg_has_password: Boolean(cfg?.apple_cert_password),
      });
    }

const SDEEM_CERT_PEM = `-----BEGIN CERTIFICATE-----
MIIGJzCCBQ+gAwIBAgIQILTbudyMBmPzHz+GxNX4NjANBgkqhkiG9w0BAQsFADB1
MUQwQgYDVQQDDDtBcHBsZSBXb3JsZHdpZGUgRGV2ZWxvcGVyIFJlbGF0aW9ucyBD
ZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTELMAkGA1UECwwCRzQxEzARBgNVBAoMCkFw
cGxlIEluYy4xCzAJBgNVBAYTAlVTMB4XDTI2MTAzMDEyNTEzN1oXDTI3MTEyOTEy
NTEzNlowgZsxLDAqBgoJkiaJk/IsZAEBDBxwYXNzLmNvbS5zZGVlbWFsYXRoci5s
b3lhbHR5MTMwMQYDVQQDDCpQYXNzIFR5cGUgSUQ6IHBhc3MuY29tLnNkZWVtYWxh
dGhyLmxveWFsdHkxEzARBgNVBAsMClBLNDJCRjc5UzIxFDASBgNVBAoMC0FtbmFo
IFRhZXliMQswCQYDVQQGEwJVUzCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoC
ggEBALd/9msGCeXsWswihfoDi0NzLWp494pxTJ9BDB+u2f3Yo99Bj+ZYEj0pdf3n
nMBl7QC1/nlMxPbl9vN978aiVf6DP71nSQfwweP8JdrrJaJuOyVX8upD7mRG+Sj5
A/U20SQl2XyNsDkmZNTTNSsL/MQBGepBN1BO20Ee1M5XTsSN3Qsaj5b8CvXyMCwB
+/mVZhhYIwwU4FlolQq3cfx2DuWwFLUSnX5+0+/yflCqHKcTkpIS2vTT9w0Rf7WW
8bInHsoS2za8lP0HyfDz7tBlMpzGZska9i50HqvnkZ/zI7JoCowT+8VRW3hlUuL+
syl9MESzKD9F5F6G9aUCqJIl80ECAwEAAaOCAoowggKGMAwGA1UdEwEB/wQCMAAw
HwYDVR0jBBgwFoAUW9n6HeeaGgujmXYiUIY+kchbd6gwcAYIKwYBBQUHAQEEZDBi
MC0GCCsGAQUFBzAChiFodHRwOi8vY2VydHMuYXBwbGUuY29tL3d3ZHJnNC5kZXIw
MQYIKwYBBQUHMAGGJWh0dHA6Ly9vY3NwLmFwcGxlLmNvbS9vY3NwMDMtd3dkcmc0
MDQwggEeBgNVHSAEggEVMIIBETCCAQ0GCSqGSIb3Y2QFATCB/zCBwwYIKwYBBQUH
AgIwgbYMgbNSZWxpYW5jZSBvbiB0aGlzIGNlcnRpZmljYXRlIGJ5IGFueSBwYXJ0
eSBhc3N1bWVzIGFjY2VwdGFuY2Ugb2YgdGhlIHRoZW4gYXBwbGljYWJsZSBzdGFu
ZGFyZCB0ZXJtcyBhbmQgY29uZGl0aW9ucyBvZiB1c2UsIGNlcnRpZmljYXRlIHBv
bGljeSBhbmQgY2VydGlmaWNhdGlvbiBwcmFjdGljZSBzdGF0ZW1lbnRzLjA3Bggr
BgEFBQcCARYraHR0cHM6Ly93d3cuYXBwbGUuY29tL2NlcnRpZmljYXRlYXV0aG9y
aXR5LzAeBgNVHSUEFzAVBggrBgEFBQcDAgYJKoZIhvdjZAQOMDIGA1UdHwQrMCkw
J6AloCOGIWh0dHA6Ly9jcmwuYXBwbGUuY29tL3d3ZHJnNC02LmNybDAdBgNVHQ4E
FgQU9QhcrT/LSJ2l8vLe/Cz3iwuuKXMwDgYDVR0PAQH/BAQDAgeAMCwGCiqGSIb3
Y2QGARAEHgwccGFzcy5jb20uc2RlZW1hbGF0aHIubG95YWx0eTAQBgoqhkiG92Nk
BgMCBAIFADANBgkqhkiG9w0BAQsFAAOCAQEANIy5je9zhpwywgfZCMnq8bNMaPKt
1xQoN0P+x+BLdNx4nAe9yQwMuVnWnCrE2ZCMq9bMC89o1vkpJpdSQyvJ8EheijzM
iDC1kvKmsVVsEH7bKctvmshwtOE4XhGVfbeIc/xae8Q+rrvubUA5jm7FA3rtjvKc
O7rk1uk290QofjcT0vWFFHRmdlt2ttHzIw8kyGDoP3aQckczxkDl0zhna9b7eQXi
10KIPRl3ZYLEeYwG1rbwPvPdP5qziGze1G5GGoo/rki+SXKuJ5z1IFD2XPCqfI0Z
14MSVA0v6opX9Pc3n2b5Ui2BnLOEyhihX7DNskEoXTgub6rsrj51I/IBAw==
-----END CERTIFICATE-----`;

const SDEEM_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC3f/ZrBgnl7FrM
IoX6A4tDcy1qePeKcUyfQQwfrtn92KPfQY/mWBI9KXX955zAZe0Atf55TMT25fbz
fe/GolX+gz+9Z0kH8MHj/CXa6yWibjslV/LqQ+5kRvko+QP1NtEkJdl8jbA5JmTU
0zUrC/zEARnqQTdQTttBHtTOV07Ejd0LGo+W/Ar18jAsAfv5lWYYWCMMFOBZaJUK
t3H8dg7lsBS1Ep1+ftPv8n5QqhynE5KSEtr00/cNEX+1lvGyJx7KEts2vJT9B8nw
8+7QZTKcxmbJGvYudB6r55Gf8yOyaAqME/vFUVt4ZVLi/rMpfTBEsyg/ReRehvWl
AqiSJfNBAgMBAAECggEAWxoLpBzOYzlR5tEpBPQneug+3wKJm1Eewl4P/9bWYWHi
EeBB6hFFlNn1u4X228p+vQCeA2jqzM1lKoQWu94ypXZR+d3Cc0/DY0X3IVXnTFo/
wQ2GC2qIe36FCyN+JIr/kFu+O0k4+VanbsYhOmrsJf+J9zRDmvpbflwpOPw9nfUd
T3s4T3OK/EytxTa0OZaL6So2ipfI6cYznmFMCybhLCcpxBeXoQeVslCgo/Zz2xZY
lLKUX+BA6T5CnFD53k9ePbOk3wPM44WFk3PNbxetRC3zk6WVtnnOX2QcT1z7QQaO
UaIO17n3VDCOobLWtJpJEXHjipoBoqGtZsdk9vbHtQKBgQDcjHgBj+X7TEyx+5Ys
ZhvNHVrpcyzL3nlukJ6BsdfxaMooiXkgrUUTLMuZ698oI+YBy32pGY/0K+GYRLKg
00Y9FKQ+V5Ewk6H0xYcUFaUVsCLrVyi5dky7uTMT9PH2Lfjtsqyu3bPXFI0Yvd6m
PTAXyqSOf9td29b9YCAQbwPKIwKBgQDU/vEMGUMoLDHDMSo0TKpDz90mTHd6QX1A
Iz5c++AqCXr1S45xcXR9T5/AmQMCCH/DyIxr4RE5pwqgdaO16KYKasIUW3xmzRDh
qgaSXl8tRGt21m9DooNLHUxkZnTjGh+iuqMFu5p4yJZDdWwFN4LYInqivqwWWwG7
wsYxZP+JSwKBgH/XuPSG2jQqDUcaY/mGktT6ECnEhpICevdZQ1hAo8EfEhgfYCRN
6/1qePbXIDsfXANsVoH//E74ZMOkBrts3Ikpfu9YSSQUX8wH9/3vcgs5V3R9yHCB
H4etmesWkG84RNRcPvb6MnYZRpSx8u8ABvGzmGG1wY4Nkfi7kLqV72drAoGBAICP
hOT9loh37G1ZjpTUtWyK2XwVaYQ0ZSpCW5D6Qrp80GegfFDC30IHvnAcqzEd+igt
M3yl86Sty39AoljZHOdqusxY0ASowAjFfIP6TE5hXs/y7GORgtfizkpHgUPWb8Pk
DSQXsUw4HmKHTHT1pZdZcFYs6mfv9GLlVIVZ5ddzAoGBAKjBK62eioc6nC0kiJOB
7Upk7ALajqz7bEWkLtB84pcIv0Pod6v3jte1qLALWFKdUjXUdAGNfd7moNnVvXff
xkxvciRMm9lRvcvrW9b426oD46EEgJwBEpQ/eW0DFbl6vHVULs7h58L9iAczUfm3
T8jHm7rv5Nq0+KO/TXq54gzH
-----END PRIVATE KEY-----`;

    const passTypeId = cfg.apple_pass_type_id || 'pass.com.sdeemalathr.loyalty';
    const teamId = cfg.apple_team_id || 'PK42BF79S2';
    let p12Base64 = cfg.apple_cert_p12_base64;
    const p12Password = cfg.apple_cert_password || 'iquh7O5P1G9lmNgoy8hW';

    // لتفادي تجاوز حد المعالج (Error 1102 CPU limit) في Cloudflare، نستخدم الـ PEM المباشر لسديم
    if (!p12Base64 || (!p12Base64.includes('-----BEGIN') && passTypeId === 'pass.com.sdeemalathr.loyalty')) {
      p12Base64 = `${SDEEM_CERT_PEM}\n${SDEEM_KEY_PEM}`;
    }

    if (!p12Base64) {
      return errorResponse(422, 'بيانات شهادة آبل غير مكتملة في مركز التكاملات', {
        has_pass_type_id: Boolean(passTypeId),
        has_team_id: Boolean(teamId),
        has_p12: false,
      });
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

    // 5. الختم السريع
    const pkpass = await generateSignedApplePass({
      store,
      customer,
      branches,
      credentials: {
        passTypeId,
        teamId,
        p12Base64,
        p12Password,
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
