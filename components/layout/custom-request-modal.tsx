"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useStore } from "@/components/providers/store-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { X, Plus, Cart, Droplet, Sparkles, Info, Tag, CUSTOM_TYPE_ICON } from "@/components/icons";
import { formatPrice } from "@/lib/format";
import {
  CUSTOM_TYPE_LABEL,
  CUSTOM_ORDER_COLOR,
  MANUAL_ORDER_COLOR,
  type CustomType,
} from "@/lib/products";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { toWebp, MAX_UPLOAD_BYTES, IMAGE_CACHE_CONTROL } from "@/lib/webp";

const MAX_IMAGES = 100;
/**
 * Stickers are produced by the sheet, so a run below this isn't worth cutting —
 * the order can't be submitted until the customer has uploaded at least this
 * many designs. Other types have no minimum.
 */
const MIN_STICKER_IMAGES = 10;
const TYPES: CustomType[] = ["brooch", "sticker", "poster"];

interface Artwork {
  blob: Blob;
  ext: string;
  contentType: string;
  preview: string;
}

/**
 * "Order your custom design" — brooch/sticker/poster request with up to 20
 * images (converted to WebP in the browser before upload), description,
 * waterproof option, and a live price estimate.
 *
 * Adding does NOT place an order: the request is queued in the cart next to
 * regular products, so the buyer can keep shopping and submit everything in
 * one checkout. Contact details are collected there, and the price is
 * recomputed server-side by place_custom_request().
 */
export function CustomRequestModal() {
  const { customOpen, closeCustom } = useStore();

  useEffect(() => {
    if (!customOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeCustom();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [customOpen, closeCustom]);

  if (!customOpen) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] grid place-items-center p-4">
      <div
        onClick={closeCustom}
        className="absolute inset-0 bg-black/55 backdrop-blur-[3px]"
        style={{ animation: "fade-in 0.2s ease both" }}
      />
      <RequestForm onClose={closeCustom} />
    </div>,
    document.body,
  );
}

