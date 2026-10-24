-- =================================================================================
-- 📦🛵 RADAR CLOUD DATABASE SYNC: INVENTORY, RECIPES, INVOICES & DELIVERY FLEET
-- Date: 2026-10-22
-- Purpose:
--   1. Move Warehouse/Inventory (المستودع والمواد الخام، الوصفات، وفواتير الموردين)
--      from browser localStorage to Supabase PostgreSQL with Realtime & RLS.
--   2. Ensure Delivery Drivers & Shift Settlements (store_drivers, driver_settlements)
--      and store_orders delivery columns exist with full RLS & Realtime support.
-- =================================================================================

BEGIN;

-- =================================================================================
-- 1. جدول المستودع والمواد الخام (store_inventory)
-- =================================================================================
CREATE TABLE IF NOT EXISTS public.store_inventory (
  id TEXT PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  branch_id TEXT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'عام',
  unit TEXT NOT NULL DEFAULT 'piece',
  current_stock NUMERIC(12, 3) NOT NULL DEFAULT 0,
  min_alert_stock NUMERIC(12, 3) NOT NULL DEFAULT 5,
  cost_per_unit NUMERIC(12, 2) NOT NULL DEFAULT 0,
  supplier_name TEXT DEFAULT '',
  sku TEXT DEFAULT '',
  last_restocked_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_inventory_store_id ON public.store_inventory(store_id);
CREATE INDEX IF NOT EXISTS idx_store_inventory_category ON public.store_inventory(store_id, category);

-- =================================================================================
-- 2. جدول وصفات المنتجات وتكاليف الأطباق (store_recipes)
-- =================================================================================
CREATE TABLE IF NOT EXISTS public.store_recipes (
  id TEXT PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  catalog_item_id TEXT NOT NULL,
  ingredients JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, catalog_item_id)
);

CREATE INDEX IF NOT EXISTS idx_store_recipes_store_id ON public.store_recipes(store_id);

-- =================================================================================
-- 3. جدول فواتير الموردين الممسوحة ضوئياً (supplier_invoices)
-- =================================================================================
CREATE TABLE IF NOT EXISTS public.supplier_invoices (
  id TEXT PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  supplier_name TEXT NOT NULL DEFAULT 'مورد عام',
  invoice_number TEXT DEFAULT '',
  invoice_date TEXT,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'applied',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_invoices_store_id ON public.supplier_invoices(store_id, created_at DESC);

-- =================================================================================
-- 4. جدول مناديب وكباتن التوصيل بالفروع (store_drivers)
-- =================================================================================
CREATE TABLE IF NOT EXISTS public.store_drivers (
  id TEXT PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  branch_id TEXT DEFAULT 'b1',
  branch_name TEXT DEFAULT 'الفرع الرئيسي',
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  vehicle_type TEXT DEFAULT 'motorcycle',
  plate_number TEXT DEFAULT '',
  pin_code TEXT DEFAULT '1234',
  is_active BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'available',
  auto_break_after_delivery BOOLEAN DEFAULT false,
  current_trip_orders_count INTEGER DEFAULT 0,
  current_trip_order_ids JSONB DEFAULT '[]'::jsonb,
  estimated_return_minutes INTEGER DEFAULT 0,
  last_status_change_at TIMESTAMPTZ,
  commission_per_order NUMERIC(10, 2) DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_drivers_store_branch ON public.store_drivers(store_id, branch_id);

-- =================================================================================
-- 5. جدول تسويات عهدة مناديب التوصيل اليومية (driver_settlements)
-- =================================================================================
CREATE TABLE IF NOT EXISTS public.driver_settlements (
  id TEXT PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  branch_id TEXT DEFAULT 'b1',
  driver_id TEXT NOT NULL,
  driver_name TEXT NOT NULL DEFAULT 'السائق',
  date TEXT NOT NULL,
  delivered_orders_count INTEGER NOT NULL DEFAULT 0,
  total_cash_collected NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_card_collected NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_online_collected NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_delivery_fees NUMERIC(12, 2) NOT NULL DEFAULT 0,
  settled BOOLEAN NOT NULL DEFAULT false,
  settled_at TIMESTAMPTZ,
  settled_by_cashier TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, driver_id, date)
);

CREATE INDEX IF NOT EXISTS idx_driver_settlements_store_driver ON public.driver_settlements(store_id, driver_id, date);

-- =================================================================================
-- 6. ترقية أعمدة التوصيل والمخزون في جداول الطلبات والفروع (store_orders & store_branches)
-- =================================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'store_orders') THEN
    ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS driver_id TEXT;
    ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS driver_name TEXT;
    ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS driver_phone TEXT;
    ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS delivery_status TEXT;
    ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS driver_assigned_at TIMESTAMPTZ;
    ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS driver_picked_up_at TIMESTAMPTZ;
    ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
    ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS fulfillment_details JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;
    ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS delivery_gps_link TEXT;
    ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS delivery_distance_km NUMERIC(10, 2);
    ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS delivery_tier_label TEXT;
    ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS points_awarded BOOLEAN DEFAULT false;
    ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS inventory_deducted BOOLEAN DEFAULT false;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'store_branches') THEN
    ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
    ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
    ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS delivery_enabled BOOLEAN DEFAULT true;
    ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS max_delivery_radius_km NUMERIC(10, 2) DEFAULT 15;
    ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS base_delivery_fee NUMERIC(10, 2) DEFAULT 10;
    ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS free_delivery_threshold NUMERIC(10, 2);
    ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS min_order_delivery_amount NUMERIC(10, 2);
    ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS estimated_delivery_minutes INTEGER DEFAULT 35;
    ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS delivery_tiers JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS gps_url TEXT;
  END IF;
END $$;

-- =================================================================================
-- 7. تفعيل Row Level Security (RLS) وسياسات الوصول المحكمة
-- =================================================================================
DO $$
DECLARE
  t TEXT;
  target_tables TEXT[] := ARRAY[
    'store_inventory',
    'store_recipes',
    'supplier_invoices',
    'store_drivers',
    'driver_settlements'
  ];
BEGIN
  FOREACH t IN ARRAY target_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO anon, authenticated, service_role;', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_select_policy', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_insert_policy', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_update_policy', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_delete_policy', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (store_id IS NOT NULL);',
      t || '_select_policy', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO anon, authenticated WITH CHECK (store_id IS NOT NULL);',
      t || '_insert_policy', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO anon, authenticated USING (store_id IS NOT NULL) WITH CHECK (store_id IS NOT NULL);',
      t || '_update_policy', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO anon, authenticated USING (store_id IS NOT NULL);',
      t || '_delete_policy', t
    );
  END LOOP;
END $$;

-- =================================================================================
-- 8. تفعيل البث اللحظي (Supabase Realtime Publication) للجداول الجديدة
-- =================================================================================
DO $$
DECLARE
  t TEXT;
  realtime_tables TEXT[] := ARRAY[
    'store_inventory',
    'store_recipes',
    'supplier_invoices',
    'store_drivers',
    'driver_settlements'
  ];
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY realtime_tables LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', t);
      END IF;
    END LOOP;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
