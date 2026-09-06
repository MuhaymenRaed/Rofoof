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
    // Our own optimizer, and it costs nothing.
    //
    // Vercel's is metered, and this shop ran the allowance out: every
    // /_next/image request then answers 402 Payment Required and the whole
    // catalogue renders as broken thumbnails — a hard outage arriving without
    // warning. `unoptimized: true` was the emergency stop for that, but it also
    // switched off `srcset` generation, so every `sizes` prop in the app went
    // inert and a 40px avatar started downloading a full 1600px photo. That is
    // what then ran the *storage* egress quota out instead.
    //
    // A custom loader fixes both. It is a pure function (lib/image-loader.ts)
    // that maps the width next/image asks for onto a file we already generated
    // at upload time, so:
    //   - nothing is proxied through /_next/image — the meter is never touched,
    //     on Vercel or anywhere else, and there is no quota left to exhaust;
    //   - `srcset` works again, so the browser picks the smallest adequate file
    //     and every existing `sizes` prop starts earning its keep.
    //
    // Resizing happens once, in the admin's browser, when the photo is uploaded
    // (lib/webp.ts) — never per request, and never on someone else's invoice.
    loader: "custom",
    loaderFile: "./lib/image-loader.ts",
    // Deliberately narrow, and deliberately matched to VARIANT_WIDTHS in
    // lib/media.ts plus the full-size cap. Next builds `srcset` from these, so
    // listing a width we never store would just make the loader round it back
    // down — fewer, truthful entries keep the markup honest and small.
    deviceSizes: [400, 800, 1600],
    // Only ever consulted for images with a `sizes` prop narrower than the
    // viewport (list rows, cart lines). Must stay below the smallest
    // deviceSize; both round up to the 400px variant.
    imageSizes: [128, 256],
    // Inert while `loader` is custom (nothing reaches the built-in optimizer to
    // be validated), kept so the allowed hosts stay documented in one place.
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
