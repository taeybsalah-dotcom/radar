import { Store, Customer, Tier, StoreBranch, StoreWalletPassConfig, ProximityDistanceResult, WalletDeviceRegistration } from '../types';

const WALLET_CONFIG_STORAGE_KEY_PREFIX = 'radar_wallet_pass_config_';
const WALLET_DEVICES_STORAGE_KEY_PREFIX = 'radar_wallet_device_registrations_';

// Default Saudi Branches GPS fallbacks if store has no coordinates set
const DEFAULT_FALLBACK_BRANCHES: { name: string; lat: number; lng: number }[] = [
  { name: 'الفرع الرئيسي (طريق التحلية)', lat: 24.700346, lng: 46.685324 }, // Riyadh Tahlia
  { name: 'فرع مجمع النخيل مول', lat: 24.786591, lng: 46.711582 }, // Nakheel Mall
  { name: 'فرع بوليفارد سيتي', lat: 24.770853, lng: 46.602511 }, // Boulevard Riyadh
];

export class WalletPassService {
  /**
   * جلب إعدادات بطاقة المحفظة للمتجر
   */
  static getWalletConfig(store: Store): StoreWalletPassConfig {
    const defaultColor = store.secondary_color || '#E3B94A';
    const bg = store.primary_color || '#110E05';

    try {
      const key = `${WALLET_CONFIG_STORAGE_KEY_PREFIX}${store.id}`;
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch {}

    return {
      enabled: true,
      background_color: bg.startsWith('#') ? bg : '#110E05',
      foreground_color: '#FFFFFF',
      label_color: defaultColor.startsWith('#') ? defaultColor : '#E3B94A',
      lockscreen_message_template: 'أهلاً بك بالقرب من {store}! لديك {points} نقطة ومكافآت بانتظارك ☕🎁',
      proximity_radius_meters: 300,
      apple_pass_type_id: `pass.com.radar.${store.slug || store.id}`,
      google_issuer_id: `radar_${store.slug || store.id}`,
    };
  }

  /**
   * حفظ وتحديث إعدادات بطاقة المحفظة
   */
  static saveWalletConfig(storeId: string, partial: Partial<StoreWalletPassConfig>): StoreWalletPassConfig {
    const current = this.getWalletConfig({ id: storeId } as any);
    const updated: StoreWalletPassConfig = {
      ...current,
      ...partial,
      updated_at: new Date().toISOString(),
    };
    try {
      localStorage.setItem(`${WALLET_CONFIG_STORAGE_KEY_PREFIX}${storeId}`, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save wallet pass config:', e);
    }
    return updated;
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
        headerFields: [
          {
            key: 'tier',
            label: 'الفئة',
            value: tier?.tier_name ? `VIP ${tier.tier_name}` : 'عضوية VIP',
          },
        ],
        primaryFields: [
          {
            key: 'balance',
            label: 'رصيد النقاط',
            value: customer.wallet_balance || 0,
            changeMessage: 'تم تحديث رصيدك إلى %@ نقطة 🎉',
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
            key: 'pointsPerRiyal',
            label: 'معدل الكسب',
            value: `${store.points_per_riyal || 1} نقطة / ﷼`,
          },
          {
            key: 'status',
            label: 'حالة الحساب',
            value: 'نشط ومفعل ✓',
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
            label: 'رقم التواصل والدعم',
            value: store.phone || '+966577371780',
          },
          {
            key: 'geofenceInfo',
            label: 'تنبيهات القرب الجغرافي',
            value: 'تظهر هذه البطاقة تلقائياً على شاشة القفل عند اقترابك من أي من فروعنا لسرعة كسب واستبدال النقاط دون فتح الهاتف.',
          },
          {
            key: 'terms',
            label: 'الشروط والأحكام',
            value: 'النقاط مخصصة للاستخدام الشخصي وغير قابلة للتحويل النقدي. تطبق شروط برنامج الولاء.',
          },
          {
            key: 'poweredBy',
            label: 'النظام المشغل',
            value: 'منصة الولاء والمدفوعات السحابية • radar.taeybsalah.workers.dev',
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

    return {
      id: `${config.google_issuer_id}.${passSerial}`,
      classId: `${config.google_issuer_id}.loyalty_tier_${tier?.id || 'standard'}`,
      state: 'ACTIVE',
      accountId: customer.phone || customer.id,
      accountName: customer.name || 'عميل مميز',
      loyaltyPoints: {
        label: 'رصيد النقاط',
        balance: {
          int: customer.wallet_balance || 0,
        },
      },
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
   * تحميل ملف البطاقة الرقمية الفوري (.pkpass / JSON Pass)
   */
  static downloadPassFile(
    store: Store,
    customer: Customer,
    tier?: Tier | null,
    storeBranches: StoreBranch[] = []
  ): void {
    const passData = this.generateApplePassPayload(store, customer, tier, storeBranches);
    const jsonString = JSON.stringify(passData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/vnd.apple.pkpass' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${store.name.replace(/\s+/g, '_')}_Loyalty_Pass.pkpass`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Register simulated device
    this.registerDevice({
      customer_id: customer.id,
      store_id: store.id,
      platform: 'apple',
      pass_serial_number: passData.serialNumber,
    });
  }
}
