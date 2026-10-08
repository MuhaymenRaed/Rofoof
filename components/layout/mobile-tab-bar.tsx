"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useStore } from "@/components/providers/store-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { ProfileModal } from "@/components/layout/profile-modal";
import { Home, Grid, Heart, User, Sparkles } from "@/components/icons";
import type { DictKey } from "@/lib/i18n";

/**
 * App-style bottom navigation for phones (hidden ≥ md): Home, Store, the
 * custom-order button, Favorites, Account.
 *
 * The middle slot is raised out of the bar on purpose. Ordering a custom design
 * is the thing this shop does that a catalogue cannot, and it was previously
 * reachable only by scrolling to a card on the store page — the highest-value
 * action with the least prominent route to it. A lifted button is the one
 * position in a five-slot bar that reads as "this is not another tab".
 *
 * EVERYTHING HERE IS SIZED FOR A 320px SCREEN, which is five 64px columns.
 * That is the constraint that shapes the rest: the labels are one short word
 * and never wrap, the cells are a fixed height rather than growing to fit their
 * contents, and the raised circle is positioned against that fixed height so it
 * cannot push the label out of its own cell. An earlier version let the cell
 * size itself and the middle label collided with its neighbours.
 *
 * The basket is deliberately NOT here. It floats on every shopping page instead
 * (FloatingCart), which keeps it reachable while scrolling and frees this slot.
 */
export function MobileTabBar() {
  const { t, wishlist, openCustom } = useStore();
  const { user, ready } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  /** One tab cell. Fixed height, so every slot agrees on its baseline. */
  const tabClass = (active: boolean) =>
    `tap relative flex h-14 flex-col items-center justify-center gap-1 px-0.5 transition ${
      active ? "text-brand" : "text-ink-3 hover:text-ink-2"
    }`;

  /** Labels never wrap: at 320px a second line would eat the icon's row. */
  const labelClass = "w-full truncate text-center text-[9px] font-bold leading-none";

  const links: { href: string; key: DictKey; icon: React.ReactNode }[] = [
    { href: "/", key: "nav.home", icon: <Home size={20} /> },
    { href: "/store", key: "nav.store", icon: <Grid size={20} /> },
  ];

  return (
    <>
      <nav
        aria-label={t("aria.menu")}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line-2 bg-surface/95 backdrop-blur-xl md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="grid grid-cols-5">
          {links.map((tab) => {
            const active = isActive(tab.href);
            return (
              <Link key={tab.href} href={tab.href} className={tabClass(active)}>
                {/* Keyed on the tab so React remounts it as the route changes
                    and the underline draws itself in under the new tab. */}
                {active && (
                  <span
                    key={tab.href}
                    className="animate-draw-in absolute top-0 h-0.5 w-7 rounded-full bg-brand"
                  />
                )}
                {tab.icon}
                <span className={labelClass}>{t(tab.key)}</span>
              </Link>
            );
          })}

          {/* Custom order — the raised middle slot.
              The circle is absolutely positioned so it breaks out ABOVE the bar
              without making the bar taller, and the ring in the surface colour
              punches it out of the blurred strip instead of letting it sit on
              top. 44px at -14px clears the label by a comfortable margin inside
              the 56px cell; anything larger starts crowding its neighbours at
              320px. */}
          <button
            type="button"
            onClick={openCustom}
            aria-label={t("custom.title")}
            className="tap relative flex h-14 flex-col items-center justify-end pb-1.5 text-brand"
          >
            <span className="absolute -top-3.5 grid h-11 w-11 place-items-center rounded-full bg-brand text-white shadow-md ring-4 ring-surface transition hover:brightness-110">
              <Sparkles size={20} />
            </span>
            <span className={labelClass}>{t("nav.custom")}</span>
          </button>

          {/* Favorites */}
          <Link
            href="/favorites"
            data-tour="favorites"
            className={tabClass(isActive("/favorites"))}
          >
            {isActive("/favorites") && (
              <span className="animate-draw-in absolute top-0 h-0.5 w-7 rounded-full bg-brand" />
            )}
            <span className="relative">
              <Heart size={20} filled={isActive("/favorites")} />
              {wishlist.length > 0 && (
                <span
                  key={wishlist.length}
                  className="count-pop absolute -end-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[9px] font-bold text-white"
                >
                  {wishlist.length}
                </span>
              )}
            </span>
            <span className={labelClass}>{t("nav.favorites")}</span>
          </Link>

          {/* Account — profile modal when signed in, login otherwise */}
          <button
            type="button"
            onClick={() => {
              if (!ready) return;
              if (user) setProfileOpen(true);
              else router.push("/login");
            }}
            data-tour="profile"
            className={tabClass(isActive("/login"))}
          >
            {user ? (
              <span className="grid h-5 w-5 place-items-center rounded-full bg-brand text-[10px] font-black text-white">
                {(user.name?.[0] ?? "؟").toUpperCase()}
              </span>
            ) : (
              <User size={20} />
            )}
            <span className={labelClass}>{t("auth.account")}</span>
          </button>
        </div>
      </nav>

      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  );
}
