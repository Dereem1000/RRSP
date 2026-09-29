export function ShopLoginLoadingShell() {
  return (
    <div className="flex min-h-screen overflow-hidden bg-slate-50">
      <div className="hidden w-[48%] animate-pulse bg-slate-900 lg:block" />
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
            <div className="mx-auto h-14 w-14 animate-pulse rounded-2xl bg-slate-200" />
            <div className="mx-auto h-6 w-48 animate-pulse rounded-lg bg-slate-200" />
            <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
            <div className="h-10 w-full animate-pulse rounded-xl bg-slate-100" />
            <div className="h-10 w-full animate-pulse rounded-xl bg-slate-100" />
            <div className="h-11 w-full animate-pulse rounded-xl bg-slate-200" />
          </div>
        </div>
      </div>
    </div>
  );
}
