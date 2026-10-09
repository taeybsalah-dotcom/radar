import re

with open('src/components/CustomerWallet.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# I will use re.sub to remove the whole tabs div and the condition wrapper
# The tabs div starts with `<div className="p-2 bg-slate-950/80 border-b border-slate-800 grid grid-cols-2 gap-1.5 shrink-0">`
# and ends with `</button>\n                </div>`
code = re.sub(r'<div className="p-2 bg-slate-950/80 border-b border-slate-800 grid grid-cols-2 gap-1.5 shrink-0">[\s\S]*?</button>\s*</div>', '', code)

# Remove the `{pastModalTab === 'orders' && (` and the `)}` after it
# Wait, let's just leave `pastModalTab === 'orders' && (` and the bookings tab?
# The user said "في جدول الحجوزات مكانه مو هنا عند المنيو" (Bookings table is not here).
# I will just remove the `{pastModalTab === 'bookings' && (` block entirely!
code = re.sub(r'\{pastModalTab === \'bookings\' && \([\s\S]*?\}\)', '', code)

# Clean up any leftover tabs wrapper
code = re.sub(r'\{pastModalTab === \'orders\' && \(\s*<>', '', code)
code = re.sub(r'</>\s*\)\}', '', code)

with open('src/components/CustomerWallet.tsx', 'w', encoding='utf-8') as f:
    f.write(code)
print("SUCCESS TABS REMOVAL")
