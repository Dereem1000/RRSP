import { Client, Ticket } from '@cd-v2/database';
import type { TokenPayload } from '@/lib/jwt';
import { listMspInvoices, listQuotes, listInvoicesForClient } from '@/lib/accounting';
import { listCalendarEvents } from '@/lib/calendar';
import { CD_PORTAL_PAGES, CD_SETTINGS_SECTIONS } from '@/lib/mini-cd-catalog';
import { listOpportunities } from '@/lib/sales';
import { listOrders } from '@/lib/orders';
import { listUsers } from '@/lib/users';
import { getTicketScopeWhere, serializeTicket } from '@/lib/tickets';
import { serializeClient } from '@/lib/clients';

export type CdIndexEntityType =
  | 'page'
  | 'ticket'
  | 'order'
  | 'client'
  | 'opportunity'
  | 'invoice'
  | 'quote'
  | 'calendar_event'
  | 'user'
  | 'msp_subscription';

export type CdIndexEntry = {
  entityType: CdIndexEntityType;
  id: string;
  label: string;
  href: string;
  clientId?: string | null;
  clientName?: string | null;
  ticketNumber?: string | null;
  orderNumber?: string | null;
  invoiceNumber?: string | null;
  quoteNumber?: string | null;
  status?: string | null;
  trackingNumber?: string | null;
  amount?: number | null;
  issue?: string | null;
  scheduledAt?: string | null;
  serviceLevel?: string | null;
  updatedAt?: string | null;
  searchText: string;
};

export type MiniCdIndex = {
  generatedAt: string;
  scope: { role: string; userId: number };
  counts: Partial<Record<CdIndexEntityType, number>>;
  entries: CdIndexEntry[];
  catalog: Array<{ module: string; description: string; href?: string }>;
};

const PAGE_SIZE = 100;
const MAX_ENTITY_ROWS = 5000;
const INDEX_CACHE_TTL_MS = 45_000;

type IndexCacheEntry = { index: MiniCdIndex; expiresAt: number };
const indexCache = new Map<string, IndexCacheEntry>();

export function invalidateMiniCdIndexCache(userId?: number): void {
  if (userId == null) {
    indexCache.clear();
    return;
  }
  for (const key of indexCache.keys()) {
    if (key.startsWith(`${userId}:`)) indexCache.delete(key);
  }
}

function normalizeSearchText(...parts: Array<string | null | undefined>): string {
  return parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9#]+/g, ' ')
    .trim();
}

function entry(
  partial: Omit<CdIndexEntry, 'searchText'> & { searchText?: string }
): CdIndexEntry {
  const searchText =
    partial.searchText ??
    normalizeSearchText(
      partial.label,
      partial.clientName,
      partial.ticketNumber,
      partial.orderNumber,
      partial.invoiceNumber,
      partial.quoteNumber,
      partial.trackingNumber,
      partial.status,
      partial.issue,
      partial.serviceLevel,
      partial.entityType
    );
  return { ...partial, searchText };
}

async function fetchAllOrders(session: TokenPayload, clientId?: string) {
  const role = session.role || 'client';
  const all: Awaited<ReturnType<typeof listOrders>>['orders'] = [];
  let page = 1;
  while (all.length < MAX_ENTITY_ROWS) {
    const batch = await listOrders({
      page,
      limit: PAGE_SIZE,
      clientId,
      includeCost: role !== 'client',
      activeOnly: true,
    });
    all.push(...batch.orders);
    if (page >= batch.pagination.pages || batch.orders.length === 0) break;
    page += 1;
  }
  return all;
}

async function fetchAllInvoices(clientId?: string) {
  const all: Awaited<ReturnType<typeof listMspInvoices>>['invoices'] = [];
  let page = 1;
  while (all.length < MAX_ENTITY_ROWS) {
    const batch = clientId
      ? await listInvoicesForClient(clientId, { page, limit: PAGE_SIZE })
      : await listMspInvoices({ page, limit: PAGE_SIZE });
    all.push(...batch.invoices);
    if (page >= batch.pagination.pages || batch.invoices.length === 0) break;
    page += 1;
  }
  return all;
}

