import { QueryTypes } from 'sequelize';
import { Client, User, getSequelize } from '@cd-v2/database';
import type { TokenPayload } from '@/lib/jwt';
import { getAccountingSummary } from '@/lib/accounting';
import { getClientById, serializeClient } from '@/lib/clients';
import { getDashboardOverview } from '@/lib/dashboard';
import { getCompanySettings } from '@/lib/company-settings';
import { listCalendarEvents } from '@/lib/calendar';
import { getMiniDockSettings } from '@/lib/mini-dock';
import { getMspDashboardData } from '@/lib/msp-dashboard';
import { listOpportunities } from '@/lib/sales';
import { getOrderById } from '@/lib/orders';
import { SHIPPING_STAGE_LABELS, SHIPPING_STAGES } from '@/lib/order-constants';
import { describeShipmentJourneyForContext, shippingStageLabel } from '@/lib/order-shipment-stages';
import { getConfiguredSiteUrl } from '@/lib/site-url';
import { getTicketById, serializeTicket } from '@/lib/tickets';
import { buildMiniCdIndex, summarizeMiniCdIndex, type MiniCdIndex } from '@/lib/mini-cd-index';
import { CD_PORTAL_PAGES, CD_SETTINGS_SECTIONS, type CdPortalPage } from '@/lib/mini-cd-catalog';

export type { CdPortalPage };
export { CD_PORTAL_PAGES, CD_SETTINGS_SECTIONS };

