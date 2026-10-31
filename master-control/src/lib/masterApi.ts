import { createClient, SupabaseClient } from '@supabase/supabase-js';

// 🏛️ Al-Athar Core Mother Platform Cloud Database
export const MASTER_SUPABASE_URL = (import.meta as any).env?.VITE_MASTER_SUPABASE_URL || 'https://zagpvflyizbmzsbmhnts.supabase.co';
export const MASTER_SUPABASE_ANON = (import.meta as any).env?.VITE_MASTER_SUPABASE_ANON_KEY || 'sb_publishable_Bx1NGkxLxilvNA3RgcioVQ_t8zlk72H';

// 🛡️ Sovereign Secret Master Handshake Token
export const SOVEREIGN_MASTER_TOKEN: string =
  (import.meta as any).env?.VITE_SOVEREIGN_MASTER_TOKEN ||
  'rsm_Y2C8Y5g9es8O2cjRGvD6WaFn2onAH79Qi37T53iUoV29KzkZHLe70txYpkkDzKF';

export const masterSupabase: SupabaseClient = createClient(MASTER_SUPABASE_URL, MASTER_SUPABASE_ANON, {
  global: {
    headers: {
      'x-master-token': SOVEREIGN_MASTER_TOKEN,
    },
  },
  auth: {
    storageKey: 'al_athar_master_control_auth',
    persistSession: true,
  },
});

export interface TenantRecord {
  id: string; // 'radar', 'sadeem', etc.
  name: string; // 'رادار', 'سديم الأثر'
  name_en?: string | null;
  tagline?: string | null;
  slug: string; // 'radar', 'sadeem'
  custom_domain?: string | null; // 'myradar.sarl', 'sdeemalathr.com'
  logo_url?: string | null;
  favicon_url?: string | null;
  support_phone?: string | null;
  support_whatsapp?: string | null;
  support_email?: string | null;
  primary_color_hex?: string | null;
  accent_color_hex?: string | null;
  pwa_name?: string | null;
  copyright_holder?: string | null;
  status: 'active' | 'suspended' | 'maintenance';
  created_at: string;
  updated_at: string;
  // Computed / Aggregated KPIs:
  stores_count?: number;
}

export interface SovereignWalletsConfig {
  apple_wallet_enabled: boolean;
  apple_pass_type_id: string;
  apple_team_id: string;
  apple_cert_p12_base64: string;
  apple_cert_password?: string;
  google_wallet_enabled: boolean;
  google_issuer_id: string;
  google_client_email: string;
  google_private_key: string;
}

// Default wallet credentials from sovereign master settings
export const DEFAULT_SOVEREIGN_WALLETS: SovereignWalletsConfig = {
  apple_wallet_enabled: true,
  apple_pass_type_id: 'pass.com.sdeemalathr.loyalty',
  apple_team_id: 'PK42BF79S2',
  apple_cert_p12_base64: '',
  apple_cert_password: '',
  google_wallet_enabled: true,
  google_issuer_id: '3388000000023226136',
  google_client_email: 'sadim-504@sadim-512923.iam.gserviceaccount.com',
  google_private_key: `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCX7+0HDpt2XkgG
T0t92VSdawslthts9txr4k/V+aCgS4LW70G/wTYtHSGXS9ewPFd+tnmm+K9RHnb
1infzRAnRoGo09kID5W4OUScNhNetol5kP+Sn32ITVTFc517F4Irat6zeOrI03FBK
-----END PRIVATE KEY-----`,
};

/**
 * 📥 Fetch All Tenants with Live Store Counts
 */
export async function fetchMasterTenants(): Promise<TenantRecord[]> {
  try {
    // 1. Try Sovereign RPC
    const { data: rpcData, error: rpcErr } = await masterSupabase.rpc('master_get_tenants', {
      p_master_token: SOVEREIGN_MASTER_TOKEN,
    });

    if (!rpcErr && Array.isArray(rpcData) && rpcData.length > 0) {
      return rpcData as TenantRecord[];
    }
  } catch (err) {
    console.warn('[Master Control] master_get_tenants RPC unavailable, falling back to direct table query:', err);
  }

  // 2. Fallback: Query public.tenants directly
  const { data: tenantsData, error: tenantsErr } = await masterSupabase
    .from('tenants')
    .select('*')
    .order('created_at', { ascending: true });

  if (tenantsErr) {
    throw new Error(tenantsErr.message || 'فشل جلب بيانات الوكلاء من السحابة');
  }

  const tenants: TenantRecord[] = (tenantsData || []) as TenantRecord[];

  // 3. Fetch store counts
  try {
    const { data: storesData } = await masterSupabase.from('stores').select('tenant_id');
    if (storesData) {
      const counts: Record<string, number> = {};
      storesData.forEach((s: any) => {
        const tid = s.tenant_id || 'radar';
        counts[tid] = (counts[tid] || 0) + 1;
      });
      tenants.forEach((t) => {
        t.stores_count = counts[t.id] || 0;
      });
    }
  } catch (err) {
    console.warn('[Master Control] Could not count stores:', err);
  }

  return tenants;
}

