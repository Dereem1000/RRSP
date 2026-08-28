import fs from 'fs';
import path from 'path';
import { AsyncLocalStorage } from 'async_hooks';
import {
  DataTypes,
  Model,
  Sequelize,
  type ModelStatic,
} from 'sequelize';
import sqlite3 from 'sqlite3';
import {
  Client as CdClient,
  Ticket as CdTicket,
  TicketComment as CdTicketComment,
  SalesOpportunity as CdSalesOpportunity,
  getMonorepoRoot,
  getSequelize,
} from '@cd-v2/database';
import { sanitizeRrspClientFolderName } from '@/lib/rrsp';

export type RrspDbContext = { mspClientId: string };

const rrspStore = new AsyncLocalStorage<RrspDbContext>();

type CachedDb = {
  sequelize: Sequelize;
  Ticket: ModelStatic<Model>;
  TicketComment: ModelStatic<Model>;
  Client: ModelStatic<Model>;
  SalesOpportunity: ModelStatic<Model>;
  bootstrapped: boolean;
};

const cache = new Map<string, CachedDb>();

export function getRrspContext(): RrspDbContext | undefined {
  return rrspStore.getStore();
}

export function isRrspDbActive(): boolean {
  return Boolean(rrspStore.getStore());
}

export function getRrspRootDir(): string {
  return path.join(getMonorepoRoot(), 'data', 'rrsp');
}

export async function resolveRrspFolderName(mspClientId: string): Promise<string> {
  const client = await CdClient.findByPk(mspClientId, {
    attributes: ['id', 'name', 'companyName'],
  });
  const label = client?.companyName || client?.name || 'client';
  return sanitizeRrspClientFolderName(label, mspClientId);
}

export async function getRrspDatabasePath(mspClientId: string): Promise<string> {
  const folder = await resolveRrspFolderName(mspClientId);
  return path.join(getRrspRootDir(), folder, 'rrsp.db');
}

