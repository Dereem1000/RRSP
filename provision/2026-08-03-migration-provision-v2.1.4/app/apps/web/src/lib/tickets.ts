import { Op } from 'sequelize';
import {
  Client as MspClient,
  Ticket as CdTicket,
  User,
} from '@cd-v2/database';
import type { TokenPayload } from '@/lib/jwt';
import { normalizeStoredPhone } from '@/lib/phone-utils';
import { ensureCommentLinkedOrderColumn } from '@/lib/ticket-schema';
import {
  getRrspContext,
  getShopClientModel,
  getTicketCommentModel,
  getTicketModel,
  isRrspDbActive,
} from '@/lib/rrsp-db';

export type SessionUser = TokenPayload & {
  firstName?: string;
  lastName?: string;
  username?: string;
};

export async function getTicketScopeWhere(
  session: SessionUser
): Promise<{ where: Record<string, unknown>; denied: boolean }> {
  const where: Record<string, unknown> = { isActive: 1 };

  if (session.role === 'client') {
    if (isRrspDbActive()) {
      // Entire RRSP DB belongs to this shop — no MSP clientId filter.
      return { where, denied: false };
    }
    const client = await MspClient.findOne({ where: { userId: session.id } });
    if (!client) return { where, denied: true };
    where.clientId = client.id;
    return { where, denied: false };
  }

  return { where, denied: false };
}

export async function canAccessTicket(
  ticket: { clientId?: string | null },
  session: SessionUser
): Promise<boolean> {
  if (session.role === 'admin' || session.role === 'technician') return true;
  if (session.role !== 'client') return false;
  if (isRrspDbActive()) return true;
  const client = await MspClient.findOne({ where: { userId: session.id } });
  return Boolean(client && ticket.clientId === client.id);
}

export async function getTicketById(id: string): Promise<CdTicket | null> {
  const Ticket = getTicketModel();
  const Client = getShopClientModel();
  const include: object[] = [
    { model: Client, as: 'client', attributes: ['id', 'name', 'companyName', 'email', 'phone'] },
  ];
  if (!isRrspDbActive()) {
    include.push(
      { model: User, as: 'assignee', attributes: ['id', 'username', 'firstName', 'lastName'] },
      { model: User, as: 'creator', attributes: ['id', 'username', 'firstName', 'lastName'] }
    );
  }
  const ticket = await Ticket.findByPk(id, { include });
  return (ticket as CdTicket | null) ?? null;
}

export function serializeTicket(ticket: {
  toJSON: () => Record<string, unknown>;
}) {
  const json = ticket.toJSON() as unknown as Record<string, unknown> & {
    assignedTo?: number | null;
    technician?: string;
    assignee?: { firstName?: string; lastName?: string; username?: string };
    client?: { name?: string; companyName?: string };
    clientName?: string;
  };

  if (json.assignedTo && json.assignee) {
    json.technician =
      `${json.assignee.firstName ?? ''} ${json.assignee.lastName ?? ''}`.trim() || json.assignee.username;
  }

  if (json.client) {
    const linkedName = json.client.name || json.client.companyName;
    if (linkedName) json.clientName = linkedName;
  }

  return json;
}

export function generateTicketId() {
  return `ticket_${Date.now()}`;
}

export function generateTicketNumber() {
  const year = new Date().getFullYear();
  const suffix = Date.now().toString().slice(-6);
  return `TKT-${year}-${suffix}`;
}

export function generateCommentId() {
  return `comment_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function resolveClientForTicket(body: {
  clientId?: string;
  clientName?: string;
  clientContactNumber?: string;
}): Promise<{ clientId: string | null; clientName: string; clientContactNumber: string | null }> {
  const Client = getShopClientModel();
  let clientId = body.clientId ?? null;
  let clientName = body.clientName?.trim() || 'Unknown Client';
  let clientContactNumber = normalizeStoredPhone(body.clientContactNumber?.trim() || null);

  if (clientId) {
    const client = await Client.findByPk(clientId);
    if (!client) throw new Error('Client not found');
    const row = client as unknown as { name?: string; companyName?: string; phone?: string | null };
    clientName = row.name || row.companyName || clientName;
    clientContactNumber = row.phone ?? clientContactNumber;
    return { clientId, clientName, clientContactNumber };
  }

  if (body.clientName && clientName !== 'Unknown Client') {
    const client = await Client.findOne({
      where: {
        [Op.or]: [{ name: clientName }, { companyName: clientName }],
      },
    });
    if (client) {
      const row = client as unknown as { id: string; name?: string; companyName?: string; phone?: string | null };
      clientId = row.id;
      clientName = row.name || row.companyName || clientName;
      clientContactNumber = row.phone ?? clientContactNumber;
      return { clientId, clientName, clientContactNumber };
    }
  }

  if (clientContactNumber) {
    const digits = clientContactNumber.replace(/\D/g, '');
    if (digits.length >= 7) {
      const client = await Client.findOne({
        where: {
          [Op.or]: [
            { phone: clientContactNumber },
            { phone: { [Op.like]: `%${digits.slice(-7)}` } },
          ],
        },
      });
      if (client) {
        const row = client as unknown as { id: string; name?: string; companyName?: string; phone?: string | null };
        clientId = row.id;
        clientName = row.name || row.companyName || clientName;
        clientContactNumber = row.phone ?? clientContactNumber;
      }
    }
  }

  return { clientId, clientName, clientContactNumber };
}

export async function resolveTechnicianName(assignedTo?: number | null, fallback?: string) {
  if (!assignedTo) return fallback?.trim() || 'Unassigned';
  const user = await User.findByPk(assignedTo);
  if (!user) return fallback?.trim() || `Assigned (${assignedTo})`;
  return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.username;
}

export type TicketCommentRow = {
  id: string;
  comment: string;
  commentType: string;
  authorName: string;
  timestamp: string;
  isInternal: number;
  linkedOrderId?: string | null;
};

export async function getTicketComments(
  ticketId: string,
  includeInternal: boolean
): Promise<TicketCommentRow[]> {
  await ensureCommentLinkedOrderColumn();
  const TicketComment = getTicketCommentModel();
  const comments = await TicketComment.findAll({
    where: {
      ticketId,
      isActive: 1,
      ...(includeInternal ? {} : { isInternal: 0 }),
    },
    order: [['timestamp', 'DESC']],
  });
  return comments.map((row) => {
    const c = row as unknown as TicketCommentRow;
    return {
      id: c.id,
      comment: c.comment,
      commentType: c.commentType,
      authorName: c.authorName,
      timestamp: c.timestamp,
      isInternal: Number(c.isInternal) || 0,
      linkedOrderId: c.linkedOrderId ?? null,
    };
  });
}

export function userDisplayName(user: {
  firstName?: string;
  lastName?: string;
  username?: string;
}) {
  return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.username || 'User';
}

/** Re-export for handlers that need the active Ticket model. */
export { getTicketModel, getTicketCommentModel, getShopClientModel, getRrspContext, isRrspDbActive } from '@/lib/rrsp-db';
