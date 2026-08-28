/**
 * Web-facing re-exports from @cd-v2/security.
 * API routes and server code should import from here or from the package directly.
 */
export {
  getPlatformSecurityStatus,
  setMonitoringEnabled,
  type PlatformSecurityStatus,
  type ThreatLevel,
  type WorkerHealth,
} from '@cd-v2/security';

export {
  refreshEmergencyState,
  isEmergencyBypassActive,
  listEmergencyOverrides,
  activateEmergencyOverride,
  disableAllEmergencyOverrides,
  deactivateEmergencyOverride,
  deleteEmergencyOverride,
  type EmergencyStatus,
  type PublicEmergencyOverride,
} from '@cd-v2/security';

export {
  validateEmergencyAuthorization,
  setEmergencyAuthCodeHash,
} from '@cd-v2/security';

import {
  getPlatformSecurityStatus as getPlatform,
  setMonitoringEnabled as setMonitoring,
} from '@cd-v2/security';

/** @deprecated Use getPlatformSecurityStatus */
export async function getAiSecurityStatus() {
  const platform = await getPlatform();
  return {
    enabled: platform.monitoring.enabled,
    status: platform.monitoring.enabled ? ('active' as const) : ('disabled' as const),
    threatLevel: platform.monitoring.threatLevel,
    totalEvents24h: platform.monitoring.eventsLast24h,
    recentEvents: platform.recentEvents,
    emergencyOverrideActive: platform.emergency.isActive,
    lastUpdated: platform.lastUpdated,
    worker: platform.worker,
  };
}

/** @deprecated Use setMonitoringEnabled */
export async function setAiSecurityEnabled(input: {
  enable: boolean;
  userId: number;
  userClearance: string;
  authorization?: string;
}) {
  await setMonitoring(input);
  return getAiSecurityStatus();
}

export async function getEmergencyStatus() {
  const { refreshEmergencyState } = await import('@cd-v2/security');
  return refreshEmergencyState();
}

export async function isEmergencyOverrideActive() {
  const { isEmergencyBypassActive } = await import('@cd-v2/security');
  return isEmergencyBypassActive();
}

export async function disableEmergencyOverride(userId: number, reason?: string) {
  const { disableAllEmergencyOverrides } = await import('@cd-v2/security');
  return disableAllEmergencyOverrides(userId, reason);
}
