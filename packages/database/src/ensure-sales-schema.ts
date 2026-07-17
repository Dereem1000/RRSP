import { getSequelize } from './connection';

let ensured = false;

/** Creates sales_opportunities table if missing (additive migration, safe for existing DBs). */
export async function ensureSalesSchema() {
  if (ensured) return;
  const sequelize = getSequelize();
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS sales_opportunities (
      id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      address TEXT,
      product TEXT NOT NULL CHECK(product IN ('document','auto','distribution','ecommerce')),
      stage TEXT NOT NULL DEFAULT 'cold_prospect' CHECK(stage IN ('cold_prospect','contact_made','demo_completed','proposal_sent','won','lost')),
      deal_type TEXT CHECK(deal_type IN ('subscription','standalone')),
      monthly_rate REAL,
      project_value REAL,
      deposit_amount REAL,
      scope_notes TEXT,
      pitch_notes TEXT,
      demo_notes TEXT,
      contact_channel TEXT,
      contact_made_at TEXT,
      demo_completed_at TEXT,
      quote_id TEXT,
      client_id TEXT,
      lost_reason TEXT,
      communications TEXT DEFAULT '[]',
      created_by INTEGER,
      assigned_to INTEGER,
      won_at TEXT,
      lost_at TEXT,
      created_at TEXT,
      updated_at TEXT
    )
  `);
  ensured = true;
}
