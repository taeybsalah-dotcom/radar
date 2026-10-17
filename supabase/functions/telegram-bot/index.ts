import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') || '8065372904:AAH8xReiWQ2zTrog0gwnQD-4Vz1zcyE51XY';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://zagpvflyizbmzsbmhnts.supabase.co';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || 'sb_publishable_Bx1NGkxLxilvNA3RgcioVQ_t8zlk72H';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

serve(async (req) => {
  try {
    const url = new URL(req.url)
    
    if (req.method === 'GET') {
       return new Response("Telegram Webhook is running! 🎯", { status: 200 })
    }

    if (req.method !== 'POST') {
      return new Response("Method not allowed", { status: 405 })
    }

    const update = await req.json()

    // 1. Callback query
    if (update.callback_query) {
      const cq = update.callback_query;
      const data = cq.data || '';
      const fromName = [cq.from?.first_name, cq.from?.last_name].filter(Boolean).join(' ') || 'الموظف';
      const msg = cq.message;
      const chatId = msg?.chat?.id;
      const messageId = msg?.message_id;
      const originalText = msg?.text || '';

      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: cq.id, text: 'جاري التنفيذ...' })
      });

      const [action, targetId] = data.split(':');
      if (action && targetId && chatId && messageId) {
        if (action === 'ord_prep') {
          await supabase.from('store_orders').update({ status: 'preparing', updated_at: new Date().toISOString() }).eq('id', targetId);
          await editMsg(chatId, messageId, `${originalText}\n\n👨‍🍳 تم قبول وبدء التحضير بواسطة (${fromName}) ✅`, {
            inline_keyboard: [[{ text: '🚀 جاهز للاستلام', callback_data: `ord_rdy:${targetId}` }]]
          });
        } else if (action === 'ord_rdy') {
          await supabase.from('store_orders').update({ status: 'ready', updated_at: new Date().toISOString() }).eq('id', targetId);
          await editMsg(chatId, messageId, `${originalText}\n\n🚀 جاهز للاستلام بواسطة (${fromName}) 📦`);
        } else if (action === 'ord_rej') {
          await supabase.from('store_orders').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', targetId);
          await editMsg(chatId, messageId, `${originalText}\n\n❌ تم رفض الطلب بواسطة (${fromName})`);
        } else if (action === 'bk_cnf') {
          await supabase.from('service_bookings').update({ status: 'confirmed' }).eq('id', targetId);
          await editMsg(chatId, messageId, `${originalText}\n\n✅ تم تأكيد الحجز بواسطة (${fromName})`);
        } else if (action === 'bk_rej') {
          await supabase.from('service_bookings').update({ status: 'cancelled' }).eq('id', targetId);
          await editMsg(chatId, messageId, `${originalText}\n\n❌ تم الاعتذار عن الحجز بواسطة (${fromName})`);
        } else if (action === 'cpn_clm') {
          await supabase.from('customer_coupons').update({ status: 'REDEEMED', redeemed_at: new Date().toISOString() }).eq('id', targetId);
          await editMsg(chatId, messageId, `${originalText}\n\n🎉 تم اعتماد تسليم المكافأة بواسطة (${fromName}) ✅`);
        } else if (action === 'cpn_rej') {
          await supabase.from('customer_coupons').update({ status: 'REJECTED' }).eq('id', targetId);
          await editMsg(chatId, messageId, `${originalText}\n\n❌ تم رفض المكافأة بواسطة (${fromName})`);
        }
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    // 2. Message /start
    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text.trim();
      
      if (text.startsWith("/start")) {
        const rawPayload = text.replace(/^\/start(?:@\w+)?/i, '').trim();
        const storeKey = rawPayload.replace(/^store_/, '').trim();
        
        if (storeKey) {
          const { data: stores } = await supabase.from('stores')
            .update({ telegram_chat_id: String(chatId), telegram_notifications_enabled: true, updated_at: new Date().toISOString() })
            .or(`id.eq.${storeKey},slug.eq.${storeKey}`)
            .select('id, name');
          
          const store = stores && stores.length > 0 ? stores[0] : null;
          if (store) {
            await sendMsg(chatId, `✅ تم ربط متجر "${store.name}" بنجاح! ستصل الطلبات والحجوزات هنا.`);
          } else {
            await sendMsg(chatId, `⚠️ تعذر ربط المتجر، لم يتم العثور على المتجر.`);
          }
        } else {
          await sendMsg(chatId, `أهلاً بك في بوت منصة رادار 🎯\nلربط متجرك، يرجى الدخول للوحة التحكم واختيار "ربط بحسابي الخاص" أو "ربط بقروب عمل".`);
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
});

async function sendMsg(chatId: number, text: string, replyMarkup?: any) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, reply_markup: replyMarkup })
  });
}

async function editMsg(chatId: number, messageId: number, text: string, replyMarkup?: any) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, reply_markup: replyMarkup || { inline_keyboard: [] } })
  });
}
