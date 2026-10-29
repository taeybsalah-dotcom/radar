-- =============================================================================
-- المرحلة 4: تأمين الطلبات (store_orders)، الورديات والحركات النقدية (pos_shifts & pos_cash_movements)،
-- المرتجعات وسحب نقاط الولاء الذري (pos_refunds & Points Clawback)، والحجوزات ومنع التعارض (service_bookings)
-- مع توحيد صيغة أرقام الجوال (normalize_saudi_phone) وحساب الأسعار سيرفرياً من catalog_items
-- قاعدة البيانات المستهدفة: سديم الأثر (kspfiijorengpckdlymx)
-- =============================================================================

BEGIN;

-- =============================================================================
-- القسم 1: مواءمة الجداول والأعمدة + تنظيف البيانات المسبقة + الفهارس الفريدة
-- =============================================================================

-- 1.0 حماية أعمدة audit_logs و store_customers حتى لا تفشل جمل INSERT داخل الدوال
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS event_type TEXT;

ALTER TABLE public.store_customers
  ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'bronze',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- 1.1 مواءمة أعمدة جدول الطلبات (store_orders) وإزالة قيود NOT NULL الموروثة المتعارضة
ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES public.pos_shifts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS total_price NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS loyalty_points_earned INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS points_awarded BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS refund_status TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS refund_history JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS order_source TEXT DEFAULT 'customer_app',
  ADD COLUMN IF NOT EXISTS order_type TEXT DEFAULT 'dine_in',
  ADD COLUMN IF NOT EXISTS fulfillment_type TEXT DEFAULT 'dine_in',
  ADD COLUMN IF NOT EXISTS fulfillment_details JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.store_orders ALTER COLUMN total_amount SET DEFAULT 0.00;
ALTER TABLE public.store_orders ALTER COLUMN total_amount DROP NOT NULL;
ALTER TABLE public.store_orders ALTER COLUMN status SET DEFAULT 'pending';

-- 1.2 مواءمة أعمدة جدول الورديات (pos_shifts) والحركات النقدية (pos_cash_movements)
ALTER TABLE public.pos_shifts
  ADD COLUMN IF NOT EXISTS branch_name TEXT,
  ADD COLUMN IF NOT EXISTS staff_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS staff_phone TEXT,
  ADD COLUMN IF NOT EXISTS actual_cash NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS cash_difference NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS total_sales NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS cash_sales NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS card_sales NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS split_sales NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS orders_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_refunds NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS cash_refunds NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS card_refunds NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS refunds_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cash_in NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS total_cash_out NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS cash_movements_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.pos_shifts ALTER COLUMN status SET DEFAULT 'open';

ALTER TABLE public.pos_cash_movements
  ADD COLUMN IF NOT EXISTS movement_type TEXT DEFAULT 'cash_in',
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'cash_in',
  ADD COLUMN IF NOT EXISTS staff_id TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS staff_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS branch_name TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS recipient_name TEXT,
  ADD COLUMN IF NOT EXISTS invoice_ref TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE public.pos_cash_movements ALTER COLUMN movement_type SET DEFAULT 'cash_in';
ALTER TABLE public.pos_cash_movements ALTER COLUMN movement_type DROP NOT NULL;

-- 1.3 مواءمة أعمدة جدول الحجوزات (service_bookings)
ALTER TABLE public.service_bookings
  ADD COLUMN IF NOT EXISTS points_awarded BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS loyalty_points_earned INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS points_to_earn INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS booking_source TEXT DEFAULT 'customer_app',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.service_bookings ALTER COLUMN points_to_earn SET DEFAULT 0;
ALTER TABLE public.service_bookings ALTER COLUMN points_to_earn DROP NOT NULL;

-- 1.4 تنظيف وتوحيد أرقام الجوال الموجودة في جداول المرحلة 4
UPDATE public.store_orders
SET
  customer_phone = COALESCE(public.normalize_saudi_phone(customer_phone), BTRIM(customer_phone)),
  total_price = COALESCE(NULLIF(total_price, 0), total_amount, 0),
  total_amount = COALESCE(NULLIF(total_amount, 0), total_price, 0),
  status = lower(COALESCE(status, 'pending'))
WHERE customer_phone IS NOT NULL OR status <> lower(COALESCE(status, 'pending'));

UPDATE public.pos_refunds
SET customer_phone = COALESCE(public.normalize_saudi_phone(customer_phone), BTRIM(customer_phone))
WHERE customer_phone IS NOT NULL AND BTRIM(customer_phone) <> '';

UPDATE public.service_bookings
SET customer_phone = COALESCE(public.normalize_saudi_phone(customer_phone), BTRIM(customer_phone))
WHERE customer_phone IS NOT NULL AND BTRIM(customer_phone) <> '';

-- 1.5 تنظيف الورديات المفتوحة المكررة قبل إنشاء القيد الفريد (Unique Partial Index)
UPDATE public.pos_shifts
SET status = lower(BTRIM(COALESCE(status, 'open')))
WHERE status IS NULL OR status <> lower(BTRIM(status));

WITH ranked_open_shifts AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY store_id, COALESCE(staff_id::text, NULLIF(lower(BTRIM(staff_name)), ''), COALESCE(branch_id::text, 'default'))
      ORDER BY opened_at DESC NULLS LAST, created_at DESC NULLS LAST
    ) AS rn
  FROM public.pos_shifts
  WHERE status = 'open'
)
UPDATE public.pos_shifts s
SET
  status = 'closed',
  closed_at = COALESCE(s.closed_at, now()),
  notes = COALESCE(s.notes || ' | ', '') || 'إغلاق تلقائي لمنع تعدد الورديات المفتوحة لنفس الكاشير',
  updated_at = now()
FROM ranked_open_shifts r
WHERE s.id = r.id AND r.rn > 1;

-- قيد فريد يمنع فتح أكثر من وردية نشطة (open) لنفس الكاشير في نفس المتجر في نفس الوقت
DROP INDEX IF EXISTS public.idx_pos_shifts_one_open_per_staff;
CREATE UNIQUE INDEX idx_pos_shifts_one_open_per_staff
ON public.pos_shifts (
  store_id,
  COALESCE(staff_id::text, NULLIF(lower(BTRIM(staff_name)), ''), COALESCE(branch_id::text, 'default'))
)
WHERE status = 'open';


