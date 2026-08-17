"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useCatalog } from "@/components/providers/store-provider";
import { X, ChevronEnd } from "@/components/icons";
import { TOUR_DONE_KEY, TOUR_STEPS } from "@/lib/tour/steps";

interface TourContextValue {
  /** true while the walkthrough is on screen */
  active: boolean;
  /** run it from the beginning — the footer replay button */
  start: () => void;
}

const TourContext = createContext<TourContextValue | null>(null);

/** Breathing room between the spotlight and the element it surrounds. */
const HALO = 6;
/** Gap between the spotlight and the popover. */
const GAP = 12;
/** Popover width; clamped to the viewport on phones. */
const CARD_W = 340;
/**
 * Space left above a scrolled-to target, clearing the ticker and the sticky
 * header so the highlight never ends up underneath them.
 */
const HEADER_CLEARANCE = 96;
/**
 * Give up looking for a step's target after this long and move on.
 *
 * Generous on purpose: this has to cover a route change plus a first paint over
 * a slow mobile connection. Too short and the walkthrough skips itself on
 * exactly the devices it is most useful on.
 */
const FIND_TIMEOUT_MS = 10000;
/**
 * The same, for a step flagged `optional` — a section the admin may have
 * switched off, or a card that only exists on page one. Waiting ten seconds on
 * one of those means ten seconds of scrim over nothing.
 */
const OPTIONAL_FIND_TIMEOUT_MS = 1500;
/** How often to look for a step's target while waiting for it. */
const HUNT_POLL_MS = 120;
/**
 * How long to follow the target per frame after finding it — long enough to
 * cover a smooth `scrollIntoView`, after which scroll/resize events suffice.
 */
const SETTLE_MS = 900;
/**
 * Let the home page paint and settle before a first-time visitor is taken on
 * the tour. Starting on the same frame as hydration reads as a glitch, and the
 * first step navigates to /store — yanking someone off a page they haven't
 * looked at yet is worse than waiting a beat.
 */
const AUTOSTART_DELAY_MS = 1400;

/**
 * Where an uninvited tour is welcome. A shopper walkthrough has no business
 * interrupting a sign-in, a password reset or the admin dashboard, and those are
 * exactly the pages where a scrim appearing over the screen unprompted would
 * read as a fault. Replaying it from the footer is always allowed, anywhere.
 */
const AUTOSTART_ROUTES = ["/", "/store"];

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** First match that actually occupies space — see TourStep.target. */
function findVisible(selector: string): HTMLElement | null {
  let nodes: NodeListOf<HTMLElement>;
  try {
    nodes = document.querySelectorAll<HTMLElement>(selector);
  } catch {
    // A malformed selector must not take the page down with it.
    return null;
  }
  for (const node of nodes) {
    const r = node.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return node;
  }
  return null;
}

