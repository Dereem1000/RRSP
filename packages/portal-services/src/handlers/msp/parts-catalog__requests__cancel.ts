// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { authErrorResult, requireRole, requireSession } from '@cd-v2/api-handlers';
import {
  cancelPartRequestByNumber,
  getPortalClientByUserId,
} from '@web/lib/parts-catalog';

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician', 'client');

    const client = session.role === 'client' ? await getPortalClientByUserId(session.id) : null;
    if (session.role === 'client' && !client) {
      return { status: 404, body: { success: false, message: 'Client record not found' } };
    }

    const body = ctx.body as Record<string, unknown>;
    const requestedAction = String(body.action ?? '').trim();
    const isStaff = session.role === 'admin' || session.role === 'technician';
    const action =
      requestedAction === 'cancel' || requestedAction === 'request_cancel'
        ? requestedAction
        : isStaff
          ? 'cancel'
          : 'request_cancel';

    const result = await cancelPartRequestByNumber({
      requestNumber: String(body.requestNumber ?? ''),
      actorUserId: session.id,
      actorRole: session.role,
      actorClientId: client?.id ?? null,
      action,
    });

    const message =
      result.action === 'request_cancel'
        ? `Cancel requested for ${result.requestNumber}. Staff will confirm.`
        : `Request ${result.requestNumber} has been cancelled`;

    return { status: 200, body: { success: true, message, result } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to cancel parts request';
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
