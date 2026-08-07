"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/providers/store-provider";
import { Star, Check } from "@/components/icons";
import { toggleProductInGroupAction } from "@/lib/actions/featured";

/**
 * Admin-only star on a product card. With several showcase rails on the home
 * page, one toggle isn't enough — tapping the star opens a compact picker of
 * every group so the product can be added to (or pulled from) any of them.
 *
 * The menu is portalled and fixed-positioned because the card itself clips
 * overflow; anchoring to the button's rect keeps it visually attached.
 */
export function FeaturedStarPicker({ productId }: { productId: string }) {
  const { t, lang, featuredGroups } = useStore();
  const router = useRouter();
  const buttonRef = useRef<HTMLButtonElement>(null);

  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const [memberOf, setMemberOf] = useState<Set<string>>(
    () => new Set(featuredGroups.filter((g) => g.productIds.includes(productId)).map((g) => g.id)),
  );
  const [, startTransition] = useTransition();

  // Re-seed when the server sends fresh groups (after a refresh/navigation).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setMemberOf(
      new Set(featuredGroups.filter((g) => g.productIds.includes(productId)).map((g) => g.id)),
    );
  }, [featuredGroups, productId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Nothing to pick from until the admin creates a rail in the dashboard.
  if (featuredGroups.length === 0) return null;

  const isFeatured = memberOf.size > 0;

  function openMenu(e: React.MouseEvent) {
    e.stopPropagation();
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setAnchor({ top: rect.bottom + 6, left: rect.left });
    setOpen((v) => !v);
  }

  function toggle(groupId: string) {
    const next = new Set(memberOf);
    const member = !next.has(groupId);
    if (member) next.add(groupId);
    else next.delete(groupId);
    setMemberOf(next); // optimistic

    startTransition(async () => {
      const res = await toggleProductInGroupAction(groupId, productId, member);
      if (!res.ok) {
        // revert
        setMemberOf((prev) => {
          const back = new Set(prev);
          if (member) back.delete(groupId);
          else back.add(groupId);
          return back;
        });
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={openMenu}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("product.feature")}
        // Opaque, no backdrop filter — one more per card is one more backdrop
        // the compositor re-blurs every scrolled frame. See the wishlist
        // toggle in product-card.tsx.
        className={`reveal-on-hover tap absolute top-20 start-2 grid h-8 w-8 place-items-center rounded-full border transition ${
          isFeatured
            ? "border-amber-400 bg-amber-400 text-white"
            : "border-line-2 bg-surface text-ink-2 hover:border-amber-400 hover:text-amber-500"
        }`}
      >
        <Star size={14} filled={isFeatured} />
      </button>

      {open &&
        anchor &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <button
              type="button"
              aria-hidden
              tabIndex={-1}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[60] cursor-default"
            />
            <div
              role="menu"
              style={{ top: anchor.top, left: anchor.left }}
              className="fixed z-[61] max-h-72 w-56 animate-pop overflow-y-auto rounded-xl border border-line-2 bg-surface p-1.5 shadow-2xl"
            >
              <p className="px-2 py-1.5 text-[10px] font-black uppercase tracking-wide text-ink-3">
                {t("dash.featuredGroups")}
              </p>
              {featuredGroups.map((g) => {
                const on = memberOf.has(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={on}
                    onClick={() => toggle(g.id)}
                    className={`tap flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-start text-xs font-bold transition ${
                      on ? "bg-amber-400 text-white" : "text-ink-2 hover:bg-surface-2 hover:text-brand"
                    }`}
                  >
                    <span className="truncate">{lang === "ar" ? g.nameAr : g.nameEn}</span>
                    {on && <Check size={14} className="shrink-0" />}
                  </button>
                );
              })}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
