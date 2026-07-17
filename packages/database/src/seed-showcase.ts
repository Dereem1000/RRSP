/**
 * Populate a fresh showcase database with realistic demo data.
 * Run via: npm run db:seed-showcase
 */
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import type { ClientAttributes } from './models/Client';
import {
  CalendarEvent,
  Client,
  NoticeBoard,
  SalesOpportunity,
  SystemConfig,
  Ticket,
  User,
  closeConnection,
  ensureCalendarSchema,
  ensureSalesSchema,
  getDatabasePath,
  getSequelize,
  testConnection,
} from './index';

const DEMO_PASSWORD = 'Demo@2026!';

type DemoClient = {
  id: string;
  name: string;
  companyName: string;
  email: string;
  phone: string;
  address: string;
  contactPerson: string;
  serviceLevel: 'basic' | 'standard' | 'premium' | 'enterprise' | 'per-job';
  supportTier: 'bronze' | 'silver' | 'gold' | 'platinum';
  features: string[];
  monthlyRate: number;
  userId?: number;
};

function iso(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString();
}

function dateOnly(offsetDays = 0): string {
  return iso(offsetDays).slice(0, 10);
}

async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

async function seedUsers() {
  const now = iso();
  const password = await hashPassword(DEMO_PASSWORD);

  const admin = await User.create({
    username: 'demo',
    email: 'demo@showcase.computerdynamics.local',
    password,
    firstName: 'Demo',
    lastName: 'Admin',
    role: 'admin',
    securityClearance: 'S-CLS1',
    isActive: true,
    isLocked: false,
    failedLoginAttempts: 0,
    passwordSet: true,
    phone: '+1-868-555-0100',
    preferences: {},
    created_at: new Date(now),
    updated_at: new Date(now),
  });

  const tech = await User.create({
    username: 'tech',
    email: 'tech@showcase.computerdynamics.local',
    password,
    firstName: 'Alex',
    lastName: 'Technician',
    role: 'technician',
    securityClearance: 'S-CLS2',
    isActive: true,
    isLocked: false,
    failedLoginAttempts: 0,
    passwordSet: true,
    phone: '+1-868-555-0101',
    preferences: {},
    created_at: new Date(now),
    updated_at: new Date(now),
  });

  return { admin, tech, password };
}

async function seedClientUsers(clients: DemoClient[]) {
  const now = iso();
  const password = await hashPassword(DEMO_PASSWORD);

  for (const client of clients) {
    const base = client.email.split('@')[0];
    const user = await User.create({
      username: base,
      email: client.email,
      password,
      firstName: client.contactPerson.split(' ')[0] || client.name,
      lastName: client.contactPerson.split(' ').slice(1).join(' ') || 'User',
      role: 'client',
      securityClearance: 'S-CLS3',
      isActive: true,
      isLocked: false,
      failedLoginAttempts: 0,
      passwordSet: true,
      phone: client.phone,
      preferences: {},
      created_at: new Date(now),
      updated_at: new Date(now),
    });
    client.userId = user.id;
  }
}

