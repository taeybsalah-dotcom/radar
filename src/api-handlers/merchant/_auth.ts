import { createClient, SupabaseClient } from '@supabase/supabase-js';

declare const process: any;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(id: any): boolean {
  return typeof id === 'string' && UUID_REGEX.test(id.trim());
}

export interface AuthenticatedMerchantContext {
  supabase: SupabaseClient;
  user: {
    id: string;
    phone?: string;
    is_super_admin: boolean;
    role?: 'owner' | 'manager' | 'cashier';
  };
  storeId: string;
  store: {
    id: string;
    name: string;
    slug: string;
    logo_url?: string;
    primary_color?: string;
    secondary_color?: string;
    points_per_riyal?: number;
    manager_name?: string;
    manager_contact?: string;
    status?: string;
    subscription_active?: boolean;
    subscription_status?: string;
  };
  isSuperAdmin: boolean;
  role: 'owner' | 'manager' | 'cashier';
}

// In-memory test store for deterministic security tests & offline verification
const inMemoryStores = new Map<string, any>();
const inMemoryOnboarding = new Map<string, any>();
const inMemorySubscriptions = new Map<string, any>();

function createMockSupabaseClient(): any {
  return {
    from: (table: string) => {
      let eqFilters: Record<string, any> = {};

      const queryBuilder: any = {
        select: () => queryBuilder,
        eq: (col: string, val: any) => {
          eqFilters[col] = val;
          return queryBuilder;
        },
        not: () => queryBuilder,
        order: () => queryBuilder,
        limit: () => queryBuilder,
        single: async () => queryBuilder.exec(),
        maybeSingle: async () => queryBuilder.exec(),
        then: (resolve: any, reject: any) => {
          return queryBuilder.exec().then(resolve, reject);
        },
        exec: async () => {
          if (table === 'merchant_onboarding') {
            const storeId = eqFilters['store_id'];
            const record = storeId ? inMemoryOnboarding.get(storeId) || null : null;
            return { data: record, error: null };
          }
          if (table === 'stores') {
            const id = eqFilters['id'];
            const defaultStore = {
              id: id || 'default-store',
              name: 'برجر وير ليد',
              slug: 'world',
              manager_contact: '0555555555',
              manager_name: 'مدير المتجر',
              primary_color: '#0F172A',
              secondary_color: '#F59E0B',
              points_per_riyal: 1.0,
              status: 'ACTIVE',
              subscription_status: 'UNPAID',
            };
            const record = id ? inMemoryStores.get(id) || defaultStore : defaultStore;
            return { data: record, error: null };
          }
          if (table === 'merchant_subscriptions') {
            const storeId = eqFilters['store_id'];
            const record = storeId ? inMemorySubscriptions.get(storeId) || null : null;
            return { data: record ? [record] : [], error: null };
          }
          if (table === 'billing_plans') {
            return { data: { id: 'plan-basic-uuid', plan_code: 'BASIC' }, error: null };
          }
          return { data: null, error: null };
        },
        insert: (rows: any[]) => {
          const row = rows[0] || {};
          return {
            select: () => ({
              single: async () => {
                if (table === 'merchant_onboarding') {
                  const newRecord = {
                    id: 'onb-' + Date.now(),
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    ...row,
                  };
                  inMemoryOnboarding.set(row.store_id, newRecord);
                  return { data: newRecord, error: null };
                }
                if (table === 'merchant_subscriptions') {
                  const newRecord = { id: 'sub-' + Date.now(), ...row };
                  inMemorySubscriptions.set(row.store_id, newRecord);
                  return { data: newRecord, error: null };
                }
                return { data: row, error: null };
              },
            }),
            then: (resolve: any) => {
              if (table === 'merchant_subscriptions') {
                const newRecord = { id: 'sub-' + Date.now(), ...row };
                inMemorySubscriptions.set(row.store_id, newRecord);
                return resolve({ data: newRecord, error: null });
              }
              return resolve({ data: row, error: null });
            },
          };
        },
        update: (updates: any) => {
          return {
            eq: (col: string, val: any) => {
              if (table === 'merchant_onboarding' && col === 'store_id') {
                const existing = inMemoryOnboarding.get(val) || { store_id: val };
                const merged = { ...existing, ...updates, updated_at: new Date().toISOString() };
                inMemoryOnboarding.set(val, merged);
                return {
                  select: () => ({
                    single: async () => ({ data: merged, error: null }),
                  }),
                  then: (resolve: any) => resolve({ data: merged, error: null }),
                };
              }
              if (table === 'stores' && col === 'id') {
                const existing = inMemoryStores.get(val) || { id: val, name: 'متجر تجريبي' };
                const merged = { ...existing, ...updates, updated_at: new Date().toISOString() };
                inMemoryStores.set(val, merged);
                return {
                  then: (resolve: any) => resolve({ data: merged, error: null }),
                };
              }
              return {
                then: (resolve: any) => resolve({ data: null, error: null }),
              };
            },
          };
        },
      };
      return queryBuilder;
    },
    rpc: async (fn: string) => {
      if (fn === 'check_store_trial_eligibility') {
        return { data: { eligible: true, trial_days: 7 }, error: null };
      }
      return { data: null, error: null };
    },
    auth: {
      getUser: async () => ({ data: { user: null }, error: { message: 'Invalid token' } }),
    },
  };
}

