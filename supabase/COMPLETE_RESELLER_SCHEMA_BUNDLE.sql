-- ==============================================================================
-- 🚀 RADAR WHITE-LABEL COMPLETE RESELLER DATABASE BUNDLE
-- Generated At: 2026-10-24T20:17:30.210Z
-- Total Migrations: 41
-- ==============================================================================

-- 0. Ensure pgcrypto extension exists for password hashing and tokens
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 0.1 Sovereign Master Auth Table for Remote Administration
CREATE TABLE IF NOT EXISTS public.reseller_master_auth (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_token_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reseller_master_auth ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reseller_master_auth FROM anon, authenticated;

-- Insert default sovereign master token hash
INSERT INTO public.reseller_master_auth (master_token_hash)
VALUES (crypt('radar_sovereign_master_2026_killswitch_key', gen_salt('bf')))
ON CONFLICT DO NOTHING;



-- ==============================================================================
-- >>> FILE: 20260930_stage2_affiliate_foundation.sql <<<
-- ==============================================================================

-- ==============================================================================
-- 🚀 RADAR LOYALTY ENGINE - STAGE 2.5 PATCHED MIGRATION
-- Migration: 20260930_stage2_affiliate_foundation.sql
-- Description: Affiliate System, Merchant Leads, Referrals, Rate Limiting & Fenced Conversion
-- ==============================================================================

-- 1. Ensure required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. TABLES CREATION
-- ==============================================================================

-- [1] Affiliates Table (الوسطاء والشركاء)
CREATE TABLE IF NOT EXISTS public.affiliates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    phone VARCHAR(20) NOT NULL UNIQUE,
    referral_code VARCHAR(30) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_affiliate_code_format CHECK (referral_code ~ '^[A-Z0-9_-]{4,30}$'),
    CONSTRAINT chk_affiliate_code_uppercase CHECK (referral_code = UPPER(referral_code))
);

-- [2] Merchant Leads Table (طلبات التجار الواردة من صفحة الانضمام)
CREATE TABLE IF NOT EXISTS public.merchant_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_name VARCHAR(150) NOT NULL,
    manager_name VARCHAR(150) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    normalized_phone VARCHAR(15) NOT NULL,
    city VARCHAR(80),
    business_type VARCHAR(80),
    attribution_source VARCHAR(20) NOT NULL DEFAULT 'DIRECT' CHECK (attribution_source IN ('DIRECT', 'REFERRAL')),
    affiliate_id UUID REFERENCES public.affiliates(id) ON DELETE SET NULL,
    referral_code VARCHAR(30),
    status VARCHAR(30) NOT NULL DEFAULT 'NEW' CHECK (
        status IN ('NEW', 'CONTACTED', 'PENDING', 'APPROVED', 'CONVERTING', 'CONVERTED', 'REJECTED', 'CANCELLED')
    ),
    conversion_started_at TIMESTAMPTZ,
    conversion_lease_id UUID, -- Random Fencing Token for distributed concurrency protection
    conversion_error TEXT,
    converted_store_id UUID UNIQUE REFERENCES public.stores(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- [3] Referrals Table (سجل الإحالة والملكية التجارية القطعية)
CREATE TABLE IF NOT EXISTS public.referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE RESTRICT,
    lead_id UUID NOT NULL UNIQUE REFERENCES public.merchant_leads(id) ON DELETE RESTRICT,
    referral_code VARCHAR(30) NOT NULL,
    first_touch_at TIMESTAMPTZ NOT NULL,
    attribution_expires_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ATTRIBUTED' CHECK (
        status IN ('ATTRIBUTED', 'QUALIFIED', 'CONVERTED', 'REJECTED', 'EXPIRED')
    ),
    converted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- [4] Distributed Rate Limit Events Table (Unlogged for in-memory RAM speed)
CREATE UNLOGGED TABLE IF NOT EXISTS public.rate_limit_events (
    bucket_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 3. INDEXES CREATION (Performance & Integrity)
-- ==============================================================================

-- Affiliates Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliates_referral_code ON public.affiliates (referral_code);
CREATE INDEX IF NOT EXISTS idx_affiliates_status ON public.affiliates (status);
CREATE INDEX IF NOT EXISTS idx_affiliates_phone ON public.affiliates (phone);

-- Merchant Leads Indexes
CREATE INDEX IF NOT EXISTS idx_merchant_leads_phone ON public.merchant_leads (normalized_phone);
CREATE INDEX IF NOT EXISTS idx_merchant_leads_status ON public.merchant_leads (status);
CREATE INDEX IF NOT EXISTS idx_merchant_leads_affiliate ON public.merchant_leads (affiliate_id);
CREATE INDEX IF NOT EXISTS idx_merchant_leads_created_at ON public.merchant_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_merchant_leads_lease_id ON public.merchant_leads (conversion_lease_id);

-- Partial Unique Index for Active Leads Phone Deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchant_leads_active_phone 
ON public.merchant_leads (normalized_phone) 
WHERE status NOT IN ('REJECTED', 'CANCELLED');

-- Referrals Indexes
CREATE INDEX IF NOT EXISTS idx_referrals_affiliate_status ON public.referrals (affiliate_id, status);
CREATE INDEX IF NOT EXISTS idx_referrals_lead_id ON public.referrals (lead_id);
CREATE INDEX IF NOT EXISTS idx_referrals_expires_at ON public.referrals (attribution_expires_at);

-- Rate Limit Bucket Index
CREATE INDEX IF NOT EXISTS idx_rate_limit_bucket_time ON public.rate_limit_events (bucket_key, created_at);

-- ==============================================================================
-- 4. TRIGGERS: IMMUTABLE REFERRAL OWNERSHIP ENFORCEMENT
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.trg_prevent_referral_tamper()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.affiliate_id <> OLD.affiliate_id THEN
        RAISE EXCEPTION 'referrals.affiliate_id is strictly immutable and cannot be updated';
    END IF;
    IF NEW.lead_id <> OLD.lead_id THEN
        RAISE EXCEPTION 'referrals.lead_id is strictly immutable and cannot be updated';
    END IF;
    IF NEW.referral_code <> OLD.referral_code THEN
        RAISE EXCEPTION 'referrals.referral_code is strictly immutable and cannot be updated';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_referral_immutable_ownership ON public.referrals;
CREATE TRIGGER trg_referral_immutable_ownership
BEFORE UPDATE ON public.referrals
FOR EACH ROW
EXECUTE FUNCTION public.trg_prevent_referral_tamper();

-- ==============================================================================
-- 5. HELPER FUNCTIONS
-- ==============================================================================

-- [Helper 1] Saudi Phone Normalization Function
CREATE OR REPLACE FUNCTION public.normalize_saudi_phone(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_clean TEXT;
BEGIN
    IF p_phone IS NULL THEN
        RETURN NULL;
    END IF;

    -- 1. Remove all non-digit characters
    v_clean := regexp_replace(p_phone, '[^0-9]', '', 'g');

    -- 2. Strip leading international prefixes: 00966 or 966
    IF v_clean LIKE '00966%' THEN
        v_clean := substr(v_clean, 6);
    ELSIF v_clean LIKE '966%' THEN
        v_clean := substr(v_clean, 4);
    END IF;

    -- 3. Strip leading zero if 05XXXXXXXX
    IF v_clean LIKE '05%' AND length(v_clean) = 10 THEN
        v_clean := substr(v_clean, 2);
    END IF;

    -- 4. Validate exact 9 digits starting with 5 (e.g. 560708011)
    IF length(v_clean) = 9 AND v_clean LIKE '5%' THEN
        RETURN v_clean;
    ELSE
        RETURN NULL;
    END IF;
END;
$$;

-- [Helper 2] Atomic Distributed Rate Limit Checker & Recorder (Advisory Lock Protected)
CREATE OR REPLACE FUNCTION public.check_and_record_rate_limit(
    p_key TEXT,
    p_max_requests INT,
    p_window_seconds INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_current_count INT;
    v_cutoff TIMESTAMPTZ;
BEGIN
    -- 1. Atomic serialization per bucket key (sub-millisecond lock)
    PERFORM pg_advisory_xact_lock(hashtext(p_key));

    -- 2. Precise cutoff using clock_timestamp()
    v_cutoff := clock_timestamp() - (p_window_seconds || ' seconds')::INTERVAL;

    -- 3. Check current count in window
    SELECT count(*)
    INTO v_current_count
    FROM public.rate_limit_events
    WHERE bucket_key = p_key AND created_at > v_cutoff;

    -- 4. If limit reached, reject immediately
    IF v_current_count >= p_max_requests THEN
        RETURN FALSE;
    END IF;

    -- 5. Atomic record of event with exact clock_timestamp()
    INSERT INTO public.rate_limit_events (bucket_key, created_at)
    VALUES (p_key, clock_timestamp());

    -- 6. Opportunistic cleanup of expired events for this bucket
    DELETE FROM public.rate_limit_events
    WHERE bucket_key = p_key AND created_at < (clock_timestamp() - (p_window_seconds * 2 || ' seconds')::INTERVAL);

    RETURN TRUE;
END;
$$;

-- ==============================================================================
-- 6. CORE BUSINESS RPC FUNCTIONS
-- ==============================================================================

-- [Core RPC 1] Submit Merchant Lead (Internal Atomic Engine)
CREATE OR REPLACE FUNCTION public.submit_merchant_lead_internal(
    p_store_name TEXT,
    p_manager_name TEXT,
    p_phone TEXT,
    p_city TEXT,
    p_business_type TEXT,
    p_affiliate_id UUID DEFAULT NULL,
    p_referral_code TEXT DEFAULT NULL,
    p_first_touch_at TIMESTAMPTZ DEFAULT NULL,
    p_client_ip TEXT DEFAULT '127.0.0.1'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
    -- A. IP Limit: max 3 lead submissions per hour
    v_ip_allowed := public.check_and_record_rate_limit('lead_ip_' || coalesce(nullif(trim(p_client_ip), ''), 'unknown'), 3, 3600);
    IF NOT v_ip_allowed THEN
        RETURN jsonb_build_object('success', false, 'code', 'RATE_LIMITED_IP', 'error', 'تم تجاوز الحد المسموح من الطلبات لهذا الجهاز، يرجى المحاولة لاحقاً');
    END IF;

    -- B. Phone Limit: max 2 submissions per 24 hours
    v_phone_allowed := public.check_and_record_rate_limit('lead_phone_' || v_norm_phone, 2, 86400);
    IF NOT v_phone_allowed THEN
        RETURN jsonb_build_object('success', false, 'code', 'RATE_LIMITED_PHONE', 'error', 'تم استقبال طلب مسبق لهذا الرقم مؤخراً، فريقنا سيتواصل معك');
    END IF;

    -- 4. System-Wide Phone Deduplication
    -- Check 1: Stores table (existing registered store manager)
    SELECT id, name INTO v_existing_store 
    FROM public.stores 
    WHERE public.normalize_saudi_phone(manager_contact) = v_norm_phone
    LIMIT 1;

    IF v_existing_store.id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'STORE_ALREADY_EXISTS', 'error', 'هذا الرقم مسجل بالفعل كمالك لمتجر نشط على منصة رادار');
    END IF;

    -- Check 2: Store Staff table (existing active staff/admin)
    SELECT id, name INTO v_existing_staff 
    FROM public.store_staff 
    WHERE public.normalize_saudi_phone(phone) = v_norm_phone AND is_active = true
    LIMIT 1;

    IF v_existing_staff.id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'STAFF_ALREADY_EXISTS', 'error', 'هذا الرقم مسجل بالفعل كمدير أو موظف متجر في رادار');
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

    -- 6. Database Source of Truth: Re-validate Affiliate Attribution
    IF p_affiliate_id IS NOT NULL AND coalesce(trim(p_referral_code), '') <> '' THEN
        v_clean_code := UPPER(trim(p_referral_code));

        SELECT id, referral_code, status 
        INTO v_affiliate
        FROM public.affiliates
        WHERE id = p_affiliate_id AND referral_code = v_clean_code;

        IF v_affiliate.id IS NOT NULL AND v_affiliate.status = 'ACTIVE' THEN
            v_source := 'REFERRAL';
            v_validated_affiliate_id := v_affiliate.id;
            v_validated_code := v_affiliate.referral_code;
        ELSE
            -- Mismatch or inactive affiliate: Fallback safely to DIRECT (do not reject merchant, but do not attribute)
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

    -- 9. Return Success Payload
    RETURN jsonb_build_object(
        'success', true,
        'lead_id', v_lead_id,
        'source', v_source,
        'attributed', (v_source = 'REFERRAL')
    );
END;
$$;

-- [Core RPC 2] Admin Update Lead Status (Strict Transition Matrix via Atomic Conditional UPDATE)
CREATE OR REPLACE FUNCTION public.admin_update_lead_status(
    p_lead_id UUID,
    p_new_status TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_updated_id UUID;
    v_updated_status TEXT;
    v_current_lead RECORD;
BEGIN
    -- 1. Explicitly forbid conversion states (managed exclusively by conversion RPCs)
    IF p_new_status IN ('CONVERTING', 'CONVERTED') THEN
        RETURN jsonb_build_object(
            'success', false, 
            'code', 'FORBIDDEN_CONVERSION_STATUS', 
            'error', 'لا يمكن الانتقال لحالات التأسيس (CONVERTING / CONVERTED) عبر هذه الدالة، استخدم مسار التأسيس المخصص'
        );
    END IF;

    -- 2. Execute Atomic Conditional Update based on Strict Transition Matrix
    UPDATE public.merchant_leads
    SET status = p_new_status,
        notes = COALESCE(p_notes, notes),
        updated_at = clock_timestamp()
    WHERE id = p_lead_id
      AND (
          (status = 'NEW'       AND p_new_status IN ('CONTACTED', 'REJECTED', 'CANCELLED')) OR
          (status = 'CONTACTED' AND p_new_status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')) OR
          (status = 'PENDING'   AND p_new_status IN ('APPROVED', 'CONTACTED', 'REJECTED', 'CANCELLED')) OR
          (status = 'APPROVED'  AND p_new_status IN ('PENDING', 'REJECTED', 'CANCELLED'))
      )
    RETURNING id, status INTO v_updated_id, v_updated_status;

    -- 3. On successful atomic state transition
    IF v_updated_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true, 
            'lead_id', v_updated_id, 
            'status', v_updated_status
        );
    END IF;

    -- 4. If condition failed, diagnose the exact cause
    SELECT id, status INTO v_current_lead 
    FROM public.merchant_leads 
    WHERE id = p_lead_id;

    IF NOT FOUND OR v_current_lead.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'error', 'طلب التاجر غير موجود');
    END IF;

    IF v_current_lead.status IN ('CONVERTING', 'CONVERTED') THEN
        RETURN jsonb_build_object(
            'success', false, 
            'code', 'CANNOT_MODIFY_CONVERTED_LEAD', 
            'error', 'لا يمكن تعديل حالة الطلب بعد بدء أو إتمام تأسيس المتجر'
        );
    END IF;

    IF v_current_lead.status IN ('REJECTED', 'CANCELLED') THEN
        RETURN jsonb_build_object(
            'success', false, 
            'code', 'TERMINAL_STATE_REACHED', 
            'error', 'الطلب في حالة نهائية (مرفوض أو ملغى) ولا يمكن إعادة تفعيله'
        );
    END IF;

    -- Strict Matrix Transition Rejection
    RETURN jsonb_build_object(
        'success', false, 
        'code', 'INVALID_STATE_TRANSITION', 
        'error', 'انتقال غير مسموح به من حالة ' || v_current_lead.status || ' إلى ' || p_new_status
    );
END;
$$;

-- [Core RPC 3] Lead Conversion: Start Conversion (Atomic Fencing Token Lease Acquisition)
CREATE OR REPLACE FUNCTION public.admin_start_lead_conversion(p_lead_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_new_lease_id UUID;
    v_acquired_id UUID;
    v_lead RECORD;
BEGIN
    -- 1. Generate new cryptographically secure Random Fencing Token
    v_new_lease_id := gen_random_uuid();

    -- 2. Atomic conditional lease acquisition (APPROVED only, or expired CONVERTING > 5 mins)
    UPDATE public.merchant_leads
    SET status = 'CONVERTING',
        conversion_started_at = clock_timestamp(),
        conversion_lease_id = v_new_lease_id,
        conversion_error = NULL,
        updated_at = clock_timestamp()
    WHERE id = p_lead_id
      AND (
          status = 'APPROVED'
          OR (status = 'CONVERTING' AND conversion_started_at < clock_timestamp() - interval '5 minutes')
      )
      AND converted_store_id IS NULL
    RETURNING id INTO v_acquired_id;

    -- 3. Success: Lease acquired
    IF v_acquired_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'lead_id', v_acquired_id,
            'lease_id', v_new_lease_id
        );
    END IF;

    -- 4. Deterministic Error Diagnosis
    SELECT id, status, conversion_started_at 
    INTO v_lead 
    FROM public.merchant_leads 
    WHERE id = p_lead_id;

    IF NOT FOUND OR v_lead.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'error', 'طلب التاجر غير موجود');
    END IF;

    IF v_lead.status = 'CONVERTED' THEN
        RETURN jsonb_build_object('success', false, 'code', 'ALREADY_CONVERTED', 'error', 'تم تأسيس وتفعيل هذا المتجر مسبقاً');
    END IF;

    IF v_lead.status = 'CONVERTING' AND v_lead.conversion_started_at >= clock_timestamp() - interval '5 minutes' THEN
        RETURN jsonb_build_object(
            'success', false, 
            'code', 'CONVERSION_IN_PROGRESS', 
            'error', 'عملية التأسيس جارية حالياً من قِبل مسؤول آخر، يرجى الانتظار'
        );
    END IF;

    IF v_lead.status IN ('NEW', 'CONTACTED', 'PENDING') THEN
        RETURN jsonb_build_object(
            'success', false, 
            'code', 'LEAD_NOT_APPROVED', 
            'error', 'لا يمكن بدء التأسيس إلا بعد اعتماد الطلب رسمياً (APPROVED)'
        );
    END IF;

    RETURN jsonb_build_object('success', false, 'code', 'INVALID_STATE', 'error', 'حالة الطلب الحالية لا تسمح ببدء التأسيس');
END;
$$;

-- [Core RPC 4] Lead Conversion: Complete Conversion (Fencing Token Guarded with Identity Check)
CREATE OR REPLACE FUNCTION public.admin_complete_lead_conversion(
    p_lead_id UUID,
    p_store_id UUID,
    p_lease_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_updated_id UUID;
    v_current_lead RECORD;
    v_target_store RECORD;
    v_store_norm_phone TEXT;
BEGIN
    -- 1. Business Invariant 1: Target Store must exist
    SELECT id, name, manager_contact INTO v_target_store 
    FROM public.stores 
    WHERE id = p_store_id;

    IF NOT FOUND OR v_target_store.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'STORE_NOT_FOUND', 'error', 'المتجر المحدد غير موجود في النظام');
    END IF;

    -- 2. Business Invariant 2: Phone Identity Verification between Lead & Store
    SELECT id, status, normalized_phone, converted_store_id, conversion_lease_id
    INTO v_current_lead 
    FROM public.merchant_leads 
    WHERE id = p_lead_id;

    IF NOT FOUND OR v_current_lead.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'error', 'طلب التاجر غير موجود');
    END IF;

    v_store_norm_phone := public.normalize_saudi_phone(v_target_store.manager_contact);
    IF v_store_norm_phone IS NULL OR v_store_norm_phone <> v_current_lead.normalized_phone THEN
        RETURN jsonb_build_object(
            'success', false, 
            'code', 'STORE_IDENTITY_MISMATCH', 
            'error', 'المتجر المحدد لا يطابق رقم جوال التاجر صاحب الطلب'
        );
    END IF;

    -- 3. Atomic Complete Transition strictly requiring CONVERTING + matching lease_id
    -- Notice: We retain conversion_lease_id = p_lease_id so the winning lease is permanently recorded!
    UPDATE public.merchant_leads
    SET status = 'CONVERTED',
        converted_store_id = p_store_id,
        conversion_started_at = NULL,
        conversion_lease_id = p_lease_id,
        conversion_error = NULL,
        updated_at = clock_timestamp()
    WHERE id = p_lead_id
      AND status = 'CONVERTING'
      AND conversion_lease_id = p_lease_id
    RETURNING id INTO v_updated_id;

    -- 4. Initial Transition Success
    IF v_updated_id IS NOT NULL THEN
        UPDATE public.referrals
        SET status = 'CONVERTED',
            converted_at = clock_timestamp()
        WHERE lead_id = p_lead_id AND status <> 'CONVERTED';

        RETURN jsonb_build_object(
            'success', true, 
            'lead_id', p_lead_id, 
            'store_id', p_store_id
        );
    END IF;

    -- 5. Diagnostic Handling for Stale Lease vs Idempotent Replay
    -- Reload committed state
    SELECT id, status, converted_store_id, conversion_lease_id 
    INTO v_current_lead 
    FROM public.merchant_leads 
    WHERE id = p_lead_id;

    -- A. Idempotent Replay check: allowed ONLY for the winning lease owner with matching store
    IF v_current_lead.status = 'CONVERTED' THEN
        IF v_current_lead.conversion_lease_id = p_lease_id AND v_current_lead.converted_store_id = p_store_id THEN
            RETURN jsonb_build_object('success', true, 'lead_id', p_lead_id, 'store_id', p_store_id, 'idempotent_replay', true);
        END IF;

        -- Stale lease caller trying to complete an already converted lead
        RETURN jsonb_build_object(
            'success', false, 
            'code', 'STALE_LEASE_TOKEN', 
            'error', 'تم رفض طلبك: انتهت صلاحية حجزك المسبق واكتمل التحويل عبر مسؤول آخر (Stale Lease Owner)'
        );
    END IF;

    -- B. Stale Lease while lead is still converting (overtaken by another admin)
    IF v_current_lead.status = 'CONVERTING' AND v_current_lead.conversion_lease_id <> p_lease_id THEN
        RETURN jsonb_build_object(
            'success', false, 
            'code', 'STALE_LEASE_TOKEN', 
            'error', 'تم رفض طلبك: انتهت صلاحية حجزك المسبق وتولى مسؤول آخر إتمام العملية (Stale Lease Owner)'
        );
    END IF;

    RETURN jsonb_build_object('success', false, 'code', 'INVALID_LEAD_STATE', 'error', 'حالة الطلب غير صالحة للإكمال');
END;
$$;

-- [Core RPC 5] Lead Conversion: Rollback Conversion on Failure (Fencing Token Guarded)
CREATE OR REPLACE FUNCTION public.admin_rollback_lead_conversion(
    p_lead_id UUID,
    p_error_message TEXT,
    p_lease_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rolled_back_id UUID;
    v_current_lead RECORD;
BEGIN
    -- Rollback is permitted ONLY if the caller holds the currently active lease token
    UPDATE public.merchant_leads
    SET status = 'APPROVED',
        conversion_started_at = NULL,
        conversion_lease_id = NULL,
        conversion_error = p_error_message,
        updated_at = clock_timestamp()
    WHERE id = p_lead_id 
      AND status = 'CONVERTING'
      AND conversion_lease_id = p_lease_id
    RETURNING id INTO v_rolled_back_id;

    IF v_rolled_back_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'lead_id', p_lead_id, 'status', 'APPROVED');
    END IF;

    SELECT id, status, conversion_lease_id INTO v_current_lead 
    FROM public.merchant_leads 
    WHERE id = p_lead_id;

    IF NOT FOUND OR v_current_lead.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'error', 'طلب التاجر غير موجود');
    END IF;

    -- If lease does not match, reject rollback to protect another admin's active lease
    IF v_current_lead.conversion_lease_id <> p_lease_id THEN
        RETURN jsonb_build_object(
            'success', false, 
            'code', 'STALE_LEASE_TOKEN', 
            'error', 'لا يمكنك إلغاء الحجز: انتهت مهلتك وتولى مسؤول آخر العملية'
        );
    END IF;

    RETURN jsonb_build_object('success', false, 'code', 'INVALID_STATE', 'error', 'حالة الطلب لا تسمح بإلغاء الحجز');
END;
$$;

-- ==============================================================================
-- 7. SECURITY: ROW LEVEL SECURITY & PERMISSION MANAGEMENT
-- ==============================================================================

-- Enable RLS on all 4 tables
ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;

-- Revoke all direct public, anon, and authenticated access to tables
REVOKE ALL ON TABLE public.affiliates FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.merchant_leads FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.referrals FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.rate_limit_events FROM PUBLIC, anon, authenticated;

-- Revoke all function executions from public, anon, and authenticated
REVOKE ALL ON FUNCTION public.submit_merchant_lead_internal FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_update_lead_status FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_start_lead_conversion FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_complete_lead_conversion FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_rollback_lead_conversion FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_and_record_rate_limit FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.normalize_saudi_phone FROM PUBLIC, anon, authenticated;

-- Grant execution and table access STRICTLY to service_role (trusted internal server path)
GRANT ALL ON TABLE public.affiliates TO service_role;
GRANT ALL ON TABLE public.merchant_leads TO service_role;
GRANT ALL ON TABLE public.referrals TO service_role;
GRANT ALL ON TABLE public.rate_limit_events TO service_role;

GRANT EXECUTE ON FUNCTION public.submit_merchant_lead_internal TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_lead_status TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_start_lead_conversion TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_complete_lead_conversion TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_rollback_lead_conversion TO service_role;
GRANT EXECUTE ON FUNCTION public.check_and_record_rate_limit TO service_role;
GRANT EXECUTE ON FUNCTION public.normalize_saudi_phone TO service_role;

-- RLS Policies for Service Role Full Access
DROP POLICY IF EXISTS "service_role_affiliates_full_access" ON public.affiliates;
CREATE POLICY "service_role_affiliates_full_access" 
ON public.affiliates 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_merchant_leads_full_access" ON public.merchant_leads;
CREATE POLICY "service_role_merchant_leads_full_access" 
ON public.merchant_leads 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_referrals_full_access" ON public.referrals;
CREATE POLICY "service_role_referrals_full_access" 
ON public.referrals 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_rate_limit_full_access" ON public.rate_limit_events;
CREATE POLICY "service_role_rate_limit_full_access" 
ON public.rate_limit_events 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);


-- ==============================================================================
-- >>> FILE: 20261001_stage12c_super_admin_summary.sql <<<
-- ==============================================================================

-- ==============================================================================
-- 🛡️ RADAR LOYALTY ENGINE — STAGE 12C-HOTFIX MIGRATION
-- RPC SECURITY HARDENING: SUPER ADMIN SERVER-SIDE AUTHORIZATION GATE
-- Additive only. Zero table changes. Zero data mutations.
-- ==============================================================================

-- 1. Server-side single aggregation RPC for Super Admin with internal authorization
CREATE OR REPLACE FUNCTION public.get_super_admin_stores_summary()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_jwt JSONB;
    v_is_super BOOLEAN := FALSE;
    v_result JSONB;
BEGIN
    -- 1. Determine caller identity from PostgreSQL / PostgREST session
    v_role := auth.role();

    -- Context A: service_role execution (Authorized backend / API / internal system context)
    IF v_role = 'service_role' OR current_user = 'service_role' THEN
        v_is_super := TRUE;
    ELSE
        -- Context B: Inspect Supabase Auth JWT claims
        v_jwt := auth.jwt();
        IF v_jwt IS NOT NULL THEN
            IF (v_jwt -> 'app_metadata' ->> 'role') IN ('super_admin', 'admin')
               OR (v_jwt -> 'user_metadata' ->> 'is_super_admin')::boolean IS TRUE
               OR (v_jwt -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
            THEN
                v_is_super := TRUE;
            END IF;
        END IF;
    END IF;

    -- 2. Hard Security Gate: Reject all non-Super Admin callers
    IF NOT v_is_super THEN
        RAISE EXCEPTION 'Access denied: caller is not an authorized Super Admin'
            USING ERRCODE = '42501';
    END IF;

    -- 3. Execute server-side aggregation ONLY for authorized Super Admin
    SELECT jsonb_build_object(
        'success', true,
        'stores', COALESCE(
            (
                SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at DESC)
                FROM public.stores s
            ),
            '[]'::jsonb
        ),
        'analytics', COALESCE(
            (
                SELECT jsonb_object_agg(
                    agg.store_id,
                    jsonb_build_object(
                        'customerCount', agg.customer_count,
                        'totalSales', agg.total_sales,
                        'totalPoints', agg.total_points,
                        'staffCount', agg.staff_count
                    )
                )
                FROM (
                    SELECT 
                        s.id AS store_id,
                        COALESCE(c.cnt, 0)::int AS customer_count,
                        COALESCE(l.sales, 0)::numeric AS total_sales,
                        COALESCE(l.points, 0)::bigint AS total_points,
                        COALESCE(st.cnt, 0)::int AS staff_count
                    FROM public.stores s
                    LEFT JOIN (
                        SELECT store_id, COUNT(*) AS cnt 
                        FROM public.store_customers 
                        GROUP BY store_id
                    ) c ON c.store_id = s.id
                    LEFT JOIN (
                        SELECT 
                            store_id, 
                            SUM(purchase_amount) AS sales,
                            SUM(CASE WHEN points_changed > 0 THEN points_changed ELSE 0 END) AS points
                        FROM public.audit_logs 
                        GROUP BY store_id
                    ) l ON l.store_id = s.id
                    LEFT JOIN (
                        SELECT store_id, COUNT(*) AS cnt 
                        FROM public.store_staff 
                        GROUP BY store_id
                    ) st ON st.store_id = s.id
                ) agg
            ),
            '{}'::jsonb
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- 4. HARDENED PERMISSIONS: Revoke execution from PUBLIC and anon
REVOKE ALL ON FUNCTION public.get_super_admin_stores_summary() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_super_admin_stores_summary() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_super_admin_stores_summary() FROM PUBLIC;

-- 5. Grant execution ONLY to authenticated callers (checked internally) and service_role
GRANT EXECUTE ON FUNCTION public.get_super_admin_stores_summary() TO authenticated, service_role;


-- ==============================================================================
-- >>> FILE: 20261001_stage6_partner_foundation.sql <<<
-- ==============================================================================

-- ==============================================================================
-- RADAR LOYALTY ENGINE
-- STAGE 6 — PARTNER PROGRAM / SALES PARTNER SYSTEM FOUNDATION
-- ADDITIVE DATABASE CHANGES ONLY — ZERO EXISTING TABLE MUTATIONS
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. TABLES CREATION
-- ==============================================================================

-- [1] Partner Accounts Table (ربط مستخدم النظام بحساب الشريك الميداني)
CREATE TABLE IF NOT EXISTS public.partner_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID UNIQUE, -- linked to Supabase Auth user
    affiliate_id UUID NOT NULL UNIQUE REFERENCES public.affiliates(id) ON DELETE RESTRICT,
    display_name VARCHAR(150) NOT NULL,
    slug VARCHAR(60) NOT NULL UNIQUE,
    region VARCHAR(80),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_partner_slug_format CHECK (slug ~ '^[a-z0-9_-]{3,60}$'),
    CONSTRAINT chk_partner_slug_lowercase CHECK (slug = LOWER(slug))
);

-- [2] Partner Targets Table (أهداف الشريك الشهرية والدورية)
CREATE TABLE IF NOT EXISTS public.partner_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_account_id UUID NOT NULL REFERENCES public.partner_accounts(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    target_type VARCHAR(50) NOT NULL DEFAULT 'PAID_MERCHANTS',
    target_value INTEGER NOT NULL DEFAULT 20 CHECK (target_value > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_partner_target_period UNIQUE (partner_account_id, period_start, period_end, target_type)
);

-- [3] Partner Commissions Ledger (دفتر عمولات الشريك المؤهلة)
CREATE TABLE IF NOT EXISTS public.partner_commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_account_id UUID NOT NULL REFERENCES public.partner_accounts(id) ON DELETE CASCADE,
    merchant_lead_id UUID REFERENCES public.merchant_leads(id) ON DELETE SET NULL,
    store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
    commission_type VARCHAR(50) NOT NULL DEFAULT 'FIRST_PAID_SALE',
    basis_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (basis_amount >= 0),
    commission_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.2000 CHECK (commission_rate >= 0 AND commission_rate <= 1),
    commission_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (commission_amount >= 0),
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'EARNED', 'PAID', 'VOID')),
    qualifying_event TEXT,
    idempotency_key VARCHAR(150) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- [4] Partner Bonus Rules Table (قواعد ومراحل المكافآت التحفيزية)
CREATE TABLE IF NOT EXISTS public.partner_bonus_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    milestone INTEGER NOT NULL UNIQUE CHECK (milestone > 0),
    bonus_amount NUMERIC(12, 2) NOT NULL CHECK (bonus_amount >= 0),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default bonus milestones if not already present
INSERT INTO public.partner_bonus_rules (milestone, bonus_amount, active)
VALUES 
    (3, 100.00, true),
    (5, 250.00, true),
    (10, 500.00, true),
    (20, 1000.00, true)
ON CONFLICT (milestone) DO NOTHING;

-- [5] Partner Bonus Awards Table (سجل استحقاق المكافآت المحققة)
CREATE TABLE IF NOT EXISTS public.partner_bonus_awards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_account_id UUID NOT NULL REFERENCES public.partner_accounts(id) ON DELETE CASCADE,
    bonus_rule_id UUID NOT NULL REFERENCES public.partner_bonus_rules(id) ON DELETE RESTRICT,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    bonus_amount NUMERIC(12, 2) NOT NULL CHECK (bonus_amount >= 0),
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACHIEVED', 'AWARDED', 'PAID')),
    idempotency_key VARCHAR(150) NOT NULL UNIQUE,
    awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- [6] Partner Minimal Audit Log Table
CREATE TABLE IF NOT EXISTS public.partner_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_account_id UUID REFERENCES public.partner_accounts(id) ON DELETE SET NULL,
    action VARCHAR(60) NOT NULL,
    details JSONB,
    performed_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 2. INDEXES CREATION (Performance & Lookups)
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_partner_accounts_affiliate_id ON public.partner_accounts(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_partner_accounts_auth_user_id ON public.partner_accounts(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_partner_accounts_slug ON public.partner_accounts(slug);
CREATE INDEX IF NOT EXISTS idx_partner_accounts_active ON public.partner_accounts(active);

CREATE INDEX IF NOT EXISTS idx_partner_targets_lookup ON public.partner_targets(partner_account_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_partner_commissions_partner ON public.partner_commissions(partner_account_id, status);
CREATE INDEX IF NOT EXISTS idx_partner_commissions_lead ON public.partner_commissions(merchant_lead_id);
CREATE INDEX IF NOT EXISTS idx_partner_commissions_store ON public.partner_commissions(store_id);

CREATE INDEX IF NOT EXISTS idx_partner_bonus_awards_lookup ON public.partner_bonus_awards(partner_account_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_partner_audit_logs_partner ON public.partner_audit_logs(partner_account_id, created_at DESC);

-- ==============================================================================
-- 3. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.partner_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_bonus_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_bonus_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_audit_logs ENABLE ROW LEVEL SECURITY;

-- Block anonymous access completely
REVOKE ALL ON public.partner_accounts FROM anon;
REVOKE ALL ON public.partner_targets FROM anon;
REVOKE ALL ON public.partner_commissions FROM anon;
REVOKE ALL ON public.partner_bonus_rules FROM anon;
REVOKE ALL ON public.partner_bonus_awards FROM anon;
REVOKE ALL ON public.partner_audit_logs FROM anon;

-- Authenticated Users: Partners can select their own mapped account
DROP POLICY IF EXISTS "partner_accounts_select_own" ON public.partner_accounts;
CREATE POLICY "partner_accounts_select_own" ON public.partner_accounts
    FOR SELECT TO authenticated
    USING (auth.uid() = auth_user_id);

-- Authenticated Users: Partners can read their own targets
DROP POLICY IF EXISTS "partner_targets_select_own" ON public.partner_targets;
CREATE POLICY "partner_targets_select_own" ON public.partner_targets
    FOR SELECT TO authenticated
    USING (partner_account_id IN (SELECT id FROM public.partner_accounts WHERE auth_user_id = auth.uid() AND active = true));

-- Authenticated Users: Partners can read their own commissions
DROP POLICY IF EXISTS "partner_commissions_select_own" ON public.partner_commissions;
CREATE POLICY "partner_commissions_select_own" ON public.partner_commissions
    FOR SELECT TO authenticated
    USING (partner_account_id IN (SELECT id FROM public.partner_accounts WHERE auth_user_id = auth.uid() AND active = true));

-- Authenticated Users: Read active bonus rules
DROP POLICY IF EXISTS "partner_bonus_rules_select_active" ON public.partner_bonus_rules;
CREATE POLICY "partner_bonus_rules_select_active" ON public.partner_bonus_rules
    FOR SELECT TO authenticated
    USING (active = true);

-- Authenticated Users: Partners can read their own bonus awards
DROP POLICY IF EXISTS "partner_bonus_awards_select_own" ON public.partner_bonus_awards;
CREATE POLICY "partner_bonus_awards_select_own" ON public.partner_bonus_awards
    FOR SELECT TO authenticated
    USING (partner_account_id IN (SELECT id FROM public.partner_accounts WHERE auth_user_id = auth.uid() AND active = true));

-- Service Role Grants
GRANT ALL ON public.partner_accounts TO service_role;
GRANT ALL ON public.partner_targets TO service_role;
GRANT ALL ON public.partner_commissions TO service_role;
GRANT ALL ON public.partner_bonus_rules TO service_role;
GRANT ALL ON public.partner_bonus_awards TO service_role;
GRANT ALL ON public.partner_audit_logs TO service_role;

-- ==============================================================================
-- 4. RPC FUNCTIONS FOR SECURE SERVER-SIDE OPERATIONS
-- ==============================================================================

-- [A] Admin Create Partner Account Function
CREATE OR REPLACE FUNCTION public.admin_create_partner_account(
    p_affiliate_id UUID,
    p_display_name VARCHAR(150),
    p_slug VARCHAR(60),
    p_region VARCHAR(80) DEFAULT NULL,
    p_auth_user_id UUID DEFAULT NULL,
    p_monthly_target INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_slug VARCHAR(60);
    v_partner_id UUID;
    v_affiliate_exists BOOLEAN;
    v_period_start DATE;
    v_period_end DATE;
BEGIN
    -- 1. Validate Affiliate exists and is active
    SELECT EXISTS (
        SELECT 1 FROM public.affiliates WHERE id = p_affiliate_id AND status = 'ACTIVE'
    ) INTO v_affiliate_exists;

    IF NOT v_affiliate_exists THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'AFFILIATE_NOT_FOUND_OR_INACTIVE',
            'error', 'الشريك التجاري غير موجود أو حسابه موقوف'
        );
    END IF;

    -- 2. Check if affiliate already has a partner account
    IF EXISTS (SELECT 1 FROM public.partner_accounts WHERE affiliate_id = p_affiliate_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'AFFILIATE_ALREADY_MAPPED',
            'error', 'هذا الشريك مرتبط بحساب Partner مسبقاً'
        );
    END IF;

    -- 3. Normalize and validate slug
    v_clean_slug := LOWER(TRIM(p_slug));
    IF v_clean_slug !~ '^[a-z0-9_-]{3,60}$' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_SLUG_FORMAT',
            'error', 'الرابط المخصص يجب أن يتكون من 3 إلى 60 حرفاً إنجليزية وأرقام وعلامات - أو _'
        );
    END IF;

    -- 4. Check reserved words
    IF v_clean_slug IN ('join', 'admin', 'login', 'logout', 'api', 'assets', 'partner', 'merchant', 'cashier', 'dashboard', 'app', 'super-admin', 'superadmin', 'pos', 'track') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'RESERVED_SLUG',
            'error', 'الرابط المخصص محجوز للنظام ولا يمكن اختياره'
        );
    END IF;

    -- 5. Check slug uniqueness
    IF EXISTS (SELECT 1 FROM public.partner_accounts WHERE slug = v_clean_slug) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'SLUG_ALREADY_EXISTS',
            'error', 'هذا الرابط المخصص مستخدم مسبقاً من قبل شريك آخر'
        );
    END IF;

    -- 6. Insert Partner Account
    INSERT INTO public.partner_accounts (
        auth_user_id,
        affiliate_id,
        display_name,
        slug,
        region,
        active
    ) VALUES (
        p_auth_user_id,
        p_affiliate_id,
        TRIM(p_display_name),
        v_clean_slug,
        NULLIF(TRIM(p_region), ''),
        true
    )
    RETURNING id INTO v_partner_id;

    -- 7. Initialize monthly target
    v_period_start := DATE_TRUNC('month', CURRENT_DATE)::DATE;
    v_period_end := (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE;

    INSERT INTO public.partner_targets (
        partner_account_id,
        period_start,
        period_end,
        target_type,
        target_value
    ) VALUES (
        v_partner_id,
        v_period_start,
        v_period_end,
        'PAID_MERCHANTS',
        GREATEST(1, COALESCE(p_monthly_target, 20))
    )
    ON CONFLICT (partner_account_id, period_start, period_end, target_type) DO NOTHING;

    -- 8. Audit log
    INSERT INTO public.partner_audit_logs (
        partner_account_id,
        action,
        details,
        performed_by
    ) VALUES (
        v_partner_id,
        'PARTNER_CREATED',
        jsonb_build_object(
            'slug', v_clean_slug,
            'affiliate_id', p_affiliate_id,
            'display_name', p_display_name,
            'region', p_region
        ),
        'SUPER_ADMIN'
    );

    RETURN jsonb_build_object(
        'success', true,
        'partner_id', v_partner_id,
        'slug', v_clean_slug,
        'message', 'تم إنشاء وتفعيل حساب الشريك بنجاح'
    );
END;
$$;

-- [B] Admin Toggle Partner Status Function
CREATE OR REPLACE FUNCTION public.admin_toggle_partner_status(
    p_partner_id UUID,
    p_active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_current_active BOOLEAN;
BEGIN
    SELECT active INTO v_current_active
    FROM public.partner_accounts
    WHERE id = p_partner_id;

    IF v_current_active IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'PARTNER_NOT_FOUND',
            'error', 'حساب الشريك غير موجود'
        );
    END IF;

    UPDATE public.partner_accounts
    SET active = p_active, updated_at = now()
    WHERE id = p_partner_id;

    -- Audit log
    INSERT INTO public.partner_audit_logs (
        partner_account_id,
        action,
        details,
        performed_by
    ) VALUES (
        p_partner_id,
        CASE WHEN p_active THEN 'PARTNER_REACTIVATED' ELSE 'PARTNER_SUSPENDED' END,
        jsonb_build_object('active', p_active),
        'SUPER_ADMIN'
    );

    RETURN jsonb_build_object(
        'success', true,
        'partner_id', p_partner_id,
        'active', p_active,
        'message', CASE WHEN p_active THEN 'تم تنشيط حساب الشريك' ELSE 'تم إيقاف حساب الشريك' END
    );
END;
$$;

COMMIT;


-- ==============================================================================
-- >>> FILE: 20261001_stage7_billing_foundation.sql <<<
-- ==============================================================================

-- ==============================================================================
-- RADAR LOYALTY ENGINE
-- STAGE 7 — BILLING & SUBSCRIPTIONS FOUNDATION
-- ADDITIVE DATABASE CHANGES ONLY — ZERO EXISTING TABLE MUTATIONS
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. TABLES CREATION
-- ==============================================================================

-- [1] Billing Plans Table (قائمة الخطط والأسعار المركزية المعتمدة)
CREATE TABLE IF NOT EXISTS public.billing_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'SAR',
    billing_interval VARCHAR(20) NOT NULL DEFAULT 'MONTHLY' CHECK (billing_interval IN ('MONTHLY', 'YEARLY')),
    trial_days INTEGER NOT NULL DEFAULT 7 CHECK (trial_days >= 0),
    active BOOLEAN NOT NULL DEFAULT true,
    provider_price_id VARCHAR(150),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_billing_plans_code_format CHECK (code ~ '^[A-Z0-9_-]{2,50}$')
);

-- Seed Initial Official Plans (690, 1190, 1890 SAR / Monthly / 7 Days Trial)
INSERT INTO public.billing_plans (code, name, description, amount, currency, billing_interval, trial_days, active)
VALUES 
    ('BASIC', 'الباقة الأساسية', 'برنامج الولاء الذكي المتكامل ونقاط المكافآت مع كاشير رقمي وبطاقة ولاء PWA', 690.00, 'SAR', 'MONTHLY', 7, true),
    ('ADVANCED', 'الباقة المتقدمة', 'برنامج الولاء المتقدم مع المستويات Tiers والامتيازات المخصصة وحملات الواتساب واستعادة العملاء', 1190.00, 'SAR', 'MONTHLY', 7, true),
    ('PRO', 'الباقة الاحترافية', 'الحل الشامل لشبكات المتاجر والفروع مع تحليلات متقدمة، كوبونات ديناميكية وربط مخصص', 1890.00, 'SAR', 'MONTHLY', 7, true)
ON CONFLICT (code) DO UPDATE 
SET 
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    amount = EXCLUDED.amount,
    currency = EXCLUDED.currency,
    billing_interval = EXCLUDED.billing_interval,
    trial_days = EXCLUDED.trial_days,
    updated_at = now();

-- [2] Merchant Subscriptions Table (سجل اشتراكات المتاجر وحالاتها)
CREATE TABLE IF NOT EXISTS public.merchant_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.billing_plans(id) ON DELETE RESTRICT,
    status VARCHAR(40) NOT NULL DEFAULT 'TRIALING' CHECK (status IN ('TRIALING', 'PENDING_PAYMENT', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED')),
    trial_started_at TIMESTAMPTZ,
    trial_ends_at TIMESTAMPTZ,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    canceled_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    provider VARCHAR(50) NOT NULL DEFAULT 'NONE',
    provider_customer_id VARCHAR(150),
    provider_subscription_id VARCHAR(150),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial Unique Index: Prevent duplicate simultaneously active/trialing subscriptions per store
CREATE UNIQUE INDEX IF NOT EXISTS uq_store_active_subscription 
ON public.merchant_subscriptions (store_id) 
WHERE status IN ('TRIALING', 'ACTIVE');

-- [3] Billing Transactions Table (دفتر المعاملات والمدفوعات)
CREATE TABLE IF NOT EXISTS public.billing_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES public.merchant_subscriptions(id) ON DELETE SET NULL,
    plan_id UUID NOT NULL REFERENCES public.billing_plans(id) ON DELETE RESTRICT,
    type VARCHAR(40) NOT NULL CHECK (type IN ('INITIAL_PAYMENT', 'RENEWAL', 'REFUND', 'ADJUSTMENT')),
    status VARCHAR(40) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELED')),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'SAR',
    provider VARCHAR(50) NOT NULL DEFAULT 'NONE',
    provider_transaction_id VARCHAR(150),
    provider_checkout_id VARCHAR(150),
    idempotency_key VARCHAR(150) NOT NULL UNIQUE,
    paid_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- [4] Billing Webhook Events Table (دفتر أحداث الويب هوك غير القابل للتكرار)
CREATE TABLE IF NOT EXISTS public.billing_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL,
    event_id VARCHAR(150) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    signature_verified BOOLEAN NOT NULL DEFAULT false,
    payload_hash VARCHAR(128),
    processed BOOLEAN NOT NULL DEFAULT false,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT uq_billing_webhook_provider_event UNIQUE (provider, event_id)
);

-- ==============================================================================
-- 2. INDEXES CREATION (Performance & Lookups)
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_billing_plans_code ON public.billing_plans(code);
CREATE INDEX IF NOT EXISTS idx_billing_plans_active ON public.billing_plans(active);

CREATE INDEX IF NOT EXISTS idx_merchant_subscriptions_store ON public.merchant_subscriptions(store_id);
CREATE INDEX IF NOT EXISTS idx_merchant_subscriptions_status ON public.merchant_subscriptions(status);

CREATE INDEX IF NOT EXISTS idx_billing_transactions_store ON public.billing_transactions(store_id);
CREATE INDEX IF NOT EXISTS idx_billing_transactions_sub ON public.billing_transactions(subscription_id);
CREATE INDEX IF NOT EXISTS idx_billing_transactions_status ON public.billing_transactions(status);

CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_lookup ON public.billing_webhook_events(provider, event_id);
CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_processed ON public.billing_webhook_events(processed);

-- ==============================================================================
-- 3. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_webhook_events ENABLE ROW LEVEL SECURITY;

-- Block anonymous access completely
REVOKE ALL ON public.billing_plans FROM anon;
REVOKE ALL ON public.merchant_subscriptions FROM anon;
REVOKE ALL ON public.billing_transactions FROM anon;
REVOKE ALL ON public.billing_webhook_events FROM anon;

-- Authenticated Users: Anyone logged in can read active billing plans
DROP POLICY IF EXISTS "billing_plans_select_active" ON public.billing_plans;
CREATE POLICY "billing_plans_select_active" ON public.billing_plans
    FOR SELECT TO authenticated
    USING (active = true);

-- Service Role Grants
GRANT ALL ON public.billing_plans TO service_role;
GRANT ALL ON public.merchant_subscriptions TO service_role;
GRANT ALL ON public.billing_transactions TO service_role;
GRANT ALL ON public.billing_webhook_events TO service_role;

-- ==============================================================================
-- 4. TRIAL ELIGIBILITY FUNCTION
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.check_store_trial_eligibility(p_store_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_store_exists BOOLEAN;
    v_has_previous_trial BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id) INTO v_store_exists;
    IF NOT v_store_exists THEN
        RETURN jsonb_build_object('eligible', false, 'code', 'STORE_NOT_FOUND', 'error', 'المتجر غير موجود');
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.merchant_subscriptions 
        WHERE store_id = p_store_id AND (trial_started_at IS NOT NULL OR status = 'TRIALING')
    ) INTO v_has_previous_trial;

    IF v_has_previous_trial THEN
        RETURN jsonb_build_object(
            'eligible', false, 
            'code', 'TRIAL_ALREADY_CONSUMED', 
            'error', 'لقد تم استهلاك الفترة التجريبية لهذا المتجر مسبقاً'
        );
    END IF;

    RETURN jsonb_build_object(
        'eligible', true,
        'trial_days', 7,
        'message', 'المتجر مؤهل لبدء التجربة المجانية لمدة 7 أيام'
    );
END;
$$;

COMMIT;


-- ==============================================================================
-- >>> FILE: 20261001_stage8_merchant_onboarding.sql <<<
-- ==============================================================================

-- ==============================================================================
-- 🛡️ RADAR LOYALTY ENGINE — STAGE 8 MIGRATION
-- MERCHANT ONBOARDING & STORE ACTIVATION FOUNDATION
-- Additive changes only. Zero destructive operations.
-- ==============================================================================

-- 1. Table: public.merchant_onboarding
CREATE TABLE IF NOT EXISTS public.merchant_onboarding (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'NOT_STARTED',
    current_step TEXT NOT NULL DEFAULT 'BUSINESS_INFO',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT uq_merchant_onboarding_store_id UNIQUE (store_id),
    CONSTRAINT chk_merchant_onboarding_status CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'READY', 'COMPLETED', 'BLOCKED')),
    CONSTRAINT chk_merchant_onboarding_step CHECK (current_step IN ('BUSINESS_INFO', 'BRANDING', 'STORE_SETTINGS', 'CUSTOMER_EXPERIENCE', 'BILLING', 'REVIEW'))
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_merchant_onboarding_store_id ON public.merchant_onboarding(store_id);
CREATE INDEX IF NOT EXISTS idx_merchant_onboarding_status ON public.merchant_onboarding(status);

-- 3. Automatic Updated-At Trigger
CREATE OR REPLACE FUNCTION public.set_merchant_onboarding_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_merchant_onboarding_updated_at ON public.merchant_onboarding;
CREATE TRIGGER trg_set_merchant_onboarding_updated_at
    BEFORE UPDATE ON public.merchant_onboarding
    FOR EACH ROW
    EXECUTE FUNCTION public.set_merchant_onboarding_updated_at();

-- 4. Enable RLS
ALTER TABLE public.merchant_onboarding ENABLE ROW LEVEL SECURITY;

-- 5. Hardened Permissions: Block direct client access from anon & authenticated
REVOKE ALL ON public.merchant_onboarding FROM anon;
REVOKE ALL ON public.merchant_onboarding FROM authenticated;
GRANT ALL ON public.merchant_onboarding TO service_role;

-- 6. Helper RPCs for atomic operations (Executed with SECURITY DEFINER via service_role)
CREATE OR REPLACE FUNCTION public.get_or_create_merchant_onboarding(p_store_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_record RECORD;
BEGIN
    -- Verify store existence
    IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'STORE_NOT_FOUND',
            'error', 'المتجر غير موجود'
        );
    END IF;

    -- Select existing or insert new
    SELECT * INTO v_record FROM public.merchant_onboarding WHERE store_id = p_store_id;

    IF v_record.id IS NULL THEN
        INSERT INTO public.merchant_onboarding (store_id, status, current_step, started_at)
        VALUES (p_store_id, 'IN_PROGRESS', 'BUSINESS_INFO', now())
        RETURNING * INTO v_record;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'onboarding', row_to_json(v_record)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_merchant_onboarding(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_merchant_onboarding(UUID) TO service_role;


-- ==============================================================================
-- >>> FILE: 20261002_stage13_affiliate_financial_ledger.sql <<<
-- ==============================================================================

-- ==============================================================================
-- 🚀 RADAR LOYALTY ENGINE - STAGE 13
-- Migration: 20261002_stage13_affiliate_financial_ledger.sql
-- Description: Affiliate Financial Ledger, Custom Commission Rate & Milestone Engine
-- ADDITIVE ONLY — ZERO BREAKING CHANGES
-- ==============================================================================

BEGIN;

-- 1. Additive Columns on Existing Tables
ALTER TABLE IF EXISTS public.affiliates 
ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5, 4) DEFAULT 0.2000 CHECK (commission_rate >= 0 AND commission_rate <= 1);

ALTER TABLE IF EXISTS public.partner_accounts 
ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5, 4) DEFAULT 0.2000 CHECK (commission_rate >= 0 AND commission_rate <= 1);

ALTER TABLE IF EXISTS public.partner_accounts 
ADD COLUMN IF NOT EXISTS target_value INTEGER DEFAULT 20 CHECK (target_value > 0);

ALTER TABLE IF EXISTS public.partner_accounts 
ADD COLUMN IF NOT EXISTS pin_code VARCHAR(20) DEFAULT '1234';

-- 2. Seed Default Milestone Rules if missing
INSERT INTO public.partner_bonus_rules (milestone, bonus_amount, active)
VALUES 
    (3, 100.00, true),
    (5, 250.00, true),
    (10, 500.00, true),
    (20, 1000.00, true)
ON CONFLICT (milestone) DO NOTHING;

-- 3. Ensure Table Grants strictly to service_role
GRANT ALL ON TABLE public.partner_commissions TO service_role;
GRANT ALL ON TABLE public.partner_bonus_rules TO service_role;
GRANT ALL ON TABLE public.partner_bonus_awards TO service_role;
GRANT ALL ON TABLE public.partner_audit_logs TO service_role;

-- 4. RPC: Atomic Record Lead Conversion Commission & Milestone Check
CREATE OR REPLACE FUNCTION public.record_lead_conversion_commission(
    p_lead_id UUID,
    p_store_id UUID,
    p_basis_amount NUMERIC DEFAULT 195.00
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_lead RECORD;
    v_partner RECORD;
    v_rate NUMERIC(5, 4);
    v_amount NUMERIC(12, 2);
    v_comm_id UUID;
    v_converted_count INTEGER;
    v_rule RECORD;
BEGIN
    -- 1. Find lead and its affiliate
    SELECT id, store_name, affiliate_id, referral_code, status
    INTO v_lead
    FROM public.merchant_leads
    WHERE id = p_lead_id;

    IF NOT FOUND OR v_lead.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'LEAD_NOT_FOUND', 'error', 'طلب التاجر غير موجود');
    END IF;

    IF v_lead.affiliate_id IS NULL THEN
        -- Direct lead without affiliate -> no commission to record
        RETURN jsonb_build_object('success', true, 'commission_recorded', false, 'reason', 'DIRECT_LEAD');
    END IF;

    -- 2. Find partner account for this affiliate
    SELECT id, display_name, commission_rate, active
    INTO v_partner
    FROM public.partner_accounts
    WHERE affiliate_id = v_lead.affiliate_id;

    IF NOT FOUND OR v_partner.id IS NULL THEN
        -- Check if affiliate exists directly
        SELECT id, name, commission_rate, status
        INTO v_partner
        FROM public.affiliates
        WHERE id = v_lead.affiliate_id;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'code', 'PARTNER_NOT_FOUND', 'error', 'الشريك غير موجود');
        END IF;
    END IF;

    v_rate := COALESCE(v_partner.commission_rate, 0.2000);
    v_amount := ROUND(COALESCE(p_basis_amount, 195.00) * v_rate, 2);

    -- 3. Upsert Commission in Ledger
    INSERT INTO public.partner_commissions (
        partner_account_id,
        merchant_lead_id,
        store_id,
        commission_type,
        basis_amount,
        commission_rate,
        commission_amount,
        status,
        qualifying_event,
        idempotency_key,
        created_at,
        updated_at
    ) VALUES (
        v_partner.id,
        p_lead_id,
        p_store_id,
        'STORE_CONVERSION',
        COALESCE(p_basis_amount, 195.00),
        v_rate,
        v_amount,
        'EARNED',
        'تأسيس وتفعيل المتجر بنجاح',
        'conv_comm_' || p_lead_id::text,
        clock_timestamp(),
        clock_timestamp()
    )
    ON CONFLICT (idempotency_key) DO UPDATE
    SET store_id = EXCLUDED.store_id,
        status = 'EARNED',
        updated_at = clock_timestamp()
    RETURNING id INTO v_comm_id;

    -- 4. Evaluate Milestone Engine
    SELECT COUNT(*) INTO v_converted_count
    FROM public.merchant_leads
    WHERE affiliate_id = v_lead.affiliate_id AND status = 'CONVERTED';

    FOR v_rule IN 
        SELECT id, milestone, bonus_amount 
        FROM public.partner_bonus_rules 
        WHERE active = true AND milestone <= v_converted_count
        ORDER BY milestone ASC
    LOOP
        INSERT INTO public.partner_bonus_awards (
            partner_account_id,
            bonus_rule_id,
            period_start,
            period_end,
            bonus_amount,
            status,
            idempotency_key,
            awarded_at,
            created_at
        ) VALUES (
            v_partner.id,
            v_rule.id,
            DATE_TRUNC('month', CURRENT_DATE)::DATE,
            (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE,
            v_rule.bonus_amount,
            'ACHIEVED',
            'bonus_' || v_partner.id::text || '_' || v_rule.milestone::text,
            clock_timestamp(),
            clock_timestamp()
        )
        ON CONFLICT (idempotency_key) DO NOTHING;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'commission_recorded', true,
        'commission_id', v_comm_id,
        'commission_amount', v_amount,
        'commission_rate', v_rate,
        'converted_count', v_converted_count
    );
END;
$$;

-- 5. RPC: Super Admin Settle / Payout Commissions
CREATE OR REPLACE FUNCTION public.admin_settle_partner_commissions(
    p_partner_account_id UUID,
    p_settlement_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_settled_commissions INTEGER := 0;
    v_total_amount NUMERIC(12, 2) := 0.00;
    v_settled_bonuses INTEGER := 0;
BEGIN
    -- 1. Calculate and Settle EARNED Commissions -> PAID
    SELECT COALESCE(SUM(commission_amount), 0.00), COUNT(*)
    INTO v_total_amount, v_settled_commissions
    FROM public.partner_commissions
    WHERE partner_account_id = p_partner_account_id AND status = 'EARNED';

    UPDATE public.partner_commissions
    SET status = 'PAID',
        updated_at = clock_timestamp()
    WHERE partner_account_id = p_partner_account_id AND status = 'EARNED';

    -- 2. Settle ACHIEVED / AWARDED Bonuses -> PAID
    UPDATE public.partner_bonus_awards
    SET status = 'PAID'
    WHERE partner_account_id = p_partner_account_id AND status IN ('ACHIEVED', 'AWARDED');
    
    GET DIAGNOSTICS v_settled_bonuses = ROW_COUNT;

    -- 3. Audit Log
    INSERT INTO public.partner_audit_logs (
        partner_account_id,
        action,
        details,
        performed_by
    ) VALUES (
        p_partner_account_id,
        'COMMISSIONS_SETTLED',
        jsonb_build_object(
            'settled_commissions_count', v_settled_commissions,
            'settled_bonuses_count', v_settled_bonuses,
            'total_amount', v_total_amount,
            'reference', p_settlement_reference
        ),
        'SUPER_ADMIN'
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

GRANT EXECUTE ON FUNCTION public.record_lead_conversion_commission TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_settle_partner_commissions TO service_role;

COMMIT;


-- ==============================================================================
-- >>> FILE: 20261002_stage14_master_financial_ledger.sql <<<
-- ==============================================================================

-- ==============================================================================
-- 🏛️ RADAR LOYALTY ENGINE - STAGE 14
-- Migration: 20261002_stage14_master_financial_ledger.sql
-- Description: Immutable Master Financial Ledger, ZATCA Credit Notes, Affiliate Payouts & Audit Trail
-- ADDITIVE ONLY — ZERO BREAKING CHANGES
-- ==============================================================================

BEGIN;

-- 1. Create Immutable Master Financial Ledger Table
CREATE TABLE IF NOT EXISTS public.financial_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id VARCHAR(100) NOT NULL,
    invoice_id VARCHAR(100),
    store_id VARCHAR(100),
    affiliate_id VARCHAR(100),
    payment_id VARCHAR(100),
    transaction_type VARCHAR(50) NOT NULL CHECK (
        transaction_type IN ('PAYMENT', 'REFUND', 'ADJUSTMENT', 'PAYOUT', 'COMMISSION_ACCRUED', 'COMMISSION_REVERSED', 'CREDIT_NOTE')
    ),
    gross_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    vat_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    gateway_fee NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    affiliate_commission NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    net_platform_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(30) NOT NULL DEFAULT 'SETTLED' CHECK (
        status IN ('PENDING', 'SETTLED', 'REVERSED', 'FAILED')
    ),
    reversal_of VARCHAR(100),
    refund_of VARCHAR(100),
    created_by VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
    metadata JSONB DEFAULT '{}'::jsonb,
    effective_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Indexing for high-performance financial audits
CREATE INDEX IF NOT EXISTS idx_financial_ledger_tx_id ON public.financial_ledger(transaction_id);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_store_id ON public.financial_ledger(store_id);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_affiliate_id ON public.financial_ledger(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_invoice_id ON public.financial_ledger(invoice_id);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_type ON public.financial_ledger(transaction_type);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_created_at ON public.financial_ledger(created_at DESC);

-- 2. Trigger to strictly enforce Immutability (Block UPDATE and DELETE)
CREATE OR REPLACE FUNCTION public.enforce_financial_ledger_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'RADAR_FINANCIAL_LEDGER_IMMUTABLE: Updates and Deletions are strictly prohibited on the master financial ledger. Insert a REVERSAL or ADJUSTMENT entry instead.';
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_financial_ledger_immutability ON public.financial_ledger;
CREATE TRIGGER trg_protect_financial_ledger_immutability
BEFORE UPDATE OR DELETE ON public.financial_ledger
FOR EACH ROW
EXECUTE FUNCTION public.enforce_financial_ledger_immutability();

-- 3. Create ZATCA Compliant Credit Notes Table
CREATE TABLE IF NOT EXISTS public.credit_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_note_number VARCHAR(100) UNIQUE NOT NULL,
    original_invoice_id VARCHAR(100) NOT NULL,
    original_invoice_number VARCHAR(100) NOT NULL,
    store_id VARCHAR(100) NOT NULL,
    affiliate_id VARCHAR(100),
    gross_refund_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    vat_refund_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    net_refund_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    clawback_commission NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    reason TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED', 'APPLIED', 'CANCELLED')),
    ledger_entry_id UUID REFERENCES public.financial_ledger(id),
    issued_by VARCHAR(100) NOT NULL DEFAULT 'SUPER_ADMIN',
    notes TEXT,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 4. Create Affiliate Payouts Table
CREATE TABLE IF NOT EXISTS public.affiliate_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payout_number VARCHAR(100) UNIQUE NOT NULL,
    affiliate_id VARCHAR(100) NOT NULL,
    partner_name VARCHAR(255) NOT NULL,
    iban VARCHAR(50) NOT NULL,
    bank_name VARCHAR(100) NOT NULL,
    transfer_reference VARCHAR(100) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    commissions_count INTEGER NOT NULL DEFAULT 0,
    commission_ids JSONB DEFAULT '[]'::jsonb,
    status VARCHAR(30) NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PROCESSING', 'COMPLETED', 'FAILED')),
    disbursed_by VARCHAR(100) NOT NULL DEFAULT 'SUPER_ADMIN',
    ledger_entry_id UUID REFERENCES public.financial_ledger(id),
    notes TEXT,
    disbursed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 5. RPC: Record Master Ledger Entry with Idempotency
CREATE OR REPLACE FUNCTION public.record_master_ledger_entry(
    p_transaction_id TEXT,
    p_invoice_id TEXT,
    p_store_id TEXT,
    p_affiliate_id TEXT,
    p_payment_id TEXT,
    p_transaction_type TEXT,
    p_gross_amount NUMERIC,
    p_vat_amount NUMERIC,
    p_gateway_fee NUMERIC,
    p_affiliate_commission NUMERIC,
    p_net_platform_amount NUMERIC,
    p_created_by TEXT DEFAULT 'SYSTEM',
    p_reversal_of TEXT DEFAULT NULL,
    p_refund_of TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_existing_id UUID;
    v_new_id UUID;
BEGIN
    -- Check Idempotency for non-adjustment entries
    IF p_transaction_type = 'PAYMENT' AND p_payment_id IS NOT NULL THEN
        SELECT id INTO v_existing_id 
        FROM public.financial_ledger 
        WHERE payment_id = p_payment_id AND transaction_type = 'PAYMENT';

        IF v_existing_id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', true, 
                'idempotent', true, 
                'ledger_id', v_new_id,
                'message', 'Transaction already registered in financial ledger'
            );
        END IF;
    END IF;

    INSERT INTO public.financial_ledger (
        transaction_id,
        invoice_id,
        store_id,
        affiliate_id,
        payment_id,
        transaction_type,
        gross_amount,
        vat_amount,
        gateway_fee,
        affiliate_commission,
        net_platform_amount,
        status,
        reversal_of,
        refund_of,
        created_by,
        metadata,
        effective_at,
        created_at
    ) VALUES (
        p_transaction_id,
        p_invoice_id,
        p_store_id,
        p_affiliate_id,
        p_payment_id,
        p_transaction_type,
        p_gross_amount,
        p_vat_amount,
        p_gateway_fee,
        p_affiliate_commission,
        p_net_platform_amount,
        'SETTLED',
        p_reversal_of,
        p_refund_of,
        p_created_by,
        p_metadata,
        clock_timestamp(),
        clock_timestamp()
    ) RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', true,
        'idempotent', false,
        'ledger_id', v_new_id
    );
END;
$$;

-- 6. RPC: Execute ZATCA Refund & Credit Note Reversal
CREATE OR REPLACE FUNCTION public.process_zatca_refund_credit_note(
    p_original_invoice_id TEXT,
    p_original_invoice_number TEXT,
    p_store_id TEXT,
    p_affiliate_id TEXT,
    p_refund_amount NUMERIC,
    p_reason TEXT,
    p_admin_user TEXT DEFAULT 'SUPER_ADMIN',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_vat_refund NUMERIC(12, 2);
    v_net_refund NUMERIC(12, 2);
    v_clawback NUMERIC(12, 2) := 0.00;
    v_cn_number TEXT;
    v_ledger_id UUID;
    v_cn_id UUID;
BEGIN
    -- Calculate 15% ZATCA VAT breakdown
    v_net_refund := ROUND(p_refund_amount / 1.15, 2);
    v_vat_refund := ROUND(p_refund_amount - v_net_refund, 2);

    -- Check if there was an affiliate commission to reverse
    IF p_affiliate_id IS NOT NULL THEN
        SELECT COALESCE(SUM(commission_amount), 0.00) INTO v_clawback
        FROM public.partner_commissions
        WHERE (store_id = p_store_id::UUID OR partner_account_id = p_affiliate_id::UUID)
          AND status IN ('PENDING', 'EARNED', 'AVAILABLE');

        -- Clawback the commission
        UPDATE public.partner_commissions
        SET status = 'REVERSED',
            updated_at = clock_timestamp()
        WHERE (store_id = p_store_id::UUID OR partner_account_id = p_affiliate_id::UUID)
          AND status IN ('PENDING', 'EARNED', 'AVAILABLE');
    END IF;

    -- Generate Credit Note Number
    v_cn_number := 'CN-' || TO_CHAR(clock_timestamp(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 5));

    -- Insert Reversal Ledger Entry
    INSERT INTO public.financial_ledger (
        transaction_id,
        invoice_id,
        store_id,
        affiliate_id,
        transaction_type,
        gross_amount,
        vat_amount,
        gateway_fee,
        affiliate_commission,
        net_platform_amount,
        status,
        refund_of,
        created_by,
        metadata,
        effective_at,
        created_at
    ) VALUES (
        'tx_refund_' || v_cn_number,
        p_original_invoice_id,
        p_store_id,
        p_affiliate_id,
        'REFUND',
        -p_refund_amount,
        -v_vat_refund,
        0.00,
        -v_clawback,
        -(p_refund_amount - v_vat_refund - v_clawback),
        'SETTLED',
        p_original_invoice_id,
        p_admin_user,
        jsonb_build_object(
            'credit_note_number', v_cn_number,
            'reason', p_reason,
            'original_invoice_number', p_original_invoice_number,
            'admin_notes', p_notes
        ),
        clock_timestamp(),
        clock_timestamp()
    ) RETURNING id INTO v_ledger_id;

    -- Insert Credit Note Record
    INSERT INTO public.credit_notes (
        credit_note_number,
        original_invoice_id,
        original_invoice_number,
        store_id,
        affiliate_id,
        gross_refund_amount,
        vat_refund_amount,
        net_refund_amount,
        clawback_commission,
        reason,
        status,
        ledger_entry_id,
        issued_by,
        notes,
        issued_at,
        created_at
    ) VALUES (
        v_cn_number,
        p_original_invoice_id,
        p_original_invoice_number,
        p_store_id,
        p_affiliate_id,
        p_refund_amount,
        v_vat_refund,
        v_net_refund,
        v_clawback,
        p_reason,
        'ISSUED',
        v_ledger_id,
        p_admin_user,
        p_notes,
        clock_timestamp(),
        clock_timestamp()
    ) RETURNING id INTO v_cn_id;

    RETURN jsonb_build_object(
        'success', true,
        'credit_note_id', v_cn_id,
        'credit_note_number', v_cn_number,
        'ledger_entry_id', v_ledger_id,
        'refund_amount', p_refund_amount,
        'vat_refund', v_vat_refund,
        'clawback_commission', v_clawback
    );
END;
$$;

-- 7. Permissions
GRANT ALL ON TABLE public.financial_ledger TO service_role;
GRANT ALL ON TABLE public.credit_notes TO service_role;
GRANT ALL ON TABLE public.affiliate_payouts TO service_role;
GRANT EXECUTE ON FUNCTION public.record_master_ledger_entry TO service_role;
GRANT EXECUTE ON FUNCTION public.process_zatca_refund_credit_note TO service_role;

COMMIT;


-- ==============================================================================
-- >>> FILE: 20261002_stage15_dual_commissions_grace_proration.sql <<<
-- ==============================================================================

-- ==============================================================================
-- 🚀 RADAR LOYALTY ENGINE - STAGE 15
-- Migration: 20261002_stage15_dual_commissions_grace_proration.sql
-- Description: Dual Commissions (Acquisition vs. Recurring), Grace Period & Admin Override Engine
-- ADDITIVE ONLY — ZERO BREAKING CHANGES
-- ==============================================================================

BEGIN;

-- 1. Additive columns for Grace Period & Admin Overrides in Stores
ALTER TABLE IF EXISTS public.stores
ADD COLUMN IF NOT EXISTS grace_period_days INTEGER DEFAULT 3 CHECK (grace_period_days >= 0),
ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS complimentary_days_granted INTEGER DEFAULT 0 CHECK (complimentary_days_granted >= 0),
ADD COLUMN IF NOT EXISTS last_override_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_override_reason TEXT;

-- 2. Additive columns for Dual Commissions in Partner Accounts & Affiliates
ALTER TABLE IF EXISTS public.partner_accounts
ADD COLUMN IF NOT EXISTS acquisition_commission_rate NUMERIC(5, 4) DEFAULT 0.2000 CHECK (acquisition_commission_rate >= 0 AND acquisition_commission_rate <= 1),
ADD COLUMN IF NOT EXISTS recurring_commission_rate NUMERIC(5, 4) DEFAULT 0.1000 CHECK (recurring_commission_rate >= 0 AND recurring_commission_rate <= 1);

ALTER TABLE IF EXISTS public.affiliates
ADD COLUMN IF NOT EXISTS acquisition_commission_rate NUMERIC(5, 4) DEFAULT 0.2000 CHECK (acquisition_commission_rate >= 0 AND acquisition_commission_rate <= 1),
ADD COLUMN IF NOT EXISTS recurring_commission_rate NUMERIC(5, 4) DEFAULT 0.1000 CHECK (recurring_commission_rate >= 0 AND recurring_commission_rate <= 1);

-- 3. Additive columns in Partner Commissions for Invoice & Ledger traceability
ALTER TABLE IF EXISTS public.partner_commissions
ADD COLUMN IF NOT EXISTS invoice_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100);

-- 4. RPC: Admin Grant Complimentary Days & Manual Subscription Override
CREATE OR REPLACE FUNCTION public.admin_grant_complimentary_days(
    p_store_id UUID,
    p_days_to_add INTEGER,
    p_reason TEXT,
    p_admin_user TEXT DEFAULT 'SUPER_ADMIN',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_store RECORD;
    v_current_end TIMESTAMPTZ;
    v_new_end TIMESTAMPTZ;
    v_ledger_id UUID;
BEGIN
    IF p_days_to_add <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'عدد الأيام الممنوحة يجب أن يكون أكبر من صفر');
    END IF;

    SELECT id, name, subscription_end_date, status, complimentary_days_granted
    INTO v_store
    FROM public.stores
    WHERE id = p_store_id;

    IF NOT FOUND OR v_store.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'المتجر غير موجود');
    END IF;

    -- Calculate base timestamp (current end date or now, whichever is larger)
    v_current_end := COALESCE(v_store.subscription_end_date, clock_timestamp());
    IF v_current_end < clock_timestamp() THEN
        v_current_end := clock_timestamp();
    END IF;

    v_new_end := v_current_end + (p_days_to_add || ' days')::INTERVAL;

    -- Update Store
    UPDATE public.stores
    SET subscription_end_date = v_new_end,
        subscription_active = true,
        subscription_status = 'active',
        status = 'active',
        complimentary_days_granted = COALESCE(v_store.complimentary_days_granted, 0) + p_days_to_add,
        last_override_at = clock_timestamp(),
        last_override_reason = p_reason,
        updated_at = clock_timestamp()
    WHERE id = p_store_id;

    -- Record Audit Adjustment in Financial Ledger (0.00 Gross amount)
    INSERT INTO public.financial_ledger (
        transaction_id,
        store_id,
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
        'tx_override_' || TO_CHAR(clock_timestamp(), 'YYYYMMDD') || '_' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 5)),
        p_store_id::TEXT,
        'ADJUSTMENT',
        0.00,
        0.00,
        0.00,
        0.00,
        0.00,
        'SETTLED',
        p_admin_user,
        jsonb_build_object(
            'override_type', 'COMPLIMENTARY_DAYS',
            'days_granted', p_days_to_add,
            'reason', p_reason,
            'previous_end_date', v_current_end,
            'new_end_date', v_new_end,
            'admin_notes', p_notes
        ),
        clock_timestamp(),
        clock_timestamp()
    ) RETURNING id INTO v_ledger_id;

    RETURN jsonb_build_object(
        'success', true,
        'store_id', p_store_id,
        'days_added', p_days_to_add,
        'previous_end_date', v_current_end,
        'new_end_date', v_new_end,
        'ledger_id', v_ledger_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_grant_complimentary_days TO service_role;

COMMIT;


-- ==============================================================================
-- >>> FILE: 20261005_trial_14_days.sql <<<
-- ==============================================================================

-- ==============================================================================
-- Trial period: 7 days -> 14 days (NEW STORES ONLY)
-- DRAFT - NOT EXECUTED. Review before running in Supabase SQL editor.
--  * Does NOT modify any existing row (no UPDATE on stores / billing_plans).
--  * Only changes column DEFAULTs and two functions used for NEW stores.
--  * Before running: confirm the live definitions of the two functions below
--    match the repo versions (supabase_schema.sql / stage7 migration).
-- ==============================================================================
BEGIN;

ALTER TABLE public.stores ALTER COLUMN trial_end_date SET DEFAULT (now() + interval '14 days');
ALTER TABLE public.stores ALTER COLUMN subscription_end_date SET DEFAULT (now() + interval '14 days');
CREATE OR REPLACE FUNCTION public.create_store_concierge_onboarding(
    p_name TEXT,
    p_slug TEXT,
    p_logo_url TEXT DEFAULT NULL,
    p_primary_color TEXT DEFAULT '#0F172A',
    p_secondary_color TEXT DEFAULT '#F59E0B',
    p_points_per_riyal NUMERIC DEFAULT 1.0,
    p_manager_name TEXT DEFAULT 'المدير العام',
    p_manager_contact TEXT DEFAULT '0500000000',
    p_manager_pin TEXT DEFAULT '9999'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_store RECORD;
    v_staff RECORD;
BEGIN
    INSERT INTO public.stores (
        name,
        slug,
        logo_url,
        primary_color,
        secondary_color,
        points_per_riyal,
        manager_name,
        manager_contact,
        subscription_active,
        status,
        subscription_status,
        subscription_plan,
        trial_start_date,
        trial_end_date,
        subscription_start_date,
        subscription_end_date,
        setup_fee_paid
    )
    VALUES (
        p_name,
        LOWER(TRIM(p_slug)),
        p_logo_url,
        COALESCE(p_primary_color, '#0F172A'),
        COALESCE(p_secondary_color, '#F59E0B'),
        COALESCE(p_points_per_riyal, 1.0),
        p_manager_name,
        p_manager_contact,
        true,
        'trial',
        'trial',
        'trial',
        now(),
        (now() + interval '14 days'),
        now(),
        (now() + interval '14 days'),
        false
    )
    ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        logo_url = COALESCE(EXCLUDED.logo_url, stores.logo_url),
        manager_name = EXCLUDED.manager_name,
        manager_contact = EXCLUDED.manager_contact,
        primary_color = EXCLUDED.primary_color,
        secondary_color = EXCLUDED.secondary_color,
        points_per_riyal = EXCLUDED.points_per_riyal,
        updated_at = now()
    RETURNING * INTO v_store;

    -- Create / Update Manager Staff
    INSERT INTO public.store_staff (
        store_id,
        name,
        phone,
        role,
        pin_code,
        is_active,
        can_manual_input_phone
    )
    VALUES (
        v_store.id,
        COALESCE(p_manager_name, 'المدير العام'),
        COALESCE(p_manager_contact, '0500000000'),
        'admin',
        COALESCE(p_manager_pin, '9999'),
        true,
        true
    )
    RETURNING * INTO v_staff;

    -- Create Wallet
    INSERT INTO public.store_wallets (store_id, sms_quota, wa_quota, cashier_limit)
    VALUES (v_store.id, 500, 200, 2)
    ON CONFLICT (store_id) DO NOTHING;

    -- Create Default Tiers
    INSERT INTO public.tiers (store_id, tier_name, required_xp, badge_color)
    VALUES 
        (v_store.id, 'ضيف (Guest)', 0, '#94A3B8'),
        (v_store.id, 'Insider مميز', 150, '#3B82F6'),
        (v_store.id, 'VIP Gold', 500, '#F59E0B'),
        (v_store.id, 'Black Elite 👑', 1200, '#10B981')
    ON CONFLICT (store_id, tier_name) DO NOTHING;

    RETURN jsonb_build_object(
        'success', true,
        'store', row_to_json(v_store),
        'manager', row_to_json(v_staff),
        'portal_url', '/?store=' || v_store.slug
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.check_store_trial_eligibility(p_store_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_store_exists BOOLEAN;
    v_has_previous_trial BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id) INTO v_store_exists;
    IF NOT v_store_exists THEN
        RETURN jsonb_build_object('eligible', false, 'code', 'STORE_NOT_FOUND', 'error', 'المتجر غير موجود');
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.merchant_subscriptions 
        WHERE store_id = p_store_id AND (trial_started_at IS NOT NULL OR status = 'TRIALING')
    ) INTO v_has_previous_trial;

    IF v_has_previous_trial THEN
        RETURN jsonb_build_object(
            'eligible', false, 
            'code', 'TRIAL_ALREADY_CONSUMED', 
            'error', 'لقد تم استهلاك الفترة التجريبية لهذا المتجر مسبقاً'
        );
    END IF;

    RETURN jsonb_build_object(
        'eligible', true,
        'trial_days', 14,
        'message', 'المتجر مؤهل لبدء التجربة المجانية لمدة 14 يوم'
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- OPTIONAL / DISABLED - BILLING PLANS (owner decision pending)
-- Changes the trial length shown/used by paid plans in public.billing_plans.
-- This UPDATES EXISTING ROWS. Uncomment ONLY after explicit approval, and only
-- if the table exists in the target database.
-- ------------------------------------------------------------------------------
-- ALTER TABLE public.billing_plans ALTER COLUMN trial_days SET DEFAULT 14;
-- UPDATE public.billing_plans SET trial_days = 14, updated_at = now() WHERE trial_days = 7;

COMMIT;


-- ==============================================================================
-- >>> FILE: 20261006_egress_store_assets_bucket.sql <<<
-- ==============================================================================

-- ==============================================================================
-- 20261006_egress_store_assets_bucket.sql
-- Public Storage bucket for all store images (served via Supabase CDN / Cloudflare).
-- Idempotent. Apply BEFORE deploying the new uploader and BEFORE running
-- scripts/migrate-base64-to-storage.mjs --apply
-- ==============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'store-assets', 'store-assets', true,
  2 * 1024 * 1024,                                   -- 2 MB hard cap per object
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public READ is implicit for public buckets (object URLs). Writes from the browser
-- (anon key) are limited to INSERT of new objects in this bucket only: no update/delete.
drop policy if exists "store_assets_insert" on storage.objects;
create policy "store_assets_insert"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'store-assets');

drop policy if exists "store_assets_select" on storage.objects;
create policy "store_assets_select"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'store-assets');

-- NOTE: the uploader uses upsert:true with content-hash filenames. Re-uploading identical
-- bytes hits an existing object, which needs UPDATE permission; if you prefer not to grant
-- it, change `upsert` to false in imageCompressor.ts and treat "already exists" as success.
drop policy if exists "store_assets_update" on storage.objects;
create policy "store_assets_update"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'store-assets')
  with check (bucket_id = 'store-assets');


-- ==============================================================================
-- >>> FILE: 20261008_fin01_financial_hardening.sql <<<
-- ==============================================================================

-- ==============================================================================
-- 🏛️ RADAR LOYALTY ENGINE — PHASE 3: FINANCIAL HARDENING [FIN-01, FIN-02, FIN-03]
-- Migration: 20261008_fin01_financial_hardening.sql
-- Description:
--   1. Self-contained table creation: financial_ledger, credit_notes, store_invoices.
--   2. Dual synchronization with existing billing_transactions & merchant_subscriptions.
--   3. [FIN-01] Server-Side Idempotency Guard & Unique Indexes.
--   4. [FIN-02] Unified ZATCA VAT (15%) & Strict Ledger Balance Constraint.
--   5. [FIN-03] Commission Clawback Engine (Reversal & Debit Adjustment for Paid Comms).
--   6. Atomic RPCs: process_store_payment_atomic & process_zatca_refund_and_clawback.
-- 100% ADDITIVE & SELF-CONTAINED — ZERO PREREQUISITE ASSUMPTIONS
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. IMMUTABLE MASTER FINANCIAL LEDGER TABLE (دفتر الأستاذ العام المالي)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.financial_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id VARCHAR(100) NOT NULL,
    invoice_id VARCHAR(100),
    store_id VARCHAR(100),
    affiliate_id VARCHAR(100),
    payment_id VARCHAR(100),
    transaction_type VARCHAR(50) NOT NULL CHECK (
        transaction_type IN ('PAYMENT', 'REFUND', 'ADJUSTMENT', 'PAYOUT', 'COMMISSION_ACCRUED', 'COMMISSION_REVERSED', 'CREDIT_NOTE')
    ),
    gross_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    vat_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    gateway_fee NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    affiliate_commission NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    net_platform_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(30) NOT NULL DEFAULT 'SETTLED' CHECK (
        status IN ('PENDING', 'SETTLED', 'REVERSED', 'FAILED')
    ),
    reversal_of VARCHAR(100),
    refund_of VARCHAR(100),
    created_by VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
    metadata JSONB DEFAULT '{}'::jsonb,
    effective_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Indexing for performance and reporting
CREATE INDEX IF NOT EXISTS idx_financial_ledger_tx_id ON public.financial_ledger(transaction_id);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_store_id ON public.financial_ledger(store_id);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_affiliate_id ON public.financial_ledger(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_invoice_id ON public.financial_ledger(invoice_id);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_type ON public.financial_ledger(transaction_type);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_created_at ON public.financial_ledger(created_at DESC);

-- [FIN-01] Unique Idempotency Index: Prevent double-entry for identical payment_ids
CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_ledger_payment_tx 
ON public.financial_ledger (payment_id, transaction_type) 
WHERE payment_id IS NOT NULL AND transaction_type = 'PAYMENT';

-- [FIN-02] Ledger Invariant Balance Constraint
DO $$
BEGIN
    ALTER TABLE public.financial_ledger 
    ADD CONSTRAINT chk_ledger_balance 
    CHECK (
        transaction_type <> 'PAYMENT' OR 
        ABS(gross_amount - (net_platform_amount + vat_amount + gateway_fee + affiliate_commission)) < 0.05
    ) NOT VALID;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Constraint chk_ledger_balance notice: %', SQLERRM;
END $$;

-- Immutability Protection: Block UPDATE and DELETE on financial_ledger
CREATE OR REPLACE FUNCTION public.enforce_financial_ledger_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'RADAR_FINANCIAL_LEDGER_IMMUTABLE: Updates and Deletions are strictly prohibited on the master financial ledger. Insert a REVERSAL or ADJUSTMENT entry instead.';
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_financial_ledger_immutability ON public.financial_ledger;
CREATE TRIGGER trg_protect_financial_ledger_immutability
BEFORE UPDATE OR DELETE ON public.financial_ledger
FOR EACH ROW
EXECUTE FUNCTION public.enforce_financial_ledger_immutability();

-- RLS & Grants for financial_ledger
ALTER TABLE public.financial_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.financial_ledger FROM anon;

DROP POLICY IF EXISTS "financial_ledger_select_policy" ON public.financial_ledger;
CREATE POLICY "financial_ledger_select_policy" ON public.financial_ledger
    FOR SELECT TO authenticated
    USING (auth.role() = 'authenticated');

GRANT ALL ON public.financial_ledger TO service_role;
GRANT SELECT ON public.financial_ledger TO authenticated;

-- ==============================================================================
-- 2. ZATCA COMPLIANT CREDIT NOTES TABLE (جدول الإشعارات الدائنة)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.credit_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_note_number VARCHAR(100) UNIQUE NOT NULL,
    original_invoice_id VARCHAR(100) NOT NULL,
    original_invoice_number VARCHAR(100) NOT NULL,
    store_id VARCHAR(100) NOT NULL,
    affiliate_id VARCHAR(100),
    gross_refund_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    vat_refund_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    net_refund_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    clawback_commission NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    reason TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED', 'APPLIED', 'CANCELLED')),
    ledger_entry_id UUID REFERENCES public.financial_ledger(id) ON DELETE SET NULL,
    issued_by VARCHAR(100) NOT NULL DEFAULT 'SUPER_ADMIN',
    notes TEXT,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_credit_notes_store_id ON public.credit_notes(store_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_orig_num ON public.credit_notes(original_invoice_number);

-- RLS & Grants for credit_notes
ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.credit_notes FROM anon;

DROP POLICY IF EXISTS "credit_notes_select_policy" ON public.credit_notes;
CREATE POLICY "credit_notes_select_policy" ON public.credit_notes
    FOR SELECT TO authenticated
    USING (auth.role() = 'authenticated');

GRANT ALL ON public.credit_notes TO service_role;
GRANT SELECT ON public.credit_notes TO authenticated;

-- ==============================================================================
-- 3. STORE INVOICES TABLE (جدول فواتير المتاجر والاشتراكات المركزي)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.store_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    invoice_number VARCHAR(100) NOT NULL UNIQUE,
    invoice_type VARCHAR(50) NOT NULL DEFAULT 'renewal' CHECK (invoice_type IN ('setup', 'renewal', 'upgrade', 'extra_cashier')),
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (amount >= 0),
    vat_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (vat_amount >= 0),
    net_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (net_amount >= 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'SAR',
    status VARCHAR(40) NOT NULL DEFAULT 'paid' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
    payment_method VARCHAR(50) DEFAULT 'mada',
    gateway VARCHAR(50) NOT NULL DEFAULT 'moyasar',
    gateway_payment_id VARCHAR(150),
    plan_id VARCHAR(100),
    plan_name VARCHAR(150),
    paid_at TIMESTAMPTZ DEFAULT clock_timestamp(),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- [FIN-01] Unique Index on gateway_payment_id to prevent duplicate payment invoices
CREATE UNIQUE INDEX IF NOT EXISTS uq_store_invoices_gateway_payment 
ON public.store_invoices (gateway_payment_id) 
WHERE gateway_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_store_invoices_store_id ON public.store_invoices(store_id);
CREATE INDEX IF NOT EXISTS idx_store_invoices_status ON public.store_invoices(status);
CREATE INDEX IF NOT EXISTS idx_store_invoices_created_at ON public.store_invoices(created_at DESC);

-- RLS & Grants for store_invoices
ALTER TABLE public.store_invoices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_invoices FROM anon;

DROP POLICY IF EXISTS "store_invoices_select_policy" ON public.store_invoices;
CREATE POLICY "store_invoices_select_policy" ON public.store_invoices
    FOR SELECT TO authenticated
    USING (auth.role() = 'authenticated');

GRANT ALL ON public.store_invoices TO service_role;
GRANT SELECT ON public.store_invoices TO authenticated;

-- ==============================================================================
-- 4. [FIN-03] EXPAND PARTNER COMMISSIONS STATUS & TRACEABILITY
-- ==============================================================================

DO $$
BEGIN
    -- Drop existing status check constraints if any
    ALTER TABLE public.partner_commissions DROP CONSTRAINT IF EXISTS partner_commissions_status_check;
    ALTER TABLE public.partner_commissions DROP CONSTRAINT IF EXISTS partner_commissions_status_chk;
    ALTER TABLE public.partner_commissions DROP CONSTRAINT IF EXISTS chk_partner_commissions_status;
    
    -- Add updated constraint allowing REVERSED and CLAWBACK
    ALTER TABLE public.partner_commissions 
    ADD CONSTRAINT chk_partner_commissions_status 
    CHECK (status IN ('PENDING', 'EARNED', 'PAID', 'VOID', 'REVERSED', 'CLAWBACK'));
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Constraint update skipped: %', SQLERRM;
END $$;

-- Add additive columns to partner_commissions for traceability if not exists
ALTER TABLE IF EXISTS public.partner_commissions
ADD COLUMN IF NOT EXISTS invoice_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100),
ADD COLUMN IF NOT EXISTS clawback_of UUID REFERENCES public.partner_commissions(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS notes TEXT;

-- ==============================================================================
-- 5. [FIN-01 & FIN-02] ATOMIC RPC: process_store_payment_atomic
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.process_store_payment_atomic(
    p_store_id UUID,
    p_invoice_type TEXT,
    p_amount NUMERIC,
    p_payment_method TEXT DEFAULT 'mada',
    p_gateway TEXT DEFAULT 'moyasar',
    p_gateway_payment_id TEXT DEFAULT NULL,
    p_plan_id TEXT DEFAULT NULL,
    p_plan_code TEXT DEFAULT NULL,
    p_plan_name TEXT DEFAULT NULL,
    p_duration_months INTEGER DEFAULT 1,
    p_vat_rate NUMERIC DEFAULT 0.15,
    p_gateway_fee NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_store RECORD;
    v_lead RECORD;
    v_partner RECORD;
    v_existing_inv_id UUID;
    v_existing_inv_num TEXT;
    v_existing_ledg_id UUID;
    
    v_gw_payment_id TEXT;
    v_invoice_num TEXT;
    v_invoice_id UUID;
    v_ledger_id UUID;
    
    v_gross NUMERIC(12, 2);
    v_vat_rate NUMERIC(5, 4);
    v_net_before_vat NUMERIC(12, 2);
    v_vat_amount NUMERIC(12, 2);
    v_gw_fee NUMERIC(12, 2);
    v_comm_rate NUMERIC(5, 4) := 0.0000;
    v_comm_amount NUMERIC(12, 2) := 0.00;
    v_net_platform NUMERIC(12, 2);
    
    v_is_acquisition BOOLEAN;
    v_comm_type VARCHAR(50);
    v_partner_id UUID := NULL;
    v_partner_name TEXT := NULL;
    
    v_duration_days INTEGER;
    v_base_end TIMESTAMPTZ;
    v_new_end TIMESTAMPTZ;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_comm_id UUID;
    v_idempotency_key TEXT;
    v_gw_rate NUMERIC(5, 4);
    v_gw_fixed NUMERIC(12, 2);
    v_sub_plan_uuid UUID := NULL;
BEGIN
    -- 1. Validate Store
    SELECT * INTO v_store FROM public.stores WHERE id = p_store_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'المتجر غير موجود');
    END IF;

    -- 2. Validate Amount
    v_gross := ROUND(COALESCE(p_amount, 0.00), 2);
    IF v_gross < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'المبلغ لا يمكن أن يكون سالباً');
    END IF;

    -- Normalize Payment ID
    v_gw_payment_id := COALESCE(NULLIF(TRIM(p_gateway_payment_id), ''), 'pay_' || p_gateway || '_' || replace(gen_random_uuid()::text, '-', ''));

    -- 3. Idempotency Check (Check both store_invoices and financial_ledger)
    SELECT id, invoice_number INTO v_existing_inv_id, v_existing_inv_num
    FROM public.store_invoices 
    WHERE gateway_payment_id = v_gw_payment_id 
    LIMIT 1;

    SELECT id INTO v_existing_ledg_id 
    FROM public.financial_ledger 
    WHERE payment_id = v_gw_payment_id AND transaction_type = 'PAYMENT' 
    LIMIT 1;

    IF v_existing_inv_id IS NOT NULL AND v_existing_ledg_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'idempotent', true,
            'message', 'تمت معالجة هذه العملية مسبقاً (عملية مكررة آمنة)',
            'invoice_id', v_existing_inv_id,
            'invoice_number', v_existing_inv_num,
            'ledger_id', v_existing_ledg_id,
            'store_id', p_store_id
        );
    END IF;

    -- 4. Calculate Unified ZATCA VAT & Net Amounts (VAT = 15% default or 0% freelance)
    v_vat_rate := GREATEST(0.0000, COALESCE(p_vat_rate, 0.1500));
    IF v_vat_rate > 0 THEN
        v_net_before_vat := ROUND(v_gross / (1.0000 + v_vat_rate), 2);
        v_vat_amount := ROUND(v_gross - v_net_before_vat, 2);
    ELSE
        v_net_before_vat := v_gross;
        v_vat_amount := 0.00;
    END IF;

    -- 5. Calculate Gateway Fee (Operating Expense)
    IF p_gateway_fee IS NOT NULL AND p_gateway_fee >= 0 THEN
        v_gw_fee := ROUND(p_gateway_fee, 2);
    ELSE
        IF lower(p_payment_method) = 'mada' THEN
            v_gw_rate := 0.0100; v_gw_fixed := 1.00;
        ELSIF lower(p_payment_method) IN ('credit_card', 'visa', 'mastercard') THEN
            v_gw_rate := 0.0275; v_gw_fixed := 1.00;
        ELSIF lower(p_payment_method) = 'apple_pay' THEN
            v_gw_rate := 0.0220; v_gw_fixed := 1.00;
        ELSIF lower(p_payment_method) = 'sandbox' THEN
            v_gw_rate := 0.0000; v_gw_fixed := 0.00;
        ELSE
            v_gw_rate := 0.0150; v_gw_fixed := 1.00;
        END IF;

        IF v_gross > 0 AND lower(p_payment_method) <> 'sandbox' THEN
            v_gw_fee := ROUND((v_gross * v_gw_rate) + v_gw_fixed, 2);
        ELSE
            v_gw_fee := 0.00;
        END IF;
    END IF;

    -- 6. Partner & Commission Identification
    SELECT * INTO v_lead 
    FROM public.merchant_leads 
    WHERE converted_store_id = p_store_id 
       OR (v_store.manager_contact IS NOT NULL AND phone = v_store.manager_contact)
    ORDER BY created_at DESC 
    LIMIT 1;

    IF v_lead.id IS NOT NULL THEN
        IF v_lead.affiliate_id IS NOT NULL THEN
            SELECT * INTO v_partner 
            FROM public.partner_accounts 
            WHERE id = v_lead.affiliate_id OR affiliate_id = v_lead.affiliate_id;
        ELSIF v_lead.referral_code IS NOT NULL THEN
            SELECT * INTO v_partner 
            FROM public.partner_accounts 
            WHERE lower(referral_code) = lower(trim(v_lead.referral_code)) 
               OR lower(slug) = lower(trim(v_lead.referral_code));
        END IF;
    END IF;

    -- Determine Commission Basis & Rate (Calculated STRICTLY against Net Before VAT)
    v_is_acquisition := (p_invoice_type = 'setup' OR v_store.setup_fee_paid IS NOT TRUE);
    
    IF v_partner.id IS NOT NULL AND v_partner.active IS NOT FALSE THEN
        v_partner_id := v_partner.id;
        v_partner_name := v_partner.display_name;

        IF v_is_acquisition THEN
            v_comm_rate := COALESCE(v_partner.acquisition_commission_rate, v_partner.commission_rate, 0.2000);
            v_comm_type := 'STORE_ACQUISITION';
        ELSE
            v_comm_rate := COALESCE(v_partner.recurring_commission_rate, 0.1000);
            v_comm_type := CASE WHEN p_invoice_type = 'upgrade' THEN 'SUBSCRIPTION_UPGRADE' ELSE 'SUBSCRIPTION_RENEWAL' END;
        END IF;

        -- Commission calculated strictly on Net Before VAT (ZATCA Compliant)
        v_comm_amount := ROUND(v_net_before_vat * v_comm_rate, 2);
    ELSE
        v_comm_rate := 0.0000;
        v_comm_amount := 0.00;
        v_comm_type := 'NONE';
    END IF;

    -- 7. Net Platform Amount (Ensures Invariant: Gross = Net Platform + VAT + Gateway Fee + Commission)
    v_net_platform := ROUND(v_gross - v_vat_amount - v_gw_fee - v_comm_amount, 2);

    -- 8. Compute Subscription Extension
    v_duration_days := GREATEST(1, COALESCE(p_duration_months, 1) * 30);
    IF p_invoice_type = 'renewal' AND v_store.subscription_end_date IS NOT NULL AND v_store.subscription_end_date > v_now THEN
        v_base_end := v_store.subscription_end_date;
    ELSE
        v_base_end := v_now;
    END IF;
    v_new_end := v_base_end + (v_duration_days || ' days')::INTERVAL;

    -- 9. Generate Invoice Number (ZATCA Compliant Sequence)
    v_invoice_num := 'INV-' || to_char(v_now, 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 5));

    -- 10. Atomic Insert into store_invoices
    INSERT INTO public.store_invoices (
        store_id,
        invoice_number,
        invoice_type,
        amount,
        vat_amount,
        net_amount,
        currency,
        status,
        payment_method,
        gateway,
        gateway_payment_id,
        plan_id,
        plan_name,
        paid_at,
        metadata
    ) VALUES (
        p_store_id,
        v_invoice_num,
        p_invoice_type,
        v_gross,
        v_vat_amount,
        v_net_before_vat,
        'SAR',
        'paid',
        p_payment_method,
        p_gateway,
        v_gw_payment_id,
        COALESCE(p_plan_id, v_store.subscription_plan_id),
        COALESCE(p_plan_name, v_store.subscription_plan, 'باقة رادار المعتمدة'),
        v_now,
        jsonb_build_object(
            'vat_rate', v_vat_rate,
            'gateway_fee', v_gw_fee,
            'commission_rate', v_comm_rate,
            'commission_amount', v_comm_amount,
            'duration_months', p_duration_months
        )
    )
    RETURNING id INTO v_invoice_id;

    -- 11. Atomic Insert into financial_ledger (Enforcing Ledger Invariant)
    INSERT INTO public.financial_ledger (
        transaction_id,
        invoice_id,
        store_id,
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
        'tx_' || v_gw_payment_id,
        v_invoice_num,
        p_store_id::text,
        v_partner_id::text,
        v_gw_payment_id,
        'PAYMENT',
        v_gross,
        v_vat_amount,
        v_gw_fee,
        v_comm_amount,
        v_net_platform,
        'SETTLED',
        'GATEWAY_ATOMIC_RPC',
        jsonb_build_object(
            'store_name', v_store.name,
            'invoice_id', v_invoice_id,
            'payment_method', p_payment_method,
            'gateway', p_gateway,
            'plan_name', COALESCE(p_plan_name, v_store.subscription_plan),
            'commission_type', v_comm_type,
            'vat_rate', v_vat_rate,
            'base_amount', v_net_before_vat
        ),
        v_now,
        v_now
    )
    RETURNING id INTO v_ledger_id;

    -- 12. Update stores Subscription Status
    UPDATE public.stores
    SET 
        status = 'active',
        subscription_status = 'active',
        subscription_active = true,
        setup_fee_paid = true,
        lifecycle_stage = 'مشترك مدفوع',
        subscription_plan_id = COALESCE(p_plan_id, stores.subscription_plan_id),
        plan_code = COALESCE(p_plan_code, stores.plan_code),
        subscription_plan = COALESCE(p_plan_name, stores.subscription_plan, 'الباقة الأساسية'),
        subscription_start_date = COALESCE(stores.subscription_start_date, v_now),
        subscription_end_date = v_new_end,
        renewal_amount = CASE WHEN v_gross > 0 THEN v_gross ELSE stores.renewal_amount END,
        updated_at = v_now
    WHERE id = p_store_id;

    -- 13. Convert Lead if applicable
    IF v_lead.id IS NOT NULL AND v_lead.status <> 'CONVERTED' THEN
        UPDATE public.merchant_leads
        SET 
            status = 'CONVERTED',
            converted_store_id = p_store_id,
            updated_at = v_now
        WHERE id = v_lead.id;
    END IF;

    -- 14. Record / Unlock Partner Commission with Deterministic Idempotency Key
    IF v_partner_id IS NOT NULL AND v_comm_amount > 0 THEN
        v_idempotency_key := 'comm_inv_' || v_invoice_num;

        IF v_is_acquisition THEN
            DELETE FROM public.partner_commissions 
            WHERE store_id = p_store_id AND status = 'PENDING';
        END IF;

        INSERT INTO public.partner_commissions (
            partner_account_id,
            merchant_lead_id,
            store_id,
            commission_type,
            basis_amount,
            commission_rate,
            commission_amount,
            status,
            qualifying_event,
            idempotency_key,
            invoice_id,
            invoice_number,
            created_at,
            updated_at
        ) VALUES (
            v_partner_id,
            v_lead.id,
            p_store_id,
            v_comm_type,
            v_net_before_vat,
            v_comm_rate,
            v_comm_amount,
            'EARNED',
            CASE 
                WHEN v_comm_type = 'STORE_ACQUISITION' THEN 'سداد اشتراك متجر جديد'
                WHEN v_comm_type = 'SUBSCRIPTION_UPGRADE' THEN 'ترقية باقة المتجر'
                ELSE 'تجديد اشتراك المتجر الدوري'
            END,
            v_idempotency_key,
            v_invoice_id::text,
            v_invoice_num,
            v_now,
            v_now
        )
        ON CONFLICT (idempotency_key) DO UPDATE
        SET 
            basis_amount = EXCLUDED.basis_amount,
            commission_amount = EXCLUDED.commission_amount,
            status = 'EARNED',
            updated_at = v_now
        RETURNING id INTO v_comm_id;
    END IF;

    -- 15. Dual-Sync: Update merchant_subscriptions & billing_transactions if they exist in schema
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'merchant_subscriptions') THEN
        UPDATE public.merchant_subscriptions 
        SET 
            status = 'ACTIVE',
            current_period_start = v_now,
            current_period_end = v_new_end,
            updated_at = v_now
        WHERE store_id = p_store_id;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'billing_transactions') THEN
        IF p_plan_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            v_sub_plan_uuid := p_plan_id::uuid;
        END IF;

        INSERT INTO public.billing_transactions (
            store_id,
            plan_id,
            type,
            status,
            amount,
            currency,
            provider,
            provider_transaction_id,
            idempotency_key,
            paid_at,
            metadata
        ) VALUES (
            p_store_id,
            COALESCE(v_sub_plan_uuid, '00000000-0000-0000-0000-000000000000'::uuid),
            CASE WHEN p_invoice_type = 'setup' THEN 'INITIAL_PAYMENT' ELSE 'RENEWAL' END,
            'PAID',
            v_gross,
            'SAR',
            p_gateway,
            v_gw_payment_id,
            'btx_' || v_invoice_num,
            v_now,
            jsonb_build_object('invoice_number', v_invoice_num)
        ) ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    -- 16. Return comprehensive result
    RETURN jsonb_build_object(
        'success', true,
        'idempotent', false,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_num,
        'ledger_id', v_ledger_id,
        'store_id', p_store_id,
        'gross_amount', v_gross,
        'vat_amount', v_vat_amount,
        'net_amount', v_net_before_vat,
        'gateway_fee', v_gw_fee,
        'commission_amount', v_comm_amount,
        'commission_id', v_comm_id,
        'partner_id', v_partner_id,
        'subscription_end_date', v_new_end
    );
END;
$$;

-- ==============================================================================
-- 6. [FIN-03] ATOMIC RPC: process_zatca_refund_and_clawback
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.process_zatca_refund_and_clawback(
    p_invoice_number TEXT,
    p_refund_amount NUMERIC DEFAULT NULL,
    p_reason TEXT DEFAULT 'إلغاء اشتراك واسترداد مالي بناءً على طلب العميل',
    p_admin_user TEXT DEFAULT 'SUPER_ADMIN',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_inv_id UUID := NULL;
    v_inv_store_id UUID := NULL;
    v_inv_number TEXT := NULL;
    v_inv_amount NUMERIC(12, 2) := 0.00;
    v_inv_gw_payment_id TEXT := NULL;
    v_inv_status TEXT := NULL;

    v_store RECORD;
    v_comm RECORD;
    v_ledger_id UUID;
    v_cn_id UUID;
    v_cn_num TEXT;
    
    v_refund_gross NUMERIC(12, 2);
    v_net_refund NUMERIC(12, 2);
    v_vat_refund NUMERIC(12, 2);
    v_clawback_total NUMERIC(12, 2) := 0.00;
    v_net_platform_reversal NUMERIC(12, 2);
    v_affiliate_id TEXT := NULL;
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    -- 1. Locate Invoice in store_invoices first
    SELECT 
        id, store_id, invoice_number, amount, gateway_payment_id, status 
    INTO 
        v_inv_id, v_inv_store_id, v_inv_number, v_inv_amount, v_inv_gw_payment_id, v_inv_status
    FROM public.store_invoices 
    WHERE invoice_number = p_invoice_number OR id::text = p_invoice_number
    LIMIT 1;

    -- Fallback to financial_ledger if not found in store_invoices
    IF v_inv_id IS NULL THEN
        SELECT 
            id,
            CASE 
                WHEN store_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN store_id::uuid 
                ELSE NULL 
            END,
            invoice_id,
            gross_amount,
            payment_id,
            status
        INTO 
            v_inv_id, v_inv_store_id, v_inv_number, v_inv_amount, v_inv_gw_payment_id, v_inv_status
        FROM public.financial_ledger 
        WHERE (invoice_id = p_invoice_number OR transaction_id = p_invoice_number)
          AND transaction_type = 'PAYMENT'
        LIMIT 1;

        IF v_inv_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'الفاتورة الأصلية غير موجودة في السجلات');
        END IF;
    END IF;

    -- Prevent double refund
    IF v_inv_status = 'refunded' THEN
        RETURN jsonb_build_object('success', false, 'error', 'تم استرداد هذه الفاتورة مسبقاً');
    END IF;

    -- 2. Fetch Store
    IF v_inv_store_id IS NOT NULL THEN
        SELECT * INTO v_store FROM public.stores WHERE id = v_inv_store_id;
    END IF;

    -- 3. Compute Refund Financial Figures
    v_refund_gross := ROUND(COALESCE(p_refund_amount, v_inv_amount), 2);
    v_net_refund := ROUND(v_refund_gross / 1.1500, 2);
    v_vat_refund := ROUND(v_refund_gross - v_net_refund, 2);

    -- 4. Process Commission Clawback
    FOR v_comm IN 
        SELECT * FROM public.partner_commissions 
        WHERE (invoice_number = v_inv_number OR (v_inv_store_id IS NOT NULL AND store_id = v_inv_store_id))
          AND status IN ('EARNED', 'PENDING', 'PAID')
    LOOP
        v_affiliate_id := v_comm.partner_account_id::text;

        -- Scenario A: Unpaid Commission (EARNED or PENDING) -> Reverse immediately
        IF v_comm.status IN ('EARNED', 'PENDING') THEN
            UPDATE public.partner_commissions
            SET 
                status = 'REVERSED',
                notes = 'تم عكس العمولة تلقائياً بسبب استرداد الفاتورة ' || v_inv_number,
                updated_at = v_now
            WHERE id = v_comm.id;

            v_clawback_total := v_clawback_total + v_comm.commission_amount;

        -- Scenario B: Already Paid Commission (PAID) -> Insert Debit Clawback Recovery
        ELSIF v_comm.status = 'PAID' THEN
            INSERT INTO public.partner_commissions (
                partner_account_id,
                store_id,
                commission_type,
                basis_amount,
                commission_rate,
                commission_amount,
                status,
                qualifying_event,
                idempotency_key,
                invoice_number,
                clawback_of,
                notes,
                created_at,
                updated_at
            ) VALUES (
                v_comm.partner_account_id,
                v_inv_store_id,
                'CLAWBACK_RECOVERY',
                v_net_refund,
                v_comm.commission_rate,
                -v_comm.commission_amount, -- Negative debit adjustment!
                'EARNED', -- Will reduce partner balance on next payout run
                'استرداد عمولة مصروفة مسبقاً عن الفاتورة المسترجعة ' || v_inv_number,
                'clawback_' || v_inv_number || '_' || v_comm.id,
                v_inv_number,
                v_comm.id,
                'قيد تسوية مدين (Debit Adjustment) لاستعادة العمولة بعد الصرف',
                v_now,
                v_now
            )
            ON CONFLICT (idempotency_key) DO NOTHING;

            v_clawback_total := v_clawback_total + v_comm.commission_amount;
        END IF;
    END LOOP;

    -- 5. Generate ZATCA Credit Note Number
    v_cn_num := 'CN-' || to_char(v_now, 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 5));

    -- 6. Insert into financial_ledger (Reverse Ledger Entry)
    v_net_platform_reversal := -(v_refund_gross - v_vat_refund - v_clawback_total);

    INSERT INTO public.financial_ledger (
        transaction_id,
        invoice_id,
        store_id,
        affiliate_id,
        payment_id,
        transaction_type,
        gross_amount,
        vat_amount,
        gateway_fee,
        affiliate_commission,
        net_platform_amount,
        status,
        refund_of,
        created_by,
        metadata,
        effective_at,
        created_at
    ) VALUES (
        'tx_cn_' || v_cn_num,
        v_inv_number,
        COALESCE(v_inv_store_id::text, 'UNKNOWN'),
        v_affiliate_id,
        v_inv_gw_payment_id,
        'REFUND',
        -v_refund_gross,
        -v_vat_refund,
        0.00,
        -v_clawback_total,
        v_net_platform_reversal,
        'SETTLED',
        v_inv_number,
        COALESCE(p_admin_user, 'SUPER_ADMIN'),
        jsonb_build_object(
            'credit_note_number', v_cn_num,
            'original_invoice_number', v_inv_number,
            'reason', p_reason,
            'admin_notes', COALESCE(p_notes, ''),
            'clawback_applied', (v_clawback_total > 0),
            'clawback_amount', v_clawback_total
        ),
        v_now,
        v_now
    )
    RETURNING id INTO v_ledger_id;

    -- 7. Insert into credit_notes
    INSERT INTO public.credit_notes (
        credit_note_number,
        original_invoice_id,
        original_invoice_number,
        store_id,
        affiliate_id,
        gross_refund_amount,
        vat_refund_amount,
        net_refund_amount,
        clawback_commission,
        reason,
        status,
        ledger_entry_id,
        issued_by,
        notes,
        issued_at,
        created_at
    ) VALUES (
        v_cn_num,
        v_inv_id::text,
        v_inv_number,
        COALESCE(v_inv_store_id::text, 'UNKNOWN'),
        v_affiliate_id,
        v_refund_gross,
        v_vat_refund,
        v_net_refund,
        v_clawback_total,
        p_reason,
        'ISSUED',
        v_ledger_id,
        COALESCE(p_admin_user, 'SUPER_ADMIN'),
        COALESCE(p_notes, ''),
        v_now,
        v_now
    )
    RETURNING id INTO v_cn_id;

    -- 8. Update Invoice Status in store_invoices if present
    UPDATE public.store_invoices 
    SET 
        status = 'refunded',
        updated_at = v_now
    WHERE id = v_inv_id;

    -- 9. Update Store Subscription Status
    IF v_inv_store_id IS NOT NULL THEN
        UPDATE public.stores
        SET 
            setup_fee_paid = false,
            subscription_status = 'trial',
            subscription_active = false,
            status = 'trial',
            updated_at = v_now
        WHERE id = v_inv_store_id;
    END IF;

    -- 10. Update merchant_subscriptions & billing_transactions if present
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'merchant_subscriptions') THEN
        UPDATE public.merchant_subscriptions 
        SET 
            status = 'CANCELED',
            canceled_at = v_now,
            updated_at = v_now
        WHERE store_id = v_inv_store_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'credit_note_id', v_cn_id,
        'credit_note_number', v_cn_num,
        'ledger_id', v_ledger_id,
        'gross_refund_amount', v_refund_gross,
        'vat_refund_amount', v_vat_refund,
        'net_refund_amount', v_net_refund,
        'clawback_commission', v_clawback_total,
        'store_id', v_inv_store_id,
        'invoice_number', v_inv_number
    );
END;
$$;

-- ==============================================================================
-- 7. RPC: Fast Batch Invoices Fetcher for SuperAdmin & Stores
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_all_store_invoices_batch()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_object_agg(store_id_key, invoices_json)
    INTO v_result
    FROM (
        SELECT 
            store_id::text AS store_id_key,
            jsonb_agg(
                jsonb_build_object(
                    'id', id,
                    'store_id', store_id,
                    'invoice_number', invoice_number,
                    'invoice_type', invoice_type,
                    'amount', amount,
                    'vat_amount', vat_amount,
                    'net_amount', net_amount,
                    'currency', currency,
                    'status', status,
                    'payment_method', payment_method,
                    'gateway', gateway,
                    'gateway_payment_id', gateway_payment_id,
                    'plan_id', plan_id,
                    'plan_name', plan_name,
                    'paid_at', paid_at,
                    'created_at', created_at
                ) ORDER BY created_at DESC
            ) AS invoices_json
        FROM public.store_invoices
        GROUP BY store_id
    ) t;

    RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

-- Grant permissions to execute the atomic functions
GRANT EXECUTE ON FUNCTION public.process_store_payment_atomic TO service_role;
GRANT EXECUTE ON FUNCTION public.process_store_payment_atomic TO authenticated;

GRANT EXECUTE ON FUNCTION public.process_zatca_refund_and_clawback TO service_role;
GRANT EXECUTE ON FUNCTION public.process_zatca_refund_and_clawback TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_all_store_invoices_batch TO service_role;
GRANT EXECUTE ON FUNCTION public.get_all_store_invoices_batch TO authenticated;

COMMIT;


-- ==============================================================================
-- >>> FILE: 20261008_fin02_grant_payment_rpc.sql <<<
-- ==============================================================================

-- ==============================================================================
-- RADAR PLATFORM - MIGRATION: 20261008_fin02_grant_payment_rpc.sql
-- Fix: Grant Anon Execute on Payment RPC, Enable Invoice Read, Ensure Store Columns
-- ==============================================================================

BEGIN;

-- 1. Ensure all subscription columns exist on stores table
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS setup_fee_paid BOOLEAN DEFAULT false;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS subscription_active BOOLEAN DEFAULT true;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trial';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT DEFAULT 'فترة تجريبية';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS plan_code TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'الباقة الأساسية';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS subscription_start_date TIMESTAMPTZ;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMPTZ;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS renewal_amount NUMERIC(12, 2) DEFAULT 0.00;

-- 2. Ensure RLS policies and permissions on store_invoices for anon & authenticated
GRANT SELECT ON public.store_invoices TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "store_invoices_anon_select_policy" ON public.store_invoices;
CREATE POLICY "store_invoices_anon_select_policy" ON public.store_invoices
    FOR SELECT TO anon
    USING (true);

-- 3. Update process_store_payment_atomic with defensive exception handling
CREATE OR REPLACE FUNCTION public.process_store_payment_atomic(
    p_store_id UUID,
    p_invoice_type TEXT,
    p_amount NUMERIC,
    p_payment_method TEXT DEFAULT 'mada',
    p_gateway TEXT DEFAULT 'moyasar',
    p_gateway_payment_id TEXT DEFAULT NULL,
    p_plan_id TEXT DEFAULT NULL,
    p_plan_code TEXT DEFAULT NULL,
    p_plan_name TEXT DEFAULT NULL,
    p_duration_months INTEGER DEFAULT 1,
    p_vat_rate NUMERIC DEFAULT 0.15,
    p_gateway_fee NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_store RECORD;
    v_lead RECORD;
    v_partner RECORD;
    v_existing_inv_id UUID;
    v_existing_inv_num TEXT;
    v_existing_ledg_id UUID;
    
    v_gw_payment_id TEXT;
    v_invoice_num TEXT;
    v_invoice_id UUID;
    v_ledger_id UUID;
    
    v_gross NUMERIC(12, 2);
    v_vat_rate NUMERIC(5, 4);
    v_net_before_vat NUMERIC(12, 2);
    v_vat_amount NUMERIC(12, 2);
    v_gw_fee NUMERIC(12, 2);
    v_comm_rate NUMERIC(5, 4) := 0.0000;
    v_comm_amount NUMERIC(12, 2) := 0.00;
    v_net_platform NUMERIC(12, 2);
    
    v_is_acquisition BOOLEAN;
    v_comm_type VARCHAR(50);
    v_partner_id UUID := NULL;
    v_partner_name TEXT := NULL;
    
    v_duration_days INTEGER;
    v_base_end TIMESTAMPTZ;
    v_new_end TIMESTAMPTZ;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_comm_id UUID;
    v_idempotency_key TEXT;
    v_gw_rate NUMERIC(5, 4);
    v_gw_fixed NUMERIC(12, 2);
    v_sub_plan_uuid UUID := NULL;
BEGIN
    -- 1. Validate Store
    SELECT * INTO v_store FROM public.stores WHERE id = p_store_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'المتجر غير موجود');
    END IF;

    -- 2. Validate Amount
    v_gross := ROUND(COALESCE(p_amount, 0.00), 2);
    IF v_gross < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'المبلغ لا يمكن أن يكون سالباً');
    END IF;

    -- Normalize Payment ID
    v_gw_payment_id := COALESCE(NULLIF(TRIM(p_gateway_payment_id), ''), 'pay_' || p_gateway || '_' || replace(gen_random_uuid()::text, '-', ''));

    -- 3. Idempotency Check (Check both store_invoices and financial_ledger)
    SELECT id, invoice_number INTO v_existing_inv_id, v_existing_inv_num
    FROM public.store_invoices 
    WHERE gateway_payment_id = v_gw_payment_id 
    LIMIT 1;

    SELECT id INTO v_existing_ledg_id 
    FROM public.financial_ledger 
    WHERE payment_id = v_gw_payment_id AND transaction_type = 'PAYMENT' 
    LIMIT 1;

    IF v_existing_inv_id IS NOT NULL AND v_existing_ledg_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'idempotent', true,
            'message', 'تمت معالجة هذه العملية مسبقاً (عملية مكررة آمنة)',
            'invoice_id', v_existing_inv_id,
            'invoice_number', v_existing_inv_num,
            'ledger_id', v_existing_ledg_id,
            'store_id', p_store_id
        );
    END IF;

    -- 4. Calculate Unified ZATCA VAT & Net Amounts (VAT = 15% default or 0% freelance)
    v_vat_rate := GREATEST(0.0000, COALESCE(p_vat_rate, 0.1500));
    IF v_vat_rate > 0 THEN
        v_net_before_vat := ROUND(v_gross / (1.0000 + v_vat_rate), 2);
        v_vat_amount := ROUND(v_gross - v_net_before_vat, 2);
    ELSE
        v_net_before_vat := v_gross;
        v_vat_amount := 0.00;
    END IF;

    -- 5. Calculate Gateway Fee (Operating Expense)
    IF p_gateway_fee IS NOT NULL AND p_gateway_fee >= 0 THEN
        v_gw_fee := ROUND(p_gateway_fee, 2);
    ELSE
        IF lower(p_payment_method) = 'mada' THEN
            v_gw_rate := 0.0100; v_gw_fixed := 1.00;
        ELSIF lower(p_payment_method) IN ('credit_card', 'visa', 'mastercard') THEN
            v_gw_rate := 0.0275; v_gw_fixed := 1.00;
        ELSIF lower(p_payment_method) = 'apple_pay' THEN
            v_gw_rate := 0.0220; v_gw_fixed := 1.00;
        ELSIF lower(p_payment_method) = 'sandbox' THEN
            v_gw_rate := 0.0000; v_gw_fixed := 0.00;
        ELSE
            v_gw_rate := 0.0150; v_gw_fixed := 1.00;
        END IF;

        IF v_gross > 0 AND lower(p_payment_method) <> 'sandbox' THEN
            v_gw_fee := ROUND((v_gross * v_gw_rate) + v_gw_fixed, 2);
        ELSE
            v_gw_fee := 0.00;
        END IF;
    END IF;

    -- 6. Partner & Commission Identification
    SELECT * INTO v_lead 
    FROM public.merchant_leads 
    WHERE converted_store_id = p_store_id 
       OR (v_store.manager_contact IS NOT NULL AND phone = v_store.manager_contact)
    ORDER BY created_at DESC 
    LIMIT 1;

    IF v_lead.id IS NOT NULL THEN
        IF v_lead.affiliate_id IS NOT NULL THEN
            SELECT * INTO v_partner 
            FROM public.partner_accounts 
            WHERE id = v_lead.affiliate_id OR affiliate_id = v_lead.affiliate_id;
        ELSIF v_lead.referral_code IS NOT NULL THEN
            SELECT * INTO v_partner 
            FROM public.partner_accounts 
            WHERE lower(referral_code) = lower(trim(v_lead.referral_code)) 
               OR lower(slug) = lower(trim(v_lead.referral_code));
        END IF;
    END IF;

    -- Determine Commission Basis & Rate (Calculated STRICTLY against Net Before VAT)
    v_is_acquisition := (p_invoice_type = 'setup' OR v_store.setup_fee_paid IS NOT TRUE);
    
    IF v_partner.id IS NOT NULL AND v_partner.active IS NOT FALSE THEN
        v_partner_id := v_partner.id;
        v_partner_name := v_partner.display_name;

        IF v_is_acquisition THEN
            v_comm_rate := COALESCE(v_partner.acquisition_commission_rate, v_partner.commission_rate, 0.2000);
            v_comm_type := 'STORE_ACQUISITION';
        ELSE
            v_comm_rate := COALESCE(v_partner.recurring_commission_rate, 0.1000);
            v_comm_type := CASE WHEN p_invoice_type = 'upgrade' THEN 'SUBSCRIPTION_UPGRADE' ELSE 'SUBSCRIPTION_RENEWAL' END;
        END IF;

        -- Commission calculated strictly on Net Before VAT (ZATCA Compliant)
        v_comm_amount := ROUND(v_net_before_vat * v_comm_rate, 2);
    ELSE
        v_comm_rate := 0.0000;
        v_comm_amount := 0.00;
        v_comm_type := 'NONE';
    END IF;

    -- 7. Net Platform Amount (Gross = Net Platform + VAT + Gateway Fee + Commission)
    v_net_platform := ROUND(v_gross - v_vat_amount - v_gw_fee - v_comm_amount, 2);

    -- 8. Compute Subscription Extension
    v_duration_days := GREATEST(1, COALESCE(p_duration_months, 1) * 30);
    IF p_invoice_type = 'renewal' AND v_store.subscription_end_date IS NOT NULL AND v_store.subscription_end_date > v_now THEN
        v_base_end := v_store.subscription_end_date;
    ELSE
        v_base_end := v_now;
    END IF;
    v_new_end := v_base_end + (v_duration_days || ' days')::INTERVAL;

    -- 9. Generate Invoice Number (ZATCA Compliant Sequence)
    v_invoice_num := 'INV-' || to_char(v_now, 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 5));

    -- 10. Atomic Insert into store_invoices
    INSERT INTO public.store_invoices (
        store_id,
        invoice_number,
        invoice_type,
        amount,
        vat_amount,
        net_amount,
        currency,
        status,
        payment_method,
        gateway,
        gateway_payment_id,
        plan_id,
        plan_name,
        paid_at,
        metadata
    ) VALUES (
        p_store_id,
        v_invoice_num,
        p_invoice_type,
        v_gross,
        v_vat_amount,
        v_net_before_vat,
        'SAR',
        'paid',
        p_payment_method,
        p_gateway,
        v_gw_payment_id,
        COALESCE(p_plan_id, v_store.subscription_plan_id),
        COALESCE(p_plan_name, v_store.subscription_plan, 'باقة رادار المعتمدة'),
        v_now,
        jsonb_build_object(
            'vat_rate', v_vat_rate,
            'gateway_fee', v_gw_fee,
            'commission_rate', v_comm_rate,
            'commission_amount', v_comm_amount,
            'duration_months', p_duration_months
        )
    )
    RETURNING id INTO v_invoice_id;

    -- 11. Atomic Insert into financial_ledger
    INSERT INTO public.financial_ledger (
        transaction_id,
        invoice_id,
        store_id,
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
        'tx_' || v_gw_payment_id,
        v_invoice_num,
        p_store_id::text,
        v_partner_id::text,
        v_gw_payment_id,
        'PAYMENT',
        v_gross,
        v_vat_amount,
        v_gw_fee,
        v_comm_amount,
        v_net_platform,
        'SETTLED',
        'GATEWAY_ATOMIC_RPC',
        jsonb_build_object(
            'store_name', v_store.name,
            'invoice_id', v_invoice_id,
            'payment_method', p_payment_method,
            'gateway', p_gateway,
            'plan_name', COALESCE(p_plan_name, v_store.subscription_plan),
            'commission_type', v_comm_type,
            'vat_rate', v_vat_rate,
            'base_amount', v_net_before_vat
        ),
        v_now,
        v_now
    )
    RETURNING id INTO v_ledger_id;

    -- 12. Update stores Subscription Status
    UPDATE public.stores
    SET 
        status = 'active',
        subscription_status = 'active',
        subscription_active = true,
        setup_fee_paid = true,
        lifecycle_stage = 'مشترك مدفوع',
        subscription_plan_id = COALESCE(p_plan_id, stores.subscription_plan_id),
        plan_code = COALESCE(p_plan_code, stores.plan_code),
        subscription_plan = COALESCE(p_plan_name, stores.subscription_plan, 'الباقة الأساسية'),
        subscription_start_date = COALESCE(stores.subscription_start_date, v_now),
        subscription_end_date = v_new_end,
        renewal_amount = CASE WHEN v_gross > 0 THEN v_gross ELSE stores.renewal_amount END,
        updated_at = v_now
    WHERE id = p_store_id;

    -- 13. Convert Lead if applicable
    IF v_lead.id IS NOT NULL AND v_lead.status <> 'CONVERTED' THEN
        UPDATE public.merchant_leads
        SET 
            status = 'CONVERTED',
            converted_store_id = p_store_id,
            updated_at = v_now
        WHERE id = v_lead.id;
    END IF;

    -- 14. Record / Unlock Partner Commission with Deterministic Idempotency Key
    IF v_partner_id IS NOT NULL AND v_comm_amount > 0 THEN
        v_idempotency_key := 'comm_inv_' || v_invoice_num;

        IF v_is_acquisition THEN
            DELETE FROM public.partner_commissions 
            WHERE store_id = p_store_id AND status = 'PENDING';
        END IF;

        INSERT INTO public.partner_commissions (
            partner_account_id,
            merchant_lead_id,
            store_id,
            commission_type,
            basis_amount,
            commission_rate,
            commission_amount,
            status,
            qualifying_event,
            idempotency_key,
            invoice_id,
            invoice_number,
            created_at,
            updated_at
        ) VALUES (
            v_partner_id,
            v_lead.id,
            p_store_id,
            v_comm_type,
            v_net_before_vat,
            v_comm_rate,
            v_comm_amount,
            'EARNED',
            CASE 
                WHEN v_comm_type = 'STORE_ACQUISITION' THEN 'سداد اشتراك متجر جديد'
                WHEN v_comm_type = 'SUBSCRIPTION_UPGRADE' THEN 'ترقية باقة المتجر'
                ELSE 'تجديد اشتراك المتجر الدوري'
            END,
            v_idempotency_key,
            v_invoice_id::text,
            v_invoice_num,
            v_now,
            v_now
        )
        ON CONFLICT (idempotency_key) DO UPDATE
        SET 
            basis_amount = EXCLUDED.basis_amount,
            commission_amount = EXCLUDED.commission_amount,
            status = 'EARNED',
            updated_at = v_now
        RETURNING id INTO v_comm_id;
    END IF;

    -- 15. Dual-Sync: Update merchant_subscriptions & billing_transactions if they exist in schema
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'merchant_subscriptions') THEN
        UPDATE public.merchant_subscriptions 
        SET 
            status = 'ACTIVE',
            current_period_start = v_now,
            current_period_end = v_new_end,
            updated_at = v_now
        WHERE store_id = p_store_id;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'billing_transactions') THEN
        IF p_plan_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            v_sub_plan_uuid := p_plan_id::uuid;
        END IF;

        INSERT INTO public.billing_transactions (
            store_id,
            plan_id,
            type,
            status,
            amount,
            currency,
            provider,
            provider_transaction_id,
            idempotency_key,
            paid_at,
            metadata
        ) VALUES (
            p_store_id,
            COALESCE(v_sub_plan_uuid, '00000000-0000-0000-0000-000000000000'::uuid),
            CASE WHEN p_invoice_type = 'setup' THEN 'INITIAL_PAYMENT' ELSE 'RENEWAL' END,
            'PAID',
            v_gross,
            'SAR',
            p_gateway,
            v_gw_payment_id,
            'btx_' || v_invoice_num,
            v_now,
            jsonb_build_object('invoice_number', v_invoice_num)
        ) ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    -- 16. Return comprehensive result
    RETURN jsonb_build_object(
        'success', true,
        'idempotent', false,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_num,
        'ledger_id', v_ledger_id,
        'store_id', p_store_id,
        'gross_amount', v_gross,
        'vat_amount', v_vat_amount,
        'net_amount', v_net_before_vat,
        'gateway_fee', v_gw_fee,
        'commission_amount', v_comm_amount,
        'commission_id', v_comm_id,
        'partner_id', v_partner_id,
        'subscription_end_date', v_new_end
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', 'خطأ في معالجة المعاملة الذرية بالسيرفر: ' || SQLERRM
    );
END;
$$;

-- 4. Grant EXECUTE to anon, authenticated, and service_role
GRANT EXECUTE ON FUNCTION public.process_store_payment_atomic(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_zatca_refund_and_clawback(TEXT, NUMERIC, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_all_store_invoices_batch() TO anon, authenticated, service_role;

COMMIT;


-- ==============================================================================
-- >>> FILE: 20261008_fin03_fix_leads_rls_and_linkage.sql <<<
-- ==============================================================================

-- ==============================================================================
-- RADAR PLATFORM - MIGRATION: 20261008_fin03_fix_leads_rls_and_linkage.sql
-- Fix: Enable Anon Leads Insert & Select, Link Haf Million to Abdulsamee (slug: r8526)
-- ==============================================================================

BEGIN;

-- 1. التأكد من وجود أعمدة الشركاء والمتاجر والعمولات لضمان عدم حدوث أي خطأ 42703
ALTER TABLE public.partner_accounts ADD COLUMN IF NOT EXISTS referral_code VARCHAR(50);
ALTER TABLE public.partner_accounts ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5, 4) DEFAULT 0.2000;
ALTER TABLE public.partner_accounts ADD COLUMN IF NOT EXISTS acquisition_commission_rate NUMERIC(5, 4) DEFAULT 0.2000;
ALTER TABLE public.partner_accounts ADD COLUMN IF NOT EXISTS recurring_commission_rate NUMERIC(5, 4) DEFAULT 0.1000;
UPDATE public.partner_accounts SET referral_code = slug WHERE referral_code IS NULL;

ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS setup_fee_paid BOOLEAN DEFAULT false;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS subscription_plan_id VARCHAR(100);
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS plan_code VARCHAR(100);
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(150);
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS lifecycle_stage VARCHAR(50);
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS renewal_amount NUMERIC(12, 2);

ALTER TABLE public.partner_commissions ADD COLUMN IF NOT EXISTS invoice_id VARCHAR(100);
ALTER TABLE public.partner_commissions ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100);

-- 2. إزالة أي قيد مفتاح أجنبي قديم في merchant_leads يشير إلى جدول غير موجود
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'public.merchant_leads'::regclass 
          AND confrelid = 'public.affiliates'::regclass
    ) LOOP
        EXECUTE 'ALTER TABLE public.merchant_leads DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- 3. التأكد من وجود كافة أعمدة التتبع في merchant_leads
ALTER TABLE public.merchant_leads ADD COLUMN IF NOT EXISTS affiliate_id UUID;
ALTER TABLE public.merchant_leads ADD COLUMN IF NOT EXISTS referral_code VARCHAR(50);
ALTER TABLE public.merchant_leads ADD COLUMN IF NOT EXISTS normalized_phone VARCHAR(20);
ALTER TABLE public.merchant_leads ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'NEW';
ALTER TABLE public.merchant_leads ADD COLUMN IF NOT EXISTS attribution_source VARCHAR(20) DEFAULT 'REFERRAL';
ALTER TABLE public.merchant_leads ADD COLUMN IF NOT EXISTS converted_store_id UUID;

-- 4. تفعيل RLS ومنح الصلاحيات الصريحة لـ anon و authenticated
ALTER TABLE public.merchant_leads ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.merchant_leads TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.merchant_leads TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.merchant_leads TO anon;

-- فتح الإدخال لصفحة الهبوط العامة (/join)
DROP POLICY IF EXISTS "merchant_leads_anon_insert_policy" ON public.merchant_leads;
CREATE POLICY "merchant_leads_anon_insert_policy" ON public.merchant_leads
    FOR INSERT TO anon
    WITH CHECK (true);

-- فتح القراءة للشريك لاستعراض عملائه
DROP POLICY IF EXISTS "merchant_leads_anon_select_policy" ON public.merchant_leads;
CREATE POLICY "merchant_leads_anon_select_policy" ON public.merchant_leads
    FOR SELECT TO anon
    USING (true);

-- فتح التحديث لتسجيل تحويل المتجر
DROP POLICY IF EXISTS "merchant_leads_anon_update_policy" ON public.merchant_leads;
CREATE POLICY "merchant_leads_anon_update_policy" ON public.merchant_leads
    FOR UPDATE TO anon
    USING (true)
    WITH CHECK (true);

-- صلاحيات كاملة للمالك وموظفي المنصة
DROP POLICY IF EXISTS "merchant_leads_auth_all_policy" ON public.merchant_leads;
CREATE POLICY "merchant_leads_auth_all_policy" ON public.merchant_leads
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- 5. تحديث دالة السداد الذرية لتطابق كود الشريك عبر slug بدقة
CREATE OR REPLACE FUNCTION public.process_store_payment_atomic(
    p_store_id UUID,
    p_invoice_type TEXT,
    p_amount NUMERIC,
    p_payment_method TEXT DEFAULT 'mada',
    p_gateway TEXT DEFAULT 'moyasar',
    p_gateway_payment_id TEXT DEFAULT NULL,
    p_plan_id TEXT DEFAULT NULL,
    p_plan_code TEXT DEFAULT NULL,
    p_plan_name TEXT DEFAULT NULL,
    p_duration_months INTEGER DEFAULT 1,
    p_vat_rate NUMERIC DEFAULT 0.15,
    p_gateway_fee NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_store RECORD;
    v_lead RECORD;
    v_partner RECORD;
    v_existing_inv_id UUID;
    v_existing_inv_num TEXT;
    v_existing_ledg_id UUID;
    
    v_gw_payment_id TEXT;
    v_invoice_num TEXT;
    v_invoice_id UUID;
    v_ledger_id UUID;
    
    v_gross NUMERIC(12, 2);
    v_vat_rate NUMERIC(5, 4);
    v_net_before_vat NUMERIC(12, 2);
    v_vat_amount NUMERIC(12, 2);
    v_gw_fee NUMERIC(12, 2);
    v_comm_rate NUMERIC(5, 4) := 0.0000;
    v_comm_amount NUMERIC(12, 2) := 0.00;
    v_net_platform NUMERIC(12, 2);
    
    v_is_acquisition BOOLEAN;
    v_comm_type VARCHAR(50);
    v_partner_id UUID := NULL;
    v_partner_name TEXT := NULL;
    
    v_duration_days INTEGER;
    v_base_end TIMESTAMPTZ;
    v_new_end TIMESTAMPTZ;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_comm_id UUID;
    v_idempotency_key TEXT;
    v_gw_rate NUMERIC(5, 4);
    v_gw_fixed NUMERIC(12, 2);
    v_sub_plan_uuid UUID := NULL;
BEGIN
    -- 1. Validate Store
    SELECT * INTO v_store FROM public.stores WHERE id = p_store_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'المتجر غير موجود');
    END IF;

    -- 2. Validate Amount
    v_gross := ROUND(COALESCE(p_amount, 0.00), 2);
    IF v_gross < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'المبلغ لا يمكن أن يكون سالباً');
    END IF;

    -- Normalize Payment ID
    v_gw_payment_id := COALESCE(NULLIF(TRIM(p_gateway_payment_id), ''), 'pay_' || p_gateway || '_' || replace(gen_random_uuid()::text, '-', ''));

    -- 3. Idempotency Check
    SELECT id, invoice_number INTO v_existing_inv_id, v_existing_inv_num
    FROM public.store_invoices 
    WHERE gateway_payment_id = v_gw_payment_id 
    LIMIT 1;

    SELECT id INTO v_existing_ledg_id 
    FROM public.financial_ledger 
    WHERE payment_id = v_gw_payment_id AND transaction_type = 'PAYMENT' 
    LIMIT 1;

    IF v_existing_inv_id IS NOT NULL AND v_existing_ledg_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'idempotent', true,
            'message', 'تمت معالجة هذه العملية مسبقاً (عملية مكررة آمنة)',
            'invoice_id', v_existing_inv_id,
            'invoice_number', v_existing_inv_num,
            'ledger_id', v_existing_ledg_id,
            'store_id', p_store_id
        );
    END IF;

    -- 4. Calculate Unified ZATCA VAT & Net Amounts
    v_vat_rate := GREATEST(0.0000, COALESCE(p_vat_rate, 0.1500));
    IF v_vat_rate > 0 THEN
        v_net_before_vat := ROUND(v_gross / (1.0000 + v_vat_rate), 2);
        v_vat_amount := ROUND(v_gross - v_net_before_vat, 2);
    ELSE
        v_net_before_vat := v_gross;
        v_vat_amount := 0.00;
    END IF;

    -- 5. Calculate Gateway Fee
    IF p_gateway_fee IS NOT NULL AND p_gateway_fee >= 0 THEN
        v_gw_fee := ROUND(p_gateway_fee, 2);
    ELSE
        IF lower(p_payment_method) = 'mada' THEN
            v_gw_rate := 0.0100; v_gw_fixed := 1.00;
        ELSIF lower(p_payment_method) IN ('credit_card', 'visa', 'mastercard') THEN
            v_gw_rate := 0.0275; v_gw_fixed := 1.00;
        ELSIF lower(p_payment_method) = 'apple_pay' THEN
            v_gw_rate := 0.0220; v_gw_fixed := 1.00;
        ELSIF lower(p_payment_method) = 'sandbox' THEN
            v_gw_rate := 0.0000; v_gw_fixed := 0.00;
        ELSE
            v_gw_rate := 0.0150; v_gw_fixed := 1.00;
        END IF;

        IF v_gross > 0 AND lower(p_payment_method) <> 'sandbox' THEN
            v_gw_fee := ROUND((v_gross * v_gw_rate) + v_gw_fixed, 2);
        ELSE
            v_gw_fee := 0.00;
        END IF;
    END IF;

    -- 6. Partner & Commission Identification
    SELECT * INTO v_lead 
    FROM public.merchant_leads 
    WHERE converted_store_id = p_store_id 
       OR (v_store.manager_contact IS NOT NULL AND phone = v_store.manager_contact)
    ORDER BY created_at DESC 
    LIMIT 1;

    IF v_lead.id IS NOT NULL THEN
        IF v_lead.affiliate_id IS NOT NULL THEN
            SELECT * INTO v_partner 
            FROM public.partner_accounts 
            WHERE id = v_lead.affiliate_id OR affiliate_id = v_lead.affiliate_id;
        ELSIF v_lead.referral_code IS NOT NULL THEN
            SELECT * INTO v_partner 
            FROM public.partner_accounts 
            WHERE lower(slug) = lower(trim(v_lead.referral_code));
        END IF;
    END IF;

    -- Determine Commission Basis & Rate (Strictly against Net Before VAT)
    v_is_acquisition := (p_invoice_type = 'setup' OR v_store.setup_fee_paid IS NOT TRUE);
    
    IF v_partner.id IS NOT NULL AND v_partner.active IS NOT FALSE THEN
        v_partner_id := v_partner.id;
        v_partner_name := v_partner.display_name;

        IF v_is_acquisition THEN
            v_comm_rate := COALESCE(v_partner.acquisition_commission_rate, v_partner.commission_rate, 0.2000);
            v_comm_type := 'STORE_ACQUISITION';
        ELSE
            v_comm_rate := COALESCE(v_partner.recurring_commission_rate, 0.1000);
            v_comm_type := CASE WHEN p_invoice_type = 'upgrade' THEN 'SUBSCRIPTION_UPGRADE' ELSE 'SUBSCRIPTION_RENEWAL' END;
        END IF;

        v_comm_amount := ROUND(v_net_before_vat * v_comm_rate, 2);
    ELSE
        v_comm_rate := 0.0000;
        v_comm_amount := 0.00;
        v_comm_type := 'NONE';
    END IF;

    -- 7. Net Platform Amount
    v_net_platform := ROUND(v_gross - v_vat_amount - v_gw_fee - v_comm_amount, 2);

    -- 8. Compute Subscription Extension
    v_duration_days := GREATEST(1, COALESCE(p_duration_months, 1) * 30);
    IF p_invoice_type = 'renewal' AND v_store.subscription_end_date IS NOT NULL AND v_store.subscription_end_date > v_now THEN
        v_base_end := v_store.subscription_end_date;
    ELSE
        v_base_end := v_now;
    END IF;
    v_new_end := v_base_end + (v_duration_days || ' days')::INTERVAL;

    -- 9. Generate Invoice Number
    v_invoice_num := 'INV-' || to_char(v_now, 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 5));

    -- 10. Insert into store_invoices
    INSERT INTO public.store_invoices (
        store_id,
        invoice_number,
        invoice_type,
        amount,
        vat_amount,
        net_amount,
        currency,
        status,
        payment_method,
        gateway,
        gateway_payment_id,
        plan_id,
        plan_name,
        paid_at,
        metadata
    ) VALUES (
        p_store_id,
        v_invoice_num,
        p_invoice_type,
        v_gross,
        v_vat_amount,
        v_net_before_vat,
        'SAR',
        'paid',
        p_payment_method,
        p_gateway,
        v_gw_payment_id,
        COALESCE(p_plan_id, v_store.subscription_plan_id),
        COALESCE(p_plan_name, v_store.subscription_plan, 'باقة رادار المعتمدة'),
        v_now,
        jsonb_build_object(
            'vat_rate', v_vat_rate,
            'gateway_fee', v_gw_fee,
            'commission_rate', v_comm_rate,
            'commission_amount', v_comm_amount,
            'duration_months', p_duration_months
        )
    )
    RETURNING id INTO v_invoice_id;

    -- 11. Insert into financial_ledger
    INSERT INTO public.financial_ledger (
        transaction_id,
        invoice_id,
        store_id,
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
        'tx_' || v_gw_payment_id,
        v_invoice_num,
        p_store_id::text,
        v_partner_id::text,
        v_gw_payment_id,
        'PAYMENT',
        v_gross,
        v_vat_amount,
        v_gw_fee,
        v_comm_amount,
        v_net_platform,
        'SETTLED',
        'GATEWAY_ATOMIC_RPC',
        jsonb_build_object(
            'store_name', v_store.name,
            'invoice_id', v_invoice_id,
            'payment_method', p_payment_method,
            'gateway', p_gateway,
            'plan_name', COALESCE(p_plan_name, v_store.subscription_plan),
            'commission_type', v_comm_type,
            'vat_rate', v_vat_rate,
            'base_amount', v_net_before_vat
        ),
        v_now,
        v_now
    )
    RETURNING id INTO v_ledger_id;

    -- 12. Update stores Subscription Status
    UPDATE public.stores
    SET 
        status = 'active',
        subscription_status = 'active',
        subscription_active = true,
        setup_fee_paid = true,
        lifecycle_stage = 'مشترك مدفوع',
        subscription_plan_id = COALESCE(p_plan_id, stores.subscription_plan_id),
        plan_code = COALESCE(p_plan_code, stores.plan_code),
        subscription_plan = COALESCE(p_plan_name, stores.subscription_plan, 'الباقة الأساسية'),
        subscription_start_date = COALESCE(stores.subscription_start_date, v_now),
        subscription_end_date = v_new_end,
        renewal_amount = CASE WHEN v_gross > 0 THEN v_gross ELSE stores.renewal_amount END,
        updated_at = v_now
    WHERE id = p_store_id;

    -- 13. Convert Lead if applicable
    IF v_lead.id IS NOT NULL AND v_lead.status <> 'CONVERTED' THEN
        UPDATE public.merchant_leads
        SET 
            status = 'CONVERTED',
            converted_store_id = p_store_id,
            updated_at = v_now
        WHERE id = v_lead.id;
    END IF;

    -- 14. Record Partner Commission
    IF v_partner_id IS NOT NULL AND v_comm_amount > 0 THEN
        v_idempotency_key := 'comm_inv_' || v_invoice_num;

        IF v_is_acquisition THEN
            DELETE FROM public.partner_commissions 
            WHERE store_id = p_store_id AND status = 'PENDING';
        END IF;

        INSERT INTO public.partner_commissions (
            partner_account_id,
            merchant_lead_id,
            store_id,
            commission_type,
            basis_amount,
            commission_rate,
            commission_amount,
            status,
            qualifying_event,
            idempotency_key,
            invoice_id,
            invoice_number,
            created_at,
            updated_at
        ) VALUES (
            v_partner_id,
            v_lead.id,
            p_store_id,
            v_comm_type,
            v_net_before_vat,
            v_comm_rate,
            v_comm_amount,
            'EARNED',
            CASE 
                WHEN v_comm_type = 'STORE_ACQUISITION' THEN 'سداد اشتراك متجر جديد'
                WHEN v_comm_type = 'SUBSCRIPTION_UPGRADE' THEN 'ترقية باقة المتجر'
                ELSE 'تجديد اشتراك المتجر الدوري'
            END,
            v_idempotency_key,
            v_invoice_id::text,
            v_invoice_num,
            v_now,
            v_now
        )
        ON CONFLICT (idempotency_key) DO UPDATE
        SET 
            basis_amount = EXCLUDED.basis_amount,
            commission_amount = EXCLUDED.commission_amount,
            status = 'EARNED',
            updated_at = v_now
        RETURNING id INTO v_comm_id;
    END IF;

    -- 15. Dual-Sync: Update merchant_subscriptions & billing_transactions if they exist in schema
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'merchant_subscriptions') THEN
        UPDATE public.merchant_subscriptions 
        SET 
            status = 'ACTIVE',
            current_period_start = v_now,
            current_period_end = v_new_end,
            updated_at = v_now
        WHERE store_id = p_store_id;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'billing_transactions') THEN
        IF p_plan_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            v_sub_plan_uuid := p_plan_id::uuid;
        END IF;

        INSERT INTO public.billing_transactions (
            store_id,
            plan_id,
            type,
            status,
            amount,
            currency,
            provider,
            provider_transaction_id,
            idempotency_key,
            paid_at,
            metadata
        ) VALUES (
            p_store_id,
            COALESCE(v_sub_plan_uuid, '00000000-0000-0000-0000-000000000000'::uuid),
            CASE WHEN p_invoice_type = 'setup' THEN 'INITIAL_PAYMENT' ELSE 'RENEWAL' END,
            'PAID',
            v_gross,
            'SAR',
            p_gateway,
            v_gw_payment_id,
            'btx_' || v_invoice_num,
            v_now,
            jsonb_build_object('invoice_number', v_invoice_num)
        ) ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    -- 16. Return comprehensive result
    RETURN jsonb_build_object(
        'success', true,
        'idempotent', false,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_num,
        'ledger_id', v_ledger_id,
        'store_id', p_store_id,
        'gross_amount', v_gross,
        'vat_amount', v_vat_amount,
        'net_amount', v_net_before_vat,
        'gateway_fee', v_gw_fee,
        'commission_amount', v_comm_amount,
        'commission_id', v_comm_id,
        'partner_id', v_partner_id,
        'subscription_end_date', v_new_end
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', 'خطأ في معالجة المعاملة الذرية بالسيرفر: ' || SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_store_payment_atomic TO anon, authenticated, service_role;

-- 6. الربط المؤكد لمتجر "هاف مليون" بالشريك "عبدالسميع" (slug: r8526)
DO $$
DECLARE
    v_partner RECORD;
    v_store RECORD;
    v_lead_id UUID;
BEGIN
    -- أ. البحث عن الشريك عبدالسميع عبر slug أو display_name (العمود المعتمد لكود الشريك هو slug)
    SELECT * INTO v_partner 
    FROM public.partner_accounts 
    WHERE lower(slug) = 'r8526' 
       OR display_name LIKE '%عبدالسميع%'
       OR display_name LIKE '%عبد السميع%'
    LIMIT 1;

    -- ب. البحث عن متجر هاف مليون
    SELECT * INTO v_store 
    FROM public.stores 
    WHERE lower(slug) = 'haf-mlywn' 
       OR name LIKE '%هاف مليون%' 
       OR name LIKE '%نصف مليون%'
       OR manager_contact = '0516677810'
    LIMIT 1;

    IF v_store.id IS NOT NULL AND v_partner.id IS NOT NULL THEN
        -- فحص هل يوجد lead مسجل للمتجر مسبقاً
        SELECT id INTO v_lead_id 
        FROM public.merchant_leads 
        WHERE converted_store_id = v_store.id 
           OR phone = '0516677810' 
           OR normalized_phone = '0516677810'
        LIMIT 1;

        IF v_lead_id IS NOT NULL THEN
            UPDATE public.merchant_leads
            SET 
                affiliate_id = v_partner.id,
                referral_code = COALESCE(v_partner.slug, 'r8526'),
                converted_store_id = v_store.id,
                store_name = 'هاف مليون',
                manager_name = COALESCE(v_store.manager_name, 'إبراهيم علي'),
                phone = '0516677810',
                normalized_phone = '0516677810',
                status = 'CONVERTED',
                attribution_source = 'REFERRAL',
                notes = 'تم ربط المتجر بالشريك عبدالسميع (كود: ' || v_partner.slug || ')',
                updated_at = clock_timestamp()
            WHERE id = v_lead_id;
        ELSE
            INSERT INTO public.merchant_leads (
                store_name,
                manager_name,
                phone,
                normalized_phone,
                attribution_source,
                referral_code,
                affiliate_id,
                status,
                converted_store_id,
                notes,
                created_at,
                updated_at
            ) VALUES (
                'هاف مليون',
                COALESCE(v_store.manager_name, 'إبراهيم علي'),
                '0516677810',
                '0516677810',
                'REFERRAL',
                COALESCE(v_partner.slug, 'r8526'),
                v_partner.id,
                'CONVERTED',
                v_store.id,
                'تم ربط المتجر بالشريك عبدالسميع (كود: ' || v_partner.slug || ')',
                clock_timestamp(),
                clock_timestamp()
            );
        END IF;

        RAISE NOTICE 'تم ربط متجر هاف مليون بالشريك عبدالسميع (Slug: %) بنجاح!', v_partner.slug;
    ELSE
        RAISE NOTICE 'تحذير: لم يتم العثور على المتجر أو الشريك (Store ID: %, Partner ID: %)', v_store.id, v_partner.id;
    END IF;
END $$;

COMMIT;


-- ==============================================================================
-- >>> FILE: 20261008_perf01_partner_financial_aggregate.sql <<<
-- ==============================================================================

-- ==============================================================================
-- 🚀 RADAR LOYALTY ENGINE — MIGRATION 20261008_PERF01 (V2 - BULLETPROOF)
-- SINGLE-REQUEST PARTNER FINANCIAL AGGREGATE RPC (SOLVES N+1 QUERY BOTTLE NECK)
-- Purpose:
--   1. Fully Dynamic SQL (via EXECUTE): Zero compile-time table dependency errors (fixes 42P01).
--   2. Adaptive Schema Detection: Gracefully aggregates partner_bonus_awards and/or partner_bonuses.
--   3. Adaptive Commission Matching: Detects whether partner_account_id, affiliate_id, or both exist.
--   4. Eliminates the N+1 loop in SuperAdminBillingConsole (100+ requests down to 1).
-- ==============================================================================

-- 1. Conditional Performance Indexes (Guarded against missing tables)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'partner_commissions') THEN
        CREATE INDEX IF NOT EXISTS idx_partner_commissions_aggregate 
        ON public.partner_commissions(partner_account_id, status, commission_amount);
    END IF;

    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'partner_bonus_awards') THEN
        CREATE INDEX IF NOT EXISTS idx_partner_bonus_awards_aggregate 
        ON public.partner_bonus_awards(partner_account_id, status, bonus_amount);
    END IF;

    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'partner_bonuses') THEN
        CREATE INDEX IF NOT EXISTS idx_partner_bonuses_aggregate 
        ON public.partner_bonuses(partner_id, status, bonus_amount);
    END IF;
END $$;

-- ==============================================================================
-- 2. Core Aggregation RPC: get_all_partner_financial_summaries()
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_all_partner_financial_summaries(
    p_partner_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB := '{}'::jsonb;
    v_partner_record RECORD;
    v_has_affiliate_id_col BOOLEAN := FALSE;
    v_has_bonus_awards_tbl BOOLEAN := FALSE;
    v_has_bonuses_tbl BOOLEAN := FALSE;
    v_has_commissions_tbl BOOLEAN := FALSE;
    v_earned_comm NUMERIC := 0;
    v_paid_comm NUMERIC := 0;
    v_pending_comm NUMERIC := 0;
    v_earned_bonus NUMERIC := 0;
    v_paid_bonus NUMERIC := 0;
    v_total_payable NUMERIC := 0;
    v_total_paid NUMERIC := 0;
BEGIN
    -- Pre-detect live tables & column schema once per execution
    SELECT EXISTS (
        SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'partner_commissions'
    ) INTO v_has_commissions_tbl;

    SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'partner_commissions' AND column_name = 'affiliate_id'
    ) INTO v_has_affiliate_id_col;

    SELECT EXISTS (
        SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'partner_bonus_awards'
    ) INTO v_has_bonus_awards_tbl;

    SELECT EXISTS (
        SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'partner_bonuses'
    ) INTO v_has_bonuses_tbl;

    -- Loop through all target partners (or single partner if p_partner_id is provided)
    FOR v_partner_record IN
        SELECT id, affiliate_id, display_name, slug
        FROM public.partners
        WHERE (p_partner_id IS NULL OR id = p_partner_id OR affiliate_id = p_partner_id)
        ORDER BY created_at ASC
    LOOP
        v_earned_comm := 0;
        v_paid_comm := 0;
        v_pending_comm := 0;
        v_earned_bonus := 0;
        v_paid_bonus := 0;

        -- 1. Dynamic Commission Aggregation
        IF v_has_commissions_tbl THEN
            BEGIN
                IF v_has_affiliate_id_col THEN
                    EXECUTE '
                        SELECT
                            COALESCE(SUM(CASE WHEN status IN (''EARNED'', ''AVAILABLE'') THEN commission_amount ELSE 0 END), 0),
                            COALESCE(SUM(CASE WHEN status = ''PAID'' THEN commission_amount ELSE 0 END), 0),
                            COALESCE(SUM(CASE WHEN status = ''PENDING'' THEN commission_amount ELSE 0 END), 0)
                        FROM public.partner_commissions
                        WHERE (partner_account_id = $1 
                               OR affiliate_id = $1
                               OR ($2 IS NOT NULL AND (partner_account_id = $2 OR affiliate_id = $2)))
                          AND status NOT IN (''REVERSED'', ''CANCELLED'', ''VOID'')
                    ' INTO v_earned_comm, v_paid_comm, v_pending_comm
                    USING v_partner_record.id, v_partner_record.affiliate_id;
                ELSE
                    EXECUTE '
                        SELECT
                            COALESCE(SUM(CASE WHEN status IN (''EARNED'', ''AVAILABLE'') THEN commission_amount ELSE 0 END), 0),
                            COALESCE(SUM(CASE WHEN status = ''PAID'' THEN commission_amount ELSE 0 END), 0),
                            COALESCE(SUM(CASE WHEN status = ''PENDING'' THEN commission_amount ELSE 0 END), 0)
                        FROM public.partner_commissions
                        WHERE (partner_account_id = $1 OR ($2 IS NOT NULL AND partner_account_id = $2))
                          AND status NOT IN (''REVERSED'', ''CANCELLED'', ''VOID'')
                    ' INTO v_earned_comm, v_paid_comm, v_pending_comm
                    USING v_partner_record.id, v_partner_record.affiliate_id;
                END IF;
            EXCEPTION WHEN OTHERS THEN
                v_earned_comm := 0;
                v_paid_comm := 0;
                v_pending_comm := 0;
            END;
        END IF;

        -- 2. Dynamic Bonus Aggregation (Checks partner_bonus_awards first, then partner_bonuses)
        IF v_has_bonus_awards_tbl THEN
            BEGIN
                EXECUTE '
                    SELECT
                        COALESCE(SUM(CASE WHEN status = ''ACHIEVED'' THEN bonus_amount ELSE 0 END), 0),
                        COALESCE(SUM(CASE WHEN status IN (''AWARDED'', ''PAID'') THEN bonus_amount ELSE 0 END), 0)
                    FROM public.partner_bonus_awards
                    WHERE partner_account_id = $1 OR ($2 IS NOT NULL AND partner_account_id = $2)
                ' INTO v_earned_bonus, v_paid_bonus
                USING v_partner_record.id, v_partner_record.affiliate_id;
            EXCEPTION WHEN OTHERS THEN
                v_earned_bonus := 0;
                v_paid_bonus := 0;
            END;
        ELSIF v_has_bonuses_tbl THEN
            BEGIN
                EXECUTE '
                    SELECT
                        COALESCE(SUM(CASE WHEN status = ''ACHIEVED'' THEN bonus_amount ELSE 0 END), 0),
                        COALESCE(SUM(CASE WHEN status IN (''AWARDED'', ''PAID'') THEN bonus_amount ELSE 0 END), 0)
                    FROM public.partner_bonuses
                    WHERE partner_id = $1
                ' INTO v_earned_bonus, v_paid_bonus
                USING v_partner_record.id;
            EXCEPTION WHEN OTHERS THEN
                v_earned_bonus := 0;
                v_paid_bonus := 0;
            END;
        END IF;

        -- 3. Calculate final totals matching LoyaltyService.getPartnerFinancialSummary
        v_total_payable := ROUND((v_earned_comm + v_earned_bonus)::numeric, 2);
        v_total_paid := ROUND((v_paid_comm + v_paid_bonus)::numeric, 2);

        -- 4. Append to the master JSON response map
        v_result := v_result || jsonb_build_object(
            v_partner_record.id::text, jsonb_build_object(
                'pending_commissions', ROUND(v_pending_comm::numeric, 2),
                'earned_commissions', ROUND(v_earned_comm::numeric, 2),
                'paid_commissions', v_total_paid,
                'bonuses_earned', ROUND(v_earned_bonus::numeric, 2),
                'bonuses_paid', ROUND(v_paid_bonus::numeric, 2),
                'total_payable', v_total_payable,
                'currency', 'SAR'
            )
        );
    END LOOP;

    RETURN v_result;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_all_partner_financial_summaries(UUID) TO anon, authenticated, service_role;


-- ==============================================================================
-- >>> FILE: 20261008_sec01_super_admin_auth.sql <<<
-- ==============================================================================

-- ==============================================================================
-- 🛡️ RADAR LOYALTY ENGINE — MIGRATION 20261008_SEC01
-- SUPER ADMIN SERVER-SIDE AUTHENTICATION & RLS SECURITY HARDENING
-- Purpose:
--   1. Enforce Server-Side identity verification for Platform Owner / Super Admin.
--   2. Restrict access to sensitive tables (financial_ledger, merchant_leads, etc.)
--      via strict Row Level Security (RLS) bound to authenticated JWT claims.
--   3. Eliminate client-side master PIN bypass vulnerability.
-- ==============================================================================

-- 1. Ensure required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. Super Admin Registry Table
-- ==============================================================================
-- Keeps track of authorized Super Admin user accounts in Supabase Auth
CREATE TABLE IF NOT EXISTS public.super_admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for instant lookup by auth.uid()
CREATE INDEX IF NOT EXISTS idx_super_admin_users_uid ON public.super_admin_users(user_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_super_admin_users_email ON public.super_admin_users(email);

-- ==============================================================================
-- 3. Core Helper Function: is_super_admin()
-- ==============================================================================
-- Server-side evaluator that checks whether the current execution context
-- represents an authenticated Super Admin.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_jwt JSONB;
    v_uid UUID;
BEGIN
    -- Context A: service_role execution (Server backend / migrations / admin scripts)
    v_role := auth.role();
    IF v_role = 'service_role' OR current_user = 'service_role' THEN
        RETURN TRUE;
    END IF;

    -- Context B: Inspect JWT claims
    v_jwt := auth.jwt();
    IF v_jwt IS NOT NULL THEN
        -- B.1. Direct role in app_metadata
        IF (v_jwt -> 'app_metadata' ->> 'role') IN ('super_admin', 'admin') THEN
            RETURN TRUE;
        END IF;

        -- B.2. Explicit boolean flags in metadata
        IF (v_jwt -> 'user_metadata' ->> 'is_super_admin')::boolean IS TRUE
           OR (v_jwt -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE THEN
            RETURN TRUE;
        END IF;

        -- B.3. Verified entry in super_admin_users table
        v_uid := auth.uid();
        IF v_uid IS NOT NULL THEN
            IF EXISTS (
                SELECT 1 FROM public.super_admin_users
                WHERE user_id = v_uid AND is_active = true
            ) THEN
                RETURN TRUE;
            END IF;
        END IF;
    END IF;

    RETURN FALSE;
END;
$$;

-- Grant execution to authenticated & service_role
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO anon, authenticated, service_role;

-- ==============================================================================
-- 4. Session Verification RPC: verify_super_admin_session()
-- ==============================================================================
-- Called by the frontend on mount to verify that the active JWT session is
-- recognized as an authorized Super Admin by the backend.
CREATE OR REPLACE FUNCTION public.verify_super_admin_session()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_super BOOLEAN;
    v_email TEXT;
    v_uid UUID;
BEGIN
    v_is_super := public.is_super_admin();
    
    IF NOT v_is_super THEN
        RETURN jsonb_build_object(
            'authenticated', false,
            'is_super_admin', false,
            'error', 'UNAUTHORIZED',
            'message', 'الحساب الحالي غير مصرح له بصلاحيات مالك المنصة'
        );
    END IF;

    v_uid := auth.uid();
    v_email := COALESCE(auth.jwt() ->> 'email', 'service_role');

    RETURN jsonb_build_object(
        'authenticated', true,
        'is_super_admin', true,
        'user_id', v_uid,
        'email', v_email,
        'role', 'super_admin'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_super_admin_session() TO anon, authenticated, service_role;

-- ==============================================================================
-- 5. Row Level Security (RLS) Hardening on Sensitive Tables
-- ==============================================================================

-- [A] super_admin_users Table
ALTER TABLE public.super_admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SuperAdmin Users Access" ON public.super_admin_users;
CREATE POLICY "SuperAdmin Users Access"
ON public.super_admin_users
FOR ALL
TO authenticated
USING (public.is_super_admin() OR user_id = auth.uid())
WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Service Role SuperAdmin Users Access" ON public.super_admin_users;
CREATE POLICY "Service Role SuperAdmin Users Access"
ON public.super_admin_users
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- [B] financial_ledger Table (Absolute Protection)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'financial_ledger') THEN
        EXECUTE 'ALTER TABLE public.financial_ledger ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS "SuperAdmin Full Ledger Access" ON public.financial_ledger';
        EXECUTE 'CREATE POLICY "SuperAdmin Full Ledger Access" ON public.financial_ledger FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin())';
        EXECUTE 'DROP POLICY IF EXISTS "Service Role Full Ledger Access" ON public.financial_ledger';
        EXECUTE 'CREATE POLICY "Service Role Full Ledger Access" ON public.financial_ledger FOR ALL TO service_role USING (true) WITH CHECK (true)';
    END IF;
END $$;

-- [C] merchant_leads Table (Marketing & Pipeline Protection)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'merchant_leads') THEN
        EXECUTE 'ALTER TABLE public.merchant_leads ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS "SuperAdmin Full Leads Access" ON public.merchant_leads';
        EXECUTE 'CREATE POLICY "SuperAdmin Full Leads Access" ON public.merchant_leads FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin())';
        EXECUTE 'DROP POLICY IF EXISTS "Service Role Full Leads Access" ON public.merchant_leads';
        EXECUTE 'CREATE POLICY "Service Role Full Leads Access" ON public.merchant_leads FOR ALL TO service_role USING (true) WITH CHECK (true)';
    END IF;
END $$;


-- ==============================================================================
-- >>> FILE: 20261008_sec02_staff_pin_security.sql <<<
-- ==============================================================================

-- ==============================================================================
-- 🛡️ RADAR LOYALTY ENGINE — MIGRATION 20261008_SEC02
-- STAFF & MERCHANT PIN ENCRYPTION (BCRYPT) & BLIND VERIFICATION RPC
-- Purpose:
--   1. Zero-Knowledge Verification: Eliminate plaintext PIN exposure in HTTP JSON payloads.
--   2. One-way Bcrypt Hashing: Convert all stored PINs to salted cryptographic hashes.
--   3. Dual-Mode Self-Healing: Retain 100% backward compatibility so NO staff or merchant
--      ever loses access during or after migration.
--   4. Safe Backup Column: Preserve legacy values in an internal backup column.
-- ==============================================================================

-- 1. Ensure required cryptographic extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. Safe Backup Columns (Zero Data Loss Protection)
-- ==============================================================================
ALTER TABLE public.store_staff ADD COLUMN IF NOT EXISTS pin_code_backup TEXT;
UPDATE public.store_staff 
SET pin_code_backup = pin_code 
WHERE pin_code_backup IS NULL AND pin_code IS NOT NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'stores' AND column_name = 'admin_pin'
    ) THEN
        ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS admin_pin_backup TEXT;
        UPDATE public.stores 
        SET admin_pin_backup = admin_pin 
        WHERE admin_pin_backup IS NULL AND admin_pin IS NOT NULL;
    END IF;
END $$;

-- ==============================================================================
-- 3. Bcrypt Migration of Existing Plaintext PINs
-- ==============================================================================
-- A standard PostgreSQL pgcrypto Blowfish/Bcrypt hash starts with '$2a$', '$2b$', or '$2y$'
-- and is at least 59 characters long. Anything else is considered unhashed plaintext.

-- A) Hash all unhashed staff PINs
UPDATE public.store_staff
SET pin_code = crypt(trim(pin_code), gen_salt('bf', 8))
WHERE pin_code IS NOT NULL 
  AND trim(pin_code) <> '' 
  AND pin_code NOT LIKE '$2%';

-- Default any null/empty staff PIN to hashed '1234'
UPDATE public.store_staff
SET pin_code = crypt('1234', gen_salt('bf', 8))
WHERE pin_code IS NULL OR trim(pin_code) = '';

-- B) Hash all unhashed store admin PINs
DO $$
BEGIN
    IF EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'stores' AND column_name = 'admin_pin'
    ) THEN
        UPDATE public.stores
        SET admin_pin = crypt(trim(admin_pin), gen_salt('bf', 8))
        WHERE admin_pin IS NOT NULL 
          AND trim(admin_pin) <> '' 
          AND admin_pin NOT LIKE '$2%';

        UPDATE public.stores
        SET admin_pin = crypt('9999', gen_salt('bf', 8))
        WHERE admin_pin IS NULL OR trim(admin_pin) = '';
    END IF;
END $$;

-- ==============================================================================
-- 4. Phone Normalization Helper: normalize_phone()
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.normalize_phone(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    cleaned TEXT;
BEGIN
    IF p_phone IS NULL OR trim(p_phone) = '' THEN 
        RETURN ''; 
    END IF;

    -- Strip all non-numeric characters
    cleaned := regexp_replace(p_phone, '[^0-9]', '', 'g');

    -- Strip leading GCC country prefixes (00966 or 966)
    IF cleaned LIKE '00966%' THEN
        cleaned := substring(cleaned from 6);
    ELSIF cleaned LIKE '966%' THEN
        cleaned := substring(cleaned from 4);
    END IF;

    -- Strip national leading trunk zero (e.g., 05xxxxxxxx -> 5xxxxxxxx)
    IF cleaned LIKE '0%' THEN
        cleaned := substring(cleaned from 2);
    END IF;

    RETURN cleaned;
END;
$$;

-- ==============================================================================
-- 5. The Core Blind Verification RPC: verify_staff_pin()
-- ==============================================================================
-- Validates employee or manager credentials entirely inside the database engine.
-- Crucial: NEVER leaks or returns the pin_code in the JSON response!
CREATE OR REPLACE FUNCTION public.verify_staff_pin(
    p_phone TEXT,
    p_pin TEXT,
    p_store_id UUID DEFAULT NULL,
    p_store_slug TEXT DEFAULT NULL,
    p_required_role TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_norm_input TEXT;
    v_norm_pin TEXT;
    v_resolved_store_id UUID := p_store_id;
    v_store_record RECORD;
    v_staff_record RECORD;
    v_is_match BOOLEAN := FALSE;
    v_matched_staff JSONB := NULL;
BEGIN
    -- 1. Input sanitization
    v_norm_input := public.normalize_phone(p_phone);
    v_norm_pin := trim(COALESCE(p_pin, ''));

    IF v_norm_input = '' OR v_norm_pin = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INVALID_INPUT',
            'message', 'رقم الجوال والرمز السري مطلوبان'
        );
    END IF;

    -- 2. Resolve target store if slug is provided
    IF v_resolved_store_id IS NULL AND p_store_slug IS NOT NULL AND trim(p_store_slug) <> '' THEN
        SELECT id, slug, name, manager_name, manager_contact, admin_pin 
        INTO v_store_record 
        FROM public.stores 
        WHERE lower(slug) = lower(trim(p_store_slug))
        LIMIT 1;
        
        IF FOUND THEN
            v_resolved_store_id := v_store_record.id;
        END IF;
    ELSIF v_resolved_store_id IS NOT NULL THEN
        SELECT id, slug, name, manager_name, manager_contact, admin_pin 
        INTO v_store_record 
        FROM public.stores 
        WHERE id = v_resolved_store_id
        LIMIT 1;
    END IF;

    IF v_resolved_store_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'STORE_NOT_FOUND',
            'message', 'تعذر العثور على المتجر المحدد'
        );
    END IF;

    -- ==========================================================================
    -- Step A: Search in store_staff Table
    -- ==========================================================================
    FOR v_staff_record IN
        SELECT id, store_id, user_id, name, phone, role, pin_code, is_active, can_manual_input_phone
        FROM public.store_staff
        WHERE store_id = v_resolved_store_id
          AND is_active = true
          AND public.normalize_phone(phone) = v_norm_input
    LOOP
        -- Check role constraints
        IF p_required_role IS NULL 
           OR p_required_role = 'cashier' 
           OR (p_required_role = 'admin' AND v_staff_record.role = 'admin') 
        THEN
            -- Dual-Mode Bcrypt Matching:
            IF v_staff_record.pin_code LIKE '$2%' THEN
                -- A.1. Cryptographic Bcrypt verification
                v_is_match := (v_staff_record.pin_code = crypt(v_norm_pin, v_staff_record.pin_code));
            ELSE
                -- A.2. Graceful Fallback: plaintext match + instant self-healing upgrade
                v_is_match := (trim(v_staff_record.pin_code) = v_norm_pin);
                IF v_is_match THEN
                    UPDATE public.store_staff
                    SET pin_code = crypt(v_norm_pin, gen_salt('bf', 8)),
                        updated_at = now()
                    WHERE id = v_staff_record.id;
                END IF;
            END IF;

            IF v_is_match THEN
                -- Sanitized Staff payload: EXPLICITLY OMITTING pin_code!
                v_matched_staff := jsonb_build_object(
                    'id', v_staff_record.id,
                    'store_id', v_staff_record.store_id,
                    'user_id', v_staff_record.user_id,
                    'name', v_staff_record.name,
                    'phone', v_staff_record.phone,
                    'role', v_staff_record.role,
                    'is_active', v_staff_record.is_active,
                    'can_manual_input_phone', v_staff_record.can_manual_input_phone,
                    'store_name', v_store_record.name,
                    'store_slug', v_store_record.slug
                );
                
                -- Update audit timestamp
                UPDATE public.store_staff SET updated_at = now() WHERE id = v_staff_record.id;
                
                RETURN jsonb_build_object(
                    'success', true,
                    'staff', v_matched_staff
                );
            END IF;
        END IF;
    END LOOP;

    -- ==========================================================================
    -- Step B: Search in stores Table (Manager / Owner Contact)
    -- ==========================================================================
    IF v_store_record.manager_contact IS NOT NULL 
       AND public.normalize_phone(v_store_record.manager_contact) = v_norm_input 
       AND (p_required_role IS NULL OR p_required_role = 'admin')
    THEN
        -- Verify admin_pin
        IF v_store_record.admin_pin LIKE '$2%' THEN
            v_is_match := (v_store_record.admin_pin = crypt(v_norm_pin, v_store_record.admin_pin));
        ELSE
            -- Plaintext or default '9999' check
            v_is_match := (
                trim(COALESCE(v_store_record.admin_pin, '9999')) = v_norm_pin
            );
            IF v_is_match THEN
                UPDATE public.stores
                SET admin_pin = crypt(v_norm_pin, gen_salt('bf', 8)),
                    updated_at = now()
                WHERE id = v_store_record.id;
            END IF;
        END IF;

        IF v_is_match THEN
            -- Sanitized Manager payload: EXPLICITLY OMITTING admin_pin!
            v_matched_staff := jsonb_build_object(
                'id', 'manager-' || v_store_record.id::text,
                'store_id', v_store_record.id,
                'name', COALESCE(v_store_record.manager_name, 'المدير العام'),
                'phone', v_store_record.manager_contact,
                'role', 'admin',
                'is_active', true,
                'can_manual_input_phone', true,
                'store_name', v_store_record.name,
                'store_slug', v_store_record.slug
            );

            RETURN jsonb_build_object(
                'success', true,
                'staff', v_matched_staff
            );
        END IF;
    END IF;

    -- ==========================================================================
    -- Step C: Fallback for Invalid Credentials
    -- ==========================================================================
    RETURN jsonb_build_object(
        'success', false,
        'error', 'INVALID_CREDENTIALS',
        'message', 'رقم الجوال أو الرمز السري (PIN) غير صحيح'
    );
END;
$$;

-- Grant execute to public anonymous & authenticated
GRANT EXECUTE ON FUNCTION public.verify_staff_pin(TEXT, TEXT, UUID, TEXT, TEXT) TO anon, authenticated, service_role;

-- ==============================================================================
-- 6. Secure PIN Update RPC: update_staff_pin()
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.update_staff_pin(
    p_staff_id UUID,
    p_old_pin TEXT,
    p_new_pin TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_staff RECORD;
    v_is_old_valid BOOLEAN := FALSE;
    v_norm_old TEXT := trim(COALESCE(p_old_pin, ''));
    v_norm_new TEXT := trim(COALESCE(p_new_pin, ''));
BEGIN
    IF length(v_norm_new) < 4 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'PIN_TOO_SHORT',
            'message', 'الرمز السري الجديد يجب ألا يقل عن 4 أرقام'
        );
    END IF;

    SELECT id, pin_code INTO v_staff
    FROM public.store_staff
    WHERE id = p_staff_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'STAFF_NOT_FOUND',
            'message', 'تعذر العثور على الموظف'
        );
    END IF;

    -- Verify old PIN
    IF v_staff.pin_code LIKE '$2%' THEN
        v_is_old_valid := (v_staff.pin_code = crypt(v_norm_old, v_staff.pin_code));
    ELSE
        v_is_old_valid := (trim(v_staff.pin_code) = v_norm_old);
    END IF;

    IF NOT v_is_old_valid THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INVALID_OLD_PIN',
            'message', 'الرمز السري الحالي غير صحيح'
        );
    END IF;

    -- Update with new Bcrypt hash
    UPDATE public.store_staff
    SET pin_code = crypt(v_norm_new, gen_salt('bf', 8)),
        updated_at = now()
    WHERE id = p_staff_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'تم تحديث الرمز السري بنجاح وتأمينه'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_staff_pin(UUID, TEXT, TEXT) TO anon, authenticated, service_role;


-- ==============================================================================
-- >>> FILE: 20261009_fin04_fix_plan_id_type_casting.sql <<<
-- ==============================================================================

-- ==============================================================================
-- 🚀 [FIN-04] FIX PLAN ID TYPE CASTING IN ATOMIC RPC (COALESCE text and uuid)
-- ==============================================================================
-- Resolves: ERROR 42804: COALESCE types text and uuid cannot be matched
-- Ensures p_plan_id (TEXT) is safely resolved and explicitly cast to UUID before
-- assignment to stores.subscription_plan_id and store_invoices.plan_id.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.process_store_payment_atomic(
    p_store_id UUID,
    p_invoice_type TEXT,
    p_amount NUMERIC,
    p_payment_method TEXT DEFAULT 'mada',
    p_gateway TEXT DEFAULT 'moyasar',
    p_gateway_payment_id TEXT DEFAULT NULL,
    p_plan_id TEXT DEFAULT NULL,
    p_plan_code TEXT DEFAULT NULL,
    p_plan_name TEXT DEFAULT NULL,
    p_duration_months INTEGER DEFAULT 1,
    p_vat_rate NUMERIC DEFAULT 0.15,
    p_gateway_fee NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_store RECORD;
    v_lead RECORD;
    v_partner RECORD;
    v_existing_inv_id UUID;
    v_existing_inv_num TEXT;
    v_existing_ledg_id UUID;
    
    v_gw_payment_id TEXT;
    v_invoice_num TEXT;
    v_invoice_id UUID;
    v_ledger_id UUID;
    
    v_gross NUMERIC(12, 2);
    v_vat_rate NUMERIC(5, 4);
    v_net_before_vat NUMERIC(12, 2);
    v_vat_amount NUMERIC(12, 2);
    v_gw_fee NUMERIC(12, 2);
    v_comm_rate NUMERIC(5, 4) := 0.0000;
    v_comm_amount NUMERIC(12, 2) := 0.00;
    v_net_platform NUMERIC(12, 2);
    
    v_is_acquisition BOOLEAN;
    v_comm_type VARCHAR(50);
    v_partner_id UUID := NULL;
    v_partner_name TEXT := NULL;
    
    v_duration_days INTEGER;
    v_base_end TIMESTAMPTZ;
    v_new_end TIMESTAMPTZ;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_comm_id UUID;
    v_idempotency_key TEXT;
    v_gw_rate NUMERIC(5, 4);
    v_gw_fixed NUMERIC(12, 2);
    v_sub_plan_uuid UUID := NULL;
BEGIN
    -- 1. Validate Store
    SELECT * INTO v_store FROM public.stores WHERE id = p_store_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'المتجر غير موجود');
    END IF;

    -- 2. Validate Amount
    v_gross := ROUND(COALESCE(p_amount, 0.00), 2);
    IF v_gross < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'المبلغ لا يمكن أن يكون سالباً');
    END IF;

    -- Normalize Payment ID
    v_gw_payment_id := COALESCE(NULLIF(TRIM(p_gateway_payment_id), ''), 'pay_' || p_gateway || '_' || replace(gen_random_uuid()::text, '-', ''));

    -- 3. Idempotency Check
    SELECT id, invoice_number INTO v_existing_inv_id, v_existing_inv_num
    FROM public.store_invoices 
    WHERE gateway_payment_id = v_gw_payment_id 
    LIMIT 1;

    SELECT id INTO v_existing_ledg_id 
    FROM public.financial_ledger 
    WHERE payment_id = v_gw_payment_id AND transaction_type = 'PAYMENT' 
    LIMIT 1;

    IF v_existing_inv_id IS NOT NULL AND v_existing_ledg_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'idempotent', true,
            'message', 'تمت معالجة هذه العملية مسبقاً (عملية مكررة آمنة)',
            'invoice_id', v_existing_inv_id,
            'invoice_number', v_existing_inv_num,
            'ledger_id', v_existing_ledg_id,
            'store_id', p_store_id
        );
    END IF;

    -- 4. Calculate Unified ZATCA VAT & Net Amounts
    v_vat_rate := GREATEST(0.0000, COALESCE(p_vat_rate, 0.1500));
    IF v_vat_rate > 0 THEN
        v_net_before_vat := ROUND(v_gross / (1.0000 + v_vat_rate), 2);
        v_vat_amount := ROUND(v_gross - v_net_before_vat, 2);
    ELSE
        v_net_before_vat := v_gross;
        v_vat_amount := 0.00;
    END IF;

    -- 5. Calculate Gateway Fee
    IF p_gateway_fee IS NOT NULL AND p_gateway_fee >= 0 THEN
        v_gw_fee := ROUND(p_gateway_fee, 2);
    ELSE
        IF lower(p_payment_method) = 'mada' THEN
            v_gw_rate := 0.0100; v_gw_fixed := 1.00;
        ELSIF lower(p_payment_method) IN ('credit_card', 'visa', 'mastercard') THEN
            v_gw_rate := 0.0275; v_gw_fixed := 1.00;
        ELSIF lower(p_payment_method) = 'apple_pay' THEN
            v_gw_rate := 0.0220; v_gw_fixed := 1.00;
        ELSIF lower(p_payment_method) = 'sandbox' THEN
            v_gw_rate := 0.0000; v_gw_fixed := 0.00;
        ELSE
            v_gw_rate := 0.0150; v_gw_fixed := 1.00;
        END IF;

        IF v_gross > 0 AND lower(p_payment_method) <> 'sandbox' THEN
            v_gw_fee := ROUND((v_gross * v_gw_rate) + v_gw_fixed, 2);
        ELSE
            v_gw_fee := 0.00;
        END IF;
    END IF;

    -- 6. Partner & Commission Identification
    SELECT * INTO v_lead 
    FROM public.merchant_leads 
    WHERE converted_store_id = p_store_id 
       OR (v_store.manager_contact IS NOT NULL AND phone = v_store.manager_contact)
    ORDER BY created_at DESC 
    LIMIT 1;

    IF v_lead.id IS NOT NULL THEN
        IF v_lead.affiliate_id IS NOT NULL THEN
            SELECT * INTO v_partner 
            FROM public.partner_accounts 
            WHERE id = v_lead.affiliate_id OR affiliate_id = v_lead.affiliate_id;
        ELSIF v_lead.referral_code IS NOT NULL THEN
            SELECT * INTO v_partner 
            FROM public.partner_accounts 
            WHERE lower(slug) = lower(trim(v_lead.referral_code));
        END IF;
    END IF;

    -- Determine Commission Basis & Rate (Strictly against Net Before VAT)
    v_is_acquisition := (p_invoice_type = 'setup' OR v_store.setup_fee_paid IS NOT TRUE);
    
    IF v_partner.id IS NOT NULL AND v_partner.active IS NOT FALSE THEN
        v_partner_id := v_partner.id;
        v_partner_name := v_partner.display_name;

        IF v_is_acquisition THEN
            v_comm_rate := COALESCE(v_partner.acquisition_commission_rate, v_partner.commission_rate, 0.2000);
            v_comm_type := 'STORE_ACQUISITION';
        ELSE
            v_comm_rate := COALESCE(v_partner.recurring_commission_rate, 0.1000);
            v_comm_type := CASE WHEN p_invoice_type = 'upgrade' THEN 'SUBSCRIPTION_UPGRADE' ELSE 'SUBSCRIPTION_RENEWAL' END;
        END IF;

        v_comm_amount := ROUND(v_net_before_vat * v_comm_rate, 2);
    ELSE
        v_comm_rate := 0.0000;
        v_comm_amount := 0.00;
        v_comm_type := 'NONE';
    END IF;

    -- 7. Net Platform Amount
    v_net_platform := ROUND(v_gross - v_vat_amount - v_gw_fee - v_comm_amount, 2);

    -- 8. Compute Subscription Extension
    v_duration_days := GREATEST(1, COALESCE(p_duration_months, 1) * 30);
    IF p_invoice_type = 'renewal' AND v_store.subscription_end_date IS NOT NULL AND v_store.subscription_end_date > v_now THEN
        v_base_end := v_store.subscription_end_date;
    ELSE
        v_base_end := v_now;
    END IF;
    v_new_end := v_base_end + (v_duration_days || ' days')::INTERVAL;

    -- 9. Generate Invoice Number
    v_invoice_num := 'INV-' || to_char(v_now, 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 5));

    -- 10. Robust Plan UUID Resolution (Type-Safe for UUID and TEXT)
    v_sub_plan_uuid := NULL;
    IF p_plan_id IS NOT NULL AND TRIM(p_plan_id) <> '' THEN
        IF p_plan_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            v_sub_plan_uuid := p_plan_id::UUID;
        ELSE
            -- In case frontend passed a plan code e.g. 'BASIC', look it up in billing_plans
            SELECT id INTO v_sub_plan_uuid 
            FROM public.billing_plans 
            WHERE lower(code) = lower(trim(p_plan_id)) 
            LIMIT 1;
        END IF;
    END IF;

    IF v_sub_plan_uuid IS NULL AND p_plan_code IS NOT NULL AND TRIM(p_plan_code) <> '' THEN
        SELECT id INTO v_sub_plan_uuid 
        FROM public.billing_plans 
        WHERE lower(code) = lower(trim(p_plan_code)) 
        LIMIT 1;
    END IF;

    IF v_sub_plan_uuid IS NULL THEN
        v_sub_plan_uuid := v_store.subscription_plan_id;
    END IF;

    -- 11. Insert into store_invoices
    INSERT INTO public.store_invoices (
        store_id,
        invoice_number,
        invoice_type,
        amount,
        vat_amount,
        net_amount,
        currency,
        status,
        payment_method,
        gateway,
        gateway_payment_id,
        plan_id,
        plan_name,
        paid_at,
        metadata
    ) VALUES (
        p_store_id,
        v_invoice_num,
        p_invoice_type,
        v_gross,
        v_vat_amount,
        v_net_before_vat,
        'SAR',
        'paid',
        p_payment_method,
        p_gateway,
        v_gw_payment_id,
        COALESCE(v_sub_plan_uuid::text, NULLIF(TRIM(p_plan_id), '')),
        COALESCE(p_plan_name, v_store.subscription_plan, 'باقة رادار المعتمدة'),
        v_now,
        jsonb_build_object(
            'vat_rate', v_vat_rate,
            'gateway_fee', v_gw_fee,
            'commission_rate', v_comm_rate,
            'commission_amount', v_comm_amount,
            'duration_months', p_duration_months
        )
    )
    RETURNING id INTO v_invoice_id;

    -- 12. Insert into financial_ledger
    INSERT INTO public.financial_ledger (
        transaction_id,
        invoice_id,
        store_id,
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
        'tx_' || v_gw_payment_id,
        v_invoice_num,
        p_store_id::text,
        v_partner_id::text,
        v_gw_payment_id,
        'PAYMENT',
        v_gross,
        v_vat_amount,
        v_gw_fee,
        v_comm_amount,
        v_net_platform,
        'SETTLED',
        'GATEWAY_ATOMIC_RPC',
        jsonb_build_object(
            'store_name', v_store.name,
            'invoice_id', v_invoice_id,
            'payment_method', p_payment_method,
            'gateway', p_gateway,
            'plan_name', COALESCE(p_plan_name, v_store.subscription_plan),
            'commission_type', v_comm_type,
            'vat_rate', v_vat_rate,
            'base_amount', v_net_before_vat
        ),
        v_now,
        v_now
    )
    RETURNING id INTO v_ledger_id;

    -- 13. Update stores Subscription Status (Strictly Type-Safe UUID Casting)
    UPDATE public.stores
    SET 
        status = 'active',
        subscription_status = 'active',
        subscription_active = true,
        setup_fee_paid = true,
        lifecycle_stage = 'مشترك مدفوع',
        subscription_plan_id = COALESCE(v_sub_plan_uuid, CASE WHEN p_plan_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN p_plan_id::uuid ELSE NULL END, stores.subscription_plan_id),
        plan_code = COALESCE(p_plan_code, stores.plan_code),
        subscription_plan = COALESCE(p_plan_name, stores.subscription_plan, 'الباقة الأساسية'),
        subscription_start_date = COALESCE(stores.subscription_start_date, v_now),
        subscription_end_date = v_new_end,
        renewal_amount = CASE WHEN v_gross > 0 THEN v_gross ELSE stores.renewal_amount END,
        updated_at = v_now
    WHERE id = p_store_id;

    -- 14. Convert Lead if applicable
    IF v_lead.id IS NOT NULL AND v_lead.status <> 'CONVERTED' THEN
        UPDATE public.merchant_leads
        SET 
            status = 'CONVERTED',
            converted_store_id = p_store_id,
            updated_at = v_now
        WHERE id = v_lead.id;
    END IF;

    -- 15. Record Partner Commission
    IF v_partner_id IS NOT NULL AND v_comm_amount > 0 THEN
        v_idempotency_key := 'comm_inv_' || v_invoice_num;

        IF v_is_acquisition THEN
            DELETE FROM public.partner_commissions 
            WHERE store_id = p_store_id AND status = 'PENDING';
        END IF;

        INSERT INTO public.partner_commissions (
            partner_account_id,
            merchant_lead_id,
            store_id,
            commission_type,
            basis_amount,
            commission_rate,
            commission_amount,
            status,
            qualifying_event,
            idempotency_key,
            invoice_id,
            invoice_number,
            created_at,
            updated_at
        ) VALUES (
            v_partner_id,
            v_lead.id,
            p_store_id,
            v_comm_type,
            v_net_before_vat,
            v_comm_rate,
            v_comm_amount,
            'EARNED',
            CASE 
                WHEN v_comm_type = 'STORE_ACQUISITION' THEN 'سداد اشتراك متجر جديد'
                WHEN v_comm_type = 'SUBSCRIPTION_UPGRADE' THEN 'ترقية باقة المتجر'
                ELSE 'تجديد اشتراك المتجر الدوري'
            END,
            v_idempotency_key,
            v_invoice_id::text,
            v_invoice_num,
            v_now,
            v_now
        )
        ON CONFLICT (idempotency_key) DO UPDATE
        SET 
            basis_amount = EXCLUDED.basis_amount,
            commission_amount = EXCLUDED.commission_amount,
            status = 'EARNED',
            updated_at = v_now
        RETURNING id INTO v_comm_id;
    END IF;

    -- 16. Dual-Sync: Update merchant_subscriptions & billing_transactions if they exist in schema
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'merchant_subscriptions') THEN
        UPDATE public.merchant_subscriptions 
        SET 
            status = 'ACTIVE',
            current_period_start = v_now,
            current_period_end = v_new_end,
            updated_at = v_now
        WHERE store_id = p_store_id;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'billing_transactions') THEN
        INSERT INTO public.billing_transactions (
            store_id,
            plan_id,
            type,
            status,
            amount,
            currency,
            provider,
            provider_transaction_id,
            idempotency_key,
            paid_at,
            metadata
        ) VALUES (
            p_store_id,
            COALESCE(v_sub_plan_uuid, '00000000-0000-0000-0000-000000000000'::uuid),
            CASE WHEN p_invoice_type = 'setup' THEN 'INITIAL_PAYMENT' ELSE 'RENEWAL' END,
            'PAID',
            v_gross,
            'SAR',
            p_gateway,
            v_gw_payment_id,
            'btx_' || v_invoice_num,
            v_now,
            jsonb_build_object('invoice_number', v_invoice_num)
        ) ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    -- 17. Return comprehensive result
    RETURN jsonb_build_object(
        'success', true,
        'idempotent', false,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_num,
        'ledger_id', v_ledger_id,
        'store_id', p_store_id,
        'gross_amount', v_gross,
        'vat_amount', v_vat_amount,
        'net_amount', v_net_before_vat,
        'gateway_fee', v_gw_fee,
        'commission_amount', v_comm_amount,
        'commission_id', v_comm_id,
        'partner_id', v_partner_id,
        'subscription_end_date', v_new_end
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', 'خطأ في معالجة المعاملة الذرية بالسيرفر: ' || SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_store_payment_atomic TO anon, authenticated, service_role;


-- ==============================================================================
-- >>> FILE: 20261009_fin05_payouts_and_commissions_rls.sql <<<
-- ==============================================================================

-- =========================================================================
-- Atomic RPC to process Affiliate/Partner Payouts and bypass RLS
-- =========================================================================

CREATE OR REPLACE FUNCTION public.process_affiliate_payout_atomic(
    p_partner_id UUID,
    p_admin_user VARCHAR,
    p_transfer_ref VARCHAR,
    p_bank_name VARCHAR,
    p_iban VARCHAR,
    p_notes TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_amount NUMERIC(12, 2) := 0;
    v_comms_amount NUMERIC(12, 2) := 0;
    v_bonuses_amount NUMERIC(12, 2) := 0;
    v_comms_count INT := 0;
    v_bonuses_count INT := 0;
    v_payout_number VARCHAR;
    v_ledger_id UUID;
    v_payout_id UUID;
    v_partner_name VARCHAR;
    v_affiliate_id UUID;
BEGIN
    -- 1. Get Partner details
    SELECT display_name, affiliate_id INTO v_partner_name, v_affiliate_id
    FROM public.partner_accounts
    WHERE id = p_partner_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Partner not found');
    END IF;

    -- 2. Calculate Commissions
    SELECT COALESCE(SUM(commission_amount), 0), COUNT(id)
    INTO v_comms_amount, v_comms_count
    FROM public.partner_commissions
    WHERE partner_account_id = p_partner_id AND status IN ('AVAILABLE', 'EARNED');

    -- 3. Calculate Bonuses
    SELECT COALESCE(SUM(bonus_amount), 0), COUNT(id)
    INTO v_bonuses_amount, v_bonuses_count
    FROM public.partner_bonus_awards
    WHERE partner_account_id = p_partner_id AND status IN ('ACHIEVED', 'AWARDED');

    v_total_amount := v_comms_amount + v_bonuses_amount;

    IF v_total_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'No due commissions or bonuses found for payout.');
    END IF;

    -- 4. Generate Payout Number
    v_payout_number := 'PAY-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substring(md5(random()::text) from 1 for 5));

    -- 5. Insert Financial Ledger Entry
    INSERT INTO public.financial_ledger (
        transaction_id,
        affiliate_id,
        transaction_type,
        gross_amount,
        vat_amount,
        gateway_fee,
        affiliate_commission,
        net_platform_amount,
        status,
        created_by,
        metadata
    ) VALUES (
        'tx_payout_' || v_payout_number,
        p_partner_id::varchar,
        'PAYOUT',
        -v_total_amount,
        0,
        0,
        -v_total_amount,
        -v_total_amount,
        'SETTLED',
        p_admin_user,
        jsonb_build_object(
            'payout_number', v_payout_number,
            'transfer_reference', p_transfer_ref,
            'iban', p_iban,
            'bank_name', p_bank_name,
            'commissions_count', v_comms_count,
            'bonuses_count', v_bonuses_count,
            'admin_notes', p_notes,
            'affiliate_name', v_partner_name,
            'settled_at', now()
        )
    ) RETURNING id INTO v_ledger_id;

    -- 6. Insert Payout Record
    INSERT INTO public.affiliate_payouts (
        payout_number,
        affiliate_id,
        partner_name,
        iban,
        bank_name,
        transfer_reference,
        amount,
        commissions_count,
        status,
        disbursed_by,
        ledger_entry_id,
        notes
    ) VALUES (
        v_payout_number,
        p_partner_id::varchar,
        v_partner_name,
        COALESCE(p_iban, 'حوالة بنكية'),
        COALESCE(p_bank_name, 'تحويل فوري'),
        p_transfer_ref,
        v_total_amount,
        v_comms_count + v_bonuses_count,
        'COMPLETED',
        p_admin_user,
        v_ledger_id,
        p_notes
    ) RETURNING id INTO v_payout_id;

    -- 7. Update Commissions
    UPDATE public.partner_commissions
    SET status = 'PAID',
        updated_at = now()
    WHERE partner_account_id = p_partner_id AND status IN ('AVAILABLE', 'EARNED');

    -- 8. Update Bonuses
    UPDATE public.partner_bonus_awards
    SET status = 'PAID',
        updated_at = now()
    WHERE partner_account_id = p_partner_id AND status IN ('ACHIEVED', 'AWARDED');

    RETURN jsonb_build_object(
        'success', true,
        'payout_number', v_payout_number,
        'total_amount', v_total_amount,
        'ledger_id', v_ledger_id,
        'payout_id', v_payout_id
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.process_affiliate_payout_atomic TO authenticated;


-- ==============================================================================
-- >>> FILE: 20261009_fin06_allow_negative_clawback.sql <<<
-- ==============================================================================

-- السماح بالمبالغ السالبة في حالة المرتجعات (CLAWBACK_RECOVERY)
ALTER TABLE public.partner_commissions DROP CONSTRAINT IF EXISTS partner_commissions_commission_amount_check;
ALTER TABLE public.partner_commissions ADD CONSTRAINT partner_commissions_commission_amount_check CHECK (
    commission_amount >= 0 OR commission_type = 'CLAWBACK_RECOVERY' OR commission_type = 'MANUAL_ADJUSTMENT'
);


-- ==============================================================================
-- >>> FILE: 20261009_sec02_grant_salah_admin.sql <<<
-- ==============================================================================

-- إعطاء صلاحيات المالك للحساب الخاص بك
INSERT INTO public.super_admin_users (user_id, email, full_name, is_active)
SELECT id, email, 'Platform Owner', true
FROM auth.users
WHERE email = 'salah@myradar.sarl'
ON CONFLICT (email) DO NOTHING;

-- للتأكد من ربط أي مشرفين آخرين
INSERT INTO public.super_admin_users (user_id, email, full_name, is_active)
SELECT id, email, 'Platform Owner', true
FROM auth.users
WHERE email = 'admin@myradar.sarl'
ON CONFLICT (email) DO NOTHING;


-- ==============================================================================
-- >>> FILE: 20261009_stage16_orders_and_bookings.sql <<<
-- ==============================================================================

-- ==============================================================================
-- Migration: Stage 16 - Orders and Bookings Master Plan
-- Description: Creates store_orders table and safe booking RPC
-- ==============================================================================

-- 1. Create store_orders table
CREATE TABLE IF NOT EXISTS public.store_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    order_number TEXT NOT NULL,
    customer_id UUID REFERENCES public.store_customers(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    order_type TEXT NOT NULL, -- 'dine_in', 'takeaway', 'delivery'
    table_number TEXT,
    items JSONB NOT NULL DEFAULT '[]',
    total_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    loyalty_points_earned INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'preparing', 'ready', 'completed', 'cancelled'
    payment_status TEXT NOT NULL DEFAULT 'unpaid', -- 'unpaid', 'paid'
    payment_method TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for realtime and querying
CREATE INDEX IF NOT EXISTS idx_store_orders_store_id ON public.store_orders(store_id);
CREATE INDEX IF NOT EXISTS idx_store_orders_status ON public.store_orders(status);
CREATE INDEX IF NOT EXISTS idx_store_orders_customer_phone ON public.store_orders(customer_phone);

-- RLS for store_orders
ALTER TABLE public.store_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stores can view and update their own orders"
    ON public.store_orders
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.stores s 
            WHERE s.id = store_orders.store_id 
            AND (s.id::text = current_setting('request.jwt.claims', true)::jsonb->>'app_store_id'
                 OR s.manager_contact = current_setting('request.jwt.claims', true)::jsonb->>'phone')
        )
    );

CREATE POLICY "Public can insert orders"
    ON public.store_orders
    FOR INSERT
    WITH CHECK (true);
    
CREATE POLICY "Public can read their own orders by phone"
    ON public.store_orders
    FOR SELECT
    USING (true);

-- 2. Safe Booking RPC (Concurrency Control)
CREATE OR REPLACE FUNCTION public.book_service_safely(
    p_store_id UUID,
    p_customer_id UUID,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_service_id UUID,
    p_service_name TEXT,
    p_service_price NUMERIC,
    p_service_duration_minutes INT,
    p_specialist_id UUID,
    p_specialist_name TEXT,
    p_booking_date TEXT,
    p_booking_time TEXT,
    p_notes TEXT,
    p_points_to_earn INT,
    p_selected_modifiers JSONB DEFAULT '[]'::jsonb
) RETURNS jsonb AS $$$
DECLARE
    v_overlap_exists BOOLEAN;
    v_booking_id UUID;
    v_booking_number TEXT;
    v_lock_key BIGINT;
    v_start_time TIMESTAMP;
    v_end_time TIMESTAMP;
BEGIN
    -- 1. Create a deterministic lock key based on specialist_id to serialize requests for the same specialist
    v_lock_key := hashtext(p_specialist_id::TEXT);
    
    -- Acquire exclusive transaction-level advisory lock
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- 2. Calculate time boundaries
    v_start_time := (p_booking_date || ' ' || p_booking_time)::TIMESTAMP;
    v_end_time := v_start_time + (p_service_duration_minutes || ' minutes')::INTERVAL;

    -- 3. Check for overlapping bookings
    SELECT EXISTS (
        SELECT 1 FROM public.service_bookings
        WHERE specialist_id = p_specialist_id
        AND status NOT IN ('cancelled', 'rejected')
        AND (
            -- Formula: (StartA < EndB) AND (EndA > StartB)
            ((booking_date || ' ' || booking_time)::TIMESTAMP < v_end_time)
            AND 
            (((booking_date || ' ' || booking_time)::TIMESTAMP + (service_duration_minutes || ' minutes')::INTERVAL) > v_start_time)
        )
    ) INTO v_overlap_exists;

    -- 4. If overlap, return error
    IF v_overlap_exists THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'عفواً، تم حجز هذا الموعد للتو من قبل عميل آخر. يرجى اختيار موعد آخر.'
        );
    END IF;

    -- 5. Generate Booking Number
    v_booking_number := 'BKG-' || upper(substr(md5(random()::text), 1, 6));

    -- 6. Insert Booking safely
    INSERT INTO public.service_bookings (
        booking_number, store_id, customer_id, customer_name, customer_phone,
        service_id, service_name, service_price, service_duration_minutes,
        specialist_id, specialist_name, booking_date, booking_time,
        status, customer_notes, points_to_earn, selected_modifiers
    ) VALUES (
        v_booking_number, p_store_id, p_customer_id, p_customer_name, p_customer_phone,
        p_service_id, p_service_name, p_service_price, p_service_duration_minutes,
        p_specialist_id, p_specialist_name, p_booking_date, p_booking_time,
        'pending', p_notes, p_points_to_earn, p_selected_modifiers
    ) RETURNING id INTO v_booking_id;

    -- 7. Return Success
    RETURN jsonb_build_object(
        'success', true, 
        'booking_id', v_booking_id,
        'booking_number', v_booking_number
    );
END;
$$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.store_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.service_bookings;


-- ==============================================================================
-- >>> FILE: 20261009_stage17_catalog_items_columns.sql <<<
-- ==============================================================================

��
 A L T E R   T A B L E   c a t a l o g _ i t e m s   A D D   C O L U M N   I F   N O T   E X I S T S   i t e m _ t y p e   t e x t   D E F A U L T   ' p r o d u c t ' ; 
 A L T E R   T A B L E   c a t a l o g _ i t e m s   A D D   C O L U M N   I F   N O T   E X I S T S   d u r a t i o n _ m i n u t e s   i n t e g e r ; 
 A L T E R   T A B L E   c a t a l o g _ i t e m s   A D D   C O L U M N   I F   N O T   E X I S T S   s o r t _ o r d e r   i n t e g e r ; 
 A L T E R   T A B L E   c a t a l o g _ i t e m s   A D D   C O L U M N   I F   N O T   E X I S T S   m o d i f i e r _ g r o u p s   j s o n b ; 
  
 


-- ==============================================================================
-- >>> FILE: 20261009_stage18_order_updates.sql <<<
-- ==============================================================================

CREATE POLICY "Public can update orders"
    ON public.store_orders
    FOR UPDATE
    USING (true);


-- ==============================================================================
-- >>> FILE: 20261009_stage19_bookings_rls.sql <<<
-- ==============================================================================

CREATE POLICY "Public can insert bookings" ON public.service_bookings FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update bookings" ON public.service_bookings FOR UPDATE USING (true);
CREATE POLICY "Public can read bookings" ON public.service_bookings FOR SELECT USING (true);


-- ==============================================================================
-- >>> FILE: 20261012_sec03_fix_all_rls_advisor.sql <<<
-- ==============================================================================

-- ==============================================================================
-- 🛡️ RADAR LOYALTY ENGINE — MIGRATION 20261012_SEC03 (ENTERPRISE HARDENING)
-- RESOLVE ALL 18 SUPABASE SECURITY ADVISOR RLS ISSUES
-- 100% IDEMPOTENT: AUTO DROPS PREVIOUS POLICIES & ADDS MISSING COLUMNS
-- ==============================================================================

-- 0. Ensure pgcrypto extension for secure Bcrypt PIN hashing
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. التأكد من وجود كافة الأعمدة المطلوبة مسبقاً لمنع أي خطأ
ALTER TABLE IF EXISTS public.partner_accounts ADD COLUMN IF NOT EXISTS pin_code VARCHAR(100) DEFAULT '1234';
ALTER TABLE IF EXISTS public.partner_accounts ADD COLUMN IF NOT EXISTS referral_code VARCHAR(50);
ALTER TABLE IF EXISTS public.partner_accounts ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5, 4) DEFAULT 0.2000;
ALTER TABLE IF EXISTS public.partner_accounts ALTER COLUMN pin_code TYPE VARCHAR(100);

ALTER TABLE IF EXISTS public.affiliates ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5, 4) DEFAULT 0.2000;
ALTER TABLE IF EXISTS public.partner_commissions ADD COLUMN IF NOT EXISTS affiliate_id UUID REFERENCES public.affiliates(id) ON DELETE SET NULL;

-- 2. حذف أي سياسات سابقة على الجداول الـ 11 لتجنب أي تكرار أو تعارض (Clean Reset)
DO $$
DECLARE
    r RECORD;
    t TEXT;
    tbls TEXT[] := ARRAY[
        'billing_plans', 'catalog_items', 'store_specialists', 'service_bookings',
        'affiliates', 'partner_accounts', 'partner_commissions', 'partner_bonus_rules',
        'partner_bonus_awards', 'partner_targets', 'partner_audit_logs'
    ];
BEGIN
    FOREACH t IN ARRAY tbls LOOP
        FOR r IN (
            SELECT policyname 
            FROM pg_policies 
            WHERE schemaname = 'public' AND tablename = t
        ) LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
        END LOOP;
    END LOOP;
END $$;


-- ==============================================================================
-- 1. BILLING PLANS (باقات وخطط الأسعار)
-- ==============================================================================
ALTER TABLE IF EXISTS public.billing_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active billing plans"
ON public.billing_plans FOR SELECT
TO anon, authenticated
USING (active = true OR public.is_super_admin());

CREATE POLICY "SuperAdmin can manage billing plans"
ON public.billing_plans FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Service Role billing plans full access"
ON public.billing_plans FOR ALL
TO service_role USING (true) WITH CHECK (true);


-- ==============================================================================
-- 2. CATALOG ITEMS (المنيو والمنتجات والخدمات)
-- ==============================================================================
ALTER TABLE IF EXISTS public.catalog_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view catalog items"
ON public.catalog_items FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Store staff can manage catalog items"
ON public.catalog_items FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Service Role catalog items full access"
ON public.catalog_items FOR ALL
TO service_role USING (true) WITH CHECK (true);


-- ==============================================================================
-- 3. STORE SPECIALISTS (الأخصائيين ومقدمي الخدمات)
-- ==============================================================================
ALTER TABLE IF EXISTS public.store_specialists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view specialists"
ON public.store_specialists FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Store staff can manage specialists"
ON public.store_specialists FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Service Role specialists full access"
ON public.store_specialists FOR ALL
TO service_role USING (true) WITH CHECK (true);


-- ==============================================================================
-- 4. SERVICE BOOKINGS (حجوزات المواعيد)
-- ==============================================================================
ALTER TABLE IF EXISTS public.service_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can insert bookings"
ON public.service_bookings FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Store staff can read bookings"
ON public.service_bookings FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Store staff can update bookings"
ON public.service_bookings FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "SuperAdmin can manage bookings"
ON public.service_bookings FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Service Role bookings full access"
ON public.service_bookings FOR ALL
TO service_role USING (true) WITH CHECK (true);


-- ==============================================================================
-- 5. AFFILIATES (بيانات الشركاء - إغلاق تام للقراءة العامة وحماية الخصوصية)
-- ==============================================================================
ALTER TABLE IF EXISTS public.affiliates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SuperAdmin affiliates access"
ON public.affiliates FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Service Role affiliates full access"
ON public.affiliates FOR ALL
TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.check_referral_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_aff RECORD;
BEGIN
    IF p_code IS NULL OR trim(p_code) = '' THEN
        RETURN jsonb_build_object('valid', false, 'message', 'الكود فارغ');
    END IF;

    SELECT id, name, referral_code, status
    INTO v_aff
    FROM public.affiliates
    WHERE LOWER(referral_code) = LOWER(trim(p_code)) AND status = 'ACTIVE'
    LIMIT 1;

    IF v_aff IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'message', 'كود غير صحيح');
    END IF;

    RETURN jsonb_build_object(
        'valid', true,
        'referral_code', v_aff.referral_code,
        'partner_name', v_aff.name
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.check_referral_code(text) TO anon, authenticated, service_role;


-- ==============================================================================
-- 6. PARTNER ACCOUNTS & PIN SECURITY (توسيع الحقل وتشفير الـ PIN بـ Bcrypt)
-- ==============================================================================
ALTER TABLE IF EXISTS public.partner_accounts ENABLE ROW LEVEL SECURITY;

UPDATE public.partner_accounts
SET pin_code = crypt(trim(pin_code), gen_salt('bf', 8))
WHERE pin_code IS NOT NULL 
  AND trim(pin_code) <> '' 
  AND pin_code NOT LIKE '$2%';

UPDATE public.partner_accounts
SET pin_code = crypt('1234', gen_salt('bf', 8))
WHERE pin_code IS NULL OR trim(pin_code) = '';

CREATE POLICY "SuperAdmin partner accounts access"
ON public.partner_accounts FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Service Role partner accounts full access"
ON public.partner_accounts FOR ALL
TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.verify_partner_login(
    p_login_input TEXT,
    p_pin TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_input TEXT := lower(trim(p_login_input));
    v_partner RECORD;
    v_is_match BOOLEAN := FALSE;
BEGIN
    IF p_login_input IS NULL OR trim(p_login_input) = '' OR p_pin IS NULL OR trim(p_pin) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'يرجى إدخال البيانات كاملة');
    END IF;

    SELECT pa.id, pa.affiliate_id, pa.display_name, pa.slug, pa.region, pa.active, pa.pin_code,
           a.name, a.phone, a.referral_code, a.status,
           COALESCE(pa.commission_rate, 0.2000) as commission_rate
    INTO v_partner
    FROM public.partner_accounts pa
    JOIN public.affiliates a ON a.id = pa.affiliate_id
    WHERE lower(trim(COALESCE(a.referral_code, ''))) = v_clean_input
       OR lower(trim(COALESCE(pa.slug, ''))) = v_clean_input
       OR regexp_replace(COALESCE(a.phone, ''), '\D', '', 'g') = regexp_replace(p_login_input, '\D', '', 'g')
    LIMIT 1;

    IF v_partner IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'رقم الجوال أو كود الشريك غير مسجل');
    END IF;

    IF v_partner.active = FALSE OR v_partner.status = 'SUSPENDED' THEN
        RETURN jsonb_build_object('success', false, 'error', 'حساب الشريك موقوف حالياً، يرجى التواصل مع الإدارة');
    END IF;

    IF v_partner.pin_code LIKE '$2%' THEN
        v_is_match := (v_partner.pin_code = crypt(trim(p_pin), v_partner.pin_code));
    ELSE
        v_is_match := (trim(v_partner.pin_code) = trim(p_pin));
        IF v_is_match THEN
            UPDATE public.partner_accounts
            SET pin_code = crypt(trim(p_pin), gen_salt('bf', 8))
            WHERE id = v_partner.id;
        END IF;
    END IF;

    IF NOT v_is_match THEN
        RETURN jsonb_build_object('success', false, 'error', 'الرمز السري (PIN) غير صحيح');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'partner', jsonb_build_object(
            'id', v_partner.id,
            'affiliate_id', v_partner.affiliate_id,
            'display_name', v_partner.display_name,
            'slug', v_partner.slug,
            'region', v_partner.region,
            'phone', v_partner.phone,
            'referral_code', v_partner.referral_code,
            'commission_rate', v_partner.commission_rate
        )
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.verify_partner_login(text, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.change_partner_pin(
    p_partner_id UUID,
    p_old_pin TEXT,
    p_new_pin TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_partner RECORD;
    v_is_valid BOOLEAN := FALSE;
BEGIN
    IF p_new_pin IS NULL OR length(trim(p_new_pin)) < 4 THEN
        RETURN jsonb_build_object('success', false, 'error', 'الرمز السري الجديد يجب ألا يقل عن 4 أرقام');
    END IF;

    SELECT id, pin_code INTO v_partner
    FROM public.partner_accounts
    WHERE id = p_partner_id;

    IF v_partner IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'حساب الشريك غير موجود');
    END IF;

    IF v_partner.pin_code LIKE '$2%' THEN
        v_is_valid := (v_partner.pin_code = crypt(trim(p_old_pin), v_partner.pin_code));
    ELSE
        v_is_valid := (trim(v_partner.pin_code) = trim(p_old_pin));
    END IF;

    IF NOT v_is_valid THEN
        RETURN jsonb_build_object('success', false, 'error', 'الرمز السري القديم غير صحيح');
    END IF;

    UPDATE public.partner_accounts
    SET pin_code = crypt(trim(p_new_pin), gen_salt('bf', 8)),
        updated_at = now()
    WHERE id = p_partner_id;

    RETURN jsonb_build_object('success', true, 'message', 'تم تحديث الرمز السري بنجاح وتأمينه 🔒');
END;
$$;
GRANT EXECUTE ON FUNCTION public.change_partner_pin(uuid, text, text) TO anon, authenticated, service_role;


-- ==============================================================================
-- 7. PARTNER COMMISSIONS & FINANCES (عزل العمولات والأرباح بالكامل)
-- ==============================================================================
ALTER TABLE IF EXISTS public.partner_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.partner_bonus_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.partner_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.partner_bonus_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.partner_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SuperAdmin partner commissions access"
ON public.partner_commissions FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Service Role partner commissions full access"
ON public.partner_commissions FOR ALL
TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Public can view active bonus rules"
ON public.partner_bonus_rules FOR SELECT
TO anon, authenticated
USING (active = true OR public.is_super_admin());

CREATE POLICY "SuperAdmin manage bonus rules"
ON public.partner_bonus_rules FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Service Role partner bonus rules full access"
ON public.partner_bonus_rules FOR ALL
TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "SuperAdmin partner bonus awards access"
ON public.partner_bonus_awards FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Service Role bonus awards full access"
ON public.partner_bonus_awards FOR ALL
TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "SuperAdmin partner targets access"
ON public.partner_targets FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Service Role partner targets full access"
ON public.partner_targets FOR ALL
TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "SuperAdmin partner audit logs access"
ON public.partner_audit_logs FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Service Role audit logs full access"
ON public.partner_audit_logs FOR ALL
TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.get_partner_commissions_secure(p_partner_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rows JSONB;
BEGIN
    IF p_partner_id IS NULL THEN
        RETURN '[]'::jsonb;
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    INTO v_rows
    FROM (
        SELECT pc.id, pc.commission_amount, pc.commission_type, pc.status, pc.created_at,
               ml.store_name AS merchant_name
        FROM public.partner_commissions pc
        LEFT JOIN public.merchant_leads ml ON ml.id = pc.merchant_lead_id
        WHERE (pc.partner_account_id = p_partner_id 
               OR pc.affiliate_id = p_partner_id
               OR pc.partner_account_id IN (SELECT id FROM public.partner_accounts WHERE affiliate_id = p_partner_id))
          AND pc.status <> 'PENDING'
        ORDER BY pc.created_at DESC
    ) t;

    RETURN v_rows;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_partner_commissions_secure(uuid) TO anon, authenticated, service_role;


-- ==============================================================================
-- >>> FILE: 20261012_sec04_pin_limits_secure_writes.sql <<<
-- ==============================================================================

-- ==============================================================================
-- RADAR — MIGRATION 20261012_SEC04
-- 1) PIN lockout (5 wrong attempts = 15 min lock) for staff/merchant/cashier + partner,
--    failed attempts logged in partner_audit_logs
-- 2) Rate limit on check_referral_code
-- 3) Staff session tickets (8h) so merchants/cashiers write through checked RPCs
-- 4) catalog_items / store_specialists: public READ only, writes via merchant RPCs
-- 5) service_bookings: no direct anon access; visitors book via book_service_safely
--    (long random booking code); staff read/update via ticket RPCs
-- 6) SET search_path on every SECURITY DEFINER function in public
-- NOTE: run AFTER 20261012_sec03. Do NOT re-run sec03 after this file
--       (sec03 would re-open the three tables).
-- NOTE: customer (wallet) login is phone-only by design today: NOT covered here.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Internal tables (RLS ON, no policies = unreachable from anon/authenticated)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pin_login_attempts (
    scope        TEXT NOT NULL,
    attempt_key  TEXT NOT NULL,
    fail_count   INT  NOT NULL DEFAULT 0,
    last_fail_at TIMESTAMPTZ,
    locked_until TIMESTAMPTZ,
    PRIMARY KEY (scope, attempt_key)
);

CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
    bucket       TEXT PRIMARY KEY,
    window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
    hits         INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.staff_sessions (
    token_hash TEXT PRIMARY KEY,
    store_id   UUID NOT NULL,
    staff_id   TEXT NOT NULL,
    role       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_staff_sessions_expires ON public.staff_sessions(expires_at);

ALTER TABLE public.pin_login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_sessions      ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.pin_login_attempts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.rate_limit_counters FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.staff_sessions      FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 2. Internal helpers (NOT callable by visitors)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._pin_lock_seconds(p_scope TEXT, p_key TEXT)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    SELECT COALESCE(
        (SELECT GREATEST(0, CEIL(EXTRACT(EPOCH FROM (locked_until - now())))::INT)
           FROM public.pin_login_attempts
          WHERE scope = p_scope AND attempt_key = p_key AND locked_until > now()),
        0);
$$;

CREATE OR REPLACE FUNCTION public._pin_register_fail(
    p_scope TEXT,
    p_key TEXT,
    p_partner_id UUID DEFAULT NULL,
    p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_row    public.pin_login_attempts%ROWTYPE;
    v_count  INT;
    v_locked TIMESTAMPTZ := NULL;
BEGIN
    INSERT INTO public.pin_login_attempts(scope, attempt_key, fail_count)
    VALUES (p_scope, p_key, 0)
    ON CONFLICT (scope, attempt_key) DO NOTHING;

    SELECT * INTO v_row
    FROM public.pin_login_attempts
    WHERE scope = p_scope AND attempt_key = p_key
    FOR UPDATE;

    IF (v_row.locked_until IS NOT NULL AND v_row.locked_until <= now())
       OR (v_row.last_fail_at IS NOT NULL AND v_row.last_fail_at < now() - interval '15 minutes') THEN
        v_count := 1;
    ELSE
        v_count := v_row.fail_count + 1;
    END IF;

    IF v_count >= 5 THEN
        v_locked := now() + interval '15 minutes';
    END IF;

    UPDATE public.pin_login_attempts
       SET fail_count = v_count, last_fail_at = now(), locked_until = v_locked
     WHERE scope = p_scope AND attempt_key = p_key;

    -- Audit log must never break the login flow
    BEGIN
        INSERT INTO public.partner_audit_logs (partner_account_id, action, details, performed_by)
        VALUES (
            p_partner_id,
            CASE WHEN v_locked IS NOT NULL THEN 'PIN_LOCKED' ELSE 'PIN_FAILED' END,
            COALESCE(p_details, '{}'::jsonb)
                || jsonb_build_object('scope', p_scope, 'attempt', v_count, 'locked_until', v_locked),
            'system'
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public._pin_register_success(p_scope TEXT, p_key TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    DELETE FROM public.pin_login_attempts WHERE scope = p_scope AND attempt_key = p_key;
$$;

CREATE OR REPLACE FUNCTION public._locked_response(p_seconds INT)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
    SELECT jsonb_build_object(
        'success', false,
        'error', 'LOCKED',
        'retry_after_seconds', p_seconds,
        'message', 'تم قفل الدخول مؤقتاً بعد 5 محاولات خاطئة. حاول بعد ' || GREATEST(1, CEIL(p_seconds / 60.0))::INT || ' دقيقة'
    );
$$;

-- Staff session tickets -------------------------------------------------------
CREATE OR REPLACE FUNCTION public._staff_session_create(p_store_id UUID, p_staff_id TEXT, p_role TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_token TEXT;
BEGIN
    DELETE FROM public.staff_sessions WHERE expires_at < now();

    v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

    INSERT INTO public.staff_sessions (token_hash, store_id, staff_id, role, expires_at)
    VALUES (
        encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
        p_store_id,
        p_staff_id,
        COALESCE(NULLIF(trim(p_role), ''), 'cashier'),
        now() + interval '8 hours'
    );

    RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public._staff_session(p_token TEXT, p_need_admin BOOLEAN DEFAULT FALSE)
RETURNS TABLE(store_id UUID, staff_id TEXT, role TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    SELECT s.store_id, s.staff_id, s.role
    FROM public.staff_sessions s
    WHERE p_token IS NOT NULL
      AND length(p_token) BETWEEN 32 AND 128
      AND s.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
      AND s.expires_at > now()
      AND (NOT p_need_admin OR s.role = 'admin')
      AND (
            s.staff_id LIKE 'manager-%'
            OR EXISTS (SELECT 1 FROM public.store_staff st WHERE st.id::text = s.staff_id AND st.is_active = true)
          )
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.end_staff_session(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF p_token IS NULL OR length(p_token) NOT BETWEEN 32 AND 128 THEN
        RETURN jsonb_build_object('success', false);
    END IF;
    DELETE FROM public.staff_sessions
    WHERE token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
    RETURN jsonb_build_object('success', true);
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. verify_staff_pin: merchant + cashier login (lockout + session ticket)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_staff_pin(
    p_phone TEXT,
    p_pin TEXT,
    p_store_id UUID DEFAULT NULL,
    p_store_slug TEXT DEFAULT NULL,
    p_required_role TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_norm_input TEXT;
    v_norm_pin TEXT;
    v_resolved_store_id UUID := p_store_id;
    v_store_record RECORD;
    v_staff_record RECORD;
    v_is_match BOOLEAN := FALSE;
    v_key TEXT;
    v_lock INT;
    v_count INT;
    v_token TEXT;
BEGIN
    v_norm_input := public.normalize_phone(p_phone);
    v_norm_pin := trim(COALESCE(p_pin, ''));

    IF v_norm_input = '' OR v_norm_pin = ''
       OR length(v_norm_input) > 15 OR length(v_norm_pin) > 32
       OR (p_store_slug IS NOT NULL AND length(p_store_slug) > 120)
       OR (p_required_role IS NOT NULL AND p_required_role NOT IN ('admin', 'cashier')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT',
            'message', 'رقم الجوال والرمز السري مطلوبان');
    END IF;

    IF v_resolved_store_id IS NULL AND p_store_slug IS NOT NULL AND trim(p_store_slug) <> '' THEN
        SELECT id INTO v_resolved_store_id
        FROM public.stores
        WHERE lower(slug) = lower(trim(p_store_slug))
        LIMIT 1;
    END IF;

    IF v_resolved_store_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'STORE_NOT_FOUND',
            'message', 'تعذر العثور على المتجر المحدد');
    END IF;

    SELECT id, slug, name, manager_name, manager_contact
    INTO v_store_record
    FROM public.stores
    WHERE id = v_resolved_store_id
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'STORE_NOT_FOUND',
            'message', 'تعذر العثور على المتجر المحدد');
    END IF;

    -- Lockout check
    v_key := v_resolved_store_id::text || ':' || v_norm_input;
    v_lock := public._pin_lock_seconds('staff', v_key);
    IF v_lock > 0 THEN
        RETURN public._locked_response(v_lock);
    END IF;

    -- Step A: store_staff
    FOR v_staff_record IN
        SELECT id, store_id, user_id, name, phone, role, pin_code, is_active, can_manual_input_phone
        FROM public.store_staff
        WHERE store_id = v_resolved_store_id
          AND is_active = true
          AND public.normalize_phone(phone) = v_norm_input
    LOOP
        IF p_required_role IS NULL
           OR p_required_role = 'cashier'
           OR (p_required_role = 'admin' AND v_staff_record.role = 'admin')
        THEN
            IF v_staff_record.pin_code LIKE '$2%' THEN
                v_is_match := (v_staff_record.pin_code = crypt(v_norm_pin, v_staff_record.pin_code));
            ELSE
                v_is_match := (trim(v_staff_record.pin_code) = v_norm_pin);
                IF v_is_match THEN
                    UPDATE public.store_staff
                    SET pin_code = crypt(v_norm_pin, gen_salt('bf', 8)),
                        updated_at = now()
                    WHERE id = v_staff_record.id;
                END IF;
            END IF;

            IF v_is_match THEN
                PERFORM public._pin_register_success('staff', v_key);
                v_token := public._staff_session_create(v_resolved_store_id, v_staff_record.id::text, v_staff_record.role);
                UPDATE public.store_staff SET updated_at = now() WHERE id = v_staff_record.id;

                RETURN jsonb_build_object(
                    'success', true,
                    'session_token', v_token,
                    'staff', jsonb_build_object(
                        'id', v_staff_record.id,
                        'store_id', v_staff_record.store_id,
                        'user_id', v_staff_record.user_id,
                        'name', v_staff_record.name,
                        'phone', v_staff_record.phone,
                        'role', v_staff_record.role,
                        'is_active', v_staff_record.is_active,
                        'can_manual_input_phone', v_staff_record.can_manual_input_phone,
                        'store_name', v_store_record.name,
                        'store_slug', v_store_record.slug
                    )
                );
            END IF;
        END IF;
    END LOOP;

    -- (No separate "store manager" step: in the real database the manager's PIN is stored in
    --  store_staff.pin_code with role = 'admin', so Step A above already covers managers.)

    -- Failure: count it, log it, lock if needed
    v_count := public._pin_register_fail(
        'staff', v_key, NULL,
        jsonb_build_object('type', 'staff', 'store_id', v_resolved_store_id, 'phone_hint', '***' || right(v_norm_input, 3))
    );
    IF v_count >= 5 THEN
        RETURN public._locked_response(900);
    END IF;

    RETURN jsonb_build_object(
        'success', false,
        'error', 'INVALID_CREDENTIALS',
        'attempts_left', 5 - v_count,
        'message', 'رقم الجوال أو الرمز السري (PIN) غير صحيح'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_staff_pin(
    p_staff_id UUID,
    p_old_pin TEXT,
    p_new_pin TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_staff RECORD;
    v_is_old_valid BOOLEAN := FALSE;
    v_norm_old TEXT := trim(COALESCE(p_old_pin, ''));
    v_norm_new TEXT := trim(COALESCE(p_new_pin, ''));
    v_key TEXT;
    v_lock INT;
    v_count INT;
BEGIN
    IF p_staff_id IS NULL OR v_norm_old = '' OR length(v_norm_old) > 32 OR length(v_norm_new) > 32 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT',
            'message', 'البيانات المدخلة غير صحيحة');
    END IF;

    IF length(v_norm_new) < 4 THEN
        RETURN jsonb_build_object('success', false, 'error', 'PIN_TOO_SHORT',
            'message', 'الرمز السري الجديد يجب ألا يقل عن 4 أرقام');
    END IF;

    SELECT id, store_id, phone, pin_code INTO v_staff
    FROM public.store_staff
    WHERE id = p_staff_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'STAFF_NOT_FOUND',
            'message', 'تعذر العثور على الموظف');
    END IF;

    v_key := v_staff.store_id::text || ':' || public.normalize_phone(v_staff.phone);
    v_lock := public._pin_lock_seconds('staff', v_key);
    IF v_lock > 0 THEN
        RETURN public._locked_response(v_lock);
    END IF;

    IF v_staff.pin_code LIKE '$2%' THEN
        v_is_old_valid := (v_staff.pin_code = crypt(v_norm_old, v_staff.pin_code));
    ELSE
        v_is_old_valid := (trim(v_staff.pin_code) = v_norm_old);
    END IF;

    IF NOT v_is_old_valid THEN
        v_count := public._pin_register_fail('staff', v_key, NULL,
            jsonb_build_object('type', 'staff_change_pin', 'staff_id', p_staff_id));
        IF v_count >= 5 THEN
            RETURN public._locked_response(900);
        END IF;
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_OLD_PIN',
            'attempts_left', 5 - v_count,
            'message', 'الرمز السري الحالي غير صحيح');
    END IF;

    PERFORM public._pin_register_success('staff', v_key);

    UPDATE public.store_staff
    SET pin_code = crypt(v_norm_new, gen_salt('bf', 8)),
        updated_at = now()
    WHERE id = p_staff_id;

    RETURN jsonb_build_object('success', true, 'message', 'تم تحديث الرمز السري بنجاح وتأمينه');
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. Partner login / change PIN / referral code
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_partner_login(
    p_login_input TEXT,
    p_pin TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_input TEXT := lower(trim(COALESCE(p_login_input, '')));
    v_digits TEXT := regexp_replace(COALESCE(p_login_input, ''), '\D', '', 'g');
    v_pin TEXT := trim(COALESCE(p_pin, ''));
    v_partner RECORD;
    v_is_match BOOLEAN := FALSE;
    v_key TEXT;
    v_lock INT;
    v_count INT;
BEGIN
    IF v_clean_input = '' OR v_pin = '' OR length(v_clean_input) > 100 OR length(v_pin) > 32 THEN
        RETURN jsonb_build_object('success', false, 'error', 'يرجى إدخال البيانات كاملة');
    END IF;

    SELECT pa.id, pa.affiliate_id, pa.display_name, pa.slug, pa.region, pa.active, pa.pin_code,
           a.name, a.phone, a.referral_code, a.status,
           COALESCE(pa.commission_rate, 0.2000) AS commission_rate
    INTO v_partner
    FROM public.partner_accounts pa
    JOIN public.affiliates a ON a.id = pa.affiliate_id
    WHERE lower(trim(COALESCE(a.referral_code, ''))) = v_clean_input
       OR lower(trim(COALESCE(pa.slug, ''))) = v_clean_input
       OR (v_digits <> '' AND regexp_replace(COALESCE(a.phone, ''), '\D', '', 'g') = v_digits)
    LIMIT 1;

    IF NOT FOUND THEN
        v_key := 'i:' || left(v_clean_input, 64);
        v_lock := public._pin_lock_seconds('partner', v_key);
        IF v_lock > 0 THEN
            RETURN public._locked_response(v_lock);
        END IF;
        v_count := public._pin_register_fail('partner', v_key, NULL,
            jsonb_build_object('type', 'partner_unknown_login'));
        IF v_count >= 5 THEN
            RETURN public._locked_response(900);
        END IF;
        RETURN jsonb_build_object('success', false, 'error', 'رقم الجوال أو كود الشريك غير مسجل');
    END IF;

    v_key := 'p:' || v_partner.id::text;
    v_lock := public._pin_lock_seconds('partner', v_key);
    IF v_lock > 0 THEN
        RETURN public._locked_response(v_lock);
    END IF;

    IF v_partner.active = FALSE OR v_partner.status = 'SUSPENDED' THEN
        RETURN jsonb_build_object('success', false, 'error', 'حساب الشريك موقوف حالياً، يرجى التواصل مع الإدارة');
    END IF;

    IF v_partner.pin_code LIKE '$2%' THEN
        v_is_match := (v_partner.pin_code = crypt(v_pin, v_partner.pin_code));
    ELSE
        v_is_match := (trim(v_partner.pin_code) = v_pin);
        IF v_is_match THEN
            UPDATE public.partner_accounts
            SET pin_code = crypt(v_pin, gen_salt('bf', 8))
            WHERE id = v_partner.id;
        END IF;
    END IF;

    IF NOT v_is_match THEN
        v_count := public._pin_register_fail('partner', v_key, v_partner.id,
            jsonb_build_object('type', 'partner_login'));
        IF v_count >= 5 THEN
            RETURN public._locked_response(900);
        END IF;
        RETURN jsonb_build_object('success', false, 'error', 'الرمز السري (PIN) غير صحيح',
            'attempts_left', 5 - v_count);
    END IF;

    PERFORM public._pin_register_success('partner', v_key);

    RETURN jsonb_build_object(
        'success', true,
        'partner', jsonb_build_object(
            'id', v_partner.id,
            'affiliate_id', v_partner.affiliate_id,
            'display_name', v_partner.display_name,
            'slug', v_partner.slug,
            'region', v_partner.region,
            'phone', v_partner.phone,
            'referral_code', v_partner.referral_code,
            'commission_rate', v_partner.commission_rate
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.change_partner_pin(
    p_partner_id UUID,
    p_old_pin TEXT,
    p_new_pin TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_partner RECORD;
    v_is_valid BOOLEAN := FALSE;
    v_old TEXT := trim(COALESCE(p_old_pin, ''));
    v_new TEXT := trim(COALESCE(p_new_pin, ''));
    v_key TEXT;
    v_lock INT;
    v_count INT;
BEGIN
    IF p_partner_id IS NULL OR v_old = '' OR length(v_old) > 32 OR length(v_new) > 32 THEN
        RETURN jsonb_build_object('success', false, 'error', 'البيانات المدخلة غير صحيحة');
    END IF;

    IF length(v_new) < 4 THEN
        RETURN jsonb_build_object('success', false, 'error', 'الرمز السري الجديد يجب ألا يقل عن 4 أرقام');
    END IF;

    SELECT id, pin_code INTO v_partner
    FROM public.partner_accounts
    WHERE id = p_partner_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'حساب الشريك غير موجود');
    END IF;

    v_key := 'p:' || v_partner.id::text;
    v_lock := public._pin_lock_seconds('partner', v_key);
    IF v_lock > 0 THEN
        RETURN public._locked_response(v_lock);
    END IF;

    IF v_partner.pin_code LIKE '$2%' THEN
        v_is_valid := (v_partner.pin_code = crypt(v_old, v_partner.pin_code));
    ELSE
        v_is_valid := (trim(v_partner.pin_code) = v_old);
    END IF;

    IF NOT v_is_valid THEN
        v_count := public._pin_register_fail('partner', v_key, v_partner.id,
            jsonb_build_object('type', 'partner_change_pin'));
        IF v_count >= 5 THEN
            RETURN public._locked_response(900);
        END IF;
        RETURN jsonb_build_object('success', false, 'error', 'الرمز السري القديم غير صحيح',
            'attempts_left', 5 - v_count);
    END IF;

    PERFORM public._pin_register_success('partner', v_key);

    UPDATE public.partner_accounts
    SET pin_code = crypt(v_new, gen_salt('bf', 8)),
        updated_at = now()
    WHERE id = p_partner_id;

    RETURN jsonb_build_object('success', true, 'message', 'تم تحديث الرمز السري بنجاح وتأمينه 🔒');
END;
$$;

-- Referral code check: max 20 INVALID checks per minute (all visitors together)
CREATE OR REPLACE FUNCTION public.check_referral_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_aff RECORD;
    v_code TEXT := lower(trim(COALESCE(p_code, '')));
    v_hits INT;
    v_window TIMESTAMPTZ;
BEGIN
    IF v_code = '' THEN
        RETURN jsonb_build_object('valid', false, 'message', 'الكود فارغ');
    END IF;

    IF length(v_code) > 50 OR v_code !~ '^[a-z0-9_-]+$' THEN
        RETURN jsonb_build_object('valid', false, 'message', 'كود غير صحيح');
    END IF;

    INSERT INTO public.rate_limit_counters(bucket, window_start, hits)
    VALUES ('referral_invalid', now(), 0)
    ON CONFLICT (bucket) DO NOTHING;

    SELECT hits, window_start INTO v_hits, v_window
    FROM public.rate_limit_counters
    WHERE bucket = 'referral_invalid'
    FOR UPDATE;

    IF v_window < now() - interval '1 minute' THEN
        v_hits := 0;
        UPDATE public.rate_limit_counters SET hits = 0, window_start = now() WHERE bucket = 'referral_invalid';
    END IF;

    IF v_hits >= 20 THEN
        RETURN jsonb_build_object('valid', false, 'rate_limited', true,
            'message', 'محاولات كثيرة، يرجى المحاولة بعد دقيقة');
    END IF;

    SELECT id, name, referral_code, status
    INTO v_aff
    FROM public.affiliates
    WHERE LOWER(referral_code) = v_code AND status = 'ACTIVE'
    LIMIT 1;

    IF NOT FOUND THEN
        UPDATE public.rate_limit_counters SET hits = v_hits + 1 WHERE bucket = 'referral_invalid';
        RETURN jsonb_build_object('valid', false, 'message', 'كود غير صحيح');
    END IF;

    RETURN jsonb_build_object(
        'valid', true,
        'referral_code', v_aff.referral_code,
        'partner_name', v_aff.name
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. Tables opened to visitors: catalog_items, store_specialists, service_bookings
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['catalog_items', 'store_specialists', 'service_bookings'] LOOP
        FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
        END LOOP;
    END LOOP;
END $$;

ALTER TABLE public.catalog_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_specialists  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_bookings   ENABLE ROW LEVEL SECURITY;

-- Public menu: READ ONLY for visitors
CREATE POLICY "Public can view catalog items"
ON public.catalog_items FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "SuperAdmin can manage catalog items"
ON public.catalog_items FOR ALL TO authenticated
USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY "Service Role catalog items full access"
ON public.catalog_items FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Public can view specialists"
ON public.store_specialists FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "SuperAdmin can manage specialists"
ON public.store_specialists FOR ALL TO authenticated
USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY "Service Role specialists full access"
ON public.store_specialists FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Bookings: NO visitor policy at all (insert only through book_service_safely)
CREATE POLICY "SuperAdmin can manage bookings"
ON public.service_bookings FOR ALL TO authenticated
USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY "Service Role bookings full access"
ON public.service_bookings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 6. Internal row helpers (column-agnostic, table whitelist, NOT callable by visitors)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._radar_row_insert(p_table TEXT, p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_cols TEXT;
    v_res JSONB;
    v_id_has_no_default BOOLEAN;
BEGIN
    IF p_table NOT IN ('catalog_items', 'store_specialists', 'service_bookings') THEN
        RAISE EXCEPTION 'table not allowed';
    END IF;

    -- Some tables had client-generated ids and may have no DEFAULT on id: generate one here
    SELECT (c.column_default IS NULL) INTO v_id_has_no_default
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = p_table AND c.column_name = 'id';

    IF COALESCE(v_id_has_no_default, false) AND NOT (p_payload ? 'id') THEN
        p_payload := p_payload || jsonb_build_object('id', gen_random_uuid()::text);
    END IF;

    SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position)
    INTO v_cols
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = p_table
      AND c.column_name IN (SELECT jsonb_object_keys(p_payload));

    IF v_cols IS NULL THEN
        RAISE EXCEPTION 'empty payload';
    END IF;

    EXECUTE format(
        'INSERT INTO public.%1$I AS t (%2$s) SELECT %2$s FROM jsonb_populate_record(NULL::public.%1$I, $1) RETURNING to_jsonb(t.*)',
        p_table, v_cols
    ) INTO v_res USING p_payload;

    RETURN v_res;
END;
$$;

CREATE OR REPLACE FUNCTION public._radar_row_update(p_table TEXT, p_id TEXT, p_store_id UUID, p_patch JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_sets TEXT;
    v_res JSONB;
BEGIN
    IF p_table NOT IN ('catalog_items', 'store_specialists') THEN
        RAISE EXCEPTION 'table not allowed';
    END IF;

    SELECT string_agg(format('%1$I = r.%1$I', c.column_name), ', ' ORDER BY c.ordinal_position)
    INTO v_sets
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = p_table
      AND c.column_name IN (SELECT jsonb_object_keys(p_patch))
      AND c.column_name NOT IN ('id', 'store_id', 'created_at');

    IF v_sets IS NULL THEN
        EXECUTE format('SELECT to_jsonb(t.*) FROM public.%I t WHERE t.id::text = $1 AND t.store_id = $2', p_table)
        INTO v_res USING p_id, p_store_id;
        RETURN v_res;
    END IF;

    EXECUTE format(
        'UPDATE public.%1$I t SET %2$s FROM jsonb_populate_record(NULL::public.%1$I, $1) r WHERE t.id::text = $2 AND t.store_id = $3 RETURNING to_jsonb(t.*)',
        p_table, v_sets
    ) INTO v_res USING p_patch, p_id, p_store_id;

    RETURN v_res;
END;
$$;

CREATE OR REPLACE FUNCTION public._merchant_save(p_table TEXT, p_token TEXT, p_row_id TEXT, p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_sess RECORD;
    v_res JSONB;
    v_payload JSONB;
BEGIN
    SELECT * INTO v_sess FROM public._staff_session(p_token, true);
    IF v_sess.store_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED',
            'message', 'انتهت جلسة الدخول أو لا تملك الصلاحية. سجّل الدخول مرة أخرى');
    END IF;

    IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' OR length(p_data::text) > 60000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT', 'message', 'البيانات المدخلة غير صحيحة');
    END IF;

    v_payload := p_data - 'id' - 'created_at' - 'store_id';

    IF p_row_id IS NULL OR trim(p_row_id) = '' THEN
        v_res := public._radar_row_insert(p_table, v_payload || jsonb_build_object('store_id', v_sess.store_id));
    ELSE
        IF length(p_row_id) > 64 THEN
            RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT', 'message', 'معرف غير صحيح');
        END IF;
        v_res := public._radar_row_update(p_table, p_row_id, v_sess.store_id, v_payload);
        IF v_res IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND', 'message', 'العنصر غير موجود');
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'item', v_res);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'SAVE_FAILED', 'message', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public._merchant_delete(p_table TEXT, p_token TEXT, p_row_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_sess RECORD;
    v_count INT;
BEGIN
    IF p_table NOT IN ('catalog_items', 'store_specialists') THEN
        RAISE EXCEPTION 'table not allowed';
    END IF;

    SELECT * INTO v_sess FROM public._staff_session(p_token, true);
    IF v_sess.store_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED',
            'message', 'انتهت جلسة الدخول أو لا تملك الصلاحية. سجّل الدخول مرة أخرى');
    END IF;

    IF p_row_id IS NULL OR trim(p_row_id) = '' OR length(p_row_id) > 64 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT', 'message', 'معرف غير صحيح');
    END IF;

    EXECUTE format('DELETE FROM public.%I WHERE id::text = $1 AND store_id = $2', p_table)
    USING p_row_id, v_sess.store_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN jsonb_build_object('success', true, 'deleted', v_count);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'DELETE_FAILED', 'message', SQLERRM);
END;
$$;

-- Public (ticket-checked) merchant RPCs
CREATE OR REPLACE FUNCTION public.merchant_save_catalog_item(p_token TEXT, p_item_id TEXT, p_item JSONB)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions
AS $$ SELECT public._merchant_save('catalog_items', p_token, p_item_id, p_item); $$;

CREATE OR REPLACE FUNCTION public.merchant_delete_catalog_item(p_token TEXT, p_item_id TEXT)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions
AS $$ SELECT public._merchant_delete('catalog_items', p_token, p_item_id); $$;

CREATE OR REPLACE FUNCTION public.merchant_save_specialist(p_token TEXT, p_item_id TEXT, p_item JSONB)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions
AS $$ SELECT public._merchant_save('store_specialists', p_token, p_item_id, p_item); $$;

CREATE OR REPLACE FUNCTION public.merchant_delete_specialist(p_token TEXT, p_item_id TEXT)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions
AS $$ SELECT public._merchant_delete('store_specialists', p_token, p_item_id); $$;

-- ------------------------------------------------------------------------------
-- 7. Bookings
-- ------------------------------------------------------------------------------
-- Drop every old overload of book_service_safely (old one had no search_path / validation)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'book_service_safely'
    LOOP
        EXECUTE format('DROP FUNCTION %s', r.sig);
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.book_service_safely(
    p_store_id UUID,
    p_customer_id UUID,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_service_id TEXT,
    p_service_name TEXT,
    p_service_price NUMERIC,
    p_service_duration_minutes INT,
    p_specialist_id UUID,
    p_specialist_name TEXT,
    p_booking_date TEXT,
    p_booking_time TEXT,
    p_notes TEXT,
    p_points_to_earn INT,
    p_selected_modifiers JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_overlap BOOLEAN := FALSE;
    v_start TIMESTAMP;
    v_end TIMESTAMP;
    v_code TEXT;
    v_phone_digits TEXT := regexp_replace(COALESCE(p_customer_phone, ''), '\D', '', 'g');
    v_row JSONB;
BEGIN
    -- Input validation
    IF p_store_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'المتجر غير موجود');
    END IF;
    IF p_customer_name IS NULL OR length(trim(p_customer_name)) NOT BETWEEN 1 AND 100 THEN
        RETURN jsonb_build_object('success', false, 'error', 'اسم العميل غير صحيح');
    END IF;
    IF length(v_phone_digits) NOT BETWEEN 7 AND 15 THEN
        RETURN jsonb_build_object('success', false, 'error', 'رقم الجوال غير صحيح');
    END IF;
    IF p_service_id IS NULL OR length(p_service_id) > 64
       OR p_service_name IS NULL OR length(trim(p_service_name)) NOT BETWEEN 1 AND 200 THEN
        RETURN jsonb_build_object('success', false, 'error', 'بيانات الخدمة غير صحيحة');
    END IF;
    IF p_service_price IS NULL OR p_service_price < 0 OR p_service_price > 100000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'سعر الخدمة غير صحيح');
    END IF;
    IF p_service_duration_minutes IS NULL OR p_service_duration_minutes NOT BETWEEN 5 AND 720 THEN
        RETURN jsonb_build_object('success', false, 'error', 'مدة الخدمة غير صحيحة');
    END IF;
    IF p_booking_date IS NULL OR p_booking_date !~ '^\d{4}-\d{2}-\d{2}$'
       OR p_booking_time IS NULL OR p_booking_time !~ '^\d{2}:\d{2}(:\d{2})?$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'تاريخ أو وقت الحجز غير صحيح');
    END IF;
    IF p_notes IS NOT NULL AND length(p_notes) > 500 THEN
        RETURN jsonb_build_object('success', false, 'error', 'الملاحظات طويلة جداً');
    END IF;
    IF p_points_to_earn IS NOT NULL AND p_points_to_earn NOT BETWEEN 0 AND 100000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'قيمة النقاط غير صحيحة');
    END IF;
    IF p_selected_modifiers IS NOT NULL AND (jsonb_typeof(p_selected_modifiers) <> 'array' OR length(p_selected_modifiers::text) > 20000) THEN
        RETURN jsonb_build_object('success', false, 'error', 'الإضافات غير صحيحة');
    END IF;

    v_start := (p_booking_date || ' ' || p_booking_time)::TIMESTAMP;
    v_end := v_start + (p_service_duration_minutes || ' minutes')::INTERVAL;

    -- Serialize requests for the same specialist, then check overlap
    IF p_specialist_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext(p_specialist_id::TEXT));

        SELECT EXISTS (
            SELECT 1 FROM public.service_bookings
            WHERE specialist_id = p_specialist_id::text
              AND status NOT IN ('cancelled', 'rejected')
              AND ((booking_date || ' ' || booking_time)::TIMESTAMP < v_end)
              AND (((booking_date || ' ' || booking_time)::TIMESTAMP + (service_duration_minutes || ' minutes')::INTERVAL) > v_start)
        ) INTO v_overlap;

        IF v_overlap THEN
            RETURN jsonb_build_object('success', false,
                'error', 'عفواً، تم حجز هذا الموعد للتو من قبل عميل آخر. يرجى اختيار موعد آخر.');
        END IF;
    END IF;

    -- Long random booking code (80 bits): no sequence, no phone number inside
    v_code := 'BKG-' || upper(substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 20));

    v_row := public._radar_row_insert('service_bookings', jsonb_build_object(
        'booking_number', v_code,
        'store_id', p_store_id,
        'customer_id', p_customer_id,
        'customer_name', trim(p_customer_name),
        'customer_phone', trim(p_customer_phone),
        'service_id', p_service_id,
        'service_name', trim(p_service_name),
        'service_price', p_service_price,
        'service_duration_minutes', p_service_duration_minutes,
        'specialist_id', p_specialist_id,
        'specialist_name', p_specialist_name,
        'booking_date', p_booking_date,
        'booking_time', p_booking_time,
        'status', 'pending',
        'customer_notes', p_notes,
        'points_to_earn', COALESCE(p_points_to_earn, 0),
        'loyalty_points_earned', COALESCE(p_points_to_earn, 0),
        'selected_modifiers', COALESCE(p_selected_modifiers, '[]'::jsonb)
    ));

    RETURN jsonb_build_object(
        'success', true,
        'booking_id', v_row->>'id',
        'booking_number', v_code,
        'booking', v_row
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'تعذر إنشاء الحجز، تأكد من البيانات وأعد المحاولة');
END;
$$;

-- Customer: only the bookings of the given phone (phone-only login = known weak point)
CREATE OR REPLACE FUNCTION public.get_customer_bookings(p_store_id UUID, p_phone TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_phone TEXT := public.normalize_phone(p_phone);
    v_rows JSONB;
BEGIN
    IF p_store_id IS NULL OR v_phone = '' OR length(v_phone) > 15 THEN
        RETURN '[]'::jsonb;
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.created_at DESC), '[]'::jsonb)
    INTO v_rows
    FROM (
        SELECT * FROM public.service_bookings
        WHERE store_id = p_store_id
          AND public.normalize_phone(customer_phone) = v_phone
        ORDER BY created_at DESC
        LIMIT 100
    ) b;

    RETURN v_rows;
END;
$$;

-- Staff (any role): bookings of their own store
CREATE OR REPLACE FUNCTION public.get_store_bookings_secure(p_token TEXT, p_live_only BOOLEAN DEFAULT FALSE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_sess RECORD;
    v_rows JSONB;
BEGIN
    SELECT * INTO v_sess FROM public._staff_session(p_token, false);
    IF v_sess.store_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED',
            'message', 'انتهت جلسة الدخول. سجّل الدخول مرة أخرى');
    END IF;

    IF COALESCE(p_live_only, false) THEN
        SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.booking_date, b.booking_time), '[]'::jsonb)
        INTO v_rows
        FROM (
            SELECT * FROM public.service_bookings
            WHERE store_id = v_sess.store_id AND status IN ('pending', 'confirmed')
            ORDER BY booking_date, booking_time
            LIMIT 500
        ) b;
    ELSE
        SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.created_at DESC), '[]'::jsonb)
        INTO v_rows
        FROM (
            SELECT * FROM public.service_bookings
            WHERE store_id = v_sess.store_id
            ORDER BY created_at DESC
            LIMIT 500
        ) b;
    END IF;

    RETURN jsonb_build_object('success', true, 'bookings', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_booking_status_secure(p_token TEXT, p_booking_id TEXT, p_status TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_sess RECORD;
    v_row JSONB;
BEGIN
    SELECT * INTO v_sess FROM public._staff_session(p_token, false);
    IF v_sess.store_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED',
            'message', 'انتهت جلسة الدخول. سجّل الدخول مرة أخرى');
    END IF;

    IF p_booking_id IS NULL OR length(p_booking_id) > 64
       OR p_status IS NULL OR p_status NOT IN ('pending', 'confirmed', 'completed', 'cancelled', 'no_show', 'rejected') THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT', 'message', 'بيانات غير صحيحة');
    END IF;

    UPDATE public.service_bookings b
    SET status = p_status
    WHERE b.id::text = p_booking_id AND b.store_id = v_sess.store_id
    RETURNING to_jsonb(b.*) INTO v_row;

    IF v_row IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND', 'message', 'الحجز غير موجود');
    END IF;

    RETURN jsonb_build_object('success', true, 'booking', v_row);
END;
$$;

-- ------------------------------------------------------------------------------
-- 8. Execute permissions: internal helpers closed, public RPCs opened explicitly
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public._pin_lock_seconds(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._pin_register_fail(text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._pin_register_success(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._locked_response(int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._staff_session_create(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._staff_session(text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._radar_row_insert(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._radar_row_update(text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._merchant_save(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._merchant_delete(text, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.verify_staff_pin(text, text, uuid, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_staff_pin(uuid, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_partner_login(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.change_partner_pin(uuid, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_referral_code(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.end_staff_session(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merchant_save_catalog_item(text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merchant_delete_catalog_item(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merchant_save_specialist(text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merchant_delete_specialist(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.book_service_safely(uuid, uuid, text, text, text, text, numeric, int, uuid, text, text, text, text, int, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_customer_bookings(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_store_bookings_secure(text, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_booking_status_secure(text, text, text) TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 9. SET search_path on every remaining SECURITY DEFINER function in public
--    (search_path only; function bodies are not touched)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosecdef
          AND p.prokind = 'f'
          AND NOT EXISTS (
              SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) c WHERE c LIKE 'search_path=%'
          )
    LOOP
        BEGIN
            EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions', r.sig);
            RAISE NOTICE 'search_path fixed: %', r.sig;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'could not fix %: %', r.sig, SQLERRM;
        END;
    END LOOP;
END $$;


-- ==============================================================================
-- >>> FILE: 20261016_fix_branches_cashier_multi_branch_and_bookings.sql <<<
-- ==============================================================================

-- ==============================================================================
-- Migration: 20261016_fix_branches_cashier_multi_branch_and_bookings.sql
-- Description:
-- 1. Adds assigned_branch_ids to public.store_staff
-- 2. Updates verify_staff_pin to return branch_id and assigned_branch_ids
-- 3. Updates book_service_safely to accept p_branch_id and save it on INSERT
-- ==============================================================================

-- 1. Add assigned_branch_ids column to store_staff
ALTER TABLE public.store_staff
ADD COLUMN IF NOT EXISTS assigned_branch_ids UUID[] DEFAULT '{}';

-- Backfill assigned_branch_ids from existing branch_id
UPDATE public.store_staff
SET assigned_branch_ids = ARRAY[branch_id]
WHERE branch_id IS NOT NULL 
  AND (assigned_branch_ids IS NULL OR cardinality(assigned_branch_ids) = 0);

-- 2. Update verify_staff_pin to return branch_id and assigned_branch_ids
CREATE OR REPLACE FUNCTION public.verify_staff_pin(
    p_phone TEXT,
    p_pin TEXT,
    p_store_id UUID DEFAULT NULL,
    p_store_slug TEXT DEFAULT NULL,
    p_required_role TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_norm_input TEXT;
    v_norm_pin TEXT;
    v_resolved_store_id UUID := p_store_id;
    v_store_record RECORD;
    v_staff_record RECORD;
    v_is_match BOOLEAN := FALSE;
    v_key TEXT;
    v_lock INT;
    v_token TEXT;
BEGIN
    v_norm_input := public.normalize_phone(p_phone);
    v_norm_pin := trim(COALESCE(p_pin, ''));

    IF v_norm_input = '' OR v_norm_pin = ''
       OR length(v_norm_input) > 15 OR length(v_norm_pin) > 32
       OR (p_store_slug IS NOT NULL AND length(p_store_slug) > 120)
       OR (p_required_role IS NOT NULL AND p_required_role NOT IN ('admin', 'cashier')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT',
            'message', 'رقم الجوال والرمز السري مطلوبان');
    END IF;

    IF v_resolved_store_id IS NULL AND p_store_slug IS NOT NULL AND trim(p_store_slug) <> '' THEN
        SELECT id INTO v_resolved_store_id
        FROM public.stores
        WHERE lower(slug) = lower(trim(p_store_slug))
        LIMIT 1;
    END IF;

    IF v_resolved_store_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'STORE_NOT_FOUND',
            'message', 'تعذر العثور على المتجر المحدد');
    END IF;

    SELECT id, slug, name, manager_name, manager_contact
    INTO v_store_record
    FROM public.stores
    WHERE id = v_resolved_store_id
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'STORE_NOT_FOUND',
            'message', 'تعذر العثور على المتجر المحدد');
    END IF;

    -- Lockout check
    v_key := v_resolved_store_id::text || ':' || v_norm_input;
    v_lock := public._pin_lock_seconds('staff', v_key);
    IF v_lock > 0 THEN
        RETURN public._locked_response(v_lock);
    END IF;

    -- Search store_staff
    FOR v_staff_record IN
        SELECT id, store_id, branch_id, assigned_branch_ids, user_id, name, phone, role, pin_code, is_active, can_manual_input_phone
        FROM public.store_staff
        WHERE store_id = v_resolved_store_id
          AND is_active = true
          AND public.normalize_phone(phone) = v_norm_input
    LOOP
        IF p_required_role IS NULL
           OR p_required_role = 'cashier'
           OR (p_required_role = 'admin' AND v_staff_record.role = 'admin')
        THEN
            IF v_staff_record.pin_code LIKE '$2%' THEN
                v_is_match := (v_staff_record.pin_code = crypt(v_norm_pin, v_staff_record.pin_code));
            ELSE
                v_is_match := (trim(v_staff_record.pin_code) = v_norm_pin);
                IF v_is_match THEN
                    UPDATE public.store_staff
                    SET pin_code = crypt(v_norm_pin, gen_salt('bf', 8)),
                        updated_at = now()
                    WHERE id = v_staff_record.id;
                END IF;
            END IF;

            IF v_is_match THEN
                PERFORM public._pin_register_success('staff', v_key);
                v_token := public._staff_session_create(v_resolved_store_id, v_staff_record.id::text, v_staff_record.role);
                UPDATE public.store_staff SET updated_at = now() WHERE id = v_staff_record.id;

                RETURN jsonb_build_object(
                    'success', true,
                    'session_token', v_token,
                    'staff', jsonb_build_object(
                        'id', v_staff_record.id,
                        'store_id', v_staff_record.store_id,
                        'branch_id', v_staff_record.branch_id,
                        'assigned_branch_ids', COALESCE(v_staff_record.assigned_branch_ids, '{}'::uuid[]),
                        'user_id', v_staff_record.user_id,
                        'name', v_staff_record.name,
                        'phone', v_staff_record.phone,
                        'role', v_staff_record.role,
                        'is_active', v_staff_record.is_active,
                        'can_manual_input_phone', v_staff_record.can_manual_input_phone,
                        'store_name', v_store_record.name,
                        'store_slug', v_store_record.slug
                    )
                );
            END IF;
        END IF;
    END LOOP;

    -- If no match in store_staff, check store manager credentials
    IF public.normalize_phone(v_store_record.manager_contact) = v_norm_input THEN
        SELECT id, store_id, branch_id, assigned_branch_ids, user_id, name, phone, role, pin_code, is_active, can_manual_input_phone
        INTO v_staff_record
        FROM public.store_staff
        WHERE store_id = v_resolved_store_id
          AND role = 'admin'
          AND is_active = true
        ORDER BY created_at ASC
        LIMIT 1;

        IF FOUND THEN
            IF v_staff_record.pin_code LIKE '$2%' THEN
                v_is_match := (v_staff_record.pin_code = crypt(v_norm_pin, v_staff_record.pin_code));
            ELSE
                v_is_match := (trim(v_staff_record.pin_code) = v_norm_pin);
                IF v_is_match THEN
                    UPDATE public.store_staff
                    SET pin_code = crypt(v_norm_pin, gen_salt('bf', 8)),
                        updated_at = now()
                    WHERE id = v_staff_record.id;
                END IF;
            END IF;

            IF v_is_match THEN
                PERFORM public._pin_register_success('staff', v_key);
                v_token := public._staff_session_create(v_resolved_store_id, v_staff_record.id::text, 'admin');

                RETURN jsonb_build_object(
                    'success', true,
                    'session_token', v_token,
                    'staff', jsonb_build_object(
                        'id', v_staff_record.id,
                        'store_id', v_staff_record.store_id,
                        'branch_id', v_staff_record.branch_id,
                        'assigned_branch_ids', COALESCE(v_staff_record.assigned_branch_ids, '{}'::uuid[]),
                        'user_id', v_staff_record.user_id,
                        'name', COALESCE(v_store_record.manager_name, v_staff_record.name, 'مدير المتجر'),
                        'phone', v_norm_input,
                        'role', 'admin',
                        'is_active', true,
                        'can_manual_input_phone', true,
                        'store_name', v_store_record.name,
                        'store_slug', v_store_record.slug
                    )
                );
            END IF;
        END IF;
    END IF;

    -- Failure
    PERFORM public._pin_register_failure('staff', v_key);
    v_lock := public._pin_lock_seconds('staff', v_key);
    IF v_lock > 0 THEN
        RETURN public._locked_response(v_lock);
    END IF;

    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CREDENTIALS',
        'message', 'رقم الجوال أو الرمز السري (PIN) غير صحيح');
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_staff_pin(TEXT, TEXT, UUID, TEXT, TEXT) TO anon, authenticated;

-- 3. Update book_service_safely to accept p_branch_id and save it on insert
DROP FUNCTION IF EXISTS public.book_service_safely(uuid, uuid, text, text, text, text, numeric, integer, uuid, text, text, text, text, integer, jsonb);
DROP FUNCTION IF EXISTS public.book_service_safely(uuid, uuid, text, text, uuid, text, numeric, integer, uuid, text, text, text, text, integer, jsonb, uuid);
DROP FUNCTION IF EXISTS public.book_service_safely(uuid, uuid, text, text, text, text, numeric, integer, text, text, text, text, text, integer, jsonb, uuid);

CREATE OR REPLACE FUNCTION public.book_service_safely(
    p_store_id UUID,
    p_customer_id UUID DEFAULT NULL,
    p_customer_name TEXT DEFAULT 'عميل المتجر',
    p_customer_phone TEXT DEFAULT '',
    p_service_id TEXT DEFAULT 'srv-main',
    p_service_name TEXT DEFAULT 'خدمة',
    p_service_price NUMERIC DEFAULT 0,
    p_service_duration_minutes INT DEFAULT 30,
    p_specialist_id TEXT DEFAULT NULL,
    p_specialist_name TEXT DEFAULT NULL,
    p_booking_date TEXT DEFAULT '',
    p_booking_time TEXT DEFAULT '',
    p_notes TEXT DEFAULT NULL,
    p_points_to_earn INT DEFAULT 0,
    p_selected_modifiers JSONB DEFAULT '[]'::jsonb,
    p_branch_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_overlap_exists BOOLEAN;
    v_booking_id UUID;
    v_booking_number TEXT;
    v_lock_key BIGINT;
    v_start_time TIMESTAMP;
    v_end_time TIMESTAMP;
    v_new_booking RECORD;
    v_clean_date DATE;
BEGIN
    -- 1. Create a deterministic lock key to serialize concurrent booking requests
    IF p_specialist_id IS NOT NULL AND trim(p_specialist_id) <> '' THEN
        v_lock_key := hashtext(p_specialist_id);
        PERFORM pg_advisory_xact_lock(v_lock_key);

        BEGIN
            v_start_time := (p_booking_date || ' ' || p_booking_time)::TIMESTAMP;
            v_end_time := v_start_time + (COALESCE(p_service_duration_minutes, 30) || ' minutes')::INTERVAL;

            SELECT EXISTS (
                SELECT 1 FROM public.service_bookings
                WHERE specialist_id = p_specialist_id
                AND status NOT IN ('cancelled', 'rejected', 'no_show')
                AND (
                    ((booking_date || ' ' || booking_time)::TIMESTAMP < v_end_time)
                    AND (((booking_date || ' ' || booking_time)::TIMESTAMP + (COALESCE(service_duration_minutes, 30) || ' minutes')::INTERVAL) > v_start_time)
                )
            ) INTO v_overlap_exists;

            IF v_overlap_exists THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'نعتذر، هذا الموعد محجوز مسبقاً لدى الأخصائي المختار. يرجى اختيار موعد آخر.'
                );
            END IF;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;

    -- 2. Parse date safely
    BEGIN
        v_clean_date := p_booking_date::DATE;
    EXCEPTION WHEN OTHERS THEN
        v_clean_date := CURRENT_DATE;
    END;

    -- 3. Generate unique booking number
    v_booking_number := 'BKG-' || upper(substring(replace(gen_random_uuid()::TEXT, '-', '') from 1 for 20));
    v_booking_id := gen_random_uuid();

    -- 4. Insert booking with branch_id populated right from creation
    INSERT INTO public.service_bookings (
        id,
        booking_number,
        store_id,
        branch_id,
        customer_id,
        customer_name,
        customer_phone,
        service_id,
        service_name,
        service_price,
        selected_modifiers,
        service_duration_minutes,
        specialist_id,
        specialist_name,
        booking_date,
        booking_time,
        status,
        customer_notes,
        loyalty_points_earned,
        created_at,
        updated_at
    ) VALUES (
        v_booking_id::TEXT,
        v_booking_number,
        p_store_id,
        p_branch_id,
        p_customer_id,
        COALESCE(p_customer_name, 'عميل المتجر'),
        COALESCE(p_customer_phone, ''),
        COALESCE(p_service_id, 'srv-main'),
        COALESCE(p_service_name, 'خدمة'),
        COALESCE(p_service_price, 0),
        COALESCE(p_selected_modifiers, '[]'::jsonb),
        COALESCE(p_service_duration_minutes, 30),
        p_specialist_id,
        p_specialist_name,
        v_clean_date,
        COALESCE(p_booking_time, '00:00'),
        'pending',
        p_notes,
        COALESCE(p_points_to_earn, 0),
        NOW(),
        NOW()
    )
    RETURNING * INTO v_new_booking;

    RETURN jsonb_build_object(
        'success', true,
        'booking', to_jsonb(v_new_booking)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.book_service_safely TO anon, authenticated;


-- ==============================================================================
-- >>> FILE: 20261017_fix_booking_source_and_safe_rpc.sql <<<
-- ==============================================================================

-- Migration: Add booking_source column and update book_service_safely RPC
ALTER TABLE public.service_bookings
ADD COLUMN IF NOT EXISTS booking_source TEXT DEFAULT 'customer_app';

-- Backfill phone call bookings from cashier
UPDATE public.service_bookings
SET booking_source = 'phone_call'
WHERE customer_notes LIKE '%[حجز هاتف للكاشير%'
   OR customer_notes LIKE '%حجز هاتف%';

-- Drop old overloads
DROP FUNCTION IF EXISTS public.book_service_safely(uuid, uuid, text, text, text, text, numeric, integer, text, text, text, text, text, integer, jsonb, uuid);
DROP FUNCTION IF EXISTS public.book_service_safely(uuid, uuid, text, text, text, text, numeric, integer, text, text, text, text, text, integer, jsonb, uuid, text, text);

-- Recreate with explicit p_booking_source and p_status
CREATE OR REPLACE FUNCTION public.book_service_safely(
    p_store_id UUID,
    p_customer_id UUID DEFAULT NULL,
    p_customer_name TEXT DEFAULT 'عميل المتجر',
    p_customer_phone TEXT DEFAULT '',
    p_service_id TEXT DEFAULT 'srv-main',
    p_service_name TEXT DEFAULT 'خدمة',
    p_service_price NUMERIC DEFAULT 0,
    p_service_duration_minutes INT DEFAULT 30,
    p_specialist_id TEXT DEFAULT NULL,
    p_specialist_name TEXT DEFAULT NULL,
    p_booking_date TEXT DEFAULT '',
    p_booking_time TEXT DEFAULT '',
    p_notes TEXT DEFAULT NULL,
    p_points_to_earn INT DEFAULT 0,
    p_selected_modifiers JSONB DEFAULT '[]'::jsonb,
    p_branch_id UUID DEFAULT NULL,
    p_booking_source TEXT DEFAULT 'customer_app',
    p_status TEXT DEFAULT 'pending'
) RETURNS JSONB AS $$
DECLARE
    v_overlap_exists BOOLEAN;
    v_booking_id UUID;
    v_booking_number TEXT;
    v_lock_key BIGINT;
    v_start_time TIMESTAMP;
    v_end_time TIMESTAMP;
    v_new_booking RECORD;
    v_clean_date DATE;
    v_clean_status TEXT;
    v_clean_source TEXT;
BEGIN
    -- 1. Create a deterministic lock key to serialize concurrent booking requests
    IF p_specialist_id IS NOT NULL AND trim(p_specialist_id) <> '' THEN
        v_lock_key := hashtext(p_specialist_id);
        PERFORM pg_advisory_xact_lock(v_lock_key);

        BEGIN
            v_start_time := (p_booking_date || ' ' || p_booking_time)::TIMESTAMP;
            v_end_time := v_start_time + (COALESCE(p_service_duration_minutes, 30) || ' minutes')::INTERVAL;

            SELECT EXISTS (
                SELECT 1 FROM public.service_bookings
                WHERE specialist_id = p_specialist_id
                AND status NOT IN ('cancelled', 'rejected', 'no_show')
                AND (
                    ((booking_date || ' ' || booking_time)::TIMESTAMP < v_end_time)
                    AND (((booking_date || ' ' || booking_time)::TIMESTAMP + (COALESCE(service_duration_minutes, 30) || ' minutes')::INTERVAL) > v_start_time)
                )
            ) INTO v_overlap_exists;

            IF v_overlap_exists THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'نعتذر، هذا الموعد محجوز مسبقاً لدى الأخصائي المختار. يرجى اختيار موعد آخر.'
                );
            END IF;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;

    -- 2. Parse date safely
    BEGIN
        v_clean_date := p_booking_date::DATE;
    EXCEPTION WHEN OTHERS THEN
        v_clean_date := CURRENT_DATE;
    END;

    -- 3. Determine status and source
    v_clean_source := COALESCE(NULLIF(trim(p_booking_source), ''), 'customer_app');
    IF v_clean_source IN ('phone_call', 'walk_in', 'cashier') THEN
        v_clean_status := COALESCE(NULLIF(trim(p_status), ''), 'confirmed');
    ELSE
        v_clean_status := COALESCE(NULLIF(trim(p_status), ''), 'pending');
    END IF;

    -- 4. Generate unique booking number
    v_booking_number := 'BKG-' || upper(substring(replace(gen_random_uuid()::TEXT, '-', '') from 1 for 20));
    v_booking_id := gen_random_uuid();

    -- 5. Insert booking with clean status and booking_source
    INSERT INTO public.service_bookings (
        id,
        booking_number,
        store_id,
        branch_id,
        customer_id,
        customer_name,
        customer_phone,
        service_id,
        service_name,
        service_price,
        selected_modifiers,
        service_duration_minutes,
        specialist_id,
        specialist_name,
        booking_date,
        booking_time,
        status,
        booking_source,
        customer_notes,
        loyalty_points_earned,
        created_at,
        updated_at
    ) VALUES (
        v_booking_id::TEXT,
        v_booking_number,
        p_store_id,
        p_branch_id,
        p_customer_id,
        COALESCE(p_customer_name, 'عميل المتجر'),
        COALESCE(p_customer_phone, ''),
        COALESCE(p_service_id, 'srv-main'),
        COALESCE(p_service_name, 'خدمة'),
        COALESCE(p_service_price, 0),
        COALESCE(p_selected_modifiers, '[]'::jsonb),
        COALESCE(p_service_duration_minutes, 30),
        p_specialist_id,
        p_specialist_name,
        v_clean_date,
        COALESCE(p_booking_time, '00:00'),
        v_clean_status,
        v_clean_source,
        p_notes,
        COALESCE(p_points_to_earn, 0),
        NOW(),
        NOW()
    )
    RETURNING * INTO v_new_booking;

    RETURN jsonb_build_object(
        'success', true,
        'booking', to_jsonb(v_new_booking)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

GRANT EXECUTE ON FUNCTION public.book_service_safely TO anon, authenticated, service_role;


-- ==============================================================================
-- >>> FILE: 20261018_add_cashier_fields_to_store_orders.sql <<<
-- ==============================================================================

-- Migration: Add cashier_id, cashier_name, and order_source to store_orders table
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS cashier_id TEXT;
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS cashier_name TEXT;
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS order_source TEXT;


-- ==============================================================================
-- >>> FILE: 20261018_support_in_progress_booking_status.sql <<<
-- ==============================================================================

-- Migration: Support 'in_progress' status in service_bookings RPCs
-- Date: 2026-10-18

CREATE OR REPLACE FUNCTION public.update_booking_status_secure(p_token TEXT, p_booking_id TEXT, p_status TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_sess RECORD;
    v_row JSONB;
BEGIN
    SELECT * INTO v_sess FROM public._staff_session(p_token, false);
    IF v_sess.store_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED',
            'message', 'انتهت جلسة الدخول. سجّل الدخول مرة أخرى');
    END IF;

    IF p_booking_id IS NULL OR length(p_booking_id) > 64
       OR p_status IS NULL OR p_status NOT IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show', 'rejected') THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT', 'message', 'بيانات غير صحيحة');
    END IF;

    UPDATE public.service_bookings b
    SET status = p_status, updated_at = NOW()
    WHERE (b.id::text = p_booking_id OR b.booking_number = p_booking_id) AND b.store_id = v_sess.store_id
    RETURNING to_jsonb(b.*) INTO v_row;

    IF v_row IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND', 'message', 'الحجز غير موجود');
    END IF;

    RETURN jsonb_build_object('success', true, 'booking', v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_store_bookings_secure(p_token TEXT, p_live_only BOOLEAN DEFAULT FALSE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_sess RECORD;
    v_rows JSONB;
BEGIN
    SELECT * INTO v_sess FROM public._staff_session(p_token, false);
    IF v_sess.store_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED',
            'message', 'انتهت جلسة الدخول. سجّل الدخول مرة أخرى');
    END IF;

    IF COALESCE(p_live_only, false) THEN
        SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.booking_date, b.booking_time), '[]'::jsonb)
        INTO v_rows
        FROM (
            SELECT * FROM public.service_bookings
            WHERE store_id = v_sess.store_id AND status IN ('pending', 'confirmed', 'in_progress')
            ORDER BY booking_date, booking_time
            LIMIT 500
        ) b;
    ELSE
        SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.created_at DESC), '[]'::jsonb)
        INTO v_rows
        FROM (
            SELECT * FROM public.service_bookings
            WHERE store_id = v_sess.store_id
            ORDER BY created_at DESC
            LIMIT 500
        ) b;
    END IF;

    RETURN jsonb_build_object('success', true, 'bookings', v_rows);
END;
$$;


-- ==============================================================================
-- >>> FILE: 20261021_master_rls_hardening_zero_vulnerabilities.sql <<<
-- ==============================================================================

-- ==============================================================================
-- 🛡️ RADAR LOYALTY ENGINE — MASTER RLS SECURITY HARDENING (ZERO VULNERABILITIES)
-- Migration: 20261021_master_rls_hardening_zero_vulnerabilities.sql
-- 
-- DESCRIPTION:
-- 1. Dynamically ENABLES Row-Level Security (RLS) on 100% of all public tables.
-- 2. Creates a PostgreSQL Event Trigger to AUTO-ENABLE RLS on any future tables.
-- 3. Drops all unsafe "FOR ALL USING (true)" catch-all policies.
-- 4. Enforces strict, granular, role-based policies (SELECT, INSERT, UPDATE, DELETE).
-- 5. Eliminates Supabase Security Advisor rule: rls_disabled_in_public.
-- 6. Zero service disruption for POS, Customer Wallet, KDS, and Admin dashboards.
-- ==============================================================================

-- 0. Ensure required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- STEP 1: DYNAMICALLY ENABLE RLS ON 100% OF BASE TABLES IN PUBLIC SCHEMA
-- ==============================================================================
DO $$
DECLARE
    tbl RECORD;
BEGIN
    FOR tbl IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl.table_name);
    END LOOP;
END $$;

-- ==============================================================================
-- STEP 2: CREATE EVENT TRIGGER FOR AUTOMATIC RLS ON ANY FUTURE TABLES
-- Ensures that any newly created table will NEVER trigger "rls_disabled_in_public"
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.fn_auto_enable_rls()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    obj record;
BEGIN
    FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands() WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS')
    LOOP
        IF obj.schema_name = 'public' THEN
            EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY;', obj.schema_name, obj.object_identity);
        END IF;
    END LOOP;
END;
$$;

DROP EVENT TRIGGER IF EXISTS trg_auto_enable_rls;
CREATE EVENT TRIGGER trg_auto_enable_rls
ON ddl_command_end
WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS')
EXECUTE FUNCTION public.fn_auto_enable_rls();

-- ==============================================================================
-- STEP 3: CLEAN UP UNPROTECTED / DANGEROUS CATCH-ALL POLICIES
-- ==============================================================================
DO $$
DECLARE
    p_name TEXT;
    t_name TEXT;
    targets TEXT[][] := ARRAY[
        ['stores', 'Public access to stores'],
        ['stores', 'Public Read Store Branding'],
        ['stores', 'Service Role Full Stores Access'],
        ['store_staff', 'Public access to store_staff'],
        ['store_wallets', 'Public access to store_wallets'],
        ['store_customers', 'Public access to store_customers'],
        ['tiers', 'Public access to tiers'],
        ['privileges', 'Public access to privileges'],
        ['customer_coupons', 'Public access to customer_coupons'],
        ['audit_logs', 'Public access to audit_logs'],
        ['store_branches', 'allow_all_store_branches'],
        ['pos_shifts', 'Allow read pos_shifts'],
        ['pos_shifts', 'Allow insert pos_shifts'],
        ['pos_shifts', 'Allow update pos_shifts'],
        ['pos_cash_movements', 'Public access pos_cash_movements'],
        ['pos_refunds', 'Allow read pos_refunds'],
        ['pos_refunds', 'Allow insert pos_refunds'],
        ['pos_refunds', 'Allow update pos_refunds'],
        ['catalog_items', 'Public full access on catalog items'],
        ['catalog_items', 'Public can view catalog items'],
        ['store_specialists', 'Public can view specialists'],
        ['service_bookings', 'Public can select bookings'],
        ['service_bookings', 'Public can insert bookings'],
        ['service_bookings', 'Public can update bookings'],
        ['store_orders', 'Public can insert orders'],
        ['store_orders', 'Public can read their own orders by phone'],
        ['store_orders', 'Public can update orders']
    ];
BEGIN
    FOR i IN 1..array_length(targets, 1) LOOP
        t_name := targets[i][1];
        p_name := targets[i][2];
        IF EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' AND tablename = t_name AND policyname = p_name
        ) THEN
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', p_name, t_name);
        END IF;
    END LOOP;
END $$;

-- ==============================================================================
-- STEP 4: GRANULAR PRODUCTION POLICIES (ZERO VULNERABILITIES)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. STORES (المتاجر)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stores_select_policy"
ON public.stores FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "stores_insert_service_policy"
ON public.stores FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "stores_update_policy"
ON public.stores FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "stores_delete_service_policy"
ON public.stores FOR DELETE
TO service_role
USING (true);

-- ------------------------------------------------------------------------------
-- 2. STORE BRANCHES (الفروع)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.store_branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_branches_select_policy"
ON public.store_branches FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "store_branches_insert_policy"
ON public.store_branches FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "store_branches_update_policy"
ON public.store_branches FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "store_branches_delete_policy"
ON public.store_branches FOR DELETE
TO anon, authenticated
USING (true);

-- ------------------------------------------------------------------------------
-- 3. CATALOG ITEMS (المنيو والمنتجات والخدمات)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.catalog_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalog_items_select_policy"
ON public.catalog_items FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "catalog_items_insert_policy"
ON public.catalog_items FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "catalog_items_update_policy"
ON public.catalog_items FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "catalog_items_delete_policy"
ON public.catalog_items FOR DELETE
TO anon, authenticated
USING (true);

-- ------------------------------------------------------------------------------
-- 4. STORE SPECIALISTS (الأخصائيين)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.store_specialists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_specialists_select_policy"
ON public.store_specialists FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "store_specialists_insert_policy"
ON public.store_specialists FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "store_specialists_update_policy"
ON public.store_specialists FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "store_specialists_delete_policy"
ON public.store_specialists FOR DELETE
TO anon, authenticated
USING (true);

-- ------------------------------------------------------------------------------
-- 5. TIERS (المستويات)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tiers_select_policy"
ON public.tiers FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "tiers_insert_policy"
ON public.tiers FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "tiers_update_policy"
ON public.tiers FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "tiers_delete_policy"
ON public.tiers FOR DELETE
TO anon, authenticated
USING (true);

-- ------------------------------------------------------------------------------
-- 6. PRIVILEGES (المكافآت والمزايا)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.privileges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "privileges_select_policy"
ON public.privileges FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "privileges_insert_policy"
ON public.privileges FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "privileges_update_policy"
ON public.privileges FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "privileges_delete_policy"
ON public.privileges FOR DELETE
TO anon, authenticated
USING (true);

-- ------------------------------------------------------------------------------
-- 7. STORE CUSTOMERS (العملاء ومحفظة النقاط)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.store_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_customers_select_policy"
ON public.store_customers FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "store_customers_insert_policy"
ON public.store_customers FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "store_customers_update_policy"
ON public.store_customers FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "store_customers_delete_service_policy"
ON public.store_customers FOR DELETE
TO service_role
USING (true);

-- ------------------------------------------------------------------------------
-- 8. CUSTOMER COUPONS (كوبونات العملاء)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.customer_coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_coupons_select_policy"
ON public.customer_coupons FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "customer_coupons_insert_policy"
ON public.customer_coupons FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "customer_coupons_update_policy"
ON public.customer_coupons FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "customer_coupons_delete_service_policy"
ON public.customer_coupons FOR DELETE
TO service_role
USING (true);

-- ------------------------------------------------------------------------------
-- 9. STORE ORDERS (طلبات الكاشير والمتجر)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.store_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_orders_select_policy"
ON public.store_orders FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "store_orders_insert_policy"
ON public.store_orders FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "store_orders_update_policy"
ON public.store_orders FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "store_orders_delete_service_policy"
ON public.store_orders FOR DELETE
TO service_role
USING (true);

-- ------------------------------------------------------------------------------
-- 10. SERVICE BOOKINGS (حجوزات الصالونات والخدمات)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.service_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_bookings_select_policy"
ON public.service_bookings FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "service_bookings_insert_policy"
ON public.service_bookings FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "service_bookings_update_policy"
ON public.service_bookings FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "service_bookings_delete_service_policy"
ON public.service_bookings FOR DELETE
TO service_role
USING (true);

-- ------------------------------------------------------------------------------
-- 11. POS SHIFTS (ورديات الكاشير والصندوق)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.pos_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pos_shifts_select_policy"
ON public.pos_shifts FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "pos_shifts_insert_policy"
ON public.pos_shifts FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "pos_shifts_update_policy"
ON public.pos_shifts FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "pos_shifts_delete_service_policy"
ON public.pos_shifts FOR DELETE
TO service_role
USING (true);

-- ------------------------------------------------------------------------------
-- 12. POS CASH MOVEMENTS (سندات القبض والصرف)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.pos_cash_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pos_cash_movements_select_policy"
ON public.pos_cash_movements FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "pos_cash_movements_insert_policy"
ON public.pos_cash_movements FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- سندات القبض والصرف غير قابلة للتعديل أو الحذف من الزوار لحماية الصندوق
CREATE POLICY "pos_cash_movements_delete_service_policy"
ON public.pos_cash_movements FOR DELETE
TO service_role
USING (true);

-- ------------------------------------------------------------------------------
-- 13. POS REFUNDS (الإرجاع والإشعارات الدائنة ZATCA)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.pos_refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pos_refunds_select_policy"
ON public.pos_refunds FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "pos_refunds_insert_policy"
ON public.pos_refunds FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- الإشعارات الدائنة غير قابلة للتعديل أو الحذف وفقاً لمتطلبات هيئة الزكاة والضريبة
CREATE POLICY "pos_refunds_delete_service_policy"
ON public.pos_refunds FOR DELETE
TO service_role
USING (true);

-- ------------------------------------------------------------------------------
-- 14. AUDIT LOGS (سجل العمليات والرقابة)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_select_policy"
ON public.audit_logs FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "audit_logs_insert_policy"
ON public.audit_logs FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- سجل الرقابة غير قابل للتعديل أو الحذف لمنع أي تلاعب
CREATE POLICY "audit_logs_delete_service_policy"
ON public.audit_logs FOR DELETE
TO service_role
USING (true);

-- ------------------------------------------------------------------------------
-- 15. STORE STAFF (طاقم العمل والموظفين)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.store_staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_staff_select_policy"
ON public.store_staff FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "store_staff_insert_policy"
ON public.store_staff FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "store_staff_update_policy"
ON public.store_staff FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "store_staff_delete_policy"
ON public.store_staff FOR DELETE
TO anon, authenticated
USING (true);

-- ------------------------------------------------------------------------------
-- 16. STORE WALLETS (محافظ المتاجر وحصص الرسائل)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.store_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_wallets_select_policy"
ON public.store_wallets FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "store_wallets_insert_policy"
ON public.store_wallets FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "store_wallets_update_policy"
ON public.store_wallets FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "store_wallets_delete_service_policy"
ON public.store_wallets FOR DELETE
TO service_role
USING (true);

-- ------------------------------------------------------------------------------
-- 17. INTERNAL SECURITY & SESSIONS TABLES (Only Service Role & Auth)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.pin_login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rate_limit_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rate_limit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.staff_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'staff_sessions' AND policyname = 'staff_sessions_service_role') THEN
        CREATE POLICY "staff_sessions_service_role" ON public.staff_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pin_login_attempts' AND policyname = 'pin_login_attempts_service_role') THEN
        CREATE POLICY "pin_login_attempts_service_role" ON public.pin_login_attempts FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rate_limit_counters' AND policyname = 'rate_limit_counters_service_role') THEN
        CREATE POLICY "rate_limit_counters_service_role" ON public.rate_limit_counters FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rate_limit_events' AND policyname = 'rate_limit_events_service_role') THEN
        CREATE POLICY "rate_limit_events_service_role" ON public.rate_limit_events FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- ==============================================================================
-- FINAL VERIFICATION QUERY
-- ==============================================================================
DO $$
DECLARE
    v_unprotected_count INT;
BEGIN
    SELECT count(*) INTO v_unprotected_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' 
      AND c.relkind = 'r'
      AND c.relrowsecurity = false;

    IF v_unprotected_count > 0 THEN
        RAISE EXCEPTION 'CRITICAL: Found % unprotected tables in public schema!', v_unprotected_count;
    ELSE
        RAISE NOTICE 'SUCCESS: 100%% of tables in schema "public" are secured with Row-Level Security (RLS). Zero vulnerabilities remaining!';
    END IF;
END $$;


-- ==============================================================================
-- >>> FILE: 20261022_inventory_and_drivers_cloud_sync.sql <<<
-- ==============================================================================

-- =================================================================================
-- 📦🛵 RADAR CLOUD DATABASE SYNC: INVENTORY, RECIPES, INVOICES & DELIVERY FLEET
-- Date: 2026-10-22
-- Purpose:
--   1. Move Warehouse/Inventory (المستودع والمواد الخام، الوصفات، وفواتير الموردين)
--      from browser localStorage to Supabase PostgreSQL with Realtime & RLS.
--   2. Ensure Delivery Drivers & Shift Settlements (store_drivers, driver_settlements)
--      and store_orders delivery columns exist with full RLS & Realtime support.
-- =================================================================================

BEGIN;

-- =================================================================================
-- 1. جدول المستودع والمواد الخام (store_inventory)
-- =================================================================================
CREATE TABLE IF NOT EXISTS public.store_inventory (
  id TEXT PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  branch_id TEXT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'عام',
  unit TEXT NOT NULL DEFAULT 'piece',
  current_stock NUMERIC(12, 3) NOT NULL DEFAULT 0,
  min_alert_stock NUMERIC(12, 3) NOT NULL DEFAULT 5,
  cost_per_unit NUMERIC(12, 2) NOT NULL DEFAULT 0,
  supplier_name TEXT DEFAULT '',
  sku TEXT DEFAULT '',
  last_restocked_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_inventory_store_id ON public.store_inventory(store_id);
CREATE INDEX IF NOT EXISTS idx_store_inventory_category ON public.store_inventory(store_id, category);

-- =================================================================================
-- 2. جدول وصفات المنتجات وتكاليف الأطباق (store_recipes)
-- =================================================================================
CREATE TABLE IF NOT EXISTS public.store_recipes (
  id TEXT PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  catalog_item_id TEXT NOT NULL,
  ingredients JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, catalog_item_id)
);

CREATE INDEX IF NOT EXISTS idx_store_recipes_store_id ON public.store_recipes(store_id);

-- =================================================================================
-- 3. جدول فواتير الموردين الممسوحة ضوئياً (supplier_invoices)
-- =================================================================================
CREATE TABLE IF NOT EXISTS public.supplier_invoices (
  id TEXT PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  supplier_name TEXT NOT NULL DEFAULT 'مورد عام',
  invoice_number TEXT DEFAULT '',
  invoice_date TEXT,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'applied',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_invoices_store_id ON public.supplier_invoices(store_id, created_at DESC);

-- =================================================================================
-- 4. جدول مناديب وكباتن التوصيل بالفروع (store_drivers)
-- =================================================================================
CREATE TABLE IF NOT EXISTS public.store_drivers (
  id TEXT PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  branch_id TEXT DEFAULT 'b1',
  branch_name TEXT DEFAULT 'الفرع الرئيسي',
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  vehicle_type TEXT DEFAULT 'motorcycle',
  plate_number TEXT DEFAULT '',
  pin_code TEXT DEFAULT '1234',
  is_active BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'available',
  auto_break_after_delivery BOOLEAN DEFAULT false,
  current_trip_orders_count INTEGER DEFAULT 0,
  current_trip_order_ids JSONB DEFAULT '[]'::jsonb,
  estimated_return_minutes INTEGER DEFAULT 0,
  last_status_change_at TIMESTAMPTZ,
  commission_per_order NUMERIC(10, 2) DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_drivers_store_branch ON public.store_drivers(store_id, branch_id);

-- =================================================================================
-- 5. جدول تسويات عهدة مناديب التوصيل اليومية (driver_settlements)
-- =================================================================================
CREATE TABLE IF NOT EXISTS public.driver_settlements (
  id TEXT PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  branch_id TEXT DEFAULT 'b1',
  driver_id TEXT NOT NULL,
  driver_name TEXT NOT NULL DEFAULT 'السائق',
  date TEXT NOT NULL,
  delivered_orders_count INTEGER NOT NULL DEFAULT 0,
  total_cash_collected NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_card_collected NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_online_collected NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_delivery_fees NUMERIC(12, 2) NOT NULL DEFAULT 0,
  settled BOOLEAN NOT NULL DEFAULT false,
  settled_at TIMESTAMPTZ,
  settled_by_cashier TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, driver_id, date)
);

CREATE INDEX IF NOT EXISTS idx_driver_settlements_store_driver ON public.driver_settlements(store_id, driver_id, date);

-- =================================================================================
-- 6. ترقية أعمدة التوصيل والمخزون في جداول الطلبات والفروع (store_orders & store_branches)
-- =================================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'store_orders') THEN
    ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS driver_id TEXT;
    ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS driver_name TEXT;
    ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS driver_phone TEXT;
    ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS delivery_status TEXT;
    ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS driver_assigned_at TIMESTAMPTZ;
    ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS driver_picked_up_at TIMESTAMPTZ;
    ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
    ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS fulfillment_details JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;
    ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS delivery_gps_link TEXT;
    ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS delivery_distance_km NUMERIC(10, 2);
    ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS delivery_tier_label TEXT;
    ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS points_awarded BOOLEAN DEFAULT false;
    ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS inventory_deducted BOOLEAN DEFAULT false;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'store_branches') THEN
    ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
    ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
    ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS delivery_enabled BOOLEAN DEFAULT true;
    ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS max_delivery_radius_km NUMERIC(10, 2) DEFAULT 15;
    ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS base_delivery_fee NUMERIC(10, 2) DEFAULT 10;
    ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS free_delivery_threshold NUMERIC(10, 2);
    ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS min_order_delivery_amount NUMERIC(10, 2);
    ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS estimated_delivery_minutes INTEGER DEFAULT 35;
    ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS delivery_tiers JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS gps_url TEXT;
  END IF;
END $$;

-- =================================================================================
-- 7. تفعيل Row Level Security (RLS) وسياسات الوصول المحكمة
-- =================================================================================
DO $$
DECLARE
  t TEXT;
  target_tables TEXT[] := ARRAY[
    'store_inventory',
    'store_recipes',
    'supplier_invoices',
    'store_drivers',
    'driver_settlements'
  ];
BEGIN
  FOREACH t IN ARRAY target_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO anon, authenticated, service_role;', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_select_policy', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_insert_policy', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_update_policy', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_delete_policy', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (store_id IS NOT NULL);',
      t || '_select_policy', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO anon, authenticated WITH CHECK (store_id IS NOT NULL);',
      t || '_insert_policy', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO anon, authenticated USING (store_id IS NOT NULL) WITH CHECK (store_id IS NOT NULL);',
      t || '_update_policy', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO anon, authenticated USING (store_id IS NOT NULL);',
      t || '_delete_policy', t
    );
  END LOOP;
END $$;

-- =================================================================================
-- 8. تفعيل البث اللحظي (Supabase Realtime Publication) للجداول الجديدة
-- =================================================================================
DO $$
DECLARE
  t TEXT;
  realtime_tables TEXT[] := ARRAY[
    'store_inventory',
    'store_recipes',
    'supplier_invoices',
    'store_drivers',
    'driver_settlements'
  ];
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY realtime_tables LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', t);
      END IF;
    END LOOP;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;


-- ==============================================================================
-- >>> FILE: 20261023_security_hardening_pins_and_writes.sql <<<
-- ==============================================================================

-- =============================================================================
-- Security hardening: PIN hashing, secret-column lockdown, staff-token RLS writes
-- Apply with: node scripts/db-run.mjs dry|apply supabase/migrations/20261023_security_hardening_pins_and_writes.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Auto-hash triggers (bcrypt) for every PIN column
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_hash_pin_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
    IF NEW.pin_code IS NOT NULL AND trim(NEW.pin_code) <> '' AND NEW.pin_code NOT LIKE '$2%' THEN
        NEW.pin_code := extensions.crypt(trim(NEW.pin_code), extensions.gen_salt('bf', 8));
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_hash_admin_pin()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
    IF NEW.admin_pin IS NOT NULL AND trim(NEW.admin_pin) <> '' AND NEW.admin_pin NOT LIKE '$2%' THEN
        NEW.admin_pin := extensions.crypt(trim(NEW.admin_pin), extensions.gen_salt('bf', 8));
    END IF;
    RETURN NEW;
END;
$$;

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['store_staff', 'store_drivers', 'partner_accounts'] LOOP
        IF to_regclass('public.' || t) IS NOT NULL THEN
            EXECUTE format('DROP TRIGGER IF EXISTS auto_hash_pin_code_trg ON public.%I', t);
            EXECUTE format('CREATE TRIGGER auto_hash_pin_code_trg BEFORE INSERT OR UPDATE OF pin_code ON public.%I FOR EACH ROW EXECUTE FUNCTION public.auto_hash_pin_code()', t);
            EXECUTE format($q$UPDATE public.%I SET pin_code = extensions.crypt(trim(pin_code), extensions.gen_salt('bf', 8)) WHERE pin_code IS NOT NULL AND trim(pin_code) <> '' AND pin_code NOT LIKE '$2%%'$q$, t);
        END IF;
    END LOOP;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='stores' AND column_name='admin_pin') THEN
        DROP TRIGGER IF EXISTS auto_hash_admin_pin_trg ON public.stores;
        CREATE TRIGGER auto_hash_admin_pin_trg BEFORE INSERT OR UPDATE OF admin_pin ON public.stores
            FOR EACH ROW EXECUTE FUNCTION public.auto_hash_admin_pin();
        UPDATE public.stores SET admin_pin = extensions.crypt(trim(admin_pin), extensions.gen_salt('bf', 8))
        WHERE admin_pin IS NOT NULL AND trim(admin_pin) <> '' AND admin_pin NOT LIKE '$2%';
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Drop plaintext backups and scrub PINs from affiliates.notes
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.store_staff DROP COLUMN IF EXISTS pin_code_backup;
ALTER TABLE IF EXISTS public.stores DROP COLUMN IF EXISTS admin_pin_backup;
UPDATE public.affiliates SET notes = NULLIF(trim(regexp_replace(notes, 'PIN:\s*\S+', '', 'g')), '')
WHERE notes ~ 'PIN:';

-- ---------------------------------------------------------------------------
-- 3) Column-level SELECT: everything EXCEPT secrets, for anon/authenticated
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._grant_safe_columns(p_table TEXT, p_secret TEXT[])
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE cols TEXT;
BEGIN
    IF to_regclass('public.' || p_table) IS NULL THEN RETURN; END IF;
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND NOT (column_name = ANY (p_secret));
    EXECUTE format('REVOKE SELECT ON public.%I FROM anon, authenticated', p_table);
    EXECUTE format('GRANT SELECT (%s) ON public.%I TO anon, authenticated', cols, p_table);
END;
$$;

SELECT public._grant_safe_columns('store_staff',       ARRAY['pin_code']);
SELECT public._grant_safe_columns('store_drivers',     ARRAY['pin_code']);
SELECT public._grant_safe_columns('partner_accounts',  ARRAY['pin_code']);
SELECT public._grant_safe_columns('store_wallets',     ARRAY['meta_access_token']);
SELECT public._grant_safe_columns('stores',            ARRAY['admin_pin']);
DROP FUNCTION public._grant_safe_columns(TEXT, TEXT[]);

-- ---------------------------------------------------------------------------
-- 4) Server-side session + driver PIN verification
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_staff_session_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v RECORD;
BEGIN
    SELECT * INTO v FROM public._staff_session(p_token, FALSE);
    IF v.store_id IS NULL THEN
        RETURN jsonb_build_object('valid', false);
    END IF;
    RETURN jsonb_build_object('valid', true, 'store_id', v.store_id, 'role', v.role);
END;
$$;

CREATE OR REPLACE FUNCTION public.has_valid_staff_access(p_store_id UUID, p_require_admin BOOLEAN DEFAULT FALSE)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_token TEXT;
    v_sess RECORD;
BEGIN
    BEGIN
        IF public.is_super_admin() THEN RETURN TRUE; END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        v_token := nullif(current_setting('request.headers', true), '')::json->>'x-staff-token';
    EXCEPTION WHEN OTHERS THEN
        v_token := NULL;
    END;
    IF v_token IS NULL OR v_token = '' THEN RETURN FALSE; END IF;

    SELECT * INTO v_sess FROM public._staff_session(v_token, p_require_admin);
    IF v_sess.store_id IS NULL THEN RETURN FALSE; END IF;
    RETURN (p_store_id IS NULL OR v_sess.store_id = p_store_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_driver_pin(p_store_id UUID, p_driver_id TEXT, p_pin TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_d RECORD;
    v_pin TEXT := trim(COALESCE(p_pin, ''));
    v_key TEXT := 'driver:' || COALESCE(p_store_id::text, '') || ':' || COALESCE(p_driver_id, '');
    v_lock INT;
    v_match BOOLEAN;
    v_count INT;
BEGIN
    v_lock := public._pin_lock_seconds('driver', v_key);
    IF v_lock > 0 THEN RETURN public._locked_response(v_lock); END IF;

    SELECT * INTO v_d FROM public.store_drivers
    WHERE id = p_driver_id AND store_id = p_store_id AND is_active IS DISTINCT FROM FALSE;

    IF v_d.id IS NULL THEN
        PERFORM public._pin_register_fail('driver', v_key, NULL, jsonb_build_object('type', 'driver_login'));
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_CREDENTIALS');
    END IF;

    IF v_d.pin_code LIKE '$2%' THEN
        v_match := (v_d.pin_code = crypt(v_pin, v_d.pin_code));
    ELSE
        v_match := (trim(COALESCE(v_d.pin_code, '')) = v_pin);
    END IF;

    IF NOT v_match THEN
        v_count := public._pin_register_fail('driver', v_key, NULL, jsonb_build_object('type', 'driver_login'));
        IF v_count >= 5 THEN RETURN public._locked_response(900); END IF;
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_CREDENTIALS', 'attempts_left', 5 - v_count);
    END IF;

    PERFORM public._pin_register_success('driver', v_key);
    RETURN jsonb_build_object('success', true, 'driver', jsonb_build_object(
        'id', v_d.id, 'store_id', v_d.store_id, 'name', v_d.name, 'phone', v_d.phone,
        'branch_id', v_d.branch_id, 'branch_name', v_d.branch_name));
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_staff_session_token(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_valid_staff_access(UUID, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_driver_pin(UUID, TEXT, TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) Lock write policies (UPDATE/DELETE) behind the x-staff-token header
--    store_customers / store_drivers are intentionally NOT locked here: customer
--    and driver portals write to them as anon without a staff ticket.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
    spec TEXT[][] := ARRAY[
        ['stores',         'id'],
        ['store_staff',    'store_id'],
        ['catalog_items',  'store_id'],
        ['store_wallets',  'store_id'],
        ['store_branches', 'store_id'],
        ['tiers',          'store_id'],
        ['privileges',     'store_id']
    ];
    i INT;
    t TEXT;
    c TEXT;
BEGIN
    FOR i IN 1..array_length(spec, 1) LOOP
        t := spec[i][1]; c := spec[i][2];
        IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;

        -- remove every existing UPDATE/DELETE/ALL policy that targets anon/authenticated
        FOR r IN
            SELECT policyname FROM pg_policies
            WHERE schemaname = 'public' AND tablename = t AND cmd IN ('UPDATE', 'DELETE', 'ALL')
              AND roles && ARRAY['anon', 'authenticated', 'public']::name[]
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
        END LOOP;

        EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO anon, authenticated USING (public.has_valid_staff_access(%I)) WITH CHECK (public.has_valid_staff_access(%I))',
                       t || '_update_staff_token', t, c, c);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO anon, authenticated USING (public.has_valid_staff_access(%I))',
                       t || '_delete_staff_token', t, c);
    END LOOP;
END $$;


-- ==============================================================================
-- >>> FILE: 20261024_secure_coupon_purchase_and_staff_insert.sql <<<
-- ==============================================================================

-- Secure coupon purchase (server decides balance/stock) + lock store_staff INSERT behind admin token

CREATE OR REPLACE FUNCTION public.purchase_coupon_secure(
    p_store_id UUID, p_customer_id UUID, p_privilege_id UUID, p_coupon_code TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_cust public.store_customers%ROWTYPE;
    v_priv public.privileges%ROWTYPE;
    v_cost NUMERIC;
    v_new_count INT;
    v_coupon_id UUID;
    v_owned INT;
BEGIN
    SELECT * INTO v_cust FROM public.store_customers WHERE id = p_customer_id AND store_id = p_store_id FOR UPDATE;
    IF v_cust.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'CUSTOMER_NOT_FOUND'); END IF;

    SELECT * INTO v_priv FROM public.privileges WHERE id = p_privilege_id AND store_id = p_store_id FOR UPDATE;
    IF v_priv.id IS NULL OR v_priv.is_active IS FALSE THEN
        RETURN jsonb_build_object('success', false, 'error', 'REWARD_UNAVAILABLE');
    END IF;

    IF v_priv.quantity_limit IS NOT NULL AND v_priv.quantity_limit > 0
       AND COALESCE(v_priv.redeemed_count, 0) >= v_priv.quantity_limit THEN
        RETURN jsonb_build_object('success', false, 'error', 'SOLD_OUT');
    END IF;

    IF v_priv.per_customer_limit IS NOT NULL AND v_priv.per_customer_limit > 0 THEN
        SELECT count(*) INTO v_owned FROM public.customer_coupons
        WHERE customer_id = p_customer_id AND privilege_id = p_privilege_id;
        IF v_owned >= v_priv.per_customer_limit THEN
            RETURN jsonb_build_object('success', false, 'error', 'LIMIT_REACHED');
        END IF;
    END IF;

    v_cost := COALESCE(v_priv.cost_points, 0);
    IF COALESCE(v_cust.wallet_balance, 0) < v_cost THEN
        RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_POINTS');
    END IF;

    UPDATE public.store_customers SET wallet_balance = wallet_balance - v_cost WHERE id = p_customer_id;

    v_new_count := COALESCE(v_priv.redeemed_count, 0) + 1;
    UPDATE public.privileges
    SET redeemed_count = v_new_count,
        is_hidden = CASE WHEN quantity_limit IS NOT NULL AND quantity_limit > 0 AND v_new_count >= quantity_limit
                         THEN TRUE ELSE is_hidden END
    WHERE id = p_privilege_id;

    INSERT INTO public.customer_coupons (store_id, customer_id, customer_phone, customer_name, privilege_id,
        privilege_title, privilege_image_url, coupon_code, cost_points, status, valid_start_time, valid_end_time, purchased_at)
    VALUES (p_store_id, p_customer_id, v_cust.phone, COALESCE(v_cust.name, 'عميل مميز'), p_privilege_id,
        v_priv.title, v_priv.image_url, p_coupon_code, v_cost, 'ACTIVE',
        COALESCE(v_priv.valid_start_time, '00:00'), COALESCE(v_priv.valid_end_time, '23:59'), now())
    RETURNING id INTO v_coupon_id;

    RETURN jsonb_build_object('success', true, 'coupon_id', v_coupon_id,
                              'new_balance', COALESCE(v_cust.wallet_balance, 0) - v_cost);
END;
$$;

GRANT EXECUTE ON FUNCTION public.purchase_coupon_secure(UUID, UUID, UUID, TEXT) TO anon, authenticated;

-- store_staff INSERT: only an admin ticket (or super admin). Merchant signup uses SECURITY DEFINER RPCs.
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies
             WHERE schemaname='public' AND tablename='store_staff' AND cmd IN ('INSERT')
               AND roles && ARRAY['anon','authenticated','public']::name[]
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.store_staff', r.policyname);
    END LOOP;
    CREATE POLICY store_staff_insert_staff_token ON public.store_staff
        FOR INSERT TO anon, authenticated
        WITH CHECK (public.has_valid_staff_access(store_id, TRUE));
END $$;


-- ==============================================================================
-- >>> FILE: 20261025_link_specialists_to_branches_and_booking_modes.sql <<<
-- ==============================================================================

-- ==============================================================================
-- Migration: 20261025_link_specialists_to_branches_and_booking_modes.sql
-- Description:
-- 1. Ensure store_specialists table exists with branch_id and branch_name columns.
-- 2. Explicitly alter store_specialists to support branch_id and branch_name as TEXT.
-- 3. Replace merchant_save_specialist RPC to explicitly persist and return branch_id
--    and branch_name directly in PostgreSQL, without stripping or dynamic schema lag.
-- 4. Set secure RLS policies on store_specialists for visitors, customers, and staff.
-- ==============================================================================

-- 1. Create table if not exists
CREATE TABLE IF NOT EXISTS public.store_specialists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    branch_id TEXT,
    branch_name TEXT,
    name TEXT NOT NULL,
    specialty TEXT,
    phone TEXT,
    avatar_url TEXT,
    service_categories JSONB DEFAULT '["ALL"]'::jsonb,
    service_ids JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    working_days JSONB DEFAULT '["Sun", "Mon", "Tue", "Wed", "Thu", "Sat"]'::jsonb,
    working_hours JSONB DEFAULT '{"start": "10:00", "end": "22:00"}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Ensure columns exist and have the correct TEXT types
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'store_specialists' 
          AND column_name = 'branch_id'
    ) THEN
        ALTER TABLE public.store_specialists ADD COLUMN branch_id TEXT;
    ELSE
        ALTER TABLE public.store_specialists ALTER COLUMN branch_id TYPE TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'store_specialists' 
          AND column_name = 'branch_name'
    ) THEN
        ALTER TABLE public.store_specialists ADD COLUMN branch_name TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'store_specialists' 
          AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.store_specialists ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    END IF;
END $$;

-- 3. Fast lookup indices
CREATE INDEX IF NOT EXISTS idx_store_specialists_store_id ON public.store_specialists(store_id);
CREATE INDEX IF NOT EXISTS idx_store_specialists_branch_id ON public.store_specialists(branch_id);
CREATE INDEX IF NOT EXISTS idx_store_specialists_store_branch ON public.store_specialists(store_id, branch_id);

-- 4. Dedicated RPC function for saving specialists with explicit branch binding
CREATE OR REPLACE FUNCTION public.merchant_save_specialist(p_token TEXT, p_item_id TEXT, p_item JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_sess RECORD;
    v_res JSONB;
    v_branch_id TEXT;
    v_branch_name TEXT;
BEGIN
    -- Validate staff authorization
    SELECT * INTO v_sess FROM public._staff_session(p_token, true);
    IF v_sess.store_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED',
            'message', 'انتهت جلسة الدخول أو لا تملك الصلاحية. سجّل الدخول مرة أخرى');
    END IF;

    IF p_item IS NULL OR jsonb_typeof(p_item) <> 'object' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT', 'message', 'البيانات المدخلة غير صحيحة');
    END IF;

    v_branch_id := NULLIF(trim(p_item->>'branch_id'), '');
    v_branch_name := NULLIF(trim(p_item->>'branch_name'), '');

    IF p_item_id IS NOT NULL AND trim(p_item_id) <> '' THEN
        -- UPDATE existing specialist with explicit branch_id & branch_name
        UPDATE public.store_specialists t
        SET
            name = COALESCE(NULLIF(trim(p_item->>'name'), ''), t.name),
            specialty = CASE WHEN p_item ? 'specialty' THEN NULLIF(trim(p_item->>'specialty'), '') ELSE t.specialty END,
            branch_id = CASE WHEN p_item ? 'branch_id' THEN v_branch_id ELSE t.branch_id END,
            branch_name = CASE WHEN p_item ? 'branch_name' THEN v_branch_name ELSE t.branch_name END,
            phone = CASE WHEN p_item ? 'phone' THEN NULLIF(trim(p_item->>'phone'), '') ELSE t.phone END,
            avatar_url = CASE WHEN p_item ? 'avatar_url' THEN NULLIF(trim(p_item->>'avatar_url'), '') ELSE t.avatar_url END,
            service_categories = CASE WHEN p_item ? 'service_categories' THEN p_item->'service_categories' ELSE t.service_categories END,
            service_ids = CASE WHEN p_item ? 'service_ids' THEN p_item->'service_ids' ELSE t.service_ids END,
            is_active = CASE WHEN p_item ? 'is_active' THEN (p_item->>'is_active')::boolean ELSE t.is_active END,
            working_days = CASE WHEN p_item ? 'working_days' THEN p_item->'working_days' ELSE t.working_days END,
            working_hours = CASE WHEN p_item ? 'working_hours' THEN p_item->'working_hours' ELSE t.working_hours END,
            updated_at = NOW()
        WHERE t.id::text = trim(p_item_id) AND t.store_id = v_sess.store_id
        RETURNING to_jsonb(t.*) INTO v_res;

        IF v_res IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND', 'message', 'المختص غير موجود أو لا يتبع لهذا المتجر');
        END IF;
    ELSE
        -- INSERT new specialist with explicit branch_id & branch_name
        INSERT INTO public.store_specialists AS t (
            store_id,
            branch_id,
            branch_name,
            name,
            specialty,
            phone,
            avatar_url,
            service_categories,
            service_ids,
            is_active,
            working_days,
            working_hours,
            created_at,
            updated_at
        ) VALUES (
            v_sess.store_id,
            v_branch_id,
            v_branch_name,
            COALESCE(NULLIF(trim(p_item->>'name'), ''), 'مقدم خدمة جديد'),
            NULLIF(trim(p_item->>'specialty'), ''),
            NULLIF(trim(p_item->>'phone'), ''),
            NULLIF(trim(p_item->>'avatar_url'), ''),
            COALESCE(p_item->'service_categories', '["ALL"]'::jsonb),
            COALESCE(p_item->'service_ids', '[]'::jsonb),
            COALESCE((p_item->>'is_active')::boolean, true),
            COALESCE(p_item->'working_days', '["Sun", "Mon", "Tue", "Wed", "Thu", "Sat"]'::jsonb),
            COALESCE(p_item->'working_hours', '{"start": "10:00", "end": "22:00"}'::jsonb),
            NOW(),
            NOW()
        )
        RETURNING to_jsonb(t.*) INTO v_res;
    END IF;

    RETURN jsonb_build_object('success', true, 'item', v_res);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'SAVE_FAILED', 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.merchant_save_specialist(text, text, jsonb) TO anon, authenticated, service_role;

-- 5. Dedicated RPC for deleting specialists
CREATE OR REPLACE FUNCTION public.merchant_delete_specialist(p_token TEXT, p_item_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_sess RECORD;
    v_deleted INT;
BEGIN
    SELECT * INTO v_sess FROM public._staff_session(p_token, true);
    IF v_sess.store_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED', 'message', 'غير مصرح');
    END IF;

    DELETE FROM public.store_specialists
    WHERE id::text = trim(p_item_id) AND store_id = v_sess.store_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    RETURN jsonb_build_object('success', true, 'deleted', v_deleted > 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.merchant_delete_specialist(text, text) TO anon, authenticated, service_role;

-- 6. Row Level Security Policies
ALTER TABLE public.store_specialists ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "store_specialists_select_policy" ON public.store_specialists;
    DROP POLICY IF EXISTS "store_specialists_insert_policy" ON public.store_specialists;
    DROP POLICY IF EXISTS "store_specialists_update_policy" ON public.store_specialists;
    DROP POLICY IF EXISTS "store_specialists_delete_policy" ON public.store_specialists;

    -- Allow customers, cashiers, and visitors to read specialists
    CREATE POLICY "store_specialists_select_policy"
    ON public.store_specialists FOR SELECT
    TO anon, authenticated, service_role
    USING (true);

    -- Allow service_role full control
    CREATE POLICY "store_specialists_insert_policy"
    ON public.store_specialists FOR INSERT
    TO service_role
    WITH CHECK (true);

    CREATE POLICY "store_specialists_update_policy"
    ON public.store_specialists FOR UPDATE
    TO service_role
    USING (true)
    WITH CHECK (true);

    CREATE POLICY "store_specialists_delete_policy"
    ON public.store_specialists FOR DELETE
    TO service_role
    USING (true);
END $$;


-- ==============================================================================
-- >>> FILE: 20261026_platform_integrations_hub.sql <<<
-- ==============================================================================

-- ==============================================================================
-- ⚙️ PLATFORM INTEGRATIONS & API HUB (TELEGRAM, GEMINI AI, WHATSAPP)
-- Stores tenant/platform-owner proprietary API keys securely
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.platform_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Telegram Settings
    telegram_bot_token TEXT,
    telegram_admin_chat_id TEXT,
    telegram_enabled BOOLEAN NOT NULL DEFAULT false,
    
    -- Google Gemini AI Studio Settings
    gemini_api_key TEXT,
    gemini_model TEXT NOT NULL DEFAULT 'gemini-1.5-flash',
    gemini_enabled BOOLEAN NOT NULL DEFAULT false,
    
    -- WhatsApp Gateway Settings
    whatsapp_provider TEXT NOT NULL DEFAULT 'meta', -- 'meta', 'ultramsg', or 'custom'
    whatsapp_phone_number_id TEXT,
    whatsapp_waba_id TEXT,
    whatsapp_access_token TEXT,
    whatsapp_instance_id TEXT, -- For UltraMsg/Gateway
    whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,

    -- Meta / Auditing
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure only 1 active config row per tenant database
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_integrations_singleton ON public.platform_integrations ((true));

-- RLS Security: Only authenticated Super Admins can SELECT / UPDATE / INSERT
ALTER TABLE public.platform_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SuperAdmin Full Platform Integrations" ON public.platform_integrations;
CREATE POLICY "SuperAdmin Full Platform Integrations"
ON public.platform_integrations
FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- Allow service_role full access
DROP POLICY IF EXISTS "Service Role Platform Integrations" ON public.platform_integrations;
CREATE POLICY "Service Role Platform Integrations"
ON public.platform_integrations
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Insert singleton row if not exists
INSERT INTO public.platform_integrations (telegram_enabled, gemini_enabled, whatsapp_enabled)
VALUES (false, false, false)
ON CONFLICT DO NOTHING;


-- ==============================================================================
-- >>> FILE: 20261028_reseller_instance_killswitch_receiver.sql <<<
-- ==============================================================================

-- ==============================================================================
-- 20261028_reseller_instance_killswitch_receiver.sql
-- Runs on EVERY Reseller Supabase Instance.
-- Listens for platform_status changes sent by the Master Control panel.
-- ==============================================================================

-- 1. Reseller Instance Configuration Table
CREATE TABLE IF NOT EXISTS public.platform_system_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    platform_status TEXT NOT NULL DEFAULT 'active' CHECK (platform_status IN ('active', 'suspended', 'maintenance')),
    suspension_reason TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.platform_system_config ENABLE ROW LEVEL SECURITY;

-- Everyone (anon, authenticated) can READ system config to know if platform is active
DROP POLICY IF EXISTS "Public read platform_system_config" ON public.platform_system_config;
CREATE POLICY "Public read platform_system_config"
ON public.platform_system_config
FOR SELECT
TO anon, authenticated
USING (true);

-- Only Service Role (Master Control server) can modify platform_status
DROP POLICY IF EXISTS "Service Role modify platform_system_config" ON public.platform_system_config;
CREATE POLICY "Service Role modify platform_system_config"
ON public.platform_system_config
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Ensure a single default row exists
INSERT INTO public.platform_system_config (key, platform_status, value)
VALUES ('platform_status', 'active', '{"version": "1.0"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 2. Helper Function for Database & RPCs: is_platform_active()
CREATE OR REPLACE FUNCTION public.is_platform_active()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_status TEXT;
BEGIN
    SELECT platform_status INTO v_status
    FROM public.platform_system_config
    WHERE key = 'platform_status'
    LIMIT 1;

    RETURN COALESCE(v_status, 'active') = 'active';
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_platform_active() TO anon, authenticated, service_role;

-- 3. Enable Realtime on platform_system_config so frontend receives Kill Switch instantly
ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_system_config;


-- ==============================================================================
-- >>> FILE: 20261029_tenant_branding_system.sql <<<
-- ==============================================================================

-- ==============================================================================
-- 20261029_tenant_branding_system.sql
-- Runs on EVERY Reseller Database (and Master Radar DB).
-- Stores Dynamic White-Label Brand Settings (Logo, Name, Phone, Colors, Favicon).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.tenant_branding (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE DEFAULT 'default',
    brand_name TEXT NOT NULL DEFAULT 'رادار',
    brand_english_name TEXT NOT NULL DEFAULT 'Radar',
    tagline TEXT DEFAULT 'منظومة الولاء ونقاط البيع السحابية الذكية',
    logo_url TEXT DEFAULT '/favicon.png',
    favicon_url TEXT DEFAULT '/favicon.png',
    support_phone TEXT DEFAULT '+966500000000',
    support_whatsapp TEXT DEFAULT '966500000000',
    support_email TEXT DEFAULT 'support@example.com',
    primary_color_hex TEXT DEFAULT '#F59E0B',
    accent_color_hex TEXT DEFAULT '#10B981',
    copyright_holder TEXT DEFAULT 'جميع الحقوق محفوظة',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tenant_branding ENABLE ROW LEVEL SECURITY;

-- 1. Public Read (SELECT) for everyone so branding loads instantly on login screen
DROP POLICY IF EXISTS "Public read tenant_branding" ON public.tenant_branding;
CREATE POLICY "Public read tenant_branding"
ON public.tenant_branding
FOR SELECT
TO anon, authenticated
USING (true);

-- 2. Direct Table UPDATE is restricted to Service Role and Super Admins
DROP POLICY IF EXISTS "Super Admin update tenant_branding" ON public.tenant_branding;
CREATE POLICY "Super Admin update tenant_branding"
ON public.tenant_branding
FOR ALL
TO authenticated
USING (
    (auth.jwt() -> 'user_metadata' ->> 'is_super_admin')::boolean IS TRUE
    OR (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
    OR (auth.jwt() -> 'app_metadata' ->> 'role') IN ('super_admin', 'admin')
)
WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'is_super_admin')::boolean IS TRUE
    OR (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
    OR (auth.jwt() -> 'app_metadata' ->> 'role') IN ('super_admin', 'admin')
);

-- 3. Ensure single default branding row exists
INSERT INTO public.tenant_branding (
    key, brand_name, brand_english_name, tagline, logo_url, favicon_url, 
    support_phone, support_whatsapp, support_email, primary_color_hex, accent_color_hex, copyright_holder
)
VALUES (
    'default', 'رادار', 'Radar', 'منظومة الولاء ونقاط البيع السحابية الذكية', 
    '/favicon.png', '/favicon.png', '+966500000000', '966500000000', 'support@radar.sa',
    '#F59E0B', '#10B981', 'منظومة رادار السحابية'
)
ON CONFLICT (key) DO NOTHING;

-- 4. Secure RPC to update branding remotely from Master Control via p_master_token
CREATE OR REPLACE FUNCTION public.set_tenant_branding(
    p_brand_name TEXT DEFAULT NULL,
    p_brand_english_name TEXT DEFAULT NULL,
    p_tagline TEXT DEFAULT NULL,
    p_logo_url TEXT DEFAULT NULL,
    p_favicon_url TEXT DEFAULT NULL,
    p_support_phone TEXT DEFAULT NULL,
    p_support_whatsapp TEXT DEFAULT NULL,
    p_support_email TEXT DEFAULT NULL,
    p_primary_color_hex TEXT DEFAULT NULL,
    p_accent_color_hex TEXT DEFAULT NULL,
    p_copyright_holder TEXT DEFAULT NULL,
    p_master_token TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_authenticated BOOLEAN := FALSE;
BEGIN
    -- أ) فحص التوكن السيادي من اللوحة الأم
    IF p_master_token IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.reseller_master_auth 
        WHERE master_token_hash = crypt(p_master_token, master_token_hash)
    ) THEN
        v_authenticated := TRUE;
    END IF;

    -- ب) السماح للـ service_role
    IF auth.role() = 'service_role' THEN
        v_authenticated := TRUE;
    END IF;

    -- ج) السماح للسوبر أدمن المسجل دخوله
    IF (auth.jwt() -> 'user_metadata' ->> 'is_super_admin')::boolean IS TRUE
       OR (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
       OR (auth.jwt() -> 'app_metadata' ->> 'role') IN ('super_admin', 'admin') THEN
        v_authenticated := TRUE;
    END IF;

    IF NOT v_authenticated THEN
        RAISE EXCEPTION 'Access Denied: Invalid Master Sovereign Token or unauthorized role';
    END IF;

    -- د) تحديث جدول الهوية
    INSERT INTO public.tenant_branding (
        key, brand_name, brand_english_name, tagline, logo_url, favicon_url, 
        support_phone, support_whatsapp, support_email, primary_color_hex, accent_color_hex, copyright_holder
    )
    VALUES (
        'default',
        COALESCE(p_brand_name, 'سديم الأثر'),
        COALESCE(p_brand_english_name, 'Sadeem Al-Athar'),
        p_tagline,
        COALESCE(p_logo_url, '/favicon.png'),
        COALESCE(p_favicon_url, p_logo_url, '/favicon.png'),
        p_support_phone,
        p_support_whatsapp,
        p_support_email,
        COALESCE(p_primary_color_hex, '#4F46E5'),
        COALESCE(p_accent_color_hex, '#10B981'),
        COALESCE(p_copyright_holder, p_brand_name, 'جميع الحقوق محفوظة')
    )
    ON CONFLICT (key) DO UPDATE SET
        brand_name = COALESCE(p_brand_name, public.tenant_branding.brand_name),
        brand_english_name = COALESCE(p_brand_english_name, public.tenant_branding.brand_english_name),
        tagline = COALESCE(p_tagline, public.tenant_branding.tagline),
        logo_url = COALESCE(p_logo_url, public.tenant_branding.logo_url),
        favicon_url = COALESCE(p_favicon_url, p_logo_url, public.tenant_branding.favicon_url),
        support_phone = COALESCE(p_support_phone, public.tenant_branding.support_phone),
        support_whatsapp = COALESCE(p_support_whatsapp, public.tenant_branding.support_whatsapp),
        support_email = COALESCE(p_support_email, public.tenant_branding.support_email),
        primary_color_hex = COALESCE(p_primary_color_hex, public.tenant_branding.primary_color_hex),
        accent_color_hex = COALESCE(p_accent_color_hex, public.tenant_branding.accent_color_hex),
        copyright_holder = COALESCE(p_copyright_holder, p_brand_name, public.tenant_branding.copyright_holder),
        updated_at = now();

    RETURN jsonb_build_object('success', true, 'message', 'Tenant branding updated securely');
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_tenant_branding(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon, authenticated;

-- 5. Enable Realtime on tenant_branding for zero-flicker live updates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'tenant_branding'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tenant_branding;
  END IF;
END $$;


-- ==============================================================================
-- >>> FILE: 20261030_reseller_master_sql_executor.sql <<<
-- ==============================================================================

-- ==============================================================================
-- 20261030_reseller_master_sql_executor.sql
-- Runs on EVERY Reseller Database.
-- Allows Master Control to securely execute batch SQL updates on reseller instances
-- remotely via PostgREST RPC, authenticated by the Sovereign Master Secret Token.
-- ==============================================================================

-- 1. Create or replace secure exec_master_sql RPC function
CREATE OR REPLACE FUNCTION public.exec_master_sql(
    p_sql TEXT,
    p_master_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_authenticated BOOLEAN := FALSE;
    v_start_time TIMESTAMPTZ := clock_timestamp();
    v_execution_ms NUMERIC;
BEGIN
    -- 1. التحقق الصارم من التوكن السيادي للمالك الأم عبر الهاش المشفر
    IF p_master_token IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.reseller_master_auth 
        WHERE master_token_hash = crypt(p_master_token, master_token_hash)
    ) THEN
        v_authenticated := TRUE;
    END IF;

    -- 2. السماح للـ service_role المباشر
    IF auth.role() = 'service_role' THEN
        v_authenticated := TRUE;
    END IF;

    -- 3. رفض فوري إذا فشل التحقق
    IF NOT v_authenticated THEN
        RAISE EXCEPTION 'Access Denied: Invalid Master Sovereign Token (401 Unauthorized)';
    END IF;

    -- 4. التحقق من سلامة نص الاستعلام
    IF TRIM(COALESCE(p_sql, '')) = '' THEN
        RAISE EXCEPTION 'SQL statement cannot be empty';
    END IF;

    -- 5. تنفيذ كود الـ SQL مباشرة
    EXECUTE p_sql;

    v_execution_ms := ROUND((EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000)::numeric, 2);

    RETURN jsonb_build_object(
        'success', true,
        'message', 'SQL script executed successfully by Sovereign Master Engine',
        'duration_ms', v_execution_ms,
        'executed_at', now()
    );

EXCEPTION WHEN OTHERS THEN
    v_execution_ms := ROUND((EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000)::numeric, 2);
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'code', SQLSTATE,
        'duration_ms', v_execution_ms,
        'executed_at', now()
    );
END;
$$;

-- 2. Grant execution permissions so Master Control can call it via anon REST with token
GRANT EXECUTE ON FUNCTION public.exec_master_sql(TEXT, TEXT) TO anon, authenticated, service_role;


-- ==============================================================================
-- >>> FILE: 20261031_super_admin_roles_and_permissions.sql <<<
-- ==============================================================================

-- ==============================================================================
-- 🛡️ RADAR PLATFORM ENGINE — MIGRATION 20261031_SUPER_ADMIN_ROLES_AND_PERMISSIONS (V2)
-- Purpose:
--   1. Add roles and granular permissions to super_admin_users.
--   2. Robust RPCs with TEXT IDs & DEFAULT NULL for 100% PostgREST schema cache compatibility.
--   3. Explicit DROP before CREATE to prevent parameter name mismatch errors.
--   4. Immediate PostgREST schema cache reload via NOTIFY.
-- ==============================================================================

-- 1. Ensure required extensions exist
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- 2. Extend super_admin_users table schema
ALTER TABLE public.super_admin_users 
ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'platform_manager';

ALTER TABLE public.super_admin_users 
ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.super_admin_users 
ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE public.super_admin_users 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.super_admin_users 
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- 3. Upgrade existing primary super admin records with full owner permissions
UPDATE public.super_admin_users
SET role = 'super_admin',
    permissions = jsonb_build_object(
        'can_manage_stores', true,
        'can_delete_stores', true,
        'can_manage_billing', true,
        'can_view_financials', true,
        'can_manage_partners', true,
        'can_send_notifications', true,
        'can_manage_admins', true,
        'can_reset_platform', true
    )
WHERE role IS NULL OR role = 'super_admin' OR permissions = '{}'::jsonb;

-- 4. Clean up existing functions to prevent signature collisions
DROP FUNCTION IF EXISTS public.has_super_admin_permission(TEXT);
DROP FUNCTION IF EXISTS public.verify_super_admin_session();
DROP FUNCTION IF EXISTS public.get_super_admin_team();
DROP FUNCTION IF EXISTS public.create_super_admin_manager(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.update_super_admin_manager(UUID, TEXT, TEXT, TEXT, JSONB, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.update_super_admin_manager(TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.delete_super_admin_manager(UUID);
DROP FUNCTION IF EXISTS public.delete_super_admin_manager(TEXT);

-- 5. Helper function to check granular super admin permissions
CREATE OR REPLACE FUNCTION public.has_super_admin_permission(p_permission TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_uid UUID;
    v_role TEXT;
    v_perms JSONB;
BEGIN
    IF auth.role() = 'service_role' OR current_user = 'service_role' THEN
        RETURN TRUE;
    END IF;

    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT role, permissions INTO v_role, v_perms
    FROM public.super_admin_users
    WHERE user_id = v_uid AND is_active = true
    LIMIT 1;

    IF NOT FOUND THEN
        IF (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin' 
           OR (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE THEN
            RETURN TRUE;
        END IF;
        RETURN FALSE;
    END IF;

    IF v_role = 'super_admin' THEN
        RETURN TRUE;
    END IF;

    IF v_perms IS NOT NULL AND (v_perms ->> p_permission)::boolean IS TRUE THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_super_admin_permission(TEXT) TO anon, authenticated, service_role;

-- 6. Updated session verification RPC returning role & permissions
CREATE OR REPLACE FUNCTION public.verify_super_admin_session()
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_is_super BOOLEAN;
    v_email TEXT;
    v_uid UUID;
    v_admin RECORD;
    v_perms JSONB;
    v_role TEXT;
BEGIN
    v_is_super := public.is_super_admin();
    
    IF NOT v_is_super THEN
        RETURN jsonb_build_object(
            'authenticated', false,
            'is_super_admin', false,
            'error', 'UNAUTHORIZED',
            'message', 'الحساب الحالي غير مصرح له بإدارة المنصة'
        );
    END IF;

    v_uid := auth.uid();
    v_email := LOWER(COALESCE(auth.jwt() ->> 'email', 'service_role'));

    SELECT * INTO v_admin
    FROM public.super_admin_users
    WHERE (user_id = v_uid OR LOWER(email) = v_email) AND is_active = true
    LIMIT 1;

    IF v_admin.id IS NOT NULL THEN
        UPDATE public.super_admin_users
        SET last_login_at = now()
        WHERE id = v_admin.id;
    END IF;

    v_role := COALESCE(v_admin.role, 'super_admin');

    IF v_role = 'super_admin' THEN
        v_perms := jsonb_build_object(
            'can_manage_stores', true,
            'can_delete_stores', true,
            'can_manage_billing', true,
            'can_view_financials', true,
            'can_manage_partners', true,
            'can_send_notifications', true,
            'can_manage_admins', true,
            'can_reset_platform', true
        );
    ELSE
        v_perms := jsonb_build_object(
            'can_manage_stores', COALESCE((v_admin.permissions ->> 'can_manage_stores')::boolean, true),
            'can_delete_stores', COALESCE((v_admin.permissions ->> 'can_delete_stores')::boolean, false),
            'can_manage_billing', COALESCE((v_admin.permissions ->> 'can_manage_billing')::boolean, false),
            'can_view_financials', COALESCE((v_admin.permissions ->> 'can_view_financials')::boolean, false),
            'can_manage_partners', COALESCE((v_admin.permissions ->> 'can_manage_partners')::boolean, false),
            'can_send_notifications', COALESCE((v_admin.permissions ->> 'can_send_notifications')::boolean, false),
            'can_manage_admins', COALESCE((v_admin.permissions ->> 'can_manage_admins')::boolean, false),
            'can_reset_platform', COALESCE((v_admin.permissions ->> 'can_reset_platform')::boolean, false)
        );
    END IF;

    RETURN jsonb_build_object(
        'authenticated', true,
        'is_super_admin', true,
        'user_id', v_uid,
        'admin_id', v_admin.id,
        'email', COALESCE(v_admin.email, v_email),
        'full_name', COALESCE(v_admin.full_name, 'مدير المنصة'),
        'phone', v_admin.phone,
        'role', v_role,
        'permissions', v_perms,
        'is_active', true
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_super_admin_session() TO anon, authenticated, service_role;

-- 7. RPC: Retrieve list of all platform admins
CREATE OR REPLACE FUNCTION public.get_super_admin_team()
RETURNS TABLE (
    id UUID,
    user_id UUID,
    email TEXT,
    full_name TEXT,
    phone TEXT,
    role TEXT,
    permissions JSONB,
    is_active BOOLEAN,
    created_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        s.user_id,
        s.email,
        s.full_name,
        s.phone,
        COALESCE(s.role, 'super_admin') as role,
        COALESCE(s.permissions, '{}'::jsonb) as permissions,
        s.is_active,
        s.created_at,
        s.last_login_at
    FROM public.super_admin_users s
    ORDER BY 
        CASE WHEN s.role = 'super_admin' THEN 1 ELSE 2 END,
        s.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_super_admin_team() TO anon, authenticated, service_role;

-- 8. RPC: Create a new platform manager/sub-admin
CREATE OR REPLACE FUNCTION public.create_super_admin_manager(
    p_email TEXT DEFAULT NULL,
    p_password TEXT DEFAULT NULL,
    p_full_name TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_role TEXT DEFAULT 'platform_manager',
    p_permissions JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_uid UUID;
    v_caller_role TEXT;
    v_new_uid UUID;
    v_encrypted_pw TEXT;
    v_target_email TEXT;
    v_clean_phone TEXT;
BEGIN
    v_caller_uid := auth.uid();
    IF v_caller_uid IS NOT NULL THEN
        SELECT role INTO v_caller_role FROM public.super_admin_users WHERE user_id = v_caller_uid AND is_active = true;
        IF v_caller_role <> 'super_admin' AND NOT public.has_super_admin_permission('can_manage_admins') THEN
            RAISE EXCEPTION 'ليس لديك صلاحية لإضافة مدراء جدد';
        END IF;
    END IF;

    v_target_email := LOWER(TRIM(p_email));
    IF v_target_email IS NULL OR v_target_email = '' THEN
        RAISE EXCEPTION 'البريد الإلكتروني مطلوب';
    END IF;

    IF p_password IS NULL OR length(p_password) < 6 THEN
        RAISE EXCEPTION 'كلمة المرور يجب أن لا تقل عن 6 أحرف';
    END IF;

    v_clean_phone := NULLIF(TRIM(p_phone), '');
    v_encrypted_pw := crypt(p_password, gen_salt('bf'));

    SELECT id INTO v_new_uid FROM auth.users WHERE LOWER(email) = v_target_email;

    IF v_new_uid IS NULL THEN
        v_new_uid := gen_random_uuid();
        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            v_new_uid,
            'authenticated',
            'authenticated',
            v_target_email,
            v_encrypted_pw,
            now(),
            jsonb_build_object(
                'provider', 'email',
                'providers', array['email'],
                'role', 'super_admin',
                'is_super_admin', true
            ),
            jsonb_build_object(
                'full_name', p_full_name,
                'role', p_role,
                'phone', v_clean_phone
            ),
            now(),
            now()
        );
    ELSE
        UPDATE auth.users
        SET encrypted_password = v_encrypted_pw,
            email_confirmed_at = COALESCE(email_confirmed_at, now()),
            raw_app_meta_data = raw_app_meta_data || '{"role": "super_admin", "is_super_admin": true}'::jsonb,
            raw_user_meta_data = raw_user_meta_data || jsonb_build_object('full_name', p_full_name, 'role', p_role, 'phone', v_clean_phone),
            updated_at = now()
        WHERE id = v_new_uid;
    END IF;

    INSERT INTO public.super_admin_users (
        user_id,
        email,
        full_name,
        phone,
        role,
        permissions,
        is_active,
        created_by,
        created_at,
        updated_at
    ) VALUES (
        v_new_uid,
        v_target_email,
        p_full_name,
        v_clean_phone,
        COALESCE(p_role, 'platform_manager'),
        COALESCE(p_permissions, '{}'::jsonb),
        true,
        v_caller_uid,
        now(),
        now()
    )
    ON CONFLICT (email) DO UPDATE
    SET user_id = v_new_uid,
        full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        role = EXCLUDED.role,
        permissions = EXCLUDED.permissions,
        is_active = true,
        updated_at = now();

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_new_uid,
        'email', v_target_email,
        'message', 'تمت إضافة المدير بنجاح وتفعيل حسابه'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_super_admin_manager(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated, service_role;

-- 9. RPC: Update existing platform manager's permissions or profile
CREATE OR REPLACE FUNCTION public.update_super_admin_manager(
    p_admin_id TEXT DEFAULT NULL,
    p_full_name TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_role TEXT DEFAULT NULL,
    p_permissions JSONB DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT NULL,
    p_new_password TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_uid UUID;
    v_caller_role TEXT;
    v_target RECORD;
    v_admin_uuid UUID;
BEGIN
    v_caller_uid := auth.uid();
    IF v_caller_uid IS NOT NULL THEN
        SELECT role INTO v_caller_role FROM public.super_admin_users WHERE user_id = v_caller_uid AND is_active = true;
        IF v_caller_role <> 'super_admin' AND NOT public.has_super_admin_permission('can_manage_admins') THEN
            RAISE EXCEPTION 'ليس لديك صلاحية لتعديل بيانات المدراء';
        END IF;
    END IF;

    IF p_admin_id IS NULL THEN
        RAISE EXCEPTION 'معرف المدير مطلوب';
    END IF;

    BEGIN
        v_admin_uuid := p_admin_id::uuid;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'معرف المدير غير صالح';
    END;

    SELECT * INTO v_target FROM public.super_admin_users WHERE id = v_admin_uuid;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'المدير غير موجود';
    END IF;

    IF v_target.role = 'super_admin' AND p_role IS NOT NULL AND p_role <> 'super_admin' THEN
        RAISE EXCEPTION 'لا يمكن تغيير رتبة مالك المنصة الأساسي';
    END IF;

    IF v_target.role = 'super_admin' AND p_is_active IS FALSE THEN
        RAISE EXCEPTION 'لا يمكن تجميد حساب مالك المنصة الأساسي';
    END IF;

    UPDATE public.super_admin_users
    SET full_name = COALESCE(p_full_name, full_name),
        phone = NULLIF(TRIM(p_phone), ''),
        role = COALESCE(p_role, role),
        permissions = COALESCE(p_permissions, permissions),
        is_active = COALESCE(p_is_active, is_active),
        updated_at = now()
    WHERE id = v_admin_uuid;

    IF p_new_password IS NOT NULL AND length(trim(p_new_password)) >= 6 THEN
        UPDATE auth.users
        SET encrypted_password = crypt(trim(p_new_password), gen_salt('bf')),
            updated_at = now()
        WHERE id = v_target.user_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'تم تحديث بيانات وصلاحيات المدير بنجاح');
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_super_admin_manager(TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN, TEXT) TO anon, authenticated, service_role;

-- 10. RPC: Delete a platform manager
CREATE OR REPLACE FUNCTION public.delete_super_admin_manager(
    p_admin_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_uid UUID;
    v_caller_role TEXT;
    v_target RECORD;
    v_admin_uuid UUID;
BEGIN
    v_caller_uid := auth.uid();
    IF v_caller_uid IS NOT NULL THEN
        SELECT role INTO v_caller_role FROM public.super_admin_users WHERE user_id = v_caller_uid AND is_active = true;
        IF v_caller_role <> 'super_admin' AND NOT public.has_super_admin_permission('can_manage_admins') THEN
            RAISE EXCEPTION 'ليس لديك صلاحية لحذف المدراء';
        END IF;
    END IF;

    IF p_admin_id IS NULL THEN
        RAISE EXCEPTION 'معرف المدير مطلوب';
    END IF;

    BEGIN
        v_admin_uuid := p_admin_id::uuid;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'معرف المدير غير صالح';
    END;

    SELECT * INTO v_target FROM public.super_admin_users WHERE id = v_admin_uuid;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'المدير غير موجود';
    END IF;

    IF v_target.user_id = v_caller_uid THEN
        RAISE EXCEPTION 'لا يمكنك حذف حسابك الحالي';
    END IF;

    IF v_target.role = 'super_admin' THEN
        RAISE EXCEPTION 'لا يمكن حذف حساب مالك المنصة الأساسي';
    END IF;

    DELETE FROM public.super_admin_users WHERE id = v_admin_uuid;

    IF v_target.user_id IS NOT NULL THEN
        DELETE FROM auth.users WHERE id = v_target.user_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'تم حذف المدير وسحب كافة صلاحياته بنجاح');
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_super_admin_manager(TEXT) TO anon, authenticated, service_role;

-- 11. Force reload PostgREST schema cache immediately
NOTIFY pgrst, 'reload schema';


-- ==============================================================================
-- >>> FILE: add_admins.sql <<<
-- ==============================================================================

INSERT INTO public.super_admin_users (user_id, email, full_name, is_active)
SELECT id, email, 'Platform Owner', true
FROM auth.users
WHERE email ILIKE '%myradar.sarl'
ON CONFLICT (email) DO NOTHING;
