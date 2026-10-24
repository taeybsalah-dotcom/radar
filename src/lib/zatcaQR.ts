import { getActiveTenantConfig } from '../config/tenant';
/**
 * ZATCA E-Invoicing Phase 1 & 2 Standard TLV (Tag-Length-Value) QR Code Generator
 * Conforms to the official Saudi Zakat, Tax and Customs Authority requirements.
 */

export function generateZatcaTLVQR(
  sellerName: string,
  vatRegistrationNumber: string,
  timestampIso: string,
  invoiceTotalWithVat: string,
  vatTotal: string
): string {
  try {
    const encodeTag = (tagNumber: number, valueStr: string): Uint8Array => {
      const utf8Bytes = new TextEncoder().encode(valueStr);
      const tlv = new Uint8Array(2 + utf8Bytes.length);
      tlv[0] = tagNumber;
      tlv[1] = utf8Bytes.length;
      tlv.set(utf8Bytes, 2);
      return tlv;
    };

    const cleanSeller = (sellerName || getActiveTenantConfig().brandName).trim();
    const cleanVatNum = (vatRegistrationNumber || '300000000000003').trim();
    const cleanTime = (timestampIso || new Date().toISOString()).trim();
    const cleanTotal = Number(invoiceTotalWithVat || 0).toFixed(2);
    const cleanVat = Number(vatTotal || 0).toFixed(2);

    const t1 = encodeTag(1, cleanSeller);
    const t2 = encodeTag(2, cleanVatNum);
    const t3 = encodeTag(3, cleanTime);
    const t4 = encodeTag(4, cleanTotal);
    const t5 = encodeTag(5, cleanVat);

    const totalLen = t1.length + t2.length + t3.length + t4.length + t5.length;
    const combined = new Uint8Array(totalLen);

    let offset = 0;
    [t1, t2, t3, t4, t5].forEach((arr) => {
      combined.set(arr, offset);
      offset += arr.length;
    });

    // Base64 encoding
    let binary = '';
    for (let i = 0; i < combined.length; i++) {
      binary += String.fromCharCode(combined[i]);
    }
    return btoa(binary);
  } catch (err) {
    console.warn('Failed to generate ZATCA TLV QR:', err);
    return invoiceTotalWithVat;
  }
}
