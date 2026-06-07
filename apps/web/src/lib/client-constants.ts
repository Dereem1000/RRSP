export const CLIENT_STATUSES = ['active', 'inactive', 'suspended', 'pending'] as const;

export const SERVICE_LEVELS = ['basic', 'standard', 'premium', 'enterprise', 'per-job'] as const;

export type ServiceLevel = (typeof SERVICE_LEVELS)[number];

export const SUPPORT_TIERS = ['bronze', 'silver', 'gold', 'platinum'] as const;

export const PRIORITY_LEVELS = ['low', 'medium', 'high', 'critical'] as const;

export const USAGE_TYPES = ['onsiteVisits', 'supportTickets', 'endpoints', 'supportHours'] as const;

export const BILLING_CYCLES = ['monthly', 'quarterly', 'annually'] as const;

export const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800',
  inactive: 'bg-slate-100 text-slate-600',
  suspended: 'bg-amber-100 text-amber-800',
  pending: 'bg-blue-100 text-blue-800',
};

export const SERVICE_LEVEL_COLORS: Record<string, string> = {
  basic: 'bg-slate-100 text-slate-700',
  standard: 'bg-blue-100 text-blue-800',
  premium: 'bg-violet-100 text-violet-800',
  enterprise: 'bg-amber-100 text-amber-800',
  'per-job': 'bg-emerald-100 text-emerald-800',
};

export type ServicePlanLimits = {
  onsiteVisitsLimit: number;
  supportTicketsLimit: number;
  endpointsLimit: number;
  supportHoursLimit: number;
};

export type ServicePlanConfig = {
  name: string;
  price: number | null;
  features: string[];
  limits: ServicePlanLimits;
  sla: {
    responseTime: string;
    resolutionTime: string;
    uptime: string;
    supportHours: string;
  };
  usageMetrics: (typeof USAGE_TYPES)[number][];
};

export const SERVICE_PLANS: Record<ServiceLevel, ServicePlanConfig> = {
  basic: {
    name: 'Basic Tier',
    price: 3000,
    features: [
      'Business hours support (8–4)',
      'Remote-only support',
      'Basic security setup',
      'Google Workspace support',
      'Weekly backups',
      '4 free onsite visits',
      '14-day social media ads',
    ],
    limits: { onsiteVisitsLimit: 4, supportTicketsLimit: 20, endpointsLimit: 0, supportHoursLimit: 0 },
    sla: { responseTime: '4 hours', resolutionTime: '24 hours', uptime: '99.5%', supportHours: '8–4' },
    usageMetrics: ['onsiteVisits', 'supportTickets'],
  },
  standard: {
    name: 'Standard Tier',
    price: 6000,
    features: [
      'Extended business hours',
      'Network management (5 endpoints)',
      'Security monitoring',
      'Microsoft 365 support',
      'Weekly backups',
      '8 free onsite visits',
      '30-day social media ads',
    ],
    limits: { onsiteVisitsLimit: 8, supportTicketsLimit: 50, endpointsLimit: 5, supportHoursLimit: 0 },
    sla: { responseTime: '3 hours', resolutionTime: '16 hours', uptime: '99.7%', supportHours: '8–6' },
    usageMetrics: ['onsiteVisits', 'supportTickets', 'endpoints'],
  },
  premium: {
    name: 'Premium Tier',
    price: 7000,
    features: [
      '12-hour support',
      'Website development',
      'Microsoft 365 (4 users)',
      'App design',
      'Advanced analytics',
      'Video templates',
      'Multi-platform ads',
    ],
    limits: { onsiteVisitsLimit: 12, supportTicketsLimit: 100, endpointsLimit: 10, supportHoursLimit: 12 },
    sla: { responseTime: '2 hours', resolutionTime: '8 hours', uptime: '99.9%', supportHours: '7–7' },
    usageMetrics: ['onsiteVisits', 'supportTickets', 'endpoints', 'supportHours'],
  },
  enterprise: {
    name: 'Enterprise Tier',
    price: 1999.99,
    features: [
      '24/7 priority support',
      'Dedicated technician',
      'Unlimited remote support',
      'Advanced security & compliance',
      'Custom SLA',
      '20 onsite visits',
      'Full endpoint management',
    ],
    limits: { onsiteVisitsLimit: 20, supportTicketsLimit: 200, endpointsLimit: 20, supportHoursLimit: 24 },
    sla: { responseTime: '1 hour', resolutionTime: '4 hours', uptime: '99.99%', supportHours: '24/7' },
    usageMetrics: ['onsiteVisits', 'supportTickets', 'endpoints', 'supportHours'],
  },
  'per-job': {
    name: 'Per-Job Rate',
    price: null,
    features: [
      'Pay per ticket',
      'Network troubleshooting',
      'Cloud management',
      'Data recovery',
      'Hardware repairs',
      'Remote diagnostics first',
      'Onsite available',
    ],
    limits: { onsiteVisitsLimit: 0, supportTicketsLimit: 0, endpointsLimit: 0, supportHoursLimit: 0 },
    sla: { responseTime: 'Next business day', resolutionTime: 'As quoted', uptime: 'N/A', supportHours: 'On request' },
    usageMetrics: [],
  },
};

export const DEFAULT_USAGE_LIMITS: Record<string, ServicePlanLimits> = Object.fromEntries(
  SERVICE_LEVELS.map((level) => [level, SERVICE_PLANS[level].limits])
);

export function isMspRecurringLevel(level: string | null | undefined): level is ServiceLevel {
  return Boolean(level && level !== 'per-job' && level in SERVICE_PLANS);
}

export function getPlanForLevel(level: string | null | undefined): ServicePlanConfig | null {
  if (!level || !(level in SERVICE_PLANS)) return null;
  return SERVICE_PLANS[level as ServiceLevel];
}

export function getUsageMetricsForLevel(level: string | null | undefined): (typeof USAGE_TYPES)[number][] {
  return getPlanForLevel(level)?.usageMetrics ?? [];
}

export function getDefaultMonthlyRate(level: string | null | undefined): number | null {
  const plan = getPlanForLevel(level);
  if (!plan) return null;
  return plan.price;
}

export function getDefaultSlaForLevel(level: string | null | undefined) {
  return getPlanForLevel(level)?.sla ?? {
    responseTime: '4 hours',
    resolutionTime: '24 hours',
    uptime: '99.9%',
    supportHours: '8–5',
  };
}

export function buildUsageLimitsFromLevel(
  level: string | null | undefined,
  current?: Record<string, number | string | null | undefined> | null
) {
  const plan = getPlanForLevel(level);
  const limits = plan?.limits ?? {
    onsiteVisitsLimit: 0,
    supportTicketsLimit: 0,
    endpointsLimit: 0,
    supportHoursLimit: 0,
  };
  return {
    onsiteVisitsUsed: Number(current?.onsiteVisitsUsed ?? 0),
    supportTicketsUsed: Number(current?.supportTicketsUsed ?? 0),
    endpointsUsed: Number(current?.endpointsUsed ?? 0),
    supportHoursUsed: Number(current?.supportHoursUsed ?? 0),
    lastResetDate: (current?.lastResetDate as string | null) ?? null,
    ...limits,
  };
}

export type UsageMetric = {
  used: number;
  limit: number;
  percentage: number;
};

export type UsageInfo = {
  onsiteVisits: UsageMetric;
  supportTickets: UsageMetric;
  endpoints: UsageMetric;
  supportHours: UsageMetric;
  lastResetDate: string | null;
};