-- =============================================================================
-- القسم 2: حذف النسخ القديمة من الدوال لمنع الـ Function Overloading
-- =============================================================================
DROP FUNCTION IF EXISTS public.create_store_order_secure(uuid, jsonb, text, text, text, text, text, uuid, text, text, text, jsonb, numeric, text, text, uuid, text, text);
DROP FUNCTION IF EXISTS public.create_store_order_secure(uuid, jsonb, text, text, text, text, text, uuid, text, text, text, jsonb, numeric, text, text, uuid, text, text, text);
DROP FUNCTION IF EXISTS public.update_store_order_status_secure(uuid, uuid, text, text, text, text, text, text, text, text, uuid, text, text);
DROP FUNCTION IF EXISTS public.get_customer_orders_secure(uuid, text);
DROP FUNCTION IF EXISTS public.open_pos_shift_secure(uuid, numeric, uuid, text, uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public.record_pos_cash_movement_secure(uuid, uuid, text, numeric, text, text, text, text, text, uuid, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.close_pos_shift_secure(uuid, uuid, numeric, text, text, text);
DROP FUNCTION IF EXISTS public.process_pos_refund_atomic(uuid, uuid, jsonb, text, text, text, text, uuid, uuid, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.book_service_safely(uuid, uuid, text, text, text, text, numeric, integer, text, text, text, text, text, integer, jsonb, uuid, text, text);
DROP FUNCTION IF EXISTS public.book_service_safely(uuid, uuid, text, text, text, text, numeric, integer, text, text, text, text, text, integer, jsonb, uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public.update_booking_status_secure(text, text, text);
DROP FUNCTION IF EXISTS public.update_booking_status_secure(text, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.get_customer_bookings(uuid, text);


-- =============================================================================
-- القسم 3: الدوال الذرية المؤمنة للمرحلة 4 (SECURITY DEFINER Atomic RPCs)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 3.1 دالة إنشاء الطلب الذرية المؤمنة (create_store_order_secure)
-- تتحقق من أسعار الأصناف والإضافات من catalog_items داخل السيرفر، وتوحد رقم الجوال،
-- وتتحقق من صلاحية الكاشير إذا كان الطلب مباشراً من نقاط البيع (POS)، وتمنح نقاط الولاء ذرياً عند الاكتمال.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_store_order_secure(
  p_store_id UUID,
  p_items JSONB,
  p_customer_name TEXT DEFAULT 'عميل المتجر',
  p_customer_phone TEXT DEFAULT '',
  p_fulfillment_type TEXT DEFAULT 'dine_in',
  p_payment_method TEXT DEFAULT 'cash',
  p_order_source TEXT DEFAULT 'customer_app',
  p_branch_id UUID DEFAULT NULL,
  p_table_number TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT '',
  p_delivery_address TEXT DEFAULT NULL,
  p_fulfillment_details JSONB DEFAULT '{}'::jsonb,
  p_delivery_fee NUMERIC DEFAULT 0,
  p_status TEXT DEFAULT NULL,
  p_payment_status TEXT DEFAULT NULL,
  p_shift_id UUID DEFAULT NULL,
  p_staff_token TEXT DEFAULT NULL,
  p_master_token TEXT DEFAULT NULL,
  p_order_number TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_store RECORD;
  v_norm_phone TEXT := NULL;
  v_is_staff_auth BOOLEAN := FALSE;
  v_staff_store_id UUID := NULL;
  v_staff_id_str TEXT := NULL;
  v_staff_name TEXT := NULL;
  v_token TEXT := NULL;
  v_is_pos_order BOOLEAN := FALSE;
  v_final_source TEXT;
  v_final_status TEXT;
  v_final_payment_status TEXT;
  v_final_payment_method TEXT;
  v_item JSONB;
  v_item_id TEXT;
  v_item_qty NUMERIC;
  v_cat_item RECORD;
  v_unit_price NUMERIC;
  v_mod JSONB;
  v_mod_delta NUMERIC;
  v_db_mod_delta NUMERIC;
  v_line_total NUMERIC;
  v_verified_items JSONB := '[]'::jsonb;
  v_server_subtotal NUMERIC(12,2) := 0.00;
  v_delivery_fee NUMERIC(12,2) := 0.00;
  v_final_total NUMERIC(12,2) := 0.00;
  v_tax_amount NUMERIC(12,2) := 0.00;
  v_points_earned INTEGER := 0;
  v_points_awarded BOOLEAN := FALSE;
  v_customer RECORD;
  v_customer_id UUID := NULL;
  v_order_number TEXT;
  v_active_shift_id UUID := p_shift_id;
  v_inserted_order RECORD;
BEGIN
  IF p_store_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'MISSING_STORE_ID', 'message', 'معرف المتجر مطلوب.');
  END IF;

  SELECT * INTO v_store FROM public.stores WHERE id = p_store_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'STORE_NOT_FOUND', 'message', 'المتجر غير موجود.');
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'EMPTY_ORDER_ITEMS', 'message', 'لا يمكن إنشاء طلب فارغ بدون أصناف.');
  END IF;

  -- 1. توحيد رقم جوال العميل عبر normalize_saudi_phone
  IF p_customer_phone IS NOT NULL AND BTRIM(p_customer_phone) <> '' THEN
    v_norm_phone := public.normalize_saudi_phone(p_customer_phone);
    IF v_norm_phone IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'INVALID_PHONE',
        'message', 'رقم الجوال غير صحيح. يرجى إدخال رقم جوال سعودي صحيح (مثال: 0551122334).'
      );
    END IF;
  END IF;

  -- 2. التحقق من هوية الكاشير/الموظف أو المشرف
  IF public.is_super_admin() OR auth.role() = 'service_role' OR public.is_valid_master_token(p_master_token) THEN
    v_is_staff_auth := TRUE;
    v_staff_name := 'الإدارة العليا';
  ELSIF public.has_store_access(p_store_id) THEN
    v_is_staff_auth := TRUE;
    v_staff_name := 'مدير المتجر';
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
        v_is_staff_auth := TRUE;
        SELECT name INTO v_staff_name FROM public.store_staff WHERE id::text = v_staff_id_str LIMIT 1;
      END IF;
    END IF;
  END IF;

  -- 3. تحديد مصدر الطلب وحالته ومنع أي تلاعب من المتصفح
  v_is_pos_order := (
    lower(COALESCE(p_order_source, '')) = 'pos' OR
    lower(COALESCE(p_status, '')) IN ('accepted', 'preparing', 'ready', 'completed') OR
    lower(COALESCE(p_payment_status, '')) = 'paid'
  );

  IF v_is_pos_order AND NOT v_is_staff_auth THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHORIZED_STAFF',
      'message', 'غير مصرح: لا يمكن إنشاء طلب مباشر مدفوع أو مكتمل بدون جلسة كاشير صالحة.'
    );
  END IF;

  IF v_is_pos_order AND v_is_staff_auth THEN
    v_final_source := COALESCE(NULLIF(BTRIM(p_order_source), ''), 'pos');
    v_final_status := lower(COALESCE(NULLIF(BTRIM(p_status), ''), 'completed'));
    v_final_payment_status := lower(COALESCE(NULLIF(BTRIM(p_payment_status), ''), 'paid'));
    v_final_payment_method := lower(COALESCE(NULLIF(BTRIM(p_payment_method), ''), 'cash'));
  ELSE
    -- طلب عميل عام من المتصفح: إجبار الحالة على pending و unpaid
    IF v_norm_phone IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'PHONE_REQUIRED',
        'message', 'رقم الجوال السعودي الصحيح مطلوب لإتمام الطلب.'
      );
    END IF;
    v_final_source := 'customer_app';
    v_final_status := 'pending';
    v_final_payment_status := 'unpaid';
    v_final_payment_method := lower(COALESCE(NULLIF(BTRIM(p_payment_method), ''), 'card'));
  END IF;

  -- 4. التحقق السيرفري الصارم من أسعار الأصناف والإضافات من جدول catalog_items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_id := COALESCE(
      v_item->>'id',
      v_item->>'item_id',
      v_item->'catalog_item'->>'id',
      ''
    );
    v_item_qty := GREATEST(1, COALESCE((v_item->>'quantity')::numeric, 1));

    SELECT * INTO v_cat_item
    FROM public.catalog_items
    WHERE store_id = p_store_id
      AND (id = v_item_id OR (v_item_id = '' AND name = COALESCE(v_item->>'name', v_item->>'item_name')))
    LIMIT 1;

    IF FOUND THEN
      IF COALESCE(v_cat_item.is_active, true) = FALSE OR COALESCE(v_cat_item.is_available, true) = FALSE THEN
        IF NOT v_is_staff_auth THEN
          RETURN jsonb_build_object(
            'success', false,
            'error', 'ITEM_UNAVAILABLE',
            'message', 'الصنف (' || v_cat_item.name || ') غير متاح حالياً.'
          );
        END IF;
      END IF;
      v_unit_price := COALESCE(v_cat_item.price, 0);

      -- حساب الإضافات (selected_modifiers) من كتالوج السيرفر إن وجدت
      v_mod_delta := 0;
      IF v_item ? 'selected_modifiers' AND jsonb_typeof(v_item->'selected_modifiers') = 'array' THEN
        FOR v_mod IN SELECT * FROM jsonb_array_elements(v_item->'selected_modifiers')
        LOOP
          v_db_mod_delta := NULL;
          IF v_cat_item.modifier_groups IS NOT NULL AND jsonb_typeof(v_cat_item.modifier_groups) = 'array' THEN
            SELECT COALESCE((opt->>'price_delta')::numeric, (opt->>'price')::numeric, 0)
            INTO v_db_mod_delta
            FROM jsonb_array_elements(v_cat_item.modifier_groups) grp,
                 jsonb_array_elements(COALESCE(grp->'options', '[]'::jsonb)) opt
            WHERE (opt->>'id' = COALESCE(v_mod->>'option_id', v_mod->>'id'))
               OR (opt->>'name' = COALESCE(v_mod->>'option_name', v_mod->>'name'))
            LIMIT 1;
          END IF;
          v_mod_delta := v_mod_delta + GREATEST(0, COALESCE(v_db_mod_delta, (v_mod->>'price_delta')::numeric, (v_mod->>'price')::numeric, 0));
        END LOOP;
      END IF;

      v_unit_price := v_unit_price + v_mod_delta;
      v_line_total := ROUND(v_unit_price * v_item_qty, 2);

      v_verified_items := v_verified_items || jsonb_build_array(
        v_item || jsonb_build_object(
          'id', v_cat_item.id,
          'name', v_cat_item.name,
          'quantity', v_item_qty,
          'price', v_unit_price,
          'unit_price', v_unit_price,
          'total_price', v_line_total,
          'server_verified', true
        )
      );
      v_server_subtotal := v_server_subtotal + v_line_total;
    ELSE
      -- إذا لم يكن الصنف في catalog_items: يُسمح به فقط للكاشير المصرح (مثل صنف سريع)، ويُرفض لطلبات المتصفح العامة
      IF NOT v_is_staff_auth THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'INVALID_CATALOG_ITEM',
          'message', 'أحد الأصناف المطلوبة غير مسجل في قائمة المتجر المعتمدة.'
        );
      END IF;
      v_unit_price := GREATEST(0, COALESCE((v_item->>'unit_price')::numeric, (v_item->>'price')::numeric, 0));
      v_line_total := ROUND(v_unit_price * v_item_qty, 2);
      v_verified_items := v_verified_items || jsonb_build_array(
        v_item || jsonb_build_object(
          'quantity', v_item_qty,
          'unit_price', v_unit_price,
          'total_price', v_line_total,
          'server_verified', false
        )
      );
      v_server_subtotal := v_server_subtotal + v_line_total;
    END IF;
  END LOOP;

  -- 5. حساب رسوم التوصيل والإجمالي النهائي والضريبة والنقاط سيرفرياً
  IF lower(COALESCE(p_fulfillment_type, 'dine_in')) = 'delivery' THEN
    v_delivery_fee := GREATEST(0, ROUND(COALESCE(p_delivery_fee, (p_fulfillment_details->>'delivery_fee')::numeric, 0), 2));
  ELSE
    v_delivery_fee := 0.00;
  END IF;

  v_final_total := ROUND(v_server_subtotal + v_delivery_fee, 2);
  v_tax_amount := ROUND(v_final_total - (v_final_total / 1.15), 2);
  v_points_earned := GREATEST(0, FLOOR(v_final_total * COALESCE(v_store.points_per_riyal, 1))::integer);

  -- 6. ربط الطلب بالوردية المفتوحة للكاشير إن وجدت
  IF v_active_shift_id IS NULL AND v_is_pos_order THEN
    SELECT id INTO v_active_shift_id
    FROM public.pos_shifts
    WHERE store_id = p_store_id
      AND status = 'open'
      AND (p_branch_id IS NULL OR branch_id IS NULL OR branch_id = p_branch_id)
    ORDER BY opened_at DESC
    LIMIT 1;
  END IF;

  -- 7. ربط أو تسجيل العميل في store_customers إذا كان رقم الجوال موجوداً
  IF v_norm_phone IS NOT NULL THEN
    SELECT * INTO v_customer
    FROM public.store_customers
    WHERE store_id = p_store_id AND phone = v_norm_phone
    FOR UPDATE;

    IF FOUND THEN
      v_customer_id := v_customer.id;
    ELSE
      INSERT INTO public.store_customers (
        store_id, phone, name, wallet_balance, lifetime_xp, tier, is_active, last_visit_date
      ) VALUES (
        p_store_id,
        v_norm_phone,
        COALESCE(NULLIF(BTRIM(p_customer_name), ''), 'عميل المتجر'),
        0, 0, 'bronze', true, now()
      )
      RETURNING * INTO v_customer;
      v_customer_id := v_customer.id;
    END IF;
  END IF;

  v_order_number := NULLIF(BTRIM(p_order_number), '');
  IF v_order_number IS NULL OR v_order_number !~ '^[A-Za-z0-9_-]{4,32}$'
     OR EXISTS (SELECT 1 FROM public.store_orders so WHERE so.store_id = p_store_id AND so.order_number = v_order_number) THEN
    v_order_number := 'ORD-' || upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 6));
  END IF;

  -- 8. منح نقاط الولاء ذرياً إذا كان الطلب مكتملاً/مدفوعاً من الكاشير
  IF v_is_pos_order AND (v_final_status = 'completed' OR v_final_payment_status = 'paid') AND v_norm_phone IS NOT NULL AND v_points_earned > 0 THEN
    v_points_awarded := TRUE;
    UPDATE public.store_customers
    SET
      wallet_balance = COALESCE(wallet_balance, 0) + v_points_earned,
      lifetime_xp = COALESCE(lifetime_xp, 0) + v_points_earned,
      last_visit_date = now()
    WHERE id = v_customer_id;
  END IF;

  -- 9. إدراج الطلب في store_orders
  INSERT INTO public.store_orders (
    store_id,
    branch_id,
    shift_id,
    order_number,
    customer_id,
    customer_name,
    customer_phone,
    order_type,
    fulfillment_type,
    table_number,
    items,
    subtotal,
    tax_amount,
    delivery_fee,
    total_price,
    total_amount,
    loyalty_points_earned,
    points_awarded,
    status,
    payment_status,
    payment_method,
    order_source,
    cashier_id,
    cashier_name,
    notes,
    fulfillment_details,
    delivery_address,
    delivery_status,
    created_at,
    updated_at
  ) VALUES (
    p_store_id,
    p_branch_id,
    v_active_shift_id,
    v_order_number,
    v_customer_id,
    COALESCE(NULLIF(BTRIM(p_customer_name), ''), 'عميل المتجر'),
    COALESCE(v_norm_phone, ''),
    CASE WHEN lower(COALESCE(p_fulfillment_type, 'dine_in')) IN ('dine_in', 'takeaway', 'delivery') THEN lower(p_fulfillment_type) ELSE 'dine_in' END,
    CASE WHEN lower(COALESCE(p_fulfillment_type, 'dine_in')) IN ('dine_in', 'takeaway', 'delivery') THEN lower(p_fulfillment_type) ELSE 'dine_in' END,
    p_table_number,
    v_verified_items,
    v_server_subtotal,
    v_tax_amount,
    v_delivery_fee,
    v_final_total,
    v_final_total,
    v_points_earned,
    v_points_awarded,
    v_final_status,
    v_final_payment_status,
    v_final_payment_method,
    v_final_source,
    v_staff_id_str,
    v_staff_name,
    COALESCE(p_notes, ''),
    COALESCE(p_fulfillment_details, '{}'::jsonb),
    p_delivery_address,
    CASE WHEN lower(COALESCE(p_fulfillment_type, '')) = 'delivery' THEN 'unassigned' ELSE NULL END,
    now(),
    now()
  )
  RETURNING * INTO v_inserted_order;

  -- 9.1 تحديث مجاميع الوردية الحية ذرياً إذا كان الطلب مرتبطاً بوردية مفتوحة ومدفوعاً
  IF v_active_shift_id IS NOT NULL AND v_final_payment_status = 'paid' THEN
    UPDATE public.pos_shifts
    SET
      orders_count = COALESCE(orders_count, 0) + 1,
      total_sales = ROUND(COALESCE(total_sales, 0) + v_final_total, 2),
      cash_sales = ROUND(COALESCE(cash_sales, 0) + CASE WHEN v_final_payment_method = 'cash' THEN v_final_total ELSE 0 END, 2),
      card_sales = ROUND(COALESCE(card_sales, 0) + CASE WHEN v_final_payment_method IN ('card', 'mada', 'credit_card', 'apple_pay', 'online') THEN v_final_total ELSE 0 END, 2),
      split_sales = ROUND(COALESCE(split_sales, 0) + CASE WHEN v_final_payment_method = 'split' THEN v_final_total ELSE 0 END, 2),
      tax_amount = ROUND(COALESCE(tax_amount, 0) + v_tax_amount, 2),
      expected_cash = ROUND(
        COALESCE(opening_cash, 0)
        + (COALESCE(cash_sales, 0) + CASE WHEN v_final_payment_method = 'cash' THEN v_final_total ELSE 0 END)
        - COALESCE(cash_refunds, 0)
        + COALESCE(total_cash_in, 0)
        - COALESCE(total_cash_out, 0),
        2
      ),
      updated_at = now()
    WHERE id = v_active_shift_id
      AND store_id = p_store_id
      AND lower(COALESCE(status, '')) = 'open';
  END IF;

  -- 10. تسجيل سجل تدقيق (audit_logs) إذا مُنحت نقاط الولاء مباشرة
  IF v_points_awarded AND v_customer_id IS NOT NULL THEN
    INSERT INTO public.audit_logs (
      store_id,
      staff_id,
      branch_id,
      customer_id,
      customer_phone,
      customer_name,
      action,
      purchase_amount,
      points_changed,
      entry_method,
      invoice_number,
      metadata
    ) VALUES (
      p_store_id,
      CASE WHEN v_staff_id_str ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN v_staff_id_str::uuid ELSE NULL END,
      p_branch_id,
      v_customer_id,
      v_norm_phone,
      COALESCE(NULLIF(BTRIM(p_customer_name), ''), 'عميل المتجر'),
      'PURCHASE',
      v_final_total,
      v_points_earned,
      'pos_order',
      v_order_number,
      jsonb_build_object(
        'order_id', v_inserted_order.id,
        'order_number', v_order_number,
        'cashier_name', COALESCE(v_staff_name, 'كاشير المتجر')
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order', to_jsonb(v_inserted_order),
    'server_total', v_final_total,
    'loyalty_points_earned', v_points_earned,
    'points_awarded', v_points_awarded
  );
END;
$$;


-- -----------------------------------------------------------------------------
-- 3.2 دالة تحديث حالة الطلب الذرية المؤمنة (update_store_order_status_secure)
-- تمنع أي تعديل لحالة الطلب أو الدفع إلا بتوكن موظف/كاشير صالح،
-- وتمنح نقاط الولاء ذرياً مرة واحدة فقط عند تحول الطلب إلى completed.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_store_order_status_secure(
  p_store_id UUID,
  p_order_id UUID,
  p_status TEXT DEFAULT NULL,
  p_payment_status TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL,
  p_driver_id TEXT DEFAULT NULL,
  p_driver_name TEXT DEFAULT NULL,
  p_driver_phone TEXT DEFAULT NULL,
  p_delivery_status TEXT DEFAULT NULL,
  p_cashier_name TEXT DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_staff_token TEXT DEFAULT NULL,
  p_master_token TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_is_auth BOOLEAN := FALSE;
  v_staff_store_id UUID := NULL;
  v_staff_id_str TEXT := NULL;
  v_staff_name TEXT := NULL;
  v_token TEXT := NULL;
  v_order RECORD;
  v_norm_phone TEXT := NULL;
  v_customer RECORD;
  v_new_status TEXT;
  v_points_just_awarded BOOLEAN := FALSE;
  v_updated_order RECORD;
BEGIN
  IF p_order_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'MISSING_ORDER_ID', 'message', 'معرف الطلب مطلوب.');
  END IF;

  SELECT * INTO v_order
  FROM public.store_orders
  WHERE id = p_order_id
    AND (p_store_id IS NULL OR store_id = p_store_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND', 'message', 'الطلب غير موجود.');
  END IF;

  -- 1. التحقق الصارم من صلاحية الموظف/الكاشير
  IF public.is_super_admin() OR auth.role() = 'service_role' OR public.is_valid_master_token(p_master_token) THEN
    v_is_auth := TRUE;
    v_staff_name := COALESCE(p_cashier_name, 'الإدارة العليا');
  ELSIF public.has_store_access(v_order.store_id) THEN
    v_is_auth := TRUE;
    v_staff_name := COALESCE(p_cashier_name, 'مدير المتجر');
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

      IF v_staff_store_id = v_order.store_id THEN
        v_is_auth := TRUE;
        SELECT name INTO v_staff_name FROM public.store_staff WHERE id::text = v_staff_id_str LIMIT 1;
      END IF;
    END IF;
  END IF;

  IF NOT v_is_auth THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHORIZED_STAFF',
      'message', 'غير مصرح: لا يمكن تعديل حالة الطلب أو الدفع إلا بتوكن موظف أو كاشير صالح.'
    );
  END IF;

  v_new_status := lower(COALESCE(NULLIF(BTRIM(p_status), ''), v_order.status));

  -- 2. منح نقاط الولاء ذرياً إذا تحول الطلب إلى completed ولم تُمنح من قبل
  IF v_new_status = 'completed'
     AND NOT COALESCE(v_order.points_awarded, false)
     AND COALESCE(v_order.loyalty_points_earned, 0) > 0
     AND v_order.customer_phone IS NOT NULL
     AND BTRIM(v_order.customer_phone) <> '' THEN

    v_norm_phone := COALESCE(public.normalize_saudi_phone(v_order.customer_phone), BTRIM(v_order.customer_phone));

    SELECT * INTO v_customer
    FROM public.store_customers
    WHERE store_id = v_order.store_id AND phone = v_norm_phone
    FOR UPDATE;

    IF NOT FOUND AND v_norm_phone ~ '^5[0-9]{8}$' THEN
      INSERT INTO public.store_customers (
        store_id, phone, name, wallet_balance, lifetime_xp, tier, is_active, last_visit_date
      ) VALUES (
        v_order.store_id,
        v_norm_phone,
        COALESCE(NULLIF(BTRIM(v_order.customer_name), ''), 'عميل المتجر'),
        0, 0, 'bronze', true, now()
      )
      RETURNING * INTO v_customer;
    END IF;

    IF v_customer.id IS NOT NULL THEN
      UPDATE public.store_customers
      SET
        wallet_balance = COALESCE(wallet_balance, 0) + v_order.loyalty_points_earned,
        lifetime_xp = COALESCE(lifetime_xp, 0) + v_order.loyalty_points_earned,
        last_visit_date = now()
      WHERE id = v_customer.id;

      v_points_just_awarded := TRUE;

      INSERT INTO public.audit_logs (
        store_id,
        staff_id,
        branch_id,
        customer_id,
        customer_phone,
        customer_name,
        action,
        purchase_amount,
        points_changed,
        entry_method,
        invoice_number,
        metadata
      ) VALUES (
        v_order.store_id,
        CASE WHEN v_staff_id_str ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN v_staff_id_str::uuid ELSE NULL END,
        COALESCE(p_branch_id, v_order.branch_id),
        v_customer.id,
        v_norm_phone,
        COALESCE(v_customer.name, v_order.customer_name, 'عميل المتجر'),
        'PURCHASE',
        COALESCE(v_order.total_price, v_order.total_amount, 0),
        v_order.loyalty_points_earned,
        'order_completed',
        v_order.order_number,
        jsonb_build_object(
          'order_id', v_order.id,
          'order_number', v_order.order_number,
          'cashier_name', COALESCE(p_cashier_name, v_staff_name, 'كاشير المتجر')
        )
      );
    END IF;
  END IF;

  -- 3. تحديث سجل الطلب
  UPDATE public.store_orders
  SET
    status = v_new_status,
    payment_status = COALESCE(NULLIF(BTRIM(p_payment_status), ''), CASE WHEN v_new_status = 'completed' THEN 'paid' ELSE payment_status END),
    payment_method = COALESCE(NULLIF(BTRIM(p_payment_method), ''), payment_method),
    driver_id = COALESCE(p_driver_id, driver_id),
    driver_name = COALESCE(p_driver_name, driver_name),
    driver_phone = COALESCE(p_driver_phone, driver_phone),
    delivery_status = COALESCE(p_delivery_status, delivery_status),
    points_awarded = COALESCE(points_awarded, false) OR v_points_just_awarded,
    updated_at = now()
  WHERE id = v_order.id
  RETURNING * INTO v_updated_order;

  RETURN jsonb_build_object(
    'success', true,
    'order', to_jsonb(v_updated_order),
    'points_awarded_now', v_points_just_awarded
  );
END;
$$;


-- -----------------------------------------------------------------------------
-- 3.3 دالة جلب طلبات العميل بصيغة جوال موحدة (get_customer_orders_secure)
-- تسمح للعميل باستعراض طلباته فقط دون فتح جدول store_orders بالكامل للعامة (anon)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_customer_orders_secure(
  p_store_id UUID,
  p_phone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_norm_phone TEXT;
  v_rows JSONB;
BEGIN
  IF p_store_id IS NULL OR p_phone IS NULL OR BTRIM(p_phone) = '' THEN
    RETURN '[]'::jsonb;
  END IF;

  v_norm_phone := public.normalize_saudi_phone(p_phone);
  IF v_norm_phone IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(o) ORDER BY o.created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT *
    FROM public.store_orders
    WHERE store_id = p_store_id
      AND COALESCE(public.normalize_saudi_phone(customer_phone), BTRIM(customer_phone)) = v_norm_phone
    ORDER BY created_at DESC
    LIMIT 50
  ) o;

  RETURN v_rows;
END;
$$;


-- -----------------------------------------------------------------------------
-- 3.4 دالة فتح أو استرجاع الوردية النشطة للكاشير (open_pos_shift_secure)
-- تمنع فتح أكثر من وردية نشطة (open) لنفس الكاشير في نفس المتجر في نفس الوقت.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_pos_shift_secure(
  p_store_id UUID,
  p_opening_cash NUMERIC DEFAULT 0,
  p_branch_id UUID DEFAULT NULL,
  p_branch_name TEXT DEFAULT 'الفرع الرئيسي',
  p_staff_id UUID DEFAULT NULL,
  p_staff_name TEXT DEFAULT 'كاشير المتجر',
  p_staff_phone TEXT DEFAULT NULL,
  p_staff_token TEXT DEFAULT NULL,
  p_master_token TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_is_auth BOOLEAN := FALSE;
  v_staff_store_id UUID := NULL;
  v_staff_id_str TEXT := NULL;
  v_token TEXT := NULL;
  v_resolved_staff_id UUID := p_staff_id;
  v_resolved_staff_name TEXT := COALESCE(NULLIF(BTRIM(p_staff_name), ''), 'كاشير المتجر');
  v_existing_shift RECORD;
  v_new_shift RECORD;
  v_lock_key BIGINT;
BEGIN
  IF p_store_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'MISSING_STORE_ID', 'message', 'معرف المتجر مطلوب.');
  END IF;

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
        IF v_resolved_staff_id IS NULL AND v_staff_id_str ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          v_resolved_staff_id := v_staff_id_str::uuid;
        END IF;
        SELECT COALESCE(name, v_resolved_staff_name) INTO v_resolved_staff_name
        FROM public.store_staff WHERE id::text = v_staff_id_str LIMIT 1;
      END IF;
    END IF;
  END IF;

  IF NOT v_is_auth THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHORIZED_STAFF',
      'message', 'غير مصرح: يتطلب فتح الوردية جلسة كاشير أو مدير صالحة.'
    );
  END IF;

  -- قفل استشاري لمنع سباق الطلبات المتزامنة (Race Condition) عند فتح الوردية
  v_lock_key := hashtext('pos_shift_open:' || p_store_id::text || ':' || COALESCE(v_resolved_staff_id::text, lower(v_resolved_staff_name)));
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- التحقق من وجود وردية مفتوحة حالياً لنفس الكاشير (أو الفرع)
  SELECT * INTO v_existing_shift
  FROM public.pos_shifts
  WHERE store_id = p_store_id
    AND status = 'open'
    AND (
      (v_resolved_staff_id IS NOT NULL AND staff_id = v_resolved_staff_id)
      OR (v_resolved_staff_id IS NULL AND lower(BTRIM(COALESCE(staff_name, ''))) = lower(v_resolved_staff_name))
    )
  ORDER BY opened_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_open', true,
      'message', 'يوجد وردية مفتوحة نشطة بالفعل لهذا الكاشير.',
      'shift', to_jsonb(v_existing_shift)
    );
  END IF;

  INSERT INTO public.pos_shifts (
    store_id,
    branch_id,
    branch_name,
    staff_id,
    staff_name,
    cashier_name,
    staff_phone,
    status,
    opened_at,
    opening_cash,
    expected_cash,
    actual_cash,
    cash_difference,
    total_sales,
    cash_sales,
    card_sales,
    split_sales,
    tax_amount,
    discount_amount,
    orders_count,
    total_refunds,
    cash_refunds,
    card_refunds,
    refunds_count,
    total_cash_in,
    total_cash_out,
    cash_movements_count,
    created_at,
    updated_at
  ) VALUES (
    p_store_id,
    p_branch_id,
    COALESCE(NULLIF(BTRIM(p_branch_name), ''), 'الفرع الرئيسي'),
    v_resolved_staff_id,
    v_resolved_staff_name,
    v_resolved_staff_name,
    p_staff_phone,
    'open',
    now(),
    GREATEST(0, COALESCE(p_opening_cash, 0)),
    GREATEST(0, COALESCE(p_opening_cash, 0)),
    0.00,
    0.00,
    0.00,
    0.00,
    0.00,
    0.00,
    0.00,
    0.00,
    0,
    0.00,
    0.00,
    0.00,
    0,
    0.00,
    0.00,
    0,
    now(),
    now()
  )
  RETURNING * INTO v_new_shift;

  RETURN jsonb_build_object(
    'success', true,
    'already_open', false,
    'shift', to_jsonb(v_new_shift)
  );
