"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/components/providers/store-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Sparkles, Check } from "@/components/icons";

export default function ForgotPasswordPage() {
  const { t } = useStore();
  const supabase = createSupabaseBrowserClient();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setPending(true);
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/reset`,
    });
    setPending(false);
    // Rate-limit errors don't reveal whether the email exists (they trigger
    // for any address), so it's safe to surface them distinctly. Every other
    // outcome still shows the generic "check your email" success screen to
    // avoid leaking which addresses are registered.
    if (err?.code === "over_email_send_rate_limit" || err?.code === "over_request_rate_limit") {
      setError(t("auth.rateLimited"));
      return;
    }
    setSent(true);
  }

  return (
    <div className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-4 py-10">
      <div className="w-full rounded-3xl border border-line-2 bg-surface p-7 card-shadow">
        {sent ? (
          <div className="text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-500">
              <Check size={28} />
            </div>
            <h1 className="mt-4 text-xl font-black text-ink">{t("reset.sentTitle")}</h1>
            <p className="mt-1.5 text-sm text-ink-3">{t("reset.sentHint")}</p>
            <p dir="ltr" className="mt-3 truncate rounded-xl bg-surface-2 px-4 py-2 text-sm font-bold text-ink">
              {email}
            </p>
            <Link
              href="/login"
              className="tap mt-5 inline-block rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
            >
              {t("reset.backToLogin")}
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-6 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-brand">
                <Sparkles size={24} />
              </div>
              <h1 className="mt-4 text-xl font-black text-ink">{t("reset.requestTitle")}</h1>
              <p className="mt-1 text-sm text-ink-3">{t("reset.requestSub")}</p>
            </div>

            <form onSubmit={onSubmit} className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-ink-2">{t("auth.email")}</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  dir="ltr"
                  required
                  autoComplete="email"
                  className="dash-input text-start"
                />
              </div>
              {error && (
                <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={pending}
                className="tap h-11 w-full rounded-xl bg-brand text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? t("reset.sending") : t("reset.sendLink")}
              </button>
            </form>

            <p className="mt-5 text-center text-xs text-ink-3">
              <Link href="/login" className="font-bold text-brand hover:underline">
                {t("reset.backToLogin")}
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
