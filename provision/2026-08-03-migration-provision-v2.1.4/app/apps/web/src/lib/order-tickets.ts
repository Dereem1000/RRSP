import { Client, Ticket, TicketComment } from '@cd-v2/database';
import { addOrderLink } from '@/lib/orders';
import {
  generateCommentId,
  generateTicketId,
  generateTicketNumber,
  resolveTechnicianName,
} from '@/lib/tickets';

export async function createTicketForOrder(input: {
  orderId: string;
  orderNumber: string;
  clientId: string;
  title: string;
  itemName: string;
  description?: string | null;
  vendor?: string | null;
  vendorOrderNumber?: string | null;
  trackingNumber?: string | null;
  clientPrice?: number;
  quantity?: number;
  notes?: string | null;
  createdBy: number;
  assignedTechnicianId?: number | null;
  creatorName: string;
}) {
  const client = await Client.findByPk(input.clientId, {
    attributes: ['id', 'name', 'companyName', 'phone', 'email'],
  });
  if (!client) throw new Error('Client not found');

  const clientName = client.name || client.companyName || 'Unknown Client';
  const issue = `Part order: ${input.title} — ${input.itemName}`;
  const ticketNotes = [
    `Linked to order ${input.orderNumber}.`,
    input.vendor ? `Vendor: ${input.vendor}` : null,
    input.vendorOrderNumber ? `Vendor order #: ${input.vendorOrderNumber}` : null,
    input.trackingNumber ? `Tracking: ${input.trackingNumber}` : null,
    input.quantity && input.quantity > 1 ? `Quantity: ${input.quantity}` : null,
    input.clientPrice != null ? `Client price: ${input.clientPrice}` : null,
    input.description?.trim() || null,
    input.notes?.trim() || null,
  ]
    .filter(Boolean)
    .join('\n');

  const now = new Date().toISOString();
  const assignedTo = input.assignedTechnicianId ?? input.createdBy;
  const technician = await resolveTechnicianName(assignedTo);

  const ticket = await Ticket.create({
    id: generateTicketId(),
    ticketNumber: generateTicketNumber(),
    clientId: input.clientId,
    clientName,
    clientContactNumber: client.phone ?? null,
    issue,
    title: input.title,
    location: 'Not specified',
    deviceType: 'Parts / Order',
    deviceModel: null,
    serialNumber: null,
    status: 'Awaiting-Part',
    technician,
    notes: ticketNotes || null,
    priority: 'medium',
    category: 'parts',
    dueDate: null,
    subscription: null,
    dateCreated: now,
    lastUpdated: now,
    isActive: 1,
    createdBy: input.createdBy,
    assignedTo,
    hasUnreadClientComments: false,
    attachments: [],
    tags: ['order', 'parts'],
    resolutionNotes: null,
    estimatedHours: null,
    actualHours: null,
    estimatedCost: input.clientPrice ?? null,
    actualCost: null,
  });

  await TicketComment.create({
    id: generateCommentId(),
    ticketId: ticket.id,
    comment: `Order ${input.orderNumber} created for "${input.itemName}". Status: awaiting part delivery.`,
    commentType: 'order_part',
    authorId: String(input.createdBy),
    authorName: input.creatorName,
    timestamp: now,
    isInternal: 0,
    isActive: 1,
  });

  await addOrderLink(
    input.orderId,
    {
      linkedType: 'ticket',
      linkedId: ticket.id,
      linkedNumber: ticket.ticketNumber,
      notes: 'Auto-linked when order was created',
    },
    input.createdBy
  );

  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    status: ticket.status,
    clientName,
  };
}
