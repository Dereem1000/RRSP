import { Op, QueryTypes } from 'sequelize';
import bcrypt from 'bcryptjs';
import { Client, Ticket, User, getSequelize } from '@cd-v2/database';
import { buildUsageLimitsFromLevel, getDefaultMonthlyRate, getDefaultSlaForLevel, type UsageInfo } from '@/lib/client-constants';
import { sendClientWelcomeEmail } from '@/lib/email';
import {
  getActivationFeatures,
  type ActivationFeature,
} from '@/lib/license-constants';
import {
  getClientLicenseSnapshot,
  isLicenseDbAvailable,
} from '@/lib/license-service';

export function serializeClient(client: Client) {
  const json = client.toJSON() as unknown as Record<string, unknown>;
  if (json.monthlyRate != null) json.monthlyRate = Number(json.monthlyRate);
  json.features = getActivationFeatures(json.features);
  return json;
}

/** License DB is the only source of truth for which systems a client uses */
export async function resolveClientActivationFeatures(client: Client): Promise<ActivationFeature[]> {
  if (!isLicenseDbAvailable()) return getActivationFeatures(client.features);

  try {
    const snapshot = await getClientLicenseSnapshot(client.id);
    if (snapshot.activationFeatures.length > 0) return snapshot.activationFeatures;
    return getActivationFeatures(client.features);
  } catch {
    return getActivationFeatures(client.features);
  }
}

export async function getClientById(id: string) {
  return Client.findByPk(id, {
    include: [
      {
        model: Ticket,
        attributes: ['id', 'ticketNumber', 'issue', 'status', 'priority', 'dateCreated', 'lastUpdated'],
        limit: 20,
        order: [['lastUpdated', 'DESC']],
      },
    ],
  });
}

export function buildDefaultUsageTracking(serviceLevel: string | null | undefined) {
  return buildUsageLimitsFromLevel(serviceLevel);
}

export function buildUsageInfo(usageTracking: Record<string, number | null | undefined> | null | undefined): UsageInfo {
  const usage = usageTracking ?? {};
  const metric = (usedKey: string, limitKey: string) => {
    const used = Number(usage[usedKey] ?? 0);
    const limit = Number(usage[limitKey] ?? 0);
    return {
      used,
      limit,
      percentage: limit > 0 ? Math.round((used / limit) * 100) : 0,
    };
  };

  return {
    onsiteVisits: metric('onsiteVisitsUsed', 'onsiteVisitsLimit'),
    supportTickets: metric('supportTicketsUsed', 'supportTicketsLimit'),
    endpoints: metric('endpointsUsed', 'endpointsLimit'),
    supportHours: metric('supportHoursUsed', 'supportHoursLimit'),
    lastResetDate: (usage.lastResetDate as string | null) ?? null,
  };
}

export function mergeUsageLimitsForServiceLevel(
  current: Record<string, unknown> | null | undefined,
  serviceLevel: string | null
) {
  return buildUsageLimitsFromLevel(serviceLevel, current as Record<string, number | null | undefined>);
}

export function calculateNextBillingDate(billingCycle: string | undefined, startDate: Date | string | null) {
  if (!startDate) return null;
  const start = new Date(startDate);
  const now = new Date();
  if (Number.isNaN(start.getTime())) return null;

  const monthsBetween =
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());

  switch (billingCycle) {
    case 'quarterly':
      return new Date(start.getFullYear(), start.getMonth() + Math.ceil(monthsBetween / 3) * 3, start.getDate());
    case 'annually':
      return new Date(start.getFullYear() + Math.ceil((now.getTime() - start.getTime()) / (365 * 24 * 60 * 60 * 1000)), start.getMonth(), start.getDate());
    case 'monthly':
    default:
      return new Date(start.getFullYear(), start.getMonth() + Math.max(0, monthsBetween), start.getDate());
  }
}

export function getClientBilling(client: Client) {
  const plan = (client.servicePlanData ?? {}) as Record<string, unknown>;
  const billingCycle = (plan.billingCycle as string) || 'monthly';
  const contractStart = client.contractStartDate ?? client.startDate;
  const contractEnd = client.contractEndDate ?? client.endDate;
  const now = new Date();

  return {
    monthlyRate: Number(client.monthlyRate ?? 0),
    billingCycle,
    contractStartDate: contractStart,
    contractEndDate: contractEnd,
    renewalDate: client.renewalDate,
    nextBillingDate: calculateNextBillingDate(billingCycle, contractStart),
    isContractActive:
      contractStart && contractEnd
        ? now >= new Date(contractStart) && now <= new Date(contractEnd)
        : client.status === 'active',
    servicePlanData: plan,
  };
}

async function safeQuery<T extends Record<string, unknown>>(
  query: string,
  replacements?: Record<string, unknown>
): Promise<T[]> {
  try {
    const sequelize = getSequelize();
    const rows = await sequelize.query<T>(query, { type: QueryTypes.SELECT, replacements });
    return rows ?? [];
  } catch {
    return [];
  }
}

export async function getClientActivities(clientId: string, limit = 50) {
  return safeQuery<{
    id: number;
    description: string;
    status: string;
    clock_in_time: string;
    clock_out_time: string | null;
    technician: string;
  }>(
    `SELECT a.id, a.description, a.status, a.clock_in_time, a.clock_out_time,
            COALESCE(u.firstName || ' ' || u.lastName, u.username, 'Staff') AS technician
     FROM activities a
     LEFT JOIN users u ON u.id = a.user_id
     WHERE a.client_id = :clientId
     ORDER BY a.clock_in_time DESC
     LIMIT :limit`,
    { clientId, limit }
  );
}