async function fetchAllQuotes(clientId?: string) {
  const all: Awaited<ReturnType<typeof listQuotes>>['quotes'] = [];
  let page = 1;
  while (all.length < MAX_ENTITY_ROWS) {
    const batch = await listQuotes({ page, limit: PAGE_SIZE, clientId });
    all.push(...batch.quotes);
    if (page >= batch.pagination.pages || batch.quotes.length === 0) break;
    page += 1;
  }
  return all;
}

function accountingInvoiceHref(id: string): string {
  return `/accounting?invoice=${id}`;
}

function accountingQuoteHref(id: string): string {
  return `/accounting?quote=${id}`;
}

function billingInvoiceHref(id: string): string {
  return `/billing?invoice=${id}`;
}

function billingQuoteHref(id: string): string {
  return `/billing?quote=${id}`;
}

function buildPortalCatalog(role: string): CdIndexEntry[] {
  const pages = CD_PORTAL_PAGES.filter((page) => page.roles.includes(role)).map((page) =>
    entry({
      entityType: 'page',
      id: page.href,
      label: page.label,
      href: page.href,
      searchText: normalizeSearchText(page.label, page.href, page.description),
    })
  );

  const settings =
    role === 'admin'
      ? CD_SETTINGS_SECTIONS.map((section) =>
          entry({
            entityType: 'page',
            id: section.href,
            label: `Settings · ${section.label}`,
            href: section.href,
            searchText: normalizeSearchText('settings', section.label, section.tab, section.href),
          })
        )
      : [];

  return [...pages, ...settings];
}

function indexTicket(ticket: ReturnType<typeof serializeTicket>): CdIndexEntry {
  const clientName = String(ticket.clientName ?? ticket.client?.name ?? ticket.client?.companyName ?? '');
  const ticketNumber = String(ticket.ticketNumber ?? '');
  const issue = String(ticket.issue ?? '');
  return entry({
    entityType: 'ticket',
    id: String(ticket.id),
    label: `#${ticketNumber} ${clientName}: ${issue.slice(0, 80)}`.trim(),
    href: `/tickets/${ticket.id}`,
    clientId: ticket.clientId ? String(ticket.clientId) : null,
    clientName: clientName || null,
    ticketNumber: ticketNumber || null,
    status: ticket.status ? String(ticket.status) : null,
    issue: issue || null,
    updatedAt: ticket.lastUpdated ? String(ticket.lastUpdated) : null,
  });
}

function indexOrder(order: Awaited<ReturnType<typeof listOrders>>['orders'][number]): CdIndexEntry {
  const clientName = order.client?.name ?? null;
  const orderNumber = order.orderNumber ?? '';
  const title = order.title || order.itemName || 'Order';
  return entry({
    entityType: 'order',
    id: order.id,
    label: `${orderNumber} ${clientName ?? ''}: ${title}`.trim(),
    href: `/orders/${order.id}`,
    clientId: order.clientId ?? null,
    clientName,
    orderNumber: orderNumber || null,
    status: order.status ?? null,
    trackingNumber: order.trackingNumber ?? null,
    updatedAt: order.updatedAt ? String(order.updatedAt) : null,
  });
}

