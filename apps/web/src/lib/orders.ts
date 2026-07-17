import { randomUUID } from 'crypto';
import { QueryTypes } from 'sequelize';
import { getSequelize } from '@cd-v2/database';
import { DEFAULT_OFFICE_LOCATION, ORDER_STATUSES, SHIPPING_STAGES } from '@/lib/order-constants';
import { ensureClientMirroredForOrders } from '@/lib/clients';
import { ensureOrderSerialColumn } from '@/lib/order-schema';

export type LocationUpdateSource = 'manual' | 'email' | 'system';
export type OrderRow = {
  id: string;
  orderNumber: string;
  clientId: string;
  title: string;
  description: string | null;
  itemName: string;
  itemUrl: string | null;
  vendor: string | null;
  vendorOrderNumber: string | null;
  trackingNumber: string | null;
  orderDate: string;
  estimatedArrival: string | null;
  actualArrival: string | null;
  costPrice: number;
  clientPrice: number;
  quantity: number;
  status: string;
  currentLocation?: string | null;
  current_location?: string | null;
  locationHistory?: string | null;
  location_history?: string | null;
  lastLocationUpdate?: string | null;
  last_location_update?: string | null;
  shippingStage?: string | null;
  shipping_stage?: string | null;
  isLoggedInPreAlerts?: number | boolean;
  is_logged_in_pre_alerts?: number | boolean;
  preAlertNotes?: string | null;
  pre_alert_notes?: string | null;
  serialNumber?: string | null;
  assignedTechnicianId?: number | null;
  createdBy: number;
  tags?: string | null;
  notes: string | null;
  isActive: number | boolean;
  createdAt: string;
  updatedAt: string;
  clientName?: string;
  clientEmail?: string;
};

export type LocationHistoryEntry = {
  location?: string;
  stage?: string;
  timestamp?: string;
  source?: string;
};

function parseJsonArray<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function pickStage(row: OrderRow) {
  return row.shippingStage || row.shipping_stage || 'ordered';
}

function pickLocation(row: OrderRow) {
  return row.currentLocation ?? row.current_location ?? null;
}

function pickLocationHistory(row: OrderRow): LocationHistoryEntry[] {
  const raw = row.locationHistory ?? row.location_history;
  return parseJsonArray<LocationHistoryEntry>(raw);
}

export type SerializedOrder = ReturnType<typeof serializeOrder>;

export function serializeOrder(row: OrderRow, options?: { includeCost?: boolean }) {
  const order = {
    id: row.id,
    orderNumber: row.orderNumber,
    clientId: row.clientId,
    title: row.title,
    description: row.description,
    itemName: row.itemName,
    itemUrl: row.itemUrl,
    vendor: row.vendor,
    vendorOrderNumber: row.vendorOrderNumber,
    trackingNumber: row.trackingNumber,
    serialNumber: row.serialNumber ?? null,
    orderDate: row.orderDate,
    estimatedArrival: row.estimatedArrival,
    actualArrival: row.actualArrival,
    clientPrice: Number(row.clientPrice ?? 0),
    quantity: Number(row.quantity ?? 1),
    status: row.status,
    currentLocation: pickLocation(row),
    shippingStage: pickStage(row),
    locationHistory: pickLocationHistory(row),
    lastLocationUpdate: row.lastLocationUpdate ?? row.last_location_update ?? null,
    isLoggedInPreAlerts: Boolean(row.isLoggedInPreAlerts ?? row.is_logged_in_pre_alerts),
    preAlertNotes: row.preAlertNotes ?? row.pre_alert_notes ?? null,
    assignedTechnicianId: row.assignedTechnicianId ?? null,
    createdBy: row.createdBy,
    tags: parseJsonArray<string>(row.tags),
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    client: row.clientName
      ? { id: row.clientId, name: row.clientName, email: row.clientEmail }
      : undefined,
  };

  if (options?.includeCost) {
    return { ...order, costPrice: Number(row.costPrice ?? 0) };
  }

  return order;
}

const ORDER_SELECT = `
  SELECT o.*,
    COALESCE(c.company_name, c.name) AS clientName,
    c.email AS clientEmail
  FROM orders o
  LEFT JOIN clients c ON c.id = o.clientId
`;

