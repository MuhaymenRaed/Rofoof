import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/dal";
import { getDashboardStats, getWeeklyRevenue, getStatusCounts } from "@/lib/data/dashboard";
import { getAllOrders } from "@/lib/data/orders";
import { OverviewView } from "@/components/dashboard/overview-view";
import { RangeStats } from "@/components/dashboard/range-stats";
import DashboardLoading from "./loading";

async function OverviewContent() {
  await requireAdmin();
  const [stats, weekly, statusCounts, latestPage] = await Promise.all([
    getDashboardStats(),
    getWeeklyRevenue(),
    getStatusCounts(),
    getAllOrders(0, 5),
  ]);

  return (
    <OverviewView
      stats={stats}
      weekly={weekly}
      statusCounts={statusCounts}
      latest={latestPage.orders}
    />
  );
}

export default function DashboardOverviewPage() {
  return (
    <>
      {/* Client-side and clock-dependent (defaults to today) — needs its own
          boundary so the rest of the shell can still prerender. */}
      <Suspense fallback={null}>
        <RangeStats />
      </Suspense>
      <Suspense fallback={<DashboardLoading />}>
        <OverviewContent />
      </Suspense>
    </>
  );
}
