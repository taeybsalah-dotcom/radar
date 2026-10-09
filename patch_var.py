import re

with open('src/components/CustomerWallet.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Remove the inner declaration
code = code.replace(
    "const customerServiceBookings = storeBookings.filter(\n          (b) => b.customer_phone === customer?.phone || normalizePhone(b.customer_phone) === normalizePhone(customer?.phone || '')\n        );",
    ""
)

# Insert it right after `const [storeBookings, setStoreBookings] = useState<ServiceBooking[]>([]);`
insert_point = "const [storeBookings, setStoreBookings] = useState<ServiceBooking[]>([]);"
new_decl = """const [storeBookings, setStoreBookings] = useState<ServiceBooking[]>([]);
  const customerServiceBookings = storeBookings.filter(
    (b) => b.customer_phone === customer?.phone || normalizePhone(b.customer_phone) === normalizePhone(customer?.phone || '')
  );"""

code = code.replace(insert_point, new_decl)

# Also fix the implicit `any` in `customerServiceBookings.map((bk) => (`
# Change `bk` to `bk: any`
code = code.replace("{customerServiceBookings.map((bk) => (", "{customerServiceBookings.map((bk: any) => (")

with open('src/components/CustomerWallet.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("SUCCESS VAR FIX")
