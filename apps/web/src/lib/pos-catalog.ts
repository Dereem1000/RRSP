import { randomUUID } from 'crypto';
import { QueryTypes, type Sequelize } from 'sequelize';
import {
  getOperationalSequelize,
  getRrspContext,
  getShopClientModel,
  isRrspDbActive,
} from '@/lib/rrsp-db';
import { getSequelize } from '@/lib/db';
import {
  createInventoryListing,
  deleteInventoryListing,
  ensurePartsCatalogSchema,
  getOrCreatePlatformPartsClient,
  listInventoryForClient,
  updateInventoryListing,
} from '@/lib/parts-catalog';
import {
  normalizePosProductKind,
  tracksPosStock,
  type PosProduct,
  type PosProductKind,
} from '@/lib/pos-catalog-shared';

export type { PosProduct, PosProductKind } from '@/lib/pos-catalog-shared';
export {
  POS_PRODUCT_KINDS,
  POS_PRODUCT_KIND_LABELS,
  POS_PRODUCT_CATEGORY_LABELS,
  normalizePosProductKind,
  tracksPosStock,
  isPosItemKind,
  posProductCategory,
  matchesPosCategoryFilter,
  isPosProductSellable,
  posSellableQuantity,
} from '@/lib/pos-catalog-shared';

type PosCatalogSource = 'cd' | 'shop';

const WALK_IN_EMAIL = 'walk-in@pos.local';
/** Soft unlimited qty for cart lines that do not track stock. */
const UNLIMITED_QTY = 999_999;

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

export async function ensurePosCatalogSchema(sequelize: Sequelize = getOperationalSequelize()) {
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
      productKind TEXT NOT NULL DEFAULT 'physical',
      isActive INTEGER NOT NULL DEFAULT 1,
      createdBy INTEGER,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);
  const cols = await sequelize.query<{ name: string }>(`PRAGMA table_info(pos_products)`, {
    type: QueryTypes.SELECT,
  });
  if (!cols.some((c) => c.name === 'productKind')) {
    await sequelize.query(
      `ALTER TABLE pos_products ADD COLUMN productKind TEXT NOT NULL DEFAULT 'physical'`
    );
  }
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_pos_products_active_qty
    ON pos_products (isActive, availableQuantity)
  `);
}

export async function ensureWalkInPosClient(): Promise<{ id: string; name: string }> {
  const Client = getShopClientModel();
  const existing = await Client.findOne({
    where: { email: WALK_IN_EMAIL },
    attributes: ['id', 'name'],
  });
  if (existing) {
    return { id: String(existing.get('id')), name: String(existing.get('name')) };
  }

  const now = new Date().toISOString();
  const created = await Client.create({
    id: randomUUID(),
    name: 'Walk-in',
    companyName: 'Walk-in / Counter',
    email: WALK_IN_EMAIL,
    notes: 'System customer for POS counter sales',
    status: 'active',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  } as never);

  return { id: String(created.get('id')), name: String(created.get('name')) };
}

function matchesSearch(product: Pick<PosProduct, 'name' | 'sku' | 'description'>, search?: string) {
  const q = search?.trim().toLowerCase() ?? '';
  if (!q) return true;
  return (
    product.name.toLowerCase().includes(q) ||
    (product.sku ?? '').toLowerCase().includes(q) ||
    (product.description ?? '').toLowerCase().includes(q)
  );
}

async function listPartsAsPosProducts(
  clientId: string,
  search?: string,
  options?: { includeOutOfStock?: boolean }
): Promise<PosProduct[]> {
  await ensurePartsCatalogSchema();
  const listings = await listInventoryForClient(clientId);
  const includeOutOfStock = options?.includeOutOfStock === true;
  return listings
    .filter((row) => includeOutOfStock || row.availableQuantity > 0)
    .map((row) => ({
      id: row.id,
      sku: row.partNumber ?? null,
      name: row.itemName,
      description: [row.brand, row.notes].filter(Boolean).join(' · ') || null,
      unitPrice: Number(row.unitPrice) || 0,
      costPrice: 0,
      quantity: Number(row.quantity) || 0,
      availableQuantity: Number(row.availableQuantity) || 0,
      kind: 'physical' as const,
      source: 'parts' as const,
    }))
    .filter((row) => matchesSearch(row, search));
}

function mergePosProducts(catalog: PosProduct[], parts: PosProduct[]): PosProduct[] {
  const seen = new Set(catalog.map((p) => p.id));
  const merged = [...catalog];
  for (const part of parts) {
    if (seen.has(part.id)) continue;
    seen.add(part.id);
    merged.push(part);
  }
  return merged.sort((a, b) => a.name.localeCompare(b.name));
}

async function listPosProductsFromDb(
  sequelize: Sequelize,
  source: PosCatalogSource,
  search?: string
): Promise<PosProduct[]> {
  await ensurePosCatalogSchema(sequelize);
  const q = search?.trim() ?? '';
  const rows = await sequelize.query<{
    id: string;
    sku: string | null;
    name: string;
    description: string | null;
    unitPrice: number;
    costPrice: number;
    quantity: number;
    availableQuantity: number;
    productKind: string | null;
  }>(
    `
      SELECT id, sku, name, description, unitPrice, costPrice, quantity, availableQuantity,
             productKind
      FROM pos_products
      WHERE isActive = 1
        AND (
          :search = ''
          OR name LIKE :like
          OR COALESCE(sku, '') LIKE :like
          OR COALESCE(description, '') LIKE :like
        )
      ORDER BY name ASC
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { search: q, like: `%${q}%` },
    }
  );

  return rows.map((row) => {
    const kind = normalizePosProductKind(row.productKind);
    const tracked = tracksPosStock(kind);
    const quantity = tracked ? Number(row.quantity) || 0 : 0;
    const availableQuantity = tracked ? Number(row.availableQuantity) || 0 : UNLIMITED_QTY;
    return {
      id: row.id,
      sku: row.sku,
      name: row.name,
      description: row.description,
      unitPrice: Number(row.unitPrice) || 0,
      costPrice: Number(row.costPrice) || 0,
      quantity,
      availableQuantity,
      kind,
      source,
    };
  });
}

