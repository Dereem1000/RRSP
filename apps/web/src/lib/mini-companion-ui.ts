export type MiniCompanionKind = 'thought' | 'request' | 'assistance' | 'growth' | string;

export type MiniChatEntry = {
  role: string;
  content: string;
  created_at?: string | null;
  kind?: MiniCompanionKind;
  read?: boolean;
  fingerprint?: string;
};

export type MiniGrowthPayload = {
  narrative?: string;
  maturity?: string;
  totals?: Record<string, number>;
  deltas?: Record<string, number>;
  companion_activity?: Record<string, number>;
};

export function companionKindLabel(kind?: MiniCompanionKind): string {
  switch (kind) {
    case 'thought':
      return 'Mini · thinking';
    case 'request':
      return 'Mini · request';
    case 'assistance':
      return 'Mini · assistance';
    case 'growth':
      return 'Mini · growth';
    default:
      return 'Mini';
  }
}

export function companionBubbleClass(role: string, kind?: MiniCompanionKind): string {
  if (role === 'companion') {
    if (kind === 'request') {
      return 'border border-amber-200 bg-amber-50 text-amber-950';
    }
    if (kind === 'assistance') {
      return 'border border-emerald-200 bg-emerald-50 text-emerald-950';
    }
    if (kind === 'growth') {
      return 'border border-violet-200 bg-violet-50 text-violet-950';
    }
    return 'border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-950';
  }
  if (role === 'assistant') {
    return 'bg-white text-slate-800 shadow-sm';
  }
  if (role === 'system') {
    return 'border border-slate-200 bg-slate-100 text-slate-700';
  }
  return 'bg-sky-100 text-sky-950';
}

export function companionKindBadgeClass(kind?: MiniCompanionKind): string {
  if (kind === 'request') return 'bg-amber-100 text-amber-800';
  if (kind === 'assistance') return 'bg-emerald-100 text-emerald-800';
  if (kind === 'growth') return 'bg-violet-100 text-violet-800';
  return 'bg-fuchsia-100 text-fuchsia-800';
}
