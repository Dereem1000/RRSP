import { Client, Ticket, User } from '@cd-v2/database';
import {
  escapeHtml,
  getEmailBrand,
  highlightBox,
  infoRow,
  infoTable,
  paragraph,
  renderEmailLayout,
  statusBadge,
} from '@/lib/email-templates';
import { sendEmail } from '@/lib/email';
import { createAutomatedNotice, isNoticeEnabled } from '@/lib/notices';
import { getTicketNotificationSettings } from '@/lib/settings';

async function shouldEmail(flag: keyof Awaited<ReturnType<typeof getTicketNotificationSettings>>) {
  const settings = await getTicketNotificationSettings();
  return settings[flag];
}

function priorityColor(priority?: string | null) {
  const p = (priority ?? 'medium').toLowerCase();
  if (p === 'high' || p === 'urgent') return '#dc2626';
  if (p === 'low') return '#16a34a';
  return '#d97706';
}

async function sendTicketBrandedEmail({
  to,
  subject,
  eyebrow,
  title,
  preheader,
  bodyHtml,
  origin,
  test,
}: {
  to: string;
  subject: string;
  eyebrow: string;
  title: string;
  preheader: string;
  bodyHtml: string;
  origin?: string;
  test?: boolean;
}) {
  const brand = await getEmailBrand();
  const prefix = test ? '[TEST] ' : '';
  const rendered = await renderEmailLayout({ brand, origin, eyebrow, title, preheader, bodyHtml });
  await sendEmail({ to, subject: `${prefix}${subject}`, html: rendered.html, attachments: rendered.attachments });
}

export type TicketEmailData = {
  ticketNumber: string;
  issue: string;
  status: string;
  priority?: string | null;
  clientName?: string | null;
};

export type TicketEmailTemplate =
  | 'created-client'
  | 'created-staff'
  | 'assigned'
  | 'status-change'
  | 'resolved'
  | 'comment'
  | 'escalated';

function ticketInfoRowsFrom(ticket: TicketEmailData, extra?: string) {
  const rows = [
    infoRow('Ticket', `<strong style="color:#4f46e5;">#${escapeHtml(ticket.ticketNumber)}</strong>`),
    infoRow('Status', statusBadge(ticket.status, '#4f46e5')),
    infoRow('Priority', statusBadge(ticket.priority ?? 'medium', priorityColor(ticket.priority))),
    infoRow('Issue', escapeHtml(ticket.issue)),
  ];
  if (extra) rows.push(extra);
  return infoTable(rows.join(''));
}

function ticketInfoRows(ticket: Ticket, extra?: string) {
  return ticketInfoRowsFrom(
    {
      ticketNumber: ticket.ticketNumber,
      issue: ticket.issue,
      status: ticket.status,
      priority: ticket.priority,
      clientName: ticket.clientName,
    },
    extra
  );
}

