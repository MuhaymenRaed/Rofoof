import { requireAdmin } from "@/lib/auth/dal";
import { getAdminOffers } from "@/lib/actions/offers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OffersView } from "@/components/dashboard/offers-view";
import { CustomPricingEditor } from "@/components/dashboard/custom-pricing-editor";
import type { CustomPricing, CustomType } from "@/lib/products";

export const dynamic = "force-dynamic";

export default async function DashboardOffersPage() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const [offers, pricingRes] = await Promise.all([
    getAdminOffers(),
    supabase.from("custom_pricing").select("*").order("kind"),
  ]);

  const pricing: CustomPricing[] = (pricingRes.data ?? []).map((r) => ({
    kind: r.kind as CustomType,
    unitPrice: r.unit_price,
    waterproofExtra: r.waterproof_extra,
  }));

  return (
    <>
      <CustomPricingEditor initialPricing={pricing} />
      <OffersView initialOffers={offers} />
    </>
  );
}
