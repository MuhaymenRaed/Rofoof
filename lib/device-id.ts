import "server-only";
import { cookies } from "next/headers";

/**
 * A stable, anonymous id for THIS browser, used to hold a guest to a coupon's
 * per-customer limit. Most shoppers here never sign in, so `auth.uid()` is null
 * at checkout and a per-user cap has nothing to bind to — this is what it binds
 * to instead.
 *
 * Deliberately NOT httpOnly: a small client keeper (components/layout/device-id-keeper)
 * mirrors it into localStorage and puts it back if the cookie alone is cleared.
 * It is an anti-abuse marker, never a credential — nothing is authorised by it,
 * so a reader or an editor of the value gains nothing but a fresh identity,
 * which clearing the cookie would have given them anyway.
 */
export const DEVICE_COOKIE = "rofoof_did";

/** Long enough that a returning customer is still the same device next season. */
const FIVE_YEARS_SECONDS = 60 * 60 * 24 * 365 * 5;

/**
 * Shape check on a value that arrives from the browser and is spliced into a
 * PostgREST filter. A hand-edited cookie is treated as no cookie at all.
 */
const DEVICE_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

function sanitize(value: string | undefined): string | null {
  if (!value) return null;
  return DEVICE_ID_RE.test(value) ? value : null;
}

/** Read-only: safe from a Server Component, returns null when unset. */
export async function readDeviceId(): Promise<string | null> {
  const store = await cookies();
  return sanitize(store.get(DEVICE_COOKIE)?.value);
}

/**
 * Read the id, minting and setting one when this browser has none. Server
 * Actions and Route Handlers only — writing a cookie throws in a Server
 * Component, which is caught here so a read never fails because of it.
 */
export async function ensureDeviceId(): Promise<string> {
  const store = await cookies();
  const existing = sanitize(store.get(DEVICE_COOKIE)?.value);
  if (existing) return existing;

  const minted = crypto.randomUUID();
  try {
    store.set(DEVICE_COOKIE, minted, {
      maxAge: FIVE_YEARS_SECONDS,
      path: "/",
      sameSite: "lax",
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
    });
  } catch {
    // Read-only cookie store (Server Component render). The caller still gets a
    // usable id for this request; the next action mints the persistent one.
  }
  return minted;
}