function indexClient(client: ReturnType<typeof serializeClient>, role: string): CdIndexEntry[] {
  const name = String(client.name ?? client.companyName ?? 'Client');
  const company = client.companyName ? String(client.companyName) : '';
  const base = entry({
    entityType: 'client',
    id: String(client.id),
    label: company ? `${name} (${company})` : name,
    href: `/clients/${client.id}`,
    clientName: name,
    status: client.status ? String(client.status) : null,
    serviceLevel: client.serviceLevel ? String(client.serviceLevel) : null,
    searchText: normalizeSearchText(name, company, String(client.email ?? ''), String(client.contactPerson ?? '')),
  });

  const extras: CdIndexEntry[] = [base];
  if (role === 'admin' || role === 'technician') {
    extras.push(
      entry({
        entityType: 'page',
        id: `${client.id}-licenses`,
        label: `${name} · Licenses`,
        href: `/clients/${client.id}/licenses`,
        clientId: String(client.id),
        clientName: name,
        searchText: normalizeSearchText(name, company, 'licenses', 'license activation'),
      })
    );
    if (client.serviceLevel && client.serviceLevel !== 'temp_null') {
      extras.push(
        entry({
          entityType: 'msp_subscription',
          id: `msp-${client.id}`,
          label: `MSP · ${name} (${client.serviceLevel})`,
          href: `/clients/${client.id}`,
          clientId: String(client.id),
          clientName: name,
          serviceLevel: String(client.serviceLevel),
          status: client.status ? String(client.status) : null,
          searchText: normalizeSearchText(name, company, 'msp', String(client.serviceLevel), 'subscription'),
        })
      );
    }
  }
  return extras;
}

function indexOpportunity(opp: Awaited<ReturnType<typeof listOpportunities>>[number]): CdIndexEntry {
  const companyName = String(opp.companyName ?? 'Opportunity');
  const stage = String(opp.stage ?? 'unknown');
  return entry({
    entityType: 'opportunity',
    id: String(opp.id),
    label: `${companyName} [${stage}]`,
    href: `/sales/${opp.id}`,
    clientName: companyName,
    status: stage,
    updatedAt: opp.updated_at ? String(opp.updated_at) : null,
    searchText: normalizeSearchText(companyName, String(opp.product ?? ''), stage, String(opp.contactName ?? '')),
  });
}

function indexInvoice(
  invoice: Awaited<ReturnType<typeof listMspInvoices>>['invoices'][number],
  billingBase: '/accounting' | '/billing'
): CdIndexEntry {
  const clientName = invoice.client?.name ?? null;
  const invoiceNumber = invoice.invoiceNumber ?? '';
  return entry({
    entityType: 'invoice',
    id: invoice.id,
    label: `${invoiceNumber} ${clientName ?? ''} · TTD ${invoice.amount} [${invoice.status}]`.trim(),
    href: billingBase === '/billing' ? billingInvoiceHref(invoice.id) : accountingInvoiceHref(invoice.id),
    clientId: invoice.clientId ?? null,
    clientName,
    invoiceNumber: invoiceNumber || null,
    status: invoice.status ?? null,
    amount: invoice.amount ?? null,
    updatedAt: invoice.updatedAt ? String(invoice.updatedAt) : null,
  });
}

function indexQuote(
  quote: Awaited<ReturnType<typeof listQuotes>>['quotes'][number],
  billingBase: '/accounting' | '/billing'
): CdIndexEntry {
  const clientName = quote.client?.name ?? null;
  const quoteNumber = quote.quoteNumber ?? '';
  return entry({
    entityType: 'quote',
    id: quote.id,
    label: `${quoteNumber} ${clientName ?? ''}: ${quote.title ?? 'Quote'} [${quote.status}]`.trim(),
    href: billingBase === '/billing' ? billingQuoteHref(quote.id) : accountingQuoteHref(quote.id),
    clientId: quote.clientId ?? null,
    clientName,
    quoteNumber: quoteNumber || null,
    status: quote.status ?? null,
    amount: quote.amount ?? null,
    updatedAt: quote.updatedAt ? String(quote.updatedAt) : null,
  });
}

function indexCalendarEvent(event: Awaited<ReturnType<typeof listCalendarEvents>>[number]): CdIndexEntry {
  return entry({
    entityType: 'calendar_event',
    id: event.id,
    label: `${event.title} @ ${event.scheduledAt}`,
    href: '/calendar',
    clientId: event.clientId,
    status: event.eventType,
    scheduledAt: event.scheduledAt,
    searchText: normalizeSearchText(event.title, event.notes, event.eventType, event.scheduledAt),
  });
}

