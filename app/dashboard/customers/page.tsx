import { requireAdmin } from "@/lib/auth/dal";
import { getCustomers } from "@/lib/data/dashboard";
import { CustomersView } from "@/components/dashboard/customers-view";

export const dynamic = "force-dynamic";

export default async function DashboardCustomersPage() {
  await requireAdmin();
  const { customers, hasMore } = await getCustomers();
  return <CustomersView initialCustomers={customers} initialHasMore={hasMore} />;
}
