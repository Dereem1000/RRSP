import type { TicketStatusBreakdown } from '@/lib/dashboard';

const barColors = [
  'bg-indigo-500',
  'bg-sky-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-orange-500',
  'bg-violet-500',
  'bg-slate-400',
];

export function TicketBreakdown({
  breakdown,
  compact = false,
  fill = false,
}: {
  breakdown: TicketStatusBreakdown[];
  compact?: boolean;
  fill?: boolean;
}) {
  const max = Math.max(...breakdown.map((b) => b.count), 1);

  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white shadow-sm ${
        compact ? 'p-4' : 'p-6'
      } ${fill ? 'flex min-h-0 flex-1 flex-col' : ''}`}
    >
      <h2 className="shrink-0 font-semibold text-slate-900">Tickets by status</h2>
      <div
        className={
          fill && compact
            ? 'mt-3 flex min-h-0 flex-1 flex-col justify-between gap-2'
            : compact
              ? 'mt-3 space-y-2'
              : 'mt-5 space-y-4'
        }
      >
        {breakdown.length === 0 ? (
          <p className="text-sm text-slate-400">No ticket data</p>
        ) : (
          breakdown.map(({ status, count }, i) => (
            <div key={status}>
              <div className={`flex items-center justify-between text-sm ${compact ? 'mb-1' : 'mb-1.5'}`}>
                <span className="font-medium text-slate-700">{status}</span>
                <span className="text-slate-500">{count}</span>
              </div>
              <div className={`overflow-hidden rounded-full bg-slate-100 ${compact ? 'h-1.5' : 'h-2'}`}>
                <div
                  className={`h-full rounded-full ${barColors[i % barColors.length]}`}
                  style={{ width: `${(count / max) * 100}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
