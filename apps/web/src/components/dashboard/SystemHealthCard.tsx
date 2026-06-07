import { Activity, Cpu, HardDrive } from 'lucide-react';
import type { SystemHealth } from '@/lib/dashboard';

export function SystemHealthCard({
  health,
  compact = false,
  className = '',
}: {
  health: SystemHealth;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white shadow-sm ${
        compact ? 'p-4' : 'p-6'
      } ${className}`}
    >
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">System health</h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
            health.status === 'operational'
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-amber-100 text-amber-800'
          }`}
        >
          {health.status}
        </span>
      </div>
      <div className={`grid grid-cols-3 gap-2 ${compact ? 'mt-3' : 'mt-5 gap-4 sm:grid-cols-3'}`}>
        <Metric icon={Cpu} label="CPU load" value={`${health.cpuUsage}`} compact={compact} />
        <Metric icon={HardDrive} label="Memory" value={`${health.memoryUsage}%`} compact={compact} />
        <Metric icon={Activity} label="Uptime" value={`${health.uptimeHours}h`} compact={compact} />
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  compact = false,
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div className={`rounded-xl bg-slate-50 ${compact ? 'p-2.5' : 'p-4'}`}>
      <div className="flex items-center gap-1.5 text-slate-500">
        <Icon className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
        <span className={`font-medium uppercase tracking-wide ${compact ? 'text-[10px]' : 'text-xs'}`}>
          {label}
        </span>
      </div>
      <p className={`font-bold text-slate-900 ${compact ? 'mt-1 text-base' : 'mt-2 text-2xl'}`}>{value}</p>
    </div>
  );
}
