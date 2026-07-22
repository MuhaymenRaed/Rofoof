import type { NextConfig } from "next";

const securityHeaders = [
  // Prevent the site from being framed by another origin (clickjacking).
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Stop browsers from MIME-sniffing a response away from its declared type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send full origin+path to same-site links, only the origin cross-site.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Lock down APIs this storefront never uses.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  // Partial Prerendering: static shell served instantly, dynamic content
  // streamed in. In Next 16 this is the `cacheComponents` flag (the old
  // experimental.ppr / experimental_ppr were removed).
  cacheComponents: true,
  // Don't advertise the framework in responses.
  poweredByHeader: false,
  images: {
    // next/image lazy-loads + optimizes these. Add real product images from
    // Supabase Storage (or any CDN) and they stream in below the fold.
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
