// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { requireSession, requireRole, authErrorResult } from '@cd-v2/api-handlers';
import { addInvoiceLink, listInvoiceLinks } from '@web/lib/accounting';

export async function GETHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician');

    const { id } = ctx.params;
    const links = await listInvoiceLinks(id);
    return { status: 200, body: { success: true, links } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin');

    const { id } = ctx.params;
    const body = ctx.body as Record<string, unknown>;
    if (!body.linkedType || !body.linkedId || !body.linkedNumber) {
      return { status: 400, body: { success: false, message: 'linkedType, linkedId, and linkedNumber are required' } };
    }

    const linkedType = String(body.linkedType);
    if (linkedType !== 'ticket' && linkedType !== 'order') {
      return { status: 400, body: { success: false, message: 'linkedType must be ticket or order' } };
    }

    const link = await addInvoiceLink(
      id,
      {
        linkedType,
        linkedId: String(body.linkedId),
        linkedNumber: String(body.linkedNumber),
        notes: body.notes ?? null,
      },
      session.id
    );

    if (!link) {
      return { status: 404, body: { success: false, message: 'Invoice not found' } };
    }

    return { status: 201, body: { success: true, message: 'Link created', link } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create link';
    return { status: 400, body: { success: false, message } };
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'GET') return GETHandler(ctx);
    if (method === 'POST') return POSTHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}
