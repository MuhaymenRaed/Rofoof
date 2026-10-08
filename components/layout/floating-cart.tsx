"use client";

import { usePathname } from "next/navigation";
import { useStore } from "@/components/providers/store-provider";
import { Bag } from "@/components/icons";

/**
 * Routes with no basket in them, so no basket button.
 *
 * The dashboard is the one that matters: it is a work screen, not a shop, and a
 * brand-red circle floating over the inventory list is noise on every single
 * page of it. The auth screens are the same argument — there is nothing to buy
 * mid-login, and the button would sit on top of the form on a short viewport.
 *
 * Prefix match, so nested routes (`/dashboard/orders`, `/auth/reset`) are
 * covered without listing them.
 */
const HIDDEN_PREFIXES = ["/dashboard", "/login", "/forgot-password", "/auth"];

/**
 * The basket, as a floating button on the shopping pages.
 *
 * It used to sit in two places that each hid it exactly when it mattered: a
 * 36px icon in the desktop header, which scrolls away, and a fifth of the phone
 * tab bar, where it competed with Home and Store for the same glance. One
 * persistent control instead — always in the same corner, never scrolled past,
 * and big enough to hit with a thumb.
 *
 * It carries the tour's cart anchor (`data-tour="cart"`), which the header and
 * the tab bar used to share between them.
 *
 * Sits above the phone tab bar and clear of the home indicator; `.floating-cart`
 * in globals.css does that arithmetic, including the safe-area inset.
 */
export function FloatingCart() {
  const { t, cartCount, openCart } = useStore();
  const pathname = usePathname();

  if (HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={openCart}
      aria-label={t("aria.cart")}
      id="tour-cart-icon"
      data-tour="cart"
      className="floating-cart tap grid h-12 w-12 place-items-center rounded-full bg-brand text-white transition hover:brightness-110"
    >
      <Bag size={19} />
      {cartCount > 0 && (
        <span
          // Keyed on the number so a new key remounts the badge and replays the
          // bounce — the basket visibly reacts even with the drawer closed.
          key={cartCount}
          className="count-pop absolute -end-1 -top-1 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-ink px-1 text-[10px] font-black text-surface"
        >
          {cartCount}
        </span>
      )}
    </button>
  );
}
