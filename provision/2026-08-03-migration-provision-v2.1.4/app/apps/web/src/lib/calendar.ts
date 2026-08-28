import { Op } from 'sequelize';
import { CalendarEvent, ensureCalendarSchema } from '@cd-v2/database';

export type SerializedCalendarEvent = {
  id: string;
  title: string;
  notes: string | null;
  eventType: string;
  scheduledAt: string;
  opportunityId: string | null;
  clientId: string | null;
  createdBy: number | null;
  completedAt: string | null;
  created_at?: string;
  updated_at?: string;
};

function serializeEvent(row: CalendarEvent): SerializedCalendarEvent {
  const json = row.toJSON() as unknown as Record<string, unknown>;
  return {
    id: String(json.id),
    title: String(json.title),
    notes: (json.notes as string | null) ?? null,
    eventType: String(json.eventType ?? json.event_type ?? 'sales_followup'),
    scheduledAt: new Date(String(json.scheduledAt ?? json.scheduled_at)).toISOString(),
    opportunityId: (json.opportunityId as string | null) ?? null,
    clientId: (json.clientId as string | null) ?? null,
    createdBy: (json.createdBy as number | null) ?? null,
    completedAt: json.completedAt ? new Date(String(json.completedAt)).toISOString() : null,
    created_at: json.created_at ? new Date(String(json.created_at)).toISOString() : undefined,
    updated_at: json.updated_at ? new Date(String(json.updated_at)).toISOString() : undefined,
  };
}

export async function listCalendarEvents(input?: {
  from?: string;
  to?: string;
  includeCompleted?: boolean;
}) {
  await ensureCalendarSchema();
  const where: Record<string, unknown> = {};

  if (!input?.includeCompleted) {
    where.completedAt = null;
  }

  if (input?.from || input?.to) {
    where.scheduledAt = {};
    if (input.from) {
      (where.scheduledAt as Record<symbol, unknown>)[Op.gte] = new Date(input.from);
    }
    if (input.to) {
      (where.scheduledAt as Record<symbol, unknown>)[Op.lte] = new Date(input.to);
    }
  }

  const rows = await CalendarEvent.findAll({
    where,
    order: [['scheduledAt', 'ASC']],
  });

  return rows.map(serializeEvent);
}

export async function createCalendarEvent(input: {
  title: string;
  notes?: string | null;
  eventType?: string;
  scheduledAt: string;
  opportunityId?: string | null;
  clientId?: string | null;
  createdBy?: number | null;
}) {
  await ensureCalendarSchema();
  const row = await CalendarEvent.create({
    title: input.title.trim(),
    notes: input.notes?.trim() || null,
    eventType: (input.eventType as 'sales_followup' | 'general') ?? 'sales_followup',
    scheduledAt: new Date(input.scheduledAt),
    opportunityId: input.opportunityId ?? null,
    clientId: input.clientId ?? null,
    createdBy: input.createdBy ?? null,
  });
  return serializeEvent(row);
}

export async function completeCalendarEvent(id: string) {
  await ensureCalendarSchema();
  const row = await CalendarEvent.findByPk(id);
  if (!row) return null;
  await row.update({ completedAt: new Date() });
  return serializeEvent(row);
}

export async function deleteCalendarEvent(id: string) {
  await ensureCalendarSchema();
  const row = await CalendarEvent.findByPk(id);
  if (!row) return null;
  await row.destroy();
  return { deleted: true, id };
}

export function formatScheduledLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
