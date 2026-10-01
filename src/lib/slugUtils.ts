// ==============================================================================
// 🛡️ RADAR LOYALTY ENGINE — SLUG GENERATION & TRANSLITERATION UTILITY
// Purpose: Deterministic Arabic-to-English Transliteration, URL Safety & Collision Resolution
// Policy: Strict ASCII lowercase output, zero punctuation bugs, auto-suffixing on collisions.
// ==============================================================================

import { Store } from '../types';
import { getSupabaseClient, LoyaltyService } from './supabase';

/**
 * Common Arabic words dictionary for higher quality, semantic English slugs.
 */
const ARABIC_WORD_DICTIONARY: Record<string, string> = {
  بن: 'bin',
  ابن: 'ibn',
  ابو: 'abu',
  أبو: 'abu',
  ام: 'um',
  أم: 'um',
  آل: 'al',
  ال: 'al',
  و: 'w',
  كافيه: 'cafe',
  مقهى: 'cafe',
  قهوة: 'coffee',
  شاي: 'tea',
  مطعم: 'restaurant',
  مطابخ: 'kitchens',
  مطبخ: 'kitchen',
  دكتور: 'dr',
  مخبز: 'bakery',
  مخابز: 'bakery',
  حلويات: 'sweets',
  حلا: 'hala',
  شاورما: 'shawarma',
  برجر: 'burger',
  بيتزا: 'pizza',
  فطائر: 'pies',
  فطاير: 'pies',
  عصير: 'juice',
  عصائر: 'juice',
  مشويات: 'grill',
  مشوي: 'grill',
  سوبرماركت: 'supermarket',
  بقالة: 'grocery',
  تموينات: 'grocery',
  صيدلية: 'pharmacy',
  عطور: 'perfumes',
  عطر: 'perfume',
  زهور: 'flowers',
  ورد: 'flowers',
  صالون: 'salon',
  حلاق: 'barber',
  مغسلة: 'laundry',
  غسيل: 'wash',
  مجوهرات: 'jewelry',
  ذهب: 'gold',
  نظارات: 'optics',
  بصريات: 'optics',
  خياط: 'tailor',
  مكتبة: 'bookstore',
  قرطاسية: 'stationery',
  متجر: 'store',
  محل: 'shop',
  سوق: 'market',
  مركز: 'center',
  مؤسسة: 'corp',
  شركة: 'co',
  خدمات: 'services',
  اكاديمية: 'academy',
  أكاديمية: 'academy',
  رادار: 'radar',
  بطاطس: 'batatas',
  واليا: 'walia',
  الضيعة: 'aldaia',
  السعادة: 'alsaada',
  البركة: 'albaraka',
  الريف: 'alreef',
  الواحة: 'alwaha',
  النخيل: 'alnakhil',
  الرياض: 'riyadh',
  جدة: 'jeddah',
  مكة: 'makkah',
  المدينة: 'madinah',
  الدمام: 'dammam',
  الخبر: 'khobar',
};

/**
 * Phonetic letter-by-letter Arabic to English mapping
 */
const ARABIC_CHAR_MAP: Record<string, string> = {
  'ء': '',
  'آ': 'aa',
  'أ': 'a',
  'ؤ': 'w',
  'إ': 'e',
  'ئ': 'y',
  'ا': 'a',
  'ب': 'b',
  'ة': 'a',
  'ت': 't',
  'ث': 'th',
  'ج': 'j',
  'ح': 'h',
  'خ': 'kh',
  'د': 'd',
  'ذ': 'dh',
  'ر': 'r',
  'ز': 'z',
  'س': 's',
  'ش': 'sh',
  'ص': 's',
  'ض': 'd',
  'ط': 't',
  'ظ': 'z',
  'ع': 'a',
  'غ': 'gh',
  'ف': 'f',
  'ق': 'q',
  'ك': 'k',
  'ل': 'l',
  'م': 'm',
  'ن': 'n',
  'ه': 'h',
  'و': 'w',
  'ى': 'a',
  'ي': 'y',
  'پ': 'p',
  'چ': 'ch',
  'ڤ': 'v',
  'گ': 'g',
};

/**
 * Reserved slugs that cannot be assigned to stores
 */
export const RESERVED_SYSTEM_SLUGS = new Set([
  'admin',
  'super-admin',
  'superadmin',
  'owner',
  'partner',
  'partners',
  'join',
  'cashier',
  'pos',
  'customer',
  'wallet',
  'api',
  'app',
  'track',
  'login',
  'logout',
  'auth',
  'onboarding',
  'billing',
  'assets',
  'dashboard',
  'root',
  'null',
  'undefined',
  'test',
]);

/**
 * Transliterates Arabic text into phonetic English ASCII
 */
