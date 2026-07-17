import type { OrderFormValues } from '@/components/orders/order-ui';

export type InvoiceLineItem = {
  name: string;
  description?: string;
  quantity: number;
  price: number;
  total?: number;
};

export type TicketInvoiceLineItem = {
  invoiceId: string;
  invoiceNumber: string;
  itemIndex: number;
  name: string;
  description?: string;
  quantity: number;
  price: number;
  invoiceDescription?: string | null;
  isImportedPlaceholder: boolean;
};

export type InvoiceFieldSelection = {
  title: boolean;
  itemName: boolean;
  clientPrice: boolean;
  quantity: boolean;
  description: boolean;
};

export const DEFAULT_INVOICE_FIELD_SELECTION: InvoiceFieldSelection = {
  title: true,
  itemName: true,
  clientPrice: true,
  quantity: true,
  description: false,
};

const IMPORTED_ITEM_PATTERN = /^imported\s*item$/i;

export function isImportedItemPlaceholder(name: string): boolean {
  return IMPORTED_ITEM_PATTERN.test(name.trim());
}

export function normalizeItemName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function namesMatchExact(a: string, b: string): boolean {
  const left = normalizeItemName(a);
  const right = normalizeItemName(b);
  return Boolean(left && right && left === right);
}

export function resolveInvoiceItemNameForOrder(lineItemName: string): string {
  if (isImportedItemPlaceholder(lineItemName)) return '';
  return lineItemName.trim();
}

export function invoiceTitleFromLineItem(item: TicketInvoiceLineItem): string {
  const fromDescription = item.description?.trim();
  if (fromDescription && !isImportedItemPlaceholder(fromDescription)) return fromDescription;
  const fromInvoice = item.invoiceDescription?.split('\n').map((line) => line.trim()).find(Boolean);
  if (fromInvoice && !isImportedItemPlaceholder(fromInvoice)) return fromInvoice;
  const fromName = resolveInvoiceItemNameForOrder(item.name);
  return fromName || '';
}

export function flattenInvoiceLineItems(
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    description?: string | null;
    items?: unknown[];
  }>
): TicketInvoiceLineItem[] {
  const rows: TicketInvoiceLineItem[] = [];

  for (const invoice of invoices) {
    const items = Array.isArray(invoice.items) ? invoice.items : [];
    items.forEach((raw, itemIndex) => {
      const item = raw as Partial<InvoiceLineItem>;
      const name = String(item.name ?? '').trim();
      if (!name && !item.description?.trim()) return;
      rows.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        itemIndex,
        name: name || 'Line item',
        description: item.description?.trim() || undefined,
        quantity: Number(item.quantity) || 1,
        price: Number(item.price) || 0,
        invoiceDescription: invoice.description ?? null,
        isImportedPlaceholder: isImportedItemPlaceholder(name),
      });
    });
  }

  return rows;
}

export function invoiceItemsMatchingOrderName(
  items: TicketInvoiceLineItem[],
  orderItemName: string
): TicketInvoiceLineItem[] {
  const trimmed = orderItemName.trim();
  if (!trimmed) return items;
  return items.filter(
    (item) =>
      namesMatchExact(item.name, trimmed) ||
      (item.isImportedPlaceholder && namesMatchExact(invoiceTitleFromLineItem(item), trimmed))
  );
}

export function applyInvoiceFieldsToOrderForm(
  form: OrderFormValues,
  item: TicketInvoiceLineItem,
  fields: InvoiceFieldSelection
): Partial<OrderFormValues> {
  const patch: Partial<OrderFormValues> = {};

  if (fields.title) {
    const title = invoiceTitleFromLineItem(item);
    if (title) patch.title = title;
  }

  if (fields.itemName) {
    const itemName = resolveInvoiceItemNameForOrder(item.name);
    if (itemName) patch.itemName = itemName;
  }

  if (fields.clientPrice && item.price > 0) {
    patch.clientPrice = String(item.price);
  }

  if (fields.quantity && item.quantity > 0) {
    patch.quantity = String(item.quantity);
  }

  if (fields.description) {
    const parts = [
      item.description?.trim() || null,
      item.invoiceDescription?.trim() || null,
    ].filter(Boolean);
    if (parts.length) patch.description = parts.join('\n');
  }

  return patch;
}

export type SelectedInvoiceOrderSource = {
  invoiceId: string;
  invoiceNumber: string;
  itemIndex: number;
  wasImportedPlaceholder: boolean;
  originalName: string;
};
