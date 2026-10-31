import forge from 'node-forge';
import { zipSync, strToU8 } from 'fflate';

// 🛡️ Fix node-forge PRNG in Cloudflare Workers / Edge Runtime
(forge as any).options = (forge as any).options || {};
(forge as any).options.usePureJavaScript = true;

if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
  (forge.random as any).getBytesSync = (count: number) => {
    const bytes = new Uint8Array(count);
    crypto.getRandomValues(bytes);
    return forge.util.binary.raw.encode(bytes);
  };
  (forge.random as any).getBytes = (count: number, callback?: (err: Error | null, bytes: string) => any) => {
    try {
      const bytes = new Uint8Array(count);
      crypto.getRandomValues(bytes);
      const str = forge.util.binary.raw.encode(bytes);
      if (typeof callback === 'function') callback(null, str);
    } catch (e: any) {
      if (typeof callback === 'function') callback(e, '');
    }
  };
}

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

// Apple Worldwide Developer Relations (WWDR) G4 Intermediate Certificate (PEM)
const APPLE_WWDR_G4_PEM = `-----BEGIN CERTIFICATE-----
MIIEVTCCAz2gAwIBAgIUE9x3lVJx5T3GMujM/+Uh88zFztIwDQYJKoZIhvcNAQEL
BQAwYjELMAkGA1UEBhMCVVMxEzARBgNVBAoTCkFwcGxlIEluYy4xJjAkBgNVBAsT
HUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRYwFAYDVQQDEw1BcHBsZSBS
b290IENBMB4XDTIwMTIxNjE5MzYwNFoXDTMwMTIxMDAwMDAwMFowdTFEMEIGA1UE
Aww7QXBwbGUgV29ybGR3aWRlIERldmVsb3BlciBSZWxhdGlvbnMgQ2VydGlmaWNh
dGlvbiBBdXRob3JpdHkxCzAJBgNVBAsMAkc0MRMwEQYDVQQKDApBcHBsZSBJbmMu
MQswCQYDVQQGEwJVUzCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBANAf
eKp6JzKwRl/nF3bYoJ0OKY6tPTKlxGs3yeRBkWq3eXFdDDQEYHX3rkOPR8SGHgjo
v9Y5Ui8eZ/xx8YJtPH4GUnadLLzVQ+mxtLxAOnhRXVGhJeG+bJGdayFZGEHVD41t
QSo5SiHgkJ9OE0/QjJoyuNdqkh4laqQyziIZhQVg3AJK8lrrd3kCfcCXVGySjnYB
5kaP5eYq+6KwrRitbTOFOCOL6oqW7Z+uZk+jDEAnbZXQYojZQykn/e2kv1MukBVl
PNkuYmQzHWxq3Y4hqqRfFcYw7V/mjDaSlLfcOQIA+2SM1AyB8j/VNJeHdSbCb64D
YyEMe9QbsWLFApy9/a8CAwEAAaOB7zCB7DASBgNVHRMBAf8ECDAGAQH/AgEAMB8G
A1UdIwQYMBaAFCvQaUeUdgn+9GuNLkCm90dNfwheMEQGCCsGAQUFBwEBBDgwNjA0
BggrBgEFBQcwAYYoaHR0cDovL29jc3AuYXBwbGUuY29tL29jc3AwMy1hcHBsZXJv
b3RjYTAuBgNVHR8EJzAlMCOgIaAfhh1odHRwOi8vY3JsLmFwcGxlLmNvbS9yb290
LmNybDAdBgNVHQ4EFgQUW9n6HeeaGgujmXYiUIY+kchbd6gwDgYDVR0PAQH/BAQD
AgEGMBAGCiqGSIb3Y2QGAgEEAgUAMA0GCSqGSIb3DQEBCwUAA4IBAQA/Vj2e5bbD
eeZFIGi9v3OLLBKeAuOugCKMBB7DUshwgKj7zqew1UJEggOCTwb8O0kU+9h0UoWv
p50h5wESA5/NQFjQAde/MoMrU1goPO6cn1R2PWQnxn6NHThNLa6B5rmluJyJlPef
x4elUWY0GzlxOSTjh2fvpbFoe4zuPfeutnvi0v/fYcZqdUmVIkSoBPyUuAsuORFJ
EtHlgepZAE9bPFo22noicwkJac3AfOriJP6YRLj477JxPxpd1F1+M02cHSS+APCQ
A1iZQT0xWmJArzmoUUOSqwSonMJNsUvSq3xKX+udO7xPiEAGE/+QF4oIRynoYpgp
pU8RBWk6z/Kf
-----END CERTIFICATE-----`;

