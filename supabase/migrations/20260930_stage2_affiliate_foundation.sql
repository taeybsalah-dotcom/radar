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
