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
}

/**
 * The four things a first-time shopper needs to find: what we sell, that they
 * can send their own designs, where the basket is, and why saving their details
 * is worth it.
 *
 * Ordered so the two store-page steps are adjacent — that way the whole tour
 * costs at most one navigation, which matters on the connections this shop is
 * used over.
 */
export const TOUR_STEPS: TourStep[] = [
  {
    id: "catalog",
    target: "#tour-catalog",
    route: "/store",
    titleKey: "tour.catalog.title",
    bodyKey: "tour.catalog.body",
  },
  {
    id: "custom",
    target: "#tour-custom-order",
    route: "/store",
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
];
