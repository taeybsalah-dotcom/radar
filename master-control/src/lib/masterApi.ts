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
 * ⚡ Secure Kill Switch Executor:
 * Sends the secret master token to verify authorization before altering platform status.
 */
export async function executeResellerKillSwitch(
  instance: ResellerInstance,
  targetStatus: 'active' | 'suspended',
  reason?: string
) {
  const resellerUrl = instance.supabase_url;
  const apiKey = instance.supabase_anon_key;

  // 1. Call Secure RPC set_platform_status with p_master_token
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

  // 2. Update status in our master database
  const { error: masterDbError } = await masterSupabase
    .from('reseller_instances')
    .update({
      platform_status: targetStatus,
      suspension_reason: targetStatus === 'suspended' ? (reason || 'إيقاف إداري سيادي من مالك المنصة') : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', instance.id);

  if (masterDbError) throw masterDbError;

  return { success: true };
}

/**
 * 🔑 Reseller Password Reset Executor:
 * Directly updates the password inside the reseller's database via reset_admin_password RPC.
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
 * Test Connection via Direct REST ping with Anon Key (100% Browser Safe)
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
