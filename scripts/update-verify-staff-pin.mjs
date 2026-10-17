import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

async function run() {
  await client.connect();
  console.log('Connected to Postgres.');

  const sql = `
CREATE OR REPLACE FUNCTION public.verify_staff_pin(
    p_phone text,
    p_pin text,
    p_store_id uuid DEFAULT NULL::uuid,
    p_store_slug text DEFAULT NULL::text,
    p_required_role text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
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
        SELECT id, store_id, branch_id, user_id, name, phone, role, pin_code, is_active, can_manual_input_phone
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
$func$;
  `;

  await client.query(sql);
  console.log('Successfully updated verify_staff_pin function to return branch_id!');
  await client.end();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
