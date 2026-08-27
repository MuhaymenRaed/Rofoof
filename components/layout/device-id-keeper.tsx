"use client";

import { useEffect } from "react";

/**
 * Keeps this browser's anonymous device marker alive across a cookie clear.
 *
 * The marker itself is minted server-side (lib/device-id.ts) and lives in a
 * cookie, because that is what a Server Action can read. A cookie alone is
 * fragile though: "clear cookies" drops it, and the customer silently becomes a
 * new device with a fresh claim on every one-per-customer code.
 *
 * So it is mirrored into localStorage, which that gesture does not touch, and
 * put back the moment the cookie is missing. Nothing is authorised by this
 * value — it only decides whether a discount code has already been spent here.
 *
 * Renders nothing.
 */

const COOKIE = "rofoof_did";
const STORAGE_KEY = "rofoof.did";
const FIVE_YEARS_SECONDS = 60 * 60 * 24 * 365 * 5;

/** Same shape check the server applies — a junk value is treated as absent. */
const DEVICE_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

function readCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)rofoof_did=([^;]*)/);
  const value = match ? decodeURIComponent(match[1]) : "";
  return DEVICE_ID_RE.test(value) ? value : null;
}

export function DeviceIdKeeper() {
  useEffect(() => {
    try {
      const fromCookie = readCookie();
      if (fromCookie) {
        localStorage.setItem(STORAGE_KEY, fromCookie);
        return;
      }

      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved || !DEVICE_ID_RE.test(saved)) return;

      const secure = location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${COOKIE}=${encodeURIComponent(saved)}; Max-Age=${FIVE_YEARS_SECONDS}; Path=/; SameSite=Lax${secure}`;
    } catch {
      // Private mode, or storage blocked entirely. The server still mints a
      // cookie on the next action — this is hardening, never a requirement.
    }
  }, []);

  return null;
}
