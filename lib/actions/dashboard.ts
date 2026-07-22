"use server";

import { requireAdmin } from "@/lib/auth/dal";
import {
  getCustomers,
  getRangeStats,
  type CustomersPage,
  type RangeGrain,
  type RangeStats,
} from "@/lib/data/dashboard";

/** Next page of the admin customers list (infinite scroll). */
export async function loadMoreCustomersAction(offset: number): Promise<CustomersPage> {
  await requireAdmin();
  return getCustomers(offset);
}

const GRAINS: RangeGrain[] = ["day", "month", "year"];

/** Metrics for a picked day / month / year on the dashboard overview. */
export async function loadRangeStatsAction(
  fromIso: string,
  toIso: string,
  grain: RangeGrain,
): Promise<RangeStats> {
  await requireAdmin();
  if (!GRAINS.includes(grain)) grain = "month";
  return getRangeStats(fromIso, toIso, grain);
}
