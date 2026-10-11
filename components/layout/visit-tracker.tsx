"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Records that this browser opened a page, so the dashboard can answer "how
 * many visits did we get this month" at all.
 *
 * ONE ROW PER PAGE PER SESSION, not per navigation. A shopper who walks the
 * store, opens four products and comes back to the home page should read as one
 * visit with a handful of pages, not as a dozen. The guard is a module-level
 * Set, which lives exactly as long as the tab does — that is the definition of
 * "session" here, and it needs no storage of its own.
 *
 * Why this is cheap enough for the connections this shop runs on: the write is
 * one small insert, it is never awaited, it is never retried, and a failure is
 * swallowed. Analytics must not cost a shopper a round trip they can feel, and
 * must never be the reason a page appears broken.
 *
 * The visitor id is the anonymous device marker the coupon limiter already
 * uses (lib/device-id.ts) — a random uuid in a cookie that is deliberately not
 * httpOnly. Nothing identifies a person: counting distinct ids counts BROWSERS.
 * A browser with no marker yet is simply not counted rather than being given
 * one, because minting an id purely to measure someone is not a trade this shop
 * needs to make.
 *
 * Renders nothing.
 */

/** Same shape check the server applies to the marker. */
const DEVICE_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
/**
 * `page_views.visitor_id` is a uuid column, so anything else would be rejected
 * by the database. The marker has been minted with crypto.randomUUID() all
 * along; this only skips the odd hand-edited cookie.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Paths already recorded in this tab. */
const seen = new Set<string>();

function readVisitorId(): string | null {
  try {
    const match = document.cookie.match(/(?:^|;\s*)rofoof_did=([^;]*)/);
    const value = match ? decodeURIComponent(match[1]) : "";
    if (!DEVICE_ID_RE.test(value) || !UUID_RE.test(value)) return null;
    return value;
  } catch {
    return null;
  }
}

export function VisitTracker() {
  const pathname = usePathname();
  // The dashboard is the shop looking at itself; counting it would inflate
  // every figure on the very screen that reports them.
  const skip = pathname.startsWith("/dashboard");
  const pendingRef = useRef(false);

  useEffect(() => {
    if (skip || seen.has(pathname) || pendingRef.current) return;
    const visitorId = readVisitorId();
    if (!visitorId) return;

    // Marked before the request, not after: React may run this effect twice in
    // development, and two rows for one page would quietly double the numbers.
    seen.add(pathname);
    pendingRef.current = true;

    void createSupabaseBrowserClient()
      .from("page_views")
      .insert({ page_path: pathname.slice(0, 200), visitor_id: visitorId })
      .then(() => {
        pendingRef.current = false;
      });
  }, [pathname, skip]);

  return null;
}