// Apple Worldwide Developer Relations (WWDR) G3 Intermediate Certificate (PEM)
const APPLE_WWDR_G3_PEM = `-----BEGIN CERTIFICATE-----
MIIEUTCCAzmgAwIBAgIQfK9pCiW3Of57m0R6wXjF7jANBgkqhkiG9w0BAQsFADBi
MQswCQYDVQQGEwJVUzETMBEGA1UEChMKQXBwbGUgSW5jLjEmMCQGA1UECxMdQXBw
bGUgQ2VydGlmaWNhdGlvbiBBdXRob3JpdHkxFjAUBgNVBAMTDUFwcGxlIFJvb3Qg
Q0EwHhcNMjAwMjE5MTgxMzQ3WhcNMzAwMjIwMDAwMDAwWjB1MUQwQgYDVQQDDDtB
cHBsZSBXb3JsZHdpZGUgRGV2ZWxvcGVyIFJlbGF0aW9ucyBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTELMAkGA1UECwwCRzMxEzARBgNVBAoMCkFwcGxlIEluYy4xCzAJ
BgNVBAYTAlVTMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2PWJ/KhZ
C4fHTJEuLVaQ03gdpDDppUjvC0O/LYT7JF1FG+XrWTYSXFRknmxiLbTGl8rMPPbW
BpH85QKmHGq0edVny6zpPwcR4YS8Rx1mjjmi6LRJ7TrS4RBgeo6TjMrA2gzAg9Dj
+ZHWp4zIwXPirkbRYp2SqJBgN31ols2N4Pyb+ni743uvLRfdW/6AWSN1F7gSwe0b
5TTO/iK1nkmw5VW/j4SiPKi6xYaVFuQAyZ8D0MyzOhZ71gVcnetHrg21LYwOaU1A
0EtMOwSejSGxrC5DVDDOwYqGlJhL32oNP/77HK6XF8J4CjDgXx9UO0m3JQAaN4LS
VpelUkl8YDib7wIDAQABo4HvMIHsMBIGA1UdEwEB/wQIMAYBAf8CAQAwHwYDVR0j
BBgwFoAUK9BpR5R2Cf70a40uQKb3R01/CF4wRAYIKwYBBQUHAQEEODA2MDQGCCsG
AQUFBzABhihodHRwOi8vb2NzcC5hcHBsZS5jb20vb2NzcDAzLWFwcGxlcm9vdGNh
MC4GA1UdHwQnMCUwI6AhoB+GHWh0dHA6Ly9jcmwuYXBwbGUuY29tL3Jvb3QuY3Js
MB0GA1UdDgQWBBQJ/sAVkPmvZAqSErkmKGMMl+ynsjAOBgNVHQ8BAf8EBAMCAQYw
EAYKKoZIhvdjZAYCAQQCBQAwDQYJKoZIhvcNAQELBQADggEBAK1lE+j24IF3RAJH
Qr5fpTkg6mKp/cWQyXMT1Z6b0KoPjY3L7QHPbChAW8dVJEH4/M/BtSPp3Ozxb8qA
HXfCxGFJJWevD8o5Ja3T43rMMygNDi6hV0Bz+uZcrgZRKe3jhQxPYdwyFot30ETK
XXIDMUacrptAGvr04NM++i+MZp+XxFRZ79JI9AeZSWBZGcfdlNHAwWx/eCHvDOs7
bJmCS1JgOLU5gm3sUjFTvg+RTElJdI+mUcuER04ddSduvfnSXPN/wmwLCTbiZOTC
NwMUGdXqapSqqdv+9poIZ4vvK7iqF0mDr8/LvOnP6pVxsLRFoszlh6oKw0E6eVza
UDSdlTs=
-----END CERTIFICATE-----`;

