-- ==============================================================================
-- 20261006_egress_store_assets_bucket.sql
-- Public Storage bucket for all store images (served via Supabase CDN / Cloudflare).
-- Idempotent. Apply BEFORE deploying the new uploader and BEFORE running
-- scripts/migrate-base64-to-storage.mjs --apply
-- ==============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'store-assets', 'store-assets', true,
  2 * 1024 * 1024,                                   -- 2 MB hard cap per object
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public READ is implicit for public buckets (object URLs). Writes from the browser
-- (anon key) are limited to INSERT of new objects in this bucket only: no update/delete.
drop policy if exists "store_assets_insert" on storage.objects;
create policy "store_assets_insert"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'store-assets');

drop policy if exists "store_assets_select" on storage.objects;
create policy "store_assets_select"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'store-assets');

-- NOTE: the uploader uses upsert:true with content-hash filenames. Re-uploading identical
-- bytes hits an existing object, which needs UPDATE permission; if you prefer not to grant
-- it, change `upsert` to false in imageCompressor.ts and treat "already exists" as success.
drop policy if exists "store_assets_update" on storage.objects;
create policy "store_assets_update"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'store-assets')
  with check (bucket_id = 'store-assets');
