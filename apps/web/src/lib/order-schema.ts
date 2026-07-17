import { QueryTypes } from 'sequelize';
import { getSequelize } from '@cd-v2/database';

let ordersSchemaReady = false;

const ORDER_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: 'serialNumber', ddl: 'TEXT' },
  { name: 'shippingStage', ddl: "VARCHAR(50) DEFAULT 'ordered'" },
  { name: 'currentLocation', ddl: 'VARCHAR(200)' },
  { name: 'locationHistory', ddl: "TEXT DEFAULT '[]'" },
  { name: 'lastLocationUpdate', ddl: 'DATETIME' },
  { name: 'shipping_stage', ddl: "TEXT NOT NULL DEFAULT 'ordered'" },
  { name: 'current_location', ddl: 'VARCHAR(255)' },
  { name: 'location_history', ddl: 'TEXT' },
  { name: 'last_location_update', ddl: 'DATETIME' },
];

export async function ensureOrderSerialColumn() {
  await ensureOrdersSchema();
}

export async function ensureOrdersSchema() {
  if (ordersSchemaReady) return;
  const sequelize = getSequelize();

  const tables = await sequelize.query<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'orders'`,
    { type: QueryTypes.SELECT }
  );
  if (!tables.length) {
    ordersSchemaReady = true;
    return;
  }

  const cols = await sequelize.query<{ name: string }>(`PRAGMA table_info(orders)`, {
    type: QueryTypes.SELECT,
  });
  const existing = new Set(cols.map((c) => c.name));
  for (const column of ORDER_COLUMNS) {
    if (!existing.has(column.name)) {
      await sequelize.query(`ALTER TABLE orders ADD COLUMN ${column.name} ${column.ddl}`);
    }
  }

  const linkTables = await sequelize.query<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'order_links'`,
    { type: QueryTypes.SELECT }
  );
  if (!linkTables.length) {
    await sequelize.query(`
      CREATE TABLE order_links (
        id TEXT PRIMARY KEY,
        orderId TEXT NOT NULL,
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
      `CREATE INDEX IF NOT EXISTS order_links_order_id ON order_links (orderId)`
    );
    await sequelize.query(
      `CREATE INDEX IF NOT EXISTS order_links_linked_item ON order_links (linkedType, linkedId)`
    );
  }

  ordersSchemaReady = true;
}
