import { randomUUID } from 'crypto';
import { QueryTypes } from 'sequelize';
import { Client, NoticeBoard, SystemConfig, User, getSequelize } from '@/lib/db';
import { getCompanySettings } from '@/lib/company-settings';
import { coordsFromClient, ensureClientLocationColumns, readClientLocation, resolveClientMapLocation } from '@/lib/client-location';
import {
  distancesFromBuyerAddress,
  formatDistanceLabel,
  getDrivingRoute,
  sortListingsCheapestThenClosest,
  type DrivingRouteSummary,
} from '@/lib/parts-routing';
import { DEFAULT_PARTS_CATALOG_MARKUP_PERCENT } from '@/lib/settings';

const SYSTEM_AUTHOR_ID = 1;
const PLATFORM_PARTS_CLIENT_EMAIL = 'parts-platform@computerdynamics.local';

let schemaReady = false;
let schemaEnsureInFlight: Promise<void> | null = null;

function isDuplicateColumnError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error ?? '');
  return /duplicate column name/i.test(message);
}

async function addColumnIfMissing(
  sequelize: ReturnType<typeof getSequelize>,
  tableCols: Array<{ name: string }>,
  columnName: string,
  sql: string
) {
  if (tableCols.some((c) => c.name === columnName)) return;
  try {
    await sequelize.query(sql);
    tableCols.push({ name: columnName });
  } catch (error) {
    if (!isDuplicateColumnError(error)) throw error;
  }
}

type InventoryRow = {
  id: string;
  clientId: string;
  itemName: string;
  normalizedName: string;
  partNumber: string | null;
  brand: string | null;
  notes: string | null;
  unitPrice: number;
  quantity: number;
  availableQuantity: number;
  createdBy: number;
  isActive: number | boolean;
  createdAt: string;
  updatedAt: string;
  clientName?: string | null;
  clientCompanyName?: string | null;
  clientAddress?: string | null;
  clientLatitude?: number | null;
  clientLongitude?: number | null;
  clientContractDetails?: unknown;
};

type RequestRow = {
  id: string;
  requestNumber: string;
  requestGroupId: string;
  inventoryId: string;
  supplierClientId: string;
  buyerClientId: string | null;
  buyerDisplayName: string;
  requesterUserId: number;
  requesterRole: string;
  itemName: string;
  normalizedName: string;
  requestedQuantity: number;
  unitPrice: number;
  listedUnitPrice: number | null;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  supplierName?: string | null;
  supplierCompanyName?: string | null;
  supplierAddress?: string | null;
  supplierLatitude?: number | null;
  supplierLongitude?: number | null;
  supplierContractDetails?: unknown;
  buyerName?: string | null;
  buyerCompanyName?: string | null;
  buyerAddress?: string | null;
  buyerLatitude?: number | null;
  buyerLongitude?: number | null;
  buyerContractDetails?: unknown;
  routeHidden?: number | boolean | null;
  routeFromOverride?: string | null;
  routeToOverride?: string | null;
  deliveryEtaMinutes?: number | null;
  deliveryEtaLabel?: string | null;
  pendingDeliveryAt?: string | null;
  pickedUpAt?: string | null;
  completedAt?: string | null;
  cancelRequestedAt?: string | null;
  cancelledAt?: string | null;
  deliveryFromAddress?: string | null;
  deliveryToAddress?: string | null;
  deliveryMapEmbedUrl?: string | null;
  deliveryDirectionsUrl?: string | null;
  deliveryPackageId?: string | null;
  deliveryDistanceMeters?: number | null;
  deliveryFee?: number | null;
};

export type InventoryListing = {
  id: string;
  clientId: string;
  itemName: string;
  normalizedName: string;
  partNumber: string | null;
  brand: string | null;
  notes: string | null;
  unitPrice: number;
  /** Marketplace price after platform markup (optional; set for public/stock views). */
  listedUnitPrice?: number;
  quantity: number;
  availableQuantity: number;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  supplierName: string;
  /**
   * Routing origin for distance (coords preferred).
   * Staff API remaps this to a street address for display.
   */
  supplierAddress?: string | null;
  /** Human-readable seller address (staff marketplace detail). */
  supplierStreetAddress?: string | null;
  supplierLatitude?: number | null;
  supplierLongitude?: number | null;
  /** Staff-only map pin embed / open link. */
  supplierMapEmbedUrl?: string | null;
  supplierMapUrl?: string | null;
  /** Road distance from buyer (OSRM); null when unknown. */
  distanceMeters?: number | null;
  distanceLabel?: string | null;
  travelMinutes?: number | null;
};

export type CatalogItem = {
  normalizedName: string;
  itemName: string;
  totalAvailable: number;
  supplierCount: number;
  listingCount: number;
  lowestPrice: number;
  highestPrice: number;
  listings: InventoryListing[];
};

export type PartRequestRouteEditor = {
  hidden: boolean;
  fromAddress: string;
  toAddress: string;
};

export type PartRequestFulfillmentRoute = {
  distanceMeters: number | null;
  travelMinutes: number | null;
  distanceLabel: string | null;
  fromAddress: string | null;
  toAddress: string | null;
  mapEmbedUrl: string | null;
  directionsUrl: string | null;
  /** City-level or estimated pin — staff should verify / edit. */
  approximate?: boolean;
  staffNotice?: string | null;
};

export type PartRequestView = {
  id: string;
  requestNumber: string;
  requestGroupId: string;
  inventoryId: string;
  supplierClientId: string;
  buyerClientId: string | null;
  buyerDisplayName: string;
  requesterUserId: number;
  requesterRole: string;
  itemName: string;
  requestedQuantity: number;
  /** Supplier / inventory unit price (what the business listed). */
  unitPrice: number;
  /** Marketplace listed price (supplier price + platform markup) at request time. */
  listedUnitPrice: number;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  supplierName: string;
  buyerName: string | null;
  /** Internal — used to build CD fulfillment routes; stripped for client viewers. */
  buyerAddress?: string | null;
  buyerLatitude?: number | null;
  buyerLongitude?: number | null;
  /** Seller pickup pin/address for staff route cards. */
  supplierStreetAddress?: string | null;
  supplierLatitude?: number | null;
  supplierLongitude?: number | null;
  routeHidden?: boolean;
  routeFromOverride?: string | null;
  routeToOverride?: string | null;
  /** Computer Dynamics staff only: OSRM distance/time + mapped directions. */
  fulfillmentRoute?: PartRequestFulfillmentRoute | null;
  /** Computer Dynamics staff only: edit/remove route controls. */
  routeEditor?: PartRequestRouteEditor | null;
  /** Snapshot ETA when staff marks ready for delivery (shown to buyer). */
  deliveryEtaMinutes?: number | null;
  deliveryEtaLabel?: string | null;
  /** Lifecycle timestamps for history timeline. */
  pendingDeliveryAt?: string | null;
  pickedUpAt?: string | null;
  completedAt?: string | null;
  cancelRequestedAt?: string | null;
  cancelledAt?: string | null;
  /** Route snapshot captured at fulfill time (history map). */
  deliveryFromAddress?: string | null;
  deliveryToAddress?: string | null;
  deliveryMapEmbedUrl?: string | null;
  deliveryDirectionsUrl?: string | null;
  /** Shared delivery package for same-buyer close-radius batching. */
  deliveryPackageId?: string | null;
  deliveryDistanceMeters?: number | null;
  /** Line delivery charge (package fee on anchor line; 0 when sharing). */
  deliveryFee?: number | null;
  /** Package-scoped quote/invoice billing (attached on list). */
  billing?: {
    deliveryPackageId: string;
    quoteId: string | null;
    invoiceId: string | null;
    billingStatus: 'none' | 'quoted' | 'awaiting_payment' | 'paid';
    quoteNumber: string | null;
    invoiceNumber: string | null;
    amountDue: number | null;
    paymentUnpaid: boolean;
    quoteStatus: string | null;
    invoiceStatus: string | null;
    codRequested?: boolean;
    codRequestedAt?: string | null;
  } | null;
};

const DELIVERY_PACKAGE_WINDOW_MS = 60 * 60 * 1000;

/** Pickup origin: staff override → seller pin/street → CD company (last resort). */
async function resolvePickupOriginForRequest(row: {
  routeFromOverride?: string | null;
  deliveryFromAddress?: string | null;
  supplierAddress?: string | null;
  supplierLatitude?: number | null;
  supplierLongitude?: number | null;
  supplierContractDetails?: unknown;
  supplierStreetAddress?: string | null;
}): Promise<{ from: string | null; displayFrom: string | null }> {
  const override = row.routeFromOverride?.trim() || null;
  if (override) return { from: override, displayFrom: override };

  const persisted = row.deliveryFromAddress?.trim() || null;
  const supplierPin = resolveClientMapLocation({
    latitude: row.supplierLatitude,
    longitude: row.supplierLongitude,
    contractDetails: row.supplierContractDetails,
  });
  const supplierCoords = coordsFromClient(supplierPin ?? {});
  const supplierStreet =
    row.supplierStreetAddress?.trim() || row.supplierAddress?.trim() || null;
  // Prefer lat/lon for routing accuracy; show street in the UI when available.
  const supplierOrigin = supplierCoords || supplierStreet;
  if (supplierOrigin) {
    return { from: supplierOrigin, displayFrom: supplierStreet || supplierOrigin };
  }
  if (persisted) return { from: persisted, displayFrom: persisted };

  const company = await getCompanySettings().catch(() => null);
  const companyAddress = company?.companyAddress?.trim() || null;
  return { from: companyAddress, displayFrom: companyAddress };
}

function resolveDeliveryDestinationForRequest(row: {
  routeToOverride?: string | null;
  deliveryToAddress?: string | null;
  buyerAddress?: string | null;
  buyerLatitude?: number | null;
  buyerLongitude?: number | null;
  buyerContractDetails?: unknown;
}): { to: string | null; displayTo: string | null } {
  const override = row.routeToOverride?.trim() || null;
  if (override) return { to: override, displayTo: override };

  const buyerPin = resolveClientMapLocation({
    latitude: row.buyerLatitude,
    longitude: row.buyerLongitude,
    contractDetails: row.buyerContractDetails,
  });
  const buyerCoords = coordsFromClient(buyerPin ?? {});
  const buyerStreet = row.buyerAddress?.trim() || null;
  const to = buyerCoords || buyerStreet || row.deliveryToAddress?.trim() || null;
  return { to, displayTo: buyerStreet || to };
}

export function applyPartsCatalogMarkup(unitPrice: number, markupPercent: number) {
  const base = Number(unitPrice) || 0;
  const pct = Number.isFinite(markupPercent) ? Math.max(0, markupPercent) : DEFAULT_PARTS_CATALOG_MARKUP_PERCENT;
  // Whole dollars only — no cents.
  return Math.round(base * (1 + pct / 100));
}

/** Reads platform markup % from system config (default 15). Does not depend on settings.js shims. */
export async function getPartsCatalogMarkupPercent() {
  try {
    const raw = await SystemConfig.getConfig<number>(
      'parts_catalog_markup_percent',
      DEFAULT_PARTS_CATALOG_MARKUP_PERCENT
    );
    const markupPercent = Number(raw);
    if (!Number.isFinite(markupPercent) || markupPercent < 0) {
      return DEFAULT_PARTS_CATALOG_MARKUP_PERCENT;
    }
    return Math.min(1000, markupPercent);
  } catch {
    return DEFAULT_PARTS_CATALOG_MARKUP_PERCENT;
  }
}

