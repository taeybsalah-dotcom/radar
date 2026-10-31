import { Store, Customer, Tier, StoreBranch, StoreWalletPassConfig, ProximityDistanceResult, WalletDeviceRegistration, SpinWheelPrize } from '../types';
import { getSupabaseClient, LoyaltyService } from './supabase';

const WALLET_CONFIG_STORAGE_KEY_PREFIX = 'radar_wallet_pass_config_';
const WALLET_DEVICES_STORAGE_KEY_PREFIX = 'radar_wallet_device_registrations_';

// Default Saudi Branches GPS fallbacks if store has no coordinates set
const DEFAULT_FALLBACK_BRANCHES: { name: string; lat: number; lng: number }[] = [
  { name: 'الفرع الرئيسي (طريق التحلية)', lat: 24.700346, lng: 46.685324 }, // Riyadh Tahlia
  { name: 'فرع مجمع النخيل مول', lat: 24.786591, lng: 46.711582 }, // Nakheel Mall
  { name: 'فرع بوليفارد سيتي', lat: 24.770853, lng: 46.602511 }, // Boulevard Riyadh
];

export const DEFAULT_SPIN_WHEEL_PRIZES: SpinWheelPrize[] = [
  { id: 'p1', label: 'خصم 15% على طلبك القادم', reward_type: 'discount_percent', reward_value: 15, probability_weight: 35, color: '#F59E0B' },
  { id: 'p2', label: 'مشروب أو حلى مجاني 🍩', reward_type: 'free_item', reward_value: 'حلى مجاني', probability_weight: 20, color: '#10B981' },
  { id: 'p3', label: '50 نقطة مكافأة إضافية ⭐', reward_type: 'points', reward_value: 50, probability_weight: 25, color: '#6366F1' },
  { id: 'p4', label: 'حظ أوفر في زيارتك القادمة 🎯', reward_type: 'no_luck', reward_value: 0, probability_weight: 20, color: '#64748B' },
];

/**
 * تحويل شعار المتجر إلى صيغة PNG نقية لضمان قبولها في Apple PassKit
 */
async function rasterizeLogoToPngDataUrl(logoUrl: string): Promise<string | null> {
  if (typeof window === 'undefined' || !logoUrl) return null;
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const maxDim = 80;
          let w = img.naturalWidth || img.width || maxDim;
          let h = img.naturalHeight || img.height || maxDim;
          if (w > maxDim || h > maxDim) {
            const scale = Math.min(maxDim / w, maxDim / h);
            w = Math.round(w * scale);
            h = Math.round(h * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(w, 20);
          canvas.height = Math.max(h, 20);
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/png');
          resolve(dataUrl);
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = logoUrl;
    } catch {
      resolve(null);
    }
  });
}

