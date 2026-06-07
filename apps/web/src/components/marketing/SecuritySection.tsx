import { Brain, Lock, Shield, ShieldAlert } from 'lucide-react';

const features = [
  {
    icon: Shield,
    title: 'Data Protection',
    description: 'Active breach prevention and data security',
  },
  {
    icon: ShieldAlert,
    title: 'Malware Protection',
    description: 'Advanced ransomware and threat detection',
  },
  {
    icon: Brain,
    title: 'AI Analysis',
    description: 'Dynamic threat analysis and expert monitoring',
  },
];

export function SecuritySection() {
  return (
    <section id="security" className="border-t border-slate-200 bg-gradient-to-br from-slate-50 to-white py-20 sm:py-24">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Comodo Advance Protection
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Enterprise-grade security solutions for your business
          </p>

          <div className="mt-10 space-y-4">
            {features.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <Icon className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900">{title}</h4>
                  <p className="mt-1 text-sm text-slate-600">{description}</p>
                </div>
              </div>
            ))}
          </div>

          <a
            href="#contact"
            className="mt-8 inline-flex rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            Learn More
          </a>
        </div>

        <div className="flex justify-center">
          <div className="relative flex h-56 w-56 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-pink-100 shadow-inner sm:h-64 sm:w-64">
            <div className="flex h-40 w-40 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-indigo-800 shadow-xl sm:h-48 sm:w-48">
              <Lock className="h-20 w-20 text-white/90 sm:h-24 sm:w-24" strokeWidth={1.5} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
