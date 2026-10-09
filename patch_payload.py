import re

with open('src/lib/supabase.ts', 'r', encoding='utf-8') as f:
    code = f.read()

pattern = r'const newBooking: ServiceBooking = \{\s*\.\.\.booking,\s*service_id: booking\.service_id \|\| \'srv-main\',\s*store_id: resolvedStoreId,\s*id: \'booking-\' \+ Date\.now\(\) \+ \'-\' \+ Math\.random\(\)\.toString\(36\)\.substr\(2, 4\),\s*booking_number: bookingNumber,\s*created_at: new Date\(\)\.toISOString\(\),\s*\};'

replacement = """      const newBooking: ServiceBooking = {
        ...booking,
        service_id: booking.service_id || 'srv-main',
        store_id: resolvedStoreId,
        id: 'booking-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
        booking_number: bookingNumber,
        created_at: new Date().toISOString(),
      };
      
      // Clean up fields that might not exist in the database schema
      const dbPayload = { ...newBooking } as any;
      delete dbPayload.duration_minutes; // Database uses service_duration_minutes
      delete dbPayload.store_name; // Store name shouldn't be in the booking row
      """

code = code.replace(
    "          .insert([newBooking as any])",
    "          .insert([dbPayload])"
)
code = re.sub(pattern, replacement, code)

with open('src/lib/supabase.ts', 'w', encoding='utf-8') as f:
    f.write(code)

print("SUCCESS CLEAN DB PAYLOAD")
