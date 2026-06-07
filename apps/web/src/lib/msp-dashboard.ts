import { Op } from 'sequelize';
import { Client } from '@cd-v2/database';
import { SERVICE_LEVELS, SERVICE_PLANS } from '@/lib/client-constants';
import { buildUsageInfo } from '@/lib/clients';
import {
  getClientLicenseSnapshot,
  isLicenseDbAvailable,
} from '@/lib/license-service';

export type MspPlanStat = {
  level: string;
  name: string;
  clients: number;
  revenue: number;
  price: number | null;
};

export type MspUsageAlert = {
  clientId: string;
  clientName: string;
  serviceLevel: string | null;
  metric: string;
  used: number;
  limit: number;
  percentage: number;
};

export type MspLicenseSummary = {
  dbAvailable: boolean;
  dbPath?: string;
  withLicenses: number;
  withoutLicenses: number;
  pendingActivation: number;
  recentActivity: Array<{
    clientId: string;
    clientName: string;
    status: string;
    activationFeatures: string[];
  }>;
};

export type MspDashboardData = {
  mrr: number;
  activeSubscriptions: number;
  avgRevenuePerClient: number;
  totalMspClients: number;
  activeClients: number;
  newClientsThisMonth: number;
  usageAlerts: MspUsageAlert[];
  usageAlertsCount: number;
  planStats: MspPlanStat[];
  popularPlan: string;
  revenueLeader: string;
  onsiteUsage: { used: number; limit: number };
  ticketUsage: { used: number; limit: number };
  license: MspLicenseSummary;
};

function isMspClient(serviceLevel: string | null | undefined) {
  return Boolean(serviceLevel && serviceLevel !== '' && serviceLevel !== 'temp_null');
}

export async function getMspDashboardData(): Promise<MspDashboardData> {
  const clients = await Client.findAll({
    where: {
      serviceLevel: { [Op.in]: [...SERVICE_LEVELS] },
    },
    attributes: [
      'id',
      'name',
      'companyName',
      'serviceLevel',
      'status',
      'isActive',
      'monthlyRate',
      'startDate',
      'usageTracking',
      'features',
    ],
  });

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  let mrr = 0;
  let activeSubscriptions = 0;
  let activeClients = 0;
  let newClientsThisMonth = 0;
  const planStatsMap: Record<string, MspPlanStat> = {};
  for (const level of SERVICE_LEVELS) {
    planStatsMap[level] = {
      level,
      name: SERVICE_PLANS[level].name,
      clients: 0,
      revenue: 0,
      price: SERVICE_PLANS[level].price,
    };
  }

  const usageAlerts: MspUsageAlert[] = [];
  let onsiteUsed = 0;
  let onsiteLimit = 0;
  let ticketUsed = 0;
  let ticketLimit = 0;

  for (const client of clients) {
    if (!client.isActive || client.status !== 'active') continue;
    activeClients++;

    const rate = Number(client.monthlyRate ?? 0);
    if (client.serviceLevel && client.serviceLevel !== 'per-job') {
      mrr += rate;
      activeSubscriptions++;
    }

    const level = client.serviceLevel ?? 'basic';
    if (planStatsMap[level]) {
      planStatsMap[level].clients++;
      planStatsMap[level].revenue += rate;
    }

    if (client.startDate) {
      const start = new Date(client.startDate);
      if (start.getMonth() === currentMonth && start.getFullYear() === currentYear) {
        newClientsThisMonth++;
      }
    }

    const usage = buildUsageInfo(client.usageTracking as Record<string, number>);
    onsiteUsed += usage.onsiteVisits.used;
    onsiteLimit += usage.onsiteVisits.limit;
    ticketUsed += usage.supportTickets.used;
    ticketLimit += usage.supportTickets.limit;

    const alertMetrics: Array<{ key: string; label: string; data: { used: number; limit: number; percentage: number } }> = [
      { key: 'onsite', label: 'Onsite visits', data: usage.onsiteVisits },
      { key: 'tickets', label: 'Support tickets', data: usage.supportTickets },
      { key: 'endpoints', label: 'Endpoints', data: usage.endpoints },
      { key: 'hours', label: 'Support hours', data: usage.supportHours },
    ];

    for (const m of alertMetrics) {
      if (m.data.limit > 0 && m.data.percentage >= 80) {
        usageAlerts.push({
          clientId: client.id,
          clientName: client.companyName || client.name,
          serviceLevel: client.serviceLevel ?? null,
          metric: m.label,
          used: m.data.used,
          limit: m.data.limit,
          percentage: m.data.percentage,
        });
      }
    }
  }

  const planStats = Object.values(planStatsMap);
  const popularPlan =
    planStats.reduce((a, b) => (b.clients > a.clients ? b : a), planStats[0])?.level ?? 'standard';
  const revenueLeader =
    planStats.reduce((a, b) => (b.revenue > a.revenue ? b : a), planStats[0])?.level ?? 'premium';

  const license = await buildLicenseSummary(clients);

  return {
    mrr: Math.round(mrr * 100) / 100,
    activeSubscriptions,
    avgRevenuePerClient: activeClients > 0 ? Math.round((mrr / activeClients) * 100) / 100 : 0,
    totalMspClients: clients.length,
    activeClients,
    newClientsThisMonth,
    usageAlerts,
    usageAlertsCount: usageAlerts.length,
    planStats,
    popularPlan,
    revenueLeader,
    onsiteUsage: { used: onsiteUsed, limit: onsiteLimit },
    ticketUsage: { used: ticketUsed, limit: ticketLimit },
    license,
  };
}

async function buildLicenseSummary(
  clients: Client[]
): Promise<MspLicenseSummary> {
  const dbAvailable = isLicenseDbAvailable();
  if (!dbAvailable) {
    return {
      dbAvailable: false,
      withLicenses: 0,
      withoutLicenses: 0,
      pendingActivation: 0,
      recentActivity: [],
    };
  }

  let withLicenses = 0;
  let withoutLicenses = 0;
  let pendingActivation = 0;
  const recentActivity: MspLicenseSummary['recentActivity'] = [];

  for (const client of clients) {
    try {
      const snapshot = await getClientLicenseSnapshot(client.id);
      if (snapshot.activationFeatures.length === 0) continue;

      if (snapshot.overallStatus === 'Active') withLicenses++;
      else if (snapshot.overallStatus === 'Partial' || snapshot.overallStatus === 'Pending') pendingActivation++;
      else withoutLicenses++;

      recentActivity.push({
        clientId: client.id,
        clientName: client.companyName || client.name,
        status:
          snapshot.overallStatus === 'Active'
            ? 'Active'
            : snapshot.overallStatus === 'Partial'
              ? 'Partial'
              : snapshot.overallStatus === 'Pending'
                ? 'Pending'
                : 'Not Found',
        activationFeatures: snapshot.activationFeatures,
      });
    } catch {
      withoutLicenses++;
    }
  }

  return {
    dbAvailable: true,
    withLicenses,
    withoutLicenses,
    pendingActivation,
    recentActivity: recentActivity.slice(0, 10),
  };
}

export { isMspClient };
export { ACTIVATION_FEATURES } from '@/lib/license-constants';
