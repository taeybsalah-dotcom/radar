export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      stores: {
        Row: {
          id: string;
          slug: string;
          name: string;
          logo_url: string | null;
          primary_color: string | null;
          secondary_color: string | null;
          points_per_riyal: number;
          subscription_active: boolean;
          status: string;
          subscription_status: string;
          subscription_plan: string;
          subscription_plan_id: string | null;
          plan_code: string | null;
          lifecycle_stage: string | null;
          trial_start_date: string;
          trial_end_date: string;
          subscription_start_date: string | null;
          subscription_end_date: string;
          setup_fee_paid: boolean;
          renewal_amount: number;
          payment_gateway: string;
          gateway_customer_id: string | null;
          gateway_subscription_id: string | null;
          manager_name: string | null;
          manager_contact: string | null;
          admin_pin: string | null;
          custom_domain: string | null;
          welcome_gift_type: string | null;
          welcome_points: number | null;
          welcome_offer_title: string | null;
          slider_images: Json | null;
          is_demo: boolean;
          max_cashier_invoice_amount: number | null;
          catalog_enabled: boolean | null;
          grace_period_days: number | null;
          grace_period_ends_at: string | null;
          in_grace_period: boolean | null;
          complimentary_days_granted: number | null;
          last_override_at: string | null;
          last_override_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          logo_url?: string | null;
          primary_color?: string | null;
          secondary_color?: string | null;
          points_per_riyal?: number;
          subscription_active?: boolean;
          status?: string;
          subscription_status?: string;
          subscription_plan?: string;
          subscription_plan_id?: string | null;
          plan_code?: string | null;
          lifecycle_stage?: string | null;
          trial_start_date?: string;
          trial_end_date?: string;
          subscription_start_date?: string | null;
          subscription_end_date?: string;
          setup_fee_paid?: boolean;
          renewal_amount?: number;
          payment_gateway?: string;
          gateway_customer_id?: string | null;
          gateway_subscription_id?: string | null;
          manager_name?: string | null;
          manager_contact?: string | null;
          admin_pin?: string | null;
          custom_domain?: string | null;
          welcome_gift_type?: string | null;
          welcome_points?: number | null;
          welcome_offer_title?: string | null;
          slider_images?: Json | null;
          is_demo?: boolean;
          max_cashier_invoice_amount?: number | null;
          catalog_enabled?: boolean | null;
          grace_period_days?: number | null;
          grace_period_ends_at?: string | null;
          in_grace_period?: boolean | null;
          complimentary_days_granted?: number | null;
          last_override_at?: string | null;
          last_override_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          logo_url?: string | null;
          primary_color?: string | null;
          secondary_color?: string | null;
          points_per_riyal?: number;
          subscription_active?: boolean;
          status?: string;
          subscription_status?: string;
          subscription_plan?: string;
          subscription_plan_id?: string | null;
          plan_code?: string | null;
          lifecycle_stage?: string | null;
          trial_start_date?: string;
          trial_end_date?: string;
          subscription_start_date?: string | null;
          subscription_end_date?: string;
          setup_fee_paid?: boolean;
          renewal_amount?: number;
          payment_gateway?: string;
          gateway_customer_id?: string | null;
          gateway_subscription_id?: string | null;
          manager_name?: string | null;
          manager_contact?: string | null;
          admin_pin?: string | null;
          custom_domain?: string | null;
          welcome_gift_type?: string | null;
          welcome_points?: number | null;
          welcome_offer_title?: string | null;
          slider_images?: Json | null;
          is_demo?: boolean;
          max_cashier_invoice_amount?: number | null;
          catalog_enabled?: boolean | null;
          grace_period_days?: number | null;
          grace_period_ends_at?: string | null;
          in_grace_period?: boolean | null;
          complimentary_days_granted?: number | null;
          last_override_at?: string | null;
          last_override_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      store_staff: {
        Row: {
          id: string;
          store_id: string;
          user_id: string | null;
          name: string;
          phone: string;
          role: 'admin' | 'cashier';
          pin_code: string | null;
          pin_hash: string | null;
          is_active: boolean;
          can_manual_input_phone: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          user_id?: string | null;
          name: string;
          phone: string;
          role?: 'admin' | 'cashier';
          pin_code?: string | null;
          pin_hash?: string | null;
          is_active?: boolean;
          can_manual_input_phone?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          user_id?: string | null;
          name?: string;
          phone?: string;
          role?: 'admin' | 'cashier';
          pin_code?: string | null;
          pin_hash?: string | null;
          is_active?: boolean;
          can_manual_input_phone?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'store_staff_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          }
        ];
      };
      store_customers: {
        Row: {
          id: string;
          store_id: string;
          phone: string;
          name: string | null;
          lifetime_xp: number;
          wallet_balance: number;
          last_visit_date: string | null;
          is_demo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          phone: string;
          name?: string | null;
          lifetime_xp?: number;
          wallet_balance?: number;
          last_visit_date?: string | null;
          is_demo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          phone?: string;
          name?: string | null;
          lifetime_xp?: number;
          wallet_balance?: number;
          last_visit_date?: string | null;
          is_demo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'store_customers_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          }
        ];
      };
      tiers: {
        Row: {
          id: string;
          store_id: string;
          tier_name: string;
          required_xp: number;
          badge_color: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          tier_name: string;
          required_xp?: number;
          badge_color?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          tier_name?: string;
          required_xp?: number;
          badge_color?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tiers_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          }
        ];
      };
      privileges: {
        Row: {
          id: string;
          store_id: string;
          required_tier_id: string | null;
          tier_id: string | null;
          title: string;
          description: string | null;
          image_url: string | null;
          cost_points: number;
          quantity_limit: number | null;
          per_customer_limit: number | null;
          redeemed_count: number;
          valid_start_time: string | null;
          valid_end_time: string | null;
          is_active: boolean;
          is_hidden: boolean;
          reward_type: string | null;
          discount_percent: number | null;
          points_cost: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          required_tier_id?: string | null;
          tier_id?: string | null;
          title: string;
          description?: string | null;
          image_url?: string | null;
          cost_points?: number;
          quantity_limit?: number | null;
          per_customer_limit?: number | null;
          redeemed_count?: number;
          valid_start_time?: string | null;
          valid_end_time?: string | null;
          is_active?: boolean;
          is_hidden?: boolean;
          reward_type?: string | null;
          discount_percent?: number | null;
          points_cost?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          required_tier_id?: string | null;
          tier_id?: string | null;
          title?: string;
          description?: string | null;
          image_url?: string | null;
          cost_points?: number;
          quantity_limit?: number | null;
          per_customer_limit?: number | null;
          redeemed_count?: number;
          valid_start_time?: string | null;
          valid_end_time?: string | null;
          is_active?: boolean;
          is_hidden?: boolean;
          reward_type?: string | null;
          discount_percent?: number | null;
          points_cost?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'privileges_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          }
        ];
      };
      customer_coupons: {
        Row: {
          id: string;
          coupon_code: string;
          customer_id: string;
          customer_phone: string;
          customer_name: string | null;
          store_id: string;
          privilege_id: string | null;
          privilege_title: string;
          privilege_image_url: string | null;
          cost_points: number;
          status: string;
          valid_start_time: string | null;
          valid_end_time: string | null;
          purchased_at: string;
          redeemed_at: string | null;
          redeemed_by_staff_id: string | null;
          reward_title: string | null;
          reward_type: string | null;
          discount_percent: number | null;
          used_at: string | null;
          used_by_staff_id: string | null;
          expires_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          coupon_code: string;
          customer_id: string;
          customer_phone: string;
          customer_name?: string | null;
          store_id: string;
          privilege_id?: string | null;
          privilege_title?: string;
          privilege_image_url?: string | null;
          cost_points?: number;
          status?: string;
          valid_start_time?: string | null;
          valid_end_time?: string | null;
          purchased_at?: string;
          redeemed_at?: string | null;
          redeemed_by_staff_id?: string | null;
          reward_title?: string | null;
          reward_type?: string | null;
          discount_percent?: number | null;
          used_at?: string | null;
          used_by_staff_id?: string | null;
          expires_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          coupon_code?: string;
          customer_id?: string;
          customer_phone?: string;
          customer_name?: string | null;
          store_id?: string;
          privilege_id?: string | null;
          privilege_title?: string;
          privilege_image_url?: string | null;
          cost_points?: number;
          status?: string;
          valid_start_time?: string | null;
          valid_end_time?: string | null;
          purchased_at?: string;
          redeemed_at?: string | null;
          redeemed_by_staff_id?: string | null;
          reward_title?: string | null;
          reward_type?: string | null;
          discount_percent?: number | null;
          used_at?: string | null;
          used_by_staff_id?: string | null;
          expires_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'customer_coupons_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          }
        ];
      };
      store_wallets: {
        Row: {
          id: string;
          store_id: string;
          sms_quota: number;
          sms_used: number;
          wa_quota: number;
          wa_used: number;
          cashier_limit: number;
          extra_cashiers_purchased: number;
          whatsapp_provider: string | null;
          meta_phone_number_id: string | null;
          meta_waba_id: string | null;
          meta_access_token: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          sms_quota?: number;
          sms_used?: number;
          wa_quota?: number;
          wa_used?: number;
          cashier_limit?: number;
          extra_cashiers_purchased?: number;
          whatsapp_provider?: string | null;
          meta_phone_number_id?: string | null;
          meta_waba_id?: string | null;
          meta_access_token?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          sms_quota?: number;
          sms_used?: number;
          wa_quota?: number;
          wa_used?: number;
          cashier_limit?: number;
          extra_cashiers_purchased?: number;
          whatsapp_provider?: string | null;
          meta_phone_number_id?: string | null;
          meta_waba_id?: string | null;
          meta_access_token?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'store_wallets_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: true;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          }
        ];
      };
      store_invoices: {
        Row: {
          id: string;
          store_id: string;
          invoice_number: string;
          invoice_type: string;
          amount: number;
          vat_amount: number;
          net_amount: number;
          currency: string;
          status: string;
          payment_method: string;
          gateway: string;
          gateway_payment_id: string | null;
          plan_id: string | null;
          plan_name: string | null;
          paid_at: string | null;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          invoice_number: string;
          invoice_type?: string;
          amount?: number;
          vat_amount?: number;
          net_amount?: number;
          currency?: string;
          status?: string;
          payment_method?: string;
          gateway?: string;
          gateway_payment_id?: string | null;
          plan_id?: string | null;
          plan_name?: string | null;
          paid_at?: string | null;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          invoice_number?: string;
          invoice_type?: string;
          amount?: number;
          vat_amount?: number;
          net_amount?: number;
          currency?: string;
          status?: string;
          payment_method?: string;
          gateway?: string;
          gateway_payment_id?: string | null;
          plan_id?: string | null;
          plan_name?: string | null;
          paid_at?: string | null;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'store_invoices_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          }
        ];
      };
      merchant_leads: {
        Row: {
          id: string;
          store_name: string;
          manager_name: string;
          phone: string;
          normalized_phone: string | null;
          city: string | null;
          business_type: string | null;
          attribution_source: string;
          affiliate_id: string | null;
          referral_code: string | null;
          status: string;
          conversion_started_at: string | null;
          conversion_lease_id: string | null;
          conversion_error: string | null;
          converted_store_id: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_name: string;
          manager_name: string;
          phone: string;
          normalized_phone?: string | null;
          city?: string | null;
          business_type?: string | null;
          attribution_source?: string;
          affiliate_id?: string | null;
          referral_code?: string | null;
          status?: string;
          conversion_started_at?: string | null;
          conversion_lease_id?: string | null;
          conversion_error?: string | null;
          converted_store_id?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_name?: string;
          manager_name?: string;
          phone?: string;
          normalized_phone?: string | null;
          city?: string | null;
          business_type?: string | null;
          attribution_source?: string;
          affiliate_id?: string | null;
          referral_code?: string | null;
          status?: string;
          conversion_started_at?: string | null;
          conversion_lease_id?: string | null;
          conversion_error?: string | null;
          converted_store_id?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'merchant_leads_converted_store_id_fkey';
            columns: ['converted_store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          }
        ];
      };
      partner_accounts: {
        Row: {
          id: string;
          auth_user_id: string | null;
          affiliate_id: string;
          display_name: string;
          slug: string;
          referral_code: string | null;
          region: string | null;
          active: boolean;
          commission_rate: number | null;
          acquisition_commission_rate: number | null;
          recurring_commission_rate: number | null;
          target_value: number | null;
          pin_code: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          auth_user_id?: string | null;
          affiliate_id: string;
          display_name: string;
          slug: string;
          referral_code?: string | null;
          region?: string | null;
          active?: boolean;
          commission_rate?: number | null;
          acquisition_commission_rate?: number | null;
          recurring_commission_rate?: number | null;
          target_value?: number | null;
          pin_code?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          auth_user_id?: string | null;
          affiliate_id?: string;
          display_name?: string;
          slug?: string;
          referral_code?: string | null;
          region?: string | null;
          active?: boolean;
          commission_rate?: number | null;
          acquisition_commission_rate?: number | null;
          recurring_commission_rate?: number | null;
          target_value?: number | null;
          pin_code?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      partner_commissions: {
        Row: {
          id: string;
          partner_account_id: string;
          merchant_lead_id: string | null;
          store_id: string | null;
          commission_type: string;
          basis_amount: number;
          commission_rate: number;
          commission_amount: number;
          status: string;
          qualifying_event: string | null;
          idempotency_key: string;
          invoice_id: string | null;
          invoice_number: string | null;
          merchant_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          partner_account_id: string;
          merchant_lead_id?: string | null;
          store_id?: string | null;
          commission_type?: string;
          basis_amount?: number;
          commission_rate?: number;
          commission_amount?: number;
          status?: string;
          qualifying_event?: string | null;
          idempotency_key: string;
          invoice_id?: string | null;
          invoice_number?: string | null;
          merchant_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          partner_account_id?: string;
          merchant_lead_id?: string | null;
          store_id?: string | null;
          commission_type?: string;
          basis_amount?: number;
          commission_rate?: number;
          commission_amount?: number;
          status?: string;
          qualifying_event?: string | null;
          idempotency_key?: string;
          invoice_id?: string | null;
          invoice_number?: string | null;
          merchant_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'partner_commissions_partner_account_id_fkey';
            columns: ['partner_account_id'];
            isOneToOne: false;
            referencedRelation: 'partner_accounts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'partner_commissions_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          }
        ];
      };
      partner_targets: {
        Row: {
          id: string;
          partner_account_id: string;
          period_start: string;
          period_end: string;
          target_type: string;
          target_value: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          partner_account_id: string;
          period_start: string;
          period_end: string;
          target_type?: string;
          target_value?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          partner_account_id?: string;
          period_start?: string;
          period_end?: string;
          target_type?: string;
          target_value?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      partner_bonus_rules: {
        Row: {
          id: string;
          milestone: number;
          bonus_amount: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          milestone: number;
          bonus_amount: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          milestone?: number;
          bonus_amount?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      partner_bonus_awards: {
        Row: {
          id: string;
          partner_account_id: string;
          bonus_rule_id: string | null;
          milestone: number | null;
          period_start: string | null;
          period_end: string | null;
          bonus_amount: number;
          status: string;
          idempotency_key: string;
          awarded_at: string | null;
          achieved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          partner_account_id: string;
          bonus_rule_id?: string | null;
          milestone?: number | null;
          period_start?: string | null;
          period_end?: string | null;
          bonus_amount: number;
          status?: string;
          idempotency_key?: string;
          awarded_at?: string | null;
          achieved_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          partner_account_id?: string;
          bonus_rule_id?: string | null;
          milestone?: number | null;
          period_start?: string | null;
          period_end?: string | null;
          bonus_amount?: number;
          status?: string;
          idempotency_key?: string;
          awarded_at?: string | null;
          achieved_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      financial_ledger: {
        Row: {
          id: string;
          transaction_id: string;
          invoice_id: string | null;
          store_id: string | null;
          affiliate_id: string | null;
          payment_id: string | null;
          transaction_type: string;
          gross_amount: number;
          vat_amount: number;
          gateway_fee: number;
          affiliate_commission: number;
          net_platform_amount: number;
          status: string;
          reversal_of: string | null;
          refund_of: string | null;
          created_by: string;
          metadata: Json | null;
          effective_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          transaction_id: string;
          invoice_id?: string | null;
          store_id?: string | null;
          affiliate_id?: string | null;
          payment_id?: string | null;
          transaction_type: string;
          gross_amount?: number;
          vat_amount?: number;
          gateway_fee?: number;
          affiliate_commission?: number;
          net_platform_amount?: number;
          status?: string;
          reversal_of?: string | null;
          refund_of?: string | null;
          created_by?: string;
          metadata?: Json | null;
          effective_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          transaction_id?: string;
          invoice_id?: string | null;
          store_id?: string | null;
          affiliate_id?: string | null;
          payment_id?: string | null;
          transaction_type?: string;
          gross_amount?: number;
          vat_amount?: number;
          gateway_fee?: number;
          affiliate_commission?: number;
          net_platform_amount?: number;
          status?: string;
          reversal_of?: string | null;
          refund_of?: string | null;
          created_by?: string;
          metadata?: Json | null;
          effective_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      credit_notes: {
        Row: {
          id: string;
          credit_note_number: string;
          original_invoice_id: string;
          original_invoice_number: string;
          store_id: string;
          affiliate_id: string | null;
          gross_refund_amount: number;
          vat_refund_amount: number;
          net_refund_amount: number;
          clawback_commission: number;
          reason: string;
          status: string;
          ledger_entry_id: string | null;
          issued_by: string;
          notes: string | null;
          issued_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          credit_note_number: string;
          original_invoice_id: string;
          original_invoice_number: string;
          store_id: string;
          affiliate_id?: string | null;
          gross_refund_amount?: number;
          vat_refund_amount?: number;
          net_refund_amount?: number;
          clawback_commission?: number;
          reason: string;
          status?: string;
          ledger_entry_id?: string | null;
          issued_by?: string;
          notes?: string | null;
          issued_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          credit_note_number?: string;
          original_invoice_id?: string;
          original_invoice_number?: string;
          store_id?: string;
          affiliate_id?: string | null;
          gross_refund_amount?: number;
          vat_refund_amount?: number;
          net_refund_amount?: number;
          clawback_commission?: number;
          reason?: string;
          status?: string;
          ledger_entry_id?: string | null;
          issued_by?: string;
          notes?: string | null;
          issued_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'credit_notes_ledger_entry_id_fkey';
            columns: ['ledger_entry_id'];
            isOneToOne: false;
            referencedRelation: 'financial_ledger';
            referencedColumns: ['id'];
          }
        ];
      };
      affiliate_payouts: {
        Row: {
          id: string;
          payout_number: string;
          affiliate_id: string;
          partner_name: string;
          iban: string;
          bank_name: string;
          transfer_reference: string;
          amount: number;
          commissions_count: number;
          commission_ids: Json | null;
          status: string;
          disbursed_by: string;
          ledger_entry_id: string | null;
          notes: string | null;
          disbursed_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          payout_number: string;
          affiliate_id: string;
          partner_name: string;
          iban: string;
          bank_name: string;
          transfer_reference: string;
          amount?: number;
          commissions_count?: number;
          commission_ids?: Json | null;
          status?: string;
          disbursed_by?: string;
          ledger_entry_id?: string | null;
          notes?: string | null;
          disbursed_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          payout_number?: string;
          affiliate_id?: string;
          partner_name?: string;
          iban?: string;
          bank_name?: string;
          transfer_reference?: string;
          amount?: number;
          commissions_count?: number;
          commission_ids?: Json | null;
          status?: string;
          disbursed_by?: string;
          ledger_entry_id?: string | null;
          notes?: string | null;
          disbursed_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'affiliate_payouts_ledger_entry_id_fkey';
            columns: ['ledger_entry_id'];
            isOneToOne: false;
            referencedRelation: 'financial_ledger';
            referencedColumns: ['id'];
          }
        ];
      };
      super_admin_users: {
        Row: {
          id: string;
          user_id: string;
          email: string;
          role: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          email: string;
          role?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          email?: string;
          role?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      billing_plans: {
        Row: {
          id: string;
          code: string;
          name: string;
          description: string | null;
          amount: number;
          currency: string;
          billing_interval: string;
          trial_days: number;
          active: boolean;
          provider_price_id: string | null;
          metadata: Json | null;
          features: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          description?: string | null;
          amount: number;
          currency?: string;
          billing_interval?: string;
          trial_days?: number;
          active?: boolean;
          provider_price_id?: string | null;
          metadata?: Json | null;
          features?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          description?: string | null;
          amount?: number;
          currency?: string;
          billing_interval?: string;
          trial_days?: number;
          active?: boolean;
          provider_price_id?: string | null;
          metadata?: Json | null;
          features?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      merchant_subscriptions: {
        Row: {
          id: string;
          store_id: string;
          plan_id: string;
          status: string;
          current_period_start: string;
          current_period_end: string;
          cancel_at_period_end: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          plan_id: string;
          status?: string;
          current_period_start?: string;
          current_period_end?: string;
          cancel_at_period_end?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          plan_id?: string;
          status?: string;
          current_period_start?: string;
          current_period_end?: string;
          cancel_at_period_end?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'merchant_subscriptions_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          }
        ];
      };
      billing_transactions: {
        Row: {
          id: string;
          store_id: string;
          plan_id: string;
          type: string;
          status: string;
          amount: number;
          currency: string;
          provider: string;
          provider_transaction_id: string | null;
          idempotency_key: string | null;
          paid_at: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          plan_id: string;
          type: string;
          status: string;
          amount: number;
          currency?: string;
          provider: string;
          provider_transaction_id?: string | null;
          idempotency_key?: string | null;
          paid_at?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          plan_id?: string;
          type?: string;
          status?: string;
          amount?: number;
          currency?: string;
          provider?: string;
          provider_transaction_id?: string | null;
          idempotency_key?: string | null;
          paid_at?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'billing_transactions_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          }
        ];
      };
      merchant_onboarding: {
        Row: {
          id: string;
          store_id: string;
          current_step: number;
          completed_steps: Json | null;
          is_completed: boolean;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          current_step?: number;
          completed_steps?: Json | null;
          is_completed?: boolean;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          current_step?: number;
          completed_steps?: Json | null;
          is_completed?: boolean;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'merchant_onboarding_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: true;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          }
        ];
      };
      affiliates: {
        Row: {
          id: string;
          referral_code: string;
          name: string;
          phone: string;
          status: string;
          commission_rate: number;
          acquisition_commission_rate: number | null;
          recurring_commission_rate: number | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          referral_code: string;
          name: string;
          phone?: string;
          status?: string;
          commission_rate?: number;
          acquisition_commission_rate?: number | null;
          recurring_commission_rate?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          referral_code?: string;
          name?: string;
          phone?: string;
          status?: string;
          commission_rate?: number;
          acquisition_commission_rate?: number | null;
          recurring_commission_rate?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      referrals: {
        Row: {
          id: string;
          affiliate_id: string;
          lead_id: string;
          referral_code: string;
          first_touch_at: string;
          attribution_expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          affiliate_id: string;
          lead_id: string;
          referral_code: string;
          first_touch_at?: string;
          attribution_expires_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          affiliate_id?: string;
          lead_id?: string;
          referral_code?: string;
          first_touch_at?: string;
          attribution_expires_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          store_id: string;
          staff_id: string | null;
          customer_id: string | null;
          customer_phone: string | null;
          customer_name: string | null;
          action: string;
          purchase_amount: number | null;
          points_changed: number;
          entry_method: string;
          metadata: Json | null;
          is_demo: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          staff_id?: string | null;
          customer_id?: string | null;
          customer_phone?: string | null;
          customer_name?: string | null;
          action: string;
          purchase_amount?: number | null;
          points_changed?: number;
          entry_method?: string;
          metadata?: Json | null;
          is_demo?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          staff_id?: string | null;
          customer_id?: string | null;
          customer_phone?: string | null;
          customer_name?: string | null;
          action?: string;
          purchase_amount?: number | null;
          points_changed?: number;
          entry_method?: string;
          metadata?: Json | null;
          is_demo?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_logs_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          }
        ];
      };
      billing_webhook_events: {
        Row: {
          id: string;
          provider: string;
          event_id: string;
          event_type: string;
          signature_verified: boolean;
          payload_hash: string | null;
          processed: boolean;
          processed_at: string | null;
          created_at: string;
          metadata: Json | null;
        };
        Insert: {
          id?: string;
          provider: string;
          event_id: string;
          event_type: string;
          signature_verified?: boolean;
          payload_hash?: string | null;
          processed?: boolean;
          processed_at?: string | null;
          created_at?: string;
          metadata?: Json | null;
        };
        Update: {
          id?: string;
          provider?: string;
          event_id?: string;
          event_type?: string;
          signature_verified?: boolean;
          payload_hash?: string | null;
          processed?: boolean;
          processed_at?: string | null;
          created_at?: string;
          metadata?: Json | null;
        };
        Relationships: [];
      };
      catalog_items: {
        Row: {
          id: string;
          store_id: string;
          name: string;
          description: string | null;
          category: string;
          price: number;
          image_url: string | null;
          item_type: string;
          duration_minutes: number | null;
          modifier_groups: Json | null;
          is_available: boolean;
          sort_order: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          name: string;
          description?: string | null;
          category: string;
          price: number;
          image_url?: string | null;
          item_type?: string;
          duration_minutes?: number | null;
          modifier_groups?: Json | null;
          is_available?: boolean;
          sort_order?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          name?: string;
          description?: string | null;
          category?: string;
          price?: number;
          image_url?: string | null;
          item_type?: string;
          duration_minutes?: number | null;
          modifier_groups?: Json | null;
          is_available?: boolean;
          sort_order?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'catalog_items_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          }
        ];
      };
      service_bookings: {
        Row: {
          id: string;
          booking_number: string;
          store_id: string;
          store_name: string | null;
          customer_id: string | null;
          customer_name: string;
          customer_phone: string;
          service_id: string;
          service_name: string;
          service_category: string | null;
          service_price: number;
          total_price: number | null;
          selected_modifiers: Json | null;
          service_duration_minutes: number;
          duration_minutes: number | null;
          specialist_id: string | null;
          specialist_name: string | null;
          booking_date: string;
          booking_time: string;
          status: string;
          customer_notes: string | null;
          notes: string | null;
          loyalty_points_earned: number | null;
          points_to_earn: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_number: string;
          store_id: string;
          store_name?: string | null;
          customer_id?: string | null;
          customer_name: string;
          customer_phone: string;
          service_id: string;
          service_name: string;
          service_category?: string | null;
          service_price: number;
          total_price?: number | null;
          selected_modifiers?: Json | null;
          service_duration_minutes: number;
          duration_minutes?: number | null;
          specialist_id?: string | null;
          specialist_name?: string | null;
          booking_date: string;
          booking_time: string;
          status?: string;
          customer_notes?: string | null;
          notes?: string | null;
          loyalty_points_earned?: number | null;
          points_to_earn?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          booking_number?: string;
          store_id?: string;
          store_name?: string | null;
          customer_id?: string | null;
          customer_name?: string;
          customer_phone?: string;
          service_id?: string;
          service_name?: string;
          service_category?: string | null;
          service_price?: number;
          total_price?: number | null;
          selected_modifiers?: Json | null;
          service_duration_minutes?: number;
          duration_minutes?: number | null;
          specialist_id?: string | null;
          specialist_name?: string | null;
          booking_date?: string;
          booking_time?: string;
          status?: string;
          customer_notes?: string | null;
          notes?: string | null;
          loyalty_points_earned?: number | null;
          points_to_earn?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'service_bookings_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          }
        ];
      };
      store_specialists: {
        Row: {
          id: string;
          store_id: string;
          name: string;
          specialty: string | null;
          service_categories: Json | null;
          service_ids: Json | null;
          avatar_url: string | null;
          phone: string | null;
          is_active: boolean;
          working_days: Json | null;
          working_hours: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          name: string;
          specialty?: string | null;
          service_categories?: Json | null;
          service_ids?: Json | null;
          avatar_url?: string | null;
          phone?: string | null;
          is_active?: boolean;
          working_days?: Json | null;
          working_hours?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          name?: string;
          specialty?: string | null;
          service_categories?: Json | null;
          service_ids?: Json | null;
          avatar_url?: string | null;
          phone?: string | null;
          is_active?: boolean;
          working_days?: Json | null;
          working_hours?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'store_specialists_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          }
        ];
      };
    };
    Views: {};
    Functions: {
      process_store_payment_atomic: {
        Args: {
          p_store_id: string;
          p_invoice_type: string;
          p_amount: number;
          p_payment_method?: string;
          p_gateway?: string;
          p_gateway_payment_id?: string | null;
          p_plan_id?: string | null;
          p_plan_code?: string | null;
          p_plan_name?: string | null;
          p_duration_months?: number;
          p_vat_rate?: number;
          p_gateway_fee?: number | null;
        };
        Returns: {
          success: boolean;
          error?: string;
          invoice_id?: string;
          invoice_number?: string;
          store?: Json;
          [key: string]: any;
        };
      };
      process_zatca_refund_and_clawback: {
        Args: {
          p_invoice_number: string;
          p_refund_amount?: number | null;
          p_reason: string;
          p_admin_user?: string;
          p_notes?: string | null;
        };
        Returns: {
          success: boolean;
          credit_note_id?: string;
          credit_note_number?: string;
          invoice_number?: string;
          store_id?: string;
          gross_refund_amount?: number;
          vat_refund_amount?: number;
          net_refund_amount?: number;
          clawback_commission?: number;
          ledger_id?: string;
          error?: string;
          [key: string]: any;
        };
      };
      check_and_update_store_subscription: {
        Args: {
          p_store_id: string;
        };
        Returns: {
          is_suspended?: boolean;
          status?: string;
          days_left?: number;
          subscription_end_date?: string;
          trial_end_date?: string;
          requires_renewal?: boolean;
          renewal_amount?: number;
          [key: string]: any;
        };
      };
      check_store_trial_eligibility: {
        Args: {
          p_store_id?: string;
          p_phone?: string;
        };
        Returns: Json;
      };
      create_store_concierge_onboarding: {
        Args: Record<string, any>;
        Returns: Json;
      };
      admin_complete_lead_conversion: {
        Args: Record<string, any>;
        Returns: Json;
      };
      admin_create_partner_account: {
        Args: Record<string, any>;
        Returns: Json;
      };
      admin_rollback_lead_conversion: {
        Args: Record<string, any>;
        Returns: Json;
      };
      admin_settle_partner_commissions: {
        Args: Record<string, any>;
        Returns: Json;
      };
      admin_start_lead_conversion: {
        Args: Record<string, any>;
        Returns: Json;
      };
      admin_toggle_partner_status: {
        Args: Record<string, any>;
        Returns: Json;
      };
      admin_update_lead_status: {
        Args: Record<string, any>;
        Returns: Json;
      };
      get_all_partner_financial_summaries: {
        Args: Record<string, any>;
        Returns: Record<string, {
          pending_commissions: number;
          earned_commissions: number;
          paid_commissions: number;
          bonuses_earned: number;
          bonuses_paid: number;
          total_payable: number;
          currency: string;
        }>;
      };
      get_all_store_invoices_batch: {
        Args: Record<string, any>;
        Returns: Json;
      };
      get_super_admin_stores_summary: {
        Args: Record<string, any>;
        Returns: Json;
      };
      record_lead_conversion_commission: {
        Args: Record<string, any>;
        Returns: Json;
      };
      reset_demo_store: {
        Args: Record<string, any>;
        Returns: Json;
      };
      submit_merchant_lead_internal: {
        Args: Record<string, any>;
        Returns: Json;
      };
      verify_staff_pin: {
        Args: Record<string, any>;
        Returns: Json;
      };
      verify_super_admin_session: {
        Args: Record<string, any>;
        Returns: {
          is_super_admin: boolean;
          email?: string;
          [key: string]: any;
        };
      };
      normalize_saudi_phone: {
        Args: {
          p_input: string;
        };
        Returns: string;
      };
      verify_staff_pin_blind: {
        Args: {
          p_store_id: string;
          p_input_pin: string;
        };
        Returns: Json;
      };
    };
    Enums: {};
    CompositeTypes: {};
  };
};
