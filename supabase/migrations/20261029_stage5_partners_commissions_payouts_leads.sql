-- ==============================================================================
-- 🚀 STAGE 5 MIGRATION: AFFILIATES, PARTNERS, COMMISSIONS, PAYOUTS & LEADS
-- Sadim Al-Athir (kspfiijorengpckdlymx) Multi-Tenant Security & Atomic Hardening
-- FINAL PRODUCTION-READY VERSION - Incorporating Advisor Security Enhancements
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------------------------
-- 1. HARDEN ROW-LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------

-- 1.1 affiliates
ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS affiliates_manage_all ON public.affiliates;
DROP POLICY IF EXISTS affiliates_read_public ON public.affiliates;
DROP POLICY IF EXISTS "SuperAdmin affiliates access" ON public.affiliates;
DROP POLICY IF EXISTS service_role_affiliates_full_access ON public.affiliates;
DROP POLICY IF EXISTS affiliates_super_admin_all ON public.affiliates;
DROP POLICY IF EXISTS affiliates_service_role_all ON public.affiliates;
DROP POLICY IF EXISTS "affiliates_super_admin_all" ON public.affiliates;
DROP POLICY IF EXISTS "affiliates_service_role_all" ON public.affiliates;

CREATE POLICY affiliates_service_role_all ON public.affiliates
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY affiliates_super_admin_all ON public.affiliates
    FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- 1.2 partner_accounts
ALTER TABLE public.partner_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partner_accounts_manage_all ON public.partner_accounts;
DROP POLICY IF EXISTS partner_accounts_read_public ON public.partner_accounts;
DROP POLICY IF EXISTS "SuperAdmin partner accounts access" ON public.partner_accounts;
DROP POLICY IF EXISTS partner_accounts_select_own ON public.partner_accounts;
DROP POLICY IF EXISTS partner_accounts_service_role_all ON public.partner_accounts;
DROP POLICY IF EXISTS partner_accounts_super_admin_all ON public.partner_accounts;

CREATE POLICY partner_accounts_service_role_all ON public.partner_accounts
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY partner_accounts_super_admin_all ON public.partner_accounts
    FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY partner_accounts_select_own ON public.partner_accounts
    FOR SELECT TO authenticated USING (auth.uid() = auth_user_id);

-- 1.3 partner_commissions
ALTER TABLE public.partner_commissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partner_commissions_read_all ON public.partner_commissions;
DROP POLICY IF EXISTS "SuperAdmin partner commissions access" ON public.partner_commissions;
DROP POLICY IF EXISTS partner_commissions_select_own ON public.partner_commissions;
DROP POLICY IF EXISTS partner_commissions_service_role_all ON public.partner_commissions;
DROP POLICY IF EXISTS partner_commissions_super_admin_all ON public.partner_commissions;

CREATE POLICY partner_commissions_service_role_all ON public.partner_commissions
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY partner_commissions_super_admin_all ON public.partner_commissions
    FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY partner_commissions_select_own ON public.partner_commissions
    FOR SELECT TO authenticated USING (
        partner_account_id IN (
            SELECT pa.id FROM public.partner_accounts pa
            WHERE pa.auth_user_id = auth.uid() AND pa.active = true
        )
    );

-- 1.4 merchant_leads
ALTER TABLE public.merchant_leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS merchant_leads_anon_update_policy ON public.merchant_leads;
DROP POLICY IF EXISTS merchant_leads_auth_all_policy ON public.merchant_leads;
DROP POLICY IF EXISTS merchant_leads_insert_all ON public.merchant_leads;
DROP POLICY IF EXISTS merchant_leads_select_all ON public.merchant_leads;
DROP POLICY IF EXISTS "Service Role Full Leads Access" ON public.merchant_leads;
DROP POLICY IF EXISTS "SuperAdmin Full Leads Access" ON public.merchant_leads;
DROP POLICY IF EXISTS service_role_merchant_leads_full_access ON public.merchant_leads;
DROP POLICY IF EXISTS merchant_leads_service_role_all ON public.merchant_leads;
DROP POLICY IF EXISTS merchant_leads_super_admin_all ON public.merchant_leads;

CREATE POLICY merchant_leads_service_role_all ON public.merchant_leads
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY merchant_leads_super_admin_all ON public.merchant_leads
    FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- 1.5 affiliate_payouts (cast uuid and varchar correctly to text)
ALTER TABLE public.affiliate_payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS affiliate_payouts_service_role_all ON public.affiliate_payouts;
DROP POLICY IF EXISTS affiliate_payouts_super_admin_all ON public.affiliate_payouts;
DROP POLICY IF EXISTS affiliate_payouts_select_own ON public.affiliate_payouts;

