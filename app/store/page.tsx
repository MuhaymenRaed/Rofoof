import { Suspense } from "react";
import { StoreView } from "@/components/store/store-view";
import StoreLoading from "./loading";

/**
 * Static shell + ISR. Every filter lives in the query string (category,
 * subcategory, fandom, waterproof, maxPrice, search, sort, page) and is read
 * client-side by StoreView via useSearchParams inside Suspense — instead of
 * awaiting searchParams on the server. That keeps the whole catalogue page
 * prerenderable and served from cache rather than rendered per request, while
 * the URL still carries a fully shareable view.
 */

export default function StorePage() {
  return (
    <Suspense fallback={<StoreLoading />}>
      <StoreView />
    </Suspense>
  );
}
