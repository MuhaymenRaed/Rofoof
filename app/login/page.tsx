"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/components/providers/store-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { provinceCodes, provinceLabelKey } from "@/lib/provinces";
import { safeNextPath } from "@/lib/safe-redirect";
import { Sparkles } from "@/components/icons";
import type { DictKey } from "@/lib/i18n";
import type { AuthError } from "@supabase/supabase-js";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

type Mode = "signin" | "signup";

/** Map a Supabase auth error to a friendly, localized message key. */
function authErrorKey(error: AuthError, mode: Mode): DictKey {
  const code = error.code ?? "";
  const msg = error.message.toLowerCase();

  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit") {
    return "auth.rateLimited";
  }
  if (code === "email_not_confirmed" || msg.includes("email not confirmed")) {
    return "auth.emailNotConfirmed";
  }
  if (code === "user_already_exists" || msg.includes("already registered")) {
    return "auth.accountExists";
  }
  if (code === "weak_password" || msg.includes("weak password") || msg.includes("password should be")) {
    return "auth.weakPassword";
  }
  return mode === "signin" ? "auth.invalidCreds" : "auth.genericError";
}

function LoginForm() {
  const { t } = useStore();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const supabase = createSupabaseBrowserClient();

  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [province, setProvince] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [oauthPending, setOauthPending] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get("error") === "oauth" ? t("auth.oauthError") : null,
  );
  const [info, setInfo] = useState<string | null>(null);

  async function signInWithGoogle() {
    setError(null);
    setOauthPending(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    // on success the browser redirects to Google; only reached on error
    if (error) {
      setError(t("auth.oauthError"));
      setOauthPending(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setPending(true);
    setError(null);
    setInfo(null);

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) {
          setError(t(authErrorKey(error, "signin")));
          return;
        }
        router.replace(next);
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: name.trim(),
              phone: phone.trim(),
              province_code: province,
            },
          },
        });
        if (error) {
          setError(t(authErrorKey(error, "signup")));
          return;
        }
        // Supabase intentionally returns a "successful" signup with no error
        // for an email that's already registered (anti user-enumeration) —
        // detected by an empty identities array on the returned user.
        if (data.user && data.user.identities?.length === 0) {
          setError(t("auth.accountExists"));
          setMode("signin");
          return;
        }
        if (data.session) {
          router.replace(next);
          router.refresh();
        } else {
          setInfo(t("auth.confirmEmail"));
          setMode("signin");
        }
      }
    } catch {
      setError(t("auth.genericError"));
    } finally {
      setPending(false);
    }
  }

  const isSignup = mode === "signup";

  return (
    <div className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-4 py-10">
      <div className="w-full rounded-3xl border border-line-2 bg-surface p-7 card-shadow">
        <div className="mb-6 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-brand">
            <Sparkles size={24} />
          </div>
          <h1 className="mt-4 text-xl font-black text-ink">
            {isSignup ? t("auth.signupTitle") : t("auth.signinTitle")}
          </h1>
          <p className="mt-1 text-sm text-ink-3">
            {isSignup ? t("auth.signupSub") : t("auth.signinSub")}
          </p>
        </div>

        {/* Google OAuth */}
        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={oauthPending || pending}
          className="tap flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-line bg-surface text-sm font-bold text-ink transition hover:border-brand hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <GoogleGlyph />
          {oauthPending ? "…" : t("auth.google")}
        </button>

        <div className="my-4 flex items-center gap-3 text-[11px] font-semibold text-ink-3">
          <span className="h-px flex-1 bg-line-2" />
          {t("auth.or")}
          <span className="h-px flex-1 bg-line-2" />
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          {isSignup && (
            <>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-ink-2">{t("auth.name")}</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="dash-input"
                  autoComplete="name"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-ink-2">
                  {t("checkout.phone")}
                </label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  dir="ltr"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+964 7xx xxx xxxx"
                  className="dash-input text-start"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-ink-2">
                  {t("checkout.province")}
                </label>
                <select
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  className="dash-input cursor-pointer"
                >
                  <option value="">{t("checkout.selectProvince")}</option>
                  {provinceCodes.map((code) => (
                    <option key={code} value={code}>
                      {t(provinceLabelKey(code))}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
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
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="block text-xs font-bold text-ink-2">{t("auth.password")}</label>
              {!isSignup && (
                <Link href="/forgot-password" className="text-[11px] font-bold text-brand hover:underline">
                  {t("auth.forgot")}
                </Link>
              )}
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              dir="ltr"
              required
              minLength={6}
              autoComplete={isSignup ? "new-password" : "current-password"}
              className="dash-input text-start"
            />
          </div>

          {error && (
            <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500">
              {error}
            </p>
          )}
          {info && (
            <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-600">
              {info}
            </p>
          )}

          <button
            type="submit"
            disabled={pending || oauthPending}
            className="tap h-11 w-full rounded-xl bg-brand text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "…" : isSignup ? t("auth.signup") : t("auth.login")}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-ink-3">
          {isSignup ? t("auth.haveAccount") : t("auth.noAccount")}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(isSignup ? "signin" : "signup");
              setError(null);
              setInfo(null);
            }}
            className="font-bold text-brand hover:underline"
          >
            {isSignup ? t("auth.toSignin") : t("auth.toSignup")}
          </button>
        </p>
      </div>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
