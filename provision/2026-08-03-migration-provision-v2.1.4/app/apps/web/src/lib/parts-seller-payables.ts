import { randomUUID } from 'crypto';
import { QueryTypes } from 'sequelize';
import { createInvoice } from '@/lib/accounting';
import { Client, getSequelize } from '@/lib/db';
import {
  getOrCreatePlatformPartsClient,
  isPartsCatalogPlatformClient,
} from '@/lib/parts-catalog';
import { resolveClientActivationFeatures } from '@/lib/clients';
import { ensureRrspDatabase, getShopClientModel, runWithRrspDb } from '@/lib/rrsp-db';

export type SellerPayableStatus = 'owed' | 'paid_out';

export type SellerPayableView = {
  id: string;
  sellerClientId: string;
  sellerName: string | null;
  buyerClientId: string | null;
  buyerName: string | null;
  deliveryPackageId: string;
  buyerInvoiceId: string;
  buyerInvoiceNumber: string | null;
  /** Full buyer CD invoice total (listed prices + delivery). */
  buyerInvoiceAmount: number | null;
  partsRequestIds: string[];
  /** Amount CD remits to the seller (unitPrice × qty). */
  sellerAmount: number;
  /** Alias of sellerAmount — payout line total. */
  payoutTotal: number;
  /** Buyer-facing line total for these items (listedUnitPrice × qty), excluding delivery. */
  listedLineTotal: number;
  cdMarkupAmount: number;
  deliveryAmountAllocated: number;
  status: SellerPayableStatus;
  buyerPaidAt: string | null;
  paidOutAt: string | null;
  paidOutBy: string | null;
  notes: string | null;
  rrspInvoiceId: string | null;
  creditNoteId: string | null;
  creditNoteNumber: string | null;
  markupPercent: number | null;
  createdAt: string;
  updatedAt: string;
};

type PackageRow = {
  id: string;
  buyerClientId: string | null;
  deliveryFee: number;
  invoiceId: string | null;
  billingStatus: string | null;
};

type RequestLine = {
  id: string;
  supplierClientId: string;
  buyerClientId: string | null;
  requestNumber: string;
  itemName: string;
  requestedQuantity: number;
  unitPrice: number;
  listedUnitPrice: number | null;
  status: string;
  deliveryPackageId: string | null;
};

type PayableRow = {
  id: string;
  sellerClientId: string;
  buyerClientId: string | null;
  deliveryPackageId: string;
  buyerInvoiceId: string;
  partsRequestIds: string;
  sellerAmount: number;
  cdMarkupAmount: number;
  deliveryAmountAllocated: number;
  status: string;
  buyerPaidAt: string | null;
  paidOutAt: string | null;
  paidOutBy: string | null;
  notes: string | null;
  rrspInvoiceId: string | null;
  creditNoteId?: string | null;
  createdAt: string;
  updatedAt: string;
  sellerName?: string | null;
  sellerCompanyName?: string | null;
  buyerName?: string | null;
  buyerCompanyName?: string | null;
  buyerInvoiceNumber?: string | null;
  buyerInvoiceAmount?: number | null;
  creditNoteNumber?: string | null;
};

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function parseIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => String(x)).filter(Boolean);
  } catch {
    return [];
  }
}

export async function ensurePartsSellerPayablesSchema() {
  const sequelize = getSequelize();
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS parts_seller_payables (
      id TEXT PRIMARY KEY,
      sellerClientId TEXT NOT NULL,
      buyerClientId TEXT,
      deliveryPackageId TEXT NOT NULL,
      buyerInvoiceId TEXT NOT NULL,
      partsRequestIds TEXT NOT NULL DEFAULT '[]',
      sellerAmount REAL NOT NULL DEFAULT 0,
      cdMarkupAmount REAL NOT NULL DEFAULT 0,
      deliveryAmountAllocated REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'owed',
      buyerPaidAt TEXT,
      paidOutAt TEXT,
      paidOutBy TEXT,
      notes TEXT,
      rrspInvoiceId TEXT,
      creditNoteId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS parts_seller_payables_seller_status
      ON parts_seller_payables (sellerClientId, status)
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS parts_seller_payables_invoice
      ON parts_seller_payables (buyerInvoiceId)
  `);
  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS parts_seller_payables_invoice_seller
      ON parts_seller_payables (buyerInvoiceId, sellerClientId)
  `);
  // Existing DBs — add creditNoteId when missing.
  const cols = await sequelize.query<{ name: string }>(`PRAGMA table_info(parts_seller_payables)`, {
    type: QueryTypes.SELECT,
  });
  if (!cols.some((c) => c.name === 'creditNoteId')) {
    await sequelize.query(`ALTER TABLE parts_seller_payables ADD COLUMN creditNoteId TEXT`);
  }
}

