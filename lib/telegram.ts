import "server-only";
import { translate } from "@/lib/i18n";
import { provinceLabelKey } from "@/lib/provinces";

/**
 * Telegram order-alert notifier. Never throws — a Telegram outage or
 * misconfiguration must never fail a checkout. Callers should still `await`
 * this (rather than firing-and-forgetting) because serverless platforms
 * (Netlify Functions) can freeze/tear down the function the instant the
 * response is sent, silently killing any un-awaited async work. A short
 * request timeout keeps the added latency bounded.
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

/** Send a "new order" alert to the store's Telegram bot. Swallows all errors. */
export async function sendOrderTelegramNotification(order: OrderNotification): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error("[telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping alert");
    return;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: formatOrderMessage(order),
        parse_mode: "Markdown",
      }),
      signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error("[telegram] sendMessage failed:", res.status, await res.text());
    }
  } catch (error) {
    console.error("[telegram] sendMessage error:", error);
  }
}
