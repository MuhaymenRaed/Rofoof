import type { DictKey } from "./i18n";

/**
 * Iraqi governorates — mirrors the `provinces` table. Display labels live in the
 * i18n dictionary (`province.<code>`) so they stay bilingual like every other
 * fixed taxonomy (categories, fandoms). Use `provinceLabelKey(code)` to render.
 */
export const provinceCodes = [
  "baghdad",
  "basra",
  "nineveh",
  "erbil",
  "najaf",
  "karbala",
  "kirkuk",
  "anbar",
  "diyala",
  "dhiqar",
  "babil",
  "wasit",
  "maysan",
  "muthanna",
  "qadisiyah",
  "saladin",
  "sulaymaniyah",
  "duhok",
] as const;

export type ProvinceCode = (typeof provinceCodes)[number];

export const provinceLabelKey = (code: string): DictKey => `province.${code}` as DictKey;

/**
 * The two halves of the delivery map, because they are two different jobs.
 *
 *  - "kurdistan" — the Kurdistan Region. Parcels cross into it on different
 *    carriers at different rates, so its provinces are nearly always priced
 *    together and nearly always priced apart from the rest.
 *  - "federal"   — everywhere else.
 *
 * This is a DELIVERY grouping and nothing else: it changes what the fee editor
 * looks like, never what a province is called or whether it can be ordered to.
 */
export type ProvinceRegion = "kurdistan" | "federal";

/**
 * Kurdistan Region governorates as this shop's `provinces` table lists them.
 *
 * Halabja is a fourth in law but has no row here, so it is not listed — a code
 * in this array that no province carries would put a phantom row in the fee
 * editor and a fee nothing could ever charge. Add it here when the row exists.
 */
export const KURDISTAN_CODES: readonly string[] = ["erbil", "sulaymaniyah", "duhok"];

export function provinceRegion(code: string): ProvinceRegion {
  return KURDISTAN_CODES.includes(code) ? "kurdistan" : "federal";
}

/** Province codes of one region, in the order `provinceCodes` lists them. */
export function provincesIn(region: ProvinceRegion): string[] {
  return provinceCodes.filter((c) => provinceRegion(c) === region);
}

/**
 * The regions in editor order, federal first — it is the larger set and the one
 * the shop sells most into, so it opens the list rather than being scrolled to.
 */
export const PROVINCE_REGIONS: readonly ProvinceRegion[] = ["federal", "kurdistan"];

/**
 * Each region's accent, used by the dashboard fee editor to tell the two apart
 * at a glance. Kurdistan gets the teal; the rest stay on the brand red, so the
 * admin's eye lands on the group whose rate differs rather than on a uniform
 * wall of eighteen inputs.
 */
export const REGION_ACCENT: Record<ProvinceRegion, string> = {
  federal: "var(--brand)",
  kurdistan: "#0d9488",
};

export const regionLabelKey = (region: ProvinceRegion): DictKey =>
  `province.region.${region}` as DictKey;

/**
 * The two group buttons are worded per region, not shared.
 *
 * In Iraqi usage "الإقليم" — "the Region" — means the Kurdistan Region and
 * nothing else. One shared label calling the fifteen federal governorates
 * "الإقليم" is simply wrong, so each region names itself.
 */
export const regionApplyKey = (region: ProvinceRegion): DictKey =>
  `dash.feeApply.${region}` as DictKey;

export const regionClearKey = (region: ProvinceRegion): DictKey =>
  `dash.feeClear.${region}` as DictKey;