// Default luxury loyalty PNG icon in Base64 (neutral emerald & gold emblem, 160x160)
const DEFAULT_ICON_BASE64 =
  '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';

export interface ApplePassSignParams {
  store: {
    id: string;
    slug?: string;
    name: string;
    primary_color?: string | null;
    secondary_color?: string | null;
    points_per_riyal?: number | null;
    phone?: string | null;
    logo_url?: string | null;
  };
  customer: {
    id: string;
    name?: string | null;
    phone?: string | null;
    wallet_balance?: number | null;
    points_balance?: number | null;
  };
  walletConfig?: {
    enabled?: boolean;
    loyalty_mode?: 'stamps' | 'points' | 'tiers' | 'cashback';
    stamps_target?: number;
    stamps_reward_title?: string;
    stamps_icon?: string;
    enable_spin_wheel?: boolean;
    enable_scratch_card?: boolean;
    scratch_card_reward_title?: string;
    enable_streaks?: boolean;
    streak_target_days?: number;
    streak_reward_title?: string;
    background_color?: string;
    foreground_color?: string;
    label_color?: string;
    lockscreen_message_template?: string;
    proximity_radius_meters?: number;
  } | null;
  branches?: Array<{
    name: string;
    latitude?: number | null;
    longitude?: number | null;
    lat?: number | null;
    lng?: number | null;
  }>;
  credentials: {
    passTypeId: string;
    teamId: string;
    p12Base64: string;
    p12Password?: string | null;
  };
}

// يحوّل نصًا ثنائيًا (binary string) إلى بايتات بدون Buffer حتى يعمل على Cloudflare
function binaryStringToBytes(bin: string): Uint8Array {
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
  return out;
}

function hexToRgb(hex?: string | null, defaultRgb = 'rgb(17, 14, 5)'): string {
  if (!hex) return defaultRgb;
  if (hex.startsWith('rgb(') || hex.startsWith('rgba(')) return hex;
  if (!hex.startsWith('#')) return defaultRgb;
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return `rgb(${r}, ${g}, ${b})`;
  }
  if (clean.length === 6) {
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return `rgb(${r}, ${g}, ${b})`;
  }
  return defaultRgb;
}

// Module-level caches for zero-CPU pass signing in Cloudflare Workers
let wwdrG4CertCache: any = null;
let wwdrG3CertCache: any = null;
let cachedCredentialsHash = '';
let cachedSignerCert: any = null;
let cachedSubtleKey: CryptoKey | null = null;

function getWwdrCerts() {
  if (!wwdrG4CertCache) wwdrG4CertCache = forge.pki.certificateFromPem(APPLE_WWDR_G4_PEM);
  if (!wwdrG3CertCache) wwdrG3CertCache = forge.pki.certificateFromPem(APPLE_WWDR_G3_PEM);
  return { wwdrG4Cert: wwdrG4CertCache, wwdrG3Cert: wwdrG3CertCache };
}

