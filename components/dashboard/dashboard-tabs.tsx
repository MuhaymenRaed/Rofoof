"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/components/providers/store-provider";
import { BarsIcon } from "@/components/dashboard/dash-icons";
import { Bag, Package, Grid } from "@/components/icons";
import type { DictKey } from "@/lib/i18n";

const TABS: { href: string; key: DictKey; icon: React.ReactNode }[] = [
  { href: "/dashboard", key: "dash.overview", icon: <BarsIcon size={16} /> },
  { href: "/dashboard/orders", key: "dash.orders", icon: <Bag size={16} /> },
  { href: "/dashboard/inventory", key: "dash.inventory", icon: <Package size={16} /> },
  { href: "/dashboard/customers", key: "dash.customers", icon: <Grid size={16} /> },
];

export function DashboardTabs() {
  const { t } = useStore();
  const pathname = usePathname();

  return (
    <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-2xl border border-line-2 bg-surface-2/60 p-1.5">
      {TABS.map((tab) => {
        const active = tab.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`tap flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-bold transition ${
              active ? "bg-surface text-brand card-shadow" : "text-ink-2 hover:text-ink"
            }`}
          >
            {tab.icon}
            {t(tab.key)}
          </Link>
        );
      })}
    </div>
  );
}
