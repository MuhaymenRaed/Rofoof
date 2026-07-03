import type { Badge } from "@/lib/products";
import type { DictKey } from "@/lib/i18n";

export const badgeMeta: Record<Badge, { key: DictKey; color: string }> = {
  bestseller: { key: "badge.bestseller", color: "#16a34a" },
  new: { key: "badge.new", color: "#e91e8c" },
  waterproof: { key: "badge.waterproof", color: "#0277bd" },
};

type CSSVars = React.CSSProperties & Record<string, string>;

export function ProductBadge({ label, color }: { label: string; color: string }) {
  const style: CSSVars = {
    color,
    background: `color-mix(in srgb, ${color} 13%, var(--surface))`,
    borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
  };
  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-wide"
      style={style}
    >
      {label}
    </span>
  );
}
