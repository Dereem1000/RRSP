/**
 * Provision (upsert) the RRMS marketing live-demo shop on the active MSP database.
 * Run: npm run db:provision-rrms-demo
 *
 * Constants must stay aligned with apps/web/src/lib/public-demo-logins.ts
 */
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import sqlite3 from 'sqlite3';
import type { ClientAttributes } from './models/Client';
import {
  Client,
  User,
  closeConnection,
  getDatabasePath,
  getMonorepoRoot,
  testConnection,
} from './index';
import { getSequelize } from './connection';

const DEMO_PASSWORD = 'Demo@2026!';

export const RRMS_DEMO_CLIENT_ID = 'a1111111-1111-4111-8111-111111111111';
export const RRMS_DEMO_SHOP_SLUG = 'rrmsrepairdemo';
export const RRMS_OWNER_EMAIL = 'rrms-demo@rrmsrepair.demo';
export const RRMS_OWNER_USERNAME = 'rrms-demo';

const RRSP_MODULES_ALL: Record<string, boolean> = {
  tickets: true,
  orders: true,
  parts: true,
  sales: true,
  clients: true,
  accounting: true,
  pos: true,
};

type StaffSpec = {
  local: string;
  firstName: string;
  lastName: string;
  roleLabel: string;
  modules: string[];
};

const STAFF_SPECS: StaffSpec[] = [
  {
    local: 'bench',
    firstName: 'Ben',
    lastName: 'Bench',
    roleLabel: 'Bench Tech',
    modules: ['tickets', 'parts'],
  },
  {
    local: 'intake',
    firstName: 'Ivy',
    lastName: 'Intake',
    roleLabel: 'Intake',
    modules: ['tickets', 'clients', 'orders'],
  },
  {
    local: 'counter',
    firstName: 'Cara',
    lastName: 'Counter',
    roleLabel: 'Front desk',
    modules: ['pos', 'accounting'],
  },
];

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
        start_date: row.startDate ? new Date(row.startDate).toISOString() : null,
        end_date: row.endDate ? new Date(row.endDate).toISOString() : null,
        monthly_rate: row.monthlyRate ?? null,
        notes: row.notes ?? null,
        communication_history: JSON.stringify(row.communicationHistory ?? []),
        is_active: row.isActive ? 1 : 0,
        usage_tracking: JSON.stringify(row.usageTracking ?? {}),
        service_plan_data: JSON.stringify(row.servicePlanData ?? {}),
        assigned_technician_id: row.assignedTechnicianId ?? null,
        priority_level: row.priorityLevel ?? null,
        contract_start_date: row.contractStartDate
          ? new Date(row.contractStartDate).toISOString().slice(0, 10)
          : null,
        contract_end_date: row.contractEndDate
          ? new Date(row.contractEndDate).toISOString().slice(0, 10)
          : null,
        renewal_date: row.renewalDate ? new Date(row.renewalDate).toISOString().slice(0, 10) : null,
        sla_agreement: JSON.stringify(row.slaAgreement ?? {}),
        created_at: row.created_at ? new Date(row.created_at).toISOString() : iso(),
        updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : iso(),
        userId: row.userId ?? null,
      },
    }
  );
}

async function upsertOwnerUser(passwordHash: string, now: string): Promise<User> {
  let user = await User.findOne({
    where: { email: RRMS_OWNER_EMAIL },
  });

  if (!user) {
    user = await User.findOne({ where: { username: RRMS_OWNER_USERNAME } });
  }

  if (user) {
    await user.update({
      username: RRMS_OWNER_USERNAME,
      email: RRMS_OWNER_EMAIL,
      password: passwordHash,
      firstName: 'Rita',
      lastName: 'Owner',
      role: 'client',
      securityClearance: 'S-CLS3',
      isActive: true,
      isLocked: false,
      failedLoginAttempts: 0,
      passwordSet: true,
      phone: '+1-868-555-0400',
      updated_at: new Date(now),
    });
    return user;
  }

  return User.create({
    username: RRMS_OWNER_USERNAME,
    email: RRMS_OWNER_EMAIL,
    password: passwordHash,
    firstName: 'Rita',
    lastName: 'Owner',
    role: 'client',
    securityClearance: 'S-CLS3',
    isActive: true,
    isLocked: false,
    failedLoginAttempts: 0,
    passwordSet: true,
    phone: '+1-868-555-0400',
    preferences: {},
    created_at: new Date(now),
    updated_at: new Date(now),
  });
}

