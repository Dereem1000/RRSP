import Image from 'next/image';
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

export default function ShopLoginNotFound() {
  return (
    <div className="relative flex min-h-screen overflow-hidden bg-slate-50">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-100/80 via-slate-50 to-slate-50" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgb(148 163 184 / 0.35) 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      <div className="relative flex min-h-screen flex-1 flex-col">
        <div className="flex flex-1 items-center justify-center px-6 py-12">
          <div className="w-full max-w-md rounded-2xl border border-slate-200/90 bg-white/95 p-8 text-center shadow-xl shadow-slate-900/8 backdrop-blur-sm">
            <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 ring-1 ring-amber-100">
              <ShieldAlert className="h-7 w-7" aria-hidden />
            </span>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">
              Employee portal unavailable
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              This sign-in link is not valid, or employee access has not been enabled for this
              organization. Contact your business administrator for the correct portal URL.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white"
            >
              Administrator sign-in
            </Link>
          </div>
        </div>

        <footer className="relative border-t border-slate-200/80 bg-white/60 px-6 py-4 backdrop-blur-sm">
          <div className="mx-auto flex justify-center">
            <a
              href="https://www.computerdynamicstt.com"
              target="_blank"
              rel="noopener noreferrer"
              title="Powered by Computer Dynamics"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-700"
            >
              <Image
                src="/logo.png"
                alt=""
                width={72}
                height={22}
                className="h-5 w-auto object-contain opacity-80"
                unoptimized
              />
              <span className="font-medium">Powered by Computer Dynamics</span>
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
