import "server-only";
import { revalidatePath, revalidateTag } from "next/cache";
import { TAGS } from "@/lib/data/tags";

/**
 * Drop the catalog cache after anything that changes what a product looks
 * like or how much of it is left — stock, price, categories, etc.
 *
 * Deliberately NOT in a "use server" file: every top-level export of one of
 * those becomes a Server Action, which Next.js requires to be async — a plain
 * sync helper like this one breaks the whole file the moment it's exported
 * from it (see the restock queue's first draft, which took the entire site
 * down by exporting this from lib/actions/products.ts).
 */
export function revalidateCatalog() {
  revalidateTag(TAGS.products, "max");
  revalidatePath("/");
  revalidatePath("/store");
  revalidatePath("/dashboard/inventory");
}
