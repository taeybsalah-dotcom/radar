# 👑 RADAR MULTI-TENANT WHITE-LABEL ARCHITECTURE & ROLLOUT PROTOCOL
**Date of Ratification:** October 2026  
**Status:** SOVEREIGN PRODUCTION STANDARD (MANDATORY FOR ALL DEVELOPERS AND AI AGENTS)

---

## 🏛️ 1. The 3 System Pillars (الأركان الثلاثة للنظام)

This ecosystem is strictly divided into three distinct layers. NEVER mix them.

### A. The Master Control Hub (لوحة المايسترو الأم)
- **Local Address:** `http://localhost:3001` (Executed from directory `d:\Radar\master-control`).
- **Nature:** Air-gapped, offline, private sovereign control tool for the platform OWNER ONLY.
- **NEVER DEPLOY TO CLOUDFLARE OR INTERNET.**
- **Contents:** Manages the registry of active external white-label resellers (e.g. `سديم الأثر`).
- **Core Powers:**
  1. **Remote Kill Switch:** Instantly suspends/activates reseller instances via `set_platform_status` RPC.
  2. **Remote Password Reset:** Resets admin passwords on reseller Supabase via `reset_admin_password` RPC.
  3. **Direct Branding Manager:** Uploads reseller logos and syncs `tenant_branding` table via `set_tenant_branding` RPC.
  4. **Batch SQL Rollout:** Executes approved SQL updates across all registered reseller DBs via `exec_master_sql` RPC.
- **Rule:** Radar itself is the headquarters and testbed; RADAR IS NEVER ADDED AS A RESELLER IN THIS PANEL.

### B. Radar Mother Platform (منصة رادار - حقل التجارب والمختبر)
- **Production Domain:** `https://myradar.sarl`
- **Database:** `https://zagpvflyizbmzsbmhnts.supabase.co`
- **Git Branch:** `main`
- **Purpose:** Development, new feature testing, and benchmark staging. All new code and SQL must be deployed and tested here FIRST.

### C. Wholesale Resellers (منصات الوكلاء المستقلين)
- **Example Client:** Sadeem Al-Athar (`https://sadim-alathir.pages.dev`).
- **Database:** Dedicated isolated Supabase instances (e.g. `https://kspfiijorengpckdlymx.supabase.co`).
- **Git Branch:** `resellers-release`
- **Purpose:** 100% White-Label production environments for real clients and their merchants. Zero hardcoded references to "Radar" are allowed here.

---

## 🛡️ 2. The Sovereign Security Token (التوكن السيادي)
All administrative RPC calls from the Master Control panel (`set_platform_status`, `reset_admin_password`, `set_tenant_branding`, `exec_master_sql`) are authenticated inside PostgreSQL by verifying:
```
p_master_token: <value of VITE_SOVEREIGN_MASTER_TOKEN in master-control/.env.local — git-ignored, never commit>
```
Verified against bcrypt hash stored in `public.reseller_master_auth`.  
Any call without this token is immediately rejected with `401 Unauthorized`.

---

## 🚀 3. Future Feature Rollout Workflow (آلية العمل للتحديثات القادمة)

When the owner requests a new feature or database change:

```
[ Step 1: Develop & Test on Radar ]
   │
   ├── 1.1 Write new code on Git branch `main`.
   ├── 1.2 Run SQL migrations on Radar Supabase DB (`zagpvflyizbmzsbmhnts`).
   └── 1.3 The Owner tests the feature live on Radar (`myradar.sarl`).
   │
[ Step 2: Owner Approval ]
   │
   └── The Owner approves: "الميزة ممتازة، اعتمد وعمم على الوكلاء".
   │
[ Step 3: Production Rollout to Resellers ]
   │
   ├── A. Frontend Code:
   │    Merge `main` into `resellers-release` and push to GitHub:
   │    `git checkout resellers-release && git merge main && git push origin resellers-release`
   │    Cloudflare Pages for all resellers rebuilds and updates automatically.
   │
   └── B. Database Schema:
        Paste the approved SQL migration into Master Control (`http://localhost:3001`)
        under the "تعميم تحديث SQL على الوكلاء" tool and click "تعميم التحديث".
        It executes across all active reseller databases simultaneously via `exec_master_sql`.
```

---

## 🎨 4. Zero-Flicker White-Label Rules
1. `index.html` must remain neutral (`منصة الولاء والمبيعات الذكية` with neutral SVG).
2. `tenant_branding` table stores the brand identity, cached instantly in `localStorage` under `radar_cached_tenant_branding`.
3. If connecting to a different Supabase URL, `src/lib/supabase.ts` automatically purges local tenant cache to prevent cross-contamination.
4. When writing code, NEVER hardcode "رادار" or "Radar" in user-facing views. Always use `getActiveTenantConfig().brandName` or `getActiveTenantConfig().brandEnglishName`.
