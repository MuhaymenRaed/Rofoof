"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/components/providers/store-provider";
import { useAuth } from "@/components/providers/auth-provider";
import {
  X,
  Heart,
  Cart,
  Check,
  Truck,
  Droplet,
  Plus,
  Tag,
  Gift,
  ChevronEnd,
  Search,
} from "@/components/icons";
import { QtyStepper } from "@/components/ui/qty-stepper";
import { PriceLadder } from "@/components/ui/price-ladder";
import { Lightbox } from "@/components/ui/lightbox";
import { tintedBlurDataUrl } from "@/components/ui/product-media";
import { RetryImage } from "@/components/ui/retry-image";
import { Countdown } from "@/components/ui/countdown";
import { formatPrice } from "@/lib/format";
import {
  isSoldOut,
  itemInStock,
  stockCeilingFor,
  tierUnitPrice,
  type PriceTier,
  type Product,
} from "@/lib/products";
import {
  bundleOfferFor,
  discountView,
  freeUnitsFor,
  linePricing,
  liveFlashOffer,
  unitPriceFor,
  volumeUnitPrice,
} from "@/lib/pricing";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { toWebp, MAX_UPLOAD_BYTES, IMAGE_CACHE_CONTROL } from "@/lib/webp";

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
  const {
    lang,
    t,
    addToCart,
    openCart,
    isWished,
    toggleWish,
    offers,
    volumeTiers,
    now,
    cart,
    getProduct,
    siteSettings,
  } = useStore();
  // Stock counts are shown to the shop, not to the shopper — see the picker grid.
  const { isAdmin, ready } = useAuth();
  const supabase = createSupabaseBrowserClient();
  const customFileRef = useRef<HTMLInputElement>(null);

  const isPackage = product.kind === "package" && product.items.length > 0;
  const isTiered = product.kind === "tiered" && product.tiers.length > 0;

  // Standard/tiered use a single quantity; a package keeps a per-item quantity
  // map so the buyer can pick several distinct designs from the one package.
  const [qty, setQty] = useState(1);
  // Open on the first design that can actually be bought, not simply the first
  // one: preselecting something sold out would put the modal in a state the
  // shopper can't check out from and can't see the cause of.
  const firstAvailable = isPackage
    ? (product.items.find(itemInStock) ?? product.items[0])
    : undefined;
  const [selections, setSelections] = useState<Record<string, number>>(
    firstAvailable && itemInStock(firstAvailable) ? { [firstAvailable.id]: 1 } : {},
  );
  const [previewId, setPreviewId] = useState<string | null>(firstAvailable?.id ?? null);
  const [note, setNote] = useState("");
  const [added, setAdded] = useState(false);
  const [waterproof, setWaterproof] = useState(false);
  const [customUrl, setCustomUrl] = useState<string | null>(null);
  const [uploadingCustom, setUploadingCustom] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const name = lang === "ar" ? product.nameAr : product.nameEn;
  const sub = lang === "ar" ? product.subAr : product.subEn;
  const desc = lang === "ar" ? product.descAr : product.descEn;
  const wished = isWished(product.id);
  const style: CSSVars = { "--c": product.color };

  // One clock for the whole modal (the store's, ticking every minute), so the
  // offer note, the headline percentage and the price below can never disagree
  // about whether a flash sale is still running.
  const flash = liveFlashOffer(product, offers, now);
  const bundle = bundleOfferFor(product, offers);
  /** headline discount — the same number the product's card advertises */
  const sale = discountView(product, offers, now);

  // Package: price/quantity summed across every chosen item.
  // Volume-priced products share ONE by-count ladder: the unit price falls as
  // more designs are picked, so resolve the count first, then the tier price.
  const selectedCount = isPackage
    ? product.items.reduce((s, it) => s + (selections[it.id] ?? 0), 0)
    : qty;
  /**
   * Pieces already in the cart that count toward the shared by-count ladder.
   *
   * The ladder is pooled across the WHOLE cart — that is the point of it, and
   * `place_order` resolves the tier from the finished order, not from one line.
   * Quoting this selection on its own therefore quoted a price the shopper would
   * never be charged: always too dear, and only corrected once they had reached
   * the cart, which reads exactly like the shop changing the price on them. The
   * modal now prices what they will actually pay.
   *
   * Adding is safe rather than double-counting: `addToCart` merges into an
   * existing line, so `selectedCount` is always the pieces being ADDED to this
   * total, never pieces that are already inside it.
   */
  const cartVolumeCount = useMemo(
    () =>
      product.volumePriced
        ? cart.reduce((n, l) => (getProduct(l.id)?.volumePriced ? n + l.qty : n), 0)
        : 0,
    [product.volumePriced, cart, getProduct],
  );
  /** What the ladder is answering for: this selection plus the cart's pieces. */
  const ladderCount = selectedCount + cartVolumeCount;
  const volumeUnit = product.volumePriced
    ? volumeUnitPrice(ladderCount, volumeTiers) ?? undefined
    : undefined;

  /**
   * Whether this product can be sold waterproof AT ALL right now: its own flag
   * AND the shop-wide master switch (dashboard → Inventory).
   *
   * `waterproofOn` is what every price below reads, never the raw checkbox —
   * so an admin switching the add-on off mid-session withdraws the surcharge
   * along with the control, instead of leaving a checked box quietly charging
   * for something the shop has stopped offering.
   */
  const waterproofOffered = Boolean(product.waterproof) && siteSettings.waterproofProductsActive;
  const waterproofOn = waterproof && waterproofOffered;

  const packageLines = isPackage
    ? product.items
        .filter((it) => (selections[it.id] ?? 0) > 0)
        .map((it) => {
          const q = selections[it.id] ?? 0;
          const p = linePricing(
            product,
            q,
            { item: it, waterproof: waterproofOn, volumeUnit },
            offers,
            now,
          );
          const baseUnit =
            (volumeUnit ?? it.price ?? product.price) +
            (waterproofOn ? product.waterproofSurcharge : 0);
          return { item: it, qty: q, ...p, baseTotal: baseUnit * Math.max(q - p.free, 0) };
        })
    : [];
  const packageCount = packageLines.reduce((s, l) => s + l.qty, 0);
  const packageTotal = packageLines.reduce((s, l) => s + l.total, 0);
  const packageBase = packageLines.reduce((s, l) => s + l.baseTotal, 0);
  const packageFree = packageLines.reduce((s, l) => s + l.free, 0);

  // Standard/tiered pricing.
  const unit = unitPriceFor(product, qty, { waterproof: waterproofOn, volumeUnit }, offers, now);
  const free = freeUnitsFor(product, qty, offers);
  const lineTotal = unit * Math.max(qty - free, 0);
  const stdBaseUnit =
    (product.kind === "tiered" ? tierUnitPrice(product, qty) : product.price) +
    (waterproofOn ? product.waterproofSurcharge : 0);

  const displayTotal = isPackage ? packageTotal : lineTotal;
  const displayBase = isPackage ? packageBase : stdBaseUnit * Math.max(qty - free, 0);
  const displayFree = isPackage ? packageFree : free;
  const showStruck = displayBase > displayTotal;
  // What this exact selection saves — waterproof and every other add-on are
  // already inside both figures, so the percentage is off what's really paid.
  const savedAmount = Math.max(displayBase - displayTotal, 0);
  const savedPercent = displayBase > 0 ? Math.round((savedAmount / displayBase) * 100) : 0;
  // From the count, never the sold_out flag: the database sets that flag when
  // stock reaches zero and nothing in this app can clear it, so a restocked
  // product stayed unbuyable with its new count showing on it. See isSoldOut().
  const soldOut = isSoldOut(product);
  const canAdd = !soldOut && (isPackage ? packageCount > 0 : true);

  /**
   * The one ladder that actually sets this product's unit price.
   *
   * `unitPriceFor` prefers the global by-count ladder over a product's own tiers
   * (a supplied `volumeUnit` short-circuits the tier lookup), and the product
   * editor flags every `tiered` product as by-count — so a tiered product was
   * drawing TWO boxes, both headed "Volume pricing", the second of which had no
   * effect on any price and nothing on screen saying so. That is the "meaningless
   * box" half of the complaint; the other half was products showing neither,
   * which is correct — they are not sold by count.
   *
   * Whichever ladder is drawn, it is the one the shopper is actually being priced
   * against, and `pooled` is what decides which sentence explains it.
   */
  const ladder: { rungs: readonly PriceTier[]; count: number; pooled: boolean } | null =
    product.volumePriced && volumeTiers.length > 0
      ? { rungs: volumeTiers, count: ladderCount, pooled: true }
      : isTiered
        ? { rungs: product.tiers, count: qty, pooled: false }
        : null;

  // Left media: the previewed package item, or the gallery image.
  const previewItem = isPackage ? product.items.find((it) => it.id === previewId) : undefined;
  const mainImage = isPackage
    ? previewItem?.imageUrl ?? product.items[0].imageUrl
    : product.images[galleryIndex] ?? product.images[0];

  function setItemQty(itemId: string, next: number) {
    // The picker is a toggle now, so this only ever gets 0 or 1 — but the cap
    // stays, because nothing should be able to put more into the selection than
    // the shop has, whatever ends up calling this.
    const ceiling = stockCeilingFor(product, itemId) ?? 99;
    setSelections((prev) => {
      const copy = { ...prev };
      if (next <= 0) delete copy[itemId];
      else copy[itemId] = Math.min(ceiling, next);
      return copy;
    });
    if (next > 0) setPreviewId(itemId);
  }

  async function pickCustom(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > MAX_UPLOAD_BYTES) return; // 20MB cap per image
    setUploadingCustom(true);
    // Re-encode to WebP in the browser so the bucket only stores compact files.
    const webp = await toWebp(f);
    const path = `${crypto.randomUUID()}.${webp.ext}`;
    const { error } = await supabase.storage
      .from("custom-artwork")
      .upload(path, webp.blob, {
        contentType: webp.contentType,
        cacheControl: IMAGE_CACHE_CONTROL,
      });
    setUploadingCustom(false);
    if (!error) {
      setCustomUrl(supabase.storage.from("custom-artwork").getPublicUrl(path).data.publicUrl);
    }
  }

  function handleAdd() {
    if (!canAdd) return;
    const wp = waterproofOn ? true : undefined;
    const trimmedNote = note.trim() || undefined;

    if (isPackage) {
      for (const line of packageLines) {
        addToCart(product.id, line.qty, { itemId: line.item.id, waterproof: wp, note: trimmedNote });
      }
    } else {
      addToCart(product.id, qty, { waterproof: wp, note: trimmedNote });
    }
    // A custom-artwork upload is always its own distinct line.
    if (customUrl) {
      addToCart(product.id, 1, { customImageUrl: customUrl, waterproof: wp, note: trimmedNote });
    }

    setAdded(true);
    setTimeout(() => {
      onClose();
      openCart();
    }, 550);
  }

  const galleryThumbs = !isPackage && product.images.length > 1;

  // Images the lightbox can page through: the package designs, or the gallery.
  const viewerImages = isPackage
    ? product.items.map((it) => it.imageUrl).filter(Boolean)
    : product.images;

  /** Move through the gallery with wrap-around (arrow controls). */
  function stepGallery(delta: number) {
    const n = product.images.length;
    if (n > 1) setGalleryIndex((i) => (i + delta + n) % n);
  }

  function openViewer(src: string | undefined) {
    if (!src) return;
    const i = viewerImages.indexOf(src);
    setLightboxIndex(i >= 0 ? i : 0);
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
          <button
            type="button"
            onClick={() => openViewer(mainImage)}
            aria-label={name}
            className="tap absolute inset-0 cursor-zoom-in"
          >
            <RetryImage
              src={mainImage}
              alt={name}
              fill
              sizes="384px"
              // Eager, but no preload hint: this only renders once the modal is
              // already open, so a hint injected at that moment races the <img>
              // beside it and Chrome reports it unused. (`priority` is also
              // deprecated in Next 16.)
              loading="eager"
              placeholder="blur"
              blurDataURL={tintedBlurDataUrl(product.color)}
              className="object-contain"
              fallback={<span className="grid h-full w-full place-items-center text-[120px]">{product.emoji}</span>}
            />
          </button>
        ) : (
          <span className="text-[120px] drop-shadow-sm">{product.emoji}</span>
        )}
        {galleryThumbs && (
          <>
            <GalleryArrow side="start" onClick={() => stepGallery(-1)} label={t("aria.prev")} />
            <GalleryArrow side="end" onClick={() => stepGallery(1)} label={t("aria.next")} />
            <GalleryDots
              count={product.images.length}
              index={galleryIndex}
              onIndex={setGalleryIndex}
            />
          </>
        )}
        {soldOut && (
          <span className="absolute bottom-5 z-20 rounded-full bg-ink px-4 py-2 text-xs font-bold text-surface">
            {t("badge.soldout")}
          </span>
        )}
        {/* One-photo products keep counting themselves, so the admin gets the
            same at-a-glance number here that each design gets in a package. */}
        {ready && isAdmin && !isPackage && product.stock != null && (
          <span
            className="absolute top-3 start-3 z-20 rounded-full bg-ink/80 px-2 py-0.5 text-[10px] font-black text-surface backdrop-blur-[1px]"
            title={t("dash.itemStock")}
          >
            {product.stock}
          </span>
        )}
      </div>

      {/* Details */}
      <div className="flex max-h-[88vh] flex-col overflow-y-auto p-6">
        {/* mobile media */}
        {mainImage ? (
          <div className="mb-4 md:hidden">
            <div className="relative h-44 overflow-hidden rounded-2xl">
              <button
                type="button"
                onClick={() => openViewer(mainImage)}
                aria-label={name}
                className="tap absolute inset-0 cursor-zoom-in"
              >
                <RetryImage
                  src={mainImage}
                  alt={name}
                  fill
                  sizes="100vw"
                  loading="eager"
                  placeholder="blur"
                  blurDataURL={tintedBlurDataUrl(product.color)}
                  className="object-contain"
                  fallback={<span className="grid h-full w-full place-items-center text-6xl">{product.emoji}</span>}
                />
              </button>
              {galleryThumbs && (
                <>
                  <GalleryArrow side="start" onClick={() => stepGallery(-1)} label={t("aria.prev")} />
                  <GalleryArrow side="end" onClick={() => stepGallery(1)} label={t("aria.next")} />
                  <GalleryDots
                    count={product.images.length}
                    index={galleryIndex}
                    onIndex={setGalleryIndex}
                  />
                </>
              )}
            </div>
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
        {mainImage && (
          <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-ink-3">
            <Search size={12} />
            {t("product.tapToExpand")}
          </p>
        )}

        {/* Live offer notes */}
        {(flash || bundle || sale.active) && (
          <div className="mt-3 space-y-1.5">
            {flash && flash.endsAt ? (
              /* The offer's name, what it takes off, and how long it lasts —
                 the timer alone never said how big the discount actually is. */
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl border border-brand-line bg-brand-soft px-3 py-2 text-[12px] font-bold text-brand">
                <span className="flex items-center gap-1.5">
                  <Tag size={13} />
                  {lang === "ar" ? flash.titleAr : flash.titleEn}
                </span>
                {sale.percent > 0 && (
                  <span
                    dir="ltr"
                    className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-black text-white"
                  >
                    -{sale.percent}%
                  </span>
                )}
                <span className="ms-auto flex items-center gap-1.5">
                  {t("offer.endsIn")} <Countdown endsAt={flash.endsAt} />
                </span>
              </div>
            ) : (
              /* A standing discount has no timer, but still deserves saying. */
              sale.active && (
                <div className="flex items-center gap-1.5 rounded-xl border border-brand-line bg-brand-soft px-3 py-2 text-[12px] font-bold text-brand">
                  <Tag size={13} />
                  {t("offer.discount")} {sale.percent}%
                </div>
              )
            )}
            {bundle && (
              <div className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px] font-bold text-emerald-600">
                <Gift size={13} />
                {lang === "ar" ? bundle.titleAr : bundle.titleEn}
              </div>
            )}
          </div>
        )}

        {/* Package: choose one or more designs, each with its own quantity */}
        {isPackage && (
          <div className="mt-4">
            <p className="mb-2 flex items-center justify-between text-xs font-bold text-ink-2">
              {t("product.chooseItems")}
              <span className="font-semibold text-ink-3">
                {packageCount} {t("cart.pieces")}
              </span>
            </p>
            <div className="grid grid-cols-4 gap-2">
              {product.items.map((it) => {
                const q = selections[it.id] ?? 0;
                const on = q > 0;
                const itemName = lang === "ar" ? it.nameAr : it.nameEn;
                // Volume-priced: every design costs the current tier price,
                // which drops as the buyer picks more.
                const itemPrice = volumeUnit ?? it.price ?? product.price;
                const out = !itemInStock(it);
                return (
                  <div
                    key={it.id}
                    className={`relative overflow-hidden rounded-xl border-2 transition ${
                      out ? "border-line-2 opacity-55 grayscale" : on ? "border-brand" : "border-line-2"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setItemQty(it.id, on ? 0 : 1)}
                      onMouseEnter={() => setPreviewId(it.id)}
                      aria-label={itemName || name}
                      aria-pressed={on}
                      disabled={out}
                      className="tap block aspect-square w-full disabled:cursor-not-allowed"
                    >
                      <RetryImage
                        src={it.imageUrl}
                        alt={itemName || ""}
                        width={80}
                        height={80}
                        className="h-full w-full object-cover"
                        fallback={
                          <span
                            className="grid h-full w-full place-items-center text-2xl"
                            style={{ background: "color-mix(in srgb, var(--c) 14%, var(--surface))" }}
                          >
                            {product.emoji}
                          </span>
                        }
                      />
                      {on && !out && (
                        <span className="absolute inset-0 grid place-items-center bg-brand/25">
                          <span className="grid h-6 w-6 place-items-center rounded-full bg-brand text-white shadow">
                            <Check size={14} />
                          </span>
                        </span>
                      )}

                      {/* Sold out is the one stock fact a shopper gets to see:
                          it explains why the design can't be picked. The count
                          behind it is the shop's business, not theirs. */}
                      {out && (
                        <span className="absolute inset-0 grid place-items-center bg-[color-mix(in_srgb,var(--surface)_65%,transparent)]">
                          <span className="rounded-full bg-ink px-2 py-0.5 text-[9px] font-black text-surface">
                            {t("badge.soldout")}
                          </span>
                        </span>
                      )}

                      {/* Admin-only: how many are left, so stock can be tracked
                          from the same screen the shopper sees. */}
                      {ready && isAdmin && it.stock != null && !out && (
                        <span
                          className="absolute top-1 start-1 min-w-4 rounded-full bg-ink/80 px-1 text-center text-[9px] font-black text-surface backdrop-blur-[1px]"
                          title={t("dash.itemStock")}
                        >
                          {it.stock}
                        </span>
                      )}
                    </button>
                    <div className="flex items-center justify-between bg-surface px-1.5 py-1">
                      <span className="text-[9px] font-black" style={{ color: "var(--c)" }}>
                        {itemPrice.toLocaleString("en-US")}
                      </span>
                      {/* No stepper here. Picking designs and counting them are
                          two different jobs, and a pair of 16px buttons under a
                          thumbnail is a poor place to do the second one — the
                          cart has room for it and is where quantities are
                          reviewed anyway. The tile is now purely "do I want
                          this design", answered by tapping it. */}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* The by-count ladder — exactly one of them, see `ladder` above. */}
        {ladder && (
          <PriceLadder
            rungs={ladder.rungs}
            count={ladder.count}
            hint={t(ladder.pooled ? "product.ladderPooled" : "product.ladderOwn")}
          />
        )}

        {/* Waterproof option — hidden entirely while the admin has the add-on
            switched off shop-wide (dashboard → Inventory). `waterproofOffered`
            also gates the price maths above, so a stale `waterproof` state can
            never keep charging a surcharge for something no longer on sale. */}
        {waterproofOffered && (
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
                <RetryImage src={customUrl} alt="" width={48} height={48} className="h-12 w-12 rounded-lg object-cover" />
                <span className="flex-1 text-xs font-bold text-emerald-600">{t("product.customUploaded")}</span>
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
        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-2xl font-black" style={{ color: "var(--c)" }}>
            {formatPrice(displayTotal, lang)}
          </span>
          {showStruck && (
            <>
              <span className="text-sm font-bold text-ink-3 line-through">
                {formatPrice(displayBase, lang)}
              </span>
              <span
                dir="ltr"
                className="rounded-full bg-brand px-2.5 py-1 text-[11px] font-black text-white"
              >
                -{savedPercent}%
              </span>
            </>
          )}
          {displayFree > 0 && (
            <span className="rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-black text-white">
              {displayFree} {t("cart.free")}
            </span>
          )}
        </div>
        {savedAmount > 0 && (
          <p className="mt-1.5 text-[12px] font-bold text-emerald-600">
            {t("offer.youSave")} {formatPrice(savedAmount, lang)}
          </p>
        )}

        {/* Notes */}
        <label className="mt-5 block text-xs font-bold text-ink-2">{t("product.notes")}</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder={t("product.notesPlaceholder")}
          className="mt-2 min-h-28 w-full resize-y rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-3 focus:border-brand focus:bg-surface"
        />

        {/* Actions */}
        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => toggleWish(product.id)}
            aria-pressed={wished}
            aria-label={t("aria.favorites")}
            className={`tap grid h-12 w-12 shrink-0 place-items-center rounded-2xl border transition ${
              wished ? "border-brand bg-brand text-white" : "border-line text-ink-2 hover:border-brand hover:text-brand"
            }`}
          >
            <Heart size={20} filled={wished} />
          </button>

          {/* Standard/tiered keep a single quantity stepper; packages use the
              per-item controls in the grid above. */}
          {/* One-photo product: its own count is the ceiling. */}
          {!isPackage && (
            <QtyStepper
              value={qty}
              onChange={(q) => setQty(Math.max(1, q))}
              max={stockCeilingFor(product) ?? undefined}
            />
          )}

          <button
            type="button"
            onClick={handleAdd}
            disabled={!canAdd || uploadingCustom}
            className="tap flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-brand px-5 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-ink-3"
          >
            {soldOut ? (
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

      {lightboxIndex !== null && (
        <Lightbox
          images={viewerImages}
          index={lightboxIndex}
          onIndex={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
          alt={name}
        />
      )}
    </div>
  );
}

/**
 * Gallery arrow. Always visible (never hover-only) and sized for a thumb —
 * paging with arrows beats a thumbnail strip on a phone.
 */
function GalleryArrow({
  side,
  onClick,
  label,
}: {
  side: "start" | "end";
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`tap absolute top-1/2 z-20 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/70 ${
        side === "start" ? "start-2" : "end-2"
      }`}
    >
      <span className={side === "start" ? "ltr:rotate-180" : "rtl:rotate-180"}>
        <ChevronEnd size={18} />
      </span>
    </button>
  );
}

/** Position indicator; tapping a dot jumps straight to that image. */
function GalleryDots({
  count,
  index,
  onIndex,
}: {
  count: number;
  index: number;
  onIndex: (i: number) => void;
}) {
  return (
    <div className="absolute inset-x-0 bottom-2 z-20 flex justify-center gap-1.5">
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onIndex(i)}
          aria-label={`${i + 1}`}
          aria-current={i === index}
          className={`tap h-1.5 rounded-full transition-all ${
            i === index ? "w-4 bg-white" : "w-1.5 bg-white/55 hover:bg-white/80"
          }`}
        />
      ))}
    </div>
  );
}