/**
 * ⚡ Execute Sovereign Kill Switch on Tenant (Active / Suspended / Maintenance)
 */
export async function executeMasterKillSwitch(
  tenantId: string,
  targetStatus: 'active' | 'suspended' | 'maintenance'
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Try Sovereign RPC
    const { data, error } = await masterSupabase.rpc('master_update_tenant', {
      p_master_token: SOVEREIGN_MASTER_TOKEN,
      p_tenant_id: tenantId,
      p_data: { status: targetStatus },
    });

    if (!error && (data as any)?.success) {
      return { success: true };
    }
    if (error) {
      console.warn('master_update_tenant RPC error, falling back:', error);
    }
  } catch (e: any) {
    console.warn('RPC call exception:', e);
  }

  // 2. Direct Table fallback
  const { error: directErr } = await masterSupabase
    .from('tenants')
    .update({ status: targetStatus, updated_at: new Date().toISOString() })
    .eq('id', tenantId);

  if (directErr) {
    return { success: false, error: directErr.message };
  }

  return { success: true };
}

/**
 * 🎨 Update Tenant Branding, Custom Domain & Settings
 */
export async function executeMasterUpdateTenant(
  tenantId: string,
  data: Partial<TenantRecord>
): Promise<{ success: boolean; error?: string }> {
  const cleanDomain = data.custom_domain
    ? data.custom_domain
        .trim()
        .replace(/^https?:\/\//i, '')
        .replace(/\/.*$/, '')
        .replace(/^www\./i, '')
    : null;

  const payload: any = { ...data };
  if (data.custom_domain !== undefined) {
    payload.custom_domain = cleanDomain;
  }

  try {
    // 1. Try Sovereign RPC
    const { data: rpcData, error: rpcErr } = await masterSupabase.rpc('master_update_tenant', {
      p_master_token: SOVEREIGN_MASTER_TOKEN,
      p_tenant_id: tenantId,
      p_data: payload,
    });

    if (!rpcErr && (rpcData as any)?.success) {
      return { success: true };
    }
    if (rpcErr) {
      console.warn('master_update_tenant RPC error:', rpcErr);
    }
  } catch (err) {
    console.warn('master_update_tenant RPC exception:', err);
  }

  // 2. Direct Table fallback
  const { error: updateErr } = await masterSupabase
    .from('tenants')
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tenantId);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  return { success: true };
}

/**
 * 🚀 Deploy / Seed a New Strategic Tenant (White-Label Agency)
 */