async function mirrorClientToBackup(client: Client): Promise<void> {
  const sequelize = getSequelize();
  const row = client.toJSON() as ClientAttributes;
  await sequelize.query(
    `INSERT OR REPLACE INTO clients_backup (
      id, name, company_name, email, phone, address, contact_person, billing_info,
      contract_details, service_level, support_tier, status, start_date, end_date,
      monthly_rate, notes, communication_history, is_active, usage_tracking,
      service_plan_data, assigned_technician_id, priority_level, contract_start_date,
      contract_end_date, renewal_date, sla_agreement, created_at, updated_at, userId
    ) VALUES (
      :id, :name, :company_name, :email, :phone, :address, :contact_person, :billing_info,
      :contract_details, :service_level, :support_tier, :status, :start_date, :end_date,
      :monthly_rate, :notes, :communication_history, :is_active, :usage_tracking,
      :service_plan_data, :assigned_technician_id, :priority_level, :contract_start_date,
      :contract_end_date, :renewal_date, :sla_agreement, :created_at, :updated_at, :userId
    )`,
    {
      replacements: {
        id: row.id,
        name: row.name,
        company_name: row.companyName ?? null,
        email: row.email,
        phone: row.phone ?? null,
        address: row.address ?? null,
        contact_person: row.contactPerson ?? null,
        billing_info: JSON.stringify(row.billingInfo ?? {}),
        contract_details: JSON.stringify(row.contractDetails ?? {}),
        service_level: row.serviceLevel ?? null,
        support_tier: row.supportTier,
        status: row.status,
        start_date: row.startDate ? String(row.startDate).slice(0, 10) : null,
        end_date: row.endDate ? String(row.endDate).slice(0, 10) : null,
        monthly_rate: row.monthlyRate ?? 0,
        notes: row.notes ?? null,
        communication_history: JSON.stringify(row.communicationHistory ?? []),
        is_active: row.isActive ? 1 : 0,
        usage_tracking: row.usageTracking ? JSON.stringify(row.usageTracking) : null,
        service_plan_data: JSON.stringify(row.servicePlanData ?? {}),
        assigned_technician_id: row.assignedTechnicianId ?? null,
        priority_level: row.priorityLevel ?? 'medium',
        contract_start_date: row.contractStartDate ? String(row.contractStartDate).slice(0, 10) : null,
        contract_end_date: row.contractEndDate ? String(row.contractEndDate).slice(0, 10) : null,
        renewal_date: row.renewalDate ? String(row.renewalDate).slice(0, 10) : null,
        sla_agreement: JSON.stringify(row.slaAgreement ?? {}),
        created_at: row.created_at ?? iso(),
        updated_at: row.updated_at ?? iso(),
        userId: row.userId ?? null,
      },
    }
  );
}

async function seedClients(_adminId: number, _techId: number): Promise<DemoClient[]> {
  const now = iso();
  const clients: DemoClient[] = [
    {
      id: randomUUID(),
      name: 'Island Fresh Markets',
      companyName: 'Island Fresh Markets Ltd.',
      email: 'ops@islandfresh.demo',
      phone: '+1-868-555-0201',
      address: '12 Frederick Street, Port of Spain',
      contactPerson: 'Maria Chen',
      serviceLevel: 'premium',
      supportTier: 'gold',
      features: ['pos', 'restaurant'],
      monthlyRate: 450,
    },
    {
      id: randomUUID(),
      name: 'Caribbean Auto Works',
      companyName: 'Caribbean Auto Works',
      email: 'service@caribauto.demo',
      phone: '+1-868-555-0202',
      address: '45 Eastern Main Road, Arima',
      contactPerson: 'James Singh',
      serviceLevel: 'standard',
      supportTier: 'silver',
      features: ['auto', 'document'],
      monthlyRate: 275,
    },
    {
      id: randomUUID(),
      name: 'BlueWave Distribution',
      companyName: 'BlueWave Distribution Co.',
      email: 'logistics@bluewave.demo',
      phone: '+1-868-555-0203',
      address: '8 Industrial Estate, Chaguanas',
      contactPerson: 'Priya Ramkissoon',
      serviceLevel: 'enterprise',
      supportTier: 'platinum',
      features: ['distribution', 'ecommerce'],
      monthlyRate: 650,
    },
    {
      id: randomUUID(),
      name: 'Sunset Legal Partners',
      companyName: 'Sunset Legal Partners',
      email: 'admin@sunsetlegal.demo',
      phone: '+1-868-555-0204',
      address: '3 Queen Street, San Fernando',
      contactPerson: 'David Williams',
      serviceLevel: 'per-job',
      supportTier: 'bronze',
      features: ['document'],
      monthlyRate: 0,
    },
    {
      id: randomUUID(),
      name: 'Klassic BBQ & Grill',
      companyName: 'Klassic BBQ & Grill',
      email: 'manager@klassicbbq.demo',
      phone: '+1-868-555-0205',
      address: '101 Western Main Road, St. James',
      contactPerson: 'Andre Baptiste',
      serviceLevel: 'standard',
      supportTier: 'silver',
      features: ['pos', 'restaurant'],
      monthlyRate: 320,
    },
  ];

  await seedClientUsers(clients);

  for (const c of clients) {
    const created = await Client.create({
      id: c.id,
      name: c.name,
      companyName: c.companyName,
      email: c.email,
      phone: c.phone,
      address: c.address,
      contactPerson: c.contactPerson,
      billingInfo: { paymentTerms: 'Net 30', currency: 'TTD' },
      contractDetails: { showcase: true },
      serviceLevel: c.serviceLevel,
      supportTier: c.supportTier,
      status: 'active',
      startDate: new Date(dateOnly(-120)),
      monthlyRate: c.monthlyRate,
      notes: 'Showcase demo client — fictional business.',
      communicationHistory: [],
      isActive: true,
      usageTracking: {},
      features: c.features,
      servicePlanData: { billingCycle: 'monthly' },
      assignedTechnicianId: null,
      priorityLevel: 'medium',
      contractStartDate: new Date(dateOnly(-120)),
      contractEndDate: new Date(dateOnly(245)),
      renewalDate: new Date(dateOnly(215)),
      slaAgreement: { responseHours: 4 },
      userId: c.userId ?? null,
      created_at: new Date(now),
      updated_at: new Date(now),
    });
    await mirrorClientToBackup(created);
  }

  return clients;
}

