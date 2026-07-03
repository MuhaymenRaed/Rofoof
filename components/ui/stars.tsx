import { Star } from "@/components/icons";

export function Stars({
  rating,
  reviews,
  size = 14,
  showCount = true,
}: {
  rating: number;
  reviews?: number;
  size?: number;
  showCount?: boolean;
}) {
  const full = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-1.5 text-amber-500">
      <span className="inline-flex items-center gap-0.5" aria-hidden>
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} size={size} filled={i < full} className={i < full ? "" : "text-ink-3"} />
        ))}
      </span>
      <span className="text-xs font-bold text-ink">{rating.toFixed(1)}</span>
      {showCount && reviews != null && (
        <span className="text-xs font-medium text-ink-3">({reviews})</span>
      )}
    </span>
  );
}
