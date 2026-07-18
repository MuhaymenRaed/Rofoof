import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AuthProvider } from "@/components/providers/auth-provider";
import { StoreProvider } from "@/components/providers/store-provider";
import {
  getProducts,
  getAnnouncement,
  getCategories,
  getFandoms,
  getOffers,
  getCustomPricing,
} from "@/lib/data/catalog";
import { CustomRequestModal } from "@/components/layout/custom-request-modal";
import { Ticker } from "@/components/layout/ticker";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CartDrawer } from "@/components/layout/cart-drawer";
import { QuickViewModal } from "@/components/layout/quick-view-modal";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-cairo",
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://rofoof.iq";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "رفوف · rofoof — ستكرات وميداليات صناعة عراقية",
    template: "%s · رفوف",
  },
  description:
    "متجر رفوف للستكرات والبروشات والميداليات والبوسترات صناعة عراقية — توصيل لجميع محافظات العراق.",
  applicationName: "رفوف · rofoof",
  keywords: ["رفوف", "rofoof", "ستكرات", "بروشات", "ميداليات", "بوسترات", "العراق", "stickers", "Iraq"],
  authors: [{ name: "rofoof.iq" }],
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
  // Browser-tab + Apple touch icon: the رفوف mascot in public/logo.png.
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
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

// next-themes handles the theme before paint. We only set language/direction
// here to avoid a flash of the wrong text direction.
const noFlashScript = `
(function () {
  try {
    var l = localStorage.getItem('rofoof.lang') || 'ar';
    document.documentElement.lang = l;
    document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
  } catch (e) {}
})();
`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [products, announcement, categories, fandoms, offers, customPricing] = await Promise.all([
    getProducts(),
    getAnnouncement(),
    getCategories(),
    getFandoms(),
    getOffers(),
    getCustomPricing(),
  ]);

  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body className="min-h-full antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <AuthProvider>
            <StoreProvider
              products={products}
              categories={categories}
              fandoms={fandoms}
              offers={offers}
              customPricing={customPricing}
              initialAnnouncement={announcement}
            >
              {/* pb clears the fixed mobile tab bar (h-14 + safe area) */}
              <div className="flex min-h-screen flex-col pb-16 md:pb-0">
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
