"use client";

import { useStore } from "@/components/providers/store-provider";
import { Sparkles, Plus } from "@/components/icons";
import { formatPrice } from "@/lib/format";
import { CUSTOM_ORDER_COLOR, CUSTOM_TYPE_LABEL } from "@/lib/products";

type CSSVars = React.CSSProperties & Record<string, string>;

/**
 * The first card of the store grid — invites the buyer to send a custom
 * design request (brooch/sticker/poster). Mirrors ProductCard's shape so the
 * grid stays uniform, but wears the distinct custom-order color.
 */
export function CustomOrderCard() {
  const { t, lang, openCustom, customPricing } = useStore();
  const style: CSSVars = { "--c": CUSTOM_ORDER_COLOR };
  const lowest =
    customPricing.length > 0 ? Math.min(...customPricing.map((p) => p.unitPrice)) : 0;

  return (
    <button
      type="button"
      onClick={openCustom}
      style={style}
      className="tap group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border-2 border-dashed text-start transition duration-200 hover:-translate-y-1 hover:shadow-[0_10px_30px_-12px_color-mix(in_srgb,var(--c)_55%,transparent)]"
      aria-label={t("custom.title")}
    >
      <span
        className="pointer-events-none absolute inset-0"
        style={{ background: "color-mix(in srgb, var(--c) 7%, var(--surface))" }}
      />
      <span className="absolute inset-0 rounded-[var(--radius-card)]" style={{ borderColor: "var(--c)" }} />

      {/* Visual area — same aspect as product images */}
      <span className="relative grid aspect-square w-full place-items-center">
        <span
          className="grid h-16 w-16 place-items-center rounded-2xl text-white shadow-lg transition group-hover:scale-110"
          style={{ background: "var(--c)" }}
        >
          <Sparkles size={30} />
        </span>
        <span className="absolute bottom-3 flex gap-1.5">
          {(Object.keys(CUSTOM_TYPE_LABEL) as (keyof typeof CUSTOM_TYPE_LABEL)[]).map((k) => (
            <span
              key={k}
              className="rounded-full border bg-surface px-2.5 py-0.5 text-[10px] font-bold text-ink-2 shadow-sm"
              style={{ borderColor: "color-mix(in srgb, var(--c) 30%, transparent)" }}
            >
              {lang === "ar" ? CUSTOM_TYPE_LABEL[k].ar : CUSTOM_TYPE_LABEL[k].en}
            </span>
          ))}
        </span>
      </span>

      {/* Body — same padding rhythm as ProductCard */}
      <span className="relative flex flex-1 flex-col p-3">
        <span className="line-clamp-1 text-[13px] font-bold text-ink">{t("custom.title")}</span>
        <span className="mt-0.5 line-clamp-1 text-[11px] text-ink-3">{t("custom.cardHint")}</span>
        <span className="mt-auto flex items-center justify-between pt-3">
          <span className="text-sm font-extrabold" style={{ color: "var(--c)" }}>
            {lowest > 0 && (
              <>
                <span className="me-1 text-[10px] font-semibold text-ink-3">
                  {t("product.from")}
                </span>
                {formatPrice(lowest, lang)}
              </>
            )}
          </span>
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
