-- ==============================================================================
-- 🛡️ RADAR & SADEEM AL-ATHIR — STAGE 2 MIGRATION
-- Financial Atomic Transactions, Webhook Idempotency, ZATCA Clawback & RLS Hardening
-- Target: Sadim Al-Athir (kspfiijorengpckdlymx) & White-Label Resellers
-- ==============================================================================

-- ==============================================================================
-- SECTION 1: SCHEMA FIXES, DATA SANITIZATION & IDEMPOTENCY UNIQUE CONSTRAINTS
-- ==============================================================================

-- 1.1 Ensure partner_commissions has merchant_name (referenced by process_store_payment_atomic)
ALTER TABLE public.partner_commissions
  ADD COLUMN IF NOT EXISTS merchant_name text;

-- 1.1b Ensure stores has partner attribution & subscription override columns referenced by atomic financial RPCs
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS partner_id uuid,
  ADD COLUMN IF NOT EXISTS referral_code text,
  ADD COLUMN IF NOT EXISTS referred_by_code text,
  ADD COLUMN IF NOT EXISTS ref_code text,
  ADD COLUMN IF NOT EXISTS in_grace_period boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS complimentary_days_granted integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_override_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_override_reason text;

-- 1.1c Backfill partner_accounts from affiliates so every active affiliate has a linked partner_accounts row
INSERT INTO public.partner_accounts (
  affiliate_id,
  display_name,
  slug,
  region,
  active,
  referral_code,
  commission_rate,
  acquisition_commission_rate,
  recurring_commission_rate,
  pin_code,
  phone,
  created_at,
  updated_at
)
SELECT
  a.id,
  a.name,
  lower(BTRIM(COALESCE(a.code, a.referral_code))),
  a.city,
  COALESCE(a.is_active, true),
  UPPER(BTRIM(COALESCE(a.code, a.referral_code))),
  COALESCE(a.commission_rate, 0.2000),
  COALESCE(a.acquisition_commission_rate, 0.2000),
  COALESCE(a.recurring_commission_rate, 0.1000),
  a.pin_code,
  a.phone,
  COALESCE(a.created_at, now()),
  COALESCE(a.updated_at, now())
FROM public.affiliates a
WHERE COALESCE(a.code, a.referral_code) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.partner_accounts pa
    WHERE pa.affiliate_id = a.id
       OR lower(pa.referral_code) = lower(BTRIM(COALESCE(a.code, a.referral_code)))
       OR lower(pa.slug) = lower(BTRIM(COALESCE(a.code, a.referral_code)))
  );

-- 1.2 Allow billing_transactions.plan_id to be nullable so payments without a matched UUID plan never fail FK
ALTER TABLE public.billing_transactions
  ALTER COLUMN plan_id DROP NOT NULL;

-- 1.3 Sanitize any empty or duplicate gateway_payment_id in store_invoices before adding UNIQUE constraint
UPDATE public.store_invoices
SET gateway_payment_id = 'pay_legacy_' || id::text
WHERE gateway_payment_id IS NULL OR BTRIM(gateway_payment_id) = '';

WITH dup_invoices AS (
  SELECT id,
         gateway_payment_id,
         ROW_NUMBER() OVER (PARTITION BY gateway_payment_id ORDER BY created_at ASC, id ASC) AS rn
  FROM public.store_invoices
  WHERE gateway_payment_id IS NOT NULL
)
UPDATE public.store_invoices si
SET gateway_payment_id = si.gateway_payment_id || '_dup_' || si.id::text
FROM dup_invoices d
WHERE si.id = d.id AND d.rn > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_store_invoices_gateway_payment_id'
      AND conrelid = 'public.store_invoices'::regclass
  ) THEN
    ALTER TABLE public.store_invoices
      ADD CONSTRAINT uq_store_invoices_gateway_payment_id UNIQUE (gateway_payment_id);
  END IF;
END $$;

-- 1.4 Sanitize any empty or duplicate transaction_id in financial_ledger before adding UNIQUE constraint
-- Note: Temporarily disable immutability trigger only during constraint sanitization if needed
ALTER TABLE public.financial_ledger DISABLE TRIGGER USER;

UPDATE public.financial_ledger
SET transaction_id = 'tx_legacy_' || id::text
WHERE transaction_id IS NULL OR BTRIM(transaction_id) = '';

WITH dup_ledger AS (
  SELECT id,
         transaction_id,
         ROW_NUMBER() OVER (PARTITION BY transaction_id ORDER BY created_at ASC, id ASC) AS rn
  FROM public.financial_ledger
  WHERE transaction_id IS NOT NULL
)
UPDATE public.financial_ledger fl
SET transaction_id = fl.transaction_id || '_dup_' || fl.id::text
FROM dup_ledger d
WHERE fl.id = d.id AND d.rn > 1;

ALTER TABLE public.financial_ledger ENABLE TRIGGER USER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_financial_ledger_transaction_id'
      AND conrelid = 'public.financial_ledger'::regclass
  ) THEN
    ALTER TABLE public.financial_ledger
      ADD CONSTRAINT uq_financial_ledger_transaction_id UNIQUE (transaction_id);
  END IF;
END $$;

-- 1.5 Ensure billing_webhook_events has UNIQUE (provider, event_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_billing_webhook_provider_event'
      AND conrelid = 'public.billing_webhook_events'::regclass
  ) THEN
    ALTER TABLE public.billing_webhook_events
      ADD CONSTRAINT uq_billing_webhook_provider_event UNIQUE (provider, event_id);
  END IF;
END $$;


-- ==============================================================================
-- SECTION 2: EXPLICIT DROP OF OLD FUNCTION SIGNATURES (PREVENT OVERLOADING)
-- ==============================================================================

DROP FUNCTION IF EXISTS public.process_store_payment_atomic(uuid, text, numeric, text, text, text, text, text, text, integer, numeric, numeric);
DROP FUNCTION IF EXISTS public.process_store_payment_atomic(uuid, text, numeric, text, text, text, text, text, text, integer, numeric, numeric, text, text);

DROP FUNCTION IF EXISTS public.super_admin_manual_activate_subscription(uuid, integer, numeric, text, text, text);
DROP FUNCTION IF EXISTS public.super_admin_manual_activate_subscription(uuid, integer, numeric, text, text, text, text);

DROP FUNCTION IF EXISTS public.process_zatca_refund_and_clawback(text, numeric, text, text, text);
DROP FUNCTION IF EXISTS public.process_zatca_refund_and_clawback(text, numeric, text, text, text, text);

DROP FUNCTION IF EXISTS public.process_affiliate_payout_atomic(uuid, character varying, character varying, character varying, character varying, text);
DROP FUNCTION IF EXISTS public.process_affiliate_payout_atomic(uuid, character varying, character varying, character varying, character varying, text, text);

