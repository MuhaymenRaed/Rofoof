export default function StoreLoading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse px-4 py-6 sm:px-6">
      <div className="mb-4 h-11 w-full rounded-xl bg-surface-2" />
      <div className="no-scrollbar mb-5 flex gap-2 overflow-x-auto">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 w-24 shrink-0 rounded-xl bg-surface-2" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-line-2 bg-surface">
            <div className="aspect-square bg-surface-2" />
            <div className="space-y-2 p-3">
              <div className="h-3 w-3/4 rounded bg-surface-2" />
              <div className="h-3 w-1/2 rounded bg-surface-2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
