/**
 * Flexible, bilingual (Arabic + English) search matching used by the store and
 * the dashboard lists. Goals:
 *   - case-insensitive (camelCase, ALL CAPS, Mixed all match)
 *   - partial-word matches ("stik" → "sticker", "بروش" → "بروشات")
 *   - Arabic-aware: folds alef/hamza/ya/ta-marbuta variants and strips harakat
 *     & tatweel, so "احمد" matches "أحمَد" and "علي" matches "علیـ".
 *   - Latin diacritics folded ("cafe" ↔ "café").
 *
 * Pure string logic — safe on both server and client.
 */

/** Normalize a string for comparison: fold case, diacritics and letter variants. */
export function normalizeSearch(input: string): string {
  return input
    .toLowerCase()
    // decompose Latin accents, then drop the combining marks
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // strip Arabic harakat (fatha…sukun), superscript alef, and tatweel
    .replace(/[ً-ْٰـ]/g, "")
    // unify alef / hamza carriers
    .replace(/[آأإٱ]/g, "ا") // آأإٱ → ا
    .replace(/ى/g, "ي") // ى → ي
    .replace(/ؤ/g, "و") // ؤ → و
    .replace(/ئ/g, "ي") // ئ → ي
    .replace(/ة/g, "ه") // ة → ه
    // collapse everything else that isn't a letter/number to a space
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True if `needle`'s characters appear in order within `hay` (typo tolerance). */
function isSubsequence(needle: string, hay: string): boolean {
  let i = 0;
  for (let j = 0; j < hay.length && i < needle.length; j++) {
    if (hay[j] === needle[i]) i++;
  }
  return i === needle.length;
}

/**
 * Fuzzy match a free-text query against a haystack. Every whitespace-separated
 * token in the query must be found in the haystack — as a substring, or (for
 * tokens of 3+ chars) as an in-order subsequence for light typo tolerance.
 * An empty query matches everything.
 */
export function fuzzyMatch(query: string, haystack: string): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  const h = normalizeSearch(haystack);
  if (!h) return false;
  return q.split(" ").every((token) => {
    if (h.includes(token)) return true;
    return token.length >= 3 && isSubsequence(token, h);
  });
}
