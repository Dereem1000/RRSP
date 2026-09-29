import type { LucideIcon } from 'lucide-react';

export function StatCard({
  label,
  value,
  subtext,
  icon: Icon,
  accent,
  compact = false,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  icon: LucideIcon;
  accent: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white shadow-sm ${
        compact ? 'p-3 sm:p-6' : 'p-6'
      }`}
    >
      <div className="flex items-start justify-between gap-2 sm:gap-4">
        <div className="min-w-0">
          <p
            className={`font-medium text-slate-500 ${
              compact ? 'text-[10px] uppercase tracking-wide sm:text-sm sm:normal-case sm:tracking-normal' : 'text-sm'
            }`}
          >
            {label}
          </p>
          <p
            className={`truncate font-bold tracking-tight text-slate-900 ${
              compact ? 'mt-0.5 text-lg sm:mt-2 sm:text-3xl' : 'mt-2 text-3xl'
            }`}
          >
            {value}
          </p>
          {subtext && <p className="mt-1 text-xs text-slate-400">{subtext}</p>}
        </div>
        <div className={`shrink-0 rounded-xl ${compact ? 'p-2 sm:p-2.5' : 'p-2.5'} ${accent}`}>
          <Icon className={compact ? 'h-4 w-4 sm:h-5 sm:w-5' : 'h-5 w-5'} />
        </div>
      </div>
    </div>
  );
}
