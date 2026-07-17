import { QueryTypes } from 'sequelize';
import { getSequelize } from '@cd-v2/database';

let invoiceLinksReady = false;

export async function ensureInvoiceLinksTable() {
  if (invoiceLinksReady) return;
  const sequelize = getSequelize();
  const tables = await sequelize.query<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'invoice_links'`,
    { type: QueryTypes.SELECT }
  );

  if (!tables.length) {
    await sequelize.query(`
      CREATE TABLE invoice_links (
        id TEXT PRIMARY KEY,
        invoiceId TEXT NOT NULL,
        linkedType TEXT NOT NULL,
        linkedId TEXT NOT NULL,
        linkedNumber TEXT NOT NULL,
        linkDate TEXT NOT NULL,
        linkedBy TEXT NOT NULL,
        notes TEXT,
        isActive INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    `);
    await sequelize.query(
      `CREATE INDEX IF NOT EXISTS invoice_links_invoice_id ON invoice_links (invoiceId)`
    );
    await sequelize.query(
      `CREATE INDEX IF NOT EXISTS invoice_links_linked_item ON invoice_links (linkedType, linkedId)`
    );
  }

  invoiceLinksReady = true;
}
