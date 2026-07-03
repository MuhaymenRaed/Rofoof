"use client";

import { useStore } from "@/components/providers/store-provider";
import { StatusPill } from "@/components/ui/status-pill";
import { Phone } from "@/components/icons";
import { usePaginatedList } from "@/lib/hooks/use-paginated-list";
import { loadMoreCustomersAction } from "@/lib/actions/dashboard";
import type { DashboardCustomer } from "@/lib/data/dashboard";

const PALETTE = ["#0ea5a4", "#8b5cf6", "#f59e0b", "#22c55e", "#e8321a", "#0284c7", "#e91e8c", "#16a34a"];

export function CustomersView({
  initialCustomers,
  initialHasMore,
}: {
  initialCustomers: DashboardCustomer[];
  initialHasMore: boolean;
}) {
  const { t } = useStore();
  const {
    items: customers,
    hasMore,
    sentinelRef,
  } = usePaginatedList(initialCustomers, initialHasMore, async (offset) => {
    const page = await loadMoreCustomersAction(offset);
    return { items: page.customers, hasMore: page.hasMore };
  });

  return (
    <section className="rounded-2xl border border-line-2 bg-surface card-shadow">
      <h2 className="border-b border-line-2 p-5 text-sm font-extrabold text-ink">
        {t("dash.customers")}
      </h2>

      {customers.length === 0 ? (
        <p className="p-8 text-center text-sm text-ink-3">{t("dash.empty")}</p>
      ) : (
        <ul className="divide-y divide-line-2">
          {customers.map((c, i) => (
            <li key={c.id} className="flex items-center gap-3 p-4 sm:px-5">
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-black text-white"
                style={{ background: PALETTE[i % PALETTE.length] }}
              >
                {c.name[0]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-ink">{c.name}</p>
                {c.address && <p className="truncate text-[11px] text-ink-3">{c.address}</p>}
                <p dir="ltr" className="truncate text-end text-[11px] text-ink-3 sm:hidden">
                  {c.phone}
                </p>
              </div>
              <span dir="ltr" className="hidden text-xs font-semibold text-ink-2 md:block">
                {c.phone}
              </span>
              <span className="hidden sm:block">
                <StatusPill status={c.status} />
              </span>
              <a
                href={`tel:${c.phone.replace(/\s/g, "")}`}
                aria-label={t("dash.call")}
                className="tap inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs font-bold text-ink-2 transition hover:border-brand hover:bg-brand-soft hover:text-brand"
              >
                <Phone size={15} />
                <span className="hidden sm:inline">{t("dash.call")}</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      <div ref={sentinelRef} className="p-4 text-center text-xs font-semibold text-ink-3">
        {customers.length > 0 && (hasMore ? t("dash.loadingMore") : t("dash.allLoaded"))}
      </div>
    </section>
  );
}
