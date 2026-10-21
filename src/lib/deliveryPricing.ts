import { StoreBranch, DeliveryDistanceTier } from '../types';

export interface DeliveryCalculationResult {
  is_deliverable: boolean;
  distance_km?: number;
  delivery_fee: number;
  matched_tier?: DeliveryDistanceTier;
  error_reason?: 'EXCEEDS_RADIUS' | 'NO_COORDINATES' | 'DELIVERY_DISABLED';
  message?: string;
}

/**
 * الشرائح الافتراضية للتوصيل عند إنشاء أو تهيئة الفرع
 */
export const DEFAULT_DELIVERY_TIERS: DeliveryDistanceTier[] = [
  { id: 'tier_1', max_km: 5, fee: 10, label: 'النطاق القريب (0 - 5 كم)' },
  { id: 'tier_2', max_km: 10, fee: 16, label: 'النطاق المتوسط (5 - 10 كم)' },
  { id: 'tier_3', max_km: 15, fee: 24, label: 'النطاق البعيد (10 - 15 كم)' },
];

export const DEFAULT_MAX_DELIVERY_RADIUS_KM = 15;

/**
 * حساب المسافة الجغرافية الدقيقة بين نقطتين بالكيلومتر باستخدام صيغة Haversine
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (lat1 === lat2 && lon1 === lon2) return 0;

  const R = 6371; // نصف قطر الأرض بالكيلومتر
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  // تقريب إلى خانة عشرية واحدة (مثال: 4.2 كم)
  return Math.round(distance * 10) / 10;
}

/**
 * استخراج الإحداثيات (خط العرض وخط الطول) من رابط أو نص خرائط قوقل
 */
