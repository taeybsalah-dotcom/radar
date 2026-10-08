-- ==============================================================================
-- RADAR PLATFORM - MIGRATION: 20261008_fin03_fix_leads_rls_and_linkage.sql
-- Fix: Enable Anon Leads Insert & Select, Link Haf Million to Abdulsamee (r8526)
-- ==============================================================================

BEGIN;

-- 1. Safely remove any legacy foreign key constraint on merchant_leads.affiliate_id referencing missing 'affiliates' table
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'public.merchant_leads'::regclass 
          AND confrelid = 'public.affiliates'::regclass
    ) LOOP
        EXECUTE 'ALTER TABLE public.merchant_leads DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- 2. Ensure all lead tracking columns exist
ALTER TABLE public.merchant_leads ADD COLUMN IF NOT EXISTS affiliate_id UUID;
ALTER TABLE public.merchant_leads ADD COLUMN IF NOT EXISTS referral_code VARCHAR(50);
ALTER TABLE public.merchant_leads ADD COLUMN IF NOT EXISTS normalized_phone VARCHAR(20);
ALTER TABLE public.merchant_leads ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'NEW';
ALTER TABLE public.merchant_leads ADD COLUMN IF NOT EXISTS attribution_source VARCHAR(20) DEFAULT 'REFERRAL';
ALTER TABLE public.merchant_leads ADD COLUMN IF NOT EXISTS converted_store_id UUID;

-- 3. Enable RLS and Grant Permissions to anon & authenticated
ALTER TABLE public.merchant_leads ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.merchant_leads TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.merchant_leads TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.merchant_leads TO anon;

-- Public leads submission from /join
DROP POLICY IF EXISTS "merchant_leads_anon_insert_policy" ON public.merchant_leads;
CREATE POLICY "merchant_leads_anon_insert_policy" ON public.merchant_leads
    FOR INSERT TO anon
    WITH CHECK (true);

-- Partner reading their assigned leads in PartnerDashboard
DROP POLICY IF EXISTS "merchant_leads_anon_select_policy" ON public.merchant_leads;
CREATE POLICY "merchant_leads_anon_select_policy" ON public.merchant_leads
    FOR SELECT TO anon
    USING (true);

-- Updating converted store leads
DROP POLICY IF EXISTS "merchant_leads_anon_update_policy" ON public.merchant_leads;
CREATE POLICY "merchant_leads_anon_update_policy" ON public.merchant_leads
    FOR UPDATE TO anon
    USING (true)
    WITH CHECK (true);

-- Authenticated SuperAdmin / Staff
DROP POLICY IF EXISTS "merchant_leads_auth_all_policy" ON public.merchant_leads;
CREATE POLICY "merchant_leads_auth_all_policy" ON public.merchant_leads
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- 4. Link Existing Store "هاف مليون" to Partner "عبدالسميع" (r8526)
DO $$
DECLARE
    v_partner RECORD;
    v_store RECORD;
    v_lead_id UUID;
BEGIN
    -- أ. البحث عن الشريك عبدالسميع بكود r8526 أو اسمه
    SELECT * INTO v_partner 
    FROM public.partner_accounts 
    WHERE lower(referral_code) = 'r8526' 
       OR lower(slug) = 'r8526' 
       OR display_name LIKE '%عبدالسميع%'
    LIMIT 1;

    -- ب. البحث عن متجر هاف مليون
    SELECT * INTO v_store 
    FROM public.stores 
    WHERE slug = 'haf-mlywn' 
       OR name LIKE '%هاف مليون%' 
       OR manager_contact = '0516677810'
    LIMIT 1;

    IF v_store.id IS NOT NULL AND v_partner.id IS NOT NULL THEN
        -- فحص هل يوجد lead مسجل للمتجر مسبقاً
        SELECT id INTO v_lead_id 
        FROM public.merchant_leads 
        WHERE converted_store_id = v_store.id 
           OR phone = '0516677810' 
           OR normalized_phone = '0516677810'
        LIMIT 1;

        IF v_lead_id IS NOT NULL THEN
            UPDATE public.merchant_leads
            SET 
                affiliate_id = v_partner.id,
                referral_code = 'r8526',
                converted_store_id = v_store.id,
                store_name = 'هاف مليون',
                manager_name = COALESCE(v_store.manager_name, 'إبراهيم علي'),
                phone = '0516677810',
                normalized_phone = '0516677810',
                status = 'CONVERTED',
                attribution_source = 'REFERRAL',
                notes = 'تم ربط المتجر بالشريك عبدالسميع (r8526)',
                updated_at = clock_timestamp()
            WHERE id = v_lead_id;
        ELSE
            INSERT INTO public.merchant_leads (
                store_name,
                manager_name,
                phone,
                normalized_phone,
                attribution_source,
                referral_code,
                affiliate_id,
                status,
                converted_store_id,
                notes,
                created_at,
                updated_at
            ) VALUES (
                'هاف مليون',
                COALESCE(v_store.manager_name, 'إبراهيم علي'),
                '0516677810',
                '0516677810',
                'REFERRAL',
                'r8526',
                v_partner.id,
                'CONVERTED',
                v_store.id,
                'تم ربط المتجر بالشريك عبدالسميع (r8526)',
                clock_timestamp(),
                clock_timestamp()
            );
        END IF;

        RAISE NOTICE 'تم ربط متجر هاف مليون (ID: %) بالشريك عبدالسميع (ID: %) بنجاح!', v_store.id, v_partner.id;
    END IF;
END $$;

COMMIT;
