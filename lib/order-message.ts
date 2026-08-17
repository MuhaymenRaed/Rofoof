import { translate, type Lang } from "./i18n";
import { formatPrice } from "./format";
import { provinceLabelKey } from "./provinces";
import { type Order } from "./products";

/**
 * Most line items to spell out before summarising the rest.
 *
 * The whole message travels in a URL, and Arabic costs about six characters per
 * letter once percent-encoded — so a long order reaches the length at which some
 * WhatsApp clients quietly truncate the prefilled text. A truncated message
 * would drop the totals and the question at the end, which are the parts that
 * matter. Better to summarise the tail deliberately than lose the ending.
 */
const MAX_ITEM_LINES = 20;

/**
 * The order-confirmation message an admin sends a customer on WhatsApp.
 *
 * Written out in full rather than left to the admin to type: the greeting is
 * fixed, and everything the customer needs to check before saying yes — every
 * line, the delivery fee, the total they'll actually pay — is filled in from the
 * order itself, so a confirmation can't quote a figure the dashboard doesn't.
 *
 * Defaults to Arabic because that is the language of the shop's customers, not
 * of whoever is looking at the dashboard. Both languages exist in the dictionary
 * so the caller can override, but the admin button doesn't.
 */

/** The grand total, derived the same way every other surface derives it. */
function grandTotal(order: Order): number {
  return Math.max(order.subtotal - order.discountTotal, 0) + order.deliveryFee;
}

/** One order line as a bullet: what it is, how many, what it costs. */
function itemLine(item: Order["items"][number], lang: Lang): string {
  const t = (k: Parameters<typeof translate>[0]) => translate(k, lang);
  const name = lang === "ar" ? item.nameAr : item.nameEn;
  const variant = lang === "ar" ? item.itemNameAr : item.itemNameEn;

  const notes: string[] = [];
  if (item.freeQty > 0) notes.push(`${item.freeQty} ${t("wa.free")}`);
  if (item.waterproof) notes.push(t("wa.waterproof"));
  // A custom request's piece count IS its image count, so say so — it's the
  // number the customer recognises from what they uploaded.
  if (item.customImages.length > 0) {
    notes.push(`${item.customImages.length} ${t("wa.customImages")}`);
  }
  // The kind is deliberately NOT repeated here: a custom line's stored name is
  // already "طلب مخصص — ستكر", so adding it again read as "…ستكر (… · ستكر)".

  const suffix = notes.length > 0 ? ` (${notes.join(" · ")})` : "";
  const label = variant ? `${name} — ${variant}` : name;
  return `• ${label} ×${item.qty}${suffix} = ${formatPrice(item.lineTotal, lang)}`;
}

export function buildOrderConfirmationMessage(order: Order, lang: Lang = "ar"): string {
  const t = (k: Parameters<typeof translate>[0]) => translate(k, lang);
  const lines: string[] = [t("wa.greeting"), ""];

  lines.push(`${t("wa.orderCode")}: ${order.code}`);
  lines.push(`${t("wa.date")}: ${order.date}`);
  lines.push(`${t("wa.name")}: ${order.customer}`);
  lines.push(`${t("wa.phone")}: ${order.phone}`);
  if (order.provinceCode) {
    lines.push(`${t("wa.province")}: ${t(provinceLabelKey(order.provinceCode))}`);
  }
  if (order.addressLine) lines.push(`${t("wa.address")}: ${order.addressLine}`);
  if (order.notes) lines.push(`${t("wa.note")}: ${order.notes}`);

  if (order.items.length > 0) {
    lines.push("", `${t("wa.items")}:`);
    for (const item of order.items.slice(0, MAX_ITEM_LINES)) lines.push(itemLine(item, lang));
    const hidden = order.items.length - MAX_ITEM_LINES;
    // The totals below still cover every line, so the customer is never quoted
    // a figure that doesn't match what they're agreeing to.
    if (hidden > 0) lines.push(t("wa.moreItems").replace("{n}", String(hidden)));
  }

  lines.push("", `${t("wa.subtotal")}: ${formatPrice(order.subtotal, lang)}`);
  // Only mentioned when there is one — a line reading "discount: 0" invites the
  // question of why not.
  if (order.discountTotal > 0) {
    lines.push(`${t("wa.discount")}: -${formatPrice(order.discountTotal, lang)}`);
  }
  lines.push(`${t("wa.delivery")}: ${formatPrice(order.deliveryFee, lang)}`);
  lines.push(`${t("wa.total")}: ${formatPrice(grandTotal(order), lang)}`);

  lines.push("", t("wa.confirmQuestion"));
  return lines.join("\n");
}
