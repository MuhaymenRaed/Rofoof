"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/providers/store-provider";
import { Check, MapPin, Truck, X } from "@/components/icons";
import { updateProvinceDeliveryFeesAction } from "@/lib/actions/offers";
import { formatPrice } from "@/lib/format";
import {
  PROVINCE_REGIONS,
  REGION_ACCENT,
  provinceCodes,
  provinceLabelKey,
  provincesIn,
  regionApplyKey,
  regionClearKey,
  regionLabelKey,
  type ProvinceRegion,
} from "@/lib/provinces";
import type { SiteSettings } from "@/lib/products";

/**
 * Delivery price per Iraqi governorate.
 *
 * Eighteen number inputs is the wrong shape for how this is actually priced:
 * the rate changes by REGION, not by province. So the eighteen are grouped,
 * Kurdistan on its own accent, and three ways in are offered in order of how
 * often each is wanted:
 *
 *   1. one price for a whole region — the Kurdistan rate in two taps;
 *   2. one price for an arbitrary selection — tick, type once, apply;
 *   3. a single province typed by hand, for the exceptions.
 *
 * A province left blank is not free: it has no row at all, and
 * `deliveryFeeFor()` charges it the default fee from the card above. That is
 * what keeps this table sparse — the admin prices the handful that differ
 * rather than filling in all eighteen.
 */