export async function getClientInvoices(clientId: string, limit = 50) {
  return safeQuery<{
    id: string;
    invoice_number: string;
    amount: number;
    status: string;
    due_date: string;
  }>(
    `SELECT id, invoice_number, amount, status, due_date
     FROM invoices
     WHERE client_id = :clientId
     ORDER BY due_date DESC
     LIMIT :limit`,
    { clientId, limit }
  );
}

export async function getClientOrders(clientId: string, limit = 50) {
  return safeQuery<{
    id: string;
    orderNumber: string;
    title: string;
    status: string;
    totalAmount: number | null;
  }>(
    `SELECT id, orderNumber, title, status, totalAmount
     FROM orders
     WHERE clientId = :clientId
     ORDER BY created_at DESC
     LIMIT :limit`,
    { clientId, limit }
  );
}

export async function getClientQuotes(clientId: string, limit = 50) {
  return safeQuery<{
    id: string;
    quote_number: string;
    title: string;
    status: string;
    amount: number;
  }>(
    `SELECT id, quote_number, title, status, amount
     FROM quotes
     WHERE client_id = :clientId
     ORDER BY created_at DESC
     LIMIT :limit`,
    { clientId, limit }
  );
}

export async function createPortalUserForClient(client: {
  email: string;
  name: string;
  contactPerson?: string | null;
  phone?: string | null;
}) {
  const tempPassword = Math.random().toString(36).slice(2, 8);
  const hashedPassword = await bcrypt.hash(tempPassword, 10);

  const baseUsername = client.email.split('@')[0];
  let username = baseUsername;
  let counter = 1;
  while (await User.findOne({ where: { username } })) {
    username = `${baseUsername}${counter++}`;
  }

  const nameParts = (client.contactPerson || client.name).trim().split(/\s+/);
  const firstName = nameParts[0] || client.name;
  const lastName = nameParts.slice(1).join(' ') || 'User';

  const user = await User.create({
    username,
    email: client.email,
    password: hashedPassword,
    firstName,
    lastName,
    role: 'client',
    securityClearance: 'S-CLS3',
    isActive: false,
    isLocked: false,
    failedLoginAttempts: 0,
    passwordSet: false,
    tempPassword: hashedPassword,
    phone: client.phone ?? null,
    preferences: {},
  });

  return { user, tempPassword, username };
}

export async function sendPortalWelcomeEmail(
  client: { email: string; contactPerson?: string | null },
  username: string,
  tempPassword: string,
  portalUrl: string
) {
  return sendClientWelcomeEmail({
    to: client.email,
    contactPerson: client.contactPerson,
    username,
    tempPassword,
    portalUrl,
  });
}

export async function resendWelcomeForClient(client: Client, portalUrl: string) {
  let user = client.userId ? await User.findByPk(client.userId) : null;
  if (!user) user = await User.findOne({ where: { email: client.email } });
  if (!user) {
    const created = await createPortalUserForClient({
      email: client.email,
      name: client.name,
      contactPerson: client.contactPerson,
      phone: client.phone,
    });
    user = created.user;
    await client.update({ userId: user.id, status: 'pending', isActive: false });
    const emailSent = await sendPortalWelcomeEmail(client, created.username, created.tempPassword, portalUrl);
    return {
      username: created.username,
      tempPassword: created.tempPassword,
      created: true,
      emailSent,
    };
  }

  const tempPassword = Math.random().toString(36).slice(2, 8);
  const hashedTempPassword = await bcrypt.hash(tempPassword, 10);
  await user.update({
    tempPassword: hashedTempPassword,
    password: hashedTempPassword,
    passwordSet: false,
    isActive: false,
  });

  const emailSent = await sendPortalWelcomeEmail(client, user.username, tempPassword, portalUrl);
  return { username: user.username, tempPassword, created: false, emailSent };
}

export async function resolveUniqueEmail(email: string, excludeId?: string) {
  const existing = await Client.findOne({
    where: {
      email,
      ...(excludeId ? { id: { [Op.ne]: excludeId } } : {}),
    },
  });
  return !existing;
}

export async function validateTechnicianAssignment(technicianId: string | number | null | undefined) {
  if (!technicianId) return null;
  const user = await User.findByPk(Number(technicianId));
  if (!user || (user.role !== 'technician' && user.role !== 'admin')) {
    throw new Error('Invalid technician assignment');
  }
  return String(user.id);
}

export async function incrementClientUsage(
  clientId: string,
  type: 'onsiteVisits' | 'supportTickets' | 'endpoints' | 'supportHours',
  amount = 1
) {
  const client = await Client.findByPk(clientId);
  if (!client) return null;

  const usage = { ...((client.usageTracking as Record<string, number>) ?? {}) };
  const usedKey = `${type}Used`;
  const limitKey = `${type}Limit`;
  usage[usedKey] = Number(usage[usedKey] ?? 0) + amount;
  await client.update({ usageTracking: usage });
  return buildUsageInfo(usage);
}

export async function forceDeleteClient(clientId: string) {
  const sequelize = getSequelize();
  const ticketCount = await Ticket.count({ where: { clientId } });

  await sequelize.query('PRAGMA foreign_keys = OFF');
  try {
    if (ticketCount > 0) {
      await Ticket.destroy({ where: { clientId } });
    }
    const client = await Client.findByPk(clientId);
    if (!client) return { deleted: false, ticketCount };
    await client.destroy();
    return { deleted: true, ticketCount };
  } finally {
    await sequelize.query('PRAGMA foreign_keys = ON');
  }
}
