import { requireAdmin } from "@/lib/auth/dal";
import { getAdminOffers, getAdminCoupons } from "@/lib/actions/offers";
import { getSiteSettings } from "@/lib/data/catalog";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OffersView } from "@/components/dashboard/offers-view";
import { CustomPricingEditor } from "@/components/dashboard/custom-pricing-editor";
import { StoreConfigEditor } from "@/components/dashboard/store-config-editor";
import { CouponsEditor } from "@/components/dashboard/coupons-editor";
import type { CustomPricing, CustomType } from "@/lib/products";

export const dynamic = "force-dynamic";

export default async function DashboardOffersPage() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const [offers, coupons, siteSettings, pricingRes] = await Promise.all([
    getAdminOffers(),
    getAdminCoupons(),
    getSiteSettings(),
    supabase.from("custom_pricing").select("*").order("kind"),
  ]);

  const pricing: CustomPricing[] = (pricingRes.data ?? []).map((r) => ({
    kind: r.kind as CustomType,
    unitPrice: r.unit_price,
    waterproofExtra: r.waterproof_extra,
  }));

  return (
    <>
      <StoreConfigEditor initial={siteSettings} />
      <CouponsEditor initialCoupons={coupons} />
      <CustomPricingEditor initialPricing={pricing} />
      <OffersView initialOffers={offers} />
    </>
  );
}
