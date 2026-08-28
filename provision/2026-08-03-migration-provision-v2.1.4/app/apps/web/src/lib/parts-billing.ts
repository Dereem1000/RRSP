import { QueryTypes } from 'sequelize';
import {
  acceptQuote,
  convertQuoteToInvoice,
  createQuote,
  getInvoiceById,
  getQuoteById,
  markInvoicePaid,
  normalizeQuoteItems,
  sumQuoteItems,
  updateQuote,
  type QuoteLineItem,
} from '@/lib/accounting';
import { getSequelize } from '@/lib/db';
import { getWiPaySettings, isWiPayConfigured } from '@/lib/wipay-settings';
import { createWiPayPaymentUrl } from '@/lib/wipay';

export type PartsPackageBillingStatus = 'none' | 'quoted' | 'awaiting_payment' | 'paid';

export type PartsPackageBilling = {
  deliveryPackageId: string;
  quoteId: string | null;
  invoiceId: string | null;
  billingStatus: PartsPackageBillingStatus;
  quoteNumber: string | null;
  invoiceNumber: string | null;
  amountDue: number | null;
  paymentUnpaid: boolean;
  quoteStatus: string | null;
  invoiceStatus: string | null;
  /** Buyer chose cash on delivery; staff still confirms with Mark cash paid. */
  codRequested: boolean;
  codRequestedAt: string | null;
};

