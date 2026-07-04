import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/types";

/**
 * Next.js 16 "proxy" (formerly middleware). Runs on every matched request to:
 *  1. Refresh the Supabase auth session cookie (required for SSR auth).
 *  2. Perform an OPTIMISTIC redirect for /dashboard (the real admin check
 *     still runs in the page via the DAL — never trust the proxy alone).
 *
 * Deliberately fails OPEN: if Supabase env vars are missing/misconfigured or
 * the auth call errors, every request would otherwise crash here (this runs
 * on nearly every route). Instead we log and pass the request through
 * unmodified — the DAL (lib/auth/dal.ts) still enforces real authorization
 * on /dashboard regardless of what happens here.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const path = request.nextUrl.pathname;

  if (!url || !key) {
    console.error("[proxy] Missing NEXT_PUBLIC_SUPABASE_URL/ANON_KEY — skipping session refresh");
    return NextResponse.next({ request });
  }

  try {
    let response = NextResponse.next({ request });

    const supabase = createServerClient<Database>(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });

    // Touch the user to trigger a token refresh when needed. Do not remove.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (path.startsWith("/dashboard") && !user) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      redirectUrl.searchParams.set("next", path);
      return NextResponse.redirect(redirectUrl);
    }

    return response;
  } catch (error) {
    console.error("[proxy] Supabase session refresh failed:", error);
    return NextResponse.next({ request });
  }
}

export const config = {
  // Run on everything except static assets and image files.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
