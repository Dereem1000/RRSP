import { Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { SecurityStatus } from '@/lib/dashboard';

const statusStyles = {
  secure: { icon: ShieldCheck, badge: 'bg-emerald-100 text-emerald-800', label: 'Secure' },
  warning: { icon: Shield, badge: 'bg-amber-100 text-amber-800', label: 'Warning' },
  critical: { icon: ShieldAlert, badge: 'bg-red-100 text-red-800', label: 'Critical' },
};

export function SecurityStatusCard({ security }: { security: SecurityStatus }) {
  const style = statusStyles[security.status];
  const Icon = style.icon;

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-slate-900">Security</h2>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${style.badge}`}>
          <Icon className="h-3.5 w-3.5" />
          {style.label}
        </span>
      </div>

      <p className="mt-3 text-3xl font-bold text-slate-900">{security.score}</p>
      <p className="text-sm text-slate-500">Security score</p>

      <div className="mt-4 space-y-2">
        {security.recentEvents.length === 0 ? (
          <p className="text-sm text-slate-400">No recent security events</p>
        ) : (
          security.recentEvents.slice(0, 5).map((event) => (
            <div key={event.id} className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium capitalize text-slate-800">{event.eventType}</span>
                <span className="text-xs capitalize text-slate-500">{event.severity}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-slate-600">{event.description}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