END;
$$;


-- -----------------------------------------------------------------------------
-- 3.5 دالة تسجيل الحركة النقدية الذرية (record_pos_cash_movement_secure)
-- تشترط وجود وردية مفتوحة فعلياً (status = 'open') وتوكن كاشير صالح،
-- وتحدث إجماليات الوردية ذرياً في نفس المعاملة.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_pos_cash_movement_secure(
  p_store_id UUID,
  p_shift_id UUID,
  p_type TEXT,
  p_amount NUMERIC,
  p_reason TEXT,
  p_category TEXT DEFAULT NULL,
  p_recipient_name TEXT DEFAULT NULL,
  p_invoice_ref TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_branch_name TEXT DEFAULT NULL,
  p_staff_id TEXT DEFAULT NULL,
  p_staff_name TEXT DEFAULT NULL,
  p_staff_token TEXT DEFAULT NULL,
  p_master_token TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_is_auth BOOLEAN := FALSE;
  v_staff_store_id UUID := NULL;
  v_staff_id_str TEXT := NULL;
  v_staff_name TEXT := COALESCE(NULLIF(BTRIM(p_staff_name), ''), 'كاشير المتجر');
  v_token TEXT := NULL;
  v_shift RECORD;
  v_clean_type TEXT := lower(BTRIM(COALESCE(p_type, '')));
  v_movement RECORD;
BEGIN
  IF p_store_id IS NULL OR p_shift_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'MISSING_SHIFT_ID', 'message', 'يجب ربط الحركة النقدية بوردية مفتوحة صالحة.');
  END IF;

  IF v_clean_type NOT IN ('cash_in', 'cash_out') THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_MOVEMENT_TYPE', 'message', 'نوع الحركة النقدية يجب أن يكون cash_in أو cash_out.');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT', 'message', 'مبلغ الحركة النقدية يجب أن يكون أكبر من صفر.');
  END IF;

  IF p_reason IS NULL OR BTRIM(p_reason) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'MISSING_REASON', 'message', 'سبب الحركة النقدية مطلوب.');
  END IF;

  -- 1. التحقق من صلاحية الكاشير
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
        SELECT COALESCE(name, v_staff_name) INTO v_staff_name
        FROM public.store_staff WHERE id::text = v_staff_id_str LIMIT 1;
      END IF;
    END IF;
  END IF;

  IF NOT v_is_auth THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHORIZED_STAFF',
      'message', 'غير مصرح: يتطلب تسجيل الحركة النقدية توكن كاشير صالح.'
    );
  END IF;

  -- 2. قفل الوردية والتحقق أنها مفتوحة فعلياً (open)
  SELECT * INTO v_shift
  FROM public.pos_shifts
  WHERE id = p_shift_id AND store_id = p_store_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SHIFT_NOT_FOUND', 'message', 'الوردية المحددة غير موجودة.');
  END IF;

  IF lower(COALESCE(v_shift.status, '')) <> 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', 'SHIFT_NOT_OPEN', 'message', 'لا يمكن تسجيل حركة نقدية على وردية مغلقة.');
  END IF;

  -- 3. إدراج الحركة النقدية
  INSERT INTO public.pos_cash_movements (
    store_id,
    branch_id,
    branch_name,
    shift_id,
    staff_id,
    staff_name,
    performed_by,
    type,
    movement_type,
    amount,
    reason,
    category,
    recipient_name,
    invoice_ref,
    notes,
    created_at
  ) VALUES (
    p_store_id,
    COALESCE(p_branch_id, v_shift.branch_id),
    COALESCE(p_branch_name, v_shift.branch_name, 'الفرع الرئيسي'),
    v_shift.id,
    COALESCE(v_staff_id_str, p_staff_id, v_shift.staff_id::text, ''),
    v_staff_name,
    v_staff_name,
    v_clean_type,
    v_clean_type,
    ROUND(p_amount, 2),
    BTRIM(p_reason),
    p_category,
    p_recipient_name,
    p_invoice_ref,
    p_notes,
    now()
  )
  RETURNING * INTO v_movement;

  -- 4. تحديث مجاميع الوردية ذرياً
  UPDATE public.pos_shifts
  SET
    total_cash_in = ROUND(COALESCE(total_cash_in, 0) + CASE WHEN v_clean_type = 'cash_in' THEN p_amount ELSE 0 END, 2),
    total_cash_out = ROUND(COALESCE(total_cash_out, 0) + CASE WHEN v_clean_type = 'cash_out' THEN p_amount ELSE 0 END, 2),
    cash_movements_count = COALESCE(cash_movements_count, 0) + 1,
    expected_cash = ROUND(
      COALESCE(opening_cash, 0)
      + COALESCE(cash_sales, 0)
      - COALESCE(cash_refunds, 0)
      + (COALESCE(total_cash_in, 0) + CASE WHEN v_clean_type = 'cash_in' THEN p_amount ELSE 0 END)
      - (COALESCE(total_cash_out, 0) + CASE WHEN v_clean_type = 'cash_out' THEN p_amount ELSE 0 END),
      2
    ),
    updated_at = now()
  WHERE id = v_shift.id;

  RETURN jsonb_build_object(
    'success', true,
    'movement', to_jsonb(v_movement)
  );
