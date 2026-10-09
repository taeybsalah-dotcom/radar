-- السماح بالمبالغ السالبة في حالة المرتجعات (CLAWBACK_RECOVERY)
ALTER TABLE public.partner_commissions DROP CONSTRAINT IF EXISTS partner_commissions_commission_amount_check;
ALTER TABLE public.partner_commissions ADD CONSTRAINT partner_commissions_commission_amount_check CHECK (
    commission_amount >= 0 OR commission_type = 'CLAWBACK_RECOVERY' OR commission_type = 'MANUAL_ADJUSTMENT'
);