DROP FUNCTION IF EXISTS public.update_platform_payment_gateway_config(jsonb);
DROP FUNCTION IF EXISTS public.update_platform_payment_gateway_config(jsonb, text);

DROP FUNCTION IF EXISTS public.get_platform_payment_gateway_config();
DROP FUNCTION IF EXISTS public.get_platform_payment_gateway_config(text);

DROP FUNCTION IF EXISTS public.get_all_store_invoices_batch();
DROP FUNCTION IF EXISTS public.get_all_store_invoices_batch(text);

DROP FUNCTION IF EXISTS public.record_manual_ledger_adjustment_atomic(uuid, uuid, text, numeric, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.grant_store_complimentary_days_atomic(uuid, integer, text, text, text, text);
DROP FUNCTION IF EXISTS public.log_billing_webhook_failure(text, text, text, uuid, text, jsonb, text);
DROP FUNCTION IF EXISTS public.verify_sandbox_checkout_access(uuid, text);


-- ==============================================================================
-- SECTION 3: ATOMIC FINANCIAL & WEBHOOK FUNCTIONS (WITH STRICT AUTH GUARDS)
-- ==============================================================================

-- 3.1 Verify Sandbox Checkout Access (Store Owner/Manager JWT, Staff Session Token, or Super Admin)
CREATE OR REPLACE FUNCTION public.verify_sandbox_checkout_access(
    p_store_id uuid,
    p_staff_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_mode text;
    v_has_access boolean := false;
    v_staff RECORD;
BEGIN
    SELECT COALESCE(value->>'mode', 'sandbox')
    INTO v_mode
    FROM public.platform_system_config
    WHERE key = 'platform_payment_gateway';

    v_mode := COALESCE(v_mode, 'sandbox');

    IF v_mode <> 'sandbox' THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'mode', v_mode,
            'error', 'SANDBOX_DISABLED: بوابة الدفع في وضع الإنتاج الفعلي ولا تقبل محاكاة Sandbox'
        );
    END IF;

    -- 1. Check Super Admin or service_role
    IF public.is_super_admin() OR auth.role() = 'service_role' THEN
        v_has_access := true;
    END IF;

    -- 2. Check Authenticated Store Owner / Admin via Supabase JWT (even if store is expired/trial)
    IF NOT v_has_access AND auth.uid() IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1
            FROM public.store_staff s
            WHERE s.user_id = auth.uid()
              AND s.store_id = p_store_id
              AND s.is_active = true
              AND s.role IN ('admin', 'owner', 'manager')
        ) INTO v_has_access;
    END IF;

    -- 3. Check Active Store Admin Staff Session Token
    IF NOT v_has_access AND p_staff_token IS NOT NULL AND BTRIM(p_staff_token) <> '' THEN
        SELECT * INTO v_staff FROM public._staff_session(BTRIM(p_staff_token), true);
        IF v_staff.store_id IS NOT NULL AND v_staff.store_id = p_store_id THEN
            v_has_access := true;
        END IF;
    END IF;

    IF NOT v_has_access THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'mode', v_mode,
            'error', 'UNAUTHORIZED: يجب تسجيل الدخول كمدير للمتجر أو مشرف عام لإجراء عملية الدفع'
        );
    END IF;

    RETURN jsonb_build_object(
        'allowed', true,
        'mode', v_mode,
        'store_id', p_store_id
    );
END;
$function$;


