import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { randomUUID } from 'crypto';
import { Client } from '@cd-v2/database';
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
        technician: 'Demo Tech',
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

    await trySeed('invoices', () =>
      sequelize.query(
        `
        INSERT INTO invoices (
          id, client_id, created_by, invoice_number, amount, paidAmount, currency, status,
          due_date, billing_cycle, payment_gateway, description, items, created_at, updated_at
        ) VALUES (
          :id, :clientId, 0, 'D-INV-1001', 450.00, 0, 'TTD', 'pending',
          :due, 'one-time', 'CASH', :desc, :items, :iso, :iso
        )
        `,
        {
          replacements: {
            id: `demo-inv-${randomUUID().slice(0, 8)}`,
            clientId: customers[0].id,
            due: day(14),
            desc: `Demo invoice (${DEMO_TAG})`,
            items: JSON.stringify([
              { description: 'Diagnostic labour', quantity: 1, unitPrice: 150, total: 150 },
              { description: 'Parts & repair', quantity: 1, unitPrice: 300, total: 300 },
            ]),
            iso,
          },
        }
      )
    );

    await trySeed('quotes', () =>
      sequelize.query(
        `
        INSERT INTO quotes (
          id, client_id, created_by, quote_number, title, description, amount, currency,
          status, valid_until, items, notes, created_at, updated_at
        ) VALUES (
          :id, :clientId, '0', 'D-QTE-1001', 'Demo network upgrade quote',
          :desc, 1200.00, 'TTD', 'sent', :valid, :items, :notes, :iso, :iso
        )
        `,
        {
          replacements: {
            id: `demo-qte-${randomUUID().slice(0, 8)}`,
            clientId: customers[1].id,
            desc: `Demo quote (${DEMO_TAG})`,
            valid: day(21),
            items: JSON.stringify([
              { description: 'Access point install', quantity: 2, unitPrice: 400, total: 800 },
              { description: 'Cabling & labour', quantity: 1, unitPrice: 400, total: 400 },
            ]),
            notes: `Demo quote (${DEMO_TAG})`,
            iso,
          },
        }
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
}

/**
 * Enable shop demo for one RRSP client.
 * Snapshots that shop's RRSP DB only — never touches the Computer Dynamics MSP demo sandbox.
 */
export async function enableRrspShopDemo(mspClientId: string): Promise<void> {
  if (await isRrspShopDemoActive(mspClientId)) return;

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
