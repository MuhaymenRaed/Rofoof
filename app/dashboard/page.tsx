import { requireAdmin } from "@/lib/auth/dal";
import { getDashboardStats, getWeeklyRevenue, getStatusCounts } from "@/lib/data/dashboard";
import { getAllOrders } from "@/lib/data/orders";
import { OverviewView } from "@/components/dashboard/overview-view";

export const dynamic = "force-dynamic";

export default async function DashboardOverviewPage() {
  await requireAdmin();
  const [stats, weekly, statusCounts, latestPage] = await Promise.all([
    getDashboardStats(),
    getWeeklyRevenue(),
    getStatusCounts(),
    getAllOrders(0, 5),
  ]);

  return (
    <OverviewView stats={stats} weekly={weekly} statusCounts={statusCounts} latest={latestPage.orders} />
  );
}
