// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import {
  requireSession,
  requireRole,
  requireAdmin,
  authErrorResult,
  COOKIE_NAME,
  signToken,
  requireMspApiAuth,
  mspAuthErrorResult,
} from '@cd-v2/api-handlers';

import { Op } from 'sequelize';
import { Client, Ticket, User } from '@web/lib/db';
import {
  generateTicketId,
  generateTicketNumber,
  getTicketScopeWhere,
  resolveClientForTicket,
  resolveTechnicianName,
  serializeTicket,
  userDisplayName,
} from '@web/lib/tickets';
import { getTicketNotificationSettings } from '@web/lib/settings';
import { notifyTicketCreated } from '@web/lib/ticket-notifications';
import { incrementClientUsage } from '@web/lib/clients';
import { emitMiniCdEvent } from '@web/lib/mini-cd-events.server';


function searchParamsFrom(ctx: ApiContext): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(ctx.query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, value);
  }
  return params;
}


export async function GETHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician', 'client');

    const searchParams = searchParamsFrom(ctx);
    const status = searchParams.get('status');
    const search = searchParams.get('search')?.trim();
    const mine = searchParams.get('mine') === '1';

    const { where, denied } = await getTicketScopeWhere(session);
    if (denied) return { status: 200, body: { success: true, tickets: [] } };

    if (session.role === 'technician' && mine) {
      where.assignedTo = session.id;
    }

    if (status && status !== 'all') {
      where.status = status;
    }

    if (search) {
      Object.assign(where, {
        [Op.or]: [
          { ticketNumber: { [Op.like]: `%${search}%` } },
          { clientName: { [Op.like]: `%${search}%` } },
          { issue: { [Op.like]: `%${search}%` } },
          { notes: { [Op.like]: `%${search}%` } },
        ],
      });
    }

    const tickets = await Ticket.findAll({
      where,
      include: [
        { model: Client, as: 'client', attributes: ['id', 'name', 'companyName', 'email', 'phone'] },
        { model: User, as: 'assignee', attributes: ['id', 'username', 'firstName', 'lastName'] },
      ],
      order: [['lastUpdated', 'DESC']],
      limit: 300,
    });

    return { status: 200, body: {
      success: true,
      tickets: tickets.map(serializeTicket),
    } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician', 'client');

    const ticketSettings = await getTicketNotificationSettings();
    if (session.role === 'client' && !ticketSettings.clientCanCreateTickets) {
      return { status: 403, body: { success: false, message: 'Client ticket creation is disabled' } };
    }

    const body = ctx.body as Record<string, unknown>;
    const issue = (body.issue ?? body.title)?.trim();
    const notes = (body.notes ?? body.description)?.trim();

    if (!issue) {
      return { status: 400, body: { success: false, message: 'Issue title is required' } };
    }

    let clientId: string | null | undefined = body.clientId as string | undefined;
    let clientName = body.clientName?.trim();
    let clientContactNumber = body.clientContactNumber?.trim();

    if (session.role === 'client') {
      const linkedClient = await Client.findOne({ where: { userId: session.id } });
      if (!linkedClient) {
        return { status: 400, body: { success: false, message: 'No client account linked' } };
      }
      if (ticketSettings.requireServiceLevelForClientCreate && !linkedClient.serviceLevel) {
        return { status: 403, body: { success: false, message: 'Active service plan required to create tickets' } };
      }
      clientId = linkedClient.id;
      clientName = linkedClient.name;
      clientContactNumber = linkedClient.phone ?? clientContactNumber;
    }

    const resolved = await resolveClientForTicket({ clientId, clientName, clientContactNumber });
    clientId = resolved.clientId ?? clientId ?? null;
    clientName = resolved.clientName;
    clientContactNumber = clientContactNumber || resolved.clientContactNumber;

    if (session.role !== 'client' && !clientId) {
      return { status: 400, body: { success: false, message: 'Please select a client' } };
    }

    const assignedTo = session.role === 'client' ? null : body.assignedTo ? Number(body.assignedTo) : null;
    const technician = await resolveTechnicianName(assignedTo, body.technician);
    const now = new Date().toISOString();
    const creator = await User.findByPk(session.id);

    const ticket = await Ticket.create({
      id: generateTicketId(),
      ticketNumber: generateTicketNumber(),
      clientName,
      clientContactNumber,
      issue,
      title: body.title?.trim() || issue,
      location: body.location?.trim() || 'Not specified',
      deviceType: body.deviceType?.trim() || body.category?.trim() || 'Other',
      deviceModel: body.deviceModel?.trim() || null,
      serialNumber: body.serialNumber?.trim() || null,
      status: 'New',
      technician,
      notes: notes || null,
      priority: body.priority || 'medium',
      category: body.category || 'general',
      dueDate: body.dueDate || null,
      subscription: body.subscription?.trim() || null,
      dateCreated: now,
      lastUpdated: now,
      isActive: 1,
      clientId,
      createdBy: session.id,
      assignedTo,
      hasUnreadClientComments: false,
      attachments: body.attachments || [],
      tags: body.tags || [],
      resolutionNotes: null,
      estimatedHours: null,
      actualHours: null,
      estimatedCost: null,
      actualCost: null,
    });

    const full = await Ticket.findByPk(ticket.id, {
      include: [{ model: Client, as: 'client', attributes: ['id', 'name', 'companyName', 'email', 'phone'] }],
    });

    await notifyTicketCreated(full ?? ticket, userDisplayName(creator ?? { username: session.username ?? 'User' }));

    const serialized = serializeTicket(full ?? ticket);
    emitMiniCdEvent(session, {
      type: 'ticket.created',
      summary: `Created ticket #${serialized.ticketNumber} for ${serialized.clientName}: ${String(serialized.issue).slice(0, 80)}`,
      entityType: 'ticket',
      entityId: String(serialized.id),
      href: `/tickets/${serialized.id}`,
      clientId: serialized.clientId ? String(serialized.clientId) : undefined,
      clientName: serialized.clientName ? String(serialized.clientName) : undefined,
      actorName: userDisplayName(creator ?? { username: session.username ?? 'User' }),
    });

    if (clientId) {
      try {
        await incrementClientUsage(clientId, 'supportTickets', 1);
      } catch {
        // Non-blocking — ticket creation succeeds even if usage update fails
      }
    }

    return { status: 201, body: {
        success: true,
        ticket: serializeTicket(full ?? ticket),
        message: `Ticket created by ${userDisplayName(creator ?? { username: session.username ?? 'User' })}`,
      } };
  } catch (error) {
    if (error instanceof Error && error.message === 'Client not found') {
      return { status: 400, body: { success: false, message: error.message } };
    }
    return authErrorResult(error);
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'GET') return GETHandler(ctx);
    if (method === 'POST') return POSTHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

