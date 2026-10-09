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
