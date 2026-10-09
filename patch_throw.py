import re

with open('src/lib/supabase.ts', 'r', encoding='utf-8') as f:
    code = f.read()

old_insert = """      const supabase = getSupabaseClient();
      if (supabase && isUUID(resolvedStoreId)) {
        try {
          const { data: created, error } = await supabase
            .from('service_bookings')
            .insert([newBooking as any])
            .select()
            .single();
          if (created) {
            const list: ServiceBooking[] = getLocalData(STORAGE_KEYS.LOCAL_BOOKINGS, []);
            list.unshift(created as unknown as ServiceBooking);
            saveLocalData(STORAGE_KEYS.LOCAL_BOOKINGS, list);
          }
        } catch (e) {
          console.warn('Supabase createServiceBooking fallback', e);
        }
      }"""

old_insert2 = """      const supabase = getSupabaseClient();
      if (supabase && isUUID(resolvedStoreId)) {
        try {
          const { data: created } = await supabase
            .from('service_bookings')
            .insert([newBooking as any])
            .select()
            .single();
          if (created) {
            const list: ServiceBooking[] = getLocalData(STORAGE_KEYS.LOCAL_BOOKINGS, []);
            list.unshift(created as unknown as ServiceBooking);
            saveLocalData(STORAGE_KEYS.LOCAL_BOOKINGS, list);
          }
        } catch (e) {
          console.warn('Supabase createServiceBooking fallback', e);
        }
      }"""

new_insert = """      const supabase = getSupabaseClient();
      if (supabase && isUUID(resolvedStoreId)) {
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
          return created as unknown as ServiceBooking;
        }
      } else {
        throw new Error('قاعدة البيانات غير متصلة.');
      }"""

if old_insert in code:
    code = code.replace(old_insert, new_insert)
elif old_insert2 in code:
    code = code.replace(old_insert2, new_insert)

with open('src/lib/supabase.ts', 'w', encoding='utf-8') as f:
    f.write(code)

print("SUCCESS")
