// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { authErrorResult, requireRole, requireSession } from '@cd-v2/api-handlers';
import {
  getPortalClientByUserId,
  receivePartRequestByNumber,
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
    const result = await receivePartRequestByNumber({
      requestNumber: String(body.requestNumber ?? ''),
      actorUserId: session.id,
      actorRole: session.role,
      actorClientId: client?.id ?? null,
    });

    return {
      status: 200,
      body: {
        success: true,
        message:
          session.role === 'admin' || session.role === 'technician'
            ? `Request ${result.requestNumber} marked delivered and fulfilled`
            : `Request ${result.requestNumber} marked received and fulfilled`,
        result,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to receive parts request';
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
