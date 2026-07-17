import { emptyOrderForm, type OrderFormValues } from '@/components/orders/order-ui';

export type TicketForOrderPrefill = {
  id: string;
  ticketNumber: string;
  clientId?: string | null;
  issue: string;
  title?: string | null;
  notes?: string | null;
  deviceType?: string;
  deviceModel?: string | null;
};

export type CommentForOrderPrefill = {
  comment: string;
};

export function buildTicketOrderPrefill(
  ticket: TicketForOrderPrefill,
  comment?: CommentForOrderPrefill
): OrderFormValues {
  const form = emptyOrderForm(ticket.clientId ?? '');
  const issue = ticket.issue.trim();
  const commentText = comment?.comment.trim() ?? '';

  form.title = ticket.title?.trim() || issue || '';
  form.itemName = commentText || issue || '';
  form.description = [
    `Ticket ${ticket.ticketNumber}`,
    ticket.deviceType ? `Device: ${ticket.deviceType}` : null,
    ticket.deviceModel ? `Model: ${ticket.deviceModel}` : null,
    commentText ? `Comment: ${commentText}` : null,
    ticket.notes?.trim() || null,
  ]
    .filter(Boolean)
    .join('\n');

  return form;
}
