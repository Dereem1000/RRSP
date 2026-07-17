import { getSequelize } from './connection';

let ensured = false;

/** Creates email_logs table if missing (additive migration, safe for existing DBs). */
export async function ensureEmailLogSchema() {
  if (ensured) return;
  const sequelize = getSequelize();
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS email_logs (
      id TEXT PRIMARY KEY,
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('sent', 'failed')),
      category TEXT NOT NULL DEFAULT 'other',
      related_type TEXT,
      related_id TEXT,
      detail TEXT,
      error_message TEXT,
      sent_by INTEGER,
      created_at TEXT NOT NULL
    )
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON email_logs (created_at DESC)
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_email_logs_related ON email_logs (related_type, related_id)
  `);
  ensured = true;
}
