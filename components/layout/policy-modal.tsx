"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/components/providers/store-provider";
import { X, Truck } from "@/components/icons";

/**
 * Store policies (returns/exchange + shipping). Replaces the old footer FAQ.
 * The copy is authored in Arabic and shown verbatim regardless of UI language,
 * so it always renders RTL — the wording is legally exact and must not be
 * paraphrased by translation.
 */

const RETURN_TITLE = "الإرجاع والإستبدال:";
const RETURN_BODY =
  "في حال كان الطلب مغاير من ناحية نقص او تغيير (منتج مختلف) يتم تعويض المستخدم بإستبدال المنتج أو إرجاع ماله لقيمة الأمور الناقصة (دون حساب التوصيل لكونه يعود للشركة الخاصة بالتوصيل وليس رفوف)";
const SHIPPING_TITLE = "الشحن والتوصيل:";
const SHIPPING_LINES = [
  "يتم التوصيل خلال يومين",
  "التوصيل 5000 لكل محافظات العراق وكربلاء 3000",
  "احيانًا تتوفر خصومات على التوصيل على حسب قيمة الطلب او العروض",
];

export function PolicyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useStore();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const content = (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-[3px]"
        style={{ animation: "fade-in 0.2s ease both" }}
      />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-lg animate-pop flex-col overflow-hidden rounded-3xl border border-line-2 bg-surface shadow-2xl">
        {/* Header */}
        <div className="relative shrink-0 overflow-hidden bg-brand-soft px-6 pb-5 pt-6">
          <div className="pointer-events-none absolute -end-10 -top-16 h-40 w-40 rounded-full bg-brand/20 blur-2xl" />
          <button
            type="button"
            onClick={onClose}
            aria-label={t("aria.close")}
            className="tap absolute end-4 top-4 grid h-9 w-9 place-items-center rounded-lg text-ink-2 transition hover:bg-surface/60 hover:text-ink"
          >
            <X size={18} />
          </button>
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand text-white shadow-lg">
              <Truck size={20} />
            </span>
            <h2 className="text-lg font-black text-ink">{t("footer.policies")}</h2>
          </div>
        </div>

        {/* Body — Arabic copy shown verbatim (RTL) */}
        <div dir="rtl" className="flex-1 space-y-5 overflow-y-auto p-6 text-right">
          <section>
            <h3 className="mb-1.5 text-sm font-black text-brand">{RETURN_TITLE}</h3>
            <p className="text-[13.5px] leading-relaxed text-ink-2">{RETURN_BODY}</p>
          </section>
          <div className="h-px bg-line-2" />
          <section>
            <h3 className="mb-1.5 text-sm font-black text-brand">{SHIPPING_TITLE}</h3>
            <ul className="space-y-1.5 text-[13.5px] leading-relaxed text-ink-2">
              {SHIPPING_LINES.map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand/60" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
