// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { requireSession, authErrorResult } from '@cd-v2/api-handlers';
import { runWithPosAccess } from '@web/lib/pos-access';
import { completePosSale, type PosPaymentMethod, type PosSaleLineInput } from '@web/lib/pos-sales';

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    return await runWithPosAccess(session, async (mode) => {
      const body = (ctx.body ?? {}) as Record<string, unknown>;
      const rawLines = Array.isArray(body.lines) ? body.lines : [];
      const lines: PosSaleLineInput[] = rawLines.map((line: Record<string, unknown>) => ({
        productId: String(line.productId ?? ''),
        quantity: Number(line.quantity),
        unitPrice: line.unitPrice != null ? Number(line.unitPrice) : undefined,
        custom: Boolean(line.custom),
        name: line.name != null ? String(line.name) : undefined,
      }));

      const paymentMethod = String(body.paymentMethod ?? 'CASH').toUpperCase() as PosPaymentMethod;
      const allowed: PosPaymentMethod[] = ['CASH', 'CARD', 'bank_transfer'];
      const method = allowed.includes(paymentMethod)
        ? paymentMethod
        : paymentMethod === 'BANK_TRANSFER'
          ? 'bank_transfer'
          : 'CASH';

      const result = await completePosSale({
        mode,
        clientId: String(body.clientId ?? ''),
        lines,
        paymentMethod: method === 'CARD' ? 'CARD' : method,
        processedBy: session.id,
        notes: body.notes != null ? String(body.notes) : null,
      });

      return {
        status: 201,
        body: {
          success: true,
          message: 'Sale completed',
          invoice: result.invoice,
          amount: result.amount,
          lines: result.lines,
          paymentMethod: result.paymentMethod,
        },
      };
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      return {
        status: Number((error as { status: number }).status) || 403,
        body: { success: false, message: error instanceof Error ? error.message : 'Access denied' },
      };
    }
    const message = error instanceof Error ? error.message : 'Failed to complete sale';
    return { status: 400, body: { success: false, message } };
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'POST') return POSTHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}
