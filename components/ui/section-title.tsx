"use client";

import { useStore } from "@/components/providers/store-provider";
import { SectionHeader } from "@/components/ui/section-header";
import type { DictKey } from "@/lib/i18n";

/** Client wrapper that translates a section's title + "view all" label. */
export function SectionTitle({
  titleKey,
  viewAllHref,
  icon,
}: {
  titleKey: DictKey;
  viewAllHref?: string;
  icon?: React.ReactNode;
}) {
  const { t } = useStore();
  return (
    <SectionHeader
      title={t(titleKey)}
      viewAllHref={viewAllHref}
      viewAllLabel={viewAllHref ? t("section.viewAll") : undefined}
      icon={icon}
    />
  );
}