export async function buildTicketEmailHtml(options: {
  template: TicketEmailTemplate;
  ticket: TicketEmailData;
  origin?: string;
  test?: boolean;
  createdByName?: string;
  updatedBy?: string;
  oldStatus?: string;
  resolution?: string;
  commentAuthor?: string;
  commentText?: string;
  escalatedBy?: string;
  escalationReason?: string;
}): Promise<{ subject: string; html: string }> {
  const brand = await getEmailBrand();
  const { template, ticket, origin } = options;
  const prefix = options.test ? '[TEST] ' : '';

  let subject = '';
  let eyebrow = 'Support ticket';
  let title = '';
  let preheader = '';
  let bodyHtml = '';

  switch (template) {
    case 'created-client':
      subject = `Ticket Created — ${ticket.ticketNumber}`;
      title = 'Ticket created';
      preheader = `${ticket.ticketNumber}: ${ticket.issue}`;
      bodyHtml = [
        paragraph('Your support ticket has been created. We will update you as work progresses.'),
        ticketInfoRowsFrom(ticket, infoRow('Created by', escapeHtml(options.createdByName ?? 'Support team'))),
      ].join('');
      break;
    case 'created-staff':
      subject = `New Ticket — ${ticket.ticketNumber}`;
      eyebrow = 'Staff alert';
      title = 'New support ticket';
      preheader = `${ticket.clientName ?? 'Client'}: ${ticket.issue}`;
      bodyHtml = [
        paragraph(`A new ticket was submitted by <strong>${escapeHtml(ticket.clientName || 'Unknown client')}</strong>.`),
        ticketInfoRowsFrom(ticket, infoRow('Created by', escapeHtml(options.createdByName ?? 'Client portal'))),
      ].join('');
      break;
    case 'assigned':
      subject = `Ticket Assigned — ${ticket.ticketNumber}`;
      title = 'Ticket assigned to you';
      preheader = `${ticket.ticketNumber}: ${ticket.issue}`;
      bodyHtml = [
        paragraph(`You have been assigned ticket <strong>#${escapeHtml(ticket.ticketNumber)}</strong>.`),
        ticketInfoRowsFrom(ticket),
      ].join('');
      break;
    case 'status-change': {
      const changeText = options.oldStatus
        ? `Status changed from <strong>${escapeHtml(options.oldStatus)}</strong> to <strong>${escapeHtml(ticket.status)}</strong>.`
        : `Status updated to <strong>${escapeHtml(ticket.status)}</strong>.`;
      subject = `Ticket Update — ${ticket.ticketNumber}`;
      title = 'Ticket status updated';
      preheader = `${ticket.ticketNumber} is now ${ticket.status}`;
      bodyHtml = [
        paragraph(`Ticket <strong>#${escapeHtml(ticket.ticketNumber)}</strong> has been updated.`),
        highlightBox(changeText),
        ticketInfoRowsFrom(ticket, infoRow('Updated by', escapeHtml(options.updatedBy ?? 'Support team'))),
      ].join('');
      break;
    }
    case 'resolved':
      subject = `Ticket Resolved — ${ticket.ticketNumber}`;
      title = 'Ticket resolved';
      preheader = `${ticket.ticketNumber} has been resolved`;
      bodyHtml = [
        paragraph(`Ticket <strong>#${escapeHtml(ticket.ticketNumber)}</strong> has been resolved.`),
        highlightBox(`<strong>Resolution:</strong><br />${escapeHtml(options.resolution ?? 'Issue resolved successfully.')}`),
        ticketInfoRowsFrom(ticket),
      ].join('');
      break;
    case 'comment':
      subject = `New comment on ${ticket.ticketNumber}`;
      title = 'New ticket comment';
      preheader = `Comment from ${options.commentAuthor ?? 'Support team'}`;
      bodyHtml = [
        paragraph(`<strong>${escapeHtml(options.commentAuthor ?? 'Support team')}</strong> added a comment on ticket <strong>#${escapeHtml(ticket.ticketNumber)}</strong>.`),
        highlightBox(escapeHtml(options.commentText ?? 'Sample comment for template preview.')),
        ticketInfoRowsFrom(ticket),
      ].join('');
      break;
    case 'escalated':
      subject = `Ticket Escalated — ${ticket.ticketNumber}`;
      eyebrow = 'Staff alert';
      title = 'Ticket escalated';
      preheader = `${ticket.ticketNumber} requires attention`;
      bodyHtml = [
        paragraph(`Ticket <strong>#${escapeHtml(ticket.ticketNumber)}</strong> was escalated by <strong>${escapeHtml(options.escalatedBy ?? 'Technician')}</strong>.`),
        highlightBox(`<strong>Reason:</strong><br />${escapeHtml(options.escalationReason ?? 'Requires senior technician review.')}`),
        ticketInfoRowsFrom(ticket),
      ].join('');
      break;
  }

  return {
    subject: `${prefix}${subject}`,
    ...(await renderEmailLayout({ brand, origin, eyebrow, title, preheader, bodyHtml })),
  };
}

export async function notifyTicketCreated(ticket: Ticket, createdByName: string) {
  const data = {
    ticketNumber: ticket.ticketNumber,
    title: ticket.issue,
    clientName: ticket.clientName,
    priority: ticket.priority ?? 'medium',
    createdBy: createdByName,
  };

  if (await isNoticeEnabled('create')) {
    await createAutomatedNotice('new_ticket_created', data);
  }

  if (!(await shouldEmail('emailOnCreate'))) return;

  const client = ticket.clientId ? await Client.findByPk(ticket.clientId) : null;
  if (client?.email) {
    const bodyHtml = [
      paragraph('Your support ticket has been created. We will update you as work progresses.'),
      ticketInfoRows(ticket, infoRow('Created by', escapeHtml(createdByName))),
    ].join('');

    await sendTicketBrandedEmail({
      to: client.email,
      subject: `Ticket Created — ${ticket.ticketNumber}`,
      eyebrow: 'Support ticket',
      title: 'Ticket created',
      preheader: `${ticket.ticketNumber}: ${ticket.issue}`,
      bodyHtml,
    });
  }

  const admins = await User.findAll({ where: { role: 'admin', isActive: true }, limit: 10 });
  for (const admin of admins) {
    if (admin.email) {
      const bodyHtml = [
        paragraph(`A new ticket was submitted by <strong>${escapeHtml(ticket.clientName || 'Unknown client')}</strong>.`),
        ticketInfoRows(ticket, infoRow('Created by', escapeHtml(createdByName))),
      ].join('');

      await sendTicketBrandedEmail({
        to: admin.email,
        subject: `New Ticket — ${ticket.ticketNumber}`,
        eyebrow: 'Staff alert',
        title: 'New support ticket',
        preheader: `${ticket.clientName}: ${ticket.issue}`,
        bodyHtml,
      });
    }
  }
}

