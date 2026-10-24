import fs from 'fs';
import path from 'path';

const MIGRATIONS_DIR = path.resolve('supabase/migrations');
const OUTPUT_FILE = path.resolve('supabase/COMPLETE_RESELLER_SCHEMA_BUNDLE.sql');

console.log('📦 Rebuilding COMPLETE_RESELLER_SCHEMA_BUNDLE.sql...');

const files = fs.readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql') && !f.includes('rollback') && !f.includes('test_'))
  .sort();

let bundle = `-- ==============================================================================
-- 🚀 RADAR WHITE-LABEL COMPLETE RESELLER DATABASE BUNDLE
-- Generated At: ${new Date().toISOString()}
-- Total Migrations: ${files.length}
-- ==============================================================================

-- 0. Ensure pgcrypto extension exists for password hashing and tokens
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 0.1 Sovereign Master Auth Table for Remote Administration
CREATE TABLE IF NOT EXISTS public.reseller_master_auth (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_token_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reseller_master_auth ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reseller_master_auth FROM anon, authenticated;

-- Insert default sovereign master token hash
INSERT INTO public.reseller_master_auth (master_token_hash)
VALUES (crypt('radar_sovereign_master_2026_killswitch_key', gen_salt('bf')))
ON CONFLICT DO NOTHING;

`;

for (const file of files) {
  const filePath = path.join(MIGRATIONS_DIR, file);
  const sql = fs.readFileSync(filePath, 'utf8');
  bundle += `\n\n-- ==============================================================================\n`;
  bundle += `-- >>> FILE: ${file} <<<\n`;
  bundle += `-- ==============================================================================\n\n`;
  bundle += sql.trim() + `\n`;
}

// Write the master bundle file
fs.writeFileSync(OUTPUT_FILE, bundle, 'utf8');

const stats = fs.statSync(OUTPUT_FILE);
console.log(`✅ Successfully generated COMPLETE_RESELLER_SCHEMA_BUNDLE.sql (${(stats.size / 1024).toFixed(1)} KB)`);
