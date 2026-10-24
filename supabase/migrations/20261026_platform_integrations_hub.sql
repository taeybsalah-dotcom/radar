-- ==============================================================================
-- ⚙️ PLATFORM INTEGRATIONS & API HUB (TELEGRAM, GEMINI AI, WHATSAPP)
-- Stores tenant/platform-owner proprietary API keys securely
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.platform_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Telegram Settings
    telegram_bot_token TEXT,
    telegram_admin_chat_id TEXT,
    telegram_enabled BOOLEAN NOT NULL DEFAULT false,
    
    -- Google Gemini AI Studio Settings
    gemini_api_key TEXT,
    gemini_model TEXT NOT NULL DEFAULT 'gemini-1.5-flash',
    gemini_enabled BOOLEAN NOT NULL DEFAULT false,
    
    -- WhatsApp Gateway Settings
    whatsapp_provider TEXT NOT NULL DEFAULT 'meta', -- 'meta', 'ultramsg', or 'custom'
    whatsapp_phone_number_id TEXT,
    whatsapp_waba_id TEXT,
    whatsapp_access_token TEXT,
    whatsapp_instance_id TEXT, -- For UltraMsg/Gateway
    whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,

    -- Meta / Auditing
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure only 1 active config row per tenant database
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_integrations_singleton ON public.platform_integrations ((true));

-- RLS Security: Only authenticated Super Admins can SELECT / UPDATE / INSERT
ALTER TABLE public.platform_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SuperAdmin Full Platform Integrations" ON public.platform_integrations;
CREATE POLICY "SuperAdmin Full Platform Integrations"
ON public.platform_integrations
FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- Allow service_role full access
DROP POLICY IF EXISTS "Service Role Platform Integrations" ON public.platform_integrations;
CREATE POLICY "Service Role Platform Integrations"
ON public.platform_integrations
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Insert singleton row if not exists
INSERT INTO public.platform_integrations (telegram_enabled, gemini_enabled, whatsapp_enabled)
VALUES (false, false, false)
ON CONFLICT DO NOTHING;
