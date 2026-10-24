export interface ResellerRecord {
  id: string;
  name: string;
  slug: string;
  custom_domain?: string | null;
  subdomain?: string | null;
  brand_logo_url?: string | null;
  brand_primary_color?: string | null;
  supabase_url: string;
  supabase_anon_key: string;
  platform_status: 'active' | 'suspended' | 'maintenance';
  suspension_reason?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResellerSecretInput {
  service_role_key: string;
  admin_email?: string;
}

export interface MasterOwnerUser {
  id: string;
  user_id: string;
  email?: string;
  full_name?: string;
  is_active: boolean;
  created_at: string;
}
