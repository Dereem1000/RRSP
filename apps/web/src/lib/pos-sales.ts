import { createInvoice, markInvoicePaid } from '@/lib/accounting';
import {
  decrementPosLineStock,
  listCdPosProducts,
  listShopPosProducts,
  posSellableQuantity,
  tracksPosStock,
  type PosProduct,
} from '@/lib/pos-catalog';
import { isRrspDbActive } from '@/lib/rrsp-db';

export type PosSaleLineInput = {
  productId: string;
  quantity: number;
  /** Optional override; defaults to catalog unit price. */
  unitPrice?: number;
  /** Ad-hoc line not tied to POS catalog or Parts stock. */
  custom?: boolean;
  /** Required when custom is true. */
  name?: string;
};

export type PosPaymentMethod = 'CASH' | 'CARD' | 'bank_transfer';

export type CompletePosSaleInput = {
  mode: 'cd' | 'rrsp';
  clientId: string;
  lines: PosSaleLineInput[];
  paymentMethod?: PosPaymentMethod;
  processedBy: number;
  notes?: string | null;
};

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function paymentGatewayFor(method: PosPaymentMethod): 'CASH' | 'PayPal' | 'bank_transfer' | 'WiPay' {
  if (method === 'bank_transfer') return 'bank_transfer';
  return 'CASH';
}

export async function completePosSale(input: CompletePosSaleInput) {
  if (input.mode === 'rrsp' && !isRrspDbActive()) {
    throw new Error('Shop POS sales require an RRSP shop database context');
  }
  if (!input.clientId?.trim()) {
    throw new Error('Customer is required');
  }
  if (!input.lines?.length) {
    throw new Error('Cart is empty');
  }

  const catalog =
    input.mode === 'rrsp' ? await listShopPosProducts() : await listCdPosProducts();
  const byId = new Map(catalog.map((p) => [p.id, p]));

  const resolved: Array<{
    product: PosProduct;
    quantity: number;
    unitPrice: number;
    total: number;
    custom: boolean;
  }> = [];

  for (const line of input.lines) {
    const qty = Math.floor(Number(line.quantity));
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new Error('Each line needs a whole quantity greater than zero');
    }

    if (line.custom) {
      const name = String(line.name ?? '').trim() || 'Open item';
      const unitPrice =
        line.unitPrice != null && Number.isFinite(line.unitPrice)
          ? roundMoney(Number(line.unitPrice))
          : NaN;
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new Error('Open items need a valid price');
      }
      if (unitPrice === 0) {
        throw new Error('Open item price must be greater than zero');
      }
      resolved.push({
        product: {
          id: line.productId || `custom-${name}`,
          sku: null,
          name,
          description: 'Open item',
          unitPrice,
          costPrice: 0,
          quantity: qty,
          availableQuantity: qty,
          kind: 'non_stock',
          source: input.mode === 'rrsp' ? 'shop' : 'cd',
        },
        quantity: qty,
        unitPrice,
        total: roundMoney(qty * unitPrice),
        custom: true,
      });
      continue;
    }

    const product = byId.get(line.productId);
    if (!product) throw new Error(`Product not found: ${line.productId}`);
    if (tracksPosStock(product.kind)) {
      const sellable = posSellableQuantity(product);
      if (sellable < qty) {
        if (product.source === 'parts') {
          throw new Error(`Insufficient marketplace stock for ${product.name}`);
        }
        throw new Error(`Not enough quantity on hand for ${product.name} (${sellable} left)`);
      }
    }
    const unitPrice =
      line.unitPrice != null && Number.isFinite(line.unitPrice)
        ? roundMoney(Number(line.unitPrice))
        : roundMoney(product.unitPrice);
    resolved.push({
      product,
      quantity: qty,
      unitPrice,
      total: roundMoney(qty * unitPrice),
      custom: false,
    });
  }

  for (const line of resolved) {
    if (!line.custom) {
      await decrementPosLineStock(line.product, line.quantity);
    }
  }

  const amount = roundMoney(resolved.reduce((sum, line) => sum + line.total, 0));
  const paymentMethod = input.paymentMethod ?? 'CASH';
  const dueDate = new Date().toISOString();

  const items = resolved.map((line) => {
    let description = 'POS sale';
    if (line.custom) description = 'Open item';
    else if (line.product.kind === 'service') description = 'Service';
    else if (line.product.kind === 'non_stock') description = 'Untracked item';
    else if (line.product.sku) description = `SKU ${line.product.sku}`;
    return {
      name: line.product.name,
      description,
      quantity: line.quantity,
      price: line.unitPrice,
      total: line.total,
    };
  });

  const invoice = await createInvoice({
    clientId: input.clientId.trim(),
    amount,
    dueDate,
    createdBy: input.processedBy,
    currency: 'TTD',
    status: 'pending',
    billingCycle: 'immediately',
    paymentGateway: paymentGatewayFor(paymentMethod),
    description: input.notes?.trim() || 'POS sale',
    items,
  });

  if (!invoice) {
    throw new Error('Failed to create invoice for sale');
  }

  const paid = await markInvoicePaid(invoice.id, input.processedBy, {
    paymentMethod,
    paymentNotes: `POS sale — ${paymentMethod}`,
    paymentDate: dueDate,
  });

  return {
    invoice: paid ?? invoice,
    amount,
    lines: resolved.map((line) => ({
      productId: line.product.id,
      name: line.product.name,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      total: line.total,
    })),
    paymentMethod,
  };
}
