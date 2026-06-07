/** Canonical stored value — matches v1 ticket manager. */
export const IN_PROGRESS_STATUS = 'In-progress';

export const TICKET_STATUSES = [
  'New',
  'Open',
  IN_PROGRESS_STATUS,
  'Pending',
  'Diagnosed',
  'Awaiting-Response',
  'Awaiting-Part',
  'Resolved',
  'Completed',
  'Closed',
] as const;

export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;

export const TICKET_CATEGORIES = [
  'general',
  'hardware',
  'software',
  'network',
  'repair',
  'installation',
  'consultation',
  'other',
] as const;

export const DEVICE_TYPES = [
  'Dell',
  'HP',
  'Lenovo',
  'Apple',
  'Samsung',
  'Acer',
  'Asus',
  'Microsoft',
  'Desktop',
  'Laptop',
  'Server',
  'Mobile',
  'Printer',
  'Other',
] as const;

export const TICKET_LOCATIONS = [
  'Malabar Arima',
  'Freeport',
  'On-site',
  'Remote',
  'Shop',
  'Not specified',
] as const;

export const COMMENT_TYPES = [
  { value: 'update', label: 'Update' },
  { value: 'diagnosis', label: 'Diagnosis' },
  { value: 'resolution', label: 'Resolution' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'escalation', label: 'Escalation' },
  { value: 'order_part', label: 'Order Part' },
  { value: 'general', label: 'General' },
] as const;

/** Normalize legacy/alternate status values before save or display grouping. */
export function normalizeTicketStatus(status: string): string {
  if (status === 'In Progress' || status === 'in_progress' || status === 'in progress') {
    return IN_PROGRESS_STATUS;
  }
  return status;
}

/** Human-readable label for UI (dropdowns, badges). */
export function formatTicketStatusLabel(status: string): string {
  const normalized = normalizeTicketStatus(status);
  if (normalized === IN_PROGRESS_STATUS) return 'In Progress';
  return normalized;
}

export const STATUS_COLORS: Record<string, string> = {
  New: 'bg-blue-100 text-blue-800',
  Open: 'bg-sky-100 text-sky-800',
  [IN_PROGRESS_STATUS]: 'bg-amber-100 text-amber-800',
  'In Progress': 'bg-amber-100 text-amber-800',
  Pending: 'bg-orange-100 text-orange-800',
  Diagnosed: 'bg-violet-100 text-violet-800',
  'Awaiting-Response': 'bg-yellow-100 text-yellow-800',
  'Awaiting-Part': 'bg-orange-100 text-orange-800',
  Resolved: 'bg-emerald-100 text-emerald-800',
  Completed: 'bg-emerald-100 text-emerald-800',
  Closed: 'bg-slate-100 text-slate-600',
};

export const OPEN_STATUSES = [
  'New',
  'Open',
  IN_PROGRESS_STATUS,
  'Pending',
  'Diagnosed',
  'Awaiting-Response',
  'Awaiting-Part',
];

export const RESOLVED_STATUSES = ['Resolved', 'Completed', 'Closed'];

/** Match in-progress tickets including legacy stored value. */
export const IN_PROGRESS_STATUSES = [IN_PROGRESS_STATUS, 'In Progress'];