export function extractCoordsFromMapUrl(
  input: string
): { lat: number; lng: number } | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();

  // 1. صيغة إحداثيات مباشرة: "24.7136, 46.6753" أو "24.7136,46.6753"
  const directMatch = trimmed.match(/^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/);
  if (directMatch) {
    const lat = parseFloat(directMatch[1]);
    const lng = parseFloat(directMatch[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }

  // 2. صيغة الرابط: ?q=24.7136,46.6753 أو &query=...
  const qMatch = trimmed.match(/[?&](?:q|query)=(-?\d+\.\d+),(-?\d+\.\d+)/i);
  if (qMatch) {
    const lat = parseFloat(qMatch[1]);
    const lng = parseFloat(qMatch[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }

  // 3. صيغة الرابط: /maps/@24.7136,46.6753,15z
  const atMatch = trimmed.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lng = parseFloat(atMatch[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }

  // 4. صيغة الرابط: /place/24.7136,46.6753 أو /place/.../@24.7136,46.6753
  const placeMatch = trimmed.match(/\/place\/(-?\d+\.\d+)\+?,\+?(-?\d+\.\d+)/);
  if (placeMatch) {
    const lat = parseFloat(placeMatch[1]);
    const lng = parseFloat(placeMatch[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }

  return null;
}

function isValidLatLng(lat: number, lng: number): boolean {
  return !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/**
 * حساب رسوم التوصيل وفحص النطاق الجغرافي للفرع المختار
 */
export function calculateDeliveryFee(
  branch?: StoreBranch | null,
  customerLat?: number | null,
  customerLng?: number | null,
  fallbackStoreFee: number = 0
): DeliveryCalculationResult {
  // 1. إذا كان الفرع غير محدد أو معطل التوصيل
  if (branch && branch.delivery_available === false) {
    return {
      is_deliverable: false,
      delivery_fee: 0,
      error_reason: 'DELIVERY_DISABLED',
      message: `التوصيل غير متاح حالياً في فرع (${branch.name || 'المحدد'}).`,
    };
  }

  const branchRadius = branch?.delivery_radius_km || DEFAULT_MAX_DELIVERY_RADIUS_KM;
  const tiers = (branch?.delivery_tiers && branch.delivery_tiers.length > 0)
    ? branch.delivery_tiers
    : DEFAULT_DELIVERY_TIERS;
  const sortedTiers = [...tiers].sort((a, b) => a.max_km - b.max_km);
  const defaultBranchFee = branch?.delivery_fee ?? fallbackStoreFee;

  // 2. إذا توفرت إحداثيات الفرع والعميل: حساب جغرافي دقيق
  if (
    branch?.lat != null &&
    branch?.lng != null &&
    customerLat != null &&
    customerLng != null
  ) {
    const distanceKm = calculateHaversineDistance(
      branch.lat,
      branch.lng,
      customerLat,
      customerLng
    );

    // فحص تجاوز أقصى نطاق للفرع
    if (distanceKm > branchRadius) {
      return {
        is_deliverable: false,
        distance_km: distanceKm,
        delivery_fee: defaultBranchFee,
        error_reason: 'EXCEEDS_RADIUS',
        message: `موقعك يبعد (${distanceKm} كم) ويقع خارج نطاق التوصيل لهذا الفرع (أقصى نطاق: ${branchRadius} كم).`,
      };
    }

    // تسعير الشرائح (Tiered Pricing)
    if (branch.delivery_pricing_type === 'tiered' || (!branch.delivery_pricing_type && sortedTiers.length > 0)) {
      const matched = sortedTiers.find((t) => distanceKm <= t.max_km);
      if (matched) {
        return {
          is_deliverable: true,
          distance_km: distanceKm,
          delivery_fee: matched.fee,
          matched_tier: matched,
          message: `رسوم التوصيل: ${matched.fee} ر.س (${matched.label || `${distanceKm} كم`})`,
        };
      }
      // إذا كان داخل النطاق الأقصى لكن أكبر من آخر شريحة، نأخذ أعلى شريحة
      const maxTier = sortedTiers[sortedTiers.length - 1];
      return {
        is_deliverable: true,
        distance_km: distanceKm,
        delivery_fee: maxTier.fee,
        matched_tier: maxTier,
        message: `رسوم التوصيل: ${maxTier.fee} ر.س (${distanceKm} كم)`,
      };
    }

    // تسعير ثابت مع تحديد المسافة
    return {
      is_deliverable: true,
      distance_km: distanceKm,
      delivery_fee: defaultBranchFee,
      message: `رسوم التوصيل: ${defaultBranchFee} ر.س (المسافة: ${distanceKm} كم)`,
    };
  }

  // 3. في حال عدم توفر إحداثيات GPS (إدخال عنوان نصي فقط): الاعتماد على السعر الافتراضي
  return {
    is_deliverable: true,
    delivery_fee: defaultBranchFee,
    error_reason: 'NO_COORDINATES',
    message: `رسوم التوصيل الافتراضية: ${defaultBranchFee} ر.س`,
  };
}

/**
 * تقدير وقت التوصيل المتوقع بناءً على المسافة ووقت التحضير
 */
export function estimateDeliveryTime(
  distanceKm?: number | null,
  prepMinutes: number = 20
): { minMinutes: number; maxMinutes: number; label: string } {
  if (!distanceKm || distanceKm <= 0) {
    return {
      minMinutes: prepMinutes + 10,
      maxMinutes: prepMinutes + 25,
      label: `${prepMinutes + 10} - ${prepMinutes + 25} دقيقة`,
    };
  }

  // معدل سرعة توصيل المدينة: ~3 إلى 4 دقائق لكل كيلومتر
  const transitMin = Math.round(distanceKm * 2.5);
  const transitMax = Math.round(distanceKm * 4.0);

  const totalMin = prepMinutes + transitMin;
  const totalMax = prepMinutes + transitMax;

  return {
    minMinutes: totalMin,
    maxMinutes: totalMax,
    label: `${totalMin} - ${totalMax} دقيقة`,
  };
}
