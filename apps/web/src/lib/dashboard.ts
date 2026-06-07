import os from 'os';
import { Op, QueryTypes } from 'sequelize';
import { getSequelize, User, Client, Ticket } from '@cd-v2/database';

import { OPEN_STATUSES, RESOLVED_STATUSES, IN_PROGRESS_STATUSES, normalizeTicketStatus, formatTicketStatusLabel } from '@/lib/ticket-constants';

export { OPEN_STATUSES, RESOLVED_STATUSES };

export type DashboardStats = {
  totalUsers: number;
  totalClients: number;
  totalTickets: number;
  openTickets: number;
  resolvedTickets: number;
  activeActivities: number;
  totalRevenue: number;
  pendingPayments: number;
  totalInvoices: number;
  overdueInvoices: number;
};

export type SystemHealth = {
  cpuUsage: number;
  memoryUsage: number;
  uptimeHours: number;
  status: 'operational' | 'degraded' | 'unknown';
};

export type RecentTicket = {
  id: string;
  ticketNumber: string;
  clientId?: string | null;
  clientName: string;
  issue: string;
  status: string;
  priority: string | null;
  technician: string;
  lastUpdated: string;
};

export type TicketStatusBreakdown = {
  status: string;
  count: number;
};

export type RecentActivity = {
  id: number;
  description: string;
  userName: string;
  createdAt: string;
};

export type SecurityEventSummary = {
  id: number;
  eventType: string;
  severity: string;
  description: string;
  createdAt: string;
};

export type SecurityStatus = {
  score: number;
  status: 'secure' | 'warning' | 'critical';
  recentEvents: SecurityEventSummary[];
};

export type ClientProfile = {
  serviceLevel: string | null;
  assignedTechnician: string | null;
  invoiceCount: number;
  quoteCount: number;
  orderCount: number;
  pendingInvoices: number;
};

export type TechnicianMetrics = {
  inProgressTickets: number;
  hoursToday: number;
};

export type DashboardOverview = {
  stats: DashboardStats;
  systemHealth: SystemHealth;
  recentTickets: RecentTicket[];
  ticketBreakdown: TicketStatusBreakdown[];
  recentActivity: RecentActivity[];
  security?: SecurityStatus;
  clientProfile?: ClientProfile;
  techMetrics?: TechnicianMetrics;
};

