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
      .select('id, name, primary_color, secondary_color, logo_url')
      .eq('id', store_id)
      .limit(1)
      .maybeSingle();

    // 3. Fetch Customer Details
    let customer: any = null;
    if (customer_id) {
      const { data: cust } = await supabase
        .from('customers')
        .select('id, name, phone, wallet_balance')
        .eq('id', customer_id)
        .limit(1)
        .maybeSingle();
      customer = cust;
    }

    const storeName = store?.name || 'متجر رادار';
    const storeColor = store?.primary_color || '#110E05';
    const customerPhone = customer?.phone || 'VIP';
    const customerName = customer?.name || 'عميل مميز';
    const customerBalance = Number(customer?.wallet_balance || 0);

    const safeStoreId = (store?.id || store_id).replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 16);
    const safeCustId = (customer?.id || customer_id || 'guest').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 16);

    const classId = `${issuerId}.loyalty_${safeStoreId}`;
    const objectId = `${issuerId}.pass_${safeStoreId}_${safeCustId}`;
    const qrData = `RADAR:LOYALTY:${store?.id || store_id}:${customer?.id || customer_id}:${customerPhone}:${Date.now()}`;

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
        typ: 'savetogooglewallet',
        iat: now,
        origins: [],
        payload: {
          loyaltyClasses: [
            {
              id: classId,
              issuerName: storeName,
              programName: `برنامج ولاء ${storeName}`,
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
              loyaltyPoints: {
                label: 'رصيد النقاط',
                balance: {
                  int: customerBalance,
                },
              },
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
    const fallbackUrl = `https://pay.google.com/gp/v/save/${encodeURIComponent(JSON.stringify(payload || {}))}`;
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
