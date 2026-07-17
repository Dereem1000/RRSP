import type { TokenPayload } from '@/lib/jwt';
import { requireRole } from '@/lib/auth';
import { canAccessTicket, getTicketById } from '@/lib/tickets';
import { resendTicketUpdateToClient } from '@/lib/ticket-notifications';
import { findRecentTicketEmailLog } from '@/lib/email-log';
import { emitMiniCdEvent } from '@/lib/mini-cd-events.server';
import type { MiniCdContext } from '@/lib/mini-cd-context';
import {
  findClientInIndex,
  findLatestForClient,
  searchIndexEntries,
  type MiniCdIndex,
} from '@/lib/mini-cd-index';
import type { MiniCdExecuteAction } from '@/lib/mini-cd-query';

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9#]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractClientPhrase(message: string): string | null {
  const patterns = [
    /(?:did you send|have you sent|was it sent to)\s+(.+?)\s+(?:the\s+)?ticket/i,
    /(?:for|to)\s+(.+?)(?:\s+the\s+ticket|\s+ticket|\s+client)?$/i,
    /(?:resend|resent|send)\s+(?:the\s+)?(.+?)\s+ticket/i,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function resolveTicketForClientPhrase(index: MiniCdIndex, message: string) {
  const clientPhrase = extractClientPhrase(message);
  let client = clientPhrase ? findClientInIndex(index, clientPhrase) : undefined;
  if (!client) {
    const hits = searchIndexEntries(index, clientPhrase || message, { entityType: 'client', limit: 1 });
    client = hits[0];
  }
  if (!client) return null;
  const ticket = findLatestForClient(index, client.id, 'ticket');
  if (!ticket) return null;
  return { client, ticket };
}

export async function executeMiniCdAction(
  session: TokenPayload,
  action: MiniCdExecuteAction,
  actorName: string
): Promise<{ content: string; success: boolean }> {
  if (action.type === 'resend_ticket_update') {
    requireRole(session, 'admin', 'technician');

    const ticket = await getTicketById(action.ticketId);
    if (!ticket) {
      return { success: false, content: `I couldn't find that ticket to resend updates.` };
    }

    if (!(await canAccessTicket(ticket, session))) {
      return { success: false, content: `You don't have permission to resend updates for that ticket.` };
    }

    const result = await resendTicketUpdateToClient(ticket, actorName);
    if (!result.ok) {
      return { success: false, content: result.error };
    }

    emitMiniCdEvent(session, {
      type: 'ticket.updated',
      summary: `Resent ticket #${result.ticketNumber} update email to ${result.email}`,
      entityType: 'ticket',
      entityId: action.ticketId,
      href: `/tickets/${action.ticketId}`,
      clientId: ticket.clientId ? String(ticket.clientId) : undefined,
      clientName: ticket.clientName ? String(ticket.clientName) : undefined,
      actorName,
    });

    const clientName = ticket.clientName || 'the client';
    return {
      success: true,
      content: `Done — I sent the latest update for ticket #${result.ticketNumber} (${ticket.issue}) to ${clientName} at ${result.email}.`,
    };
  }

  return { success: false, content: `That action isn't supported yet.` };
}

export async function answerTicketSendConfirmation(
  session: TokenPayload,
  message: string,
  context: MiniCdContext
): Promise<string | null> {
  const index = context.index;
  if (!index?.entries?.length) return null;

  const resolved = resolveTicketForClientPhrase(index, message);
  if (!resolved) {
    return `I couldn't match a client ticket for that question. Tell me the ticket number or client name and I can check or send again.`;
  }

  const { ticket } = resolved;
  const ticketNumber = String(ticket.ticketNumber || '');
  if (!ticketNumber) return null;

  const logs = await findRecentTicketEmailLog(ticketNumber, 3);
  const latestSent = logs.find((entry) => entry.status === 'sent');
  const latestFailed = logs.find((entry) => entry.status === 'failed');

  if (latestSent) {
    const when = new Date(latestSent.createdAt).toLocaleString();
    return `Yes — the ticket update for #${ticketNumber} was emailed to ${latestSent.toEmail} on ${when}.`;
  }

  if (latestFailed) {
    const err = latestFailed.errorMessage ? ` Error: ${latestFailed.errorMessage}` : '';
    return `No — the last attempt to email ticket #${ticketNumber} failed.${err} Say "resend ${ticket.clientName || 'client'} ticket update" and I'll try again after you confirm email settings.`;
  }

  return `No — I don't see a sent email for ticket #${ticketNumber} in the log yet. Say "resend ${ticket.clientName || 'client'} ticket update" and I'll send it now.`;
}

export function isCdActionFailure(content: string): boolean {
  const lower = content.toLowerCase();
  return (
    lower.includes("couldn't") ||
    lower.includes('did not send') ||
    lower.includes("don't have permission") ||
    lower.includes("isn't supported") ||
    lower.includes('does not have an email') ||
    lower.includes('check settings') ||
    lower.startsWith('no —')
  );
}
