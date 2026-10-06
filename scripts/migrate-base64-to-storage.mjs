#!/usr/bin/env node
/**
 * Base64 -> Supabase Storage migration.
 *
 *   node scripts/migrate-base64-to-storage.mjs            # DRY RUN (default): reports only, writes nothing
 *   node scripts/migrate-base64-to-storage.mjs --apply    # uploads + updates rows
 *
 * Env (never commit):  SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 * Optional:            ASSET_CDN_BASE  e.g. https://cdn.example.com (Cloudflare-proxied) to write CDN URLs.
 *
 * Safety:
 *  - dry-run by default; --apply is required to change anything
 *  - every original data: URL is saved to scripts/.migration-backup/<table>-<id>-<col>.txt BEFORE the row is touched
 *  - a row is only updated after the upload succeeded AND the public URL answers HTTP 200
 *  - idempotent: rows without data: URLs are skipped, so it can be re-run safely
 *  - rows are fetched one at a time (ids first) so a single huge row never loads a whole table
 *  - uploads use content-hash names, so identical images are stored once
 */
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APPLY = process.argv.includes('--apply');
const BUCKET = 'store-assets';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CDN = (process.env.ASSET_CDN_BASE || '').replace(/\/+$/, '');

if (!SUPABASE_URL || !KEY) {
  console.error('Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });
const BACKUP_DIR = join(dirname(fileURLToPath(import.meta.url)), '.migration-backup');
const isData = (v) => typeof v === 'string' && v.trim().toLowerCase().startsWith('data:');
const urlCache = new Map(); // sha1 -> public url
const stats = { found: 0, uploaded: 0, reusedByHash: 0, rowsUpdated: 0, bytesMigrated: 0, failed: 0 };

function parseDataUrl(dataUrl) {
  const m = /^data:([^;,]+)((?:;[^;,]+)*?)(;base64)?,(.*)$/s.exec(dataUrl.trim());
  if (!m) throw new Error('unparseable data URL');
  const mime = m[1].toLowerCase();
  const buf = m[3] ? Buffer.from(m[4], 'base64') : Buffer.from(decodeURIComponent(m[4]));
  return { mime, buf };
}
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' };

function publicUrl(path) {
  if (CDN) return `${CDN}/storage/v1/object/public/${BUCKET}/${path}`;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

function backup(table, id, col, value) {
  mkdirSync(BACKUP_DIR, { recursive: true });
  writeFileSync(join(BACKUP_DIR, `${table}-${id}-${col}.txt`), value);
}

/** Uploads one data URL and returns its public URL (dry-run: returns a placeholder). */
async function migrateValue(folder, dataUrl) {
  stats.found++;
  const { mime, buf } = parseDataUrl(dataUrl);
  const ext = EXT[mime];
  if (!ext) throw new Error(`unsupported mime ${mime}`);
  stats.bytesMigrated += buf.length;
  const hash = createHash('sha1').update(buf).digest('hex');
  if (urlCache.has(hash)) {
    stats.reusedByHash++;
    return urlCache.get(hash);
  }
  const path = `${folder}/${hash}.${ext}`;
  const url = publicUrl(path);
  if (!APPLY) {
    urlCache.set(hash, url);
    return url;
  }
  const { error } = await supabase.storage.from(BUCKET).upload(path, buf, {
    contentType: mime,
    cacheControl: '31536000',
    upsert: true,
  });
  if (error) throw new Error(`upload failed: ${error.message}`);
  // Verify against origin (not the CDN) before we ever point a row at it.
  const origin = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const res = await fetch(origin, { method: 'HEAD' });
  if (!res.ok) throw new Error(`verification HEAD ${res.status} for ${origin}`);
  stats.uploaded++;
  urlCache.set(hash, url);
  return url;
}

async function ids(table) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('id').order('id').range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data.map((r) => r.id));
    if (data.length < 1000) break;
  }
  return out;
}

async function updateRow(table, id, patch) {
  if (!APPLY) return;
  const { error } = await supabase.from(table).update(patch).eq('id', id);
  if (error) throw new Error(`${table}/${id} update: ${error.message}`);
  stats.rowsUpdated++;
}

