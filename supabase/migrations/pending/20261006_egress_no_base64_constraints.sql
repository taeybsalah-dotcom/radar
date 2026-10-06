-- ==============================================================================
-- 20261006_egress_no_base64_constraints.sql  — DO NOT APPLY until
-- `node scripts/migrate-base64-to-storage.mjs --apply` has completed and its
-- re-run reports 0 remaining data: URLs. Rows are checked as NOT VALID so existing
-- data is never rewritten, but every NEW insert/update must be a URL.
-- ==============================================================================
alter table public.stores
  add constraint stores_logo_not_base64 check (logo_url is null or logo_url not like 'data:%') not valid,
  add constraint stores_slider_not_base64 check (slider_images is null or slider_images::text not like '%data:image%') not valid;

alter table public.privileges
  add constraint privileges_image_not_base64 check (image_url is null or image_url not like 'data:%') not valid;

alter table public.customer_coupons
  add constraint coupons_image_not_base64 check (privilege_image_url is null or privilege_image_url not like 'data:%') not valid;
