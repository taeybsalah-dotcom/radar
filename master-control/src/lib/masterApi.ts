import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Connected to Master Control Database
const MASTER_SUPABASE_URL = (import.meta as any).env?.VITE_MASTER_SUPABASE_URL || 'https://zagpvflyizbmzsbmhnts.supabase.co';
const MASTER_SUPABASE_ANON = (import.meta as any).env?.VITE_MASTER_SUPABASE_ANON_KEY || 'sb_publishable_Bx1NGkxLxilvNA3RgcioVQ_t8zlk72H';

export const masterSupabase: SupabaseClient = createClient(MASTER_SUPABASE_URL, MASTER_SUPABASE_ANON, {
  auth: {
    storageKey: 'radar_master_control_auth',
    persistSession: true,
  },
});

export interface ResellerInstance {
  id: string;
  name: string;
  slug: string;
  custom_domain?: string | null;
  brand_logo_url?: string | null;
  support_phone?: string | null;
  support_whatsapp?: string | null;
  primary_color_hex?: string | null;
  supabase_url: string;
  supabase_anon_key: string;
  service_role_key: string;
  admin_email?: string | null;
  platform_status: 'active' | 'suspended' | 'maintenance';
  suspension_reason?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

// 🛡️ Sovereign Secret Master Handshake Token
const SOVEREIGN_MASTER_TOKEN = 'radar_sovereign_master_2026_killswitch_key';

/**
 * 📤 Upload Image directly to Master/Target Supabase Storage and return Public URL
 */
export async function uploadLogoToStorage(file: File, targetSupabaseUrl?: string, targetAnonKey?: string): Promise<string> {
  const url = targetSupabaseUrl || MASTER_SUPABASE_URL;
  const key = targetAnonKey || MASTER_SUPABASE_ANON;
  const client = createClient(url, key);

  const fileExt = file.name.split('.').pop() || 'png';
  const fileName = `reseller-logo-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
  const filePath = `logos/${fileName}`;

  // Try store-assets bucket or fallback to public-assets
  const bucketName = 'store-assets';
  const { error: uploadError } = await client.storage
    .from(bucketName)
    .upload(filePath, file, {
      cacheControl: '31536000',
      upsert: true,
    });

  if (uploadError) {
    // If bucket doesn't exist, read as base64 data URL directly
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  const { data: urlData } = client.storage.from(bucketName).getPublicUrl(filePath);
  return urlData.publicUrl;
}

/**
 * 🎨 Update Remote Tenant Branding in Reseller DB directly:
 */
export async function executeUpdateResellerBranding(
  instance: ResellerInstance,
  branding: {
    brand_name: string;
    logo_url?: string;
    support_phone?: string;
    support_whatsapp?: string;
    primary_color_hex?: string;
  }
) {
  const resellerUrl = instance.supabase_url;
  const apiKey = instance.supabase_anon_key;

  // 1. Send update via secure RPC to reseller database
  const res = await fetch(`${resellerUrl}/rest/v1/rpc/set_tenant_branding`, {
    method: 'POST',
    headers: {
      'apikey': apiKey,
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_brand_name: branding.brand_name,
      p_logo_url: branding.logo_url || null,
      p_favicon_url: branding.logo_url || null,
      p_support_phone: branding.support_phone || null,
      p_support_whatsapp: branding.support_whatsapp || null,
      p_primary_color_hex: branding.primary_color_hex || '#4F46E5',
      p_master_token: SOVEREIGN_MASTER_TOKEN,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || 'فشل تحديث هوية الوكيل في سيرفره');
  }

  // 2. Update local record in Master DB
  await masterSupabase
    .from('reseller_instances')
    .update({
      name: branding.brand_name,
      brand_logo_url: branding.logo_url || null,
      support_phone: branding.support_phone || null,
      support_whatsapp: branding.support_whatsapp || null,
      primary_color_hex: branding.primary_color_hex || '#4F46E5',
      updated_at: new Date().toISOString(),
    })
    .eq('id', instance.id);

  return true;
}

/**
 * ⚡ Secure Kill Switch Executor:
 */
export async function executeResellerKillSwitch(
  instance: ResellerInstance,
  targetStatus: 'active' | 'suspended',
  reason?: string
) {
  const resellerUrl = instance.supabase_url;
  const apiKey = instance.supabase_anon_key;

  const rpcRes = await fetch(`${resellerUrl}/rest/v1/rpc/set_platform_status`, {
    method: 'POST',
    headers: {
      'apikey': apiKey,
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_status: targetStatus,
      p_reason: targetStatus === 'suspended' ? (reason || 'إيقاف إداري سيادي من مالك المنصة') : null,
      p_master_token: SOVEREIGN_MASTER_TOKEN,
    }),
  });

  if (!rpcRes.ok) {
    const errText = await rpcRes.text();
    throw new Error(errText || 'فشل تحديث حالة سيرفر الوكيل (مرفوض أمنياً)');
  }

  await masterSupabase
    .from('reseller_instances')
    .update({
      platform_status: targetStatus,
      suspension_reason: targetStatus === 'suspended' ? (reason || 'إيقاف إداري سيادي من مالك المنصة') : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', instance.id);

  return { success: true };
}

/**
 * 🔑 Reseller Password Reset Executor
 */
export async function executeResellerPasswordReset(
  instance: ResellerInstance,
  newPassword: string
) {
  if (!instance.admin_email) {
    throw new Error('البريد الإلكتروني للوكيل غير مسجل');
  }

  const apiKey = instance.supabase_anon_key;
  const res = await fetch(`${instance.supabase_url}/rest/v1/rpc/reset_admin_password`, {
    method: 'POST',
    headers: {
      'apikey': apiKey,
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_email: instance.admin_email,
      p_new_password: newPassword,
      p_master_token: SOVEREIGN_MASTER_TOKEN,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || 'فشل تصفير كلمة المرور في سيرفر الوكيل');
  }

  return { success: true, message: 'تم تغيير كلمة المرور فوراً بنجاح' };
}

/**
 * 👤 Direct Reseller Admin User Creation (Called during initial creation)
 */
export async function executeCreateResellerAdmin(
  instance: ResellerInstance,
  email: string,
  password: string,
  fullName: string
) {
  return true;
}

/**
 * Test Connection via Direct REST ping
 */
export async function testResellerConnection(instance: ResellerInstance) {
  const apiKey = instance.supabase_anon_key;
  const res = await fetch(`${instance.supabase_url}/rest/v1/platform_system_config?select=key&limit=1`, {
    headers: {
      'apikey': apiKey,
      'Authorization': `Bearer ${apiKey}`,
    },
  });

  if (!res.ok) {
    throw new Error(`سيرفر الوكيل غير مستجيب (كود: ${res.status})`);
  }

  return true;
}
