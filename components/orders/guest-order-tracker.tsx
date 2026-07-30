"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useStore } from "@/components/providers/store-provider";
import { OrderCard } from "@/components/orders/order-card";
import { CancelDialog } from "@/components/orders/cancel-dialog";
import { Search, Package, ChevronEnd, Check } from "@/components/icons";
import { trackOrderAction, cancelGuestOrderAction } from "@/lib/actions/orders";
import { sanitizePhoneInput } from "@/lib/contact";
import type { Order } from "@/lib/products";

/**
 * The guest /orders experience: guests have no account, so instead of an order
 * history they look one order up by its Order ID + the phone used on it. The
 * phone is a required second factor (see track_order()) so a guessable code
 * alone can't expose anyone else's order — and it doubles as the ownership
 * proof that lets them cancel it while it's still in review. Signed-in users
 * never see this — the page renders their history directly.
 */
export function GuestOrderTracker() {
  const { t } = useStore();
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [pending, startTransition] = useTransition();

  const canTrack = code.trim().length >= 3 && phone.trim().length >= 4;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canTrack || pending) return;
    setNotFound(false);
    startTransition(async () => {
      const res = await trackOrderAction({ code: code.trim(), phone: phone.trim() });
      if (res.ok) {
        setOrder(res.order);
      } else {
        setOrder(null);
        setNotFound(true);
      }
    });
  }

  // Re-fetch after a failed cancel (e.g. the order just got accepted) so the
  // shown status — and the cancel button's visibility — stay accurate.
  function refetch() {
    startTransition(async () => {
      const res = await trackOrderAction({ code: code.trim(), phone: phone.trim() });
      if (res.ok) setOrder(res.order);
      else setOrder(null);
    });
  }

  function reset() {
    setOrder(null);
    setNotFound(false);
    setCancelled(false);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <header className="mb-7">
        <h1 className="flex items-center gap-2.5 text-2xl font-black text-ink">
          <span className="h-6 w-1.5 rounded-full bg-brand" />
          {t("orders.trackTitle")}
        </h1>
        <p className="mt-2 text-sm text-ink-2">{t("orders.trackSubtitle")}</p>
      </header>

      {cancelled ? (
        <div className="grid place-items-center rounded-2xl border border-line-2 bg-surface p-8 text-center card-shadow">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-500">
            <Check size={28} />
          </div>
          <p className="mt-4 text-lg font-black text-ink">{t("orders.trackCancelledTitle")}</p>
          <p className="mt-1 max-w-xs text-sm text-ink-3">{t("orders.trackCancelledHint")}</p>
          <button
            type="button"
            onClick={reset}
            className="tap mt-5 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
          >
            {t("orders.trackAnother")}
          </button>
        </div>
      ) : order ? (
        <div className="space-y-5">
          <OrderCard order={order} onCancel={() => setConfirming(true)} />
          <button
            type="button"
            onClick={reset}
            className="tap mx-auto flex items-center gap-1.5 text-sm font-bold text-ink-3 transition hover:text-brand"
          >
            <span className="ltr:rotate-180">
              <ChevronEnd size={15} />
            </span>
            {t("orders.trackAnother")}
          </button>
        </div>
      ) : (
        <form
          onSubmit={submit}
          className="rounded-2xl border border-line-2 bg-surface p-6 card-shadow"
        >
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-soft text-brand">
            <Package size={26} />
          </div>

          <label className="mb-3 block">
            <span className="mb-1.5 block text-xs font-bold text-ink-2">
              {t("orders.trackCodeLabel")}
            </span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t("orders.trackCodePlaceholder")}
              aria-label={t("orders.trackCodeLabel")}
              dir="ltr"
              className="dash-input text-start"
              required
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-ink-2">
              {t("orders.trackPhoneLabel")}
            </span>
            <input
              value={phone}
              onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
              inputMode="tel"
              dir="ltr"
              aria-label={t("orders.trackPhoneLabel")}
              className="dash-input text-start"
              required
            />
          </label>
          <p className="mt-1.5 text-[11px] text-ink-3">{t("orders.trackPhoneHint")}</p>

          {notFound && (
            <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500">
              {t("orders.trackNotFound")}
            </p>
          )}

          <button
            type="submit"
            disabled={pending || !canTrack}
            className="tap mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-5 py-3.5 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Search size={17} />
            {pending ? t("orders.trackingLoad") : t("orders.trackButton")}
          </button>
        </form>
      )}

      {/* Gentle nudge — never a wall */}
      {!cancelled && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line-2 bg-surface-2/40 px-5 py-3.5">
          <p className="text-xs font-semibold text-ink-2">{t("orders.guestSignInPrompt")}</p>
          <Link
            href="/login?next=/orders"
            className="tap shrink-0 rounded-xl border border-brand/40 bg-brand-soft px-4 py-2 text-xs font-bold text-brand transition hover:bg-brand hover:text-white"
          >
            {t("auth.login")}
          </Link>
        </div>
      )}

      {order && confirming && (
        <CancelDialog
          order={order}
          cancel={() => cancelGuestOrderAction({ code: order.code, phone: phone.trim() })}
          onClose={() => setConfirming(false)}
          onRemoved={() => {
            setOrder(null);
            setCancelled(true);
          }}
          onFailed={refetch}
        />
      )}
    </div>
  );
}
