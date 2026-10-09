import re

with open('src/components/CustomerWallet.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Replace the inner reorder button. We will find it using regex.
code = re.sub(
    r'<button\s*type="button"\s*onClick=\{\(\) => handleReOrder\(order\)\}\s*style=\{\{\s*backgroundColor: brandSecondary,\s*color: \'#000000\',\s*\}\}\s*className="px-3\.5 py-2 rounded-xl font-black text-xs flex items-center gap-1\.5 shadow-lg hover:brightness-110 transition active:scale-95"\s*>\s*<RotateCcw className="w-3\.5 h-3\.5" />\s*<span>إعادة الطلب 🔁</span>\s*</button>',
    """<button
          type="button"
          onClick={() => !isLive && handleReOrder(order)}
          disabled={isLive}
          style={{
            backgroundColor: isLive ? '#334155' : brandSecondary,
            color: isLive ? '#94a3b8' : '#000000',
            cursor: isLive ? 'not-allowed' : 'pointer',
            opacity: isLive ? 0.7 : 1
          }}
          className={`px-3.5 py-2 rounded-xl font-black text-xs flex items-center gap-1.5 shadow-lg transition ${isLive ? '' : 'hover:brightness-110 active:scale-95'}`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>{isLive ? 'قيد التنفيذ ⏳' : 'إعادة الطلب 🔁'}</span>
        </button>""",
    code
)

# 2. Replace the modal trigger "إعادة الطلب"
code = code.replace(
    """<History className="w-3.5 h-3.5" />
                                <span>إعادة الطلب 🔁</span>
                              </button>""",
    """<History className="w-3.5 h-3.5" />
                                <span>طلباتي 📋</span>
                              </button>"""
)

code = code.replace(
    """<RotateCcw className="w-3.5 h-3.5" />
                                <span>إعادة الطلب 🔁</span>
                              </button>""",
    """<History className="w-3.5 h-3.5" />
                                <span>طلباتي 📋</span>
                              </button>"""
)

code = code.replace(
    """<span>إعادة الطلب 🔁</span>
                </button>
              </div>
            )}""",
    """<span>طلباتي 📋</span>
                </button>
              </div>
            )}"""
)

code = code.replace("سجل طلباتي وحجوزاتي السابقة", "سجل طلباتي السابقة")
code = code.replace("إعادة الطلب والحجز بضغطة زر واحدة", "تتبع الطلب الحالي أو إعادة الطلب بضغطة زر")

with open('src/components/CustomerWallet.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("SUCCESS TEXT PATCH")
