export function OfficeSection() {
  return (
    <section id="office" className="border-t border-slate-200 bg-white py-20 sm:py-24">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:items-center">
        <div className="order-2 flex justify-center lg:order-1">
          <div className="relative flex h-56 w-56 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-50 to-slate-100 shadow-inner sm:h-64 sm:w-64">
            <div className="flex h-32 w-32 items-center justify-center rounded-2xl bg-[#0078d4] shadow-xl sm:h-36 sm:w-36">
              <svg viewBox="0 0 24 24" className="h-16 w-16 text-white sm:h-20 sm:w-20" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zm12.6 0H12.6V0H24v11.4z"
                />
              </svg>
            </div>
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Microsoft Office 2016
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Professional productivity suite for your business
          </p>

          <div className="mt-8 inline-flex flex-col rounded-2xl border border-indigo-200 bg-indigo-50 px-6 py-4">
            <span className="text-4xl font-extrabold text-indigo-700">$150.00TT</span>
            <span className="mt-1 text-sm font-semibold uppercase tracking-wide text-indigo-500">
              Special Offer
            </span>
          </div>

          <p className="mt-6 text-slate-600">
            Get your Microsoft subscription today with our exclusive pricing. Complete productivity
            suite with Word, Excel, PowerPoint, and more.
          </p>

          <a
            href="#contact"
            className="mt-8 inline-flex rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            Get Started
          </a>
        </div>
      </div>
    </section>
  );
}
