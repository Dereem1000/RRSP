export default function PortalLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading page">
      <div className="space-y-2">
        <div className="h-8 w-48 rounded-lg bg-slate-200" />
        <div className="h-4 w-72 max-w-full rounded bg-slate-100" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-24 rounded-2xl bg-slate-200/80" />
        ))}
      </div>

      <div className="h-64 rounded-2xl bg-slate-200/70" />
    </div>
  );
}
