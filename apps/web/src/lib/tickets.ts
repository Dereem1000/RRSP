import { Op } from 'sequelize';
import {
  Client,
  Ticket,
  TicketComment,
  User,
} from '@cd-v2/database';
import type { TokenPayload } from '@/lib/jwt';
import { normalizeStoredPhone } from '@/lib/phone-utils';
import { ensureCommentLinkedOrderColumn } from '@/lib/ticket-schema';

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
    const client = await Client.findOne({ where: { userId: session.id } });
    if (!client) return { where, denied: true };
    where.clientId = client.id;
    return { where, denied: false };
  }

  return { where, denied: false };
}

export async function canAccessTicket(ticket: Ticket, session: SessionUser): Promise<boolean> {
  if (session.role === 'admin' || session.role === 'technician') return true;
  if (session.role !== 'client') return false;
  const client = await Client.findOne({ where: { userId: session.id } });
  return Boolean(client && ticket.clientId === client.id);
}

export async function getTicketById(id: string) {
  return Ticket.findByPk(id, {
    include: [
      { model: Client, as: 'client', attributes: ['id', 'name', 'companyName', 'email', 'phone'] },
      { model: User, as: 'assignee', attributes: ['id', 'username', 'firstName', 'lastName'] },
      { model: User, as: 'creator', attributes: ['id', 'username', 'firstName', 'lastName'] },
    ],
  });
}

export function serializeTicket(ticket: Ticket) {
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
  let clientId = body.clientId ?? null;
  let clientName = body.clientName?.trim() || 'Unknown Client';
  let clientContactNumber = normalizeStoredPhone(body.clientContactNumber?.trim() || null);

  if (clientId) {
    const client = await Client.findByPk(clientId);
    if (!client) throw new Error('Client not found');
    clientName = client.name || client.companyName || clientName;
    clientContactNumber = client.phone ?? clientContactNumber;
    return { clientId, clientName, clientContactNumber };
  }

  if (body.clientName && clientName !== 'Unknown Client') {
    const client = await Client.findOne({
      where: {
        [Op.or]: [{ name: clientName }, { companyName: clientName }],
      },
    });
    if (client) {
      clientId = client.id;
      clientName = client.name || client.companyName || clientName;
      clientContactNumber = client.phone ?? clientContactNumber;
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
        clientId = client.id;
        clientName = client.name || client.companyName || clientName;
        clientContactNumber = client.phone ?? clientContactNumber;
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

export async function getTicketComments(ticketId: string, includeInternal: boolean) {
  await ensureCommentLinkedOrderColumn();
  const comments = await TicketComment.findAll({
    where: {
      ticketId,
      isActive: 1,
      ...(includeInternal ? {} : { isInternal: 0 }),
    },
    order: [['timestamp', 'DESC']],
  });
  return comments;
}

export function userDisplayName(user: {
  firstName?: string;
  lastName?: string;
  username?: string;
}) {
  return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.username || 'User';
}
