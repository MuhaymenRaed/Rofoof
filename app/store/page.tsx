import { Suspense } from "react";
import { StoreView } from "@/components/store/store-view";
import StoreLoading from "./loading";

/**
 * Static shell + ISR. The `?cat=` filter is read client-side by StoreView
 * (via useSearchParams, inside Suspense) instead of awaiting searchParams on
 * the server — that keeps the whole catalog page prerenderable and served
 * from cache rather than rendered per request.
 */

export default function StorePage() {
  return (
    <Suspense fallback={<StoreLoading />}>
      <StoreView />
    </Suspense>
  );
}
