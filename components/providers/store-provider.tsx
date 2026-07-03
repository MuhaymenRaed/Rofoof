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
import { effectivePrice, type CategoryInfo, type FandomInfo, type Product } from "@/lib/products";
import { useAuth } from "@/components/providers/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export interface CartLine {
  id: string;
  qty: number;
  note?: string;
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
  getProduct: (id: string) => Product | undefined;
  categoryLabel: (code: string) => string;
  // announcement bar
  announcement: string | null;
  announcementSettings: AnnouncementSettings;
  setAnnouncementSettings: (next: AnnouncementSettings) => void;
  // cart
  cart: CartLine[];
  cartCount: number;
  cartSubtotal: number;
  addToCart: (id: string, qty?: number, note?: string) => void;
  setQty: (id: string, qty: number) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
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
}

const StoreContext = createContext<StoreContextValue | null>(null);

const LS = { lang: "rofoof.lang", cart: "rofoof.cart", wish: "rofoof.wish" };

export function StoreProvider({
  children,
  products,
  categories,
  fandoms,
  initialAnnouncement,
}: {
  children: ReactNode;
  products: Product[];
  categories: CategoryInfo[];
  fandoms: FandomInfo[];
  initialAnnouncement: AnnouncementSettings | null;
}) {
  const { user } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [lang, setLang] = useState<Lang>("ar");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [quickViewId, setQuickViewId] = useState<string | null>(null);
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
      if (storedLang) setLang(storedLang);
      if (storedCart) setCart(JSON.parse(storedCart));
      if (storedWish) setWishlist(JSON.parse(storedWish));
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

  const addToCart = useCallback((id: string, qty = 1, note?: string) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.id === id);
      if (existing) {
        return prev.map((l) => (l.id === id ? { ...l, qty: l.qty + qty, note: note ?? l.note } : l));
      }
      return [...prev, { id, qty, note }];
    });
  }, []);

  const setQty = useCallback((id: string, qty: number) => {
    setCart((prev) =>
      qty <= 0 ? prev.filter((l) => l.id !== id) : prev.map((l) => (l.id === id ? { ...l, qty } : l)),
    );
  }, []);

  const removeFromCart = useCallback((id: string) => {
    setCart((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

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

  const setAnnouncementSettings = useCallback((next: AnnouncementSettings) => setAnn(next), []);

  const cartCount = useMemo(() => cart.reduce((n, l) => n + l.qty, 0), [cart]);
  const cartSubtotal = useMemo(
    () =>
      cart.reduce((sum, l) => {
        const p = productMap.get(l.id);
        return sum + (p ? effectivePrice(p) : 0) * l.qty;
      }, 0),
    [cart, productMap],
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
    getProduct,
    categoryLabel,
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
    wishlist,
    isWished,
    toggleWish,
    cartOpen,
    openCart,
    closeCart,
    quickView,
    openQuickView,
    closeQuickView,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within <StoreProvider>");
  return ctx;
}
