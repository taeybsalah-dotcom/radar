/**
 * 🚀 Radar Loyalty Engine - Automated Base64 to Supabase Storage Migration Script
 * يقوم هذا السكربت بفحص قاعدة البيانات واستخراج جميع الصور المخزنة بصيغة Base64،
 * ورفعها كملفات حقيقية إلى Supabase Storage Bucket (store-assets)،
 * ثم تحديث سجلات المتاجر في قاعدة البيانات بالروابط العامة (Public URLs) بدلاً من Base64.
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// قراءة المتغيرات من .env يدوياً إن لم تكن معرفة
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const idx = trimmed.indexOf('=');
        if (idx !== -1) {
          const key = trimmed.substring(0, idx).trim();
          const val = trimmed.substring(idx + 1).trim();
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    });
  }
}

loadEnv();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://zagpvflyizbmzsbmhnts.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Bx1NGkxLxilvNA3RgcioVQ_t8zlk72H';
const BUCKET_NAME = 'store-assets';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function parseBase64(dataUrl) {
  const matches = dataUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    // محاولة الاستخراج بدون Header صريح إن وجد
    const rawMatch = dataUrl.indexOf('base64,');
    if (rawMatch !== -1) {
      const b64Data = dataUrl.substring(rawMatch + 7);
      return {
        mimeType: 'image/png',
        ext: 'png',
        buffer: Buffer.from(b64Data, 'base64')
      };
    }
    return null;
  }

  const mimeType = matches[1];
  let ext = 'png';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
  else if (mimeType.includes('webp')) ext = 'webp';
  else if (mimeType.includes('svg')) ext = 'svg';
  else if (mimeType.includes('gif')) ext = 'gif';

  const buffer = Buffer.from(matches[2], 'base64');
  return { mimeType, ext, buffer };
}

async function verifyBucketExists() {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) {
    console.warn('⚠️ تعذر جلب قائمة الـ Buckets:', error.message);
    return false;
  }
  const exists = buckets.some((b) => b.name === BUCKET_NAME || b.id === BUCKET_NAME);
  return exists;
}

async function migrateStores() {
  console.log('\n======================================================');
  console.log('🔄 بدء فحص وتنظيف صور المتاجر في قاعدة البيانات...');
  console.log(`🌐 Supabase URL: ${SUPABASE_URL}`);
  console.log(`🗄️ Storage Bucket: ${BUCKET_NAME}`);
  console.log('======================================================\n');

  const bucketExists = await verifyBucketExists();
  if (!bucketExists) {
    console.warn(`⚠️ تنبيه: الحاوية '${BUCKET_NAME}' لم يتم العثور عليها أو لم يتم إنشاؤها بعد.`);
    console.warn(`يرجى تنفيذ ملف 'supabase_storage_setup.sql' داخل Supabase SQL Editor أولاً.\n`);
  }

  const { data: stores, error: fetchErr } = await supabase
    .from('stores')
    .select('id, name, slug, logo_url, slider_images');

  if (fetchErr) {
    console.error('❌ فشل جلب المتاجر من قاعدة البيانات:', fetchErr.message);
    return;
  }

  if (!stores || stores.length === 0) {
    console.log('✨ لا توجد متاجر في قاعدة البيانات.');
    return;
  }

  let migratedCount = 0;
  let totalSavedKB = 0;

  for (const store of stores) {
    let storeUpdated = false;
    let newLogoUrl = store.logo_url;
    let newSliderImages = Array.isArray(store.slider_images) ? [...store.slider_images] : [];

    console.log(`\n🏬 فحص المتجر: ${store.name} (${store.slug})`);

    // 1. معالجة logo_url
    if (typeof store.logo_url === 'string' && store.logo_url.startsWith('data:')) {
      const parsed = parseBase64(store.logo_url);
      if (parsed) {
        const originalSizeKB = Math.round(parsed.buffer.length / 1024);
        const fileName = `logos/${store.slug || store.id}-${Date.now()}.${parsed.ext}`;

        console.log(`  📸 تم اكتشاف شعار Base64 بحجم (${originalSizeKB} KB). جاري الرفع إلى Storage...`);

        const { error: uploadErr } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(fileName, parsed.buffer, {
            contentType: parsed.mimeType,
            cacheControl: '31536000',
            upsert: true,
          });

        if (uploadErr) {
          console.error(`  ❌ فشل رفع الشعار: ${uploadErr.message}`);
        } else {
          const { data: publicUrlData } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(fileName);

          newLogoUrl = publicUrlData.publicUrl;
          storeUpdated = true;
          totalSavedKB += originalSizeKB;
          console.log(`  ✅ تم الرفع بنجاح! الرابط العام: ${newLogoUrl}`);
        }
      }
    } else if (typeof store.logo_url === 'string' && store.logo_url.startsWith('http')) {
      console.log(`  ℹ️ الشعار سليم ومرفوع مسبقاً كرابط URL.`);
    } else {
      console.log(`  ℹ️ لا يوجد شعار مسجل.`);
    }

    // 2. معالجة slider_images
    if (Array.isArray(store.slider_images) && store.slider_images.length > 0) {
      let sliderModified = false;
      for (let i = 0; i < newSliderImages.length; i++) {
        const slide = newSliderImages[i];
        if (typeof slide?.image_url === 'string' && slide.image_url.startsWith('data:')) {
          const parsed = parseBase64(slide.image_url);
          if (parsed) {
            const originalSizeKB = Math.round(parsed.buffer.length / 1024);
            const fileName = `sliders/${store.slug || store.id}-slide-${i + 1}-${Date.now()}.${parsed.ext}`;

            console.log(`  🖼️ تم اكتشاف صورة سلايدر Base64 (${originalSizeKB} KB). جاري الرفع...`);
            const { error: uploadErr } = await supabase.storage
              .from(BUCKET_NAME)
              .upload(fileName, parsed.buffer, {
                contentType: parsed.mimeType,
                cacheControl: '31536000',
                upsert: true,
              });

            if (!uploadErr) {
              const { data: publicUrlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(fileName);
              newSliderImages[i] = { ...slide, image_url: publicUrlData.publicUrl };
              sliderModified = true;
              storeUpdated = true;
              totalSavedKB += originalSizeKB;
              console.log(`  ✅ تم رفع السلايدر بنجاح! الرابط: ${publicUrlData.publicUrl}`);
            }
          }
        }
      }
    }

    // 3. تحديث سجل المتجر في قاعدة البيانات
    if (storeUpdated) {
      const updatePayload = {
        logo_url: newLogoUrl,
        slider_images: newSliderImages,
        updated_at: new Date().toISOString(),
      };

      const { error: updateErr } = await supabase
        .from('stores')
        .update(updatePayload)
        .eq('id', store.id);

      if (updateErr) {
        console.error(`  ❌ فشل تحديث سجل المتجر في قاعدة البيانات: ${updateErr.message}`);
      } else {
        console.log(`  🎉 تم تنظيف وحفظ بيانات المتجر بنجاح في قاعدة البيانات.`);
        migratedCount++;
      }
    }
  }

  // 4. معالجة جدول الامتيازات والمكافآت (privileges) إن وجدت
  const { data: privs } = await supabase.from('privileges').select('id, store_id, title, image_url');
  if (privs && privs.length > 0) {
    for (const priv of privs) {
      if (typeof priv.image_url === 'string' && priv.image_url.startsWith('data:')) {
        const parsed = parseBase64(priv.image_url);
        if (parsed) {
          const fileName = `privileges/${priv.store_id || 'general'}-${priv.id}-${Date.now()}.${parsed.ext}`;
          const { error: uploadErr } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(fileName, parsed.buffer, {
              contentType: parsed.mimeType,
              cacheControl: '31536000',
              upsert: true,
            });
          if (!uploadErr) {
            const { data: pUrl } = supabase.storage.from(BUCKET_NAME).getPublicUrl(fileName);
            await supabase.from('privileges').update({ image_url: pUrl.publicUrl }).eq('id', priv.id);
            console.log(`✅ تم ترحيل صورة الامتياز [${priv.title}] إلى Storage.`);
          }
        }
      }
    }
  }

  console.log('\n======================================================');
  console.log(`🏁 اكتملت عملية الترحيل بنجاح!`);
  console.log(`📊 إجمالي المتاجر التي تم تنظيفها وترحيل صورها: ${migratedCount}`);
  console.log(`💾 إجمالي حجم البيانات الموفر من قاعدة البيانات: ~${totalSavedKB} KB (${(totalSavedKB / 1024).toFixed(2)} MB)`);
  console.log('======================================================\n');
}

migrateStores().catch((err) => {
  console.error('❌ خطأ غير متوقع أثناء الترحيل:', err);
  process.exit(1);
});