function indexUser(user: Awaited<ReturnType<typeof listUsers>>[number]): CdIndexEntry {
  const name = `${user.firstName} ${user.lastName}`.trim() || user.username;
  return entry({
    entityType: 'user',
    id: String(user.id),
    label: `${name} (${user.role})`,
    href: '/settings?tab=users',
    status: user.isActive ? 'active' : 'inactive',
    searchText: normalizeSearchText(name, user.username, user.email, user.role),
  });
}

async function loadTickets(session: TokenPayload): Promise<CdIndexEntry[]> {
  const { where, denied } = await getTicketScopeWhere(session);
  if (denied) return [];

  const tickets = await Ticket.findAll({
    where,
    order: [['lastUpdated', 'DESC']],
    limit: MAX_ENTITY_ROWS,
  });
  return tickets.map((ticket) => indexTicket(serializeTicket(ticket)));
}

async function loadClients(session: TokenPayload): Promise<CdIndexEntry[]> {
  const role = session.role || 'client';
  if (role === 'client') {
    const client = await Client.findOne({ where: { userId: session.id } });
    return client ? indexClient(serializeClient(client), role) : [];
  }

  const clients = await Client.findAll({
    order: [['updated_at', 'DESC']],
    limit: MAX_ENTITY_ROWS,
  });
  return clients.flatMap((client) => indexClient(serializeClient(client), role));
}

async function loadInvoicesAndQuotes(session: TokenPayload): Promise<CdIndexEntry[]> {
  const role = session.role || 'client';
  if (role === 'client') {
    const client = await Client.findOne({ where: { userId: session.id } });
    if (!client) return [];
    const [invoices, quotes] = await Promise.all([
      fetchAllInvoices(client.id),
      fetchAllQuotes(client.id),
    ]);
    return [
      ...invoices.map((row) => indexInvoice(row, '/billing')),
      ...quotes.map((row) => indexQuote(row, '/billing')),
    ];
  }

  if (role !== 'admin' && role !== 'technician') return [];

  const [invoices, quotes] = await Promise.all([fetchAllInvoices(), fetchAllQuotes()]);
  return [
    ...invoices.map((row) => indexInvoice(row, '/accounting')),
    ...quotes.map((row) => indexQuote(row, '/accounting')),
  ];
}

async function loadCalendar(session: TokenPayload): Promise<CdIndexEntry[]> {
  const role = session.role || 'client';
  if (role !== 'admin' && role !== 'technician') return [];

  const events = await listCalendarEvents({
    from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    to: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    includeCompleted: true,
  });
  return events.slice(0, MAX_ENTITY_ROWS).map(indexCalendarEvent);
}

async function loadUsers(session: TokenPayload): Promise<CdIndexEntry[]> {
  if (session.role !== 'admin') return [];
  const users = await listUsers({ active: 'all' });
  return users.slice(0, MAX_ENTITY_ROWS).map(indexUser);
}

async function loadOpportunities(session: TokenPayload): Promise<CdIndexEntry[]> {
  if (session.role !== 'admin' && session.role !== 'technician') return [];
  const opportunities = await listOpportunities();
  return opportunities.slice(0, MAX_ENTITY_ROWS).map(indexOpportunity);
}

