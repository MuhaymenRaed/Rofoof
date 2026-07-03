/**
 * Public store contact info — safe to read on the client (no secrets).
 * Override via env vars without a code change; both have sane defaults.
 */
export const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "9647735473375";
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}`;
export const INSTAGRAM_URL =
  process.env.NEXT_PUBLIC_INSTAGRAM_URL || "https://www.instagram.com/rofoof.iq/";

/** A wa.me link that opens a chat pre-filled with `text`. */
export function whatsappMessageUrl(text: string): string {
  return `${WHATSAPP_URL}?text=${encodeURIComponent(text)}`;
}

/** "9647735473375" -> "+964 773 547 3375" for display; falls back to "+<digits>". */
export function formatWhatsappDisplay(number: string = WHATSAPP_NUMBER): string {
  const digits = number.replace(/\D/g, "");
  if (digits.startsWith("964") && digits.length === 13) {
    return `+964 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  return `+${digits}`;
}