/** POS catalog only (no Parts merge) — used by older inventory callers. */
export async function listCdPosCatalog(search?: string): Promise<PosProduct[]> {
  return listPosProductsFromDb(getSequelize(), 'cd', search);
}

export async function listShopPosCatalog(search?: string): Promise<PosProduct[]> {
  if (!isRrspDbActive()) {
    throw new Error('Shop POS catalog requires an RRSP shop database context');
  }
  return listPosProductsFromDb(getOperationalSequelize(), 'shop', search);
}

export async function listPosCatalog(mode: 'cd' | 'rrsp', search?: string): Promise<PosProduct[]> {
  return mode === 'rrsp' ? listShopPosCatalog(search) : listCdPosCatalog(search);
}

/** Inventory screen: POS catalog + all Parts stock (including 0 available). */
export async function listCdPosInventory(search?: string): Promise<PosProduct[]> {
  const catalog = await listCdPosCatalog(search);
  const platform = await getOrCreatePlatformPartsClient();
  const parts = await listPartsAsPosProducts(String(platform.id), search, {
    includeOutOfStock: true,
  });
  return mergePosProducts(catalog, parts);
}

export async function listShopPosInventory(search?: string): Promise<PosProduct[]> {
  if (!isRrspDbActive()) {
    throw new Error('Shop POS inventory requires an RRSP shop database context');
  }
  const catalog = await listShopPosCatalog(search);
  const mspClientId = getRrspContext()?.mspClientId;
  const parts = mspClientId
    ? await listPartsAsPosProducts(mspClientId, search, { includeOutOfStock: true })
    : [];
  return mergePosProducts(catalog, parts);
}

export async function listPosInventory(mode: 'cd' | 'rrsp', search?: string): Promise<PosProduct[]> {
  return mode === 'rrsp' ? listShopPosInventory(search) : listCdPosInventory(search);
}

/** CD staff: POS catalog products plus Our Stock Parts (when available). */
export async function listCdPosProducts(search?: string): Promise<PosProduct[]> {
  const catalog = await listCdPosCatalog(search);
  const platform = await getOrCreatePlatformPartsClient();
  const parts = await listPartsAsPosProducts(String(platform.id), search);
  return mergePosProducts(catalog, parts);
}

