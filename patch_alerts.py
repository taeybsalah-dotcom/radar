import re

with open('src/lib/supabase.ts', 'r', encoding='utf-8') as f:
    code = f.read()

code = code.replace(
    "} catch (e) {\n        console.warn('Supabase getLiveStoreBookings failed', e);\n      }",
    "} catch (e: any) {\n        console.warn('Supabase getLiveStoreBookings failed', e);\n        alert('Get Bookings Error: ' + e.message);\n      }"
)

# And if there is an error from the query itself:
query_code = """          const { data, error } = await (supabase as any).from('service_bookings')
            .select('*')
            .eq('store_id', resolvedStoreId)
            .in('status', ['pending', 'confirmed'])
            .order('booking_date', { ascending: true })
            .order('booking_time', { ascending: true });
          if (!error && data) return data as any;"""

new_query_code = """          const { data, error } = await (supabase as any).from('service_bookings')
            .select('*')
            .eq('store_id', resolvedStoreId)
            .in('status', ['pending', 'confirmed'])
            .order('booking_date', { ascending: true })
            .order('booking_time', { ascending: true });
          if (error) {
            console.error('getLiveStoreBookings error:', error);
            alert('Cashier DB Error: ' + error.message);
          }
          if (!error && data) return data as any;"""

code = code.replace(query_code, new_query_code)

with open('src/lib/supabase.ts', 'w', encoding='utf-8') as f:
    f.write(code)

print("SUCCESS INJECT ALERTS")
