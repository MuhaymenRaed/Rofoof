"use client";

import { useEffect, useState } from "react";

function remaining(endsAt: string): { d: number; h: number; m: number; s: number } | null {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Live HH:MM:SS (or Dd HH:MM:SS) countdown to `endsAt` — FOMO timer. */
export function Countdown({ endsAt, className = "" }: { endsAt: string; className?: string }) {
  // null until mounted so the server render never shows a mismatched time
  const [left, setLeft] = useState<ReturnType<typeof remaining>>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setLeft(remaining(endsAt));
    const id = setInterval(() => setLeft(remaining(endsAt)), 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!left) return null;

  return (
    <span dir="ltr" className={`font-mono font-black tabular-nums ${className}`}>
      {left.d > 0 && `${left.d}d `}
      {pad(left.h)}:{pad(left.m)}:{pad(left.s)}
    </span>
  );
}