/** RRSP shop: shop POS catalog plus that client's Parts stock (when available). */
export async function listShopPosProducts(search?: string): Promise<PosProduct[]> {
  if (!isRrspDbActive()) {
    throw new Error('Shop POS catalog requires an RRSP shop database context');
  }
  const catalog = await listShopPosCatalog(search);
  const mspClientId = getRrspContext()?.mspClientId;
  const parts = mspClientId ? await listPartsAsPosProducts(mspClientId, search) : [];
  return mergePosProducts(catalog, parts);
}

export async function listPosProducts(mode: 'cd' | 'rrsp', search?: string): Promise<PosProduct[]> {
  return mode === 'rrsp' ? listShopPosProducts(search) : listCdPosProducts(search);
}

type PosProductWriteInput = {
  name: string;
  sku?: string | null;
  description?: string | null;
  unitPrice: number;
  costPrice?: number;
  quantity: number;
  availableQuantity?: number;
  kind?: PosProductKind | string;
  createdBy?: number;
};

function resolveStockFields(kind: PosProductKind, quantity: number, availableQuantity?: number) {
  if (!tracksPosStock(kind)) {
    return { quantity: 0, availableQuantity: 0 };
  }
  const qty = Math.max(0, Math.floor(quantity));
  const avail =
    availableQuantity != null
      ? Math.min(qty, Math.max(0, Math.floor(availableQuantity)))
      : qty;
  return { quantity: qty, availableQuantity: avail };
}

async function createPosProductInDb(
  sequelize: Sequelize,
  source: PosCatalogSource,
  input: PosProductWriteInput & { createdBy: number }
): Promise<PosProduct> {
  await ensurePosCatalogSchema(sequelize);
  const name = input.name.trim();
  if (!name) throw new Error('Product name is required');
  if (!Number.isFinite(input.unitPrice) || input.unitPrice < 0) {
    throw new Error('Unit price must be zero or more');
  }
  const kind = normalizePosProductKind(input.kind);
  if (tracksPosStock(kind) && (!Number.isInteger(input.quantity) || input.quantity < 0)) {
    throw new Error('Quantity must be a whole number');
  }
  const stock = resolveStockFields(kind, input.quantity, input.availableQuantity);

  const id = randomUUID();
  const now = new Date().toISOString();
  const unitPrice = roundMoney(input.unitPrice);
  const costPrice = roundMoney(input.costPrice ?? 0);

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
        id,
        sku: input.sku?.trim() || null,
        name,
        description: input.description?.trim() || null,
        unitPrice,
        costPrice,
        quantity: stock.quantity,
        availableQuantity: stock.availableQuantity,
        productKind: kind,
        createdBy: input.createdBy,
        now,
      },
    }
  );

  const products = await listPosProductsFromDb(sequelize, source);
  const created = products.find((p) => p.id === id);
  if (!created) throw new Error('Failed to create product');
  return created;
}

export async function createCdPosProduct(
  input: PosProductWriteInput & { createdBy: number }
): Promise<PosProduct> {
  return createPosProductInDb(getSequelize(), 'cd', input);
}

export async function createShopPosProduct(
  input: PosProductWriteInput & { createdBy: number }
): Promise<PosProduct> {
  if (!isRrspDbActive()) {
    throw new Error('Shop POS catalog requires an RRSP shop database context');
  }
  return createPosProductInDb(getOperationalSequelize(), 'shop', input);
}

export async function createPosProduct(
  mode: 'cd' | 'rrsp',
  input: PosProductWriteInput & { createdBy: number }
): Promise<PosProduct> {
  return mode === 'rrsp' ? createShopPosProduct(input) : createCdPosProduct(input);
}

/** Create a POS catalog row or a Parts (marketplace) listing from inventory. */
export async function createPosInventoryLine(
  mode: 'cd' | 'rrsp',
  source: PosProduct['source'],
  input: PosProductWriteInput & { createdBy: number; availableQuantity?: number }
): Promise<PosProduct> {
  if (source === 'parts') {
    const clientId = await resolvePartsOwnerClientId(mode);
    const quantity = Math.max(0, Math.floor(Number(input.quantity) || 0));
    if (quantity <= 0) {
      throw new Error('Parts stock needs a quantity greater than zero');
    }
    const availableQuantity = Math.min(
      quantity,
      Math.max(0, Math.floor(Number(input.availableQuantity ?? 0) || 0))
    );
    const created = await createInventoryListing({
      clientId,
      createdBy: input.createdBy,
      itemName: input.name,
      partNumber: input.sku ?? null,
      brand: null,
      notes: input.description ?? null,
      unitPrice: input.unitPrice,
      quantity,
      availableQuantity,
    });
    if (!created) throw new Error('Failed to create Parts listing');
    return {
      id: created.id,
      sku: created.partNumber ?? null,
      name: created.itemName,
      description: [created.brand, created.notes].filter(Boolean).join(' · ') || null,
      unitPrice: Number(created.unitPrice) || 0,
      costPrice: 0,
      quantity: Number(created.quantity) || 0,
      availableQuantity: Number(created.availableQuantity) || 0,
      kind: 'physical',
      source: 'parts',
    };
  }
  return createPosProduct(mode, input);
}

