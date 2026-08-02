import { randomUUID } from 'crypto';
import { QueryTypes, type Sequelize } from 'sequelize';
import {
  ensurePosCatalogSchema,
  ensureWalkInPosClient,
  type PosProductKind,
} from '@/lib/pos-catalog';

const DEMO_PRODUCTS: Array<{
  sku: string;
  name: string;
  description: string;
  unitPrice: number;
  costPrice: number;
  quantity: number;
  kind: PosProductKind;
}> = [
  {
    sku: 'DEMO-CABLE',
    name: 'Demo USB-C Cable',
    description: 'Sample stocked physical item',
    unitPrice: 45,
    costPrice: 18,
    quantity: 25,
    kind: 'physical',
  },
  {
    sku: 'DEMO-CASE',
    name: 'Demo Phone Case',
    description: 'Sample stocked physical item',
    unitPrice: 80,
    costPrice: 30,
    quantity: 12,
    kind: 'physical',
  },
  {
    sku: 'DEMO-TEMPER',
    name: 'Demo Tempered Glass',
    description: 'Sample stocked physical item',
    unitPrice: 60,
    costPrice: 20,
    quantity: 40,
    kind: 'physical',
  },
  {
    sku: 'DEMO-GIFT',
    name: 'Demo Gift Wrap',
    description: 'Item sold without quantity tracking',
    unitPrice: 15,
    costPrice: 5,
    quantity: 0,
    kind: 'non_stock',
  },
  {
    sku: 'DEMO-SETUP',
    name: 'Demo Device Setup',
    description: 'Sample service / labour fee',
    unitPrice: 120,
    costPrice: 0,
    quantity: 0,
    kind: 'service',
  },
];

async function hasDemoPosProducts(sequelize: Sequelize): Promise<boolean> {
  await ensurePosCatalogSchema(sequelize);
  const rows = await sequelize.query<{ c: number }>(
    `
      SELECT COUNT(*) AS c
      FROM pos_products
      WHERE isActive = 1
        AND sku LIKE 'DEMO-%'
    `,
    { type: QueryTypes.SELECT }
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

/** Insert sample POS catalog rows (idempotent for DEMO-* SKUs). */
export async function seedPosCatalogDemoProducts(
  sequelize: Sequelize,
  createdBy = 0
): Promise<number> {
  await ensurePosCatalogSchema(sequelize);
  if (await hasDemoPosProducts(sequelize)) return 0;

  const now = new Date().toISOString();
  let inserted = 0;
  for (const item of DEMO_PRODUCTS) {
    const tracksStock = item.kind === 'physical';
    await sequelize.query(
      `
        INSERT INTO pos_products (
          id, sku, name, description, unitPrice, costPrice, quantity, availableQuantity,
          productKind, isActive, createdBy, createdAt, updatedAt
        ) VALUES (
          :id, :sku, :name, :description, :unitPrice, :costPrice, :quantity, :availableQuantity,
          :productKind, 1, :createdBy, :now, :now
        )
      `,
      {
        replacements: {
          id: `demo-pos-${randomUUID().slice(0, 8)}`,
          sku: item.sku,
          name: item.name,
          description: item.description,
          unitPrice: item.unitPrice,
          costPrice: item.costPrice,
          quantity: tracksStock ? item.quantity : 0,
          availableQuantity: tracksStock ? item.quantity : 0,
          productKind: item.kind,
          createdBy,
          now,
        },
      }
    );
    inserted += 1;
  }
  return inserted;
}

/** CD staff demo sandbox: ensure POS schema, walk-in customer, and sample catalog. */
export async function seedCdPosDemoData(): Promise<void> {
  const { getSequelize } = await import('@/lib/db');
  const sequelize = getSequelize();
  await seedPosCatalogDemoProducts(sequelize, 0);
  await ensureWalkInPosClient();
}

/** RRSP shop demo: sample POS catalog + walk-in when shop POS module is in use. */
export async function seedRrspPosDemoData(): Promise<void> {
  const { getOperationalSequelize, isRrspDbActive } = await import('@/lib/rrsp-db');
  if (!isRrspDbActive()) {
    throw new Error('Shop POS demo seed requires RRSP database context');
  }
  const sequelize = getOperationalSequelize();
  await seedPosCatalogDemoProducts(sequelize, 0);
  await ensureWalkInPosClient();
}