async function getOrInitCredentials(p12Base64: string, p12Password?: string | null): Promise<{
  signerCert: any;
  subtleKey: CryptoKey;
}> {
  const clean = p12Base64.trim().replace(/^["'\s]+|["'\s]+$/g, '');
  const credsHash = `${clean.slice(0, 50)}:${clean.length}:${p12Password || ''}`;

  if (cachedCredentialsHash === credsHash && cachedSignerCert && cachedSubtleKey) {
    return { signerCert: cachedSignerCert, subtleKey: cachedSubtleKey };
  }

  let signerCert: any = null;
  let signerKey: any = null;

  if (clean.includes('-----BEGIN')) {
    // PEM format direct parsing (ultra fast ~5ms)
    const certMatch = clean.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/);
    const keyMatch = clean.match(/-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA )?PRIVATE KEY-----/);
    if (!certMatch || !keyMatch) {
      throw new Error('ملف الـ PEM لا يحتوي على الشهادة والمفتاح الخاص بصيغة سليمة');
    }
    signerCert = forge.pki.certificateFromPem(certMatch[0]);
    signerKey = forge.pki.privateKeyFromPem(keyMatch[0]);
  } else {
    // PKCS#12 binary format
    const p12Der = forge.util.decode64(clean);
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, p12Password || '');

    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certBag = certBags[forge.pki.oids.certBag]?.[0];
    if (!certBag?.cert) {
      throw new Error('تعذر العثور على شهادة PassKit داخل ملف p12');
    }
    signerCert = certBag.cert;

    const shroudedBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    signerKey = shroudedBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]?.key;
    if (!signerKey) {
      const keyBags = p12.getBags({ bagType: forge.pki.oids.keyBag });
      signerKey = keyBags[forge.pki.oids.keyBag]?.[0]?.key;
    }
    if (!signerKey) {
      throw new Error('تعذر العثور على المفتاح الخاص داخل ملف p12');
    }
  }

  // Convert RSA private key to PKCS#8 DER for native WebCrypto hardware acceleration
  const rsaPrivateKeyAsn1 = forge.pki.privateKeyToAsn1(signerKey);
  const pkcs8Asn1 = forge.pki.wrapRsaPrivateKey(rsaPrivateKeyAsn1);
  const pkcs8Der = forge.asn1.toDer(pkcs8Asn1).getBytes();
  const pkcs8U8 = binaryStringToBytes(pkcs8Der);

  const subtleKey = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8U8,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' },
    false,
    ['sign']
  );

  cachedCredentialsHash = credsHash;
  cachedSignerCert = signerCert;
  cachedSubtleKey = subtleKey;

  return { signerCert, subtleKey };
}

/**
 *  توليد وتوقيع حزمة بطاقة آبل الرسمية (.pkpass) رقمياً بنظام PKCS#7 بسرعة فائقة
 */
