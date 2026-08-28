import { getTicketModel, getShopClientModel, runWithRrspDb } from '@/lib/rrsp-db';
import {
  OPEN_STATUSES,
  RESOLVED_STATUSES,
  normalizeTicketStatus,
  formatTicketStatusLabel,
} from '@/lib/ticket-constants';
import { Op, QueryTypes } from 'sequelize';
import { getSequelize } from '@/lib/db';
import {
  countPendingIncomingPartsRequests,
  ensurePartsCatalogSchema,
} from '@/lib/parts-catalog';
import type { RecentTicket, TicketStatusBreakdown } from '@/lib/dashboard';

export type RrspDashboardOverview = {
  openTickets: number;
  resolvedTickets: number;
  totalTickets: number;
  customers: number;
  pendingOutgoingRequests: number;
  pendingIncomingRequests: number;
  activeRequests: number;
  recentTickets: RecentTicket[];
  ticketBreakdown: TicketStatusBreakdown[];
};

async function countPendingOutgoingPartsRequests(buyerClientId: string): Promise<number> {
  if (!buyerClientId) return 0;
  await ensurePartsCatalogSchema();
  const sequelize = getSequelize();
  const rows = await sequelize.query<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM parts_requests
      WHERE buyerClientId = :buyerClientId
        AND status IN ('pending', 'cancel_requested')
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { buyerClientId },
    }
  );
  return Number(rows[0]?.count ?? 0);
}

export async function getRrspDashboardOverview(
  mspClientId: string
): Promise<RrspDashboardOverview> {
  const [shop, pendingOutgoingRequests, pendingIncomingRequests] = await Promise.all([
    runWithRrspDb(mspClientId, async () => {
      const Ticket = getTicketModel();
      const ShopClient = getShopClientModel();
      const [totalTickets, openTickets, resolvedTickets, customers, recentRows, statusRows] =
        await Promise.all([
          Ticket.count(),
          Ticket.count({ where: { status: { [Op.in]: OPEN_STATUSES } } }),
          Ticket.count({ where: { status: { [Op.in]: RESOLVED_STATUSES } } }),
          ShopClient.count(),
          Ticket.findAll({
            order: [['lastUpdated', 'DESC']],
            limit: 8,
          }),
          Ticket.findAll({ attributes: ['status'] }),
        ]);

      const counts = new Map<string, number>();
      for (const row of statusRows) {
        const status = normalizeTicketStatus(String((row as { status?: string }).status ?? ''));
        counts.set(status, (counts.get(status) ?? 0) + 1);
      }
      const ticketBreakdown: TicketStatusBreakdown[] = Array.from(counts.entries())
        .map(([status, count]) => ({ status: formatTicketStatusLabel(status), count }))
        .sort((a, b) => b.count - a.count);

      const recentTickets: RecentTicket[] = recentRows.map((row) => {
        const t = row as unknown as {
          id: string;
          ticketNumber: string;
          clientId?: string | null;
          clientName?: string;
          issue?: string;
          status: string;
          priority?: string | null;
          technician?: string;
          lastUpdated: string;
        };
        return {
          id: t.id,
          ticketNumber: t.ticketNumber,
          clientId: t.clientId ?? null,
          clientName: t.clientName || 'Customer',
          issue: t.issue || '',
          status: formatTicketStatusLabel(t.status),
          priority: t.priority ?? null,
          technician: t.technician || '',
          lastUpdated: t.lastUpdated,
        };
      });

      return {
        totalTickets,
        openTickets,
        resolvedTickets,
        customers,
        recentTickets,
        ticketBreakdown,
      };
    }),
    countPendingOutgoingPartsRequests(mspClientId),
    countPendingIncomingPartsRequests(mspClientId),
  ]);

  return {
    ...shop,
    pendingOutgoingRequests,
    pendingIncomingRequests,
    activeRequests: pendingOutgoingRequests + pendingIncomingRequests,
  };
}
