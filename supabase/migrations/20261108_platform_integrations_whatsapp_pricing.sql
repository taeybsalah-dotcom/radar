-- =========================================================================
-- ⚡ ADD WHATSAPP TIER 1000 PRICING COLUMN TO PLATFORM INTEGRATIONS
-- Allows Super Admin to dynamically customize the 1,000-message pack price.
-- =========================================================================

-- 1. Add whatsapp_tier_1000_price column with default 150 SAR
ALTER TABLE public.platform_integrations 
ADD COLUMN IF NOT EXISTS whatsapp_tier_1000_price NUMERIC DEFAULT 150;

-- 2. Update get_platform_integrations_public RPC to return the custom price safely
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
        COALESCE(whatsapp_tier_1000_price, 150) AS whatsapp_tier_1000_price
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
            'whatsapp_tier_1000_price', 150
        );
    END IF;

    RETURN jsonb_build_object(
        'telegram_enabled', v_rec.telegram_enabled,
        'telegram_bot_username', v_rec.telegram_bot_username,
        'gemini_enabled', v_rec.gemini_enabled,
        'whatsapp_enabled', v_rec.whatsapp_enabled,
        'whatsapp_tier_1000_price', v_rec.whatsapp_tier_1000_price
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_platform_integrations_public() TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.get_platform_integrations_public() IS 'Returns non-sensitive platform integration settings for client apps including whatsapp pack price';

-- 3. Notify PostgREST to reload schema cache immediately
NOTIFY pgrst, 'reload schema';
