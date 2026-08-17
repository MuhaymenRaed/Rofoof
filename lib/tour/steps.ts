import type { DictKey } from "@/lib/i18n";

/**
 * Set once the visitor has been through the walkthrough (or dismissed it), so
 * it never auto-runs a second time. Deliberately a plain, readable key: it is
 * the one piece of tour state a person might want to clear by hand.
 *
 * VERSIONED, and the suffix is load-bearing. The first build could mark the tour
 * complete without ever showing it — a step whose target hadn't rendered yet was
 * skipped, and skipping the last one still wrote this flag. Every browser that
 * hit that path was left permanently opted out of a tour it had never seen.
 * Bumping the suffix is what gives those visitors (and anyone who tested the
 * broken build) the walkthrough back. Bump it again only to deliberately
 * re-show the tour to everyone.
 */
export const TOUR_DONE_KEY = "rofoof_tour_completed_v2";

export interface TourStep {
  /** stable key for React and for the engine's per-step state */
  id: string;
  /**
   * Selector for the element to spotlight. The engine takes the first VISIBLE
   * match, not the first match — that is what lets one step point at the header
   * control on desktop and the bottom tab-bar control on phones without either
   * duplicating an `id` (invalid HTML) or branching on a breakpoint in JS.
   */
  target: string;
  titleKey: DictKey;
  bodyKey: DictKey;
  /**
   * The step's target only exists on this route. The engine navigates there and
   * waits for the element before drawing anything, so a step never points at
   * empty space mid-navigation.
   */
  route?: string;
  /**
   * This target may legitimately not be on the page — the delivery banner is
   * switchable from the dashboard, and the custom-order card only exists on the
   * first page of the store. Such a step gets a much shorter grace period before
   * being passed over, so a switched-off section doesn't leave the visitor
   * staring at a scrim for several seconds waiting for something that is never
   * coming.
   */
  optional?: boolean;
}

/**
 * The walkthrough, in the order a visitor actually meets the shop.
 *
 * It starts where they landed — the home page gets explained before anyone is
 * taken anywhere — and only then moves to the store. Grouped by route so the
 * whole tour costs exactly one navigation, which matters on the connections this
 * shop is used over: three steps on `/`, two on `/store`, then two on whatever
 * page the visitor is left on.
 */
export const TOUR_STEPS: TourStep[] = [
  {
    // Where they already are. Says what the shop is before showing anything.
    id: "welcome",
    target: "#tour-hero",
    route: "/",
    titleKey: "tour.welcome.title",
    bodyKey: "tour.welcome.body",
  },
  {
    id: "delivery",
    target: "#tour-delivery",
    route: "/",
    // The admin can switch this banner off from the dashboard.
    optional: true,
    titleKey: "tour.delivery.title",
    bodyKey: "tour.delivery.body",
  },
  {
    id: "rails",
    target: "#tour-rails",
    route: "/",
    // Absent until the shop has sales or a curated rail to show.
    optional: true,
    titleKey: "tour.rails.title",
    bodyKey: "tour.rails.body",
  },
  {
    id: "catalog",
    target: "#tour-catalog",
    route: "/store",
    titleKey: "tour.catalog.title",
    bodyKey: "tour.catalog.body",
  },
  {
    // The first card, standing in for all of them: this is where the tour
    // explains the three things you can do to a product.
    id: "order",
    target: '[data-tour="product-card"]',
    route: "/store",
    optional: true,
    titleKey: "tour.order.title",
    bodyKey: "tour.order.body",
  },
  {
    id: "favorites",
    target: '[data-tour="favorites"]',
    titleKey: "tour.favorites.title",
    bodyKey: "tour.favorites.body",
  },
  {
    id: "custom",
    target: "#tour-custom-order",
    route: "/store",
    // Only rendered on the first page of the store grid.
    optional: true,
    titleKey: "tour.custom.title",
    bodyKey: "tour.custom.body",
  },
  {
    // Header button on desktop, tab-bar button on phones — no route, both are
    // present on every page.
    id: "cart",
    target: '[data-tour="cart"]',
    titleKey: "tour.cart.title",
    bodyKey: "tour.cart.body",
  },
  {
    id: "profile",
    target: '[data-tour="profile"]',
    titleKey: "tour.profile.title",
    bodyKey: "tour.profile.body",
  },
  {
    // Last, and pointing at the way back in. The tour auto-runs once and never
    // again, so the closing step's job is to make sure the visitor knows where
    // it lives — being told about the button while looking straight at it beats
    // being told after it has disappeared.
    id: "replay",
    target: '[data-tour="replay"]',
    titleKey: "tour.replay.title",
    bodyKey: "tour.replay.body",
  },
];
