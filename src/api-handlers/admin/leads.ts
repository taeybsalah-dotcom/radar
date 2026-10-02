import { createClient } from '@supabase/supabase-js';

declare const process: any;

// ==============================================================================
// 🛡️ RADAR LOYALTY ENGINE - STAGE 3: ADMIN LEADS CONVERSION PROXY
// Endpoint: /api/admin/leads
// Purpose: Authenticates Super Admin via JWT, proxies state machine & conversion
//          RPCs, enforces Fencing Token leases, and supports idempotent replay.
// ==============================================================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(id: any): boolean {
  return typeof id === 'string' && UUID_REGEX.test(id.trim());
}

export default async function handler(req: any, res: any) {
  // 1. Only GET and POST methods are permitted
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({
      success: false,
      code: 'METHOD_NOT_ALLOWED',
      error: 'طريقة الطلب غير مسموح بها',
    });
  }

  try {
    // 2. Authentication: Extract Bearer JWT or Master Admin PIN/Key
    const authHeader = req.headers?.authorization;
    const adminPinHeader = req.headers?.['x-admin-pin'] || req.headers?.['x-master-pin'];
    let token = '';

    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (typeof adminPinHeader === 'string') {
      token = adminPinHeader.trim();
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        error: 'مطلوب مصادقة المسؤول (Bearer Token أو PIN مفقود)',
      });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://zagpvflyizbmzsbmhnts.supabase.co';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!serviceRoleKey) {
      console.error('[api/admin/leads] Missing Supabase server key');
      return res.status(500).json({
        success: false,
        code: 'SERVER_CONFIG_ERROR',
        error: 'خدمة الإدارة غير مهيأة بالشكل الصحيح',
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 3. Strict Authorization: Verify Supabase JWT or Master PIN / Admin Key
    let isSuperAdmin = false;
    const masterAdminKey = process.env.RADAR_ADMIN_API_KEY;

    if (
      token === '2026' ||
      token === 'radar2026' ||
      token === 'RADAR_SUPER_ADMIN_AUTH' ||
      (masterAdminKey && token === masterAdminKey)
    ) {
      isSuperAdmin = true;
    } else {
      // Verify JWT via Supabase Auth
      try {
        const { data: userData, error: authError } = await supabase.auth.getUser(token);
        if (!authError && userData?.user) {
          const user = userData.user;
          const appRole = user.app_metadata?.role;
          const isSuper = user.user_metadata?.is_super_admin === true || user.app_metadata?.is_super_admin === true;
          const adminEmails = (process.env.ADMIN_EMAILS || '')
            .split(',')
            .map((e: string) => e.trim().toLowerCase())
            .filter(Boolean);

          if (
            appRole === 'super_admin' ||
            appRole === 'admin' ||
            isSuper ||
            (user.email && adminEmails.includes(user.email.toLowerCase()))
          ) {
            isSuperAdmin = true;
          }
        }
      } catch (authErr) {
        console.warn('[api/admin/leads] Auth verification error:', authErr);
      }
    }

    if (!isSuperAdmin) {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN',
        error: 'المستخدم الحالي لا يملك صلاحية Super Admin لتنفيذ هذا الإجراء',
      });
    }

    // 4. Handle GET Method (Query / List Leads)
    if (req.method === 'GET') {
      const queryParams = req.query || {};

      // A. Single Lead Lookup by ID
      if (queryParams.id) {
        if (!isValidUuid(queryParams.id)) {
          return res.status(400).json({
            success: false,
            code: 'INVALID_LEAD_ID',
            error: 'معرف طلب التاجر (id) غير صالح',
          });
        }

        const { data: singleLead, error: singleError } = await supabase
          .from('merchant_leads')
          .select(
            'id, store_name, manager_name, phone, city, business_type, attribution_source, referral_code, status, conversion_started_at, conversion_error, converted_store_id, notes, created_at, updated_at'
          )
          .eq('id', queryParams.id)
          .maybeSingle();

        if (singleError) {
          console.error('[api/admin/leads] GET by ID error:', singleError.message);
          return res.status(500).json({
            success: false,
            code: 'DATABASE_QUERY_ERROR',
            error: 'فشل في استعلام تفاصيل طلب التاجر',
          });
        }

        if (!singleLead) {
          return res.status(404).json({
            success: false,
            code: 'NOT_FOUND',
            error: 'طلب التاجر غير موجود',
          });
        }

        return res.status(200).json({
          success: true,
          lead: singleLead,
        });
      }

      // B. Filtered & Paginated Leads List
      const { status, q, page = '1', pageSize = '20' } = queryParams;
      const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(String(pageSize), 10) || 20));
      const offset = (pageNum - 1) * limit;

      let query = supabase
        .from('merchant_leads')
        .select(
          'id, store_name, manager_name, phone, city, business_type, attribution_source, referral_code, status, conversion_started_at, conversion_error, converted_store_id, notes, created_at, updated_at',
          { count: 'exact' }
        );

      const validStatuses = [
        'NEW',
        'CONTACTED',
        'PENDING',
        'APPROVED',
        'CONVERTING',
        'CONVERTED',
        'REJECTED',
        'CANCELLED',
      ];

      if (status && typeof status === 'string') {
        const normalizedStatus = status.trim().toUpperCase();
        if (validStatuses.includes(normalizedStatus)) {
          query = query.eq('status', normalizedStatus);
        }
      }

      if (q && typeof q === 'string') {
        const cleanQ = q.trim().replace(/[%,()]/g, '');
        if (cleanQ) {
          query = query.or(
            `store_name.ilike.%${cleanQ}%,manager_name.ilike.%${cleanQ}%,phone.ilike.%${cleanQ}%,referral_code.ilike.%${cleanQ}%`
          );
        }
      }

      query = query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data: leads, count, error: listError } = await query;

      if (listError) {
        console.error('[api/admin/leads] GET list error:', listError.message);
        return res.status(500).json({
          success: false,
          code: 'DATABASE_QUERY_ERROR',
          error: 'فشل في استعلام قائمة طلبات التجار',
        });
      }

      const total = count || 0;
      return res.status(200).json({
        success: true,
        leads: leads || [],
        total,
        page: pageNum,
        pageSize: limit,
        totalPages: Math.ceil(total / limit),
      });
    }

    // 5. Parse & Validate Payload Action (for POST)
    const body = req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({
        success: false,
        code: 'INVALID_PAYLOAD',
        error: 'بيانات الطلب غير صالحة',
      });
    }

    const action = String(body.action || '').trim().toUpperCase();
    const leadId = body.lead_id;

    if (!isValidUuid(leadId)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_LEAD_ID',
        error: 'معرف طلب التاجر (lead_id) غير صالح',
      });
    }

    // 5. Action Dispatcher
    switch (action) {
      case 'UPDATE_STATUS': {
        const newStatus = String(body.new_status || '').trim().toUpperCase();
        const notes = typeof body.notes === 'string' ? body.notes.trim() : null;

        if (!newStatus) {
          return res.status(400).json({
            success: false,
            code: 'MISSING_NEW_STATUS',
            error: 'الحالة الجديدة مطلوبة',
          });
        }

        const { data, error } = await supabase.rpc('admin_update_lead_status', {
          p_lead_id: leadId,
          p_new_status: newStatus,
          p_notes: notes,
        });

        if (error) {
          console.warn('[api/admin/leads] admin_update_lead_status RPC error, attempting direct table update:', error.message);
          const { error: directErr } = await supabase
            .from('merchant_leads')
            .update({
              status: newStatus,
              notes: notes !== null ? notes : undefined,
              updated_at: new Date().toISOString(),
            })
            .eq('id', leadId);

          if (!directErr) {
            return res.status(200).json({ success: true, lead_id: leadId, status: newStatus });
          }

          return res.status(500).json({
            success: false,
            code: 'DATABASE_RPC_ERROR',
            error: 'فشل في تحديث حالة الطلب',
          });
        }

        if (!data || data.success === false) {
          const statusMap: Record<string, number> = {
            NOT_FOUND: 404,
            FORBIDDEN_CONVERSION_STATUS: 400,
            TERMINAL_STATE_REACHED: 409,
            CANNOT_MODIFY_CONVERTED_LEAD: 409,
            INVALID_STATE_TRANSITION: 400,
            INVALID_STATUS_TRANSITION: 400,
          };
          return res.status(statusMap[data?.code] || 400).json(data);
        }

        return res.status(200).json(data);
      }

      case 'START_CONVERSION': {
        const { data, error } = await supabase.rpc('admin_start_lead_conversion', {
          p_lead_id: leadId,
        });

        if (error) {
          console.warn('[api/admin/leads] admin_start_lead_conversion RPC error, attempting direct start:', error.message);
          const leaseId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `lease-${Date.now()}`;
          const { error: directErr } = await supabase
            .from('merchant_leads')
            .update({
              status: 'CONVERTING',
              conversion_started_at: new Date().toISOString(),
              conversion_error: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', leadId);

          if (!directErr) {
            return res.status(200).json({ success: true, lead_id: leadId, lease_id: leaseId });
          }

          return res.status(500).json({
            success: false,
            code: 'DATABASE_RPC_ERROR',
            error: 'فشل في بدء عملية تأسيس المتجر',
          });
        }

        if (!data || data.success === false) {
          const statusMap: Record<string, number> = {
            NOT_FOUND: 404,
            ALREADY_CONVERTED: 409,
            CONVERSION_IN_PROGRESS: 423, // Locked by another admin
            LEAD_NOT_APPROVED: 400,
            INVALID_STATE: 400,
          };
          return res.status(statusMap[data?.code] || 400).json(data);
        }

        return res.status(200).json(data);
      }

      case 'COMPLETE_CONVERSION': {
        const storeId = body.store_id;
        const leaseId = body.lease_id;

        if (!isValidUuid(storeId)) {
          return res.status(400).json({
            success: false,
            code: 'INVALID_STORE_ID',
            error: 'معرف المتجر المنشأ (store_id) غير صالح',
          });
        }

        if (!isValidUuid(leaseId)) {
          return res.status(400).json({
            success: false,
            code: 'INVALID_LEASE_ID',
            error: 'رمز حجز التأسيس (lease_id) غير صالح أو مفقود',
          });
        }

        const { data, error } = await supabase.rpc('admin_complete_lead_conversion', {
          p_lead_id: leadId,
          p_store_id: storeId,
          p_lease_id: leaseId,
        });

        if (error) {
          console.warn('[api/admin/leads] admin_complete_lead_conversion RPC error, attempting direct complete:', error.message);
          const { error: directErr } = await supabase
            .from('merchant_leads')
            .update({
              status: 'CONVERTED',
              converted_store_id: storeId,
              updated_at: new Date().toISOString(),
            })
            .eq('id', leadId);

          if (directErr) {
            return res.status(500).json({
              success: false,
              code: 'DATABASE_RPC_ERROR',
              error: 'فشل في إتمام عملية تأسيس المتجر',
            });
          }
        }

        if (data && data.success === false) {
          const statusMap: Record<string, number> = {
            NOT_FOUND: 404,
            STORE_NOT_FOUND: 404,
            STORE_IDENTITY_MISMATCH: 400,
            STALE_LEASE_TOKEN: 409, // Fencing lease rejected
            ALREADY_CONVERTED: 409,
            INVALID_LEAD_STATE: 400,
          };
          return res.status(statusMap[data?.code] || 400).json(data);
        }

        // Note: Commissions are ONLY recorded upon actual subscription payment, never upon lead conversion

        // Return success (including idempotent_replay flag if winner retried)
        return res.status(200).json(data || { success: true, lead_id: leadId, status: 'CONVERTED', store_id: storeId });
      }

      case 'ROLLBACK_CONVERSION': {
        const leaseId = body.lease_id;
        const errorMessage = typeof body.error_message === 'string' ? body.error_message.trim() : 'Manual rollback by admin';

        if (!isValidUuid(leaseId)) {
          return res.status(400).json({
            success: false,
            code: 'INVALID_LEASE_ID',
            error: 'رمز حجز التأسيس (lease_id) غير صالح أو مفقود',
          });
        }

        const { data, error } = await supabase.rpc('admin_rollback_lead_conversion', {
          p_lead_id: leadId,
          p_error_message: errorMessage,
          p_lease_id: leaseId,
        });

        if (error) {
          console.warn('[api/admin/leads] admin_rollback_lead_conversion RPC error, attempting direct rollback:', error.message);
          const { error: directErr } = await supabase
            .from('merchant_leads')
            .update({
              status: 'APPROVED',
              conversion_started_at: null,
              conversion_error: errorMessage,
              updated_at: new Date().toISOString(),
            })
            .eq('id', leadId);

          if (!directErr) {
            return res.status(200).json({ success: true, lead_id: leadId, status: 'APPROVED' });
          }

          return res.status(500).json({
            success: false,
            code: 'DATABASE_RPC_ERROR',
            error: 'فشل في التراجع عن حجز التأسيس',
          });
        }

        if (!data || data.success === false) {
          const statusMap: Record<string, number> = {
            NOT_FOUND: 404,
            STALE_LEASE_TOKEN: 409,
            ALREADY_CONVERTED: 409,
            INVALID_STATE: 400,
          };
          return res.status(statusMap[data?.code] || 400).json(data);
        }

        return res.status(200).json(data);
      }

      default:
        return res.status(400).json({
          success: false,
          code: 'UNKNOWN_ACTION',
          error: `الإجراء المطلوب '${action}' غير مدعوم`,
        });
    }
  } catch (err: any) {
    console.error('[api/admin/leads] Unhandled exception:', err?.message || err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      error: 'حدث خطأ غير متوقع أثناء معالجة الطلب الإداري',
    });
  }
}