function RequestForm({ onClose }: { onClose: () => void }) {
  const { t, lang, customPricing, addCustomRequest, openCart } = useStore();
  const { isAdmin, ready } = useAuth();
  const supabase = createSupabaseBrowserClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [type, setType] = useState<CustomType>("sticker");
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [description, setDescription] = useState("");
  const [waterproof, setWaterproof] = useState(false);
  const [converting, setConverting] = useState(false);
  const [pending, setPending] = useState(false);
  const [skippedBig, setSkippedBig] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** admin: price the whole request by hand instead of per piece */
  const [manualOn, setManualOn] = useState(false);
  const [manualPrice, setManualPrice] = useState("");

  // Revoke previews on unmount.
  const artworksRef = useRef<Artwork[]>([]);
  useEffect(() => {
    artworksRef.current = artworks;
  }, [artworks]);
  useEffect(() => () => artworksRef.current.forEach((a) => URL.revokeObjectURL(a.preview)), []);

  const waterproofEligible = type === "sticker" || type === "poster";
  const pricing = customPricing.find((p) => p.kind === type);
  const unit =
    (pricing?.unitPrice ?? 0) +
    (waterproof && waterproofEligible ? pricing?.waterproofExtra ?? 0 : 0);
  const qty = artworks.length;
  const minImages = type === "sticker" ? MIN_STICKER_IMAGES : 1;
  /** how many more designs are still needed before the order can be sent */
  const missing = Math.max(0, minImages - qty);

  // The manual control is admin-only and only offered once auth has resolved,
  // so it can't flash into view for a customer during hydration.
  const canPriceManually = ready && isAdmin;
  /**
   * A blank box is not a price of zero — it's an admin who hasn't typed yet, so
   * the automatic price stays in force until a real number is there. `manual`
   * being null is what keeps `manualTotal` off the cart line entirely, which in
   * turn keeps the request on the old RPC path.
   */
  const manual =
    canPriceManually && manualOn && /^\d+$/.test(manualPrice.trim())
      ? Number(manualPrice.trim())
      : null;
  const autoTotal = unit * qty;
  const total = manual ?? autoTotal;
  const canSend = qty >= minImages && !converting && (!manualOn || manual !== null);

  async function pickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    setSkippedBig(false);
    setConverting(true);
    const room = Math.max(0, MAX_IMAGES - artworks.length);
    const accepted: Artwork[] = [];
    for (const f of files.slice(0, room)) {
      if (f.size > MAX_UPLOAD_BYTES) {
        setSkippedBig(true);
        continue;
      }
      // Re-encode to WebP in the browser — the bucket only stores compact files.
      const webp = await toWebp(f);
      accepted.push({ ...webp, preview: URL.createObjectURL(webp.blob) });
    }
    setArtworks((prev) => [...prev, ...accepted]);
    setConverting(false);
  }

  function removeArtwork(i: number) {
    setArtworks((prev) => {
      const a = prev[i];
      if (a) URL.revokeObjectURL(a.preview);
      return prev.filter((_, idx) => idx !== i);
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend || pending) return;
    setPending(true);
    setError(null);

    try {
      // Upload the WebP artwork now so the cart only carries lightweight URLs
      // (and the images survive a page reload while the request sits there).
      const images = await Promise.all(
        artworks.map(async (a, i) => {
          const path = `${crypto.randomUUID()}-${i}.${a.ext}`;
          const { error: upErr } = await supabase.storage
            .from("custom-artwork")
            .upload(path, a.blob, {
              contentType: a.contentType,
              cacheControl: IMAGE_CACHE_CONTROL,
            });
          if (upErr) throw new Error(upErr.message);
          return supabase.storage.from("custom-artwork").getPublicUrl(path).data.publicUrl;
        }),
      );

      addCustomRequest({
        type,
        images,
        description: description.trim(),
        waterproof: waterproof && waterproofEligible,
        // Kept even when a manual total is set: it records what the ladder
        // WOULD have charged, which is the only way to see afterwards what the
        // manual price was chosen over.
        unitPrice: unit,
        manualTotal: manual,
      });

      onClose();
      openCart();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("checkout.error"));
    } finally {
      setPending(false);
    }
  }

  /* -------------------------------- Form --------------------------------- */
  return (
    <form
      onSubmit={submit}
      className="relative z-10 flex max-h-[90vh] w-full max-w-lg animate-pop flex-col overflow-hidden rounded-3xl border border-line-2 bg-surface shadow-2xl"
    >
      <div className="h-1 shrink-0" style={{ background: CUSTOM_ORDER_COLOR }} />

      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-line-2 px-6 py-4">
        <div className="flex items-center gap-2.5">
          <span
            className="grid h-9 w-9 place-items-center rounded-xl text-white"
            style={{ background: CUSTOM_ORDER_COLOR }}
          >
            <Sparkles size={18} />
          </span>
          <div>
            <h2 className="text-base font-black text-ink">{t("custom.title")}</h2>
            <p className="text-[11px] text-ink-3">{t("custom.subtitle")}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("aria.close")}
          className="tap grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-2 transition hover:bg-surface-2"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {/* Type */}
        <div>
          <p className="mb-2 text-xs font-bold text-ink-2">{t("custom.chooseType")}</p>
          <div className="grid grid-cols-3 gap-2">
            {TYPES.map((k) => {
              const on = type === k;
              const Icon = CUSTOM_TYPE_ICON[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setType(k)}
                  aria-pressed={on}
                  className={`tap flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-xs font-bold transition ${
                    on ? "text-white" : "border-line bg-surface text-ink-2 hover:text-ink"
                  }`}
                  style={
                    on
                      ? { background: CUSTOM_ORDER_COLOR, borderColor: CUSTOM_ORDER_COLOR }
                      : undefined
                  }
                >
                  <Icon size={22} />
                  {lang === "ar" ? CUSTOM_TYPE_LABEL[k].ar : CUSTOM_TYPE_LABEL[k].en}
                </button>
              );
            })}
          </div>
        </div>

        {/* Images */}
        <div>
          <p className="text-xs font-bold text-ink-2">
            {t("custom.images")}
            <span className="ms-2 font-semibold text-ink-3">
              {qty}/{MAX_IMAGES}
            </span>
            {type === "sticker" && (
              <span className="ms-2 font-bold" style={{ color: CUSTOM_ORDER_COLOR }}>
                {t("custom.minStickers")}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-3">{t("custom.imagesHint")}</p>

          {/* Stickers/brooches are cut per design, so a sheet with several
              designs in one image can't be produced — say so before uploading. */}
          {(type === "sticker" || type === "brooch") && (
            <p
              className="mt-2 flex items-start gap-2 rounded-xl border p-2.5 text-[11px] font-semibold leading-relaxed"
              style={{
                borderColor: `color-mix(in srgb, ${CUSTOM_ORDER_COLOR} 35%, transparent)`,
                background: `color-mix(in srgb, ${CUSTOM_ORDER_COLOR} 8%, var(--surface))`,
                color: CUSTOM_ORDER_COLOR,
              }}
            >
              <Info size={14} className="mt-0.5 shrink-0" />
              <span>
                {type === "sticker" ? t("custom.oneStickerPerImage") : t("custom.oneBroochPerImage")}
              </span>
            </p>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            onChange={pickFiles}
            className="hidden"
          />
          <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-5">
            {artworks.map((a, i) => (
              <div
                key={a.preview}
                className="relative aspect-square overflow-hidden rounded-xl border border-line-2"
              >
                <Image
                  src={a.preview}
                  alt=""
                  fill
                  sizes="80px"
                  unoptimized
                  className="object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeArtwork(i)}
                  aria-label={t("aria.close")}
                  className="tap absolute end-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white transition hover:bg-red-500"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {qty < MAX_IMAGES && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={converting}
                aria-label={t("custom.addImages")}
                className="tap grid aspect-square place-items-center rounded-xl border border-dashed border-line bg-surface-2 text-ink-3 transition hover:text-brand disabled:opacity-50"
                style={{ borderColor: missing > 0 ? CUSTOM_ORDER_COLOR : undefined }}
              >
                {converting ? "…" : <Plus size={20} />}
              </button>
            )}
          </div>

          {/* Sticker runs have a floor — tell them exactly how many are left to
              add rather than just greying the button out. */}
          {type === "sticker" && missing > 0 && (
            <p
              className="mt-2 rounded-xl border px-3 py-2 text-[11px] font-bold"
              style={{
                borderColor: `color-mix(in srgb, ${CUSTOM_ORDER_COLOR} 35%, transparent)`,
                background: `color-mix(in srgb, ${CUSTOM_ORDER_COLOR} 8%, var(--surface))`,
                color: CUSTOM_ORDER_COLOR,
              }}
            >
              {t("custom.needMore").replace("{n}", String(missing))}
            </p>
          )}
          {skippedBig && (
            <p className="mt-1.5 text-[11px] font-bold text-amber-600">{t("custom.tooBig")}</p>
          )}
        </div>

        {/* Waterproof (stickers / posters) */}
        {waterproofEligible && (
          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-line-2 bg-surface-2/50 px-3.5 py-2.5">
            <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
              <Droplet size={16} style={{ color: CUSTOM_ORDER_COLOR }} />
              {t("product.waterproofOption")}
              {(pricing?.waterproofExtra ?? 0) > 0 && (
                <span className="text-[11px] font-bold text-ink-3">
                  (+{formatPrice(pricing?.waterproofExtra ?? 0, lang)})
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

        {/* Description */}
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-ink-2">
            {t("custom.description")}
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder={t("custom.descPlaceholder")}
            className="w-full resize-none rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-3 focus:border-brand focus:bg-surface"
          />
        </label>

        {/* Admin-only: name the price for the whole request.
            Some requests simply can't be priced per piece — six designs on one
            sticker sheet is not "one sticker" — so the ladder gets overridden
            rather than argued with. place_order re-checks is_admin() before it
            honours this, so the control being hidden is a convenience, not the
            security boundary. */}
        {canPriceManually && (
          <div
            className="rounded-2xl border p-4"
            style={{
              borderColor: `color-mix(in srgb, ${MANUAL_ORDER_COLOR} 35%, transparent)`,
              background: `color-mix(in srgb, ${MANUAL_ORDER_COLOR} 7%, var(--surface))`,
            }}
          >
            <label className="flex cursor-pointer items-start justify-between gap-3">
              <span>
                <span
                  className="flex items-center gap-1.5 text-[13px] font-bold"
                  style={{ color: MANUAL_ORDER_COLOR }}
                >
                  <Tag size={14} />
                  {t("custom.manualPrice")}
                  <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[9px] font-black text-ink-3">
                    {t("custom.manualPriceAdmin")}
                  </span>
                </span>
                <span className="mt-1 block text-[11px] leading-relaxed text-ink-3">
                  {t("custom.manualPriceHint")}
                </span>
              </span>
              <input
                type="checkbox"
                checked={manualOn}
                onChange={(e) => setManualOn(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
              />
            </label>

            {manualOn && (
              <label className="mt-3 block">
                <span className="mb-1.5 block text-xs font-bold text-ink-2">
                  {t("custom.manualPriceLabel")}
                </span>
                <input
                  value={manualPrice}
                  // Digits only: the price lands in an `int` column, and a
                  // half-typed "12,0" would otherwise read as a valid number.
                  onChange={(e) => setManualPrice(e.target.value.replace(/\D/g, "").slice(0, 9))}
                  inputMode="numeric"
                  dir="ltr"
                  placeholder={t("manual.pricePlaceholder")}
                  className="w-full rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-start text-sm font-bold text-ink outline-none transition placeholder:font-normal placeholder:text-ink-3 focus:border-brand focus:bg-surface"
                />
              </label>
            )}
          </div>
        )}

        {/* Live price estimate */}
        <div
          className="space-y-1 rounded-2xl border p-4 text-sm"
          style={{
            borderColor: `color-mix(in srgb, ${CUSTOM_ORDER_COLOR} 35%, transparent)`,
            background: `color-mix(in srgb, ${CUSTOM_ORDER_COLOR} 7%, var(--surface))`,
          }}
        >
          {/* With a manual price in force the per-piece figure is no longer
              what's charged, so it's struck through rather than removed — the
              admin can still see what they overrode. */}
          <div className="flex items-center justify-between text-ink-2">
            <span>{t("custom.perPiece")}</span>
            <span className={`font-bold ${manual !== null ? "text-ink-3 line-through" : ""}`}>
              {formatPrice(unit, lang)}
            </span>
          </div>
          <div className="flex items-center justify-between text-ink-2">
            <span>{t("custom.piecesCount")}</span>
            <span className="font-bold">{qty}</span>
          </div>
          {manual !== null && (
            <div className="flex items-center justify-between text-ink-3">
              <span className="text-xs">{t("custom.autoPrice")}</span>
              <span className="text-xs font-bold line-through">
                {formatPrice(autoTotal, lang)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-line-2 pt-2">
            <span className="font-bold text-ink">
              {manual !== null ? t("custom.manualPriceApplied") : t("custom.estimated")}
            </span>
            <span
              className="text-lg font-black"
              style={{ color: manual !== null ? MANUAL_ORDER_COLOR : CUSTOM_ORDER_COLOR }}
            >
              {formatPrice(total, lang)}
            </span>
          </div>
        </div>

        {error && (
          <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500">
            {error}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-line-2 px-6 py-4">
        <button
          type="submit"
          disabled={!canSend || pending}
          className="tap flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: CUSTOM_ORDER_COLOR }}
        >
          {pending ? (
            t("custom.sending")
          ) : (
            <>
              <Cart size={17} />
              {t("custom.addToCart")}
            </>
          )}
        </button>
      </div>
    </form>
  );
}
