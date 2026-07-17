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
import { listInvoicesForTicket } from '@/lib/accounting';
import { listOrdersForTicket } from '@/lib/orders';
import { flattenInvoiceLineItems } from '@/lib/ticket-invoice-order';

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
  const linkedOrders = await listOrdersForTicket(id, { includeCost: user.role === 'admin' });
  const ticketInvoices =
    user.role === 'admin' && ticket.clientId
      ? await listInvoicesForTicket({
          ticketId: id,
          ticketNumber: ticket.ticketNumber,
          clientId: ticket.clientId,
        })
      : [];
  const invoiceOrderItems = flattenInvoiceLineItems(ticketInvoices);

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
      comments={comments.map((c: { id: string; comment: string; commentType: string; authorName: string; timestamp: string; isInternal: number; linkedOrderId?: string | null }) => ({
        id: c.id,
        comment: c.comment,
        commentType: c.commentType,
        authorName: c.authorName,
        timestamp: c.timestamp,
        isInternal: c.isInternal,
        linkedOrderId: c.linkedOrderId ?? null,
      }))}
      technicians={technicians.map((t) => ({
        id: t.id,
        firstName: t.firstName,
        lastName: t.lastName,
        username: t.username,
      }))}
      clients={clients.map((c) => mapClientToPickerOption(c))}
      userRole={user.role}
      linkedOrders={linkedOrders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        title: order.title,
        itemName: order.itemName,
        status: order.status,
        shippingStage: order.shippingStage,
        clientPrice: order.clientPrice,
        trackingNumber: order.trackingNumber ?? null,
        vendor: order.vendor ?? null,
      }))}
      invoiceOrderItems={invoiceOrderItems}
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
