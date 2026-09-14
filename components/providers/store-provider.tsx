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
  FeaturedGroup,
  ManualCartOrder,
  Offer,
  Product,
  SiteSettings,
  SubcategoryInfo,
  VolumeTier,
} from "@/lib/products";
import { stockCeilingFor } from "@/lib/products";
import {
  customRequestTotal,
  linePricing,
  volumeUnitPrice,
  type LinePricing,
} from "@/lib/pricing";
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

/**
 * A line the catalogue no longer offers, kept only long enough to explain
 * itself. See "Cart vs. the catalogue" in the provider for why it exists.
 */
export interface RemovedCartLine {
  /** Product name when we still have it; null when the product itself is gone. */
  nameAr: string | null;
  nameEn: string | null;
}

export interface AddToCartOptions {
  itemId?: string;
  waterproof?: boolean;
  customImageUrl?: string;
  note?: string;
}

/**
 * Hard ceiling on one line's quantity. place_order() clamps with
 * `least(99, qty)` and the checkout schema clamps to match, so the cart has to
 * stop here too — otherwise the stepper shows 150 and the order is placed for
 * 99, which the shopper only discovers on the invoice.
 */
export const MAX_LINE_QTY = 99;

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
  /** second-level taxonomy nested under categories (third store filter) */
  subcategories: SubcategoryInfo[];
  fandoms: FandomInfo[];
  /** admin-made home-page showcase rails (drives the star picker on cards) */
  featuredGroups: FeaturedGroup[];
  offers: Offer[];
  /** GLOBAL by-count price ladder, shared across packages/categories */
  volumeTiers: VolumeTier[];
  /** delivery fees + landing stats */
  siteSettings: SiteSettings;
  /**
   * Wall clock for offer expiry, or null until mounted. Reading the clock while
   * the page prerenders is not allowed, so anything rendered there (product
   * cards) trusts the server's offer snapshot first and re-checks on mount.
   */
  now: number | null;
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
  /** Lines dropped because the catalogue stopped offering them. */
  removedLines: RemovedCartLine[];
  /** Acknowledge the removal notice. */
  clearRemovedLines: () => void;
  /**
   * Drop every line carrying this product id or design uuid. Called when
   * checkout itself reports one as unavailable — see placeOrderAction.
   */
  dropUnavailable: (id: string) => boolean;
  /** custom design requests queued in the cart alongside products */
  customRequests: CustomCartRequest[];
  addCustomRequest: (req: Omit<CustomCartRequest, "id">) => void;
  removeCustomRequest: (id: string) => void;
  /** admin-only manual order lines queued in the cart */
  manualOrders: ManualCartOrder[];
  addManualOrder: (order: Omit<ManualCartOrder, "id">) => void;
  removeManualOrder: (id: string) => void;
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
  // admin-only manual order modal
  manualOpen: boolean;
  openManual: () => void;
  closeManual: () => void;
}

/* ---------------------------- Context splitting ---------------------------
 * One context carrying all of this would re-render every consumer whenever any
 * part of it changed — and `ProductCard` is a consumer, of which a busy page has
 * over a hundred. Opening the cart drawer, adding a line, or the offer clock
 * ticking once a minute all used to re-render every card on screen, each one
 * re-running discountView() over every live offer. That is the site's lag.
 *
 * So the value is split by how often each part changes, and components subscribe
 * only to what they actually read. The split is what makes the cheap
 * interactions cheap; `useStore()` below still exposes the whole thing for the
 * many components where a re-render costs nothing.
 * ------------------------------------------------------------------------- */

/** Callbacks. Stable for the life of the session, so this never invalidates. */
type ActionsValue = Pick<
  StoreContextValue,
  | "toggleLang"
  | "addToCart"
  | "setQty"
  | "removeFromCart"
  | "clearCart"
  | "clearRemovedLines"
  | "dropUnavailable"
  | "addCustomRequest"
  | "removeCustomRequest"
  | "addManualOrder"
  | "removeManualOrder"
  | "toggleWish"
  | "openCart"
  | "closeCart"
  | "openQuickView"
  | "closeQuickView"
  | "openCustom"
  | "closeCustom"
  | "openManual"
  | "closeManual"
  | "setAnnouncementSettings"
