import "server-only";
import { unstable_cache } from "next/cache";
import { createAnonClient } from "@/lib/supabase/anon";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  mapProduct,
  mapOffer,
  selectProducts,
  type ProductRowWithFandoms,
  type OfferRowLike,
} from "./mappers";
import { TAGS } from "./tags";
import { defaultCategoryGroup } from "@/lib/products";
import type {
  CategoryInfo,
  CustomPricing,
  CustomType,
  FandomInfo,
  FeaturedGroup,
  Offer,
  Product,
  SiteSettings,
  SubcategoryInfo,
  VolumeTier,
} from "@/lib/products";

/**
 * Public catalog. Cached across requests (tag: products, revalidate 5 min) and
 * invalidated on-demand when an admin edits inventory. Uses the stateless anon
 * client so the calling route stays static / ISR-friendly.
 */
const cachedProducts = unstable_cache(
  async (): Promise<Product[]> => {
    const supabase = createAnonClient();
    const { data, error } = await selectProducts((select) =>
      supabase
        .from("products")
        .select(select)
        .eq("is_active", true)
        .order("sort_order", { ascending: false }),
    );
    if (error) throw error;
    // hand-written types don't model PostgREST embeds; the DB FK resolves it
    return (data as unknown as ProductRowWithFandoms[]).map(mapProduct);
  },
  ["catalog:products:active"],
  { tags: [TAGS.products], revalidate: 300 },
);

export async function getProducts(): Promise<Product[]> {
  try {
    return await cachedProducts();
  } catch (error) {
    // Never let a transient DB/network issue (or a build without network) break
    // rendering — degrade to an empty catalog and let ISR refill it.
    console.error("[catalog] getProducts failed:", error);
    return [];
  }
}

const CATEGORY_COLUMNS = "code, name_ar, name_en, icon";

/**
 * Bilingual categories — drive the chips + filters. Invalidated on admin edits.
 *
 * `category_group` splits the chips into the store's two filter rows (product
 * type vs subject). It is asked for separately and dropped on error, because
 * the column arrives with a migration that may not have been run yet — and
 * failing the whole read over it would empty every filter in the shop. When
 * it's missing, or blank on a row an admin added before it existed,
 * defaultCategoryGroup() places the chip by its code instead.
 */
const cachedCategories = unstable_cache(
  async (): Promise<CategoryInfo[]> => {
    const supabase = createAnonClient();
    const read = (columns: string) =>
      supabase.from("categories").select(columns).order("sort_order", { ascending: true });

    let { data, error } = await read(`${CATEGORY_COLUMNS}, category_group`);
    if (error) ({ data, error } = await read(CATEGORY_COLUMNS));
    if (error) throw error;

    const rows = (data ?? []) as unknown as {
      code: string;
      name_ar: string;
      name_en: string;
      icon: string;
      category_group?: string | null;
    }[];

    return rows.map((c) => ({
      code: c.code,
      nameAr: c.name_ar,
      nameEn: c.name_en,
      icon: c.icon,
      group: c.category_group === "type" || c.category_group === "theme"
        ? c.category_group
        : defaultCategoryGroup(c.code),
    }));
  },
  ["catalog:categories"],
  { tags: [TAGS.categories], revalidate: 3600 },
);

export async function getCategories(): Promise<CategoryInfo[]> {
  try {
    return await cachedCategories();
  } catch (error) {
    console.error("[catalog] getCategories failed:", error);
    return [];
  }
}

/**
 * Bilingual subcategories — the second-level taxonomy nested under categories
 * (Video Games → PS5, PC…). Drives the third store filter.
 */
const cachedSubcategories = unstable_cache(
  async (): Promise<SubcategoryInfo[]> => {
    const supabase = createAnonClient();
    const { data, error } = await supabase
      .from("subcategories")
      .select("code, category_code, name_ar, name_en")
      .eq("is_deleted", false)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((s) => ({
      code: s.code,
      categoryCode: s.category_code,
      nameAr: s.name_ar,
      nameEn: s.name_en,
    }));
  },
  ["catalog:subcategories"],
  { tags: [TAGS.categories], revalidate: 3600 },
);

