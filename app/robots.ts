import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.rofoof.net";

/**
 * Crawl rules. Everything public is allowed; the admin dashboard, auth flows
 * and API routes are kept out of the index (they're private or have no search
 * value). Points crawlers at the sitemap. Served at /robots.txt.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/api/", "/login", "/forgot-password", "/auth/"],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
