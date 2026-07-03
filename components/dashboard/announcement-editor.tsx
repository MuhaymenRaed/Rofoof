"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/providers/store-provider";
import { Pencil } from "@/components/dashboard/dash-icons";
import { updateAnnouncementAction } from "@/lib/actions/settings";

export function AnnouncementEditor() {
  const { t, announcementSettings, setAnnouncementSettings } = useStore();
  const router = useRouter();
  const [ar, setAr] = useState(announcementSettings.ar);
  const [en, setEn] = useState(announcementSettings.en);
  const [active, setActive] = useState(announcementSettings.active);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await updateAnnouncementAction({ ar: ar.trim(), en: en.trim(), active });
      if (res.ok) {
        setAnnouncementSettings({ ar: ar.trim(), en: en.trim(), active });
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
        router.refresh();
      }
    });
  }

  return (
    <div className="w-full rounded-2xl border border-line-2 bg-surface p-2.5 lg:w-auto">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-ink-2">
        <Pencil size={14} className="text-brand" />
        {t("dash.announcement")}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={ar}
          onChange={(e) => setAr(e.target.value)}
          placeholder="عربي"
          className="dash-input h-9 sm:w-48"
        />
        <input
          value={en}
          onChange={(e) => setEn(e.target.value)}
          placeholder="English"
          dir="ltr"
          className="dash-input h-9 text-start sm:w-48"
        />
        <label className="flex items-center gap-1.5 px-1 text-xs font-semibold text-ink-2">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 accent-brand"
          />
          {t("dash.active")}
        </label>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="tap shrink-0 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {saved ? t("dash.saved") : t("dash.updateAnnouncement")}
        </button>
      </div>
    </div>
  );
}