async function seedTickets(clients: DemoClient[], techId: number, adminId: number) {
  const techName = 'Alex Technician';
  const tickets = [
    {
      client: clients[0],
      issue: 'POS terminal not printing receipts after Windows update',
      status: 'In Progress',
      priority: 'high',
      deviceType: 'POS Terminal',
      deviceModel: 'Epson TM-T88VI',
    },
    {
      client: clients[1],
      issue: 'Document scanner offline on reception PC',
      status: 'Open',
      priority: 'medium',
      deviceType: 'Scanner',
      deviceModel: 'Fujitsu fi-7160',
    },
    {
      client: clients[2],
      issue: 'Distribution dashboard sync delay > 15 minutes',
      status: 'Pending Client',
      priority: 'medium',
      deviceType: 'Server',
      deviceModel: 'Dell PowerEdge T340',
    },
    {
      client: clients[4],
      issue: 'Kitchen display showing stale orders',
      status: 'Resolved',
      priority: 'critical',
      deviceType: 'Tablet',
      deviceModel: 'Samsung Galaxy Tab A8',
    },
  ];

  let num = 1001;
  for (const t of tickets) {
    const now = iso();
    await Ticket.create({
      id: randomUUID(),
      ticketNumber: `TK-${num++}`,
      clientName: t.client.companyName,
      clientContactNumber: t.client.phone,
      issue: t.issue,
      location: t.client.address,
      deviceType: t.deviceType,
      deviceModel: t.deviceModel,
      status: t.status,
      technician: techName,
      priority: t.priority,
      category: 'Support',
      dateCreated: dateOnly(-3),
      lastUpdated: now,
      isActive: 1,
      clientId: t.client.id,
      createdBy: adminId,
      assignedTo: techId,
      hasUnreadClientComments: false,
      attachments: [],
      tags: ['showcase'],
      title: t.issue.slice(0, 80),
    });
  }
}

async function seedOrders(clients: DemoClient[], adminId: number) {
  const sequelize = getSequelize();
  const orders = [
    {
      client: clients[0],
      title: 'Replacement receipt printer',
      itemName: 'Epson TM-T88VI',
      vendor: 'Amazon',
      shippingStage: 'in_transit',
      currentLocation: 'Miami, FL — US hub',
      status: 'ordered',
      costPrice: 320,
      clientPrice: 450,
      trackingNumber: '1Z999AA10123456784',
    },
    {
      client: clients[1],
      title: 'SSD upgrade for service bay PC',
      itemName: 'Samsung 990 PRO 1TB',
      vendor: 'Local supplier',
      shippingStage: 'at_office',
      currentLocation: 'Computer Dynamics office',
      status: 'arrived',
      costPrice: 180,
      clientPrice: 275,
      trackingNumber: null,
    },
    {
      client: clients[2],
      title: 'Barcode scanner for warehouse',
      itemName: 'Zebra DS2208',
      vendor: 'Zebra',
      shippingStage: 'ordered',
      currentLocation: null,
      status: 'ordered',
      costPrice: 95,
      clientPrice: 165,
      trackingNumber: null,
    },
    {
      client: clients[4],
      title: 'Kitchen tablet replacement',
      itemName: 'Samsung Galaxy Tab A9',
      vendor: 'Best Buy',
      shippingStage: 'delivered',
      currentLocation: 'Klassic BBQ & Grill',
      status: 'delivered',
      costPrice: 210,
      clientPrice: 295,
      trackingNumber: '9400111899223344556677',
      actualArrival: iso(-2),
    },
  ];

  let orderNum = 5001;
  for (const o of orders) {
    const id = randomUUID();
    const now = iso();
    const orderNumber = `ORD-${orderNum++}`;
    const locationHistory = o.currentLocation
      ? JSON.stringify([
          {
            location: o.currentLocation,
            stage: o.shippingStage,
            timestamp: now,
            source: 'manual',
          },
        ])
      : '[]';

    await sequelize.query(
      `INSERT INTO orders (
        id, orderNumber, clientId, title, description, itemName, vendor,
        trackingNumber, orderDate, estimatedArrival, actualArrival,
        costPrice, clientPrice, quantity, status, isLoggedInPreAlerts,
        assignedTechnicianId, createdBy, tags, notes, isActive, createdAt, updatedAt,
        shippingStage, currentLocation, locationHistory, lastLocationUpdate
      ) VALUES (
        :id, :orderNumber, :clientId, :title, :description, :itemName, :vendor,
        :trackingNumber, :orderDate, :estimatedArrival, :actualArrival,
        :costPrice, :clientPrice, 1, :status, 0,
        :adminId, :adminId, '[]', :notes, 1, :now, :now,
        :shippingStage, :currentLocation, :locationHistory, :lastLocationUpdate
      )`,
      {
        replacements: {
          id,
          orderNumber,
          clientId: o.client.id,
          title: o.title,
          description: `Showcase order for ${o.client.companyName}`,
          itemName: o.itemName,
          vendor: o.vendor,
          trackingNumber: o.trackingNumber,
          orderDate: dateOnly(-7),
          estimatedArrival: dateOnly(5),
          actualArrival: o.actualArrival ?? null,
          costPrice: o.costPrice,
          clientPrice: o.clientPrice,
          status: o.status,
          adminId,
          notes: 'Demo data',
          now,
          shippingStage: o.shippingStage,
          currentLocation: o.currentLocation,
          locationHistory,
          lastLocationUpdate: o.currentLocation ? now : null,
        },
      }
    );
  }
}

