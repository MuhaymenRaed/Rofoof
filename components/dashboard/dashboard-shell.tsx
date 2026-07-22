"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/components/providers/store-provider";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { AnnouncementEditor } from "@/components/dashboard/announcement-editor";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { t, lang } = useStore();

  // Resolved after mount, never during render: this shell is prerendered, so
  // reading the clock at render time would bake the BUILD date into the static
  // HTML (and Cache Components rejects it outright).
  const [today, setToday] = useState("");
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setToday(
      new Intl.DateTimeFormat(lang === "ar" ? "ar-IQ" : "en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(new Date()),
    );
  }, [lang]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-black text-ink">
            <span className="h-6 w-1.5 rounded-full bg-brand" />
            {t("dash.title")}
          </h1>
          <p className="mt-1.5 ps-4 text-xs text-ink-3">{today}</p>
        </div>
        <AnnouncementEditor />
      </div>

      <DashboardTabs />

      <div className="mt-6">{children}</div>
    </div>
  );
}
