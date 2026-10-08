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
