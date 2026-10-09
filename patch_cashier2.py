import re

with open('src/components/CashierPOS.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add state safely
old_state = "const [liveOrders, setLiveOrders] = useState<any[]>([]);"
new_state = "const [liveOrders, setLiveOrders] = useState<any[]>([]);\n  const [orderActionError, setOrderActionError] = useState<string | null>(null);"
code = code.replace(old_state, new_state)

# 2. Fix the getStoreOrders to getLiveStoreOrders
code = code.replace("LoyaltyService.getStoreOrders(store!.id).then(setLiveOrders);", "LoyaltyService.getLiveStoreOrders(store!.id).then(setLiveOrders);")

with open('src/components/CashierPOS.tsx', 'w', encoding='utf-8') as f:
    f.write(code)
print("SUCCESS STATE PATCH")
