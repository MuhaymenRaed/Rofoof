"use client";

import Link from "next/link";
import { useStore } from "@/components/providers/store-provider";
import { ProductCard } from "@/components/ui/product-card";
import { Heart } from "@/components/icons";

export function FavoritesView() {
  const { t, wishlist, products } = useStore();
  const items = products.filter((p) => wishlist.includes(p.id));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-7">
        <h1 className="flex items-center gap-2.5 text-2xl font-black text-ink">
          <span className="h-6 w-1.5 rounded-full bg-brand" />
          {t("fav.title")}
        </h1>
        <p className="mt-2 text-sm text-ink-2">
          {items.length > 0 ? `${items.length} ${t("fav.count")}` : t("fav.subtitle")}
        </p>
      </header>

      {items.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-dashed border-line bg-surface py-20 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-brand-soft text-brand">
            <Heart size={28} />
          </div>
          <p className="mt-4 font-bold text-ink">{t("fav.empty")}</p>
          <p className="mt-1 text-sm text-ink-3">{t("fav.emptyHint")}</p>
          <Link
            href="/store"
            className="tap mt-5 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
          >
            {t("cart.browse")}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
