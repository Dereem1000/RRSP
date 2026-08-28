import { getSequelize } from './connection';

let ensured = false;

/** Creates calendar_events table if missing (additive migration). */
export async function ensureCalendarSchema() {
  if (ensured) return;
  const sequelize = getSequelize();
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      notes TEXT,
      event_type TEXT NOT NULL DEFAULT 'sales_followup',
      scheduled_at TEXT NOT NULL,
      opportunity_id TEXT,
      client_id TEXT,
      created_by INTEGER,
      completed_at TEXT,
      created_at TEXT,
      updated_at TEXT
    )
  `);
  ensured = true;
}