END;
$$;


-- -----------------------------------------------------------------------------
-- 3.6 دالة إغلاق الوردية وحساب الجرد الذري من قاعدة البيانات (close_pos_shift_secure)
-- تحسب expected_cash والعجز/الفائض والمبيعات والمرتجعات والحركات النقدية ذرياً من الجداول الفعلية
-- ولا تعتمد إطلاقاً على أرقام الملخص القادمة من الواجهة.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_pos_shift_secure(
  p_store_id UUID,
  p_shift_id UUID,
  p_actual_cash NUMERIC,
  p_notes TEXT DEFAULT NULL,
  p_staff_token TEXT DEFAULT NULL,
  p_master_token TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
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

  -- 3. حساب المبيعات الفعلية من جدول store_orders داخل السيرفر
  SELECT
    COUNT(*)::integer,
    ROUND(COALESCE(SUM(COALESCE(NULLIF(o.total_price, 0), o.total_amount, 0)), 0), 2),
    ROUND(COALESCE(SUM(CASE WHEN lower(COALESCE(o.payment_method, 'cash')) = 'cash' THEN COALESCE(NULLIF(o.total_price, 0), o.total_amount, 0) ELSE 0 END), 0), 2),
    ROUND(COALESCE(SUM(CASE WHEN lower(COALESCE(o.payment_method, 'cash')) IN ('card', 'mada', 'credit_card', 'apple_pay', 'online') THEN COALESCE(NULLIF(o.total_price, 0), o.total_amount, 0) ELSE 0 END), 0), 2),
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

  -- 4. حساب المرتجعات الفعلية من جدول pos_refunds داخل السيرفر
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

  -- 5. حساب الحركات النقدية الفعلية من جدول pos_cash_movements داخل السيرفر
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

  -- 6. معادلة النقد المتوقع والعجز/الفائض الذرية
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
$$;


-- -----------------------------------------------------------------------------
-- 3.7 دالة معالجة المرتجعات وسحب نقاط الولاء الذرية (process_pos_refund_atomic)
-- تقفل الطلب FOR UPDATE لمنع الاسترجاع المزدوج أو استرجاع مبلغ أكبر من المتبقي،
-- وتسحب نقاط الولاء الممنوحة ذرياً من العميل وتسجل قيد عكسي في audit_logs وتحدث الوردية.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_pos_refund_atomic(
  p_store_id UUID,
  p_order_id UUID,
  p_refund_items JSONB DEFAULT NULL,
  p_refund_type TEXT DEFAULT 'full',
  p_refund_reason TEXT DEFAULT 'استرجاع نقاط بيع',
  p_refund_method TEXT DEFAULT 'cash',
  p_notes TEXT DEFAULT NULL,
  p_shift_id UUID DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_branch_name TEXT DEFAULT NULL,
  p_cashier_id TEXT DEFAULT NULL,
  p_cashier_name TEXT DEFAULT NULL,
  p_zatca_qr TEXT DEFAULT NULL,
  p_staff_token TEXT DEFAULT NULL,
  p_master_token TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_is_auth BOOLEAN := FALSE;
  v_staff_store_id UUID := NULL;
  v_staff_id_str TEXT := NULL;
  v_staff_name TEXT := COALESCE(NULLIF(BTRIM(p_cashier_name), ''), 'كاشير المتجر');
  v_token TEXT := NULL;
  v_order RECORD;
  v_order_total NUMERIC(12,2);
  v_already_refunded NUMERIC(12,2);
  v_remaining_refundable NUMERIC(12,2);
  v_item JSONB;
  v_requested_refund NUMERIC(12,2) := 0.00;
  v_subtotal NUMERIC(12,2);
  v_tax_amount NUMERIC(12,2);
  v_new_total_refunded NUMERIC(12,2);
  v_is_now_full BOOLEAN;
  v_points_to_deduct INTEGER := 0;
  v_norm_phone TEXT := NULL;
  v_customer RECORD;
  v_credit_note_number TEXT;
  v_refund_record RECORD;
  v_history JSONB;
BEGIN
  IF p_store_id IS NULL OR p_order_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'MISSING_PARAMS', 'message', 'معرف المتجر والطلب مطلوبان لإتمام الاسترجاع.');
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
        SELECT COALESCE(name, v_staff_name) INTO v_staff_name
        FROM public.store_staff WHERE id::text = v_staff_id_str LIMIT 1;
      END IF;
    END IF;
  END IF;

  IF NOT v_is_auth THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHORIZED_STAFF',
      'message', 'غير مصرح: يتطلب استرجاع الفواتير جلسة كاشير أو مدير صالحة.'
    );
  END IF;

  -- 2. قفل سجل الطلب FOR UPDATE لمنع الاسترجاع المزدوج المتزامن
  SELECT * INTO v_order
  FROM public.store_orders
  WHERE id = p_order_id AND store_id = p_store_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND', 'message', 'الطلب غير موجود.');
  END IF;

  IF lower(COALESCE(v_order.status, '')) IN ('cancelled', 'refunded') OR lower(COALESCE(v_order.refund_status, '')) = 'full' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ORDER_ALREADY_REFUNDED',
      'message', 'تم استرجاع هذا الطلب بالكامل مسبقاً أو أنه ملغي.'
    );
  END IF;

  v_order_total := ROUND(COALESCE(NULLIF(v_order.total_price, 0), v_order.total_amount, 0), 2);
  v_already_refunded := ROUND(COALESCE(v_order.refunded_amount, 0), 2);
  v_remaining_refundable := ROUND(v_order_total - v_already_refunded, 2);

  IF v_remaining_refundable <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'NO_REFUNDABLE_BALANCE',
      'message', 'لا يوجد رصيد متبقٍ قابل للاسترجاع في هذه الفاتورة.'
    );
  END IF;

  -- 3. حساب مبلغ الاسترجاع المطلوب والتحقق أنه لا يتجاوز المتبقي من قيمة الفاتورة
  IF p_refund_items IS NOT NULL AND jsonb_typeof(p_refund_items) = 'array' AND jsonb_array_length(p_refund_items) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_refund_items)
    LOOP
      v_requested_refund := v_requested_refund + ROUND(
        COALESCE(
          (v_item->>'total_price')::numeric,
          COALESCE((v_item->>'unit_price')::numeric, (v_item->>'price')::numeric, 0) * COALESCE((v_item->>'quantity')::numeric, 1)
        ),
        2
      );
    END LOOP;
  ELSIF lower(COALESCE(p_refund_type, 'full')) = 'full' THEN
    v_requested_refund := v_remaining_refundable;
  END IF;

  v_requested_refund := ROUND(v_requested_refund, 2);

  IF v_requested_refund <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_REFUND_AMOUNT', 'message', 'مبلغ الاسترجاع يجب أن يكون أكبر من صفر.');
  END IF;

  IF v_requested_refund > v_remaining_refundable + 0.01 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'REFUND_EXCEEDS_REMAINING',
      'message', 'مبلغ الاسترجاع المطلوب (' || v_requested_refund || ' ر.س) يتجاوز المبلغ المتبقي القابل للاسترجاع (' || v_remaining_refundable || ' ر.س).'
    );
  END IF;

  IF v_requested_refund > v_remaining_refundable THEN
    v_requested_refund := v_remaining_refundable;
  END IF;

  v_subtotal := ROUND(v_requested_refund / 1.15, 2);
  v_tax_amount := ROUND(v_requested_refund - v_subtotal, 2);
  v_new_total_refunded := ROUND(v_already_refunded + v_requested_refund, 2);
  v_is_now_full := (v_new_total_refunded >= v_order_total - 0.01);

  -- 4. حساب وسحب نقاط الولاء الممنوحة ذرياً (Points Clawback)
  IF COALESCE(v_order.loyalty_points_earned, 0) > 0 AND COALESCE(v_order.points_awarded, true) THEN
    IF v_is_now_full THEN
      v_points_to_deduct := GREATEST(0, v_order.loyalty_points_earned - (
        SELECT COALESCE(SUM(loyalty_points_deducted), 0)::integer
        FROM public.pos_refunds
        WHERE order_id = v_order.id
      ));
    ELSE
      v_points_to_deduct := LEAST(
        ROUND((v_requested_refund / GREATEST(v_order_total, 1)) * v_order.loyalty_points_earned)::integer,
        GREATEST(0, v_order.loyalty_points_earned - (
          SELECT COALESCE(SUM(loyalty_points_deducted), 0)::integer
          FROM public.pos_refunds
          WHERE order_id = v_order.id
        ))
      );
    END IF;
  END IF;

  v_norm_phone := COALESCE(public.normalize_saudi_phone(v_order.customer_phone), NULLIF(BTRIM(v_order.customer_phone), ''));

  IF v_points_to_deduct > 0 AND (v_order.customer_id IS NOT NULL OR v_norm_phone IS NOT NULL) THEN
    SELECT * INTO v_customer
    FROM public.store_customers
    WHERE store_id = p_store_id
      AND (
        (v_order.customer_id IS NOT NULL AND id = v_order.customer_id)
        OR (v_norm_phone IS NOT NULL AND phone = v_norm_phone)
      )
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.store_customers
      SET
        wallet_balance = GREATEST(0, COALESCE(wallet_balance, 0) - v_points_to_deduct),
        lifetime_xp = GREATEST(0, COALESCE(lifetime_xp, 0) - v_points_to_deduct)
      WHERE id = v_customer.id;
    END IF;
  END IF;

  -- 5. إنشاء الإشعار الدائن في جدول pos_refunds
  v_credit_note_number := 'CN-' || replace(COALESCE(v_order.order_number, 'POS'), 'ORD-', '') || '-' || upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 4));

  INSERT INTO public.pos_refunds (
    store_id,
    branch_id,
    branch_name,
    order_id,
    order_number,
    credit_note_number,
    refund_type,
    refund_reason,
    refund_method,
    items,
    subtotal,
    tax_amount,
    total_refunded,
    loyalty_points_deducted,
    customer_id,
    customer_name,
    customer_phone,
    cashier_id,
    cashier_name,
    shift_id,
    zatca_qr,
    metadata,
    created_at
  ) VALUES (
    p_store_id,
    COALESCE(p_branch_id, v_order.branch_id),
    p_branch_name,
    v_order.id,
    v_order.order_number,
    v_credit_note_number,
    CASE WHEN v_is_now_full THEN 'full' ELSE 'partial' END,
    COALESCE(NULLIF(BTRIM(p_refund_reason), ''), 'استرجاع نقاط بيع') || CASE WHEN p_notes IS NOT NULL AND BTRIM(p_notes) <> '' THEN ' (' || BTRIM(p_notes) || ')' ELSE '' END,
    lower(COALESCE(NULLIF(BTRIM(p_refund_method), ''), 'cash')),
    COALESCE(p_refund_items, v_order.items, '[]'::jsonb),
    v_subtotal,
    v_tax_amount,
    v_requested_refund,
    v_points_to_deduct,
    COALESCE(v_customer.id, v_order.customer_id),
    v_order.customer_name,
    v_norm_phone,
    COALESCE(v_staff_id_str, p_cashier_id),
    v_staff_name,
    COALESCE(p_shift_id, v_order.shift_id),
    p_zatca_qr,
    jsonb_build_object(
      'original_payment_method', v_order.payment_method,
      'original_created_at', v_order.created_at,
      'notes', p_notes
    ),
    now()
  )
  RETURNING * INTO v_refund_record;

  -- 6. تسجيل قيد عكسي في سجل التدقيق (audit_logs) عند سحب النقاط
  IF v_points_to_deduct > 0 AND v_customer.id IS NOT NULL THEN
    INSERT INTO public.audit_logs (
      store_id,
      staff_id,
      branch_id,
      customer_id,
      customer_phone,
      customer_name,
      action,
      purchase_amount,
      points_changed,
      entry_method,
      invoice_number,
      metadata
    ) VALUES (
      p_store_id,
      CASE WHEN v_staff_id_str ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN v_staff_id_str::uuid ELSE NULL END,
      COALESCE(p_branch_id, v_order.branch_id),
      v_customer.id,
      v_norm_phone,
      COALESCE(v_customer.name, v_order.customer_name, 'عميل المتجر'),
      'ADJUSTMENT',
      -v_requested_refund,
      -v_points_to_deduct,
      'pos_refund_clawback',
      v_credit_note_number,
      jsonb_build_object(
        'sub_action', 'POINTS_CLAWBACK_POS_REFUND',
        'order_id', v_order.id,
        'order_number', v_order.order_number,
        'credit_note_number', v_credit_note_number,
        'refund_amount', v_requested_refund,
        'cashier_name', v_staff_name
      )
    );
  END IF;

  -- 7. تحديث حالة الفاتورة الأصلية في store_orders
  v_history := CASE WHEN jsonb_typeof(v_order.refund_history) = 'array' THEN v_order.refund_history ELSE '[]'::jsonb END;
  v_history := v_history || jsonb_build_array(
    jsonb_build_object(
      'credit_note_number', v_credit_note_number,
      'amount', v_requested_refund,
      'type', CASE WHEN v_is_now_full THEN 'full' ELSE 'partial' END,
      'reason', p_refund_reason,
      'method', lower(COALESCE(p_refund_method, 'cash')),
      'points_deducted', v_points_to_deduct,
      'date', now(),
      'cashier_name', v_staff_name
    )
  );

  UPDATE public.store_orders
  SET
    refund_status = CASE WHEN v_is_now_full THEN 'full' ELSE 'partial' END,
    refunded_amount = v_new_total_refunded,
    refund_history = v_history,
    status = CASE WHEN v_is_now_full THEN 'refunded' ELSE status END,
    updated_at = now()
  WHERE id = v_order.id;

  -- 8. تحديث مجاميع الوردية النشطة في pos_shifts إن وجدت
  IF COALESCE(p_shift_id, v_order.shift_id) IS NOT NULL THEN
    UPDATE public.pos_shifts
    SET
      total_refunds = ROUND(COALESCE(total_refunds, 0) + v_requested_refund, 2),
      cash_refunds = ROUND(COALESCE(cash_refunds, 0) + CASE WHEN lower(COALESCE(p_refund_method, 'cash')) = 'cash' THEN v_requested_refund ELSE 0 END, 2),
      card_refunds = ROUND(COALESCE(card_refunds, 0) + CASE WHEN lower(COALESCE(p_refund_method, 'cash')) <> 'cash' THEN v_requested_refund ELSE 0 END, 2),
      refunds_count = COALESCE(refunds_count, 0) + 1,
      expected_cash = ROUND(
        COALESCE(opening_cash, 0)
        + COALESCE(cash_sales, 0)
        - (COALESCE(cash_refunds, 0) + CASE WHEN lower(COALESCE(p_refund_method, 'cash')) = 'cash' THEN v_requested_refund ELSE 0 END)
        + COALESCE(total_cash_in, 0)
        - COALESCE(total_cash_out, 0),
        2
      ),
      updated_at = now()
    WHERE id = COALESCE(p_shift_id, v_order.shift_id)
      AND store_id = p_store_id
      AND lower(COALESCE(status, '')) = 'open';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'refund', to_jsonb(v_refund_record),
    'points_deducted', v_points_to_deduct,
    'new_refund_status', CASE WHEN v_is_now_full THEN 'full' ELSE 'partial' END,
    'new_total_refunded', v_new_total_refunded
  );
