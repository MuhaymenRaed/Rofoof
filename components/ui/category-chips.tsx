"use client";

import Link from "next/link";
import { useStore } from "@/components/providers/store-provider";
import { CategoryIcon } from "@/components/ui/category-icon";

interface Props {
  /** Render as links to the store (home page) */
  asLinks?: boolean;
  active?: string;
  onSelect?: (code: string) => void;
}

/** Category chips driven by the DB `categories` table (admin can add more). */
export function CategoryChips({ asLinks, active, onSelect }: Props) {
  const { t, lang, categories } = useStore();

  const chips = [
    { code: "all", label: t("cat.all"), icon: "grid" },
    ...categories.map((c) => ({
      code: c.code,
      label: lang === "ar" ? c.nameAr : c.nameEn,
      icon: c.icon,
    })),
  ];

  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
      {chips.map((c) => {
        const isActive = active === c.code;
        const className = `tap inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
          isActive
            ? "border-brand bg-brand-soft text-brand"
            : "border-line bg-surface text-ink-2 hover:border-brand hover:bg-brand-soft hover:text-brand"
        }`;
        const inner = (
          <>
            <CategoryIcon name={c.icon} size={15} />
            {c.label}
          </>
        );

        if (asLinks) {
          return (
            <Link
              key={c.code}
              href={c.code === "all" ? "/store" : `/store?cat=${encodeURIComponent(c.code)}`}
              className={className}
            >
              {inner}
            </Link>
          );
        }

        return (
          <button key={c.code} type="button" onClick={() => onSelect?.(c.code)} className={className}>
            {inner}
          </button>
        );
      })}
    </div>
  );
}