/** Apply platform markup to catalog listings for marketplace buyers (hides base price / %). */
export function toPublicCatalogItem(item: CatalogItem, markupPercent: number): CatalogItem {
  const pct =
    Number.isFinite(markupPercent) && markupPercent >= 0
      ? markupPercent
      : DEFAULT_PARTS_CATALOG_MARKUP_PERCENT;
  const listings = sortListingsCheapestThenClosest(
    item.listings.map((listing) => {
      const listedUnitPrice = applyPartsCatalogMarkup(listing.unitPrice, pct);
      return {
        ...listing,
        unitPrice: listedUnitPrice,
        listedUnitPrice,
      };
    })
  );

  const prices = listings.map((listing) => listing.unitPrice);
  return {
    ...item,
    lowestPrice: prices.length ? Math.min(...prices) : 0,
    highestPrice: prices.length ? Math.max(...prices) : 0,
    listings,
  };
}

/**
 * Attach OSRM road distances from the buyer address to each supplier listing,
 * then re-sort: cheapest first, then remaining by closest.
 * Keeps supplierAddress for staff responses (clients strip it in the API handler).
 * Uses pins + geocode cache only (no live Nominatim) so catalog GET stays fast.
 */
export async function withBuyerDistances(
  catalog: CatalogItem[],
  buyerAddress: string | null | undefined
): Promise<CatalogItem[]> {
  const flatAddresses = catalog.flatMap((item) =>
    item.listings.map((listing) => {
      // Prefer stored pin coords as "lat,lon" so we never need Nominatim.
      if (
        listing.supplierLatitude != null &&
        listing.supplierLongitude != null &&
        Number.isFinite(Number(listing.supplierLatitude)) &&
        Number.isFinite(Number(listing.supplierLongitude))
      ) {
        return `${listing.supplierLatitude},${listing.supplierLongitude}`;
      }
      return listing.supplierAddress ?? null;
    })
  );
  const distances = await distancesFromBuyerAddress(buyerAddress, flatAddresses, {
    liveGeocode: false,
  });

  let index = 0;
  return catalog.map((item) => {
    const listings = sortListingsCheapestThenClosest(
      item.listings.map((listing) => {
        const route = distances[index++] ?? {
          distanceMeters: null,
          travelMinutes: null,
          distanceLabel: null,
        };
        return {
          ...listing,
          distanceMeters: route.distanceMeters,
          distanceLabel: route.distanceLabel,
          travelMinutes: route.travelMinutes,
        };
      })
    );
    return { ...item, listings };
  });
}

/** Buyer origin for distance: linked client pin/address, or company address for staff. */
export async function resolvePartsBuyerAddress(role: string, userId: number) {
  if (role === 'client') {
    await ensureClientLocationColumns();
    const client = await Client.findOne({
      where: { userId },
      attributes: ['id', 'address'],
    });
    if (!client) return null;
    const location = await readClientLocation(client.id);
    const pin = coordsFromClient(location);
    if (pin) return pin;
    return client.address?.trim() || null;
  }
  if (role === 'admin' || role === 'technician') {
    const company = await getCompanySettings().catch(() => null);
    return company?.companyAddress?.trim() || null;
  }
  return null;
}

export function withListedUnitPrice(
  listing: InventoryListing,
  markupPercent: number
): InventoryListing {
  const listedUnitPrice = applyPartsCatalogMarkup(listing.unitPrice, markupPercent);
  return { ...listing, listedUnitPrice };
}

function toDisplayClientName(input: { companyName?: string | null; name?: string | null }) {
  return input.companyName?.trim() || input.name?.trim() || 'Business';
}