>;

/** Catalog + language + clock: server-injected or slow-moving. */
type CatalogValue = Pick<
  StoreContextValue,
  | "lang"
  | "dir"
  | "t"
  | "products"
  | "categories"
  | "subcategories"
  | "fandoms"
  | "featuredGroups"
  | "offers"
  | "volumeTiers"
  | "siteSettings"
  | "customPricing"
  | "now"
  | "getProduct"
  | "categoryLabel"
  | "announcement"
  | "announcementSettings"
>;

/** The basket. Changes on every quantity tap — deliberately narrow. */
type CartValue = Pick<
  StoreContextValue,
  | "cart"
  | "customRequests"
  | "manualOrders"
  | "cartCount"
  | "cartSubtotal"
  | "pricingFor"
  | "removedLines"
>;

/** Its own context so hearting one product doesn't touch the cart's consumers. */
type WishlistValue = Pick<StoreContextValue, "wishlist" | "isWished">;

/** Overlay flags. Separated from the openers, which are stable actions. */
type UiValue = Pick<StoreContextValue, "cartOpen" | "quickView" | "customOpen" | "manualOpen">;

const ActionsContext = createContext<ActionsValue | null>(null);
const CatalogContext = createContext<CatalogValue | null>(null);
const CartContext = createContext<CartValue | null>(null);
const WishlistContext = createContext<WishlistValue | null>(null);
const UiContext = createContext<UiValue | null>(null);

function useCtx<T>(ctx: React.Context<T | null>, name: string): T {
  const value = useContext(ctx);
  if (!value) throw new Error(`${name} must be used within <StoreProvider>`);
  return value;
}

/** Stable callbacks only — subscribing to these never causes a re-render. */
export function useStoreActions(): ActionsValue {
  return useCtx(ActionsContext, "useStoreActions");
}

/** Catalog, language and the offer clock. */
export function useCatalog(): CatalogValue {
  return useCtx(CatalogContext, "useCatalog");
}

export function useCartState(): CartValue {
  return useCtx(CartContext, "useCartState");
}

export function useWishlist(): WishlistValue {
  return useCtx(WishlistContext, "useWishlist");
}

export function useUi(): UiValue {
  return useCtx(UiContext, "useUi");
}

const LS = {
  lang: "rofoof.lang",
  cart: "rofoof.cart",
  wish: "rofoof.wish",
  custom: "rofoof.custom",
  manual: "rofoof.manual",
};

