'use client';

import { useMemo, useState } from 'react';
import { InvoiceLink } from '@/components/links/DocumentLinks';
import type { OrderFormValues } from '@/components/orders/order-ui';
import {
  DEFAULT_INVOICE_FIELD_SELECTION,
  applyInvoiceFieldsToOrderForm,
  invoiceItemsMatchingOrderName,
  invoiceTitleFromLineItem,
  isImportedItemPlaceholder,
  type InvoiceFieldSelection,
  type SelectedInvoiceOrderSource,
  type TicketInvoiceLineItem,
} from '@/lib/ticket-invoice-order';

function formatMoney(amount: number) {
  return `TTD ${amount.toLocaleString('en-TT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function InvoiceOrderItemPicker({
  items,
  form,
  onApply,
  onSelectSource,
  selectedSource,
}: {
  items: TicketInvoiceLineItem[];
  form: OrderFormValues;
  onApply: (patch: Partial<OrderFormValues>) => void;
  onSelectSource: (source: SelectedInvoiceOrderSource | null) => void;
  selectedSource: SelectedInvoiceOrderSource | null;
}) {
  const [fieldSelection, setFieldSelection] = useState<InvoiceFieldSelection>(DEFAULT_INVOICE_FIELD_SELECTION);
  const [activeKey, setActiveKey] = useState('');

  const visibleItems = useMemo(
    () => invoiceItemsMatchingOrderName(items, form.itemName),
    [items, form.itemName]
  );

  if (!items.length) return null;

  function itemKey(item: TicketInvoiceLineItem) {
    return `${item.invoiceId}:${item.itemIndex}`;
  }

  function toggleField(field: keyof InvoiceFieldSelection) {
    setFieldSelection((current) => ({ ...current, [field]: !current[field] }));
  }

  function applyItem(item: TicketInvoiceLineItem) {
    const patch = applyInvoiceFieldsToOrderForm(form, item, fieldSelection);
    onApply(patch);
    setActiveKey(itemKey(item));
    onSelectSource({
      invoiceId: item.invoiceId,
      invoiceNumber: item.invoiceNumber,
      itemIndex: item.itemIndex,
      wasImportedPlaceholder: item.isImportedPlaceholder,
      originalName: item.name,
    });
  }

  const fieldOptions: Array<{ key: keyof InvoiceFieldSelection; label: string }> = [
    { key: 'title', label: 'Title' },
    { key: 'itemName', label: 'Item name' },
    { key: 'clientPrice', label: 'Client price' },
    { key: 'quantity', label: 'Quantity' },
    { key: 'description', label: 'Description' },
  ];

  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-amber-950">Invoice items for this ticket</p>
          <p className="mt-1 text-xs text-amber-900/80">
            Select fields to copy. Matching lines are shown when the order item name matches exactly.
            Imported item is never copied as the order item name.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {fieldOptions.map((option) => (
            <label key={option.key} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2 py-1 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={fieldSelection[option.key]}
                onChange={() => toggleField(option.key)}
              />
              {option.label}
            </label>
          ))}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {visibleItems.length === 0 ? (
          <p className="text-sm text-amber-900/70">
            No invoice line matches the current item name. Type the exact invoice item name to filter, or pick any line below.
          </p>
        ) : null}

        {(visibleItems.length ? visibleItems : items).map((item) => {
          const key = itemKey(item);
          const isActive = activeKey === key;
          const displayName = item.isImportedPlaceholder ? 'Imported item' : item.name;
          const suggestedTitle = invoiceTitleFromLineItem(item);

          return (
            <div
              key={key}
              className={`rounded-xl border px-3 py-3 ${
                isActive ? 'border-indigo-300 bg-white shadow-sm' : 'border-amber-100 bg-white/80'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <InvoiceLink id={item.invoiceId} label={item.invoiceNumber} />
                    <span className="text-slate-400">·</span>
                    <span className={item.isImportedPlaceholder ? 'italic text-slate-500' : 'font-medium text-slate-900'}>
                      {displayName}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    {suggestedTitle ? `Title: ${suggestedTitle}` : 'No usable title'}
                    {' · '}
                    {formatMoney(item.price)}
                    {item.quantity > 1 ? ` · Qty ${item.quantity}` : ''}
                  </p>
                  {item.description ? (
                    <p className="mt-1 text-xs text-slate-500">{item.description}</p>
                  ) : null}
                  {item.isImportedPlaceholder ? (
                    <p className="mt-1 text-xs text-amber-800">
                      Placeholder only — enter the real item name in the order form. The invoice line will update when the order is created.
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => applyItem(item)}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  Use selected fields
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {selectedSource?.wasImportedPlaceholder && !isImportedItemPlaceholder(form.itemName) ? (
        <p className="mt-3 text-xs text-indigo-800">
          Invoice {selectedSource.invoiceNumber} will be updated from &quot;Imported item&quot; to &quot;{form.itemName.trim()}&quot; when this order is saved.
        </p>
      ) : null}
    </div>
  );
}
