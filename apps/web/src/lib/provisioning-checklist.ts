export type ProvisionChecklistItem = {
  id: string;
  phase: string;
  category: string;
  title: string;
  status: string;
  detail?: string;
  automated?: boolean;
};

export type ProvisionChecklist = {
  run_id?: string | null;
  standard_version?: string;
  rules?: Array<{ rule: string; label: string; status: string; check_count: number }>;
  items?: ProvisionChecklistItem[];
};

export function checklistStatusClass(status?: string): string {
  const normalized = (status || 'pending').toLowerCase();
  if (normalized === 'pass') return 'bg-emerald-50 text-emerald-700';
  if (normalized === 'fail') return 'bg-red-50 text-red-700';
  if (normalized === 'warn') return 'bg-amber-50 text-amber-800';
  if (normalized === 'skip') return 'bg-slate-100 text-slate-600';
  if (normalized === 'running') return 'bg-indigo-50 text-indigo-800';
  return 'bg-slate-100 text-slate-500';
}

export function gateStatusLabel(status?: string): string {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'passed' || normalized === 'passed_with_warnings') return 'Passed';
  if (normalized === 'failed') return 'Failed';
  if (normalized === 'running') return 'Running';
  return 'Unknown';
}
