"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useStore } from "@/components/providers/store-provider";
import { X, Heart, Cart, Check, Truck, Droplet } from "@/components/icons";
import { Stars } from "@/components/ui/stars";
import { QtyStepper } from "@/components/ui/qty-stepper";
import { formatPrice } from "@/lib/format";
import { effectivePrice, type Product } from "@/lib/products";

type CSSVars = React.CSSProperties & Record<string, string>;

export function QuickViewModal() {
  const { quickView, closeQuickView } = useStore();

  useEffect(() => {
    if (!quickView) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeQuickView();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [quickView, closeQuickView]);

  if (!quickView) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div
        onClick={closeQuickView}
        className="absolute inset-0 bg-black/55 backdrop-blur-[3px]"
        style={{ animation: "fade-in 0.2s ease both" }}
      />
      <Content key={quickView.id} product={quickView} onClose={closeQuickView} />
    </div>
  );
}

function Content({ product, onClose }: { product: Product; onClose: () => void }) {
  const { lang, t, addToCart, openCart, isWished, toggleWish } = useStore();
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [added, setAdded] = useState(false);
  const [active, setActive] = useState(0);

  const images = product.images ?? [];
  const name = lang === "ar" ? product.nameAr : product.nameEn;
  const sub = lang === "ar" ? product.subAr : product.subEn;
  const desc = lang === "ar" ? product.descAr : product.descEn;
  const wished = isWished(product.id);
  const style: CSSVars = { "--c": product.color };

  function handleAdd() {
    if (product.soldOut) return;
    addToCart(product.id, qty, note.trim() || undefined);
    setAdded(true);
    setTimeout(() => {
      onClose();
      openCart();
    }, 550);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={name}
      style={style}
      className="relative z-10 grid max-h-[88vh] w-full max-w-3xl animate-pop overflow-hidden rounded-3xl border border-line-2 bg-surface shadow-2xl md:grid-cols-2"
    >
      <span className="absolute inset-x-0 top-0 z-10 h-1 md:hidden" style={{ background: "var(--c)" }} />

      {/* Close */}
      <button
        type="button"
        onClick={onClose}
        aria-label={t("aria.close")}
        className="tap absolute end-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-full bg-surface/80 text-ink-2 backdrop-blur transition hover:bg-surface-2 hover:text-ink"
      >
        <X size={18} />
      </button>

      {/* Preview */}
      <div
        className="relative hidden place-items-center overflow-hidden md:grid"
        style={{ background: "color-mix(in srgb, var(--c) 14%, var(--surface))" }}
      >
        <span className="absolute inset-y-0 start-0 z-10 w-1" style={{ background: "var(--c)" }} />
        {images.length > 0 ? (
          <>
            <Image
              src={images[active] ?? images[0]}
              alt={name}
              fill
              sizes="384px"
              className="object-cover"
            />
            {images.length > 1 && (
              <div className="no-scrollbar absolute inset-x-0 bottom-0 z-10 flex gap-2 overflow-x-auto bg-linear-to-t from-black/45 to-transparent p-3">
                {images.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setActive(i)}
                    aria-label={`${name} ${i + 1}`}
                    className={`tap h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                      i === active ? "border-white" : "border-white/40 hover:border-white/70"
                    }`}
                  >
                    <Image src={src} alt="" width={48} height={48} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <span className="text-[120px] drop-shadow-sm">{product.emoji}</span>
        )}
        {product.soldOut && (
          <span className="absolute bottom-5 z-20 rounded-full bg-ink px-4 py-2 text-xs font-bold text-surface">
            {t("badge.soldout")}
          </span>
        )}
      </div>

      {/* Details */}
      <div className="flex max-h-[88vh] flex-col overflow-y-auto p-6">
        {/* mobile media */}
        {images.length > 0 ? (
          <div className="mb-4 md:hidden">
            <div className="relative h-44 overflow-hidden rounded-2xl">
              <Image src={images[active] ?? images[0]} alt={name} fill sizes="100vw" className="object-cover" />
            </div>
            {images.length > 1 && (
              <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
                {images.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setActive(i)}
                    aria-label={`${name} ${i + 1}`}
                    className={`tap h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                      i === active ? "border-brand" : "border-line"
                    }`}
                  >
                    <Image src={src} alt="" width={48} height={48} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div
            className="mb-4 grid h-28 place-items-center rounded-2xl text-6xl md:hidden"
            style={{ background: "color-mix(in srgb, var(--c) 14%, var(--surface))" }}
          >
            {product.emoji}
          </div>
        )}

        <h2 className="text-xl font-black leading-tight text-ink">{name}</h2>
        <p className="mt-0.5 text-sm text-ink-3">{sub}</p>

        <div className="mt-3">
          <Stars rating={product.rating} reviews={product.reviews} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {product.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border px-3 py-1 text-[11px] font-bold"
              style={{
                color: "var(--c)",
                background: "color-mix(in srgb, var(--c) 10%, var(--surface))",
                borderColor: "color-mix(in srgb, var(--c) 28%, transparent)",
              }}
            >
              {tag}
            </span>
          ))}
        </div>

        <p className="mt-4 text-[13px] leading-relaxed text-ink-2">{desc}</p>

        <div className="mt-4 flex items-center gap-4 text-xs font-semibold text-ink-2">
          <span className="flex items-center gap-1.5">
            <Truck size={15} className="text-brand" /> {t("footer.delivery")}
          </span>
          {product.waterproof && (
            <span className="flex items-center gap-1.5">
              <Droplet size={15} className="text-brand" /> {t("badge.waterproof")}
            </span>
          )}
        </div>

        <div className="mt-5 flex items-center gap-3">
          <span className="text-2xl font-black" style={{ color: "var(--c)" }}>
            {formatPrice(effectivePrice(product), lang)}
          </span>
          {product.discountPercent > 0 && (
            <>
              <span className="text-sm font-bold text-ink-3 line-through">
                {formatPrice(product.price, lang)}
              </span>
              <span className="rounded-full bg-brand px-2.5 py-1 text-[11px] font-black text-white">
                -{product.discountPercent}% {t("product.off")}
              </span>
            </>
          )}
        </div>

        {/* Notes */}
        <label className="mt-5 block text-xs font-bold text-ink-2">{t("product.notes")}</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder={t("product.notesPlaceholder")}
          className="mt-2 w-full resize-none rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-3 focus:border-brand focus:bg-surface"
        />

        {/* Actions */}
        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => toggleWish(product.id)}
            aria-pressed={wished}
            aria-label={t("aria.favorites")}
            className={`tap grid h-12 w-12 shrink-0 place-items-center rounded-2xl border transition ${
              wished
                ? "border-brand bg-brand text-white"
                : "border-line text-ink-2 hover:border-brand hover:text-brand"
            }`}
          >
            <Heart size={20} filled={wished} />
          </button>

          <QtyStepper value={qty} onChange={(q) => setQty(Math.max(1, q))} />

          <button
            type="button"
            onClick={handleAdd}
            disabled={product.soldOut}
            className="tap flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-brand px-5 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-ink-3"
          >
            {product.soldOut ? (
              t("product.soldout")
            ) : added ? (
              <>
                <Check size={18} /> {t("product.added")}
              </>
            ) : (
              <>
                <Cart size={18} /> {t("product.add")}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