END;
$$;


-- -----------------------------------------------------------------------------
-- 3.8 دالة الحجز الذرية ومنع تعارض المواعيد (book_service_safely)
-- توحد رقم الجوال، وتتحقق من سعر الخدمة من catalog_items، وتقفل الأخصائي والتاريخ والوقت
-- ذرياً لمنع الحجز المزدوج لنفس الموعد.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.book_service_safely(
  p_store_id UUID,
  p_customer_id UUID DEFAULT NULL,
  p_customer_name TEXT DEFAULT 'عميل المتجر',
  p_customer_phone TEXT DEFAULT '',
  p_service_id TEXT DEFAULT 'srv-main',
  p_service_name TEXT DEFAULT 'خدمة',
  p_service_price NUMERIC DEFAULT 0,
  p_service_duration_minutes INTEGER DEFAULT 30,
  p_specialist_id TEXT DEFAULT NULL,
  p_specialist_name TEXT DEFAULT NULL,
  p_booking_date TEXT DEFAULT '',
  p_booking_time TEXT DEFAULT '',
  p_notes TEXT DEFAULT NULL,
  p_points_to_earn INTEGER DEFAULT 0,
  p_selected_modifiers JSONB DEFAULT '[]'::jsonb,
  p_branch_id UUID DEFAULT NULL,
  p_booking_source TEXT DEFAULT 'customer_app',
  p_status TEXT DEFAULT 'pending',
  p_staff_token TEXT DEFAULT NULL,
  p_master_token TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_store RECORD;
  v_norm_phone TEXT;
  v_clean_date DATE;
  v_clean_time TEXT;
  v_is_staff_auth BOOLEAN := FALSE;
  v_staff_store_id UUID := NULL;
  v_staff_id_str TEXT := NULL;
  v_token TEXT := NULL;
  v_clean_source TEXT;
  v_clean_status TEXT;
  v_cat_service RECORD;
  v_verified_price NUMERIC(12,2);
  v_verified_duration INTEGER;
  v_mod JSONB;
  v_mod_delta NUMERIC(12,2) := 0.00;
  v_points_earned INTEGER := 0;
  v_lock_key BIGINT;
  v_start_time TIMESTAMP;
  v_end_time TIMESTAMP;
  v_overlap_exists BOOLEAN := FALSE;
  v_customer RECORD;
  v_resolved_customer_id UUID := p_customer_id;
  v_booking_id TEXT;
  v_booking_number TEXT;
  v_new_booking RECORD;
BEGIN
  IF p_store_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'MISSING_STORE_ID', 'message', 'معرف المتجر مطلوب.');
  END IF;

  SELECT * INTO v_store FROM public.stores WHERE id = p_store_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'STORE_NOT_FOUND', 'message', 'المتجر غير موجود.');
  END IF;

  -- 1. توحيد رقم الجوال عبر normalize_saudi_phone
  v_norm_phone := public.normalize_saudi_phone(p_customer_phone);
  IF v_norm_phone IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_PHONE',
      'message', 'رقم الجوال غير صحيح. يرجى إدخال رقم جوال سعودي صحيح (مثال: 0551122334).'
    );
  END IF;

  -- 2. التحقق من التاريخ والوقت
  BEGIN
    v_clean_date := BTRIM(p_booking_date)::DATE;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_DATE', 'message', 'تاريخ الحجز غير صحيح.');
  END;

  v_clean_time := COALESCE(NULLIF(BTRIM(p_booking_time), ''), '12:00');

  -- 3. التحقق من صلاحية الكاشير إذا كان الحجز مباشراً بحالة confirmed/completed
  IF public.is_super_admin() OR auth.role() = 'service_role' OR public.is_valid_master_token(p_master_token) OR public.has_store_access(p_store_id) THEN
    v_is_staff_auth := TRUE;
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
        v_is_staff_auth := TRUE;
      END IF;
    END IF;
  END IF;

  v_clean_source := COALESCE(NULLIF(BTRIM(p_booking_source), ''), 'customer_app');
  IF v_is_staff_auth AND v_clean_source IN ('phone_call', 'walk_in', 'cashier') THEN
    v_clean_status := COALESCE(NULLIF(BTRIM(p_status), ''), 'confirmed');
  ELSE
    v_clean_source := 'customer_app';
    v_clean_status := 'pending';
  END IF;

  -- 4. التحقق السيرفري من سعر الخدمة من catalog_items
  SELECT * INTO v_cat_service
  FROM public.catalog_items
  WHERE store_id = p_store_id
    AND (id = p_service_id OR name = p_service_name)
  LIMIT 1;

  IF FOUND THEN
    v_verified_price := COALESCE(v_cat_service.price, 0);
    v_verified_duration := COALESCE(v_cat_service.duration_minutes, v_cat_service.execution_time_minutes, p_service_duration_minutes, 30);
  ELSE
    IF NOT v_is_staff_auth THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'INVALID_SERVICE',
        'message', 'الخدمة المطلوبة غير مسجلة في قائمة خدمات المتجر المعتمدة.'
      );
    END IF;
    v_verified_price := GREATEST(0, COALESCE(p_service_price, 0));
    v_verified_duration := GREATEST(5, COALESCE(p_service_duration_minutes, 30));
  END IF;

  IF p_selected_modifiers IS NOT NULL AND jsonb_typeof(p_selected_modifiers) = 'array' THEN
    FOR v_mod IN SELECT * FROM jsonb_array_elements(p_selected_modifiers)
    LOOP
      v_mod_delta := v_mod_delta + GREATEST(0, COALESCE((v_mod->>'price_delta')::numeric, (v_mod->>'price')::numeric, 0));
    END LOOP;
  END IF;

  v_verified_price := ROUND(v_verified_price + v_mod_delta, 2);
  v_points_earned := GREATEST(0, FLOOR(v_verified_price * COALESCE(v_store.points_per_riyal, 1))::integer);

  -- 5. قفل ذري وفحص تعارض المواعيد لنفس المختص في نفس التاريخ والوقت
  IF p_specialist_id IS NOT NULL AND BTRIM(p_specialist_id) <> '' THEN
    v_lock_key := hashtext('booking_lock:' || p_store_id::text || ':' || BTRIM(p_specialist_id) || ':' || v_clean_date::text);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- أ) فحص التطابق المباشر في التاريخ والوقت
    SELECT EXISTS (
      SELECT 1
      FROM public.service_bookings b
      WHERE b.store_id = p_store_id
        AND BTRIM(b.specialist_id) = BTRIM(p_specialist_id)
        AND b.booking_date = v_clean_date
        AND BTRIM(b.booking_time) = v_clean_time
        AND lower(COALESCE(b.status, '')) NOT IN ('cancelled', 'rejected', 'no_show')
    ) INTO v_overlap_exists;

    -- ب) فحص التداخل الزمني بالمدة (Duration Overlap) إذا كان الوقت بصيغة HH:MM
    IF NOT v_overlap_exists THEN
      BEGIN
        v_start_time := (v_clean_date::text || ' ' || v_clean_time)::TIMESTAMP;
        v_end_time := v_start_time + (v_verified_duration || ' minutes')::INTERVAL;

        SELECT EXISTS (
          SELECT 1
          FROM public.service_bookings b
          WHERE b.store_id = p_store_id
            AND BTRIM(b.specialist_id) = BTRIM(p_specialist_id)
            AND b.booking_date = v_clean_date
            AND lower(COALESCE(b.status, '')) NOT IN ('cancelled', 'rejected', 'no_show')
            AND ((b.booking_date::text || ' ' || BTRIM(b.booking_time))::TIMESTAMP < v_end_time)
            AND (((b.booking_date::text || ' ' || BTRIM(b.booking_time))::TIMESTAMP + (COALESCE(b.service_duration_minutes, 30) || ' minutes')::INTERVAL) > v_start_time)
        ) INTO v_overlap_exists;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;

    IF v_overlap_exists THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'BOOKING_CONFLICT',
        'message', 'نعتذر، هذا الموعد محجوز مسبقاً لدى الأخصائي المختار. يرجى اختيار موعد آخر.'
      );
    END IF;
  END IF;

  -- 6. ربط أو تسجيل العميل في store_customers بالرقم الموحد
  SELECT * INTO v_customer
  FROM public.store_customers
  WHERE store_id = p_store_id AND phone = v_norm_phone
  FOR UPDATE;

  IF FOUND THEN
    v_resolved_customer_id := v_customer.id;
  ELSE
    INSERT INTO public.store_customers (
      store_id, phone, name, wallet_balance, lifetime_xp, tier, is_active, last_visit_date
    ) VALUES (
      p_store_id,
      v_norm_phone,
      COALESCE(NULLIF(BTRIM(p_customer_name), ''), 'عميل المتجر'),
      0, 0, 'bronze', true, now()
    )
    RETURNING * INTO v_customer;
    v_resolved_customer_id := v_customer.id;
  END IF;

  v_booking_id := gen_random_uuid()::text;
  v_booking_number := 'BKG-' || upper(substring(replace(v_booking_id, '-', '') from 1 for 8));

  -- 7. إدراج الحجز في service_bookings
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
    points_to_earn,
    loyalty_points_earned,
    points_awarded,
    created_at,
    updated_at
  ) VALUES (
    v_booking_id,
    v_booking_number,
    p_store_id,
    p_branch_id,
    v_resolved_customer_id,
    COALESCE(NULLIF(BTRIM(p_customer_name), ''), 'عميل المتجر'),
    v_norm_phone,
    COALESCE(NULLIF(BTRIM(p_service_id), ''), 'srv-main'),
    COALESCE(v_cat_service.name, NULLIF(BTRIM(p_service_name), ''), 'خدمة'),
    v_verified_price,
    COALESCE(p_selected_modifiers, '[]'::jsonb),
    v_verified_duration,
    NULLIF(BTRIM(p_specialist_id), ''),
    p_specialist_name,
    v_clean_date,
    v_clean_time,
    v_clean_status,
    v_clean_source,
    p_notes,
    v_points_earned,
    v_points_earned,
    false,
    now(),
    now()
  )
  RETURNING * INTO v_new_booking;

  RETURN jsonb_build_object(
    'success', true,
    'booking', to_jsonb(v_new_booking)
  );
