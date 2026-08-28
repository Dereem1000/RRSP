import { notFound, redirect } from 'next/navigation';
import { requirePortalUser } from '@/lib/session';
import { requireRrspModule } from '@/lib/rrsp-access';
import { withOptionalRrspDb } from '@/lib/rrsp-page';
import { getShopClientModel } from '@/lib/rrsp-db';
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

export default async function RrspTicketDetailPage({ params }: PageProps) {
  const { user } = await requirePortalUser();
  const gate = await requireRrspModule(user, 'tickets');
  const { id } = await params;

  return withOptionalRrspDb(gate, async () => {
    let ticket = await getTicketById(id);
    if (!ticket) notFound();

    if (!ticket.clientId && ticket.clientContactNumber) {
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
      redirect('/rrsp/tickets');
    }

    const comments = await getTicketComments(id, true);
    const linkedOrders = await listOrdersForTicket(id, { includeCost: false });
    const ticketInvoices =
      ticket.clientId
        ? await listInvoicesForTicket({
            ticketId: id,
            ticketNumber: ticket.ticketNumber,
            clientId: ticket.clientId,
          })
        : [];
    const invoiceOrderItems = flattenInvoiceLineItems(ticketInvoices);

    const ShopClient = getShopClientModel();
    const clients = await ShopClient.findAll({
      where: { isActive: true },
      attributes: [...CLIENT_PICKER_ATTRIBUTES],
      order: [['name', 'ASC']],
    });

    if (ticket.hasUnreadClientComments) {
      await ticket.update({ hasUnreadClientComments: false });
    }

    return (
      <TicketDetailClient
        ticket={serializeTicket(ticket) as Parameters<typeof TicketDetailClient>[0]['ticket']}
        comments={comments.map((c) => ({
          id: c.id,
          comment: c.comment,
          commentType: c.commentType,
          authorName: c.authorName,
          timestamp: c.timestamp,
          isInternal: c.isInternal,
          linkedOrderId: c.linkedOrderId ?? null,
        }))}
        technicians={[]}
        clients={clients.map((c) => mapClientToPickerOption(c as never))}
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
        pathPrefix="/rrsp"
        shopOperator
      />
    );
  });
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