function buildSystemCatalog(role: string): MiniCdIndex['catalog'] {
  const modules = [
    { module: 'Dashboard', description: 'Stats, health, recent activity', href: '/dashboard' },
    { module: 'Tickets', description: 'Support tickets with comments and assignment', href: '/tickets' },
    { module: 'Orders', description: 'Hardware/supply orders, tracking, shipping stages', href: '/orders' },
    { module: 'Clients', description: 'Client accounts, usage, billing, licenses', href: '/clients' },
    { module: 'Sales', description: 'Pipeline opportunities and guided sales flow', href: '/sales' },
    { module: 'Calendar', description: 'Scheduled follow-ups and events', href: '/calendar' },
    { module: 'Accounting', description: 'Invoices, quotes, payments, analytics', href: '/accounting' },
    { module: 'MSP', description: 'Subscriptions, MRR, usage alerts, license activity', href: '/msp' },
    { module: 'Billing', description: 'Client invoices and quotes', href: '/billing' },
    { module: 'Settings', description: 'System, email, company, users, security, integrations, backup', href: '/settings' },
    { module: 'Developer Toolbox', description: 'Tunnel slots and dev tooling', href: '/developer-toolbox' },
    { module: 'Mini', description: 'Docked assistant dashboard', href: '/mini' },
  ];
  return modules.filter((item) => {
    if (item.href === '/billing') return role === 'client';
    if (item.href === '/accounting' || item.href === '/msp' || item.href === '/developer-toolbox' || item.href === '/mini') {
      return role === 'admin' || (item.href === '/accounting' && role === 'technician');
    }
    return true;
  });
}

function countByType(entries: CdIndexEntry[]): Partial<Record<CdIndexEntityType, number>> {
  const counts: Partial<Record<CdIndexEntityType, number>> = {};
  for (const item of entries) {
    counts[item.entityType] = (counts[item.entityType] ?? 0) + 1;
  }
  return counts;
}

async function buildMiniCdIndexFresh(session: TokenPayload): Promise<MiniCdIndex> {
  const role = session.role || 'client';
  const portalPages = buildPortalCatalog(role);

  const [tickets, orders, clients, opportunities, financials, calendar, users] = await Promise.all([
    loadTickets(session),
    (async () => {
      if (role === 'client') {
        const client = await Client.findOne({ where: { userId: session.id } });
        if (!client) return [];
        const rows = await fetchAllOrders(session, client.id);
        return rows.map(indexOrder);
      }
      const rows = await fetchAllOrders(session);
      return rows.map(indexOrder);
    })(),
    loadClients(session),
    loadOpportunities(session),
    loadInvoicesAndQuotes(session),
    loadCalendar(session),
    loadUsers(session),
  ]);

  const entries = [
    ...portalPages,
    ...tickets,
    ...orders,
    ...clients,
    ...opportunities,
    ...financials,
    ...calendar,
    ...users,
  ];

  return {
    generatedAt: new Date().toISOString(),
    scope: { role, userId: session.id },
    counts: countByType(entries),
    entries,
    catalog: buildSystemCatalog(role),
  };
}

export async function buildMiniCdIndex(
  session: TokenPayload,
  options?: { skipCache?: boolean }
): Promise<MiniCdIndex> {
  const cacheKey = `${session.id}:${session.role || 'client'}`;
  const now = Date.now();
  if (!options?.skipCache) {
    const cached = indexCache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.index;
  }

  const index = await buildMiniCdIndexFresh(session);
  indexCache.set(cacheKey, { index, expiresAt: now + INDEX_CACHE_TTL_MS });
  return index;
}

