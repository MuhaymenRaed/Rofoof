"use client";

import Link from "next/link";
import { useStore } from "@/components/providers/store-provider";
import { Heart, Zap, Package, User, Cart, ChevronEnd } from "@/components/icons";

// Each perk gets its own semantic icon + soft colored chip, so the checklist
// reads as a polished feature list (color-mix with --surface adapts to theme).
const BENEFITS = [
  { icon: Heart, key: "guest.benefitWishlist", color: "#e8467c" }, // rose
  { icon: Zap, key: "guest.benefitAutofill", color: "#f59e0b" }, // amber
  { icon: Package, key: "guest.benefitOrders", color: "#0ea5e9" }, // sky
  { icon: User, key: "guest.benefitProfile", color: "#8b5cf6" }, // violet
  { icon: Cart, key: "guest.benefitFaster", color: "#10b981" }, // emerald
] as const;

/**
 * Shown at the top of checkout for guests: explains what an account unlocks
 * without ever blocking the sale. "Continue as guest" is the primary, low-
 * friction path; signing in is a clearly optional secondary action.
 */
export function GuestBenefitsCard({ onContinue }: { onContinue: () => void }) {
  const { t } = useStore();

  return (
    <div className="rounded-2xl border border-brand/25 bg-brand-soft/50 p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand text-white">
          <User size={18} />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-black leading-tight text-ink">{t("guest.title")}</h3>
          <p className="mt-0.5 text-[12px] leading-snug text-ink-2">{t("guest.subtitle")}</p>
        </div>
      </div>

      <ul className="mt-3 grid gap-1.5">
        {BENEFITS.map(({ icon: Icon, key, color }) => (
          <li key={key} className="flex items-center gap-2.5 text-[12px] font-semibold text-ink-2">
            <span
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
              style={{ color, background: `color-mix(in srgb, ${color} 14%, var(--surface))` }}
            >
              <Icon size={14} />
            </span>
            {t(key)}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onContinue}
          className="tap flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-[13px] font-bold text-white transition hover:opacity-90"
        >
          {t("guest.continueAsGuest")}
          <span className="rtl:rotate-180">
            <ChevronEnd size={15} />
          </span>
        </button>
        <Link
          href="/login?next=/"
          className="tap flex flex-1 items-center justify-center rounded-xl border border-brand/40 bg-surface px-4 py-2.5 text-[13px] font-bold text-brand transition hover:bg-brand-soft"
        >
          {t("guest.signIn")}
        </Link>
      </div>
    </div>
  );
}