END;
$$;


-- -----------------------------------------------------------------------------
-- 3.9 دالة تحديث حالة الحجز الذرية المؤمنة (update_booking_status_secure)
-- تشترط توكن موظف صالح، وتتحقق من عدم وجود تعارض عند تأكيد الحجز،
-- وتمنح نقاط الولاء ذرياً مرة واحدة عند اكتمال الحجز (completed).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_booking_status_secure(
  p_token TEXT,
  p_booking_id TEXT,
  p_status TEXT,
  p_store_id UUID DEFAULT NULL,
  p_master_token TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_is_auth BOOLEAN := FALSE;
  v_staff_store_id UUID := NULL;
  v_staff_id_str TEXT := NULL;
  v_staff_name TEXT := 'كاشير المتجر';
  v_effective_token TEXT;
  v_booking RECORD;
  v_clean_status TEXT := lower(BTRIM(COALESCE(p_status, '')));
  v_conflict_exists BOOLEAN := FALSE;
  v_norm_phone TEXT;
  v_customer RECORD;
  v_points INTEGER := 0;
  v_points_awarded_now BOOLEAN := FALSE;
  v_updated_booking RECORD;
BEGIN
  IF p_booking_id IS NULL OR BTRIM(p_booking_id) = ''
     OR v_clean_status NOT IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show', 'rejected') THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT', 'message', 'بيانات تحديث الحجز غير صحيحة.');
  END IF;

  SELECT * INTO v_booking
  FROM public.service_bookings b
  WHERE (b.id = p_booking_id OR b.booking_number = p_booking_id)
    AND (p_store_id IS NULL OR b.store_id = p_store_id)
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND', 'message', 'الحجز غير موجود.');
  END IF;

  -- 1. التحقق من صلاحية الموظف/الكاشير
  IF public.is_super_admin() OR auth.role() = 'service_role' OR public.is_valid_master_token(p_master_token) OR public.has_store_access(v_booking.store_id) THEN
    v_is_auth := TRUE;
  ELSE
    v_effective_token := COALESCE(
      NULLIF(BTRIM(p_token), ''),
      NULLIF(current_setting('request.headers', true), '')::json->>'x-staff-token'
    );
    IF v_effective_token IS NOT NULL AND v_effective_token <> '' THEN
      SELECT s.store_id, s.staff_id
      INTO v_staff_store_id, v_staff_id_str
      FROM public._staff_session(v_effective_token, false) s
      LIMIT 1;
      IF v_staff_store_id = v_booking.store_id THEN
        v_is_auth := TRUE;
        SELECT COALESCE(name, v_staff_name) INTO v_staff_name
        FROM public.store_staff WHERE id::text = v_staff_id_str LIMIT 1;
      END IF;
    END IF;
  END IF;

  IF NOT v_is_auth THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED', 'message', 'غير مصرح: انتهت جلسة الدخول. سجّل الدخول مرة أخرى.');
  END IF;

  -- 2. فحص عدم وجود تعارض عند تأكيد الحجز (confirmed)
  IF v_clean_status = 'confirmed' AND v_booking.specialist_id IS NOT NULL AND BTRIM(v_booking.specialist_id) <> '' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.service_bookings b2
      WHERE b2.store_id = v_booking.store_id
        AND b2.id <> v_booking.id
        AND BTRIM(b2.specialist_id) = BTRIM(v_booking.specialist_id)
        AND b2.booking_date = v_booking.booking_date
        AND BTRIM(b2.booking_time) = BTRIM(v_booking.booking_time)
        AND lower(COALESCE(b2.status, '')) IN ('confirmed', 'in_progress')
    ) INTO v_conflict_exists;

    IF v_conflict_exists THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'BOOKING_CONFLICT',
        'message', 'لا يمكن تأكيد الحجز لوجود حجز آخر مؤكد لنفس الأخصائي في نفس التاريخ والوقت.'
      );
    END IF;
  END IF;

  -- 3. منح نقاط الولاء ذرياً عند اكتمال الحجز (completed)
  v_points := GREATEST(COALESCE(v_booking.loyalty_points_earned, 0), COALESCE(v_booking.points_to_earn, 0));
  IF v_clean_status = 'completed'
     AND NOT COALESCE(v_booking.points_awarded, false)
     AND v_points > 0
     AND v_booking.customer_phone IS NOT NULL THEN

    v_norm_phone := COALESCE(public.normalize_saudi_phone(v_booking.customer_phone), BTRIM(v_booking.customer_phone));
    SELECT * INTO v_customer
    FROM public.store_customers
    WHERE store_id = v_booking.store_id AND phone = v_norm_phone
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.store_customers
      SET
        wallet_balance = COALESCE(wallet_balance, 0) + v_points,
        lifetime_xp = COALESCE(lifetime_xp, 0) + v_points,
        last_visit_date = now()
      WHERE id = v_customer.id;

      v_points_awarded_now := TRUE;

      INSERT INTO public.audit_logs (
        store_id,
        staff_id,
        branch_id,
        customer_id,
        customer_phone,
        customer_name,
        action,
        event_type,
        purchase_amount,
        points_changed,
        entry_method,
        invoice_number,
        metadata
      ) VALUES (
        v_booking.store_id,
        CASE WHEN v_staff_id_str ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN v_staff_id_str::uuid ELSE NULL END,
        v_booking.branch_id,
        v_customer.id,
        v_norm_phone,
        COALESCE(v_customer.name, v_booking.customer_name, 'عميل المتجر'),
        'PURCHASE',
        'SERVICE_BOOKING',
        COALESCE(v_booking.service_price, 0),
        v_points,
        'booking_completed',
        v_booking.booking_number,
        jsonb_build_object(
          'booking_id', v_booking.id,
          'booking_number', v_booking.booking_number,
          'service_name', v_booking.service_name,
          'cashier_name', v_staff_name
        )
      );
    END IF;
  END IF;

  UPDATE public.service_bookings
  SET
    status = v_clean_status,
    points_awarded = COALESCE(points_awarded, false) OR v_points_awarded_now,
    updated_at = now()
  WHERE id = v_booking.id
  RETURNING * INTO v_updated_booking;

  RETURN jsonb_build_object(
    'success', true,
    'booking', to_jsonb(v_updated_booking),
    'points_awarded_now', v_points_awarded_now
  );