function makeRequestNumber() {
  return `PRT-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function normalizePartName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function asListing(row: InventoryRow): InventoryListing {
  const pin = resolveClientMapLocation({
    latitude: row.clientLatitude,
    longitude: row.clientLongitude,
    contractDetails: row.clientContractDetails,
  });
  const coords = coordsFromClient(pin ?? {});
  const streetAddress = row.clientAddress?.trim() || null;

  return {
    id: row.id,
    clientId: row.clientId,
    itemName: row.itemName,
    normalizedName: row.normalizedName,
    partNumber: row.partNumber,
    brand: row.brand,
    notes: row.notes,
    unitPrice: Number(row.unitPrice ?? 0),
    quantity: Number(row.quantity ?? 0),
    availableQuantity: Number(row.availableQuantity ?? 0),
    createdBy: Number(row.createdBy),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    supplierName: toDisplayClientName({
      companyName: row.clientCompanyName,
      name: row.clientName,
    }),
    // Coords preferred for OSRM distance; street address is the fallback.
    supplierAddress: coords || streetAddress,
    supplierStreetAddress: streetAddress,
    supplierLatitude: pin?.latitude ?? null,
    supplierLongitude: pin?.longitude ?? null,
  };
}

function asRequest(row: RequestRow): PartRequestView {
  const unitPrice = Number(row.unitPrice ?? 0);
  const listedRaw = row.listedUnitPrice;
  const listedUnitPrice =
    listedRaw === null || listedRaw === undefined
      ? unitPrice
      : Number(listedRaw);
  return {
    id: row.id,
    requestNumber: row.requestNumber,
    requestGroupId: row.requestGroupId,
    inventoryId: row.inventoryId,
    supplierClientId: row.supplierClientId,
    buyerClientId: row.buyerClientId,
    buyerDisplayName: row.buyerDisplayName,
    requesterUserId: Number(row.requesterUserId),
    requesterRole: row.requesterRole,
    itemName: row.itemName,
    requestedQuantity: Number(row.requestedQuantity ?? 0),
    unitPrice,
    listedUnitPrice: Number.isFinite(listedUnitPrice) ? listedUnitPrice : unitPrice,
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    supplierName: toDisplayClientName({
      companyName: row.supplierCompanyName,
      name: row.supplierName,
    }),
    buyerName: row.buyerClientId
      ? toDisplayClientName({
          companyName: row.buyerCompanyName,
          name: row.buyerName,
        })
      : row.buyerDisplayName,
    buyerAddress: row.buyerAddress?.trim() || null,
    buyerLatitude:
      resolveClientMapLocation({
        latitude: row.buyerLatitude,
        longitude: row.buyerLongitude,
        contractDetails: row.buyerContractDetails,
      })?.latitude ?? null,
    buyerLongitude:
      resolveClientMapLocation({
        latitude: row.buyerLatitude,
        longitude: row.buyerLongitude,
        contractDetails: row.buyerContractDetails,
      })?.longitude ?? null,
    supplierStreetAddress: row.supplierAddress?.trim() || null,
    supplierLatitude:
      resolveClientMapLocation({
        latitude: row.supplierLatitude,
        longitude: row.supplierLongitude,
        contractDetails: row.supplierContractDetails,
      })?.latitude ?? null,
    supplierLongitude:
      resolveClientMapLocation({
        latitude: row.supplierLatitude,
        longitude: row.supplierLongitude,
        contractDetails: row.supplierContractDetails,
      })?.longitude ?? null,
    routeHidden: Boolean(row.routeHidden),
    routeFromOverride: row.routeFromOverride?.trim() || null,
    routeToOverride: row.routeToOverride?.trim() || null,
    deliveryEtaMinutes:
      row.deliveryEtaMinutes === null || row.deliveryEtaMinutes === undefined
        ? null
        : Number(row.deliveryEtaMinutes),
    deliveryEtaLabel: row.deliveryEtaLabel?.trim() || null,
    pendingDeliveryAt: row.pendingDeliveryAt?.trim() || null,
    pickedUpAt: row.pickedUpAt?.trim() || null,
    completedAt: row.completedAt?.trim() || null,
    cancelRequestedAt: row.cancelRequestedAt?.trim() || null,
    cancelledAt: row.cancelledAt?.trim() || null,
    deliveryFromAddress: row.deliveryFromAddress?.trim() || null,
    deliveryToAddress: row.deliveryToAddress?.trim() || null,
    deliveryMapEmbedUrl: row.deliveryMapEmbedUrl?.trim() || null,
    deliveryDirectionsUrl: row.deliveryDirectionsUrl?.trim() || null,
    deliveryPackageId: row.deliveryPackageId?.trim() || null,
    deliveryDistanceMeters:
      row.deliveryDistanceMeters === null || row.deliveryDistanceMeters === undefined
        ? null
        : Number(row.deliveryDistanceMeters),
    deliveryFee:
      row.deliveryFee === null || row.deliveryFee === undefined ? null : Number(row.deliveryFee),
  };
}

async function createClientNotice(clientId: string, title: string, content: string) {
  return NoticeBoard.create({
    title,
    content,
    authorId: SYSTEM_AUTHOR_ID,
    priority: 'high',
    category: 'parts',
    targetAudience: 'client',
    targetRoles: ['client'],
    targetUsers: [],
    isPinned: false,
    isActive: true,
    publishAt: new Date(),
    attachments: [],
    tags: ['automated', 'parts-catalog', 'scope:shop', `client:${clientId}`],
  });
}

async function createStaffNotice(title: string, content: string) {
  return NoticeBoard.create({
    title,
    content,
    authorId: SYSTEM_AUTHOR_ID,
    priority: 'normal',
    category: 'parts',
    targetAudience: 'all',
    targetRoles: ['admin', 'technician'],
    targetUsers: [],
    isPinned: false,
    isActive: true,
    publishAt: new Date(),
    attachments: [],
    tags: ['automated', 'parts-catalog', 'scope:shop'],
  });
}

const PARTS_ACTIVITY_CONFIG_KEY = 'parts_catalog_activity';
const PARTS_ACTIVITY_WAKE_MS = 60_000;

export type PartsCatalogActivity = {
  version: number;
  at: string;
  /** Clients may run a short follow-up poll burst until this time. */
  wakeUntil: string;
};

/** Bump shared activity so other open portals wake a short poll burst (no continuous full polling). */
export async function touchPartsCatalogActivity(reason?: string): Promise<PartsCatalogActivity> {
  const now = Date.now();
  const prev = await SystemConfig.getConfig<PartsCatalogActivity | null>(PARTS_ACTIVITY_CONFIG_KEY, null);
  const version = Math.max(1, Number(prev?.version ?? 0) + 1);
  const activity: PartsCatalogActivity = {
    version,
    at: new Date(now).toISOString(),
    wakeUntil: new Date(now + PARTS_ACTIVITY_WAKE_MS).toISOString(),
  };
  await SystemConfig.setConfig(
    PARTS_ACTIVITY_CONFIG_KEY,
    activity,
    'json',
    'parts_catalog'
  );
  if (reason) {
    // Keep for local debugging only — avoid noisy logs in production paths.
  }
  return activity;
}

export async function getPartsCatalogActivity(): Promise<PartsCatalogActivity> {
  try {
    const prev = await SystemConfig.getConfig<PartsCatalogActivity | null>(
      PARTS_ACTIVITY_CONFIG_KEY,
      null
    );
    if (prev && typeof prev === 'object' && Number.isFinite(Number(prev.version))) {
      return {
        version: Number(prev.version),
        at: String(prev.at || ''),
        wakeUntil: String(prev.wakeUntil || prev.at || ''),
      };
    }
  } catch {
    // Never fail portal-wide PartsLiveSync polling.
  }
  return { version: 0, at: '', wakeUntil: '' };
}

export async function ensurePartsCatalogSchema() {
  if (schemaReady) return;
  if (schemaEnsureInFlight) return schemaEnsureInFlight;
  schemaEnsureInFlight = ensurePartsCatalogSchemaInner().finally(() => {
    schemaEnsureInFlight = null;
  });
  return schemaEnsureInFlight;
}

async function ensurePartsCatalogSchemaInner() {
  if (schemaReady) return;
  const sequelize = getSequelize();
  // Always migrate package billing columns (feature can ship after first boot).
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS parts_delivery_packages (
      id TEXT PRIMARY KEY,
      buyerClientId TEXT,
      buyerKey TEXT NOT NULL,
      maxDistanceMeters REAL,
      deliveryFee REAL NOT NULL DEFAULT 0,
      quoteId TEXT,
      invoiceId TEXT,
      billingStatus TEXT NOT NULL DEFAULT 'none',
      codRequestedAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);
  {
    const packageCols = await sequelize.query<{ name: string }>(
      `PRAGMA table_info(parts_delivery_packages)`,
      { type: QueryTypes.SELECT }
    );
    const packageBillingCols: Array<{ name: string; sql: string }> = [
      { name: 'quoteId', sql: 'ALTER TABLE parts_delivery_packages ADD COLUMN quoteId TEXT' },
      { name: 'invoiceId', sql: 'ALTER TABLE parts_delivery_packages ADD COLUMN invoiceId TEXT' },
      {
        name: 'billingStatus',
        sql: `ALTER TABLE parts_delivery_packages ADD COLUMN billingStatus TEXT NOT NULL DEFAULT 'none'`,
      },
      {
        name: 'codRequestedAt',
        sql: 'ALTER TABLE parts_delivery_packages ADD COLUMN codRequestedAt TEXT',
      },
      {
        name: 'cdRevenueAmount',
        sql: 'ALTER TABLE parts_delivery_packages ADD COLUMN cdRevenueAmount REAL',
      },
      {
        name: 'platformCostAmount',
        sql: 'ALTER TABLE parts_delivery_packages ADD COLUMN platformCostAmount REAL',
      },
      {
        name: 'externalSellerAmount',
        sql: 'ALTER TABLE parts_delivery_packages ADD COLUMN externalSellerAmount REAL',
      },
    ];
    for (const col of packageBillingCols) {
      await addColumnIfMissing(sequelize, packageCols, col.name, col.sql);
    }
  }

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS parts_inventory (
      id TEXT PRIMARY KEY,
      clientId TEXT NOT NULL,
      itemName TEXT NOT NULL,
      normalizedName TEXT NOT NULL,
      partNumber TEXT,
      brand TEXT,
      notes TEXT,
      unitPrice REAL NOT NULL DEFAULT 0,
      quantity INTEGER NOT NULL DEFAULT 0,
      availableQuantity INTEGER NOT NULL DEFAULT 0,
      createdBy INTEGER NOT NULL,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS parts_inventory_normalized_name
      ON parts_inventory (normalizedName, isActive, availableQuantity)
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS parts_inventory_client
      ON parts_inventory (clientId, isActive)
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS parts_requests (
      id TEXT PRIMARY KEY,
      requestNumber TEXT NOT NULL,
      requestGroupId TEXT NOT NULL,
      inventoryId TEXT NOT NULL,
      supplierClientId TEXT NOT NULL,
      buyerClientId TEXT,
      buyerDisplayName TEXT NOT NULL,
      requesterUserId INTEGER NOT NULL,
      requesterRole TEXT NOT NULL,
      itemName TEXT NOT NULL,
      normalizedName TEXT NOT NULL,
      requestedQuantity INTEGER NOT NULL,
      unitPrice REAL NOT NULL DEFAULT 0,
      listedUnitPrice REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      notes TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);

  // Existing DBs created before listedUnitPrice — add column if missing.
  const requestCols = await sequelize.query<{ name: string }>(
    `PRAGMA table_info(parts_requests)`,
    { type: QueryTypes.SELECT }
  );
  await addColumnIfMissing(
    sequelize,
    requestCols,
    'listedUnitPrice',
    `ALTER TABLE parts_requests ADD COLUMN listedUnitPrice REAL NOT NULL DEFAULT 0`
  );
  await sequelize.query(
    `UPDATE parts_requests SET listedUnitPrice = unitPrice WHERE listedUnitPrice = 0 OR listedUnitPrice IS NULL`
  );
  await addColumnIfMissing(
    sequelize,
    requestCols,
    'routeHidden',
    `ALTER TABLE parts_requests ADD COLUMN routeHidden INTEGER NOT NULL DEFAULT 0`
  );
  await addColumnIfMissing(
    sequelize,
    requestCols,
    'routeFromOverride',
    `ALTER TABLE parts_requests ADD COLUMN routeFromOverride TEXT`
  );
  await addColumnIfMissing(
    sequelize,
    requestCols,
    'routeToOverride',
    `ALTER TABLE parts_requests ADD COLUMN routeToOverride TEXT`
  );
  await addColumnIfMissing(
    sequelize,
    requestCols,
    'deliveryEtaMinutes',
    `ALTER TABLE parts_requests ADD COLUMN deliveryEtaMinutes INTEGER`
  );
  await addColumnIfMissing(
    sequelize,
    requestCols,
    'deliveryEtaLabel',
    `ALTER TABLE parts_requests ADD COLUMN deliveryEtaLabel TEXT`
  );
  const historyCols: Array<{ name: string; sql: string }> = [
    { name: 'pendingDeliveryAt', sql: 'ALTER TABLE parts_requests ADD COLUMN pendingDeliveryAt TEXT' },
    { name: 'pickedUpAt', sql: 'ALTER TABLE parts_requests ADD COLUMN pickedUpAt TEXT' },
    { name: 'completedAt', sql: 'ALTER TABLE parts_requests ADD COLUMN completedAt TEXT' },
    { name: 'cancelRequestedAt', sql: 'ALTER TABLE parts_requests ADD COLUMN cancelRequestedAt TEXT' },
    { name: 'cancelledAt', sql: 'ALTER TABLE parts_requests ADD COLUMN cancelledAt TEXT' },
    { name: 'deliveryFromAddress', sql: 'ALTER TABLE parts_requests ADD COLUMN deliveryFromAddress TEXT' },
    { name: 'deliveryToAddress', sql: 'ALTER TABLE parts_requests ADD COLUMN deliveryToAddress TEXT' },
    { name: 'deliveryMapEmbedUrl', sql: 'ALTER TABLE parts_requests ADD COLUMN deliveryMapEmbedUrl TEXT' },
    { name: 'deliveryDirectionsUrl', sql: 'ALTER TABLE parts_requests ADD COLUMN deliveryDirectionsUrl TEXT' },
    { name: 'deliveryPackageId', sql: 'ALTER TABLE parts_requests ADD COLUMN deliveryPackageId TEXT' },
    { name: 'deliveryDistanceMeters', sql: 'ALTER TABLE parts_requests ADD COLUMN deliveryDistanceMeters REAL' },
    { name: 'deliveryFee', sql: 'ALTER TABLE parts_requests ADD COLUMN deliveryFee REAL' },
  ];
  for (const col of historyCols) {
    await addColumnIfMissing(sequelize, requestCols, col.name, col.sql);
  }

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS parts_delivery_packages_buyer
      ON parts_delivery_packages (buyerKey, createdAt)
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS parts_delivery_packages_quote
      ON parts_delivery_packages (quoteId)
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS parts_delivery_packages_invoice
      ON parts_delivery_packages (invoiceId)
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS parts_requests_delivery_package
      ON parts_requests (deliveryPackageId)
  `);

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS parts_requests_supplier
      ON parts_requests (supplierClientId, createdAt)
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS parts_requests_buyer
      ON parts_requests (buyerClientId, requesterUserId, createdAt)
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS parts_requests_number
      ON parts_requests (requestNumber, requestGroupId)
  `);

  // Ensure platform markup setting exists (default 15%).
  const existingMarkup = await SystemConfig.getConfig<number | null>(
    'parts_catalog_markup_percent',
    null
  );
  if (existingMarkup === null || existingMarkup === undefined) {
    await SystemConfig.setConfig(
      'parts_catalog_markup_percent',
      DEFAULT_PARTS_CATALOG_MARKUP_PERCENT,
      'number',
      'parts_catalog'
    );
  }

  schemaReady = true;
}

export async function getPortalClientByUserId(userId: number) {
  return Client.findOne({
    where: { userId },
    attributes: ['id', 'name', 'companyName', 'email', 'address', 'phone'],
  });
}

/** Pending incoming allocations for a stock owner (supplier). */
export async function countPendingIncomingPartsRequests(supplierClientId: string): Promise<number> {
  if (!supplierClientId) return 0;
  await ensurePartsCatalogSchema();
  const sequelize = getSequelize();
  const rows = await sequelize.query<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM parts_requests
      WHERE supplierClientId = :supplierClientId
        AND status = 'pending'
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { supplierClientId },
    }
  );
  return Number(rows[0]?.count ?? 0);
}

export function isPartsCatalogPlatformClient(contractDetails: unknown): boolean {
  if (!contractDetails || typeof contractDetails !== 'object') return false;
  return Boolean((contractDetails as Record<string, unknown>).isPartsCatalogPlatform);
}

/** Internal CD stock owner used by admin/technician "Our Stock". */
export async function getOrCreatePlatformPartsClient() {
  const existing = await Client.findOne({
    where: { email: PLATFORM_PARTS_CLIENT_EMAIL },
    attributes: ['id', 'name', 'companyName', 'email', 'contractDetails'],
  });
  if (existing) return existing;

  const company = await getCompanySettings().catch(() => ({
    companyName: 'Computer Dynamics',
  }));
  const companyName = company.companyName?.trim() || 'Computer Dynamics';

  return Client.create({
    name: companyName,
    companyName,
    email: PLATFORM_PARTS_CLIENT_EMAIL,
    notes: 'Internal Computer Dynamics parts catalog stock owner',
    status: 'active',
    isActive: true,
    contractDetails: { isPartsCatalogPlatform: true },
  });
}

/** Client businesses use their linked client; staff use the platform stock owner. */
export async function resolveStockOwnerForViewer(role: string, userId: number) {
  if (role === 'client') {
    return getPortalClientByUserId(userId);
  }
  if (role === 'admin' || role === 'technician') {
    return getOrCreatePlatformPartsClient();
  }
  return null;
}

export async function listCatalogItems(options?: {
  search?: string;
  limit?: number;
  /** Exclude this stock owner's listings (viewer must not see themselves). */
  excludeClientId?: string | null;
}) {
  await ensurePartsCatalogSchema();
  await ensureClientLocationColumns();
  const sequelize = getSequelize();
  const search = options?.search?.trim();
  const limit = Math.min(100, Math.max(1, options?.limit ?? 100));
  const excludeClientId = options?.excludeClientId?.trim() || null;
  const rows = await sequelize.query<InventoryRow>(
    `
      SELECT p.*,
        c.name AS clientName,
        c.company_name AS clientCompanyName,
        c.address AS clientAddress,
        c.latitude AS clientLatitude,
        c.longitude AS clientLongitude,
        c.contract_details AS clientContractDetails
      FROM parts_inventory p
      INNER JOIN clients c ON c.id = p.clientId
      WHERE p.isActive = 1
        AND p.availableQuantity > 0
        AND (:excludeClientId IS NULL OR p.clientId <> :excludeClientId)
        AND (
          :search = ''
          OR p.itemName LIKE :like
          OR COALESCE(p.partNumber, '') LIKE :like
          OR COALESCE(p.brand, '') LIKE :like
        )
      ORDER BY p.itemName ASC, p.unitPrice ASC, p.updatedAt DESC
      LIMIT :limit
    `,
    {
      type: QueryTypes.SELECT,
      replacements: {
        search: search ?? '',
        like: `%${search ?? ''}%`,
        limit,
        excludeClientId,
      },
    }
  );

  const grouped = new Map<string, CatalogItem>();
  for (const row of rows) {
    const listing = asListing(row);
    const existing = grouped.get(listing.normalizedName);
    if (!existing) {
      grouped.set(listing.normalizedName, {
        normalizedName: listing.normalizedName,
        itemName: listing.itemName,
        totalAvailable: listing.availableQuantity,
        supplierCount: 1,
        listingCount: 1,
        lowestPrice: listing.unitPrice,
        highestPrice: listing.unitPrice,
        listings: [listing],
      });
      continue;
    }

    existing.totalAvailable += listing.availableQuantity;
    existing.listingCount += 1;
    existing.lowestPrice = Math.min(existing.lowestPrice, listing.unitPrice);
    existing.highestPrice = Math.max(existing.highestPrice, listing.unitPrice);
    if (!existing.listings.some((item) => item.clientId === listing.clientId)) {
      existing.supplierCount += 1;
    }
    existing.listings.push(listing);
  }

  return Array.from(grouped.values()).sort((a, b) => {
    if (b.totalAvailable !== a.totalAvailable) return b.totalAvailable - a.totalAvailable;
    return a.itemName.localeCompare(b.itemName);
  });
}

export async function listInventoryForClient(clientId: string) {
  await ensurePartsCatalogSchema();
  const sequelize = getSequelize();
  const rows = await sequelize.query<InventoryRow>(
    `
      SELECT p.*,
        c.name AS clientName,
        c.company_name AS clientCompanyName
      FROM parts_inventory p
      INNER JOIN clients c ON c.id = p.clientId
      WHERE p.clientId = :clientId
        AND p.isActive = 1
      ORDER BY p.updatedAt DESC, p.createdAt DESC
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { clientId },
    }
  );
  return rows.map(asListing);
}

