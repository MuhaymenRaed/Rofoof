"use client";

import { useState } from "react";
import { useStore } from "@/components/providers/store-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { badgeMeta, ProductBadge } from "@/components/ui/badge";
import { ProductMedia } from "@/components/ui/product-media";
import { ProductEditorModal } from "@/components/dashboard/product-editor-modal";
import { Pencil } from "@/components/dashboard/dash-icons";
import { Heart, Cart, Check } from "@/components/icons";
import { formatPrice } from "@/lib/format";
import { hasVariablePrice, lowestPrice, type Product } from "@/lib/products";

type CSSVars = React.CSSProperties & Record<string, string>;

export function ProductCard({
  product,
  priority = false,
}: {
  product: Product;
  /** Skip lazy-loading for above-the-fold cards (improves LCP). */
  priority?: boolean;
}) {
  const { lang, t, addToCart, openQuickView, isWished, toggleWish, openCart } = useStore();
  const { isAdmin, ready } = useAuth();
  const [justAdded, setJustAdded] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  const name = lang === "ar" ? product.nameAr : product.nameEn;
  const sub = lang === "ar" ? product.subAr : product.subEn;
  const wished = isWished(product.id);
  const badge = product.badge ? badgeMeta[product.badge] : null;
  const onSale = product.discountPercent > 0;
  const price = lowestPrice(product);
  const showFrom = hasVariablePrice(product);
  const isPackage = product.kind === "package" && product.items.length > 0;

  const style: CSSVars = { "--c": product.color };

  function handleAdd(e: React.MouseEvent) {
    e.stopPropagation();
    if (product.soldOut) return;
    // Packages need an item choice (and tiered products benefit from the
    // quantity ladder) — open the quick view instead of blind-adding.
    if (isPackage || product.kind === "tiered") {
      openQuickView(product.id);
      return;
    }
    addToCart(product.id);
    setJustAdded(true);
    openCart();
    setTimeout(() => setJustAdded(false), 1200);
  }

  return (
    <article
      style={style}
      className="group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line-2 bg-surface transition duration-200 hover:-translate-y-1 hover:border-[var(--c)] hover:shadow-[0_10px_30px_-12px_color-mix(in_srgb,var(--c)_55%,transparent)]"
    >
      {/* Image / emoji — opens quick view */}
      <button
        type="button"
        onClick={() => openQuickView(product.id)}
        aria-label={name}
        className="tap relative block aspect-square w-full overflow-hidden"
      >
        <ProductMedia product={product} name={name} priority={priority} />

        {onSale && (
          <span className="absolute top-2 end-2 rounded-full bg-brand px-2.5 py-1 text-[10px] font-black text-white shadow-md">
            -{product.discountPercent}%
          </span>
        )}

        {badge && (
          <span className="absolute bottom-2 end-2">
            <ProductBadge label={t(badge.key)} color={badge.color} />
          </span>
        )}

        {product.soldOut && (
          <span className="absolute inset-0 grid place-items-center bg-[color-mix(in_srgb,var(--surface)_72%,transparent)] backdrop-blur-[1px]">
            <span className="rounded-full bg-ink px-3 py-1.5 text-[11px] font-bold text-surface">
              {t("badge.soldout")}
            </span>
          </span>
        )}
      </button>

      {/* Wishlist toggle */}
      <button
        type="button"
        onClick={() => toggleWish(product.id)}
        aria-pressed={wished}
        aria-label={t("aria.favorites")}
        className={`tap absolute top-2 start-2 grid h-8 w-8 place-items-center rounded-full border transition ${
          wished
            ? "border-brand bg-brand text-white"
            : "reveal-on-hover border-line-2 bg-surface/90 text-ink-2 backdrop-blur hover:border-brand hover:text-brand"
        }`}
      >
        <Heart size={15} filled={wished} />
      </button>

      {/* Admin: edit product in place */}
      {ready && isAdmin && (
        <button
          type="button"
          onClick={() => setEditorOpen(true)}
          aria-label={t("dash.editProduct")}
          className="reveal-on-hover tap absolute top-11 start-2 grid h-8 w-8 place-items-center rounded-full border border-line-2 bg-surface/90 text-ink-2 backdrop-blur transition hover:border-brand hover:text-brand"
        >
          <Pencil size={14} />
        </button>
      )}

      {/* Body */}
      <div className="flex flex-1 flex-col p-3">
        <button
          type="button"
          onClick={() => openQuickView(product.id)}
          className="tap text-start"
        >
          <h3 className="line-clamp-1 text-[13px] font-bold text-ink transition hover:text-brand">
            {name}
          </h3>
        </button>
        <p className="mt-0.5 line-clamp-1 text-[11px] text-ink-3">{sub}</p>

        <div className="mt-auto flex items-center justify-between pt-3">
          <span className="flex flex-col leading-tight">
            {onSale && (
              <span className="text-[10px] font-semibold text-ink-3 line-through">
                {formatPrice(product.price, lang)}
              </span>
            )}
            <span className="text-sm font-extrabold" style={{ color: "var(--c)" }}>
              {showFrom && (
                <span className="me-1 text-[10px] font-semibold text-ink-3">
                  {t("product.from")}
                </span>
              )}
              {formatPrice(price, lang)}
            </span>
          </span>
          <button
            type="button"
            onClick={handleAdd}
            disabled={product.soldOut}
            aria-label={t("product.add")}
            className="tap grid h-9 w-9 place-items-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background: justAdded ? "var(--c)" : "color-mix(in srgb, var(--c) 13%, transparent)",
              color: justAdded ? "#fff" : "var(--c)",
            }}
          >
            {justAdded ? <Check size={16} /> : <Cart size={16} />}
          </button>
        </div>
      </div>

      {ready && isAdmin && (
        <ProductEditorModal
          open={editorOpen}
          product={product}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </article>
  );
}