export async function getOrderById(id: string, options?: { includeCost?: boolean }) {
  await ensureOrderSerialColumn();
  const sequelize = getSequelize();
  const rows = await sequelize.query<OrderRow>(`${ORDER_SELECT} WHERE o.id = :id`, {
    type: QueryTypes.SELECT,
    replacements: { id },
  });
  const row = rows[0];
  if (!row || !row.isActive) return null;
  return serializeOrder(row, options);
}

export async function listOrders(options: {
  page?: number;
  limit?: number;
  status?: string;
  shippingStage?: string;
  clientId?: string;
  search?: string;
  includeCost?: boolean;
  activeOnly?: boolean;
}) {
  await ensureOrderSerialColumn();
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const offset = (page - 1) * limit;
  const sequelize = getSequelize();
  const replacements: Record<string, unknown> = { limit, offset };
  const conditions: string[] = [];

  if (options.activeOnly !== false) {
    conditions.push('o.isActive = 1');
  }
  if (options.status) {
    conditions.push('o.status = :status');
    replacements.status = options.status;
  }
  if (options.clientId) {
    conditions.push('o.clientId = :clientId');
    replacements.clientId = options.clientId;
  }
  if (options.shippingStage) {
    conditions.push('(o.shippingStage = :shippingStage OR o.shipping_stage = :shippingStage)');
    replacements.shippingStage = options.shippingStage;
  }
  if (options.search?.trim()) {
    conditions.push(`(
      o.orderNumber LIKE :search OR o.title LIKE :search OR o.itemName LIKE :search
      OR o.vendor LIKE :search OR o.trackingNumber LIKE :search OR o.vendorOrderNumber LIKE :search
    )`);
    replacements.search = `%${options.search.trim()}%`;
  }

  const where = conditions.length ? conditions.join(' AND ') : '1=1';

  const countRows = await sequelize.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM orders o WHERE ${where.replace(/c\./g, 'o.')}`,
    { type: QueryTypes.SELECT, replacements }
  );
  const total = Number(countRows[0]?.count ?? 0);

  const rows = await sequelize.query<OrderRow>(
    `${ORDER_SELECT}
     WHERE ${where}
     ORDER BY o.orderDate DESC, o.createdAt DESC
     LIMIT :limit OFFSET :offset`,
    { type: QueryTypes.SELECT, replacements }
  );

  return {
    orders: rows.map((row) => serializeOrder(row, { includeCost: options.includeCost })),
    pagination: { total, page, limit, pages: Math.ceil(total / limit) || 0 },
  };
}

export async function getOrdersSummary() {
  const sequelize = getSequelize();
  const rows = await sequelize.query<{ status: string; count: number }>(
    `SELECT status, COUNT(*) AS count FROM orders WHERE isActive = 1 GROUP BY status`,
    { type: QueryTypes.SELECT }
  );

  const byStatus = Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
  const total = rows.reduce((sum, r) => sum + Number(r.count), 0);

  return {
    total,
    ordered: byStatus.ordered ?? 0,
    shipped: byStatus.shipped ?? 0,
    delivered: byStatus.delivered ?? 0,
    cancelled: byStatus.cancelled ?? 0,
    returned: byStatus.returned ?? 0,
  };
}

export async function listOrdersForTicket(ticketId: string, options?: { includeCost?: boolean }) {
  await ensureOrderSerialColumn();
  const sequelize = getSequelize();
  const rows = await sequelize.query<OrderRow>(
    `${ORDER_SELECT}
     INNER JOIN order_links ol ON ol.orderId = o.id
       AND ol.linkedType = 'ticket'
       AND ol.linkedId = :ticketId
       AND ol.isActive = 1
     WHERE o.isActive = 1
     ORDER BY ol.linkDate DESC, o.orderDate DESC`,
    { type: QueryTypes.SELECT, replacements: { ticketId } }
  );

  return rows.map((row) => serializeOrder(row, { includeCost: options?.includeCost }));
}

export async function getClientPortalOrder(clientId: string, orderId: string) {
  const order = await getOrderById(orderId, { includeCost: false });
  if (!order || order.clientId !== clientId) return null;
  return order;
}

function generateOrderNumberValue() {
  return `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function stringifyJson(value: unknown) {
  return JSON.stringify(value ?? []);
}

function mergeLocationHistory(
  existing: LocationHistoryEntry[],
  entry: LocationHistoryEntry
): LocationHistoryEntry[] {
  return [...existing, { ...entry, timestamp: entry.timestamp ?? new Date().toISOString() }];
}

export type OrderLinkRow = {
  id: string;
  orderId: string;
  linkedType: string;
  linkedId: string;
  linkedNumber: string;
  linkDate: string;
  linkedBy: string | number;
  notes: string | null;
  isActive: number | boolean;
  createdAt: string;
  updatedAt: string;
};

export async function createOrder(input: {
  clientId: string;
  title: string;
  itemName: string;
  costPrice: number;
  clientPrice: number;
  quantity: number;
  createdBy: number;
  description?: string | null;
  itemUrl?: string | null;
  vendor?: string | null;
  vendorOrderNumber?: string | null;
  trackingNumber?: string | null;
  orderDate?: string;
  estimatedArrival?: string | null;
  status?: string;
  shippingStage?: string;
  currentLocation?: string | null;
  isLoggedInPreAlerts?: boolean;
  preAlertNotes?: string | null;
  serialNumber?: string | null;
  assignedTechnicianId?: number | null;
  tags?: string[];
  notes?: string | null;
}) {
  await ensureOrderSerialColumn();
  await ensureClientMirroredForOrders(input.clientId);

  const sequelize = getSequelize();
  const id = randomUUID();
  const orderNumber = generateOrderNumberValue();
  const now = new Date().toISOString();
  const orderDate = input.orderDate ?? now;
  const status = ORDER_STATUSES.includes(input.status as (typeof ORDER_STATUSES)[number])
    ? input.status!
    : 'ordered';
  const shippingStage = SHIPPING_STAGES.includes(input.shippingStage as (typeof SHIPPING_STAGES)[number])
    ? input.shippingStage!
    : 'ordered';
  const locationHistory = input.currentLocation
    ? stringifyJson([
        {
          location: input.currentLocation,
          stage: shippingStage,
          timestamp: now,
          source: 'manual',
        },
      ])
    : '[]';

  await sequelize.query(
    `INSERT INTO orders (
      id, orderNumber, clientId, title, description, itemName, itemUrl, vendor,
      vendorOrderNumber, trackingNumber, orderDate, estimatedArrival, actualArrival,
      costPrice, clientPrice, quantity, status, isLoggedInPreAlerts, preAlertNotes, serialNumber,
      assignedTechnicianId, createdBy, tags, notes, isActive, createdAt, updatedAt,
      shippingStage, currentLocation, locationHistory, lastLocationUpdate
    ) VALUES (
      :id, :orderNumber, :clientId, :title, :description, :itemName, :itemUrl, :vendor,
      :vendorOrderNumber, :trackingNumber, :orderDate, :estimatedArrival, NULL,
      :costPrice, :clientPrice, :quantity, :status, :isLoggedInPreAlerts, :preAlertNotes, :serialNumber,
      :assignedTechnicianId, :createdBy, :tags, :notes, 1, :now, :now,
      :shippingStage, :currentLocation, :locationHistory, :lastLocationUpdate
    )`,
    {
      replacements: {
        id,
        orderNumber,
        clientId: input.clientId,
        title: input.title,
        description: input.description ?? null,
        itemName: input.itemName,
        itemUrl: input.itemUrl ?? null,
        vendor: input.vendor ?? null,
        vendorOrderNumber: input.vendorOrderNumber ?? null,
        trackingNumber: input.trackingNumber ?? null,
        orderDate,
        estimatedArrival: input.estimatedArrival ?? null,
        costPrice: Number(input.costPrice),
        clientPrice: Number(input.clientPrice),
        quantity: Number(input.quantity) || 1,
        status,
        isLoggedInPreAlerts: input.isLoggedInPreAlerts ? 1 : 0,
        preAlertNotes: input.preAlertNotes ?? null,
        serialNumber: input.serialNumber?.trim() || null,
        assignedTechnicianId: input.assignedTechnicianId ?? input.createdBy,
        createdBy: input.createdBy,
        tags: stringifyJson(input.tags ?? []),
        notes: input.notes ?? null,
        now,
        shippingStage,
        currentLocation: input.currentLocation ?? null,
        locationHistory,
        lastLocationUpdate: input.currentLocation ? now : null,
      },
    }
  );

  return getOrderById(id, { includeCost: true });
}

export async function updateOrder(
  id: string,
  updates: Partial<{
    clientId: string;
    title: string;
    itemName: string;
    description: string | null;
    itemUrl: string | null;
    vendor: string | null;
    vendorOrderNumber: string | null;
    trackingNumber: string | null;
    orderDate: string;
    estimatedArrival: string | null;
    actualArrival: string | null;
    costPrice: number;
    clientPrice: number;
    quantity: number;
    status: string;
    shippingStage: string;
    currentLocation: string | null;
    isLoggedInPreAlerts: boolean;
    preAlertNotes: string | null;
    serialNumber: string | null;
    assignedTechnicianId: number | null;
    tags: string[];
    notes: string | null;
  }>
  ,
  options?: { source?: LocationUpdateSource }
) {
  await ensureOrderSerialColumn();
  const existing = await getOrderById(id, { includeCost: true });
  if (!existing) return null;

  const nextStatus = updates.status ?? existing.status;
  let nextStage = updates.shippingStage ?? existing.shippingStage;
  let nextLocation = updates.currentLocation !== undefined ? updates.currentLocation : existing.currentLocation;
  let locationHistory = existing.locationHistory ?? [];
  const now = new Date().toISOString();

  if (nextStatus === 'delivered') {
    nextStage = 'delivered';
    if (!nextLocation) nextLocation = 'Delivered';
  } else if (nextStatus === 'shipped' && nextStage === 'ordered') {
    nextStage = 'manufacturer_shipped';
  }

  if (
    (updates.currentLocation && updates.currentLocation !== existing.currentLocation) ||
    (updates.shippingStage && updates.shippingStage !== existing.shippingStage)
  ) {
    locationHistory = mergeLocationHistory(locationHistory, {
      location: nextLocation ?? updates.currentLocation ?? existing.currentLocation ?? 'Updated',
      stage: nextStage,
      timestamp: now,
      source: options?.source ?? 'manual',
    });
  }

  const nextSerial =
    updates.serialNumber !== undefined ? updates.serialNumber?.trim() || null : existing.serialNumber ?? null;

  const sequelize = getSequelize();
  await sequelize.query(
    `UPDATE orders SET
      clientId = :clientId,
      title = :title,
      itemName = :itemName,
      description = :description,
      itemUrl = :itemUrl,
      vendor = :vendor,
      vendorOrderNumber = :vendorOrderNumber,
      trackingNumber = :trackingNumber,
      serialNumber = :serialNumber,
      orderDate = :orderDate,
      estimatedArrival = :estimatedArrival,
      actualArrival = :actualArrival,
      costPrice = :costPrice,
      clientPrice = :clientPrice,
      quantity = :quantity,
      status = :status,
      shippingStage = :shippingStage,
      currentLocation = :currentLocation,
      locationHistory = :locationHistory,
      lastLocationUpdate = :lastLocationUpdate,
      isLoggedInPreAlerts = :isLoggedInPreAlerts,
      preAlertNotes = :preAlertNotes,
      assignedTechnicianId = :assignedTechnicianId,
      tags = :tags,
      notes = :notes,
      updatedAt = :now
    WHERE id = :id`,
    {
      replacements: {
        id,
        clientId: updates.clientId ?? existing.clientId,
        title: updates.title ?? existing.title,
        itemName: updates.itemName ?? existing.itemName,
        description: updates.description !== undefined ? updates.description : existing.description ?? null,
        itemUrl: updates.itemUrl !== undefined ? updates.itemUrl : existing.itemUrl ?? null,
        vendor: updates.vendor !== undefined ? updates.vendor : existing.vendor ?? null,
        vendorOrderNumber:
          updates.vendorOrderNumber !== undefined ? updates.vendorOrderNumber : existing.vendorOrderNumber ?? null,
        trackingNumber: updates.trackingNumber !== undefined ? updates.trackingNumber : existing.trackingNumber ?? null,
        serialNumber: nextSerial,
        orderDate: updates.orderDate ?? existing.orderDate,
        estimatedArrival:
          updates.estimatedArrival !== undefined ? updates.estimatedArrival : existing.estimatedArrival ?? null,
        actualArrival:
          updates.actualArrival !== undefined
            ? updates.actualArrival
            : nextStatus === 'delivered' && !existing.actualArrival
              ? now
              : existing.actualArrival ?? null,
        costPrice: updates.costPrice !== undefined ? updates.costPrice : (existing as { costPrice?: number }).costPrice ?? 0,
        clientPrice: updates.clientPrice !== undefined ? updates.clientPrice : existing.clientPrice,
        quantity: updates.quantity !== undefined ? updates.quantity : existing.quantity,
        status: nextStatus,
        shippingStage: nextStage,
        currentLocation: nextLocation ?? null,
        locationHistory: stringifyJson(locationHistory),
        lastLocationUpdate: nextLocation ? now : existing.lastLocationUpdate ?? null,
        isLoggedInPreAlerts:
          updates.isLoggedInPreAlerts !== undefined ? (updates.isLoggedInPreAlerts ? 1 : 0) : existing.isLoggedInPreAlerts ? 1 : 0,
        preAlertNotes: updates.preAlertNotes !== undefined ? updates.preAlertNotes : existing.preAlertNotes ?? null,
        assignedTechnicianId:
          updates.assignedTechnicianId !== undefined
            ? updates.assignedTechnicianId
            : existing.assignedTechnicianId ?? null,
        tags: stringifyJson(updates.tags ?? existing.tags ?? []),
        notes: updates.notes !== undefined ? updates.notes : existing.notes ?? null,
        now,
      },
    }
  );

  return {
    previous: existing,
    order: await getOrderById(id, { includeCost: true }),
  };
}

export async function deleteOrder(id: string) {
  const sequelize = getSequelize();
  const rows = await sequelize.query<{ id: string }>(`SELECT id FROM orders WHERE id = :id AND isActive = 1`, {
    type: QueryTypes.SELECT,
    replacements: { id },
  });
  if (!rows[0]) return false;
  await sequelize.query(`UPDATE orders SET isActive = 0, updatedAt = :now WHERE id = :id`, {
    replacements: { id, now: new Date().toISOString() },
  });
  return true;
}

export async function searchLinkableEntities(options: {
  query: string;
  type?: 'ticket' | 'invoice' | 'order';
  clientId?: string;
}) {
  if (options.query.trim().length < 2) return [];
  const sequelize = getSequelize();
  const search = `%${options.query.trim()}%`;
  const results: Array<{
    id: string;
    type: string;
    number: string;
    title: string;
    status?: string;
    clientName?: string;
  }> = [];

  if (!options.type || options.type === 'ticket') {
    const clientFilter = options.clientId ? 'AND t.clientId = :clientId' : '';
    const tickets = await sequelize.query<{
      id: string;
      ticketNumber: string;
      issue: string;
      status: string;
      clientName: string;
    }>(
      `SELECT t.id, t.ticketNumber, t.issue, t.status, COALESCE(c.company_name, c.name) AS clientName
       FROM tickets t
       LEFT JOIN clients c ON c.id = t.clientId
       WHERE (t.ticketNumber LIKE :search OR t.issue LIKE :search) ${clientFilter}
       ORDER BY t.dateCreated DESC LIMIT 10`,
      { type: QueryTypes.SELECT, replacements: { search, clientId: options.clientId } }
    );
    results.push(
      ...tickets.map((t) => ({
        id: t.id,
        type: 'ticket',
        number: t.ticketNumber,
        title: t.issue,
        status: t.status,
        clientName: t.clientName,
      }))
    );
  }

  if (!options.type || options.type === 'invoice') {
    const clientFilter = options.clientId ? 'AND i.client_id = :clientId' : '';
    const invoices = await sequelize.query<{
      id: string;
      invoice_number: string;
      description: string | null;
      status: string;
      clientName: string;
    }>(
      `SELECT i.id, i.invoice_number, i.description, i.status, COALESCE(c.company_name, c.name) AS clientName
       FROM invoices i
       LEFT JOIN clients c ON c.id = i.client_id
       WHERE (i.invoice_number LIKE :search OR i.description LIKE :search) ${clientFilter}
       ORDER BY i.created_at DESC LIMIT 10`,
      { type: QueryTypes.SELECT, replacements: { search, clientId: options.clientId } }
    );
    results.push(
      ...invoices.map((i) => ({
        id: i.id,
        type: 'invoice',
        number: i.invoice_number,
        title: i.description ?? 'Invoice',
        status: i.status,
        clientName: i.clientName,
      }))
    );
  }

  if (!options.type || options.type === 'order') {
    const clientFilter = options.clientId ? 'AND o.clientId = :clientId' : '';
    const orders = await sequelize.query<{
      id: string;
      orderNumber: string;
      title: string;
      itemName: string;
      status: string;
      clientName: string;
    }>(
      `SELECT o.id, o.orderNumber, o.title, o.itemName, o.status, COALESCE(c.company_name, c.name) AS clientName
       FROM orders o
       LEFT JOIN clients c ON c.id = o.clientId
       WHERE o.isActive = 1
         AND (o.orderNumber LIKE :search OR o.title LIKE :search OR o.itemName LIKE :search)
         ${clientFilter}
       ORDER BY o.orderDate DESC, o.createdAt DESC LIMIT 10`,
      { type: QueryTypes.SELECT, replacements: { search, clientId: options.clientId } }
    );
    results.push(
      ...orders.map((o) => ({
        id: o.id,
        type: 'order',
        number: o.orderNumber,
        title: o.title || o.itemName,
        status: o.status,
        clientName: o.clientName,
      }))
    );
  }

  return results;
}

export async function listOrderLinks(orderId: string) {
  const sequelize = getSequelize();
  const rows = await sequelize.query<OrderLinkRow>(
    `SELECT * FROM order_links WHERE orderId = :orderId AND isActive = 1 ORDER BY createdAt DESC`,
    { type: QueryTypes.SELECT, replacements: { orderId } }
  );
  return rows.map((row) => ({
    id: row.id,
    orderId: row.orderId,
    linkedType: row.linkedType,
    linkedId: row.linkedId,
    linkedNumber: row.linkedNumber,
    linkDate: row.linkDate,
    linkedBy: row.linkedBy,
    notes: row.notes,
    createdAt: row.createdAt,
  }));
}

export async function addOrderLink(
  orderId: string,
  input: { linkedType: 'ticket' | 'invoice'; linkedId: string; linkedNumber: string; notes?: string | null },
  linkedBy: number
) {
  const order = await getOrderById(orderId);
  if (!order) return null;

  const sequelize = getSequelize();
  if (input.linkedType === 'ticket') {
    const rows = await sequelize.query<{ id: string }>(`SELECT id FROM tickets WHERE id = :id`, {
      type: QueryTypes.SELECT,
      replacements: { id: input.linkedId },
    });
    if (!rows[0]) throw new Error('Ticket not found');
  } else {
    const rows = await sequelize.query<{ id: string }>(`SELECT id FROM invoices WHERE id = :id`, {
      type: QueryTypes.SELECT,
      replacements: { id: input.linkedId },
    });
    if (!rows[0]) throw new Error('Invoice not found');
  }

  const existing = await sequelize.query<{ id: string }>(
    `SELECT id FROM order_links WHERE orderId = :orderId AND linkedType = :linkedType AND linkedId = :linkedId AND isActive = 1`,
    { type: QueryTypes.SELECT, replacements: { orderId, linkedType: input.linkedType, linkedId: input.linkedId } }
  );
  if (existing[0]) throw new Error('Link already exists');

  const id = randomUUID();
  const now = new Date().toISOString();
  await sequelize.query(
    `INSERT INTO order_links (id, orderId, linkedType, linkedId, linkedNumber, linkDate, linkedBy, notes, isActive, createdAt, updatedAt)
     VALUES (:id, :orderId, :linkedType, :linkedId, :linkedNumber, :linkDate, :linkedBy, :notes, 1, :now, :now)`,
    {
      replacements: {
        id,
        orderId,
        linkedType: input.linkedType,
        linkedId: input.linkedId,
        linkedNumber: input.linkedNumber,
        linkDate: now,
        linkedBy: String(linkedBy),
        notes: input.notes ?? null,
        now,
      },
    }
  );

  const links = await listOrderLinks(orderId);
  return links.find((l) => l.id === id) ?? null;
}

export async function removeOrderLink(orderId: string, linkId: string) {
  const sequelize = getSequelize();
  await sequelize.query(
    `UPDATE order_links SET isActive = 0, updatedAt = :now WHERE id = :linkId AND orderId = :orderId`,
    { replacements: { linkId, orderId, now: new Date().toISOString() } }
  );
  return true;
}

export async function checkNonPreAlertedOrders(hoursThreshold = 24) {
  const sequelize = getSequelize();
  const threshold = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000).toISOString();
  const rows = await sequelize.query<OrderRow>(
    `${ORDER_SELECT}
     WHERE o.isActive = 1
       AND (o.isLoggedInPreAlerts = 0 OR o.is_logged_in_pre_alerts = 0)
       AND o.createdAt < :threshold`,
    { type: QueryTypes.SELECT, replacements: { threshold } }
  );

  const { createOrderNotPreAlertedNotice } = await import('@/lib/order-notices');
  const { notifyOrderPreAlert } = await import('@/lib/order-notifications');
  for (const row of rows) {
    const order = serializeOrder(row, { includeCost: true });
    await createOrderNotPreAlertedNotice({
      orderNumber: order.orderNumber,
      title: order.title,
      itemName: order.itemName,
      clientName: order.client?.name ?? 'Unknown client',
      createdBy: 'System',
      costPrice: String((order as { costPrice?: number }).costPrice ?? 0),
    });
    await notifyOrderPreAlert(order).catch(console.error);
  }

  return rows.length;
}

