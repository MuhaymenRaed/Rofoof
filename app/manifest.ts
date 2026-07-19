import type { MetadataRoute } from "next";

/**
 * Web app manifest — makes rofoof installable to a phone home screen or a
 * desktop dock. `display: standalone` gives the installed app its own window
 * (no browser chrome); the 192/512 icons are the sizes Chrome requires for
 * the install prompt, and "maskable" lets Android crop them to its icon shape.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "رفوف · rofoof",
    short_name: "رفوف",
    description:
      "متجر رفوف للستكرات والبروشات والميداليات والبوسترات صناعة عراقية — توصيل لجميع محافظات العراق.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F7F3EE",
    theme_color: "#E8321A",
    dir: "rtl",
    lang: "ar",
    categories: ["shopping", "lifestyle"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
