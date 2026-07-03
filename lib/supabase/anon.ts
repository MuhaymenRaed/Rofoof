import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Stateless anon client (no cookies). Use ONLY for public, RLS-safe reads that
 * are wrapped in `unstable_cache` — because it never touches request APIs, the
 * calling route can stay static / ISR-cached.
 */
export function createAnonClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
