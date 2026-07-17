import { createDispatcher, type RouteEntry } from './dispatch';
import {
  securityAiStatus,
  securityAuthCodeGet,
  securityAuthCodePost,
  securityBadgeSummary,
  securityBlockedIpsGet,
  securityBlockedIpsPost,
  securityEmergencyOverrideDisablePost,
  securityEmergencyOverridePost,
  securityEmergencyStatusGet,
  securityEventsGet,
  securityFileIntegrityGet,
  securityFileIntegrityPost,
  securityModuleTogglesPost,
  securityPlatformStatusGet,
  securityReconcilePost,
  securityThreatMetricsGet,
  securityTogglePost,
} from './handlers/security';

export * from './types';
export * from './auth';
export * from './jwt';
export {
  signToken,
  verifyToken,
  COOKIE_NAME,
  resolveJwtSecret,
  SESSION_COOKIE_MAX_AGE_MS,
} from './jwt';
export * from './msp-auth';
export * from './dispatch';
export * from './handlers/security';

const securityRoutes: RouteEntry[] = [
  { method: 'GET', pattern: '/ai-status', handler: securityAiStatus },
  { method: 'GET', pattern: '/badge-summary', handler: securityBadgeSummary },
  { method: 'GET', pattern: '/auth-code', handler: securityAuthCodeGet },
  { method: 'POST', pattern: '/auth-code', handler: securityAuthCodePost },
  { method: 'GET', pattern: '/blocked-ips', handler: securityBlockedIpsGet },
  { method: 'POST', pattern: '/blocked-ips', handler: securityBlockedIpsPost },
  { method: 'POST', pattern: '/emergency-override', handler: securityEmergencyOverridePost },
  { method: 'POST', pattern: '/emergency-override/disable', handler: securityEmergencyOverrideDisablePost },
  { method: 'GET', pattern: '/emergency-status', handler: securityEmergencyStatusGet },
  { method: 'GET', pattern: '/events', handler: securityEventsGet },
  { method: 'GET', pattern: '/file-integrity', handler: securityFileIntegrityGet },
  { method: 'POST', pattern: '/file-integrity', handler: securityFileIntegrityPost },
  { method: 'POST', pattern: '/module-toggles', handler: securityModuleTogglesPost },
  { method: 'GET', pattern: '/platform-status', handler: securityPlatformStatusGet },
  { method: 'POST', pattern: '/reconcile', handler: securityReconcilePost },
  { method: 'GET', pattern: '/threat-metrics', handler: securityThreatMetricsGet },
  { method: 'POST', pattern: '/toggle', handler: securityTogglePost },
];

export const dispatchSecurity = createDispatcher(securityRoutes);
