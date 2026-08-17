"use client";

/**
 * Starburst theme reveal, built on the View Transitions API.
 *
 * The new theme is clipped out of its own snapshot as a star that expands from
 * wherever the toggle was pressed, so the switch reads as coming FROM the
 * button rather than happening to the whole page at once. The paired CSS lives
 * in app/globals.css under `.theme-burst`.
 *
 * Everything here degrades to a plain theme swap: an unsupported browser, a
 * visitor who asked for less motion, or a transition the browser abandons all
 * end with the theme changed and nothing animated.
 */

/** Points on the star. 12 reads as a sparkle; fewer looks like a cut gem. */
const POINTS = 12;
/**
 * Inner vertices sit at half the outer radius. Held constant through the
 * animation (both radii scale from 0 together), so the star keeps its shape as
 * it grows instead of unfurling from a circle.
 */
const INNER_RATIO = 0.5;
const DURATION_MS = 500;
const EASING = "cubic-bezier(0.25, 1, 0.5, 1)";
/** Scopes the pseudo-element overrides in globals.css to this transition only. */
const TRANSITION_CLASS = "theme-burst";

/**
 * Minimal shape of what we use — `startViewTransition` isn't in every
 * TypeScript DOM lib yet, and declaring it globally would claim it exists on
 * browsers where it doesn't.
 */
interface ViewTransitionLike {
  ready: Promise<void>;
  finished: Promise<void>;
}
type StartViewTransition = (
  callback: () => void | Promise<void>,
) => ViewTransitionLike;

function startViewTransition(): StartViewTransition | null {
  if (typeof document === "undefined") return null;
  const fn = (document as unknown as { startViewTransition?: StartViewTransition })
    .startViewTransition;
  return typeof fn === "function" ? fn.bind(document) : null;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * A star as a `clip-path: polygon()`, centred on (x, y) in viewport pixels.
 *
 * Both keyframes must come out of this with the SAME vertex count or the
 * browser can't interpolate between them and falls back to a hard cut.
 */
export function starburstPolygon(
  x: number,
  y: number,
  outer: number,
  inner: number,
  points = POINTS,
): string {
  const vertices: string[] = [];
  const total = points * 2;
  for (let i = 0; i < total; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    // Start at -90° so a point faces straight up rather than sideways.
    const angle = (Math.PI * 2 * i) / total - Math.PI / 2;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    vertices.push(`${px.toFixed(1)}px ${py.toFixed(1)}px`);
  }
  return `polygon(${vertices.join(", ")})`;
}

/**
 * Distance from (x, y) to the furthest corner of the viewport — how far the
 * star's INNER vertices have to travel for the screen to be fully covered. The
 * outer points then reach `/ INNER_RATIO` beyond that, off-screen, which is
 * what leaves no gap between the star's arms at the end of the sweep.
 */
function coverRadius(x: number, y: number): number {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return Math.hypot(Math.max(x, w - x), Math.max(y, h - y));
}

/**
 * Guard against overlapping transitions. Starting a second one mid-flight makes
 * the browser skip the first, which shows as the page snapping to the new theme
 * and then wiping in again — worse than ignoring the extra press.
 */
let running = false;

/**
 * Wait until `apply`'s effect has actually reached the DOM.
 *
 * next-themes writes the theme class from a passive effect, not from `setTheme`
 * itself, so the class is still the OLD one when `setTheme` returns. Capturing
 * the "new" snapshot at that moment would photograph the old theme twice and
 * animate nothing. Polling the class is bounded and needs no knowledge of
 * next-themes' internals — resolving on timeout simply means the transition
 * animates whatever did land.
 *
 * Polled on a TIMER, deliberately, not requestAnimationFrame. This runs inside
 * the view transition's update callback, where the document's rendering is
 * suppressed — so leaning on animation frames risks never being called back,
 * and since the timeout is checked inside the callback, the promise would never
 * settle and the transition would hang with the theme half-applied. Timers fire
 * regardless.
 */
const POLL_MS = 8;

function waitForClass(className: string, timeoutMs = 250): Promise<void> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      if (document.documentElement.classList.contains(className) || Date.now() > deadline) {
        resolve();
        return;
      }
      setTimeout(check, POLL_MS);
    };
    setTimeout(check, POLL_MS);
  });
}

export interface ThemeBurstOptions {
  /** click coordinates, relative to the viewport */
  x: number;
  y: number;
  /** the class next-themes will put on <html> — waited for before capturing */
  nextClass: string;
  /** performs the theme change */
  apply: () => void;
}

export async function runThemeBurst({
  x,
  y,
  nextClass,
  apply,
}: ThemeBurstOptions): Promise<void> {
  const start = startViewTransition();

  // No API, reduced motion, or a transition already in flight: change the theme
  // and be done. The swap itself is never conditional on the animation.
  if (!start || prefersReducedMotion() || running) {
    apply();
    return;
  }

  running = true;
  const root = document.documentElement;
  root.classList.add(TRANSITION_CLASS);

  let transition: ViewTransitionLike;
  try {
    transition = start(async () => {
      apply();
      await waitForClass(nextClass);
    });
  } catch {
    // Throwing here means no transition was created, so nothing was captured
    // and nothing needs cleaning up beyond our own class.
    root.classList.remove(TRANSITION_CLASS);
    running = false;
    apply();
    return;
  }

  try {
    // Rejects when the browser skips the transition (a hidden tab, a competing
    // one). The theme has still changed by then — only the animation is lost.
    await transition.ready;

    const radius = coverRadius(x, y);
    root.animate(
      {
        clipPath: [
          starburstPolygon(x, y, 0, 0),
          starburstPolygon(x, y, radius / INNER_RATIO, radius),
        ],
      },
      {
        duration: DURATION_MS,
        easing: EASING,
        // The star is cut out of the INCOMING snapshot, which sits above the
        // outgoing one — so the new theme is revealed rather than the old one
        // being erased to whatever is behind the page.
        pseudoElement: "::view-transition-new(root)",
      },
    );
  } catch {
    /* skipped — the theme is already correct, there is just no sweep */
  }

  try {
    await transition.finished;
  } catch {
    /* ignore */
  } finally {
    root.classList.remove(TRANSITION_CLASS);
    running = false;
  }
}