/** Simple scalar columns: table.col holds a data: URL. */
async function migrateColumn(table, col, folderOf) {
  console.log(`\n== ${table}.${col}`);
  let idList;
  try {
    // Only ids of rows that actually hold a data: URL (server-side filter, tiny payload).
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from(table).select('id').like(col, 'data:%').order('id').range(from, from + 999);
      if (error) throw error;
      out.push(...data.map((r) => r.id));
      if (data.length < 1000) break;
    }
    idList = out;
  } catch (e) {
    console.log(`  skipped (${e.message || e})`);
    return;
  }
  console.log(`  rows with base64: ${idList.length}`);
  for (const id of idList) {
    try {
      const { data: row, error } = await supabase.from(table).select(`id, ${col}${folderOf.cols ? ', ' + folderOf.cols : ''}`).eq('id', id).single();
      if (error) throw new Error(error.message);
      if (!isData(row[col])) continue;
      const url = await migrateValue(folderOf.folder(row), row[col]);
      if (APPLY) backup(table, id, col, row[col]);
      await updateRow(table, id, { [col]: url });
      console.log(`  ${APPLY ? 'updated' : 'would update'} ${table}/${id}`);
    } catch (e) {
      stats.failed++;
      console.error(`  FAILED ${table}/${id}: ${e.message}`);
    }
  }
}

/** stores.slider_images: jsonb array of { image_url, ... } */
async function migrateSliders() {
  console.log('\n== stores.slider_images');
  const all = await ids('stores');
  for (const id of all) {
    try {
      const { data: row, error } = await supabase.from('stores').select('id, slider_images').eq('id', id).single();
      if (error) throw new Error(error.message);
      let slides = row.slider_images;
      if (typeof slides === 'string') {
        try { slides = JSON.parse(slides); } catch { continue; }
      }
      if (!Array.isArray(slides) || !slides.some((s) => isData(s?.image_url))) continue;
      const next = [];
      for (const s of slides) {
        next.push(isData(s?.image_url) ? { ...s, image_url: await migrateValue(`stores/${id}/slider`, s.image_url) } : s);
      }
      if (APPLY) backup('stores', id, 'slider_images', JSON.stringify(slides));
      await updateRow('stores', id, { slider_images: next });
      console.log(`  ${APPLY ? 'updated' : 'would update'} stores/${id} (${next.length} slides)`);
    } catch (e) {
      stats.failed++;
      console.error(`  FAILED stores/${id}: ${e.message}`);
    }
  }
}

/** customer_coupons.privilege_image_url: resolve via privileges.image_url when possible, else upload (dedup by hash). */
async function migrateCouponImages() {
  console.log('\n== customer_coupons.privilege_image_url');
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('customer_coupons').select('id').like('privilege_image_url', 'data:%').order('id').range(from, from + 999);
    if (error) { console.log(`  skipped (${error.message})`); return; }
    out.push(...data.map((r) => r.id));
    if (data.length < 1000) break;
  }
  console.log(`  rows with base64: ${out.length}`);
  for (const id of out) {
    try {
      const { data: row, error } = await supabase.from('customer_coupons').select('id, store_id, privilege_image_url').eq('id', id).single();
      if (error) throw new Error(error.message);
      if (!isData(row.privilege_image_url)) continue;
      const url = await migrateValue(`stores/${row.store_id}/privileges`, row.privilege_image_url);
      if (APPLY) backup('customer_coupons', id, 'privilege_image_url', row.privilege_image_url);
      await updateRow('customer_coupons', id, { privilege_image_url: url });
    } catch (e) {
      stats.failed++;
      console.error(`  FAILED customer_coupons/${id}: ${e.message}`);
    }
  }
  console.log(`  ${APPLY ? 'done' : 'dry-run only'}`);
}

console.log(`Mode: ${APPLY ? 'APPLY (writes enabled)' : 'DRY RUN (no writes)'}  bucket=${BUCKET}`);
if (APPLY) {
  const { data: b } = await supabase.storage.getBucket(BUCKET);
  if (!b) { console.error(`Bucket "${BUCKET}" does not exist. Apply supabase/migrations/20261006_egress_store_assets_bucket.sql first.`); process.exit(1); }
}

await migrateColumn('stores', 'logo_url', { folder: (r) => `stores/${r.id}/logo` });
await migrateSliders();
await migrateColumn('privileges', 'image_url', { cols: 'store_id', folder: (r) => `stores/${r.store_id}/privileges` });
await migrateCouponImages();
await migrateColumn('catalog_items', 'image_url', { cols: 'store_id', folder: (r) => `stores/${r.store_id}/catalog` });
await migrateColumn('store_specialists', 'avatar_url', { cols: 'store_id', folder: (r) => `stores/${r.store_id}/specialists` });

console.log('\n== Summary', { ...stats, MBMigrated: +(stats.bytesMigrated / 1048576).toFixed(2) });
if (stats.failed) { console.error('Some rows failed; they were left untouched. Re-run after fixing.'); process.exit(2); }
