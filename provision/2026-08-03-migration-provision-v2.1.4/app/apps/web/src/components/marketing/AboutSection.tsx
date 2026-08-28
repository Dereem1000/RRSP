import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  Camera,
  Clock,
  Database,
  DollarSign,
  Handshake,
  Laptop,
  MapPin,
  Mail,
  Phone,
  Shield,
  ShoppingBag,
  Wrench,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';

const comprehensiveServices = [
  { icon: Laptop, label: 'Computer & Mobile Services' },
  { icon: Camera, label: 'CCTV Installation' },
  { icon: Database, label: 'Data Retrieval' },
  { icon: Shield, label: 'Cyber Security' },
  { icon: ShoppingBag, label: 'Device Imports' },
  { icon: Wrench, label: 'Troubleshooting' },
];

const whyChooseUs = [
  {
    icon: Clock,
    title: '13+ Years Experience',
    description: 'Proven track record of excellence',
  },
  {
    icon: DollarSign,
    title: 'Budget Friendly',
    description: 'Solutions that fit your budget',
  },
  {
    icon: Handshake,
    title: 'Professional Service',
    description: 'Exceeding customer expectations',
  },
];

export function AboutSection() {
  return (
    <section id="about" className="border-t border-slate-200 bg-slate-50 py-20 sm:py-24">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:items-start">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Professionally, Accommodating Services
          </h2>
          <p className="mt-3 text-lg font-medium text-indigo-600">
            Your trusted technology partner since 2015
          </p>
          <div className="mt-6 space-y-4 text-slate-600">
            <p>
              Registered in 2015, with over 13 years of service, Computer Dynamics has served over
              1000+ satisfied customers across Trinidad & Tobago.
            </p>
            <p>
              We accommodate your budget and time constraints while providing a professional user
              experience that exceeds expectations.
            </p>
          </div>

          <div className="mt-10">
            <h3 className="text-lg font-semibold text-slate-900">Our Comprehensive Services</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {comprehensiveServices.map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
                >
                  <Icon className="h-5 w-5 shrink-0 text-indigo-600" />
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h3 className="text-xl font-semibold text-slate-900">Why Choose Us?</h3>
          <div className="mt-6 space-y-5">
            {whyChooseUs.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900">{title}</h4>
                  <p className="mt-1 text-sm text-slate-600">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function ContactSection() {
  return (
    <section className="border-t border-slate-200 bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 sm:p-10">
          <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">Contact Information</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            <a
              href="https://maps.google.com/?q=2+Banyan+Blvd+Malabar+Arima+Trinidad"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 text-slate-600 transition hover:text-indigo-600"
            >
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
              <span>#2 Banyan Blvd Malabar, Arima, Trinidad & Tobago</span>
            </a>
            <a
              href="tel:+18683168851"
              className="flex items-center gap-3 text-slate-600 transition hover:text-indigo-600"
            >
              <Phone className="h-5 w-5 shrink-0 text-indigo-600" />
              <span>(868) 316 8851</span>
            </a>
            <a
              href="mailto:support@computerdynamicstt.com"
              className="flex items-center gap-3 text-slate-600 transition hover:text-indigo-600"
            >
              <Mail className="h-5 w-5 shrink-0 text-indigo-600" />
              <span>support@computerdynamicstt.com</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

const footerServices = [
  'Computer Repairs',
  'Mobile Repairs',
  'MSP Services',
  'CCTV Installation',
  'Data Recovery',
  'Cyber Security',
];

const footerCompany = ['About Us', 'Our Office', 'Jobs', 'Blog', 'Shop'];

export function SiteFooter() {
  return (
    <footer id="contact" className="border-t border-slate-800 bg-slate-900 text-slate-400">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <BrandLogo href="/" size="sm" />
            <div className="mt-6 space-y-3 text-sm">
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
                #2 Banyan Blvd Malabar, Arima, Trinidad & Tobago
              </p>
              <p className="flex items-center gap-2">
                <Phone className="h-4 w-4 shrink-0 text-indigo-400" />
                (868) 316 8851
              </p>
              <p className="flex items-center gap-2">
                <Mail className="h-4 w-4 shrink-0 text-indigo-400" />
                support@computerdynamicstt.com
              </p>
            </div>
            <div className="mt-5 flex gap-3">
              <SocialLink href="https://wa.me/18683168851" label="WhatsApp" color="hover:text-green-400">
                WA
              </SocialLink>
              <SocialLink
                href="https://www.linkedin.com/company/computer-dynamicstt/?viewAsMember=true"
                label="LinkedIn"
                color="hover:text-blue-400"
              >
                in
              </SocialLink>
              <SocialLink
                href="https://www.facebook.com/opseccomputerdynamics"
                label="Facebook"
                color="hover:text-blue-500"
              >
                f
              </SocialLink>
              <SocialLink
                href="https://www.instagram.com/computer_dynamicstt"
                label="Instagram"
                color="hover:text-pink-400"
              >
                ig
              </SocialLink>
            </div>
          </div>

          <FooterColumn title="Services" links={footerServices.map((l) => ({ label: l, href: '#services' }))} />
          <FooterColumn
            title="Company"
            links={footerCompany.map((l) => ({ label: l, href: l === 'About Us' ? '#about' : '#contact' }))}
          />
          <FooterColumn
            title="Quick Links"
            links={[
              { label: 'Home', href: '#home' },
              { label: 'Services', href: '#services' },
              { label: 'About', href: '#about' },
              { label: 'Contact', href: '#contact' },
              { label: 'Login', href: '/login' },
            ]}
          />
        </div>

        <div className="mt-12 border-t border-slate-800 pt-8 text-center text-sm">
          <p>© {new Date().getFullYear()} Computer Dynamics. All rights reserved.</p>
          <p className="mt-2 text-slate-500">
            Registered in 2015 | 13+ Years of Service | 1000+ Satisfied Customers
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <h3 className="font-semibold text-white">{title}</h3>
      <div className="mt-4 flex flex-col gap-2 text-sm">
        {links.map(({ label, href }) =>
          href.startsWith('/') ? (
            <Link key={label} href={href} className="transition hover:text-white">
              {label}
            </Link>
          ) : (
            <a key={label} href={href} className="transition hover:text-white">
              {label}
            </a>
          )
        )}
      </div>
    </div>
  );
}

function SocialLink({
  href,
  label,
  color,
  children,
}: {
  href: string;
  label: string;
  color: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      className={`flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-xs font-bold text-slate-300 transition ${color}`}
    >
      {children}
    </a>
  );
}
