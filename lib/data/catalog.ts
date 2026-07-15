import "server-only";
import { unstable_cache } from "next/cache";
import { createAnonClient } from "@/lib/supabase/anon";
import { mapProduct, mapOffer, type ProductRowWithFandoms, type OfferRowLike } from "./mappers";
import { TAGS } from "./tags";
import type { CategoryInfo, FandomInfo, Offer, Product } from "@/lib/products";

const PRODUCT_SELECT =
  "*, product_fandoms(fandom_code), product_categories(category_code), " +
  "product_items(id, image_url, name_ar, name_en, price, sort_order, is_active, is_deleted), " +
  "product_price_tiers(min_qty, unit_price)";

/**
 * Public catalog. Cached across requests (tag: products, revalidate 5 min) and
 * invalidated on-demand when an admin edits inventory. Uses the stateless anon
 * client so the calling route stays static / ISR-friendly.
 */
const cachedProducts = unstable_cache(
  async (): Promise<Product[]> => {
    const supabase = createAnonClient();
    const { data, error } = await supabase
      .from("products")
      .select(PRODUCT_SELECT)
      .eq("is_active", true)
      .order("sort_order", { ascending: false });
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

/** Bilingual categories — drive the chips + filters. Invalidated on admin edits. */
const cachedCategories = unstable_cache(
  async (): Promise<CategoryInfo[]> => {
    const supabase = createAnonClient();
    const { data, error } = await supabase
      .from("categories")
      .select("code, name_ar, name_en, icon")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((c) => ({
      code: c.code,
      nameAr: c.name_ar,
      nameEn: c.name_en,
      icon: c.icon,
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
