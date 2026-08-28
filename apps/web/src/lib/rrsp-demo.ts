import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { randomUUID } from 'crypto';
import { QueryTypes } from 'sequelize';
import { Client } from '@cd-v2/database';
import { getSequelize } from '@/lib/db';
import { isRrspModuleEnabled, normalizeServicePlanData } from '@/lib/rrsp';
import {
  clearRrspDatabaseCache,
  ensureRrspDatabase,
  getRrspDatabasePath,
  runWithRrspDb,
  getTicketModel,
  getShopClientModel,
  getSalesOpportunityModel,
} from '@/lib/rrsp-db';
import { seedRrspPosDemoData } from '@/lib/pos-demo';

const DEMO_TAG = 'rrsp-demo';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeOrQuarantine(filePath: string, attempts = 8): Promise<void> {
  if (!fs.existsSync(filePath)) return;
  for (let i = 0; i < attempts; i++) {
    try {
      fs.unlinkSync(filePath);
      return;
    } catch {
      try {
        const trash = path.join(path.dirname(filePath), '.trash');
        fs.mkdirSync(trash, { recursive: true });
        fs.renameSync(filePath, path.join(trash, `${Date.now()}-${i}-${path.basename(filePath)}`));
        return;
      } catch {
        await delay(50 * (i + 1));
      }
    }
  }
}

async function removeDbFiles(basePath: string): Promise<void> {
  for (const suffix of ['-shm', '-wal', '']) {
    await removeOrQuarantine(`${basePath}${suffix}`);
  }
}

function runSql(db: sqlite3.Database, sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => (err ? reject(err) : resolve()));
  });
}

function openDb(filePath: string): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(filePath, (err) => (err ? reject(err) : resolve(db)));
  });
}

function closeDb(db: sqlite3.Database): Promise<void> {
  return new Promise((resolve, reject) => {
    db.close((err) => (err ? reject(err) : resolve()));
  });
}

