import { INSTAGRAM_URL, WHATSAPP_NUMBER } from "@/lib/contact";

/**
 * Brand name in every form we want Google to map to us: the official Arabic
 * and English names, and the misspellings people actually type. `alternateName`
 * is the schema.org field search engines use to reconcile spelling variants and
 * translations back to one entity.
 */
export const BRAND_ALTERNATE_NAMES = [
  "rofoof",
  "Rofoof",
  "روفوف",
  "رفووف",
  "رفف",
  "rofof",
  "rufoof",
  "roufouf",
  "rofooof",
  "rfoof",
  "rofoof iq",
  "rofoof iraq",
  "rofoof stickers",
  "ستكرات رفوف",
  "رفوف العراق",
];

/** Organization: reconciles brand spellings/translations to one entity. */
export function organizationSchema(siteUrl: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "رفوف",
    alternateName: BRAND_ALTERNATE_NAMES,
    url: siteUrl,
    logo: `${siteUrl}/logo.png`,
    image: `${siteUrl}/logo.png`,
    description:
      "متجر رفوف للستكرات والبروشات والميداليات والبوسترات صناعة عراقية — رفوف / rofoof.",
    areaServed: "IQ",
    sameAs: [INSTAGRAM_URL, `https://wa.me/${WHATSAPP_NUMBER}`],
  };
}

/** WebSite: names + the in-site search action Google can surface as a sitelink. */
export function webSiteSchema(siteUrl: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "رفوف · rofoof",
    alternateName: BRAND_ALTERNATE_NAMES,
    url: siteUrl,
    inLanguage: ["ar-IQ", "en"],
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl}/store?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}
