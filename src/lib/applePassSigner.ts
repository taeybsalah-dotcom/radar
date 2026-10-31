import forge from 'node-forge';
import { zipSync, strToU8 } from 'fflate';

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

// Default standard 32x32 PNG icon in Base64
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
  if (!hex || !hex.startsWith('#')) return defaultRgb;
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

/**
 *  توليد وتوقيع حزمة بطاقة آبل الرسمية (.pkpass) رقمياً بنظام PKCS#7
 */
export function generateSignedApplePass(params: ApplePassSignParams): Uint8Array {
  const { store, customer, branches = [], credentials } = params;

  if (!credentials.passTypeId || !credentials.teamId) {
    throw new Error('بيانات محفظة أبل غير مكتملة (Pass Type ID أو Team ID مفقود)');
  }

  if (!credentials.p12Base64 || !credentials.p12Base64.trim()) {
    throw new Error('شهادة التوقيع الرقمية (.p12) غير متوفرة');
  }

  // 1. فك تشفير شهادة الـ p12 واستخراج المفتاح الخاص والشهادة
  const cleanB64 = credentials.p12Base64.trim().replace(/^["'\s]+|["'\s]+$/g, '');
  const p12Der = forge.util.decode64(cleanB64);
  const p12Asn1 = forge.asn1.fromDer(p12Der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, credentials.p12Password || '');

  // استخراج الشهادة
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag = certBags[forge.pki.oids.certBag]?.[0];
  if (!certBag?.cert) {
    throw new Error('تعذر العثور على شهادة PassKit داخل ملف p12');
  }
  const signerCert = certBag.cert;

  // استخراج المفتاح الخاص (Shrouded أو عادي)
  const shroudedBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  let signerKey = shroudedBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]?.key;
  if (!signerKey) {
    const keyBags = p12.getBags({ bagType: forge.pki.oids.keyBag });
    signerKey = keyBags[forge.pki.oids.keyBag]?.[0]?.key;
  }
  if (!signerKey) {
    throw new Error('تعذر العثور على المفتاح الخاص داخل ملف p12');
  }

  // 2. تحميل شهادات Apple WWDR المعتمدة
  const wwdrG4Cert = forge.pki.certificateFromPem(APPLE_WWDR_G4_PEM);
  const wwdrG3Cert = forge.pki.certificateFromPem(APPLE_WWDR_G3_PEM);

  // 3. بناء هيكل pass.json الرسمي المعتمد من Apple PassKit
  const balance = customer.wallet_balance ?? customer.points_balance ?? 0;
  const passSerial = customer.phone
    ? `RADAR-${store.id.slice(0, 4)}-${customer.phone}`
    : `RADAR-VIP-${customer.id.slice(0, 6)}`;
  const qrData = `RADAR:LOYALTY:${store.id}:${customer.id}:${customer.phone || 'GUEST'}:${Date.now()}`;

  const locations = (branches.length > 0 ? branches : [
    { name: 'الفرع الرئيسي', lat: 24.700346, lng: 46.685324 },
  ]).slice(0, 10).map((b) => ({
    latitude: b.latitude || b.lat || 24.700346,
    longitude: b.longitude || b.lng || 46.685324,
    relevantText: `أهلاً بك بالقرب من ${store.name}! لديك ${balance} نقطة بانتظارك ☕🎁`,
  }));

  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: credentials.passTypeId.trim(),
    serialNumber: passSerial,
    teamIdentifier: credentials.teamId.trim(),
    organizationName: store.name,
    description: `بطاقة ولاء ${store.name}`,
    logoText: store.name,
    foregroundColor: 'rgb(255, 255, 255)',
    backgroundColor: hexToRgb(store.primary_color, 'rgb(17, 14, 5)'),
    labelColor: hexToRgb(store.secondary_color, 'rgb(227, 185, 74)'),
    storeCard: {
      headerFields: [
        {
          key: 'tier',
          label: 'الفئة',
          value: 'عضوية VIP',
        },
      ],
      primaryFields: [
        {
          key: 'balance',
          label: 'رصيد النقاط',
          value: balance,
          changeMessage: 'تم تحديث رصيدك إلى %@ 🎉',
        },
      ],
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
      auxiliaryFields: [
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
      ],
      backFields: [
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
        {
          key: 'geofence',
          label: 'تنبيهات القرب الجغرافي',
          value: 'تظهر هذه البطاقة تلقائياً على شاشة القفل عند اقترابك من أي من فروعنا.',
        },
        {
          key: 'terms',
          label: 'الشروط والأحكام',
          value: 'النقاط مخصصة للاستخدام الشخصي وغير قابلة للتحويل النقدي. تطبق شروط برنامج الولاء.',
        },
        {
          key: 'platform',
          label: 'النظام المشغل',
          value: 'منصة الولاء والمدفوعات الذكية • سديم الأثر',
        },
      ],
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
    maxDistance: 300,
  };

  // 4. تجهيز ملفات الحزمة
  const zipFiles: Record<string, Uint8Array> = {};

  const passJsonStr = JSON.stringify(passJson, null, 2);
  zipFiles['pass.json'] = strToU8(passJsonStr);

  // إضافة الأيقونات الإلزامية من أبل
  const iconU8 = binaryStringToBytes(forge.util.decode64(DEFAULT_ICON_BASE64));
  zipFiles['icon.png'] = iconU8;
  zipFiles['icon@2x.png'] = iconU8;
  zipFiles['logo.png'] = iconU8;
  zipFiles['logo@2x.png'] = iconU8;

  // 5. حساب جدول SHA-1 (manifest.json) لكافة الملفات
  const manifest: Record<string, string> = {};
  for (const [filename, fileBytes] of Object.entries(zipFiles)) {
    const md = forge.md.sha1.create();
    md.update(forge.util.binary.raw.encode(fileBytes));
    manifest[filename] = md.digest().toHex();
  }

  const manifestStr = JSON.stringify(manifest, null, 2);
  zipFiles['manifest.json'] = strToU8(manifestStr);

  // 6. التوقيع الرقمي بنظام PKCS#7 المنفصل (Detached Signature)
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(manifestStr, 'utf8');
  p7.addCertificate(signerCert);
  p7.addCertificate(wwdrG4Cert);
  p7.addCertificate(wwdrG3Cert);
  p7.addSigner({
    key: signerKey,
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
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  zipFiles['signature'] = binaryStringToBytes(der);

  // 7. ضغط وتجميع ملف .pkpass الثنائي النهائي
  return zipSync(zipFiles);
}
