// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import {
  requireSession,
  requireRole,
  requireAdmin,
  authErrorResult,
  COOKIE_NAME,
  signToken,
  requireMspApiAuth,
  mspAuthErrorResult,
} from '@cd-v2/api-handlers';

import {
  getEmailSettings,
  getGeneralSettings,
  getPartsCatalogSettings,
  getTicketNotificationSettings,
  saveEmailSettings,
  saveGeneralSettings,
  savePartsCatalogSettings,
  saveTicketNotificationSettings,
} from '@web/lib/settings';

export async function GETHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin');

    const [email, tickets, general, partsCatalog] = await Promise.all([
      getEmailSettings(),
      getTicketNotificationSettings(),
      getGeneralSettings(),
      getPartsCatalogSettings(),
    ]);

    return { status: 200, body: {
      success: true,
      email: { ...email, password: email.password ? '********' : '' },
      tickets,
      general,
      partsCatalog,
    } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function PUTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin');

    const body = ctx.body as Record<string, unknown>;
    if (body.email) await saveEmailSettings(body.email);
    if (body.tickets) await saveTicketNotificationSettings(body.tickets);
    if (body.general) await saveGeneralSettings(body.general);
    if (body.partsCatalog) await savePartsCatalogSettings(body.partsCatalog);

    return { status: 200, body: { success: true, message: 'Settings saved' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'GET') return GETHandler(ctx);
    if (method === 'PUT') return PUTHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

