"use client";

/**
 * Theme cross-fade, built on the View Transitions API.
 *
 * The new theme's snapshot fades in over the old one, which holds still
 * underneath. The paired CSS lives in app/globals.css under `.theme-swap`.
 *
 * This replaced a starburst: the incoming snapshot used to be clipped by a
 * twelve-pointed `polygon()` that grew from wherever the toggle was pressed,
 * animated over half a second. It looked lovely on a laptop and dragged badly
 * on the phones this shop is actually used on. A polygon clip-path is not a
 * compositor property — twenty-four vertices had to be re-rasterized against a
 * full-viewport layer on every frame, on top of the snapshot capture the API
 * already costs, which on a mid-range Android over a long store page meant a
 * visibly stuttering wipe every time someone touched the button.
 *
 * Opacity is a compositor property. The fade is handed to the GPU as-is, runs
 * off the main thread, and no longer cares how long the page underneath it is.
 * It is also shorter — a theme switch wants to feel instant, and 500ms of
 * anything is a wait.
 *
 * Everything here degrades to a plain theme swap: an unsupported browser, a
 * visitor who asked for less motion, or a transition the browser abandons all
 * end with the theme changed and nothing animated.
 */

/** Scopes the pseudo-element overrides in globals.css to this transition only. */
const TRANSITION_CLASS = "theme-swap";

/**
 * Minimal shape of what we use — `startViewTransition` isn't in every
 * TypeScript DOM lib yet, and declaring it globally would claim it exists on
 * browsers where it doesn't.
 */
interface ViewTransitionLike {
  ready: Promise<void>;
  finished: Promise<void>;
}
type StartViewTransition = (callback: () => void | Promise<void>) => ViewTransitionLike;

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
 * Guard against overlapping transitions. Starting a second one mid-flight makes
 * the browser skip the first, which shows as the page snapping to the new theme
 * and then fading in again — worse than ignoring the extra press.
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

export interface ThemeSwapOptions {
  /** the class next-themes will put on <html> — waited for before capturing */
  nextClass: string;
  /** performs the theme change */
  apply: () => void;
}

/**
 * No `root.animate()` call and no coordinates: the fade is declared entirely in
 * CSS, so this only has to open the transition, mark the root for the duration,
 * and clean up. One less script-driven animation on the main thread during the
 * one moment the browser is already busy compositing two full-page snapshots.
 */
export async function runThemeSwap({ nextClass, apply }: ThemeSwapOptions): Promise<void> {
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
    await transition.finished;
  } catch {
    /* skipped — the theme is already correct, there is just no fade */
  } finally {
    root.classList.remove(TRANSITION_CLASS);
    running = false;
  }
}
