-- =========================================================================
-- 📱 PLATFORM APPLE WALLET & GOOGLE WALLET CREDENTIALS INFRASTRUCTURE
-- Enables platform owner to configure official Apple PassKit and Google Wallet
-- credentials for white-label multi-tenant pass generation.
-- =========================================================================

-- 1. Apple Wallet Gateway Credentials
ALTER TABLE public.platform_integrations 
ADD COLUMN IF NOT EXISTS apple_wallet_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS apple_pass_type_id TEXT,
ADD COLUMN IF NOT EXISTS apple_team_id TEXT,
ADD COLUMN IF NOT EXISTS apple_cert_p12_base64 TEXT,
ADD COLUMN IF NOT EXISTS apple_cert_password TEXT;

-- 2. Google Wallet Gateway Credentials
ALTER TABLE public.platform_integrations 
ADD COLUMN IF NOT EXISTS google_wallet_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS google_issuer_id TEXT,
ADD COLUMN IF NOT EXISTS google_client_email TEXT,
ADD COLUMN IF NOT EXISTS google_private_key TEXT;

-- 3. Update get_platform_integrations_public RPC (Zero-Trust Compliant: ONLY non-sensitive flags & public IDs)
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
        COALESCE(whatsapp_enabled, false) AS whatsapp_enabled,
        COALESCE(whatsapp_tier_1000_price, 150) AS whatsapp_tier_1000_price,
        COALESCE(apple_wallet_enabled, false) AS apple_wallet_enabled,
        apple_pass_type_id,
        COALESCE(google_wallet_enabled, false) AS google_wallet_enabled,
        google_issuer_id
    INTO v_rec
    FROM public.platform_integrations
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_rec IS NULL THEN
        RETURN jsonb_build_object(
            'telegram_enabled', false,
            'telegram_bot_username', null,
            'gemini_enabled', false,
            'whatsapp_enabled', false,
            'whatsapp_tier_1000_price', 150,
            'apple_wallet_enabled', false,
            'apple_pass_type_id', null,
            'google_wallet_enabled', false,
            'google_issuer_id', null
        );
    END IF;

    RETURN jsonb_build_object(
        'telegram_enabled', v_rec.telegram_enabled,
        'telegram_bot_username', v_rec.telegram_bot_username,
        'gemini_enabled', v_rec.gemini_enabled,
        'whatsapp_enabled', v_rec.whatsapp_enabled,
        'whatsapp_tier_1000_price', v_rec.whatsapp_tier_1000_price,
        'apple_wallet_enabled', v_rec.apple_wallet_enabled,
        'apple_pass_type_id', v_rec.apple_pass_type_id,
        'google_wallet_enabled', v_rec.google_wallet_enabled,
        'google_issuer_id', v_rec.google_issuer_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_platform_integrations_public() TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.get_platform_integrations_public() IS 'Returns non-sensitive platform integration settings for client apps';

-- 4. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
