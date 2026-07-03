"use client";

import { useStore } from "@/components/providers/store-provider";
import { statusStyle, type OrderStatus } from "@/lib/products";

export function StatusPill({ status }: { status: OrderStatus }) {
  const { t } = useStore();
  const meta = statusStyle[status];
  return (
    <span
      className="inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold"
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