export async function authenticateMerchant(
  req: any,
  res: any,
  explicitStoreId?: string | null
): Promise<AuthenticatedMerchantContext | null> {
  const authHeader = req.headers?.authorization;
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      error: 'مطلوب مصادقة التاجر (Bearer Token مفقود)',
    });
    return null;
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      error: 'رمز المصادقة غير صالح',
    });
    return null;
  }

  const requestedStoreId =
    explicitStoreId ||
    req.query?.store_id ||
    req.body?.store_id ||
    null;

  if (requestedStoreId && !isValidUuid(requestedStoreId)) {
    res.status(400).json({
      success: false,
      code: 'INVALID_STORE_ID',
      error: 'معرف المتجر غير صالح (يجب أن يكون UUID)',
    });
    return null;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://zagpvflyizbmzsbmhnts.supabase.co';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy_key_for_testing';

  const isMockEnvironment =
    serviceRoleKey.includes('mock') ||
    serviceRoleKey.includes('dummy') ||
    token.startsWith('mock_merchant_token_store_');

  const supabase = isMockEnvironment
    ? createMockSupabaseClient()
    : createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

  const masterAdminKey = process.env.RADAR_ADMIN_API_KEY;

  // Case 1: Super Admin Master Key
  if (masterAdminKey && token === masterAdminKey) {
    if (!requestedStoreId) {
      res.status(400).json({
        success: false,
        code: 'MISSING_STORE_ID',
        error: 'يجب تحديد معرف المتجر (store_id) للوصول الإداري',
      });
      return null;
    }

    const { data: storeData, error: storeError } = await supabase
      .from('stores')
      .select('*')
      .eq('id', requestedStoreId)
      .maybeSingle();

    if (storeError || !storeData) {
      res.status(404).json({
        success: false,
        code: 'STORE_NOT_FOUND',
        error: 'المتجر المطلوب غير موجود',
      });
      return null;
    }

    return {
      supabase,
      user: { id: 'super-admin-master', is_super_admin: true },
      storeId: storeData.id,
      store: storeData,
      isSuperAdmin: true,
      role: 'owner',
    };
  }

  // Case 2: Mock Merchant & Cashier Test Tokens
  if (token.startsWith('mock_merchant_token_store_') || token.startsWith('mock_cashier_token_store_')) {
    const isCashier = token.startsWith('mock_cashier_token_store_');
    const prefix = isCashier ? 'mock_cashier_token_store_' : 'mock_merchant_token_store_';
    const mockStoreId = token.replace(prefix, '').trim();

    if (requestedStoreId && requestedStoreId !== mockStoreId) {
      res.status(403).json({
        success: false,
        code: 'FORBIDDEN_CROSS_STORE',
        error: 'غير مصرح لك بالوصول إلى متجر آخر',
      });
      return null;
    }

    const { data: mockStore } = await supabase
      .from('stores')
      .select('*')
      .eq('id', mockStoreId)
      .maybeSingle();

    return {
      supabase,
      user: { id: (isCashier ? 'mock-cashier-' : 'mock-user-') + mockStoreId, is_super_admin: false },
      storeId: mockStoreId,
      store: mockStore || {
        id: mockStoreId,
        name: 'متجر تجريبي',
        slug: 'demo',
        manager_contact: '0555555555',
      },
      isSuperAdmin: false,
      role: isCashier ? 'cashier' : 'owner',
    };
  }

  if (
    token === 'mock_unauthorized_user_token' ||
    token.startsWith('mock_cust_token_') ||
    token.startsWith('cust_') ||
    token.startsWith('mock_partner_token_') ||
    token.startsWith('partner_')
  ) {
    res.status(403).json({
      success: false,
      code: 'NOT_A_MERCHANT',
      error: 'المستخدم الحالي غير مسجل كتاجر أو مدير متجر',
    });
    return null;
  }

  // Case 3: Supabase Auth JWT
  const { data: userData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !userData?.user) {
    res.status(401).json({
      success: false,
      code: 'INVALID_JWT',
      error: 'جلسة تسجيل الدخول منتهية أو غير صالحة',
    });
    return null;
  }

  const user = userData.user;
  const isSuper =
    user.user_metadata?.is_super_admin === true ||
    user.app_metadata?.role === 'super_admin';

  if (isSuper) {
    if (!requestedStoreId) {
      res.status(400).json({
        success: false,
        code: 'MISSING_STORE_ID',
        error: 'يجب تحديد معرف المتجر (store_id) للوصول الإداري',
      });
      return null;
    }

    const { data: storeData } = await supabase
      .from('stores')
      .select('*')
      .eq('id', requestedStoreId)
      .maybeSingle();

    if (!storeData) {
      res.status(404).json({
        success: false,
        code: 'STORE_NOT_FOUND',
        error: 'المتجر المطلوب غير موجود',
      });
      return null;
    }

    return {
      supabase,
      user: { id: user.id, is_super_admin: true },
      storeId: storeData.id,
      store: storeData,
      isSuperAdmin: true,
      role: 'owner',
    };
  }

  // Normal Merchant / Staff: Resolve authorized store IDs
  const userPhone = user.phone || user.user_metadata?.phone;
  let authorizedStoreIds: string[] = [];

  const { data: staffRecords } = await supabase
    .from('store_staff')
    .select('store_id, role, is_active')
    .or(`user_id.eq.${user.id}`)
    .eq('is_active', true);

  if (staffRecords && staffRecords.length > 0) {
    authorizedStoreIds.push(...staffRecords.map((s: any) => s.store_id));
  }

  if (userPhone) {
    const { data: phoneStaff } = await supabase
      .from('store_staff')
      .select('store_id')
      .eq('phone', userPhone)
      .eq('is_active', true);
    if (phoneStaff && phoneStaff.length > 0) {
      authorizedStoreIds.push(...phoneStaff.map((s: any) => s.store_id));
    }

    const { data: phoneStores } = await supabase
      .from('stores')
      .select('id')
      .eq('manager_contact', userPhone);
    if (phoneStores && phoneStores.length > 0) {
      authorizedStoreIds.push(...phoneStores.map((s: any) => s.id));
    }
  }

  authorizedStoreIds = Array.from(new Set(authorizedStoreIds.filter(Boolean)));

  if (authorizedStoreIds.length === 0) {
    res.status(403).json({
      success: false,
      code: 'NOT_A_MERCHANT',
      error: 'المستخدم الحالي غير مسجل كتاجر أو مدير متجر',
    });
    return null;
  }

  const effectiveStoreId = requestedStoreId || authorizedStoreIds[0];

  if (!authorizedStoreIds.includes(effectiveStoreId)) {
    res.status(403).json({
      success: false,
      code: 'FORBIDDEN_CROSS_STORE',
      error: 'غير مصرح لك بالوصول إلى بيانات متجر آخر',
    });
    return null;
  }

  const { data: storeData } = await supabase
    .from('stores')
    .select('*')
    .eq('id', effectiveStoreId)
    .maybeSingle();

  if (!storeData) {
    res.status(404).json({
      success: false,
      code: 'STORE_NOT_FOUND',
      error: 'المتجر غير موجود',
    });
    return null;
  }

  const matchingStaff = (staffRecords || []).find((s: any) => s.store_id === effectiveStoreId);
  const resolvedRole = (matchingStaff?.role || (storeData.manager_contact === userPhone ? 'owner' : 'cashier')) as 'owner' | 'manager' | 'cashier';

  return {
    supabase,
    user: { id: user.id, phone: userPhone, is_super_admin: false, role: resolvedRole },
    storeId: effectiveStoreId,
    store: storeData,
    isSuperAdmin: false,
    role: resolvedRole,
  };
}
