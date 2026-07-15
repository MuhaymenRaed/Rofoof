"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useStore } from "@/components/providers/store-provider";
import { StatusPill } from "@/components/ui/status-pill";
import { UsersIcon, TrendIcon, BarsIcon } from "@/components/dashboard/dash-icons";
import { Package, Bag, Star } from "@/components/icons";
import { formatPrice } from "@/lib/format";
import { statusStyle, type Order, type OrderStatus } from "@/lib/products";
import type { DashboardStats, WeeklyRevenuePoint } from "@/lib/data/dashboard";
import type { DictKey } from "@/lib/i18n";

type CSSVars = React.CSSProperties & Record<string, string>;

const ICONS = { package: Package, users: UsersIcon, bag: Bag, trend: TrendIcon } as const;

const STAT_META: {
  key: DictKey;
  color: string;
  icon: keyof typeof ICONS;
  field: keyof DashboardStats;
  money?: boolean;
  ratioOf?: keyof DashboardStats;
}[] = [
  { key: "dash.inStock", color: "#22c55e", icon: "package", field: "inStock", ratioOf: "totalProducts" },
  { key: "dash.newUsers", color: "#0ea5a4", icon: "users", field: "newUsers" },
  { key: "dash.activeOrders", color: "#8b5cf6", icon: "bag", field: "activeOrders" },
  { key: "dash.revenue", color: "#e8321a", icon: "trend", field: "revenue", money: true },
];

const MINI_META: { key: DictKey; field: keyof DashboardStats; money?: boolean; alert?: boolean }[] = [
  { key: "dash.totalOrders", field: "totalOrders" },
  { key: "dash.deliveredOrders", field: "deliveredOrders" },
  { key: "dash.avgOrder", field: "avgOrder", money: true },
  { key: "dash.revenue30d", field: "revenue30d", money: true },
  { key: "dash.totalCustomers", field: "totalCustomers" },
  { key: "dash.onDiscount", field: "onDiscount" },
  { key: "dash.lowStock", field: "lowStock", alert: true },
  { key: "dash.outOfStock", field: "outOfStock", alert: true },
];

