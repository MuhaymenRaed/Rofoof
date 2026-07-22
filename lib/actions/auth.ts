"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Password sign-in behind a brute-force lock. Every attempt is recorded in
 * login_attempts (service role, never exposed to the browser); once an account
 * collects MAX_FAILURES failures it is locked for LOCK_MINUTES from the most
 * recent failure. A successful sign-in clears the account's failures.
 *
 * Sign-in runs server-side so the counter can't be bypassed by calling
 * Supabase directly from the client with a fresh page load.
 */

const MAX_FAILURES = 8; // within the rolling window
const LOCK_MINUTES = 60; // wait an hour after tripping the limit

export interface SignInResult {
  ok: boolean;
  /** locked = too many failures; unconfirmed = email not verified */
  error?: "invalid" | "locked" | "unconfirmed" | "unknown";
  retryAfterMinutes?: number;
}

export async function signInAction(email: string, password: string): Promise<SignInResult> {
  const identifier = email.trim().toLowerCase();
  if (!identifier || !password) return { ok: false, error: "invalid" };

  const admin = createAdminClient();
  const since = new Date(Date.now() - LOCK_MINUTES * 60_000).toISOString();

  const { data: recent } = await admin
    .from("login_attempts")
    .select("created_at")
    .eq("identifier", identifier)
    .eq("success", false)
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (recent && recent.length >= MAX_FAILURES) {
    const unlockAt = new Date(new Date(recent[0].created_at).getTime() + LOCK_MINUTES * 60_000);
    const minutes = Math.max(1, Math.ceil((unlockAt.getTime() - Date.now()) / 60_000));
    return { ok: false, error: "locked", retryAfterMinutes: minutes };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email: identifier, password });

  // Record the attempt either way (best effort — never block sign-in on it).
  try {
    await admin.from("login_attempts").insert({ identifier, success: !error });
    if (!error) {
      await admin
        .from("login_attempts")
        .delete()
        .eq("identifier", identifier)
        .eq("success", false);
    }
  } catch {
    /* non-fatal */
  }

  if (error) {
    const code = error.code ?? "";
    if (code === "email_not_confirmed" || error.message.toLowerCase().includes("not confirmed")) {
      return { ok: false, error: "unconfirmed" };
    }
    return { ok: false, error: "invalid" };
  }
  return { ok: true };
}