export async function findOrderForEmailMonitoring(orderInfo: {
  trackingNumber?: string;
  vendorOrderNumber?: string;
  orderNumber?: string;
}) {
  const sequelize = getSequelize();
  const find = async (sql: string, replacements: Record<string, unknown>) => {
    const rows = await sequelize.query<OrderRow>(`${ORDER_SELECT} WHERE o.isActive = 1 AND ${sql}`, {
      type: QueryTypes.SELECT,
      replacements,
    });
    return rows[0];
  };

  const tracking = orderInfo.trackingNumber?.trim();
  const vendorOrder = orderInfo.vendorOrderNumber?.trim();
  const portalOrder = orderInfo.orderNumber?.trim();

  let row: OrderRow | undefined;
  if (portalOrder) row = await find('o.orderNumber = :value', { value: portalOrder });
  if (!row && tracking) row = await find('o.trackingNumber = :value', { value: tracking });
  if (!row && vendorOrder) row = await find('o.vendorOrderNumber = :value', { value: vendorOrder });
  if (!row) return null;
  return serializeOrder(row, { includeCost: true });
}

export async function applyEmailMonitoringUpdate(
  orderInfo: {
    trackingNumber?: string;
    vendorOrderNumber?: string;
    orderNumber?: string;
    status?: string;
    shippingStage?: string;
    currentLocation?: string;
    vendor?: string;
    notes?: string;
    estimatedArrival?: string;
  }
) {
  const sequelize = getSequelize();
  let row: OrderRow | undefined;

  const find = async (sql: string, replacements: Record<string, unknown>) => {
    const rows = await sequelize.query<OrderRow>(`${ORDER_SELECT} WHERE o.isActive = 1 AND ${sql}`, {
      type: QueryTypes.SELECT,
      replacements,
    });
    return rows[0];
  };

  const tracking = orderInfo.trackingNumber?.trim();
  const vendorOrder = orderInfo.vendorOrderNumber?.trim();
  const portalOrder = orderInfo.orderNumber?.trim();

  if (portalOrder) {
    row = await find('o.orderNumber = :value', { value: portalOrder });
  }
  if (!row && tracking) {
    row = await find('o.trackingNumber = :value', { value: tracking });
  }
  if (!row && vendorOrder) {
    row = await find('o.vendorOrderNumber = :value', { value: vendorOrder });
  }

  if (!row) return null;

  const existing = serializeOrder(row, { includeCost: true });

  const createdAt = new Date(existing.createdAt);
  const hoursSinceCreated = Number.isNaN(createdAt.getTime())
    ? 999
    : (Date.now() - createdAt.getTime()) / 3_600_000;
  const hasPortalOrderRef = Boolean(portalOrder && portalOrder === existing.orderNumber);
  const hasExactTrackingRef = Boolean(tracking && tracking === (existing.trackingNumber ?? '').trim());
  const hasExactVendorRef = Boolean(vendorOrder && vendorOrder === (existing.vendorOrderNumber ?? '').trim());
  const hasStrongRef = hasPortalOrderRef || hasExactTrackingRef || hasExactVendorRef;

  if (orderInfo.status === 'delivered' && hoursSinceCreated < 24 && !hasStrongRef) {
    return null;
  }
  if (
    orderInfo.status &&
    orderInfo.status !== existing.status &&
    hoursSinceCreated < 1 &&
    !hasStrongRef
  ) {
    return null;
  }

  const updates: Parameters<typeof updateOrder>[1] = {};

  if (orderInfo.status) updates.status = orderInfo.status;
  if (orderInfo.shippingStage) updates.shippingStage = orderInfo.shippingStage;
  if (orderInfo.currentLocation) updates.currentLocation = orderInfo.currentLocation;
  if (orderInfo.vendor && !existing.vendor) updates.vendor = orderInfo.vendor;
  if (vendorOrder && !existing.vendorOrderNumber) updates.vendorOrderNumber = vendorOrder;
  if (tracking && !existing.trackingNumber) updates.trackingNumber = tracking;
  if (orderInfo.estimatedArrival) updates.estimatedArrival = orderInfo.estimatedArrival;
  if (orderInfo.notes) {
    updates.notes = existing.notes ? `${existing.notes}\n\n${orderInfo.notes}` : orderInfo.notes;
  }

  if (!Object.keys(updates).length) return null;
  const result = await updateOrder(row.id, updates, { source: 'email' });
  if (!result?.order) return null;
  return { previous: existing, order: result.order };
}