export function OverviewView({
  stats,
  weekly,
  statusCounts,
  latest,
}: {
  stats: DashboardStats;
  weekly: WeeklyRevenuePoint[];
  statusCounts: Record<OrderStatus, number>;
  latest: Order[];
}) {
  const { t, lang } = useStore();
  const maxSold = Math.max(1, ...stats.topProducts.map((p) => p.sold));

  const pieData = (Object.keys(statusCounts) as OrderStatus[])
    .map((s) => ({
      name: t(statusStyle[s].key),
      value: statusCounts[s],
      color: statusStyle[s].color,
    }))
    .filter((d) => d.value > 0);

  const tooltipStyle: React.CSSProperties = {
    background: "var(--surface)",
    border: "1px solid var(--line)",
    borderRadius: 12,
    fontSize: 12,
    fontFamily: "inherit",
    color: "var(--ink)",
  };

  return (
    <div className="space-y-6">
      {/* Primary KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {STAT_META.map((s) => {
          const Icon = ICONS[s.icon];
          const style: CSSVars = { "--c": s.color };
          const raw = stats[s.field] as number;
          const value = s.money
            ? formatPrice(raw, lang)
            : s.ratioOf
              ? `${raw}/${stats[s.ratioOf] as number}`
              : String(raw);
          return (
            <div key={s.key} style={style} className="rounded-2xl border border-line-2 bg-surface p-4 card-shadow">
              <span
                className="grid h-10 w-10 place-items-center rounded-xl"
                style={{ background: "color-mix(in srgb, var(--c) 14%, var(--surface))", color: "var(--c)" }}
              >
                <Icon size={20} />
              </span>
              <div className="mt-3 text-2xl font-black" style={{ color: "var(--c)" }}>
                {value}
              </div>
              <div className="mt-0.5 text-xs font-semibold text-ink-3">{t(s.key)}</div>
            </div>
          );
        })}
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {MINI_META.map((s) => {
          const raw = stats[s.field] as number;
          const alerting = s.alert && raw > 0;
          return (
            <div
              key={s.key}
              className={`rounded-2xl border p-3.5 ${
                alerting ? "border-amber-500/40 bg-amber-500/8" : "border-line-2 bg-surface"
              }`}
            >
              <div className={`text-lg font-black ${alerting ? "text-amber-600" : "text-ink"}`}>
                {s.money ? formatPrice(raw, lang) : raw}
              </div>
              <div className="mt-0.5 text-[11px] font-semibold text-ink-3">{t(s.key)}</div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Weekly revenue — interactive area chart */}
        <section className="rounded-2xl border border-line-2 bg-surface p-5 card-shadow sm:p-6 lg:col-span-3">
          <h2 className="mb-5 flex items-center gap-2 text-sm font-extrabold text-ink">
            <BarsIcon size={17} className="text-brand" />
            {t("dash.weeklyRevenue")}
          </h2>
          {weekly.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-3">{t("dash.empty")}</p>
          ) : (
            <div className="h-56" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weekly} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#e8321a" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#e8321a" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line-2)" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 11, fill: "var(--ink-3)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "var(--ink-3)" }}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                    tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => [formatPrice(Number(value), lang), t("dash.revenue")]}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#e8321a"
                    strokeWidth={2.5}
                    fill="url(#rev)"
                    dot={{ r: 3, fill: "#e8321a", strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* Order status distribution — sales ratio at a glance */}
        <section className="rounded-2xl border border-line-2 bg-surface p-5 card-shadow sm:p-6 lg:col-span-2">
          <h2 className="mb-2 text-sm font-extrabold text-ink">{t("dash.statusDist")}</h2>
          {pieData.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-3">{t("dash.empty")}</p>
          ) : (
            <div className="h-56" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="55%"
                    outerRadius="80%"
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {pieData.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11, fontFamily: "inherit" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      {/* Top sellers */}
      <section className="rounded-2xl border border-line-2 bg-surface card-shadow">
        <h2 className="flex items-center gap-2 border-b border-line-2 p-5 text-sm font-extrabold text-ink">
          <Star size={16} filled className="text-amber-500" />
          {t("dash.topProducts")}
        </h2>
        {stats.topProducts.length === 0 ? (
          <p className="p-6 text-center text-sm text-ink-3">{t("dash.empty")}</p>
        ) : (
          <ul className="divide-y divide-line-2">
            {stats.topProducts.map((p, i) => (
              <li key={p.id || i} className="flex items-center gap-3 px-5 py-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-soft text-xs font-black text-brand">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-ink">
                    {lang === "ar" ? p.nameAr : p.nameEn}
                  </p>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-brand/80"
                      style={{ width: `${(p.sold / maxSold) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="shrink-0 text-end">
                  <p className="text-sm font-black text-ink">
                    {p.sold} <span className="text-[10px] font-semibold text-ink-3">{t("dash.sold")}</span>
                  </p>
                  <p className="text-[11px] font-bold text-brand">{formatPrice(p.revenue, lang)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Latest orders */}
      <section className="rounded-2xl border border-line-2 bg-surface card-shadow">
        <h2 className="border-b border-line-2 p-5 text-sm font-extrabold text-ink">
          {t("dash.latestOrders")}
        </h2>
        {latest.length === 0 ? (
          <p className="p-6 text-center text-sm text-ink-3">{t("dash.empty")}</p>
        ) : (
          <ul className="divide-y divide-line-2">
            {latest.map((o) => (
              <li key={o.code} className="flex items-center justify-between gap-3 p-4 sm:px-5">
                <span className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-surface-2 text-ink-2">
                    <Package size={17} />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-sm font-extrabold text-ink">{o.code}</span>
                    <span className="text-xs text-ink-3">{o.customer}</span>
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-sm font-black text-brand">{formatPrice(o.total, lang)}</span>
                  <StatusPill status={o.status} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