function defineRrspModels(sequelize: Sequelize): Omit<CachedDb, 'sequelize' | 'bootstrapped'> {
  const Client = sequelize.define(
    'Client',
    {
      id: { type: DataTypes.TEXT, primaryKey: true },
      name: { type: DataTypes.TEXT, allowNull: false },
      companyName: { type: DataTypes.TEXT, allowNull: true, field: 'company_name' },
      email: { type: DataTypes.TEXT, allowNull: false },
      phone: { type: DataTypes.TEXT, allowNull: true },
      address: { type: DataTypes.TEXT, allowNull: true },
      contactPerson: { type: DataTypes.TEXT, allowNull: true, field: 'contact_person' },
      billingInfo: { type: DataTypes.JSON, allowNull: true, defaultValue: {}, field: 'billing_info' },
      contractDetails: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {},
        field: 'contract_details',
      },
      serviceLevel: { type: DataTypes.TEXT, allowNull: true, field: 'service_level' },
      supportTier: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: 'silver',
        field: 'support_tier',
      },
      status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'active' },
      startDate: { type: DataTypes.TEXT, allowNull: true, field: 'start_date' },
      endDate: { type: DataTypes.TEXT, allowNull: true, field: 'end_date' },
      monthlyRate: { type: DataTypes.REAL, allowNull: true, defaultValue: 0, field: 'monthly_rate' },
      notes: { type: DataTypes.TEXT, allowNull: true },
      communicationHistory: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: [],
        field: 'communication_history',
      },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'is_active' },
      usageTracking: { type: DataTypes.JSON, allowNull: true, field: 'usage_tracking' },
      features: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
      servicePlanData: { type: DataTypes.JSON, allowNull: true, defaultValue: {}, field: 'service_plan_data' },
      assignedTechnicianId: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'assigned_technician_id',
      },
      priorityLevel: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: 'medium',
        field: 'priority_level',
      },
      contractStartDate: { type: DataTypes.TEXT, allowNull: true, field: 'contract_start_date' },
      contractEndDate: { type: DataTypes.TEXT, allowNull: true, field: 'contract_end_date' },
      renewalDate: { type: DataTypes.TEXT, allowNull: true, field: 'renewal_date' },
      slaAgreement: { type: DataTypes.JSON, allowNull: true, field: 'sla_agreement' },
      userId: { type: DataTypes.INTEGER, allowNull: true, field: 'userId' },
    },
    { tableName: 'clients', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at', underscored: false }
  );

  const Ticket = sequelize.define(
    'Ticket',
    {
      id: { type: DataTypes.TEXT, primaryKey: true },
      ticketNumber: { type: DataTypes.TEXT, allowNull: false, unique: true, field: 'ticketNumber' },
      clientName: { type: DataTypes.TEXT, allowNull: false, field: 'clientName' },
      clientContactNumber: { type: DataTypes.TEXT, allowNull: true, field: 'clientContactNumber' },
      issue: { type: DataTypes.TEXT, allowNull: false },
      location: { type: DataTypes.TEXT, allowNull: false },
      deviceType: { type: DataTypes.TEXT, allowNull: false, field: 'deviceType' },
      deviceModel: { type: DataTypes.TEXT, allowNull: true, field: 'deviceModel' },
      serialNumber: { type: DataTypes.TEXT, allowNull: true, field: 'serialNumber' },
      status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'New' },
      technician: { type: DataTypes.TEXT, allowNull: false },
      notes: { type: DataTypes.TEXT, allowNull: true },
      priority: { type: DataTypes.TEXT, allowNull: true, defaultValue: 'medium' },
      category: { type: DataTypes.TEXT, allowNull: true, defaultValue: 'general' },
      dueDate: { type: DataTypes.TEXT, allowNull: true, field: 'dueDate' },
      dateCreated: { type: DataTypes.TEXT, allowNull: false, field: 'dateCreated' },
      lastUpdated: { type: DataTypes.TEXT, allowNull: false, field: 'lastUpdated' },
      subscription: { type: DataTypes.TEXT, allowNull: true },
      isActive: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, field: 'isActive' },
      clientId: { type: DataTypes.TEXT, allowNull: true, field: 'clientId' },
      createdBy: { type: DataTypes.INTEGER, allowNull: true, field: 'createdBy' },
      assignedTo: { type: DataTypes.INTEGER, allowNull: true, field: 'assignedTo' },
      hasUnreadClientComments: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'hasUnreadClientComments',
      },
      lastClientCommentAt: { type: DataTypes.DATE, allowNull: true, field: 'lastClientCommentAt' },
      attachments: { type: DataTypes.JSON, allowNull: false, defaultValue: [], field: 'attachments' },
      tags: { type: DataTypes.JSON, allowNull: false, defaultValue: [], field: 'tags' },
      title: { type: DataTypes.TEXT, allowNull: true },
      resolutionNotes: { type: DataTypes.TEXT, allowNull: true, field: 'resolution_notes' },
      estimatedHours: { type: DataTypes.DECIMAL(5, 2), allowNull: true, field: 'estimated_hours' },
      actualHours: { type: DataTypes.DECIMAL(5, 2), allowNull: true, field: 'actual_hours' },
      estimatedCost: { type: DataTypes.DECIMAL(10, 2), allowNull: true, field: 'estimated_cost' },
      actualCost: { type: DataTypes.DECIMAL(10, 2), allowNull: true, field: 'actual_cost' },
    },
    { tableName: 'tickets', timestamps: false, underscored: false }
  );

  const TicketComment = sequelize.define(
    'TicketComment',
    {
      id: { type: DataTypes.TEXT, primaryKey: true },
      ticketId: { type: DataTypes.TEXT, allowNull: false, field: 'ticketId' },
      comment: { type: DataTypes.TEXT, allowNull: false },
      commentType: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: 'update',
        field: 'commentType',
      },
      authorId: { type: DataTypes.TEXT, allowNull: false, field: 'authorId' },
      authorName: { type: DataTypes.TEXT, allowNull: false, field: 'authorName' },
      timestamp: { type: DataTypes.TEXT, allowNull: false },
      isInternal: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'isInternal' },
      isActive: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, field: 'isActive' },
      linkedOrderId: { type: DataTypes.TEXT, allowNull: true, field: 'linkedOrderId' },
    },
    { tableName: 'ticket_comments', timestamps: false, underscored: false }
  );

  const SalesOpportunity = sequelize.define(
    'SalesOpportunity',
    {
      id: { type: DataTypes.TEXT, primaryKey: true },
      companyName: { type: DataTypes.TEXT, allowNull: false, field: 'company_name' },
      contactName: { type: DataTypes.TEXT, allowNull: false, field: 'contact_name' },
      email: { type: DataTypes.TEXT, allowNull: true },
      phone: { type: DataTypes.TEXT, allowNull: true },
      address: { type: DataTypes.TEXT, allowNull: true },
      product: { type: DataTypes.TEXT, allowNull: false },
      stage: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'cold_prospect' },
      dealType: { type: DataTypes.TEXT, allowNull: true, field: 'deal_type' },
      monthlyRate: { type: DataTypes.REAL, allowNull: true, field: 'monthly_rate' },
      projectValue: { type: DataTypes.REAL, allowNull: true, field: 'project_value' },
      depositAmount: { type: DataTypes.REAL, allowNull: true, field: 'deposit_amount' },
      scopeNotes: { type: DataTypes.TEXT, allowNull: true, field: 'scope_notes' },
      pitchNotes: { type: DataTypes.TEXT, allowNull: true, field: 'pitch_notes' },
      demoNotes: { type: DataTypes.TEXT, allowNull: true, field: 'demo_notes' },
      contactChannel: { type: DataTypes.TEXT, allowNull: true, field: 'contact_channel' },
      contactMadeAt: { type: DataTypes.TEXT, allowNull: true, field: 'contact_made_at' },
      demoCompletedAt: { type: DataTypes.TEXT, allowNull: true, field: 'demo_completed_at' },
      quoteId: { type: DataTypes.TEXT, allowNull: true, field: 'quote_id' },
      clientId: { type: DataTypes.TEXT, allowNull: true, field: 'client_id' },
      lostReason: { type: DataTypes.TEXT, allowNull: true, field: 'lost_reason' },
      communications: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
      createdBy: { type: DataTypes.INTEGER, allowNull: true, field: 'created_by' },
      assignedTo: { type: DataTypes.INTEGER, allowNull: true, field: 'assigned_to' },
      wonAt: { type: DataTypes.TEXT, allowNull: true, field: 'won_at' },
      lostAt: { type: DataTypes.TEXT, allowNull: true, field: 'lost_at' },
    },
    {
      tableName: 'sales_opportunities',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: false,
    }
  );

  Client.hasMany(Ticket, { foreignKey: 'clientId' });
  Ticket.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });
  Ticket.hasMany(TicketComment, { foreignKey: 'ticketId' });
  TicketComment.belongsTo(Ticket, { foreignKey: 'ticketId' });
  SalesOpportunity.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });

  return { Ticket, TicketComment, Client, SalesOpportunity };
}