async function updatePosProductInDb(
  sequelize: Sequelize,
  source: PosCatalogSource,
  id: string,
  input: PosProductWriteInput & { availableQuantity: number }
): Promise<PosProduct> {
  await ensurePosCatalogSchema(sequelize);
  const name = input.name.trim();
  if (!name) throw new Error('Product name is required');
  if (!Number.isFinite(input.unitPrice) || input.unitPrice < 0) {
    throw new Error('Unit price must be zero or more');
  }
  const kind = normalizePosProductKind(input.kind);
  if (tracksPosStock(kind)) {
    if (!Number.isInteger(input.quantity) || input.quantity < 0) {
      throw new Error('Quantity must be a whole number');
    }
    if (!Number.isInteger(input.availableQuantity) || input.availableQuantity < 0) {
      throw new Error('Available quantity must be a whole number');
    }
    if (input.availableQuantity > input.quantity) {
      throw new Error('Available quantity cannot exceed quantity');
    }
  }
  const stock = resolveStockFields(kind, input.quantity, input.availableQuantity);

  const now = new Date().toISOString();
  const [result] = await sequelize.query(
    `
      UPDATE pos_products
      SET sku = :sku,
          name = :name,
          description = :description,
          unitPrice = :unitPrice,
          costPrice = :costPrice,
          quantity = :quantity,
          availableQuantity = :availableQuantity,
          productKind = :productKind,
          updatedAt = :now
      WHERE id = :id AND isActive = 1
    `,
    {
      replacements: {
        id,
        sku: input.sku?.trim() || null,
        name,
        description: input.description?.trim() || null,
        unitPrice: roundMoney(input.unitPrice),
        costPrice: roundMoney(input.costPrice ?? 0),
        quantity: stock.quantity,
        availableQuantity: stock.availableQuantity,
        productKind: kind,
        now,
      },
    }
  );

  const changes = (result as { changes?: number })?.changes;
  if (changes === 0) throw new Error('Product not found');

  const products = await listPosProductsFromDb(sequelize, source);
  const updated = products.find((p) => p.id === id);
  if (!updated) throw new Error('Product not found');
  return updated;
}

export async function updateShopPosProduct(
  id: string,
  input: PosProductWriteInput & { availableQuantity: number }
): Promise<PosProduct> {
  if (!isRrspDbActive()) {
    throw new Error('Shop POS catalog requires an RRSP shop database context');
  }
  return updatePosProductInDb(getOperationalSequelize(), 'shop', id, input);
}

export async function updateCdPosProduct(
  id: string,
  input: PosProductWriteInput & { availableQuantity: number }
): Promise<PosProduct> {
  return updatePosProductInDb(getSequelize(), 'cd', id, input);
}

export async function updatePosProduct(
  mode: 'cd' | 'rrsp',
  id: string,
  input: PosProductWriteInput & { availableQuantity: number }
): Promise<PosProduct> {
  return mode === 'rrsp' ? updateShopPosProduct(id, input) : updateCdPosProduct(id, input);
}

async function deactivatePosProductInDb(sequelize: Sequelize, id: string): Promise<void> {
  await ensurePosCatalogSchema(sequelize);
  const now = new Date().toISOString();
  const [result] = await sequelize.query(
    `
      UPDATE pos_products
      SET isActive = 0, updatedAt = :now
      WHERE id = :id AND isActive = 1
    `,
    { replacements: { id, now } }
  );
  const changes = (result as { changes?: number })?.changes;
  if (changes === 0) throw new Error('Product not found');
}

