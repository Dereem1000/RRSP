import { randomUUID } from 'crypto';
import { Op, QueryTypes } from 'sequelize';
import { Client, getSequelize } from '@cd-v2/database';
import { SERVICE_LEVELS } from '@/lib/client-constants';

export type InvoiceRow = {
  id: string;
  client_id: string;
  created_by: number;
  invoice_number: string;
  amount: number;
  paidAmount: number;
  currency: string;
  status: string;
  due_date: string;
  paid_date: string | null;
  billing_cycle: string;
  payment_gateway: string;
  description: string | null;
  items: string | null;
  created_at: string;
  updated_at: string;
  clientName?: string;
  clientEmail?: string;
  serviceLevel?: string | null;
};

export type PaymentRow = {
  id: string;
  invoice_id: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  processed_by: string;
  reference: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type QuoteRow = {
  id: string;
  client_id: string;
  created_by: string | number;
  quote_number: string;
  title: string;
  description: string | null;
  amount: number;
  currency: string;
  status: string;
  valid_until: string;
  accepted_date: string | null;
  converted_to_invoice_id: string | null;
  items: string | null;
  terms: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  clientName?: string;
  clientEmail?: string;
};

export type AccountingSummary = {
  totalRevenue: number;
  pendingAmount: number;
  totalInvoices: number;
  overdueInvoices: number;
  paidInvoices: number;
  totalQuotes: number;
  draftQuotes: number;
  sentQuotes: number;
  acceptedQuotes: number;
  convertedQuotes: number;
};

export type RecentFinancialTransaction = {
  id: string;
  invoiceId: string;
  clientId: string | null;
  invoiceNumber: string;
  clientName: string | null;
  amount: number;
  currency: string;
  paymentDate: string;
  paymentMethod: string;
  reference: string | null;
};

export type Pagination = {
  total: number;
  page: number;
  limit: number;
  pages: number;
};

function parseItems(raw: string | null): unknown[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function serializeInvoice(row: InvoiceRow) {
  return {
    id: row.id,
    clientId: row.client_id,
    createdBy: row.created_by,
    invoiceNumber: row.invoice_number,
    amount: Number(row.amount),
    paidAmount: Number(row.paidAmount ?? 0),
    currency: row.currency,
    status: row.status,
    dueDate: row.due_date,
    paidDate: row.paid_date,
    billingCycle: row.billing_cycle,
    paymentGateway: row.payment_gateway,
    description: row.description,
    items: parseItems(row.items),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    client: row.clientName
      ? {
          id: row.client_id,
          name: row.clientName,
          email: row.clientEmail,
          serviceLevel: row.serviceLevel,
        }
      : undefined,
  };
}

function serializeQuote(row: QuoteRow) {
  return {
    id: row.id,
    clientId: row.client_id,
    createdBy: row.created_by,
    quoteNumber: row.quote_number,
    title: row.title,
    description: row.description,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status,
    validUntil: row.valid_until,
    acceptedAt: row.accepted_date,
    convertedToInvoiceId: row.converted_to_invoice_id,
    items: parseItems(row.items),
    terms: row.terms,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    client: row.clientName
      ? { id: row.client_id, name: row.clientName, email: row.clientEmail }
      : undefined,
  };
}

function serializePayment(row: PaymentRow) {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    amount: Number(row.amount),
    paymentMethod: row.payment_method,
    paymentDate: row.payment_date,
    processedBy: row.processed_by,
    reference: row.reference,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getMspClientIds(): Promise<string[]> {
  const clients = await Client.findAll({
    where: { serviceLevel: { [Op.in]: [...SERVICE_LEVELS] } },
    attributes: ['id'],
  });
  return clients.map((c) => c.id);
}

export async function getInvoiceById(id: string) {
  const sequelize = getSequelize();
  const rows = await sequelize.query<InvoiceRow>(
    `SELECT i.*, COALESCE(c.company_name, c.name) AS clientName, c.email AS clientEmail, c.service_level AS serviceLevel
     FROM invoices i
     LEFT JOIN clients c ON c.id = i.client_id
     WHERE i.id = :id`,
    { type: QueryTypes.SELECT, replacements: { id } }
  );
  return rows[0] ? serializeInvoice(rows[0]) : null;
}

export async function createInvoice(input: {
  clientId: string;
  amount: number;
  dueDate: string;
  createdBy: number;
  currency?: string;
  status?: 'pending' | 'paid' | 'overdue' | 'cancelled' | 'partial';
  billingCycle?: 'monthly' | 'trimonthly' | 'immediately';
  paymentGateway?: 'CASH' | 'PayPal' | 'bank_transfer' | 'WiPay';
  description?: string | null;
  items?: unknown[];
}) {
  const sequelize = getSequelize();
  const id = randomUUID();
  const invoiceNumber = await generateInvoiceNumber();
  const now = new Date().toISOString();

  await sequelize.query(
    `INSERT INTO invoices (id, client_id, created_by, invoice_number, amount, paidAmount, currency, status, due_date, billing_cycle, payment_gateway, description, items, created_at, updated_at)
     VALUES (:id, :clientId, :createdBy, :invoiceNumber, :amount, :paidAmount, :currency, :status, :dueDate, :billingCycle, :paymentGateway, :description, :items, :now, :now)`,
    {
      replacements: {
        id,
        clientId: input.clientId,
        createdBy: input.createdBy,
        invoiceNumber,
        amount: input.amount,
        paidAmount: input.status === 'paid' ? input.amount : 0,
        currency: input.currency ?? 'TTD',
        status: input.status ?? 'pending',
        dueDate: input.dueDate,
        billingCycle: input.billingCycle ?? 'immediately',
        paymentGateway: input.paymentGateway ?? 'CASH',
        description: input.description ?? null,
        items: JSON.stringify(input.items ?? []),
        now,
      },
    }
  );

  const invoice = await getInvoiceById(id);
  if (!invoice) return null;

  if (invoice.status === 'paid') {
    await sequelize.query(`UPDATE invoices SET paid_date = :paidDate, updated_at = :now WHERE id = :id`, {
      replacements: { id, paidDate: now, now },
    });
    return getInvoiceById(id);
  }

  return invoice;
}

export async function updateInvoice(
  id: string,
  updates: Partial<{
    clientId: string;
    amount: number;
    currency: string;
    status: 'pending' | 'paid' | 'overdue' | 'cancelled' | 'partial';
    dueDate: string;
    billingCycle: 'monthly' | 'trimonthly' | 'immediately';
    paymentGateway: 'CASH' | 'PayPal' | 'bank_transfer' | 'WiPay';
    description: string | null;
    items: unknown[];
  }>
) {
  const existing = await getInvoiceById(id);
  if (!existing) return null;

  const sequelize = getSequelize();
  const now = new Date().toISOString();
  const fields: string[] = [];
  const replacements: Record<string, unknown> = { id, now };

  if (updates.clientId !== undefined) {
    fields.push('client_id = :clientId');
    replacements.clientId = updates.clientId;
  }
  if (updates.amount !== undefined) {
    fields.push('amount = :amount');
    replacements.amount = updates.amount;
  }
  if (updates.currency !== undefined) {
    fields.push('currency = :currency');
    replacements.currency = updates.currency;
  }
  if (updates.dueDate !== undefined) {
    fields.push('due_date = :dueDate');
    replacements.dueDate = updates.dueDate;
  }
  if (updates.billingCycle !== undefined) {
    fields.push('billing_cycle = :billingCycle');
    replacements.billingCycle = updates.billingCycle;
  }
  if (updates.paymentGateway !== undefined) {
    fields.push('payment_gateway = :paymentGateway');
    replacements.paymentGateway = updates.paymentGateway;
  }
  if (updates.description !== undefined) {
    fields.push('description = :description');
    replacements.description = updates.description;
  }
  if (updates.items !== undefined) {
    fields.push('items = :items');
    replacements.items = JSON.stringify(updates.items);
  }
  if (updates.status !== undefined) {
    fields.push('status = :status');
    replacements.status = updates.status;
    if (updates.status === 'paid') {
      fields.push('paid_date = :paidDate');
      replacements.paidDate = now;
    } else {
      fields.push('paid_date = NULL');
    }
  }

  if (fields.length === 0) return existing;
  fields.push('updated_at = :now');

  await sequelize.query(`UPDATE invoices SET ${fields.join(', ')} WHERE id = :id`, { replacements });
  return getInvoiceById(id);
}

export async function deleteInvoice(id: string) {
  const existing = await getInvoiceById(id);
  if (!existing) return false;
  const sequelize = getSequelize();
  await sequelize.query(`DELETE FROM invoices WHERE id = :id`, { replacements: { id } });
  return true;
}

export async function getAccountingSummary(): Promise<AccountingSummary> {
  const sequelize = getSequelize();
  const [invoiceStats] = await sequelize.query<{
    totalRevenue: number;
    pendingAmount: number;
    totalInvoices: number;
    overdueInvoices: number;
    paidInvoices: number;
  }>(
    `SELECT
      COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS totalRevenue,
      COALESCE(SUM(CASE WHEN status IN ('pending', 'partial', 'overdue') THEN amount ELSE 0 END), 0) AS pendingAmount,
      COUNT(*) AS totalInvoices,
      COALESCE(SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END), 0) AS overdueInvoices,
      COALESCE(SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END), 0) AS paidInvoices
    FROM invoices`,
    { type: QueryTypes.SELECT }
  );

  const [quoteStats] = await sequelize.query<{
    totalQuotes: number;
    draftQuotes: number;
    sentQuotes: number;
    acceptedQuotes: number;
    convertedQuotes: number;
  }>(
    `SELECT
      COUNT(*) AS totalQuotes,
      COALESCE(SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END), 0) AS draftQuotes,
      COALESCE(SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END), 0) AS sentQuotes,
      COALESCE(SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END), 0) AS acceptedQuotes,
      COALESCE(SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END), 0) AS convertedQuotes
    FROM quotes`,
    { type: QueryTypes.SELECT }
  );

  return {
    totalRevenue: Math.round(Number(invoiceStats?.totalRevenue ?? 0) * 100) / 100,
    pendingAmount: Math.round(Number(invoiceStats?.pendingAmount ?? 0) * 100) / 100,
    totalInvoices: Number(invoiceStats?.totalInvoices ?? 0),
    overdueInvoices: Number(invoiceStats?.overdueInvoices ?? 0),
    paidInvoices: Number(invoiceStats?.paidInvoices ?? 0),
    totalQuotes: Number(quoteStats?.totalQuotes ?? 0),
    draftQuotes: Number(quoteStats?.draftQuotes ?? 0),
    sentQuotes: Number(quoteStats?.sentQuotes ?? 0),
    acceptedQuotes: Number(quoteStats?.acceptedQuotes ?? 0),
    convertedQuotes: Number(quoteStats?.convertedQuotes ?? 0),
  };
}

export async function getRecentFinancialTransactions(limit = 8): Promise<RecentFinancialTransaction[]> {
  const sequelize = getSequelize();
  const rows = await sequelize.query<{
    id: string;
    invoice_id: string;
    client_id: string | null;
    amount: number;
    payment_method: string;
    payment_date: string;
    reference: string | null;
    invoice_number: string;
    currency: string;
    clientName: string | null;
  }>(
    `SELECT p.id, p.invoice_id, p.amount, p.payment_method, p.payment_date, p.reference,
            i.invoice_number, i.currency, i.client_id AS client_id, c.name AS clientName
     FROM payments p
     INNER JOIN invoices i ON i.id = p.invoice_id
     LEFT JOIN clients c ON c.id = i.client_id
     ORDER BY p.payment_date DESC, p.created_at DESC
     LIMIT :limit`,
    { type: QueryTypes.SELECT, replacements: { limit } }
  );

  return rows.map((row) => ({
    id: row.id,
    invoiceId: row.invoice_id,
    clientId: row.client_id,
    invoiceNumber: row.invoice_number,
    clientName: row.clientName,
    amount: Number(row.amount),
    currency: row.currency ?? 'TTD',
    paymentDate: row.payment_date,
    paymentMethod: row.payment_method,
    reference: row.reference,
  }));
}

export async function getAccountingAnalytics() {
  const sequelize = getSequelize();
  const rows = await sequelize.query<{ status: string; amount: number; paidAmount: number }>(
    `SELECT status, amount, paidAmount FROM invoices`,
    { type: QueryTypes.SELECT }
  );

  const invoices = rows.map((row) => ({
    status: row.status,
    amount: Number(row.amount),
    paidAmount: Number(row.paidAmount ?? 0),
  }));

  return {
    totalInvoices: invoices.length,
    totalAmount: invoices.reduce((sum, inv) => sum + inv.amount, 0),
    paidInvoices: invoices.filter((inv) => inv.status === 'paid').length,
    partialInvoices: invoices.filter((inv) => inv.status === 'partial').length,
    paidAmount: invoices.reduce((sum, inv) => sum + inv.paidAmount, 0),
    overdueInvoices: invoices.filter((inv) => inv.status === 'overdue').length,
    overdueAmount: invoices.filter((inv) => inv.status === 'overdue').reduce((sum, inv) => sum + inv.amount, 0),
    pendingAmount: invoices.filter((inv) => inv.status === 'pending').reduce((sum, inv) => sum + inv.amount, 0),
    statusBreakdown: {
      pending: invoices.filter((inv) => inv.status === 'pending').length,
      partial: invoices.filter((inv) => inv.status === 'partial').length,
      paid: invoices.filter((inv) => inv.status === 'paid').length,
      overdue: invoices.filter((inv) => inv.status === 'overdue').length,
      cancelled: invoices.filter((inv) => inv.status === 'cancelled').length,
    },
  };
}

export async function listMspInvoices(options: {
  page?: number;
  limit?: number;
  status?: string;
  clientId?: string;
}) {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const offset = (page - 1) * limit;

  const sequelize = getSequelize();
  const replacements: Record<string, unknown> = { limit, offset };
  let where = '1=1';
  if (options.status) {
    where += ' AND i.status = :status';
    replacements.status = options.status;
  }
  if (options.clientId) {
    where += ' AND i.client_id = :clientId';
    replacements.clientId = options.clientId;
  }

  const countRows = await sequelize.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM invoices i WHERE ${where}`,
    { type: QueryTypes.SELECT, replacements }
  );
  const total = Number(countRows[0]?.count ?? 0);

  const rows = await sequelize.query<InvoiceRow>(
    `SELECT i.*, COALESCE(c.company_name, c.name) AS clientName, c.email AS clientEmail, c.service_level AS serviceLevel
     FROM invoices i
     LEFT JOIN clients c ON c.id = i.client_id
     WHERE ${where}
     ORDER BY i.created_at DESC
     LIMIT :limit OFFSET :offset`,
    { type: QueryTypes.SELECT, replacements }
  );

  return {
    invoices: rows.map(serializeInvoice),
    pagination: { total, page, limit, pages: Math.ceil(total / limit) || 0 },
  };
}

export async function listInvoicesForClient(
  clientId: string,
  options: { page?: number; limit?: number; status?: string }
) {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const offset = (page - 1) * limit;
  const sequelize = getSequelize();
  const replacements: Record<string, unknown> = { limit, offset, clientId };
  let where = 'i.client_id = :clientId';
  if (options.status) {
    where += ' AND i.status = :status';
    replacements.status = options.status;
  }

  const countRows = await sequelize.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM invoices i WHERE ${where}`,
    { type: QueryTypes.SELECT, replacements }
  );
  const total = Number(countRows[0]?.count ?? 0);

  const rows = await sequelize.query<InvoiceRow>(
    `SELECT i.*, COALESCE(c.company_name, c.name) AS clientName, c.email AS clientEmail, c.service_level AS serviceLevel
     FROM invoices i
     LEFT JOIN clients c ON c.id = i.client_id
     WHERE ${where}
     ORDER BY i.created_at DESC
     LIMIT :limit OFFSET :offset`,
    { type: QueryTypes.SELECT, replacements }
  );

  return {
    invoices: rows.map(serializeInvoice),
    pagination: { total, page, limit, pages: Math.ceil(total / limit) || 0 },
  };
}

export async function markInvoicePaid(
  invoiceId: string,
  userId: number,
  options?: { paymentDate?: string; paymentMethod?: string; paymentNotes?: string }
) {
  const sequelize = getSequelize();
  const rows = await sequelize.query<InvoiceRow>(
    `SELECT * FROM invoices WHERE id = :id`,
    { type: QueryTypes.SELECT, replacements: { id: invoiceId } }
  );
  const invoice = rows[0];
  if (!invoice) return null;
  if (invoice.status === 'paid') throw new Error('Invoice is already marked as paid');

  const totalAmount = Number(invoice.amount);
  const currentPaid = Number(invoice.paidAmount ?? 0);
  const remaining = totalAmount - currentPaid;
  const paymentDate = options?.paymentDate ?? new Date().toISOString();
  const paymentMethod = options?.paymentMethod ?? 'CASH';
  const now = new Date().toISOString();

  const paymentId = randomUUID();
  await sequelize.query(
    `INSERT INTO payments (id, invoice_id, amount, payment_method, payment_date, processed_by, notes, status, created_at, updated_at)
     VALUES (:id, :invoiceId, :amount, :method, :paymentDate, :processedBy, :notes, 'completed', :now, :now)`,
    {
      replacements: {
        id: paymentId,
        invoiceId,
        amount: remaining,
        method: paymentMethod,
        paymentDate,
        processedBy: String(userId),
        notes: options?.paymentNotes ?? 'Marked as paid via accounting',
        now,
      },
    }
  );

  await sequelize.query(
    `UPDATE invoices SET status = 'paid', paidAmount = :amount, paid_date = :paidDate, updated_at = :now WHERE id = :id`,
    { replacements: { id: invoiceId, amount: totalAmount, paidDate: paymentDate, now } }
  );

  const updated = await sequelize.query<InvoiceRow>(
    `SELECT i.*, COALESCE(c.company_name, c.name) AS clientName, c.email AS clientEmail, c.service_level AS serviceLevel
     FROM invoices i LEFT JOIN clients c ON c.id = i.client_id WHERE i.id = :id`,
    { type: QueryTypes.SELECT, replacements: { id: invoiceId } }
  );

  return serializeInvoice(updated[0]);
}

export async function listInvoicePayments(invoiceId: string) {
  const sequelize = getSequelize();
  const rows = await sequelize.query<PaymentRow>(
    `SELECT * FROM payments WHERE invoice_id = :invoiceId ORDER BY payment_date DESC, created_at DESC`,
    { type: QueryTypes.SELECT, replacements: { invoiceId } }
  );
  return rows.map(serializePayment);
}

export async function addInvoicePayment(
  invoiceId: string,
  userId: number,
  input: {
    amount: number;
    paymentMethod: 'CASH' | 'paypal' | 'bank_transfer' | 'wipay';
    reference?: string;
    notes?: string | null;
    paymentDate?: string;
  }
) {
  const sequelize = getSequelize();
  const invoiceRows = await sequelize.query<InvoiceRow>(`SELECT * FROM invoices WHERE id = :id`, {
    type: QueryTypes.SELECT,
    replacements: { id: invoiceId },
  });
  const invoice = invoiceRows[0];
  if (!invoice) return null;

  const totalAmount = Number(invoice.amount);
  const currentPaid = Number(invoice.paidAmount ?? 0);
  const paymentAmount = Number(input.amount);
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) throw new Error('Payment amount must be greater than 0');

  const newPaid = currentPaid + paymentAmount;
  if (newPaid > totalAmount + 0.0001) {
    throw new Error(
      `Payment amount (${paymentAmount}) would exceed remaining balance (${Math.max(0, totalAmount - currentPaid)})`
    );
  }

  const now = new Date().toISOString();
  const paymentId = randomUUID();
  const paymentDate = input.paymentDate ?? now;

  await sequelize.query(
    `INSERT INTO payments (id, invoice_id, amount, payment_method, payment_date, processed_by, reference, notes, status, created_at, updated_at)
     VALUES (:id, :invoiceId, :amount, :method, :paymentDate, :processedBy, :reference, :notes, 'completed', :now, :now)`,
    {
      replacements: {
        id: paymentId,
        invoiceId,
        amount: paymentAmount,
        method: input.paymentMethod,
        paymentDate,
        processedBy: String(userId),
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        now,
      },
    }
  );

  let newStatus: 'pending' | 'partial' | 'paid' = 'pending';
  let paidDate: string | null = null;
  if (newPaid >= totalAmount - 0.0001) {
    newStatus = 'paid';
    paidDate = paymentDate;
  } else if (newPaid > 0) {
    newStatus = 'partial';
  }

  await sequelize.query(
    `UPDATE invoices SET paidAmount = :paidAmount, status = :status, paid_date = :paidDate, updated_at = :now WHERE id = :id`,
    { replacements: { id: invoiceId, paidAmount: newPaid, status: newStatus, paidDate, now } }
  );

  const paymentRow = await sequelize.query<PaymentRow>(`SELECT * FROM payments WHERE id = :id`, {
    type: QueryTypes.SELECT,
    replacements: { id: paymentId },
  });

  return {
    invoice: await getInvoiceById(invoiceId),
    payment: paymentRow[0] ? serializePayment(paymentRow[0]) : null,
    remainingBalance: Math.max(0, totalAmount - newPaid),
  };
}

export async function deletePayment(paymentId: string) {
  const sequelize = getSequelize();
  const rows = await sequelize.query<PaymentRow>(`SELECT * FROM payments WHERE id = :id`, {
    type: QueryTypes.SELECT,
    replacements: { id: paymentId },
  });
  const payment = rows[0];
  if (!payment) return null;

  const invoiceRows = await sequelize.query<InvoiceRow>(`SELECT * FROM invoices WHERE id = :id`, {
    type: QueryTypes.SELECT,
    replacements: { id: payment.invoice_id },
  });
  const invoice = invoiceRows[0];
  if (!invoice) throw new Error('Invoice not found for payment');

  const totalAmount = Number(invoice.amount);
  const currentPaid = Number(invoice.paidAmount ?? 0);
  const paymentAmount = Number(payment.amount);
  const newPaid = Math.max(0, currentPaid - paymentAmount);
  const now = new Date().toISOString();

  await sequelize.query(`DELETE FROM payments WHERE id = :id`, { replacements: { id: paymentId } });

  let newStatus: 'pending' | 'partial' | 'paid' = 'pending';
  let paidDate: string | null = null;
  if (newPaid >= totalAmount - 0.0001) {
    newStatus = 'paid';
    paidDate = invoice.paid_date;
  } else if (newPaid > 0) {
    newStatus = 'partial';
  }

  await sequelize.query(
    `UPDATE invoices SET paidAmount = :paidAmount, status = :status, paid_date = :paidDate, updated_at = :now WHERE id = :id`,
    { replacements: { id: payment.invoice_id, paidAmount: newPaid, status: newStatus, paidDate, now } }
  );

  return { invoice: await getInvoiceById(payment.invoice_id) };
}

export async function listQuotes(options: {
  page?: number;
  limit?: number;
  status?: string;
  clientId?: string;
}) {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const offset = (page - 1) * limit;
  const sequelize = getSequelize();
  const replacements: Record<string, unknown> = { limit, offset };
  let where = '1=1';
  if (options.status) {
    where += ' AND q.status = :status';
    replacements.status = options.status;
  }
  if (options.clientId) {
    where += ' AND q.client_id = :clientId';
    replacements.clientId = options.clientId;
  }

  const countRows = await sequelize.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM quotes q WHERE ${where}`,
    { type: QueryTypes.SELECT, replacements }
  );
  const total = Number(countRows[0]?.count ?? 0);

  const rows = await sequelize.query<QuoteRow>(
    `SELECT q.*, COALESCE(c.company_name, c.name) AS clientName, c.email AS clientEmail
     FROM quotes q
     LEFT JOIN clients c ON c.id = q.client_id
     WHERE ${where}
     ORDER BY q.created_at DESC
     LIMIT :limit OFFSET :offset`,
    { type: QueryTypes.SELECT, replacements }
  );

  return {
    quotes: rows.map(serializeQuote),
    pagination: { total, page, limit, pages: Math.ceil(total / limit) || 0 },
  };
}

export async function getQuoteById(id: string) {
  const sequelize = getSequelize();
  const rows = await sequelize.query<QuoteRow>(
    `SELECT q.*, COALESCE(c.company_name, c.name) AS clientName, c.email AS clientEmail
     FROM quotes q LEFT JOIN clients c ON c.id = q.client_id WHERE q.id = :id`,
    { type: QueryTypes.SELECT, replacements: { id } }
  );
  return rows[0] ? serializeQuote(rows[0]) : null;
}

export async function generateQuoteNumber(): Promise<string> {
  const sequelize = getSequelize();
  const rows = await sequelize.query<{ quote_number: string }>(
    `SELECT quote_number FROM quotes ORDER BY quote_number DESC LIMIT 1`,
    { type: QueryTypes.SELECT }
  );
  let nextNumber = 1007;
  if (rows[0]?.quote_number) {
    const cdq = rows[0].quote_number.match(/CDQ-(\d+)/);
    const quo = rows[0].quote_number.match(/QUO-(\d+)/);
    if (cdq) nextNumber = parseInt(cdq[1], 10) + 1;
    else if (!quo) nextNumber = 1007;
  }
  return `CDQ-${nextNumber}`;
}

export async function generateInvoiceNumber(): Promise<string> {
  const sequelize = getSequelize();
  const rows = await sequelize.query<{ invoice_number: string }>(
    `SELECT invoice_number FROM invoices ORDER BY invoice_number DESC LIMIT 1`,
    { type: QueryTypes.SELECT }
  );
  let nextNumber = 1;
  if (rows[0]?.invoice_number) {
    const match = rows[0].invoice_number.match(/INV-3806\/3936-(\d+)/);
    if (match) nextNumber = parseInt(match[1], 10) + 1;
  }
  return `INV-3806/3936-${String(nextNumber).padStart(3, '0')}`;
}

export async function createQuote(input: {
  clientId: string;
  title: string;
  amount: number;
  validUntil: string;
  createdBy: number;
  items?: unknown[];
  description?: string;
  terms?: string;
  notes?: string;
  status?: string;
}) {
  const sequelize = getSequelize();
  const id = randomUUID();
  const quoteNumber = await generateQuoteNumber();
  const now = new Date().toISOString();
  const status = input.status ?? 'draft';

  await sequelize.query(
    `INSERT INTO quotes (id, client_id, created_by, quote_number, title, description, amount, currency, status, valid_until, items, terms, notes, created_at, updated_at)
     VALUES (:id, :clientId, :createdBy, :quoteNumber, :title, :description, :amount, 'TTD', :status, :validUntil, :items, :terms, :notes, :now, :now)`,
    {
      replacements: {
        id,
        clientId: input.clientId,
        createdBy: String(input.createdBy),
        quoteNumber,
        title: input.title,
        description: input.description ?? null,
        amount: input.amount,
        status,
        validUntil: input.validUntil,
        items: JSON.stringify(input.items ?? []),
        terms: input.terms ?? null,
        notes: input.notes ?? null,
        now,
      },
    }
  );

  return getQuoteById(id);
}

export type QuoteLineItem = {
  name: string;
  description?: string;
  quantity: number;
  price: number;
  total: number;
};

export function normalizeQuoteItems(items: unknown[]): QuoteLineItem[] {
  return items.map((raw) => {
    const item = raw as Partial<QuoteLineItem>;
    const quantity = Number(item.quantity ?? 1) || 1;
    const price = Number(item.price ?? 0) || 0;
    const total = Number(item.total ?? quantity * price) || quantity * price;
    return {
      name: String(item.name ?? 'Item'),
      description: item.description ? String(item.description) : undefined,
      quantity,
      price,
      total,
    };
  });
}

export function sumQuoteItems(items: QuoteLineItem[]) {
  return Math.round(items.reduce((sum, item) => sum + Number(item.total ?? 0), 0) * 100) / 100;
}

export async function updateQuote(
  id: string,
  updates: Partial<{
    title: string;
    amount: number;
    validUntil: string;
    status: string;
    items: unknown[];
    description: string;
    terms: string;
    notes: string;
  }>
) {
  const existing = await getQuoteById(id);
  if (!existing) return null;
  if (existing.status === 'converted') throw new Error('Cannot edit a converted quote');

  const sequelize = getSequelize();
  const now = new Date().toISOString();
  const fields: string[] = [];
  const replacements: Record<string, unknown> = { id, now };

  if (updates.title !== undefined) {
    fields.push('title = :title');
    replacements.title = updates.title;
  }
  if (updates.amount !== undefined) {
    fields.push('amount = :amount');
    replacements.amount = updates.amount;
  }
  if (updates.validUntil !== undefined) {
    fields.push('valid_until = :validUntil');
    replacements.validUntil = updates.validUntil;
  }
  if (updates.status !== undefined) {
    fields.push('status = :status');
    replacements.status = updates.status;
    if (updates.status === 'accepted') {
      fields.push('accepted_date = :acceptedDate');
      replacements.acceptedDate = now;
    }
  }
  if (updates.description !== undefined) {
    fields.push('description = :description');
    replacements.description = updates.description;
  }
  if (updates.terms !== undefined) {
    fields.push('terms = :terms');
    replacements.terms = updates.terms;
  }
  if (updates.notes !== undefined) {
    fields.push('notes = :notes');
    replacements.notes = updates.notes;
  }
  if (updates.items !== undefined) {
    fields.push('items = :items');
    replacements.items = JSON.stringify(updates.items);
  }

  if (fields.length === 0) return existing;
  fields.push('updated_at = :now');

  await sequelize.query(`UPDATE quotes SET ${fields.join(', ')} WHERE id = :id`, { replacements });
  return getQuoteById(id);
}

export async function deleteQuote(id: string) {
  const existing = await getQuoteById(id);
  if (!existing) return false;
  if (existing.status === 'converted') throw new Error('Cannot delete a converted quote');

  const sequelize = getSequelize();
  await sequelize.query(`DELETE FROM quotes WHERE id = :id`, { replacements: { id } });
  return true;
}

export async function acceptQuote(id: string) {
  const quote = await getQuoteById(id);
  if (!quote) return null;
  if (quote.status !== 'sent' && quote.status !== 'draft') {
    throw new Error('Only draft or sent quotes can be accepted');
  }
  return updateQuote(id, { status: 'accepted' });
}

export async function rejectQuote(id: string, reason?: string) {
  const quote = await getQuoteById(id);
  if (!quote) return null;
  if (quote.status !== 'sent') throw new Error('Only sent quotes can be rejected');

  const updates: { status: 'rejected'; notes?: string } = { status: 'rejected' };
  if (reason) {
    updates.notes = quote.notes ? `${quote.notes}\n\nRejected: ${reason}` : `Rejected: ${reason}`;
  }
  return updateQuote(id, updates);
}

export async function expireQuote(id: string) {
  const quote = await getQuoteById(id);
  if (!quote) return null;
  if (!['draft', 'sent'].includes(quote.status)) {
    throw new Error('Only draft or sent quotes can be expired');
  }
  return updateQuote(id, { status: 'expired' });
}

export async function sendQuoteEmail(id: string, clientEmail?: string, origin?: string) {
  const quote = await getQuoteById(id);
  if (!quote) return null;

  const email = clientEmail || quote.client?.email;
  if (!email) throw new Error('Client email is required');

  const { sendQuoteToClient } = await import('@/lib/quote-email');
  const sent = await sendQuoteToClient(
    { ...quote, items: normalizeQuoteItems(quote.items ?? []) },
    email,
    { origin }
  );
  if (!sent) throw new Error('Failed to send quote email');

  if (quote.status === 'draft') {
    return updateQuote(id, { status: 'sent' });
  }
  return quote;
}

export async function sendInvoiceEmail(
  id: string,
  options?: {
    clientEmail?: string;
    origin?: string;
    type?: 'created' | 'reminder' | 'overdue' | 'paid' | 'partial' | 'updated';
    paymentAmount?: number;
  }
) {
  const invoice = await getInvoiceById(id);
  if (!invoice) return null;

  const email = options?.clientEmail || invoice.client?.email;
  if (!email) throw new Error('Client email is required');

  const { sendInvoiceToClient } = await import('@/lib/invoice-email');
  const sent = await sendInvoiceToClient(invoice, email, {
    origin: options?.origin,
    type: options?.type ?? 'created',
    paymentAmount: options?.paymentAmount,
  });
  if (!sent) throw new Error('Failed to send invoice email');
  return invoice;
}

export async function convertQuoteToInvoice(
  id: string,
  createdBy: number,
  options: { dueDate: string; billingCycle?: string; paymentGateway?: string }
) {
  const quote = await getQuoteById(id);
  if (!quote) return null;
  if (quote.status !== 'accepted') throw new Error('Only accepted quotes can be converted to invoices');

  const sequelize = getSequelize();
  const invoiceId = randomUUID();
  const invoiceNumber = await generateInvoiceNumber();
  const now = new Date().toISOString();

  await sequelize.query(
    `INSERT INTO invoices (id, client_id, created_by, invoice_number, amount, paidAmount, currency, status, due_date, billing_cycle, payment_gateway, description, items, created_at, updated_at)
     VALUES (:id, :clientId, :createdBy, :invoiceNumber, :amount, 0, :currency, 'pending', :dueDate, :billingCycle, :paymentGateway, :description, :items, :now, :now)`,
    {
      replacements: {
        id: invoiceId,
        clientId: quote.clientId,
        createdBy,
        invoiceNumber,
        amount: quote.amount,
        currency: quote.currency,
        dueDate: options.dueDate,
        billingCycle: options.billingCycle ?? 'immediately',
        paymentGateway: options.paymentGateway ?? 'CASH',
        description: `Converted from Quote ${quote.quoteNumber}: ${quote.description ?? quote.title}`,
        items: JSON.stringify(quote.items ?? []),
        now,
      },
    }
  );

  await sequelize.query(
    `UPDATE quotes SET status = 'converted', converted_to_invoice_id = :invoiceId, updated_at = :now WHERE id = :id`,
    { replacements: { id, invoiceId, now } }
  );

  const rows = await sequelize.query<InvoiceRow>(
    `SELECT i.*, COALESCE(c.company_name, c.name) AS clientName, c.email AS clientEmail, c.service_level AS serviceLevel
     FROM invoices i LEFT JOIN clients c ON c.id = i.client_id WHERE i.id = :id`,
    { type: QueryTypes.SELECT, replacements: { id: invoiceId } }
  );

  return { quote: await getQuoteById(id), invoice: serializeInvoice(rows[0]) };
}

export { serializeInvoice, serializeQuote, parseItems };
