import { notFound, redirect } from 'next/navigation';
import { Op } from 'sequelize';
import { Client, User } from '@/lib/db';
import { requirePortalUser } from '@/lib/session';
import { CLIENT_PICKER_ATTRIBUTES, mapClientToPickerOption } from '@/lib/client-picker';
import {
  canAccessTicket,
  getTicketById,
  getTicketComments,
  resolveClientForTicket,
  serializeTicket,
} from '@/lib/tickets';
import { TicketDetailClient } from '@/components/tickets/TicketDetailClient';

type PageProps = { params: Promise<{ id: string }> };

export default async function TicketDetailPage({ params }: PageProps) {
  const { user } = await requirePortalUser();
  const { id } = await params;

  let ticket = await getTicketById(id);
  if (!ticket) notFound();

  if (!ticket.clientId && ticket.clientContactNumber && user.role !== 'client') {
    const resolved = await resolveClientForTicket({
      clientContactNumber: ticket.clientContactNumber,
    });
    if (resolved.clientId) {
      await ticket.update({
        clientId: resolved.clientId,
        clientName: resolved.clientName,
        lastUpdated: new Date().toISOString(),
      });
      ticket = (await getTicketById(id)) ?? ticket;
    }
  }

  if (!(await canAccessTicket(ticket, sessionUser(user)))) {
    redirect('/tickets');
  }

  const includeInternal = user.role !== 'client';
  const comments = await getTicketComments(id, includeInternal);

  const technicians =
    user.role === 'client'
      ? []
      : await User.findAll({
          where: { isActive: true, role: { [Op.in]: ['admin', 'technician'] } },
          attributes: ['id', 'username', 'firstName', 'lastName'],
          order: [['firstName', 'ASC']],
        });

  const clients =
    user.role === 'client'
      ? []
      : await Client.findAll({
          where: { isActive: true },
          attributes: [...CLIENT_PICKER_ATTRIBUTES],
          order: [['name', 'ASC']],
        });

  if (ticket.hasUnreadClientComments && user.role !== 'client') {
    await ticket.update({ hasUnreadClientComments: false });
  }

  return (
    <TicketDetailClient
      ticket={serializeTicket(ticket) as Parameters<typeof TicketDetailClient>[0]['ticket']}
      comments={comments.map((c: { id: string; comment: string; commentType: string; authorName: string; timestamp: string; isInternal: number }) => ({
        id: c.id,
        comment: c.comment,
        commentType: c.commentType,
        authorName: c.authorName,
        timestamp: c.timestamp,
        isInternal: c.isInternal,
      }))}
      technicians={technicians.map((t) => ({
        id: t.id,
        firstName: t.firstName,
        lastName: t.lastName,
        username: t.username,
      }))}
      clients={clients.map((c) => mapClientToPickerOption(c))}
      userRole={user.role}
    />
  );
}

function sessionUser(user: {
  id: number;
  role: string;
  username: string;
  firstName: string;
  lastName: string;
}) {
  return {
    id: user.id,
    role: user.role,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
  };
}
