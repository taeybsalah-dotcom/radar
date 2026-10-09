import re

with open('src/components/CustomerWallet.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# To replace the existing block safely, I'll extract it using regex
pattern = r'<div className="mt-8 pt-6 border-t border-slate-800 space-y-4">.*?<h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">.*?<span>مواعيدي السابقة والقادمة</span>.*?</h3>.*?(?:{customerServiceBookings\.length === 0 \? \(.*?\)\s*:\s*\(\s*<div className="space-y-3">\s*{customerServiceBookings\.map\(\(bk: any\) => \(.*?</button>\s*\)}\s*</div>\s*</div>\s*\)\)}\s*</div>\s*\)\}\s*</div>)'

# Let's check how many times `مواعيدي السابقة والقادمة` appears
count = code.count('مواعيدي السابقة والقادمة')
print("COUNT:", count)

# We know the second one inside `activeTab === 'services'` is the one we want.
# Actually, the FIRST one is inside `showPastOrdersModal` which I can delete!
# The second one is inside `activeTab === 'services'`.

