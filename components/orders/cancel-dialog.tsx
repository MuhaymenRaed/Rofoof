"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/components/providers/store-provider";
import { Trash } from "@/components/icons";
import type { Order } from "@/lib/products";

/**
 * Shared cancel-confirmation dialog for both the signed-in order history and
 * the guest tracker. The caller supplies `cancel` — the actual server action to
 * run (cancelOrderAction for the owner, cancelGuestOrderAction for a guest) —
 * so the confirmation UX + optimistic removal live in one place.
 */
export function CancelDialog({
  order,
  cancel,
  onClose,
  onRemoved,
  onFailed,
}: {
  order: Order;
  cancel: () => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
  onRemoved: (code: string) => void;
  onFailed: () => void;
}) {
  const { t } = useStore();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function confirm() {
    setError(null);
    startTransition(async () => {
      const res = await cancel();
      if (!res.ok) {
        setError(t("orders.cancelError"));
        // The order likely just got accepted — resync so the button vanishes.
        if (res.error === "cannot_cancel") {
          onFailed();
          onClose();
        }
        return;
      }
      // Optimistically drop it from view; the server already deleted it.
      onRemoved(order.code);
      onClose();
    });
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center p-4">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-[3px]"
        style={{ animation: "fade-in 0.2s ease both" }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("orders.cancelTitle")}
        className="relative z-10 w-full max-w-sm animate-pop rounded-3xl border border-line-2 bg-surface p-6 text-center shadow-2xl"
      >
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-500/12 text-red-500">
          <Trash size={26} />
        </div>
        <h2 className="mt-4 text-lg font-black text-ink">{t("orders.cancelTitle")}</h2>
        <p className="mt-1.5 text-sm text-ink-3">{t("orders.cancelHint")}</p>
        <p dir="ltr" className="mt-3 text-sm font-black text-ink">
          {order.code}
        </p>

        {error && (
          <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="tap flex-1 rounded-2xl border border-line px-4 py-3 text-sm font-bold text-ink-2 transition hover:bg-surface-2 disabled:opacity-50"
          >
            {t("orders.cancelNo")}
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            className="tap flex-1 rounded-2xl bg-red-500 px-4 py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {pending ? t("orders.cancelling") : t("orders.cancelYes")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
