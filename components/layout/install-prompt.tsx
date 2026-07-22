"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useStore } from "@/components/providers/store-provider";
import { X, Plus } from "@/components/icons";

/** Chrome/Edge fire this before showing their own install UI. Not in lib.dom. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "rofoof.pwa.dismissed"; // sessionStorage — this visit only

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari's non-standard flag for home-screen apps
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSafari(): boolean {
  const nav = window.navigator;
  const ua = nav.userAgent;
  // iPadOS 13+ Safari reports a desktop (Macintosh) UA, so also detect an iPad
  // by its touch capability — otherwise the hint stays hidden on iPads.
  const iOS =
    /iPad|iPhone|iPod/.test(ua) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  // Exclude in-app browsers that can't add to home screen
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return iOS && safari;
}

/**
 * Slim, dismissible "install the app" bar pinned to the top of the page.
 *
 * Shown once per visit until the app is actually installed — and it comes
 * BACK if the user later uninstalls. We never persist an "installed" flag;
 * instead we key off live signals: the bar is hidden only while the site is
 * actually running as an installed app (display-mode: standalone / iOS
 * navigator.standalone), which naturally flips back once the app is removed.
 * Dismissing writes to sessionStorage, so it stays gone for this visit but
 * politely returns on the next one.
 *
 * Chrome/Edge/Android get the real install prompt via `beforeinstallprompt`
 * (which the browser re-fires after an uninstall); iOS/iPadOS Safari has no
 * such API, so it gets a short "Share → Add to Home Screen" hint instead.
 */
export function InstallPrompt() {
  const { t } = useStore();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Register the service worker (needed for installability).
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registration failures are non-fatal — the site works regardless */
      });
    }

    // Running as the installed app right now → stay quiet. This is a live
    // signal (not a stored flag), so the bar returns automatically if the app
    // is later uninstalled and the site is opened in a normal tab again.
    if (isStandalone()) return;

    // Dismissed for this visit only.
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
      /* storage blocked (private mode) — fall through and just show once */
    }
    if (dismissed) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // suppress the browser's own mini-infobar
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // iOS can't prompt programmatically — show the manual hint instead, on a
    // short delay so the bar never flashes in mid-hydration.
    let iosTimer: ReturnType<typeof setTimeout> | undefined;
    if (isIosSafari()) {
      iosTimer = setTimeout(() => {
        setShowIosHint(true);
        setVisible(true);
      }, 1200);
    }

    return () => {
      if (iosTimer) clearTimeout(iosTimer);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === "accepted") {
      setVisible(false); // `appinstalled` also fires; next launches are standalone
    } else {
      dismiss(); // treated as "not now" — comes back next visit
    }
  }

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label={t("pwa.title")}
      className="border-b border-line-2 bg-brand-soft"
      style={{ animation: "fade-in 0.3s ease both" }}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-2.5 px-4 py-2 sm:px-6">
        <Image
          src="/logo.png"
          alt=""
          width={28}
          height={28}
          className="h-7 w-7 shrink-0 object-contain"
        />

        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[12px] font-bold text-ink">{t("pwa.title")}</p>
          <p className="truncate text-[10px] text-ink-3">
            {showIosHint ? t("pwa.iosHint") : t("pwa.hint")}
          </p>
        </div>

        {!showIosHint && (
          <button
            type="button"
            onClick={install}
            className="tap inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-[11px] font-bold text-white transition hover:opacity-90"
          >
            <Plus size={13} />
            {t("pwa.install")}
          </button>
        )}

        <button
          type="button"
          onClick={dismiss}
          aria-label={t("aria.close")}
          className="tap grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-3 transition hover:bg-surface-2 hover:text-ink"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
