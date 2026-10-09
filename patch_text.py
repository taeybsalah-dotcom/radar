import re

with open('src/components/CustomerWallet.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Replace the specific small button texts.
# We want to change the modal triggers from "إعادة الطلب" to "طلباتي"
# Let's find all occurrences of <span>إعادة الطلب 🔁</span>
# Wait, one of them is the button *inside* the past orders list!
# In the progress bar replacement, I did:
# <span>{isLive ? 'قيد التنفيذ ⏳' : 'إعادة الطلب 🔁'}</span>
# So the inner one is NOT just <span>إعادة الطلب 🔁</span>!
# Let's check what's actually inside the file right now for the inner one.
