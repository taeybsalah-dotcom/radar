import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

declare const process: any;

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://zagpvflyizbmzsbmhnts.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Bx1NGkxLxilvNA3RgcioVQ_t8zlk72H';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function base64UrlEncode(strOrBuffer: string | Buffer): string {
  const base64 = Buffer.isBuffer(strOrBuffer)
    ? strOrBuffer.toString('base64')
    : Buffer.from(strOrBuffer).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function cleanTextNoEmoji(str: string): string {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F018}-\u{1F270}\u{2388}\u{2B05}\u{2B06}\u{2B07}\u{2B1B}\u{2B1C}\u{2B50}\u{2B55}\u{FE00}-\u{FE0F}]/gu, '')
    .trim();
}

function getSecureLogoUrl(url?: string | null): string {
  const fallback = 'https://sdeemalathr.com/assets/default-logo.png';
  if (!url || typeof url !== 'string') return fallback;
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return fallback;
  // Google Wallet strictly requires PNG or JPG format - reject WEBP/SVG/GIF
  const lower = trimmed.toLowerCase();
  if (lower.includes('.webp') || lower.includes('.svg') || lower.includes('.gif')) {
    return fallback;
  }
  if (trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('http://')) return trimmed.replace(/^http:\/\//, 'https://');
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (trimmed.startsWith('/')) return `https://sdeemalathr.com${trimmed}`;
  return fallback;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { store_id, customer_id, payload } = req.body || {};

    if (!store_id) {
      return res.status(400).json({ success: false, error: 'Missing store_id' });
    }

    // 1. Fetch Platform Google Wallet Credentials from Database
    const { data: platformData } = await supabase
      .from('platform_integrations')
      .select('google_wallet_enabled, google_issuer_id, google_client_email, google_private_key')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const issuerId = platformData?.google_issuer_id || '3388000000023226136';
    const clientEmail = platformData?.google_client_email || 'sadim-504@sadim-512923.iam.gserviceaccount.com';
    let privateKey = platformData?.google_private_key || '';

    // 2. Fetch Store Details
    const { data: store } = await supabase
      .from('stores')
      .select('id, name, slug, primary_color, secondary_color, logo_url, fulfillment_settings')
      .eq('id', store_id)
      .limit(1)
      .maybeSingle();

    // 3. Fetch Wallet Config (Table or Embedded)
    let walletConfig: any = null;
    try {
      const { data: passConfig } = await supabase
        .from('store_wallet_pass_configs')
        .select('*')
        .eq('store_id', store_id)
        .limit(1)
        .maybeSingle();

      const embeddedConfig = (store as any)?.fulfillment_settings?.wallet_pass_config || null;
      if (passConfig && embeddedConfig) {
        const tableTime = new Date(passConfig.updated_at || 0).getTime();
        const embeddedTime = new Date(embeddedConfig.updated_at || 0).getTime();
        walletConfig = embeddedTime >= tableTime ? embeddedConfig : passConfig;
      } else {
        walletConfig = embeddedConfig || passConfig;
      }
    } catch {
      walletConfig = (store as any)?.fulfillment_settings?.wallet_pass_config || null;
    }

    // 4. Fetch Customer Details
    let customer: any = null;
    if (customer_id && customer_id !== 'guest') {
      const { data: cust } = await supabase
        .from('store_customers')
        .select('*')
        .eq('id', customer_id)
        .limit(1)
        .maybeSingle();
      customer = cust;
    }

    const rawStoreName = store?.name || 'متجر رادار';
    const storeName = cleanTextNoEmoji(rawStoreName) || 'متجر رادار';
    const storeColor = walletConfig?.background_color || store?.primary_color || '#110E05';
    const customerPhone = customer?.phone || 'VIP';
    const customerName = cleanTextNoEmoji(customer?.name || 'عميل مميز') || 'عميل مميز';
    const balance = Number(customer?.points_balance ?? customer?.wallet_balance ?? 0);

    const loyaltyMode = walletConfig?.loyalty_mode || 'points';
    const isStamps = loyaltyMode === 'stamps';
    const stampsTarget = walletConfig?.stamps_target || 6;
    const currentStamps = balance % stampsTarget;

    const logoUrl = getSecureLogoUrl(store?.logo_url);

    const safeStoreId = (store?.id || store_id).replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 16);
    const safeCustId = (customer?.id || customer_id || 'guest').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 16);

    const storeCode = String((store as any)?.slug || store?.name || 'STORE')
      .trim()
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, 10) || `STORE_${safeStoreId.slice(0, 4)}`;

    const classId = `${issuerId}.loyalty_${safeStoreId}`;
    const objectId = `${issuerId}.pass_${safeStoreId}_${safeCustId}`;
    const qrData = `${storeCode}:LOYALTY:${store?.id || store_id}:${customer?.id || customer_id || 'GUEST'}:${customerPhone}:${Date.now()}`;

    // حساب حقل الرصيد بحسب نمط الولاء - نصوص وأرقام فقط بدون إيموجيات
    let loyaltyPointsPayload: any = {
      label: 'رصيد النقاط',
      balance: {
        int: balance,
      },
    };

    if (isStamps) {
      loyaltyPointsPayload = {
        label: 'الأختام المجمعة',
        balance: {
          string: `${currentStamps} من ${stampsTarget} أختام`,
        },
      };
    } else if (loyaltyMode === 'cashback') {
      loyaltyPointsPayload = {
        label: 'الرصيد المشحون',
        balance: {
          string: `${balance.toFixed(2)} ر.س`,
        },
      };
    }

    const programName = isStamps ? `بطاقة أختام ${storeName}` : `برنامج ولاء ${storeName}`;

    // If private key is available, sign official Google JWT
    if (privateKey && privateKey.trim()) {
      privateKey = privateKey.trim().replace(/^["'\s]+|["'\s]+$/g, '').replace(/\\n/g, '\n');
      if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
        privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}`;
      }
      if (!privateKey.includes('-----END PRIVATE KEY-----')) {
        privateKey = `${privateKey}\n-----END PRIVATE KEY-----`;
      }

      const now = Math.floor(Date.now() / 1000);
      const header = { alg: 'RS256', typ: 'JWT' };

      const jwtPayload = {
        iss: clientEmail,
        aud: 'google',
        typ: 'savetowallet',
        iat: now,
        origins: [
          'https://sdeemalathr.com',
          'https://myradar.sarl',
          'https://sadim-alathir.pages.dev',
        ],
        payload: {
          loyaltyClasses: [
            {
              id: classId,
              issuerName: storeName,
              programName: programName,
              programLogo: {
                sourceUri: {
                  uri: logoUrl,
                },
                contentDescription: {
                  defaultValue: {
                    language: 'ar',
                    value: 'شعار المتجر',
                  },
                },
              },
              reviewStatus: 'UNDER_REVIEW',
              hexBackgroundColor: storeColor,
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

      const encodedHeader = base64UrlEncode(JSON.stringify(header));
      const encodedPayload = base64UrlEncode(JSON.stringify(jwtPayload));
      const message = `${encodedHeader}.${encodedPayload}`;

      const signer = crypto.createSign('RSA-SHA256');
      signer.update(message);
      const signature = signer.sign(privateKey);
      const encodedSignature = base64UrlEncode(signature);

      const signedJwt = `${message}.${encodedSignature}`;
      const saveUrl = `https://pay.google.com/gp/v/save/${signedJwt}`;

      return res.status(200).json({
        success: true,
        saveUrl,
        isSigned: true,
      });
    }

    // Fallback if private key is not saved yet
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
      hexBackgroundColor: storeColor,
      heroImage: {
        sourceUri: {
          uri: logoUrl,
        },
      },
    };

    const fallbackUrl = `https://pay.google.com/gp/v/save/${encodeURIComponent(JSON.stringify(fallbackPayload))}`;
    return res.status(200).json({
      success: true,
      saveUrl: fallbackUrl,
      isSigned: false,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: `Failed to generate Google Wallet Save URL: ${err.message}`,
    });
  }
}
