"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/providers/store-provider";
import { Truck, Check } from "@/components/icons";
import { updateDeliveryFeesAction, updateLandingStatsAction } from "@/lib/actions/offers";
import type { SiteSettings } from "@/lib/products";

/**
 * Store-wide config the admin owns: delivery fees (Karbala vs the rest, the
 * defaults place_order charges) and the landing-page stat numbers.
 */
export function StoreConfigEditor({ initial }: { initial: SiteSettings }) {
  const { t } = useStore();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [feeDefault, setFeeDefault] = useState(String(initial.deliveryFeeDefault));
  const [feeKarbala, setFeeKarbala] = useState(String(initial.deliveryFeeKarbala));
  const [followers, setFollowers] = useState(initial.statFollowers);
  const [productsStat, setProductsStat] = useState(initial.statProducts);
  const [rating, setRating] = useState(initial.statRating);
  const [savedKey, setSavedKey] = useState<"delivery" | "stats" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function saveDelivery() {
    setError(null);
    startTransition(async () => {
      const res = await updateDeliveryFeesAction({
        deliveryFeeDefault: Math.max(0, Number(feeDefault) || 0),
        deliveryFeeKarbala: Math.max(0, Number(feeKarbala) || 0),
      });
      if (!res.ok) {
        setError(res.error ?? t("checkout.error"));
        return;
      }
      setSavedKey("delivery");
      setTimeout(() => setSavedKey(null), 1500);
      router.refresh();
    });
  }

  function saveStats() {
    setError(null);
    startTransition(async () => {
      const res = await updateLandingStatsAction({
        statFollowers: followers.trim(),
        statProducts: productsStat.trim(),
        statRating: rating.trim(),
      });
      if (!res.ok) {
        setError(res.error ?? t("checkout.error"));
        return;
      }
      setSavedKey("stats");
      setTimeout(() => setSavedKey(null), 1500);
      router.refresh();
    });
  }

  return (
    <section className="mb-5 grid gap-4 lg:grid-cols-2">
      {/* Delivery fees */}
      <div className="rounded-2xl border border-line-2 bg-surface p-5 card-shadow">
        <h2 className="flex items-center gap-2 text-sm font-extrabold text-ink">
          <Truck size={16} className="text-brand" />
          {t("dash.deliveryFees")}
        </h2>
        <p className="mt-1 text-[11px] text-ink-3">{t("dash.deliveryFeesHint")}</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-ink-2">
              {t("dash.feeKarbala")}
            </span>
            <input
              type="number"
              min={0}
              value={feeKarbala}
              onChange={(e) => setFeeKarbala(e.target.value)}
              className="dash-input"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-ink-2">
              {t("dash.feeOther")}
            </span>
            <input
              type="number"
              min={0}
              value={feeDefault}
              onChange={(e) => setFeeDefault(e.target.value)}
              className="dash-input"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={saveDelivery}
          disabled={pending}
          className="tap mt-3 inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {savedKey === "delivery" ? <Check size={14} /> : null}
          {savedKey === "delivery" ? t("profile.saved") : t("profile.save")}
        </button>
      </div>

      {/* Landing stats */}
      <div className="rounded-2xl border border-line-2 bg-surface p-5 card-shadow">
        <h2 className="text-sm font-extrabold text-ink">{t("dash.landingStats")}</h2>
        <p className="mt-1 text-[11px] text-ink-3">{t("dash.landingStatsHint")}</p>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-ink-2">
              {t("stat.followers")}
            </span>
            <input
              value={followers}
              onChange={(e) => setFollowers(e.target.value)}
              className="dash-input text-center"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-ink-2">{t("stat.products")}</span>
            <input
              value={productsStat}
              onChange={(e) => setProductsStat(e.target.value)}
              className="dash-input text-center"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-ink-2">{t("stat.rating")}</span>
            <input
              value={rating}
              onChange={(e) => setRating(e.target.value)}
              className="dash-input text-center"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={saveStats}
          disabled={pending}
          className="tap mt-3 inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {savedKey === "stats" ? <Check size={14} /> : null}
          {savedKey === "stats" ? t("profile.saved") : t("profile.save")}
        </button>
      </div>

      {error && (
        <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500 lg:col-span-2">
          {error}
        </p>
      )}
    </section>
  );
}