export async function deactivatePosProduct(mode: 'cd' | 'rrsp', id: string): Promise<void> {
  if (mode === 'rrsp') {
    if (!isRrspDbActive()) {
      throw new Error('Shop POS catalog requires an RRSP shop database context');
    }
    await deactivatePosProductInDb(getOperationalSequelize(), id);
    return;
  }
  await deactivatePosProductInDb(getSequelize(), id);
}

async function resolvePartsOwnerClientId(mode: 'cd' | 'rrsp'): Promise<string> {
  if (mode === 'rrsp') {
    const mspClientId = getRrspContext()?.mspClientId;
    if (!mspClientId) throw new Error('Shop Parts stock requires RRSP client context');
    return mspClientId;
  }
  const platform = await getOrCreatePlatformPartsClient();
  return String(platform.id);
}

/** Update a POS catalog row or Parts listing (for inventory screen). */
export async function updatePosInventoryLine(
  mode: 'cd' | 'rrsp',
  id: string,
  source: PosProduct['source'],
  input: PosProductWriteInput & { availableQuantity: number }
): Promise<PosProduct> {
  if (source === 'parts') {
    const clientId = await resolvePartsOwnerClientId(mode);
    const quantity = Math.max(0, Math.floor(Number(input.quantity) || 0));
    const availableQuantity = Math.min(
      quantity,
      Math.max(0, Math.floor(Number(input.availableQuantity) || 0))
    );
    const updated = await updateInventoryListing(id, {
      clientId,
      itemName: input.name,
      partNumber: input.sku ?? null,
      brand: null,
      notes: input.description ?? null,
      unitPrice: input.unitPrice,
      quantity,
      availableQuantity,
    });
    if (!updated) throw new Error('Parts listing not found');
    return {
      id: updated.id,
      sku: updated.partNumber ?? null,
      name: updated.itemName,
      description: [updated.brand, updated.notes].filter(Boolean).join(' · ') || null,
      unitPrice: Number(updated.unitPrice) || 0,
      costPrice: 0,
      quantity: Number(updated.quantity) || 0,
      availableQuantity: Number(updated.availableQuantity) || 0,
      kind: 'physical',
      source: 'parts',
    };
  }
  return updatePosProduct(mode, id, input);
}

export async function deactivatePosInventoryLine(
  mode: 'cd' | 'rrsp',
  id: string,
  source: PosProduct['source']
): Promise<void> {
  if (source === 'parts') {
    const clientId = await resolvePartsOwnerClientId(mode);
    await deleteInventoryListing(id, clientId);
    return;
  }
  await deactivatePosProduct(mode, id);
}

export type PosStockAdjustAction = 'add' | 'remove' | 'receive_po';

/** Manual / PO stock movements for POS catalog or Parts on-hand qty. */
export async function adjustPosInventoryStock(
  mode: 'cd' | 'rrsp',
  id: string,
  source: PosProduct['source'],
  input: {
    action: PosStockAdjustAction;
    quantity: number;
    poNumber?: string | null;
    note?: string | null;
  }
): Promise<PosProduct> {
  const qty = Math.floor(Number(input.quantity) || 0);
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new Error('Adjustment quantity must be a positive whole number');
  }
  if (input.action === 'receive_po' && !String(input.poNumber ?? '').trim()) {
    throw new Error('PO number is required when receiving by purchase order');
  }

  const inventory = await listPosInventory(mode);
  const current = inventory.find((p) => p.id === id && p.source === source);
  if (!current) throw new Error('Product not found');
  if (current.source !== 'parts' && !tracksPosStock(current.kind)) {
    throw new Error('This product does not track stock');
  }

  const delta = input.action === 'remove' ? -qty : qty;
  const nextQuantity = current.quantity + delta;
  if (nextQuantity < 0) {
    throw new Error('Cannot remove more than on-hand quantity');
  }

  let nextAvailable = current.availableQuantity;
  if (source === 'parts') {
    // Marketplace available is independent; never raise it on receive — only clamp down.
    nextAvailable = Math.min(current.availableQuantity, nextQuantity);
  } else if (input.action === 'remove') {
    nextAvailable = Math.max(0, Math.min(current.availableQuantity, nextQuantity));
    // Prefer reducing available with removals when both were in sync.
    if (current.availableQuantity === current.quantity) {
      nextAvailable = nextQuantity;
    } else {
      nextAvailable = Math.min(current.availableQuantity, nextQuantity);
    }
  } else {
    // Add / PO: increase sellable available with on-hand for POS catalog.
    nextAvailable = Math.min(nextQuantity, current.availableQuantity + qty);
  }

  const stamp =
    input.action === 'receive_po'
      ? `PO ${String(input.poNumber).trim()}: +${qty}`
      : input.action === 'add'
        ? `Manual add +${qty}`
        : `Manual remove −${qty}`;
  const noteBit = String(input.note ?? '').trim();
  const movementLine = noteBit ? `${stamp} — ${noteBit}` : stamp;
  const description =
    source === 'parts'
      ? [current.description, movementLine].filter(Boolean).join(' · ').slice(0, 500)
      : current.description;

  return updatePosInventoryLine(mode, id, source, {
    name: current.name,
    sku: current.sku,
    description,
    unitPrice: current.unitPrice,
    costPrice: current.costPrice,
    quantity: nextQuantity,
    availableQuantity: nextAvailable,
    kind: current.kind,
  });
}

