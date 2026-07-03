"use client";

import { useState, useTransition } from "react";
import { useStore } from "@/components/providers/store-provider";
import { Package, Search } from "@/components/icons";
import { OrderTracker } from "@/components/ui/order-tracker";
import { formatPrice } from "@/lib/format";
import { statusStyle, type OrderStatus } from "@/lib/products";
import { trackOrderAction, type TrackingResult } from "@/lib/actions/orders";

export function TrackOrder() {
  const { t, lang } = useStore();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<TrackingResult | null | undefined>(undefined);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const code = query.trim();
    if (!code) return;
    startTransition(async () => {
      setResult(await trackOrderAction(code));
    });
  }

  return (
    <div className="rounded-2xl border border-line-2 bg-surface p-6 card-shadow">
      <h3 className="flex items-center gap-2 text-sm font-extrabold text-ink">
        <Package size={17} className="text-brand" />
        {t("track.title")}
      </h3>
      <p className="mt-1 text-[11px] text-ink-3">{t("track.sub")}</p>

      <form onSubmit={submit} className="mt-4 flex gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute inset-y-0 start-3.5 grid place-items-center text-ink-3">
            <Search size={16} />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("track.placeholder")}
            aria-label={t("track.title")}
            className="h-11 w-full rounded-xl border border-line bg-surface-2 ps-10 pe-4 text-sm text-ink outline-none transition placeholder:text-ink-3 focus:border-brand focus:bg-surface"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="tap h-11 shrink-0 rounded-xl bg-brand px-6 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "…" : t("track.button")}
        </button>
      </form>

      {result === null && (
        <p className="mt-4 rounded-xl border border-line-2 bg-surface-2/60 px-4 py-3 text-sm text-ink-2">
          {t("track.notFound")} <span className="font-bold text-brand">{t("track.tryCode")}</span>
        </p>
      )}

      {result && (
        <div className="mt-5 border-t border-line-2 pt-5">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-sm font-extrabold text-ink">{result.code}</span>
              <span className="text-[11px] text-ink-3">{formatPrice(result.total, lang)}</span>
            </div>
            <StatusPill status={result.status} />
          </div>
          <OrderTracker status={result.status} />
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: OrderStatus }) {
  const { t } = useStore();
  const meta = statusStyle[status];
  return (
    <span
      className="rounded-full border px-3 py-1 text-[11px] font-bold"
      style={{
        color: meta.color,
        background: `color-mix(in srgb, ${meta.color} 12%, var(--surface))`,
        borderColor: `color-mix(in srgb, ${meta.color} 30%, transparent)`,
      }}
    >
      {t(meta.key)}
    </span>
  );
}
