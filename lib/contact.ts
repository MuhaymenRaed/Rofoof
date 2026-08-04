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

/** Every Iraqi mobile is 11 digits in the local form: 07XXXXXXXXX. */
export const IRAQ_PHONE_LENGTH = 11;

/**
 * Force a phone-only value in Iraqi local form.
 *
 * Keeps digits (Arabic numerals included), drops everything else as it's typed,
 * and folds the common ways people write the same number into `07…`:
 *   +964 771 234 5678 / 00964… / 964…  →  0771…
 * Also caps the length, so a stray keypress can't push it past 11 digits.
 */
export function sanitizePhoneInput(value: string): string {
  let digits = toAsciiDigits(value).replace(/\D/g, "");

  // Country code in any of its written forms → local 0-prefixed form.
  if (digits.startsWith("00964")) digits = digits.slice(5);
  else if (digits.startsWith("964")) digits = digits.slice(3);
  if (digits.startsWith("964")) digits = digits.slice(3);
  // A pasted number that lost its leading zero ("7712345678").
  if (digits.startsWith("7") && !digits.startsWith("07")) digits = `0${digits}`;

  return digits.slice(0, IRAQ_PHONE_LENGTH);
}

/** An Iraqi mobile: exactly 07 followed by 9 more digits. */
export function isValidPhone(value: string): boolean {
  return /^07\d{9}$/.test(toAsciiDigits(value).replace(/\D/g, ""));
}

/** Optional field: blank is fine, but anything typed must be a real number. */
export function isValidOptionalPhone(value: string): boolean {
  return value.trim() === "" || isValidPhone(value);
}

/** "9647735473375" -> "+964 773 547 3375" for display; falls back to "+<digits>". */
export function formatWhatsappDisplay(number: string = WHATSAPP_NUMBER): string {
  const digits = number.replace(/\D/g, "");
  if (digits.startsWith("964") && digits.length === 13) {
    return `+964 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  return `+${digits}`;
}