export type MiniCdContext = {
  portal: {
    name: string;
    companyName: string;
    siteUrl: string | null;
  };
  user: {
    id: number;
    role: string;
    clearance: string;
    name: string;
    username: string | null;
  };
  pages: Array<{ href: string; label: string; description: string }>;
  settingsSections?: Array<{ tab: string; label: string; href: string }>;
  currentPage: {
    href: string;
    label: string;
    entityId?: string;
    entityType?: string;
  };
  overview: Awaited<ReturnType<typeof getDashboardOverview>>;
  modules: Record<string, unknown>;
  pageDetail: Record<string, unknown> | null;
  index: MiniCdIndex;
  generatedAt: string;
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

function resolvePageLabel(pathname: string, role: string): string {
  const base = pathname.split('?')[0] || '/dashboard';
  if (base.startsWith('/tickets/') && base !== '/tickets') {
    return role === 'client' ? 'My ticket' : 'Ticket detail';
  }
  if (base.startsWith('/clients/') && base !== '/clients') return 'Client detail';
  if (base.startsWith('/orders/') && base !== '/orders') {
    return role === 'client' ? 'My order' : 'Order detail';
  }
  if (base.startsWith('/sales/') && base !== '/sales') return 'Sales opportunity';
  const match = CD_PORTAL_PAGES.find((page) => page.href === base);
  if (match) {
    if (role === 'client' && match.href === '/tickets') return 'My tickets';
    if (role === 'client' && match.href === '/orders') return 'My orders';
    return match.label;
  }
  return 'Portal';
}

export function parseEntityFromPath(pathname: string): { entityType?: string; entityId?: string } {
  const base = pathname.split('?')[0] || '';
  const patterns: Array<[RegExp, string]> = [
    [/^\/tickets\/([^/]+)$/, 'ticket'],
    [/^\/clients\/([^/]+)$/, 'client'],
    [/^\/orders\/([^/]+)$/, 'order'],
    [/^\/sales\/([^/]+)$/, 'opportunity'],
  ];
  for (const [pattern, entityType] of patterns) {
    const match = base.match(pattern);
    if (match?.[1]) return { entityType, entityId: match[1] };
  }
  return {};
}

async function loadPageDetail(
  entityType: string | undefined,
  entityId: string | undefined,
  role: string
): Promise<Record<string, unknown> | null> {
  if (!entityType || !entityId) return null;

  if (entityType === 'ticket') {
    const ticket = await getTicketById(entityId);
    if (!ticket) return null;
    const serialized = serializeTicket(ticket);
    return {
      type: 'ticket',
      id: serialized.id,
      ticketNumber: serialized.ticketNumber,
      clientName: serialized.clientName,
      issue: serialized.issue,
      status: serialized.status,
      priority: serialized.priority,
      technician: serialized.technician,
      lastUpdated: serialized.lastUpdated,
    };
  }

  if (entityType === 'client' && (role === 'admin' || role === 'technician')) {
    const client = await getClientById(entityId);
    if (!client) return null;
    const serialized = serializeClient(client) as Record<string, unknown>;
    return {
      type: 'client',
      id: serialized.id,
      name: serialized.name,
      companyName: serialized.companyName,
      email: serialized.email,
      serviceLevel: serialized.serviceLevel,
      status: serialized.status,
      monthlyRate: serialized.monthlyRate,
      assignedTechnicianId: serialized.assignedTechnicianId,
    };
  }

  if (entityType === 'order') {
    const order = await getOrderById(entityId, { includeCost: role !== 'client' });
    if (!order) return null;
    const history = (order.locationHistory ?? []).slice(-6).map((entry) => ({
      stage: entry.stage ? shippingStageLabel(entry.stage) : undefined,
      location: entry.location,
      at: entry.timestamp,
      source: entry.source,
    }));
    return {
      type: 'order',
      id: order.id,
      orderNumber: order.orderNumber,
      title: order.title,
      itemName: order.itemName,
      status: order.status,
      shippingStage: order.shippingStage,
      shippingStageLabel: shippingStageLabel(order.shippingStage),
      clientName: order.client?.name ?? null,
      trackingNumber: order.trackingNumber,
      vendor: order.vendor,
      vendorOrderNumber: order.vendorOrderNumber,
      currentLocation: order.currentLocation,
      estimatedArrival: order.estimatedArrival,
      shipmentJourney: SHIPPING_STAGES.map((stage) => ({
        stage,
        label: SHIPPING_STAGE_LABELS[stage],
        active: stage === order.shippingStage,
      })),
      locationHistory: history,
    };
  }

  return null;
}

async function loadActiveShipments() {
  try {
    const sequelize = getSequelize();
    return await sequelize.query<{
      orderNumber: string;
      itemName: string;
      shippingStage: string;
      currentLocation: string | null;
      clientName: string | null;
    }>(
      `SELECT o.orderNumber, o.itemName,
        COALESCE(o.shippingStage, o.shipping_stage) AS shippingStage,
        COALESCE(o.currentLocation, o.current_location) AS currentLocation,
        COALESCE(c.company_name, c.name) AS clientName
       FROM orders o
       LEFT JOIN clients c ON c.id = o.clientId
       WHERE o.isActive = 1 AND o.status = 'shipped'
       ORDER BY o.updatedAt DESC LIMIT 6`,
      { type: QueryTypes.SELECT }
    );
  } catch {
    return [];
  }
}

async function loadModuleSummaries(role: string, userId: number): Promise<Record<string, unknown>> {
  const modules: Record<string, unknown> = {};

  if (role === 'admin' || role === 'technician') {
    const [accounting, salesOpportunities, calendarEvents, clientCount, orderCounts, activeShipments, miniDock] =
      await Promise.all([
        getAccountingSummary().catch(() => null),
        listOpportunities({ stage: 'active' }).catch(() => []),
        listCalendarEvents({
          from: new Date().toISOString(),
          to: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        }).catch(() => []),
        Client.count({ where: { isActive: true } }).catch(() => 0),
        Promise.all([
          safeCount(`SELECT COUNT(*) AS count FROM orders WHERE isActive = 1`),
          safeCount(`SELECT COUNT(*) AS count FROM orders WHERE isActive = 1 AND status = 'pending'`),
          safeCount(`SELECT COUNT(*) AS count FROM orders WHERE isActive = 1 AND status = 'in_transit'`),
        ]),
        loadActiveShipments(),
        getMiniDockSettings().catch(() => null),
      ]);

    if (accounting) modules.accounting = accounting;
    modules.sales = {
      activeOpportunities: salesOpportunities.length,
      recent: salesOpportunities.slice(0, 5).map((opp) => ({
        id: opp.id,
        companyName: opp.companyName,
        stage: opp.stage,
        product: opp.product,
      })),
    };
    modules.calendar = {
      upcomingCount: calendarEvents.length,
      upcoming: calendarEvents.slice(0, 6).map((event) => ({
        id: event.id,
        title: event.title,
        scheduledAt: event.scheduledAt,
        eventType: event.eventType,
      })),
    };
    modules.clients = { activeCount: clientCount };
    modules.orders = {
      total: orderCounts[0],
      pending: orderCounts[1],
      inTransit: orderCounts[2],
      activeShipments: activeShipments.map((row) => ({
        orderNumber: row.orderNumber,
        itemName: row.itemName,
        stage: row.shippingStage,
        stageLabel: shippingStageLabel(row.shippingStage),
        location: row.currentLocation,
        clientName: row.clientName,
      })),
    };

    if (role === 'admin' || role === 'technician') {
      modules.msp = await getMspDashboardData()
        .then((data) => ({
          mrr: data.mrr,
          activeSubscriptions: data.activeSubscriptions,
          totalMspClients: data.totalMspClients,
          usageAlertsCount: data.usageAlertsCount,
          popularPlan: data.popularPlan,
        }))
        .catch(() => null);
    }

    if (miniDock) {
      modules.integrations = {
        miniDocked: miniDock.docked,
        miniConnected: miniDock.connected,
        miniLocalUrl: miniDock.localUrl,
      };
    }
  } else if (role === 'client') {
    const client = await Client.findOne({ where: { userId } });
    if (client) {
      const [invoiceCount, orderCount, pendingInvoices] = await Promise.all([
        safeCount(`SELECT COUNT(*) AS count FROM invoices WHERE client_id = :clientId`, {
          clientId: client.id,
        }),
        safeCount(`SELECT COUNT(*) AS count FROM orders WHERE clientId = :clientId AND isActive = 1`, {
          clientId: client.id,
        }),
        safeCount(
          `SELECT COUNT(*) AS count FROM invoices WHERE client_id = :clientId AND status IN ('pending', 'overdue', 'partial')`,
          { clientId: client.id }
        ),
      ]);
      modules.billing = { invoiceCount, pendingInvoices };
      modules.orders = { activeCount: orderCount };
      modules.clientProfile = {
        id: client.id,
        name: client.name,
        serviceLevel: client.serviceLevel,
      };
    }
  }

  return modules;
}

export async function buildMiniCdContext(
  session: TokenPayload,
  options?: { page?: string; pageLabel?: string }
): Promise<MiniCdContext> {
  const role = session.role || 'client';
  const page = (options?.page || '/dashboard').split('?')[0] || '/dashboard';
  const pageLabel = options?.pageLabel || resolvePageLabel(page, role);
  const { entityType, entityId } = parseEntityFromPath(page);

  const userRecord = await User.findByPk(session.id, {
    attributes: ['id', 'username', 'firstName', 'lastName', 'role', 'securityClearance'],
  });
  const company = await getCompanySettings().catch(() => ({ companyName: 'Computer Dynamics' }));

  const [overview, modules, pageDetail, index] = await Promise.all([
    getDashboardOverview(role, session.id),
    loadModuleSummaries(role, session.id),
    loadPageDetail(entityType, entityId, role),
    buildMiniCdIndex(session),
  ]);

  const visiblePages = CD_PORTAL_PAGES.filter((item) => item.roles.includes(role)).map(
    ({ href, label, description }) => ({ href, label, description })
  );

  return {
    portal: {
      name: 'Computer Dynamics MSP Portal',
      companyName: company.companyName || 'Computer Dynamics',
      siteUrl: getConfiguredSiteUrl(),
    },
    user: {
      id: session.id,
      role,
      clearance: userRecord?.securityClearance || session.clearance || 'standard',
      name: userRecord
        ? `${userRecord.firstName || ''} ${userRecord.lastName || ''}`.trim() || userRecord.username
        : session.username || `User ${session.id}`,
      username: userRecord?.username || session.username || null,
    },
    pages: visiblePages,
    ...(role === 'admin'
      ? {
          settingsSections: CD_SETTINGS_SECTIONS.map(({ tab, label, href }) => ({ tab, label, href })),
        }
      : {}),
    currentPage: {
      href: page,
      label: pageLabel,
      ...(entityId ? { entityId, entityType } : {}),
    },
    overview,
    modules,
    pageDetail,
    index,
    generatedAt: new Date().toISOString(),
  };
}

function formatRecentTickets(
  tickets: MiniCdContext['overview']['recentTickets']
): string {
  if (!tickets.length) return 'none';
  return tickets
    .slice(0, 5)
    .map(
      (ticket) =>
        `#${ticket.ticketNumber} ${ticket.clientName}: ${ticket.issue.slice(0, 60)} [${ticket.status}]`
    )
    .join('; ');
}

export function summarizeMiniCdContextForChat(context: MiniCdContext, maxChars = 10000): string {
  const lines: string[] = [
    'Computer Dynamics portal context (live snapshot):',
    `Company: ${context.portal.companyName}`,
    `Operator: ${context.user.name} (${context.user.role}, clearance ${context.user.clearance})`,
    `Current page: ${context.currentPage.label} (${context.currentPage.href})`,
    '',
    'Portal pages available to this user:',
    ...context.pages.map((page) => `- ${page.label} (${page.href}): ${page.description}`),
    ...(context.settingsSections?.length
      ? [
          '',
          'Settings sections (admin):',
          ...context.settingsSections.map((section) => `- ${section.label} (${section.href})`),
        ]
      : []),
    '',
    'Navigation permission: Mini has full role-scoped CD index access, operational logs (email send/failures, recent CD/Mini events), and can execute portal actions. On errors she must use logs as ground truth and recover with Library, web, and code tools.',
    '',
    summarizeMiniCdIndex(context.index),
    '',
    'Dashboard snapshot:',
    `- Users/clients/tickets: ${context.overview.stats.totalUsers}/${context.overview.stats.totalClients}/${context.overview.stats.totalTickets}`,
    `- Open tickets: ${context.overview.stats.openTickets}; resolved: ${context.overview.stats.resolvedTickets}`,
    `- Revenue (paid invoices): TTD ${context.overview.stats.totalRevenue.toFixed(2)}; pending: TTD ${context.overview.stats.pendingPayments.toFixed(2)}`,
    `- Recent tickets: ${formatRecentTickets(context.overview.recentTickets)}`,
  ];

  if (context.overview.security) {
    lines.push(
      `- Security score: ${context.overview.security.score}/100 (${context.overview.security.status})`
    );
  }
  if (context.overview.techMetrics) {
    lines.push(
      `- Technician workload: ${context.overview.techMetrics.inProgressTickets} in-progress ticket(s), ${context.overview.techMetrics.hoursToday}h logged today`
    );
  }
  if (context.overview.clientProfile) {
    const profile = context.overview.clientProfile;
    lines.push(
      `- Client profile: ${profile.invoiceCount} invoice(s), ${profile.orderCount} order(s), ${profile.pendingInvoices} pending invoice(s), service level ${profile.serviceLevel || 'n/a'}`
    );
  }

  const moduleLines: string[] = [];
  const accounting = context.modules.accounting as Record<string, number> | undefined;
  if (accounting) {
    moduleLines.push(
      `Accounting: ${accounting.totalInvoices} invoices (${accounting.overdueInvoices} overdue), ${accounting.totalQuotes} quotes, TTD ${accounting.pendingAmount?.toFixed?.(2) ?? accounting.pendingAmount} pending`
    );
  }
  const sales = context.modules.sales as { activeOpportunities?: number; recent?: Array<Record<string, unknown>> } | undefined;
  if (sales) {
    const recent = (sales.recent || [])
      .slice(0, 3)
      .map((row) => `${row.companyName} [${row.stage}]`)
      .join('; ');
    moduleLines.push(`Sales: ${sales.activeOpportunities ?? 0} active opportunities${recent ? ` — ${recent}` : ''}`);
  }
  const calendar = context.modules.calendar as { upcomingCount?: number; upcoming?: Array<Record<string, unknown>> } | undefined;
  if (calendar) {
    const upcoming = (calendar.upcoming || [])
      .slice(0, 3)
      .map((row) => `${row.title} @ ${row.scheduledAt}`)
      .join('; ');
    moduleLines.push(`Calendar: ${calendar.upcomingCount ?? 0} upcoming event(s)${upcoming ? ` — ${upcoming}` : ''}`);
  }
  const orders = context.modules.orders as Record<string, unknown> | undefined;
  if (orders) {
    const active = Array.isArray(orders.activeShipments)
      ? (orders.activeShipments as Array<Record<string, unknown>>)
          .slice(0, 4)
          .map((row) => `${row.orderNumber} [${row.stageLabel || row.stage}] ${row.itemName}`)
          .join('; ')
      : '';
    moduleLines.push(
      `Orders: ${orders.total ?? orders.activeCount ?? 0} total${orders.pending != null ? `, ${orders.pending} pending` : ''}${orders.inTransit != null ? `, ${orders.inTransit} in transit` : ''}${active ? ` — active: ${active}` : ''}`
    );
  }

  moduleLines.push('', 'Shipment journey stages (orders):', describeShipmentJourneyForContext());
  const clients = context.modules.clients as { activeCount?: number } | undefined;
  if (clients?.activeCount != null) {
    moduleLines.push(`Clients: ${clients.activeCount} active client account(s)`);
  }
  const msp = context.modules.msp as Record<string, unknown> | undefined;
  if (msp) {
    moduleLines.push(
      `MSP: MRR TTD ${msp.mrr}, ${msp.activeSubscriptions} active subscription(s), ${msp.usageAlertsCount} usage alert(s), popular plan ${msp.popularPlan}`
    );
  }
  const integrations = context.modules.integrations as Record<string, unknown> | undefined;
  if (integrations) {
    moduleLines.push(
      `Integrations: Mini docked=${integrations.miniDocked}, connected=${integrations.miniConnected}`
    );
  }

  if (moduleLines.length) {
    lines.push('', 'Module summaries:', ...moduleLines.map((line) => `- ${line}`));
  }

  if (context.pageDetail) {
    lines.push('', 'Current record in view:', JSON.stringify(context.pageDetail));
  }

  const block = lines.join('\n');
  if (block.length <= maxChars) return block;
  return `${block.slice(0, maxChars - 24)}\n… [context truncated]`;
}

export function appendOperationalLogsToSummary(baseSummary: string, operationalLogs: string, maxChars = 14000): string {
  if (!operationalLogs.trim()) return baseSummary;
  const combined = `${baseSummary}\n\n${operationalLogs}`.trim();
  if (combined.length <= maxChars) return combined;
  return `${combined.slice(0, maxChars - 24)}\n… [context truncated]`;
}