async function safeCount(query: string, replacements?: Record<string, unknown>): Promise<number> {
  try {
    const sequelize = getSequelize();
    const rows = await sequelize.query<{ count: number }>(query, {
      type: QueryTypes.SELECT,
      replacements,
    });
    return Number(rows[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

async function getFinancialStats(): Promise<{
  totalRevenue: number;
  pendingPayments: number;
  totalInvoices: number;
  overdueInvoices: number;
}> {
  try {
    const sequelize = getSequelize();
    const rows = await sequelize.query<{
      totalRevenue: number;
      pendingPayments: number;
      totalInvoices: number;
      overdueInvoices: number;
    }>(
      `SELECT
        COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS totalRevenue,
        COALESCE(SUM(CASE WHEN status IN ('pending', 'partial', 'overdue') THEN amount ELSE 0 END), 0) AS pendingPayments,
        COUNT(*) AS totalInvoices,
        COALESCE(SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END), 0) AS overdueInvoices
      FROM invoices`,
      { type: QueryTypes.SELECT }
    );
    const row = rows[0];
    return {
      totalRevenue: Math.round(Number(row?.totalRevenue ?? 0) * 100) / 100,
      pendingPayments: Math.round(Number(row?.pendingPayments ?? 0) * 100) / 100,
      totalInvoices: Number(row?.totalInvoices ?? 0),
      overdueInvoices: Number(row?.overdueInvoices ?? 0),
    };
  } catch {
    return { totalRevenue: 0, pendingPayments: 0, totalInvoices: 0, overdueInvoices: 0 };
  }
}

async function getActiveActivitiesCount(): Promise<number> {
  return safeCount(`SELECT COUNT(*) AS count FROM activities WHERE status = 'active'`);
}

async function getRecentActivities(limit = 10, userId?: number): Promise<RecentActivity[]> {
  try {
    const sequelize = getSequelize();
    const userFilter = userId != null ? 'WHERE a.user_id = :userId' : '';
    const rows = await sequelize.query<{
      id: number;
      description: string;
      userName: string;
      createdAt: string;
    }>(
      `SELECT a.id, COALESCE(a.description, a.project_name, 'Activity') AS description,
              COALESCE(u.first_name || ' ' || u.last_name, u.username, 'System') AS userName,
              COALESCE(a.clock_in_time, a.created_at) AS createdAt
       FROM activities a
       LEFT JOIN users u ON u.id = a.user_id
       ${userFilter}
       ORDER BY COALESCE(a.clock_in_time, a.created_at) DESC
       LIMIT :limit`,
      { replacements: { limit, userId }, type: QueryTypes.SELECT }
    );
    return rows.map((r) => ({
      id: r.id,
      description: r.description,
      userName: r.userName,
      createdAt: r.createdAt,
    }));
  } catch {
    return [];
  }
}

function getSystemHealth(): SystemHealth {
  try {
    let cpuUsage = 0;
    let memoryUsage = 0;
    let uptimeHours = 0;

    if (os.loadavg) cpuUsage = Math.round(os.loadavg()[0] * 100) / 100;
    if (os.totalmem && os.freemem) {
      memoryUsage = Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 10000) / 100;
    }
    if (os.uptime) uptimeHours = Math.round(os.uptime() / 3600);

    return { cpuUsage, memoryUsage, uptimeHours, status: 'operational' };
  } catch {
    return { cpuUsage: 0, memoryUsage: 0, uptimeHours: 0, status: 'unknown' };
  }
}

async function getSecurityStatus(): Promise<SecurityStatus> {
  try {
    const sequelize = getSequelize();
    const rows = await sequelize.query<{
      id: number;
      event_type: string;
      severity: string;
      description: string;
      created_at: string;
    }>(
      `SELECT id, event_type, severity, description, created_at
       FROM security_events
       ORDER BY created_at DESC
       LIMIT 8`,
      { type: QueryTypes.SELECT }
    );

    const recentEvents = rows.map((r) => ({
      id: r.id,
      eventType: r.event_type,
      severity: r.severity,
      description: r.description,
      createdAt: r.created_at,
    }));

    const criticalEvents = recentEvents.filter((e) => e.severity === 'critical').length;
    const highEvents = recentEvents.filter((e) => e.severity === 'high').length;

    let score = 100;
    if (criticalEvents > 0) score -= 30;
    if (highEvents > 0) score -= 15;
    if (highEvents > 5) score -= 10;
    score = Math.max(0, score);

    return {
      score,
      status: score >= 80 ? 'secure' : score >= 60 ? 'warning' : 'critical',
      recentEvents,
    };
  } catch {
    return { score: 100, status: 'secure', recentEvents: [] };
  }
}

async function getClientProfile(clientId: string): Promise<ClientProfile> {
  const [invoiceCount, quoteCount, orderCount, pendingInvoices] = await Promise.all([
    safeCount(`SELECT COUNT(*) AS count FROM invoices WHERE client_id = :clientId`, { clientId }),
    safeCount(`SELECT COUNT(*) AS count FROM quotes WHERE client_id = :clientId`, { clientId }),
    safeCount(`SELECT COUNT(*) AS count FROM orders WHERE client_id = :clientId`, { clientId }),
    safeCount(
      `SELECT COUNT(*) AS count FROM invoices WHERE client_id = :clientId AND status IN ('pending', 'overdue', 'partial')`,
      { clientId }
    ),
  ]);

  const client = await Client.findByPk(clientId, { attributes: ['serviceLevel', 'assignedTechnicianId'] });
  let assignedTechnician: string | null = null;
  if (client?.assignedTechnicianId) {
    const techId = Number(client.assignedTechnicianId);
    const tech = Number.isFinite(techId) ? await User.findByPk(techId, {
      attributes: ['firstName', 'lastName', 'username'],
    }) : null;
    if (tech) assignedTechnician = `${tech.firstName} ${tech.lastName}`.trim() || tech.username;
  }

  return {
    serviceLevel: client?.serviceLevel ?? null,
    assignedTechnician,
    invoiceCount,
    quoteCount,
    orderCount,
    pendingInvoices,
  };
}

async function getTechnicianMetrics(userId: number): Promise<TechnicianMetrics> {
  const [inProgressTickets, hoursToday] = await Promise.all([
    Ticket.count({ where: { isActive: 1, assignedTo: userId, status: { [Op.in]: IN_PROGRESS_STATUSES } } }),
    safeCount(
      `SELECT COALESCE(SUM(duration_minutes), 0) / 60.0 AS count FROM activities
       WHERE user_id = :userId AND date(clock_in_time) = date('now')`,
      { userId }
    ),
  ]);

  return {
    inProgressTickets,
    hoursToday: Math.round(Number(hoursToday) * 100) / 100,
  };
}

async function getTicketBreakdown(where: Record<string, unknown> = {}): Promise<TicketStatusBreakdown[]> {
  const tickets = await Ticket.findAll({
    where: { isActive: 1, ...where },
    attributes: ['status'],
  });
  const counts = new Map<string, number>();
  for (const t of tickets) {
    const status = normalizeTicketStatus(t.status);
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([status, count]) => ({ status: formatTicketStatusLabel(status), count }))
    .sort((a, b) => b.count - a.count);
}

function mapRecentTickets(tickets: Ticket[]): RecentTicket[] {
  return tickets.map((t) => ({
    id: t.id,
    ticketNumber: t.ticketNumber,
    clientId: t.clientId,
    clientName: t.clientName,
    issue: t.issue,
    status: t.status,
    priority: t.priority,
    technician: t.technician,
    lastUpdated: t.lastUpdated,
  }));
}

export async function getAdminDashboardOverview(): Promise<DashboardOverview> {
  const [totalUsers, totalClients, totalTickets, openTickets, resolvedTickets, financial, activeActivities] =
    await Promise.all([
      User.count({ where: { isActive: true } }),
      Client.count({ where: { isActive: true } }),
      Ticket.count({ where: { isActive: 1 } }),
      Ticket.count({ where: { isActive: 1, status: { [Op.in]: OPEN_STATUSES } } }),
      Ticket.count({ where: { isActive: 1, status: { [Op.in]: RESOLVED_STATUSES } } }),
      getFinancialStats(),
      getActiveActivitiesCount(),
    ]);

  const [recentTickets, ticketBreakdown, recentActivity, security] = await Promise.all([
    Ticket.findAll({ where: { isActive: 1 }, order: [['lastUpdated', 'DESC']], limit: 8 }),
    getTicketBreakdown(),
    getRecentActivities(8),
    getSecurityStatus(),
  ]);

  return {
    stats: {
      totalUsers,
      totalClients,
      totalTickets,
      openTickets,
      resolvedTickets,
      activeActivities,
      ...financial,
    },
    systemHealth: getSystemHealth(),
    recentTickets: mapRecentTickets(recentTickets),
    ticketBreakdown,
    recentActivity,
    security,
  };
}

export async function getTechnicianDashboardOverview(userId: number): Promise<DashboardOverview> {
  const assignedWhere = { isActive: 1, assignedTo: userId };

  const [totalTickets, openTickets, resolvedTickets, activeActivities] = await Promise.all([
    Ticket.count({ where: assignedWhere }),
    Ticket.count({ where: { ...assignedWhere, status: { [Op.in]: OPEN_STATUSES } } }),
    Ticket.count({ where: { ...assignedWhere, status: { [Op.in]: RESOLVED_STATUSES } } }),
    safeCount(`SELECT COUNT(*) AS count FROM activities WHERE user_id = :userId AND status = 'active'`, {
      userId,
    }),
  ]);

  const [recentTickets, ticketBreakdown, recentActivity, techMetrics, security] = await Promise.all([
    Ticket.findAll({ where: assignedWhere, order: [['lastUpdated', 'DESC']], limit: 8 }),
    getTicketBreakdown({ assignedTo: userId }),
    getRecentActivities(5, userId),
    getTechnicianMetrics(userId),
    getSecurityStatus(),
  ]);

  return {
    stats: {
      totalUsers: 0,
      totalClients: 0,
      totalTickets,
      openTickets,
      resolvedTickets,
      activeActivities,
      totalRevenue: 0,
      pendingPayments: 0,
      totalInvoices: 0,
      overdueInvoices: 0,
    },
    systemHealth: getSystemHealth(),
    recentTickets: mapRecentTickets(recentTickets),
    ticketBreakdown,
    recentActivity,
    techMetrics,
    security,
  };
}

export async function getClientDashboardOverview(userId: number): Promise<DashboardOverview> {
  const client = await Client.findOne({ where: { userId } });

  if (!client) {
    return {
      stats: {
        totalUsers: 0,
        totalClients: 0,
        totalTickets: 0,
        openTickets: 0,
        resolvedTickets: 0,
        activeActivities: 0,
        totalRevenue: 0,
        pendingPayments: 0,
        totalInvoices: 0,
        overdueInvoices: 0,
      },
      systemHealth: { cpuUsage: 0, memoryUsage: 0, uptimeHours: 0, status: 'operational' },
      recentTickets: [],
      ticketBreakdown: [],
      recentActivity: [],
    };
  }

  const ticketWhere = { isActive: 1, clientId: client.id };

  const [totalTickets, openTickets, resolvedTickets] = await Promise.all([
    Ticket.count({ where: ticketWhere }),
    Ticket.count({ where: { ...ticketWhere, status: { [Op.in]: OPEN_STATUSES } } }),
    Ticket.count({ where: { ...ticketWhere, status: { [Op.in]: RESOLVED_STATUSES } } }),
  ]);

  const [recentTickets, ticketBreakdown, clientProfile] = await Promise.all([
    Ticket.findAll({ where: ticketWhere, order: [['lastUpdated', 'DESC']], limit: 8 }),
    getTicketBreakdown({ clientId: client.id }),
    getClientProfile(client.id),
  ]);

  return {
    stats: {
      totalUsers: 0,
      totalClients: 1,
      totalTickets,
      openTickets,
      resolvedTickets,
      activeActivities: 0,
      totalRevenue: 0,
      pendingPayments: 0,
      totalInvoices: clientProfile.invoiceCount,
      overdueInvoices: clientProfile.pendingInvoices,
    },
    systemHealth: { cpuUsage: 0, memoryUsage: 0, uptimeHours: 0, status: 'operational' },
    recentTickets: mapRecentTickets(recentTickets),
    ticketBreakdown,
    recentActivity: [],
    clientProfile,
  };
}

export async function getDashboardOverview(role: string, userId: number): Promise<DashboardOverview> {
  if (role === 'admin') return getAdminDashboardOverview();
  if (role === 'technician') return getTechnicianDashboardOverview(userId);
  return getClientDashboardOverview(userId);
}

export function formatCurrency(amount: number): string {
  return `TTD ${amount.toLocaleString('en-TT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
