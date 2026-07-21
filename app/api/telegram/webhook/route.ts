import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Telegram bot webhook. Telegram POSTs every update (message) here. When a
 * user sends /start we register their chat as a subscriber; /stop removes them.
 * That's how "anyone who uses the bot" starts receiving order alerts — the
 * order notifier (lib/telegram.ts) then broadcasts to every active subscriber.
 *
 * Register this URL once with Telegram (see the setWebhook step in the deploy
 * notes) using a secret_token; Telegram echoes it back in the header below so
 * we can reject forged calls to this public endpoint.
 */

export const dynamic = "force-dynamic";

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
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    /* non-fatal */
  }
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
  const text = (msg?.text ?? "").trim().toLowerCase();

  // Only care about the subscribe/unsubscribe commands.
  if (!chat || (!text.startsWith("/start") && !text.startsWith("/stop"))) {
    return NextResponse.json({ ok: true });
  }

  try {
    const supabase = createAdminClient();
    if (text.startsWith("/stop")) {
      await supabase
        .from("telegram_subscribers")
        .update({ is_active: false })
        .eq("chat_id", chat.id);
      await reply(chat.id, "تم إيقاف إشعارات رفوف. أرسل /start لتشغيلها مرة أخرى.");
    } else {
      await supabase.from("telegram_subscribers").upsert(
        {
          chat_id: chat.id,
          username: chat.username ?? null,
          first_name: chat.first_name ?? chat.title ?? null,
          is_active: true,
        },
        { onConflict: "chat_id" },
      );
      await reply(chat.id, "تم تفعيل إشعارات رفوف ✅ ستصلك تفاصيل كل طلب جديد. أرسل /stop للإيقاف.");
    }
  } catch (error) {
    console.error("[telegram webhook]", error);
  }

  // Always 200 so Telegram doesn't retry.
  return NextResponse.json({ ok: true });
}
