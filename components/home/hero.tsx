"use client";

import Link from "next/link";
import { useStore } from "@/components/providers/store-provider";
import { Bag, Package, Sparkles } from "@/components/icons";
import { CUSTOM_ORDER_COLOR } from "@/lib/products";

export function Hero() {
  const { t, openCustom, siteSettings } = useStore();

  // Admin-editable from the dashboard (Offers → landing stats).
  const STATS = [
    { num: siteSettings.statFollowers, key: "stat.followers" as const },
    { num: siteSettings.statProducts, key: "stat.products" as const },
    { num: siteSettings.statRating, key: "stat.sales" as const },
  ];

  return (
    <section className="relative overflow-hidden rounded-3xl border border-line-2 bg-surface card-shadow">
      {/* decorative glow */}
      <div className="pointer-events-none absolute -top-24 end-[-60px] h-64 w-64 rounded-full bg-brand/15 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-80px] end-1/3 h-56 w-56 rounded-full bg-brand/10 blur-3xl" />

      <div className="relative flex flex-col-reverse md:flex-row">
        {/* Stats column */}
        <div className="flex shrink-0 items-center justify-around gap-3 border-line-2 bg-surface-2/60 px-6 py-6 md:w-44 md:flex-col md:justify-center md:border-s md:py-9">
          {STATS.map((s, i) => (
            <div key={s.key} className="flex flex-col items-center">
              <div className="text-2xl font-black leading-none text-brand sm:text-[26px]">
                {s.num}
              </div>
              <div className="mt-1 text-[10px] font-semibold tracking-wide text-ink-3">
                {t(s.key)}
              </div>
              {i < STATS.length - 1 && (
                <div className="mt-3 hidden h-px w-10 bg-line md:block" />
              )}
            </div>
          ))}
        </div>

        {/* Text */}
        <div className="flex flex-1 flex-col justify-center p-7 sm:p-9">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-brand-line bg-brand-soft px-3 py-1 text-[10px] font-bold tracking-[0.12em] text-brand">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            {t("hero.tag")}
          </span>
          <h1 className="mt-3.5 text-2xl font-black leading-tight text-ink sm:text-3xl">
            {t("hero.title")}
          </h1>
          <p className="mt-2.5 max-w-md text-[13px] leading-relaxed text-ink-2">
            {t("hero.desc")}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/store"
              className="tap inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-[13px] font-bold text-white transition hover:opacity-90"
            >
              <Bag size={16} />
              {t("hero.shop")}
            </Link>
            <Link
              href="/orders"
              className="tap inline-flex items-center gap-2 rounded-xl border border-line bg-transparent px-5 py-2.5 text-[13px] font-semibold text-ink-2 transition hover:border-brand hover:bg-brand-soft hover:text-brand"
            >
              <Package size={16} />
              {t("hero.track")}
            </Link>
            <button
              type="button"
              onClick={openCustom}
              className="tap inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-bold text-white transition hover:opacity-90"
              style={{ background: CUSTOM_ORDER_COLOR }}
            >
              <Sparkles size={16} />
              {t("custom.title")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
