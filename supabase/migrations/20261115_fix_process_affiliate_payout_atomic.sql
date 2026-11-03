-- ==============================================================================
-- 🏛️ AL-ATHAR CORE: Fix process_affiliate_payout_atomic RPC
-- Resolves: column "partner_account_id" does not exist error
-- Ensures: Atomic partner payout processing with proper column mappings and CTE row locking
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.process_affiliate_payout_atomic(
    p_partner_id uuid,
    p_admin_user text DEFAULT 'Super Admin'::text,
    p_transfer_ref text DEFAULT NULL::text,
    p_bank_name text DEFAULT 'تحويل بنكي مباشر'::text,
    p_iban text DEFAULT NULL::text,
    p_notes text DEFAULT NULL::text,
    p_master_token text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_affiliate RECORD;
    v_partner_account RECORD;
    v_effective_affiliate_id UUID;
    v_effective_partner_id UUID;
    v_partner_name TEXT;
    v_tenant_id TEXT;
    v_total_due NUMERIC := 0.00;
    v_payout_id UUID;
    v_payout_num TEXT;
    v_tx_id TEXT;
    v_count INT := 0;
    v_ledger_id UUID;
BEGIN
    -- 1. البحث عن الشريك والتحقق منه سواء تم تمرير معرف partner_accounts.id أو affiliates.id
    SELECT * INTO v_partner_account
    FROM public.partner_accounts
    WHERE id = p_partner_id OR affiliate_id = p_partner_id
    LIMIT 1;

    IF FOUND THEN
        v_effective_partner_id := v_partner_account.id;
        v_effective_affiliate_id := v_partner_account.affiliate_id;
        v_partner_name := v_partner_account.display_name;
        v_tenant_id := v_partner_account.tenant_id;
    ELSE
        SELECT * INTO v_affiliate
        FROM public.affiliates
        WHERE id = p_partner_id
        LIMIT 1;

        IF FOUND THEN
            v_effective_affiliate_id := v_affiliate.id;
            v_partner_name := v_affiliate.name;
            v_tenant_id := v_affiliate.tenant_id;
        ELSE
            RETURN jsonb_build_object('success', false, 'error', 'حساب الشريك غير موجود في النظام');
        END IF;
    END IF;

    -- 2. قفل وحساب إجمالي العمولات المكتسبة الجاهزة للصرف (عبر CTE لتفادي خطأ FOR UPDATE مع التجميع)
    WITH locked_commissions AS (
        SELECT id, commission_amount
        FROM public.partner_commissions
        WHERE (
            (v_effective_affiliate_id IS NOT NULL AND affiliate_id = v_effective_affiliate_id)
            OR (v_effective_partner_id IS NOT NULL AND partner_account_id = v_effective_partner_id)
        )
        AND status IN ('EARNED', 'AVAILABLE')
        FOR UPDATE
    )
    SELECT COALESCE(SUM(commission_amount), 0.00), COUNT(*)
    INTO v_total_due, v_count
    FROM locked_commissions;

    IF v_total_due <= 0.00 OR v_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'لا توجد عمولات مستحقة وجاهزة للصرف لهذا الشريك');
    END IF;

    -- 3. توليد أرقام الصرف والقيد المالي
    v_payout_num := 'PAY-' || to_char(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(gen_random_uuid()::text, 1, 6));
    v_tx_id := 'tx_payout_' || v_payout_num;

    -- 4. إدراج القيد المحاسبي في financial_ledger أولاً للحصول على معرف القيد
    INSERT INTO public.financial_ledger (
        tenant_id,
        transaction_id,
        transaction_type,
        store_id,
        affiliate_id,
        gross_amount,
        vat_amount,
        gateway_fee,
        affiliate_commission,
        net_platform_amount,
        status,
        created_by,
        metadata,
        created_at
    ) VALUES (
        v_tenant_id,
        v_tx_id,
        'PAYOUT',
        NULL,
        v_effective_affiliate_id::text,
        -v_total_due,
        0.00,
        0.00,
        -v_total_due,
        0.00,
        'SETTLED',
        COALESCE(p_admin_user, 'Super Admin'),
        jsonb_build_object(
            'partner_name', v_partner_name,
            'payout_number', v_payout_num,
            'bank_name', p_bank_name,
            'iban', p_iban,
            'transfer_reference', p_transfer_ref,
            'notes', p_notes,
            'currency', 'SAR'
        ),
        NOW()
    ) RETURNING id INTO v_ledger_id;

    -- 5. إدراج سجل الصرف الرسمي في جدول affiliate_payouts بمطابقة كاملة للأعمدة
    INSERT INTO public.affiliate_payouts (
        tenant_id,
        affiliate_id,
        payout_number,
        partner_name,
        amount,
        commissions_count,
        bank_name,
        iban,
        transfer_reference,
        status,
        notes,
        disbursed_by,
        ledger_entry_id,
        disbursed_at,
        created_at
    ) VALUES (
        v_tenant_id,
        COALESCE(v_effective_affiliate_id::text, v_effective_partner_id::text),
        v_payout_num,
        v_partner_name,
        v_total_due,
        v_count,
        COALESCE(p_bank_name, 'تحويل بنكي مباشر'),
        COALESCE(p_iban, 'N/A'),
        COALESCE(p_transfer_ref, 'TRX-' || to_char(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(gen_random_uuid()::text, 1, 5))),
        'COMPLETED',
        p_notes,
        p_admin_user,
        v_ledger_id,
        NOW(),
        NOW()
    ) RETURNING id INTO v_payout_id;

    -- 6. تحديث حالة العمولات إلى تم الصرف PAID
    UPDATE public.partner_commissions
    SET status = 'PAID',
        updated_at = NOW()
    WHERE (
        (v_effective_affiliate_id IS NOT NULL AND affiliate_id = v_effective_affiliate_id)
        OR (v_effective_partner_id IS NOT NULL AND partner_account_id = v_effective_partner_id)
    )
    AND status IN ('EARNED', 'AVAILABLE');

    RETURN jsonb_build_object(
        'success', true,
        'payout_id', v_payout_id,
        'payout_number', v_payout_num,
        'amount_paid', v_total_due,
        'commissions_count', v_count,
        'transaction_id', v_tx_id
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.process_affiliate_payout_atomic TO anon, authenticated, service_role;
