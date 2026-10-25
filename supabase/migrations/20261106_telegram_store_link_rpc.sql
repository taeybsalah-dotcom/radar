-- =========================================================================
-- 🤖 RPC: Secure Telegram Store Linking (Zero-Trust Compliant)
-- Allows Telegram Bot Webhook to safely link stores by UUID or Slug
-- without opening direct UPDATE permissions on stores table for anon
-- =========================================================================

CREATE OR REPLACE FUNCTION public.link_store_telegram(
    p_store_key TEXT,
    p_chat_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_store_id UUID;
    v_store_name TEXT;
    v_store_slug TEXT;
BEGIN
    p_store_key := trim(p_store_key);
    p_chat_id := trim(p_chat_id);

    IF p_store_key IS NULL OR p_store_key = '' OR p_chat_id IS NULL OR p_chat_id = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_PARAMETERS');
    END IF;

    -- Clean any prefix if passed e.g. store_
    IF p_store_key ILIKE 'store_%' THEN
        p_store_key := substring(p_store_key FROM 7);
    END IF;

    -- Find store by UUID or slug
    IF p_store_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        SELECT id, name, slug INTO v_store_id, v_store_name, v_store_slug
        FROM public.stores
        WHERE id = p_store_key::uuid
        LIMIT 1;
    ELSE
        SELECT id, name, slug INTO v_store_id, v_store_name, v_store_slug
        FROM public.stores
        WHERE lower(slug) = lower(p_store_key)
        LIMIT 1;
    END IF;

    IF v_store_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'STORE_NOT_FOUND');
    END IF;

    -- Safely update store with telegram chat id and enable notifications
    UPDATE public.stores
    SET 
        telegram_chat_id = p_chat_id,
        telegram_notifications_enabled = true,
        updated_at = timezone('utc', now())
    WHERE id = v_store_id;

    RETURN jsonb_build_object(
        'success', true,
        'store_id', v_store_id,
        'store_name', v_store_name,
        'store_slug', v_store_slug
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_store_telegram(TEXT, TEXT) TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.link_store_telegram(TEXT, TEXT) IS 'Atomic RPC for linking Telegram Bot Chat ID to a merchant store securely';