export async function listPartRequestsForViewer(options: {
  role: string;
  userId: number;
  clientId?: string | null;
}) {
  await ensurePartsCatalogSchema();
  await ensureClientLocationColumns();
  const sequelize = getSequelize();

  const outgoingWhere =
    options.role === 'client' && options.clientId
      ? 'r.buyerClientId = :clientId'
      : options.role === 'admin' || options.role === 'technician'
        ? `(r.requesterUserId = :userId OR r.status = 'cancel_requested')`
        : 'r.requesterUserId = :userId';

  const outgoingRows = await sequelize.query<RequestRow>(
    `
      SELECT r.*,
        supplier.name AS supplierName,
        supplier.company_name AS supplierCompanyName,
        buyer.name AS buyerName,
        buyer.company_name AS buyerCompanyName
      FROM parts_requests r
      LEFT JOIN clients supplier ON supplier.id = r.supplierClientId
      LEFT JOIN clients buyer ON buyer.id = r.buyerClientId
      WHERE ${outgoingWhere}
      ORDER BY r.createdAt DESC
      LIMIT 100
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { userId: options.userId, clientId: options.clientId ?? null },
    }
  );

  const canViewIncoming =
    Boolean(options.clientId) &&
    (options.role === 'client' || options.role === 'admin' || options.role === 'technician');

  const isCdStaff = options.role === 'admin' || options.role === 'technician';
  // Clients: only their own supplier allocations (fulfill).
  // CD staff: own platform stock + any request already past fulfill (delivery ops for all sellers).
  const incomingWhere = isCdStaff
    ? `(r.supplierClientId = :clientId OR r.status IN ('pending_delivery', 'out_for_delivery'))`
    : 'r.supplierClientId = :clientId';

  const incomingRows = canViewIncoming
    ? await sequelize.query<RequestRow>(
        `
          SELECT r.*,
            supplier.name AS supplierName,
            supplier.company_name AS supplierCompanyName,
            supplier.address AS supplierAddress,
            supplier.latitude AS supplierLatitude,
            supplier.longitude AS supplierLongitude,
            supplier.contract_details AS supplierContractDetails,
            buyer.name AS buyerName,
            buyer.company_name AS buyerCompanyName,
            buyer.address AS buyerAddress,
            buyer.latitude AS buyerLatitude,
            buyer.longitude AS buyerLongitude,
            buyer.contract_details AS buyerContractDetails
          FROM parts_requests r
          LEFT JOIN clients supplier ON supplier.id = r.supplierClientId
          LEFT JOIN clients buyer ON buyer.id = r.buyerClientId
          WHERE ${incomingWhere}
          ORDER BY r.createdAt DESC
          LIMIT 100
        `,
        {
          type: QueryTypes.SELECT,
          replacements: { clientId: options.clientId },
        }
      )
    : [];

  return {
    outgoing: outgoingRows.map(asRequest),
    incoming: incomingRows.map(asRequest),
  };
}

function toFulfillmentRoute(summary: DrivingRouteSummary): PartRequestFulfillmentRoute {
  return {
    distanceMeters: summary.distanceMeters,
    travelMinutes: summary.travelMinutes,
    distanceLabel: summary.distanceLabel,
    fromAddress: summary.fromAddress,
    toAddress: summary.toAddress,
    mapEmbedUrl: summary.mapEmbedUrl,
    directionsUrl: summary.directionsUrl,
    approximate: Boolean(summary.approximate),
    staffNotice: summary.staffNotice,
  };
}

/**
 * Computer Dynamics staff only: attach OSRM distance/time + map directions
 * from seller pickup → buyer for incoming fulfillment cards.
 * Honors per-request route overrides / hidden flag set by staff.
 */
export async function withStaffFulfillmentRoutes(
  incoming: PartRequestView[],
  _originAddress: string | null | undefined
): Promise<PartRequestView[]> {
  if (!incoming.length) return incoming;

  const origins = await Promise.all(
    incoming.map(async (request) => {
      if (request.routeHidden) return { from: null as string | null, displayFrom: '' };
      return resolvePickupOriginForRequest({
        routeFromOverride: request.routeFromOverride,
        deliveryFromAddress: request.deliveryFromAddress,
        supplierAddress: request.supplierStreetAddress,
        supplierLatitude: request.supplierLatitude,
        supplierLongitude: request.supplierLongitude,
        supplierStreetAddress: request.supplierStreetAddress,
      });
    })
  );

  const destinations = incoming.map((request) => {
    if (request.routeHidden) return { to: null as string | null, displayTo: '' };
    return resolveDeliveryDestinationForRequest({
      routeToOverride: request.routeToOverride,
      deliveryToAddress: request.deliveryToAddress,
      buyerAddress: request.buyerAddress,
      buyerLatitude: request.buyerLatitude,
      buyerLongitude: request.buyerLongitude,
    });
  });

  // Always route seller pickup → buyer when seller location is known.
  // Persisted fulfill maps may be stale (older builds used CD office as From).
  const routes = await Promise.all(
    incoming.map(async (request, index) => {
      if (request.routeHidden) return null;
      const from = origins[index].from;
      const to = destinations[index].to;
      if (!from || !to) {
        if (request.deliveryMapEmbedUrl) {
          return {
            distanceMeters: request.deliveryDistanceMeters ?? null,
            travelMinutes: request.deliveryEtaMinutes ?? null,
            distanceLabel:
              request.deliveryDistanceMeters != null
                ? formatDistanceLabel(request.deliveryDistanceMeters)
                : null,
            fromAddress: request.deliveryFromAddress ?? null,
            toAddress: request.deliveryToAddress ?? null,
            from: null,
            to: null,
            mapEmbedUrl: request.deliveryMapEmbedUrl,
            directionsUrl: request.deliveryDirectionsUrl ?? null,
            source: 'none' as const,
            approximate: false,
            staffNotice: null,
            matchedCityFrom: null,
            matchedCityTo: null,
          } satisfies DrivingRouteSummary;
        }
        return null;
      }
      return getDrivingRoute(from, to, { liveGeocode: false });
    })
  );

  return incoming.map((request, index) => {
    const {
      buyerAddress,
      buyerLatitude: _lat,
      buyerLongitude: _lon,
      supplierStreetAddress: _ss,
      supplierLatitude: _slat,
      supplierLongitude: _slon,
      routeFromOverride,
      routeToOverride,
      routeHidden,
      ...rest
    } = request;
    const editorFrom =
      routeFromOverride?.trim() ||
      origins[index].displayFrom ||
      request.deliveryFromAddress?.trim() ||
      '';
    const editorTo =
      routeToOverride?.trim() ||
      destinations[index].displayTo ||
      buyerAddress?.trim() ||
      '';
    const summary = routes[index];
    const hasRoute =
      !routeHidden &&
      summary &&
      (summary.distanceLabel || summary.mapEmbedUrl || summary.travelMinutes != null);
    return {
      ...rest,
      fulfillmentRoute: hasRoute ? toFulfillmentRoute(summary) : null,
      routeEditor: {
        hidden: Boolean(routeHidden),
        fromAddress: editorFrom,
        toAddress: editorTo,
      },
    };
  });
}

/** Strip buyer addresses / routes before returning incoming to non-staff suppliers. */
export function stripIncomingForClientSupplier(incoming: PartRequestView[]): PartRequestView[] {
  return incoming.map((request) => {
    const {
      buyerAddress: _a,
      buyerLatitude: _lat,
      buyerLongitude: _lon,
      supplierStreetAddress: _ss,
      supplierLatitude: _slat,
      supplierLongitude: _slon,
      fulfillmentRoute: _r,
      routeEditor: _e,
      routeHidden: _h,
      routeFromOverride: _f,
      routeToOverride: _t,
      ...rest
    } = request;
    return rest;
  });
}

/**
 * Staff: remove, recalculate (custom from/to), or reset route overrides on a request.
 */
export async function updateStaffFulfillmentRoute(input: {
  requestId: string;
  supplierClientId: string;
  action: 'remove' | 'update' | 'reset';
  fromAddress?: string | null;
  toAddress?: string | null;
  defaultOriginAddress?: string | null;
  allowStaffOverride?: boolean;
}): Promise<{
  fulfillmentRoute: PartRequestFulfillmentRoute | null;
  routeEditor: PartRequestRouteEditor;
}> {
  await ensurePartsCatalogSchema();
  const sequelize = getSequelize();
  const requestId = String(input.requestId ?? '').trim();
  if (!requestId) throw new Error('Request id is required');

  const rows = await sequelize.query<{
    id: string;
    supplierClientId: string;
    buyerAddress: string | null;
    supplierAddress: string | null;
    supplierLatitude: number | null;
    supplierLongitude: number | null;
    supplierContractDetails: unknown;
    routeHidden: number | boolean | null;
    routeFromOverride: string | null;
    routeToOverride: string | null;
  }>(
    `
      SELECT r.id, r.supplierClientId, r.routeHidden, r.routeFromOverride, r.routeToOverride,
        buyer.address AS buyerAddress,
        supplier.address AS supplierAddress,
        supplier.latitude AS supplierLatitude,
        supplier.longitude AS supplierLongitude,
        supplier.contract_details AS supplierContractDetails
      FROM parts_requests r
      LEFT JOIN clients buyer ON buyer.id = r.buyerClientId
      LEFT JOIN clients supplier ON supplier.id = r.supplierClientId
      WHERE r.id = :requestId
      LIMIT 1
    `,
    { type: QueryTypes.SELECT, replacements: { requestId } }
  );
  const row = rows[0];
  if (!row) throw new Error('Request not found');
  if (
    input.supplierClientId &&
    row.supplierClientId !== input.supplierClientId &&
    !input.allowStaffOverride
  ) {
    throw new Error('You can only edit routes for your stock requests');
  }

  const pickup = await resolvePickupOriginForRequest({
    routeFromOverride: null,
    supplierAddress: row.supplierAddress,
    supplierLatitude: row.supplierLatitude,
    supplierLongitude: row.supplierLongitude,
    supplierContractDetails: row.supplierContractDetails,
    supplierStreetAddress: row.supplierAddress,
  });
  const defaultOrigin =
    pickup.displayFrom ||
    pickup.from ||
    String(input.defaultOriginAddress ?? '').trim() ||
    null;
  const defaultTo = row.buyerAddress?.trim() || null;
  const now = new Date().toISOString();

  let routeHidden = 0;
  let routeFromOverride: string | null = row.routeFromOverride?.trim() || null;
  let routeToOverride: string | null = row.routeToOverride?.trim() || null;

  if (input.action === 'remove') {
    routeHidden = 1;
  } else if (input.action === 'reset') {
    routeHidden = 0;
    routeFromOverride = null;
    routeToOverride = null;
  } else {
    // update / recalculate
    const from = String(input.fromAddress ?? '').trim();
    const to = String(input.toAddress ?? '').trim();
    if (!from || !to) throw new Error('From and To are required to recalculate the route');
    routeHidden = 0;
    routeFromOverride = from;
    routeToOverride = to;
  }

  await sequelize.query(
    `
      UPDATE parts_requests
      SET routeHidden = :routeHidden,
          routeFromOverride = :routeFromOverride,
          routeToOverride = :routeToOverride,
          updatedAt = :now
      WHERE id = :requestId
    `,
    {
      replacements: {
        requestId,
        routeHidden,
        routeFromOverride,
        routeToOverride,
        now,
      },
    }
  );

  const editorFrom = routeFromOverride || defaultOrigin || '';
  const editorTo = routeToOverride || defaultTo || '';
  const routeEditor: PartRequestRouteEditor = {
    hidden: Boolean(routeHidden),
    fromAddress: editorFrom,
    toAddress: editorTo,
  };

  if (routeHidden) {
    await touchPartsCatalogActivity('route-update');
    return { fulfillmentRoute: null, routeEditor };
  }

  const summary = await getDrivingRoute(editorFrom || null, editorTo || null, {
    liveGeocode: true,
  });
  const hasRoute =
    summary.distanceLabel || summary.mapEmbedUrl || summary.travelMinutes != null;
  await touchPartsCatalogActivity('route-update');
  return {
    fulfillmentRoute: hasRoute ? toFulfillmentRoute(summary) : null,
    routeEditor,
  };
}

export async function createInventoryListing(input: {
  clientId: string;
  createdBy: number;
  itemName: string;
  partNumber?: string | null;
  brand?: string | null;
  notes?: string | null;
  unitPrice: number;
  quantity: number;
  /** Marketplace-listed qty (≤ on-hand). Defaults to full quantity (listed). Use 0 for shop-only. */
  availableQuantity?: number;
}) {
  await ensurePartsCatalogSchema();
  const itemName = input.itemName.trim();
  const normalizedName = normalizePartName(itemName);
  if (!itemName || !normalizedName) {
    throw new Error('Item name is required');
  }
  if (!Number.isFinite(input.unitPrice) || input.unitPrice < 0) {
    throw new Error('Unit price must be zero or more');
  }
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new Error('Quantity must be a whole number greater than zero');
  }
  const availableQuantity =
    input.availableQuantity != null
      ? Math.min(
          input.quantity,
          Math.max(0, Math.floor(Number(input.availableQuantity) || 0))
        )
      : input.quantity;

  const unitPrice = Math.round(Number(input.unitPrice));
  const sequelize = getSequelize();
  const id = randomUUID();
  const now = new Date().toISOString();
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
        itemName,
        normalizedName,
        partNumber: input.partNumber?.trim() || null,
        brand: input.brand?.trim() || null,
        notes: input.notes?.trim() || null,
        unitPrice,
        quantity: input.quantity,
        availableQuantity,
        createdBy: input.createdBy,
        now,
      },
    }
  );

  const listings = await listInventoryForClient(input.clientId);
  await touchPartsCatalogActivity('listing-create');
  return listings.find((listing) => listing.id === id) ?? null;
}

export async function updateInventoryListing(
  id: string,
  input: {
    clientId: string;
    itemName: string;
    partNumber?: string | null;
    brand?: string | null;
    notes?: string | null;
    unitPrice: number;
    quantity: number;
    availableQuantity: number;
  }
) {
  await ensurePartsCatalogSchema();
  const itemName = input.itemName.trim();
  const normalizedName = normalizePartName(itemName);
  if (!itemName || !normalizedName) {
    throw new Error('Item name is required');
  }
  if (!Number.isFinite(input.unitPrice) || input.unitPrice < 0) {
    throw new Error('Unit price must be zero or more');
  }
  if (!Number.isInteger(input.quantity) || input.quantity < 0) {
    throw new Error('Quantity must be zero or more');
  }
  if (!Number.isInteger(input.availableQuantity) || input.availableQuantity < 0) {
    throw new Error('Available quantity must be zero or more');
  }
  if (input.availableQuantity > input.quantity) {
    throw new Error('Available quantity cannot be greater than total quantity');
  }

  const unitPrice = Math.round(Number(input.unitPrice));
  const sequelize = getSequelize();
  const result = await sequelize.query<{ id: string }>(
    `
      SELECT id FROM parts_inventory
      WHERE id = :id AND clientId = :clientId AND isActive = 1
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { id, clientId: input.clientId },
    }
  );
  if (!result[0]) {
    throw new Error('Listing not found');
  }

  await sequelize.query(
    `
      UPDATE parts_inventory
      SET itemName = :itemName,
          normalizedName = :normalizedName,
          partNumber = :partNumber,
          brand = :brand,
          notes = :notes,
          unitPrice = :unitPrice,
          quantity = :quantity,
          availableQuantity = :availableQuantity,
          updatedAt = :now
      WHERE id = :id
    `,
    {
      replacements: {
        id,
        itemName,
        normalizedName,
        partNumber: input.partNumber?.trim() || null,
        brand: input.brand?.trim() || null,
        notes: input.notes?.trim() || null,
        unitPrice,
        quantity: input.quantity,
        availableQuantity: input.availableQuantity,
        now: new Date().toISOString(),
      },
    }
  );

  const listings = await listInventoryForClient(input.clientId);
  await touchPartsCatalogActivity('listing-update');
  return listings.find((listing) => listing.id === id) ?? null;
}

