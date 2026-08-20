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
 *
 * v3: the walkthrough gained the search-and-filters step and a second step that
 * is always there, and it no longer stalls on a section the admin has switched
 * off. Everyone who already sat through v2 is opted back in once, on purpose —
 * a tour nobody is shown is not a tour.
 *
 * v4: the store's filters were split into two boxes that multiply together, and
 * the one step covering them was split to match. Not bumped for the shorter
 * copy — bumped because the shop now works differently, and someone who took
 * the v3 tour was taught a filter that no longer behaves the way they were told.
 */
export const TOUR_DONE_KEY = "rofoof_tour_completed_v4";

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
 * What to call each page the walkthrough can take someone to.
 *
 * Read by the travel veil, which names the destination out loud rather than
 * letting the page swap underneath the visitor: a tour that silently moved from
 * the home page to the store left people unsure whether they had been navigated
 * or the site had reloaded. Reuses the nav labels, so the veil says the same
 * word the tab bar does.
 */
export const ROUTE_LABELS: Record<string, DictKey> = {
  "/": "nav.home",
  "/store": "nav.store",
};

/**
 * The walkthrough, in the order a visitor actually meets the shop.
 *
 * It starts where they landed — the home page gets explained before anyone is
 * taken anywhere — and only then moves to the store. Grouped by route so the
 * whole tour costs exactly one navigation, which matters on the connections this
 * shop is used over: four stops on `/`, five on `/store`, then three on whatever
 * page the visitor is left on.
 *
 * `optional` stops are resolved against the live DOM the moment the tour reaches
 * their page, not when it reaches them — see the tour provider. That is what
 * keeps the step counter honest: a switched-off banner is dropped from the
 * running order before step one is drawn, rather than leaving a gap the visitor
 * watches the tour fall into.
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
    // Always here, which is the point: this slot used to hold the delivery
    // banner alone, and every shop with that banner switched off simply had no
    // second step — the walkthrough went from "welcome" to the product rails
    // with a hole where an explanation should be. The hero's own buttons cannot
    // be switched off, so the second thing a visitor is told is never nothing.
    id: "start",
    target: "#tour-hero-actions",
    route: "/",
    titleKey: "tour.start.title",
    bodyKey: "tour.start.body",
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
    // Straight after the catalogue, because narrowing it down is the next thing
    // anyone does to it — and before the product-card step, so the shopper knows
    // how to find an item before being shown what to do with one.
    //
    // Two stops, not one. Search, sort, the drawer and the two category boxes
    // used to share a step, and covering all of it took a paragraph nobody
    // finishes reading standing in a shop — the split point is that these are
    // two different tools: one finds a thing you can name, the other narrows a
    // catalogue you are browsing.
    id: "filters",
    target: "#tour-toolbar",
    route: "/store",
    titleKey: "tour.filters.title",
    bodyKey: "tour.filters.body",
  },
  {
    // The half most people actually reach for, and the only part that needs
    // teaching rather than labelling: nothing on screen says the red box and
    // the blue box multiply together.
    id: "categories",
    target: "#tour-categories",
    route: "/store",
    titleKey: "tour.categories.title",
    bodyKey: "tour.categories.body",
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
