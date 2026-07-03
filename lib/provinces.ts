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