-- 3.2 Log Billing Webhook Failure (Called by Worker when process_store_payment_atomic rolls back)
CREATE OR REPLACE FUNCTION public.log_billing_webhook_failure(
    p_provider text,
    p_event_id text,
    p_event_type text,
    p_store_id uuid,
    p_error_message text,
    p_payload jsonb DEFAULT '{}'::jsonb,
    p_master_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_id uuid;
    v_clean_provider text := UPPER(COALESCE(NULLIF(BTRIM(p_provider), ''), 'MOYASAR'));
    v_clean_event_id text := COALESCE(NULLIF(BTRIM(p_event_id), ''), 'evt_err_' || replace(gen_random_uuid()::text, '-', ''));
BEGIN
    IF NOT (
        public.is_super_admin()
        OR auth.role() = 'service_role'
        OR (p_master_token IS NOT NULL AND public.is_valid_master_token(p_master_token))
    ) THEN
        RAISE EXCEPTION 'permission denied for function log_billing_webhook_failure' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.billing_webhook_events (
        provider,
        event_id,
        event_type,
        signature_verified,
        payload_hash,
        processed,
        processed_at,
        created_at,
        metadata
    ) VALUES (
        v_clean_provider,
        v_clean_event_id,
        COALESCE(NULLIF(BTRIM(p_event_type), ''), 'PAYMENT_FAILED_ROLLBACK'),
        true,
        md5(COALESCE(p_payload::text, '')),
        false,
        NULL,
        clock_timestamp(),
        jsonb_build_object(
            'store_id', p_store_id,
            'error_message', p_error_message,
            'failed_at', clock_timestamp(),
            'raw_payload', COALESCE(p_payload, '{}'::jsonb)
        )
    )
    ON CONFLICT (provider, event_id) DO UPDATE
    SET processed = false,
        metadata = public.billing_webhook_events.metadata || jsonb_build_object(
            'last_error_message', p_error_message,
            'last_failed_at', clock_timestamp()
        )
    RETURNING id INTO v_id;

    RETURN jsonb_build_object(
        'success', true,
        'webhook_event_row_id', v_id,
        'processed', false,
        'error_logged', p_error_message
    );
END;
$function$;


-- 3.3 Master Atomic Payment, Subscription Upgrade, Ledger & Commission RPC (NO EXCEPTION SWALLOWING)
CREATE OR REPLACE FUNCTION public.process_store_payment_atomic(
    p_store_id uuid,
    p_invoice_type text,
    p_amount numeric,
    p_payment_method text DEFAULT 'mada'::text,
    p_gateway text DEFAULT 'moyasar'::text,
    p_gateway_payment_id text DEFAULT NULL::text,
    p_plan_id text DEFAULT NULL::text,
    p_plan_code text DEFAULT NULL::text,
    p_plan_name text DEFAULT NULL::text,
    p_duration_months integer DEFAULT 1,
    p_vat_rate numeric DEFAULT 0.15,
    p_gateway_fee numeric DEFAULT NULL::numeric,
    p_webhook_event_id text DEFAULT NULL::text,
    p_master_token text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_store RECORD;
    v_lead_id UUID := NULL;
    v_lead_status TEXT := NULL;
    v_lead_affiliate_id UUID := NULL;
    v_lead_ref_code TEXT := NULL;
    v_partner_active BOOLEAN := false;
    v_partner_acq_rate NUMERIC(5, 4) := NULL;
    v_partner_comm_rate NUMERIC(5, 4) := NULL;
    v_partner_rec_rate NUMERIC(5, 4) := NULL;
    v_store_ref_code TEXT := NULL;
    v_existing_inv_id UUID;
    v_existing_inv_num TEXT;
    v_existing_ledg_id UUID;
    v_existing_wh_id UUID;

    v_is_sandbox BOOLEAN;
    v_clean_gateway TEXT;
    v_clean_method TEXT;
    v_gw_payment_id TEXT;
    v_tx_id TEXT;
    v_webhook_event_id TEXT;
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
    v_comm_id UUID := NULL;
    v_idempotency_key TEXT;
    v_gw_rate NUMERIC(5, 4);
    v_gw_fixed NUMERIC(12, 2);
    v_sub_plan_uuid UUID := NULL;
BEGIN
    -- 0. Strict Server/SuperAdmin Authority Guard (Blocks all direct browser calls)
    IF NOT (
        public.is_super_admin()
        OR auth.role() = 'service_role'
        OR (p_master_token IS NOT NULL AND public.is_valid_master_token(p_master_token))
    ) THEN
        RAISE EXCEPTION 'permission denied for function process_store_payment_atomic' USING ERRCODE = '42501';
    END IF;

    -- 1. Validate Store (Row-level lock to serialize concurrent webhooks for the same store)
    SELECT * INTO v_store FROM public.stores WHERE id = p_store_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'STORE_NOT_FOUND: المتجر غير موجود (%).', p_store_id;
    END IF;

    -- 2. Validate Invoice Type & Amount
    IF p_invoice_type NOT IN ('setup', 'renewal', 'upgrade', 'extra_cashier') THEN
        RAISE EXCEPTION 'INVALID_INVOICE_TYPE: نوع الفاتورة غير صالح (%).', p_invoice_type;
    END IF;

    v_gross := ROUND(COALESCE(p_amount, 0.00), 2);
    IF v_gross < 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: المبلغ لا يمكن أن يكون سالباً (%).', v_gross;
    END IF;

    -- 3. Identify Sandbox vs Live & Normalize Payment / Transaction IDs
    v_clean_gateway := lower(BTRIM(COALESCE(p_gateway, 'moyasar')));
    v_clean_method := lower(BTRIM(COALESCE(p_payment_method, 'mada')));
    v_is_sandbox := (v_clean_gateway LIKE '%sandbox%' OR v_clean_method = 'sandbox');

    v_gw_payment_id := COALESCE(NULLIF(BTRIM(p_gateway_payment_id), ''), 'pay_' || v_clean_gateway || '_' || replace(gen_random_uuid()::text, '-', ''));
    IF v_is_sandbox AND v_gw_payment_id NOT LIKE 'SANDBOX_%' THEN
        v_gw_payment_id := 'SANDBOX_' || v_gw_payment_id;
    END IF;

    v_tx_id := CASE WHEN v_is_sandbox THEN 'SANDBOX_tx_' || v_gw_payment_id ELSE 'tx_' || v_gw_payment_id END;
    v_webhook_event_id := COALESCE(NULLIF(BTRIM(p_webhook_event_id), ''), 'evt_' || v_gw_payment_id);

    -- 4. Multi-Layer Idempotency Check (Webhook Event + Invoice Payment Ref + Ledger Transaction ID)
    SELECT id INTO v_existing_wh_id
    FROM public.billing_webhook_events
    WHERE provider = UPPER(v_clean_gateway)
      AND event_id = v_webhook_event_id
      AND processed = true
    LIMIT 1;

    SELECT id, invoice_number INTO v_existing_inv_id, v_existing_inv_num
    FROM public.store_invoices
    WHERE gateway_payment_id = v_gw_payment_id
    LIMIT 1;

    SELECT id INTO v_existing_ledg_id
    FROM public.financial_ledger
    WHERE transaction_id = v_tx_id OR (payment_id = v_gw_payment_id AND transaction_type = 'PAYMENT')
    LIMIT 1;

    IF v_existing_inv_id IS NOT NULL OR v_existing_ledg_id IS NOT NULL OR v_existing_wh_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'idempotent', true,
            'is_sandbox', v_is_sandbox,
            'message', 'تمت معالجة هذه العملية مسبقاً (عملية مكررة آمنة)',
            'invoice_id', v_existing_inv_id,
            'invoice_number', v_existing_inv_num,
            'ledger_id', v_existing_ledg_id,
            'transaction_id', v_tx_id,
            'gateway_payment_id', v_gw_payment_id,
            'webhook_event_id', v_webhook_event_id,
            'store_id', p_store_id
        );
    END IF;

    -- 5. Record Verified Webhook Event (Protected by uq_billing_webhook_provider_event)
    INSERT INTO public.billing_webhook_events (
        provider,
        event_id,
        event_type,
        signature_verified,
        payload_hash,
        processed,
        processed_at,
        created_at,
        metadata
    ) VALUES (
        UPPER(v_clean_gateway),
        v_webhook_event_id,
        'PAYMENT_' || UPPER(p_invoice_type),
        true,
        md5(v_gw_payment_id || ':' || p_store_id::text || ':' || v_gross::text),
        true,
        v_now,
        v_now,
        jsonb_build_object(
            'store_id', p_store_id,
            'gateway_payment_id', v_gw_payment_id,
            'amount', v_gross,
            'invoice_type', p_invoice_type,
            'is_sandbox', v_is_sandbox
        )
    )
    ON CONFLICT (provider, event_id) DO UPDATE
    SET processed = true,
        processed_at = v_now,
        signature_verified = true;

    -- 6. Calculate Unified ZATCA VAT & Net Amounts
    v_vat_rate := GREATEST(0.0000, COALESCE(p_vat_rate, 0.1500));
    IF v_vat_rate > 0 THEN
        v_net_before_vat := ROUND(v_gross / (1.0000 + v_vat_rate), 2);
        v_vat_amount := ROUND(v_gross - v_net_before_vat, 2);
    ELSE
        v_net_before_vat := v_gross;
        v_vat_amount := 0.00;
    END IF;

    -- 7. Calculate Gateway Fee
    IF p_gateway_fee IS NOT NULL AND p_gateway_fee >= 0 THEN
        v_gw_fee := ROUND(p_gateway_fee, 2);
    ELSE
        IF v_is_sandbox OR v_clean_gateway = 'manual' THEN
            v_gw_rate := 0.0000; v_gw_fixed := 0.00;
        ELSIF v_clean_method = 'mada' THEN
            v_gw_rate := 0.0100; v_gw_fixed := 1.00;
        ELSIF v_clean_method IN ('credit_card', 'visa', 'mastercard') THEN
            v_gw_rate := 0.0275; v_gw_fixed := 1.00;
        ELSIF v_clean_method = 'apple_pay' THEN
            v_gw_rate := 0.0220; v_gw_fixed := 1.00;
        ELSE
            v_gw_rate := 0.0150; v_gw_fixed := 1.00;
        END IF;

        IF v_gross > 0 AND NOT v_is_sandbox AND v_clean_gateway <> 'manual' THEN
            v_gw_fee := ROUND((v_gross * v_gw_rate) + v_gw_fixed, 2);
        ELSE
            v_gw_fee := 0.00;
        END IF;
    END IF;

    -- 8. Partner & Commission Identification
    v_store_ref_code := COALESCE(
        NULLIF(BTRIM(v_store.referral_code), ''),
        NULLIF(BTRIM(v_store.referred_by_code), ''),
        NULLIF(BTRIM(v_store.ref_code), '')
    );

    SELECT id, status, affiliate_id, referral_code
    INTO v_lead_id, v_lead_status, v_lead_affiliate_id, v_lead_ref_code
    FROM public.merchant_leads
    WHERE converted_store_id = p_store_id
       OR (v_store.manager_contact IS NOT NULL AND phone = v_store.manager_contact)
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_lead_id IS NOT NULL THEN
        IF v_lead_affiliate_id IS NOT NULL THEN
            SELECT id, display_name, active, acquisition_commission_rate, commission_rate, recurring_commission_rate
            INTO v_partner_id, v_partner_name, v_partner_active, v_partner_acq_rate, v_partner_comm_rate, v_partner_rec_rate
            FROM public.partner_accounts
            WHERE id = v_lead_affiliate_id OR affiliate_id = v_lead_affiliate_id
            LIMIT 1;
        ELSIF v_lead_ref_code IS NOT NULL AND BTRIM(v_lead_ref_code) <> '' THEN
            SELECT id, display_name, active, acquisition_commission_rate, commission_rate, recurring_commission_rate
            INTO v_partner_id, v_partner_name, v_partner_active, v_partner_acq_rate, v_partner_comm_rate, v_partner_rec_rate
            FROM public.partner_accounts
            WHERE lower(referral_code) = lower(BTRIM(v_lead_ref_code))
               OR lower(slug) = lower(BTRIM(v_lead_ref_code))
            LIMIT 1;
        END IF;
    END IF;

    IF v_partner_id IS NULL THEN
        IF v_store.partner_id IS NOT NULL THEN
            SELECT id, display_name, active, acquisition_commission_rate, commission_rate, recurring_commission_rate
            INTO v_partner_id, v_partner_name, v_partner_active, v_partner_acq_rate, v_partner_comm_rate, v_partner_rec_rate
            FROM public.partner_accounts
            WHERE id = v_store.partner_id OR affiliate_id = v_store.partner_id
            LIMIT 1;
        ELSIF v_store_ref_code IS NOT NULL THEN
            SELECT id, display_name, active, acquisition_commission_rate, commission_rate, recurring_commission_rate
            INTO v_partner_id, v_partner_name, v_partner_active, v_partner_acq_rate, v_partner_comm_rate, v_partner_rec_rate
            FROM public.partner_accounts
            WHERE lower(referral_code) = lower(v_store_ref_code)
               OR lower(slug) = lower(v_store_ref_code)
            LIMIT 1;
        END IF;
    END IF;

    v_is_acquisition := (p_invoice_type = 'setup' OR v_store.setup_fee_paid IS NOT TRUE);

    IF v_partner_id IS NOT NULL AND v_partner_active IS NOT FALSE THEN
        IF v_is_acquisition THEN
            v_comm_rate := COALESCE(v_partner_acq_rate, v_partner_comm_rate, 0.2000);
            v_comm_type := 'STORE_ACQUISITION';
        ELSE
            v_comm_rate := COALESCE(v_partner_rec_rate, 0.1000);
            v_comm_type := CASE WHEN p_invoice_type = 'upgrade' THEN 'SUBSCRIPTION_UPGRADE' ELSE 'SUBSCRIPTION_RENEWAL' END;
        END IF;

        v_comm_amount := ROUND(v_net_before_vat * v_comm_rate, 2);
    ELSE
        v_comm_rate := 0.0000;
        v_comm_amount := 0.00;
        v_comm_type := 'NONE';
    END IF;

    -- 9. Net Platform Amount (Must satisfy chk_ledger_balance invariant)
    v_net_platform := ROUND(v_gross - v_vat_amount - v_gw_fee - v_comm_amount, 2);

    -- 10. Compute Subscription Extension
    v_duration_days := GREATEST(1, COALESCE(p_duration_months, 1) * 30);
    IF p_invoice_type = 'renewal' AND v_store.subscription_end_date IS NOT NULL AND v_store.subscription_end_date > v_now THEN
        v_base_end := v_store.subscription_end_date;
    ELSE
        v_base_end := v_now;
    END IF;
    v_new_end := v_base_end + (v_duration_days || ' days')::INTERVAL;

    -- 11. Generate Invoice Number (Distinguish Sandbox with INV-SBX-)
    v_invoice_num := (CASE WHEN v_is_sandbox THEN 'INV-SBX-' ELSE 'INV-' END)
                     || to_char(v_now, 'YYYYMMDD') || '-' || upper(substr(md5(v_gw_payment_id || random()::text), 1, 6));

    -- 12. Resolve Plan UUID Safely
    v_sub_plan_uuid := NULL;
    IF p_plan_id IS NOT NULL AND BTRIM(p_plan_id) <> '' THEN
        IF p_plan_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            SELECT id INTO v_sub_plan_uuid FROM public.billing_plans WHERE id = p_plan_id::UUID LIMIT 1;
        ELSE
            SELECT id INTO v_sub_plan_uuid
            FROM public.billing_plans
            WHERE lower(code) = lower(BTRIM(p_plan_id))
            LIMIT 1;
        END IF;
    END IF;

    IF v_sub_plan_uuid IS NULL AND p_plan_code IS NOT NULL AND BTRIM(p_plan_code) <> '' THEN
        SELECT id INTO v_sub_plan_uuid
        FROM public.billing_plans
        WHERE lower(code) = lower(BTRIM(p_plan_code))
        LIMIT 1;
    END IF;

    IF v_sub_plan_uuid IS NULL THEN
        SELECT id INTO v_sub_plan_uuid
        FROM public.billing_plans
        WHERE active = true
        ORDER BY amount ASC
        LIMIT 1;
    END IF;

    -- 13. Insert into store_invoices
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
        v_clean_method,
        v_clean_gateway,
        v_gw_payment_id,
        COALESCE(v_sub_plan_uuid::text, NULLIF(BTRIM(p_plan_id), '')),
        COALESCE(p_plan_name, v_store.subscription_plan, 'الباقة الأساسية'),
        v_now,
        jsonb_build_object(
            'vat_rate', v_vat_rate,
            'gateway_fee', v_gw_fee,
            'commission_rate', v_comm_rate,
            'commission_amount', v_comm_amount,
            'duration_months', p_duration_months,
            'is_sandbox', v_is_sandbox,
            'webhook_event_id', v_webhook_event_id
        )
    )
    RETURNING id INTO v_invoice_id;

    -- 14. Insert into financial_ledger
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
        v_tx_id,
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
            'affiliate_name', v_partner_name,
            'invoice_id', v_invoice_id,
            'payment_method', v_clean_method,
            'gateway', v_clean_gateway,
            'plan_name', COALESCE(p_plan_name, v_store.subscription_plan),
            'commission_type', v_comm_type,
            'vat_rate', v_vat_rate,
            'base_amount', v_net_before_vat,
            'is_sandbox', v_is_sandbox,
            'webhook_event_id', v_webhook_event_id
        ),
        v_now,
        v_now
    )
    RETURNING id INTO v_ledger_id;

    -- 15. Update stores Subscription Status
    UPDATE public.stores
    SET
        status = 'active',
        subscription_status = 'active',
        subscription_active = true,
        setup_fee_paid = true,
        in_grace_period = false,
        lifecycle_stage = 'مشترك مدفوع',
        subscription_plan_id = COALESCE(v_sub_plan_uuid, stores.subscription_plan_id),
        plan_code = COALESCE(p_plan_code, stores.plan_code),
        subscription_plan = COALESCE(p_plan_name, stores.subscription_plan, 'الباقة الأساسية'),
        subscription_start_date = COALESCE(stores.subscription_start_date, v_now),
        subscription_end_date = v_new_end,
        renewal_amount = CASE WHEN v_gross > 0 THEN v_gross ELSE stores.renewal_amount END,
        updated_at = v_now
    WHERE id = p_store_id;

    -- 16. Convert Lead if applicable
    IF v_lead_id IS NOT NULL AND v_lead_status <> 'CONVERTED' THEN
        UPDATE public.merchant_leads
        SET
            status = 'CONVERTED',
            converted_store_id = p_store_id,
            updated_at = v_now
        WHERE id = v_lead_id;
    END IF;

    -- 17. Record Partner Commission
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
            merchant_name,
            created_at,
            updated_at
        ) VALUES (
            v_partner_id,
            v_lead_id,
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
            v_store.name,
            v_now,
            v_now
        )
        ON CONFLICT (idempotency_key) DO UPDATE
        SET
            basis_amount = EXCLUDED.basis_amount,
            commission_amount = EXCLUDED.commission_amount,
            status = 'EARNED',
            merchant_name = EXCLUDED.merchant_name,
            updated_at = v_now
        RETURNING id INTO v_comm_id;
    END IF;

    -- 18. Sync merchant_subscriptions & billing_transactions
    UPDATE public.merchant_subscriptions
    SET
        status = 'ACTIVE',
        current_period_start = v_now,
        current_period_end = v_new_end,
        updated_at = v_now
    WHERE store_id = p_store_id;

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
        v_sub_plan_uuid,
        CASE
            WHEN p_invoice_type = 'setup' THEN 'INITIAL_PAYMENT'
            WHEN p_invoice_type = 'upgrade' THEN 'ADJUSTMENT'
            ELSE 'RENEWAL'
        END,
        'PAID',
        v_gross,
        'SAR',
        v_clean_gateway,
        v_gw_payment_id,
        'btx_' || v_gw_payment_id,
        v_now,
        jsonb_build_object(
            'invoice_id', v_invoice_id,
            'invoice_number', v_invoice_num,
            'ledger_id', v_ledger_id,
            'is_sandbox', v_is_sandbox
        )
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    -- 19. Return Unified Success Result (No EXCEPTION WHEN OTHERS block -> any failure rolls back 100%)
    RETURN jsonb_build_object(
        'success', true,
        'idempotent', false,
        'is_sandbox', v_is_sandbox,
        'message', 'تمت معالجة الدفع والاشتراك بنجاح تام وفق ضوابط ZATCA',
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_num,
        'ledger_id', v_ledger_id,
        'transaction_id', v_tx_id,
        'gateway_payment_id', v_gw_payment_id,
        'webhook_event_id', v_webhook_event_id,
        'store_id', p_store_id,
        'gross_amount', v_gross,
        'vat_amount', v_vat_amount,
        'net_amount', v_net_before_vat,
        'gateway_fee', v_gw_fee,
        'commission_amount', v_comm_amount,
        'commission_id', v_comm_id,
        'partner_id', v_partner_id,
        'net_platform_amount', v_net_platform,
        'subscription_end_date', v_new_end
    );
