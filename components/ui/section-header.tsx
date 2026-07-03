import Link from "next/link";
import { ChevronEnd } from "@/components/icons";

export function SectionHeader({
  title,
  viewAllHref,
  viewAllLabel,
  icon,
}: {
  title: string;
  viewAllHref?: string;
  viewAllLabel?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="flex items-center gap-2.5 text-base font-extrabold text-ink">
        <span className="h-4 w-1 shrink-0 rounded-full bg-brand" />
        {icon}
        {title}
      </h2>
      {viewAllHref && (
        <Link
          href={viewAllHref}
          className="tap inline-flex items-center gap-1 text-xs font-bold text-brand transition hover:opacity-75"
        >
          {viewAllLabel}
          <ChevronEnd size={15} />
        </Link>
      )}
    </div>
  );
}