type PackageRow = {
  id: string;
  buyerClientId: string | null;
  buyerKey: string;
  maxDistanceMeters: number | null;
  deliveryFee: number;
  quoteId: string | null;
  invoiceId: string | null;
  billingStatus: string | null;
  codRequestedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

type PackageRequestRow = {
  id: string;
  requestNumber: string;
  itemName: string;
  requestedQuantity: number;
  listedUnitPrice: number | null;
  unitPrice: number;
  deliveryFee: number | null;
  status: string;
};

const EDITABLE_QUOTE_STATUSES = new Set(['draft', 'sent']);

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

export function isUnpaidBillingStatus(status: string | null | undefined): boolean {
  return status === 'quoted' || status === 'awaiting_payment';
}

export async function getDeliveryPackageById(packageId: string): Promise<PackageRow | null> {
  const sequelize = getSequelize();
  const rows = await sequelize.query<PackageRow>(
    `SELECT * FROM parts_delivery_packages WHERE id = :id LIMIT 1`,
    { type: QueryTypes.SELECT, replacements: { id: packageId } }
  );
  return rows[0] ?? null;
}

/** True when package quote is accepted/converted (or already paid) — do not share/mutate. */
export async function isPackageBillingLocked(packageId: string): Promise<boolean> {
  const pkg = await getDeliveryPackageById(packageId);
  if (!pkg) return false;
  if (pkg.billingStatus === 'paid' || pkg.billingStatus === 'awaiting_payment') return true;
  const quoteId = pkg.quoteId?.trim();
  if (!quoteId) return false;
  const quote = await getQuoteById(quoteId);
  if (!quote) return false;
  return !EDITABLE_QUOTE_STATUSES.has(quote.status);
}

async function listActivePackageRequests(packageId: string): Promise<PackageRequestRow[]> {
  const sequelize = getSequelize();
  return sequelize.query<PackageRequestRow>(
    `
      SELECT id, requestNumber, itemName, requestedQuantity, listedUnitPrice, unitPrice, deliveryFee, status
      FROM parts_requests
      WHERE deliveryPackageId = :packageId
        AND status NOT IN ('cancelled')
      ORDER BY pendingDeliveryAt ASC, createdAt ASC
    `,
    { type: QueryTypes.SELECT, replacements: { packageId } }
  );
}

function buildPackageQuoteItems(
  requests: PackageRequestRow[],
  packageDeliveryFee: number
): QuoteLineItem[] {
  const items: QuoteLineItem[] = [];
  for (const row of requests) {
    const qty = Number(row.requestedQuantity ?? 0) || 0;
    if (qty <= 0) continue;
    const listed = Number(row.listedUnitPrice);
    const price = Number.isFinite(listed) && listed > 0 ? listed : Number(row.unitPrice ?? 0) || 0;
    const total = roundMoney(qty * price);
    items.push({
      name: row.itemName,
      description: `Parts request ${row.requestNumber}`,
      quantity: qty,
      price,
      total,
    });
  }

  const fee = Number(packageDeliveryFee) || 0;
  if (fee > 0) {
    items.push({
      name: 'Delivery fee',
      description: 'Parts delivery package',
      quantity: 1,
      price: fee,
      total: fee,
    });
  }

  return normalizeQuoteItems(items);
}

async function updatePackageBillingFields(
  packageId: string,
  fields: {
    quoteId?: string | null;
    invoiceId?: string | null;
    billingStatus?: PartsPackageBillingStatus;
    codRequestedAt?: string | null;
  }
) {
  const sequelize = getSequelize();
  const now = new Date().toISOString();
  const sets: string[] = ['updatedAt = :now'];
  const replacements: Record<string, unknown> = { packageId, now };

  if (fields.quoteId !== undefined) {
    sets.push('quoteId = :quoteId');
    replacements.quoteId = fields.quoteId;
  }
  if (fields.invoiceId !== undefined) {
    sets.push('invoiceId = :invoiceId');
    replacements.invoiceId = fields.invoiceId;
  }
  if (fields.billingStatus !== undefined) {
    sets.push('billingStatus = :billingStatus');
    replacements.billingStatus = fields.billingStatus;
  }
  if (fields.codRequestedAt !== undefined) {
    sets.push('codRequestedAt = :codRequestedAt');
    replacements.codRequestedAt = fields.codRequestedAt;
  }

  await sequelize.query(
    `UPDATE parts_delivery_packages SET ${sets.join(', ')} WHERE id = :packageId`,
    { replacements }
  );
}

/**
 * Create or rebuild the package quote from current package requests + delivery fee.
 * Skips when no buyer client, or when quote is already accepted/converted/paid.
 */
export async function syncPackageQuote(input: {
  packageId: string;
  createdBy?: number;
}): Promise<PartsPackageBilling | null> {
  const pkg = await getDeliveryPackageById(input.packageId);
  if (!pkg) return null;

  const buyerClientId = pkg.buyerClientId?.trim() || null;
  if (!buyerClientId) {
    await updatePackageBillingFields(pkg.id, { billingStatus: 'none' });
    return serializePackageBilling(pkg, null, null);
  }

  if (pkg.billingStatus === 'paid') {
    const invoice = pkg.invoiceId ? await getInvoiceById(pkg.invoiceId) : null;
    const quote = pkg.quoteId ? await getQuoteById(pkg.quoteId) : null;
    if (invoice?.id && invoice.status === 'paid') {
      try {
        const { allocatePartsInvoicePayment } = await import('@/lib/parts-seller-payables');
        await allocatePartsInvoicePayment(invoice.id);
      } catch (error) {
        console.error('Failed to allocate parts seller payables on sync', invoice.id, error);
      }
    }
    return serializePackageBilling(pkg, quote, invoice);
  }

  const existingQuote = pkg.quoteId ? await getQuoteById(pkg.quoteId) : null;
  if (existingQuote && !EDITABLE_QUOTE_STATUSES.has(existingQuote.status)) {
    const invoice = pkg.invoiceId
      ? await getInvoiceById(pkg.invoiceId)
      : existingQuote.convertedToInvoiceId
        ? await getInvoiceById(existingQuote.convertedToInvoiceId)
        : null;
    return serializePackageBilling(
      {
        ...pkg,
        invoiceId: pkg.invoiceId || existingQuote.convertedToInvoiceId || null,
        billingStatus: invoice?.status === 'paid' ? 'paid' : 'awaiting_payment',
      },
      existingQuote,
      invoice
    );
  }

  const requests = await listActivePackageRequests(pkg.id);
  if (!requests.length) {
    return serializePackageBilling(pkg, existingQuote, null);
  }

  const items = buildPackageQuoteItems(requests, Number(pkg.deliveryFee) || 0);
  const amount = sumQuoteItems(items);
  const createdBy = input.createdBy ?? 1;
  const validUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const title = `Parts delivery ${requests[0].requestNumber}`;
  const description = `Parts package (${requests.length} line${requests.length === 1 ? '' : 's'})`;

  let quote = existingQuote;
  if (!quote) {
    quote = await createQuote({
      clientId: buyerClientId,
      title,
      amount,
      validUntil,
      createdBy,
      items,
      description,
      status: 'sent',
      notes: `Auto-created from parts delivery package ${pkg.id}`,
    });
    if (!quote) throw new Error('Failed to create parts quote');
    await updatePackageBillingFields(pkg.id, {
      quoteId: quote.id,
      billingStatus: 'quoted',
    });
  } else {
    quote = await updateQuote(quote.id, {
      title,
      amount,
      items,
      description,
      validUntil,
      status: quote.status === 'draft' ? 'sent' : quote.status,
    });
    await updatePackageBillingFields(pkg.id, {
      quoteId: quote!.id,
      billingStatus: 'quoted',
    });
  }

  const refreshed = await getDeliveryPackageById(pkg.id);
  return serializePackageBilling(refreshed ?? pkg, quote, null);
}

function serializePackageBilling(
  pkg: PackageRow,
  quote: Awaited<ReturnType<typeof getQuoteById>> | null,
  invoice: Awaited<ReturnType<typeof getInvoiceById>> | null
): PartsPackageBilling {
  const billingStatus = (pkg.billingStatus as PartsPackageBillingStatus) || 'none';
  const amountDue = invoice
    ? roundMoney(Math.max(0, Number(invoice.amount) - Number(invoice.paidAmount ?? 0)))
    : quote
      ? roundMoney(Number(quote.amount) || 0)
      : null;

  return {
    deliveryPackageId: pkg.id,
    quoteId: pkg.quoteId?.trim() || quote?.id || null,
    invoiceId: pkg.invoiceId?.trim() || invoice?.id || null,
    billingStatus,
    quoteNumber: quote?.quoteNumber ?? null,
    invoiceNumber: invoice?.invoiceNumber ?? null,
    amountDue,
    paymentUnpaid: isUnpaidBillingStatus(billingStatus),
    quoteStatus: quote?.status ?? null,
    invoiceStatus: invoice?.status ?? null,
    codRequested: Boolean(pkg.codRequestedAt?.trim()),
    codRequestedAt: pkg.codRequestedAt?.trim() || null,
  };
}

export async function getPackageBillingState(
  packageId: string
): Promise<PartsPackageBilling | null> {
  const pkg = await getDeliveryPackageById(packageId);
  if (!pkg) return null;
  const quote = pkg.quoteId ? await getQuoteById(pkg.quoteId) : null;
  const invoice = pkg.invoiceId ? await getInvoiceById(pkg.invoiceId) : null;
  return serializePackageBilling(pkg, quote, invoice);
}

export async function attachPackageBillingToRequests<
  T extends { deliveryPackageId?: string | null },
>(requests: T[]): Promise<Array<T & { billing?: PartsPackageBilling | null }>> {
  const packageIds = [
    ...new Set(
      requests
        .map((r) => r.deliveryPackageId?.trim())
        .filter((id): id is string => Boolean(id))
    ),
  ];
  if (!packageIds.length) {
    return requests.map((r) => ({ ...r, billing: null }));
  }

  // Repair packages that were fulfilled before quote sync succeeded (or FK blocked create).
  for (const packageId of packageIds) {
    const pkg = await getDeliveryPackageById(packageId);
    if (!pkg) continue;
    if (pkg.quoteId?.trim() && pkg.billingStatus && pkg.billingStatus !== 'none') continue;
    try {
      await syncPackageQuote({ packageId: pkg.id, createdBy: 1 });
    } catch (error) {
      console.error('Failed to repair parts package quote', packageId, error);
    }
  }

  const packages: PackageRow[] = [];
  for (const id of packageIds) {
    const pkg = await getDeliveryPackageById(id);
    if (pkg) packages.push(pkg);
  }
  const byId = new Map(packages.map((p) => [p.id, p]));

  const quoteIds = packages.map((p) => p.quoteId?.trim()).filter(Boolean) as string[];
  const invoiceIds = packages.map((p) => p.invoiceId?.trim()).filter(Boolean) as string[];

  const quotes = await Promise.all(quoteIds.map((id) => getQuoteById(id)));
  const invoices = await Promise.all(invoiceIds.map((id) => getInvoiceById(id)));
  const quoteById = new Map(quotes.filter(Boolean).map((q) => [q!.id, q!]));
  const invoiceById = new Map(invoices.filter(Boolean).map((i) => [i!.id, i!]));

  return requests.map((request) => {
    const packageId = request.deliveryPackageId?.trim();
    if (!packageId) return { ...request, billing: null };
    const pkg = byId.get(packageId);
    if (!pkg) return { ...request, billing: null };
    const quote = pkg.quoteId ? quoteById.get(pkg.quoteId) ?? null : null;
    const invoice = pkg.invoiceId ? invoiceById.get(pkg.invoiceId) ?? null : null;
    return { ...request, billing: serializePackageBilling(pkg, quote, invoice) };
  });
}

export async function acceptPartsPackageQuote(input: {
  packageId: string;
  clientId: string;
  createdBy: number;
  /** Prefer CASH when buyer chooses COD. */
  paymentGateway?: 'CASH' | 'WiPay';
}): Promise<{ billing: PartsPackageBilling; quote: NonNullable<Awaited<ReturnType<typeof getQuoteById>>>; invoice: NonNullable<Awaited<ReturnType<typeof getInvoiceById>>> }> {
  const pkg = await getDeliveryPackageById(input.packageId);
  if (!pkg) throw new Error('Delivery package not found');
  if (pkg.buyerClientId && pkg.buyerClientId !== input.clientId) {
    throw new Error('Access denied');
  }
  if (!pkg.quoteId) throw new Error('No quote linked to this package');

  let quote = await getQuoteById(pkg.quoteId);
  if (!quote) throw new Error('Quote not found');
  if (quote.clientId !== input.clientId) throw new Error('Access denied');

  if (quote.status === 'converted' && quote.convertedToInvoiceId) {
    const invoice = await getInvoiceById(quote.convertedToInvoiceId);
    if (!invoice) throw new Error('Invoice not found');
    await updatePackageBillingFields(pkg.id, {
      invoiceId: invoice.id,
      billingStatus: invoice.status === 'paid' ? 'paid' : 'awaiting_payment',
    });
    if (invoice.status === 'paid') {
      await markPartsPackagePaidFromInvoice(invoice.id);
    }
    const billing = await getPackageBillingState(pkg.id);
    return { billing: billing!, quote, invoice };
  }

  if (quote.status !== 'accepted') {
    if (quote.status !== 'draft' && quote.status !== 'sent') {
      throw new Error('Only draft or sent quotes can be accepted');
    }
    if (new Date(quote.validUntil) < new Date()) {
      throw new Error('Quote has expired');
    }
    quote = await acceptQuote(quote.id);
    if (!quote) throw new Error('Failed to accept quote');
  }

  const settings = await getWiPaySettings();
  const paymentGateway =
    input.paymentGateway ?? (isWiPayConfigured(settings) ? 'WiPay' : 'CASH');
  const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const converted = await convertQuoteToInvoice(quote.id, input.createdBy, {
    dueDate,
    billingCycle: 'immediately',
    paymentGateway,
  });
  if (!converted?.invoice) throw new Error('Failed to create invoice from quote');

  await updatePackageBillingFields(pkg.id, {
    invoiceId: converted.invoice.id,
    billingStatus: 'awaiting_payment',
  });

  const billing = await getPackageBillingState(pkg.id);
  return {
    billing: billing!,
    quote: converted.quote ?? quote,
    invoice: converted.invoice,
  };
}

/** Buyer chooses cash on delivery — accept quote / create invoice as CASH, notify staff. */
export async function requestPartsPackageCod(input: {
  packageId: string;
  clientId: string;
  createdBy: number;
}): Promise<PartsPackageBilling> {
  const pkg = await getDeliveryPackageById(input.packageId);
  if (!pkg) throw new Error('Delivery package not found');
  if (pkg.buyerClientId && pkg.buyerClientId !== input.clientId) {
    throw new Error('Access denied');
  }
  if (pkg.billingStatus === 'paid') {
    throw new Error('This package is already paid');
  }

  if (!pkg.quoteId) {
    await syncPackageQuote({ packageId: pkg.id, createdBy: input.createdBy });
  }

  const current = await getPackageBillingState(pkg.id);
  if (!current?.quoteId && !current?.invoiceId) {
    throw new Error('No quote available for this package yet');
  }

  if (current.billingStatus === 'quoted' || !current.invoiceId) {
    await acceptPartsPackageQuote({
      packageId: pkg.id,
      clientId: input.clientId,
      createdBy: input.createdBy,
      paymentGateway: 'CASH',
    });
  }

  const now = new Date().toISOString();
  await updatePackageBillingFields(pkg.id, { codRequestedAt: now });

  const billing = await getPackageBillingState(pkg.id);
  if (!billing) throw new Error('Package billing state missing');

  try {
    const { NoticeBoard } = await import('@/lib/db');
    await NoticeBoard.create({
      title: 'Parts COD requested',
      content: `Buyer requested cash on delivery for parts package${
        billing.invoiceNumber ? ` (invoice ${billing.invoiceNumber})` : ''
      }${billing.amountDue != null ? ` — amount due $${billing.amountDue.toFixed(2)}` : ''}. Confirm cash on pickup with Mark cash paid.`,
      authorId: 1,
      priority: 'high',
      category: 'parts',
      targetAudience: 'all',
      targetRoles: ['admin', 'technician'],
      targetUsers: [],
      isPinned: false,
      isActive: true,
      publishAt: new Date(),
      attachments: [],
      tags: ['automated', 'parts-catalog', 'cod'],
    });
  } catch (error) {
    console.error('Failed to create COD staff notice', error);
  }

  const { touchPartsCatalogActivity } = await import('@/lib/parts-catalog');
  await touchPartsCatalogActivity('parts-cod-requested');

  return billing;
}

export async function createPartsPackagePayUrl(input: {
  packageId: string;
  clientId: string;
  origin?: string;
}): Promise<{ url: string; invoiceId: string }> {
  const billing = await getPackageBillingState(input.packageId);
  if (!billing?.invoiceId) {
    throw new Error('Accept the quote first to generate an invoice before paying online');
  }

  const invoice = await getInvoiceById(billing.invoiceId);
  if (!invoice || invoice.clientId !== input.clientId) {
    throw new Error('Invoice not found');
  }
  if (invoice.status === 'paid' || invoice.status === 'cancelled') {
    throw new Error('This invoice cannot be paid online');
  }

  const remaining = roundMoney(
    Math.max(0, Number(invoice.amount) - Number(invoice.paidAmount ?? 0))
  );
  if (remaining <= 0) throw new Error('This invoice is already paid');

  const settings = await getWiPaySettings();
  if (!isWiPayConfigured(settings)) {
    throw new Error('Online payments are not available right now');
  }

  const { Client } = await import('@/lib/db');
  const client = await Client.findByPk(input.clientId, {
    attributes: ['id', 'name', 'companyName', 'email', 'phone'],
  });
  if (!client) throw new Error('Client not found');

  const { url } = await createWiPayPaymentUrl(
    {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      clientId: input.clientId,
      amount: remaining,
      currency: invoice.currency || 'TTD',
      customerEmail: client.email,
      customerName: client.companyName || client.name,
      customerPhone: client.phone,
    },
    input.origin
  );

  return { url, invoiceId: invoice.id };
}

/** Staff COD: accept+convert if needed, then mark invoice paid as cash. */
export async function markPartsPackageCashPaid(input: {
  packageId: string;
  processedBy: number;
}): Promise<PartsPackageBilling> {
  const pkg = await getDeliveryPackageById(input.packageId);
  if (!pkg) throw new Error('Delivery package not found');
  const buyerClientId = pkg.buyerClientId?.trim();
  if (!buyerClientId) throw new Error('Package has no buyer client for billing');

  let invoiceId = pkg.invoiceId?.trim() || null;

  if (!invoiceId) {
    if (!pkg.quoteId) {
      await syncPackageQuote({ packageId: pkg.id, createdBy: input.processedBy });
    }
    const accepted = await acceptPartsPackageQuote({
      packageId: pkg.id,
      clientId: buyerClientId,
      createdBy: input.processedBy,
    });
    invoiceId = accepted.invoice.id;
  }

  const invoice = await getInvoiceById(invoiceId);
  if (!invoice) throw new Error('Invoice not found');

  if (invoice.status !== 'paid') {
    await markInvoicePaid(invoiceId, input.processedBy, {
      paymentMethod: 'CASH',
      paymentNotes: 'Parts delivery package — cash payment',
    });
  }

  await markPartsPackagePaidFromInvoice(invoiceId);
  const billing = await getPackageBillingState(pkg.id);
  if (!billing) throw new Error('Package billing state missing');
  return billing;
}

export async function markPartsPackagePaidFromInvoice(invoiceId: string): Promise<number> {
  const sequelize = getSequelize();
  const now = new Date().toISOString();
  const [result] = await sequelize.query(
    `
      UPDATE parts_delivery_packages
      SET billingStatus = 'paid', updatedAt = :now
      WHERE invoiceId = :invoiceId
        AND (billingStatus IS NULL OR billingStatus != 'paid')
    `,
    { replacements: { invoiceId, now } }
  );
  const affected =
    typeof result === 'object' && result && 'changes' in result
      ? Number((result as { changes?: number }).changes ?? 0)
      : 0;

  // Sequelize sqlite may not return changes; also update by matching any unpaid packages.
  await sequelize.query(
    `
      UPDATE parts_delivery_packages
      SET billingStatus = 'paid', updatedAt = :now
      WHERE invoiceId = :invoiceId
    `,
    { replacements: { invoiceId, now } }
  );

  try {
    const { allocatePartsInvoicePayment } = await import('@/lib/parts-seller-payables');
    await allocatePartsInvoicePayment(invoiceId);
  } catch (error) {
    console.error('Failed to allocate parts seller payables', invoiceId, error);
  }

  return affected;
}
