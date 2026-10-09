import re

with open('src/components/CustomerWallet.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Replace the first trigger (the one with the RotateCcw icon probably)
# Wait, let's just replace all `<span>إعادة الطلب 🔁</span>` with `<span>طلباتي 📋</span>`
# EXCPET inside the map block? 
# The inner block currently has `<span>إعادة الطلب 🔁</span>` because my replacement script `patch_final.py` failed to apply `replacement` entirely!
# Wait! Did `patch_final.py` fail to apply the progress bar too!?
# Let me check if `isLive` is in the file!
