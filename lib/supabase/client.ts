"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

/**
 * Singleton browser client. Manages the auth session in cookies for SSR.
 *
 * Client Components still render once on the server (for the initial HTML,
 * and at build time for statically-prerendered pages) before ever reaching
 * the browser. `@supabase/ssr` throws synchronously if the URL/key are
 * missing, which would abort an entire `next build` the moment any page
 * using AuthProvider/StoreProvider tried to prerender without env vars
 * configured. On the server we fall back to harmless placeholder values —
 * nothing on the server actually issues requests through this client (that
 * only happens inside effects/handlers, which never run during SSR) — and
 * the real client takes over once hydration reaches an actual browser.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

  if (typeof window === "undefined") {
    return createBrowserClient<Database>(url, key);
  }
  if (!client) {
    client = createBrowserClient<Database>(url, key);
  }
  return client;
}
