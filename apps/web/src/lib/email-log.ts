import { randomUUID } from 'crypto';
import { QueryTypes } from 'sequelize';
import { getSequelize, ensureEmailLogSchema } from '@cd-v2/database';

export type EmailLogCategory =
  | 'invoice'
  | 'quote'
  | 'ticket'
  | 'welcome'
  | 'order'
  | 'test'
  | 'system'
  | 'other';

export type EmailLogMeta = {
  category?: EmailLogCategory;
  relatedType?: 'invoice' | 'quote';
  relatedId?: string;
  detail?: string;
  sentBy?: number;
};

export type EmailLogEntry = {
  id: string;
  toEmail: string;
  subject: string;
  status: 'sent' | 'failed';
  category: EmailLogCategory;
  relatedType: string | null;
  relatedId: string | null;
  detail: string | null;
  errorMessage: string | null;
  sentBy: number | null;
  createdAt: string;
};

type EmailLogRow = {
  id: string;
  to_email: string;
  subject: string;
  status: string;
  category: string;
  related_type: string | null;
  related_id: string | null;
  detail: string | null;
  error_message: string | null;
  sent_by: number | null;
  created_at: string;
};

function serializeRow(row: EmailLogRow): EmailLogEntry {
  return {
    id: row.id,
    toEmail: row.to_email,
    subject: row.subject,
    status: row.status === 'failed' ? 'failed' : 'sent',
    category: (row.category as EmailLogCategory) || 'other',
    relatedType: row.related_type,
    relatedId: row.related_id,
    detail: row.detail,
    errorMessage: row.error_message,
    sentBy: row.sent_by,
    createdAt: row.created_at,
  };
}

export async function logEmailEntry({
  to,
  subject,
  status,
  errorMessage,
  meta,
}: {
  to: string;
  subject: string;
  status: 'sent' | 'failed';
  errorMessage?: string | null;
  meta?: EmailLogMeta;
}) {
  await ensureEmailLogSchema();
  const sequelize = getSequelize();
  const now = new Date().toISOString();
  await sequelize.query(
    `INSERT INTO email_logs (
      id, to_email, subject, status, category, related_type, related_id, detail, error_message, sent_by, created_at
    ) VALUES (
      :id, :toEmail, :subject, :status, :category, :relatedType, :relatedId, :detail, :errorMessage, :sentBy, :createdAt
    )`,
    {
      replacements: {
        id: randomUUID(),
        toEmail: to,
        subject,
        status,
        category: meta?.category ?? 'other',
        relatedType: meta?.relatedType ?? null,
        relatedId: meta?.relatedId ?? null,
        detail: meta?.detail ?? null,
        errorMessage: errorMessage ?? null,
        sentBy: meta?.sentBy ?? null,
        createdAt: now,
      },
    }
  );
}

export async function listEmailLogs(options?: {
  page?: number;
  limit?: number;
  category?: EmailLogCategory;
  relatedType?: string;
  relatedId?: string;
}) {
  await ensureEmailLogSchema();
  const sequelize = getSequelize();
  const page = Math.max(1, options?.page ?? 1);
  const limit = Math.min(100, Math.max(1, options?.limit ?? 50));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const replacements: Record<string, unknown> = { limit, offset };

  if (options?.category) {
    conditions.push('category = :category');
    replacements.category = options.category;
  }
  if (options?.relatedType) {
    conditions.push('related_type = :relatedType');
    replacements.relatedType = options.relatedType;
  }
  if (options?.relatedId) {
    conditions.push('related_id = :relatedId');
    replacements.relatedId = options.relatedId;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRows = await sequelize.query<{ total: number }>(
    `SELECT COUNT(*) AS total FROM email_logs ${where}`,
    { type: QueryTypes.SELECT, replacements }
  );

  const rows = await sequelize.query<EmailLogRow>(
    `SELECT * FROM email_logs ${where} ORDER BY created_at DESC LIMIT :limit OFFSET :offset`,
    { type: QueryTypes.SELECT, replacements }
  );

  const total = Number(countRows[0]?.total ?? 0);
  return {
    logs: rows.map(serializeRow),
    pagination: {
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

export async function findRecentTicketEmailLog(ticketNumber: string, limit = 5) {
  await ensureEmailLogSchema();
  const sequelize = getSequelize();
  const rows = await sequelize.query<EmailLogRow>(
    `SELECT * FROM email_logs
     WHERE category = 'ticket' AND subject LIKE :pattern
     ORDER BY created_at DESC
     LIMIT :limit`,
    {
      type: QueryTypes.SELECT,
      replacements: { pattern: `%${ticketNumber}%`, limit },
    }
  );
  return rows.map(serializeRow);
}

export async function listEmailLogsForEntity(relatedType: 'invoice' | 'quote', relatedId: string) {
  const { logs } = await listEmailLogs({ relatedType, relatedId, limit: 100, page: 1 });
  return logs;
}