function serializePayable(row: PayableRow): SellerPayableView {
  const sellerAmount = roundMoney(Number(row.sellerAmount) || 0);
  const cdMarkupAmount = roundMoney(Number(row.cdMarkupAmount) || 0);
  const listedLineTotal = roundMoney(sellerAmount + cdMarkupAmount);
  const markupPercent =
    listedLineTotal > 0 ? roundMoney((cdMarkupAmount / listedLineTotal) * 100) : 0;
  return {
    id: row.id,
    sellerClientId: row.sellerClientId,
    sellerName:
      row.sellerCompanyName?.trim() || row.sellerName?.trim() || null,
    buyerClientId: row.buyerClientId,
    buyerName: row.buyerCompanyName?.trim() || row.buyerName?.trim() || null,
    deliveryPackageId: row.deliveryPackageId,
    buyerInvoiceId: row.buyerInvoiceId,
    buyerInvoiceNumber: row.buyerInvoiceNumber?.trim() || null,
    buyerInvoiceAmount:
      row.buyerInvoiceAmount == null ? null : roundMoney(Number(row.buyerInvoiceAmount) || 0),
    partsRequestIds: parseIds(row.partsRequestIds),
    sellerAmount,
    payoutTotal: sellerAmount,
    listedLineTotal,
    cdMarkupAmount,
    deliveryAmountAllocated: roundMoney(Number(row.deliveryAmountAllocated) || 0),
    status: row.status === 'paid_out' ? 'paid_out' : 'owed',
    buyerPaidAt: row.buyerPaidAt,
    paidOutAt: row.paidOutAt,
    paidOutBy: row.paidOutBy,
    notes: row.notes,
    rrspInvoiceId: row.rrspInvoiceId,
    creditNoteId: row.creditNoteId?.trim() || null,
    creditNoteNumber: row.creditNoteNumber?.trim() || null,
    markupPercent,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function sellerHasRrspFeature(sellerClientId: string): Promise<boolean> {
  const client = await Client.findByPk(sellerClientId, {
    attributes: ['id', 'features', 'servicePlanData', 'email', 'phone', 'address', 'name', 'companyName'],
  });
  if (!client) return false;
  try {
    const features = await resolveClientActivationFeatures(client);
    return features.includes('rrsp');
  } catch {
    const raw = Array.isArray(client.features) ? client.features : [];
    return raw.includes('rrsp');
  }
}

async function getOrCreateMarketplaceShopClient() {
  const ShopClient = getShopClientModel();
  const email = 'marketplace-payouts@computerdynamics.local';
  const existing = await ShopClient.findOne({ where: { email } });
  if (existing) return existing;
  const now = new Date().toISOString();
  return ShopClient.create({
    id: randomUUID(),
    name: 'Computer Dynamics Marketplace',
    companyName: 'Computer Dynamics',
    email,
    status: 'active',
    supportTier: 'silver',
    isActive: true,
    createdAt: now,
    updatedAt: now,
    features: [],
  } as never);
}

async function mirrorSellerShareToRrsp(input: {
  sellerClientId: string;
  sellerAmount: number;
  deliveryPackageId: string;
  buyerInvoiceId: string;
  itemLines: Array<{ name: string; quantity: number; price: number; total: number }>;
}): Promise<string | null> {
  if (input.sellerAmount <= 0) return null;
  if (!(await sellerHasRrspFeature(input.sellerClientId))) return null;

  try {
    await ensureRrspDatabase(input.sellerClientId);
    return await runWithRrspDb(input.sellerClientId, async () => {
      const shopClient = await getOrCreateMarketplaceShopClient();
      const shopClientId = String((shopClient as unknown as { id: string }).id);
      // Due when CD remits — stays pending until staff marks the CD payable paid out.
      const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const invoice = await createInvoice({
        clientId: shopClientId,
        amount: input.sellerAmount,
        dueDate,
        createdBy: 1,
        status: 'pending',
        billingCycle: 'immediately',
        paymentGateway: 'CASH',
        description: `Awaiting CD marketplace payout — parts sold via Computer Dynamics (package ${input.deliveryPackageId})`,
        items: input.itemLines,
      });
      return invoice?.id ?? null;
    });
  } catch (error) {
    console.error('Failed to mirror seller share into RRSP accounting', input.sellerClientId, error);
    return null;
  }
}

async function markMirroredRrspInvoicePaid(
  sellerClientId: string,
  rrspInvoiceId: string,
  staffUserId: number
): Promise<void> {
  const invoiceId = rrspInvoiceId.trim();
  if (!sellerClientId.trim() || !invoiceId) return;
  try {
    await ensureRrspDatabase(sellerClientId);
    await runWithRrspDb(sellerClientId, async () => {
      const { markInvoicePaid, getInvoiceById } = await import('@/lib/accounting');
      const existing = await getInvoiceById(invoiceId);
      if (!existing || existing.status === 'paid' || existing.status === 'cancelled') return;
      await markInvoicePaid(invoiceId, staffUserId, {
        paymentMethod: 'CASH',
        paymentNotes: 'CD marketplace payout received',
      });
    });
  } catch (error) {
    console.error('Failed to mark mirrored RRSP invoice paid', sellerClientId, invoiceId, error);
  }
}

/**
 * After a parts buyer invoice is paid, create seller payables (idempotent).
 * CD revenue from the package is only markup + delivery — not platform COGS or external seller shares.
 */
export async function allocatePartsInvoicePayment(invoiceId: string): Promise<SellerPayableView[]> {
  await ensurePartsSellerPayablesSchema();
  const sequelize = getSequelize();
  const trimmedInvoiceId = invoiceId.trim();
  if (!trimmedInvoiceId) return [];

  const packages = await sequelize.query<PackageRow>(
    `SELECT * FROM parts_delivery_packages WHERE invoiceId = :invoiceId`,
    { type: QueryTypes.SELECT, replacements: { invoiceId: trimmedInvoiceId } }
  );
  if (!packages.length) return [];

  const platform = await getOrCreatePlatformPartsClient();
  const platformId = String(platform.id);
  const invoicePaidRows = await sequelize.query<{ paid_date: string | null }>(
    `SELECT paid_date FROM invoices WHERE id = :id LIMIT 1`,
    { type: QueryTypes.SELECT, replacements: { id: trimmedInvoiceId } }
  );
  const buyerPaidAt = invoicePaidRows[0]?.paid_date?.trim() || new Date().toISOString();
  const created: SellerPayableView[] = [];

  for (const pkg of packages) {
    const lines = await sequelize.query<RequestLine>(
      `
        SELECT id, supplierClientId, buyerClientId, requestNumber, itemName,
               requestedQuantity, unitPrice, listedUnitPrice, status, deliveryPackageId
        FROM parts_requests
        WHERE deliveryPackageId = :packageId
          AND status NOT IN ('cancelled')
        ORDER BY pendingDeliveryAt ASC, createdAt ASC
      `,
      { type: QueryTypes.SELECT, replacements: { packageId: pkg.id } }
    );
    if (!lines.length) {
      await recomputePartsPackageCdRevenue(pkg.id);
      continue;
    }

    type Acc = {
      requestIds: string[];
      sellerAmount: number;
      cdMarkupAmount: number;
      itemLines: Array<{ name: string; quantity: number; price: number; total: number; description?: string }>;
    };
    const bySeller = new Map<string, Acc>();

    for (const line of lines) {
      const qty = Number(line.requestedQuantity) || 0;
      if (qty <= 0) continue;
      const unit = Number(line.unitPrice) || 0;
      const listedRaw = Number(line.listedUnitPrice);
      const listed = Number.isFinite(listedRaw) && listedRaw > 0 ? listedRaw : unit;
      const sellerShare = roundMoney(unit * qty);
      const markup = roundMoney(Math.max(0, listed - unit) * qty);
      const sellerId = line.supplierClientId?.trim();
      if (!sellerId) continue;

      // Platform stock stays with CD — no external payable (COGS is not revenue).
      let isPlatform = sellerId === platformId;
      if (!isPlatform) {
        const sellerClient = await Client.findByPk(sellerId, {
          attributes: ['id', 'contractDetails'],
        });
        if (sellerClient && isPartsCatalogPlatformClient(sellerClient.contractDetails)) {
          isPlatform = true;
        }
      }
      if (isPlatform) continue;

      const acc = bySeller.get(sellerId) ?? {
        requestIds: [],
        sellerAmount: 0,
        cdMarkupAmount: 0,
        itemLines: [],
      };
      acc.requestIds.push(line.id);
      acc.sellerAmount = roundMoney(acc.sellerAmount + sellerShare);
      acc.cdMarkupAmount = roundMoney(acc.cdMarkupAmount + markup);
      acc.itemLines.push({
        name: line.itemName,
        description: `Parts request ${line.requestNumber}`,
        quantity: qty,
        price: unit,
        total: sellerShare,
      });
      bySeller.set(sellerId, acc);
    }

    const deliveryFee = roundMoney(Number(pkg.deliveryFee) || 0);
    // Delivery is CD-only; attach note on first payable for transparency (amount 0 on seller rows).
    let deliveryNoted = false;

    for (const [sellerClientId, acc] of bySeller) {
      if (acc.sellerAmount <= 0) continue;

      const existing = await sequelize.query<{ id: string }>(
        `
          SELECT id FROM parts_seller_payables
          WHERE buyerInvoiceId = :invoiceId AND sellerClientId = :sellerClientId
          LIMIT 1
        `,
        {
          type: QueryTypes.SELECT,
          replacements: { invoiceId: trimmedInvoiceId, sellerClientId },
        }
      );
      if (existing[0]?.id) {
        const rows = await sequelize.query<PayableRow>(
          `SELECT * FROM parts_seller_payables WHERE id = :id LIMIT 1`,
          { type: QueryTypes.SELECT, replacements: { id: existing[0].id } }
        );
        if (rows[0]) created.push(serializePayable(rows[0]));
        continue;
      }

      const rrspInvoiceId = await mirrorSellerShareToRrsp({
        sellerClientId,
        sellerAmount: acc.sellerAmount,
        deliveryPackageId: pkg.id,
        buyerInvoiceId: trimmedInvoiceId,
        itemLines: acc.itemLines,
      });

      const id = randomUUID();
      const now = new Date().toISOString();
      const deliveryAllocated = !deliveryNoted && deliveryFee > 0 ? 0 : 0;
      deliveryNoted = true;
      const notes = [
        `Seller share from marketplace package ${pkg.id}`,
        deliveryFee > 0 ? `CD keeps delivery $${deliveryFee.toFixed(2)}` : null,
        acc.cdMarkupAmount > 0 ? `CD markup on these lines $${acc.cdMarkupAmount.toFixed(2)}` : null,
      ]
        .filter(Boolean)
        .join('. ');

      await sequelize.query(
        `
          INSERT INTO parts_seller_payables (
            id, sellerClientId, buyerClientId, deliveryPackageId, buyerInvoiceId,
            partsRequestIds, sellerAmount, cdMarkupAmount, deliveryAmountAllocated,
            status, buyerPaidAt, paidOutAt, paidOutBy, notes, rrspInvoiceId, createdAt, updatedAt
          ) VALUES (
            :id, :sellerClientId, :buyerClientId, :deliveryPackageId, :buyerInvoiceId,
            :partsRequestIds, :sellerAmount, :cdMarkupAmount, :deliveryAmountAllocated,
            'owed', :buyerPaidAt, NULL, NULL, :notes, :rrspInvoiceId, :now, :now
          )
        `,
        {
          replacements: {
            id,
            sellerClientId,
            buyerClientId: pkg.buyerClientId?.trim() || lines[0]?.buyerClientId || null,
            deliveryPackageId: pkg.id,
            buyerInvoiceId: trimmedInvoiceId,
            partsRequestIds: JSON.stringify(acc.requestIds),
            sellerAmount: acc.sellerAmount,
            cdMarkupAmount: acc.cdMarkupAmount,
            deliveryAmountAllocated: deliveryAllocated,
            buyerPaidAt,
            notes,
            rrspInvoiceId,
            now,
          },
        }
      );

      const rows = await sequelize.query<PayableRow>(
        `SELECT * FROM parts_seller_payables WHERE id = :id LIMIT 1`,
        { type: QueryTypes.SELECT, replacements: { id } }
      );
      if (rows[0]) created.push(serializePayable(rows[0]));
    }

    // Always store CD-recognized revenue for this package (markup + delivery only).
    await recomputePartsPackageCdRevenue(pkg.id);
  }

  return created;
}

/**
 * CD main-accounting revenue for a parts package:
 * markup on all lines (including platform stock) + delivery fee.
 * Excludes platform COGS and external seller remittances.
 */
export async function recomputePartsPackageCdRevenue(packageId: string): Promise<{
  cdRevenueAmount: number;
  platformCostAmount: number;
  externalSellerAmount: number;
  markupAmount: number;
  deliveryFee: number;
}> {
  const sequelize = getSequelize();
  const { ensurePartsCatalogSchema } = await import('@/lib/parts-catalog');
  await ensurePartsCatalogSchema();

  const packages = await sequelize.query<PackageRow>(
    `SELECT * FROM parts_delivery_packages WHERE id = :id LIMIT 1`,
    { type: QueryTypes.SELECT, replacements: { id: packageId } }
  );
  const pkg = packages[0];
  if (!pkg) {
    return {
      cdRevenueAmount: 0,
      platformCostAmount: 0,
      externalSellerAmount: 0,
      markupAmount: 0,
      deliveryFee: 0,
    };
  }

  const platform = await getOrCreatePlatformPartsClient();
  const platformId = String(platform.id);
  const lines = await sequelize.query<RequestLine>(
    `
      SELECT id, supplierClientId, buyerClientId, requestNumber, itemName,
             requestedQuantity, unitPrice, listedUnitPrice, status, deliveryPackageId
      FROM parts_requests
      WHERE deliveryPackageId = :packageId
        AND status NOT IN ('cancelled')
    `,
    { type: QueryTypes.SELECT, replacements: { packageId: pkg.id } }
  );

  let markupAmount = 0;
  let platformCostAmount = 0;
  let externalSellerAmount = 0;

  for (const line of lines) {
    const qty = Number(line.requestedQuantity) || 0;
    if (qty <= 0) continue;
    const unit = Number(line.unitPrice) || 0;
    const listedRaw = Number(line.listedUnitPrice);
    const listed = Number.isFinite(listedRaw) && listedRaw > 0 ? listedRaw : unit;
    const cost = roundMoney(unit * qty);
    const markup = roundMoney(Math.max(0, listed - unit) * qty);
    markupAmount = roundMoney(markupAmount + markup);

    const sellerId = line.supplierClientId?.trim();
    let isPlatform = Boolean(sellerId && sellerId === platformId);
    if (sellerId && !isPlatform) {
      const sellerClient = await Client.findByPk(sellerId, {
        attributes: ['id', 'contractDetails'],
      });
      if (sellerClient && isPartsCatalogPlatformClient(sellerClient.contractDetails)) {
        isPlatform = true;
      }
    }
    if (isPlatform) {
      platformCostAmount = roundMoney(platformCostAmount + cost);
    } else if (sellerId) {
      externalSellerAmount = roundMoney(externalSellerAmount + cost);
    }
  }

  const deliveryFee = roundMoney(Number(pkg.deliveryFee) || 0);
  const cdRevenueAmount = roundMoney(markupAmount + deliveryFee);
  const now = new Date().toISOString();

  await sequelize.query(
    `
      UPDATE parts_delivery_packages
      SET cdRevenueAmount = :cdRevenueAmount,
          platformCostAmount = :platformCostAmount,
          externalSellerAmount = :externalSellerAmount,
          updatedAt = :now
      WHERE id = :id
    `,
    {
      replacements: {
        id: pkg.id,
        cdRevenueAmount,
        platformCostAmount,
        externalSellerAmount,
        now,
      },
    }
  );

  return {
    cdRevenueAmount,
    platformCostAmount,
    externalSellerAmount,
    markupAmount,
    deliveryFee,
  };
}

/** Backfill cdRevenueAmount on paid parts packages missing it. */
export async function backfillPartsPackageCdRevenue(): Promise<number> {
  const sequelize = getSequelize();
  const { ensurePartsCatalogSchema } = await import('@/lib/parts-catalog');
  await ensurePartsCatalogSchema();

  const rows = await sequelize.query<{ id: string }>(
    `
      SELECT id FROM parts_delivery_packages
      WHERE invoiceId IS NOT NULL
        AND TRIM(invoiceId) != ''
        AND (billingStatus = 'paid' OR EXISTS (
          SELECT 1 FROM invoices i WHERE i.id = invoiceId AND i.status = 'paid'
        ))
        AND (cdRevenueAmount IS NULL)
    `,
    { type: QueryTypes.SELECT }
  );

  let n = 0;
  for (const row of rows) {
    await recomputePartsPackageCdRevenue(row.id);
    n += 1;
  }
  return n;
}

/**
 * Create missing payables for paid parts packages (e.g. paid before allocate hook existed,
 * or billingStatus synced to paid without going through markInvoicePaid).
 */
export async function backfillPartsSellerPayables(): Promise<number> {
  await ensurePartsSellerPayablesSchema();
  const sequelize = getSequelize();
  const platform = await getOrCreatePlatformPartsClient();
  const platformId = String(platform.id);

  const gaps = await sequelize.query<{ invoiceId: string }>(
    `
      SELECT DISTINCT p.invoiceId AS invoiceId
      FROM parts_delivery_packages p
      INNER JOIN parts_requests r ON r.deliveryPackageId = p.id
      WHERE p.invoiceId IS NOT NULL
        AND TRIM(p.invoiceId) != ''
        AND (p.billingStatus = 'paid' OR EXISTS (
          SELECT 1 FROM invoices i WHERE i.id = p.invoiceId AND i.status = 'paid'
        ))
        AND r.status NOT IN ('cancelled')
        AND r.supplierClientId IS NOT NULL
        AND TRIM(r.supplierClientId) != ''
        AND r.supplierClientId != :platformId
        AND NOT EXISTS (
          SELECT 1 FROM parts_seller_payables sp
          WHERE sp.buyerInvoiceId = p.invoiceId
            AND sp.sellerClientId = r.supplierClientId
        )
    `,
    { type: QueryTypes.SELECT, replacements: { platformId } }
  );

  let createdCount = 0;
  for (const gap of gaps) {
    const invoiceId = gap.invoiceId?.trim();
    if (!invoiceId) continue;
    try {
      // Ensure package billing reflects paid invoice so allocate can find the package.
      await sequelize.query(
        `
          UPDATE parts_delivery_packages
          SET billingStatus = 'paid', updatedAt = :now
          WHERE invoiceId = :invoiceId
        `,
        { replacements: { invoiceId, now: new Date().toISOString() } }
      );
      const created = await allocatePartsInvoicePayment(invoiceId);
      createdCount += created.length;
    } catch (error) {
      console.error('Failed to backfill parts seller payables', invoiceId, error);
    }
  }

  try {
    await backfillPartsPackageCdRevenue();
  } catch (error) {
    console.error('Failed to backfill parts package CD revenue', error);
  }

  return createdCount;
}

export async function listSellerPayables(options?: {
  sellerClientId?: string | null;
  status?: SellerPayableStatus | 'all' | null;
  limit?: number;
}): Promise<{
  payables: SellerPayableView[];
  totals: { owed: number; paidOut: number; countOwed: number; countPaidOut: number };
}> {
  await ensurePartsSellerPayablesSchema();
  try {
    const { ensureCreditNotesSchema } = await import('@/lib/accounting');
    await ensureCreditNotesSchema();
  } catch (error) {
    console.error('credit notes schema ensure failed', error);
  }
  // Heal gaps from packages paid before allocate ran (or billing synced to paid only).
  try {
    await backfillPartsSellerPayables();
  } catch (error) {
    console.error('parts seller payables backfill failed', error);
  }
  const sequelize = getSequelize();
  const where: string[] = ['1=1'];
  const replacements: Record<string, unknown> = {
    limit: Math.min(Math.max(Number(options?.limit) || 200, 1), 500),
  };

  if (options?.sellerClientId?.trim()) {
    where.push('p.sellerClientId = :sellerClientId');
    replacements.sellerClientId = options.sellerClientId.trim();
  }
  if (options?.status && options.status !== 'all') {
    where.push('p.status = :status');
    replacements.status = options.status;
  }

  const rows = await sequelize.query<PayableRow>(
    `
      SELECT p.*,
        seller.name AS sellerName,
        seller.company_name AS sellerCompanyName,
        buyer.name AS buyerName,
        buyer.company_name AS buyerCompanyName,
        inv.invoice_number AS buyerInvoiceNumber,
        inv.amount AS buyerInvoiceAmount,
        cn.creditNumber AS creditNoteNumber
      FROM parts_seller_payables p
      LEFT JOIN clients seller ON seller.id = p.sellerClientId
      LEFT JOIN clients buyer ON buyer.id = p.buyerClientId
      LEFT JOIN invoices inv ON inv.id = p.buyerInvoiceId
      LEFT JOIN credit_notes cn ON cn.id = p.creditNoteId
      WHERE ${where.join(' AND ')}
      ORDER BY
        CASE WHEN p.status = 'owed' THEN 0 ELSE 1 END,
        p.buyerPaidAt DESC,
        p.createdAt DESC
      LIMIT :limit
    `,
    { type: QueryTypes.SELECT, replacements }
  );

  const payables = rows.map(serializePayable);
  const totals = {
    owed: 0,
    paidOut: 0,
    countOwed: 0,
    countPaidOut: 0,
  };

  // Always report DB-wide (or seller-scoped) totals so UI summaries stay correct when filtering.
  if (!options?.sellerClientId) {
    const sumRows = await sequelize.query<{ status: string; total: number; count: number }>(
      `
        SELECT status, COALESCE(SUM(sellerAmount), 0) AS total, COUNT(*) AS count
        FROM parts_seller_payables
        GROUP BY status
      `,
      { type: QueryTypes.SELECT }
    );
    for (const row of sumRows) {
      if (row.status === 'owed') {
        totals.owed = roundMoney(Number(row.total) || 0);
        totals.countOwed = Number(row.count) || 0;
      } else if (row.status === 'paid_out') {
        totals.paidOut = roundMoney(Number(row.total) || 0);
        totals.countPaidOut = Number(row.count) || 0;
      }
    }
  } else if (options?.sellerClientId) {
    const sumRows = await sequelize.query<{ status: string; total: number; count: number }>(
      `
        SELECT status, COALESCE(SUM(sellerAmount), 0) AS total, COUNT(*) AS count
        FROM parts_seller_payables
        WHERE sellerClientId = :sellerClientId
        GROUP BY status
      `,
      {
        type: QueryTypes.SELECT,
        replacements: { sellerClientId: options.sellerClientId.trim() },
      }
    );
    totals.owed = 0;
    totals.paidOut = 0;
    totals.countOwed = 0;
    totals.countPaidOut = 0;
    for (const row of sumRows) {
      if (row.status === 'owed') {
        totals.owed = roundMoney(Number(row.total) || 0);
        totals.countOwed = Number(row.count) || 0;
      } else if (row.status === 'paid_out') {
        totals.paidOut = roundMoney(Number(row.total) || 0);
        totals.countPaidOut = Number(row.count) || 0;
      }
    }
  }

  return { payables, totals };
}

export async function markSellerPayablePaidOut(
  payableId: string,
  staffUserId: number,
  notes?: string
): Promise<SellerPayableView | null> {
  await ensurePartsSellerPayablesSchema();
  const sequelize = getSequelize();
  const rows = await sequelize.query<PayableRow>(
    `SELECT * FROM parts_seller_payables WHERE id = :id LIMIT 1`,
    { type: QueryTypes.SELECT, replacements: { id: payableId.trim() } }
  );
  const row = rows[0];
  if (!row) return null;
  if (row.status === 'paid_out') return serializePayable(row);

  const now = new Date().toISOString();
  const mergedNotes = notes?.trim()
    ? row.notes
      ? `${row.notes}\n${notes.trim()}`
      : notes.trim()
    : row.notes;

  await sequelize.query(
    `
      UPDATE parts_seller_payables
      SET status = 'paid_out',
          paidOutAt = :now,
          paidOutBy = :paidOutBy,
          notes = :notes,
          updatedAt = :now
      WHERE id = :id AND status = 'owed'
    `,
    {
      replacements: {
        id: row.id,
        now,
        paidOutBy: String(staffUserId),
        notes: mergedNotes,
      },
    }
  );

  if (row.rrspInvoiceId?.trim()) {
    await markMirroredRrspInvoicePaid(row.sellerClientId, row.rrspInvoiceId, staffUserId);
  }

  // Recognize CD markup profit on payout (credit note with profit %).
  const sellerAmount = roundMoney(Number(row.sellerAmount) || 0);
  const cdMarkupAmount = roundMoney(Number(row.cdMarkupAmount) || 0);
  const listedLineTotal = roundMoney(sellerAmount + cdMarkupAmount);
  const markupPercent =
    listedLineTotal > 0 ? roundMoney((cdMarkupAmount / listedLineTotal) * 100) : 0;
  if (cdMarkupAmount > 0 && !row.creditNoteId?.trim()) {
    try {
      const { createMarketplaceProfitCreditNote } = await import('@/lib/accounting');
      const seller = await Client.findByPk(row.sellerClientId, {
        attributes: ['name', 'companyName'],
      });
      const credit = await createMarketplaceProfitCreditNote({
        buyerInvoiceId: row.buyerInvoiceId,
        buyerClientId: row.buyerClientId,
        payableId: row.id,
        profitAmount: cdMarkupAmount,
        sellerAmount,
        listedLineTotal,
        markupPercent,
        createdBy: staffUserId,
        sellerName: seller?.companyName || seller?.name || null,
      });
      if (credit?.id) {
        await sequelize.query(
          `
            UPDATE parts_seller_payables
            SET creditNoteId = :creditNoteId, updatedAt = :now
            WHERE id = :id
          `,
          {
            replacements: {
              id: row.id,
              creditNoteId: credit.id,
              now: new Date().toISOString(),
            },
          }
        );
        const profitNote = `Profit credit note ${credit.creditNumber} (${markupPercent.toFixed(1)}% markup, ${cdMarkupAmount.toFixed(2)})`;
        await sequelize.query(
          `
            UPDATE parts_seller_payables
            SET notes = :notes, updatedAt = :now
            WHERE id = :id
          `,
          {
            replacements: {
              id: row.id,
              notes: mergedNotes ? `${mergedNotes}\n${profitNote}` : profitNote,
              now: new Date().toISOString(),
            },
          }
        );
      }
    } catch (error) {
      console.error('Failed to create marketplace profit credit note', row.id, error);
    }
  }

  const updated = await sequelize.query<PayableRow>(
    `
      SELECT p.*,
        seller.name AS sellerName,
        seller.company_name AS sellerCompanyName,
        buyer.name AS buyerName,
        buyer.company_name AS buyerCompanyName,
        inv.invoice_number AS buyerInvoiceNumber,
        inv.amount AS buyerInvoiceAmount,
        cn.creditNumber AS creditNoteNumber
      FROM parts_seller_payables p
      LEFT JOIN clients seller ON seller.id = p.sellerClientId
      LEFT JOIN clients buyer ON buyer.id = p.buyerClientId
      LEFT JOIN invoices inv ON inv.id = p.buyerInvoiceId
      LEFT JOIN credit_notes cn ON cn.id = p.creditNoteId
      WHERE p.id = :id
      LIMIT 1
    `,
    { type: QueryTypes.SELECT, replacements: { id: row.id } }
  );
  return updated[0] ? serializePayable(updated[0]) : null;
}