async function seedSales(adminId: number, techId: number, clients: DemoClient[]) {
  await ensureSalesSchema();

  const opps = [
    {
      company_name: 'Harbour View Hotel',
      contact_name: 'Nadia Ali',
      email: 'it@harbourview.demo',
      phone: '+1-868-555-0301',
      product: 'ecommerce' as const,
      stage: 'demo_completed' as const,
      deal_type: 'subscription' as const,
      monthly_rate: 380,
    },
    {
      company_name: 'TechStart Retail',
      contact_name: 'Kevin Moore',
      email: 'kevin@techstart.demo',
      phone: '+1-868-555-0302',
      product: 'ecommerce' as const,
      stage: 'proposal_sent' as const,
      deal_type: 'standalone' as const,
      project_value: 4200,
      deposit_amount: 1200,
    },
    {
      company_name: 'GreenField Logistics',
      contact_name: 'Sandra Peters',
      email: 'sandra@greenfield.demo',
      phone: '+1-868-555-0303',
      product: 'distribution' as const,
      stage: 'contact_made' as const,
      deal_type: 'subscription' as const,
      monthly_rate: 520,
    },
    {
      company_name: 'Coastal Motors',
      contact_name: 'Ryan Joseph',
      email: 'ryan@coastalmotors.demo',
      product: 'auto' as const,
      stage: 'won' as const,
      deal_type: 'subscription' as const,
      monthly_rate: 295,
      client_id: clients[1].id,
    },
  ];

  for (const o of opps) {
    const id = randomUUID();
    await SalesOpportunity.create({
      id,
      companyName: o.company_name,
      contactName: o.contact_name,
      email: o.email,
      phone: o.phone ?? null,
      product: o.product,
      stage: o.stage,
      dealType: o.deal_type ?? null,
      monthlyRate: o.monthly_rate ?? null,
      projectValue: o.project_value ?? null,
      depositAmount: o.deposit_amount ?? null,
      pitchNotes: 'Interested after marketing site demo.',
      communications: [{ at: iso(-5), type: 'call', summary: 'Initial discovery call' }],
      createdBy: adminId,
      assignedTo: techId,
      clientId: o.client_id ?? null,
      wonAt: o.stage === 'won' ? new Date(iso(-10)) : null,
    });
  }
}

async function seedCalendar(adminId: number) {
  await ensureCalendarSchema();

  await CalendarEvent.create({
    id: randomUUID(),
    title: 'Follow up — Harbour View Hotel',
    notes: 'Send proposal after live restaurant demo.',
    eventType: 'sales_followup',
    scheduledAt: new Date(iso(2)),
    createdBy: adminId,
  });

  await CalendarEvent.create({
    id: randomUUID(),
    title: 'On-site visit — Island Fresh Markets',
    notes: 'POS printer installation.',
    eventType: 'general',
    scheduledAt: new Date(iso(5)),
    createdBy: adminId,
  });
}

