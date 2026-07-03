export default function OrdersLoading() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse px-4 py-8 sm:px-6">
      <div className="mb-7 h-7 w-40 rounded-lg bg-surface-2" />
      <div className="space-y-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-40 rounded-2xl border border-line-2 bg-surface" />
        ))}
      </div>
    </div>
  );
}
