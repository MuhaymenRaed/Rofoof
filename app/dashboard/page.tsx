import { requireAdmin } from "@/lib/auth/dal";
import { getDashboardStats, getWeeklyRevenue } from "@/lib/data/dashboard";
import { getAllOrders } from "@/lib/data/orders";
import { OverviewView } from "@/components/dashboard/overview-view";

export const dynamic = "force-dynamic";

export default async function DashboardOverviewPage() {
  await requireAdmin();
  const [stats, weekly, latestPage] = await Promise.all([
    getDashboardStats(),
    getWeeklyRevenue(),
    getAllOrders(0, 5),
  ]);

  return <OverviewView stats={stats} weekly={weekly} latest={latestPage.orders} />;
}
