import crypto from 'crypto';

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
    const { issuer_id, client_email, private_key } = req.body || {};

    const cleanIssuer = (issuer_id || '').trim();
    const cleanEmail = (client_email || '').trim();
    let cleanKey = (private_key || '').trim();

    if (!cleanIssuer) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال معرف المصدر (Issuer ID)' });
    }
    if (!/^\d{10,25}$/.test(cleanIssuer)) {
      return res.status(400).json({
        success: false,
        error: `معرف جهة الإصدار (${cleanIssuer}) غير صالح. يجب أن يتكون من 10 إلى 22 رقماً مطابقاً لـ Google Pay Console (مثل: 3388000000023226136)`,
      });
    }

    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.endsWith('.iam.gserviceaccount.com')) {
      return res.status(400).json({
        success: false,
        error: 'البريد الإلكتروني غير صالح. يجب أن يكون Service Account Email ينتهي بـ .iam.gserviceaccount.com',
      });
    }

    if (!cleanKey) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال المفتاح الخاص (Google Private Key)' });
    }

    // Sanitize PEM format
    cleanKey = cleanKey.replace(/^["'\s]+|["'\s]+$/g, '');
    cleanKey = cleanKey.replace(/\\n/g, '\n');
    if (!cleanKey.includes('-----BEGIN PRIVATE KEY-----')) {
      cleanKey = `-----BEGIN PRIVATE KEY-----\n${cleanKey}`;
    }
    if (!cleanKey.includes('-----END PRIVATE KEY-----')) {
      cleanKey = `${cleanKey}\n-----END PRIVATE KEY-----`;
    }

    // Step 1: Validate RSA Private Key with Node.js crypto
    let signer: crypto.Sign;
    try {
      signer = crypto.createSign('RSA-SHA256');
    } catch (e: any) {
      return res.status(400).json({ success: false, error: `خطأ في محرك التشفير: ${e.message}` });
    }

    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
      iss: cleanEmail,
      scope: 'https://www.googleapis.com/auth/wallet_object.issuer',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 300,
      iat: now,
    };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const message = `${encodedHeader}.${encodedPayload}`;

    let signedJwt = '';
    try {
      signer.update(message);
      const signature = signer.sign(cleanKey);
      const encodedSignature = base64UrlEncode(signature);
      signedJwt = `${message}.${encodedSignature}`;
    } catch (keyErr: any) {
      return res.status(400).json({
        success: false,
        error: `المفتاح الخاص (Private Key) تالف أو غير صالح للـ RSA 2048! تأكد من نسخه بدقة من ملف الـ JSON الرسمي (${keyErr.message})`,
      });
    }

    // Step 2: Live Ping to Google OAuth2 token server
    const params = new URLSearchParams();
    params.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    params.append('assertion', signedJwt);

    const googleRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const googleData: any = await googleRes.json();

    if (!googleRes.ok || googleData.error) {
      let friendlyError = googleData.error_description || googleData.error || 'فشل التحقق من الحساب لدى قوقل';
      if (friendlyError.includes('account not found')) {
        friendlyError = `حساب الخدمة (${cleanEmail}) غير موجود لدى Google Cloud أو تم حذفه!`;
      } else if (friendlyError.includes('signature verification failed') || friendlyError.includes('invalid_grant')) {
        friendlyError = `المفتاح الخاص لا يتطابق مع حساب الخدمة (${cleanEmail}) لدى قوقل! تأكد من استخدام ملف الـ JSON الصحيح.`;
      }
      return res.status(400).json({
        success: false,
        error: friendlyError,
        raw: googleData,
      });
    }

    // Success! Google server validated the key and issued an access token
    return res.status(200).json({
      success: true,
      message: `تم التحقق بنجاح 100% مع خوادم Google الرسمية! حساب الخدمة (${cleanEmail}) معتمد ومفوض للمصدر (${cleanIssuer}) 🌐✅`,
      token_type: googleData.token_type,
      expires_in: googleData.expires_in,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: `حدث خطأ أثناء فحص بيانات قوقل: ${err.message}`,
    });
  }
}