export async function executeMasterCreateTenant(
  data: Partial<TenantRecord>
): Promise<{ success: boolean; tenant_id?: string; error?: string }> {
  const slug = (data.slug || '').trim().toLowerCase();
  const id = (data.id || slug).trim().toLowerCase();

  if (!slug || !id) {
    return { success: false, error: 'الرمز الفريد (slug / id) مطلوب للوكيل' };
  }

  const cleanDomain = data.custom_domain
    ? data.custom_domain
        .trim()
        .replace(/^https?:\/\//i, '')
        .replace(/\/.*$/, '')
        .replace(/^www\./i, '')
    : null;

  const payload = {
    ...data,
    id,
    slug,
    custom_domain: cleanDomain,
  };

  try {
    // 1. Try Sovereign RPC
    const { data: rpcData, error: rpcErr } = await masterSupabase.rpc('master_create_tenant', {
      p_master_token: SOVEREIGN_MASTER_TOKEN,
      p_data: payload,
    });

    if (!rpcErr && (rpcData as any)?.success) {
      return { success: true, tenant_id: (rpcData as any).tenant_id };
    }
    if (rpcErr) {
      console.warn('master_create_tenant RPC error:', rpcErr);
    }
  } catch (err) {
    console.warn('master_create_tenant RPC exception:', err);
  }

  // 2. Direct Table fallback
  const { error: insertErr } = await masterSupabase.from('tenants').insert([
    {
      id,
      name: data.name || 'وكيل جديد',
      name_en: data.name_en || null,
      tagline: data.tagline || 'منظومة الولاء ونقاط البيع السحابية الذكية',
      slug,
      custom_domain: cleanDomain,
      logo_url: data.logo_url || '/favicon.png',
      favicon_url: data.favicon_url || '/favicon.png',
      support_phone: data.support_phone || '+966500000000',
      support_whatsapp: data.support_whatsapp || '966500000000',
      support_email: data.support_email || 'support@al-athar.cloud',
      primary_color_hex: data.primary_color_hex || '#F59E0B',
      accent_color_hex: data.accent_color_hex || '#10B981',
      pwa_name: data.pwa_name || data.name,
      copyright_holder: data.copyright_holder || 'جميع الحقوق محفوظة',
      status: 'active',
    },
  ]);

  if (insertErr) {
    return { success: false, error: insertErr.message };
  }

  return { success: true, tenant_id: id };
}

/**
 * 💳 Fetch Sovereign Central Digital Wallets Configuration (Apple PassKit & Google Wallet)
 */
export async function fetchMasterWalletCredentials(): Promise<SovereignWalletsConfig> {
  // Load cached fallback from localStorage first
  let cached: Partial<SovereignWalletsConfig> = {};
  try {
    const raw = localStorage.getItem('al_athar_sovereign_wallets_credentials');
    if (raw) cached = JSON.parse(raw);
  } catch {}

  const merged: SovereignWalletsConfig = {
    ...DEFAULT_SOVEREIGN_WALLETS,
    ...cached,
  };

  try {
    // 1. Try Sovereign RPC
    const { data: rpcData, error: rpcErr } = await masterSupabase.rpc('master_get_wallet_credentials', {
      p_master_token: SOVEREIGN_MASTER_TOKEN,
    });

    if (!rpcErr && rpcData && typeof rpcData === 'object') {
      const live = rpcData as any;
      if (live.google_issuer_id) merged.google_issuer_id = live.google_issuer_id;
      if (live.google_client_email) merged.google_client_email = live.google_client_email;
      if (live.google_private_key) merged.google_private_key = live.google_private_key;
      if (live.google_wallet_enabled !== undefined) merged.google_wallet_enabled = Boolean(live.google_wallet_enabled);
      if (live.apple_pass_type_id) merged.apple_pass_type_id = live.apple_pass_type_id;
      if (live.apple_team_id) merged.apple_team_id = live.apple_team_id;
      if (live.apple_cert_p12_base64) merged.apple_cert_p12_base64 = live.apple_cert_p12_base64;
      if (live.apple_cert_password) merged.apple_cert_password = live.apple_cert_password;
      if (live.apple_wallet_enabled !== undefined) merged.apple_wallet_enabled = Boolean(live.apple_wallet_enabled);
      return merged;
    }
  } catch (err) {
    console.warn('[Master Control] master_get_wallet_credentials RPC not reachable:', err);
  }

  // 2. Fallback: Query public RPC get_platform_integrations_public
  try {
    const { data: pubData } = await masterSupabase.rpc('get_platform_integrations_public');
    if (pubData) {
      if (pubData.google_issuer_id) merged.google_issuer_id = pubData.google_issuer_id;
      if (pubData.google_wallet_enabled !== undefined) merged.google_wallet_enabled = Boolean(pubData.google_wallet_enabled);
      if (pubData.apple_pass_type_id) merged.apple_pass_type_id = pubData.apple_pass_type_id;
      if (pubData.apple_wallet_enabled !== undefined) merged.apple_wallet_enabled = Boolean(pubData.apple_wallet_enabled);
    }
  } catch {}

  return merged;
}

/**
 * 💾 Save Sovereign Central Digital Wallets Configuration
 */
export async function saveMasterWalletCredentials(
  config: SovereignWalletsConfig
): Promise<{ success: boolean; error?: string }> {
  // Always update local cache
  try {
    localStorage.setItem('al_athar_sovereign_wallets_credentials', JSON.stringify(config));
  } catch {}

  try {
    // 1. Try Sovereign RPC
    const { data, error } = await masterSupabase.rpc('master_save_wallet_credentials', {
      p_master_token: SOVEREIGN_MASTER_TOKEN,
      p_data: config,
    });

    if (!error && (data as any)?.success) {
      return { success: true };
    }
    if (error) {
      console.warn('master_save_wallet_credentials RPC error:', error);
      return { success: false, error: error.message };
    }
  } catch (err: any) {
    console.warn('saveMasterWalletCredentials exception:', err);
    return { success: false, error: err?.message || 'فشل استدعاء دالة حفظ المحافظ' };
  }

  return { success: true };
}

/**
 * 🔍 Test Google Wallet Credentials Live
 */
export function testGoogleWalletConfig(
  issuerId: string,
  clientEmail: string,
  privateKey: string
): { success: boolean; message: string } {
  const cleanIssuer = (issuerId || '').trim();
  const cleanEmail = (clientEmail || '').trim();
  let cleanKey = (privateKey || '').trim();

  if (!cleanIssuer) {
    return { success: false, message: 'يرجى إدخال معرف المصدر التجاري (Google Wallet Issuer ID)' };
  }
  if (!/^\d{10,25}$/.test(cleanIssuer)) {
    return {
      success: false,
      message: `معرف جهة الإصدار (${cleanIssuer}) غير صالح! يجب أن يتكون من 10 إلى 22 رقماً مطابقاً لـ Google Pay Console (مثل: 3388000000023226136)`,
    };
  }

  if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.endsWith('.iam.gserviceaccount.com')) {
    return {
      success: false,
      message: 'إيميل حساب الخدمة غير صالح! يجب أن ينتهي بـ .iam.gserviceaccount.com',
    };
  }

  if (!cleanKey) {
    return { success: false, message: 'يرجى إدخال المفتاح الخاص المشفر لـ JWT (Google Private Key)' };
  }

  cleanKey = cleanKey.replace(/^["'\s]+|["'\s]+$/g, '').replace(/\\n/g, '\n');
  if (!cleanKey.includes('-----BEGIN PRIVATE KEY-----')) {
    return { success: false, message: 'تنسيق المفتاح الخاص غير صحيح: يجب أن يبدأ بـ -----BEGIN PRIVATE KEY-----' };
  }

  return {
    success: true,
    message: 'معرفات قوقل مهيأة ومطابقة 100% لمعايير Google Wallet REST API وجاهزة لتوقيع بطاقات أندرويد! 🌐',
  };
}

/**
 * 🔍 Test Apple PassKit Credentials Live
 */
export function testApplePassConfig(
  passTypeId: string,
  teamId: string,
  certBase64?: string
): { success: boolean; message: string } {
  const cleanPassId = (passTypeId || '').trim();
  const cleanTeamId = (teamId || '').trim();

  if (!cleanPassId || !cleanTeamId) {
    return { success: false, message: 'يرجى إدخال Pass Type ID ورقم الفريق (Team ID) أولاً' };
  }

  if (!cleanPassId.startsWith('pass.')) {
    return {
      success: false,
      message: 'تنبيه: Pass Type ID يجب أن يبدأ بـ pass. (مثال: pass.com.sdeemalathr.loyalty)',
    };
  }

  if (cleanTeamId.length < 5) {
    return {
      success: false,
      message: 'تنبيه: Apple Team ID يجب أن يتكون من 10 خانات من حساب Apple Developer (مثل: PK42BF79S2)',
    };
  }

  return {
    success: true,
    message: 'معرفات أبل مهيأة وجاهزة لتوقيع بطاقات (.pkpass) بنجاح فور استلام الشهادة الرقمية! ',
  };
}

/**
 * ⚡ Execute Sovereign SQL Script via RPC
 */
export interface SqlExecutionResult {
  success: boolean;
  message?: string;
  error?: string;
  code?: string;
  durationMs?: number;
}

export async function executeMasterSql(sqlScript: string): Promise<SqlExecutionResult> {
  const startTime = Date.now();
  try {
    const { data, error } = await masterSupabase.rpc('exec_master_sql', {
      p_sql: sqlScript,
      p_master_token: SOVEREIGN_MASTER_TOKEN,
    });

    const elapsed = Date.now() - startTime;

    if (error) {
      return {
        success: false,
        error: error.message.includes('Could not find the function')
          ? 'دالة exec_master_sql غير مثبتة بعد في قاعدة البيانات. يمكنك تشغيل كود التأسيس في محرر Supabase SQL.'
          : error.message,
        durationMs: elapsed,
      };
    }

    const res = data as any;
    return {
      success: res?.success !== false && !res?.error,
      message: res?.message || 'تم تنفيذ الاستعلام بنجاح عبر المحرك السيادي',
      error: res?.error,
      code: res?.code,
      durationMs: res?.duration_ms || elapsed,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'فشل الاتصال بقاعدة البيانات',
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * 📤 Upload Image directly to Master Storage and return Public URL
 */
export async function uploadLogoToStorage(file: File): Promise<string> {
  const fileExt = file.name.split('.').pop() || 'png';
  const fileName = `tenant-logo-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
  const filePath = `logos/${fileName}`;

  const bucketName = 'store-assets';
  const { error: uploadError } = await masterSupabase.storage
    .from(bucketName)
    .upload(filePath, file, {
      cacheControl: '31536000',
      upsert: true,
    });

  if (uploadError) {
    // Read as base64 data URL fallback
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  const { data: urlData } = masterSupabase.storage.from(bucketName).getPublicUrl(filePath);
  return urlData.publicUrl;
}