export function summarizeMiniCdIndex(index: MiniCdIndex, samplesPerType = 4): string {
  const typeOrder: CdIndexEntityType[] = [
    'page',
    'ticket',
    'order',
    'client',
    'opportunity',
    'invoice',
    'quote',
    'calendar_event',
    'user',
    'msp_subscription',
  ];

  const countLine = typeOrder
    .filter((type) => (index.counts[type] ?? 0) > 0)
    .map((type) => `${index.counts[type]} ${type.replace('_', ' ')}`)
    .join(', ');

  const lines = [
    'CD full-system index (role-scoped crawl):',
    countLine || 'No records indexed',
    'Catalog modules:',
    ...index.catalog.map((row) => `- ${row.module}: ${row.description}${row.href ? ` (${row.href})` : ''}`),
    '',
    'Indexed record samples (full index in snapshot):',
  ];

  for (const type of typeOrder) {
    const rows = index.entries.filter((entry) => entry.entityType === type).slice(0, samplesPerType);
    if (!rows.length) continue;
    lines.push(`[${type}]`);
    for (const entryRow of rows) {
      const extras: string[] = [];
      if (entryRow.ticketNumber) extras.push(`ticket=${entryRow.ticketNumber}`);
      if (entryRow.orderNumber) extras.push(`order=${entryRow.orderNumber}`);
      if (entryRow.invoiceNumber) extras.push(`invoice=${entryRow.invoiceNumber}`);
      if (entryRow.quoteNumber) extras.push(`quote=${entryRow.quoteNumber}`);
      if (entryRow.trackingNumber) extras.push(`tracking=${entryRow.trackingNumber}`);
      if (entryRow.amount != null) extras.push(`amount=${entryRow.amount}`);
      if (entryRow.status) extras.push(`status=${entryRow.status}`);
      if (entryRow.clientName) extras.push(`client=${entryRow.clientName}`);
      lines.push(`- ${entryRow.label} → ${entryRow.href}${extras.length ? ` (${extras.join(', ')})` : ''}`);
    }
    const total = index.counts[type] ?? 0;
    if (total > rows.length) lines.push(`  … +${total - rows.length} more ${type}(s)`);
  }

  return lines.join('\n');
}

export function findIndexEntryByHref(index: MiniCdIndex, href: string): CdIndexEntry | undefined {
  const pathname = href.split('?')[0];
  const query = href.includes('?') ? href.slice(href.indexOf('?')) : '';
  return index.entries.find((entry) => {
    if (entry.href === href) return true;
    if (query && entry.href.startsWith(pathname) && entry.href.includes(query)) return true;
    return entry.href.split('?')[0] === pathname && !query;
  });
}

export function searchIndexEntries(
  index: MiniCdIndex,
  query: string,
  options?: { entityType?: CdIndexEntityType; limit?: number }
): CdIndexEntry[] {
  const needle = normalizeSearchText(query);
  if (!needle) return [];

  const limit = options?.limit ?? 12;
  const tokens = needle.split(' ').filter(Boolean);

  return index.entries
    .filter((entry) => {
      if (options?.entityType && entry.entityType !== options.entityType) return false;
      return tokens.every((token) => entry.searchText.includes(token));
    })
    .slice(0, limit);
}

export function findClientInIndex(index: MiniCdIndex, name: string): CdIndexEntry | undefined {
  const needle = normalizeSearchText(name);
  if (!needle) return undefined;

  const clients = index.entries.filter((entry) => entry.entityType === 'client');
  const exact = clients.find((entry) => entry.searchText === needle || normalizeSearchText(entry.clientName) === needle);
  if (exact) return exact;

  const ranked = clients
    .map((entry) => ({
      entry,
      score: needle.split(' ').filter(Boolean).filter((token) => entry.searchText.includes(token)).length,
    }))
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.entry;
}

export function findLatestForClient(
  index: MiniCdIndex,
  clientId: string,
  entityType: 'ticket' | 'order' | 'invoice' | 'quote'
): CdIndexEntry | undefined {
  return index.entries.find((entry) => entry.entityType === entityType && entry.clientId === clientId);
}

export function findEntityByNumber(
  index: MiniCdIndex,
  entityType: CdIndexEntityType,
  number: string
): CdIndexEntry | undefined {
  const needle = normalizeSearchText(number).replace(/\s+/g, '');
  const fieldMap: Partial<Record<CdIndexEntityType, keyof CdIndexEntry>> = {
    ticket: 'ticketNumber',
    order: 'orderNumber',
    invoice: 'invoiceNumber',
    quote: 'quoteNumber',
  };
  const field = fieldMap[entityType];
  if (!field) return undefined;

  return index.entries.find((entry) => {
    if (entry.entityType !== entityType) return false;
    const value = normalizeSearchText(String(entry[field] ?? '')).replace(/\s+/g, '');
    return value && (value.includes(needle) || needle.includes(value));
  });
}
