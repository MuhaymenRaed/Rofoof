"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useStore } from "@/components/providers/store-provider";
import { X, Heart, Cart, Check, Truck, Droplet, Plus } from "@/components/icons";
import { Stars } from "@/components/ui/stars";
import { QtyStepper } from "@/components/ui/qty-stepper";
import { Countdown } from "@/components/ui/countdown";
import { formatPrice } from "@/lib/format";
import { tierUnitPrice, type Product, type ProductItem } from "@/lib/products";
import {
  bundleOfferFor,
  freeUnitsFor,
  liveFlashOffer,
  unitPriceFor,
} from "@/lib/pricing";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

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
  const { lang, t, addToCart, openCart, isWished, toggleWish, offers } = useStore();
  const supabase = createSupabaseBrowserClient();
  const customFileRef = useRef<HTMLInputElement>(null);

  const isPackage = product.kind === "package" && product.items.length > 0;
  const isTiered = product.kind === "tiered" && product.tiers.length > 0;

  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [added, setAdded] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ProductItem | null>(
    isPackage ? product.items[0] : null,
  );
  const [waterproof, setWaterproof] = useState(false);
  const [customUrl, setCustomUrl] = useState<string | null>(null);
  const [uploadingCustom, setUploadingCustom] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);

  const name = lang === "ar" ? product.nameAr : product.nameEn;
  const sub = lang === "ar" ? product.subAr : product.subEn;
  const desc = lang === "ar" ? product.descAr : product.descEn;
  const wished = isWished(product.id);
  const style: CSSVars = { "--c": product.color };

  const flash = liveFlashOffer(product, offers);
  const bundle = bundleOfferFor(product, offers);
  const unit = unitPriceFor(product, qty, { item: selectedItem, waterproof }, offers);
  const free = freeUnitsFor(product, qty, offers);
  const lineTotal = unit * Math.max(qty - free, 0);
  const baseUnit =
    product.kind === "tiered" ? tierUnitPrice(product, qty) : selectedItem?.price ?? product.price;
  const showStruck = unit < baseUnit;

  // What the big picture shows: selected item (package) or the gallery image.
  const mainImage = isPackage
    ? selectedItem?.imageUrl
    : product.images[galleryIndex] ?? product.images[0];

  async function pickCustom(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setUploadingCustom(true);
    const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("custom-artwork")
      .upload(path, f, { contentType: f.type });
    setUploadingCustom(false);
    if (!error) {
      setCustomUrl(supabase.storage.from("custom-artwork").getPublicUrl(path).data.publicUrl);
    }
  }

  function handleAdd() {
    if (product.soldOut) return;
    addToCart(product.id, qty, {
      itemId: selectedItem?.id,
      waterproof: waterproof && product.waterproof ? true : undefined,
      customImageUrl: customUrl ?? undefined,
      note: note.trim() || undefined,
    });
    setAdded(true);
    setTimeout(() => {
      onClose();
      openCart();
    }, 550);
  }

  const thumbs: { key: string; src: string; onPick: () => void; active: boolean }[] = isPackage
    ? product.items.map((it) => ({
        key: it.id,
        src: it.imageUrl,
        onPick: () => setSelectedItem(it),
        active: selectedItem?.id === it.id,
      }))
    : product.images.map((src, i) => ({
        key: src,
        src,
        onPick: () => setGalleryIndex(i),
        active: galleryIndex === i,
      }));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={name}
      style={style}
      className="relative z-10 grid max-h-[88vh] w-full max-w-3xl animate-pop overflow-hidden rounded-3xl border border-line-2 bg-surface shadow-2xl md:grid-cols-2"
    >
      <span className="absolute inset-x-0 top-0 z-10 h-1 md:hidden" style={{ background: "var(--c)" }} />

      <button
        type="button"
        onClick={onClose}
        aria-label={t("aria.close")}
        className="tap absolute end-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-full bg-surface/80 text-ink-2 backdrop-blur transition hover:bg-surface-2 hover:text-ink"
      >
        <X size={18} />
      </button>

      {/* Media panel (desktop) */}
      <div
        className="relative hidden place-items-center overflow-hidden md:grid"
        style={{ background: "color-mix(in srgb, var(--c) 14%, var(--surface))" }}
      >
        <span className="absolute inset-y-0 start-0 z-10 w-1" style={{ background: "var(--c)" }} />
        {mainImage ? (
          <Image src={mainImage} alt={name} fill sizes="384px" className="object-cover" />
        ) : (
          <span className="text-[120px] drop-shadow-sm">{product.emoji}</span>
        )}
        {thumbs.length > 1 && (
          <div className="no-scrollbar absolute inset-x-0 bottom-0 z-10 flex gap-2 overflow-x-auto bg-linear-to-t from-black/45 to-transparent p-3">
            {thumbs.map((th) => (
              <button
                key={th.key}
                type="button"
                onClick={th.onPick}
                aria-label={name}
                className={`tap h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                  th.active ? "border-white" : "border-white/40 hover:border-white/70"
                }`}
              >
                <Image src={th.src} alt="" width={48} height={48} className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
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
        {mainImage ? (
          <div className="mb-4 md:hidden">
            <div className="relative h-44 overflow-hidden rounded-2xl">
              <Image src={mainImage} alt={name} fill sizes="100vw" className="object-cover" />
            </div>
            {thumbs.length > 1 && (
              <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
                {thumbs.map((th) => (
                  <button
                    key={th.key}
                    type="button"
                    onClick={th.onPick}
                    aria-label={name}
                    className={`tap h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                      th.active ? "border-brand" : "border-line"
                    }`}
                  >
                    <Image src={th.src} alt="" width={48} height={48} className="h-full w-full object-cover" />
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

        {/* Live offer notes */}
        {(flash || bundle) && (
          <div className="mt-3 space-y-1.5">
            {flash && flash.endsAt && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-line bg-brand-soft px-3 py-2 text-[12px] font-bold text-brand">
                <span>⚡ {lang === "ar" ? flash.titleAr : flash.titleEn}</span>
                <span className="ms-auto flex items-center gap-1.5">
                  {t("offer.endsIn")} <Countdown endsAt={flash.endsAt} />
                </span>
              </div>
            )}
            {bundle && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px] font-bold text-emerald-600">
                🎁 {lang === "ar" ? bundle.titleAr : bundle.titleEn}
              </div>
            )}
          </div>
        )}

        {/* Package: pick a design */}
        {isPackage && (
          <p className="mt-4 text-xs font-bold text-ink-2">
            {t("product.chooseItem")}
            {selectedItem && (selectedItem.nameAr || selectedItem.nameEn) && (
              <span className="ms-2 font-semibold text-ink-3">
                {lang === "ar" ? selectedItem.nameAr : selectedItem.nameEn}
              </span>
            )}
          </p>
        )}

        {/* Tiered: volume price ladder */}
        {isTiered && (
          <div className="mt-4 overflow-hidden rounded-xl border border-line-2">
            <p className="bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-ink-2">
              {t("product.tierTable")}
            </p>
            <div className="flex divide-x divide-line-2 rtl:divide-x-reverse">
              {product.tiers.map((tier) => {
                const active = tierUnitPrice(product, qty) === tier.unitPrice;
                return (
                  <div
                    key={tier.minQty}
                    className={`flex-1 px-2 py-2 text-center transition ${active ? "bg-brand-soft" : ""}`}
                  >
                    <p className="text-[11px] font-bold text-ink-3">{tier.minQty}+</p>
                    <p className={`text-[12px] font-black ${active ? "text-brand" : "text-ink"}`}>
                      {tier.unitPrice.toLocaleString("en-US")}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Waterproof option */}
        {product.waterproof && (
          <label className="mt-4 flex cursor-pointer items-center justify-between rounded-xl border border-line-2 bg-surface-2/50 px-3.5 py-2.5">
            <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
              <Droplet size={16} className="text-brand" />
              {t("product.waterproofOption")}
              {product.waterproofSurcharge > 0 && (
                <span className="text-[11px] font-bold text-ink-3">
                  (+{formatPrice(product.waterproofSurcharge, lang)})
                </span>
              )}
            </span>
            <input
              type="checkbox"
              checked={waterproof}
              onChange={(e) => setWaterproof(e.target.checked)}
              className="h-4 w-4 accent-brand"
            />
          </label>
        )}

        {/* Custom artwork (posters) */}
        {product.allowCustomImage && (
          <div className="mt-4">
            <p className="text-xs font-bold text-ink-2">{t("product.customImage")}</p>
            <p className="mt-0.5 text-[11px] text-ink-3">{t("product.customImageHint")}</p>
            <input ref={customFileRef} type="file" accept="image/*" onChange={pickCustom} className="hidden" />
            {customUrl ? (
              <div className="mt-2 flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2">
                <Image
                  src={customUrl}
                  alt=""
                  width={48}
                  height={48}
                  className="h-12 w-12 rounded-lg object-cover"
                />
                <span className="flex-1 text-xs font-bold text-emerald-600">
                  {t("product.customUploaded")}
                </span>
                <button
                  type="button"
                  onClick={() => setCustomUrl(null)}
                  aria-label={t("aria.close")}
                  className="tap grid h-8 w-8 place-items-center rounded-lg text-ink-3 transition hover:bg-surface-2 hover:text-brand"
                >
                  <X size={15} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => customFileRef.current?.click()}
                disabled={uploadingCustom}
                className="tap mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-surface-2/60 py-3.5 text-xs font-bold text-ink-2 transition hover:border-brand hover:text-brand disabled:opacity-60"
              >
                <Plus size={16} />
                {uploadingCustom ? "…" : t("product.uploadCustom")}
              </button>
            )}
          </div>
        )}

        {desc && <p className="mt-4 text-[13px] leading-relaxed text-ink-2">{desc}</p>}

        <div className="mt-4 flex items-center gap-4 text-xs font-semibold text-ink-2">
          <span className="flex items-center gap-1.5">
            <Truck size={15} className="text-brand" /> {t("footer.delivery")}
          </span>
        </div>

        {/* Price */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <span className="text-2xl font-black" style={{ color: "var(--c)" }}>
            {formatPrice(lineTotal, lang)}
          </span>
          {qty > 1 && (
            <span className="text-xs font-bold text-ink-3">
              {formatPrice(unit, lang)} {t("product.perUnit")}
            </span>
          )}
          {showStruck && (
            <span className="text-sm font-bold text-ink-3 line-through">
              {formatPrice(baseUnit * Math.max(qty - free, 0), lang)}
            </span>
          )}
          {free > 0 && (
            <span className="rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-black text-white">
              {free} {t("cart.free")}
            </span>
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
            disabled={product.soldOut || uploadingCustom}
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