export async function notifyTicketAssigned(ticket: Ticket, assignee: User | null) {
  const data = {
    ticketNumber: ticket.ticketNumber,
    title: ticket.issue,
    priority: ticket.priority ?? 'medium',
  };

  if (await isNoticeEnabled('assign')) {
    await createAutomatedNotice('new_ticket_assignment', data, { targetRoles: ['technician'] });
  }

  if (!(await shouldEmail('emailOnAssign')) || !assignee?.email) return;

  const bodyHtml = [
    paragraph(`You have been assigned ticket <strong>#${escapeHtml(ticket.ticketNumber)}</strong>.`),
    ticketInfoRows(ticket),
  ].join('');

  await sendTicketBrandedEmail({
    to: assignee.email,
    subject: `Ticket Assigned — ${ticket.ticketNumber}`,
    eyebrow: 'Support ticket',
    title: 'Ticket assigned to you',
    preheader: `${ticket.ticketNumber}: ${ticket.issue}`,
    bodyHtml,
  });
}

export async function notifyTicketStatusChange(ticket: Ticket, updatedBy: string, oldStatus?: string) {
  const data = {
    ticketNumber: ticket.ticketNumber,
    title: ticket.issue,
    status: ticket.status,
    updatedBy,
  };

  if (await isNoticeEnabled('status')) {
    await createAutomatedNotice('ticket_status_update', data, { clientId: ticket.clientId });
  }

  if (!(await shouldEmail('emailOnStatusChange'))) return;

  const client = ticket.clientId ? await Client.findByPk(ticket.clientId) : null;
  if (client?.email) {
    const changeText = oldStatus
      ? `Status changed from <strong>${escapeHtml(oldStatus)}</strong> to <strong>${escapeHtml(ticket.status)}</strong>.`
      : `Status updated to <strong>${escapeHtml(ticket.status)}</strong>.`;

    const bodyHtml = [
      paragraph(`Ticket <strong>#${escapeHtml(ticket.ticketNumber)}</strong> has been updated.`),
      highlightBox(changeText),
      ticketInfoRows(ticket, infoRow('Updated by', escapeHtml(updatedBy))),
    ].join('');

    await sendTicketBrandedEmail({
      to: client.email,
      subject: `Ticket Update — ${ticket.ticketNumber}`,
      eyebrow: 'Support ticket',
      title: 'Ticket status updated',
      preheader: `${ticket.ticketNumber} is now ${ticket.status}`,
      bodyHtml,
    });
  }
}

export async function notifyTicketResolved(ticket: Ticket, resolution: string) {
  if (!(await shouldEmail('emailOnResolve'))) return;
  const client = ticket.clientId ? await Client.findByPk(ticket.clientId) : null;
  if (!client?.email) return;

  const bodyHtml = [
    paragraph(`Ticket <strong>#${escapeHtml(ticket.ticketNumber)}</strong> has been resolved.`),
    highlightBox(`<strong>Resolution:</strong><br />${escapeHtml(resolution)}`),
    ticketInfoRows(ticket),
  ].join('');

  await sendTicketBrandedEmail({
    to: client.email,
    subject: `Ticket Resolved — ${ticket.ticketNumber}`,
    eyebrow: 'Support ticket',
    title: 'Ticket resolved',
    preheader: `${ticket.ticketNumber} has been resolved`,
    bodyHtml,
  });
}

export async function notifyTicketComment(
  ticket: Ticket,
  comment: { authorName: string; comment: string; isInternal?: boolean },
  recipientEmail?: string | null
) {
  if (comment.isInternal || !(await shouldEmail('emailOnComment')) || !recipientEmail) return;

  const bodyHtml = [
    paragraph(`<strong>${escapeHtml(comment.authorName)}</strong> added a comment on ticket <strong>#${escapeHtml(ticket.ticketNumber)}</strong>.`),
    highlightBox(escapeHtml(comment.comment)),
    ticketInfoRows(ticket),
  ].join('');

  await sendTicketBrandedEmail({
    to: recipientEmail,
    subject: `New comment on ${ticket.ticketNumber}`,
    eyebrow: 'Support ticket',
    title: 'New ticket comment',
    preheader: `Comment from ${comment.authorName}`,
    bodyHtml,
  });
}

export async function notifyTicketEscalated(ticket: Ticket, reason: string, escalatedBy: string) {
  await createAutomatedNotice('ticket_escalation', {
    ticketNumber: ticket.ticketNumber,
    title: ticket.issue,
    reason,
    escalatedBy,
  });

  const admins = await User.findAll({ where: { role: 'admin', isActive: true }, limit: 10 });
  for (const admin of admins) {
    if (admin.email) {
      const bodyHtml = [
        paragraph(`Ticket <strong>#${escapeHtml(ticket.ticketNumber)}</strong> was escalated by <strong>${escapeHtml(escalatedBy)}</strong>.`),
        highlightBox(`<strong>Reason:</strong><br />${escapeHtml(reason)}`),
        ticketInfoRows(ticket),
      ].join('');

      await sendTicketBrandedEmail({
        to: admin.email,
        subject: `Ticket Escalated — ${ticket.ticketNumber}`,
        eyebrow: 'Staff alert',
        title: 'Ticket escalated',
        preheader: `${ticket.ticketNumber} requires attention`,
        bodyHtml,
      });
    }
  }
}
