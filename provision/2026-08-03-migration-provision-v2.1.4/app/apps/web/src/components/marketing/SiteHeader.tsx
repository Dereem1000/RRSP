import Link from 'next/link';
import { LogIn } from 'lucide-react';
import { BrandLogo } from './BrandLogo';

const nav = [
  { href: '#home', label: 'Home' },
  { href: '#services', label: 'Services' },
  { href: '#security', label: 'Security' },
  { href: '#office', label: 'Office' },
  { href: '#stats', label: 'Statistics' },
  { href: '#about', label: 'About' },
  { href: '#contact', label: 'Contact' },
];

export function SiteHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <BrandLogo href="/" size="md" />

        <nav className="hidden items-center gap-6 lg:flex xl:gap-8">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-slate-600 transition hover:text-indigo-600"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <Link
          href="/login"
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition hover:-translate-y-0.5 hover:shadow-indigo-600/35"
        >
          <LogIn className="h-4 w-4" />
          Login
        </Link>
      </div>
    </header>
  );
}
