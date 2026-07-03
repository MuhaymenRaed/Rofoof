"use server";

import { requireAdmin } from "@/lib/auth/dal";
import { getCustomers, type CustomersPage } from "@/lib/data/dashboard";

/** Next page of the admin customers list (infinite scroll). */
export async function loadMoreCustomersAction(offset: number): Promise<CustomersPage> {
  await requireAdmin();
  return getCustomers(offset);
}
