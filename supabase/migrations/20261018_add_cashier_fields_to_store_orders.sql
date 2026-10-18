-- Migration: Add cashier_id, cashier_name, and order_source to store_orders table
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS cashier_id TEXT;
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS cashier_name TEXT;
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS order_source TEXT;
