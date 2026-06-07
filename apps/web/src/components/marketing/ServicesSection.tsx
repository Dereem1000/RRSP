import Link from 'next/link';
import {
  Laptop,
  Smartphone,
  Server,
  ShoppingCart,
  UtensilsCrossed,
  FileText,
  Wrench,
  TrendingUp,
  Globe,
} from 'lucide-react';

const services = [
  {
    icon: Laptop,
    title: 'Computer Repairs',
    description: 'Cost-Efficient Rates and Professional Desktop or Laptop Repair Services',
    href: '/request-technician.html',
    cta: 'Request Technician',
  },
  {
    icon: Smartphone,
    title: 'Mobile Repairs',
    description:
      'Broken Screens no Problem, broken Charge port hope isnt lost, All Major brands, We can fix it!',
    href: '/mobile-repair.html',
    cta: 'Request Technician',
  },
  {
    icon: Server,
    title: 'MSP Services',
    description: 'We are an MSP that remotely manages a customer\'s IT infrastructure and end-user systems.',
    href: '/msp-services.html',
    cta: 'View Packages',
  },
  {
    icon: ShoppingCart,
    title: 'Point of Sale Systems',
    description:
      'Custom-built POS systems tailored to your business needs, from retail stores to restaurants and service providers.',
    href: '/pos-system-learn-more.html',
    cta: 'Learn More',
  },
  {
    icon: UtensilsCrossed,
    title: 'Restaurant Management',
    description:
      'Complete restaurant management solutions including inventory, staff scheduling, and customer management systems.',
    href: '/restaurant-management-learn-more.html',
    cta: 'Learn More',
  },
  {
    icon: FileText,
    title: 'Document Management',
    description:
      'Custom document management systems for digital filing, workflow automation, and secure document storage.',
    href: '/document-management.html',
    cta: 'Learn More',
  },
  {
    icon: Globe,
    title: 'E-commerce Websites',
    description:
      'Custom-built e-commerce platforms with payment integration, inventory management, and customer portals.',
    href: '#contact',
    cta: 'Learn More',
  },
  {
    icon: Wrench,
    title: 'Auto System',
    description:
      'Comprehensive automotive business management system for service centers with multi-role interfaces, vehicle tracking, and workflow automation.',
    href: '/auto-system.html',
    cta: 'Learn More',
  },
  {
    icon: TrendingUp,
    title: 'Distribution System',
    description:
      'Comprehensive wholesale business management platform for distribution companies with offline-first capabilities, POS systems, and field operations.',
    href: '/distribution-system.html',
    cta: 'Learn More',
  },
];

export function ServicesSection() {
  return (
    <section id="services" className="border-t border-slate-200 bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Our Services</h2>
          <p className="mt-4 text-lg text-slate-600">Professional IT solutions tailored to your needs</p>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {services.map(({ icon: Icon, title, description, href, cta }) => (
            <article
              key={title}
              className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
            >
              <div className="absolute inset-x-0 top-0 h-1 scale-x-0 bg-gradient-to-r from-indigo-600 to-pink-500 transition group-hover:scale-x-100" />
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
              <Link
                href={href}
                className="mt-5 inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
              >
                {cta}
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
