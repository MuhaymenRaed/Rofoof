import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/dal";
import { getRestockQueue } from "@/lib/data/restock";
import { RestockView } from "@/components/dashboard/restock-view";
import DashboardLoading from "../loading";

async function RestockContent() {
  await requireAdmin();
  const { items, hasMore, failure } = await getRestockQueue();
  return (
    <RestockView initialItems={items} initialHasMore={hasMore} initialFailure={failure ?? null} />
  );
}

export default function DashboardRestockPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <RestockContent />
    </Suspense>
  );
}
