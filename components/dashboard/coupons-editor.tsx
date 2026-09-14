"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/providers/store-provider";
import { Plus, Trash, Percent, Check, Sliders } from "@/components/icons";
import { formatPrice } from "@/lib/format";
import {
  createCouponAction,
  updateCouponAction,
  setCouponActiveAction,
  deleteCouponAction,
  getCouponTargetEmailsAction,
  type AdminCoupon,
} from "@/lib/actions/offers";

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` in LOCAL time; we store UTC ISO. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Promo-code portal. The admin defines the amount (percent or flat IQD), the
 * active window, total + per-customer usage caps, which customers may use it,
 * and which products it applies to. place_order() enforces every one of these
 * server-side and records a redemption row.
 *
 * The same form creates and edits. A live code used to be fixed at creation —
 * the switch was the only control — so correcting a wrong percentage meant
 * deleting and recreating it, which wipes the redemption ledger and gives every
 * customer who already used the code a fresh allowance. Editing in place keeps
 * the campaign, and its count, intact (see updateCouponAction).
 */
export function CouponsEditor({
  initialCoupons,
}: {
  initialCoupons: AdminCoupon[];
}) {
  const { t, lang, products } = useStore();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [coupons, setCoupons] = useState(initialCoupons);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** The code being edited, or null while the form is creating a new one. */
  const [editing, setEditing] = useState<string | null>(null);
  /** Its targets are fetched when the form opens; don't save over them early. */
  const [loadingTargets, setLoadingTargets] = useState(false);

  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "fixed">(
    "percent",
  );
  const [value, setValue] = useState("10");
  const [minSubtotal, setMinSubtotal] = useState("0");
  const [usageLimit, setUsageLimit] = useState("");
  const [perUserLimit, setPerUserLimit] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [emails, setEmails] = useState("");
  const [productIds, setProductIds] = useState<string[]>([]);

  function reset() {
    setEditing(null);
    setCode("");
    setTitle("");
    setDiscountType("percent");
    setValue("10");
    setMinSubtotal("0");
    setUsageLimit("");
    setPerUserLimit("");
    setStartsAt("");
    setEndsAt("");
    setEmails("");
    setProductIds([]);
  }

  /**
   * Load a coupon into the form. Every field the save writes is seeded, so a
   * save round-trips the ones the admin didn't touch instead of nulling them —
   * that is why `title` and `startsAt` are on the form at all.
   */
  function startEdit(c: AdminCoupon) {
    setError(null);
    setEditing(c.code);
    setCode(c.code);
    setTitle(c.title ?? "");
    setDiscountType(c.discountType);
    setValue(String(c.value));
    setMinSubtotal(String(c.minSubtotal));
    setUsageLimit(c.usageLimit == null ? "" : String(c.usageLimit));
    setPerUserLimit(c.perUserLimit == null ? "" : String(c.perUserLimit));
    setStartsAt(toLocalInput(c.startsAt));
    setEndsAt(toLocalInput(c.endsAt));
    setProductIds(c.productIds ?? []);
    setOpen(true);

    // Targeting is stored as user ids, so the emails behind them are resolved
    // on demand. Saving is blocked until they arrive — an empty box means
    // "everyone", and saving it early would quietly un-target the coupon.
    setEmails("");
    if (c.targetUserIds && c.targetUserIds.length > 0) {
      setLoadingTargets(true);
      void getCouponTargetEmailsAction(c.code).then((res) => {
        setLoadingTargets(false);
        if (res.ok) setEmails(res.emails.join(", "));
      });
    }
  }

  /** The form's values, in the shape both actions take. */
  function formPayload() {
    return {
      code: code.trim(),
      title: title.trim(),
      discountType,
      value: Math.max(1, Number(value) || 0),
      minSubtotal: Math.max(0, Number(minSubtotal) || 0),
      usageLimit:
        usageLimit.trim() === "" ? null : Math.max(1, Number(usageLimit) || 1),
      perUserLimit:
        perUserLimit.trim() === ""
          ? null
          : Math.max(1, Number(perUserLimit) || 1),
      productIds,
      targetEmails: emails
        .split(/[,\s]+/)
        .map((e) => e.trim())
        .filter(Boolean),
      startsAt: startsAt ? new Date(startsAt).toISOString() : null,
      endsAt: endsAt ? new Date(endsAt).toISOString() : null,
    };
  }

  function save() {
    setError(null);
    const payload = formPayload();
    const editingCode = editing;

    startTransition(async () => {
      const res = editingCode
        ? await updateCouponAction(payload)
        : await createCouponAction(payload);
      if (!res.ok) {
        setError(
          res.error === "no_matching_users"
            ? t("dash.couponNoUsers")
            : res.error === "not_found"
              ? t("dash.couponNotFound")
              : (res.error ?? t("checkout.error")),
        );
        return;
      }

      const upper = payload.code.toUpperCase();
      setCoupons((prev) => {
        // An edit keeps the row's position, its usage count and its on/off
        // state — none of which the form owns. Only what was edited changes.
        const edited = prev.find((c) => c.code === upper);
        const next: AdminCoupon = {
          code: upper,
          discountType: payload.discountType,
          value: payload.value,
          minSubtotal: payload.minSubtotal,
          active: editingCode ? (edited?.active ?? true) : true,
          usageLimit: payload.usageLimit,
          usedCount: editingCode ? (edited?.usedCount ?? 0) : 0,
          perUserLimit: payload.perUserLimit,
          // Server-resolved from emails; refreshed below by router.refresh().
          targetUserIds:
            payload.targetEmails.length > 0
              ? (edited?.targetUserIds ?? [])
              : null,
          productIds:
            payload.productIds.length > 0 ? payload.productIds : null,
          title: payload.title || null,
          startsAt: payload.startsAt,
          endsAt: payload.endsAt,
        };
        return editingCode
          ? prev.map((c) => (c.code === upper ? next : c))
          : [next, ...prev.filter((c) => c.code !== upper)];
      });

      reset();
      setOpen(false);
      router.refresh();
    });
  }

  function toggleProduct(id: string) {
    setProductIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
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
          onClick={() => {
            // Always lands on a blank NEW form, even when an edit is open —
            // otherwise this button would silently keep editing a live code.
            if (open && !editing) {
              setOpen(false);
              return;
            }
            reset();
            setError(null);
            setOpen(true);
          }}
          className="tap inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:opacity-90"
        >
          <Plus size={15} />
          {t("dash.newCoupon")}
        </button>
      </div>

      {open && (
        <div className="space-y-3 border-b border-line-2 bg-surface-2/40 p-5">
          {editing && (
            <div className="rounded-xl bg-brand-soft px-3 py-2.5">
              <p className="text-xs font-extrabold text-brand">
                {t("dash.couponEditing")}{" "}
                <span dir="ltr">{editing}</span>
              </p>
              <p className="mt-1 text-[11px] font-semibold text-ink-2">
                {t("dash.couponEditKeepsUsage")}
              </p>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-ink-2">
                {t("cart.coupon")}
              </span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                readOnly={editing !== null}
                dir="ltr"
                placeholder="ROFOOF10"
                className={`dash-input text-start ${editing ? "cursor-not-allowed opacity-60" : ""}`}
              />
              {editing && (
                <span className="mt-1 block text-[11px] font-semibold text-ink-3">
                  {t("dash.couponCodeLocked")}
                </span>
              )}
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

          {/* Both of these exist so that an EDIT round-trips every column the
              save writes. Without them a save would null a title or a start
              date the coupon already had, just because the form never showed
              it. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-ink-2">
                {t("dash.couponName")}
              </span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="dash-input"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-ink-2">
                {t("offer.startsAt")}
              </span>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="dash-input"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-ink-2">
              {t("dash.couponTargets")}
              <span className="ms-2 font-semibold text-ink-3">
                {t("dash.couponTargetsHint")}
              </span>
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
              <span className="ms-2 font-semibold text-ink-3">
                {t("dash.couponProductsHint")}
              </span>
            </span>
            {productIds.length > 0 && (
              <p className="mb-1.5 text-[11px] font-semibold text-amber-600">
                {t("dash.couponProductsWarn")}
              </p>
            )}
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
              onClick={() => {
                reset();
                setOpen(false);
              }}
              className="tap rounded-xl border border-line px-4 py-2 text-xs font-bold text-ink-2 transition hover:bg-surface-2"
            >
              {t("dash.cancel")}
            </button>
            <button
              type="button"
              onClick={save}
              // `loadingTargets` blocks the save until this coupon's existing
              // targets are in the box — saving before they land would read as
              // "targets nobody", i.e. open the coupon to everyone.
              disabled={pending || loadingTargets || code.trim().length < 2}
              className="tap rounded-xl bg-brand px-5 py-2 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {pending || loadingTargets
                ? "…"
                : editing
                  ? t("dash.couponSaveEdit")
                  : t("dash.save")}
            </button>
          </div>
        </div>
      )}

      {coupons.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-3">
          {t("dash.empty")}
        </p>
      ) : (
        <ul className="divide-y divide-line-2">
          {coupons.map((c) => (
            <li
              key={c.code}
              className="flex flex-wrap items-center gap-3 p-4 sm:px-5"
            >
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
                {c.minSubtotal > 0 && (
                  <span>≥ {formatPrice(c.minSubtotal, lang)}</span>
                )}
                <span>
                  {c.usedCount}
                  {c.usageLimit ? `/${c.usageLimit}` : ""}{" "}
                  {t("dash.couponUsed")}
                </span>
                {c.perUserLimit && (
                  <span>
                    · {c.perUserLimit}/{t("dash.couponPerUserShort")}
                  </span>
                )}
                {c.targetUserIds && c.targetUserIds.length > 0 && (
                  <span>
                    · {c.targetUserIds.length} {t("dash.couponTargetsShort")}
                  </span>
                )}
                {c.productIds && c.productIds.length > 0 && (
                  <span>
                    · {c.productIds.length} {t("dash.couponProductsShort")}
                  </span>
                )}
                {c.endsAt && <span dir="ltr">· {c.endsAt.slice(0, 10)}</span>}
              </span>

              <div className="ms-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(c)}
                  aria-label={`${t("dash.couponEdit")} ${c.code}`}
                  className={`tap grid h-8 w-8 place-items-center rounded-lg transition hover:bg-brand-soft hover:text-brand ${
                    editing === c.code ? "bg-brand text-white" : "text-ink-3"
                  }`}
                >
                  <Sliders size={15} />
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={c.active}
                  onClick={() =>
                    startTransition(async () => {
                      const nextActive = !c.active;
                      setCoupons((prev) =>
                        prev.map((coupon) =>
                          coupon.code === c.code
                            ? { ...coupon, active: nextActive }
                            : coupon,
                        ),
                      );
                      const res = await setCouponActiveAction(
                        c.code,
                        nextActive,
                      );
                      if (!res.ok) {
                        setCoupons((prev) =>
                          prev.map((coupon) =>
                            coupon.code === c.code
                              ? { ...coupon, active: c.active }
                              : coupon,
                          ),
                        );
                        setError(res.error ?? t("checkout.error"));
                      }
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
                  onClick={() => {
                    if (confirmingDelete !== c.code) {
                      setConfirmingDelete(c.code);
                      return;
                    }
                    setConfirmingDelete(null);
                    const previous = coupons;
                    setCoupons((prev) =>
                      prev.filter((coupon) => coupon.code !== c.code),
                    );
                    startTransition(async () => {
                      const res = await deleteCouponAction(c.code);
                      if (!res.ok) {
                        setCoupons(previous);
                        setError(res.error ?? t("checkout.error"));
                      }
                      router.refresh();
                    });
                  }}
                  onBlur={() =>
                    confirmingDelete === c.code && setConfirmingDelete(null)
                  }
                  aria-label={
                    confirmingDelete === c.code
                      ? t("dash.confirmDelete")
                      : t("offer.delete")
                  }
                  className={`tap grid h-8 w-8 place-items-center rounded-lg transition hover:bg-red-500/10 hover:text-red-500 ${
                    confirmingDelete === c.code
                      ? "bg-red-500 text-white"
                      : "text-ink-3"
                  }`}
                >
                  {confirmingDelete === c.code ? (
                    <Check size={15} />
                  ) : (
                    <Trash size={15} />
                  )}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