async function copyMainDb(sourcePath: string, destPath: string): Promise<void> {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const tmpPath = `${destPath}.${process.pid}.${Date.now()}.vacuum-tmp`;
  await removeDbFiles(tmpPath);
  const tmpSqlPath = tmpPath.replace(/\\/g, '/').replace(/'/g, "''");
  const db = await openDb(sourcePath);
  try {
    await runSql(db, 'PRAGMA busy_timeout = 30000');
    try {
      await runSql(db, 'PRAGMA wal_checkpoint(TRUNCATE)');
    } catch {
      // best-effort
    }
    await runSql(db, `VACUUM INTO '${tmpSqlPath}'`);
  } finally {
    await closeDb(db);
  }
  await removeDbFiles(destPath);
  try {
    fs.renameSync(tmpPath, destPath);
  } catch {
    fs.copyFileSync(tmpPath, destPath);
    await removeOrQuarantine(tmpPath);
  }
}

async function shopDemoPaths(mspClientId: string) {
  const dbPath = await getRrspDatabasePath(mspClientId);
  const shopDir = path.dirname(dbPath);
  const demoDir = path.join(shopDir, '.shop_demo');
  return {
    dbPath,
    demoDir,
    snapshotPath: path.join(demoDir, 'snapshot.db'),
    activeMarkerPath: path.join(demoDir, 'active.json'),
  };
}

export async function isRrspShopDemoActive(mspClientId: string): Promise<boolean> {
  const { activeMarkerPath } = await shopDemoPaths(mspClientId);
  return fs.existsSync(activeMarkerPath);
}

async function setServicePlanDemoFlag(mspClientId: string, enabled: boolean): Promise<void> {
  const client = await Client.findByPk(mspClientId, { attributes: ['id', 'servicePlanData'] });
  if (!client) return;
  const plan = normalizeServicePlanData(client.servicePlanData);
  await client.update({
    servicePlanData: {
      ...plan,
      rrspDemoMode: enabled,
    },
  });
}

async function seedShopDemoData(mspClientId: string): Promise<void> {
  await runWithRrspDb(mspClientId, async () => {
    const Ticket = getTicketModel();
    const ShopClient = getShopClientModel();
    const Sales = getSalesOpportunityModel();
    const now = new Date();
    const iso = now.toISOString();
    const day = (offset: number) => new Date(now.getTime() + offset * 86400000).toISOString();

    const customers = [
      {
        id: `demo-cust-${randomUUID().slice(0, 8)}`,
        name: 'Demo Customer — Island Tech',
        companyName: 'Island Tech Solutions',
        email: 'demo.customer1@example.com',
        phone: '+1-868-555-0101',
        address: '12 Demo Street, Port of Spain',
        contactPerson: 'Alex Demo',
      },
      {
        id: `demo-cust-${randomUUID().slice(0, 8)}`,
        name: 'Demo Customer — Coral Retail',
        companyName: 'Coral Retail Ltd',
        email: 'demo.customer2@example.com',
        phone: '+1-868-555-0102',
        address: '45 Sample Ave, San Fernando',
        contactPerson: 'Jordan Sample',
      },
      {
        id: `demo-cust-${randomUUID().slice(0, 8)}`,
        name: 'Demo Customer — Harbor Cafe',
        companyName: 'Harbor Cafe',
        email: 'demo.customer3@example.com',
        phone: '+1-868-555-0103',
        address: '8 Pier Road, Chaguaramas',
        contactPerson: 'Sam Harbor',
      },
    ];

    for (const c of customers) {
      await ShopClient.create({
        ...c,
        supportTier: 'silver',
        status: 'active',
        isActive: true,
        features: [],
        servicePlanData: { demo: true, tag: DEMO_TAG },
        notes: `Demo data (${DEMO_TAG}) — safe to discard when shop demo mode is turned off.`,
        billingInfo: {},
        contractDetails: { showcase: true, tag: DEMO_TAG },
        communicationHistory: [],
        slaAgreement: {},
      });
    }

    const ticketSpecs = [
      {
        client: customers[0],
        status: 'In Progress',
        priority: 'high',
        issue: 'Laptop will not power on after power outage',
        deviceType: 'Laptop',
        deviceModel: 'DemoBook Pro 14',
      },
      {
        client: customers[1],
        status: 'New',
        priority: 'medium',
        issue: 'POS terminal printer offline',
        deviceType: 'POS',
        deviceModel: 'DemoPrint 200',
      },
      {
        client: customers[2],
        status: 'Resolved',
        priority: 'low',
        issue: 'Wi‑Fi slow in dining area',
        deviceType: 'Network',
        deviceModel: 'Demo AP',
      },
      {
        client: customers[0],
        status: 'Waiting for Parts',
        priority: 'high',
        issue: 'Cracked screen replacement needed',
        deviceType: 'Phone',
        deviceModel: 'DemoPhone X',
      },
    ];

    let ticketNum = 1001;
    for (const spec of ticketSpecs) {
      const id = `demo-tkt-${randomUUID().slice(0, 8)}`;
      await Ticket.create({
        id,
        ticketNumber: `D-${ticketNum++}`,
        clientName: spec.client.companyName || spec.client.name,
        clientContactNumber: spec.client.phone,
        issue: spec.issue,
        location: spec.client.address,
        deviceType: spec.deviceType,
        deviceModel: spec.deviceModel,
        serialNumber: `DEMO-${ticketNum}`,
        status: spec.status,
        technician: 'Ben Bench (demo staff)',
        notes: `Demo ticket (${DEMO_TAG})`,
        priority: spec.priority,
        category: 'general',
        dateCreated: day(-3),
        lastUpdated: iso,
        isActive: 1,
        clientId: spec.client.id,
        attachments: [],
        tags: [DEMO_TAG, 'demo'],
        title: spec.issue,
      });
    }

    await Sales.create({
      id: `demo-sale-${randomUUID().slice(0, 8)}`,
      companyName: 'Demo Prospect Co',
      contactName: 'Casey Prospect',
      email: 'prospect@example.com',
      phone: '+1-868-555-0199',
      address: '99 Demo Lane',
      product: 'Managed IT support',
      stage: 'demo_scheduled',
      dealType: 'monthly',
      monthlyRate: 450,
      projectValue: 0,
      scopeNotes: `Demo opportunity (${DEMO_TAG})`,
      pitchNotes: 'Sample sales pipeline entry for demonstrations.',
      communications: [],
      createdBy: null,
      assignedTo: null,
    });

    const db = await ensureRrspDatabase(mspClientId);
    const sequelize = db.sequelize;

    const trySeed = async (label: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (err) {
        console.warn(`[RRSP DEMO] ${label} seed skipped:`, err instanceof Error ? err.message : err);
      }
    };

    await trySeed('orders', () =>
      sequelize.query(
        `
        INSERT INTO orders (
          id, orderNumber, clientId, title, description, itemName, vendor,
          orderDate, costPrice, clientPrice, quantity, status, createdBy,
          tags, notes, isActive, createdAt, updatedAt, shipping_stage
        ) VALUES
        (:id1, 'D-ORD-1001', :c1, 'Demo screen assembly', 'Demo order for shop walkthrough',
         'Phone screen assembly', 'Demo Parts Co', :d1, 120, 220, 1, 'ordered', 0,
         :tags, :notes, 1, :iso, :iso, 'ordered'),
        (:id2, 'D-ORD-1002', :c2, 'Demo SSD upgrade', 'Demo order in transit',
         '1TB NVMe SSD', 'Demo Parts Co', :d2, 90, 160, 2, 'shipped', 0,
         :tags, :notes, 1, :iso, :iso, 'in_transit')
        `,
        {
          replacements: {
            id1: `demo-ord-${randomUUID().slice(0, 8)}`,
            id2: `demo-ord-${randomUUID().slice(0, 8)}`,
            c1: customers[0].id,
            c2: customers[1].id,
            d1: day(-5),
            d2: day(-2),
            tags: JSON.stringify([DEMO_TAG]),
            notes: `Demo order (${DEMO_TAG})`,
            iso,
          },
        }
      )
    );

    await trySeed('accounting', () =>
      insertDemoAccountingForClients(
        sequelize,
        [customers[0].id, customers[1].id, customers[2].id],
        iso,
        day
      )
    );

    const mspClient = await Client.findByPk(mspClientId, {
      attributes: ['id', 'servicePlanData'],
    });
    const posModuleOn = isRrspModuleEnabled(mspClient?.servicePlanData, 'pos');
    if (posModuleOn) {
      await trySeed('pos', () => seedRrspPosDemoData());
    }
  });

  await seedRrspPartsDemoData(mspClientId);
}

type DemoDayFn = (offset: number) => string;

async function insertDemoAccountingForClients(
  sequelize: { query: (sql: string, options?: object) => Promise<unknown> },
  clientIds: [string, string, string],
  iso: string,
  day: DemoDayFn
): Promise<void> {
  const [c1, c2, c3] = clientIds;

  const invoiceRows = (await sequelize.query(
    `SELECT invoice_number FROM invoices WHERE invoice_number LIKE 'D-INV-%'`,
    { type: QueryTypes.SELECT }
  )) as Array<{ invoice_number: string }>;
  const haveInv = new Set(invoiceRows.map((r) => r.invoice_number));

  const quoteRows = (await sequelize.query(
    `SELECT quote_number FROM quotes WHERE quote_number LIKE 'D-QTE-%'`,
    { type: QueryTypes.SELECT }
  )) as Array<{ quote_number: string }>;
  const haveQte = new Set(quoteRows.map((r) => r.quote_number));

  const insertInvoice = async (
    number: string,
    clientId: string,
    amount: number,
    paidAmount: number,
    status: string,
    due: string,
    paidDate: string | null,
    desc: string,
    items: unknown[]
  ) => {
    if (haveInv.has(number)) return;
    try {
      await sequelize.query(
        `
        INSERT INTO invoices (
          id, client_id, created_by, invoice_number, amount, paidAmount, currency, status,
          due_date, paid_date, billing_cycle, payment_gateway, description, items, created_at, updated_at
        ) VALUES (
          :id, :clientId, 0, :number, :amount, :paidAmount, 'TTD', :status,
          :due, :paidDate, 'one-time', 'CASH', :desc, :items, :iso, :iso
        )
        `,
        {
          replacements: {
            id: `demo-inv-${randomUUID().slice(0, 8)}`,
            clientId,
            number,
            amount,
            paidAmount,
            status,
            due,
            paidDate,
            desc,
            items: JSON.stringify(items),
            iso,
          },
        }
      );
      haveInv.add(number);
    } catch (err) {
      console.warn(`[RRSP DEMO] invoice ${number} skipped:`, err instanceof Error ? err.message : err);
    }
  };

  const insertQuote = async (
    number: string,
    clientId: string,
    title: string,
    amount: number,
    status: string,
    valid: string,
    accepted: string | null,
    items: unknown[]
  ) => {
    if (haveQte.has(number)) return;
    try {
      await sequelize.query(
        `
        INSERT INTO quotes (
          id, client_id, created_by, quote_number, title, description, amount, currency,
          status, valid_until, accepted_date, items, notes, created_at, updated_at
        ) VALUES (
          :id, :clientId, '0', :number, :title, :desc, :amount, 'TTD', :status,
          :valid, :accepted, :items, :notes, :iso, :iso
        )
        `,
        {
          replacements: {
            id: `demo-qte-${randomUUID().slice(0, 8)}`,
            clientId,
            number,
            title,
            desc: `Demo quote (${DEMO_TAG})`,
            amount,
            status,
            valid,
            accepted,
            items: JSON.stringify(items),
            notes: `Demo quote (${DEMO_TAG})`,
            iso,
          },
        }
      );
      haveQte.add(number);
    } catch (err) {
      console.warn(`[RRSP DEMO] quote ${number} skipped:`, err instanceof Error ? err.message : err);
    }
  };

  await insertInvoice(
    'D-INV-1001',
    c1,
    450,
    0,
    'pending',
    day(14),
    null,
    `Demo invoice — screen repair (${DEMO_TAG})`,
    [
      { description: 'Diagnostic labour', quantity: 1, unitPrice: 150, total: 150 },
      { description: 'Parts & repair', quantity: 1, unitPrice: 300, total: 300 },
    ]
  );
  await insertInvoice(
    'D-INV-1002',
    c2,
    275,
    275,
    'paid',
    day(-7),
    day(-5),
    `Demo invoice — paid POS sale (${DEMO_TAG})`,
    [
      { description: 'Accessory bundle', quantity: 1, unitPrice: 175, total: 175 },
      { description: 'Labour', quantity: 1, unitPrice: 100, total: 100 },
    ]
  );
  await insertInvoice(
    'D-INV-1003',
    c3,
    890,
    200,
    'partial',
    day(7),
    null,
    `Demo invoice — deposit on network job (${DEMO_TAG})`,
    [
      { description: 'Wi‑Fi survey', quantity: 1, unitPrice: 250, total: 250 },
      { description: 'Access point install', quantity: 2, unitPrice: 320, total: 640 },
    ]
  );
  await insertInvoice(
    'D-INV-1004',
    c1,
    320,
    0,
    'overdue',
    day(-10),
    null,
    `Demo invoice — overdue bench work (${DEMO_TAG})`,
    [
      { description: 'Bench time — data recovery', quantity: 3, unitPrice: 80, total: 240 },
      { description: 'USB recovery kit', quantity: 1, unitPrice: 80, total: 80 },
    ]
  );

  await insertQuote(
    'D-QTE-1001',
    c2,
    'Demo network upgrade quote',
    1200,
    'sent',
    day(21),
    null,
    [
      { description: 'Access point install', quantity: 2, unitPrice: 400, total: 800 },
      { description: 'Cabling & labour', quantity: 1, unitPrice: 400, total: 400 },
    ]
  );
  await insertQuote(
    'D-QTE-1002',
    c1,
    'Demo laptop refresh package',
    2850,
    'draft',
    day(30),
    null,
    [
      { description: 'Business laptop', quantity: 2, unitPrice: 1200, total: 2400 },
      { description: 'Setup & migration', quantity: 1, unitPrice: 450, total: 450 },
    ]
  );
  await insertQuote(
    'D-QTE-1003',
    c3,
    'Demo POS printer replacement',
    680,
    'accepted',
    day(18),
    day(-2),
    [
      { description: 'Receipt printer', quantity: 1, unitPrice: 420, total: 420 },
      { description: 'Install & test', quantity: 1, unitPrice: 260, total: 260 },
    ]
  );
  await insertQuote(
    'D-QTE-1004',
    c2,
    'Demo managed support — 12 months',
    5400,
    'sent',
    day(45),
    null,
    [{ description: 'Monthly managed support', quantity: 12, unitPrice: 450, total: 5400 }]
  );
}

/** Idempotent demo invoices/quotes for shop walkthroughs. */
export async function ensureShopDemoAccounting(mspClientId: string): Promise<void> {
  await runWithRrspDb(mspClientId, async () => {
    const db = await ensureRrspDatabase(mspClientId);
    const sequelize = db.sequelize;
    const now = new Date();
    const iso = now.toISOString();
    const day: DemoDayFn = (offset) => new Date(now.getTime() + offset * 86400000).toISOString();

    let demoClients = (await sequelize.query(
      `SELECT id FROM clients WHERE COALESCE(notes, '') LIKE :tag ORDER BY created_at ASC LIMIT 3`,
      { type: QueryTypes.SELECT, replacements: { tag: `%${DEMO_TAG}%` } }
    )) as Array<{ id: string }>;

    if (demoClients.length < 3) {
      demoClients = (await sequelize.query(
        `SELECT id FROM clients WHERE is_active = 1 ORDER BY created_at ASC LIMIT 3`,
        { type: QueryTypes.SELECT }
      )) as Array<{ id: string }>;
    }

    if (demoClients.length < 3) return;

    await insertDemoAccountingForClients(
      sequelize,
      [demoClients[0].id, demoClients[1].id, demoClients[2].id],
      iso,
      day
    );
  });
}

async function cleanupDemoPartsFromMsp(mspClientId: string): Promise<void> {
  try {
    const { ensurePartsCatalogSchema } = await import('@/lib/parts-catalog');
    await ensurePartsCatalogSchema();
    const sequelize = getSequelize();
    const tagLike = `%${DEMO_TAG}%`;

    await sequelize.query(
      `DELETE FROM parts_requests
       WHERE COALESCE(notes, '') LIKE :tagLike
         AND (supplierClientId = :clientId OR buyerClientId = :clientId)`,
      { replacements: { clientId: mspClientId, tagLike } }
    );
    await sequelize.query(
      `DELETE FROM parts_inventory
       WHERE clientId = :clientId AND COALESCE(notes, '') LIKE :tagLike`,
      { replacements: { clientId: mspClientId, tagLike } }
    );
  } catch (err) {
    console.warn('[RRSP DEMO] parts cleanup skipped:', err instanceof Error ? err.message : err);
  }
}

async function seedRrspPartsDemoData(
  mspClientId: string,
  options?: { onlyIfMissing?: boolean }
): Promise<void> {
  const { ensurePartsCatalogSchema, getOrCreatePlatformPartsClient } = await import(
    '@/lib/parts-catalog'
  );
  await ensurePartsCatalogSchema();

  const sequelize = getSequelize();
  const tag = DEMO_TAG;
  const existingRows = await sequelize.query<{ count: number }>(
    `
    SELECT COUNT(*) AS count FROM parts_inventory
    WHERE clientId = :clientId AND COALESCE(notes, '') LIKE :tagLike
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { clientId: mspClientId, tagLike: `%${tag}%` },
    }
  );
  const existingCount = Number(existingRows[0]?.count ?? 0);
  if (options?.onlyIfMissing && existingCount > 0) return;
  if (!options?.onlyIfMissing && existingCount > 0) return;

  const shop = await Client.findByPk(mspClientId, {
    attributes: ['id', 'userId', 'companyName', 'name'],
  });
  if (!shop) return;

  const ownerUserId = Number(shop.userId ?? 0);
  const buyerDisplayName = String(shop.companyName || shop.name || 'RRMS Repair Demo Shop');
  const now = new Date().toISOString();
  const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString();

  const insertListing = async (input: {
    clientId: string;
    itemName: string;
    partNumber: string;
    brand: string;
    unitPrice: number;
    quantity: number;
    availableQuantity: number;
    notes: string;
    createdBy?: number;
  }): Promise<string> => {
    const id = `demo-part-${randomUUID().slice(0, 8)}`;
    const normalizedName = input.itemName.toLowerCase().replace(/\s+/g, ' ').trim();
    await sequelize.query(
      `
      INSERT INTO parts_inventory (
        id, clientId, itemName, normalizedName, partNumber, brand, notes,
        unitPrice, quantity, availableQuantity, createdBy, isActive, createdAt, updatedAt
      ) VALUES (
        :id, :clientId, :itemName, :normalizedName, :partNumber, :brand, :notes,
        :unitPrice, :quantity, :availableQuantity, :createdBy, 1, :now, :now
      )
      `,
      {
        replacements: {
          id,
          clientId: input.clientId,
          itemName: input.itemName,
          normalizedName,
          partNumber: input.partNumber,
          brand: input.brand,
          notes: `${input.notes} (${tag})`,
          unitPrice: input.unitPrice,
          quantity: input.quantity,
          availableQuantity: input.availableQuantity,
          createdBy: input.createdBy ?? 0,
          now,
        },
      }
    );
    return id;
  };

  const myStockIds = await Promise.all([
    insertListing({
      clientId: mspClientId,
      itemName: 'Demo Laptop Battery',
      partNumber: 'DEMO-BAT-001',
      brand: 'DemoPower',
      unitPrice: 8500,
      quantity: 8,
      availableQuantity: 5,
      notes: 'My Stock — marketplace listing',
      createdBy: ownerUserId,
    }),
    insertListing({
      clientId: mspClientId,
      itemName: 'Demo Phone Screen Assembly',
      partNumber: 'DEMO-SCR-014',
      brand: 'DemoGlass',
      unitPrice: 12000,
      quantity: 6,
      availableQuantity: 4,
      notes: 'Bench stock listed for other shops',
      createdBy: ownerUserId,
    }),
    insertListing({
      clientId: mspClientId,
      itemName: 'Demo NVMe SSD 1TB',
      partNumber: 'DEMO-SSD-1TB',
      brand: 'DemoDrive',
      unitPrice: 6500,
      quantity: 10,
      availableQuantity: 7,
      notes: 'Surplus parts for marketplace',
      createdBy: ownerUserId,
    }),
  ]);

  const platform = await getOrCreatePlatformPartsClient();
  const platformListingId = await insertListing({
    clientId: platform.id,
    itemName: 'Demo Universal Charger 65W',
    partNumber: 'DEMO-CHG-065',
    brand: 'DemoCharge',
    unitPrice: 4500,
    quantity: 15,
    availableQuantity: 12,
    notes: 'Network supplier stock for marketplace browse',
    createdBy: 0,
  });
  const platformRamId = await insertListing({
    clientId: platform.id,
    itemName: 'Demo DDR4 8GB RAM',
    partNumber: 'DEMO-RAM-8G',
    brand: 'DemoMem',
    unitPrice: 3200,
    quantity: 20,
    availableQuantity: 14,
    notes: 'Network supplier stock for marketplace browse',
    createdBy: 0,
  });

  const insertRequest = async (input: {
    requestNumber: string;
    inventoryId: string;
    supplierClientId: string;
    buyerClientId: string | null;
    buyerDisplayName: string;
    requesterUserId: number;
    itemName: string;
    normalizedName: string;
    quantity: number;
    unitPrice: number;
    listedUnitPrice: number;
    status: string;
    notes: string;
    createdAt: string;
    completedAt?: string | null;
  }) => {
    const id = `demo-req-${randomUUID().slice(0, 8)}`;
    const groupId = randomUUID();
    await sequelize.query(
      `
      INSERT INTO parts_requests (
        id, requestNumber, requestGroupId, inventoryId, supplierClientId, buyerClientId,
        buyerDisplayName, requesterUserId, requesterRole, itemName, normalizedName,
        requestedQuantity, unitPrice, listedUnitPrice, status, notes, createdAt, updatedAt,
        completedAt
      ) VALUES (
        :id, :requestNumber, :requestGroupId, :inventoryId, :supplierClientId, :buyerClientId,
        :buyerDisplayName, :requesterUserId, 'client', :itemName, :normalizedName,
        :requestedQuantity, :unitPrice, :listedUnitPrice, :status, :notes, :createdAt, :createdAt,
        :completedAt
      )
      `,
      {
        replacements: {
          id,
          requestNumber: input.requestNumber,
          requestGroupId: groupId,
          inventoryId: input.inventoryId,
          supplierClientId: input.supplierClientId,
          buyerClientId: input.buyerClientId,
          buyerDisplayName: input.buyerDisplayName,
          requesterUserId: input.requesterUserId,
          itemName: input.itemName,
          normalizedName: input.normalizedName,
          requestedQuantity: input.quantity,
          unitPrice: input.unitPrice,
          listedUnitPrice: input.listedUnitPrice,
          status: input.status,
          notes: `${input.notes} (${tag})`,
          createdAt: input.createdAt,
          completedAt: input.completedAt ?? null,
        },
      }
    );
  };

  // Incoming — another shop wants to buy from this demo shop
  await insertRequest({
    requestNumber: 'D-PRT-2001',
    inventoryId: myStockIds[0],
    supplierClientId: mspClientId,
    buyerClientId: platform.id,
    buyerDisplayName: 'Coral Retail Ltd (demo buyer)',
    requesterUserId: ownerUserId,
    itemName: 'Demo Laptop Battery',
    normalizedName: 'demo laptop battery',
    quantity: 1,
    unitPrice: 8500,
    listedUnitPrice: 9775,
    status: 'pending',
    notes: 'Incoming order to fulfill',
    createdAt: day(-1),
  });

  // Outgoing — demo shop requested parts from the network
  await insertRequest({
    requestNumber: 'D-PRT-2002',
    inventoryId: platformListingId,
    supplierClientId: platform.id,
    buyerClientId: mspClientId,
    buyerDisplayName: buyerDisplayName,
    requesterUserId: ownerUserId,
    itemName: 'Demo Universal Charger 65W',
    normalizedName: 'demo universal charger 65w',
    quantity: 2,
    unitPrice: 4500,
    listedUnitPrice: 5175,
    status: 'pending_delivery',
    notes: 'Outgoing buy request — awaiting delivery',
    createdAt: day(-2),
  });

  // History — completed trade
  await insertRequest({
    requestNumber: 'D-PRT-2003',
    inventoryId: platformRamId,
    supplierClientId: platform.id,
    buyerClientId: mspClientId,
    buyerDisplayName: buyerDisplayName,
    requesterUserId: ownerUserId,
    itemName: 'Demo DDR4 8GB RAM',
    normalizedName: 'demo ddr4 8gb ram',
    quantity: 1,
    unitPrice: 3200,
    listedUnitPrice: 3680,
    status: 'fulfilled',
    notes: 'Completed marketplace request',
    createdAt: day(-12),
    completedAt: day(-10),
  });
}

/**
 * Enable shop demo for one RRSP client.
 * Snapshots that shop's RRSP DB only — never touches the Computer Dynamics MSP demo sandbox.
 */
export async function enableRrspShopDemo(mspClientId: string): Promise<void> {
  if (await isRrspShopDemoActive(mspClientId)) {
    await seedRrspPartsDemoData(mspClientId, { onlyIfMissing: true });
    await ensureShopDemoAccounting(mspClientId);
    return;
  }

  const { dbPath, demoDir, snapshotPath, activeMarkerPath } = await shopDemoPaths(mspClientId);
  fs.mkdirSync(demoDir, { recursive: true });

  await ensureRrspDatabase(mspClientId);
  await clearRrspDatabaseCache(mspClientId);

  if (!fs.existsSync(dbPath)) {
    await ensureRrspDatabase(mspClientId);
    await clearRrspDatabaseCache(mspClientId);
  }

  await copyMainDb(dbPath, snapshotPath);
  fs.writeFileSync(
    activeMarkerPath,
    JSON.stringify({
      mspClientId,
      enabledAt: new Date().toISOString(),
      note: 'Shop-only demo sandbox. Independent of Computer Dynamics demo_mode.',
    }),
    'utf8'
  );

  await setServicePlanDemoFlag(mspClientId, true);
  await ensureRrspDatabase(mspClientId);
  await seedShopDemoData(mspClientId);
}

/** Restore the shop RRSP DB from snapshot and discard demo changes. */
export async function disableRrspShopDemo(mspClientId: string): Promise<void> {
  if (!(await isRrspShopDemoActive(mspClientId))) {
    await setServicePlanDemoFlag(mspClientId, false);
    return;
  }

  const { dbPath, snapshotPath, activeMarkerPath } = await shopDemoPaths(mspClientId);
  await clearRrspDatabaseCache(mspClientId);

  await cleanupDemoPartsFromMsp(mspClientId);

  if (fs.existsSync(snapshotPath)) {
    await copyMainDb(snapshotPath, dbPath);
  }

  await removeOrQuarantine(activeMarkerPath);
  await removeDbFiles(snapshotPath);
  await setServicePlanDemoFlag(mspClientId, false);
  await ensureRrspDatabase(mspClientId);
}

export async function setRrspShopDemoMode(mspClientId: string, enabled: boolean): Promise<boolean> {
  if (enabled) await enableRrspShopDemo(mspClientId);
  else await disableRrspShopDemo(mspClientId);
  return isRrspShopDemoActive(mspClientId);
}
