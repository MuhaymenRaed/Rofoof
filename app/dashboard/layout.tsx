import { DashboardShell } from "@/components/dashboard/dashboard-shell";

// Static shell so the dashboard chrome prerenders and streams instantly under
// Cache Components. Every page under /dashboard runs its own authoritative
// requireAdmin() gate (and the proxy does an optimistic redirect), so moving
// the check out of the layout doesn't weaken access control.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
