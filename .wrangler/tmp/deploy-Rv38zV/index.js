var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker/index.ts
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS
    }
  });
}
__name(jsonResponse, "jsonResponse");
function cleanPrice(raw) {
  if (raw === null || raw === void 0) return 0;
  if (typeof raw === "number" && !isNaN(raw)) return raw;
  let str = String(raw).trim();
  const arabicNumerals = ["\u0660", "\u0661", "\u0662", "\u0663", "\u0664", "\u0665", "\u0666", "\u0667", "\u0668", "\u0669"];
  const persianNumerals = ["\u06F0", "\u06F1", "\u06F2", "\u06F3", "\u06F4", "\u06F5", "\u06F6", "\u06F7", "\u06F8", "\u06F9"];
  for (let i = 0; i < 10; i++) {
    str = str.replace(new RegExp(arabicNumerals[i], "g"), String(i));
    str = str.replace(new RegExp(persianNumerals[i], "g"), String(i));
  }
  str = str.replace(/٫/g, ".").replace(/,/g, ".");
  str = str.replace(/(ر\.س|رس|ريال|ريالات|SAR|SR|USD|\$|EUR|AED)/gi, "");
  const match = str.match(/(\d+(?:\.\d+)?)/);
  if (match) {
    const num = parseFloat(match[1]);
    return isNaN(num) ? 0 : num;
  }
  return 0;
}
__name(cleanPrice, "cleanPrice");
async function callGeminiVision(apiKey, base64Data, mimeType, modelName) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  const prompt = `\u0627\u0633\u062A\u062E\u0631\u062C \u0623\u0635\u0646\u0627\u0641 \u0627\u0644\u0645\u0646\u064A\u0648 \u0639\u0644\u0649 \u0634\u0643\u0644 \u0645\u0635\u0641\u0648\u0641\u0629 JSON \u0645\u0636\u063A\u0648\u0637\u0629 \u0628\u0645\u0641\u0627\u062A\u064A\u062D \u0645\u0646 \u062D\u0631\u0641 \u0648\u0627\u062D\u062F \u0641\u0642\u0637:
[{"n": "\u0627\u0633\u0645 \u0627\u0644\u0635\u0646\u0641", "c": "\u0627\u0644\u0642\u0633\u0645", "p": 15}]
- n: \u0627\u0633\u0645 \u0627\u0644\u0635\u0646\u0641 \u0628\u062F\u0642\u0629.
- c: \u0627\u0633\u0645 \u0627\u0644\u0642\u0633\u0645 \u0627\u0644\u0645\u0646\u0627\u0633\u0628.
- p: \u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0645\u0627\u0644\u064A \u0643\u0631\u0642\u0645 \u0625\u0646\u062C\u0644\u064A\u0632\u064A \u0641\u0642\u0637 (\u0645\u062B\u0644\u0627\u064B 15 \u0623\u0648 24.5).
  * \u062D\u0648\u0651\u0644 \u0623\u064A \u0623\u0631\u0642\u0627\u0645 \u0639\u0631\u0628\u064A\u0629 \u0625\u0644\u0649 \u0625\u0646\u062C\u0644\u064A\u0632\u064A\u0629 (15).
  * \u062A\u062C\u0627\u0647\u0644 \u0627\u0644\u0633\u0639\u0631\u0627\u062A \u0627\u0644\u062D\u0631\u0627\u0631\u064A\u0629 \u062A\u0645\u0627\u0645\u0627\u064B (cal/\u0633\u0639\u0631\u0629/kcal/\u{1F525}).
\u0644\u0627 \u062A\u0633\u062A\u062E\u0631\u062C \u0648\u0635\u0641\u0627\u064B \u0646\u0647\u0627\u0626\u064A\u0627\u064B.`;
  const payload = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 8192,
      thinkingConfig: {
        thinkingBudget: 0
      },
      responseMimeType: "application/json",
      responseSchema: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            n: { type: "STRING", description: "\u0627\u0633\u0645 \u0627\u0644\u0635\u0646\u0641" },
            c: { type: "STRING", description: "\u0627\u0644\u0642\u0633\u0645" },
            p: { type: "NUMBER", description: "\u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0645\u0627\u0644\u064A" }
          },
          required: ["n", "c", "p"]
        }
      }
    }
  };
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errorText = await response.text();
    let errJson = null;
    try {
      errJson = JSON.parse(errorText);
    } catch {
    }
    const msg = errJson?.error?.message || errorText;
    const err = new Error(`Gemini API error (${response.status}): ${msg}`);
    err.status = response.status;
    throw err;
  }
  const resJson = await response.json();
  const rawText = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error("\u0644\u0645 \u064A\u062A\u0645 \u0627\u0633\u062A\u062E\u0631\u0627\u062C \u0623\u064A \u0628\u064A\u0627\u0646\u0627\u062A \u0645\u0646 \u0627\u0644\u0635\u0648\u0631\u0629\u060C \u064A\u0631\u062C\u0649 \u0627\u0644\u062A\u0623\u0643\u062F \u0645\u0646 \u0648\u0636\u0648\u062D \u0627\u0644\u0645\u0646\u064A\u0648.");
  }
  let rawList = [];
  try {
    const parsed = JSON.parse(rawText);
    rawList = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
  } catch (e) {
    throw new Error("\u0641\u0634\u0644 \u0641\u064A \u0642\u0631\u0627\u0621\u0629 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0646\u064A\u0648 \u0627\u0644\u0645\u0633\u062A\u062E\u0631\u062C\u0629.");
  }
  const categoriesSet = /* @__PURE__ */ new Set();
  const items = [];
  for (const it of rawList) {
    const name = String(it.n || it.name || "").trim();
    const category = String(it.c || it.category || "\u0639\u0627\u0645").trim();
    const price = cleanPrice(it.p ?? it.price);
    if (!name) continue;
    if (category) categoriesSet.add(category);
    items.push({
      name,
      category,
      price,
      description: "",
      item_type: "product"
    });
  }
  return {
    categories: Array.from(categoriesSet),
    items
  };
}
__name(callGeminiVision, "callGeminiVision");
async function handleParseMenu(request, env) {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    return jsonResponse(
      {
        success: false,
        code: "GEMINI_API_KEY_MISSING",
        error: "\u0645\u0641\u062A\u0627\u062D Gemini API \u063A\u064A\u0631 \u0645\u0636\u0628\u0648\u0637 \u0641\u064A \u0627\u0644\u0633\u064A\u0631\u0641\u0631. \u064A\u0631\u062C\u0649 \u062A\u0641\u0639\u064A\u0644\u0647 \u0639\u0628\u0631 Cloudflare Secret."
      },
      503
    );
  }
  try {
    const body = await request.json();
    let imageBase64 = body?.imageBase64 || "";
    const mimeType = body?.mimeType || "image/jpeg";
    if (!imageBase64 || imageBase64.length < 50) {
      return jsonResponse(
        {
          success: false,
          code: "INVALID_IMAGE",
          error: "\u0644\u0645 \u064A\u062A\u0645 \u0627\u0633\u062A\u0644\u0627\u0645 \u0628\u064A\u0627\u0646\u0627\u062A \u0635\u0648\u0631\u0629 \u0635\u0627\u0644\u062D\u0629 \u0644\u0644\u062A\u062D\u0644\u064A\u0644."
        },
        400
      );
    }
    if (imageBase64.includes(",")) {
      imageBase64 = imageBase64.split(",")[1];
    }
    const result = await callGeminiVision(apiKey, imageBase64, mimeType, "gemini-3.8-flash");
    return jsonResponse({
      success: true,
      categories: result.categories,
      items: result.items
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: error?.message || "\u062D\u062F\u062B \u062E\u0637\u0623 \u0623\u062B\u0646\u0627\u0621 \u0645\u0639\u0627\u0644\u062C\u0629 \u0627\u0644\u0645\u0646\u064A\u0648 \u0628\u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A."
      },
      500
    );
  }
}
__name(handleParseMenu, "handleParseMenu");
var index_default = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }
    const url = new URL(request.url);
    if (url.pathname === "/api/ai/parse-menu" && request.method === "POST") {
      return handleParseMenu(request, env);
    }
    const response = await env.ASSETS.fetch(request);
    const pathname = url.pathname.toLowerCase();
    const isHashedAsset = pathname.startsWith("/assets/") && (pathname.endsWith(".js") || pathname.endsWith(".css"));
    const headers = new Headers(response.headers);
    if (isHashedAsset) {
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
    } else {
      headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
      headers.set("Pragma", "no-cache");
      headers.set("Expires", "0");
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
export {
  cleanPrice,
  index_default as default
};
//# sourceMappingURL=index.js.map
