import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { translate } from "@/lib/i18n";
import { provinceLabelKey } from "@/lib/provinces";

/**
 * Telegram order-alert notifier. Broadcasts every new order to EVERY person
 * who has started the bot (stored in telegram_subscribers by the webhook),
 * plus any fixed chat IDs in TELEGRAM_CHAT_ID — so it's no longer tied to a
 * single recipient.
 *
 * Never throws — a Telegram outage or misconfiguration must never fail a
 * checkout. Callers still `await` this (not fire-and-forget) because
 * serverless platforms can freeze the function the instant the response is
 * sent. Per-request timeouts keep the added latency bounded.
 */

export interface OrderNotification {
  code: string;
  customerName: string;
  customerPhone: string;
  provinceCode: string | null;
  total: number;
  itemCount: number;
}

const TELEGRAM_TIMEOUT_MS = 5000;

// Legacy Telegram "Markdown" (not MarkdownV2) only requires escaping these.
function escapeMarkdown(text: string): string {
  return text.replace(/([_*`[])/g, "\\$1");
}

function formatOrderMessage(order: OrderNotification): string {
  const province = order.provinceCode
    ? translate(provinceLabelKey(order.provinceCode), "ar")
    : "—";

  const lines = [
    "🛍️ *طلب جديد على المتجر!*",
    "",
    `📦 *كود الطلب:* \`${order.code}\``,
    `👤 *الزبون:* ${escapeMarkdown(order.customerName)}`,
    `📞 *الهاتف:* ${escapeMarkdown(order.customerPhone)}`,
    `📍 *المحافظة:* ${escapeMarkdown(province)}`,
    `🧾 *عدد القطع:* ${order.itemCount}`,
    `💰 *المجموع:* ${order.total.toLocaleString("en-US")} د.ع`,
  ];
  return lines.join("\n");
}

/** Fixed chat IDs from env — comma/space separated, so it can be one or many. */
function envChatIds(): number[] {
  return (process.env.TELEGRAM_CHAT_ID ?? "")
    .split(/[,\s]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n !== 0);
}

/** Every active subscriber captured by the bot webhook. Empty on any failure. */
async function subscriberChatIds(): Promise<number[]> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return [];
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("telegram_subscribers")
      .select("chat_id")
      .eq("is_active", true);
    if (error || !data) return [];
    return data.map((r) => r.chat_id);
  } catch {
    return [];
  }
}

/** Mark a chat inactive once the bot is blocked/stopped, so we stop retrying it. */
async function deactivate(chatId: number): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const supabase = createAdminClient();
    await supabase.from("telegram_subscribers").update({ is_active: false }).eq("chat_id", chatId);
  } catch {
    /* non-fatal */
  }
}

async function sendTo(token: string, chatId: number, text: string): Promise<void> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
      signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
    });
    if (!res.ok) {
      // 403 = user blocked the bot / stopped it → drop them from the list.
      if (res.status === 403) await deactivate(chatId);
      else console.error("[telegram] sendMessage failed:", res.status, await res.text());
    }
  } catch (error) {
    console.error("[telegram] sendMessage error:", chatId, error);
  }
}

/** Broadcast a "new order" alert to every bot subscriber + env chat IDs. */
export async function sendOrderTelegramNotification(order: OrderNotification): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("[telegram] TELEGRAM_BOT_TOKEN not set — skipping alert");
    return;
  }

  const subs = await subscriberChatIds();
  const recipients = Array.from(new Set([...envChatIds(), ...subs]));

  if (recipients.length === 0) {
    console.error("[telegram] no recipients — set TELEGRAM_CHAT_ID or have someone /start the bot");
    return;
  }

  const text = formatOrderMessage(order);
  await Promise.allSettled(recipients.map((id) => sendTo(token, id, text)));
}
