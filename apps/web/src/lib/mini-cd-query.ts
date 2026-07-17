import type { MiniPortalAction } from '@/lib/mini-portal-actions';
import {
  findClientInIndex,
  findEntityByNumber,
  findLatestForClient,
  findIndexEntryByHref,
  searchIndexEntries,
  type CdIndexEntry,
  type MiniCdIndex,
} from '@/lib/mini-cd-index';
import type { MiniCdContext } from '@/lib/mini-cd-context';

export type MiniCdExecuteAction = {
  type: 'resend_ticket_update';
  ticketId: string;
};

export type MiniCdChatResolution = {
  confidence: 'none' | 'high';
  portalAction?: MiniPortalAction;
  directAnswer?: string;
  matchedEntry?: CdIndexEntry;
  executeAction?: MiniCdExecuteAction;
};

const NAV_PHRASES = [
  'go to',
  'navigate to',
  'take me to',
  'bring me to',
  'open the',
  'open ',
  'show me the',
  'show me ',
  'switch to',
  'head to',
  'jump to',
  'visit ',
];

const QUESTION_PREFIXES = [
  'how do i',
  'how to',
  'where is',
  'where are',
  'where can i',
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9#]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function stripNavPrefix(message: string): string {
  const normalized = normalize(message);
  for (const phrase of NAV_PHRASES) {
    const idx = normalized.indexOf(phrase);
    if (idx >= 0) return normalized.slice(idx + phrase.length).trim();
  }
  return normalized;
}