async function bootstrapRrspSchema(sequelize: Sequelize): Promise<void> {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      company_name TEXT,
      email TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      contact_person TEXT,
      billing_info TEXT,
      contract_details TEXT,
      service_level TEXT,
      support_tier TEXT NOT NULL DEFAULT 'silver',
      status TEXT NOT NULL DEFAULT 'active',
      start_date TEXT,
      end_date TEXT,
      monthly_rate REAL DEFAULT 0.00,
      notes TEXT,
      communication_history TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      usage_tracking TEXT,
      service_plan_data TEXT,
      assigned_technician_id TEXT,
      priority_level TEXT DEFAULT 'medium',
      contract_start_date TEXT,
      contract_end_date TEXT,
      renewal_date TEXT,
      sla_agreement TEXT,
      created_at TEXT,
      updated_at TEXT,
      userId INTEGER,
      features TEXT DEFAULT '[]'
    )
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      ticketNumber TEXT NOT NULL UNIQUE,
      clientName TEXT NOT NULL,
      clientContactNumber TEXT,
      issue TEXT NOT NULL,
      location TEXT NOT NULL,
      deviceType TEXT NOT NULL,
      deviceModel TEXT,
      serialNumber TEXT,
      status TEXT NOT NULL DEFAULT 'New',
      technician TEXT NOT NULL,
      notes TEXT,
      priority TEXT DEFAULT 'medium',
      category TEXT DEFAULT 'general',
      dueDate TEXT,
      dateCreated TEXT NOT NULL,
      lastUpdated TEXT NOT NULL,
      subscription TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      clientId TEXT,
      createdBy INTEGER,
      assignedTo INTEGER,
      hasUnreadClientComments INTEGER NOT NULL DEFAULT 0,
      lastClientCommentAt DATETIME,
      attachments JSON NOT NULL DEFAULT '[]',
      tags JSON NOT NULL DEFAULT '[]',
      resolution_notes TEXT,
      estimated_hours DECIMAL(5,2),
      actual_hours DECIMAL(5,2),
      estimated_cost DECIMAL(10,2),
      actual_cost DECIMAL(10,2),
      title TEXT
    )
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS ticket_comments (
      id TEXT PRIMARY KEY,
      ticketId TEXT NOT NULL,
      comment TEXT NOT NULL,
      commentType TEXT NOT NULL DEFAULT 'update',
      authorId TEXT NOT NULL,
      authorName TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      isInternal INTEGER NOT NULL DEFAULT 0,
      isActive INTEGER NOT NULL DEFAULT 1,
      linkedOrderId TEXT
    )
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      orderNumber VARCHAR(50) NOT NULL UNIQUE,
      clientId TEXT NOT NULL,
      title VARCHAR(200) NOT NULL,
      description TEXT,
      itemName VARCHAR(200) NOT NULL,
      itemUrl TEXT,
      vendor VARCHAR(100),
      vendorOrderNumber VARCHAR(100),
      trackingNumber VARCHAR(100),
      orderDate DATETIME NOT NULL,
      estimatedArrival DATETIME,
      actualArrival DATETIME,
      costPrice DECIMAL(10,2) NOT NULL DEFAULT 0,
      clientPrice DECIMAL(10,2) NOT NULL DEFAULT 0,
      quantity INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'ordered',
      isLoggedInPreAlerts INTEGER NOT NULL DEFAULT 0,
      preAlertNotes TEXT,
      assignedTechnicianId INTEGER,
      createdBy INTEGER NOT NULL,
      tags TEXT DEFAULT '[]',
      notes TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt DATETIME NOT NULL,
      updatedAt DATETIME NOT NULL,
      currentLocation VARCHAR(200),
      locationHistory TEXT DEFAULT '[]',
      lastLocationUpdate DATETIME,
      shippingStage VARCHAR(50) DEFAULT 'ordered',
      current_location VARCHAR(255),
      location_history TEXT,
      last_location_update DATETIME,
      shipping_stage TEXT NOT NULL DEFAULT 'ordered',
      is_logged_in_pre_alerts INTEGER NOT NULL DEFAULT 0,
      pre_alert_notes TEXT,
      serialNumber TEXT
    )
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS order_links (
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

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS sales_opportunities (
      id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      address TEXT,
      product TEXT NOT NULL,
      stage TEXT NOT NULL DEFAULT 'cold_prospect',
      deal_type TEXT,
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

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      invoice_number VARCHAR(255) NOT NULL UNIQUE,
      amount DECIMAL(10,2) NOT NULL,
      paidAmount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      currency VARCHAR(255) NOT NULL DEFAULT 'TTD',
      status TEXT NOT NULL DEFAULT 'pending',
      due_date DATETIME NOT NULL,
      paid_date DATETIME NULL,
      billing_cycle TEXT NOT NULL DEFAULT 'monthly',
      payment_gateway TEXT NOT NULL DEFAULT 'CASH',
      description TEXT NULL,
      items TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS quotes (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      quote_number VARCHAR(255) NOT NULL UNIQUE,
      title VARCHAR(200) NOT NULL,
      description TEXT,
      amount DECIMAL(10,2) NOT NULL,
      currency VARCHAR(255) NOT NULL DEFAULT 'TTD',
      status TEXT NOT NULL DEFAULT 'draft',
      valid_until DATETIME NOT NULL,
      accepted_date DATETIME,
      converted_to_invoice_id TEXT,
      items TEXT,
      terms TEXT,
      notes TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'CASH',
      payment_date DATETIME NOT NULL,
      processed_by TEXT NOT NULL,
      reference VARCHAR(255),
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'completed',
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    )
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS invoice_links (
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

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS pos_products (
      id TEXT PRIMARY KEY,
      sku TEXT,
      name TEXT NOT NULL,
      description TEXT,
      unitPrice REAL NOT NULL DEFAULT 0,
      costPrice REAL NOT NULL DEFAULT 0,
      quantity INTEGER NOT NULL DEFAULT 0,
      availableQuantity INTEGER NOT NULL DEFAULT 0,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdBy INTEGER,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_pos_products_active_qty
    ON pos_products (isActive, availableQuantity)
  `);
}

export async function getRrspSequelize(mspClientId: string): Promise<Sequelize> {
  const cached = await ensureRrspDatabase(mspClientId);
  return cached.sequelize;
}

export async function getRrspModels(mspClientId: string): Promise<CachedDb> {
  return ensureRrspDatabase(mspClientId);
}

export async function ensureRrspDatabase(mspClientId: string): Promise<CachedDb> {
  const existing = cache.get(mspClientId);
  if (existing?.bootstrapped) return existing;

  const dbPath = await getRrspDatabasePath(mspClientId);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  let entry = existing;
  if (!entry) {
    const sequelize = new Sequelize({
      dialect: 'sqlite',
      dialectModule: sqlite3,
      storage: dbPath,
      logging: process.env.DB_LOGGING === 'true' ? console.log : false,
      define: {
        timestamps: false,
        underscored: true,
        freezeTableName: true,
      },
    });
    sequelize.addHook('afterConnect', async (connection: { exec: (sql: string) => Promise<void> }) => {
      await connection.exec('PRAGMA foreign_keys = ON;');
      await connection.exec('PRAGMA journal_mode = WAL;');
      await connection.exec('PRAGMA busy_timeout = 15000;');
    });
    const models = defineRrspModels(sequelize);
    entry = { sequelize, ...models, bootstrapped: false };
    cache.set(mspClientId, entry);
  }

  await bootstrapRrspSchema(entry.sequelize);
  entry.bootstrapped = true;
  return entry;
}

export async function runWithRrspDb<T>(mspClientId: string, fn: () => Promise<T>): Promise<T> {
  await ensureRrspDatabase(mspClientId);
  return rrspStore.run({ mspClientId }, fn);
}

/** Close and drop a shop DB connection (used when switching shop demo sandbox). */
export async function clearRrspDatabaseCache(mspClientId: string): Promise<void> {
  const entry = cache.get(mspClientId);
  if (!entry) return;
  cache.delete(mspClientId);
  try {
    await entry.sequelize.close();
  } catch {
    // Connection may already be closed.
  }
}

/** CD for Parts/billing/MSP; RRSP when request is in RRSP context. */
export function getOperationalSequelize(): Sequelize {
  const ctx = rrspStore.getStore();
  if (!ctx) return getSequelize();
  const cached = cache.get(ctx.mspClientId);
  if (!cached) {
    // Never fall back to CD while RRSP context is active — that leaks MSP invoices into shop UI.
    throw new Error(
      `RRSP database is not ready for client ${ctx.mspClientId}. Shop accounting cannot use the CD database.`
    );
  }
  return cached.sequelize;
}

export function getTicketModel(): ModelStatic<Model> {
  const ctx = rrspStore.getStore();
  if (!ctx) return CdTicket as unknown as ModelStatic<Model>;
  const cached = cache.get(ctx.mspClientId);
  return (cached?.Ticket ?? CdTicket) as unknown as ModelStatic<Model>;
}

export function getTicketCommentModel(): ModelStatic<Model> {
  const ctx = rrspStore.getStore();
  if (!ctx) return CdTicketComment as unknown as ModelStatic<Model>;
  const cached = cache.get(ctx.mspClientId);
  return (cached?.TicketComment ?? CdTicketComment) as unknown as ModelStatic<Model>;
}

/** Shop customers in RRSP context; MSP clients otherwise. */
export function getShopClientModel(): ModelStatic<Model> {
  const ctx = rrspStore.getStore();
  if (!ctx) return CdClient as unknown as ModelStatic<Model>;
  const cached = cache.get(ctx.mspClientId);
  return (cached?.Client ?? CdClient) as unknown as ModelStatic<Model>;
}

export function getSalesOpportunityModel(): ModelStatic<Model> {
  const ctx = rrspStore.getStore();
  if (!ctx) return CdSalesOpportunity as unknown as ModelStatic<Model>;
  const cached = cache.get(ctx.mspClientId);
  return (cached?.SalesOpportunity ?? CdSalesOpportunity) as unknown as ModelStatic<Model>;
}

export function isRrspOrdersApiPath(urlPath: string): boolean {
  const pathOnly = urlPath.split('?')[0] || '';
  return /\/msp\/orders(\/|$)/.test(pathOnly);
}

/** Paths that must keep using the CD database even for RRSP-licensed clients. */
export function isCdOnlyApiPath(urlPath: string): boolean {
  const pathOnly = urlPath.split('?')[0] || '';
  // Accounting UI reuses MSP invoice/quote routes for RRSP shops.
  if (isRrspAccountingApiPath(pathOnly)) return false;
  // Shop orders UI reuses MSP order routes for RRSP shops.
  if (isRrspOrdersApiPath(pathOnly)) return false;
  return (
    pathOnly.includes('/parts') ||
    pathOnly.includes('/billing') ||
    pathOnly.includes('/client-portal/billing') ||
    pathOnly.includes('/client-portal/license') ||
    pathOnly.includes('/license') ||
    pathOnly.includes('/msp/') ||
    pathOnly.includes('/settings') ||
    pathOnly.includes('/auth') ||
    pathOnly.includes('/dashboard') ||
    pathOnly.includes('/users') ||
    pathOnly.includes('/backup') ||
    pathOnly.includes('/mini') ||
    pathOnly.includes('/developer-toolbox') ||
    pathOnly.includes('/notices') ||
    pathOnly.includes('/security') ||
    pathOnly.includes('/emergency') ||
    pathOnly.includes('/public') ||
    pathOnly.includes('/health') ||
    pathOnly.includes('/calendar')
  );
}

export function isRrspAccountingApiPath(urlPath: string): boolean {
  const pathOnly = urlPath.split('?')[0] || '';
  return (
    pathOnly.includes('/msp/invoices') ||
    pathOnly.includes('/msp/quotes') ||
    pathOnly.includes('/msp/payments') ||
    pathOnly.includes('/msp/quote-settings') ||
    pathOnly.includes('/accounting/summary') ||
    /\/accounting(\/|$)/.test(pathOnly)
  );
}

export function isRrspModuleApiPath(urlPath: string): boolean {
  const pathOnly = urlPath.split('?')[0] || '';
  if (isRrspAccountingApiPath(pathOnly)) return true;
  if (isRrspOrdersApiPath(pathOnly)) return true;
  if (isCdOnlyApiPath(pathOnly)) return false;
  return (
    pathOnly.includes('/tickets') ||
    pathOnly.includes('/orders') ||
    pathOnly.includes('/sales') ||
    pathOnly.includes('/clients') ||
    pathOnly.includes('/accounting') ||
    pathOnly.includes('/payments') ||
    pathOnly.includes('/client-portal/orders') ||
    pathOnly.includes('/pos')
  );
}
