"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useStore } from "@/components/providers/store-provider";
import { X } from "@/components/icons";

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const { t } = useStore();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto grid min-h-[60vh] max-w-md place-items-center px-4 py-16 text-center">
      <div>
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-red-500/12 text-red-500">
          <X size={28} />
        </div>
        <h1 className="mt-4 text-xl font-black text-ink">{t("error.title")}</h1>
        <p className="mt-2 text-sm text-ink-3">{t("error.hint")}</p>
        {error.digest && (
          <p className="mt-3 text-[11px] text-ink-3" dir="ltr">
            {t("error.digest")}: {error.digest}
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="tap rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
          >
            {t("error.retry")}
          </button>
          <Link
            href="/"
            className="tap rounded-xl border border-line px-5 py-2.5 text-sm font-bold text-ink-2 transition hover:border-brand hover:text-brand"
          >
            {t("notFound.home")}
          </Link>
        </div>
      </div>
    </div>
  );
}
