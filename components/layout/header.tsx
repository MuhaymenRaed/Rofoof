"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useStore } from "@/components/providers/store-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { AccountMenu } from "@/components/layout/account-menu";
import { Search, Heart, Bag, Menu, X, Globe, Grid } from "@/components/icons";
import type { DictKey } from "@/lib/i18n";

const NAV: { href: string; key: DictKey }[] = [
  { href: "/", key: "nav.home" },
  { href: "/store", key: "nav.store" },
  { href: "/orders", key: "nav.orders" },
  { href: "/favorites", key: "nav.favorites" },
];

export function Header() {
  const { t, toggleLang, cartCount, wishlist, openCart } = useStore();
  const { isAdmin, ready } = useAuth();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-30 border-b border-line-2 bg-surface/85 backdrop-blur-xl">
      <div className="mx-auto flex h-15 max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        {/* Logo — mascot mark + wordmark that follows the selected language */}
        <Link href="/" className="tap flex shrink-0 items-center gap-2">
          <Image
            src="/logo.png"
            alt=""
            width={34}
            height={34}
            priority
            className="h-8 w-8 shrink-0 object-contain"
          />
          <span className="text-xl font-black text-brand">{t("brand.name")}</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden flex-1 items-center justify-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`tap rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition ${
                isActive(item.href)
                  ? "bg-brand-soft text-brand"
                  : "text-ink-2 hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {t(item.key)}
            </Link>
          ))}
          {ready && isAdmin && (
            <Link
              href="/dashboard"
              className={`tap inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition ${
                isActive("/dashboard")
                  ? "bg-brand-soft text-brand"
                  : "text-ink-2 hover:bg-surface-2 hover:text-ink"
              }`}
            >
              <Grid size={15} />
              {t("nav.dashboard")}
            </Link>
          )}
        </nav>

        {/* Right cluster */}
        <div className="ms-auto flex items-center gap-1 md:ms-0">
          {/* Language — always visible; on phones the tab bar frees the space */}
          <button
            type="button"
            onClick={toggleLang}
            className="tap flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-ink-2 transition hover:border-brand hover:bg-brand-soft hover:text-brand"
          >
            <Globe size={13} />
            {t("toggle.lang")}
          </button>

          {/* Theme */}
          <ThemeToggle />

          {/* Desktop-only cluster — on phones these live in the bottom tab bar */}
          <Link
            href="/store"
            aria-label={t("aria.search")}
            className="tap hidden h-9 w-9 place-items-center rounded-lg text-ink-2 transition hover:bg-surface-2 hover:text-ink md:grid"
          >
            <Search size={18} />
          </Link>

          <Link
            href="/favorites"
            aria-label={t("aria.favorites")}
            className="tap relative hidden h-9 w-9 place-items-center rounded-lg text-ink-2 transition hover:bg-surface-2 hover:text-ink md:grid"
          >
            <Heart size={18} filled={isActive("/favorites")} />
            {wishlist.length > 0 && (
              <span className="absolute end-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[9px] font-bold text-white">
                {wishlist.length}
              </span>
            )}
          </Link>

          <button
            type="button"
            onClick={openCart}
            aria-label={t("aria.cart")}
            className="tap relative hidden h-9 w-9 place-items-center rounded-lg text-ink-2 transition hover:bg-surface-2 hover:text-ink md:grid"
          >
            <Bag size={18} />
            {cartCount > 0 && (
              <span
                key={cartCount}
                className="absolute end-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[9px] font-bold text-white"
                style={{ animation: "badge-bounce 0.3s ease both" }}
              >
                {cartCount}
              </span>
            )}
          </button>

          {/* Account */}
          <div className="ms-1 hidden md:block">
            <AccountMenu />
          </div>

          {/* Mobile menu toggle */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={t("aria.menu")}
            aria-expanded={menuOpen}
            className="tap grid h-9 w-9 place-items-center rounded-lg text-ink-2 transition hover:bg-surface-2 hover:text-ink md:hidden"
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      {menuOpen && (
        <nav className="border-t border-line-2 bg-surface px-4 py-2 md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className={`tap block rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                isActive(item.href) ? "bg-brand-soft text-brand" : "text-ink-2 hover:bg-surface-2"
              }`}
            >
              {t(item.key)}
            </Link>
          ))}
          {ready && isAdmin && (
            <Link
              href="/dashboard"
              onClick={() => setMenuOpen(false)}
              className={`tap flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                isActive("/dashboard") ? "bg-brand-soft text-brand" : "text-ink-2 hover:bg-surface-2"
              }`}
            >
              <Grid size={16} />
              {t("nav.dashboard")}
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              toggleLang();
              setMenuOpen(false);
            }}
            className="tap mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-ink-2 transition hover:bg-surface-2"
          >
            <Globe size={16} />
            {t("toggle.lang")}
          </button>
        </nav>
      )}
    </header>
  );
}
