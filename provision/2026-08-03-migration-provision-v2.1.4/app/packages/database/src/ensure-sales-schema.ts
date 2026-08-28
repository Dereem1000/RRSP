import { getSequelize } from './connection';

let ensured = false;
let ensurePromise: Promise<void> | null = null;

const SALES_PRODUCTS_SQL = "'document','auto','distribution','ecommerce','medical'";

const CREATE_SALES_OPPORTUNITIES_SQL = `
    CREATE TABLE IF NOT EXISTS sales_opportunities (
      id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      address TEXT,
      product TEXT NOT NULL CHECK(product IN (${SALES_PRODUCTS_SQL})),
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
  `;

async function clearStrayTransaction() {
  const sequelize = getSequelize();
  try {
    await sequelize.query('ROLLBACK');
  } catch {
    /* no open transaction */
  }
}

/** Recreate sales_opportunities when the product CHECK constraint is missing newer products (SQLite). */
async function migrateSalesProductConstraint() {
  const sequelize = getSequelize();
  const [rows] = (await sequelize.query(
    `SELECT sql FROM sqlite_master WHERE type='table' AND name='sales_opportunities'`
  )) as [Array<{ sql: string | null }>, unknown];
  const sql = rows[0]?.sql ?? '';
  if (!sql || sql.includes("'medical'")) return;

  await clearStrayTransaction();
  await sequelize.query('PRAGMA foreign_keys = OFF');
  try {
    // Use Sequelize's transaction helper — raw BEGIN nests when a connection already has one.
    await sequelize.transaction(async (transaction) => {
      await sequelize.query(
        `
      CREATE TABLE sales_opportunities_new (
        id TEXT PRIMARY KEY,
        company_name TEXT NOT NULL,
        contact_name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        address TEXT,
        product TEXT NOT NULL CHECK(product IN (${SALES_PRODUCTS_SQL})),
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
    `,
        { transaction }
      );
      await sequelize.query(
        `
      INSERT INTO sales_opportunities_new (
        id, company_name, contact_name, email, phone, address, product, stage, deal_type,
        monthly_rate, project_value, deposit_amount, scope_notes, pitch_notes, demo_notes,
        contact_channel, contact_made_at, demo_completed_at, quote_id, client_id, lost_reason,
        communications, created_by, assigned_to, won_at, lost_at, created_at, updated_at
      )
      SELECT
        id, company_name, contact_name, email, phone, address, product, stage, deal_type,
        monthly_rate, project_value, deposit_amount, scope_notes, pitch_notes, demo_notes,
        contact_channel, contact_made_at, demo_completed_at, quote_id, client_id, lost_reason,
        communications, created_by, assigned_to, won_at, lost_at, created_at, updated_at
      FROM sales_opportunities
    `,
        { transaction }
      );
      await sequelize.query('DROP TABLE sales_opportunities', { transaction });
      await sequelize.query('ALTER TABLE sales_opportunities_new RENAME TO sales_opportunities', {
        transaction,
      });
    });
  } finally {
    await sequelize.query('PRAGMA foreign_keys = ON');
  }
}

async function ensureSalesSchemaOnce() {
  const sequelize = getSequelize();
  await sequelize.query(CREATE_SALES_OPPORTUNITIES_SQL);
  await migrateSalesProductConstraint();
  ensured = true;
}

/** Creates sales_opportunities table if missing (additive migration, safe for existing DBs). */
export async function ensureSalesSchema() {
  if (ensured) return;
  if (!ensurePromise) {
    ensurePromise = ensureSalesSchemaOnce().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  await ensurePromise;
}
