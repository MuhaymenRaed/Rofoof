/*
 * Minimal service worker — exists so browsers treat rofoof as installable
 * (Chrome requires a registered SW with a fetch handler before it will fire
 * `beforeinstallprompt`).
 *
 * It deliberately does NOT cache anything: the storefront is server-rendered
 * with ISR/revalidation, so adding a cache layer here would only risk serving
 * customers stale prices and stock. Fetches pass straight through to network.
 */
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Pass-through handler — required for installability, intentionally a no-op.
self.addEventListener("fetch", () => {});