END;
$function$;


-- 3.4 Super Admin Manual Subscription Activation (Hardened with Auth Guard)
CREATE OR REPLACE FUNCTION public.super_admin_manual_activate_subscription(
    p_store_id uuid,
    p_duration_months integer DEFAULT 1,
    p_amount numeric DEFAULT 0,
    p_payment_method text DEFAULT 'cash'::text,
    p_plan_id text DEFAULT NULL::text,
    p_notes text DEFAULT NULL::text,
    p_master_token text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_clean_method TEXT := lower(BTRIM(COALESCE(p_payment_method, 'cash')));
    v_gw_payment_id TEXT;
    v_months INTEGER := GREATEST(1, COALESCE(p_duration_months, 1));
    v_res JSONB;
BEGIN
    IF NOT (
        public.is_super_admin()
        OR auth.role() = 'service_role'
        OR (p_master_token IS NOT NULL AND public.is_valid_master_token(p_master_token))
    ) THEN
        RAISE EXCEPTION 'permission denied for function super_admin_manual_activate_subscription' USING ERRCODE = '42501';
    END IF;

    IF v_clean_method NOT IN ('cash', 'bank_transfer', 'cheque', 'other') THEN
        v_clean_method := 'cash';
    END IF;

    v_gw_payment_id := 'manual_' || v_clean_method || '_' || replace(gen_random_uuid()::text, '-', '');

    v_res := public.process_store_payment_atomic(
        p_store_id => p_store_id,
        p_invoice_type => 'renewal',
        p_amount => COALESCE(p_amount, 0),
        p_payment_method => v_clean_method,
        p_gateway => 'manual',
        p_gateway_payment_id => v_gw_payment_id,
        p_plan_id => p_plan_id,
        p_plan_code => NULL,
        p_plan_name => p_notes,
        p_duration_months => v_months,
        p_vat_rate => 0.00,
        p_gateway_fee => 0.00,
        p_webhook_event_id => 'evt_' || v_gw_payment_id,
        p_master_token => p_master_token
    );

    RETURN v_res;
END;
$function$;


-- 3.5 ZATCA Refund, Credit Note & Commission Clawback (Atomic & Hardened with Auth Guard)
CREATE OR REPLACE FUNCTION public.process_zatca_refund_and_clawback(
    p_invoice_number text,
    p_refund_amount numeric DEFAULT NULL::numeric,
    p_reason text DEFAULT 'إلغاء اشتراك واسترداد مالي بناءً على طلب العميل'::text,
    p_admin_user text DEFAULT 'SUPER_ADMIN'::text,
    p_notes text DEFAULT NULL::text,
    p_master_token text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_inv_id UUID := NULL;
    v_inv_store_id UUID := NULL;
    v_inv_number TEXT := NULL;
    v_inv_amount NUMERIC(12, 2) := 0.00;
    v_inv_vat NUMERIC(12, 2) := 0.00;
    v_inv_gw_payment_id TEXT := NULL;
    v_inv_status TEXT := NULL;

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
    IF NOT (
        public.is_super_admin()
        OR auth.role() = 'service_role'
        OR (p_master_token IS NOT NULL AND public.is_valid_master_token(p_master_token))
    ) THEN
        RAISE EXCEPTION 'permission denied for function process_zatca_refund_and_clawback' USING ERRCODE = '42501';
    END IF;

    -- 1. Locate Invoice in store_invoices first (with FOR UPDATE lock)
    SELECT
        id, store_id, invoice_number, amount, COALESCE(vat_amount, 0), gateway_payment_id, status
    INTO
        v_inv_id, v_inv_store_id, v_inv_number, v_inv_amount, v_inv_vat, v_inv_gw_payment_id, v_inv_status
    FROM public.store_invoices
    WHERE invoice_number = p_invoice_number OR id::text = p_invoice_number
    FOR UPDATE
    LIMIT 1;

    IF v_inv_id IS NULL THEN
        RAISE EXCEPTION 'INVOICE_NOT_FOUND: الفاتورة الأصلية غير موجودة في السجلات (%).', p_invoice_number;
    END IF;

    IF v_inv_status = 'refunded' THEN
        RAISE EXCEPTION 'ALREADY_REFUNDED: تم استرداد هذه الفاتورة مسبقاً (%).', v_inv_number;
    END IF;

    -- 2. Compute Refund Financial Figures (Respecting original VAT ratio)
    v_refund_gross := ROUND(COALESCE(p_refund_amount, v_inv_amount), 2);
    IF v_refund_gross <= 0 OR v_refund_gross > v_inv_amount THEN
        RAISE EXCEPTION 'INVALID_REFUND_AMOUNT: مبلغ الاسترداد غير صالح أو يتجاوز قيمة الفاتورة الأصلية.';
    END IF;

    IF v_inv_vat > 0 AND v_inv_amount > 0 THEN
        v_vat_refund := ROUND(v_refund_gross * (v_inv_vat / v_inv_amount), 2);
        v_net_refund := ROUND(v_refund_gross - v_vat_refund, 2);
    ELSE
        v_vat_refund := 0.00;
        v_net_refund := v_refund_gross;
    END IF;

    -- 3. Process Commission Clawback
    FOR v_comm IN
        SELECT * FROM public.partner_commissions
        WHERE (invoice_number = v_inv_number OR invoice_id = v_inv_id::text)
          AND status IN ('EARNED', 'PENDING', 'PAID')
        FOR UPDATE
    LOOP
        v_affiliate_id := v_comm.partner_account_id::text;

        IF v_comm.status IN ('EARNED', 'PENDING') THEN
            UPDATE public.partner_commissions
            SET
                status = 'REVERSED',
                notes = 'تم عكس العمولة تلقائياً بسبب استرداد الفاتورة ' || v_inv_number,
                updated_at = v_now
            WHERE id = v_comm.id;

            v_clawback_total := v_clawback_total + v_comm.commission_amount;

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
                -v_comm.commission_amount,
                'EARNED',
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

    -- 4. Generate ZATCA Credit Note Number
    v_cn_num := 'CN-' || to_char(v_now, 'YYYYMMDD') || '-' || upper(substr(md5(v_inv_number || random()::text), 1, 6));

    -- 5. Insert into financial_ledger (Reverse Ledger Entry)
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

    -- 6. Insert into credit_notes
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

    -- 7. Update Invoice Status in store_invoices
    UPDATE public.store_invoices
    SET
        status = 'refunded',
        updated_at = v_now
    WHERE id = v_inv_id;

    -- 8. Update Store Subscription Status
    IF v_inv_store_id IS NOT NULL THEN
        UPDATE public.stores
        SET
            setup_fee_paid = false,
            subscription_status = 'trial',
            subscription_active = false,
            status = 'trial',
            updated_at = v_now
        WHERE id = v_inv_store_id;

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
$function$;


-- 3.6 Atomic Manual Ledger Adjustment (Super Admin Only)
CREATE OR REPLACE FUNCTION public.record_manual_ledger_adjustment_atomic(
    p_store_id uuid DEFAULT NULL,
    p_affiliate_id uuid DEFAULT NULL,
    p_adjustment_type text DEFAULT 'CREDIT',
    p_amount numeric DEFAULT 0,
    p_reason_category text DEFAULT 'ACCOUNTING_CORRECTION',
    p_reference_number text DEFAULT NULL,
    p_admin_user text DEFAULT 'SUPER_ADMIN',
    p_admin_notes text DEFAULT NULL,
    p_master_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_sign NUMERIC := 1;
    v_gross NUMERIC(12, 2);
    v_net NUMERIC(12, 2);
    v_vat NUMERIC(12, 2) := 0.00;
    v_tx_id TEXT;
    v_ledger_id UUID;
    v_store_name TEXT := NULL;
    v_affiliate_name TEXT := NULL;
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    IF NOT (
        public.is_super_admin()
        OR auth.role() = 'service_role'
        OR (p_master_token IS NOT NULL AND public.is_valid_master_token(p_master_token))
    ) THEN
        RAISE EXCEPTION 'permission denied for function record_manual_ledger_adjustment_atomic' USING ERRCODE = '42501';
    END IF;

    IF COALESCE(p_amount, 0) <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: المبلغ يجب أن يكون أكبر من صفر.';
    END IF;

    IF p_reference_number IS NULL OR BTRIM(p_reference_number) = '' OR p_admin_notes IS NULL OR BTRIM(p_admin_notes) = '' THEN
        RAISE EXCEPTION 'MISSING_REFERENCE: رقم المرجع وملاحظات المشرف إلزامية لتوثيق التسوية المحاسبية.';
    END IF;

    IF UPPER(BTRIM(p_adjustment_type)) = 'DEBIT' THEN
        v_sign := -1;
    END IF;

    v_gross := ROUND(p_amount * v_sign, 2);
    v_net := v_gross;
    v_tx_id := 'tx_adj_' || BTRIM(p_reference_number);

    IF p_store_id IS NOT NULL THEN
        SELECT name INTO v_store_name FROM public.stores WHERE id = p_store_id;
    END IF;

    IF p_affiliate_id IS NOT NULL THEN
        SELECT display_name INTO v_affiliate_name FROM public.partner_accounts WHERE id = p_affiliate_id OR affiliate_id = p_affiliate_id LIMIT 1;
    END IF;

    INSERT INTO public.financial_ledger (
        transaction_id,
        store_id,
        affiliate_id,
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
        p_store_id::text,
        p_affiliate_id::text,
        'ADJUSTMENT',
        v_gross,
        v_vat,
        0.00,
        0.00,
        v_net,
        'SETTLED',
        COALESCE(p_admin_user, 'SUPER_ADMIN'),
        jsonb_build_object(
            'store_name', v_store_name,
            'affiliate_name', v_affiliate_name,
            'adjustment_type', UPPER(BTRIM(p_adjustment_type)),
            'reason_category', p_reason_category,
            'reference_number', BTRIM(p_reference_number),
            'admin_user', p_admin_user,
            'admin_notes', BTRIM(p_admin_notes)
        ),
        v_now,
        v_now
    )
    RETURNING id INTO v_ledger_id;

    RETURN jsonb_build_object(
        'success', true,
        'ledger_id', v_ledger_id,
        'transaction_id', v_tx_id,
        'gross_amount', v_gross,
        'vat_amount', v_vat,
        'net_platform_amount', v_net,
        'created_at', v_now
    );
END;
$function$;


-- 3.7 Atomic Complimentary Days Grant (Super Admin Only)
CREATE OR REPLACE FUNCTION public.grant_store_complimentary_days_atomic(
    p_store_id uuid,
    p_days_to_add integer,
    p_reason text,
    p_admin_user text DEFAULT 'SUPER_ADMIN',
    p_notes text DEFAULT NULL,
    p_master_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_store RECORD;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_base_end TIMESTAMPTZ;
    v_new_end TIMESTAMPTZ;
    v_tx_id TEXT;
    v_ledger_id UUID;
BEGIN
    IF NOT (
        public.is_super_admin()
        OR auth.role() = 'service_role'
        OR (p_master_token IS NOT NULL AND public.is_valid_master_token(p_master_token))
    ) THEN
        RAISE EXCEPTION 'permission denied for function grant_store_complimentary_days_atomic' USING ERRCODE = '42501';
    END IF;

    IF COALESCE(p_days_to_add, 0) <= 0 THEN
        RAISE EXCEPTION 'INVALID_DAYS: عدد الأيام المضافة يجب أن يكون أكبر من صفر.';
    END IF;

    SELECT * INTO v_store FROM public.stores WHERE id = p_store_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'STORE_NOT_FOUND: المتجر غير موجود.';
    END IF;

    v_base_end := GREATEST(v_now, COALESCE(v_store.subscription_end_date, v_now));
    v_new_end := v_base_end + (p_days_to_add || ' days')::INTERVAL;

    UPDATE public.stores
    SET
        subscription_end_date = v_new_end,
        subscription_active = true,
        subscription_status = 'active',
        status = 'active',
        in_grace_period = false,
        complimentary_days_granted = COALESCE(complimentary_days_granted, 0) + p_days_to_add,
        last_override_at = v_now,
        last_override_reason = p_reason,
        updated_at = v_now
    WHERE id = p_store_id;

    v_tx_id := 'tx_override_' || replace(gen_random_uuid()::text, '-', '');

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
        v_tx_id,
        p_store_id::text,
        'ADJUSTMENT',
        0.00,
        0.00,
        0.00,
        0.00,
        0.00,
        'SETTLED',
        COALESCE(p_admin_user, 'SUPER_ADMIN'),
        jsonb_build_object(
            'store_name', v_store.name,
            'override_type', 'COMPLIMENTARY_DAYS',
            'days_granted', p_days_to_add,
            'reason', p_reason,
            'previous_end_date', v_store.subscription_end_date,
            'new_end_date', v_new_end,
            'admin_notes', COALESCE(p_notes, '')
        ),
        v_now,
        v_now
    )
    RETURNING id INTO v_ledger_id;

    RETURN jsonb_build_object(
        'success', true,
        'store_id', p_store_id,
        'new_subscription_end_date', v_new_end,
        'complimentary_days_granted', COALESCE(v_store.complimentary_days_granted, 0) + p_days_to_add,
        'ledger_id', v_ledger_id,
        'transaction_id', v_tx_id
    );
END;
$function$;


-- 3.8 Affiliate Payout Atomic (Hardened with Auth Guard)
CREATE OR REPLACE FUNCTION public.process_affiliate_payout_atomic(
    p_partner_id uuid,
    p_admin_user character varying,
    p_transfer_ref character varying,
    p_bank_name character varying,
    p_iban character varying,
    p_notes text,
    p_master_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
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
    v_comm_ids JSONB;
BEGIN
    IF NOT (
        public.is_super_admin()
        OR auth.role() = 'service_role'
        OR (p_master_token IS NOT NULL AND public.is_valid_master_token(p_master_token))
    ) THEN
        RAISE EXCEPTION 'permission denied for function process_affiliate_payout_atomic' USING ERRCODE = '42501';
    END IF;

    SELECT display_name, affiliate_id INTO v_partner_name, v_affiliate_id
    FROM public.partner_accounts
    WHERE id = p_partner_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PARTNER_NOT_FOUND: الشريك غير موجود.';
    END IF;

    SELECT COALESCE(SUM(commission_amount), 0), COUNT(id), COALESCE(jsonb_agg(id), '[]'::jsonb)
    INTO v_comms_amount, v_comms_count, v_comm_ids
    FROM public.partner_commissions
    WHERE partner_account_id = p_partner_id AND status IN ('AVAILABLE', 'EARNED');

    SELECT COALESCE(SUM(bonus_amount), 0), COUNT(id)
    INTO v_bonuses_amount, v_bonuses_count
    FROM public.partner_bonus_awards
    WHERE partner_account_id = p_partner_id AND status IN ('ACHIEVED', 'AWARDED');

    v_total_amount := v_comms_amount + v_bonuses_amount;

    IF v_total_amount <= 0 THEN
        RAISE EXCEPTION 'NO_DUE_BALANCE: لا توجد عمولات أو مكافآت مستحقة للصرف لهذا الشريك.';
    END IF;

    v_payout_number := 'PAY-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substring(md5(p_transfer_ref || random()::text) from 1 for 6));

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
        'tx_payout_' || v_payout_number,
        p_partner_id::text,
        p_transfer_ref,
        'PAYOUT',
        0.00,
        0.00,
        0.00,
        v_total_amount,
        0.00,
        'SETTLED',
        COALESCE(p_admin_user, 'SUPER_ADMIN'),
        jsonb_build_object(
            'payout_number', v_payout_number,
            'affiliate_name', v_partner_name,
            'bank_name', p_bank_name,
            'iban', p_iban,
            'transfer_reference', p_transfer_ref,
            'commissions_count', v_comms_count,
            'bonuses_count', v_bonuses_count,
            'notes', COALESCE(p_notes, '')
        ),
        now(),
        now()
    )
    RETURNING id INTO v_ledger_id;

    INSERT INTO public.affiliate_payouts (
        payout_number,
        affiliate_id,
        partner_name,
        iban,
        bank_name,
        transfer_reference,
        amount,
        commissions_count,
        commission_ids,
        status,
        disbursed_by,
        ledger_entry_id,
        notes,
        disbursed_at,
        created_at
    ) VALUES (
        v_payout_number,
        p_partner_id::text,
        v_partner_name,
        p_iban,
        p_bank_name,
        p_transfer_ref,
        v_total_amount,
        v_comms_count,
        v_comm_ids,
        'PAID',
        COALESCE(p_admin_user, 'SUPER_ADMIN'),
        v_ledger_id,
        COALESCE(p_notes, ''),
        now(),
        now()
    )
    RETURNING id INTO v_payout_id;

    UPDATE public.partner_commissions
    SET status = 'PAID',
        notes = COALESCE(notes, '') || ' | تم الصرف بحوالة مرجع: ' || p_transfer_ref,
        updated_at = now()
    WHERE partner_account_id = p_partner_id AND status IN ('AVAILABLE', 'EARNED');

    UPDATE public.partner_bonus_awards
    SET status = 'PAID'
    WHERE partner_account_id = p_partner_id AND status IN ('ACHIEVED', 'AWARDED');

    IF v_affiliate_id IS NOT NULL THEN
        UPDATE public.affiliates
        SET pending_payout = 0,
            updated_at = now()
        WHERE id = v_affiliate_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'payout_id', v_payout_id,
        'payout_number', v_payout_number,
        'ledger_id', v_ledger_id,
        'amount', v_total_amount,
        'commissions_count', v_comms_count,
        'bonuses_count', v_bonuses_count
    );
END;
$function$;


-- 3.9 Platform Payment Gateway Config Get & Update (Secret Key Stripped for Non-SuperAdmin)
CREATE OR REPLACE FUNCTION public.get_platform_payment_gateway_config(
    p_master_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_val JSONB;
BEGIN
    SELECT value INTO v_val FROM public.platform_system_config WHERE key = 'platform_payment_gateway';
    IF v_val IS NULL THEN
        v_val := jsonb_build_object(
            'enabled', true,
            'provider', 'sandbox',
            'mode', 'sandbox',
            'public_key', '',
            'secret_key', '',
            'allow_cash', true,
            'allow_bank_transfer', true,
            'bank_details', jsonb_build_object(
                'bank_name', 'مصرف الراجحي',
                'account_name', 'مؤسسة رادار لحلول الاتصالات وتقنية المعلومات',
                'iban', 'SA0380000000000000000000'
            ),
            'updated_at', now()
        );
    END IF;

    -- Strip secret_key and webhook_secret unless caller is Super Admin, service_role, or valid sovereign token
    IF NOT (
        public.is_super_admin()
        OR auth.role() = 'service_role'
        OR (p_master_token IS NOT NULL AND public.is_valid_master_token(p_master_token))
    ) THEN
        v_val := (v_val - 'secret_key' - 'webhook_secret') || jsonb_build_object('secret_key', '');
    END IF;

    RETURN v_val;
END;
$function$;


CREATE OR REPLACE FUNCTION public.update_platform_payment_gateway_config(
    p_config jsonb,
    p_master_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT (
        public.is_super_admin()
        OR auth.role() = 'service_role'
        OR (p_master_token IS NOT NULL AND public.is_valid_master_token(p_master_token))
    ) THEN
        RAISE EXCEPTION 'permission denied for function update_platform_payment_gateway_config' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.platform_system_config (key, platform_status, value, updated_at)
    VALUES ('platform_payment_gateway', 'active', p_config, now())
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now();

    RETURN jsonb_build_object('success', true, 'message', 'تم حفظ إعدادات بوابات الدفع بنجاح');
END;
$function$;


-- 3.10 Batch Invoices Fetch (Hardened for Super Admin / Server Only)
CREATE OR REPLACE FUNCTION public.get_all_store_invoices_batch(
    p_master_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_result JSONB;
BEGIN
    IF NOT (
        public.is_super_admin()
        OR auth.role() = 'service_role'
        OR (p_master_token IS NOT NULL AND public.is_valid_master_token(p_master_token))
    ) THEN
        RAISE EXCEPTION 'permission denied for function get_all_store_invoices_batch' USING ERRCODE = '42501';
    END IF;

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
                    'metadata', COALESCE(metadata, '{}'::jsonb),
                    'created_at', created_at
                ) ORDER BY created_at DESC
            ) AS invoices_json
        FROM public.store_invoices
        GROUP BY store_id
    ) t;

    RETURN COALESCE(v_result, '{}'::jsonb);
END;
$function$;


-- ==============================================================================
-- SECTION 4: FINANCIAL TABLES RLS HARDENING (REPLACE BEFORE DROP)
-- ==============================================================================

-- 4.1 platform_system_config: Restrict direct table SELECT to Super Admin / service_role (public uses safe RPCs)
DROP POLICY IF EXISTS "SuperAdmin read platform_system_config" ON public.platform_system_config;
CREATE POLICY "SuperAdmin read platform_system_config"
  ON public.platform_system_config
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "Public read platform_system_config" ON public.platform_system_config;

-- 4.2 financial_ledger: Remove anon read-all policy; allow Super Admin or Store Owner
DROP POLICY IF EXISTS "financial_ledger_scoped_select" ON public.financial_ledger;
CREATE POLICY "financial_ledger_scoped_select"
  ON public.financial_ledger
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      store_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND public.has_store_access(store_id::uuid)
    )
  );

DROP POLICY IF EXISTS "financial_ledger_read_all" ON public.financial_ledger;
DROP POLICY IF EXISTS "financial_ledger_select_policy" ON public.financial_ledger;

-- 4.3 store_invoices: Remove anon read-all policy; allow Super Admin or Store Owner
DROP POLICY IF EXISTS "store_invoices_scoped_select" ON public.store_invoices;
CREATE POLICY "store_invoices_scoped_select"
  ON public.store_invoices
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_store_access(store_id)
  );

DROP POLICY IF EXISTS "store_invoices_anon_select_policy" ON public.store_invoices;
DROP POLICY IF EXISTS "store_invoices_select_policy" ON public.store_invoices;

-- 4.4 credit_notes: Scope SELECT to Super Admin or Store Owner
DROP POLICY IF EXISTS "credit_notes_scoped_select" ON public.credit_notes;
CREATE POLICY "credit_notes_scoped_select"
  ON public.credit_notes
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      store_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND public.has_store_access(store_id::uuid)
    )
  );

DROP POLICY IF EXISTS "credit_notes_select_policy" ON public.credit_notes;