export function StoreProvider({
  children,
  products,
  categories,
  subcategories,
  fandoms,
  featuredGroups = [],
  offers,
  volumeTiers,
  siteSettings,
  customPricing,
  initialAnnouncement,
}: {
  children: ReactNode;
  products: Product[];
  categories: CategoryInfo[];
  subcategories: SubcategoryInfo[];
  fandoms: FandomInfo[];
  featuredGroups?: FeaturedGroup[];
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
  const [manualOrders, setManualOrders] = useState<ManualCartOrder[]>([]);
  const [removedLines, setRemovedLines] = useState<RemovedCartLine[]>([]);
  /** Latest cart, readable from a stable callback without widening its deps. */
  const cartRef = useRef<CartLine[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  // Latest wishlist without making every consumer re-subscribe — lets the DB
  // sync read current state without living inside a state updater.
  const wishlistRef = useRef<string[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [quickViewId, setQuickViewId] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [ann, setAnn] = useState<AnnouncementSettings>(
    initialAnnouncement ?? { ar: "", en: "", active: false },
  );
  const [now, setNow] = useState<number | null>(null);

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
      const storedManual = localStorage.getItem(LS.manual);
      if (storedLang) setLang(storedLang);
      if (storedCart) setCart(JSON.parse(storedCart));
      if (storedWish) setWishlist(JSON.parse(storedWish));
      if (storedCustom) setCustomRequests(JSON.parse(storedCustom));
      if (storedManual) setManualOrders(JSON.parse(storedManual));
    } catch {
      /* ignore */
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* ------------------------- Cart vs. the catalogue -------------------------
   * A basket lives in localStorage indefinitely, and the catalogue moves under
   * it: hiding a product sets is_active=false (the admin's "delete" is a soft
   * one), and a package design can be retired on its own the same way. The
   * storefront only ever loads active, undeleted rows, so such a line stops
   * resolving — and the cart used to handle that by rendering NOTHING for it
   * (`if (!product) return null`) while still counting its qty in the badge,
   * pricing it at 0, and sending it to checkout anyway.
   *
   * place_order() looks every line up with `is_active and not is_deleted` and
   * raises `invalid_product` / `invalid_item`, which surfaced as the generic
   * "couldn't place the order, try again". The shopper could not act on it:
   * the line they had to remove was invisible, so every retry failed the same
   * way and the sale was lost.
   *
   * So drop those lines here, the moment the catalogue says they are gone, and
   * say so. The rest of the basket still checks out, which is the whole point.
   * ------------------------------------------------------------------------ */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // Never prune against a catalogue we failed to load. getProducts() degrades
    // to [] on any transient DB/network error (see lib/data/catalog.ts), and
    // pruning against that would empty every basket on the site over one blip.
    if (products.length === 0) return;

    const resolves = (l: CartLine) => {
      const p = productMap.get(l.id);
      if (!p) return false;
      // A design that was retired on its own: the product still stands, so the
      // line renders and looks normal — priced at the base product price —
      // and only checkout knows it can't be ordered.
      return !l.itemId || p.items.some((i) => i.id === l.itemId);
    };

    const gone = cart.filter((l) => !resolves(l));
    if (gone.length === 0) return;

    setCart((prev) => prev.filter(resolves));
    setRemovedLines((prev) => [
      ...prev,
      ...gone.map((l) => {
        const p = productMap.get(l.id);
        return { nameAr: p?.nameAr ?? null, nameEn: p?.nameEn ?? null };
      }),
    ]);
  }, [cart, products, productMap]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // --- real clock, once we're past the prerender (see `now` on the context).
  // Re-read every minute so a flash sale that lapses while the shopper is
  // browsing stops advertising a price they can no longer get.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
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
      cartRef.current = cart;
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
      localStorage.setItem(LS.manual, JSON.stringify(manualOrders));
    } catch {}
  }, [manualOrders]);
  useEffect(() => {
    wishlistRef.current = wishlist;
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
        // Manual lines are an admin-only instrument. Signing out has to take
        // them with it, or a queued one would still be sitting in the basket
        // for whoever uses this browser next — and place_order would refuse it
        // anyway, leaving them with a cart that can't be checked out.
        setManualOrders([]);
        try {
          localStorage.removeItem(LS.wish);
          localStorage.removeItem(LS.cart);
          localStorage.removeItem(LS.manual);
        } catch {}
      }
      return;
    }

    let active = true;
    (async () => {
      // favorites uses soft delete — un-hearted rows stay behind as is_deleted.
      const { data, error } = await supabase
        .from("favorites")
        .select("product_id")
        .eq("user_id", userId)
        .eq("is_deleted", false);
      if (error) {
        // Never silent: a rejected read/write here is exactly why favorites
        // could look saved until the next reload.
        console.error("[favorites] load failed:", error.message);
        return;
      }
      if (!active || !data) return;

      const remote = data.map((r) => r.product_id);
      // Only trust locally-stored picks on a fresh guest→user login; a
      // user→user transition means they belong to someone else.
      const guestPicks = previousUserId ? [] : wishlistRef.current;
      const missing = guestPicks.filter((id) => !remote.includes(id));
      setWishlist(Array.from(new Set([...guestPicks, ...remote])));

      if (missing.length > 0) {
        const { error: upErr } = await supabase
          .from("favorites")
          .upsert(
            missing.map((id) => ({
              user_id: userId,
              product_id: id,
              is_deleted: false,
              deleted_at: null,
            })),
          );
        if (upErr) console.error("[favorites] merging guest picks failed:", upErr.message);
      }
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

  const addToCart = useCallback(
    (id: string, qty = 1, opts?: AddToCartOptions) => {
      setCart((prev) => {
        const next: CartLine = {
          id,
          itemId: opts?.itemId,
          qty,
          waterproof: opts?.waterproof,
          customImageUrl: opts?.customImageUrl,
          note: opts?.note,
        };
        // Adding the same line again ADDS to it, so the ceiling has to be
        // checked on the way in too — otherwise pressing "add" five times gets
        // past a cap the stepper would have refused in one step.
        const ceiling = stockCeilingFor(productMap.get(id), opts?.itemId);
        const cap = (n: number) =>
          Math.min(ceiling == null ? n : Math.min(n, ceiling), MAX_LINE_QTY);
        const key = cartLineKey(next);
        const existing = prev.find((l) => cartLineKey(l) === key);
        if (existing) {
          return prev.map((l) =>
            cartLineKey(l) === key
              ? {
                  ...l,
                  qty: cap(l.qty + qty),
                  note: opts?.note ?? l.note,
                  customImageUrl: opts?.customImageUrl ?? l.customImageUrl,
                }
              : l,
          );
        }
        return [...prev, { ...next, qty: cap(qty) }];
      });
    },
    [productMap],
  );

  /**
   * Every quantity change in the cart funnels through here, which is why the
   * stock ceiling is enforced HERE rather than in the stepper. A cap that lives
   * in one control is a cap the next control forgets; this one holds however
   * the number is arrived at.
   */
  const setQty = useCallback(
    (lineKey: string, qty: number) => {
      setCart((prev) =>
        qty <= 0
          ? prev.filter((l) => cartLineKey(l) !== lineKey)
          : prev.map((l) => {
              if (cartLineKey(l) !== lineKey) return l;
              const ceiling = stockCeilingFor(productMap.get(l.id), l.itemId);
              return {
                ...l,
                qty: Math.min(
                  ceiling == null ? qty : Math.min(qty, ceiling),
                  MAX_LINE_QTY,
                ),
              };
            }),
      );
    },
    [productMap],
  );

  const removeFromCart = useCallback((lineKey: string) => {
    setCart((prev) => prev.filter((l) => cartLineKey(l) !== lineKey));
  }, []);

  const clearRemovedLines = useCallback(() => setRemovedLines([]), []);

  /**
   * Checkout's own verdict, which beats ours: the catalogue this browser holds
   * is cached for up to five minutes, so a product hidden a moment ago still
   * resolves here and the reconcile above keeps the line. place_order() names
   * the id it refused, and this drops it, so pressing Order again goes through
   * instead of failing identically until the cache turns over.
   *
   * Returns whether anything was actually removed, so a caller relying on this
   * to explain a failure can fall back when it explains nothing.
   */
  const dropUnavailable = useCallback((id: string) => {
    // Read through a ref, not the updater: appending the notice from inside a
    // setCart callback would run twice under StrictMode's double-invoke and
    // report one removal as two.
    const gone = cartRef.current.filter((l) => l.id === id || l.itemId === id);
    if (gone.length === 0) return false;
    setCart((prev) => prev.filter((l) => l.id !== id && l.itemId !== id));
    setRemovedLines((prev) => [
      ...prev,
      ...gone.map((l) => {
        const p = productMap.get(l.id);
        return { nameAr: p?.nameAr ?? null, nameEn: p?.nameEn ?? null };
      }),
    ]);
    return true;
  }, [productMap]);

  /**
   * Clears products, queued custom requests AND manual lines — used after a
   * successful order, so the whole basket goes at once.
   */
  const clearCart = useCallback(() => {
    setCart([]);
    setCustomRequests([]);
    setManualOrders([]);
  }, []);

  const addCustomRequest = useCallback((req: Omit<CustomCartRequest, "id">) => {
    setCustomRequests((prev) => [...prev, { ...req, id: crypto.randomUUID() }]);
  }, []);

  const removeCustomRequest = useCallback((id: string) => {
    setCustomRequests((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const addManualOrder = useCallback((order: Omit<ManualCartOrder, "id">) => {
    setManualOrders((prev) => [...prev, { ...order, id: crypto.randomUUID() }]);
  }, []);

  const removeManualOrder = useCallback((id: string) => {
    setManualOrders((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const isWished = useCallback((id: string) => wishlist.includes(id), [wishlist]);
  const toggleWish = useCallback(
    (id: string) => {
      setWishlist((prev) => {
        const has = prev.includes(id);
        return has ? prev.filter((w) => w !== id) : [...prev, id];
      });

      // Mirror to the DB outside the state updater (updaters must stay pure —
      // React can invoke them twice), and surface failures instead of hiding them.
      if (!userId) return;
      const wasWished = wishlistRef.current.includes(id);
      void (async () => {
        // Soft delete on remove, and un-delete on re-add (the row may already
        // exist from a previous un-heart).
        const { error } = wasWished
          ? await supabase
              .from("favorites")
              .update({ is_deleted: true, deleted_at: new Date().toISOString() })
              .eq("user_id", userId)
              .eq("product_id", id)
          : await supabase
              .from("favorites")
              .upsert({ user_id: userId, product_id: id, is_deleted: false, deleted_at: null });
        if (error) console.error("[favorites] sync failed:", error.message);
      })();
    },
    [userId, supabase],
  );

  const openCart = useCallback(() => setCartOpen(true), []);
  const closeCart = useCallback(() => setCartOpen(false), []);
  const openQuickView = useCallback((id: string) => setQuickViewId(id), []);
  const closeQuickView = useCallback(() => setQuickViewId(null), []);
  const openCustom = useCallback(() => setCustomOpen(true), []);
  const closeCustom = useCallback(() => setCustomOpen(false), []);
  const openManual = useCallback(() => setManualOpen(true), []);
  const closeManual = useCallback(() => setManualOpen(false), []);

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
      return linePricing(
        p,
        line.qty,
        { item, waterproof: line.waterproof, volumeUnit },
        offers,
        now,
      );
    },
    [productMap, offers, volumeCount, volumeTiers, now],
  );

  // Counts/totals span products, queued custom requests (one piece per uploaded
  // image) AND admin manual lines (one piece each), so the badge and cart
  // summary reflect the whole basket.
  const cartCount = useMemo(
    () =>
      cart.reduce((n, l) => n + l.qty, 0) +
      customRequests.reduce((n, r) => n + r.images.length, 0) +
      manualOrders.length,
    [cart, customRequests, manualOrders],
  );
  const cartSubtotal = useMemo(
    () =>
      cart.reduce((sum, l) => sum + pricingFor(l).total, 0) +
      customRequests.reduce((sum, r) => sum + customRequestTotal(r), 0) +
      manualOrders.reduce((sum, m) => sum + m.price, 0),
    [cart, customRequests, manualOrders, pricingFor],
  );
  const quickView = quickViewId ? productMap.get(quickViewId) ?? null : null;

  const announcement = useMemo(() => {
    if (!ann.active) return null;
    const text = lang === "ar" ? ann.ar : ann.en;
    return text?.trim() ? text : null;
  }, [ann, lang]);

  /* --------------------------- Memoized sub-values -------------------------
   * Each of these must only change when something it actually contains does.
   * An unmemoized object here would defeat the whole split — every consumer of
   * every context would re-render on every StoreProvider render, which is the
   * behaviour being fixed. */

  const actions = useMemo<ActionsValue>(
    () => ({
      toggleLang,
      addToCart,
      setQty,
      removeFromCart,
      clearCart,
      clearRemovedLines,
      dropUnavailable,
      addCustomRequest,
      removeCustomRequest,
      addManualOrder,
      removeManualOrder,
      toggleWish,
      openCart,
      closeCart,
      openQuickView,
      closeQuickView,
      openCustom,
      closeCustom,
      openManual,
      closeManual,
      setAnnouncementSettings,
    }),
    // Every entry is a useCallback; only addToCart/setQty (productMap) and
    // toggleWish (signed-in user) can change at all, and neither does during
    // ordinary browsing.
    [
      toggleLang,
      addToCart,
      setQty,
      removeFromCart,
      clearCart,
      clearRemovedLines,
      dropUnavailable,
      addCustomRequest,
      removeCustomRequest,
      addManualOrder,
      removeManualOrder,
      toggleWish,
      openCart,
      closeCart,
      openQuickView,
      closeQuickView,
      openCustom,
      closeCustom,
      openManual,
      closeManual,
      setAnnouncementSettings,
    ],
  );

  const catalog = useMemo<CatalogValue>(
    () => ({
      lang,
      dir,
      t,
      products,
      categories,
      subcategories,
      fandoms,
      featuredGroups,
      offers,
      volumeTiers,
      siteSettings,
      customPricing,
      now,
      getProduct,
      categoryLabel,
      announcement,
      announcementSettings: ann,
    }),
    [
      lang,
      dir,
      t,
      products,
      categories,
      subcategories,
      fandoms,
      featuredGroups,
      offers,
      volumeTiers,
      siteSettings,
      customPricing,
      now,
      getProduct,
      categoryLabel,
      announcement,
      ann,
    ],
  );

  const cartValue = useMemo<CartValue>(
    () => ({
      cart,
      customRequests,
      manualOrders,
      cartCount,
      cartSubtotal,
      pricingFor,
      removedLines,
    }),
    [
      cart,
      customRequests,
      manualOrders,
      cartCount,
      cartSubtotal,
      pricingFor,
      removedLines,
    ],
  );

  const wishlistValue = useMemo<WishlistValue>(
    () => ({ wishlist, isWished }),
    [wishlist, isWished],
  );

  const ui = useMemo<UiValue>(
    () => ({ cartOpen, quickView, customOpen, manualOpen }),
    [cartOpen, quickView, customOpen, manualOpen],
  );

  // Nesting order is irrelevant to correctness — they're independent — but the
  // stable one is outermost so it never re-renders the others.
  return (
    <ActionsContext.Provider value={actions}>
      <CatalogContext.Provider value={catalog}>
        <WishlistContext.Provider value={wishlistValue}>
          <CartContext.Provider value={cartValue}>
            <UiContext.Provider value={ui}>{children}</UiContext.Provider>
          </CartContext.Provider>
        </WishlistContext.Provider>
      </CatalogContext.Provider>
    </ActionsContext.Provider>
  );
}

/**
 * The whole store in one object.
 *
 * Subscribes to every context, so a consumer re-renders whenever ANY part of the
 * store changes. That is fine — and simplest — for the many components that
 * exist once on a page: modals, the header, the dashboard views. It is not fine
 * for anything rendered per product; those use the narrow hooks above, and
 * `ProductCard` is the reason they exist.
 */
export function useStore(): StoreContextValue {
  const actions = useStoreActions();
  const catalog = useCatalog();
  const cart = useCartState();
  const wishlist = useWishlist();
  const ui = useUi();
  return useMemo(
    () => ({ ...actions, ...catalog, ...cart, ...wishlist, ...ui }),
    [actions, catalog, cart, wishlist, ui],
  );
}