async function upsertStaffUser(
  spec: StaffSpec,
  ownerUserId: number,
  mspClientId: string,
  passwordHash: string,
  now: string
): Promise<User> {
  const username = `${spec.local}@${RRMS_DEMO_SHOP_SLUG}`;
  const email = `${spec.local}@${RRMS_DEMO_SHOP_SLUG}.rrsp.local`;

  let user = await User.findOne({ where: { username } });
  if (!user) {
    user = await User.findOne({ where: { email } });
  }

  const staffPref = {
    rrspShopStaff: {
      mspClientId,
      ownerUserId,
      roleLabel: spec.roleLabel,
      modules: spec.modules,
    },
  };

  if (user) {
    await user.update({
      username,
      email,
      password: passwordHash,
      firstName: spec.firstName,
      lastName: spec.lastName,
      role: 'client',
      securityClearance: 'S-CLS3',
      isActive: true,
      isLocked: false,
      failedLoginAttempts: 0,
      passwordSet: true,
      preferences: staffPref,
      updated_at: new Date(now),
    });
    return user;
  }

  return User.create({
    username,
    email,
    password: passwordHash,
    firstName: spec.firstName,
    lastName: spec.lastName,
    role: 'client',
    securityClearance: 'S-CLS3',
    isActive: true,
    isLocked: false,
    failedLoginAttempts: 0,
    passwordSet: true,
    phone: null,
    preferences: staffPref,
    created_at: new Date(now),
    updated_at: new Date(now),
  });
}

async function upsertRrmsClient(ownerUserId: number, now: string): Promise<Client> {
  const servicePlanData = {
    billingCycle: 'monthly',
    rrspModules: RRSP_MODULES_ALL,
    rrspStaffLoginEnabled: true,
    rrspShopLoginSlug: RRMS_DEMO_SHOP_SLUG,
    rrspBranding: {
      companyName: 'RRMS Repair Demo Shop',
      companyAddress: '22 Demo Lane, Port of Spain',
      companyPhone: '+1-868-555-0400',
      companyWebsite: 'https://rrms-repair.demo',
      companyLogo: '/logo.svg',
    },
  };

  let client = await Client.findByPk(RRMS_DEMO_CLIENT_ID);
  if (!client) {
    client = await Client.findOne({ where: { email: RRMS_OWNER_EMAIL } });
  }

  const payload = {
    name: 'RRMS Repair Demo Shop',
    companyName: 'RRMS Repair Demo Shop',
    email: RRMS_OWNER_EMAIL,
    phone: '+1-868-555-0400',
    address: '22 Demo Lane, Port of Spain',
    contactPerson: 'Rita Owner',
    billingInfo: { paymentTerms: 'Net 30', currency: 'TTD' },
    contractDetails: { showcase: false, product: 'rrms', marketingDemo: true },
    serviceLevel: 'standard' as const,
    supportTier: 'silver' as const,
    status: 'active' as const,
    startDate: new Date(dateOnly(-90)),
    monthlyRate: 350,
    notes: 'RRMS marketing live-demo shop — owner, staff logins, and shop demo mode.',
    communicationHistory: [],
    isActive: true,
    usageTracking: {},
    features: ['rrsp'],
    servicePlanData,
    assignedTechnicianId: null,
    priorityLevel: 'medium' as const,
    contractStartDate: new Date(dateOnly(-90)),
    contractEndDate: new Date(dateOnly(275)),
    renewalDate: new Date(dateOnly(245)),
    slaAgreement: { responseHours: 4 },
    userId: ownerUserId,
    updated_at: new Date(now),
  };

  if (client) {
    await client.update(payload);
    return client;
  }

  const created = await Client.create({
    id: RRMS_DEMO_CLIENT_ID,
    ...payload,
    created_at: new Date(now),
  } as never);
  await mirrorClientToBackup(created);
  return created;
}

