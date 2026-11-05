-- 1. إضافة أعمدة إغلاق ومطابقة الصندوق الناقصة
ALTER TABLE public.pos_shifts 
ADD COLUMN IF NOT EXISTS closing_cash NUMERIC(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS actual_cash NUMERIC(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS cash_difference NUMERIC(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS discrepancy NUMERIC(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS expected_cash NUMERIC(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_sales NUMERIC(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS cash_sales NUMERIC(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS card_sales NUMERIC(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS split_sales NUMERIC(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS orders_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS closing_notes TEXT;

-- 2. تحديث دالة إغلاق الوردية لتفكيك الدفع المجزأ (Split) ذرياً في السيرفر
CREATE OR REPLACE FUNCTION public.close_pos_shift_secure(
  p_store_id uuid, 
  p_shift_id uuid, 
  p_actual_cash numeric, 
  p_notes text DEFAULT NULL::text, 
  p_staff_token text DEFAULT NULL::text, 
  p_master_token text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_is_auth BOOLEAN := FALSE;
  v_staff_store_id UUID := NULL;
  v_staff_id_str TEXT := NULL;
  v_token TEXT := NULL;
  v_shift RECORD;
  v_orders_count INTEGER := 0;
  v_total_sales NUMERIC(12,2) := 0.00;
  v_cash_sales NUMERIC(12,2) := 0.00;
  v_card_sales NUMERIC(12,2) := 0.00;
  v_split_sales NUMERIC(12,2) := 0.00;
  v_tax_amount NUMERIC(12,2) := 0.00;
  v_discount_amount NUMERIC(12,2) := 0.00;
  v_refunds_count INTEGER := 0;
  v_total_refunds NUMERIC(12,2) := 0.00;
  v_cash_refunds NUMERIC(12,2) := 0.00;
  v_card_refunds NUMERIC(12,2) := 0.00;
  v_movements_count INTEGER := 0;
  v_total_cash_in NUMERIC(12,2) := 0.00;
  v_total_cash_out NUMERIC(12,2) := 0.00;
  v_expected_cash NUMERIC(12,2) := 0.00;
  v_actual_cash NUMERIC(12,2) := ROUND(GREATEST(0, COALESCE(p_actual_cash, 0)), 2);
  v_cash_difference NUMERIC(12,2) := 0.00;
  v_closed_shift RECORD;
BEGIN
  IF p_store_id IS NULL OR p_shift_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'MISSING_SHIFT_ID', 'message', 'معرف المتجر والوردية مطلوبان.');
  END IF;

  -- 1. التحقق من صلاحية الكاشير/المدير
  IF public.is_super_admin() OR auth.role() = 'service_role' OR public.is_valid_master_token(p_master_token) THEN
    v_is_auth := TRUE;
  ELSIF public.has_store_access(p_store_id) THEN
    v_is_auth := TRUE;
  ELSE
    v_token := COALESCE(
      NULLIF(BTRIM(p_staff_token), ''),
      NULLIF(current_setting('request.headers', true), '')::json->>'x-staff-token'
    );
    IF v_token IS NOT NULL AND v_token <> '' THEN
      SELECT s.store_id, s.staff_id
      INTO v_staff_store_id, v_staff_id_str
      FROM public._staff_session(v_token, false) s
      LIMIT 1;

      IF v_staff_store_id = p_store_id THEN
        v_is_auth := TRUE;
      END IF;
    END IF;
  END IF;

  IF NOT v_is_auth THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHORIZED_STAFF',
      'message', 'غير مصرح: يتطلب إغلاق الوردية جلسة كاشير أو مدير صالحة.'
    );
  END IF;

  -- 2. قفل سجل الوردية
  SELECT * INTO v_shift
  FROM public.pos_shifts
  WHERE id = p_shift_id AND store_id = p_store_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SHIFT_NOT_FOUND', 'message', 'الوردية غير موجودة.');
  END IF;

  IF lower(COALESCE(v_shift.status, '')) <> 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', 'SHIFT_ALREADY_CLOSED', 'message', 'هذه الوردية مغلقة مسبقاً.');
  END IF;

  -- 3. حساب المبيعات وتفكيك مبالغ الدفع المجزأ ذرياً
  SELECT
    COUNT(*)::integer,
    ROUND(COALESCE(SUM(COALESCE(NULLIF(o.total_price, 0), o.total_amount, 0)), 0), 2),
    ROUND(COALESCE(SUM(
      CASE 
        WHEN lower(COALESCE(o.payment_method, 'cash')) = 'cash' 
          THEN COALESCE(NULLIF(o.total_price, 0), o.total_amount, 0)
        WHEN lower(COALESCE(o.payment_method, 'cash')) = 'split'
          THEN COALESCE(NULLIF(o.fulfillment_details->>'split_cash', '')::numeric, 0)
        ELSE 0 
      END
    ), 0), 2),
    ROUND(COALESCE(SUM(
      CASE 
        WHEN lower(COALESCE(o.payment_method, 'cash')) IN ('card', 'mada', 'credit_card', 'apple_pay', 'online') 
          THEN COALESCE(NULLIF(o.total_price, 0), o.total_amount, 0)
        WHEN lower(COALESCE(o.payment_method, 'cash')) = 'split'
          THEN COALESCE(
            NULLIF(o.fulfillment_details->>'split_card', '')::numeric,
            COALESCE(NULLIF(o.total_price, 0), o.total_amount, 0) - COALESCE(NULLIF(o.fulfillment_details->>'split_cash', '')::numeric, 0)
          )
        ELSE 0 
      END
    ), 0), 2),
    ROUND(COALESCE(SUM(CASE WHEN lower(COALESCE(o.payment_method, 'cash')) = 'split' THEN COALESCE(NULLIF(o.total_price, 0), o.total_amount, 0) ELSE 0 END), 0), 2),
    ROUND(COALESCE(SUM(COALESCE(NULLIF(o.tax_amount, 0), COALESCE(NULLIF(o.total_price, 0), o.total_amount, 0) - (COALESCE(NULLIF(o.total_price, 0), o.total_amount, 0) / 1.15))), 0), 2),
    ROUND(COALESCE(SUM(COALESCE(o.discount_amount, 0)), 0), 2)
  INTO
    v_orders_count,
    v_total_sales,
    v_cash_sales,
    v_card_sales,
    v_split_sales,
    v_tax_amount,
    v_discount_amount
  FROM public.store_orders o
  WHERE o.store_id = p_store_id
    AND lower(COALESCE(o.status, '')) <> 'cancelled'
    AND (
      o.shift_id = v_shift.id
      OR (
        o.shift_id IS NULL
        AND o.created_at >= v_shift.opened_at
        AND (v_shift.branch_id IS NULL OR o.branch_id IS NULL OR o.branch_id = v_shift.branch_id)
      )
    );

  -- 4. حساب المرتجعات الفعلية
  SELECT
    COUNT(*)::integer,
    ROUND(COALESCE(SUM(COALESCE(r.total_refunded, 0)), 0), 2),
    ROUND(COALESCE(SUM(CASE WHEN lower(COALESCE(r.refund_method, 'cash')) = 'cash' THEN COALESCE(r.total_refunded, 0) ELSE 0 END), 0), 2),
    ROUND(COALESCE(SUM(CASE WHEN lower(COALESCE(r.refund_method, 'cash')) <> 'cash' THEN COALESCE(r.total_refunded, 0) ELSE 0 END), 0), 2)
  INTO
    v_refunds_count,
    v_total_refunds,
    v_cash_refunds,
    v_card_refunds
  FROM public.pos_refunds r
  WHERE r.store_id = p_store_id
    AND (
      r.shift_id = v_shift.id
      OR (
        r.shift_id IS NULL
        AND r.created_at >= v_shift.opened_at
        AND (v_shift.branch_id IS NULL OR r.branch_id IS NULL OR r.branch_id = v_shift.branch_id)
      )
    );

  -- 5. حساب الحركات النقدية الفعلية
  SELECT
    COUNT(*)::integer,
    ROUND(COALESCE(SUM(CASE WHEN lower(COALESCE(NULLIF(m.type, ''), m.movement_type)) = 'cash_in' THEN COALESCE(m.amount, 0) ELSE 0 END), 0), 2),
    ROUND(COALESCE(SUM(CASE WHEN lower(COALESCE(NULLIF(m.type, ''), m.movement_type)) = 'cash_out' THEN COALESCE(m.amount, 0) ELSE 0 END), 0), 2)
  INTO
    v_movements_count,
    v_total_cash_in,
    v_total_cash_out
  FROM public.pos_cash_movements m
  WHERE m.store_id = p_store_id
    AND m.shift_id = v_shift.id;

  -- 6. معادلة النقد المتوقع
  v_expected_cash := ROUND(
    COALESCE(v_shift.opening_cash, 0)
    + v_cash_sales
    - v_cash_refunds
    + v_total_cash_in
    - v_total_cash_out,
    2
  );
  v_cash_difference := ROUND(v_actual_cash - v_expected_cash, 2);

  -- 7. تحديث وإغلاق الوردية
  UPDATE public.pos_shifts
  SET
    status = 'closed',
    closed_at = now(),
    closing_cash = v_actual_cash,
    actual_cash = v_actual_cash,
    expected_cash = v_expected_cash,
    cash_difference = v_cash_difference,
    discrepancy = v_cash_difference,
    total_sales = v_total_sales,
    cash_sales = v_cash_sales,
    card_sales = v_card_sales,
    split_sales = v_split_sales,
    tax_amount = v_tax_amount,
    discount_amount = v_discount_amount,
    orders_count = v_orders_count,
    total_refunds = v_total_refunds,
    cash_refunds = v_cash_refunds,
    card_refunds = v_card_refunds,
    refunds_count = v_refunds_count,
    total_cash_in = v_total_cash_in,
    total_cash_out = v_total_cash_out,
    cash_movements_count = v_movements_count,
    notes = COALESCE(p_notes, notes),
    updated_at = now()
  WHERE id = v_shift.id
  RETURNING * INTO v_closed_shift;

  RETURN jsonb_build_object(
    'success', true,
    'shift', to_jsonb(v_closed_shift)
  );
END;
$function$;