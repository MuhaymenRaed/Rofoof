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
    // Serve straight from Supabase Storage's CDN instead of routing every image
    // through Vercel's optimizer.
    //
    // Why: the optimizer is metered, and on this plan the allowance is finite.
    // Once it runs out EVERY /_next/image request answers 402 Payment Required,
    // so the whole catalogue renders as broken thumbnails — a hard outage that
    // arrives without warning and can't be undone until the quota resets.
    //
    // We give up little: uploads are already re-encoded to WebP in the browser
    // and capped in size (see lib/webp.ts), so the bytes on the wire are close
    // to what the optimizer would have produced anyway — and now they're served
    // from a CDN that doesn't meter transformations.
    unoptimized: true,
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