function looksLikeNavigation(message: string): boolean {
  const normalized = normalize(message);
  if (!normalized) return false;
  if (QUESTION_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return false;
  return NAV_PHRASES.some((phrase) => normalized.includes(phrase));
}

function looksLikeDataQuestion(message: string): boolean {
  const normalized = normalize(message);
  return (
    normalized.includes('tracking number') ||
    normalized.includes('tracking on') ||
    normalized.includes('tracking for') ||
    normalized.includes('what is the status') ||
    normalized.includes('what s the status') ||
    normalized.includes('status of') ||
    normalized.includes('what status') ||
    normalized.includes('how much') ||
    normalized.includes('amount due') ||
    normalized.includes('outstanding') ||
    normalized.includes('when is') ||
    normalized.includes('scheduled for')
  );
}

function extractTicketNumber(text: string): string | null {
  const match =
    text.match(/tkt[-\s]?\d{4}[-\s]?\d+/i) ||
    text.match(/ticket\s*#?\s*(\d+)/i) ||
    text.match(/#\s*(\d{3,})/);
  return match ? match[0].replace(/^ticket\s*#?\s*/i, '').trim() : null;
}

function extractOrderNumber(text: string): string | null {
  const match =
    text.match(/ord[-\s]?\d+/i) ||
    text.match(/order\s*#?\s*([a-z0-9-]+)/i);
  return match ? match[0].replace(/^order\s*#?\s*/i, '').trim() : null;
}

function extractInvoiceNumber(text: string): string | null {
  const match =
    text.match(/inv[-\s]?\d+/i) ||
    text.match(/invoice\s*#?\s*([a-z0-9-]+)/i);
  return match ? match[0].replace(/^invoice\s*#?\s*/i, '').trim() : null;
}

function extractQuoteNumber(text: string): string | null {
  const match =
    text.match(/cdq[-\s]?\d+/i) ||
    text.match(/quo[-\s]?\d+/i) ||
    text.match(/quote\s*#?\s*([a-z0-9-]+)/i);
  return match ? match[0].replace(/^quote\s*#?\s*/i, '').trim() : null;
}

function extractClientPhrase(text: string): string | null {
  const patterns = [
    /(?:latest|recent|newest)\s+(?:ticket|order|invoice|quote)\s+for\s+(.+)$/i,
    /(?:ticket|order|invoice|quote)\s+for\s+(.+)$/i,
    /(?:licenses?|license page)\s+for\s+(.+)$/i,
    /for\s+client\s+(.+)$/i,
    /for\s+(.+?)(?:\s+client)?$/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function navAction(entry: CdIndexEntry): MiniPortalAction {
  return {
    type: 'navigate',
    href: entry.href,
    label: entry.label,
  };
}

export function looksLikeTicketSendConfirmation(message: string): boolean {
  const normalized = normalize(message);
  if (!normalized.includes('ticket')) return false;
  return (
    normalized.startsWith('did you send') ||
    normalized.startsWith('did u send') ||
    normalized.includes('was it sent') ||
    normalized.includes('have you sent') ||
    normalized.includes('did she get') ||
    normalized.includes('did he get') ||
    normalized.includes('did they get') ||
    normalized.includes('was the email sent') ||
    normalized.includes('was the update sent') ||
    normalized.includes('did the email go out')
  );
}

export function looksLikeResendTicketUpdate(message: string): boolean {
  const normalized = normalize(message);
  if (!normalized.includes('ticket')) return false;
  if (looksLikeTicketSendConfirmation(message)) return false;
  return (
    normalized.includes('resend') ||
    normalized.includes('resent') ||
    normalized.includes('send again') ||
    normalized.includes('send the latest') ||
    normalized.includes('email again') ||
    normalized.includes('notify again') ||
    (normalized.includes('send') && normalized.includes('update'))
  );
}

function extractClientForResend(message: string): string | null {
  const patterns = [
    /(?:can you )?(?:please )?(?:resend|resent|send again|send the latest|email again|notify again)\s+(?:the\s+)?(.+?)\s+ticket(?:\s+updates?)?(?:\s+to\s+(?:her|him|them|the client))?$/i,
    /(?:please )?send\s+(?:the\s+)?([a-z][\w\s.'-]+?)\s+(?:the\s+)?ticket(?:\s+updates?)?(?:\s|$)/i,
    /(?:resend|resent)\s+ticket\s+updates?\s+(?:for|to)\s+(.+)$/i,
    /ticket\s+updates?\s+(?:for|to)\s+(.+)$/i,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return extractClientPhrase(message);
}

function resolveCurrentPageTicket(
  context: MiniCdContext,
  index: MiniCdIndex | undefined
): MiniCdExecuteAction | null {
  if (context.currentPage.entityType !== 'ticket' || !context.currentPage.entityId) return null;
  const ticketId = context.currentPage.entityId;
  if (index?.entries?.length) {
    const fromIndex =
      index.entries.find((entry) => entry.entityType === 'ticket' && entry.id === ticketId) ||
      findIndexEntryByHref(index, context.currentPage.href);
    if (fromIndex) {
      return { type: 'resend_ticket_update', ticketId: fromIndex.id };
    }
  }
  return { type: 'resend_ticket_update', ticketId };
}

function resolveResendTicketUpdate(
  message: string,
  index: MiniCdIndex | undefined,
  context: MiniCdContext
): MiniCdChatResolution | null {
  if (!looksLikeResendTicketUpdate(message)) return null;

  const ticketNumber = extractTicketNumber(normalize(message));
  if (ticketNumber && index?.entries?.length) {
    const ticket = findEntityByNumber(index, 'ticket', ticketNumber);
    if (ticket) {
      return {
        confidence: 'high',
        matchedEntry: ticket,
        executeAction: { type: 'resend_ticket_update', ticketId: ticket.id },
        directAnswer: `Resending the latest update for ticket ${ticket.ticketNumber}.`,
      };
    }
  }

  const clientPhrase = extractClientForResend(message);
  if (clientPhrase && index?.entries?.length) {
    let client = findClientInIndex(index, clientPhrase);
    if (!client) {
      const hits = searchIndexEntries(index, clientPhrase, { entityType: 'client', limit: 1 });
      client = hits[0];
    }
    if (client) {
      const ticket = findLatestForClient(index, client.id, 'ticket');
      if (!ticket) {
        return {
          confidence: 'high',
          directAnswer: `I found ${client.label} but don't see an indexed ticket to resend updates for.`,
        };
      }
      return {
        confidence: 'high',
        matchedEntry: ticket,
        executeAction: { type: 'resend_ticket_update', ticketId: ticket.id },
        directAnswer: `Resending the latest update for ${client.label}'s ticket ${ticket.ticketNumber}.`,
      };
    }
  }

  const pageTicketAction = resolveCurrentPageTicket(context, index);
  if (pageTicketAction) {
    const label =
      context.pageDetail && typeof context.pageDetail === 'object'
        ? `#${(context.pageDetail as { ticketNumber?: string }).ticketNumber ?? context.currentPage.entityId}`
        : 'this ticket';
    return {
      confidence: 'high',
      executeAction: pageTicketAction,
      directAnswer: `Resending the latest update for ${label}.`,
    };
  }

  return {
    confidence: 'high',
    directAnswer:
      'I could not match that ticket resend request. Open the ticket or include #TKT-… and say "resend ticket update".',
  };
}

function resolveLatestEntityNav(message: string, index: MiniCdIndex): MiniCdChatResolution | null {
  const normalized = normalize(message);
  const wantsTicket = normalized.includes('ticket');
  const wantsOrder = normalized.includes('order');
  const wantsInvoice = normalized.includes('invoice');
  const wantsQuote = normalized.includes('quote');
  if (!wantsTicket && !wantsOrder && !wantsInvoice && !wantsQuote) return null;
  if (!normalized.includes('latest') && !normalized.includes('recent') && !normalized.includes('newest')) {
    return null;
  }

  const clientPhrase = extractClientPhrase(message);
  if (!clientPhrase) return null;

  const client = findClientInIndex(index, clientPhrase);
  if (!client) return null;

  let entityType: 'ticket' | 'order' | 'invoice' | 'quote' = 'ticket';
  if (wantsOrder && !wantsTicket && !wantsInvoice && !wantsQuote) entityType = 'order';
  else if (wantsInvoice && !wantsTicket && !wantsOrder && !wantsQuote) entityType = 'invoice';
  else if (wantsQuote && !wantsTicket && !wantsOrder && !wantsInvoice) entityType = 'quote';

  const latest = findLatestForClient(index, client.id, entityType);
  if (!latest) {
    return {
      confidence: 'high',
      directAnswer: `I indexed ${index.counts[entityType] ?? 0} ${entityType}(s) but didn't find one for ${client.label}.`,
    };
  }

  return {
    confidence: 'high',
    portalAction: navAction(latest),
    matchedEntry: latest,
    directAnswer: `Opening the latest ${entityType} for ${client.label}: ${latest.label}.`,
  };
}

function resolveExplicitEntityNav(message: string, index: MiniCdIndex): MiniCdChatResolution | null {
  const normalized = normalize(message);
  const ticketNumber = extractTicketNumber(normalized);
  if (ticketNumber) {
    const ticket = findEntityByNumber(index, 'ticket', ticketNumber);
    if (ticket) {
      return {
        confidence: 'high',
        portalAction: navAction(ticket),
        matchedEntry: ticket,
        directAnswer: `Opening ticket ${ticket.ticketNumber} for ${ticket.clientName ?? 'client'}.`,
      };
    }
  }

  const orderNumber = extractOrderNumber(normalized);
  if (orderNumber) {
    const order = findEntityByNumber(index, 'order', orderNumber);
    if (order) {
      return {
        confidence: 'high',
        portalAction: navAction(order),
        matchedEntry: order,
        directAnswer: `Opening order ${order.orderNumber}.`,
      };
    }
  }

  const invoiceNumber = extractInvoiceNumber(normalized);
  if (invoiceNumber) {
    const invoice = findEntityByNumber(index, 'invoice', invoiceNumber);
    if (invoice) {
      return {
        confidence: 'high',
        portalAction: navAction(invoice),
        matchedEntry: invoice,
        directAnswer: `Opening invoice ${invoice.invoiceNumber} for ${invoice.clientName ?? 'client'}.`,
      };
    }
  }

  const quoteNumber = extractQuoteNumber(normalized);
  if (quoteNumber) {
    const quote = findEntityByNumber(index, 'quote', quoteNumber);
    if (quote) {
      return {
        confidence: 'high',
        portalAction: navAction(quote),
        matchedEntry: quote,
        directAnswer: `Opening quote ${quote.quoteNumber} for ${quote.clientName ?? 'client'}.`,
      };
    }
  }

  if (normalized.includes('license')) {
    const phrase = stripNavPrefix(message).replace(/licenses?/, '').trim() || extractClientPhrase(message) || '';
    const client = findClientInIndex(index, phrase);
    if (client) {
      const licensePage = index.entries.find(
        (entry) => entry.entityType === 'page' && entry.href === `/clients/${client.id}/licenses`
      );
      if (licensePage) {
        return {
          confidence: 'high',
          portalAction: navAction(licensePage),
          matchedEntry: licensePage,
          directAnswer: `Opening licenses for ${client.label}.`,
        };
      }
    }
  }

  if (normalized.includes('client')) {
    const phrase = stripNavPrefix(message).replace(/^client\s+/, '').trim();
    const client = findClientInIndex(index, phrase);
    if (client) {
      return {
        confidence: 'high',
        portalAction: navAction(client),
        matchedEntry: client,
        directAnswer: `Opening client ${client.label}.`,
      };
    }
  }

  return null;
}

function resolveDataQuestion(message: string, index: MiniCdIndex): MiniCdChatResolution | null {
  const normalized = normalize(message);
  if (!looksLikeDataQuestion(message)) return null;

  const orderNumber = extractOrderNumber(normalized);
  if (orderNumber && normalized.includes('tracking')) {
    const order = findEntityByNumber(index, 'order', orderNumber);
    if (!order) {
      return {
        confidence: 'high',
        directAnswer: `I couldn't find order ${orderNumber} in the indexed orders.`,
      };
    }
    const tracking = order.trackingNumber?.trim();
    return {
      confidence: 'high',
      matchedEntry: order,
      directAnswer: tracking
        ? `Order ${order.orderNumber} tracking number is ${tracking}.`
        : `Order ${order.orderNumber} does not have a tracking number on file yet.`,
    };
  }

  const ticketNumber = extractTicketNumber(normalized);
  if (ticketNumber && normalized.includes('status')) {
    const ticket = findEntityByNumber(index, 'ticket', ticketNumber);
    if (!ticket) {
      return {
        confidence: 'high',
        directAnswer: `I couldn't find ticket ${ticketNumber} in the indexed tickets.`,
      };
    }
    return {
      confidence: 'high',
      matchedEntry: ticket,
      directAnswer: `Ticket ${ticket.ticketNumber} is ${ticket.status ?? 'unknown status'}.`,
    };
  }

  const invoiceNumber = extractInvoiceNumber(normalized);
  if (invoiceNumber && (normalized.includes('amount') || normalized.includes('due') || normalized.includes('outstanding'))) {
    const invoice = findEntityByNumber(index, 'invoice', invoiceNumber);
    if (!invoice) {
      return {
        confidence: 'high',
        directAnswer: `I couldn't find invoice ${invoiceNumber} in the indexed invoices.`,
      };
    }
    return {
      confidence: 'high',
      matchedEntry: invoice,
      directAnswer: `Invoice ${invoice.invoiceNumber} is ${invoice.status ?? 'unknown'} for TTD ${invoice.amount ?? 'n/a'}.`,
    };
  }

  if (normalized.includes('calendar') || normalized.includes('scheduled')) {
    const hits = searchIndexEntries(index, stripNavPrefix(message) || normalized, {
      entityType: 'calendar_event',
      limit: 3,
    });
    if (hits.length) {
      const lines = hits.map((event) => `${event.label} (${event.href})`).join('; ');
      return {
        confidence: 'high',
        directAnswer: `Matching calendar events: ${lines}.`,
      };
    }
  }

  return null;
}

function resolveFuzzyEntityNav(message: string, index: MiniCdIndex): MiniCdChatResolution | null {
  if (!looksLikeNavigation(message)) return null;

  const phrase = stripNavPrefix(message);
  if (!phrase) return null;

  const hits = searchIndexEntries(index, phrase, { limit: 1 });
  const hit = hits[0];
  if (!hit) return null;

  // Avoid hijacking plain page navigation like "open tickets"
  if (['ticket', 'tickets', 'order', 'orders', 'client', 'clients', 'settings', 'dashboard', 'invoice', 'invoices', 'quote', 'quotes', 'calendar', 'msp', 'sales', 'accounting', 'billing'].includes(phrase)) {
    return null;
  }

  return {
    confidence: 'high',
    portalAction: navAction(hit),
    matchedEntry: hit,
    directAnswer: `Opening ${hit.label}.`,
  };
}

export function looksLikeActionRequest(message: string): boolean {
  const normalized = message.toLowerCase().replace(/[^a-z0-9#]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.split(' ').length < 3) return false;
  if (looksLikeTicketSendConfirmation(message)) return false;
  if (looksLikeResendTicketUpdate(message)) return false;
  const navPhrases = ['go to', 'open ', 'show me', 'take me to', 'navigate to', 'switch to'];
  if (navPhrases.some((phrase) => normalized.includes(phrase))) return false;
  const infoPhrases = ['how many', 'what is the status', 'what status', 'where is', 'tell me about', 'hello', 'how are you'];
  if (infoPhrases.some((phrase) => normalized.startsWith(phrase))) return false;
  const actionVerbs = [
    'resend', 'resent', 'send', 'email', 'notify', 'create', 'add', 'update', 'assign', 'resolve',
    'export', 'import', 'delete', 'mark', 'pay', 'implement', 'build', 'wire', 'enable', 'fix', 'patch',
  ];
  return actionVerbs.some((verb) => normalized.includes(verb));
}

export function resolveMiniCdChatIntent(message: string, context: MiniCdContext): MiniCdChatResolution {
  const resend = resolveResendTicketUpdate(message, context.index, context);
  if (resend?.confidence === 'high') return resend;

  const index = context.index;
  if (!index?.entries?.length) {
    return { confidence: 'none' };
  }

  const resolvers = [
    resolveLatestEntityNav,
    resolveExplicitEntityNav,
    resolveDataQuestion,
    resolveFuzzyEntityNav,
  ];

  for (const resolver of resolvers) {
    const result = resolver(message, index);
    if (result?.confidence === 'high') return result;
  }

  return { confidence: 'none' };
}

export function validateEntityPortalAction(
  action: MiniPortalAction | null | undefined,
  index: MiniCdIndex | undefined
): MiniPortalAction | null {
  if (!action || action.type !== 'navigate' || !index) return action ?? null;
  const pathname = action.href.split('?')[0];
  if (!/^\/(tickets|orders|clients|sales)\/[^/]+$/.test(pathname)) {
    return action;
  }
  const entry = findIndexEntryByHref(index, pathname);
  if (!entry) return null;
  return {
    type: 'navigate',
    href: entry.href,
    label: action.label || entry.label,
  };
}
