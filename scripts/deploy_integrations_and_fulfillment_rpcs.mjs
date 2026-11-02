import pg from 'pg';
const { Client } = pg;
const PG_CONNECTION_STRING = 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres';

const SQL = `
-- ==============================================================================
-- 1. SAVE_PLATFORM_INTEGRATIONS_SECURE
-- Allows Super Admin to save cloud keys and integrations safely via SECURITY DEFINER
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.save_platform_integrations_secure(p_config jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $func_save_int$
DECLARE
    v_id uuid;
    v_rec public.platform_integrations%ROWTYPE;
BEGIN
    IF p_config IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'CONFIG_REQUIRED');
    END IF;

    -- Find existing row
    SELECT id INTO v_id FROM public.platform_integrations ORDER BY created_at DESC LIMIT 1;

    IF v_id IS NOT NULL THEN
        UPDATE public.platform_integrations
        SET 
            telegram_bot_token = COALESCE(p_config->>'telegram_bot_token', telegram_bot_token),
            telegram_admin_chat_id = COALESCE(p_config->>'telegram_admin_chat_id', telegram_admin_chat_id),
            telegram_enabled = COALESCE((p_config->>'telegram_enabled')::boolean, telegram_enabled),
            telegram_bot_username = COALESCE(p_config->>'telegram_bot_username', telegram_bot_username),
            gemini_api_key = COALESCE(p_config->>'gemini_api_key', gemini_api_key),
            gemini_model = COALESCE(p_config->>'gemini_model', gemini_model),
            gemini_enabled = COALESCE((p_config->>'gemini_enabled')::boolean, gemini_enabled),
            whatsapp_provider = COALESCE(p_config->>'whatsapp_provider', whatsapp_provider),
            whatsapp_phone_number_id = COALESCE(p_config->>'whatsapp_phone_number_id', whatsapp_phone_number_id),
            whatsapp_waba_id = COALESCE(p_config->>'whatsapp_waba_id', whatsapp_waba_id),
            whatsapp_access_token = COALESCE(p_config->>'whatsapp_access_token', whatsapp_access_token),
            whatsapp_instance_id = COALESCE(p_config->>'whatsapp_instance_id', whatsapp_instance_id),
            whatsapp_enabled = COALESCE((p_config->>'whatsapp_enabled')::boolean, whatsapp_enabled),
            whatsapp_tier_1000_price = COALESCE((p_config->>'whatsapp_tier_1000_price')::numeric, whatsapp_tier_1000_price),
            apple_wallet_enabled = COALESCE((p_config->>'apple_wallet_enabled')::boolean, apple_wallet_enabled),
            apple_pass_type_id = COALESCE(p_config->>'apple_pass_type_id', apple_pass_type_id),
            apple_team_id = COALESCE(p_config->>'apple_team_id', apple_team_id),
            apple_cert_p12_base64 = COALESCE(p_config->>'apple_cert_p12_base64', apple_cert_p12_base64),
            apple_cert_password = COALESCE(p_config->>'apple_cert_password', apple_cert_password),
            google_wallet_enabled = COALESCE((p_config->>'google_wallet_enabled')::boolean, google_wallet_enabled),
            google_issuer_id = COALESCE(p_config->>'google_issuer_id', google_issuer_id),
            google_client_email = COALESCE(p_config->>'google_client_email', google_client_email),
            google_private_key = COALESCE(p_config->>'google_private_key', google_private_key),
            updated_at = clock_timestamp()
        WHERE id = v_id
        RETURNING * INTO v_rec;
    ELSE
        INSERT INTO public.platform_integrations (
            telegram_bot_token,
            telegram_admin_chat_id,
            telegram_enabled,
            telegram_bot_username,
            gemini_api_key,
            gemini_model,
            gemini_enabled,
            whatsapp_provider,
            whatsapp_phone_number_id,
            whatsapp_waba_id,
            whatsapp_access_token,
            whatsapp_instance_id,
            whatsapp_enabled,
            whatsapp_tier_1000_price,
            apple_wallet_enabled,
            apple_pass_type_id,
            apple_team_id,
            apple_cert_p12_base64,
            apple_cert_password,
            google_wallet_enabled,
            google_issuer_id,
            google_client_email,
            google_private_key,
            created_at,
            updated_at
        ) VALUES (
            p_config->>'telegram_bot_token',
            p_config->>'telegram_admin_chat_id',
            COALESCE((p_config->>'telegram_enabled')::boolean, false),
            p_config->>'telegram_bot_username',
            p_config->>'gemini_api_key',
            COALESCE(p_config->>'gemini_model', 'gemini-1.5-flash'),
            COALESCE((p_config->>'gemini_enabled')::boolean, false),
            COALESCE(p_config->>'whatsapp_provider', 'meta_cloud'),
            p_config->>'whatsapp_phone_number_id',
            p_config->>'whatsapp_waba_id',
            p_config->>'whatsapp_access_token',
            p_config->>'whatsapp_instance_id',
            COALESCE((p_config->>'whatsapp_enabled')::boolean, false),
            COALESCE((p_config->>'whatsapp_tier_1000_price')::numeric, 150),
            COALESCE((p_config->>'apple_wallet_enabled')::boolean, false),
            p_config->>'apple_pass_type_id',
            p_config->>'apple_team_id',
            p_config->>'apple_cert_p12_base64',
            p_config->>'apple_cert_password',
            COALESCE((p_config->>'google_wallet_enabled')::boolean, false),
            p_config->>'google_issuer_id',
            p_config->>'google_client_email',
            p_config->>'google_private_key',
            clock_timestamp(),
            clock_timestamp()
        )
        RETURNING * INTO v_rec;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'bot_username', v_rec.telegram_bot_username,
        'updated_at', v_rec.updated_at
    );
END;
$func_save_int$;

GRANT EXECUTE ON FUNCTION public.save_platform_integrations_secure(jsonb) TO anon, authenticated, service_role;

-- ==============================================================================
-- 2. GET_PLATFORM_INTEGRATIONS_SECURE
-- Full reading RPC for Master Control / Super Admin
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_platform_integrations_secure()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $func_get_int$
DECLARE
    v_rec public.platform_integrations%ROWTYPE;
BEGIN
    SELECT * INTO v_rec FROM public.platform_integrations ORDER BY created_at DESC LIMIT 1;
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'telegram_enabled', false,
            'telegram_bot_username', null,
            'gemini_enabled', false,
            'whatsapp_enabled', false,
            'whatsapp_tier_1000_price', 150,
            'apple_wallet_enabled', false,
            'google_wallet_enabled', false
        );
    END IF;

    RETURN to_jsonb(v_rec);
END;
$func_get_int$;

GRANT EXECUTE ON FUNCTION public.get_platform_integrations_secure() TO anon, authenticated, service_role;

-- ==============================================================================
-- 3. UPDATE_STORE_FULFILLMENT_SETTINGS
-- Flexible store identifier (UUID or Slug) + Deep JSONB merging
-- ==============================================================================
DROP FUNCTION IF EXISTS public.update_store_fulfillment_settings(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.update_store_fulfillment_settings(
    p_store_id text,
    p_fulfillment_settings jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $func_store_fulfill$
DECLARE
    v_clean TEXT;
    v_target_id UUID;
    v_existing_settings JSONB;
    v_merged JSONB;
    v_updated RECORD;
BEGIN
    IF p_store_id IS NULL OR TRIM(p_store_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'STORE_ID_REQUIRED');
    END IF;

    IF p_fulfillment_settings IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'SETTINGS_REQUIRED');
    END IF;

    v_clean := TRIM(p_store_id);

    -- Find store by UUID or Slug
    SELECT id, COALESCE(fulfillment_settings, '{}'::jsonb)
    INTO v_target_id, v_existing_settings
    FROM public.stores
    WHERE id::text = v_clean OR LOWER(slug) = LOWER(v_clean)
    LIMIT 1;

    IF v_target_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'STORE_NOT_FOUND');
    END IF;

    -- Deep merge wallet_pass_config if present
    IF p_fulfillment_settings ? 'wallet_pass_config' THEN
        v_merged := v_existing_settings || p_fulfillment_settings;
        v_merged := jsonb_set(
            v_merged,
            '{wallet_pass_config}',
            COALESCE(v_existing_settings->'wallet_pass_config', '{}'::jsonb) || (p_fulfillment_settings->'wallet_pass_config')
        );
    ELSE
        v_merged := v_existing_settings || p_fulfillment_settings;
    END IF;

    UPDATE public.stores
    SET fulfillment_settings = v_merged,
        updated_at = clock_timestamp()
    WHERE id = v_target_id
    RETURNING id, slug, name, fulfillment_settings INTO v_updated;

    RETURN jsonb_build_object(
        'success', true,
        'store_id', v_updated.id,
        'slug', v_updated.slug,
        'fulfillment_settings', v_updated.fulfillment_settings
    );
END;
$func_store_fulfill$;

GRANT EXECUTE ON FUNCTION public.update_store_fulfillment_settings(text, jsonb) TO anon, authenticated, service_role;
`;

async function deploy() {
  const client = new Client(PG_CONNECTION_STRING);
  try {
    await client.connect();
    console.log('Connected to PostgreSQL. Applying migration...');
    await client.query(SQL);
    console.log('Migration applied successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.end();
  }
}

deploy();
