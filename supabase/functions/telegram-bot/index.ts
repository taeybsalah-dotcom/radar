import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') || '8065372904:AAH8xReiWQ2zTrog0gwnQD-4Vz1zcyE51XY';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Initialize Supabase only if URLs are present (prevents crash on simple ping)
const supabase = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) 
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) 
  : null;

serve(async (req) => {
  try {
    const url = new URL(req.url)
    
    // Simple health check GET endpoint
    if (req.method === 'GET') {
       return new Response("Telegram Webhook is running!", { status: 200 })
    }

    if (req.method !== 'POST') {
      return new Response("Method not allowed", { status: 405 })
    }

    const update = await req.json()
    console.log("Received Telegram update:", update)

    if (update.message && update.message.text) {
      const chatId = update.message.chat.id
      const text = update.message.text
      const userId = update.message.from?.id
      
      let replyText = ""

      if (text.startsWith("/start")) {
        // Extract payload if user clicked a deep link like: t.me/Myradarstore_bot?start=store_123
        const payload = text.split(" ")[1];
        
        replyText = `أهلاً بك في بوت منصة رادار 🎯\n\nهذا البوت مخصص لربط متجرك واستقبال الطلبات والإشعارات فورياً.\n\n`
        
        if (payload) {
          replyText += `✅ تم استلام طلب الربط بنجاح.\n(جاري تفعيل الميزة قريباً في تحديثات المنصة)`
          // In the future: update supabase table 'stores' or 'profiles' with this chat_id
        } else {
           replyText += `لربط متجرك، يرجى الدخول للوحة التحكم في منصة رادار والضغط على "ربط تليجرام".`
        }

        await sendTelegramMessage(chatId, replyText, {
            inline_keyboard: [
              [{ text: '🌐 الذهاب للمنصة', url: 'https://radar.taeybsalah.workers.dev' }]
            ]
        });

      } else {
        replyText = "عذراً، البوت مخصص للإشعارات والطلبات الآلية فقط."
        await sendTelegramMessage(chatId, replyText);
      }
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } })
  } catch (error) {
    console.error("Error processing request:", error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})

async function sendTelegramMessage(chatId: number, text: string, replyMarkup?: any) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`
  
  const body: any = {
    chat_id: chatId,
    text: text,
  }

  if (replyMarkup) {
    body.reply_markup = replyMarkup
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body)
  });
  
  return await response.json();
}