export async function generateSignedApplePass(params: ApplePassSignParams): Promise<Uint8Array> {
  const { store, customer, branches = [], credentials } = params;

  if (!credentials.passTypeId || !credentials.teamId) {
    throw new Error('بيانات محفظة أبل غير مكتملة (Pass Type ID أو Team ID مفقود)');
  }

  if (!credentials.p12Base64 || !credentials.p12Base64.trim()) {
    throw new Error('شهادة التوقيع الرقمية (.p12) غير متوفرة');
  }

  // 1. استخراج الشهادة ومفتاح WebCrypto السريع
  const { signerCert, subtleKey } = await getOrInitCredentials(
    credentials.p12Base64,
    credentials.p12Password
  );

  // 2. تحميل شهادات Apple WWDR المعتمدة من الكاش
  const { wwdrG4Cert, wwdrG3Cert } = getWwdrCerts();

  // 3. بناء هيكل pass.json الرسمي المعتمد من Apple PassKit
  const cfg = params.walletConfig || null;
  const loyaltyMode = cfg?.loyalty_mode || 'points';
  const balance = customer.wallet_balance ?? customer.points_balance ?? 0;

  // استخراج كود تاجر نظيف ومعبر باللغة الإنجليزية للأكواد والباركود
  const storeCode = (
    store.slug ||
    store.name ||
    'STORE'
  )
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 10) || `STORE-${store.id.slice(0, 4).toUpperCase()}`;

  const passSerial = customer.phone
    ? `${storeCode}-${store.id.slice(0, 4)}-${customer.phone}`
    : `${storeCode}-VIP-${customer.id.slice(0, 6)}`;
  const qrData = `${storeCode}:LOYALTY:${store.id}:${customer.id}:${customer.phone || 'GUEST'}:${Date.now()}`;

  // الألوان: الأولوية لإعدادات التاجر المخصصة في بطاقة المحفظة، ثم ألوان المتجر، ثم الافتراضيات الأنيقة
  const bgColor = cfg?.background_color || store.primary_color || '#110E05';
  const labelColor = cfg?.label_color || store.secondary_color || '#E3B94A';
  const fgColor = cfg?.foreground_color || '#FFFFFF';

  // حساب الحقول الديناميكية بناءً على نمط الولاء المختار من التاجر
  const isStamps = loyaltyMode === 'stamps';
  const stampsTarget = cfg?.stamps_target || 6;
  const currentStamps = balance % stampsTarget;
  const stampsIcon = cfg?.stamps_icon || '☕';
  const rewardTitle = cfg?.stamps_reward_title || 'مكافأة خاصة 🎁';

  let headerFields: any[] = [];
  let primaryFields: any[] = [];
  let auxiliaryFields: any[] = [];

  if (isStamps) {
    headerFields = [
      {
        key: 'reward',
        label: 'الهدية القادمة',
        value: rewardTitle,
      },
    ];
    primaryFields = [
      {
        key: 'stamps',
        label: 'الأختام المجمعة',
        value: `${currentStamps} من ${stampsTarget} ${stampsIcon}`,
        changeMessage: 'تم إضافة ختم جديد إلى بطاقتك! %@ 🎉',
      },
    ];
    auxiliaryFields = [
      {
        key: 'status',
        label: 'حالة الحساب',
        value: 'نشط ومفعل ✓',
      },
      {
        key: 'stampsLeft',
        label: 'المتبقي للهدية',
        value: `${Math.max(0, stampsTarget - currentStamps)} زيارات`,
      },
    ];
  } else if (loyaltyMode === 'cashback') {
    headerFields = [
      {
        key: 'tier',
        label: 'نوع البطاقة',
        value: 'الرصيد المشحون',
      },
    ];
    primaryFields = [
      {
        key: 'balance',
        label: 'الرصيد المتاح',
        value: `${balance.toFixed(2)} ر.س`,
        changeMessage: 'تم تحديث رصيدك إلى %@ 🎉',
      },
    ];
    auxiliaryFields = [
      {
        key: 'status',
        label: 'حالة الحساب',
        value: 'نشط ومفعل ✓',
      },
      {
        key: 'currency',
        label: 'العملة المعتمدة',
        value: 'ريال سعودي (SAR)',
      },
    ];
  } else {
    // Standard 'points' and 'tiers' mode
    headerFields = [
      {
        key: 'tier',
        label: 'الفئة',
        value: 'عضوية VIP',
      },
    ];
    primaryFields = [
      {
        key: 'balance',
        label: 'رصيد النقاط',
        value: balance,
        changeMessage: 'تم تحديث رصيدك إلى %@ 🎉',
      },
    ];
    auxiliaryFields = [
      {
        key: 'status',
        label: 'حالة الحساب',
        value: 'نشط ومفعل ✓',
      },
      {
        key: 'pointsRate',
        label: 'معدل الكسب',
        value: `${store.points_per_riyal || 1} نقطة / ﷼`,
      },
    ];
  }

  // نص إشعار شاشة القفل التلقائي عند الاقتراب الجغرافي
  let lockscreenText = cfg?.lockscreen_message_template || '';
  if (!lockscreenText) {
    if (isStamps) {
      lockscreenText = 'أهلاً بك بالقرب من {store}! تفضل بزيارتنا ولديك {stamps} أختام ومكافأتك بانتظارك 🎁☕';
    } else {
      lockscreenText = 'أهلاً بك بالقرب من {store}! لديك {points} نقطة ومكافآت بانتظارك ☕🎁';
    }
  }

  const renderedLockscreenText = lockscreenText
    .replace('{store}', store.name)
    .replace('{points}', String(balance))
    .replace('{stamps}', String(currentStamps))
    .replace('{reward}', rewardTitle)
    .replace('{customer}', customer.name || 'عميل مميز');

  const locations = (branches.length > 0 ? branches : [
    { name: 'الفرع الرئيسي', lat: 24.700346, lng: 46.685324 },
  ]).slice(0, 10).map((b) => ({
    latitude: b.latitude || b.lat || 24.700346,
    longitude: b.longitude || b.lng || 46.685324,
    relevantText: renderedLockscreenText,
  }));

  const backFields: any[] = [
    {
      key: 'storeName',
      label: 'اسم المتجر',
      value: store.name,
    },
    {
      key: 'phone',
      label: 'رقم التواصل',
      value: store.phone || '+966577371780',
    },
  ];

  if (cfg?.enable_spin_wheel) {
    backFields.push({
      key: 'spinWheel',
      label: '🎡 عجلة الحظ التفاعلية',
      value: 'متاحة للتدوير في محفظتك الرقمية بعد كل عملية شراء للكاشير لربح جوائز وخصومات فورية!',
    });
  }

  if (cfg?.enable_scratch_card) {
    backFields.push({
      key: 'scratchCard',
      label: '🎁 بطاقة اكشط واربح',
      value: cfg.scratch_card_reward_title || 'مكافآت المناسبات والأعياد متاحة في محفظتك الرقمية.',
    });
  }

  if (cfg?.enable_streaks) {
    backFields.push({
      key: 'streaks',
      label: '🔥 تحدي سلسلة الزيارات',
      value: `قم بزيارتنا ${cfg.streak_target_days || 3} مرات متتالية لكسب: ${cfg.streak_reward_title || 'مكافأة خاصة'}!`,
    });
  }

  const proximityRadius = cfg?.proximity_radius_meters || 300;

  backFields.push(
    {
      key: 'geofence',
      label: 'تنبيهات القرب الجغرافي',
      value: `تظهر هذه البطاقة تلقائياً على شاشة القفل عند اقترابك ضمن ${proximityRadius} متر من أي من فروعنا.`,
    },
    {
      key: 'terms',
      label: 'الشروط والأحكام',
      value: 'النقاط والأختام مخصصة للاستخدام الشخصي وغير قابلة للتحويل النقدي. تطبق شروط برنامج الولاء.',
    },
    {
      key: 'platform',
      label: 'النظام المشغل',
      value: 'منصة الولاء والمدفوعات الذكية • سديم الأثر',
    }
  );

  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: credentials.passTypeId.trim(),
    serialNumber: passSerial,
    teamIdentifier: credentials.teamId.trim(),
    organizationName: store.name,
    description: `بطاقة ولاء ${store.name}`,
    logoText: store.name,
    foregroundColor: hexToRgb(fgColor, 'rgb(255, 255, 255)'),
    backgroundColor: hexToRgb(bgColor, 'rgb(17, 14, 5)'),
    labelColor: hexToRgb(labelColor, 'rgb(227, 185, 74)'),
    storeCard: {
      headerFields,
      primaryFields,
      secondaryFields: [
        {
          key: 'customerName',
          label: 'اسم العضو',
          value: customer.name || 'عميل مميز',
        },
        {
          key: 'memberCode',
          label: 'رقم العضوية',
          value: customer.phone ? `VIP-${customer.phone.slice(-6)}` : 'VIP-0001',
        },
      ],
      auxiliaryFields,
      backFields,
    },
    barcodes: [
      {
        format: 'PKBarcodeFormatQR',
        message: qrData,
        messageEncoding: 'iso-8859-1',
        altText: customer.phone ? `VIP-${customer.phone.slice(-6)}` : 'VIP-MEMBER',
      },
    ],
    locations,
    maxDistance: proximityRadius,
  };

  // 4. تجهيز ملفات الحزمة
  const zipFiles: Record<string, Uint8Array> = {};

  const passJsonStr = JSON.stringify(passJson, null, 2);
  zipFiles['pass.json'] = strToU8(passJsonStr);

  // جلب شعار المتجر الحقيقي (Logo) بدلاً من الشعار العام الافتراضي
  const defaultIconU8 = binaryStringToBytes(forge.util.decode64(DEFAULT_ICON_BASE64));
  let storeLogoU8: Uint8Array = defaultIconU8;

  if (store.logo_url && typeof store.logo_url === 'string') {
    const rawLogo = store.logo_url.trim();
    try {
      if (rawLogo.startsWith('data:image/')) {
        const comma = rawLogo.indexOf(',');
        if (comma !== -1) {
          let b64 = rawLogo.slice(comma + 1).trim().replace(/\s+/g, '+');
          while (b64.length % 4 !== 0) b64 += '=';
          const rawBin = typeof atob === 'function' ? atob(b64) : forge.util.decode64(b64);
          const bytes = binaryStringToBytes(rawBin);
          const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
          const isJpg = bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
          if (isPng || isJpg) {
            storeLogoU8 = bytes;
          }
        }
      } else if (/^https?:\/\//i.test(rawLogo)) {
        const imgRes = await fetch(rawLogo, {
          cf: {
            image: {
              format: 'png',
              width: 160,
              height: 160,
              fit: 'contain',
            },
          },
          headers: { Accept: 'image/png,image/jpeg,image/*;q=0.9' },
        } as any);
        if (imgRes.ok) {
          const ab = await imgRes.arrayBuffer();
          if (ab.byteLength > 100 && ab.byteLength < 5 * 1024 * 1024) {
            const bytes = new Uint8Array(ab);
            const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
            const isJpg = bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
            if (isPng || isJpg) {
              storeLogoU8 = bytes;
            } else {
              console.warn('Custom logo format is neither PNG nor JPEG, skipping:', rawLogo);
            }
          }
        }
      }
    } catch (logoErr) {
      console.warn('Failed to load custom store logo, fallback to default:', logoErr);
    }
  }

  // إضافة الأيقونات والشعارات لبطاقة Apple PassKit
  zipFiles['icon.png'] = storeLogoU8;
  zipFiles['icon@2x.png'] = storeLogoU8;
  zipFiles['icon@3x.png'] = storeLogoU8;
  zipFiles['logo.png'] = storeLogoU8;
  zipFiles['logo@2x.png'] = storeLogoU8;
  zipFiles['logo@3x.png'] = storeLogoU8;

  // 5. حساب جدول SHA-1 (manifest.json) لكافة الملفات
  const manifest: Record<string, string> = {};
  for (const [filename, fileBytes] of Object.entries(zipFiles)) {
    const md = forge.md.sha1.create();
    md.update(forge.util.binary.raw.encode(fileBytes));
    manifest[filename] = md.digest().toHex();
  }

  const manifestStr = JSON.stringify(manifest, null, 2);
  zipFiles['manifest.json'] = strToU8(manifestStr);

  // 6. التوقيع الرقمي بنظام PKCS#7 المنفصل عبر WebCrypto السريع
  const dummyKey = { sign: () => 'DUMMY'.repeat(51).slice(0, 256) };

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(manifestStr, 'utf8');
  p7.addCertificate(signerCert);
  p7.addCertificate(wwdrG4Cert);
  p7.addCertificate(wwdrG3Cert);
  p7.addSigner({
    key: dummyKey as any,
    certificate: signerCert,
    digestAlgorithm: forge.pki.oids.sha1,
    authenticatedAttributes: [
      {
        type: forge.pki.oids.contentType,
        value: forge.pki.oids.data,
      },
      {
        type: forge.pki.oids.messageDigest,
      },
      {
        type: forge.pki.oids.signingTime,
        value: (new Date() as any),
      },
    ],
  });

  p7.sign({ detached: true });

  // حساب التوقيع الرقمي عبر عتاد WebCrypto السريع (أقل من 1 ميلي ثانية)
  const signer = (p7 as any).signers[0];
  const attrsAsn1 = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, []);
  for (let i = 0; i < (signer.authenticatedAttributesAsn1 as any).value.length; i++) {
    (attrsAsn1.value as any[]).push((signer.authenticatedAttributesAsn1 as any).value[i]);
  }
  const attrsDer = forge.asn1.toDer(attrsAsn1).getBytes();
  const attrsU8 = binaryStringToBytes(attrsDer);

  const realSigBuf = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, subtleKey, attrsU8);
  const realSigU8 = new Uint8Array(realSigBuf);
  let realSigBinary = '';
  for (let i = 0; i < realSigU8.length; i++) realSigBinary += String.fromCharCode(realSigU8[i]);

  const sigField = (p7 as any).signerInfos[0].value.find((v: any) => v.type === forge.asn1.Type.OCTETSTRING);
  if (sigField) {
    sigField.value = realSigBinary;
  }

  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  zipFiles['signature'] = binaryStringToBytes(der);

  // 7. ضغط وتجميع ملف .pkpass الثنائي النهائي
  return zipSync(zipFiles);
}