function boxOf(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function sameBox(a: Box | null, b: Box | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

/**
 * Bring a target into view by its TOP edge, never its centre.
 *
 * `scrollIntoView({ block: "center" })` centres the element, which is wrong for
 * anything tall: centring the store's product grid landed the page halfway down
 * the catalogue, with the first cards — and the step's own text — scrolled off
 * the top. Aligning the start puts the beginning of the cards just under the
 * sticky header, which is where the step is actually pointing.
 *
 * A target already comfortably on screen is left alone: scrolling the page out
 * from under someone who can already see the thing is just motion for its own
 * sake.
 */
function scrollToTarget(el: HTMLElement, smooth: boolean): void {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  if (r.top >= HEADER_CLEARANCE && r.bottom <= vh - 8) return;
  // Short targets get nudged up a little further so the card below them has room.
  const y = window.scrollY + r.top - HEADER_CLEARANCE;
  window.scrollTo({ top: Math.max(0, y), behavior: smooth ? "smooth" : "auto" });
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/**
 * The guided walkthrough: a spotlight over one control at a time with a card
 * explaining it, across four steps and (at most) one route change.
 *
 * Auto-runs once for a first-time visitor, and can be replayed from the footer
 * at any time. Built here rather than on a tour library because every such
 * library would need its popover restyled, its strings routed through
 * `lib/i18n.ts` and its positioning taught about RTL anyway — and the shop's
 * visitors are on metered mobile data, where the lightest honest answer wins.
 */
export function TourProvider({ children }: { children: ReactNode }) {
  // Catalog-only, not the whole store. This provider is an ancestor of the
  // entire app, and subscribing it to the cart would rebuild the tour context on
  // every quantity tap — re-rendering the replay button for nothing.
  const { t, dir } = useCatalog();
  const router = useRouter();
  const pathname = usePathname();

  /** current step index, or null when the tour isn't running */
  const [index, setIndex] = useState<number | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [mounted, setMounted] = useState(false);

  const step = index === null ? null : TOUR_STEPS[index] ?? null;

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => setMounted(true), []);
  /* eslint-enable react-hooks/set-state-in-effect */

  /**
   * Record that the visitor has now SEEN the walkthrough.
   *
   * Called the moment a step is actually put on screen — not when the tour ends.
   * That is the whole rule: once it has been shown, it never auto-runs again,
   * whether they read it to the end, closed it early, or reloaded the page
   * halfway through. The footer button is the only way back to it.
   *
   * Writing it on display rather than on exit also closes two holes. A tour
   * abandoned by a reload used to come back on the next load, which on a slow
   * connection could repeat; and a tour that never managed to show a single step
   * used to be marked complete anyway, permanently hiding a walkthrough nobody
   * had seen. Idempotent, so calling it per step costs nothing.
   */
  const markSeen = useCallback(() => {
    try {
      localStorage.setItem(TOUR_DONE_KEY, "1");
    } catch {
      /* storage blocked — the tour just runs again next visit */
    }
  }, []);

  /**
   * Close the tour. Does NOT write the flag: by the time anything can be closed
   * a step has been displayed, so `markSeen` has already run.
   */
  const close = useCallback(() => {
    setIndex(null);
    setBox(null);
  }, []);

  const start = useCallback(() => {
    setBox(null);
    setIndex(0);
  }, []);

  /** Next step, or close when there isn't one. */
  const next = useCallback(() => {
    if (index === null) return;
    if (index + 1 >= TOUR_STEPS.length) {
      close();
      return;
    }
    setBox(null);
    setIndex(index + 1);
  }, [index, close]);

  const back = useCallback(() => {
    setBox(null);
    setIndex((i) => (i === null || i === 0 ? i : i - 1));
  }, []);

  // --- auto-run, once, for a first-time visitor
  //
  // Reads the landing route once, on mount, rather than following `pathname`:
  // the tour's own first step navigates to /store, so re-evaluating this would
  // let a tour that was just dismissed re-arm itself on arrival.
  useEffect(() => {
    if (!AUTOSTART_ROUTES.includes(window.location.pathname)) return;
    let done = true;
    try {
      done = localStorage.getItem(TOUR_DONE_KEY) !== null;
    } catch {
      // No storage means no way to remember we ran, and a tour that greets
      // someone on every page load is worse than one that never does.
      return;
    }
    if (done) return;
    const id = setTimeout(() => setIndex(0), AUTOSTART_DELAY_MS);
    return () => clearTimeout(id);
  }, []);

  // --- navigate to the step's route when it lives on another page
  useEffect(() => {
    if (!step?.route) return;
    if (pathname === step.route) return;
    router.push(step.route);
  }, [step, pathname, router]);

  // --- find the target, scroll it into view, then track its box
  useEffect(() => {
    if (!step) return;
    // Still on the way to the step's page: wait for the navigation to land
    // rather than hunting for an element that cannot be there yet.
    if (step.route && pathname !== step.route) return;

    let raf = 0;
    let timer = 0;
    let cancelled = false;
    // The last box this effect published. Held in the closure rather than a ref
    // because it belongs to one step's tracking loop, and the effect restarts
    // per step — there is nothing to carry across.
    let last: Box | null = null;
    let target: HTMLElement | null = null;
    // A step whose target may genuinely not exist gets a short grace period; one
    // that must be there gets long enough to cover a slow first paint.
    const deadline =
      Date.now() + (step.optional ? OPTIONAL_FIND_TIMEOUT_MS : FIND_TIMEOUT_MS);
    const reduced = prefersReducedMotion();

    const publish = () => {
      if (cancelled || !target) return;
      const nextBox = boxOf(target);
      // Only re-render when it has actually moved.
      if (!sameBox(last, nextBox)) {
        last = nextBox;
        setBox(nextBox);
      }
    };

    /**
     * Follow the target only while it can still be moving.
     *
     * `scrollIntoView` animates, so the spotlight has to track the element for
     * the duration of that scroll or it visibly lags behind it. But once the
     * page has settled, a per-frame loop is a rAF running flat out for as long
     * as the visitor reads the step — on the low-end phones this shop is used
     * on, that is a real cost for nothing. So: follow for SETTLE_MS, then stop
     * and let scroll/resize events take over.
     */
    const onViewportChange = () => publish();

    const track = (el: HTMLElement) => {
      target = el;
      // The step is about to be on screen. This is the moment the walkthrough
      // counts as shown — see markSeen.
      markSeen();
      const until = Date.now() + SETTLE_MS;
      const tick = () => {
        if (cancelled) return;
        publish();
        if (Date.now() < until) raf = requestAnimationFrame(tick);
      };
      tick();
      window.addEventListener("scroll", onViewportChange, { passive: true });
      window.addEventListener("resize", onViewportChange, { passive: true });
    };

    const hunt = () => {
      if (cancelled) return;
      const el = findVisible(step.target);
      if (el) {
        scrollToTarget(el, !reduced);
        track(el);
        return;
      }
      // The catalogue grid isn't there on an empty search, the custom-order card
      // only exists on page 1. A step whose target never shows up is skipped
      // rather than left as a stuck overlay — without counting as "seen".
      if (Date.now() > deadline) {
        next();
        return;
      }
      // Polled on a timer, not per frame: this can run for seconds while a route
      // loads, and checking 60 times a second for an element that isn't there
      // yet is pure waste on the phones this shop is used on.
      timer = window.setTimeout(hunt, HUNT_POLL_MS);
    };

    hunt();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      window.removeEventListener("scroll", onViewportChange);
      window.removeEventListener("resize", onViewportChange);
    };
  }, [step, pathname, next, markSeen]);

  // --- Escape closes it, like every other overlay in the app
  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, close]);

  const value = useMemo<TourContextValue>(
    () => ({ active: index !== null, start }),
    [index, start],
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      {mounted && step && box
        ? createPortal(
            <TourOverlay
              box={box}
              stepIndex={index ?? 0}
              total={TOUR_STEPS.length}
              title={t(step.titleKey)}
              body={t(step.bodyKey)}
              dir={dir}
              onNext={next}
              onBack={back}
              onClose={close}
              labels={{
                step: t("tour.step"),
                of: t("tour.of"),
                next: t("tour.next"),
                back: t("tour.back"),
                finish: t("tour.finish"),
                aria: t("tour.aria"),
                close: t("aria.close"),
              }}
            />,
            document.body,
          )
        : null}
    </TourContext.Provider>
  );
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within <TourProvider>");
  return ctx;
}

