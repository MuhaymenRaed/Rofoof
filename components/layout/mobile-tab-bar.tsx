"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useStore } from "@/components/providers/store-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { ProfileModal } from "@/components/layout/profile-modal";
import { Home, Grid, Bag, Heart, User } from "@/components/icons";
import type { DictKey } from "@/lib/i18n";

/**
 * App-style bottom navigation for phones (hidden ≥ md). Fixed, blurred,
 * safe-area aware — gives the storefront a native-app feel: Home, Store,
 * Cart (drawer + badge), Favorites, and Account (profile modal / login).
 */
export function MobileTabBar() {
  const { t, cartCount, wishlist, openCart } = useStore();
  const { user, ready } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const tabClass = (active: boolean) =>
    `tap relative flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-bold transition ${
      active ? "text-brand" : "text-ink-3 hover:text-ink-2"
    }`;

  const links: { href: string; key: DictKey; icon: React.ReactNode; badge?: number }[] = [
    { href: "/", key: "nav.home", icon: <Home size={21} /> },
    { href: "/store", key: "nav.store", icon: <Grid size={21} /> },
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
                {active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-brand" />}
                {tab.icon}
                {t(tab.key)}
              </Link>
            );
          })}

          {/* Cart — opens the drawer */}
          <button type="button" onClick={openCart} className={tabClass(false)}>
            <span className="relative">
              <Bag size={21} />
              {cartCount > 0 && (
                <span className="absolute -end-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[9px] font-bold text-white">
                  {cartCount}
                </span>
              )}
            </span>
            {t("aria.cart")}
          </button>

          {/* Favorites */}
          <Link href="/favorites" className={tabClass(isActive("/favorites"))}>
            {isActive("/favorites") && (
              <span className="absolute top-0 h-0.5 w-8 rounded-full bg-brand" />
            )}
            <span className="relative">
              <Heart size={21} filled={isActive("/favorites")} />
              {wishlist.length > 0 && (
                <span className="absolute -end-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[9px] font-bold text-white">
                  {wishlist.length}
                </span>
              )}
            </span>
            {t("nav.favorites")}
          </Link>

          {/* Account — profile modal when signed in, login otherwise */}
          <button
            type="button"
            onClick={() => {
              if (!ready) return;
              if (user) setProfileOpen(true);
              else router.push("/login");
            }}
            className={tabClass(isActive("/login"))}
          >
            {user ? (
              <span className="grid h-[21px] w-[21px] place-items-center rounded-full bg-brand text-[10px] font-black text-white">
                {(user.name?.[0] ?? "؟").toUpperCase()}
              </span>
            ) : (
              <User size={21} />
            )}
            {t("auth.account")}
          </button>
        </div>
      </nav>

      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  );
}