END;
$$;


-- -----------------------------------------------------------------------------
-- 3.10 تحديث دالة get_customer_bookings لاستخدام normalize_saudi_phone
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_customer_bookings(
  p_store_id UUID,
  p_phone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_norm_phone TEXT := public.normalize_saudi_phone(p_phone);
  v_rows JSONB;
BEGIN
  IF p_store_id IS NULL OR v_norm_phone IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT *
    FROM public.service_bookings
    WHERE store_id = p_store_id
      AND COALESCE(public.normalize_saudi_phone(customer_phone), BTRIM(customer_phone)) = v_norm_phone
    ORDER BY created_at DESC
    LIMIT 100
  ) b;

  RETURN v_rows;
END;
$$;


-- =============================================================================
-- القسم 4: تشديد سياسات RLS وصلاحيات الدوال (Grants & RLS Hardening)
-- =============================================================================

-- 4.1 تشديد سياسات store_orders: إغلاق الإدراج والقراءة المفتوحة للـ anon، وحصرها في الموظفين/أصحاب المتجر أو عبر الدوال المؤمنة
ALTER TABLE public.store_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "store_orders_insert_policy" ON public.store_orders;
CREATE POLICY "store_orders_insert_policy"
ON public.store_orders
FOR INSERT
TO anon, authenticated
WITH CHECK (
  public.has_valid_staff_access(store_id, false)
  OR public.has_store_access(store_id)
  OR public.is_super_admin()
);

