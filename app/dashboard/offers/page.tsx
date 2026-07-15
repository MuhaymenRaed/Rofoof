import { requireAdmin } from "@/lib/auth/dal";
import { getAdminOffers } from "@/lib/actions/offers";
import { OffersView } from "@/components/dashboard/offers-view";

export const dynamic = "force-dynamic";

export default async function DashboardOffersPage() {
  await requireAdmin();
  const offers = await getAdminOffers();
  return <OffersView initialOffers={offers} />;
}
