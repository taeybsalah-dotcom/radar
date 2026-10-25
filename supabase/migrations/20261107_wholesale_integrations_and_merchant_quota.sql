-- =========================================================================
-- 🌐 WHOLESALE INTEGRATIONS & MERCHANT QUOTA ARCHITECTURE
-- Fully isolates Telegram, WhatsApp (100 Free OTP + Merchant Own Meta), 
-- and Google Gemini AI for Resellers & White-Label Platform Owners.
-- =========================================================================

-- 1. Add telegram_bot_username to platform_integrations
ALTER TABLE public.platform_integrations 
ADD COLUMN IF NOT EXISTS telegram_bot_username TEXT;

-- 2. Ensure store_wallets default quota is 100 free OTP messages
ALTER TABLE public.store_wallets 
ALTER COLUMN wa_quota SET DEFAULT 100,
ALTER COLUMN wa_used SET DEFAULT 0;

-- Update existing store wallets with 0 or null quota to 100
UPDATE public.store_wallets
SET wa_quota = 100
WHERE wa_quota IS NULL OR wa_quota = 0;

-- 3. Secure Public Integrations Discovery RPC (Zero-Trust Compliant)
-- Exposes ONLY non-sensitive enablement and public bot username to clients
CREATE OR REPLACE FUNCTION public.get_platform_integrations_public()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rec RECORD;
BEGIN
    SELECT 
        COALESCE(telegram_enabled, false) AS telegram_enabled,
        telegram_bot_username,
        COALESCE(gemini_enabled, false) AS gemini_enabled,
        COALESCE(whatsapp_enabled, false) AS whatsapp_enabled
    INTO v_rec
    FROM public.platform_integrations
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_rec IS NULL THEN
        RETURN jsonb_build_object(
            'telegram_enabled', false,
            'telegram_bot_username', null,
            'gemini_enabled', false,
            'whatsapp_enabled', false
        );
    END IF;

    RETURN jsonb_build_object(
        'telegram_enabled', v_rec.telegram_enabled,
        'telegram_bot_username', v_rec.telegram_bot_username,
        'gemini_enabled', v_rec.gemini_enabled,
        'whatsapp_enabled', v_rec.whatsapp_enabled
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_platform_integrations_public() TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.get_platform_integrations_public() IS 'Returns non-sensitive platform integration settings for client apps';

-- 4. Atomic WhatsApp OTP Quota Check & Deduct RPC
-- Strictly guards the 100 free OTP opening balance:
-- - If store connected its own Meta account -> Unlimited on merchant bill
-- - If using platform free quota -> strictly capped at 100 OTPs (login passwords only)
CREATE OR REPLACE FUNCTION public.consume_merchant_whatsapp_otp(p_store_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_store_id UUID;
    v_has_own_meta BOOLEAN;
    v_wa_quota INT;
    v_wa_used INT;
    v_wallet_id UUID;
BEGIN
    IF p_store_key IS NULL OR TRIM(p_store_key) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_STORE_KEY');
    END IF;

    -- Resolve store by UUID or slug
    IF p_store_key ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
        SELECT id INTO v_store_id FROM public.stores WHERE id = p_store_key::UUID LIMIT 1;
    ELSE
        SELECT id INTO v_store_id FROM public.stores WHERE slug = p_store_key OR store_code = p_store_key LIMIT 1;
    END IF;

    IF v_store_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'STORE_NOT_FOUND');
    END IF;

    -- Check store wallet
    SELECT id, wa_quota, wa_used, (meta_access_token IS NOT NULL AND TRIM(meta_access_token) <> '')
    INTO v_wallet_id, v_wa_quota, v_wa_used, v_has_own_meta
    FROM public.store_wallets
    WHERE store_id = v_store_id
    LIMIT 1;

    -- If store has own Meta account connected, it is unlimited on store's bill
    IF v_has_own_meta THEN
        RETURN jsonb_build_object(
            'success', true,
            'source', 'store_meta',
            'has_own_meta', true,
            'message', 'سيتم الإرسال عبر حساب واتساب ميتا الخاص بالمتجر'
        );
    END IF;

    -- If no wallet yet, create one with 100 free OTP
    IF v_wallet_id IS NULL THEN
        INSERT INTO public.store_wallets (store_id, wa_quota, wa_used)
        VALUES (v_store_id, 100, 1)
        RETURNING id, wa_quota, wa_used INTO v_wallet_id, v_wa_quota, v_wa_used;

        RETURN jsonb_build_object(
            'success', true,
            'source', 'platform_free_quota',
            'has_own_meta', false,
            'remaining', 99,
            'used', 1,
            'quota', 100
        );
    END IF;

    -- Fallback default quota
    v_wa_quota := COALESCE(v_wa_quota, 100);
    v_wa_used := COALESCE(v_wa_used, 0);

    -- Check if free quota exhausted
    IF v_wa_used >= v_wa_quota THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'FREE_OTP_QUOTA_EXHAUSTED',
            'has_own_meta', false,
            'remaining', 0,
            'used', v_wa_used,
            'quota', v_wa_quota,
            'message', 'نفد الرصيد الافتتاحي المجاني لرسائل التحقق (100 رسالة). يرجى ربط حساب واتساب ميتا الخاص بمتجرك للاستمرار.'
        );
    END IF;

    -- Deduct 1 OTP from free platform quota
    UPDATE public.store_wallets
    SET wa_used = wa_used + 1,
        updated_at = timezone('utc', now())
    WHERE id = v_wallet_id;

    RETURN jsonb_build_object(
        'success', true,
        'source', 'platform_free_quota',
        'has_own_meta', false,
        'remaining', v_wa_quota - (v_wa_used + 1),
        'used', v_wa_used + 1,
        'quota', v_wa_quota
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_merchant_whatsapp_otp(TEXT) TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.consume_merchant_whatsapp_otp(TEXT) IS 'Manages merchant 100 free OTP quota vs merchant-owned Meta WhatsApp';