DROP POLICY IF EXISTS "store_orders_select_policy" ON public.store_orders;
CREATE POLICY "store_orders_select_policy"
ON public.store_orders
FOR SELECT
TO anon, authenticated
USING (
  public.has_valid_staff_access(store_id, false)
  OR public.has_store_access(store_id)
  OR public.is_super_admin()
);

DROP POLICY IF EXISTS "store_orders_update_policy" ON public.store_orders;
CREATE POLICY "store_orders_update_policy"
ON public.store_orders
FOR UPDATE
TO anon, authenticated
USING (
  public.has_valid_staff_access(store_id, false)
  OR public.has_store_access(store_id)
  OR public.is_super_admin()
)
WITH CHECK (
  public.has_valid_staff_access(store_id, false)
  OR public.has_store_access(store_id)
  OR public.is_super_admin()
);

-- 4.2 تشديد سياسات pos_shifts, pos_cash_movements, pos_refunds, service_bookings
ALTER TABLE public.pos_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_bookings_staff_select_policy" ON public.service_bookings;
CREATE POLICY "service_bookings_staff_select_policy"
ON public.service_bookings
FOR SELECT
TO anon, authenticated
USING (
  public.has_valid_staff_access(store_id, false)
  OR public.has_store_access(store_id)
  OR public.is_super_admin()
);

-- 4.3 منح صلاحيات تنفيذ الدوال (Grants)
GRANT EXECUTE ON FUNCTION public.create_store_order_secure(uuid, jsonb, text, text, text, text, text, uuid, text, text, text, jsonb, numeric, text, text, uuid, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_store_order_status_secure(uuid, uuid, text, text, text, text, text, text, text, text, uuid, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_customer_orders_secure(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.open_pos_shift_secure(uuid, numeric, uuid, text, uuid, text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_pos_cash_movement_secure(uuid, uuid, text, numeric, text, text, text, text, text, uuid, text, text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_pos_shift_secure(uuid, uuid, numeric, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_pos_refund_atomic(uuid, uuid, jsonb, text, text, text, text, uuid, uuid, text, text, text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.book_service_safely(uuid, uuid, text, text, text, text, numeric, integer, text, text, text, text, text, integer, jsonb, uuid, text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_booking_status_secure(text, text, text, uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_customer_bookings(uuid, text) TO anon, authenticated, service_role;

COMMIT;
