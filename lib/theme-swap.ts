"use client";

/**
 * Theme cross-fade, built on the View Transitions API.
 *
 * The new theme's snapshot fades in over the old one, which holds still
 * underneath. The paired CSS lives in app/globals.css under `.theme-swap`.
 *
 * This replaced a starburst: the incoming snapshot used to be clipped by a
 * twelve-pointed `polygon()` that grew from wherever the toggle was pressed,
 * animated over half a second. A polygon clip-path is not a compositor
 * property — twenty-four vertices had to be re-rasterized against a
 * full-viewport layer on every frame, which on a mid-range phone meant a
 * visibly stuttering wipe every time someone touched the button. Opacity is a
 * compositor property: the fade is handed to the GPU and runs off the main
 * thread, so it no longer competes with whatever else the page is doing.
 *
 * Everything here degrades to a plain theme swap: an unsupported browser, a
 * visitor who asked for less motion, a device that has already shown it can't
 * afford the animation, or a transition the browser abandons all end with the
 * theme changed and nothing animated.
 */

/** Scopes the pseudo-element overrides in globals.css to this transition only. */
const TRANSITION_CLASS = "theme-swap";
/** Must match the `theme-fade` animation in app/globals.css. */
const DURATION_MS = 140;
/**
 * How much time on top of the fade this is allowed to cost before the animation
 * is abandoned for the rest of the session.
 *
 * The one part of a view transition that cannot be made cheap is the capture:
 * the browser has to rasterize the viewport twice before anything can move, and
 * on the home page — a hero carrying two very large blur glows, above a grid of
 * product photos — that is real work on a slow GPU. Rather than guess at device
 * class from `hardwareConcurrency` or `deviceMemory` (Safari under-reports one,
 * only Chromium has the other, and neither actually says how fast the thing
 * paints), the first swap is TIMED. If it blew the budget, this device has
 * proved it cannot afford the effect and every later swap on it is instant —
 * which is not a downgrade so much as the fastest a theme change can possibly
 * be.
 */
const BUDGET_MS = 260;

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
/** Cleared for the session once a swap has proved too expensive — see BUDGET_MS. */
let affordable = true;

/**
 * Put the theme on <html> ourselves, right now.
 *
 * This is the single biggest thing standing between a press and the fade, and
 * it used to be done by waiting instead. next-themes writes the class from a
 * passive effect rather than from `setTheme`, so the old code polled the
 * classList on an 8ms timer from inside the view transition's update callback —
 * where the document's rendering is SUSPENDED. Everything that happened in
 * there happened on a frozen screen: a React render, next-themes' effect, and
 * its `disableTransitionOnChange` forcing a synchronous full-document style and
 * layout pass via `getComputedStyle(document.body)`. On a short page that was a
 * stutter; on the home page, with the whole catalogue's first screen in the
 * document, it was the stall people actually complained about.
 *
 * Writing the two properties next-themes would have written — same class list,
 * same `colorScheme` — takes under a millisecond, so the callback returns
 * immediately and the browser can capture straight away. `setTheme` is still
 * called, for persistence and to keep React's copy honest; its effect then
 * re-applies exactly what is already there, and its reflow now lands AFTER the
 * capture, during a fade the compositor is running without the main thread.
 */
const THEMES = ["light", "dark"] as const;

/**
 * Applies the theme and returns the function that undoes the freeze.
 *
 * The freeze is not optional. next-themes injects a `transition: none`
 * stylesheet BEFORE it touches the class, precisely because nearly every
 * control in this app carries a Tailwind `transition` — flipping the palette
 * without it starts a colour animation on hundreds of elements at once. Writing
 * the class ourselves skips past that protection, so the same guard is put up
 * here first, and taken down once the swap has settled.
 */
function paintTheme(next: string): () => void {
  const freeze = document.createElement("style");
  freeze.appendChild(
    document.createTextNode("*,*::before,*::after{transition:none !important}"),
  );
  document.head.appendChild(freeze);

  const root = document.documentElement;
  root.classList.remove(...THEMES);
  root.classList.add(next);
  // next-themes sets this too (enableColorScheme defaults on). It is what tells
  // the browser to render form controls and scrollbars in the right theme.
  root.style.colorScheme = next;

  return () => {
    // Read once so the new colours are committed while transitions are still
    // off. Without it, removing the sheet is itself the moment the browser
    // first computes the change, and everything animates into it after all.
    void getComputedStyle(document.body).backgroundColor;
    freeze.remove();
  };
}

export interface ThemeSwapOptions {
  /** the theme class next-themes will settle on — `light` or `dark` */
  nextClass: string;
  /** performs the theme change (persistence + React state) */
  apply: () => void;
}

export async function runThemeSwap({ nextClass, apply }: ThemeSwapOptions): Promise<void> {
  const start = startViewTransition();

  // No API, reduced motion, a device that already failed the budget, or a
  // transition in flight: change the theme and be done. The swap itself is
  // never conditional on the animation.
  if (!start || !affordable || prefersReducedMotion() || running) {
    paintTheme(nextClass)();
    apply();
    return;
  }

  running = true;
  const root = document.documentElement;
  root.classList.add(TRANSITION_CLASS);
  const began = performance.now();
  // A no-op default rather than null: the callback below runs before anything
  // reads this, but the type shouldn't depend on trusting that.
  let thaw: () => void = () => {};

  let transition: ViewTransitionLike;
  try {
    // Synchronous on purpose — see paintTheme. Nothing is awaited in here, so
    // the frozen-rendering window is one class swap wide.
    transition = start(() => {
      thaw = paintTheme(nextClass);
      apply();
    });
  } catch {
    // Throwing here means no transition was created, so nothing was captured
    // and nothing needs cleaning up beyond our own class.
    root.classList.remove(TRANSITION_CLASS);
    running = false;
    paintTheme(nextClass)();
    apply();
    return;
  }

  try {
    await transition.finished;
    // Everything over the fade's own length is capture and compositing cost.
    if (performance.now() - began > DURATION_MS + BUDGET_MS) affordable = false;
  } catch {
    /* skipped — the theme is already correct, there is just no fade */
  } finally {
    thaw();
    root.classList.remove(TRANSITION_CLASS);
    running = false;
  }
}
