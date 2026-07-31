/**
 * Helpers for treating the query string as the single source of truth for the
 * store's filters. Pure functions (no React) so any component can build the
 * same clean, canonical URLs without duplicating the serialization rules.
 *
 * The golden rule: a filter at its DEFAULT value never appears in the URL, so
 * `/store` always represents "no filters" and shared links stay readable.
 */

/** A value a filter can contribute to the URL. */
export type ParamValue = string | string[] | number | boolean | null | undefined;

/**
 * Split a comma-separated multi-value param ("stickers,posters") into clean,
 * de-duplicated entries. Multi-select filters use one key per group so a single
 * selection still reads naturally (`?category=games`).
 */
export function parseListParam(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const value = part.trim();
    if (value && !out.includes(value)) out.push(value);
  }
  return out;
}

/** Read a positive integer param, falling back when it's absent or invalid. */
export function parseIntParam(raw: string | null | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * Read a numeric param clamped to [min, max]; anything absent, non-numeric or
 * out of range falls back — so a hand-edited URL can never break the UI.
 */
export function parseNumberParam(
  raw: string | null | undefined,
  { min, max, fallback }: { min: number; max: number; fallback: number },
): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/** null = drop the key entirely (the value is a default / empty). */
function serializeParam(value: ParamValue): string | null {
  if (value === null || value === undefined || value === false || value === "") return null;
  if (Array.isArray(value)) return value.length > 0 ? value.join(",") : null;
  if (value === true) return "true";
  return String(value);
}

/**
 * Apply a patch on top of the current params and return the resulting query
 * string. Keys absent from the patch are PRESERVED; keys whose patched value is
 * empty/default (null, undefined, false, "", []) are REMOVED.
 *
 * Keys are sorted so one set of filters always yields one canonical URL.
 */
export function withParams(
  current: URLSearchParams,
  patch: Record<string, ParamValue>,
): string {
  const next = new URLSearchParams(current.toString());
  for (const [key, value] of Object.entries(patch)) {
    const serialized = serializeParam(value);
    if (serialized === null) next.delete(key);
    else next.set(key, serialized);
  }
  next.sort();
  // Commas are legal in a query value, and un-escaping them keeps multi-select
  // links readable (`?category=stickers,posters` beats `stickers%2Cposters`).
  // Safe both ways: the browser hands the raw comma straight back on read.
  return next.toString().replace(/%2C/g, ",");
}

/** Add/remove one entry of a multi-select list, preserving the existing order. */
export function toggleInList(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}
