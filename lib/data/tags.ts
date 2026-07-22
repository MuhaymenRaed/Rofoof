/** Cache tags for on-demand revalidation (revalidateTag). */
export const TAGS = {
  products: "products",
  categories: "categories",
  fandoms: "fandoms",
  offers: "offers",
  settings: "settings",
  /** units-sold aggregate — invalidated whenever an order is placed */
  sales: "sales",
} as const;
