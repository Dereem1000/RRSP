import { Op, type WhereOptions } from 'sequelize';
import { SecurityEvent, SystemConfig } from '@cd-v2/database';
import {
  activateEmergencyOverride,
  blockIp,
  disableAllEmergencyOverrides,
  getFileIntegrityReport,
  getPlatformSecurityStatus,
  getSecurityBadgeSummary,
  getThreatMetrics,
  isMasterAuthCodeConfigured,
  loadBlockedIps,
  rebaselineProtectedFiles,
  reconcileSecurityEvents,
  refreshEmergencyState,
  SecurityHttpKeys,
  setEmergencyAuthCodeHash,
  setMonitoringEnabled,
  unblockIp,
} from '@cd-v2/security';
import { requireAdmin } from '../auth';
import type { ApiContext, ApiResult } from '../types';

function bodyRecord(ctx: ApiContext): Record<string, unknown> {
  return ctx.body && typeof ctx.body === 'object' && !Array.isArray(ctx.body)
    ? (ctx.body as Record<string, unknown>)
    : {};
}

export async function securityAiStatus(ctx: ApiContext): Promise<ApiResult> {
  requireAdmin(ctx);
  const platform = await getPlatformSecurityStatus();
  return {
    status: 200,
    body: {
      success: true,
      aiSecurity: {
        enabled: platform.monitoring.enabled,
        status: platform.monitoring.enabled ? 'active' : 'disabled',
        threatLevel: platform.monitoring.threatLevel,
        totalEvents24h: platform.monitoring.eventsLast24h,
        recentEvents: platform.recentEvents,
        emergencyOverrideActive: platform.emergency.isActive,
        lastUpdated: platform.lastUpdated,
      },
      platform,
    },
  };
}

export async function securityBadgeSummary(ctx: ApiContext): Promise<ApiResult> {
  requireAdmin(ctx);
  const summary = await getSecurityBadgeSummary();
  return { status: 200, body: { success: true, summary } };
}

export async function securityAuthCodeGet(ctx: ApiContext): Promise<ApiResult> {
  requireAdmin(ctx);
  return {
    status: 200,
    body: { success: true, configured: await isMasterAuthCodeConfigured() },
  };
}