export function transliterateArabicToEnglish(rawText: string): string {
  if (!rawText || typeof rawText !== 'string') return '';

  // Remove diacritics / Tashkeel
  const textWithoutDiacritics = rawText
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .trim();

  const words = textWithoutDiacritics.split(/\s+/);
  const transliteratedWords = words.map((word) => {
    // 1. Clean word of surrounding punctuation
    const cleanWord = word.toLowerCase().replace(/^[^\u0600-\u06FFa-zA-Z0-9]+|[^\u0600-\u06FFa-zA-Z0-9]+$/g, '');
    if (!cleanWord) return '';

    // 2. Check direct dictionary match
    if (ARABIC_WORD_DICTIONARY[cleanWord]) {
      return ARABIC_WORD_DICTIONARY[cleanWord];
    }

    // 3. Handle 'ال' prefix (Definite article)
    let remainder = cleanWord;
    let prefix = '';
    if (remainder.startsWith('ال') && remainder.length > 3) {
      const baseNoun = remainder.substring(2);
      if (ARABIC_WORD_DICTIONARY[baseNoun]) {
        return `al-${ARABIC_WORD_DICTIONARY[baseNoun]}`;
      }
      prefix = 'al-';
      remainder = baseNoun;
    }

    // 4. Character-by-character transliteration
    let converted = '';
    for (let i = 0; i < remainder.length; i++) {
      const ch = remainder[i];
      if (ARABIC_CHAR_MAP[ch] !== undefined) {
        converted += ARABIC_CHAR_MAP[ch];
      } else if (/[a-zA-Z0-9]/.test(ch)) {
        converted += ch;
      }
    }

    return prefix + converted;
  });

  return transliteratedWords.filter(Boolean).join('-');
}

/**
 * Generates a clean, lowercase URL-safe slug from any input string
 */
export function generateSafeSlug(rawName: string): string {
  if (!rawName || typeof rawName !== 'string') return '';

  const hasArabic = /[\u0600-\u06FF]/.test(rawName);
  let processed = rawName;

  if (hasArabic) {
    processed = transliterateArabicToEnglish(rawName);
  }

  const cleanSlug = processed
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric ASCII with single hyphen
    .replace(/-+/g, '-')         // Collapse consecutive hyphens
    .replace(/^-+|-+$/g, '');    // Trim leading and trailing hyphens

  return cleanSlug || 'store';
}

/**
 * Resolves a guaranteed unique store slug against both local and database stores
 * Appends -2, -3, or a random suffix if collisions occur.
 */
export async function resolveUniqueStoreSlug(
  candidateNameOrSlug: string,
  existingStores?: Store[],
  excludeStoreId?: string
): Promise<string> {
  const baseSlug = generateSafeSlug(candidateNameOrSlug);
  let initialSlug = baseSlug;

  // If baseSlug matches a reserved system path, suffix it immediately
  if (RESERVED_SYSTEM_SLUGS.has(initialSlug)) {
    initialSlug = `${initialSlug}-store`;
  }

  // 1. Gather all existing slugs from memory and LocalStorage
  const allStores = existingStores || (await LoyaltyService.getAllStores());
  const occupiedSlugs = new Set<string>(
    allStores
      .filter((s) => (excludeStoreId ? s.id !== excludeStoreId : true))
      .map((s) => (s.slug || '').toLowerCase().trim())
      .filter(Boolean)
  );

  // 2. Also check with Supabase database if available
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data: dbStores } = await supabase
        .from('stores')
        .select('id, slug')
        .or(`slug.eq.${initialSlug},slug.like.${initialSlug}-%`)
        .limit(50);

      if (dbStores) {
        dbStores.forEach((st: { id: string; slug: string }) => {
          if (!excludeStoreId || st.id !== excludeStoreId) {
            if (st.slug) occupiedSlugs.add(st.slug.toLowerCase().trim());
          }
        });
      }
    } catch {
      // Non-blocking fallback to memory occupiedSlugs
    }
  }

  // 3. Fast check: if not taken, return immediately
  if (!occupiedSlugs.has(initialSlug) && !RESERVED_SYSTEM_SLUGS.has(initialSlug)) {
    return initialSlug;
  }

  // 4. Sequential numeric suffixing (-2, -3, ... -99)
  let counter = 2;
  let candidateSlug = `${initialSlug}-${counter}`;
  while (counter <= 99) {
    if (!occupiedSlugs.has(candidateSlug) && !RESERVED_SYSTEM_SLUGS.has(candidateSlug)) {
      return candidateSlug;
    }
    counter++;
    candidateSlug = `${initialSlug}-${counter}`;
  }

  // 5. Fallback random hash if 99 collisions happen
  const randomSuffix = Math.random().toString(36).substring(2, 6);
  return `${initialSlug}-${randomSuffix}`;
}
