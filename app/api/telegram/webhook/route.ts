import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Telegram bot webhook. Telegram POSTs every update (message) here.
 *   /start → subscribe this chat (or re-activate a stopped one)
 *   /stop  → unsubscribe
 *   /help  → show the commands
 * The order notifier (lib/telegram.ts) then broadcasts every order + cancel to
 * ALL active subscribers, so anyone who /start-s the bot gets the alerts.
 *
 * Register this URL once with Telegram (setWebhook) pointing at the LIVE host
 * (https://www.rofoof.net/api/telegram/webhook). A stale URL is a silent
 * failure: Telegram gets 404 and nobody's /start is ever recorded.
 */

const WELCOME =
  "أهلاً بك في بوت رفوف! ✅\n" +
  "تم تفعيل الإشعارات — ستصلك تفاصيل كل طلب جديد فور وصوله (المنتجات، العنوان، والمجموع مع التوصيل).\n\n" +
  "الأوامر:\n/help — المساعدة\n/stop — إيقاف الإشعارات";

const HELP =
  "بوت إشعارات رفوف 🛍️\n\n" +
  "الأوامر المتاحة:\n" +
  "/start — تفعيل إشعارات الطلبات\n" +
  "/stop — إيقاف الإشعارات\n" +
  "/help — عرض هذه الرسالة\n\n" +
  "بعد /start ستصلك تفاصيل كل طلب جديد وأي إلغاء تلقائياً.";

const STOPPED = "تم إيقاف إشعارات رفوف. أرسل /start لتشغيلها مرة أخرى.";

interface TelegramChat {
  id: number;
  type: string;
  username?: string;
  first_name?: string;
  title?: string;
}
interface TelegramUpdate {
  message?: { chat?: TelegramChat; text?: string };
  channel_post?: { chat?: TelegramChat; text?: string };
}

async function reply(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("[telegram webhook] TELEGRAM_BOT_TOKEN missing — cannot reply");
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      // A 401/400 here almost always means TELEGRAM_BOT_TOKEN is for a
      // DIFFERENT bot than the one this chat is talking to.
      console.error("[telegram webhook] sendMessage failed:", res.status, await res.text());
    }
  } catch (error) {
    console.error("[telegram webhook] sendMessage error:", error);
  }
}

/**
 * Browser/health check. Visiting the webhook URL should return this — NOT a
 * 404. If you see 404 here, the route isn't deployed at this path (or you're
 * on the wrong host) and Telegram can't deliver /start either.
 */
export function GET() {
  return NextResponse.json({ ok: true, webhook: "rofoof-telegram", method: "POST" });
}

export async function POST(request: Request) {
  // Reject anything that isn't Telegram calling with our shared secret.
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true }); // ignore malformed; never make TG retry
  }

  const msg = update.message ?? update.channel_post;
  const chat = msg?.chat;
  if (!chat) return NextResponse.json({ ok: true });

  const text = (msg?.text ?? "").trim().toLowerCase();
  // Visible in Vercel → Deployments → Functions logs, so you can confirm the
  // update actually reaches this route (vs. a webhook/URL problem).
  console.log("[telegram webhook] update from", chat.id, "text:", text);

  try {
    if (text.startsWith("/stop")) {
      const supabase = createAdminClient();
      await supabase
        .from("telegram_subscribers")
        .update({ is_active: false })
        .eq("chat_id", chat.id);
      await reply(chat.id, STOPPED);
    } else if (text.startsWith("/start")) {
      // upsert re-activates a previously stopped chat, so /start always works.
      const supabase = createAdminClient();
      await supabase.from("telegram_subscribers").upsert(
        {
          chat_id: chat.id,
          username: chat.username ?? null,
          first_name: chat.first_name ?? chat.title ?? null,
          is_active: true,
        },
        { onConflict: "chat_id" },
      );
      await reply(chat.id, WELCOME);
    } else if (text.startsWith("/help")) {
      await reply(chat.id, HELP);
    } else {
      // Any other message → point them at the commands.
      await reply(chat.id, HELP);
    }
  } catch (error) {
    console.error("[telegram webhook]", error);
  }

  // Always 200 so Telegram doesn't retry.
  return NextResponse.json({ ok: true });
}
