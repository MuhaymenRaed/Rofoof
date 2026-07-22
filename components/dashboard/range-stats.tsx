"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useStore } from "@/components/providers/store-provider";
import { formatPrice } from "@/lib/format";
import { loadRangeStatsAction } from "@/lib/actions/dashboard";
import type { RangeGrain, RangeStats } from "@/lib/data/dashboard";
import type { DictKey } from "@/lib/i18n";

const GRAINS: { id: RangeGrain; key: DictKey }[] = [
  { id: "day", key: "dash.daily" },
  { id: "month", key: "dash.monthly" },
  { id: "year", key: "dash.yearly" },
];

const pad = (n: number) => String(n).padStart(2, "0");

/** Local-time period bounds for the picked value, as ISO strings. */
function boundsFor(grain: RangeGrain, value: string): { from: string; to: string } {
  if (grain === "day") {
    const [y, m, d] = value.split("-").map(Number);
    return {
      from: new Date(y, m - 1, d, 0, 0, 0).toISOString(),
      to: new Date(y, m - 1, d, 23, 59, 59, 999).toISOString(),
    };
  }
  if (grain === "month") {
    const [y, m] = value.split("-").map(Number);
    return {
      from: new Date(y, m - 1, 1, 0, 0, 0).toISOString(),
      to: new Date(y, m, 0, 23, 59, 59, 999).toISOString(),
    };
  }
  const y = Number(value);
  return {
    from: new Date(y, 0, 1, 0, 0, 0).toISOString(),
    to: new Date(y, 11, 31, 23, 59, 59, 999).toISOString(),
  };
}

/** Default picker value for a grain (today / this month / this year). */
function defaultValue(grain: RangeGrain): string {
  const now = new Date();
  if (grain === "day") return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (grain === "month") return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  return String(now.getFullYear());
}

/**
 * Replaces the fixed "last 30 days" view: the admin picks a specific day,
 * month or year and every metric + the chart re-scope to it.
 */
export function RangeStats() {
  const { t, lang } = useStore();
  const [grain, setGrain] = useState<RangeGrain>("month");
  const [value, setValue] = useState(() => defaultValue("month"));
  const [stats, setStats] = useState<RangeStats | null>(null);
  const [pending, startTransition] = useTransition();

  // Reload whenever the period changes.
  useEffect(() => {
    const { from, to } = boundsFor(grain, value);
    startTransition(async () => {
      const res = await loadRangeStatsAction(from, to, grain);
      setStats(res);
    });
  }, [grain, value]);

  function pickGrain(next: RangeGrain) {
    setGrain(next);
    setValue(defaultValue(next));
  }

  const cards = [
    { key: "dash.revenue" as DictKey, value: formatPrice(stats?.revenue ?? 0, lang) },
    { key: "dash.ordersCount" as DictKey, value: String(stats?.orders ?? 0) },
    { key: "dash.avgOrder" as DictKey, value: formatPrice(stats?.avgOrder ?? 0, lang) },
    { key: "status.delivered" as DictKey, value: String(stats?.delivered ?? 0) },
  ];

  return (
    <section className="mb-5 rounded-2xl border border-line-2 bg-surface p-5 card-shadow">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-extrabold text-ink">{t("dash.periodStats")}</h2>

        <div className="ms-auto flex flex-wrap items-center gap-2">
          {/* Grain switch */}
          <div className="flex gap-1 rounded-xl border border-line p-1">
            {GRAINS.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => pickGrain(g.id)}
                aria-pressed={grain === g.id}
                className={`tap rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${
                  grain === g.id
                    ? "bg-brand text-white"
                    : "text-ink-2 hover:bg-surface-2 hover:text-brand"
                }`}
              >
                {t(g.key)}
              </button>
            ))}
          </div>

          {/* Period picker — type follows the grain */}
          {grain === "year" ? (
            <input
              type="number"
              min={2020}
              max={2100}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-label={t("dash.periodStats")}
              className="dash-input h-9 w-28"
            />
          ) : (
            <input
              type={grain === "day" ? "date" : "month"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-label={t("dash.periodStats")}
              className="dash-input h-9 w-auto"
            />
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className={`mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4 ${pending ? "opacity-60" : ""}`}>
        {cards.map((c) => (
          <div key={c.key} className="rounded-xl border border-line-2 bg-surface-2/40 p-3">
            <p className="text-[11px] font-semibold text-ink-3">{t(c.key)}</p>
            <p className="mt-1 text-lg font-black text-ink">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Series */}
      <div className={`mt-4 h-56 ${pending ? "opacity-60" : ""}`}>
        {stats && stats.series.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.series} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line-2)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "var(--ink-3)" }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--ink-3)" }}
                axisLine={false}
                tickLine={false}
                width={54}
              />
              <Tooltip
                cursor={{ fill: "color-mix(in srgb, var(--brand) 10%, transparent)" }}
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--line-2)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                formatter={(v) => formatPrice(Number(v ?? 0), lang)}
              />
              <Bar dataKey="value" fill="var(--brand)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="grid h-full place-items-center text-sm text-ink-3">{t("dash.empty")}</p>
        )}
      </div>
    </section>
  );
}
