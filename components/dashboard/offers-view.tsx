"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/providers/store-provider";
import { Plus, Trash, Zap, Gift, Percent, Truck } from "@/components/icons";
import { Countdown } from "@/components/ui/countdown";
import { formatPrice } from "@/lib/format";
import {
  createOfferAction,
  setOfferActiveAction,
  deleteOfferAction,
  type AdminOffer,
  type CreateOfferInput,
} from "@/lib/actions/offers";
import type { OfferKindDb } from "@/lib/supabase/types";
import type { DictKey } from "@/lib/i18n";

const KINDS: {
  id: OfferKindDb;
  key: DictKey;
  icon: React.ComponentType<{ size?: number }>;
}[] = [
  { id: "flash", key: "offer.kind.flash", icon: Zap },
  { id: "bundle", key: "offer.kind.bundle", icon: Gift },
  { id: "cart_percent", key: "offer.kind.cart_percent", icon: Percent },
  { id: "cart_delivery", key: "offer.kind.cart_delivery", icon: Truck },
];

export function OffersView({ initialOffers }: { initialOffers: AdminOffer[] }) {
  const { t, lang, products } = useStore();
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [kind, setKind] = useState<OfferKindDb>("flash");
  const [titleAr, setTitleAr] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [productId, setProductId] = useState("");
  const [buyQty, setBuyQty] = useState("2");
  const [freeQty, setFreeQty] = useState("1");
  const [minCart, setMinCart] = useState("20000");
  const [percent, setPercent] = useState("10");
  const [deliveryFee, setDeliveryFee] = useState("0");
  const [endsAt, setEndsAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // "now" captured post-mount (render must stay pure); null during SSR.
  const [now, setNow] = useState<number | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setNow(Date.now());
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const needsProduct = kind === "flash" || kind === "bundle";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!titleAr.trim() || !titleEn.trim()) return;
    if (needsProduct && !productId) return;
    if (kind === "flash" && !endsAt) return;

    const endsIso = endsAt ? new Date(endsAt).toISOString() : null;
    let input: CreateOfferInput;
    if (kind === "bundle") {
      input = {
        kind,
        titleAr: titleAr.trim(),
        titleEn: titleEn.trim(),
        productId,
        buyQty: Number(buyQty) || 1,
        freeQty: Number(freeQty) || 1,
        endsAt: endsIso,
      };
    } else if (kind === "flash") {
      input = {
        kind,
        titleAr: titleAr.trim(),
        titleEn: titleEn.trim(),
        productId,
        percent: Number(percent) || 1,
        endsAt: endsIso!,
      };
    } else if (kind === "cart_percent") {
      input = {
        kind,
        titleAr: titleAr.trim(),
        titleEn: titleEn.trim(),
        minCartTotal: Number(minCart) || 0,
        percent: Number(percent) || 1,
        endsAt: endsIso,
      };
    } else {
      input = {
        kind,
        titleAr: titleAr.trim(),
        titleEn: titleEn.trim(),
        minCartTotal: Number(minCart) || 0,
        deliveryFee: Number(deliveryFee) || 0,
        endsAt: endsIso,
      };
    }

    startTransition(async () => {
      const res = await createOfferAction(input);
      if (!res.ok) {
        setError(res.error ?? "error");
        return;
      }
      setFormOpen(false);
      setTitleAr("");
      setTitleEn("");
      router.refresh();
    });
  }

  function toggle(offer: AdminOffer) {
    startTransition(async () => {
      await setOfferActiveAction(offer.id, !offer.active);
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deleteOfferAction(id);
      router.refresh();
    });
  }

  function describe(o: AdminOffer): string {
    switch (o.kind) {
      case "bundle":
        return `${t("offer.buyQty")} ${o.buyQty} + ${o.freeQty} ${t("cart.free")}`;
      case "flash":
        return `-${o.percent}%`;
      case "cart_percent":
        return `≥ ${formatPrice(o.minCartTotal ?? 0, lang)} → -${o.percent}%`;
      case "cart_delivery":
        return `≥ ${formatPrice(o.minCartTotal ?? 0, lang)} → ${
          o.deliveryFee === 0 ? t("cart.freeDelivery") : formatPrice(o.deliveryFee ?? 0, lang)
        }`;
    }
  }

  return (
    <section className="rounded-2xl border border-line-2 bg-surface card-shadow">
      <div className="flex items-center justify-between border-b border-line-2 p-5">
        <h2 className="text-sm font-extrabold text-ink">{t("dash.offersTab")}</h2>
        <button
          type="button"
          onClick={() => setFormOpen((v) => !v)}
          className="tap inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:opacity-90"
        >
          <Plus size={16} />
          {t("offer.new")}
        </button>
      </div>

      {/* Create form */}
      {formOpen && (
        <form onSubmit={submit} className="space-y-3 border-b border-line-2 bg-surface-2/40 p-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                aria-pressed={kind === k.id}
                className={`tap rounded-xl border px-2 py-2 text-[11px] font-bold transition ${
                  kind === k.id
                    ? "border-brand bg-brand text-white"
                    : "border-line bg-surface text-ink-2 hover:border-brand hover:text-brand"
                }`}
              >
                <span className="inline-flex items-center justify-center gap-1.5">
                  <k.icon size={14} />
                  {t(k.key)}
                </span>
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-ink-2">{t("offer.titleAr")}</span>
              <input value={titleAr} onChange={(e) => setTitleAr(e.target.value)} required className="dash-input" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-ink-2">{t("offer.titleEn")}</span>
              <input
                value={titleEn}
                onChange={(e) => setTitleEn(e.target.value)}
                dir="ltr"
                required
                className="dash-input text-start"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {needsProduct && (
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs font-bold text-ink-2">{t("offer.product")}</span>
                <select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  required
                  className="dash-input cursor-pointer"
                >
                  <option value="" disabled>
                    —
                  </option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {lang === "ar" ? p.nameAr : p.nameEn}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {kind === "bundle" && (
              <>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-ink-2">{t("offer.buyQty")}</span>
                  <input type="number" min={1} value={buyQty} onChange={(e) => setBuyQty(e.target.value)} className="dash-input" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-ink-2">{t("offer.freeQty")}</span>
                  <input type="number" min={1} value={freeQty} onChange={(e) => setFreeQty(e.target.value)} className="dash-input" />
                </label>
              </>
            )}
            {(kind === "cart_percent" || kind === "cart_delivery") && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-ink-2">{t("offer.minCart")}</span>
                <input type="number" min={0} value={minCart} onChange={(e) => setMinCart(e.target.value)} className="dash-input" />
              </label>
            )}
            {(kind === "flash" || kind === "cart_percent") && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-ink-2">{t("offer.percent")}</span>
                <input type="number" min={1} max={90} value={percent} onChange={(e) => setPercent(e.target.value)} className="dash-input" />
              </label>
            )}
            {kind === "cart_delivery" && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-ink-2">{t("offer.deliveryFee")}</span>
                <input type="number" min={0} value={deliveryFee} onChange={(e) => setDeliveryFee(e.target.value)} className="dash-input" />
              </label>
            )}
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-ink-2">
                {t("offer.endsAt")}
                {kind !== "flash" && <span className="ms-1 font-semibold text-ink-3">(اختياري)</span>}
              </span>
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                required={kind === "flash"}
                dir="ltr"
                className="dash-input text-start"
              />
            </label>
          </div>

          {error && (
            <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500">{error}</p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="tap rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "…" : t("offer.create")}
          </button>
        </form>
      )}

      {/* Offers list */}
      {initialOffers.length === 0 ? (
        <p className="p-8 text-center text-sm text-ink-3">{t("offer.empty")}</p>
      ) : (
        <ul className="divide-y divide-line-2">
          {initialOffers.map((o) => {
            const kindMeta = KINDS.find((k) => k.id === o.kind);
            const expired = o.endsAt && now !== null ? new Date(o.endsAt).getTime() <= now : false;
            const product = o.productId ? products.find((p) => p.id === o.productId) : null;
            return (
              <li key={o.id} className="flex flex-wrap items-center gap-3 p-4 sm:px-5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                  {kindMeta && <kindMeta.icon size={18} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-ink">
                    {lang === "ar" ? o.titleAr : o.titleEn}
                  </p>
                  <p className="mt-0.5 text-[11px] font-semibold text-ink-3">
                    {kindMeta ? t(kindMeta.key) : o.kind} · {describe(o)}
                    {product && ` · ${lang === "ar" ? product.nameAr : product.nameEn}`}
                  </p>
                </div>
                {o.endsAt && !expired && (
                  <span className="flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-[10px] font-bold text-brand">
                    {t("offer.endsIn")} <Countdown endsAt={o.endsAt} />
                  </span>
                )}
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                    expired
                      ? "bg-surface-2 text-ink-3"
                      : o.active
                        ? "bg-emerald-500/12 text-emerald-600"
                        : "bg-amber-500/12 text-amber-600"
                  }`}
                >
                  {expired ? t("offer.expired") : o.active ? t("offer.live") : t("offer.off")}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={o.active}
                  aria-label={o.active ? t("offer.live") : t("offer.off")}
                  onClick={() => toggle(o)}
                  className={`tap relative h-6 w-11 shrink-0 rounded-full transition ${
                    o.active ? "bg-emerald-500" : "bg-surface-3"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      o.active ? "start-[22px]" : "start-0.5"
                    }`}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => remove(o.id)}
                  aria-label={t("offer.delete")}
                  className="tap grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-3 transition hover:bg-red-500/10 hover:text-red-500"
                >
                  <Trash size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
