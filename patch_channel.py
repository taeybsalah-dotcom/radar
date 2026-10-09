import re

with open('src/components/CashierPOS.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

pattern = r'\.on\(\s*\'postgres_changes\',\s*\{\s*event:\s*\'\*\',\s*schema:\s*\'public\',\s*table:\s*\'store_orders\',\s*filter:\s*`store_id=eq\.\$\{store\.id\}`\s*\},\s*\(payload:\s*any\)\s*=>\s*\{\s*if\s*\(payload\.eventType\s*===\s*\'INSERT\'\)\s*\{\s*setLiveOrders\(prev\s*=>\s*\[\.\.\.prev,\s*payload\.new\]\);\s*try\s*\{\s*playBeepSound\(\'success\'\);\s*\}\s*catch\(e\)\{\}\s*\}\s*else\s*if\s*\(payload\.eventType\s*===\s*\'UPDATE\'\)\s*\{\s*setLiveOrders\(prev\s*=>\s*prev\.map\(o\s*=>\s*o\.id\s*===\s*payload\.new\.id\s*\?\s*payload\.new\s*:\s*o\)\);\s*\}\s*else\s*if\s*\(payload\.eventType\s*===\s*\'DELETE\'\)\s*\{\s*setLiveOrders\(prev\s*=>\s*prev\.filter\(o\s*=>\s*o\.id\s*!==\s*payload\.old\.id\)\);\s*\}\s*\}\s*\)'

replacement = """        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'store_orders',
            filter: `store_id=eq.${store.id}`
          },
          (payload: any) => {
            if (payload.eventType === 'INSERT') {
              setLiveOrders(prev => [...prev, payload.new]);
              try { playBeepSound('success'); } catch(e){}
            } else if (payload.eventType === 'UPDATE') {
              setLiveOrders(prev => prev.map(o => o.id === payload.new.id ? payload.new : o));
            } else if (payload.eventType === 'DELETE') {
              setLiveOrders(prev => prev.filter(o => o.id !== payload.old.id));
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'service_bookings',
            filter: `store_id=eq.${store.id}`
          },
          (payload: any) => {
            if (payload.eventType === 'INSERT') {
              setLiveBookings(prev => [...prev, payload.new]);
              try { playBeepSound('success'); } catch(e){}
            } else if (payload.eventType === 'UPDATE') {
              setLiveBookings(prev => prev.map(o => o.id === payload.new.id ? payload.new : o));
            } else if (payload.eventType === 'DELETE') {
              setLiveBookings(prev => prev.filter(o => o.id !== payload.old.id));
            }
          }
        )"""

# Instead of regex, I will do a manual replace by slicing
code = re.sub(pattern, replacement, code)

with open('src/components/CashierPOS.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("SUCCESS CHANNEL PATCH")