async function seedNoticeBoard(adminId: number) {
  await NoticeBoard.create({
    title: 'Welcome to the Computer Dynamics Showcase',
    content:
      'This environment uses fictional clients and sample tickets, orders, and sales data. ' +
      'Sign in as **demo** or **tech** with password `Demo@2026!` to explore the portal.',
    authorId: adminId,
    priority: 'normal',
    category: 'announcement',
    targetAudience: 'all',
    targetRoles: [],
    targetUsers: [],
    isPinned: true,
    isActive: true,
    publishAt: new Date(),
    attachments: [],
    tags: ['showcase'],
  });
}

async function seedSystemConfig() {
  const configs: Array<[string, string, string, string]> = [
    ['maintenance_mode', 'false', 'boolean', 'general'],
    ['demo_mode', 'false', 'boolean', 'general'],
    ['system_version', '2.1.0', 'string', 'general'],
    ['showcase_install', 'true', 'boolean', 'general'],
    ['ai_security_enabled', 'false', 'boolean', 'security'],
    ['developer_mode', 'true', 'boolean', 'general'],
  ];

  for (const [key, value, type, category] of configs) {
    await SystemConfig.setConfig(key, value, type as 'boolean' | 'string', category);
  }
}

async function seedQuotes(clients: DemoClient[], adminId: number) {
  const sequelize = getSequelize();
  const items = JSON.stringify([
    { description: 'POS terminal bundle (2 stations)', quantity: 1, unitPrice: 4200, total: 4200 },
    { description: 'Installation & training', quantity: 1, unitPrice: 800, total: 800 },
  ]);

  await sequelize.query(
    `INSERT INTO quotes (
      id, client_id, created_by, quote_number, title, description, amount, currency,
      status, valid_until, items, terms, notes, created_at, updated_at
    ) VALUES (
      :id, :clientId, :createdBy, :quoteNumber, :title, :description, :amount, 'TTD',
      'sent', :validUntil, :items, :terms, :notes, :now, :now
    )`,
    {
      replacements: {
        id: randomUUID(),
        clientId: clients[0].id,
        createdBy: adminId,
        quoteNumber: 'QT-2026-001',
        title: 'POS rollout — Island Fresh Markets',
        description: 'Two-station POS with inventory module',
        amount: 5000,
        validUntil: dateOnly(30),
        items,
        terms: '50% deposit, balance on completion.',
        notes: 'Showcase quote',
        now: iso(),
      },
    }
  );
}

export async function seedShowcaseDatabase(): Promise<void> {
  const dbPath = getDatabasePath();
  console.log('Seeding showcase database:', dbPath);

  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database file not found: ${dbPath}. Run: node scripts/init-showcase-database.mjs`);
  }

  await testConnection();
  const sequelize = getSequelize();

  const [rows] = await sequelize.query(
    "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='users'"
  );
  const count = Number((rows as { count: number }[])[0]?.count ?? 0);

  if (!count) {
    throw new Error('users table missing — copy template DB via init-showcase-database.mjs first.');
  }

  const existingUsers = await User.count();
  if (existingUsers > 0) {
    throw new Error(
      `Database already has ${existingUsers} user(s). Delete ${dbPath} and re-run init to reseed.`
    );
  }

  const { admin, tech } = await seedUsers();
  const clients = await seedClients(admin.id, tech.id);
  await seedTickets(clients, tech.id, admin.id);
  await seedOrders(clients, admin.id);
  await seedSales(admin.id, tech.id, clients);
  await seedCalendar(admin.id);
  await seedNoticeBoard(admin.id);
  await seedQuotes(clients, admin.id);
  await seedSystemConfig();

  console.log('Showcase seed complete.');
  console.log('  Admin:  demo  /', DEMO_PASSWORD);
  console.log('  Tech:   tech  /', DEMO_PASSWORD);
  console.log('  Clients: use each client email with /', DEMO_PASSWORD);
}

async function main() {
  try {
    await seedShowcaseDatabase();
  } catch (error) {
    console.error('Seed failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await closeConnection();
  }
}

if (require.main === module) {
  main();
}
