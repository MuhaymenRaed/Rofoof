import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { LangScript } from "@/components/layout/lang-script";
import { JsonLd } from "@/components/seo/json-ld";
import { organizationSchema, webSiteSchema } from "@/lib/seo";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AuthProvider } from "@/components/providers/auth-provider";
import { StoreProvider } from "@/components/providers/store-provider";
import {
  getProducts,
  getAnnouncement,
  getCategories,
  getSubcategories,
  getFandoms,
  getOffers,
  getCustomPricing,
  getVolumeTiers,
  getSiteSettings,
} from "@/lib/data/catalog";
import { CustomRequestModal } from "@/components/layout/custom-request-modal";
import { Ticker } from "@/components/layout/ticker";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CartDrawer } from "@/components/layout/cart-drawer";
import { QuickViewModal } from "@/components/layout/quick-view-modal";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { InstallPrompt } from "@/components/layout/install-prompt";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-cairo",
  display: "swap",
});

// Canonical origin for metadata/OG/canonical URLs. www is the Production host
// (rofoof.net 308-redirects to it). Override per-env with NEXT_PUBLIC_SITE_URL.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.rofoof.net";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "رفوف · rofoof — ستكرات وميداليات صناعة عراقية",
    template: "%s · رفوف",
  },
  description:
    "متجر رفوف (rofoof) للستكرات والبروشات والميداليات والبوسترات صناعة عراقية — توصيل لجميع محافظات العراق. رفوف · rofoof · roufouf.",
  applicationName: "رفوف · rofoof",
  keywords: [
    "رفوف",
    "rofoof",
    "روفوف",
    "rofof",
    "rufoof",
    "roufouf",
    "rofoof العراق",
    "rofoof iraq",
    "ستكرات",
    "بروشات",
    "ميداليات",
    "بوسترات",
    "ستكرات العراق",
    "stickers Iraq",
    "medals",
    "brooches",
    "posters",
    "العراق",
  ],
  authors: [{ name: "rofoof" }],
  alternates: {
    canonical: "/",
    languages: { "ar-IQ": "/", en: "/" },
  },
  openGraph: {
    type: "website",
    siteName: "رفوف · rofoof",
    title: "رفوف · rofoof — ستكرات وميداليات صناعة عراقية",
    description:
      "ستكرات، بروشات، ميداليات وبوسترات لكل اهتماماتك — توصيل لجميع محافظات العراق.",
    locale: "ar_IQ",
    images: ["/logo.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "رفوف · rofoof",
    description: "ستكرات وميداليات صناعة عراقية — توصيل لجميع محافظات العراق.",
    images: ["/logo.png"],
  },
  // Browser tab uses the transparent mascot; the Apple touch icon needs an
  // opaque square (iOS doesn't composite transparency), so it gets icon-192.
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F3EE" },
    { media: "(prefers-color-scheme: dark)", color: "#0C0B0A" },
  ],
  // Edge-to-edge on notched phones; the tab bar pads itself with
  // env(safe-area-inset-bottom) so it clears the home indicator.
  viewportFit: "cover",
};

// next-themes handles the theme before paint; language/direction is applied by
// /public/lang-init.js (loaded beforeInteractive in the body below).

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [
    products,
    announcement,
    categories,
    subcategories,
    fandoms,
    offers,
    customPricing,
    volumeTiers,
    siteSettings,
  ] = await Promise.all([
    getProducts(),
    getAnnouncement(),
    getCategories(),
    getSubcategories(),
    getFandoms(),
    getOffers(),
    getCustomPricing(),
    getVolumeTiers(),
    getSiteSettings(),
  ]);

  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} h-full`} suppressHydrationWarning>
      <head>
        {/* Runs during <head> parsing — before the body paints — so English
            visitors never flash RTL. Memoized so it never re-renders client-side. */}
        <LangScript />
        {/* Structured data: maps brand spellings/translations to one entity.
            Rendered from this Server Component and sanitized against XSS. */}
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@graph": [organizationSchema(SITE_URL), webSiteSchema(SITE_URL)],
          }}
        />
      </head>
      <body className="min-h-full antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <AuthProvider>
            <StoreProvider
              products={products}
              categories={categories}
              subcategories={subcategories}
              fandoms={fandoms}
              offers={offers}
              volumeTiers={volumeTiers}
              siteSettings={siteSettings}
              customPricing={customPricing}
              initialAnnouncement={announcement}
            >
              {/* pb clears the fixed mobile tab bar (h-14 + safe area) */}
              <div className="flex min-h-screen flex-col pb-16 md:pb-0">
                <InstallPrompt />
                <Ticker />
                <Header />
                <main className="flex-1">{children}</main>
                <Footer />
              </div>
              <MobileTabBar />
              <CartDrawer />
              <QuickViewModal />
              <CustomRequestModal />
            </StoreProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