async function seedRrmsLicense(mspClientId: string, companyName: string, email: string): Promise<void> {
  const licensePath = path.join(
    getMonorepoRoot(),
    'license_activation_system_new',
    'instance',
    'license_system.db'
  );
  if (!fs.existsSync(licensePath)) {
    console.warn('[provision-rrms-demo] License DB missing — license step skipped:', licensePath);
    return;
  }

  const activation = iso();
  const expiration = iso(365 * 3);
  const features = JSON.stringify({
    inventory_management: true,
    advanced_reporting: true,
    api_access: true,
    multi_location: true,
    rrsp_online: true,
  });

  const db = new sqlite3.Database(licensePath);
  const runLicense = (sql: string, params: unknown[] = []) =>
    new Promise<void>((resolve, reject) => {
      db.run(sql, params, (err) => (err ? reject(err) : resolve()));
    });
  const getLicense = (sql: string, params: unknown[] = []) =>
    new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
      db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row as Record<string, unknown> | undefined)));
    });

  try {
    let companyId: number | undefined;
    const existingCompany = await getLicense(
      'SELECT id FROM company_registration WHERE msp_client_id = ?',
      [mspClientId]
    );
    if (existingCompany?.id) {
      companyId = Number(existingCompany.id);
    } else {
      const companySerial = `CO-${mspClientId.slice(0, 8).toUpperCase()}`;
      await runLicense(
        `INSERT INTO company_registration
         (company_name, contact_person, email, phone, address, serial_number, msp_client_id, registration_date, is_verified, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [
          companyName,
          'Rita Owner',
          email,
          '+1-868-555-0400',
          '22 Demo Lane, Port of Spain',
          companySerial,
          mspClientId,
          activation,
          activation,
        ]
      );
      const row = await getLicense('SELECT last_insert_rowid() AS id');
      companyId = Number(row?.id);
    }

    if (!companyId) return;

    const serial = `RRMS-DEMO-${mspClientId.slice(0, 8).toUpperCase()}`;
    const existingLicense = await getLicense(
      'SELECT id FROM license_activation WHERE serial_number = ?',
      [serial]
    );
    if (existingLicense?.id) {
      await runLicense(
        `UPDATE license_activation
         SET is_active = 1, license_type = ?, expiration_date = ?, features = ?, updated_at = ?
         WHERE serial_number = ?`,
        ['No Time Limit', expiration, features, activation, serial]
      );
    } else {
      await runLicense(
        `INSERT INTO license_activation
         (serial_number, company_id, license_type, activation_date, expiration_date, is_active, max_users, features, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
        [serial, companyId, 'No Time Limit', activation, expiration, 25, features, activation, activation]
      );
    }
  } finally {
    db.close();
  }
}

export async function provisionRrmsDemoShop(): Promise<void> {
  const dbPath = getDatabasePath();
  console.log('[provision-rrms-demo] Database:', dbPath);

  await testConnection();
  const now = iso();
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const owner = await upsertOwnerUser(passwordHash, now);
  const client = await upsertRrmsClient(owner.id, now);
  const mspClientId = client.id;

  for (const spec of STAFF_SPECS) {
    await upsertStaffUser(spec, owner.id, mspClientId, passwordHash, now);
  }

  await seedRrmsLicense(mspClientId, client.companyName || 'RRMS Repair Demo Shop', RRMS_OWNER_EMAIL);

  console.log('[provision-rrms-demo] Ready.');
  console.log('  Owner:', RRMS_OWNER_EMAIL, '/', DEMO_PASSWORD);
  console.log('  Staff:', STAFF_SPECS.map((s) => `${s.local}@${RRMS_DEMO_SHOP_SLUG}`).join(', '));
  console.log('  Login URL: /login?demo=rrms&autostart=1&returnUrl=/rrsp');
}

async function main(): Promise<void> {
  try {
    await provisionRrmsDemoShop();
  } finally {
    await closeConnection();
  }
}

if (process.argv[1]?.includes('provision-rrms-demo')) {
  main().catch((err) => {
    console.error('[provision-rrms-demo] Failed:', err);
    process.exit(1);
  });
}
