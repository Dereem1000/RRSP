import bcrypt from 'bcryptjs';
import { SystemConfig } from '@cd-v2/database';
import { SecurityConfigKeys } from './config-keys';

export type AuthValidation = { valid: boolean; reason: string };

export async function validateEmergencyAuthorization(
  code: string,
  userClearance: string
): Promise<AuthValidation> {
  const trimmed = code?.trim();
  if (!trimmed) {
    return { valid: false, reason: 'Authorization code is required' };
  }

  if (userClearance === 'S-CLS3') {
    return {
      valid: false,
      reason: 'Insufficient clearance (S-CLS3 cannot authorize security actions)',
    };
  }

  const envCode = process.env.EMERGENCY_AUTH_CODE?.trim();
  if (envCode && trimmed === envCode) {
    return { valid: true, reason: 'Environment authorization' };
  }

  const hash = await SystemConfig.getConfig<string>(
    SecurityConfigKeys.emergencyAuthHash,
    null
  );
  if (hash && (await bcrypt.compare(trimmed, hash))) {
    return { valid: true, reason: 'Configured master authorization code' };
  }

  return {
    valid: false,
    reason:
      'Invalid authorization code. Set EMERGENCY_AUTH_CODE in .env or configure a master code (Settings → Security).',
  };
}

export async function setEmergencyAuthCodeHash(plainCode: string) {
  const hash = await bcrypt.hash(plainCode.trim(), 12);
  await SystemConfig.setConfig(
    SecurityConfigKeys.emergencyAuthHash,
    hash,
    'string',
    'security'
  );
}

export function canDisableMonitoring(userClearance: string): boolean {
  return userClearance === 'S-CLS1';
}

/** True if EMERGENCY_AUTH_CODE env or a stored bcrypt hash exists. */
export async function isMasterAuthCodeConfigured(): Promise<boolean> {
  if (process.env.EMERGENCY_AUTH_CODE?.trim()) return true;
  const hash = await SystemConfig.getConfig<string>(
    SecurityConfigKeys.emergencyAuthHash,
    null
  );
  return Boolean(hash && String(hash).length > 20);
}