export async function findOrdersForReceiveLookup(serial: string) {
  await ensureOrderSerialColumn();
  const trimmed = serial.trim();
  if (!trimmed) return [];

  const sequelize = getSequelize();
  const like = `%${trimmed}%`;
  const rows = await sequelize.query<OrderRow>(
    `${ORDER_SELECT}
     WHERE o.isActive = 1
       AND (
         o.serialNumber = :exact OR o.serialNumber LIKE :like
         OR o.trackingNumber = :exact OR o.trackingNumber LIKE :like
         OR o.vendorOrderNumber = :exact OR o.vendorOrderNumber LIKE :like
         OR o.orderNumber = :exact
         OR o.id IN (
           SELECT ol.orderId FROM order_links ol
           INNER JOIN tickets t ON t.id = ol.linkedId AND ol.linkedType = 'ticket' AND ol.isActive = 1
           WHERE t.serialNumber = :exact OR t.serialNumber LIKE :like
         )
       )
     ORDER BY
       CASE
         WHEN COALESCE(o.shippingStage, o.shipping_stage) IN ('customs','in_transit','out_for_delivery','miami_warehouse','manufacturer_shipped') THEN 0
         WHEN COALESCE(o.shippingStage, o.shipping_stage) = 'local_office' THEN 2
         ELSE 1
       END,
       o.orderDate DESC
     LIMIT 10`,
    { type: QueryTypes.SELECT, replacements: { exact: trimmed, like } }
  );

  return rows.map((row) => serializeOrder(row, { includeCost: true }));
}

