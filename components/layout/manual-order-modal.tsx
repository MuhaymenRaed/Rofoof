"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/components/providers/store-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { X, Cart, Tag, Info } from "@/components/icons";
import { formatPrice } from "@/lib/format";
import { MANUAL_ORDER_COLOR } from "@/lib/products";

/** Same ceiling the SQL check constraint enforces on `manual_total`. */
const MAX_PRICE = 100_000_000;

/**
 * "Manual order" — an admin-only line for work that isn't in the catalogue at
 * all: a walk-in, a DM commission, a one-off size. The admin describes the job
 * and names its price.
 *
 * Adding does NOT place an order. The line is queued in the cart beside
 * products and custom requests, and goes out through the ordinary checkout —
 * same phone/province form, same Telegram alert, same orders board, same stats.
 * The only thing unusual about it is where the price came from, and
 * place_order() re-checks is_admin() before it accepts one.
 */
export function ManualOrderModal() {
  const { manualOpen, closeManual } = useStore();
  const { isAdmin, ready } = useAuth();

  useEffect(() => {
    if (!manualOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeManual();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [manualOpen, closeManual]);

  if (!manualOpen) return null;
  // Belt and braces: the card that opens this is admin-gated too, but a modal
  // that can price an order arbitrarily should never render on the word of
  // whoever managed to call openManual().
  if (!ready || !isAdmin) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] grid place-items-center p-4">
      <div
        onClick={closeManual}
        className="absolute inset-0 bg-black/55 backdrop-blur-[3px]"
        style={{ animation: "fade-in 0.2s ease both" }}
      />
      <ManualForm onClose={closeManual} />
    </div>,
    document.body,
  );
}

function ManualForm({ onClose }: { onClose: () => void }) {
  const { t, lang, addManualOrder, openCart } = useStore();

  const [customerName, setCustomerName] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");

  const parsedPrice = /^\d+$/.test(price.trim()) ? Number(price.trim()) : null;
  // A title and a real price are the two things the line cannot be produced or
  // billed without. Name and address only prefill the checkout, so they stay
  // optional — the checkout enforces its own requirements either way.
  const canSubmit =
    title.trim() !== "" && parsedPrice !== null && parsedPrice <= MAX_PRICE;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || parsedPrice === null) return;

    addManualOrder({
      title: title.trim(),
      description: description.trim(),
      price: parsedPrice,
      customerName: customerName.trim(),
      addressLine: addressLine.trim(),
    });

    onClose();
    openCart();
  }

  return (
    <form
      onSubmit={submit}
      className="relative z-10 flex max-h-[90vh] w-full max-w-lg animate-pop flex-col overflow-hidden rounded-3xl border border-line-2 bg-surface shadow-2xl"
    >
      <div className="h-1 shrink-0" style={{ background: MANUAL_ORDER_COLOR }} />

      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-line-2 px-6 py-4">
        <div className="flex items-center gap-2.5">
          <span
            className="grid h-9 w-9 place-items-center rounded-xl text-white"
            style={{ background: MANUAL_ORDER_COLOR }}
          >
            <Tag size={18} />
          </span>
          <div>
            <h2 className="text-base font-black text-ink">{t("manual.title")}</h2>
            <p className="text-[11px] text-ink-3">{t("manual.subtitle")}</p>
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
        <p
          className="flex items-start gap-2 rounded-xl border p-2.5 text-[11px] font-semibold leading-relaxed"
          style={{
            borderColor: `color-mix(in srgb, ${MANUAL_ORDER_COLOR} 35%, transparent)`,
            background: `color-mix(in srgb, ${MANUAL_ORDER_COLOR} 8%, var(--surface))`,
            color: MANUAL_ORDER_COLOR,
          }}
        >
          <Info size={14} className="mt-0.5 shrink-0" />
          <span>{t("manual.adminOnly")}</span>
        </p>

        <Field label={t("manual.jobTitle")}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 120))}
            required
            placeholder={t("manual.jobTitlePlaceholder")}
            className="dash-input"
          />
        </Field>

        <Field label={t("manual.price")}>
          <input
            value={price}
            // Digits only — this lands in an `int` column, and a stray
            // separator would make a half-typed number look complete.
            onChange={(e) => setPrice(e.target.value.replace(/\D/g, "").slice(0, 9))}
            required
            inputMode="numeric"
            dir="ltr"
            placeholder={t("manual.pricePlaceholder")}
            className="dash-input text-start"
          />
          {parsedPrice !== null && (
            <span
              className="mt-1 block text-[11px] font-bold"
              style={{ color: MANUAL_ORDER_COLOR }}
            >
              {formatPrice(parsedPrice, lang)}
            </span>
          )}
        </Field>

        <Field label={t("manual.name")}>
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value.slice(0, 80))}
            placeholder={t("manual.namePlaceholder")}
            className="dash-input"
          />
        </Field>

        <Field label={t("manual.address")}>
          <input
            value={addressLine}
            onChange={(e) => setAddressLine(e.target.value.slice(0, 200))}
            placeholder={t("manual.addressPlaceholder")}
            className="dash-input"
          />
        </Field>

        <Field label={t("manual.description")}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder={t("manual.descPlaceholder")}
            className="w-full resize-none rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-3 focus:border-brand focus:bg-surface"
          />
        </Field>

        <p className="text-[11px] leading-relaxed text-ink-3">{t("manual.checkoutNote")}</p>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-line-2 px-6 py-4">
        {!canSubmit && (
          <p className="mb-2 text-center text-[11px] font-semibold text-ink-3">
            {t("manual.required")}
          </p>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          className="tap flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: MANUAL_ORDER_COLOR }}
        >
          <Cart size={17} />
          {t("manual.addToCart")}
        </button>
      </div>
    </form>
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
