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

/** Arabic-Indic (٠-٩) and Persian (۰-۹) digits → ASCII 0-9. */
function toAsciiDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * Force a phone-only value: digits (incl. Arabic numerals → ASCII) plus at most
 * one leading +. Everything else — letters, spaces, dashes, symbols — is
 * dropped as it's typed, so the field can never hold gibberish like "jkljklj"
 * or "تنمتنمت"; there's nothing to reject after the fact.
 */
export function sanitizePhoneInput(value: string): string {
  const digitsAndPlus = toAsciiDigits(value).replace(/[^\d+]/g, "");
  // A + is only meaningful as the very first character.
  return digitsAndPlus.replace(/(?!^)\+/g, "");
}

/** A plausible phone: 10–15 digits (Iraqi mobile is 11 with the leading 0). */
export function isValidPhone(value: string): boolean {
  const digits = toAsciiDigits(value).replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

/** "9647735473375" -> "+964 773 547 3375" for display; falls back to "+<digits>". */
export function formatWhatsappDisplay(number: string = WHATSAPP_NUMBER): string {
  const digits = number.replace(/\D/g, "");
  if (digits.startsWith("964") && digits.length === 13) {
    return `+964 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  return `+${digits}`;
}