export async function deleteInventoryListing(id: string, clientId: string) {
  await ensurePartsCatalogSchema();
  const sequelize = getSequelize();
  const rows = await sequelize.query<{ id: string }>(
    `
      SELECT id FROM parts_inventory
      WHERE id = :id AND clientId = :clientId AND isActive = 1
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { id, clientId },
    }
  );
  if (!rows[0]) return false;

  await sequelize.query(
    `
      UPDATE parts_inventory
      SET isActive = 0, updatedAt = :now
      WHERE id = :id
    `,
    {
      replacements: { id, now: new Date().toISOString() },
    }
  );
  await touchPartsCatalogActivity('listing-delete');
  return true;
}

async function resolveBuyerDisplayName(role: string, userId: number, buyerClientId?: string | null) {
  if (role === 'client' && buyerClientId) {
    const client = await Client.findByPk(buyerClientId, {
      attributes: ['id', 'name', 'companyName'],
    });
    if (client) {
      return toDisplayClientName({
        companyName: client.companyName,
        name: client.name,
      });
    }
  }

  const user = await User.findByPk(userId, {
    attributes: ['firstName', 'lastName', 'username'],
  });
  if (!user) return 'Platform user';
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return fullName || user.username || 'Platform user';
}

export async function createPartRequest(input: {
  itemName: string;
  quantity: number;
  requesterUserId: number;
  requesterRole: string;
  buyerClientId?: string | null;
  notes?: string | null;
  /** When set, allocate from this listing only (chosen marketplace option). */
  preferredInventoryId?: string | null;
  /** Never allocate from this stock owner (viewer’s own My/Our Stock). */
  excludeSupplierClientId?: string | null;
}) {
  await ensurePartsCatalogSchema();
  const itemName = input.itemName.trim();
  const normalizedName = normalizePartName(itemName);
  if (!itemName || !normalizedName) {
    throw new Error('Item name is required');
  }
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new Error('Quantity must be a whole number greater than zero');
  }

  const buyerDisplayName = await resolveBuyerDisplayName(
    input.requesterRole,
    input.requesterUserId,
    input.buyerClientId ?? null
  );

  const preferredInventoryId = input.preferredInventoryId?.trim() || null;
  // Prefer explicit exclude; fall back to buyer client id for clients.
  const excludeSupplierClientId =
    input.excludeSupplierClientId?.trim() || input.buyerClientId?.trim() || null;
  const sequelize = getSequelize();
  const candidateRows = await sequelize.query<InventoryRow>(
    `
      SELECT p.*,
        c.name AS clientName,
        c.company_name AS clientCompanyName
      FROM parts_inventory p
      INNER JOIN clients c ON c.id = p.clientId
      WHERE p.isActive = 1
        AND p.availableQuantity > 0
        AND p.normalizedName = :normalizedName
        AND (:excludeSupplierClientId IS NULL OR p.clientId <> :excludeSupplierClientId)
        AND (:preferredInventoryId IS NULL OR p.id = :preferredInventoryId)
      ORDER BY
        CASE WHEN p.id = :preferredInventoryId THEN 0 ELSE 1 END,
        p.unitPrice ASC,
        p.updatedAt ASC,
        p.createdAt ASC
    `,
    {
      type: QueryTypes.SELECT,
      replacements: {
        normalizedName,
        excludeSupplierClientId,
        preferredInventoryId,
      },
    }
  );

  if (preferredInventoryId && !candidateRows.length) {
    throw new Error('The selected option is no longer available');
  }

  const totalAvailable = candidateRows.reduce(
    (sum, row) => sum + Number(row.availableQuantity ?? 0),
    0
  );
  if (!candidateRows.length || totalAvailable < input.quantity) {
    throw new Error(
      preferredInventoryId
        ? totalAvailable > 0
          ? `That option only has ${totalAvailable} unit${totalAvailable === 1 ? '' : 's'} available`
          : 'The selected option is currently unavailable'
        : totalAvailable > 0
          ? `Only ${totalAvailable} units are available right now`
          : 'This item is currently unavailable'
    );
  }

  const requestGroupId = randomUUID();
  const requestNumber = makeRequestNumber();
  const now = new Date().toISOString();
  const markupPercent = await getPartsCatalogMarkupPercent();
  const allocations: Array<{
    inventoryId: string;
    supplierClientId: string;
    quantity: number;
    unitPrice: number;
    listedUnitPrice: number;
    supplierName: string;
  }> = [];

  let remaining = input.quantity;
  const transaction = await sequelize.transaction();
  try {
    for (const row of candidateRows) {
      if (remaining <= 0) break;
      const available = Number(row.availableQuantity ?? 0);
      if (available <= 0) continue;

      const allocate = Math.min(remaining, available);
      const requestId = randomUUID();
      const supplierUnitPrice = Number(row.unitPrice ?? 0);
      const listedUnitPrice = applyPartsCatalogMarkup(supplierUnitPrice, markupPercent);

      await sequelize.query(
        `
          INSERT INTO parts_requests (
            id, requestNumber, requestGroupId, inventoryId, supplierClientId, buyerClientId,
            buyerDisplayName, requesterUserId, requesterRole, itemName, normalizedName,
            requestedQuantity, unitPrice, listedUnitPrice, status, notes, createdAt, updatedAt
          ) VALUES (
            :id, :requestNumber, :requestGroupId, :inventoryId, :supplierClientId, :buyerClientId,
            :buyerDisplayName, :requesterUserId, :requesterRole, :itemName, :normalizedName,
            :requestedQuantity, :unitPrice, :listedUnitPrice, 'pending', :notes, :now, :now
          )
        `,
        {
          replacements: {
            id: requestId,
            requestNumber,
            requestGroupId,
            inventoryId: row.id,
            supplierClientId: row.clientId,
            buyerClientId: input.buyerClientId ?? null,
            buyerDisplayName,
            requesterUserId: input.requesterUserId,
            requesterRole: input.requesterRole,
            itemName: row.itemName,
            normalizedName,
            requestedQuantity: allocate,
            unitPrice: supplierUnitPrice,
            listedUnitPrice,
            notes: input.notes?.trim() || null,
            now,
          },
          transaction,
        }
      );

      await sequelize.query(
        `
          UPDATE parts_inventory
          SET availableQuantity = availableQuantity - :allocated,
              updatedAt = :now
          WHERE id = :id
        `,
        {
          replacements: {
            id: row.id,
            allocated: allocate,
            now,
          },
          transaction,
        }
      );

      allocations.push({
        inventoryId: row.id,
        supplierClientId: row.clientId,
        quantity: allocate,
        unitPrice: supplierUnitPrice,
        listedUnitPrice,
        supplierName: toDisplayClientName({
          companyName: row.clientCompanyName,
          name: row.clientName,
        }),
      });
      remaining -= allocate;
    }

    if (remaining > 0) {
      throw new Error('Unable to reserve enough stock for this request');
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  const uniqueSuppliers = new Map<string, { name: string; quantity: number }>();
  for (const allocation of allocations) {
    const existing = uniqueSuppliers.get(allocation.supplierClientId);
    if (existing) {
      existing.quantity += allocation.quantity;
    } else {
      uniqueSuppliers.set(allocation.supplierClientId, {
        name: allocation.supplierName,
        quantity: allocation.quantity,
      });
    }
  }

  await Promise.all(
    Array.from(uniqueSuppliers.entries()).map(([clientId, supplier]) =>
      createClientNotice(
        clientId,
        `New parts request ${requestNumber}`,
        `${buyerDisplayName} requested ${supplier.quantity} x ${itemName}. Please fulfill this request through the platform.`
      ).catch(console.error)
    )
  );

  createStaffNotice(
    `Parts request ${requestNumber}`,
    `${buyerDisplayName} requested ${input.quantity} x ${itemName} from the shared catalog.`
  ).catch(console.error);

  await touchPartsCatalogActivity('request-create');

  const totalPrice = allocations.reduce(
    (sum, allocation) => sum + allocation.quantity * allocation.listedUnitPrice,
    0
  );

  return {
    requestNumber,
    requestGroupId,
    itemName,
    requestedQuantity: input.quantity,
    supplierCount: uniqueSuppliers.size,
    totalPrice,
    allocations: allocations.map((allocation) => ({
      quantity: allocation.quantity,
      unitPrice: allocation.listedUnitPrice,
      supplierUnitPrice: allocation.unitPrice,
    })),
  };
}

export type PartsCancelAction = 'request_cancel' | 'cancel';

const BUYER_CANCEL_REQUEST_STATUSES = new Set([
  'pending',
  'pending_delivery',
]);

const STAFF_CANCEL_STATUSES = new Set([
  'pending',
  'cancel_requested',
  'pending_delivery',
]);

/** True when fulfill already deducted on-hand quantity (not only reserved available). */
function stockQuantityWasDeducted(row: Pick<RequestRow, 'status' | 'pendingDeliveryAt' | 'pickedUpAt'>) {
  return (
    row.status === 'pending_delivery' ||
    row.status === 'out_for_delivery' ||
    Boolean(row.pendingDeliveryAt?.trim()) ||
    Boolean(row.pickedUpAt?.trim())
  );
}

/** Client asks to cancel; admin/technician cancel immediately (and confirm cancel requests). */
export async function cancelPartRequestByNumber(input: {
  requestNumber: string;
  actorUserId: number;
  actorRole: string;
  action: PartsCancelAction;
  actorClientId?: string | null;
}) {
  await ensurePartsCatalogSchema();
  const requestNumber = input.requestNumber.trim();
  if (!requestNumber) throw new Error('Request number is required');

  const isStaff = input.actorRole === 'admin' || input.actorRole === 'technician';
  if (input.action === 'cancel' && !isStaff) {
    throw new Error('Only admin or staff can cancel a request directly');
  }
  if (input.action === 'request_cancel' && isStaff) {
    // Staff cancel immediately instead of queuing.
    return cancelPartRequestByNumber({ ...input, action: 'cancel' });
  }

  const sequelize = getSequelize();
  const rows = await sequelize.query<RequestRow>(
    `
      SELECT r.*,
        supplier.name AS supplierName,
        supplier.company_name AS supplierCompanyName,
        buyer.name AS buyerName,
        buyer.company_name AS buyerCompanyName
      FROM parts_requests r
      LEFT JOIN clients supplier ON supplier.id = r.supplierClientId
      LEFT JOIN clients buyer ON buyer.id = r.buyerClientId
      WHERE r.requestNumber = :requestNumber
      ORDER BY r.createdAt ASC
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { requestNumber },
    }
  );

  if (!rows.length) throw new Error('Request not found');

  const ownsRequest = rows.some(
    (row) =>
      Number(row.requesterUserId) === input.actorUserId ||
      (input.actorClientId && row.buyerClientId === input.actorClientId)
  );

  if (input.action === 'request_cancel' && !ownsRequest) {
    throw new Error('You can only request cancellation for your own requests');
  }

  const cancellable = rows.filter((row) =>
    input.action === 'request_cancel'
      ? BUYER_CANCEL_REQUEST_STATUSES.has(row.status)
      : STAFF_CANCEL_STATUSES.has(row.status)
  );

  if (!cancellable.length) {
    throw new Error(
      input.action === 'request_cancel'
        ? 'This request cannot be cancel-requested in its current status'
        : 'This request cannot be cancelled in its current status'
    );
  }

  const now = new Date().toISOString();
  const itemName = cancellable[0].itemName;
  const buyerDisplayName = cancellable[0].buyerDisplayName;
  const buyerClientId = cancellable[0].buyerClientId;

  if (input.action === 'request_cancel') {
    const transaction = await sequelize.transaction();
    try {
      for (const row of cancellable) {
        await sequelize.query(
          `
            UPDATE parts_requests
            SET status = 'cancel_requested',
                cancelRequestedAt = :now,
                updatedAt = :now
            WHERE id = :id AND status IN ('pending', 'pending_delivery')
          `,
          {
            replacements: { id: row.id, now },
            transaction,
          }
        );
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    createStaffNotice(
      `Cancel requested ${requestNumber}`,
      `${buyerDisplayName} requested to cancel parts request ${requestNumber} (${itemName}). Confirm cancellation in Parts → Outgoing.`
    ).catch(console.error);

    await touchPartsCatalogActivity('cancel-requested');

    return {
      requestNumber,
      status: 'cancel_requested' as const,
      action: 'request_cancel' as const,
      itemName,
    };
  }

  const transaction = await sequelize.transaction();
  try {
    for (const row of cancellable) {
      const qty = Number(row.requestedQuantity ?? 0);
      const restoreOnHand = stockQuantityWasDeducted(row);

      await sequelize.query(
        `
          UPDATE parts_requests
          SET status = 'cancelled',
              cancelledAt = :now,
              updatedAt = :now
          WHERE id = :id AND status IN ('pending', 'cancel_requested', 'pending_delivery')
        `,
        {
          replacements: { id: row.id, now },
          transaction,
        }
      );

      if (restoreOnHand) {
        // Fulfill already deducted on-hand quantity; put both quantity and reserved available back.
        await sequelize.query(
          `
            UPDATE parts_inventory
            SET quantity = quantity + :qty,
                availableQuantity = availableQuantity + :qty,
                updatedAt = :now
            WHERE id = :inventoryId
          `,
          {
            replacements: {
              inventoryId: row.inventoryId,
              qty,
              now,
            },
            transaction,
          }
        );
      } else {
        // Pre-fulfill: only reserved available was held.
        await sequelize.query(
          `
            UPDATE parts_inventory
            SET availableQuantity = availableQuantity + :qty,
                updatedAt = :now
            WHERE id = :inventoryId
          `,
          {
            replacements: {
              inventoryId: row.inventoryId,
              qty,
              now,
            },
            transaction,
          }
        );
      }
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  if (buyerClientId) {
    createClientNotice(
      buyerClientId,
      `Parts request ${requestNumber} cancelled`,
      `Your request for ${itemName} (${requestNumber}) was cancelled and reserved stock was released.`
    ).catch(console.error);
  } else {
    createStaffNotice(
      `Parts request ${requestNumber} cancelled`,
      `Request ${requestNumber} for ${itemName} was cancelled and reserved stock was released.`
    ).catch(console.error);
  }

  await Promise.all(
    Array.from(new Set(cancellable.map((row) => row.supplierClientId))).map((clientId) =>
      createClientNotice(
        clientId,
        `Parts request ${requestNumber} cancelled`,
        `A platform request for ${itemName} (${requestNumber}) was cancelled. Reserved stock was released back to your listing.`
      ).catch(console.error)
    )
  );

  await touchPartsCatalogActivity('cancelled');

  return {
    requestNumber,
    status: 'cancelled' as const,
    action: 'cancel' as const,
    itemName,
  };
}

async function resolveDeliveryEtaForRequest(row: RequestRow): Promise<{
  deliveryEtaMinutes: number | null;
  deliveryEtaLabel: string | null;
  deliveryFromAddress: string | null;
  deliveryToAddress: string | null;
  deliveryMapEmbedUrl: string | null;
  deliveryDirectionsUrl: string | null;
  distanceMeters: number | null;
}> {
  const empty = {
    deliveryEtaMinutes: null as number | null,
    deliveryEtaLabel: null as string | null,
    deliveryFromAddress: null as string | null,
    deliveryToAddress: null as string | null,
    deliveryMapEmbedUrl: null as string | null,
    deliveryDirectionsUrl: null as string | null,
    distanceMeters: null as number | null,
  };
  try {
    if (row.routeHidden) return empty;

    const { from, displayFrom } = await resolvePickupOriginForRequest(row);
    const { to, displayTo } = resolveDeliveryDestinationForRequest(row);

    if (!from || !to) return empty;

    const route = await getDrivingRoute(from, to, { liveGeocode: true });
    const minutes =
      route.travelMinutes == null ? null : Math.max(1, Math.round(Number(route.travelMinutes)));
    const distancePart = route.distanceLabel ? ` (${route.distanceLabel})` : '';
    const distanceMeters =
      route.distanceMeters == null || !Number.isFinite(Number(route.distanceMeters))
        ? null
        : Number(route.distanceMeters);

    return {
      deliveryEtaMinutes: minutes,
      deliveryEtaLabel:
        minutes != null ? `~${minutes} min drive${distancePart}` : route.distanceLabel || null,
      deliveryFromAddress: displayFrom || route.fromAddress || from,
      deliveryToAddress: displayTo || route.toAddress || to,
      deliveryMapEmbedUrl: route.mapEmbedUrl || null,
      deliveryDirectionsUrl: route.directionsUrl || null,
      distanceMeters,
    };
  } catch {
    return empty;
  }
}

type DeliveryPackageRow = {
  id: string;
  buyerClientId: string | null;
  buyerKey: string;
  maxDistanceMeters: number | null;
  deliveryFee: number;
  quoteId?: string | null;
  invoiceId?: string | null;
  billingStatus?: string | null;
  createdAt: string;
  updatedAt: string;
};

function buyerKeyForRequest(row: Pick<RequestRow, 'buyerClientId' | 'requesterUserId'>) {
  const clientId = row.buyerClientId?.trim();
  if (clientId) return clientId;
  return `user:${row.requesterUserId}`;
}

function normalizeWholeDollarFee(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error('Delivery fee must be a whole-dollar amount of 0 or more');
  }
  return Math.round(n);
}

export type FulfillDeliveryPreview = {
  thisDistanceMeters: number | null;
  deliveryEtaMinutes: number | null;
  deliveryEtaLabel: string | null;
  package: null | {
    id: string;
    maxDistanceMeters: number | null;
    deliveryFee: number;
    ageMinutes: number;
  };
  mode: 'new' | 'share';
  suggestedDeliveryFee: number | null;
};

async function resolveDeliveryPackageDecision(
  sequelize: ReturnType<typeof getSequelize>,
  row: RequestRow,
  thisDistanceMeters: number | null
): Promise<{
  mode: 'new' | 'share';
  package: DeliveryPackageRow | null;
  suggestedDeliveryFee: number | null;
}> {
  const buyerKey = buyerKeyForRequest(row);

  // Same checkout / requestNumber already has a package → always share (one fee).
  const sameCheckout = await sequelize.query<{ deliveryPackageId: string }>(
    `
      SELECT deliveryPackageId
      FROM parts_requests
      WHERE requestNumber = :requestNumber
        AND deliveryPackageId IS NOT NULL
        AND TRIM(deliveryPackageId) != ''
        AND id != :requestId
      ORDER BY pendingDeliveryAt ASC, createdAt ASC
      LIMIT 1
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { requestNumber: row.requestNumber, requestId: row.id },
    }
  );
  if (sameCheckout[0]?.deliveryPackageId) {
    const pkgs = await sequelize.query<DeliveryPackageRow>(
      `SELECT * FROM parts_delivery_packages WHERE id = :id LIMIT 1`,
      {
        type: QueryTypes.SELECT,
        replacements: { id: sameCheckout[0].deliveryPackageId },
      }
    );
    const pkg = pkgs[0] ?? null;
    return { mode: 'share', package: pkg, suggestedDeliveryFee: 0 };
  }

  const windowStart = new Date(Date.now() - DELIVERY_PACKAGE_WINDOW_MS).toISOString();
  const recentPackages = await sequelize.query<DeliveryPackageRow>(
    `
      SELECT *
      FROM parts_delivery_packages
      WHERE buyerKey = :buyerKey
        AND createdAt >= :windowStart
      ORDER BY createdAt DESC
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { buyerKey, windowStart },
    }
  );

  // Same buyer + same destination window = one delivery package (one fee),
  // regardless of which seller the stock was picked up from.
  // Skip packages whose quote is already accepted/converted/paid (billing locked).
  const { isPackageBillingLocked } = await import('@/lib/parts-billing');
  for (const pkg of recentPackages) {
    if (await isPackageBillingLocked(pkg.id)) continue;

    if (
      thisDistanceMeters != null &&
      Number.isFinite(thisDistanceMeters) &&
      (pkg.maxDistanceMeters == null ||
        !Number.isFinite(Number(pkg.maxDistanceMeters)) ||
        thisDistanceMeters > Number(pkg.maxDistanceMeters))
    ) {
      await sequelize.query(
        `
          UPDATE parts_delivery_packages
          SET maxDistanceMeters = :meters, updatedAt = :now
          WHERE id = :id
        `,
        {
          replacements: {
            meters: thisDistanceMeters,
            now: new Date().toISOString(),
            id: pkg.id,
          },
        }
      );
      pkg.maxDistanceMeters = thisDistanceMeters;
    }
    return { mode: 'share', package: pkg, suggestedDeliveryFee: 0 };
  }

  return { mode: 'new', package: null, suggestedDeliveryFee: null };
}

/** Preview package share vs new delivery fee before staff confirms fulfill. */
export async function previewFulfillPartRequestById(input: {
  requestId: string;
  supplierClientId: string;
}): Promise<FulfillDeliveryPreview> {
  await ensurePartsCatalogSchema();
  await ensureClientLocationColumns();
  const requestId = input.requestId.trim();
  if (!requestId) throw new Error('Request id is required');
  if (!input.supplierClientId) throw new Error('Supplier account is required');

  const sequelize = getSequelize();
  const rows = await sequelize.query<RequestRow>(
    `
      SELECT r.*,
        supplier.name AS supplierName,
        supplier.company_name AS supplierCompanyName,
        supplier.address AS supplierAddress,
        supplier.latitude AS supplierLatitude,
        supplier.longitude AS supplierLongitude,
        supplier.contract_details AS supplierContractDetails,
        buyer.name AS buyerName,
        buyer.company_name AS buyerCompanyName,
        buyer.address AS buyerAddress,
        buyer.latitude AS buyerLatitude,
        buyer.longitude AS buyerLongitude,
        buyer.contract_details AS buyerContractDetails
      FROM parts_requests r
      LEFT JOIN clients supplier ON supplier.id = r.supplierClientId
      LEFT JOIN clients buyer ON buyer.id = r.buyerClientId
      WHERE r.id = :requestId
      LIMIT 1
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { requestId },
    }
  );

  const row = rows[0];
  if (!row) throw new Error('Request not found');
  if (row.supplierClientId !== input.supplierClientId) {
    throw new Error('You can only fulfill requests assigned to your stock');
  }
  if (row.status !== 'pending') {
    throw new Error(
      row.status === 'cancel_requested'
        ? 'This request has a cancel request pending — wait for staff or ask them to resolve it'
        : `This request cannot be fulfilled (status: ${row.status})`
    );
  }

  const eta = await resolveDeliveryEtaForRequest(row);
  const decision = await resolveDeliveryPackageDecision(sequelize, row, eta.distanceMeters);
  const ageMinutes =
    decision.package != null
      ? Math.max(
          0,
          Math.round((Date.now() - new Date(decision.package.createdAt).getTime()) / 60000)
        )
      : 0;

  return {
    thisDistanceMeters: eta.distanceMeters,
    deliveryEtaMinutes: eta.deliveryEtaMinutes,
    deliveryEtaLabel: eta.deliveryEtaLabel,
    package: decision.package
      ? {
          id: decision.package.id,
          maxDistanceMeters:
            decision.package.maxDistanceMeters == null
              ? null
              : Number(decision.package.maxDistanceMeters),
          deliveryFee: Number(decision.package.deliveryFee) || 0,
          ageMinutes,
        }
      : null,
    mode: decision.mode,
    suggestedDeliveryFee: decision.suggestedDeliveryFee,
  };
}

/**
 * Supplier marks an incoming allocation ready for delivery (pending delivery).
 * Stock qty is deducted here; available was already reserved on request.
 * Final "fulfilled" happens only after buyer receives.
 */
export async function fulfillPartRequestById(input: {
  requestId: string;
  supplierClientId: string;
  /** Whole dollars. Omit (or leave unset) when a client supplier fulfills — CD staff set fee later. */
  deliveryFee?: number | null;
}) {
  await ensurePartsCatalogSchema();
  await ensureClientLocationColumns();
  const requestId = input.requestId.trim();
  if (!requestId) throw new Error('Request id is required');
  if (!input.supplierClientId) throw new Error('Supplier account is required');
  const staffDeliveryFee =
    input.deliveryFee === undefined || input.deliveryFee === null
      ? 0
      : normalizeWholeDollarFee(input.deliveryFee);

  const sequelize = getSequelize();
  const rows = await sequelize.query<RequestRow>(
    `
      SELECT r.*,
        supplier.name AS supplierName,
        supplier.company_name AS supplierCompanyName,
        supplier.address AS supplierAddress,
        supplier.latitude AS supplierLatitude,
        supplier.longitude AS supplierLongitude,
        supplier.contract_details AS supplierContractDetails,
        buyer.name AS buyerName,
        buyer.company_name AS buyerCompanyName,
        buyer.address AS buyerAddress,
        buyer.latitude AS buyerLatitude,
        buyer.longitude AS buyerLongitude,
        buyer.contract_details AS buyerContractDetails
      FROM parts_requests r
      LEFT JOIN clients supplier ON supplier.id = r.supplierClientId
      LEFT JOIN clients buyer ON buyer.id = r.buyerClientId
      WHERE r.id = :requestId
      LIMIT 1
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { requestId },
    }
  );

  const row = rows[0];
  if (!row) throw new Error('Request not found');
  if (row.supplierClientId !== input.supplierClientId) {
    throw new Error('You can only fulfill requests assigned to your stock');
  }
  if (row.status !== 'pending') {
    throw new Error(
      row.status === 'cancel_requested'
        ? 'This request has a cancel request pending — wait for staff or ask them to resolve it'
        : `This request cannot be fulfilled (status: ${row.status})`
    );
  }

  const eta = await resolveDeliveryEtaForRequest(row);
  const decision = await resolveDeliveryPackageDecision(sequelize, row, eta.distanceMeters);
  const qty = Number(row.requestedQuantity ?? 0);
  const now = new Date().toISOString();
  const buyerKey = buyerKeyForRequest(row);

  let deliveryPackageId: string;
  let lineDeliveryFee: number;
  let syncPackageFeeOnShare = false;

  if (decision.mode === 'share' && decision.package) {
    deliveryPackageId = decision.package.id;
    // Default share charge is $0. A positive fee is treated as a staff override.
    lineDeliveryFee = staffDeliveryFee;
    syncPackageFeeOnShare = staffDeliveryFee > 0;
  } else {
    deliveryPackageId = randomUUID();
    lineDeliveryFee = staffDeliveryFee;
  }

  const transaction = await sequelize.transaction();
  try {
    if (decision.mode === 'new') {
      await sequelize.query(
        `
          INSERT INTO parts_delivery_packages (
            id, buyerClientId, buyerKey, maxDistanceMeters, deliveryFee,
            quoteId, invoiceId, billingStatus, createdAt, updatedAt
          ) VALUES (
            :id, :buyerClientId, :buyerKey, :maxDistanceMeters, :deliveryFee,
            NULL, NULL, 'none', :now, :now
          )
        `,
        {
          replacements: {
            id: deliveryPackageId,
            buyerClientId: row.buyerClientId?.trim() || null,
            buyerKey,
            maxDistanceMeters: eta.distanceMeters,
            deliveryFee: staffDeliveryFee,
            now,
          },
          transaction,
        }
      );
    } else if (syncPackageFeeOnShare) {
      await sequelize.query(
        `
          UPDATE parts_delivery_packages
          SET deliveryFee = :fee, updatedAt = :now
          WHERE id = :packageId
        `,
        {
          replacements: { fee: staffDeliveryFee, now, packageId: deliveryPackageId },
          transaction,
        }
      );
      await sequelize.query(
        `
          UPDATE parts_requests
          SET deliveryFee = 0, updatedAt = :now
          WHERE deliveryPackageId = :packageId
        `,
        {
          replacements: { now, packageId: deliveryPackageId },
          transaction,
        }
      );
    }

    await sequelize.query(
      `
        UPDATE parts_requests
        SET status = 'pending_delivery',
            deliveryEtaMinutes = :deliveryEtaMinutes,
            deliveryEtaLabel = :deliveryEtaLabel,
            pendingDeliveryAt = :now,
            deliveryFromAddress = :deliveryFromAddress,
            deliveryToAddress = :deliveryToAddress,
            deliveryMapEmbedUrl = :deliveryMapEmbedUrl,
            deliveryDirectionsUrl = :deliveryDirectionsUrl,
            deliveryPackageId = :deliveryPackageId,
            deliveryDistanceMeters = :deliveryDistanceMeters,
            deliveryFee = :deliveryFee,
            updatedAt = :now
        WHERE id = :id AND status = 'pending'
      `,
      {
        replacements: {
          id: row.id,
          now,
          deliveryEtaMinutes: eta.deliveryEtaMinutes,
          deliveryEtaLabel: eta.deliveryEtaLabel,
          deliveryFromAddress: eta.deliveryFromAddress,
          deliveryToAddress: eta.deliveryToAddress,
          deliveryMapEmbedUrl: eta.deliveryMapEmbedUrl,
          deliveryDirectionsUrl: eta.deliveryDirectionsUrl,
          deliveryPackageId,
          deliveryDistanceMeters: eta.distanceMeters,
          deliveryFee: lineDeliveryFee,
        },
        transaction,
      }
    );

    // Reserved units leave inventory permanently (available was already reduced on request).
    await sequelize.query(
      `
        UPDATE parts_inventory
        SET quantity = CASE
              WHEN quantity >= :qty THEN quantity - :qty
              ELSE 0
            END,
            updatedAt = :now
        WHERE id = :inventoryId
      `,
      {
        replacements: {
          inventoryId: row.inventoryId,
          qty,
          now,
        },
        transaction,
      }
    );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  const etaText = eta.deliveryEtaLabel ? ` Estimated travel: ${eta.deliveryEtaLabel}.` : '';
  const feeText =
    decision.mode === 'share' && lineDeliveryFee === 0
      ? ' Delivery shared with an open package (no extra fee).'
      : lineDeliveryFee > 0
        ? ` Delivery fee: $${lineDeliveryFee}.`
        : '';

  if (row.buyerClientId) {
    createClientNotice(
      row.buyerClientId,
      `Parts request ${row.requestNumber} ready for delivery`,
      `${qty} x ${row.itemName} (${row.requestNumber}) was marked ready for delivery by a platform partner.${etaText}${feeText} Accept the quote and pay to complete billing.`
    ).catch(console.error);
  }

  createStaffNotice(
    `Parts request ${row.requestNumber} pending delivery`,
    `${qty} x ${row.itemName} (${row.requestNumber}) is pending delivery. Mark Pickup when the order leaves.`
  ).catch(console.error);

  let billing = null as Awaited<
    ReturnType<typeof import('@/lib/parts-billing').syncPackageQuote>
  >;
  try {
    const { syncPackageQuote } = await import('@/lib/parts-billing');
    billing = await syncPackageQuote({ packageId: deliveryPackageId, createdBy: 1 });
    if (!billing?.paymentUnpaid && row.buyerClientId) {
      console.error(
        'Parts package quote sync returned no unpaid billing',
        deliveryPackageId,
        billing
      );
    }
  } catch (error) {
    console.error('Failed to sync parts package quote', deliveryPackageId, error);
  }

  await touchPartsCatalogActivity('pending-delivery');

  return {
    id: row.id,
    requestNumber: row.requestNumber,
    status: 'pending_delivery' as const,
    itemName: row.itemName,
    requestedQuantity: qty,
    deliveryEtaMinutes: eta.deliveryEtaMinutes,
    deliveryEtaLabel: eta.deliveryEtaLabel,
    deliveryPackageId,
    deliveryDistanceMeters: eta.distanceMeters,
    deliveryFee: lineDeliveryFee,
    deliveryMode: decision.mode,
    billing,
  };
}

/** Staff updates delivery fee on a request (and linked package when present). */
export async function updatePartRequestDeliveryFee(input: {
  requestId: string;
  deliveryFee: number;
  /** When set, must match the request supplier (stock owner). Admins/techs may omit. */
  supplierClientId?: string | null;
  allowStaffOverride?: boolean;
}) {
  await ensurePartsCatalogSchema();
  const requestId = input.requestId.trim();
  if (!requestId) throw new Error('Request id is required');
  const fee = normalizeWholeDollarFee(input.deliveryFee);

  const sequelize = getSequelize();
  const rows = await sequelize.query<RequestRow>(
    `
      SELECT r.*
      FROM parts_requests r
      WHERE r.id = :requestId
      LIMIT 1
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { requestId },
    }
  );

  const row = rows[0];
  if (!row) throw new Error('Request not found');

  const isSupplier =
    Boolean(input.supplierClientId) && row.supplierClientId === input.supplierClientId;
  if (!input.allowStaffOverride && !isSupplier) {
    throw new Error('You can only edit delivery fees for requests assigned to your stock');
  }

  if (
    row.status !== 'pending_delivery' &&
    row.status !== 'out_for_delivery' &&
    row.status !== 'fulfilled'
  ) {
    throw new Error(
      `Delivery fee can only be edited after fulfill (status: ${row.status.replace(/_/g, ' ')})`
    );
  }

  const now = new Date().toISOString();
  const packageId = row.deliveryPackageId?.trim() || null;
  const transaction = await sequelize.transaction();
  try {
    if (packageId) {
      await sequelize.query(
        `
          UPDATE parts_delivery_packages
          SET deliveryFee = :fee, updatedAt = :now
          WHERE id = :packageId
        `,
        { replacements: { fee, now, packageId }, transaction }
      );
      // Keep a single charged line per package so client totals do not double-count.
      await sequelize.query(
        `
          UPDATE parts_requests
          SET deliveryFee = 0, updatedAt = :now
          WHERE deliveryPackageId = :packageId
        `,
        { replacements: { now, packageId }, transaction }
      );
    }

    await sequelize.query(
      `
        UPDATE parts_requests
        SET deliveryFee = :fee, updatedAt = :now
        WHERE id = :id
      `,
      { replacements: { fee, now, id: row.id }, transaction }
    );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  await touchPartsCatalogActivity('delivery-fee');

  if (packageId) {
    try {
      const { syncPackageQuote } = await import('@/lib/parts-billing');
      await syncPackageQuote({ packageId, createdBy: 1 });
    } catch (error) {
      console.error('Failed to sync parts package quote after fee edit', error);
    }
  }

  return {
    id: row.id,
    requestNumber: row.requestNumber,
    deliveryPackageId: packageId,
    deliveryFee: fee,
  };
}

/** CD staff marks pending delivery as picked up / out for delivery. */
export async function pickupPartRequestById(input: {
  requestId: string;
  /** When set without staffOverride, must match the request supplier. */
  supplierClientId?: string | null;
  allowStaffOverride?: boolean;
}) {
  await ensurePartsCatalogSchema();
  const requestId = input.requestId.trim();
  if (!requestId) throw new Error('Request id is required');

  const sequelize = getSequelize();
  const rows = await sequelize.query<RequestRow>(
    `
      SELECT r.*,
        supplier.name AS supplierName,
        supplier.company_name AS supplierCompanyName,
        buyer.name AS buyerName,
        buyer.company_name AS buyerCompanyName
      FROM parts_requests r
      LEFT JOIN clients supplier ON supplier.id = r.supplierClientId
      LEFT JOIN clients buyer ON buyer.id = r.buyerClientId
      WHERE r.id = :requestId
      LIMIT 1
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { requestId },
    }
  );

  const row = rows[0];
  if (!row) throw new Error('Request not found');
  const isSupplier =
    Boolean(input.supplierClientId) && row.supplierClientId === input.supplierClientId;
  if (!input.allowStaffOverride && !isSupplier) {
    throw new Error('You can only pick up requests assigned to your stock');
  }
  if (row.status !== 'pending_delivery') {
    throw new Error(
      `This request cannot be marked picked up (status: ${row.status.replace(/_/g, ' ')})`
    );
  }

  const qty = Number(row.requestedQuantity ?? 0);
  const now = new Date().toISOString();
  await sequelize.query(
    `
      UPDATE parts_requests
      SET status = 'out_for_delivery',
          pickedUpAt = :now,
          updatedAt = :now
      WHERE id = :id AND status = 'pending_delivery'
    `,
    { replacements: { id: row.id, now } }
  );

  const etaText = row.deliveryEtaLabel?.trim()
    ? ` Estimated travel: ${row.deliveryEtaLabel.trim()}.`
    : '';

  if (row.buyerClientId) {
    createClientNotice(
      row.buyerClientId,
      `Parts request ${row.requestNumber} out for delivery`,
      `${qty} x ${row.itemName} (${row.requestNumber}) was picked up and is out for delivery.${etaText} Confirm Receive when it arrives.`
    ).catch(console.error);
  }

  createStaffNotice(
    `Parts request ${row.requestNumber} out for delivery`,
    `${qty} x ${row.itemName} (${row.requestNumber}) was marked picked up. Waiting for the buyer to receive.`
  ).catch(console.error);

  await touchPartsCatalogActivity('out-for-delivery');

  return {
    id: row.id,
    requestNumber: row.requestNumber,
    status: 'out_for_delivery' as const,
    itemName: row.itemName,
    requestedQuantity: qty,
    deliveryEtaMinutes:
      row.deliveryEtaMinutes === null || row.deliveryEtaMinutes === undefined
        ? null
        : Number(row.deliveryEtaMinutes),
    deliveryEtaLabel: row.deliveryEtaLabel?.trim() || null,
  };
}

