import "server-only";
import { translate } from "@/lib/i18n";
import { provinceLabelKey } from "@/lib/provinces";

/**
 * WhatsApp order-confirmation to the CUSTOMER, sent from rofoof's official
 * number via the WhatsApp Business Cloud API. Lets the buyer know their order
 * is being prepared (and gives them a chance to cancel a mistaken one).
 *
 * Requires (server-only) env:
 *   WHATSAPP_CLOUD_TOKEN      – permanent access token for the WA Business app
 *   WHATSAPP_PHONE_NUMBER_ID  – the sender number's phone_number_id
 *   WHATSAPP_ORDER_TEMPLATE   – (optional) approved template name. Business-
 *                               initiated messages to a user who hasn't messaged
 *                               first REQUIRE an approved template; without one,
 *                               the plain-text fallback only delivers inside an
 *                               open 24h customer-service window.
 *
 * Never throws — a WhatsApp outage or missing config must never fail checkout.
 * Awaited (not fire-and-forget) so serverless functions don't freeze mid-send.
 */

export interface CustomerOrderMessage {
  code: string;
  customerName: string;
  customerPhone: string;
  provinceCode: string | null;
  total: number;
  itemCount: number;
}

const WHATSAPP_TIMEOUT_MS = 6000;
const GRAPH_VERSION = "v21.0";

/** Normalize an Iraqi phone to E.164 digits (e.g. 07xx… → 9647xx…). */
export function normalizeIraqPhone(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("964")) return d;
  if (d.startsWith("0")) d = d.slice(1);
  return `964${d}`;
}

function formatBody(order: CustomerOrderMessage): string {
  const province = order.provinceCode ? translate(provinceLabelKey(order.provinceCode), "ar") : "—";
  return [
    "رفوف 🌸",
    "",
    `مرحباً ${order.customerName}، استلمنا طلبك ويتم تجهيزه الآن ✅`,
    "",
    `كود الطلب: ${order.code}`,
    `عدد القطع: ${order.itemCount}`,
    `المحافظة: ${province}`,
    `المجموع: ${order.total.toLocaleString("en-US")} د.ع`,
    "",
    "إذا كان الطلب بالغلط تقدر تلغيه من صفحة طلباتك ما دام لسه ما تم قبوله، أو تواصل ويانا.",
  ].join("\n");
}

/** Send the customer their order confirmation. Swallows all errors. */
export async function sendCustomerOrderWhatsapp(order: CustomerOrderMessage): Promise<void> {
  const token = process.env.WHATSAPP_CLOUD_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    // Not configured — silently skip (Telegram admin alert still fires).
    return;
  }

  const to = normalizeIraqPhone(order.customerPhone);
  const template = process.env.WHATSAPP_ORDER_TEMPLATE;

  // Prefer an approved template (works outside the 24h window); otherwise a
  // plain text message (delivers only within an open conversation window).
  const payload = template
    ? {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: template,
          language: { code: "ar" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: order.customerName },
                { type: "text", text: order.code },
                { type: "text", text: String(order.itemCount) },
                { type: "text", text: `${order.total.toLocaleString("en-US")} د.ع` },
              ],
            },
          ],
        },
      }
    : {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: formatBody(order) },
      };

  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(WHATSAPP_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error("[whatsapp] send failed:", res.status, await res.text());
    }
  } catch (error) {
    console.error("[whatsapp] send error:", error);
  }
}
