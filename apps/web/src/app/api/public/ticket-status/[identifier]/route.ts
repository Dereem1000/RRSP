import { NextRequest, NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { Client, Ticket, User } from '@/lib/db';

type RouteParams = { params: Promise<{ identifier: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { identifier: raw } = await params;
    const identifier = decodeURIComponent(raw).trim();

    if (!identifier) {
      return NextResponse.json({ success: false, message: 'Ticket number or email is required' }, { status: 400 });
    }

    const isEmail = identifier.includes('@') && identifier.includes('.');
    let ticket;

    if (isEmail) {
      const client = await Client.findOne({
        where: {
          email: identifier,
          status: { [Op.ne]: 'inactive' },
        },
      });

      if (!client) {
        return NextResponse.json(
          {
            success: false,
            message: 'No tickets found for this email address. Please check your email or contact support.',
          },
          { status: 404 }
        );
      }

      ticket = await Ticket.findOne({
        where: { clientId: client.id, isActive: 1 },
        include: [
          { model: Client, attributes: ['id', 'name', 'companyName', 'phone', 'email'] },
          { model: User, as: 'assignee', attributes: ['id', 'firstName', 'lastName', 'username'] },
          { model: User, as: 'creator', attributes: ['id', 'firstName', 'lastName', 'username'] },
        ],
        order: [['dateCreated', 'DESC']],
      });
    } else {
      ticket = await Ticket.findOne({
        where: { ticketNumber: identifier, isActive: 1 },
        include: [
          { model: Client, attributes: ['id', 'name', 'companyName', 'phone', 'email'] },
          { model: User, as: 'assignee', attributes: ['id', 'firstName', 'lastName', 'username'] },
          { model: User, as: 'creator', attributes: ['id', 'firstName', 'lastName', 'username'] },
        ],
      });
    }

    if (!ticket) {
      return NextResponse.json(
        {
          success: false,
          message: isEmail
            ? 'No active tickets found for this email address. Please check your email or contact support.'
            : 'Ticket not found. Please check your ticket number.',
        },
        { status: 404 }
      );
    }

    const issue = ticket.issue ?? '';
    const description = issue.length > 200 ? `${issue.substring(0, 200)}...` : issue;
    const client = ticket.get('Client') as Client | undefined;

    return NextResponse.json({
      success: true,
      ticket: {
        ticketNumber: ticket.ticketNumber,
        title: issue,
        description,
        status: ticket.status,
        priority: ticket.priority ?? 'medium',
        dateCreated: ticket.dateCreated,
        lastUpdated: ticket.lastUpdated,
        client: client
          ? {
              name: client.name || client.companyName,
              phone: client.phone,
              email: client.email,
            }
          : undefined,
      },
    });
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to fetch ticket status' }, { status: 500 });
  }
}
