// ماكينة حفظ بطاقات Google Wallet الرسمية (Cloudflare Pages Function)
// المسار: POST /api/wallet/google-save
// تستقبل: { store_id: string, customer_id?: string, payload?: any }

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

function base64UrlEncode(data: Uint8Array | string): string {
  let binStr = '';
  if (typeof data === 'string') {
    binStr = btoa(unescape(encodeURIComponent(data)));
  } else {
    for (let i = 0; i < data.length; i++) {
      binStr += String.fromCharCode(data[i]);
    }
    binStr = btoa(binStr);
  }
  return binStr.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToBinary(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----/g, '')
    .replace(/-----END (?:RSA )?PRIVATE KEY-----/g, '')
    .replace(/[\r\n\s]/g, '');
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

async function restGet(supabaseUrl: string, serviceKey: string, path: string): Promise<any[]> {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function onRequestPost(context: any): Promise<Response> {
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

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const { store_id, customer_id, payload } = body;
  if (!store_id) {
    return new Response(JSON.stringify({ success: false, error: 'معرّف المتجر مطلوب' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
    });
  }

  try {
    // 1. جلب بيانات المتجر
    let store: any = null;
    if (supabaseUrl && serviceKey) {
      const stores = await restGet(
        supabaseUrl,
        serviceKey,
        `stores?id=eq.${store_id}&select=id,slug,name,primary_color,secondary_color,points_per_riyal,phone,logo_url,fulfillment_settings&limit=1`
      );
      if (stores[0]) store = stores[0];
    }

    // 2. جلب إعدادات بطاقة المحفظة للمتجر (الأختام، الألوان، النمط)
    let walletConfig: any = null;
    if (supabaseUrl && serviceKey && store) {
      const passConfigs = await restGet(
        supabaseUrl,
        serviceKey,
        `store_wallet_pass_configs?store_id=eq.${store.id}&select=*&limit=1`
      );
      if (passConfigs[0]) walletConfig = passConfigs[0];
      if (!walletConfig && store.fulfillment_settings?.wallet_pass_config) {
        walletConfig = store.fulfillment_settings.wallet_pass_config;
      }
    }

    // 3. جلب بيانات العميل
    let customer: any = null;
    if (supabaseUrl && serviceKey && customer_id && customer_id !== 'guest') {
      const customers = await restGet(
        supabaseUrl,
        serviceKey,
        `store_customers?id=eq.${customer_id}&select=*&limit=1`
      );
      if (customers[0]) customer = customers[0];
    }

    // 4. جلب اعتمادات محفظة قوقل من قاعدة البيانات
    let platformData: any = null;
    if (supabaseUrl && serviceKey) {
      const integrations = await restGet(
        supabaseUrl,
        serviceKey,
        'platform_integrations?select=google_wallet_enabled,google_issuer_id,google_client_email,google_private_key&order=updated_at.desc.nullslast,created_at.desc.nullslast&limit=1'
      );
      if (integrations[0]) platformData = integrations[0];
    }

    const issuerId = platformData?.google_issuer_id || '3388000000023226136';
    const clientEmail = platformData?.google_client_email || '';
    const privateKey = (platformData?.google_private_key || '').trim();
    const isGoogleEnabled = Boolean(platformData?.google_wallet_enabled);

    const storeName = store?.name || 'متجر رادار';
    const bgColor = walletConfig?.background_color || store?.primary_color || '#110E05';
    const customerPhone = customer?.phone || 'VIP';
    const customerName = customer?.name || 'عميل مميز';
    const balance = Number(customer?.points_balance ?? customer?.wallet_balance ?? 0);

    const loyaltyMode = walletConfig?.loyalty_mode || 'points';
    const isStamps = loyaltyMode === 'stamps';
    const stampsTarget = walletConfig?.stamps_target || 6;
    const currentStamps = balance % stampsTarget;
    const stampsIcon = walletConfig?.stamps_icon || '☕';
    const rewardTitle = walletConfig?.stamps_reward_title || 'مكافأة خاصة 🎁';

    const safeStoreId = String(store?.id || store_id).replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 16);
    const safeCustId = String(customer?.id || customer_id || 'guest').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 16);

    const classId = `${issuerId}.loyalty_${safeStoreId}`;
    const objectId = `${issuerId}.pass_${safeStoreId}_${safeCustId}`;
    const qrData = `RADAR:LOYALTY:${store?.id || store_id}:${customer?.id || customer_id || 'GUEST'}:${customerPhone}:${Date.now()}`;

    // حساب حقل الرصيد بحسب نمط الولاء
    let loyaltyPointsPayload: any = {
      label: 'رصيد النقاط',
      balance: { int: balance },
    };

    if (isStamps) {
      loyaltyPointsPayload = {
        label: 'الأختام المجمعة',
        balance: { string: `${currentStamps} من ${stampsTarget} ${stampsIcon}` },
      };
    } else if (loyaltyMode === 'cashback') {
      loyaltyPointsPayload = {
        label: 'الرصيد المشحون',
        balance: { string: `${balance.toFixed(2)} ر.س` },
      };
    }

    // 5. إذا كانت شهادة قوقل الخاصة متوفرة ومفعلة، نوقع JWT رسمي فوراً عبر WebCrypto
    if (isGoogleEnabled && privateKey && clientEmail) {
      try {
        const pkcs8Bytes = pemToBinary(privateKey);
        const cryptoKey = await crypto.subtle.importKey(
          'pkcs8',
          pkcs8Bytes,
          { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
          false,
          ['sign']
        );

        const now = Math.floor(Date.now() / 1000);
        const header = { alg: 'RS256', typ: 'JWT' };

        const jwtPayload = {
          iss: clientEmail,
          aud: 'google',
          typ: 'savetogooglewallet',
          iat: now,
          origins: [],
          payload: {
            loyaltyClasses: [
              {
                id: classId,
                issuerName: storeName,
                programName: isStamps ? `بطاقة أختام ${storeName}` : `برنامج ولاء ${storeName}`,
                reviewStatus: 'UNDER_REVIEW',
                hexBackgroundColor: bgColor,
              },
            ],
            loyaltyObjects: [
              {
                id: objectId,
                classId: classId,
                state: 'ACTIVE',
                accountId: customerPhone,
                accountName: customerName,
                loyaltyPoints: loyaltyPointsPayload,
                barcode: {
                  type: 'QR_CODE',
                  value: qrData,
                  alternateText: customerPhone !== 'VIP' ? `VIP-${customerPhone.slice(-6)}` : 'VIP-MEMBER',
                },
              },
            ],
          },
        };

        const encHeader = base64UrlEncode(JSON.stringify(header));
        const encPayload = base64UrlEncode(JSON.stringify(jwtPayload));
        const signingInput = `${encHeader}.${encPayload}`;
        const encoder = new TextEncoder();
        const signatureBytes = await crypto.subtle.sign(
          'RSASSA-PKCS1-v1_5',
          cryptoKey,
          encoder.encode(signingInput)
        );
        const encSignature = base64UrlEncode(new Uint8Array(signatureBytes));
        const signedJwt = `${signingInput}.${encSignature}`;
        const saveUrl = `https://pay.google.com/gp/v/save/${signedJwt}`;

        return new Response(JSON.stringify({ success: true, saveUrl, isSigned: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
        });
      } catch (signErr: any) {
        console.warn('Google JWT WebCrypto sign failed, falling back:', signErr);
      }
    }

    // 6. الرابط البديل الآمن المباشر (Google Pay Web Intent)
    const fallbackPayload = payload || {
      id: objectId,
      classId: classId,
      state: 'ACTIVE',
      accountId: customerPhone,
      accountName: customerName,
      loyaltyPoints: loyaltyPointsPayload,
      barcode: {
        type: 'QR_CODE',
        value: qrData,
        alternateText: customerPhone !== 'VIP' ? `VIP-${customerPhone.slice(-6)}` : 'VIP-MEMBER',
      },
      hexBackgroundColor: bgColor,
    };

    const fallbackUrl = `https://pay.google.com/gp/v/save/${encodeURIComponent(JSON.stringify(fallbackPayload))}`;
    return new Response(JSON.stringify({ success: true, saveUrl: fallbackUrl, isSigned: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'خطأ غير متوقع' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
    });
  }
}