export async function getSubcategories(): Promise<SubcategoryInfo[]> {
  try {
    return await cachedSubcategories();
  } catch (error) {
    console.error("[catalog] getSubcategories failed:", error);
    return [];
  }
}

/** Bilingual fandoms — drive the store filter. Invalidated on admin edits. */
const cachedFandoms = unstable_cache(
  async (): Promise<FandomInfo[]> => {
    const supabase = createAnonClient();
    const { data, error } = await supabase
      .from("fandoms")
      .select("code, name_ar, name_en")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((f) => ({ code: f.code, nameAr: f.name_ar, nameEn: f.name_en }));
  },
  ["catalog:fandoms"],
  { tags: [TAGS.fandoms], revalidate: 3600 },
);

export async function getFandoms(): Promise<FandomInfo[]> {
  try {
    return await cachedFandoms();
  } catch (error) {
    console.error("[catalog] getFandoms failed:", error);
    return [];
  }
}

/**
 * Live global offers (flash / bundle / cart conditions). Short revalidation so
 * flash sales start/stop promptly; admin edits also revalidate on demand.
 * Anon-cached, so user-specific offers are NOT included here — the server
 * pricing engine still applies them at checkout.
 */
const cachedOffers = unstable_cache(
  async (): Promise<Offer[]> => {
    const supabase = createAnonClient();
    const { data, error } = await supabase
      .from("offers")
      .select(
        "id, kind, title_ar, title_en, product_id, buy_qty, free_qty, min_cart_total, percent, delivery_fee, ends_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data as OfferRowLike[]).map(mapOffer);
  },
  ["catalog:offers"],
  { tags: [TAGS.offers], revalidate: 60 },
);

export async function getOffers(): Promise<Offer[]> {
  try {
    return await cachedOffers();
  } catch (error) {
    console.error("[catalog] getOffers failed:", error);
    return [];
  }
}

/** Custom-request unit prices — display only; the RPC re-reads them itself. */
const cachedCustomPricing = unstable_cache(
  async (): Promise<CustomPricing[]> => {
    const supabase = createAnonClient();
    const { data, error } = await supabase.from("custom_pricing").select("*");
    if (error) throw error;
    return (data ?? []).map((r) => ({
      kind: r.kind as CustomType,
      unitPrice: r.unit_price,
      waterproofExtra: r.waterproof_extra,
    }));
  },
  ["catalog:custom-pricing"],
  { tags: [TAGS.settings], revalidate: 300 },
);

export async function getCustomPricing(): Promise<CustomPricing[]> {
  try {
    return await cachedCustomPricing();
  } catch (error) {
    console.error("[catalog] getCustomPricing failed:", error);
    return [];
  }
}

/**
 * The GLOBAL by-count price ladder. Shared by every product flagged
 * `volume_priced`, so items from different packages/categories accumulate into
 * one count. Display only — place_order() re-resolves the tier at checkout.
 */
const cachedVolumeTiers = unstable_cache(
  async (): Promise<VolumeTier[]> => {
    const supabase = createAnonClient();
    const { data, error } = await supabase
      .from("volume_tiers")
      .select("min_qty, unit_price")
      .order("min_qty", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((t) => ({ minQty: t.min_qty, unitPrice: t.unit_price }));
  },
  ["catalog:volume-tiers"],
  { tags: [TAGS.settings], revalidate: 300 },
);

export async function getVolumeTiers(): Promise<VolumeTier[]> {
  try {
    return await cachedVolumeTiers();
  } catch (error) {
    console.error("[catalog] getVolumeTiers failed:", error);
    return [];
  }
}

const SITE_SETTINGS_FALLBACK: SiteSettings = {
  deliveryFeeDefault: 5000,
  deliveryFeeKarbala: 3000,
  deliveryNoticeActive: true,
  waterproofProductsActive: true,
  waterproofCustomActive: true,
  statFollowers: "16K",
  statProducts: "75+",
  statRating: "4.9",
};

const SETTINGS_COLUMNS = "delivery_fee_default, delivery_fee_karbala, stat_followers, stat_products, stat_rating";

/**
 * Column sets to try, richest first, falling back one migration at a time.
 *
 * PostgREST rejects the WHOLE select when any one column is unknown, so a
 * single optimistic-then-base pair would throw away `delivery_notice_active`
 * (already migrated) the moment the newer waterproof columns were missing.
 * Stepping down one group at a time keeps whatever the database does have.
 */
const SETTINGS_COLUMN_SETS = [
  `${SETTINGS_COLUMNS}, delivery_notice_active, waterproof_products_active, waterproof_custom_active`,
  `${SETTINGS_COLUMNS}, delivery_notice_active`,
  SETTINGS_COLUMNS,
];

const cachedSiteSettings = unstable_cache(
  async (): Promise<SiteSettings> => {
    const supabase = createAnonClient();
    const read = (columns: string) =>
      supabase.from("settings").select(columns).limit(1).maybeSingle();

    let data: unknown = null;
    let error: { message?: string } | null = null;
    for (const columns of SETTINGS_COLUMN_SETS) {
      ({ data, error } = await read(columns));
      if (!error) break;
    }
    if (error) throw error;
    if (!data) return SITE_SETTINGS_FALLBACK;
    const row = data as Partial<{
      delivery_fee_default: number;
      delivery_fee_karbala: number;
      delivery_notice_active: boolean;
      waterproof_products_active: boolean;
      waterproof_custom_active: boolean;
      stat_followers: string;
      stat_products: string;
      stat_rating: string;
    }>;
    return {
      deliveryFeeDefault: row.delivery_fee_default ?? SITE_SETTINGS_FALLBACK.deliveryFeeDefault,
      deliveryFeeKarbala: row.delivery_fee_karbala ?? SITE_SETTINGS_FALLBACK.deliveryFeeKarbala,
      // Absent column → keep showing it, which is what the shop does today.
      deliveryNoticeActive: row.delivery_notice_active ?? true,
      // Same rule: an un-migrated database keeps offering waterproof exactly as
      // it does now, rather than silently withdrawing a paid add-on.
      waterproofProductsActive: row.waterproof_products_active ?? true,
      waterproofCustomActive: row.waterproof_custom_active ?? true,
      statFollowers: row.stat_followers ?? SITE_SETTINGS_FALLBACK.statFollowers,
      statProducts: row.stat_products ?? SITE_SETTINGS_FALLBACK.statProducts,
      statRating: row.stat_rating ?? SITE_SETTINGS_FALLBACK.statRating,
    };
  },
  ["catalog:site-settings"],
  { tags: [TAGS.settings], revalidate: 300 },
);

export async function getSiteSettings(): Promise<SiteSettings> {
  try {
    return await cachedSiteSettings();
  } catch (error) {
    console.error("[catalog] getSiteSettings failed:", error);
    return SITE_SETTINGS_FALLBACK;
  }
}

/**
 * Units sold per product id, aggregated from order_items — the real signal
 * behind the "most ordered" rail. Reads with the service-role client because
 * order_items isn't publicly readable; only the aggregated counts ever leave
 * the server. Degrades to {} when the key is absent so the page still renders.
 *
 * Custom-request lines carry a null product_id and are skipped.
 */
const cachedBestSellers = unstable_cache(
  async (): Promise<Record<string, number>> => {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return {};
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("order_items")
      .select("product_id, qty")
      .not("product_id", "is", null)
      .limit(10000);
    if (error) throw error;

    const sold: Record<string, number> = {};
    for (const row of data ?? []) {
      if (!row.product_id) continue;
      sold[row.product_id] = (sold[row.product_id] ?? 0) + (row.qty ?? 0);
    }
    return sold;
  },
  ["catalog:best-sellers"],
  { tags: [TAGS.sales], revalidate: 300 },
);

export async function getBestSellerCounts(): Promise<Record<string, number>> {
  try {
    return await cachedBestSellers();
  } catch (error) {
    console.error("[catalog] getBestSellerCounts failed:", error);
    return {};
  }
}

/**
 * Product ids ranked by units actually ordered, most first — the signal behind
 * the store's "most popular" sort. Built from the same cached aggregate as the
 * home page's "الأكثر طلباً" rail, so the two can't disagree about what's
 * popular.
 *
 * Only the ORDER crosses to the browser, never the counts: the sort needs
 * nothing more, and how many of each item the shop has sold is its business.
 * Products that have never sold are left out entirely — the caller ranks those
 * by the admin's curation instead.
 */
export async function getPopularityRanking(): Promise<string[]> {
  const sold = await getBestSellerCounts();
  return Object.entries(sold)
    .filter(([, units]) => units > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
}

/**
 * Every showcase group with its product ids, in the admin's order. Catches
 * inside the cached function so a missing table (before the SQL is applied) or
 * a transient error resolves to an empty list instead of registering an
 * uncached access — which would break the home page prerender.
 */
const cachedFeaturedGroups = unstable_cache(
  async (): Promise<FeaturedGroup[]> => {
    try {
      const supabase = createAnonClient();
      const BASE = "id, name_ar, name_en, sort_order, featured_group_products(product_id, sort_order)";
      const WITH_LINK =
        "id, name_ar, name_en, sort_order, link_scope, link_value, " +
        "featured_group_products(product_id, sort_order)";

      const load = (columns: string) =>
        supabase
          .from("featured_groups")
          .select(columns)
          .eq("is_deleted", false)
          .order("sort_order", { ascending: true });

      // Ask for the "view all" columns, but fall back to the base shape if they
      // aren't there yet — otherwise deploying ahead of the migration would
      // fail the whole query and blank every rail on the home page.
      let { data, error } = await load(WITH_LINK);
      if (error) ({ data, error } = await load(BASE));
      if (error) throw error;

      const rows = (data ?? []) as unknown as {
        id: string;
        name_ar: string;
        name_en: string;
        sort_order: number;
        /** absent until the link migration runs (see the fallback above) */
        link_scope?: string | null;
        link_value?: string | null;
        featured_group_products?: { product_id: string; sort_order: number }[] | null;
      }[];

      return rows.map((g) => ({
        id: g.id,
        nameAr: g.name_ar,
        nameEn: g.name_en,
        order: g.sort_order,
        linkScope: (g.link_scope ?? null) as FeaturedGroup["linkScope"],
        linkValues: (g.link_value ?? "")
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        productIds: (g.featured_group_products ?? [])
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((p) => p.product_id),
      }));
    } catch (error) {
      console.error("[catalog] getFeaturedGroups failed:", error);
      return [];
    }
  },
  ["catalog:featured-groups"],
  { tags: [TAGS.products, TAGS.settings], revalidate: 300 },
);

export async function getFeaturedGroups(): Promise<FeaturedGroup[]> {
  return cachedFeaturedGroups();
}

export interface AnnouncementSettings {
  ar: string;
  en: string;
  active: boolean;
}

const cachedAnnouncement = unstable_cache(
  async (): Promise<AnnouncementSettings | null> => {
    const supabase = createAnonClient();
    const { data, error } = await supabase
      .from("settings")
      .select("announcement_ar, announcement_en, announcement_active")
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      ar: data.announcement_ar ?? "",
      en: data.announcement_en ?? "",
      active: data.announcement_active,
    };
  },
  ["catalog:announcement"],
  { tags: [TAGS.settings], revalidate: 300 },
);

export async function getAnnouncement(): Promise<AnnouncementSettings | null> {
  try {
    return await cachedAnnouncement();
  } catch (error) {
    console.error("[catalog] getAnnouncement failed:", error);
    return null;
  }
}