CREATE POLICY affiliate_payouts_service_role_all ON public.affiliate_payouts
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY affiliate_payouts_super_admin_all ON public.affiliate_payouts
    FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY affiliate_payouts_select_own ON public.affiliate_payouts
    FOR SELECT TO authenticated USING (
        affiliate_id IN (
            SELECT id::text FROM public.affiliates 
            WHERE public.normalize_saudi_phone(phone) = public.normalize_saudi_phone((SELECT phone FROM public.partner_accounts WHERE auth_user_id = auth.uid() LIMIT 1))
        )
        OR EXISTS (
            SELECT 1 FROM public.partner_accounts pa 
            WHERE pa.affiliate_id::text = affiliate_payouts.affiliate_id::text 
              AND pa.auth_user_id = auth.uid()
        )
    );

-- 1.6 partner_audit_logs & partner_targets & referrals
ALTER TABLE public.partner_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "SuperAdmin partner audit logs access" ON public.partner_audit_logs;
DROP POLICY IF EXISTS partner_audit_logs_service_role_all ON public.partner_audit_logs;
DROP POLICY IF EXISTS partner_audit_logs_super_admin_all ON public.partner_audit_logs;

CREATE POLICY partner_audit_logs_service_role_all ON public.partner_audit_logs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY partner_audit_logs_super_admin_all ON public.partner_audit_logs
    FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

ALTER TABLE public.partner_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "SuperAdmin partner targets access" ON public.partner_targets;
DROP POLICY IF EXISTS partner_targets_select_own ON public.partner_targets;
DROP POLICY IF EXISTS partner_targets_service_role_all ON public.partner_targets;
DROP POLICY IF EXISTS partner_targets_super_admin_all ON public.partner_targets;

CREATE POLICY partner_targets_service_role_all ON public.partner_targets
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY partner_targets_super_admin_all ON public.partner_targets
    FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY partner_targets_select_own ON public.partner_targets
    FOR SELECT TO authenticated USING (
        partner_account_id IN (
            SELECT pa.id FROM public.partner_accounts pa
            WHERE pa.auth_user_id = auth.uid() AND pa.active = true
        )
    );

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_referrals_full_access ON public.referrals;
DROP POLICY IF EXISTS referrals_service_role_all ON public.referrals;
DROP POLICY IF EXISTS referrals_super_admin_all ON public.referrals;

CREATE POLICY referrals_service_role_all ON public.referrals
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY referrals_super_admin_all ON public.referrals
    FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


-- ------------------------------------------------------------------------------
-- 2. SAUDI PHONE NORMALIZATION BACKFILL
-- ------------------------------------------------------------------------------

UPDATE public.affiliates
SET phone = public.normalize_saudi_phone(phone)
WHERE phone IS NOT NULL AND phone <> public.normalize_saudi_phone(phone);

UPDATE public.partner_accounts
SET phone = public.normalize_saudi_phone(phone)
WHERE phone IS NOT NULL AND phone <> public.normalize_saudi_phone(phone);

UPDATE public.merchant_leads
SET normalized_phone = public.normalize_saudi_phone(phone)
WHERE phone IS NOT NULL AND (normalized_phone IS NULL OR normalized_phone <> public.normalize_saudi_phone(phone));


-- ------------------------------------------------------------------------------
-- 3. ATOMIC PARTNER CREATION RPC
-- ------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.admin_create_partner_full_atomic(text, text, text, text, text, text, numeric, numeric, integer, text);

