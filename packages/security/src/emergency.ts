import { randomUUID } from 'crypto';
import { EmergencyOverride, SystemConfig } from '@cd-v2/database';
import { validateEmergencyAuthorization } from './auth';
import { SecurityConfigKeys } from './config-keys';
import { logSecurityEvent } from './events';
import { eventCreatedAt, ORDER_BY_CREATED_DESC } from './sequelize-time';

export type EmergencyStatus = {
  isActive: boolean;
  expiresAt: string | null;
  isExpired: boolean;
  activeOverrideId: string | null;
};

export type PublicEmergencyOverride = {
  id: string;
  userId: number;
  overrideType: string;
  reason: string;
  status: string;
  duration: number | null;
  riskLevel: string | null;
  startTime: string;
  endTime: string | null;
  createdAt: string;
};

function serializeOverride(row: EmergencyOverride): PublicEmergencyOverride {
  const j = row.toJSON() as EmergencyOverride;
  return {
    id: j.id,
    userId: j.userId,
    overrideType: j.overrideType,
    reason: j.reason,
    status: j.status,
    duration: j.duration ?? null,
    riskLevel: j.riskLevel ?? null,
    startTime: j.startTime ? String(j.startTime) : '',
    endTime: j.endTime ? String(j.endTime) : null,
    createdAt: eventCreatedAt(j),
  };
}

/** Sync global flags from DB; call on worker tick and before reads. */
export async function refreshEmergencyState(): Promise<EmergencyStatus> {
  const now = new Date();
  const activeRows = await EmergencyOverride.findAll({
    where: { status: 'active', overrideType: 'security_bypass' },
  });

  let primary: EmergencyOverride | null = null;
  for (const row of activeRows) {
    if (row.endTime && new Date(row.endTime) <= now) {
      await row.update({ status: 'expired', isActive: false });
      continue;
    }
    if (!primary) primary = row;
  }

  if (primary?.endTime) {
    await SystemConfig.setConfig(SecurityConfigKeys.emergencyActive, true, 'boolean', 'security');
    await SystemConfig.setConfig(
      SecurityConfigKeys.emergencyExpires,
      new Date(primary.endTime).toISOString(),
      'string',
      'security'
    );
    return {
      isActive: true,
      expiresAt: new Date(primary.endTime).toISOString(),
      isExpired: false,
      activeOverrideId: primary.id,
    };
  }

  await SystemConfig.setConfig(SecurityConfigKeys.emergencyActive, false, 'boolean', 'security');
  await SystemConfig.setConfig(SecurityConfigKeys.emergencyExpires, '', 'string', 'security');

  return {
    isActive: false,
    expiresAt: null,
    isExpired: false,
    activeOverrideId: null,
  };
}

export async function isEmergencyBypassActive(): Promise<boolean> {
  const s = await refreshEmergencyState();
  return s.isActive;
}

export async function listEmergencyOverrides(options?: { page?: number; limit?: number }) {
  const page = Math.max(1, options?.page ?? 1);
  const limit = Math.min(50, Math.max(1, options?.limit ?? 10));
  const offset = (page - 1) * limit;

  const { rows, count } = await EmergencyOverride.findAndCountAll({
    order: ORDER_BY_CREATED_DESC,
    limit,
    offset,
  });

  return {
    overrides: rows.map(serializeOverride),
    pagination: { total: count, page, limit, pages: Math.ceil(count / limit) || 1 },
  };
}

export async function activateEmergencyOverride(input: {
  userId: number;
  reason: string;
  authorization: string;
  userClearance: string;
  durationMinutes?: number;
  ipAddress?: string;
  userAgent?: string;
}) {
  const validation = await validateEmergencyAuthorization(
    input.authorization,
    input.userClearance
  );
  if (!validation.valid) throw new Error(validation.reason);

  /** Max 30 days */
  const duration = Math.min(43_200, Math.max(1, input.durationMinutes ?? 60));
  const endTime = new Date(Date.now() + duration * 60 * 1000);

  const override = await EmergencyOverride.create({
    id: randomUUID(),
    userId: input.userId,
    overrideType: 'security_bypass',
    reason: input.reason.trim(),
    authorizationCode: '***',
    startTime: new Date(),
    endTime,
    duration,
    status: 'active',
    riskLevel: 'high',
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    isActive: true,
  });

  await SystemConfig.setConfig(SecurityConfigKeys.emergencyActive, true, 'boolean', 'security');
  await SystemConfig.setConfig(
    SecurityConfigKeys.emergencyExpires,
    endTime.toISOString(),
    'string',
    'security'
  );

  await logSecurityEvent({
    eventType: 'emergency_override',
    severity: 'medium',
    userId: input.userId,
    description: `Emergency bypass activated (${duration} min): ${input.reason.trim()}`,
    details: { duration, overrideId: override.id },
    outcome: 'allowed',
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    skipDedup: true,
  });

  return { override: serializeOverride(override), expiresAt: endTime.toISOString(), duration };
}

export async function disableAllEmergencyOverrides(userId: number, reason?: string) {
  await EmergencyOverride.update(
    { status: 'revoked', endTime: new Date(), isActive: false },
    { where: { status: 'active', overrideType: 'security_bypass' } }
  );

  await SystemConfig.setConfig(SecurityConfigKeys.emergencyActive, false, 'boolean', 'security');
  await SystemConfig.setConfig(SecurityConfigKeys.emergencyExpires, '', 'string', 'security');

  await logSecurityEvent({
    eventType: 'emergency_override',
    severity: 'high',
    userId,
    description: reason?.trim() || 'All emergency bypasses disabled by admin',
    details: { action: 'manual_disable_all' },
    outcome: 'allowed',
    skipDedup: true,
  });
}

export async function deactivateEmergencyOverride(id: string) {
  const row = await EmergencyOverride.findByPk(id);
  if (!row) return null;
  await row.update({ status: 'revoked', endTime: new Date(), isActive: false });
  await refreshEmergencyState();
  return serializeOverride(row);
}

export async function deleteEmergencyOverride(id: string) {
  const row = await EmergencyOverride.findByPk(id);
  if (!row) return false;
  await row.destroy();
  await refreshEmergencyState();
  return true;
}