async function decrementPosStock(sequelize: Sequelize, productId: string, qty: number) {
  if (!Number.isInteger(qty) || qty <= 0) throw new Error('Invalid quantity');
  await ensurePosCatalogSchema(sequelize);
  const now = new Date().toISOString();
  const rows = await sequelize.query<{ quantity: number; availableQuantity: number }>(
    `
      SELECT quantity, availableQuantity
      FROM pos_products
      WHERE id = :id AND isActive = 1
    `,
    { type: QueryTypes.SELECT, replacements: { id: productId } }
  );
  const row = rows[0];
  if (!row) throw new Error('Product not found');
  // Legacy rows may have stock only in availableQuantity after older sales.
  const onHand = Math.max(Number(row.quantity) || 0, Number(row.availableQuantity) || 0);
  if (onHand < qty) {
    throw new Error(`Not enough quantity on hand (${onHand} left)`);
  }
  const next = onHand - qty;
  await sequelize.query(
    `
      UPDATE pos_products
      SET quantity = :next,
          availableQuantity = :next,
          updatedAt = :now
      WHERE id = :id AND isActive = 1
    `,
    { replacements: { id: productId, next, now } }
  );
}

export async function decrementPartsStock(productId: string, qty: number) {
  if (!Number.isInteger(qty) || qty <= 0) throw new Error('Invalid quantity');
  await ensurePartsCatalogSchema();
  const sequelize = getSequelize();
  const now = new Date().toISOString();
  const rows = await sequelize.query<{ quantity: number; availableQuantity: number }>(
    `
      SELECT quantity, availableQuantity
      FROM parts_inventory
      WHERE id = :id AND isActive = 1
    `,
    { type: QueryTypes.SELECT, replacements: { id: productId } }
  );
  const row = rows[0];
  if (!row) throw new Error('Parts listing not found');
  const available = Number(row.availableQuantity) || 0;
  const quantity = Number(row.quantity) || 0;
  if (available < qty) {
    throw new Error(`Insufficient marketplace stock (${available} left)`);
  }
  if (quantity < qty) {
    throw new Error(`Insufficient parts on hand (${quantity} left)`);
  }
  await sequelize.query(
    `
      UPDATE parts_inventory
      SET availableQuantity = availableQuantity - :qty,
          quantity = quantity - :qty,
          updatedAt = :now
      WHERE id = :id AND isActive = 1
    `,
    { replacements: { id: productId, qty, now } }
  );
}

export async function decrementCdStock(productId: string, qty: number) {
  await decrementPosStock(getSequelize(), productId, qty);
}

export async function decrementShopStock(productId: string, qty: number) {
  if (!isRrspDbActive()) {
    throw new Error('Shop POS catalog requires an RRSP shop database context');
  }
  await decrementPosStock(getOperationalSequelize(), productId, qty);
}

/** Decrement the correct stock table based on product source / kind. */
export async function decrementPosLineStock(product: PosProduct, qty: number) {
  if (!tracksPosStock(product.kind)) return;
  if (product.source === 'parts') {
    await decrementPartsStock(product.id, qty);
    return;
  }
  if (product.source === 'shop') {
    await decrementShopStock(product.id, qty);
    return;
  }
  await decrementCdStock(product.id, qty);
}