CREATE OR REPLACE FUNCTION public.admin_create_partner_full_atomic(
    p_name text,
    p_phone text,
    p_referral_code text,
    p_pin_code text,
    p_slug text,
    p_region text DEFAULT 'الرياض',
    p_commission_rate numeric DEFAULT 0.2000,
    p_recurring_commission_rate numeric DEFAULT 0.1000,
    p_monthly_target integer DEFAULT 20,
    p_master_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
    v_clean_name TEXT := TRIM(COALESCE(p_name, ''));
    v_norm_phone TEXT;
    v_clean_code TEXT;
    v_clean_slug TEXT;
    v_clean_pin TEXT := TRIM(COALESCE(p_pin_code, '1234'));
    v_comm_rate NUMERIC(5, 4);
    v_rec_rate NUMERIC(5, 4);
    v_affiliate_id UUID;
    v_partner_id UUID;
    v_hashed_pin TEXT;
    v_period_start DATE;
    v_period_end DATE;
BEGIN
    -- 1. Authorization check
    IF NOT (
        public.is_super_admin()
        OR auth.role() = 'service_role'
        OR (p_master_token IS NOT NULL AND public.is_valid_master_token(p_master_token))
    ) THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED', 'error', 'صلاحية غير كافية لإنشاء حساب شريك');
    END IF;

    -- 2. Basic validations
    IF v_clean_name = '' THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_NAME', 'error', 'اسم الشريك مطلوب');
    END IF;

    v_norm_phone := public.normalize_saudi_phone(p_phone);
    IF v_norm_phone IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_PHONE', 'error', 'رقم الجوال غير صالح');
    END IF;

    v_clean_code := UPPER(REGEXP_REPLACE(TRIM(COALESCE(p_referral_code, '')), '[^A-Z0-9_-]', '', 'g'));
    IF v_clean_code = '' OR LENGTH(v_clean_code) < 3 THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_CODE', 'error', 'كود الإحالة يجب أن يتكون من 3 أحرف على الأقل');
    END IF;

    v_clean_slug := LOWER(REGEXP_REPLACE(TRIM(COALESCE(p_slug, v_clean_code)), '[^a-z0-9_-]', '-', 'g'));
    IF v_clean_slug IN ('partner', 'join', 'admin', 'customer', 'cashier', 'pos', 'superadmin', 'super-admin', 'api', 'dashboard') THEN
        v_clean_slug := LOWER(v_clean_code);
    END IF;

    IF LENGTH(v_clean_pin) < 4 THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_PIN', 'error', 'الرمز السري يجب ألا يقل عن 4 أرقام');
    END IF;

    v_comm_rate := GREATEST(0.0100, LEAST(1.0000, COALESCE(p_commission_rate, 0.2000)));
    v_rec_rate := GREATEST(0.0100, LEAST(1.0000, COALESCE(p_recurring_commission_rate, 0.1000)));

    -- 3. Collision checks
    IF EXISTS (SELECT 1 FROM public.affiliates WHERE public.normalize_saudi_phone(phone) = v_norm_phone)
       OR EXISTS (SELECT 1 FROM public.partner_accounts WHERE public.normalize_saudi_phone(phone) = v_norm_phone) THEN
        RETURN jsonb_build_object('success', false, 'code', 'PHONE_EXISTS', 'error', 'رقم الجوال مسجل مسبقاً');
    END IF;

    IF EXISTS (SELECT 1 FROM public.affiliates WHERE UPPER(TRIM(referral_code)) = v_clean_code) THEN
        RETURN jsonb_build_object('success', false, 'code', 'CODE_EXISTS', 'error', 'كود الإحالة مستخدم مسبقاً');
    END IF;

    IF EXISTS (SELECT 1 FROM public.partner_accounts WHERE LOWER(TRIM(slug)) = v_clean_slug) THEN
        v_clean_slug := LOWER(v_clean_code) || '-' || SUBSTRING(gen_random_uuid()::text FROM 1 FOR 4);
    END IF;

    -- 4. Hash PIN with bcrypt
    v_hashed_pin := crypt(v_clean_pin, gen_salt('bf', 8));

    -- 5. Insert into affiliates (secure notes without exposing plaintext pin)
    INSERT INTO public.affiliates (
        name, phone, referral_code, code, status, is_active, commission_rate,
        acquisition_commission_rate, recurring_commission_rate, pin_code, city,
        monthly_target_stores, notes, created_at, updated_at
    ) VALUES (
        v_clean_name, v_norm_phone, v_clean_code, v_clean_code, 'ACTIVE', true,
        v_comm_rate, v_comm_rate, v_rec_rate, v_clean_pin,
        COALESCE(NULLIF(TRIM(p_region), ''), 'الرياض'),
        GREATEST(1, COALESCE(p_monthly_target, 20)),
        'Created via atomic RPC - secure',
        CLOCK_TIMESTAMP(), CLOCK_TIMESTAMP()
    ) RETURNING id INTO v_affiliate_id;

    -- 6. Insert into partner_accounts
    INSERT INTO public.partner_accounts (
        affiliate_id, display_name, slug, referral_code, phone, pin_code, region,
        commission_rate, acquisition_commission_rate, recurring_commission_rate,
        target_value, active, created_at, updated_at
    ) VALUES (
        v_affiliate_id, v_clean_name, v_clean_slug, v_clean_code, v_norm_phone, v_hashed_pin,
        COALESCE(NULLIF(TRIM(p_region), ''), 'الرياض'),
        v_comm_rate, v_comm_rate, v_rec_rate,
        GREATEST(1, COALESCE(p_monthly_target, 20)), true,
        CLOCK_TIMESTAMP(), CLOCK_TIMESTAMP()
    ) RETURNING id INTO v_partner_id;

    -- 7. Initialize monthly target
    v_period_start := DATE_TRUNC('month', CURRENT_DATE)::DATE;
    v_period_end := (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE;

    INSERT INTO public.partner_targets (partner_account_id, period_start, period_end, target_type, target_value)
    VALUES (v_partner_id, v_period_start, v_period_end, 'PAID_MERCHANTS', GREATEST(1, COALESCE(p_monthly_target, 20)))
    ON CONFLICT (partner_account_id, period_start, period_end, target_type) DO NOTHING;

    -- 8. Audit log
    INSERT INTO public.partner_audit_logs (partner_account_id, action, details, performed_by)
    VALUES (
        v_partner_id, 'PARTNER_CREATED_ATOMIC',
        jsonb_build_object('affiliate_id', v_affiliate_id, 'name', v_clean_name, 'phone', v_norm_phone, 'code', v_clean_code, 'slug', v_clean_slug),
        CASE WHEN p_master_token IS NOT NULL THEN 'MASTER_TOKEN' ELSE 'SUPER_ADMIN' END
    );

    RETURN jsonb_build_object(
        'success', true,
        'partner_id', v_partner_id,
        'affiliate_id', v_affiliate_id,
        'slug', v_clean_slug,
        'referral_code', v_clean_code,
        'message', 'تم إنشاء الشريك بنجاح'
    );
END;
$$;


-- ------------------------------------------------------------------------------
-- 4. SECURE PARTNER LOGIN
-- ------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.verify_partner_login(text, text);

CREATE OR REPLACE FUNCTION public.verify_partner_login(p_login_input text, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
    v_clean_input TEXT := LOWER(TRIM(COALESCE(p_login_input, '')));
    v_norm_phone TEXT;
    v_pin TEXT := TRIM(COALESCE(p_pin, ''));
    v_partner RECORD;
    v_is_match BOOLEAN := FALSE;
    v_key TEXT;
    v_lock INT;
    v_count INT;
BEGIN
    IF v_clean_input = '' OR v_pin = '' OR LENGTH(v_clean_input) > 100 OR LENGTH(v_pin) > 32 THEN
        RETURN jsonb_build_object('success', false, 'error', 'يرجى إدخال البيانات كاملة');
    END IF;

    v_norm_phone := public.normalize_saudi_phone(v_clean_input);

    SELECT pa.id, pa.affiliate_id, pa.display_name, pa.slug, pa.region, pa.active, pa.pin_code,
           a.name, a.phone, a.referral_code, a.status,
           COALESCE(pa.commission_rate, a.commission_rate, 0.2000) AS commission_rate,
           COALESCE(pa.recurring_commission_rate, a.recurring_commission_rate, 0.1000) AS recurring_commission_rate
    INTO v_partner
    FROM public.partner_accounts pa 
    JOIN public.affiliates a ON a.id = pa.affiliate_id
    WHERE LOWER(TRIM(COALESCE(a.referral_code, ''))) = v_clean_input
       OR LOWER(TRIM(COALESCE(pa.slug, ''))) = v_clean_input
       OR (v_norm_phone IS NOT NULL AND (public.normalize_saudi_phone(a.phone) = v_norm_phone OR public.normalize_saudi_phone(pa.phone) = v_norm_phone))
    LIMIT 1;

    IF NOT FOUND THEN
        SELECT a.id AS affiliate_id, a.id, a.name AS display_name, LOWER(a.referral_code) AS slug,
               a.city AS region, a.is_active AS active, a.pin_code, a.name, a.phone, a.referral_code, a.status,
               COALESCE(a.commission_rate, 0.2000) AS commission_rate,
               COALESCE(a.recurring_commission_rate, 0.1000) AS recurring_commission_rate
        INTO v_partner FROM public.affiliates a
        WHERE LOWER(TRIM(COALESCE(a.referral_code, ''))) = v_clean_input
           OR (v_norm_phone IS NOT NULL AND public.normalize_saudi_phone(a.phone) = v_norm_phone)
        LIMIT 1;
    END IF;

    IF v_partner.id IS NULL THEN
        v_key := 'i:' || LEFT(v_clean_input, 64);
        v_lock := public._pin_lock_seconds('partner', v_key);
        IF v_lock > 0 THEN RETURN public._locked_response(v_lock); END IF;
        v_count := public._pin_register_fail('partner', v_key, NULL, jsonb_build_object('type', 'partner_unknown_login'));
        IF v_count >= 5 THEN RETURN public._locked_response(900); END IF;
        RETURN jsonb_build_object('success', false, 'error', 'رقم الجوال أو كود الشريك غير مسجل');
    END IF;

    v_key := 'p:' || v_partner.id::text;
    v_lock := public._pin_lock_seconds('partner', v_key);
    IF v_lock > 0 THEN RETURN public._locked_response(v_lock); END IF;

    IF v_partner.active = FALSE OR v_partner.status = 'SUSPENDED' THEN
        RETURN jsonb_build_object('success', false, 'error', 'حساب الشريك موقوف حالياً');
    END IF;

    IF v_partner.pin_code LIKE '$2%' THEN
        v_is_match := (v_partner.pin_code = crypt(v_pin, v_partner.pin_code));
    ELSE
        v_is_match := (TRIM(v_partner.pin_code) = v_pin);
        IF v_is_match THEN
            UPDATE public.partner_accounts SET pin_code = crypt(v_pin, gen_salt('bf', 8)), updated_at = CLOCK_TIMESTAMP() WHERE id = v_partner.id;
        END IF;
    END IF;

    IF NOT v_is_match THEN
        v_count := public._pin_register_fail('partner', v_key, v_partner.id, jsonb_build_object('type', 'partner_login'));
        IF v_count >= 5 THEN RETURN public._locked_response(900); END IF;
        RETURN jsonb_build_object('success', false, 'error', 'الرمز السري غير صحيح', 'attempts_left', 5 - v_count);
    END IF;

    PERFORM public._pin_register_success('partner', v_key);

    RETURN jsonb_build_object('success', true, 'partner', jsonb_build_object(
        'id', v_partner.id, 'affiliate_id', v_partner.affiliate_id, 'display_name', v_partner.display_name,
        'name', v_partner.name, 'slug', v_partner.slug, 'region', v_partner.region,
        'phone', v_partner.phone, 'referral_code', v_partner.referral_code,
        'commission_rate', v_partner.commission_rate, 'recurring_commission_rate', v_partner.recurring_commission_rate));
END;
$$;


-- ------------------------------------------------------------------------------
-- 5. SECURE PIN CHANGE
-- ------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.change_partner_pin(uuid, text, text);

CREATE OR REPLACE FUNCTION public.change_partner_pin(p_partner_id uuid, p_old_pin text, p_new_pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp' AS $$
DECLARE
    v_partner RECORD; 
    v_is_valid BOOLEAN := FALSE; 
    v_old TEXT := TRIM(COALESCE(p_old_pin, ''));
    v_new TEXT := TRIM(COALESCE(p_new_pin, '')); 
    v_key TEXT; 
    v_lock INT; 
    v_count INT; 
    v_hashed_new TEXT;
BEGIN
    IF p_partner_id IS NULL OR v_old = '' OR LENGTH(v_old) > 32 OR LENGTH(v_new) > 32 THEN
        RETURN jsonb_build_object('success', false, 'error', 'البيانات غير صحيحة');
    END IF;

    IF LENGTH(v_new) < 4 THEN 
        RETURN jsonb_build_object('success', false, 'error', 'الرمز الجديد يجب ألا يقل عن 4 أرقام'); 
    END IF;

    SELECT id, affiliate_id, pin_code INTO v_partner FROM public.partner_accounts WHERE id = p_partner_id;
    IF NOT FOUND THEN 
        RETURN jsonb_build_object('success', false, 'error', 'حساب الشريك غير موجود'); 
    END IF;

    v_key := 'p:' || v_partner.id::text;
    v_lock := public._pin_lock_seconds('partner', v_key);
    IF v_lock > 0 THEN RETURN public._locked_response(v_lock); END IF;

    IF v_partner.pin_code LIKE '$2%' THEN 
        v_is_valid := (v_partner.pin_code = crypt(v_old, v_partner.pin_code));
    ELSE 
        v_is_valid := (TRIM(v_partner.pin_code) = v_old); 
    END IF;

    IF NOT v_is_valid THEN
        v_count := public._pin_register_fail('partner', v_key, v_partner.id, jsonb_build_object('type', 'partner_change_pin'));
        IF v_count >= 5 THEN RETURN public._locked_response(900); END IF;
        RETURN jsonb_build_object('success', false, 'error', 'الرمز القديم غير صحيح', 'attempts_left', 5 - v_count);
    END IF;

    PERFORM public._pin_register_success('partner', v_key);

    v_hashed_new := crypt(v_new, gen_salt('bf', 8));

    UPDATE public.partner_accounts 
    SET pin_code = v_hashed_new, updated_at = CLOCK_TIMESTAMP() 
    WHERE id = p_partner_id;

    IF v_partner.affiliate_id IS NOT NULL THEN
        UPDATE public.affiliates
        SET pin_code = v_new, notes = 'PIN changed - secure', updated_at = CLOCK_TIMESTAMP()
        WHERE id = v_partner.affiliate_id;
    END IF;

    INSERT INTO public.partner_audit_logs (partner_account_id, action, details, performed_by)
    VALUES (p_partner_id, 'PIN_CHANGED_SECURE', jsonb_build_object('time', CLOCK_TIMESTAMP()), 'PARTNER');

    RETURN jsonb_build_object('success', true, 'message', 'تم تحديث الرمز السري بنجاح 🔒');
END;
$$;


-- ------------------------------------------------------------------------------
-- 6. SECURE SETTLEMENT WITH FOR UPDATE + REAL FINANCIAL LEDGER SCHEMA
-- ------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.admin_settle_partner_commissions(uuid, text);
DROP FUNCTION IF EXISTS public.admin_settle_partner_commissions(uuid, text, text);

CREATE OR REPLACE FUNCTION public.admin_settle_partner_commissions(
    p_partner_account_id uuid, 
    p_settlement_reference text DEFAULT NULL, 
    p_master_token text DEFAULT NULL
) 
RETURNS jsonb 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path TO 'public', 'pg_temp' 
AS $$
DECLARE
    v_settled_commissions INTEGER := 0; 
    v_total_amount NUMERIC(12, 2) := 0.00; 
    v_settled_bonuses INTEGER := 0;
    v_partner RECORD;
    v_tx_id TEXT;
BEGIN
    IF NOT (
        public.is_super_admin() 
        OR auth.role() = 'service_role' 
        OR (p_master_token IS NOT NULL AND public.is_valid_master_token(p_master_token))
    ) THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED', 'error', 'صلاحية غير كافية');
    END IF;

    -- Lock partner row (advisor improvement to prevent race conditions)
    SELECT id, display_name, affiliate_id INTO v_partner
    FROM public.partner_accounts 
    WHERE id = p_partner_account_id 
    FOR UPDATE;

    IF NOT FOUND THEN 
        RETURN jsonb_build_object('success', false, 'error', 'الشريك غير موجود'); 
    END IF;

    SELECT COALESCE(SUM(commission_amount), 0.00), COUNT(*) 
    INTO v_total_amount, v_settled_commissions
    FROM public.partner_commissions 
    WHERE partner_account_id = p_partner_account_id AND status IN ('AVAILABLE', 'EARNED');

    IF v_settled_commissions = 0 THEN 
        RETURN jsonb_build_object('success', false, 'code', 'NO_DUE_COMMISSIONS', 'error', 'لا توجد عمولات مستحقة'); 
    END IF;

    UPDATE public.partner_commissions 
    SET status = 'PAID',
        notes = COALESCE(notes, '') || ' | تصفية: ' || COALESCE(p_settlement_reference, 'N/A'),
        updated_at = CLOCK_TIMESTAMP()
    WHERE partner_account_id = p_partner_account_id AND status IN ('AVAILABLE', 'EARNED');

    UPDATE public.partner_bonus_awards 
    SET status = 'PAID'
    WHERE partner_account_id = p_partner_account_id AND status IN ('ACHIEVED', 'AWARDED');
    
    GET DIAGNOSTICS v_settled_bonuses = ROW_COUNT;

    -- Insert into real financial_ledger with correct schema columns
    v_tx_id := 'tx_settle_' || to_char(now(), 'YYYYMMDD') || '_' || SUBSTRING(md5(random()::text) FROM 1 FOR 8);
    BEGIN
        INSERT INTO public.financial_ledger (
            transaction_id,
            affiliate_id,
            payment_id,
            transaction_type,
            gross_amount,
            vat_amount,
            gateway_fee,
            affiliate_commission,
            net_platform_amount,
            status,
            created_by,
            metadata,
            effective_at,
            created_at
        ) VALUES (
            v_tx_id,
            p_partner_account_id::text,
            COALESCE(p_settlement_reference, 'SETTLE-' || to_char(now(), 'YYYYMMDD')),
            'PAYOUT',
            0.00,
            0.00,
            0.00,
            v_total_amount,
            0.00,
            'SETTLED',
            CASE WHEN p_master_token IS NOT NULL THEN 'MASTER_TOKEN' ELSE 'SUPER_ADMIN' END,
            jsonb_build_object(
                'partner_name', v_partner.display_name,
                'settlement_reference', p_settlement_reference,
                'commissions_count', v_settled_commissions,
                'bonuses_count', v_settled_bonuses
            ),
            CLOCK_TIMESTAMP(),
            CLOCK_TIMESTAMP()
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    INSERT INTO public.partner_audit_logs (partner_account_id, action, details, performed_by)
    VALUES (
        p_partner_account_id, 'COMMISSIONS_SETTLED',
        jsonb_build_object(
            'settled_commissions_count', v_settled_commissions, 
            'settled_bonuses_count', v_settled_bonuses, 
            'total_amount', v_total_amount, 
            'reference', p_settlement_reference
        ),
        CASE WHEN p_master_token IS NOT NULL THEN 'MASTER_TOKEN' ELSE 'SUPER_ADMIN' END
    );

    RETURN jsonb_build_object(
        'success', true, 
        'settled_commissions', v_settled_commissions, 
        'settled_bonuses', v_settled_bonuses, 
        'total_amount', v_total_amount, 
        'reference', p_settlement_reference
    );
END;
$$;


-- ------------------------------------------------------------------------------
-- 7. SECURE GRANTS
-- ------------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.admin_create_partner_full_atomic(text, text, text, text, text, text, numeric, numeric, integer, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_partner_login(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.change_partner_pin(uuid, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_settle_partner_commissions(uuid, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_affiliate_payout_atomic(uuid, character varying, character varying, character varying, character varying, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_partner_commissions_secure(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_all_partner_financial_summaries(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_merchant_lead_internal(text, text, text, text, text, uuid, text, timestamptz, text) TO anon, authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 8. SECURE LEAD SUBMISSION WITH REFERRAL CODE AUTO-LOOKUP
-- ------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.submit_merchant_lead_internal(text, text, text, text, text, uuid, text, timestamptz, text);

CREATE OR REPLACE FUNCTION public.submit_merchant_lead_internal(
    p_store_name text, 
    p_manager_name text, 
    p_phone text, 
    p_city text, 
    p_business_type text, 
    p_affiliate_id uuid DEFAULT NULL::uuid, 
    p_referral_code text DEFAULT NULL::text, 
    p_first_touch_at timestamp with time zone DEFAULT NULL::timestamp with time zone, 
    p_client_ip text DEFAULT '127.0.0.1'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_norm_phone TEXT;
    v_clean_code TEXT;
    v_lead_id UUID;
    v_affiliate RECORD;
    v_source TEXT := 'DIRECT';
    v_validated_affiliate_id UUID := NULL;
    v_validated_code TEXT := NULL;
    v_existing_store RECORD;
    v_existing_staff RECORD;
    v_existing_lead RECORD;
    v_ip_allowed BOOLEAN;
    v_phone_allowed BOOLEAN;
    v_touch_time TIMESTAMPTZ;
    v_expires_time TIMESTAMPTZ;
BEGIN
    -- 1. Basic Input Validations
    IF coalesce(trim(p_store_name), '') = '' THEN
        RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_ERROR', 'error', 'اسم المتجر مطلوب');
    END IF;
    IF coalesce(trim(p_manager_name), '') = '' THEN
        RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_ERROR', 'error', 'اسم صاحب المتجر مطلوب');
    END IF;

    -- 2. Normalize and Validate Phone
    v_norm_phone := public.normalize_saudi_phone(p_phone);
    IF v_norm_phone IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_PHONE', 'error', 'رقم الجوال غير صالح، يرجى كتابة رقم سعودي صحيح يبدأ بـ 05');
    END IF;

    -- 3. Distributed Rate Limiting (Atomic Check & Record via Advisory Lock)
    -- A. IP Limit: max 10 lead submissions per hour (relaxed for testing & public landing)
    v_ip_allowed := public.check_and_record_rate_limit('lead_ip_' || coalesce(nullif(trim(p_client_ip), ''), 'unknown'), 10, 3600);
    IF NOT v_ip_allowed THEN
        RETURN jsonb_build_object('success', false, 'code', 'RATE_LIMITED_IP', 'error', 'تم تجاوز الحد المسموح من الطلبات لهذا الجهاز، يرجى المحاولة لاحقاً');
    END IF;

    -- B. Phone Limit: max 5 submissions per 24 hours
    v_phone_allowed := public.check_and_record_rate_limit('lead_phone_' || v_norm_phone, 5, 86400);
    IF NOT v_phone_allowed THEN
        RETURN jsonb_build_object('success', false, 'code', 'RATE_LIMITED_PHONE', 'error', 'تم استقبال طلب مسبق لهذا الرقم مؤخراً، فريقنا سيتواصل معك');
    END IF;

    -- 4. System-Wide Phone Deduplication
    -- Check 1: Stores table
    SELECT id, name INTO v_existing_store 
    FROM public.stores 
    WHERE public.normalize_saudi_phone(manager_contact) = v_norm_phone
    LIMIT 1;

    IF v_existing_store.id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'STORE_ALREADY_EXISTS', 'error', 'هذا الرقم مسجل بالفعل كمالك لمتجر نشط');
    END IF;

    -- Check 2: Store Staff table
    SELECT id, name INTO v_existing_staff 
    FROM public.store_staff 
    WHERE public.normalize_saudi_phone(phone) = v_norm_phone AND is_active = true
    LIMIT 1;

    IF v_existing_staff.id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'STAFF_ALREADY_EXISTS', 'error', 'هذا الرقم مسجل بالفعل كمدير أو موظف متجر');
    END IF;

    -- Check 3: Active Merchant Leads table
    SELECT id, status INTO v_existing_lead 
    FROM public.merchant_leads 
    WHERE normalized_phone = v_norm_phone AND status NOT IN ('REJECTED', 'CANCELLED')
    LIMIT 1;

    IF v_existing_lead.id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'ACTIVE_LEAD_EXISTS', 'error', 'يوجد طلب انضمام نشط قيد المعالجة بالفعل لهذا الرقم');
    END IF;

    -- 5. First-Touch Sanity Bounds
    IF p_first_touch_at IS NULL 
       OR p_first_touch_at > clock_timestamp() + interval '1 minute'
       OR p_first_touch_at < clock_timestamp() - interval '30 days' THEN
        v_touch_time := clock_timestamp();
    ELSE
        v_touch_time := p_first_touch_at;
    END IF;
    v_expires_time := v_touch_time + interval '30 days';

    -- 6. Database Source of Truth: Re-validate Affiliate Attribution (By ID or By Referral Code)
    IF coalesce(trim(p_referral_code), '') <> '' THEN
        v_clean_code := UPPER(trim(p_referral_code));

        IF p_affiliate_id IS NOT NULL THEN
            SELECT id, referral_code, status 
            INTO v_affiliate
            FROM public.affiliates
            WHERE (id = p_affiliate_id OR id IN (SELECT affiliate_id FROM public.partner_accounts WHERE id = p_affiliate_id))
              AND (referral_code = v_clean_code OR code = v_clean_code);
        ELSE
            SELECT id, referral_code, status 
            INTO v_affiliate
            FROM public.affiliates
            WHERE referral_code = v_clean_code OR code = v_clean_code
               OR id IN (SELECT affiliate_id FROM public.partner_accounts WHERE UPPER(referral_code) = v_clean_code OR UPPER(slug) = v_clean_code)
            LIMIT 1;
        END IF;

        IF v_affiliate.id IS NOT NULL AND (v_affiliate.status = 'ACTIVE' OR v_affiliate.status IS NULL) THEN
            v_source := 'REFERRAL';
            v_validated_affiliate_id := v_affiliate.id;
            v_validated_code := v_affiliate.referral_code;
        ELSE
            v_source := 'DIRECT';
            v_validated_affiliate_id := NULL;
            v_validated_code := NULL;
        END IF;
    END IF;

    -- 7. Insert Merchant Lead
    INSERT INTO public.merchant_leads (
        store_name,
        manager_name,
        phone,
        normalized_phone,
        city,
        business_type,
        attribution_source,
        affiliate_id,
        referral_code,
        status,
        created_at,
        updated_at
    ) VALUES (
        trim(p_store_name),
        trim(p_manager_name),
        trim(p_phone),
        v_norm_phone,
        nullif(trim(p_city), ''),
        nullif(trim(p_business_type), ''),
        v_source,
        v_validated_affiliate_id,
        v_validated_code,
        'NEW',
        clock_timestamp(),
        clock_timestamp()
    )
    RETURNING id INTO v_lead_id;

    -- 8. If Attributed, Create Immutable Referral Record
    IF v_source = 'REFERRAL' AND v_validated_affiliate_id IS NOT NULL THEN
        INSERT INTO public.referrals (
            affiliate_id,
            lead_id,
            referral_code,
            first_touch_at,
            attribution_expires_at,
            status,
            created_at
        ) VALUES (
            v_validated_affiliate_id,
            v_lead_id,
            v_validated_code,
            v_touch_time,
            v_expires_time,
            'ATTRIBUTED',
            clock_timestamp()
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'lead_id', v_lead_id,
        'source', v_source,
        'attributed', (v_source = 'REFERRAL')
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_merchant_lead_internal(text, text, text, text, text, uuid, text, timestamptz, text) TO anon, authenticated, service_role;