/** Buyer confirms receipt — only then is the request fully fulfilled (history). */
export async function receivePartRequestByNumber(input: {
  requestNumber: string;
  actorUserId: number;
  actorRole: string;
  actorClientId?: string | null;
}) {
  await ensurePartsCatalogSchema();
  const requestNumber = input.requestNumber.trim();
  if (!requestNumber) throw new Error('Request number is required');

  const sequelize = getSequelize();
  const rows = await sequelize.query<RequestRow>(
    `
      SELECT r.*,
        supplier.name AS supplierName,
        supplier.company_name AS supplierCompanyName,
        buyer.name AS buyerName,
        buyer.company_name AS buyerCompanyName
      FROM parts_requests r
      LEFT JOIN clients supplier ON supplier.id = r.supplierClientId
      LEFT JOIN clients buyer ON buyer.id = r.buyerClientId
      WHERE r.requestNumber = :requestNumber
      ORDER BY r.createdAt ASC
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { requestNumber },
    }
  );

  if (!rows.length) throw new Error('Request not found');

  const isStaff = input.actorRole === 'admin' || input.actorRole === 'technician';
  const ownsRequest = rows.some(
    (row) =>
      Number(row.requesterUserId) === input.actorUserId ||
      (input.actorClientId && row.buyerClientId === input.actorClientId)
  );
  if (!ownsRequest && !isStaff) {
    throw new Error('You can only confirm receipt for your own requests');
  }

  const receivable = rows.filter((row) => row.status === 'out_for_delivery');
  if (!receivable.length) {
    throw new Error('Nothing is out for delivery to receive on this request');
  }

  const now = new Date().toISOString();
  const transaction = await sequelize.transaction();
  try {
    for (const row of receivable) {
      await sequelize.query(
        `
          UPDATE parts_requests
          SET status = 'fulfilled',
              completedAt = :now,
              updatedAt = :now
          WHERE id = :id AND status = 'out_for_delivery'
        `,
        {
          replacements: { id: row.id, now },
          transaction,
        }
      );
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  const itemName = receivable[0].itemName;
  const totalQty = receivable.reduce((sum, row) => sum + Number(row.requestedQuantity ?? 0), 0);
  const staffOverride = isStaff && !ownsRequest;

  if (receivable[0].buyerClientId) {
    createClientNotice(
      receivable[0].buyerClientId,
      staffOverride
        ? `Parts request ${requestNumber} delivered`
        : `Parts request ${requestNumber} received`,
      staffOverride
        ? `${totalQty} x ${itemName} (${requestNumber}) was marked delivered by Computer Dynamics staff. This request is now complete.`
        : `You confirmed receipt of ${totalQty} x ${itemName} (${requestNumber}). This request is now complete.`
    ).catch(console.error);
  }

  createStaffNotice(
    staffOverride
      ? `Parts request ${requestNumber} marked delivered`
      : `Parts request ${requestNumber} received`,
    staffOverride
      ? `Staff marked ${totalQty} x ${itemName} (${requestNumber}) as delivered (buyer did not confirm Receive).`
      : `Buyer confirmed receipt of ${totalQty} x ${itemName} (${requestNumber}). Moved to fulfilled.`
  ).catch(console.error);

  await Promise.all(
    Array.from(new Set(receivable.map((row) => row.supplierClientId))).map((clientId) =>
      createClientNotice(
        clientId,
        `Parts request ${requestNumber} received`,
        `The buyer confirmed receipt of ${itemName} (${requestNumber}).`
      ).catch(console.error)
    )
  );

  await touchPartsCatalogActivity('received');

  return {
    requestNumber,
    status: 'fulfilled' as const,
    itemName,
    requestedQuantity: totalQty,
  };
}
