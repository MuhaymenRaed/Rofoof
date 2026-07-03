import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "./types";

/**
 * Cookie-bound server client. Reads the signed-in user's session from the
 * request cookies and enforces RLS as that user. Use in Server Components,
 * Server Actions, and Route Handlers for anything user-specific.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // `set` throws when called from a Server Component (read-only
            // cookies). Safe to ignore — proxy.ts refreshes the session cookie
            // on every request.
          }
        },
      },
    },
  );
}
