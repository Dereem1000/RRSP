import Image from 'next/image';
import { Briefcase, Lock, ShieldCheck, Store } from 'lucide-react';
import { BrandLogo } from '@/components/marketing/BrandLogo';

type ShopEmployeeLoginLayoutProps = {
  companyName: string;
  logoUrl: string | null;
  children: React.ReactNode;
};

const HIGHLIGHTS = [
  {
    icon: ShieldCheck,
    title: 'Secure access',
    description: 'Role-based permissions for every team member.',
  },
  {
    icon: Briefcase,
    title: 'Business operations',
    description: 'Tickets, POS, and daily workflows in one place.',
  },
  {
    icon: Lock,
    title: 'Authorized personnel',
    description: 'Credentials issued and managed by your administrator.',
  },
] as const;

export function ShopEmployeeLoginLayout({
  companyName,
  logoUrl,
  children,
}: ShopEmployeeLoginLayoutProps) {
  return (
    <div className="relative flex min-h-screen overflow-hidden bg-slate-50">
      {/* Ambient background on form side */}
      <div
        className="pointer-events-none absolute inset-0 lg:left-[48%]"
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

      {/* Brand panel */}
      <div className="relative hidden w-[48%] flex-col justify-between overflow-hidden bg-slate-950 p-12 text-white lg:flex">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-indigo-600/25 via-transparent to-transparent" />
        <div
          className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgb(255 255 255 / 0.08) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.08) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
        <div className="absolute -right-24 top-1/3 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute -left-16 bottom-0 h-56 w-56 rounded-full bg-sky-500/10 blur-3xl" />

        <div className="relative">
          {logoUrl ? (
            <BrandLogo
              href={undefined}
              size="xl"
              src={logoUrl}
              alt={companyName}
              usePlatformFallback={false}
            />
          ) : (
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/15">
              <Store className="h-8 w-8" aria-hidden />
            </span>
          )}
          <p className="mt-5 text-sm font-medium uppercase tracking-[0.2em] text-indigo-200/90">
            Employee Portal
          </p>
          <h2 className="mt-2 max-w-md text-3xl font-semibold leading-tight tracking-tight text-white">
            {companyName}
          </h2>
        </div>

        <div className="relative space-y-8">
          <div>
            <p className="text-lg font-medium text-slate-200">
              Secure workforce access for your organization
            </p>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-400">
              Sign in with credentials assigned by your business administrator to access
              authorized modules and daily operations.
            </p>
          </div>

          <ul className="space-y-4">
            {HIGHLIGHTS.map(({ icon: Icon, title, description }) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/10">
                  <Icon className="h-4 w-4 text-indigo-200" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-medium text-white">{title}</p>
                  <p className="mt-0.5 text-sm text-slate-400">{description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-slate-500">
          Internal use only · Authorized personnel
        </p>
      </div>

      {/* Form panel */}
      <div className="relative flex min-h-screen flex-1 flex-col">
        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10 lg:px-14 lg:py-12">
          <div className="w-full max-w-md">
            <div className="mb-8 text-center lg:hidden">
              {logoUrl ? (
                <BrandLogo
                  href={undefined}
                  size="lg"
                  src={logoUrl}
                  alt={companyName}
                  usePlatformFallback={false}
                  className="mx-auto"
                />
              ) : (
                <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
                  <Store className="h-7 w-7" aria-hidden />
                </span>
              )}
              <p className="mt-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                {companyName} · Employee Portal
              </p>
            </div>

            {children}
          </div>
        </div>

        <footer className="relative border-t border-slate-200/80 bg-white/60 px-6 py-4 backdrop-blur-sm">
          <div className="mx-auto flex max-w-md flex-col items-center justify-between gap-3 text-center sm:max-w-none sm:flex-row sm:text-left">
            <p className="text-xs text-slate-500">
              Need access? Contact your business administrator.
            </p>
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
