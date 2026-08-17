"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useStore } from "@/components/providers/store-provider";
import { Sun, Moon } from "@/components/icons";
import { runThemeBurst } from "@/lib/theme-burst";

export function ThemeToggle() {
  const { t } = useStore();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // Hydration guard: theme is only known on the client (avoids SSR mismatch).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  /**
   * Gated on `mounted`, and that gate has to cover EVERYTHING rendered from the
   * theme — attributes included.
   *
   * next-themes reads localStorage in a useState initializer, so `resolvedTheme`
   * is undefined while the page is rendered on the server but already "dark" on
   * the client's very first render. The icon and the label were guarded; the
   * aria-label was not, so for anyone browsing in dark mode the server sent
   * aria-label="الوضع الداكن" and the client hydrated "الوضع الفاتح". React
   * treats a single mismatched attribute as a failed hydration and throws out
   * the whole tree to re-render it on the client (minified error #418).
   */
  const isDark = mounted && resolvedTheme === "dark";

  /**
   * The new theme is revealed through a star expanding from the point that was
   * pressed, so the coordinates come off the event rather than from the
   * button's box — a keyboard activation reports (0, 0) for both, which is why
   * that case falls back to the button's own centre instead of the corner.
   */
  function toggle(e: React.MouseEvent<HTMLButtonElement>) {
    const next = resolvedTheme === "dark" ? "light" : "dark";
    let { clientX: x, clientY: y } = e;
    if (x === 0 && y === 0) {
      const r = e.currentTarget.getBoundingClientRect();
      x = r.left + r.width / 2;
      y = r.top + r.height / 2;
    }
    // Not awaited: the theme is applied inside, and the button has nothing
    // further to do once the sweep is under way.
    void runThemeBurst({
      x,
      y,
      // ThemeProvider is configured with attribute="class", so next-themes puts
      // the theme's own name on <html> — that is the class to wait for.
      nextClass: next,
      apply: () => setTheme(next),
    });
  }

  return (
    <button
      type="button"
      // The click reads the live theme, not the gated one: gating is only about
      // what gets rendered, and by the time anyone can click, mount has happened.
      onClick={toggle}
      aria-label={isDark ? t("toggle.light") : t("toggle.dark")}
      className="tap flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-ink-2 transition hover:border-brand hover:bg-brand-soft hover:text-brand"
    >
      {/* Render icon only after mount to avoid hydration mismatch */}
      {mounted ? (
        isDark ? (
          <Sun size={14} />
        ) : (
          <Moon size={14} />
        )
      ) : (
        <span className="h-3.5 w-3.5" />
      )}
      <span className="hidden sm:inline">{isDark ? t("toggle.light") : t("toggle.dark")}</span>
    </button>
  );
}
