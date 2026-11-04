import pg from 'pg';
const { Client } = pg;
const PG_CONNECTION_STRING = 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres';

async function main() {
  const client = new Client({ connectionString: PG_CONNECTION_STRING });
  await client.connect();

  console.log('Updating get_all_partner_financial_summaries with sub_partners_stores_count...');

  await client.query(`
CREATE OR REPLACE FUNCTION public.get_all_partner_financial_summaries(
    p_partner_id uuid DEFAULT NULL::uuid, 
    p_tenant_id text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_result JSONB := '{}'::jsonb;
    v_partner_record RECORD;
    v_target_tenant TEXT;
    v_available_comm NUMERIC := 0;
    v_paid_comm NUMERIC := 0;
    v_pending_comm NUMERIC := 0;
    v_available_bonus NUMERIC := 0;
    v_paid_bonus NUMERIC := 0;
    v_total_payable NUMERIC := 0;
    v_total_paid NUMERIC := 0;
    v_lifetime_earned NUMERIC := 0;
    v_stores_count INT := 0;
    v_sub_partners_count INT := 0;
    v_sub_partners_stores_count INT := 0;
BEGIN
    v_target_tenant := NULLIF(LOWER(TRIM(p_tenant_id)), '');
    IF v_target_tenant IS NULL THEN
        BEGIN
            v_target_tenant := public.current_tenant_id();
        EXCEPTION WHEN OTHERS THEN
            v_target_tenant := NULL;
        END;
    END IF;

    FOR v_partner_record IN
        SELECT 
            pa.id, 
            pa.affiliate_id, 
            pa.display_name, 
            COALESCE(pa.slug, LOWER(COALESCE(pa.referral_code, af.referral_code, 'alhaj'))) AS slug,
            COALESCE(pa.referral_code, af.referral_code, 'ALHAJ') AS referral_code,
            COALESCE(af.phone, pa.phone, '') AS phone,
            COALESCE(pa.pin_code, '1234') AS pin_code,
            COALESCE(pa.commission_rate, 0.2000) AS commission_rate,
            COALESCE(pa.acquisition_commission_rate, 0.2000) AS acquisition_commission_rate,
            COALESCE(pa.recurring_commission_rate, 0.1000) AS recurring_commission_rate,
            COALESCE(pa.sub_partner_commission_rate, 0.0500) AS sub_partner_commission_rate,
            COALESCE(pa.sub_partner_conversions_limit, 10) AS sub_partner_conversions_limit,
            COALESCE(pa.sub_partner_conversions_count, 0) AS sub_partner_conversions_count,
            pa.recruited_by_partner_id,
            COALESCE(pt.target_value, 20) AS target_value,
            COALESCE(pa.active, true) AS active,
            pa.tenant_id,
            COALESCE(pa.created_at, af.created_at, NOW()) AS created_at
        FROM public.partner_accounts pa
        LEFT JOIN public.affiliates af ON af.id = pa.affiliate_id
        LEFT JOIN LATERAL (
            SELECT target_value 
            FROM public.partner_targets 
            WHERE partner_account_id = pa.id 
            ORDER BY created_at DESC 
            LIMIT 1
        ) pt ON true
        WHERE (p_partner_id IS NULL OR pa.id = p_partner_id OR pa.affiliate_id = p_partner_id)
          AND (v_target_tenant IS NULL OR pa.tenant_id = v_target_tenant)
        ORDER BY pa.created_at ASC
    LOOP
        v_available_comm := 0;
        v_paid_comm := 0;
        v_pending_comm := 0;
        v_available_bonus := 0;
        v_paid_bonus := 0;
        v_stores_count := 0;
        v_sub_partners_count := 0;
        v_sub_partners_stores_count := 0;

        -- 1. حساب العمولات
        SELECT
            COALESCE(SUM(CASE WHEN status IN ('EARNED', 'AVAILABLE') THEN commission_amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN status = 'PAID' THEN commission_amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN status = 'PENDING' THEN commission_amount ELSE 0 END), 0)
        FROM public.partner_commissions
        WHERE (partner_account_id = v_partner_record.id OR affiliate_id = v_partner_record.affiliate_id)
          AND status NOT IN ('REVERSED', 'CANCELLED', 'VOID')
        INTO v_available_comm, v_paid_comm, v_pending_comm;

        -- 2. حساب المكافآت
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'partner_bonus_awards') THEN
            SELECT
                COALESCE(SUM(CASE WHEN status = 'ACHIEVED' THEN bonus_amount ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN status IN ('AWARDED', 'PAID') THEN bonus_amount ELSE 0 END), 0)
            FROM public.partner_bonus_awards
            WHERE partner_account_id = v_partner_record.id
            INTO v_available_bonus, v_paid_bonus;
        END IF;

        -- 3. عدد المتاجر المحققة المباشرة (Direct Stores)
        SELECT COUNT(DISTINCT s.id) INTO v_stores_count
        FROM public.stores s
        WHERE (s.partner_id = v_partner_record.id OR s.referral_code = v_partner_record.referral_code)
          AND s.status NOT IN ('DELETED', 'ARCHIVED');

        -- إذا لم يجد في stores، نعد من merchant_leads
        IF v_stores_count = 0 THEN
            SELECT COUNT(DISTINCT ml.converted_store_id) INTO v_stores_count
            FROM public.merchant_leads ml
            WHERE (ml.affiliate_id = v_partner_record.affiliate_id OR ml.referral_code = v_partner_record.referral_code)
              AND ml.converted_store_id IS NOT NULL;
        END IF;

        -- 4. عدد الشركاء المستقطبين (Sub-Partners Count)
        SELECT COUNT(DISTINCT sub.id) INTO v_sub_partners_count
        FROM public.partner_accounts sub
        WHERE sub.recruited_by_partner_id = v_partner_record.id;

        -- 5. عدد متاجر الشركاء المستقطبين (Sub-Partners Stores Count - Network)
        SELECT COUNT(DISTINCT s.id) INTO v_sub_partners_stores_count
        FROM public.stores s
        WHERE s.status NOT IN ('DELETED', 'ARCHIVED')
          AND (
            s.partner_id IN (
                SELECT sub.id 
                FROM public.partner_accounts sub 
                WHERE sub.recruited_by_partner_id = v_partner_record.id
            )
            OR s.referral_code IN (
                SELECT sub.referral_code 
                FROM public.partner_accounts sub 
                WHERE sub.recruited_by_partner_id = v_partner_record.id
            )
          );

        IF v_sub_partners_stores_count = 0 THEN
            SELECT COUNT(DISTINCT ml.converted_store_id) INTO v_sub_partners_stores_count
            FROM public.merchant_leads ml
            WHERE ml.converted_store_id IS NOT NULL
              AND (
                ml.referral_code IN (
                    SELECT sub.referral_code 
                    FROM public.partner_accounts sub 
                    WHERE sub.recruited_by_partner_id = v_partner_record.id
                )
                OR ml.affiliate_id IN (
                    SELECT sub.affiliate_id 
                    FROM public.partner_accounts sub 
                    WHERE sub.recruited_by_partner_id = v_partner_record.id
                )
              );
        END IF;

        v_total_payable := GREATEST(0.00, v_available_comm + v_available_bonus);
        v_total_paid := v_paid_comm + v_paid_bonus;
        v_lifetime_earned := v_total_payable + v_total_paid;

        v_result := jsonb_set(
            v_result,
            ARRAY[v_partner_record.id::text],
            jsonb_build_object(
                'partner_id', v_partner_record.id,
                'affiliate_id', v_partner_record.affiliate_id,
                'display_name', v_partner_record.display_name,
                'name', v_partner_record.display_name,
                'referral_code', v_partner_record.referral_code,
                'slug', v_partner_record.slug,
                'phone', v_partner_record.phone,
                'pin_code', v_partner_record.pin_code,
                'tenant_id', v_partner_record.tenant_id,
                'commission_rate', v_partner_record.commission_rate,
                'acquisition_commission_rate', v_partner_record.acquisition_commission_rate,
                'recurring_commission_rate', v_partner_record.recurring_commission_rate,
                'sub_partner_commission_rate', v_partner_record.sub_partner_commission_rate,
                'sub_partner_conversions_limit', v_partner_record.sub_partner_conversions_limit,
                'sub_partner_conversions_count', v_partner_record.sub_partner_conversions_count,
                'recruited_by_partner_id', v_partner_record.recruited_by_partner_id,
                'stores_count', v_stores_count,
                'sub_partners_count', v_sub_partners_count,
                'sub_partners_stores_count', v_sub_partners_stores_count,
                'target_value', v_partner_record.target_value,
                'active', v_partner_record.active,
                'earned_commissions', v_available_comm,
                'paid_commissions', v_paid_comm,
                'pending_commissions', v_pending_comm,
                'earned_bonus', v_available_bonus,
                'paid_bonus', v_paid_bonus,
                'total_payable', v_total_payable,
                'total_paid', v_total_paid,
                'lifetime_earned', v_lifetime_earned,
                'currency', 'SAR',
                'created_at', v_partner_record.created_at
            )
        );
    END LOOP;

    RETURN v_result;
END;
$function$;
  `);

  console.log('Testing updated function...');
  const res = await client.query("SELECT get_all_partner_financial_summaries(NULL, 'sadeem') as summary");
  console.log('Result sample for Salah:', JSON.stringify(res.rows[0].summary['f56397ec-249d-4bd2-89f4-180eaa34d053'], null, 2));

  await client.end();
}

main().catch(console.error);
