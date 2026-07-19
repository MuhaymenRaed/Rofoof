"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useStore, cartLineKey } from "@/components/providers/store-provider";
import { useAuth } from "@/components/providers/auth-provider";
import {
  X,
  Bag,
  Trash,
  Whatsapp,
  Check,
  Droplet,
  Percent,
  Sparkles,
  CUSTOM_TYPE_ICON,
} from "@/components/icons";
import { QtyStepper } from "@/components/ui/qty-stepper";
import { formatPrice } from "@/lib/format";
import { cartDiscountFor, deliveryOfferFor } from "@/lib/pricing";
import { CUSTOM_ORDER_COLOR, CUSTOM_TYPE_LABEL } from "@/lib/products";
import { provinceCodes, provinceLabelKey } from "@/lib/provinces";
import { placeOrderAction, placeCustomRequestAction } from "@/lib/actions/orders";
import { updateProfileAction } from "@/lib/actions/profile";
import { whatsappMessageUrl } from "@/lib/contact";

type CSSVars = React.CSSProperties & Record<string, string>;
type Step = "cart" | "form" | "done";

export function CartDrawer() {
  const {
    cartOpen,
    closeCart,
    cart,
    cartCount,
    cartSubtotal,
    setQty,
    removeFromCart,
    clearCart,
    customRequests,
    removeCustomRequest,
    getProduct,
    pricingFor,
    offers,
    lang,
    t,
  } = useStore();
  const { user, refresh } = useAuth();

  const [step, setStep] = useState<Step>("cart");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [province, setProvince] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [orderCode, setOrderCode] = useState("");

  useEffect(() => {
    if (!cartOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeCart();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cartOpen, closeCart]);

  // Reset to the cart view a moment after the drawer closes — unconditionally,
  // so a *previous* completed order never resurfaces when the user later adds
  // another item and the drawer reopens (it must show the current cart, not
  // the old "order received" screen).
  useEffect(() => {
    if (cartOpen) return;
    const id = setTimeout(() => setStep("cart"), 300);
    return () => clearTimeout(id);
  }, [cartOpen]);

  // Prefill checkout details from the signed-in profile (only empty fields).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (step !== "form" || !user) return;
    setName((v) => v || user.name || "");
    setPhone((v) => v || user.phone || "");
    setProvince((v) => v || user.provinceCode || "");
  }, [step, user]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // An order cannot be placed without a name, phone and province (location).
  const canCheckout = name.trim() !== "" && phone.trim() !== "" && province !== "";

  // Display-only cart-level offers preview (the server recomputes at checkout;
  // it also picks the BEST single money discount if a coupon beats this one).
  const cartDiscount = cartDiscountFor(cartSubtotal, offers);
  const deliveryOffer = deliveryOfferFor(cartSubtotal, offers);
  const previewTotal = Math.max(cartSubtotal - (cartDiscount?.amount ?? 0), 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !province) return;
    setPending(true);
    setError(false);

    const contact = {
      customerName: name,
      customerPhone: phone,
      provinceCode: province,
      addressLine: address || null,
    };
    const codes: string[] = [];

    // Products go out as one order; each queued custom request becomes its own
    // custom order (they're produced and priced separately, and the schema
    // carries the artwork at order level).
    if (cart.length > 0) {
      const res = await placeOrderAction({
        ...contact,
        notes: note || null,
        items: cart.map((l) => ({
          productId: l.id,
          itemId: l.itemId ?? null,
          qty: l.qty,
          waterproof: l.waterproof ?? false,
          customImageUrl: l.customImageUrl ?? null,
          note: l.note ?? null,
        })),
      });
      if (!res.ok) {
        setPending(false);
        setError(true);
        return;
      }
      codes.push(res.code);
    }

    for (const req of customRequests) {
      const res = await placeCustomRequestAction({
        ...contact,
        type: req.type,
        waterproof: req.waterproof,
        description: req.description,
        images: req.images,
      });
      if (!res.ok) {
        setPending(false);
        setError(true);
        return;
      }
      codes.push(res.code);
    }

    setPending(false);
    if (codes.length === 0) {
      setError(true);
      return;
    }

    setOrderCode(codes.join(" · "));
    clearCart();
    setStep("done");

    // Signed-in user typed details their profile was missing (or changed
    // them) — save it now so future checkouts are prefilled automatically
    // instead of asking again every time.
    if (user && (user.phone !== phone || user.provinceCode !== province)) {
      void updateProfileAction({
        fullName: user.name || name,
        phone,
        provinceCode: province,
      }).then((r) => {
        if (r.ok) void refresh();
      });
    }
  }

  const waHref = whatsappMessageUrl(`${t("checkout.title")} ${orderCode}`);

  return (
    <div
      className={`fixed inset-0 z-50 ${cartOpen ? "" : "pointer-events-none"}`}
      aria-hidden={!cartOpen}
    >
      <div
        onClick={closeCart}
        className={`absolute inset-0 bg-black/45 backdrop-blur-[2px] transition-opacity duration-300 ${
          cartOpen ? "opacity-100" : "opacity-0"
        }`}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t("cart.title")}
        className={`absolute inset-y-0 end-0 flex w-[88%] max-w-[380px] flex-col bg-surface shadow-2xl transition-transform duration-300 ease-out ${
          cartOpen ? "translate-x-0" : "ltr:translate-x-full rtl:-translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line-2 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-extrabold text-ink">
            <Bag size={18} className="text-brand" />
            {step === "form" ? t("checkout.title") : t("cart.title")}
            {step === "cart" && cartCount > 0 && (
              <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-bold text-brand">
                {cartCount} {t("cart.items")}
              </span>
            )}
          </h2>
          <button
            type="button"
            onClick={closeCart}
            aria-label={t("aria.close")}
            className="tap grid h-9 w-9 place-items-center rounded-lg text-ink-2 transition hover:bg-surface-2 hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        {/* Success */}
        {step === "done" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-emerald-500/15 text-emerald-500">
              <Check size={30} />
            </div>
            <p className="text-lg font-black text-ink">{t("checkout.successTitle")}</p>
            <p className="text-sm text-ink-3">{t("checkout.successHint")}</p>
            <div className="mt-1 rounded-xl border border-line-2 bg-surface-2 px-5 py-2 text-lg font-black tracking-wide text-brand">
              {orderCode}
            </div>
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="tap mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-5 py-3 text-sm font-bold text-white transition hover:opacity-90"
            >
              <Whatsapp size={18} />
              {t("checkout.sendWhatsapp")}
            </a>
            <button
              type="button"
              onClick={closeCart}
              className="tap text-sm font-bold text-ink-3 transition hover:text-ink"
            >
              {t("checkout.done")}
            </button>
          </div>
        ) : cart.length === 0 && customRequests.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-surface-2 text-ink-3">
              <Bag size={28} />
            </div>
            <p className="font-bold text-ink">{t("cart.empty")}</p>
            <p className="text-sm text-ink-3">{t("cart.emptyHint")}</p>
            <Link
              href="/store"
              onClick={closeCart}
              className="tap mt-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
            >
              {t("cart.browse")}
            </Link>
          </div>
        ) : step === "form" ? (
          /* Checkout form */
          <form onSubmit={submit} className="flex flex-1 flex-col overflow-y-auto">
            <div className="flex-1 space-y-3 px-5 py-4">
              <Field label={t("checkout.name")}>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="dash-input"
                />
              </Field>
              <Field label={t("checkout.phone")}>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  inputMode="tel"
                  dir="ltr"
                  className="dash-input text-start"
                />
              </Field>
              <Field label={t("checkout.province")}>
                <select
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  required
                  className="dash-input cursor-pointer"
                >
                  <option value="" disabled>
                    {t("checkout.selectProvince")}
                  </option>
                  {provinceCodes.map((code) => (
                    <option key={code} value={code}>
                      {t(provinceLabelKey(code))}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("checkout.address")}>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="dash-input"
                />
              </Field>
              <Field label={t("checkout.note")}>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="dash-input"
                />
              </Field>

              {error && (
                <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500">
                  {t("checkout.error")}
                </p>
              )}
            </div>

            <div className="border-t border-line-2 px-5 py-4">
              {cartDiscount && (
                <div className="mb-2 flex items-center justify-between text-xs font-bold text-emerald-600">
                  <span className="flex items-center gap-1.5">
                    <Percent size={12} />
                    {lang === "ar" ? cartDiscount.offer.titleAr : cartDiscount.offer.titleEn}
                  </span>
                  <span>-{formatPrice(cartDiscount.amount, lang)}</span>
                </div>
              )}
              <div className="mb-3 flex items-center justify-between">
                <span className="font-bold text-ink">{t("cart.total")}</span>
                <span className="text-lg font-black text-brand">
                  {formatPrice(previewTotal, lang)}
                </span>
              </div>
              {!canCheckout && (
                <p className="mb-2 text-center text-[11px] font-semibold text-ink-3">
                  {t("checkout.required")}
                </p>
              )}
              <button
                type="submit"
                disabled={pending || !canCheckout}
                className="tap flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-5 py-3.5 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? t("checkout.placing") : t("checkout.confirm")}
              </button>
              <button
                type="button"
                onClick={() => setStep("cart")}
                className="tap mt-2 w-full text-center text-xs font-bold text-ink-3 transition hover:text-ink"
              >
                {t("checkout.back")}
              </button>
            </div>
          </form>
        ) : (
          /* Cart list */
          <>
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {cart.map((line) => {
                const product = getProduct(line.id);
                if (!product) return null;
                const key = cartLineKey(line);
                const item = line.itemId
                  ? product.items.find((i) => i.id === line.itemId)
                  : undefined;
                const name = lang === "ar" ? product.nameAr : product.nameEn;
                const itemName = item ? (lang === "ar" ? item.nameAr : item.nameEn) : "";
                const thumb = line.customImageUrl ?? item?.imageUrl ?? product.image;
                const pricing = pricingFor(line);
                const style: CSSVars = { "--c": product.color };
                return (
                  <div
                    key={key}
                    style={style}
                    className="flex gap-3 rounded-2xl border border-line-2 bg-surface-2/50 p-3"
                  >
                    <div
                      className="relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl text-3xl"
                      style={{ background: "color-mix(in srgb, var(--c) 14%, var(--surface))" }}
                    >
                      {thumb ? (
                        <Image src={thumb} alt={name} fill sizes="64px" className="object-cover" />
                      ) : (
                        product.emoji
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="line-clamp-1 text-[13px] font-bold leading-snug text-ink">
                            {name}
                          </h3>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            {itemName && (
                              <span className="text-[10px] font-semibold text-ink-3">{itemName}</span>
                            )}
                            {line.waterproof && (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-500/12 px-1.5 py-0.5 text-[9px] font-bold text-sky-600">
                                <Droplet size={9} /> {t("badge.waterproof")}
                              </span>
                            )}
                            {pricing.free > 0 && (
                              <span className="rounded-full bg-emerald-500/12 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600">
                                {pricing.free} {t("cart.free")}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFromCart(key)}
                          aria-label={t("cart.remove")}
                          className="tap shrink-0 text-ink-3 transition hover:text-brand"
                        >
                          <Trash size={16} />
                        </button>
                      </div>
                      <div className="mt-auto flex items-center justify-between pt-2">
                        <QtyStepper
                          value={line.qty}
                          onChange={(q) => setQty(key, q)}
                          min={1}
                          size="sm"
                        />
                        <span className="text-sm font-extrabold" style={{ color: "var(--c)" }}>
                          {formatPrice(pricing.total, lang)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Queued custom design requests — priced per uploaded image */}
              {customRequests.map((req) => {
                const meta = CUSTOM_TYPE_LABEL[req.type];
                const Icon = CUSTOM_TYPE_ICON[req.type];
                return (
                  <div
                    key={req.id}
                    className="flex gap-3 rounded-2xl border p-3"
                    style={{
                      borderColor: `color-mix(in srgb, ${CUSTOM_ORDER_COLOR} 40%, transparent)`,
                      background: `color-mix(in srgb, ${CUSTOM_ORDER_COLOR} 6%, var(--surface))`,
                    }}
                  >
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl">
                      <Image
                        src={req.images[0]}
                        alt=""
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                      {req.images.length > 1 && (
                        <span className="absolute bottom-0 inset-x-0 bg-black/60 py-0.5 text-center text-[9px] font-bold text-white">
                          +{req.images.length - 1}
                        </span>
                      )}
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="flex items-center gap-1.5 text-[13px] font-bold text-ink">
                            <Sparkles size={12} style={{ color: CUSTOM_ORDER_COLOR }} />
                            {t("custom.badge")}
                          </h3>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-ink-3">
                              <Icon size={11} />
                              {lang === "ar" ? meta.ar : meta.en}
                            </span>
                            <span className="text-[10px] font-semibold text-ink-3">
                              × {req.images.length}
                            </span>
                            {req.waterproof && (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-500/12 px-1.5 py-0.5 text-[9px] font-bold text-sky-600">
                                <Droplet size={9} /> {t("badge.waterproof")}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeCustomRequest(req.id)}
                          aria-label={t("cart.remove")}
                          className="tap shrink-0 text-ink-3 transition hover:text-brand"
                        >
                          <Trash size={16} />
                        </button>
                      </div>
                      <div className="mt-auto flex items-center justify-end pt-2">
                        <span
                          className="text-sm font-extrabold"
                          style={{ color: CUSTOM_ORDER_COLOR }}
                        >
                          {formatPrice(req.unitPrice * req.images.length, lang)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-line-2 px-5 py-4">
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center justify-between text-ink-2">
                  <span>{t("cart.subtotal")}</span>
                  <span className="font-bold text-ink">{formatPrice(cartSubtotal, lang)}</span>
                </div>
                {cartDiscount && (
                  <div className="flex items-center justify-between text-emerald-600">
                    <span className="flex items-center gap-1.5 text-xs font-bold">
                      <Percent size={12} />
                      {lang === "ar" ? cartDiscount.offer.titleAr : cartDiscount.offer.titleEn}
                    </span>
                    <span className="font-bold">-{formatPrice(cartDiscount.amount, lang)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-ink-2">
                  <span>{t("cart.delivery")}</span>
                  {deliveryOffer ? (
                    <span className="text-xs font-bold text-emerald-600">
                      {deliveryOffer.deliveryFee === 0
                        ? t("cart.freeDelivery")
                        : formatPrice(deliveryOffer.deliveryFee ?? 0, lang)}
                    </span>
                  ) : (
                    <span className="text-xs text-ink-3">{t("cart.deliveryNote")}</span>
                  )}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-line-2 pt-3">
                <span className="font-bold text-ink">{t("cart.total")}</span>
                <span className="text-lg font-black text-brand">
                  {formatPrice(previewTotal, lang)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setStep("form")}
                className="tap mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-5 py-3.5 text-sm font-bold text-white transition hover:opacity-90"
              >
                {t("checkout.proceed")}
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-ink-2">{label}</span>
      {children}
    </label>
  );
}