export class WalletPassService {
  /**
   * جلب إعدادات بطاقة المحفظة للمتجر (سحابياً ومحلياً مع القيم الافتراضية الذكية)
   */
  static getWalletConfig(store: Store): StoreWalletPassConfig {
    const defaultColor = store.secondary_color || '#E3B94A';
    const bg = store.primary_color || '#110E05';

    // Auto-detect if store is a Cafe or Restaurant
    const isCafe = /كافيه|مقهى|قهوة|هاف مليون|half million|cafe|coffee|مطعم|restaurant/i.test(store.name || '');

    // 0. Check Master Platform Credentials configured by Super Admin
    let platformWallet: any = {};
    try {
      const cached = localStorage.getItem('radar_platform_wallet_credentials');
      if (cached) platformWallet = JSON.parse(cached);
    } catch {}

    const masterApplePassId = platformWallet.apple_pass_type_id || `pass.com.radar.${store.slug || store.id}`;
    const masterGoogleIssuerId = platformWallet.google_issuer_id || `radar_${store.slug || store.id}`;

    // 1. Check embedded store fulfillment settings
    const embedded = (store as any)?.fulfillment_settings?.wallet_pass_config;
    if (embedded && typeof embedded === 'object') {
      return {
        enabled: embedded.enabled ?? true,
        loyalty_mode: embedded.loyalty_mode || (isCafe ? 'stamps' : 'points'),
        stamps_target: embedded.stamps_target || 6,
        stamps_reward_title: embedded.stamps_reward_title || 'قهوة مجانية من اختيارك ☕',
        stamps_icon: embedded.stamps_icon || '☕',
        enable_spin_wheel: Boolean(embedded.enable_spin_wheel),
        spin_wheel_prizes: embedded.spin_wheel_prizes?.length ? embedded.spin_wheel_prizes : DEFAULT_SPIN_WHEEL_PRIZES,
        spin_wheel_trigger_min_spend: embedded.spin_wheel_trigger_min_spend || 0,
        enable_scratch_card: Boolean(embedded.enable_scratch_card),
        scratch_card_reward_title: embedded.scratch_card_reward_title || 'قسيمة خصم 20% بمناسبة يوم التأسيس 🇸🇦',
        enable_streaks: Boolean(embedded.enable_streaks),
        streak_target_days: embedded.streak_target_days || 3,
        streak_reward_title: embedded.streak_reward_title || 'مشروب مجاني لإكمال السلسلة 🔥',
        background_color: embedded.background_color || bg,
        foreground_color: embedded.foreground_color || '#FFFFFF',
        label_color: embedded.label_color || defaultColor,
        lockscreen_message_template: embedded.lockscreen_message_template || 'أهلاً بك بالقرب من {store}! لديك {points} نقطة ومكافآت بانتظارك ☕🎁',
        proximity_radius_meters: embedded.proximity_radius_meters || 300,
        apple_pass_type_id: embedded.apple_pass_type_id || masterApplePassId,
        google_issuer_id: embedded.google_issuer_id || masterGoogleIssuerId,
      };
    }

    // 2. Check localStorage cache
    try {
      const key = `${WALLET_CONFIG_STORAGE_KEY_PREFIX}${store.id}`;
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          enabled: parsed.enabled ?? true,
          loyalty_mode: parsed.loyalty_mode || (isCafe ? 'stamps' : 'points'),
          stamps_target: parsed.stamps_target || 6,
          stamps_reward_title: parsed.stamps_reward_title || 'قهوة مجانية من اختيارك ☕',
          stamps_icon: parsed.stamps_icon || '☕',
          enable_spin_wheel: Boolean(parsed.enable_spin_wheel),
          spin_wheel_prizes: parsed.spin_wheel_prizes?.length ? parsed.spin_wheel_prizes : DEFAULT_SPIN_WHEEL_PRIZES,
          spin_wheel_trigger_min_spend: parsed.spin_wheel_trigger_min_spend || 0,
          enable_scratch_card: Boolean(parsed.enable_scratch_card),
          scratch_card_reward_title: parsed.scratch_card_reward_title || 'قسيمة خصم 20% بمناسبة يوم التأسيس 🇸🇦',
          enable_streaks: Boolean(parsed.enable_streaks),
          streak_target_days: parsed.streak_target_days || 3,
          streak_reward_title: parsed.streak_reward_title || 'مشروب مجاني لإكمال السلسلة 🔥',
          background_color: parsed.background_color || bg,
          foreground_color: parsed.foreground_color || '#FFFFFF',
          label_color: parsed.label_color || defaultColor,
          lockscreen_message_template: parsed.lockscreen_message_template || 'أهلاً بك بالقرب من {store}! لديك {points} نقطة ومكافآت بانتظارك ☕🎁',
          proximity_radius_meters: parsed.proximity_radius_meters || 300,
          apple_pass_type_id: parsed.apple_pass_type_id || masterApplePassId,
          google_issuer_id: parsed.google_issuer_id || masterGoogleIssuerId,
        };
      }
    } catch {}

    // 3. Fallback defaults
    return {
      enabled: true,
      loyalty_mode: isCafe ? 'stamps' : 'points',
      stamps_target: 6,
      stamps_reward_title: 'قهوة مجانية من اختيارك ☕',
      stamps_icon: '☕',
      enable_spin_wheel: false,
      spin_wheel_prizes: DEFAULT_SPIN_WHEEL_PRIZES,
      spin_wheel_trigger_min_spend: 0,
      enable_scratch_card: false,
      scratch_card_reward_title: 'قسيمة خصم 20% بمناسبة يوم التأسيس 🇸🇦',
      enable_streaks: false,
      streak_target_days: 3,
      streak_reward_title: 'مشروب مجاني لإكمال السلسلة 🔥',
      background_color: bg.startsWith('#') ? bg : '#110E05',
      foreground_color: '#FFFFFF',
      label_color: defaultColor.startsWith('#') ? defaultColor : '#E3B94A',
      lockscreen_message_template: 'أهلاً بك بالقرب من {store}! لديك {points} نقطة ومكافآت بانتظارك ☕🎁',
      proximity_radius_meters: 300,
      apple_pass_type_id: masterApplePassId,
      google_issuer_id: masterGoogleIssuerId,
    };
  }

  /**
   * حفظ وتحديث إعدادات بطاقة المحفظة (حفظ محلي فوري + مزامنة سحابية في Supabase)
   */
  static saveWalletConfig(storeId: string, partial: Partial<StoreWalletPassConfig>): StoreWalletPassConfig {
    const current = this.getWalletConfig({ id: storeId, name: '' } as any);
    const updated: StoreWalletPassConfig = {
      ...current,
      ...partial,
      updated_at: new Date().toISOString(),
    };

    // 1. Fast synchronous local storage update
    try {
      localStorage.setItem(`${WALLET_CONFIG_STORAGE_KEY_PREFIX}${storeId}`, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save wallet pass config locally:', e);
    }

    // 2. Asynchronous Cloud Sync with Supabase (Dual-write redundancy)
    const supabase = getSupabaseClient();
    if (supabase) {
      // A. Write to dedicated store_wallet_pass_configs table
      (supabase.from as any)('store_wallet_pass_configs')
        .upsert(
          {
            store_id: storeId,
            ...updated,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'store_id' }
        )
        .then(({ error }: any) => {
          if (error) {
            console.warn('store_wallet_pass_configs sync notice:', error.message);
          }
        })
        .catch(() => {});

      // B. Write to stores.fulfillment_settings.wallet_pass_config as backup
      LoyaltyService.getStoreById(storeId).then((storeData) => {
        if (storeData) {
          const prevFulfillment = (storeData as any).fulfillment_settings || {};
          LoyaltyService.updateStoreSettings(storeId, {
            fulfillment_settings: {
              ...prevFulfillment,
              wallet_pass_config: updated,
            },
          } as any).catch(() => {});
        }
      }).catch(() => {});
    }

    return updated;
  }

  /**
   * جلب الإعدادات من السحابة مباشرة (Supabase)
   */
  static async fetchCloudWalletConfig(storeId: string): Promise<StoreWalletPassConfig | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    try {
      const { data, error } = await (supabase.from as any)('store_wallet_pass_configs')
        .select('*')
        .eq('store_id', storeId)
        .limit(1)
        .maybeSingle();

      if (data && !error) {
        localStorage.setItem(`${WALLET_CONFIG_STORAGE_KEY_PREFIX}${storeId}`, JSON.stringify(data));
        return data as StoreWalletPassConfig;
      }
    } catch (e) {
      console.warn('Failed to fetch store_wallet_pass_configs from cloud:', e);
    }
    return null;
  }

  /**
   * حساب المسافة الدقيقة بين نقطتين جغرافيتين بالمتر (Haversine Formula)
   */
  static calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(R * c);
  }

  /**
   * فحص المسافة الحية للعميل واكتشاف أقرب فرع ومطابقة إشعار القرب الجغرافي
   */
  static getProximityStatus(
    customerCoords: { lat: number; lng: number } | null,
    store: Store,
    customerPoints: number = 0,
    storeBranches: StoreBranch[] = []
  ): ProximityDistanceResult {
    const config = this.getWalletConfig(store);
    const radius = config.proximity_radius_meters || 300;

    // Branches list to check against
    const branches = storeBranches.length > 0
      ? storeBranches.map((b) => ({
          id: b.id,
          name: b.name,
          lat: (b as any).latitude || DEFAULT_FALLBACK_BRANCHES[0].lat,
          lng: (b as any).longitude || DEFAULT_FALLBACK_BRANCHES[0].lng,
        }))
      : DEFAULT_FALLBACK_BRANCHES.map((d, i) => ({ id: `br_${i}`, ...d }));

    // If customer didn't allow GPS yet, return smart demo proximity (near main branch)
    if (!customerCoords) {
      const nearest = branches[0];
      const simulatedDistance = 140; // 140 meters demo proximity
      return {
        nearestBranchName: nearest.name,
        nearestBranchId: nearest.id,
        distanceMeters: simulatedDistance,
        formattedDistance: '140 متر 🚶 (محاكاة القرب)',
        isWithinProximity: true,
        suggestedLockscreenMessage: config.lockscreen_message_template
          .replace('{store}', store.name)
          .replace('{points}', String(customerPoints)),
      };
    }

    // Calculate actual distance to every branch
    let minDistance = Infinity;
    let closestBranch = branches[0];

    branches.forEach((branch) => {
      const dist = this.calculateDistanceMeters(
        customerCoords.lat,
        customerCoords.lng,
        branch.lat,
        branch.lng
      );
      if (dist < minDistance) {
        minDistance = dist;
        closestBranch = branch;
      }
    });

    let formattedDistance = '';
    if (minDistance < 50) {
      formattedDistance = 'أنت داخل الفرع الآن 🎯';
    } else if (minDistance < 1000) {
      formattedDistance = `${minDistance} متر 🚶`;
    } else {
      formattedDistance = `${(minDistance / 1000).toFixed(1)} كم 🚗`;
    }

    const isWithin = minDistance <= radius;
    const msg = config.lockscreen_message_template
      .replace('{store}', store.name)
      .replace('{points}', String(customerPoints));

    return {
      nearestBranchName: closestBranch.name,
      nearestBranchId: closestBranch.id,
      distanceMeters: minDistance,
      formattedDistance,
      isWithinProximity: isWithin,
      suggestedLockscreenMessage: msg,
    };
  }

  /**
   * توليد بنية وحزمة Apple Wallet Pass الرسمية (.pkpass JSON format)
   */
  static generateApplePassPayload(
    store: Store,
    customer: Customer,
    tier?: Tier | null,
    storeBranches: StoreBranch[] = []
  ): Record<string, any> {
    const config = this.getWalletConfig(store);
    const passSerial = customer.phone ? `RADAR-${store.id.slice(0, 4)}-${customer.phone}` : `RADAR-VIP-${customer.id.slice(0, 6)}`;
    const qrData = `RADAR:LOYALTY:${store.id}:${customer.id}:${customer.phone || 'GUEST'}:${Date.now()}`;

    // Geofencing Locations array (Up to 10 GPS spots supported natively by Apple Wallet)
    const locations = (storeBranches.length > 0 ? storeBranches : DEFAULT_FALLBACK_BRANCHES).slice(0, 10).map((b: any) => ({
      latitude: b.latitude || b.lat || 24.700346,
      longitude: b.longitude || b.lng || 46.685324,
      relevantText: config.lockscreen_message_template
        .replace('{store}', store.name)
        .replace('{points}', String(customer.wallet_balance || 0)),
    }));

    // Calculate primary & header fields depending on loyalty mode
    const isStamps = config.loyalty_mode === 'stamps';
    const stampsTarget = config.stamps_target || 6;
    const currentStamps = (customer.wallet_balance || 0) % stampsTarget;
    const stampsIcon = config.stamps_icon || '☕';

    const headerFields = isStamps
      ? [
          {
            key: 'reward',
            label: 'الهدية القادمة',
            value: config.stamps_reward_title || 'قهوة مجانية ☕',
          },
        ]
      : [
          {
            key: 'tier',
            label: 'الفئة',
            value: tier?.tier_name ? `VIP ${tier.tier_name}` : 'عضوية VIP',
          },
        ];

    const primaryFields = isStamps
      ? [
          {
            key: 'stamps',
            label: 'الأختام المجمعة',
            value: `${currentStamps} من ${stampsTarget} ${stampsIcon}`,
            changeMessage: 'تم إضافة ختم جديد إلى بطاقتك! %@ 🎉',
          },
        ]
      : [
          {
            key: 'balance',
            label: config.loyalty_mode === 'cashback' ? 'الرصيد المالي' : 'رصيد النقاط',
            value: config.loyalty_mode === 'cashback' ? `${customer.wallet_balance || 0} ر.س` : (customer.wallet_balance || 0),
            changeMessage: 'تم تحديث رصيدك إلى %@ 🎉',
          },
        ];

    const auxiliaryFields = [
      {
        key: 'status',
        label: 'حالة الحساب',
        value: 'نشط ومفعل ✓',
      },
      isStamps
        ? {
            key: 'stampsLeft',
            label: 'المتبقي للهدية',
            value: `${stampsTarget - currentStamps} زيارات`,
          }
        : {
            key: 'pointsPerRiyal',
            label: 'معدل الكسب',
            value: `${store.points_per_riyal || 1} نقطة / ﷼`,
          },
    ];

    const backFields: any[] = [
      {
        key: 'storeName',
        label: 'اسم المتجر',
        value: store.name,
      },
      {
        key: 'phone',
        label: 'رقم التواصل والدعم',
        value: store.phone || '+966577371780',
      },
    ];

    if (config.enable_spin_wheel) {
      backFields.push({
        key: 'spinWheel',
        label: '🎡 عجلة الحظ التفاعلية',
        value: 'متاحة للتدوير في محفظتك الرقمية بعد كل عملية شراء للكاشير لربح جوائز وخصومات فورية!',
      });
    }

    if (config.enable_scratch_card) {
      backFields.push({
        key: 'scratchCard',
        label: '🎁 بطاقة اكشط واربح',
        value: config.scratch_card_reward_title || 'مكافآت المناسبات والأعياد متاحة في محفظتك الرقمية.',
      });
    }

    if (config.enable_streaks) {
      backFields.push({
        key: 'streaks',
        label: '🔥 تحدي سلسلة الزيارات',
        value: `قم بزيارتنا ${config.streak_target_days || 3} مرات متتالية لكسب: ${config.streak_reward_title || 'مكافأة خاصة'}!`,
      });
    }

    backFields.push(
      {
        key: 'geofenceInfo',
        label: 'تنبيهات القرب الجغرافي',
        value: 'تظهر هذه البطاقة تلقائياً على شاشة القفل عند اقترابك من أي من فروعنا لسرعة كسب واستبدال النقاط دون فتح الهاتف.',
      },
      {
        key: 'terms',
        label: 'الشروط والأحكام',
        value: 'النقاط والأختام مخصصة للاستخدام الشخصي وغير قابلة للتحويل النقدي. تطبق شروط برنامج الولاء.',
      },
      {
        key: 'poweredBy',
        label: 'النظام المشغل',
        value: 'منصة الولاء والمدفوعات السحابية • radar.taeybsalah.workers.dev',
      }
    );

    return {
      formatVersion: 1,
      passTypeIdentifier: config.apple_pass_type_id || `pass.com.radar.${store.slug || store.id}`,
      serialNumber: passSerial,
      teamIdentifier: 'RADARTECHSA',
      organizationName: store.name,
      description: `بطاقة ولاء ${store.name}`,
      logoText: store.name,
      foregroundColor: config.foreground_color || 'rgb(255, 255, 255)',
      backgroundColor: config.background_color || 'rgb(17, 14, 5)',
      labelColor: config.label_color || 'rgb(227, 185, 74)',
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
      maxDistance: config.proximity_radius_meters || 300,
    };
  }

  /**
   * توليد بنية Google Wallet Pass (LoyaltyClass & LoyaltyObject)
   */
  static generateGooglePassPayload(
    store: Store,
    customer: Customer,
    tier?: Tier | null
  ): Record<string, any> {
    const config = this.getWalletConfig(store);
    const passSerial = customer.phone ? `RADAR-${store.id.slice(0, 4)}-${customer.phone}` : `RADAR-VIP-${customer.id.slice(0, 6)}`;
    const qrData = `RADAR:LOYALTY:${store.id}:${customer.id}:${customer.phone || 'GUEST'}:${Date.now()}`;

    const isStamps = config.loyalty_mode === 'stamps';
    const stampsTarget = config.stamps_target || 6;
    const currentStamps = (customer.wallet_balance || 0) % stampsTarget;
    const stampsIcon = config.stamps_icon || '☕';

    let loyaltyPoints: any = {
      label: 'رصيد النقاط',
      balance: {
        int: customer.wallet_balance || 0,
      },
    };

    if (isStamps) {
      loyaltyPoints = {
        label: 'الأختام المجمعة',
        balance: {
          string: `${currentStamps} من ${stampsTarget} ${stampsIcon}`,
        },
      };
    } else if (config.loyalty_mode === 'cashback') {
      loyaltyPoints = {
        label: 'الرصيد المشحون',
        balance: {
          string: `${(customer.wallet_balance || 0).toFixed(2)} ر.س`,
        },
      };
    }

    return {
      id: `${config.google_issuer_id}.${passSerial}`,
      classId: `${config.google_issuer_id}.loyalty_tier_${tier?.id || 'standard'}`,
      state: 'ACTIVE',
      accountId: customer.phone || customer.id,
      accountName: customer.name || 'عميل مميز',
      loyaltyPoints,
      barcode: {
        type: 'QR_CODE',
        value: qrData,
        alternateText: customer.phone ? `VIP-${customer.phone.slice(-6)}` : 'VIP-MEMBER',
      },
      hexBackgroundColor: config.background_color || '#110E05',
      heroImage: {
        sourceUri: {
          uri: store.logo_url || 'https://radar.taeybsalah.workers.dev/logo.png',
        },
      },
    };
  }

  /**
   * تسجيل جهاز العميل لتلقي إشعارات شاشة القفل عند تغير النقاط
   */
  static registerDevice(registration: Partial<WalletDeviceRegistration>): WalletDeviceRegistration {
    const full: WalletDeviceRegistration = {
      id: `dev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      customer_id: registration.customer_id || '',
      store_id: registration.store_id || '',
      platform: registration.platform || 'apple',
      device_id: registration.device_id || `dev_sim_${Date.now()}`,
      push_token: registration.push_token || `tok_${Math.random().toString(36).substring(2)}`,
      pass_serial_number: registration.pass_serial_number || '',
      registered_at: new Date().toISOString(),
    };

    try {
      const key = `${WALLET_DEVICES_STORAGE_KEY_PREFIX}${registration.store_id}`;
      const list: WalletDeviceRegistration[] = JSON.parse(localStorage.getItem(key) || '[]');
      list.push(full);
      localStorage.setItem(key, JSON.stringify(list));
    } catch (e) {
      console.warn('Failed to register wallet device:', e);
    }

    return full;
  }

  /**
   * حفظ أو فتح بطاقة محفظة قوقل الرسمية (Save to Google Wallet)
   */
  static async saveToGoogleWallet(
    store: Store,
    customer: Customer,
    tier?: Tier | null
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    const config = this.getWalletConfig(store);
    const googlePayload = this.generateGooglePassPayload(store, customer, tier);

    // Register device registration for Google Wallet
    this.registerDevice({
      customer_id: customer.id,
      store_id: store.id,
      platform: 'google',
      pass_serial_number: googlePayload.id,
    });

    // Try to request signed JWT from backend endpoint if available
    try {
      const res = await fetch('/api/wallet/google-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: store.id,
          customer_id: customer.id,
          payload: googlePayload,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.saveUrl) {
          window.open(data.saveUrl, '_blank');
          return { success: true, url: data.saveUrl };
        }
      }
    } catch {}

    // Fallback: Open Google Pay Web Save intent
    const fallbackSaveUrl = `https://pay.google.com/gp/v/save/${encodeURIComponent(JSON.stringify(googlePayload))}`;
    window.open(fallbackSaveUrl, '_blank');
    return { success: true, url: fallbackSaveUrl };
  }

  /**
   * جلب قائمة الأجهزة المسجلة للمتجر
   */
  static getStoreRegistrations(storeId: string): WalletDeviceRegistration[] {
    try {
      const key = `${WALLET_DEVICES_STORAGE_KEY_PREFIX}${storeId}`;
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  /**
   * تحميل وتثبيت بطاقة Apple Wallet الرسمية الموقعة (.pkpass)
   */
  static async downloadPassFile(
    store: Store,
    customer: Customer,
    tier?: Tier | null,
    storeBranches: StoreBranch[] = []
  ): Promise<void> {
    const config = this.getWalletConfig(store);
    const params = new URLSearchParams();
    params.set('store_id', store.id || store.slug || '');
    if (config?.loyalty_mode) params.set('mode', config.loyalty_mode);
    if (customer?.id) params.set('customer_id', customer.id);
    if (customer?.phone) params.set('phone', customer.phone);
    if (customer?.name) params.set('name', customer.name);
    if (store?.logo_url) {
      try {
        const pngData = await rasterizeLogoToPngDataUrl(store.logo_url);
        if (pngData && pngData.startsWith('data:image/png')) {
          params.set('logo_url', pngData);
        } else {
          params.set('logo_url', store.logo_url);
        }
      } catch {
        params.set('logo_url', store.logo_url);
      }
    }
    params.set('_t', Date.now().toString());
    const passUrl = `/api/wallet/apple-pass?${params.toString()}`;

    // 1. تسجيل الجهاز افتراضياً
    const passSerial = customer.phone
      ? `RADAR-${store.id.slice(0, 4)}-${customer.phone}`
      : `RADAR-VIP-${customer.id.slice(0, 6)}`;

    this.registerDevice({
      customer_id: customer.id,
      store_id: store.id,
      platform: 'apple',
      pass_serial_number: passSerial,
    });

    // 2. فحص متصفح iOS Safari: التوجيه المباشر يفتح شاشة إضافة المحفظة الرسمية للآيفون تلقائياً
    const isIOS =
      typeof navigator !== 'undefined' &&
      (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

    if (isIOS) {
      window.location.href = passUrl;
      return;
    }

    // 3. للمتصفحات الأخرى أو أجهزة سطح المكتب: جلب وتحميل ملف .pkpass الموقّع من السيرفر
    //    أي فشل يظهر للمستخدم كخطأ حقيقي (لا بديل محلي ولا نجاح وهمي)
    const res = await fetch(passUrl);
    if (!res.ok) {
      let message = 'تعذر إصدار بطاقة آبل حالياً';
      try {
        const data = await res.json();
        if (data?.error) message = data.error;
      } catch {}
      throw new Error(message);
    }
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `${(store.slug || 'loyalty').replace(/[^a-zA-Z0-9_-]/g, '_')}_Loyalty_Pass.pkpass`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  }
}
