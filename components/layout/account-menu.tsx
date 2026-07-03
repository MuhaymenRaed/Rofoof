"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/components/providers/store-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { ProfileModal } from "@/components/layout/profile-modal";

export function AccountMenu() {
  const { t } = useStore();
  const { user, ready } = useAuth();
  const [open, setOpen] = useState(false);

  // Avoid hydration flicker before the session resolves.
  if (!ready) return <span className="h-9 w-9" aria-hidden />;

  if (!user) {
    return (
      <Link
        href="/login"
        className="tap rounded-full border border-line bg-surface-2 px-3.5 py-1.5 text-[11px] font-bold text-ink-2 transition hover:border-brand hover:bg-brand-soft hover:text-brand"
      >
        {t("auth.login")}
      </Link>
    );
  }

  const initial = (user.name?.[0] ?? "؟").toUpperCase();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("profile.title")}
        className="tap grid h-9 w-9 place-items-center rounded-full bg-brand text-sm font-black text-white ring-2 ring-transparent transition hover:ring-brand-line"
      >
        {initial}
      </button>
      <ProfileModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