async function syncOrderSerialToLinkedTickets(orderId: string, serialNumber: string) {
  const sequelize = getSequelize();
  const links = await listOrderLinks(orderId);
  const ticketLinks = links.filter((l) => l.linkedType === 'ticket');
  for (const link of ticketLinks) {
    await sequelize.query(
      `UPDATE tickets SET serialNumber = :serialNumber, lastUpdated = :now WHERE id = :id`,
      { replacements: { serialNumber, id: link.linkedId, now: new Date().toISOString() } }
    );
  }
}

export async function markOrderReceivedAtOffice(
  id: string,
  input?: { serialNumber?: string; sendEmail?: boolean; origin?: string }
) {
  const existing = await getOrderById(id, { includeCost: true });
  if (!existing) return null;

  const serial = input?.serialNumber?.trim() || existing.serialNumber || null;
  const now = new Date().toISOString();

  const result = await updateOrder(
    id,
    {
      shippingStage: 'local_office',
      status: existing.status === 'delivered' ? 'delivered' : 'shipped',
      currentLocation: DEFAULT_OFFICE_LOCATION,
      actualArrival: existing.actualArrival ?? now,
      serialNumber: serial,
    },
    { source: 'system' }
  );

  if (!result?.order) return null;

  if (serial) {
    await syncOrderSerialToLinkedTickets(id, serial);
  }

  return { ...result, sendEmail: input?.sendEmail, origin: input?.origin };
}
