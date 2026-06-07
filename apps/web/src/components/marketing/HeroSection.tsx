import Link from 'next/link';
import {
  Laptop,
  Smartphone,
  Settings,
  ShoppingCart,
  UtensilsCrossed,
  Wrench,
  ArrowRight,
} from 'lucide-react';
import { TicketStatusButton } from './HomeModals';

const badges = [
  { icon: Laptop, label: 'Computer Repairs' },
  { icon: Smartphone, label: 'Mobile Repairs' },
  { icon: Settings, label: 'Laptop Hinge Repairs' },
  { icon: ShoppingCart, label: 'POS Systems' },
  { icon: UtensilsCrossed, label: 'Restaurant Management' },
  { icon: ShoppingCart, label: 'E-commerce' },
  { icon: Wrench, label: 'Auto System', href: '/auto-system.html' },
];

export function HeroSection() {
  return (
    <section id="home" className="relative overflow-hidden pt-28 pb-20 sm:pt-32 sm:pb-24">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.12),_transparent_55%)]" />
      <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
          <span className="bg-gradient-to-r from-slate-900 via-indigo-800 to-indigo-600 bg-clip-text text-transparent">
            Custom Business Management Solutions
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
          From IT repairs to custom-built business management systems for every industry, we build
          your ideas
        </p>

        <div className="mt-10 flex flex-wrap justify-center gap-3">
          {badges.map(({ icon: Icon, label, href }) =>
            href ? (
              <Link
                key={label}
                href={href}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm backdrop-blur transition hover:border-indigo-300 hover:text-indigo-700"
              >
                <Icon className="h-4 w-4 text-indigo-600" />
                {label}
              </Link>
            ) : (
              <span
                key={label}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm backdrop-blur"
              >
                <Icon className="h-4 w-4 text-indigo-600" />
                {label}
              </span>
            )
          )}
        </div>

        <div className="mt-12 flex flex-wrap justify-center gap-4">
          <a
            href="#services"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition hover:-translate-y-0.5"
          >
            Our Services
            <ArrowRight className="h-4 w-4" />
          </a>
          <TicketStatusButton />
        </div>
      </div>
    </section>
  );
}
