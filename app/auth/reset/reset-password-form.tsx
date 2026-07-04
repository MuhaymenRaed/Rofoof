"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useStore } from "@/components/providers/store-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Sparkles, Check, X } from "@/components/icons";

type Status = "verifying" | "ready" | "invalid" | "done";

export function ResetPasswordForm() {
  const { t } = useStore();
  const supabase = createSupabaseBrowserClient();
  const searchParams = useSearchParams();
  // Supabase appends these directly to the redirect when a recovery link is
  // expired or was already used — no need to wait out the timeout for that.
  const linkReportedError = Boolean(
    searchParams.get("error") || searchParams.get("error_code"),
  );
  const [status, setStatus] = useState<Status>(linkReportedError ? "invalid" : "verifying");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The recovery link lands here with a PKCE code; the browser client
  // auto-exchanges it (detectSessionInUrl). Show the form once a session exists.
  useEffect(() => {
    if (linkReportedError) return;
    let resolved = false;
    const markReady = () => {
      if (resolved) return;
      resolved = true;
      setStatus("ready");
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) markReady();
    });
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) markReady();
    });

    const timer = setTimeout(() => {
      setStatus((s) => (s === "verifying" ? "invalid" : s));
    }, 6000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [supabase, linkReportedError]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) return;
    if (password !== confirm) {
      setError(t("reset.mismatch"));
      return;
    }
    setPending(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setPending(false);
    if (updateError) {
      if (updateError.code === "weak_password") {
        setError(t("auth.weakPassword"));
        return;
      }
      setError(updateError.message);
      return;
    }
    setStatus("done");
  }

  return (
    <div className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-4 py-10">
      <div className="w-full rounded-3xl border border-line-2 bg-surface p-7 card-shadow">
        {status === "verifying" && (
          <div className="grid place-items-center py-8 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-brand" />
            <p className="mt-4 text-sm font-semibold text-ink-3">{t("reset.verifying")}</p>
          </div>
        )}

        {status === "invalid" && (
          <div className="text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-500/12 text-red-500">
              <X size={28} />
            </div>
            <h1 className="mt-4 text-xl font-black text-ink">{t("reset.invalidTitle")}</h1>
            <p className="mt-1.5 text-sm text-ink-3">{t("reset.invalidHint")}</p>
            <Link
              href="/forgot-password"
              className="tap mt-5 inline-block rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
            >
              {t("reset.requestNew")}
            </Link>
          </div>
        )}

        {status === "done" && (
          <div className="text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-500">
              <Check size={28} />
            </div>
            <h1 className="mt-4 text-xl font-black text-ink">{t("reset.successTitle")}</h1>
            <p className="mt-1.5 text-sm text-ink-3">{t("reset.successHint")}</p>
            <div className="mt-5 flex flex-col gap-2">
              <Link
                href="/login"
                className="tap rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
              >
                {t("reset.backToLogin")}
              </Link>
              <Link href="/" className="tap text-sm font-bold text-ink-3 transition hover:text-ink">
                {t("reset.goHome")}
              </Link>
            </div>
          </div>
        )}

        {status === "ready" && (
          <>
            <div className="mb-6 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-brand">
                <Sparkles size={24} />
              </div>
              <h1 className="mt-4 text-xl font-black text-ink">{t("reset.newTitle")}</h1>
              <p className="mt-1 text-sm text-ink-3">{t("reset.newSub")}</p>
            </div>

            <form onSubmit={onSubmit} className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-ink-2">
                  {t("reset.newPassword")}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  dir="ltr"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="dash-input text-start"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-ink-2">
                  {t("reset.confirmPassword")}
                </label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  dir="ltr"
                  required
                  minLength={6}
                  autoComplete="new-password"
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
                className="tap h-11 w-full rounded-xl bg-brand text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {pending ? t("reset.updating") : t("reset.update")}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
