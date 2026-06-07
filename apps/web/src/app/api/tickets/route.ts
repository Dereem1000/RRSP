import { NextRequest, NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { Client, Ticket, User } from '@/lib/db';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import {
  generateTicketId,
  generateTicketNumber,
  getTicketScopeWhere,
  resolveClientForTicket,
  resolveTechnicianName,
  serializeTicket,
  userDisplayName,
} from '@/lib/tickets';
import { getTicketNotificationSettings } from '@/lib/settings';
import { notifyTicketCreated } from '@/lib/ticket-notifications';
import { incrementClientUsage } from '@/lib/clients';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician', 'client');

    const { searchParams } = req.nextUrl;
    const status = searchParams.get('status');
    const search = searchParams.get('search')?.trim();
    const mine = searchParams.get('mine') === '1';

    const { where, denied } = await getTicketScopeWhere(session);
    if (denied) return NextResponse.json({ success: true, tickets: [] });

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
        { model: Client, attributes: ['id', 'name', 'companyName', 'email', 'phone'] },
        { model: User, as: 'assignee', attributes: ['id', 'username', 'firstName', 'lastName'] },
      ],
      order: [['lastUpdated', 'DESC']],
      limit: 300,
    });

    return NextResponse.json({
      success: true,
      tickets: tickets.map(serializeTicket),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician', 'client');

    const ticketSettings = await getTicketNotificationSettings();
    if (session.role === 'client' && !ticketSettings.clientCanCreateTickets) {
      return NextResponse.json({ success: false, message: 'Client ticket creation is disabled' }, { status: 403 });
    }

    const body = await req.json();
    const issue = (body.issue ?? body.title)?.trim();
    const notes = (body.notes ?? body.description)?.trim();

    if (!issue) {
      return NextResponse.json({ success: false, message: 'Issue title is required' }, { status: 400 });
    }

    let clientId: string | null | undefined = body.clientId as string | undefined;
    let clientName = body.clientName?.trim();
    let clientContactNumber = body.clientContactNumber?.trim();

    if (session.role === 'client') {
      const linkedClient = await Client.findOne({ where: { userId: session.id } });
      if (!linkedClient) {
        return NextResponse.json({ success: false, message: 'No client account linked' }, { status: 400 });
      }
      if (ticketSettings.requireServiceLevelForClientCreate && !linkedClient.serviceLevel) {
        return NextResponse.json({ success: false, message: 'Active service plan required to create tickets' }, { status: 403 });
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
      return NextResponse.json({ success: false, message: 'Please select a client' }, { status: 400 });
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
      include: [{ model: Client, attributes: ['id', 'name', 'companyName', 'email', 'phone'] }],
    });

    await notifyTicketCreated(full ?? ticket, userDisplayName(creator ?? { username: session.username ?? 'User' }));

    if (clientId) {
      try {
        await incrementClientUsage(clientId, 'supportTickets', 1);
      } catch {
        // Non-blocking — ticket creation succeeds even if usage update fails
      }
    }

    return NextResponse.json(
      {
        success: true,
        ticket: serializeTicket(full ?? ticket),
        message: `Ticket created by ${userDisplayName(creator ?? { username: session.username ?? 'User' })}`,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'Client not found') {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }
    return authErrorResponse(error);
  }
}
