"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/providers/store-provider";
import { Plus, Trash, Percent } from "@/components/icons";
import { formatPrice } from "@/lib/format";
import {
  createCouponAction,
  setCouponActiveAction,
  deleteCouponAction,
  type AdminCoupon,
} from "@/lib/actions/offers";

/**
 * Promo-code portal. The admin defines the amount (percent or flat IQD), the
 * active window, total + per-customer usage caps, which customers may use it,
 * and which products it applies to. place_order() enforces every one of these
 * server-side and records a redemption row.
 */
export function CouponsEditor({ initialCoupons }: { initialCoupons: AdminCoupon[] }) {
  const { t, lang, products } = useStore();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [value, setValue] = useState("10");
  const [minSubtotal, setMinSubtotal] = useState("0");
  const [usageLimit, setUsageLimit] = useState("");
  const [perUserLimit, setPerUserLimit] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [emails, setEmails] = useState("");
  const [productIds, setProductIds] = useState<string[]>([]);

  function reset() {
    setCode("");
    setDiscountType("percent");
    setValue("10");
    setMinSubtotal("0");
    setUsageLimit("");
    setPerUserLimit("");
    setEndsAt("");
    setEmails("");
    setProductIds([]);
  }

  function create() {
    setError(null);
    startTransition(async () => {
      const res = await createCouponAction({
        code: code.trim(),
        discountType,
        value: Math.max(1, Number(value) || 0),
        minSubtotal: Math.max(0, Number(minSubtotal) || 0),
        usageLimit: usageLimit.trim() === "" ? null : Math.max(1, Number(usageLimit) || 1),
        perUserLimit: perUserLimit.trim() === "" ? null : Math.max(1, Number(perUserLimit) || 1),
        productIds,
        targetEmails: emails
          .split(/[,\s]+/)
          .map((e) => e.trim())
          .filter(Boolean),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      });
      if (!res.ok) {
        setError(
          res.error === "no_matching_users" ? t("dash.couponNoUsers") : res.error ?? t("checkout.error"),
        );
        return;
      }
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  function toggleProduct(id: string) {
    setProductIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  return (
    <section className="mb-5 rounded-2xl border border-line-2 bg-surface card-shadow">
      <div className="flex items-center justify-between border-b border-line-2 p-5">
        <h2 className="flex items-center gap-2 text-sm font-extrabold text-ink">
          <Percent size={16} className="text-brand" />
          {t("dash.coupons")}
        </h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="tap inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:opacity-90"
        >
          <Plus size={15} />
          {t("dash.newCoupon")}
        </button>
      </div>

      {open && (
        <div className="space-y-3 border-b border-line-2 bg-surface-2/40 p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-ink-2">{t("cart.coupon")}</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                dir="ltr"
                placeholder="ROFOOF10"
                className="dash-input text-start"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-ink-2">
                {t("dash.couponValue")}
              </span>
              <div className="mb-1 flex gap-1">
                {(["percent", "fixed"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setDiscountType(m)}
                    aria-pressed={discountType === m}
                    className={`tap flex-1 rounded-lg border py-1 text-[10px] font-bold transition ${
                      discountType === m
                        ? "border-brand bg-brand text-white"
                        : "border-line bg-surface text-ink-2 hover:border-brand"
                    }`}
                  >
                    {m === "percent" ? "%" : t("dash.fixedAmount")}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={1}
                max={discountType === "percent" ? 90 : undefined}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="dash-input"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-ink-2">
                {t("dash.couponMinSubtotal")}
              </span>
              <input
                type="number"
                min={0}
                value={minSubtotal}
                onChange={(e) => setMinSubtotal(e.target.value)}
                className="dash-input"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-ink-2">
                {t("dash.couponUsageLimit")}
              </span>
              <input
                type="number"
                min={1}
                value={usageLimit}
                onChange={(e) => setUsageLimit(e.target.value)}
                placeholder="∞"
                className="dash-input"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-ink-2">
                {t("dash.couponPerUser")}
              </span>
              <input
                type="number"
                min={1}
                value={perUserLimit}
                onChange={(e) => setPerUserLimit(e.target.value)}
                placeholder="∞"
                className="dash-input"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-ink-2">
                {t("offer.endsAt")}
              </span>
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="dash-input"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-ink-2">
              {t("dash.couponTargets")}
              <span className="ms-2 font-semibold text-ink-3">{t("dash.couponTargetsHint")}</span>
            </span>
            <input
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              dir="ltr"
              placeholder="a@mail.com, b@mail.com"
              className="dash-input text-start"
            />
          </label>

          <div>
            <span className="mb-1.5 block text-xs font-bold text-ink-2">
              {t("dash.couponProducts")}
              <span className="ms-2 font-semibold text-ink-3">{t("dash.couponProductsHint")}</span>
            </span>
            <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">
              {products.map((p) => {
                const on = productIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleProduct(p.id)}
                    aria-pressed={on}
                    className={`tap rounded-lg border px-2.5 py-1 text-[11px] font-bold transition ${
                      on
                        ? "border-brand bg-brand text-white"
                        : "border-line bg-surface text-ink-2 hover:border-brand"
                    }`}
                  >
                    {lang === "ar" ? p.nameAr : p.nameEn}
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="tap rounded-xl border border-line px-4 py-2 text-xs font-bold text-ink-2 transition hover:bg-surface-2"
            >
              {t("dash.cancel")}
            </button>
            <button
              type="button"
              onClick={create}
              disabled={pending || code.trim().length < 2}
              className="tap rounded-xl bg-brand px-5 py-2 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "…" : t("dash.save")}
            </button>
          </div>
        </div>
      )}

      {initialCoupons.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-3">{t("dash.empty")}</p>
      ) : (
        <ul className="divide-y divide-line-2">
          {initialCoupons.map((c) => (
            <li key={c.code} className="flex flex-wrap items-center gap-3 p-4 sm:px-5">
              <span
                dir="ltr"
                className="rounded-lg bg-surface-2 px-2.5 py-1 text-xs font-black text-ink"
              >
                {c.code}
              </span>
              <span className="text-xs font-bold text-brand">
                {c.discountType === "percent"
                  ? `-${c.value}%`
                  : `-${formatPrice(c.value, lang)}`}
              </span>
              <span className="flex flex-wrap items-center gap-2 text-[10px] font-semibold text-ink-3">
                {c.minSubtotal > 0 && <span>≥ {formatPrice(c.minSubtotal, lang)}</span>}
                <span>
                  {c.usedCount}
                  {c.usageLimit ? `/${c.usageLimit}` : ""} {t("dash.couponUsed")}
                </span>
                {c.perUserLimit && <span>· {c.perUserLimit}/{t("dash.couponPerUserShort")}</span>}
                {c.targetUserIds && c.targetUserIds.length > 0 && (
                  <span>· {c.targetUserIds.length} {t("dash.couponTargetsShort")}</span>
                )}
                {c.productIds && c.productIds.length > 0 && (
                  <span>· {c.productIds.length} {t("dash.couponProductsShort")}</span>
                )}
                {c.endsAt && <span dir="ltr">· {c.endsAt.slice(0, 10)}</span>}
              </span>

              <div className="ms-auto flex items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={c.active}
                  onClick={() =>
                    startTransition(async () => {
                      await setCouponActiveAction(c.code, !c.active);
                      router.refresh();
                    })
                  }
                  className={`tap relative h-6 w-11 shrink-0 rounded-full transition ${
                    c.active ? "bg-emerald-500" : "bg-surface-3"
                  }`}
                  aria-label={c.active ? t("dash.active") : t("dash.inactive")}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      c.active ? "start-[22px]" : "start-0.5"
                    }`}
                  />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    startTransition(async () => {
                      await deleteCouponAction(c.code);
                      router.refresh();
                    })
                  }
                  aria-label={t("offer.delete")}
                  className="tap grid h-8 w-8 place-items-center rounded-lg text-ink-3 transition hover:bg-red-500/10 hover:text-red-500"
                >
                  <Trash size={15} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
