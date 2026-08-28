export type TicketAccountingLineItem = {
  name: string;
  description?: string;
  quantity: number;
  price: number;
  total: number;
};

export type TicketAccountingPrefill = {
  clientId?: string;
  ticketNumber?: string;
  title?: string;
  description?: string;
  notes?: string;
  amount?: number;
  lineItems?: TicketAccountingLineItem[];
  hasCostData: boolean;
};

export type TicketForAccountingPrefill = {
  id: string;
  ticketNumber: string;
  clientId?: string | null;
  issue: string;
  title?: string | null;
  notes?: string | null;
  resolutionNotes?: string | null;
  deviceType?: string;
  deviceModel?: string | null;
  serialNumber?: string | null;
  location?: string;
  estimatedCost?: number | null;
  actualCost?: number | null;
};

function parseCost(value: unknown): number | null {
  if (value == null || value === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function ticketHasCostData(ticket: Pick<TicketForAccountingPrefill, 'estimatedCost' | 'actualCost'>) {
  return parseCost(ticket.actualCost) != null || parseCost(ticket.estimatedCost) != null;
}

export function buildTicketAccountingPrefill(ticket: TicketForAccountingPrefill): TicketAccountingPrefill {
  const prefill: TicketAccountingPrefill = {
    hasCostData: ticketHasCostData(ticket),
    ticketNumber: ticket.ticketNumber,
  };

  if (ticket.clientId) prefill.clientId = ticket.clientId;

  if (!prefill.hasCostData) return prefill;

  const cost = parseCost(ticket.actualCost) ?? parseCost(ticket.estimatedCost)!;
  prefill.amount = cost;
  prefill.title = ticket.title?.trim() || ticket.issue;

  const descriptionParts = [
    `Ticket ${ticket.ticketNumber}`,
    ticket.deviceType ? `Device: ${ticket.deviceType}` : null,
    ticket.deviceModel ? `Model: ${ticket.deviceModel}` : null,
    ticket.serialNumber ? `Serial: ${ticket.serialNumber}` : null,
    ticket.location ? `Location: ${ticket.location}` : null,
    ticket.notes?.trim() || null,
  ].filter(Boolean);
  prefill.description = descriptionParts.join('\n');

  if (ticket.resolutionNotes?.trim()) {
    prefill.notes = ticket.resolutionNotes.trim();
  }

  const itemName = ticket.issue.trim() || 'Service';
  const itemDescription = [ticket.deviceType, ticket.deviceModel].filter(Boolean).join(' — ') || undefined;
  prefill.lineItems = [
    {
      name: itemName,
      description: itemDescription,
      quantity: 1,
      price: cost,
      total: cost,
    },
  ];

  return prefill;
}
