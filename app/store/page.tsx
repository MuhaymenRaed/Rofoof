import { Suspense } from "react";
import type { Metadata } from "next";
import { StoreView } from "@/components/store/store-view";
import { getCategories, getFandoms, getSubcategories } from "@/lib/data/catalog";
import { parseListParam } from "@/lib/url-params";
import StoreLoading from "./loading";

/**
 * Static shell + ISR. Every filter lives in the query string (category,
 * subcategory, fandom, waterproof, maxPrice, search, sort, page) and is read
 * client-side by StoreView via useSearchParams inside Suspense — instead of
 * awaiting searchParams in the page itself. That keeps the whole catalogue
 * prerenderable and served from cache rather than rendered per request, while
 * the URL still carries a fully shareable view.
 */

type SearchParams = Record<string, string | string[] | undefined>;

/** First value of a param, whichever shape Next hands us. */
function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

/**
 * Describe the filtered view in the page title, so a link shared on WhatsApp
 * or Telegram previews as "ستكرات، بروشات · متجر رفوف" rather than a generic
 * store title.
 *
 * Filtered views are deliberately `noindex, follow` with a canonical back to
 * /store: faceted URLs are near-duplicates of the catalogue, and letting search
 * engines index every combination would split ranking signals across thousands
 * of thin pages. Crawlers still follow through to the products themselves.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const params = await searchParams;

  const categoryCodes = parseListParam(one(params.category) || one(params.cat));
  const subCodes = parseListParam(one(params.subcategory));
  const fandomCodes = parseListParam(one(params.fandom));
  const search = one(params.search) || one(params.q);
  const waterproof = one(params.waterproof) === "true";

  const isFiltered =
    categoryCodes.length > 0 ||
    subCodes.length > 0 ||
    fandomCodes.length > 0 ||
    search !== "" ||
    waterproof ||
    one(params.maxPrice) !== "";

  if (!isFiltered) {
    return {
      title: "المتجر",
      description:
        "تصفّح ستكرات وبروشات وميداليات وبوسترات رفوف — فلترة حسب الفئة والتصنيف والسعر، وتوصيل لجميع محافظات العراق.",
      alternates: { canonical: "/store" },
    };
  }

  // Resolve the codes to their Arabic labels (cached reads, no extra DB load).
  const [categories, subcategories, fandoms] = await Promise.all([
    getCategories(),
    getSubcategories(),
    getFandoms(),
  ]);

  const labels = [
    ...categoryCodes.map((c) => categories.find((x) => x.code === c)?.nameAr).filter(Boolean),
    ...subCodes.map((s) => subcategories.find((x) => x.code === s)?.nameAr).filter(Boolean),
    ...fandomCodes.map((f) => fandoms.find((x) => x.code === f)?.nameAr).filter(Boolean),
  ] as string[];

  if (waterproof) labels.push("مقاوم للماء");

  const heading = search
    ? `نتائج البحث عن «${search}»`
    : labels.length > 0
      ? labels.join("، ")
      : "المتجر";

  return {
    title: heading,
    description: `${heading} — من متجر رفوف، مع توصيل لجميع محافظات العراق.`,
    // Facets are near-duplicates of /store: don't index them, but do follow
    // through to the products.
    robots: { index: false, follow: true },
    alternates: { canonical: "/store" },
  };
}

export default function StorePage() {
  return (
    <Suspense fallback={<StoreLoading />}>
      <StoreView />
    </Suspense>
  );
}
