"use client";

import { useStore } from "@/components/providers/store-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { Tag, Plus } from "@/components/icons";
import { MANUAL_ORDER_COLOR } from "@/lib/products";

type CSSVars = React.CSSProperties & Record<string, string>;

/**
 * Admin-only sibling of CustomOrderCard: starts a manual, hand-priced order for
 * something the catalogue doesn't cover. Same shape as the other grid cards so
 * the layout stays uniform, in the distinct manual-order colour so it reads as
 * an internal tool rather than something a shopper is being sold.
 *
 * Renders nothing at all for anyone but an admin — and nothing until auth has
 * resolved, so it can't flash into a customer's grid during hydration.
 */
export function ManualOrderCard() {
  const { t, openManual } = useStore();
  const { isAdmin, ready } = useAuth();
  const style: CSSVars = { "--c": MANUAL_ORDER_COLOR };

  if (!ready || !isAdmin) return null;

  return (
    <button
      type="button"
      onClick={openManual}
      style={style}
      className="tap group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border-2 border-dashed text-start transition duration-200 hover:-translate-y-1 hover:shadow-[0_10px_30px_-12px_color-mix(in_srgb,var(--c)_55%,transparent)]"
      aria-label={t("manual.title")}
    >
      <span
        className="pointer-events-none absolute inset-0"
        style={{ background: "color-mix(in srgb, var(--c) 7%, var(--surface))" }}
      />
      <span
        className="absolute inset-0 rounded-[var(--radius-card)]"
        style={{ borderColor: "var(--c)" }}
      />

      {/* Visual area — same aspect as product images */}
      <span className="relative grid aspect-square w-full place-items-center">
        <span
          className="grid h-16 w-16 place-items-center rounded-2xl text-white shadow-lg transition group-hover:scale-110"
          style={{ background: "var(--c)" }}
        >
          <Tag size={28} />
        </span>
        <span className="absolute bottom-3">
          <span
            className="rounded-full border bg-surface px-2.5 py-0.5 text-[10px] font-bold shadow-sm"
            style={{ borderColor: "color-mix(in srgb, var(--c) 30%, transparent)", color: "var(--c)" }}
          >
            {t("manual.adminOnly")}
          </span>
        </span>
      </span>

      {/* Body — same padding rhythm as ProductCard */}
      <span className="relative flex flex-1 flex-col p-3">
        <span className="line-clamp-1 text-[13px] font-bold text-ink">{t("manual.title")}</span>
        <span className="mt-0.5 line-clamp-1 text-[11px] text-ink-3">{t("manual.cardHint")}</span>
        <span className="mt-auto flex items-center justify-end pt-3">
          <span
            className="grid h-9 w-9 place-items-center rounded-lg text-white transition"
            style={{ background: "var(--c)" }}
          >
            <Plus size={16} />
          </span>
        </span>
      </span>
    </button>
  );
}
