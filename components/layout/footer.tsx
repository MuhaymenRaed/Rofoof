"use client";

import Link from "next/link";
import { useStore } from "@/components/providers/store-provider";
import { Instagram, Whatsapp, MapPin, Phone, Truck } from "@/components/icons";
import { WHATSAPP_URL, WHATSAPP_NUMBER, INSTAGRAM_URL, formatWhatsappDisplay } from "@/lib/contact";
import type { DictKey } from "@/lib/i18n";

const SHOP_LINKS: { href: string; key: DictKey }[] = [
  { href: "/store", key: "nav.store" },
  { href: "/orders", key: "nav.orders" },
  { href: "/favorites", key: "nav.favorites" },
];

const HELP_LINKS: DictKey[] = ["footer.faq", "footer.returns", "footer.shipping"];

export function Footer() {
  const { t } = useStore();
  const year = 2026;

  return (
    <footer className="mt-16 border-t border-line-2 bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="text-xl font-black text-brand">{t("brand.name")}</div>
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-ink-2">
              {t("footer.tagline")}
            </p>
            <div className="mt-4 flex items-center gap-2">
              <a
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="tap grid h-9 w-9 place-items-center rounded-lg border border-line text-ink-2 transition hover:border-brand hover:bg-brand-soft hover:text-brand"
              >
                <Instagram size={17} />
              </a>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className="tap grid h-9 w-9 place-items-center rounded-lg border border-line text-ink-2 transition hover:border-brand hover:bg-brand-soft hover:text-brand"
              >
                <Whatsapp size={17} />
              </a>
            </div>
          </div>

          {/* Shop */}
          <nav>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-3">
              {t("footer.shop")}
            </h3>
            <ul className="space-y-2.5">
              {SHOP_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="tap text-[13px] font-medium text-ink-2 transition hover:text-brand"
                  >
                    {t(l.key)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Help */}
          <nav>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-3">
              {t("footer.help")}
            </h3>
            <ul className="space-y-2.5">
              {HELP_LINKS.map((k) => (
                <li key={k}>
                  <a
                    href="#"
                    className="tap text-[13px] font-medium text-ink-2 transition hover:text-brand"
                  >
                    {t(k)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Contact */}
          <div>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-3">
              {t("footer.contact")}
            </h3>
            <ul className="space-y-2.5 text-[13px] font-medium text-ink-2">
              <li className="flex items-center gap-2">
                <Truck size={16} className="text-brand" />
                {t("footer.delivery")}
              </li>
              <li className="flex items-center gap-2">
                <MapPin size={16} className="text-brand" />
                {t("footer.delivery")}
              </li>
              <li className="flex items-center gap-2" dir="ltr">
                <Phone size={16} className="text-brand" />
                <a href={`tel:+${WHATSAPP_NUMBER}`} className="tap hover:text-brand">
                  {formatWhatsappDisplay()}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-line-2 pt-6 text-xs text-ink-3 sm:flex-row">
          <p>
            © {year} رفوف · rofoof — {t("footer.rights")}
          </p>
          <p className="flex items-center gap-1.5">
            <Truck size={14} /> {t("footer.delivery")}
          </p>
        </div>
      </div>
    </footer>
  );
}
