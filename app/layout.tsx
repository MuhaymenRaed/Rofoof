import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AuthProvider } from "@/components/providers/auth-provider";
import { StoreProvider } from "@/components/providers/store-provider";
import { getProducts, getAnnouncement, getCategories, getFandoms } from "@/lib/data/catalog";
import { Ticker } from "@/components/layout/ticker";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CartDrawer } from "@/components/layout/cart-drawer";
import { QuickViewModal } from "@/components/layout/quick-view-modal";

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
  },
  twitter: {
    card: "summary_large_image",
    title: "رفوف · rofoof",
    description: "ستكرات وميداليات صناعة عراقية — توصيل لجميع محافظات العراق.",
  },
  // Favicons are auto-generated from app/icon.svg + app/apple-icon.svg.
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F3EE" },
    { media: "(prefers-color-scheme: dark)", color: "#0C0B0A" },
  ],
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
  const [products, announcement, categories, fandoms] = await Promise.all([
    getProducts(),
    getAnnouncement(),
    getCategories(),
    getFandoms(),
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
              initialAnnouncement={announcement}
            >
              <div className="flex min-h-screen flex-col">
                <Ticker />
                <Header />
                <main className="flex-1">{children}</main>
                <Footer />
              </div>
              <CartDrawer />
              <QuickViewModal />
            </StoreProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
