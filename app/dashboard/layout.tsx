import { requireAdmin } from "@/lib/auth/dal";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

// The dashboard is per-admin and always dynamic. The proxy performs an
// optimistic redirect; this is the authoritative server-side gate.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <DashboardShell>{children}</DashboardShell>;
}
