import { normalizeTicketStatus } from '@/lib/ticket-constants';
export function pickTicketFields(body: Record<string, unknown>, mode: 'create' | 'update') {
  const issue = String(body.issue ?? body.title ?? '').trim();
  const payload: Record<string, unknown> = {};

  if (mode === 'create' || body.issue !== undefined || body.title !== undefined) {
    if (issue) {
      payload.issue = issue;
      if (body.title === undefined) payload.title = issue;
    }
    if (body.title !== undefined) payload.title = body.title;
  }

  const scalarFields = [
    'clientName',
    'clientContactNumber',
    'location',
    'deviceType',
    'deviceModel',
    'serialNumber',
    'status',
    'notes',
    'priority',
    'category',
    'dueDate',
    'subscription',
    'resolutionNotes',
  ] as const;

  for (const field of scalarFields) {
    if (body[field] !== undefined) {
      payload[field] = field === 'status' ? normalizeTicketStatus(String(body[field])) : body[field];
    }
  }

  if (body.description !== undefined && body.notes === undefined) {
    payload.notes = body.description;
  }

  const numericFields = ['estimatedHours', 'actualHours', 'estimatedCost', 'actualCost'] as const;
  for (const field of numericFields) {
    if (body[field] !== undefined && body[field] !== '') {
      payload[field] = body[field] === null ? null : Number(body[field]);
    }
  }

  if (body.isActive !== undefined) payload.isActive = Number(body.isActive) ? 1 : 0;
  if (body.clientId !== undefined) payload.clientId = body.clientId || null;
  if (body.tags !== undefined) payload.tags = body.tags;
  if (body.attachments !== undefined) payload.attachments = body.attachments;

  return payload;
}
