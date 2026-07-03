"use client";

import Link from "next/link";
import { useStore } from "@/components/providers/store-provider";
import { Search } from "@/components/icons";

export default function NotFound() {
  const { t } = useStore();

  return (
    <div className="mx-auto grid min-h-[60vh] max-w-md place-items-center px-4 py-16 text-center">
      <div>
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-brand-soft text-brand">
          <Search size={28} />
        </div>
        <p className="mt-4 text-5xl font-black text-brand">404</p>
        <h1 className="mt-2 text-xl font-black text-ink">{t("notFound.title")}</h1>
        <p className="mt-2 text-sm text-ink-3">{t("notFound.hint")}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="tap rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
          >
            {t("notFound.home")}
          </Link>
          <Link
            href="/store"
            className="tap rounded-xl border border-line px-5 py-2.5 text-sm font-bold text-ink-2 transition hover:border-brand hover:text-brand"
          >
            {t("notFound.store")}
          </Link>
        </div>
      </div>
    </div>
  );
}
