import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/dal";
import { getCustomers } from "@/lib/data/dashboard";
import { CustomersView } from "@/components/dashboard/customers-view";
import DashboardLoading from "../loading";

async function CustomersContent() {
  await requireAdmin();
  const { customers, hasMore } = await getCustomers();
  return <CustomersView initialCustomers={customers} initialHasMore={hasMore} />;
}

export default function DashboardCustomersPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <CustomersContent />
    </Suspense>
  );
}
