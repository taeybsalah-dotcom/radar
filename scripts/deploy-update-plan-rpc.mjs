import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

async function main() {
  await client.connect();
  console.log('Connected to DB');

  // 1. Drop existing overloaded functions
  await client.query(`
    DROP FUNCTION IF EXISTS public.update_billing_plan_atomic(text, text, text, numeric, integer, integer, text[], boolean);
    DROP FUNCTION IF EXISTS public.update_billing_plan_atomic(text, text, text, numeric, numeric, numeric, numeric, numeric, integer, text, text, integer, jsonb, jsonb, integer, boolean);
    DROP FUNCTION IF EXISTS public.update_billing_plan_atomic(text, text, text, numeric, numeric, numeric, numeric, numeric, integer, text, text, integer, anycompatible, anycompatible, integer, boolean);
  `);

  // 2. Create the enhanced update_billing_plan_atomic RPC
  await client.query(`
    CREATE OR REPLACE FUNCTION public.update_billing_plan_atomic(
        p_plan_id text,
        p_name text,
        p_description text DEFAULT NULL::text,
        p_amount numeric DEFAULT NULL::numeric,
        p_monthly_amount numeric DEFAULT NULL::numeric,
        p_yearly_amount numeric DEFAULT NULL::numeric,
        p_extra_branch_price numeric DEFAULT NULL::numeric,
        p_extra_branch_yearly_price numeric DEFAULT NULL::numeric,
        p_tier_level integer DEFAULT NULL::integer,
        p_badge_text text DEFAULT NULL::text,
        p_cumulative_note text DEFAULT NULL::text,
        p_trial_days integer DEFAULT 14,
        p_features jsonb DEFAULT '[]'::jsonb,
        p_features_list jsonb DEFAULT '[]'::jsonb,
        p_duration_months integer DEFAULT 1,
        p_active boolean DEFAULT true
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
        v_plan record;
        v_clean_months integer;
        v_interval text;
        v_is_uuid boolean;
        v_m_amount numeric;
        v_y_amount numeric;
        v_feats jsonb;
    BEGIN
        -- Security verification
        IF NOT (is_super_admin() OR auth.role() = 'service_role' OR current_user = 'postgres') THEN
            RAISE EXCEPTION 'Unauthorized: Only platform Super Admin can modify billing plans';
        END IF;

        -- Clean pricing & interval
        v_m_amount := COALESCE(p_monthly_amount, p_amount);
        v_y_amount := COALESCE(p_yearly_amount, CASE WHEN v_m_amount IS NOT NULL THEN v_m_amount * 10 ELSE NULL END);
        v_clean_months := GREATEST(1, COALESCE(p_duration_months, 1));
        v_interval := CASE WHEN v_clean_months = 12 THEN 'YEARLY' ELSE 'MONTHLY' END;
        v_is_uuid := p_plan_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

        -- Consolidate features jsonb
        IF p_features_list IS NOT NULL AND jsonb_typeof(p_features_list) = 'array' AND jsonb_array_length(p_features_list) > 0 THEN
            v_feats := p_features_list;
        ELSIF p_features IS NOT NULL AND jsonb_typeof(p_features) = 'array' AND jsonb_array_length(p_features) > 0 THEN
            v_feats := p_features;
        ELSE
            v_feats := NULL;
        END IF;

        -- Atomic DB Update
        IF v_is_uuid THEN
            UPDATE public.billing_plans
            SET 
                name = COALESCE(NULLIF(TRIM(p_name), ''), name),
                description = COALESCE(p_description, description),
                amount = COALESCE(v_m_amount, amount),
                monthly_amount = COALESCE(v_m_amount, monthly_amount),
                yearly_amount = COALESCE(v_y_amount, yearly_amount),
                extra_branch_price = COALESCE(p_extra_branch_price, extra_branch_price),
                extra_branch_yearly_price = COALESCE(p_extra_branch_yearly_price, extra_branch_yearly_price),
                tier_level = COALESCE(p_tier_level, tier_level),
                badge_text = p_badge_text,
                cumulative_note = p_cumulative_note,
                billing_interval = v_interval,
                trial_days = COALESCE(p_trial_days, trial_days),
                active = COALESCE(p_active, active),
                features_list = COALESCE(v_feats, features_list),
                metadata = jsonb_set(
                    jsonb_set(COALESCE(metadata, '{}'::jsonb), '{duration_months}', to_jsonb(v_clean_months)),
                    '{features}',
                    COALESCE(v_feats, metadata->'features', '[]'::jsonb)
                ),
                updated_at = NOW()
            WHERE id = p_plan_id::uuid
            RETURNING * INTO v_plan;
        ELSE
            UPDATE public.billing_plans
            SET 
                name = COALESCE(NULLIF(TRIM(p_name), ''), name),
                description = COALESCE(p_description, description),
                amount = COALESCE(v_m_amount, amount),
                monthly_amount = COALESCE(v_m_amount, monthly_amount),
                yearly_amount = COALESCE(v_y_amount, yearly_amount),
                extra_branch_price = COALESCE(p_extra_branch_price, extra_branch_price),
                extra_branch_yearly_price = COALESCE(p_extra_branch_yearly_price, extra_branch_yearly_price),
                tier_level = COALESCE(p_tier_level, tier_level),
                badge_text = p_badge_text,
                cumulative_note = p_cumulative_note,
                billing_interval = v_interval,
                trial_days = COALESCE(p_trial_days, trial_days),
                active = COALESCE(p_active, active),
                features_list = COALESCE(v_feats, features_list),
                metadata = jsonb_set(
                    jsonb_set(COALESCE(metadata, '{}'::jsonb), '{duration_months}', to_jsonb(v_clean_months)),
                    '{features}',
                    COALESCE(v_feats, metadata->'features', '[]'::jsonb)
                ),
                updated_at = NOW()
            WHERE code = p_plan_id
            RETURNING * INTO v_plan;
        END IF;

        IF v_plan.id IS NULL THEN
            RAISE EXCEPTION 'Billing plan not found with ID/code: %', p_plan_id;
        END IF;

        RETURN to_jsonb(v_plan);
    END;
    $$;
  `);

  console.log('✅ update_billing_plan_atomic updated successfully');

  // Test updating the basic plan of radar
  const testRes = await client.query(`
    SELECT public.update_billing_plan_atomic(
      p_plan_id => '8371f0bb-b52e-4198-a5e9-bc51390174f0',
      p_name => 'الباقة الأساسية',
      p_monthly_amount => 99.00,
      p_yearly_amount => 990.00,
      p_extra_branch_price => 49.00,
      p_extra_branch_yearly_price => 490.00,
      p_tier_level => 1,
      p_badge_text => NULL,
      p_cumulative_note => NULL,
      p_trial_days => 14,
      p_features_list => '["كاشير سحابي سريع", "فواتير ضريبية مبسطة"]'::jsonb
    ) as result;
  `);
  console.log('Test call result:', testRes.rows[0].result);

  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
