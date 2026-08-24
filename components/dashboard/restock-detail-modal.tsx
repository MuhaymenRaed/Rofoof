"use client";

import { useEffect, useState, useTransition } from "react";
import { useStore } from "@/components/providers/store-provider";
import { RetryImage } from "@/components/ui/retry-image";
import { X } from "@/components/icons";
import {
  getRestockItemDetailAction,
  applyRestockAction,
  dismissRestockAction,
  setRestockBlacklistAction,
} from "@/lib/actions/restock";
import type { RestockItemDetail } from "@/lib/data/restock";
import type { ProductKind } from "@/lib/products";
import type { DictKey } from "@/lib/i18n";

const KIND_LABEL: Record<ProductKind, DictKey> = {
  standard: "dash.kind.standard",
  package: "dash.kind.package",
  tiered: "dash.kind.tiered",
};

export function RestockDetailModal({
  productId,
  itemId,
  onClose,
  onResolved,
}: {
  productId: string;
  itemId: string | null;
  onClose: () => void;
  onResolved: () => void;
}) {
  const { t, lang, categoryLabel } = useStore();
  const [detail, setDetail] = useState<RestockItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [customQty, setCustomQty] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    // productId/itemId are fixed for this component's lifetime — the parent
    // unmounts and remounts it fresh for a different row rather than swapping
    // props in place — so this runs exactly once and `loading`'s initial
    // `true` already covers it; no need to set it again here.
    let active = true;
    getRestockItemDetailAction(productId, itemId).then((d) => {
      if (!active) return;
      setDetail(d);
      setCustomQty(Math.max(1, d?.soldSinceRestock || 1));
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [productId, itemId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Same contract as the row's: on failure the modal stays open and says why. */
  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        onResolved();
        return;
      }
      setError(
        res.error === "migration" ? t("restock.needsMigration") : t("restock.actionFailed"),
      );
    });
  }

  function restock(qty: number) {
    run(() => applyRestockAction({ productId, itemId, qty }));
  }

  /** Leave the shelf alone; the row comes back by itself on the next sale. */
  function discard() {
    run(() => dismissRestockAction({ productId, itemId }));
  }

  function blacklist() {
    if (!window.confirm(t("restock.blacklistConfirm"))) return;
    run(() => setRestockBlacklistAction({ productId, itemId, blacklisted: true }));
  }

  const name = detail ? (lang === "ar" ? detail.nameAr : detail.nameEn) : "";
  const itemName =
    detail?.itemId != null
      ? lang === "ar"
        ? detail.itemNameAr || detail.nameAr
        : detail.itemNameEn || detail.nameEn
      : null;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-[3px]"
        style={{ animation: "fade-in 0.2s ease both" }}
      />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-md animate-pop flex-col overflow-hidden rounded-3xl border border-line-2 bg-surface shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-line-2 px-6 py-4">
          <h2 className="min-w-0 truncate text-base font-black text-ink">
            {itemName ? `${name} — ${itemName}` : name || t("restock.viewDetails")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("aria.close")}
            className="tap grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-2 transition hover:bg-surface-2"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {loading ? (
            <p className="py-10 text-center text-xs font-semibold text-ink-3">{t("dash.loadingMore")}</p>
          ) : !detail ? (
            // Distinct from the loading line: a lookup that came back empty
            // used to sit on "loading…" for ever, which reads as a hung modal
            // rather than a failed read.
            <p className="py-10 text-center text-xs font-bold text-red-500">
              {t("restock.loadFailed")}
            </p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-surface-2">
                  {detail.imageUrl && (
                    <RetryImage
                      src={detail.imageUrl}
                      alt={itemName ?? name}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  )}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-ink-3">
                    {categoryLabel(detail.categoryCode)}
                  </span>
                  <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-ink-3">
                    {t(KIND_LABEL[detail.kind])}
                  </span>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-3">
                <Stat label={t("dash.fieldStock")} value={String(detail.stock)} />
                <Stat
                  label={t("restock.soldSince")}
                  value={String(detail.soldSinceRestock)}
                  emphasis
                />
                <Stat label={t("restock.lifetimeSold")} value={String(detail.lifetimeSold)} />
                <Stat label={t("dash.ordersCount")} value={String(detail.ordersCount)} />
              </dl>

              <div className="rounded-xl border border-line-2 p-3">
                <p className="text-[11px] font-bold text-ink-2">{t("restock.lastRestocked")}</p>
                <p className="mt-0.5 text-[12px] font-bold text-ink">
                  {detail.restockedAt
                    ? `${detail.restockedAt.slice(0, 10)} · +${detail.lastRestockedQty ?? 0}`
                    : t("restock.neverRestocked")}
                </p>
                {detail.dismissedAt && (
                  <p className="mt-1.5 text-[11px] font-bold text-ink-3">
                    {t("restock.discardedOn")} {detail.dismissedAt.slice(0, 10)}
                  </p>
                )}
                {/* The line that reconciles the two numbers above it: lifetime
                    sold counts every sale ever, while "sold since restock"
                    starts here. Without it the pair just looks wrong. */}
                {detail.trackingStartedAt && (
                  <p className="mt-1 text-[11px] text-ink-3">
                    {t("restock.trackingSince")} {detail.trackingStartedAt.slice(0, 10)}
                  </p>
                )}
              </div>

              <div>
                <p className="mb-1.5 text-[11px] font-bold text-ink-2">{t("restock.recentOrders")}</p>
                {detail.recentOrders.length === 0 ? (
                  <p className="text-[11px] text-ink-3">{t("dash.customerNoOrders")}</p>
                ) : (
                  <ul className="space-y-1">
                    {detail.recentOrders.map((o) => (
                      <li
                        key={o.code}
                        className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-1.5 text-[11px]"
                      >
                        <span dir="ltr" className="font-bold text-ink">
                          {o.code}
                        </span>
                        <span className="text-ink-3">{o.createdAt.slice(0, 10)}</span>
                        <span className="font-black text-brand">×{o.qty}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-line-2 pt-4">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={customQty}
                  onChange={(e) => setCustomQty(Math.max(1, Math.trunc(Number(e.target.value)) || 1))}
                  aria-label={t("restock.customAmount")}
                  className="dash-input h-10 w-24 px-2 text-center text-sm"
                />
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => restock(customQty)}
                  className="tap flex-1 rounded-xl bg-brand px-4 py-2.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {t("restock.addToStock")}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={discard}
                  title={t("restock.discardHint")}
                  className="tap rounded-xl border border-line px-4 py-2.5 text-xs font-bold text-ink-2 transition hover:border-brand hover:text-brand disabled:opacity-50"
                >
                  {t("restock.discard")}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={blacklist}
                  className="tap rounded-xl border border-line px-4 py-2.5 text-xs font-bold text-ink-2 transition hover:border-red-500 hover:text-red-500 disabled:opacity-50"
                >
                  {t("restock.blacklist")}
                </button>
                {error && (
                  <p className="w-full text-[11px] font-bold text-red-500">{error}</p>
                )}
              </div>
              <p className="text-[11px] text-ink-3">{t("restock.discardHint")}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="rounded-xl border border-line-2 p-3">
      <dt className="text-[10px] font-bold text-ink-3">{label}</dt>
      <dd className={`mt-0.5 text-base font-black ${emphasis ? "text-brand" : "text-ink"}`}>{value}</dd>
    </div>
  );
}
