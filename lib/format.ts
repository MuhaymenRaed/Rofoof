import type { Lang } from "./i18n";
import { dict } from "./i18n";

/** Format a price like `3,500 د.ع` / `3,500 IQD`. */
export function formatPrice(value: number, lang: Lang): string {
  return `${value.toLocaleString("en-US")} ${dict.currency[lang]}`;
}

/** Format a date string (YYYY-MM-DD) for display. */
export function formatDate(value: string): string {
  return value;
}
