import { Calendar, Users, Star } from 'lucide-react';

const stats = [
  { value: '13', label: 'Years of Service', icon: Calendar },
  { value: '1000+', label: 'Satisfied Customers', icon: Users },
  { value: '100%', label: 'Customer Satisfaction', icon: Star },
];

export function StatsSection() {
  return (
    <section id="stats" className="bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 py-20 text-white sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Trusted by 1000+ Satisfied Customers
          </h2>
          <p className="mt-4 text-lg text-slate-300">13 years of excellence in Trinidad & Tobago</p>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-3">
          {stats.map(({ value, label, icon: Icon }) => (
            <div
              key={label}
              className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur"
            >
              <Icon className="mx-auto h-8 w-8 text-indigo-400" />
              <p className="mt-4 text-4xl font-bold">{value}</p>
              <p className="mt-2 text-sm text-slate-300">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
