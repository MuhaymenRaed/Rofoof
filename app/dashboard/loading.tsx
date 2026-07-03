// Shown while any /dashboard/* segment (and its layout's requireAdmin() +
// data fetches) is loading — covers overview, orders, inventory, customers
// since none of them define a more specific loading.tsx.
export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse space-y-6 px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between">
        <div className="h-7 w-48 rounded-lg bg-surface-2" />
        <div className="h-9 w-40 rounded-xl bg-surface-2" />
      </div>

      <div className="h-11 w-full max-w-md rounded-2xl bg-surface-2" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl border border-line-2 bg-surface p-4">
            <div className="h-10 w-10 rounded-xl bg-surface-2" />
            <div className="mt-4 h-5 w-16 rounded bg-surface-2" />
          </div>
        ))}
      </div>

      <div className="h-64 rounded-2xl border border-line-2 bg-surface" />
      <div className="h-64 rounded-2xl border border-line-2 bg-surface" />
    </div>
  );
}