export function ProvinceFeesEditor({ initial }: { initial: SiteSettings }) {
  const { t, lang } = useStore();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  /**
   * Province code to the fee as typed. "" means "no row", i.e. charge the
   * default — the only way to express that, since 0 is a real price (free
   * delivery to that province) and an integer column has no "unset".
   *
   * Karbala is seeded from the legacy `delivery_fee_karbala` column when it has
   * no row of its own, so the editor opens showing the rate the shop charges
   * today rather than a blank that reads as "default".
   */
  const [fees, setFees] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const [code, fee] of Object.entries(initial.deliveryFees)) {
      seed[code] = String(fee);
    }
    if (seed.karbala === undefined && initial.deliveryFeeKarbala !== initial.deliveryFeeDefault) {
      seed.karbala = String(initial.deliveryFeeKarbala);
    }
    return seed;
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState("");
  const [regionBulk, setRegionBulk] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);

  const pricedCount = useMemo(
    () => Object.values(fees).filter((v) => v.trim() !== "").length,
    [fees],
  );

  /**
   * What a province is charged when its field is left blank — the placeholder,
   * so an empty box shows the price it will really cost rather than implying
   * one.
   *
   * Karbala is not the default: it is step 2 of `deliveryFeeFor()`, its own
   * column on `settings`, which is what the server charges when it has no row
   * of its own. Showing the default there would be a straightforward lie about
   * a live price.
   */
  function fallbackFor(code: string): number {
    return code === "karbala" ? initial.deliveryFeeKarbala : initial.deliveryFeeDefault;
  }

  function setFee(code: string, value: string) {
    setFees((prev) => ({ ...prev, [code]: value }));
  }

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  /** Tick or untick a whole region in one go. */
  function selectRegion(region: ProvinceRegion, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const code of provincesIn(region)) {
        if (on) next.add(code);
        else next.delete(code);
      }
      return next;
    });
  }

  /** Write one fee into every ticked province. */
  function applyToSelected() {
    const v = bulk.trim();
    if (v === "" || selected.size === 0) return;
    setFees((prev) => {
      const next = { ...prev };
      for (const code of selected) next[code] = v;
      return next;
    });
  }

  /**
   * One fee for a whole region, without ticking anything first — the direct
   * route for "Kurdistan costs this much", which is the most common edit this
   * card gets and would otherwise be three checkboxes and a second field.
   */
  function applyToRegion(region: ProvinceRegion) {
    const v = (regionBulk[region] ?? "").trim();
    if (v === "") return;
    setFees((prev) => {
      const next = { ...prev };
      for (const code of provincesIn(region)) next[code] = v;
      return next;
    });
  }

  /** Drop a region's prices so it falls back to the default fee. */
  function clearRegion(region: ProvinceRegion) {
    setFees((prev) => {
      const next = { ...prev };
      for (const code of provincesIn(region)) next[code] = "";
      return next;
    });
    setRegionBulk((prev) => ({ ...prev, [region]: "" }));
  }

  function save() {
    setError(null);
    setNeedsMigration(false);
    startTransition(async () => {
      const res = await updateProvinceDeliveryFeesAction({
        fees: Object.entries(fees)
          .filter(([, v]) => v.trim() !== "")
          .map(([code, v]) => ({ code, fee: Math.max(0, Math.round(Number(v) || 0)) })),
      });
      if (!res.ok) {
        // Named precisely, because the fix is one specific action by one person.
        if (res.error === "migration_missing") setNeedsMigration(true);
        else setError(res.error ?? t("checkout.error"));
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-line-2 bg-surface p-5 card-shadow lg:col-span-2">
      <h2 className="flex items-center gap-2 text-sm font-extrabold text-ink">
        <MapPin size={16} className="text-brand" />
        {t("dash.provinceFees")}
        <span className="ms-auto rounded-lg bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-ink-3">
          {pricedCount}/{provinceCodes.length}
        </span>
      </h2>
      <p className="mt-1 text-[11px] leading-snug text-ink-3">{t("dash.provinceFeesHint")}</p>

      {/* Apply one price to everything currently ticked. Disabled rather than
          hidden while nothing is ticked, so the control explains itself before
          the admin has worked out that the rows are selectable at all. */}
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line-2 bg-surface-2/50 p-2.5">
        <span className="text-[11px] font-bold text-ink-2">
          {selected.size > 0 ? `${t("dash.feeSelected")} ${selected.size}` : t("dash.feeSelectHint")}
        </span>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
          placeholder={t("dash.feeOnePrice")}
          aria-label={t("dash.feeOnePrice")}
          className="dash-input h-9 w-28"
        />
        <button
          type="button"
          onClick={applyToSelected}
          disabled={bulk.trim() === "" || selected.size === 0}
          className="tap cta rounded-xl bg-brand px-3 py-2 text-[11px] font-bold text-white transition disabled:opacity-50"
        >
          {t("dash.feeApplySelected")}
        </button>
        <button
          type="button"
          onClick={() => setSelected(new Set(provinceCodes))}
          className="tap rounded-xl border border-line px-3 py-2 text-[11px] font-bold text-ink-2 transition hover:border-brand hover:text-brand"
        >
          {t("dash.feeSelectAll")}
        </button>
        <button
          type="button"
          onClick={() => setSelected(new Set())}
          disabled={selected.size === 0}
          className="tap rounded-xl border border-line px-3 py-2 text-[11px] font-bold text-ink-2 transition hover:border-brand hover:text-brand disabled:opacity-50"
        >
          {t("dash.feeSelectNone")}
        </button>
      </div>

      {/* One block per region, each with its own accent and its own one-shot
          price field — the Kurdistan rate without touching a checkbox. */}
      <div className="mt-3 space-y-3">
        {PROVINCE_REGIONS.map((region) => {
          const codes = provincesIn(region);
          const accent = REGION_ACCENT[region];
          const allTicked = codes.every((c) => selected.has(c));
          return (
            <section
              key={region}
              className="rounded-2xl border p-3"
              style={{
                borderColor: `color-mix(in srgb, ${accent} 35%, transparent)`,
                background: `color-mix(in srgb, ${accent} 5%, var(--surface))`,
              }}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={allTicked}
                    onChange={(e) => selectRegion(region, e.target.checked)}
                    className="h-4 w-4 shrink-0"
                    // The region tints its own boxes — see the checkbox rule
                    // in globals.css, which reads this custom property.
                    style={{ "--check-accent": accent } as React.CSSProperties}
                  />
                  <span className="text-[12px] font-extrabold" style={{ color: accent }}>
                    {t(regionLabelKey(region))}
                  </span>
                </label>
                <span className="text-[11px] font-semibold text-ink-3">
                  {codes.length} {t("dash.feeProvincesLabel")}
                </span>

                <div className="ms-auto flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={regionBulk[region] ?? ""}
                    onChange={(e) =>
                      setRegionBulk((prev) => ({ ...prev, [region]: e.target.value }))
                    }
                    placeholder={t("dash.feeOnePrice")}
                    aria-label={`${t(regionLabelKey(region))} — ${t("dash.feeOnePrice")}`}
                    className="dash-input h-8 w-24 px-2 text-center text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => applyToRegion(region)}
                    disabled={(regionBulk[region] ?? "").trim() === ""}
                    className="tap rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition disabled:opacity-50"
                    style={{ borderColor: accent, color: accent }}
                  >
                    {t(regionApplyKey(region))}
                  </button>
                  <button
                    type="button"
                    onClick={() => clearRegion(region)}
                    aria-label={t(regionClearKey(region))}
                    title={t(regionClearKey(region))}
                    className="tap grid h-7 w-7 place-items-center rounded-lg border border-line text-ink-3 transition hover:border-red-500 hover:text-red-500"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>

              {/* One column on a phone — this dashboard is used on one — opening
                  out to three where there is room. */}
              <div className="mt-2.5 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {codes.map((code) => {
                  const ticked = selected.has(code);
                  const value = fees[code] ?? "";
                  return (
                    <div
                      key={code}
                      className="flex items-center gap-2 rounded-xl border bg-surface px-2 py-1.5 transition"
                      style={{ borderColor: ticked ? accent : "var(--line)" }}
                    >
                      <input
                        type="checkbox"
                        checked={ticked}
                        onChange={() => toggle(code)}
                        aria-label={t(provinceLabelKey(code))}
                        className="h-4 w-4 shrink-0"
                        style={{ "--check-accent": accent } as React.CSSProperties}
                      />
                      <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-ink">
                        {t(provinceLabelKey(code))}
                      </span>
                      <input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={value}
                        onChange={(e) => setFee(code, e.target.value)}
                        /* The fee this province really falls back to, so a
                           blank field reads as the price it will charge rather
                           than as a missing value. */
                        placeholder={String(fallbackFor(code))}
                        aria-label={`${t(provinceLabelKey(code))} — ${t("dash.deliveryFees")}`}
                        className="h-7 w-20 shrink-0 rounded-lg border border-line bg-surface-2 px-1 text-center text-[12px] font-bold text-ink outline-none focus:border-brand"
                      />
                      {value.trim() !== "" ? (
                        <button
                          type="button"
                          onClick={() => setFee(code, "")}
                          aria-label={t("dash.feeUseDefault")}
                          title={t("dash.feeUseDefault")}
                          className="tap grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-3 transition hover:bg-red-500/10 hover:text-red-500"
                        >
                          <X size={11} />
                        </button>
                      ) : (
                        <span
                          aria-hidden
                          title={`${t("dash.feeUsesDefault")} ${formatPrice(fallbackFor(code), lang)}`}
                          className="grid h-6 w-6 shrink-0 place-items-center text-ink-3/60"
                        >
                          <Truck size={11} />
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="tap cta inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition disabled:opacity-60"
        >
          {saved ? <Check size={14} /> : null}
          {saved ? t("profile.saved") : t("profile.save")}
        </button>
        <span className="text-[11px] text-ink-3">
          {t("dash.feeDefaultNote")} {formatPrice(initial.deliveryFeeDefault, lang)}
        </span>
      </div>

      {needsMigration && (
        <p className="mt-2 rounded-xl bg-amber-500/10 px-3 py-2 text-[11px] font-semibold leading-snug text-amber-700">
          {t("dash.provinceFeesMigration")}
        </p>
      )}
      {error && (
        <p className="mt-2 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
