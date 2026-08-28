import { STATUS_COLORS, formatTicketStatusLabel, normalizeTicketStatus } from '@/lib/ticket-constants';

export function TicketStatusBadge({ status }: { status: string }) {
  const normalized = normalizeTicketStatus(status);
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
        STATUS_COLORS[normalized] ?? STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-600'
      }`}
    >
      {formatTicketStatusLabel(status)}
    </span>
  );
}
