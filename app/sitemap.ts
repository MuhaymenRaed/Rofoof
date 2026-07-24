import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.rofoof.net";

/**
 * The list of public URLs we want indexed. Kept to the pages that render
 * distinct, crawlable content — the store's category filters live in the
 * client (?cat=…) and return the same server HTML, so listing them would only
 * create duplicate-content noise.
 *
 * Reachable at /sitemap.xml; submit that URL in Google Search Console.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: BASE, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/store`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/favorites`, lastModified: now, changeFrequency: "weekly", priority: 0.3 },
  ];
}
