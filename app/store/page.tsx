import { StoreView } from "@/components/store/store-view";

export default async function StorePage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
}) {
  const { cat } = await searchParams;
  // Categories are dynamic (DB-driven) — unknown codes simply match nothing.
  const initialCategory = cat?.trim() || "all";

  return <StoreView initialCategory={initialCategory} />;
}
