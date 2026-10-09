import re

with open('src/lib/supabase.ts', 'r', encoding='utf-8') as f:
    code = f.read()

pattern = r'if \(supabase && isUUID\(resolvedStoreId\)\) \{\s*try \{\s*const \{ data: created \} = await supabase\s*\.from\(\'service_bookings\'\)\s*\.insert\(\[newBooking as any\]\)\s*\.select\(\)\s*\.single\(\);\s*if \(created\) \{\s*const list: ServiceBooking\[\] = getLocalData\(STORAGE_KEYS\.LOCAL_BOOKINGS, \[\]\);\s*list\.unshift\(created as unknown as ServiceBooking\);\s*saveLocalData\(STORAGE_KEYS\.LOCAL_BOOKINGS, list\);\s*\}\s*\} catch \(e\) \{\s*console\.warn\(\'Supabase createServiceBooking fallback\', e\);\s*\}\s*\}'

replacement = """      if (supabase && isUUID(resolvedStoreId)) {
        const { data: created, error } = await supabase
          .from('service_bookings')
          .insert([newBooking as any])
          .select()
          .single();
          
        if (error) {
          console.error('Supabase createServiceBooking error', error);
          throw new Error('فشل إرسال الحجز للسيرفر: ' + error.message);
        }
        
        if (created) {
          const list: ServiceBooking[] = getLocalData(STORAGE_KEYS.LOCAL_BOOKINGS, []);
          list.unshift(created as unknown as ServiceBooking);
          saveLocalData(STORAGE_KEYS.LOCAL_BOOKINGS, list);
        }
      } else {
        throw new Error('قاعدة البيانات غير متصلة.');
      }"""

code = re.sub(pattern, replacement, code)

with open('src/lib/supabase.ts', 'w', encoding='utf-8') as f:
    f.write(code)

print("SUCCESS FIX THROW")
