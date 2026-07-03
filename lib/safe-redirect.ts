/**
 * Sanitize a user-supplied "next" path so it can never send the browser off
 * this site (open-redirect protection). Only a single leading slash is
 * accepted — `//evil.com` and `/\evil.com` are protocol-relative / browser
 * quirks that would otherwise navigate off-origin, so both are rejected.
 */
export function safeNextPath(path: string | null | undefined, fallback = "/"): string {
  if (!path) return fallback;
  if (!path.startsWith("/")) return fallback;
  if (path.startsWith("//") || path.startsWith("/\\")) return fallback;
  return path;
}
