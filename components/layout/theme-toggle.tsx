"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useStore } from "@/components/providers/store-provider";
import { Sun, Moon } from "@/components/icons";

export function ThemeToggle() {
  const { t } = useStore();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // Hydration guard: theme is only known on the client (avoids SSR mismatch).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
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
      <span className="hidden sm:inline">
        {mounted ? (isDark ? t("toggle.light") : t("toggle.dark")) : t("toggle.dark")}
      </span>
    </button>
  );
}