export async function securityAuthCodePost(ctx: ApiContext): Promise<ApiResult> {
  const session = requireAdmin(ctx);
  if (session.clearance !== 'S-CLS1') {
    return {
      status: 403,
      body: { success: false, message: 'Only S-CLS1 admins can set the master authorization code' },
    };
  }

  const body = bodyRecord(ctx);
  const code = body.code?.toString().trim();
  if (!code || code.length < 8) {
    return { status: 400, body: { success: false, message: 'Code must be at least 8 characters' } };
  }

  try {
    await setEmergencyAuthCodeHash(code);
    return {
      status: 200,
      body: {
        success: true,
        message: 'Master authorization code updated. It is stored as a bcrypt hash.',
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save code';
    return { status: 400, body: { success: false, message } };
  }
}

export async function securityBlockedIpsGet(ctx: ApiContext): Promise<ApiResult> {
  requireAdmin(ctx);
  const blocked = await loadBlockedIps();
  return { status: 200, body: { success: true, blocked } };
}

export async function securityBlockedIpsPost(ctx: ApiContext): Promise<ApiResult> {
  const session = requireAdmin(ctx);
  if (session.clearance !== 'S-CLS1') {
    return { status: 403, body: { success: false, message: 'S-CLS1 required' } };
  }

  const body = bodyRecord(ctx);
  if (body.action === 'unblock' && body.ip) {
    await unblockIp(String(body.ip));
    return { status: 200, body: { success: true, message: 'Unblocked' } };
  }
  if (body.action === 'block' && body.ip) {
    await blockIp(String(body.ip), String(body.reason ?? 'Manual block'));
    return { status: 200, body: { success: true, message: 'Blocked' } };
  }
  return { status: 400, body: { success: false, message: 'Invalid action' } };
}

export async function securityEmergencyOverridePost(ctx: ApiContext): Promise<ApiResult> {
  const session = requireAdmin(ctx);
  const body = bodyRecord(ctx);

  if (!body.reason?.toString().trim()) {
    return { status: 400, body: { success: false, message: 'Reason is required' } };
  }
  if (!body.authorization?.toString().trim()) {
    return { status: 400, body: { success: false, message: 'Authorization code is required' } };
  }

  try {
    const result = await activateEmergencyOverride({
      userId: session.id,
      reason: String(body.reason),
      authorization: String(body.authorization),
      userClearance: session.clearance ?? 'S-CLS3',
      durationMinutes: body.duration ? Number(body.duration) : 60,
      ipAddress: ctx.header('x-forwarded-for'),
      userAgent: ctx.header('user-agent'),
    });

    return {
      status: 200,
      body: {
        success: true,
        message: 'Emergency override activated',
        details: {
          reason: body.reason,
          duration: `${result.duration} minutes`,
          expiresAt: result.expiresAt,
          overrideId: result.override.id,
        },
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to activate override';
    return { status: 400, body: { success: false, message } };
  }
}

export async function securityEmergencyOverrideDisablePost(ctx: ApiContext): Promise<ApiResult> {
  const session = requireAdmin(ctx);
  const body = bodyRecord(ctx);
  await disableAllEmergencyOverrides(session.id, body.reason as string | undefined);
  return {
    status: 200,
    body: {
      success: true,
      message: 'Emergency override disabled',
      timestamp: new Date().toISOString(),
    },
  };
}

export async function securityEmergencyStatusGet(ctx: ApiContext): Promise<ApiResult> {
  requireAdmin(ctx);
  const status = await refreshEmergencyState();
  return { status: 200, body: { success: true, emergencyOverride: status } };
}

export async function securityEventsGet(ctx: ApiContext): Promise<ApiResult> {
  requireAdmin(ctx);

  const q = (key: string): string | undefined => {
    const raw = ctx.query[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  };

  const limit = Math.min(500, Math.max(1, Number(q('limit') ?? 100)));
  const offset = Math.max(0, Number(q('offset') ?? 0));
  const severity = q('severity');
  const eventType = q('eventType');
  const ip = q('ip');
  const search = q('q');
  const includeInactive = q('includeInactive') === '1' || q('includeInactive') === 'true';

  const where: WhereOptions = {};
  if (!includeInactive) where.isActive = true;
  if (severity) where.severity = severity;
  if (eventType) where.eventType = eventType;
  if (ip) {
    Object.assign(where, {
      [Op.or]: [
        { ipAddress: ip },
        { description: { [Op.like]: `%${ip}%` } },
      ],
    });
  }
  if (search) {
    const like = { [Op.like]: `%${search}%` };
    const searchClause = {
      [Op.or]: [{ description: like }, { eventType: like }, { ipAddress: like }, { outcome: like }],
    };
    const existingOr = (where as { [key: symbol]: unknown })[Op.or];
    if (existingOr) {
      Object.assign(where, {
        [Op.and]: [{ [Op.or]: existingOr }, searchClause],
      });
      delete (where as { [key: symbol]: unknown })[Op.or];
    } else {
      Object.assign(where, searchClause);
    }
  }

  const [events, total] = await Promise.all([
    SecurityEvent.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
      offset,
    }),
    SecurityEvent.count({ where }),
  ]);

  return {
    status: 200,
    body: {
      success: true,
      total,
      limit,
      offset,
      events: events.map((e) => {
        const j = e.toJSON() as SecurityEvent & { created_at?: Date };
        return {
          id: j.id,
          eventType: j.eventType,
          severity: j.severity,
          description: j.description,
          outcome: j.outcome,
          userId: j.userId,
          ipAddress: j.ipAddress ?? null,
          userAgent: j.userAgent ?? null,
          details: j.details ?? {},
          isActive: j.isActive,
          createdAt: j.created_at ? String(j.created_at) : '',
        };
      }),
    },
  };
}

export async function securityFileIntegrityGet(ctx: ApiContext): Promise<ApiResult> {
  requireAdmin(ctx);
  const report = await getFileIntegrityReport();
  return { status: 200, body: { success: true, report } };
}

export async function securityFileIntegrityPost(ctx: ApiContext): Promise<ApiResult> {
  const session = requireAdmin(ctx);
  if (session.clearance !== 'S-CLS1') {
    return {
      status: 403,
      body: { success: false, message: 'Only S-CLS1 can refresh file baselines' },
    };
  }

  const report = await rebaselineProtectedFiles();
  return {
    status: 200,
    body: { success: true, message: 'File integrity baselines refreshed', report },
  };
}

export async function securityModuleTogglesPost(ctx: ApiContext): Promise<ApiResult> {
  const session = requireAdmin(ctx);
  if (session.clearance !== 'S-CLS1') {
    return { status: 403, body: { success: false, message: 'S-CLS1 required' } };
  }

  const body = bodyRecord(ctx);
  const allowed = [
    SecurityHttpKeys.intrusionEnabled,
    SecurityHttpKeys.botEnabled,
    SecurityHttpKeys.botCaptchaEnabled,
    SecurityHttpKeys.repairEnabled,
    SecurityHttpKeys.repairUseBackups,
    SecurityHttpKeys.dataLeakGuardEnabled,
    SecurityHttpKeys.dataLeakAutoBlockIp,
  ] as string[];

  if (!allowed.includes(String(body.key))) {
    return { status: 400, body: { success: false, message: 'Invalid key' } };
  }

  await SystemConfig.setConfig(String(body.key), Boolean(body.value), 'boolean', 'security');
  return { status: 200, body: { success: true } };
}

export async function securityPlatformStatusGet(ctx: ApiContext): Promise<ApiResult> {
  requireAdmin(ctx);
  const platform = await getPlatformSecurityStatus();
  return { status: 200, body: { success: true, platform } };
}

export async function securityReconcilePost(ctx: ApiContext): Promise<ApiResult> {
  requireAdmin(ctx);
  const result = await reconcileSecurityEvents();
  const platform = await getPlatformSecurityStatus();

  const message =
    result.cleared > 0
      ? `Cleared ${result.cleared} resolved event(s). Threat level: ${result.previousThreatLevel} → ${result.threatLevel}.`
      : result.remaining === 0
        ? `All clear. Threat level: ${result.threatLevel}.`
        : `No resolved events to clear. ${result.remaining} active event(s); threat level: ${result.threatLevel}.`;

  return { status: 200, body: { success: true, message, result, platform } };
}

export async function securityThreatMetricsGet(ctx: ApiContext): Promise<ApiResult> {
  requireAdmin(ctx);
  const metrics = await getThreatMetrics();
  return { status: 200, body: { success: true, metrics } };
}

export async function securityTogglePost(ctx: ApiContext): Promise<ApiResult> {
  const session = requireAdmin(ctx);
  const body = bodyRecord(ctx);

  if (typeof body.enable !== 'boolean') {
    return { status: 400, body: { success: false, message: 'enable (boolean) is required' } };
  }

  try {
    const platform = await setMonitoringEnabled({
      enable: body.enable,
      userId: session.id,
      userClearance: session.clearance ?? 'S-CLS3',
      authorization: (body.authorization_key ?? body.authorization) as string | undefined,
    });

    return {
      status: 200,
      body: {
        success: true,
        message: body.enable ? 'Security monitoring enabled' : 'Security monitoring disabled',
        platform,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update AI Security';
    return { status: 400, body: { success: false, message } };
  }
}