/* ------------------------------- Overlay -------------------------------- */

function TourOverlay({
  box,
  stepIndex,
  total,
  title,
  body,
  dir,
  onNext,
  onBack,
  onClose,
  labels,
}: {
  box: Box;
  stepIndex: number;
  total: number;
  title: string;
  body: string;
  dir: "rtl" | "ltr";
  onNext: () => void;
  onBack: () => void;
  onClose: () => void;
  labels: Record<
    "step" | "of" | "next" | "back" | "finish" | "aria" | "close",
    string
  >;
}) {
  const isLast = stepIndex === total - 1;
  const reduced = prefersReducedMotion();

  /**
   * The card's own height, measured after it renders.
   *
   * Needed because the card must be kept FULLY on screen whatever the target is
   * doing, and you can't clamp what you haven't measured. The earlier version
   * dodged this by anchoring with `bottom` when placing above — which worked
   * until the target was taller than the viewport (the store's product grid),
   * where it put the card off-screen entirely and left the visitor scrolling
   * around a dark page hunting for the text.
   */
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(0);
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const h = el.offsetHeight;
    // Guarded so this can't loop: the updater returns the same value once the
    // height has settled, and React bails out of an identical state.
    setCardH((prev) => (Math.abs(prev - h) > 1 ? h : prev));
  }, [title, body, stepIndex, box.top, box.height]);

  // These coordinates come from getBoundingClientRect, which is physical — so
  // they are set with physical `top`/`left`, NOT the logical properties used for
  // the rest of the app's layout. `insetInlineStart` would mirror them in RTL
  // and put the card on the wrong side of the screen.
  const vw = typeof window === "undefined" ? 0 : window.innerWidth;
  const vh = typeof window === "undefined" ? 0 : window.innerHeight;
  const cardW = Math.min(CARD_W, vw - 16);
  const cardLeft = Math.min(
    Math.max(8, box.left + box.width / 2 - cardW / 2),
    Math.max(8, vw - cardW - 8),
  );

  /**
   * Below the target, else above it, else straight over it — and clamped into
   * the viewport in every case, so the card is never the thing the visitor has
   * to go looking for. A target taller than the screen always lands in the last
   * case, which is why the card is allowed to overlay the highlight.
   */
  const EDGE = 8;
  const offset = HALO + GAP;
  const maxTop = Math.max(EDGE, vh - cardH - EDGE);
  const fitsBelow = box.top + box.height + offset + cardH <= vh - EDGE;
  const fitsAbove = box.top - offset - cardH >= EDGE;
  const desiredTop = fitsBelow
    ? box.top + box.height + offset
    : fitsAbove
      ? box.top - offset - cardH
      : // Neither side has room: centre it on screen, over the highlight.
        vh / 2 - cardH / 2;
  const cardTop = Math.round(Math.min(Math.max(desiredTop, EDGE), maxTop));

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label={labels.aria}>
      {/* Swallows interaction with the page underneath. Clicking it does
          nothing on purpose — a mis-tap on a phone shouldn't end the tour. */}
      <div className="absolute inset-0" />

      {/* The scrim IS this element's outer shadow, which is how the hole in it
          stays exactly on the highlighted control with no SVG mask or four
          separately-positioned panels to keep in sync. */}
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-2xl ring-2 ring-brand"
        style={{
          top: Math.round(box.top - HALO),
          left: Math.round(box.left - HALO),
          width: Math.round(box.width + HALO * 2),
          height: Math.round(box.height + HALO * 2),
          boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.62)",
          transition: reduced ? "none" : "all 0.28s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />

      <div
        ref={cardRef}
        dir={dir}
        className="absolute rounded-2xl border border-line-2 bg-surface p-4 shadow-2xl"
        style={{
          top: cardTop,
          left: Math.round(cardLeft),
          width: cardW,
          // Hidden for the single frame before the height is known, so the card
          // is never seen in the wrong place while it is being measured.
          visibility: cardH === 0 ? "hidden" : undefined,
          animation: reduced ? undefined : "fade-in 0.2s ease both",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-brand">
              {labels.step} {stepIndex + 1} {labels.of} {total}
            </p>
            <h2 className="mt-1 text-[15px] font-black leading-snug text-ink">{title}</h2>
          </div>
          {/* The only way out other than reading to the end. There is no
              "skip the whole tour" button by design — but an overlay covering
              the screen with no exit at all would be a trap, and on a phone
              there is no Escape key to fall back on. */}
          <button
            type="button"
            onClick={onClose}
            aria-label={labels.close}
            className="tap -me-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-3 transition hover:bg-surface-2 hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{body}</p>

        {/* Progress — four steps is few enough to show as dots rather than a bar */}
        <div className="mt-3 flex items-center gap-1.5">
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === stepIndex ? "w-5 bg-brand" : "w-1.5 bg-line"
              }`}
            />
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <div className="ms-auto flex items-center gap-2">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={onBack}
                className="tap inline-flex items-center gap-1 rounded-xl border border-line px-3 py-2 text-[12px] font-bold text-ink-2 transition hover:border-brand hover:text-brand"
              >
                <span className="ltr:rotate-180">
                  <ChevronEnd size={13} />
                </span>
                {labels.back}
              </button>
            )}
            <button
              type="button"
              onClick={isLast ? onClose : onNext}
              className="tap inline-flex items-center gap-1 rounded-xl bg-brand px-4 py-2 text-[12px] font-bold text-white transition hover:opacity-90"
            >
              {isLast ? labels.finish : labels.next}
              {!isLast && (
                <span className="rtl:rotate-180">
                  <ChevronEnd size={13} />
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
