"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { translate, type DictKey, type Lang } from "@/lib/i18n";
import type {
  CategoryInfo,
  CustomCartRequest,
  CustomPricing,
  FandomInfo,
  Offer,
  Product,
  SiteSettings,
  VolumeTier,
} from "@/lib/products";
import { linePricing, volumeUnitPrice, type LinePricing } from "@/lib/pricing";
import { useAuth } from "@/components/providers/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export interface CartLine {
  /** product id */
  id: string;
  /** selected package item, when the product is a package */
  itemId?: string;
  qty: number;
  waterproof?: boolean;
  customImageUrl?: string;
  note?: string;
}

export interface AddToCartOptions {
  itemId?: string;
  waterproof?: boolean;
  customImageUrl?: string;
  note?: string;
}

/** Identity of a cart line: same product + item + waterproof merge together. */
export function cartLineKey(l: Pick<CartLine, "id" | "itemId" | "waterproof">): string {
  return `${l.id}::${l.itemId ?? ""}::${l.waterproof ? "wp" : ""}`;
}

export interface AnnouncementSettings {
  ar: string;
  en: string;
  active: boolean;
}

interface StoreContextValue {
  // language
  lang: Lang;
  dir: "rtl" | "ltr";
  toggleLang: () => void;
  t: (key: DictKey) => string;
  // catalog (fetched server-side, injected here)
  products: Product[];
  categories: CategoryInfo[];
  fandoms: FandomInfo[];
  offers: Offer[];
  /** GLOBAL by-count price ladder, shared across packages/categories */
  volumeTiers: VolumeTier[];
  /** delivery fees + landing stats */
  siteSettings: SiteSettings;
  getProduct: (id: string) => Product | undefined;
  categoryLabel: (code: string) => string;
  /** display-only pricing for a cart line (server recomputes at checkout) */
  pricingFor: (line: CartLine) => LinePricing;
  // announcement bar
  announcement: string | null;
  announcementSettings: AnnouncementSettings;
  setAnnouncementSettings: (next: AnnouncementSettings) => void;
  // cart
  cart: CartLine[];
  cartCount: number;
  cartSubtotal: number;
  addToCart: (id: string, qty?: number, opts?: AddToCartOptions) => void;
  setQty: (lineKey: string, qty: number) => void;
  removeFromCart: (lineKey: string) => void;
  clearCart: () => void;
  /** custom design requests queued in the cart alongside products */
  customRequests: CustomCartRequest[];
  addCustomRequest: (req: Omit<CustomCartRequest, "id">) => void;
  removeCustomRequest: (id: string) => void;
  // wishlist
  wishlist: string[];
  isWished: (id: string) => boolean;
  toggleWish: (id: string) => void;
  // cart drawer
  cartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  // quick view modal
  quickView: Product | null;
  openQuickView: (id: string) => void;
  closeQuickView: () => void;
  // custom design request modal
  customPricing: CustomPricing[];
  customOpen: boolean;
  openCustom: () => void;
  closeCustom: () => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

const LS = {
  lang: "rofoof.lang",
  cart: "rofoof.cart",
  wish: "rofoof.wish",
  custom: "rofoof.custom",
};

export function StoreProvider({
  children,
  products,
  categories,
  fandoms,
  offers,
  volumeTiers,
  siteSettings,
  customPricing,
  initialAnnouncement,
}: {
  children: ReactNode;
  products: Product[];
  categories: CategoryInfo[];
  fandoms: FandomInfo[];
  offers: Offer[];
  volumeTiers: VolumeTier[];
  siteSettings: SiteSettings;
  customPricing: CustomPricing[];
  initialAnnouncement: AnnouncementSettings | null;
}) {
  const { user } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [lang, setLang] = useState<Lang>("ar");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customRequests, setCustomRequests] = useState<CustomCartRequest[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [quickViewId, setQuickViewId] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [ann, setAnn] = useState<AnnouncementSettings>(
    initialAnnouncement ?? { ar: "", en: "", active: false },
  );

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const getProduct = useCallback((id: string) => productMap.get(id), [productMap]);

  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.code, c])), [categories]);

  // --- hydrate persisted state from localStorage
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const storedLang = localStorage.getItem(LS.lang) as Lang | null;
      const storedCart = localStorage.getItem(LS.cart);
      const storedWish = localStorage.getItem(LS.wish);
      const storedCustom = localStorage.getItem(LS.custom);
      if (storedLang) setLang(storedLang);
      if (storedCart) setCart(JSON.parse(storedCart));
      if (storedWish) setWishlist(JSON.parse(storedWish));
      if (storedCustom) setCustomRequests(JSON.parse(storedCustom));
    } catch {
      /* ignore */
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // --- reflect language / direction onto <html>
  const dir = lang === "ar" ? "rtl" : "ltr";
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    try {
      localStorage.setItem(LS.lang, lang);
    } catch {}
  }, [lang, dir]);

  // --- persist cart / wishlist
  useEffect(() => {
    try {
      localStorage.setItem(LS.cart, JSON.stringify(cart));
    } catch {}
  }, [cart]);
  useEffect(() => {
    try {
      localStorage.setItem(LS.custom, JSON.stringify(customRequests));
    } catch {}
  }, [customRequests]);
  useEffect(() => {
    try {
      localStorage.setItem(LS.wish, JSON.stringify(wishlist));
    } catch {}
  }, [wishlist]);

  // --- lock body scroll while an overlay is open
  useEffect(() => {
    const open = cartOpen || quickViewId !== null;
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [cartOpen, quickViewId]);

  // --- keep favorites scoped to the signed-in account (never leak between
  // users sharing a browser — e.g. an admin testing, then a real customer).
  // On login: the DB is authoritative. A *guest's* pre-login picks on this
  // device are merged in once (a nice-to-have); anything left over from a
  // *previous different account*'s session is discarded, not merged.
  // On logout: wipe the wishlist from this device so it can't bleed into
  // whichever account signs in here next.
  const userId = user?.id;
  const prevUserIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const previousUserId = prevUserIdRef.current;
    prevUserIdRef.current = userId;

    if (!userId) {
      if (previousUserId) {
        setWishlist([]);
        setCart([]);
        try {
          localStorage.removeItem(LS.wish);
          localStorage.removeItem(LS.cart);
        } catch {}
      }
      return;
    }

    let active = true;
    (async () => {
      const { data } = await supabase.from("favorites").select("product_id");
      if (!active || !data) return;
      const remote = data.map((r) => r.product_id);
      setWishlist((local) => {
        // Only trust locally-stored picks if this is a fresh guest→user
        // login; a user→user transition means `local` belongs to someone else.
        const guestPicks = previousUserId ? [] : local;
        const union = Array.from(new Set([...guestPicks, ...remote]));
        const missing = guestPicks.filter((id) => !remote.includes(id));
        if (missing.length > 0) {
          void supabase
            .from("favorites")
            .upsert(missing.map((id) => ({ user_id: userId, product_id: id })));
        }
        return union;
      });
    })();
    return () => {
      active = false;
    };
  }, [userId, supabase]);

  const toggleLang = useCallback(() => setLang((l) => (l === "ar" ? "en" : "ar")), []);
  const t = useCallback((key: DictKey) => translate(key, lang), [lang]);

  const categoryLabel = useCallback(
    (code: string) => {
      const c = categoryMap.get(code);
      if (!c) return code;
      return lang === "ar" ? c.nameAr : c.nameEn;
    },
    [categoryMap, lang],
  );

  const addToCart = useCallback((id: string, qty = 1, opts?: AddToCartOptions) => {
    setCart((prev) => {
      const next: CartLine = {
        id,
        itemId: opts?.itemId,
        qty,
        waterproof: opts?.waterproof,
        customImageUrl: opts?.customImageUrl,
        note: opts?.note,
      };
      const key = cartLineKey(next);
      const existing = prev.find((l) => cartLineKey(l) === key);
      if (existing) {
        return prev.map((l) =>
          cartLineKey(l) === key
            ? {
                ...l,
                qty: l.qty + qty,
                note: opts?.note ?? l.note,
                customImageUrl: opts?.customImageUrl ?? l.customImageUrl,
              }
            : l,
        );
      }
      return [...prev, next];
    });
  }, []);

  const setQty = useCallback((lineKey: string, qty: number) => {
    setCart((prev) =>
      qty <= 0
        ? prev.filter((l) => cartLineKey(l) !== lineKey)
        : prev.map((l) => (cartLineKey(l) === lineKey ? { ...l, qty } : l)),
    );
  }, []);

  const removeFromCart = useCallback((lineKey: string) => {
    setCart((prev) => prev.filter((l) => cartLineKey(l) !== lineKey));
  }, []);

  /** Clears products AND queued custom requests — used after a successful order. */
  const clearCart = useCallback(() => {
    setCart([]);
    setCustomRequests([]);
  }, []);

  const addCustomRequest = useCallback((req: Omit<CustomCartRequest, "id">) => {
    setCustomRequests((prev) => [...prev, { ...req, id: crypto.randomUUID() }]);
  }, []);

  const removeCustomRequest = useCallback((id: string) => {
    setCustomRequests((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const isWished = useCallback((id: string) => wishlist.includes(id), [wishlist]);
  const toggleWish = useCallback(
    (id: string) => {
      setWishlist((prev) => {
        const has = prev.includes(id);
        // mirror to the DB for signed-in users (best effort)
        if (userId) {
          if (has) {
            void supabase.from("favorites").delete().eq("user_id", userId).eq("product_id", id);
          } else {
            void supabase.from("favorites").upsert({ user_id: userId, product_id: id });
          }
        }
        return has ? prev.filter((w) => w !== id) : [...prev, id];
      });
    },
    [userId, supabase],
  );

  const openCart = useCallback(() => setCartOpen(true), []);
  const closeCart = useCallback(() => setCartOpen(false), []);
  const openQuickView = useCallback((id: string) => setQuickViewId(id), []);
  const closeQuickView = useCallback(() => setQuickViewId(null), []);
  const openCustom = useCallback(() => setCustomOpen(true), []);
  const closeCustom = useCallback(() => setCustomOpen(false), []);

  const setAnnouncementSettings = useCallback((next: AnnouncementSettings) => setAnn(next), []);

  // Total count of volume-priced pieces across the WHOLE cart. Mirrors the
  // server, so items picked from different packages/categories accumulate into
  // one shared tier (1 from pack A + 2 from pack B → the 3-piece price).
  const volumeCount = useMemo(
    () =>
      cart.reduce((n, l) => {
        const p = productMap.get(l.id);
        return p?.volumePriced ? n + l.qty : n;
      }, 0),
    [cart, productMap],
  );

  // Display-only pricing per line (volume ladder, tiers, item price, flash %,
  // fixed off, waterproof surcharge, bundle freebies). place_order recomputes.
  const pricingFor = useCallback(
    (line: CartLine): LinePricing => {
      const p = productMap.get(line.id);
      if (!p) return { unit: 0, free: 0, total: 0 };
      const item = line.itemId ? p.items.find((i) => i.id === line.itemId) ?? null : null;
      const volumeUnit = p.volumePriced
        ? volumeUnitPrice(volumeCount, volumeTiers) ?? undefined
        : undefined;
      return linePricing(p, line.qty, { item, waterproof: line.waterproof, volumeUnit }, offers);
    },
    [productMap, offers, volumeCount, volumeTiers],
  );

  // Counts/totals span products AND queued custom requests (one piece per
  // uploaded image), so the badge and cart summary reflect the whole basket.
  const cartCount = useMemo(
    () =>
      cart.reduce((n, l) => n + l.qty, 0) +
      customRequests.reduce((n, r) => n + r.images.length, 0),
    [cart, customRequests],
  );
  const cartSubtotal = useMemo(
    () =>
      cart.reduce((sum, l) => sum + pricingFor(l).total, 0) +
      customRequests.reduce((sum, r) => sum + r.unitPrice * r.images.length, 0),
    [cart, customRequests, pricingFor],
  );
  const quickView = quickViewId ? productMap.get(quickViewId) ?? null : null;

  const announcement = useMemo(() => {
    if (!ann.active) return null;
    const text = lang === "ar" ? ann.ar : ann.en;
    return text?.trim() ? text : null;
  }, [ann, lang]);

  const value: StoreContextValue = {
    lang,
    dir,
    toggleLang,
    t,
    products,
    categories,
    fandoms,
    offers,
    volumeTiers,
    siteSettings,
    getProduct,
    categoryLabel,
    pricingFor,
    announcement,
    announcementSettings: ann,
    setAnnouncementSettings,
    cart,
    cartCount,
    cartSubtotal,
    addToCart,
    setQty,
    removeFromCart,
    clearCart,
    customRequests,
    addCustomRequest,
    removeCustomRequest,
    wishlist,
    isWished,
    toggleWish,
    cartOpen,
    openCart,
    closeCart,
    quickView,
    openQuickView,
    closeQuickView,
    customPricing,
    customOpen,
    openCustom,
    closeCustom,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within <StoreProvider>");
  return ctx;
}
